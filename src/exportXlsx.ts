import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isAndroid } from "./platform/android/runtime";

type Row = Record<string, unknown>;
const encoder = new TextEncoder();
const xml = (value: unknown) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fieldNames: Record<string,string> = {enrolId:"Customer ID",accountNo:"Account Number",name:"Customer Name",coName:"C/O Name",contact:"Mobile Number",accountOpeningDate:"Account Opening Date",createdAt:"Created Date",uidaiNo:"Aadhaar Number",photoUrl:"Photo Reference",passbookStatus:"Passbook Status"};
const excluded = new Set(["photoPreview","photoDataUrl","pdfDataUrl","pdfPreview","photoMissingRef","scope","key"]);
const baseFields = ["enrolId","accountNo","name","coName","contact","accountOpeningDate","status","passbookStatus","address"];
const yieldUI = () => new Promise<void>(resolve => setTimeout(resolve,0));
const assertActive = (signal?:AbortSignal) => { if(signal?.aborted) throw new Error("Export cancelled."); };

const crcTable = Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes:Uint8Array) {let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function header(length:number){return new Uint8Array(length);}
function u16(view:DataView,offset:number,n:number){view.setUint16(offset,n,true);}
function u32(view:DataView,offset:number,n:number){view.setUint32(offset,n,true);}
class ZipParts {
  parts:BlobPart[]=[];central:Uint8Array[]=[];offset=0;
  add(path:string,data:Uint8Array|string){
    const name=encoder.encode(path),bytes=typeof data==="string"?encoder.encode(data):data;
    const crc=crc32(bytes),local=header(30+name.length),lv=new DataView(local.buffer);
    u32(lv,0,0x04034b50);u16(lv,4,20);u16(lv,6,0x800);u32(lv,14,crc);u32(lv,18,bytes.length);u32(lv,22,bytes.length);u16(lv,26,name.length);local.set(name,30);
    const dir=header(46+name.length),dv=new DataView(dir.buffer);
    u32(dv,0,0x02014b50);u16(dv,4,20);u16(dv,6,20);u16(dv,8,0x800);u32(dv,16,crc);u32(dv,20,bytes.length);u32(dv,24,bytes.length);u16(dv,28,name.length);u32(dv,42,this.offset);dir.set(name,46);
    this.parts.push(local,bytes as BlobPart);this.central.push(dir);this.offset+=local.length+bytes.length;
  }
  blob(){const size=this.central.reduce((n,b)=>n+b.length,0),end=header(22),view=new DataView(end.buffer);u32(view,0,0x06054b50);u16(view,8,this.central.length);u16(view,10,this.central.length);u32(view,12,size);u32(view,16,this.offset);return new Blob([...this.parts,...this.central.map(part=>part as BlobPart),end as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});}
}
function photoBytes(value:unknown):{bytes:Uint8Array;extension:string}|null {
  const match=/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(String(value||""));
  if(!match)return null;
  const binary=atob(match[2]);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return {bytes,extension:match[1]==="jpg"?"jpeg":match[1]};
}
async function pngFromOtherImage(value:unknown):Promise<{bytes:Uint8Array;extension:string}|null>{
  if(!/^data:image\/webp;base64,/.test(String(value||"")))return null;
  const image=new Image();image.src=String(value);await image.decode();
  const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  canvas.getContext("2d")?.drawImage(image,0,0);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
  return blob?{bytes:new Uint8Array(await blob.arrayBuffer()),extension:"png"}:null;
}
const col=(index:number)=>{let result="";for(let n=index+1;n;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;};
export async function buildCustomerXlsx(rows:Row[],options:{photos:boolean;allFields:boolean;autoResize:boolean;signal?:AbortSignal;progress:(done:number,total:number)=>void}) {
  const keys=options.allFields?[...new Set(rows.flatMap(row=>Object.keys(row).filter(key=>!excluded.has(key)&&!key.startsWith("_")&&["string","number","boolean"].includes(typeof row[key]))))]:baseFields;
  if(!keys.length)keys.push("name");
  const widths=keys.map(key=>Math.max(16,String(fieldNames[key]||key).length+3));
  if(options.autoResize)for(const row of rows)keys.forEach((key,i)=>{widths[i]=Math.min(45,Math.max(widths[i],String(row[key]??"").length+2));});
  const zip=new ZipParts();const sheet:string[]=[`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols>${keys.map((_,i)=>`<col min="${i+1}" max="${i+1}" width="${options.autoResize?widths[i]:18}" customWidth="1"/>`).join("")}${options.photos?`<col min="${keys.length+1}" max="${keys.length+1}" width="14" customWidth="1"/>`:""}</cols><sheetData>`];
  const cell=(value:unknown,ref:string,style=0)=>`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(typeof value==="string"&&/^[=+@\-\t\r]/.test(value)?"'"+value:value)}</t></is></c>`;
  sheet.push(`<row r="1" ht="28" customHeight="1">${[...keys.map(key=>fieldNames[key]||key),...(options.photos?["Customer Photo"]:[])].map((name,i)=>cell(name,`${col(i)}1`,1)).join("")}</row>`);
  const anchors:string[]=[],rels:string[]=[],media:{path:string;bytes:Uint8Array}[]=[];
  for(let i=0;i<rows.length;i++){
    assertActive(options.signal);const row=rows[i];const n=i+2;
    sheet.push(`<row r="${n}" ht="${options.photos?54:22}" customHeight="1">${keys.map((key,j)=>cell(row[key],`${col(j)}${n}`)).join("")}</row>`);
    if(options.photos){let photo=photoBytes(row.photoPreview||row.photoDataUrl);if(!photo)photo=await pngFromOtherImage(row.photoPreview||row.photoDataUrl);
      if(photo){const id=media.length+1,path=`xl/media/photo${id}.${photo.extension}`;media.push({path,bytes:photo.bytes});rels.push(`<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/photo${id}.${photo.extension}"/>`);anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${keys.length}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${i+1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="571500" cy="666750"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="Customer photo ${id}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);}
    }
    if(i%25===0){options.progress(i+1,rows.length);await yieldUI();}
  }
  sheet.push(`</sheetData>${media.length?'<drawing r:id="rId1"/>':""}</worksheet>`);
  zip.add("[Content_Types].xml",`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${media.length?'<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>':""}</Types>`);
  zip.add("_rels/.rels",`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.add("xl/workbook.xml",`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Customers" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.add("xl/_rels/workbook.xml.rels",`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.add("xl/styles.xml",`<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF153C58"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="1" borderId="0" xfId="0" applyFill="1" applyFont="1" applyNumberFormat="1"/></cellXfs></styleSheet>`);
  zip.add("xl/worksheets/sheet1.xml",sheet.join(""));
  if(media.length){zip.add("xl/worksheets/_rels/sheet1.xml.rels",`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);zip.add("xl/drawings/drawing1.xml",`<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join("")}</xdr:wsDr>`);zip.add("xl/drawings/_rels/drawing1.xml.rels",`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`);}
  for(let i=0;i<media.length;i++){assertActive(options.signal);zip.add(media[i].path,media[i].bytes);if(i%25===0)await yieldUI();}
  options.progress(rows.length,rows.length);return zip.blob();
}
export async function saveCustomerXlsx(blob:Blob){const filename=`BankSetu-customers-${new Date().toISOString().slice(0,10)}.xlsx`;
  if(isAndroid()){const bytes=new Uint8Array(await blob.arrayBuffer());let base64="";for(let i=0;i<bytes.length;i+=8192)base64+=String.fromCharCode(...bytes.subarray(i,i+8192));const saved=await Filesystem.writeFile({path:filename,directory:Directory.Cache,data:btoa(base64)});await Share.share({title:"Bank Setu Customer Excel",files:[saved.uri],dialogTitle:"Save customer Excel"});return;}
  const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}

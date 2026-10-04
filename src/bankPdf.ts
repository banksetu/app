import { readAutomaticCustomer } from "./pdfTextTemplate";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { BankFieldPlacement } from "./bankFormatUtils";
const aliases: Record<string,string[]> = {
  name:["customer name","applicant name","account holder name","name of applicant","name"],
  fatherName:["father name","father's name","guardian name","husband name","father / husband name"],
  accountNo:["account number","account no","a/c no","acc no"],
  customerId:["customer id","customer number","cif number","cif no"],
  aofNo:["aof number","aof no","reference number","reference no"],
  mobile:["mobile number","mobile no","contact number","phone number","mobile"],
  gender:["gender","sex"], aadhaar:["aadhaar number","aadhaar no","uidai no","aadhar number","aadhaar"],
  pan:["pan number","pan no","pan"], address:["communication address","residential address","customer address","full address","address"],
  branchName:["branch name","branch"], ifsc:["ifsc code","ifsc"],
  accountOpeningDate:["account opening date","opening date"], nominee:["nominee name","nominee"],
  postOffice:["post office"], pinCode:["pin code","pincode"], customerPhoto:["customer photo","photograph","photo"],
};
const normalize=(s:string)=>s.toLowerCase().replace(/[_:.\-{}=]+/g," ").replace(/\s+/g," ").trim();
export function identifyPdfField(label:string) {
  const clean=normalize(label);
  for (const [field,names] of Object.entries(aliases)) if(names.includes(clean)) return field;
  return "";
}
const customerKeys: Record<string,string> = {customerId:"enrolId",fatherName:"coName",mobile:"contact",address:"fullAddress"};
export function cleanExtractedValue(value:string) {
  const clean = value.trim().replace(/^[:=\s_-]+|[:=\s_-]+$/g, "");
  if (!clean || identifyPdfField(clean) || /\{\{|\}\}/.test(clean)) return "";
  return clean;
}
export function validateExtractedCustomer(input:Record<string,string>) {
  const result:Record<string,string>={};
  for (const [field,raw] of Object.entries(input)) {
    const value=cleanExtractedValue(raw);
    if (!value || /\b(?:date of birth|relationship|age|customer id|account no|aadhaar|aadhar)\b/i.test(value)) continue;
    if (field === "accountNo" && !/^\d{6,20}$/.test(value)) continue;
    if (field === "enrolId" && !/^[a-z0-9/-]{2,30}$/i.test(value)) continue;
    if (field === "contact" && !/^(?:\+91[ -]?)?[6-9]\d{9}$/.test(value)) continue;
    if (field === "pinCode" && !/^[1-9]\d{5}$/.test(value)) continue;
    if (field === "pan" && !/^[A-Z]{5}\d{4}[A-Z]$/i.test(value)) continue;
    if (["name","coName","nominee"].includes(field) && (/\d|\b(?:male|female|gender|sex)\b/i.test(value) || value.length>100)) continue;
    if (field === "gender" && !/^(?:male|female|other|transgender|m|f)$/i.test(value)) continue;
    if (field === "accountOpeningDate" && !/^(?:\d{4}-\d{2}-\d{2}|\d{2}[-/]\d{2}[-/]\d{4})$/.test(value)) continue;
    result[field]=value;
  }
  return result;
}
export function parseBankCustomerLines(lines:string[]) {
  const result:Record<string,string>={};
  const keys:Record<string,string>={customerId:"enrolId",fatherName:"coName",mobile:"contact",address:"fullAddress"};
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    const separator=line.search(/[:=]/);
    const parts=separator >= 0 ? [line.slice(0,separator),line.slice(separator+1)] : [line];
    const field=identifyPdfField(parts[0]);
    if(!field || field==="aadhaar" || field==="customerPhoto")continue;
    let value=parts[1]?.trim() || "";
    if(!value && identifyPdfField(line) && lines[i+1] && !identifyPdfField(lines[i+1].split(/[:=]/)[0])) value=lines[i+1].trim();
    value=cleanExtractedValue(value);
    if(value)result[keys[field]||field]=value;
  }
  return result;
}
export async function extractBankCustomer(pdf:PDFDocumentProxy, fieldMap:BankFieldPlacement[] = [], mappedOnly = false) {
  const values:Record<string,string>={};
  const lines:string[]=[];
  for(let number=1;number<=Math.min(pdf.numPages,10);number++){
    const page=await pdf.getPage(number);
    const annotations=await page.getAnnotations();
    for(const annotation of mappedOnly ? [] : annotations){
      const field=identifyPdfField(String(annotation.fieldName || annotation.alternativeText || ""));
      if(field && field!=="aadhaar" && field!=="customerPhoto" && typeof annotation.fieldValue==="string"){
        const key=({customerId:"enrolId",fatherName:"coName",mobile:"contact",address:"fullAddress"} as Record<string,string>)[field]||field;
        const value=cleanExtractedValue(annotation.fieldValue);
        if(value)values[key]=value;
      }
    }
    const content=await page.getTextContent();
    const viewport=page.getViewport({scale:1});
    for (const placement of fieldMap.filter(item => (item.page || 1) === number)) {
      if (placement.field === "aadhaar" || placement.field === "customerPhoto") continue;
      const left=placement.x/100*viewport.width, top=placement.y/100*viewport.height;
      const neighbours=fieldMap.filter(item=>(item.page||1)===number && item.field!==placement.field && item.x>placement.x && Math.abs(item.y-placement.y)<2);
      const right=Math.min(placement.x+placement.width,...neighbours.map(item=>item.x));
      const width=(mappedOnly ? placement.width : right-placement.x)/100*viewport.width;
      const height=placement.height ? placement.height/100*viewport.height : Math.max(12,placement.fontSize*72/96*1.6);
      const candidates:Array<{x:number,y:number,text:string}>=[];
      for (const item of content.items) if ("str" in item) {
        const point=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
        const itemHeight=Math.abs(item.height) || 10;
        if (point[0]>=left-2 && point[0]<left+width && point[1]-itemHeight/2>=top && point[1]-itemHeight/2<top+height && (typeof item.width!=="number" || point[0]+item.width<=left+width+2)) {
          const text=cleanExtractedValue(item.str);
          if (text) candidates.push({x:point[0],y:point[1],text});
        }
      }
      const value=cleanExtractedValue(candidates.sort((a,b)=>Math.abs(a.y-b.y)>3?a.y-b.y:a.x-b.x).map(item=>item.text).join(" "));
      if (value) values[customerKeys[placement.field] || placement.field]=value;
    }
    const rows=new Map<number,Array<{x:number,text:string}>>();
    for(const item of content.items)if("str" in item){
      const y=Math.round(item.transform[5]/3)*3;
      const row=rows.get(y)||[];row.push({x:item.transform[4],text:item.str});rows.set(y,row);
    }
    for(const [,row] of [...rows.entries()].sort((a,b)=>b[0]-a[0]))lines.push(row.sort((a,b)=>a.x-b.x).map(i=>i.text).join(" ").trim());
  }
  const result=validateExtractedCustomer({...(!mappedOnly ? parseBankCustomerLines(lines) : {}),...await readAutomaticCustomer(pdf),...values});
  const opening=result.accountOpeningDate?.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if(opening)result.accountOpeningDate=opening[3]+"-"+opening[2]+"-"+opening[1];
  return result;
}
export async function detectBankPdfLayout(file:File) {
  if(file.type!=="application/pdf")return {fieldMap:[] as BankFieldPlacement[],pageWidthMm:205,pageHeightMm:175};
  const task=getDocument({data:new Uint8Array(await file.arrayBuffer())});
  const pdf=await task.promise;
  try {
    if(pdf.numPages>10)throw new Error("Bank samples can contain up to 10 pages.");
    const first=await pdf.getPage(1), size=first.getViewport({scale:1});
    const fieldMap:BankFieldPlacement[]=[];
    for(let number=1;number<=pdf.numPages;number++){
      const page=await pdf.getPage(number), viewport=page.getViewport({scale:1});
      const used=new Set<string>();
      const add=(field:string,x:number,y:number,width:number,height:number=12)=>{
        if(!field || used.has(field) || x<0 || y<0 || x>=99 || y>=99)return;
        used.add(field);fieldMap.push({field,page:number,x,y,width:Math.max(1,Math.min(width,100-x)),fontSize:Math.max(5,Math.min(18,height*96/72)),uppercase:false,align:"left"});
      };
      for(const annotation of await page.getAnnotations()){
        const field=identifyPdfField(String(annotation.fieldName || annotation.alternativeText || ""));
        if(!field || !annotation.rect)continue;
        const one=viewport.convertToViewportPoint(annotation.rect[0],annotation.rect[1]);
        const two=viewport.convertToViewportPoint(annotation.rect[2],annotation.rect[3]);
        const rect=[one[0],one[1],two[0],two[1]];
        const x=Math.min(rect[0],rect[2]),y=Math.min(rect[1],rect[3]);
        add(field,x/viewport.width*100,y/viewport.height*100,Math.abs(rect[2]-rect[0])/viewport.width*100,Math.abs(rect[3]-rect[1]));
      }
      const content=await page.getTextContent();
      for(const item of content.items)if("str" in item){
        const placeholder=item.str.match(/^\s*\{\{(.+?)\}\}\s*$/);
        const field=identifyPdfField(placeholder?.[1] || item.str);
        if(!field)continue;
        const point=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
        const height=Math.abs(item.height)||10;
        const x=point[0]+(placeholder ? 0 : item.width+5);
        add(field,x/viewport.width*100,(point[1]-height)/viewport.height*100,placeholder ? Math.max(10,item.width/viewport.width*100) : 22,height);
      }
    }
    return {fieldMap,pageWidthMm:Number((size.width*25.4/72).toFixed(1)),pageHeightMm:Number((size.height*25.4/72).toFixed(1))};
  } finally {await task.destroy();}
}

/** Private, bounded DOCX text importer. No HTML insertion, scripts, external resources or network.
 * This is NOT a full Word layout engine: tables and drawings need manual review.
 */
export type WordParagraph={text:string;align:"left"|"center"|"right"|"justify"};
export type WordImport={paragraphs:WordParagraph[];warnings:string[]};
const MAX_BYTES=8*1024*1024;
const MAX_XML=3*1024*1024;
const decode=new TextDecoder("utf-8",{fatal:true});
function uint16(a:DataView,n:number){return a.getUint16(n,true);}
function uint32(a:DataView,n:number){return a.getUint32(n,true);}
function xmlEntities(text:string):string{
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi,(_,raw:string)=>{
    const name=raw.toLowerCase();
    if(name==="amp")return "&";
    if(name==="lt")return "<";
    if(name==="gt")return ">";
    if(name==="quot")return '"';
    if(name==="apos")return "'";
    if(name[0]==="#"){
      const code=name[1]==="x"?parseInt(name.slice(2),16):parseInt(name.slice(1),10);
      return code>0&&code<=0x10ffff&&!((code>=0xd800)&&(code<=0xdfff))?String.fromCodePoint(code):"�";
    }
    return "";
  });
}
async function unzipWordDocument(raw:ArrayBuffer):Promise<string>{
  if(raw.byteLength<22||raw.byteLength>MAX_BYTES)throw Error("DOCX file exceeds the permitted size.");
  const view=new DataView(raw),bytes=new Uint8Array(raw);
  let end=-1;
  for(let i=raw.byteLength-22;i>=Math.max(0,raw.byteLength-65557);i--){
    if(uint32(view,i)===0x06054b50){end=i;break;}
  }
  if(end<0)throw Error("Invalid DOCX archive.");
  const count=uint16(view,end+10),directoryOffset=uint32(view,end+16);
  if(count>1000||directoryOffset>=raw.byteLength)throw Error("DOCX archive is too large or invalid.");
  let index=directoryOffset;
  for(let k=0;k<count;k++){
    if(index+46>raw.byteLength||uint32(view,index)!==0x02014b50)throw Error("Invalid DOCX directory.");
    const flags=uint16(view,index+8),method=uint16(view,index+10);
    const compressedSize=uint32(view,index+20),uncompressedSize=uint32(view,index+24);
    const nameLength=uint16(view,index+28),extraLength=uint16(view,index+30),commentLength=uint16(view,index+32);
    const local=uint32(view,index+42);
    const next=index+46+nameLength+extraLength+commentLength;
    if(next>raw.byteLength)throw Error("Corrupt DOCX filenames.");
    const name=decode.decode(bytes.subarray(index+46,index+46+nameLength));
    index=next;
    if(name!=="word/document.xml")continue;
    if((flags&1)||!([0,8].includes(method))||compressedSize>MAX_XML||uncompressedSize>MAX_XML)
      throw Error("Encrypted, unsupported or oversized Word document.");
    if(local+30>raw.byteLength||uint32(view,local)!==0x04034b50)throw Error("Invalid Word document data.");
    const dataStart=local+30+uint16(view,local+26)+uint16(view,local+28);
    if(dataStart+compressedSize>raw.byteLength)throw Error("Truncated DOCX document.");
    const packed=bytes.subarray(dataStart,dataStart+compressedSize);
    if(method===0){
      if(packed.byteLength!==uncompressedSize)throw Error("Invalid uncompressed Word part.");
      return decode.decode(packed);
    }
    if(typeof DecompressionStream!=="function")throw Error("This Windows runtime does not support DOCX decompression.");
    const stream=new Blob([new Uint8Array(packed)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const reader=stream.getReader(),chunks:Uint8Array[]=[];
    let used=0;
    try{
      while(true){
        const next=await reader.read();
        if(next.done)break;
        used+=next.value.byteLength;
        if(used>MAX_XML){await reader.cancel();throw Error("Word document XML is too large.");}
        chunks.push(next.value);
      }
    }finally{reader.releaseLock();}
    if(used!==uncompressedSize)throw Error("Word document decompression mismatch.");
    const joined=new Uint8Array(used);
    let at=0;
    for(const chunk of chunks){joined.set(chunk,at);at+=chunk.length;}
    return decode.decode(joined);
  }
  throw Error("DOCX is missing word/document.xml.");
}
/** Extracts visible plain text and basic paragraph alignment without evaluating markup. */
export function extractWordParagraphs(xml:string):WordImport{
  if(xml.length>MAX_XML)throw Error("Document XML is too large.");
  const paragraphs:WordParagraph[]=[];
  const warnings:string[]=[];
  if(/<w:tbl(?:\s|\/?>)/.test(xml))warnings.push("Word tables must be manually checked and rebuilt.");
  if(/<w:(?:drawing|pict|object)(?:\s|\/?>)/.test(xml))warnings.push("Word drawings/images were not reconstructed.");
  if(/<w:(?:sectPr|hdr|ftr)(?:\s|\/?>)/.test(xml))warnings.push("Word page sections, headers or footers need manual inspection.");
  const blocks=xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)||[];
  for(const block of blocks){
    const parts:string[]=[];
    const tokens=/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g;
    let token:RegExpExecArray|null;
    while((token=tokens.exec(block))!==null){
      parts.push(token[2]==="tab"?"\t":token[2]?"\n":xmlEntities(token[1]));
    }
    const text=parts.join("").slice(0,4500);
    if(!text.trim())continue;
    const jc=block.match(/<w:jc\b[^>]*w:val="(left|center|right|both)"/)?.[1];
    paragraphs.push({text,align:jc==="both"?"justify":(jc||"left") as WordParagraph["align"]});
    if(paragraphs.length>=240){warnings.push("Only the first 240 nonempty paragraphs were imported.");break;}
  }
  if(!paragraphs.length)warnings.push("No editable text found in the Word document.");
  return {paragraphs,warnings};
}
export async function importWordDocx(file:File):Promise<WordImport>{
  if(!file.name.toLowerCase().endsWith(".docx"))
    throw Error("Old binary .doc files are not directly supported. Save as DOCX in Word and upload again.");
  if(file.size>MAX_BYTES)throw Error("Choose a DOCX under 8 MB.");
  const xml=await unzipWordDocument(await file.arrayBuffer());
  return extractWordParagraphs(xml);
}

/** Bounded, read-only Word 97–2003 .doc text import.
 * Reads OLE2 WordDocument/0Table/1Table piece table locally without running
 * VBA/macros, embedded OLE objects, linked resources or any native software.
 * The binary format cannot reproduce arbitrary DOC formatting.
 */
type Piece = {cpStart:number;cpEnd:number;fileOffset:number;compressed:boolean};
const END=0xfffffffe,FREE=0xffffffff,MAX_BYTES=8*1024*1024;
const utf16=new TextDecoder("utf-16le");
const ansi=new TextDecoder("windows-1252");
function bounds(buf:Uint8Array,start:number,size:number){
  if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(size)||size<0||
    start+size>buf.length)throw Error("Corrupt Word document structure.");
  return buf.subarray(start,start+size);
}
function v16(b:Uint8Array,p:number){bounds(b,p,2);return new DataView(b.buffer,b.byteOffset+p,2).getUint16(0,true);}
function v32(b:Uint8Array,p:number){bounds(b,p,4);return new DataView(b.buffer,b.byteOffset+p,4).getUint32(0,true);}
function compoundStreams(bytes:Uint8Array){
  if(bytes.length<512||bytes.length>MAX_BYTES)throw Error("Legacy DOC file is too small or exceeds 8 MB.");
  if([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].some((v,i)=>bytes[i]!==v))
    throw Error("This is not a Word 97–2003 DOC compound document.");
  if(v16(bytes,28)!==0xfffe)throw Error("Unsupported Word binary byte order.");
  const sectorSize=2**v16(bytes,30),miniSize=2**v16(bytes,32);
  if(![512,4096].includes(sectorSize)||miniSize!==64)throw Error("Unsupported Word compound sector size.");
  const sector=(id:number)=>{
    if(!Number.isInteger(id)||id<0||id>=Math.ceil(bytes.length/sectorSize))throw Error("Invalid DOC sector pointer.");
    return bounds(bytes,512+id*sectorSize,sectorSize);
  };
  const fatSectorIds:number[]=[];
  for(let i=0;i<109;i++){const n=v32(bytes,76+i*4);if(n<0xfffffffa)fatSectorIds.push(n);}
  const expectedFat=v32(bytes,44),difatCount=v32(bytes,72);
  let difatSector=v32(bytes,68);
  for(let i=0;i<difatCount&&fatSectorIds.length<expectedFat;i++){
    const data=sector(difatSector);
    for(let j=0;j<sectorSize/4-1;j++){const n=v32(data,j*4);if(n<0xfffffffa)fatSectorIds.push(n);}
    difatSector=v32(data,sectorSize-4);
  }
  if(expectedFat===0||expectedFat>2048||fatSectorIds.length<expectedFat)
    throw Error("Word FAT table is incomplete.");
  const fat:number[]=[];
  for(const id of fatSectorIds.slice(0,expectedFat)){
    const data=sector(id);
    for(let j=0;j<data.length;j+=4)fat.push(v32(data,j));
  }
  function chain(start:number,max=MAX_BYTES):Uint8Array{
    const list:Uint8Array[]=[];const seen=new Set<number>();let current=start,total=0;
    while(current!==END&&current!==FREE){
      if(seen.has(current)||seen.size>32768||current>=fat.length)throw Error("DOC sector chain is corrupt.");
      seen.add(current);
      const data=sector(current);
      total+=data.length;if(total>max+sectorSize)throw Error("DOC stream exceeds allowed size.");
      list.push(data);current=fat[current];
    }
    const result=new Uint8Array(total);let at=0;
    for(const part of list){result.set(part,at);at+=part.length;}
    return result;
  }
  const dir=chain(v32(bytes,48),MAX_BYTES);
  const entries=new Map<string,{name:string;type:number;start:number;size:number}>();
  for(let off=0;off+128<=dir.length;off+=128){
    const len=v16(dir,off+64),type=dir[off+66];
    if(len<2||len>64||len%2)continue;
    const name=utf16.decode(bounds(dir,off,len-2));
    entries.set(name,{name,type,start:v32(dir,off+116),size:v32(dir,off+120)});
  }
  const root=entries.get("Root Entry");
  if(!root||root.type!==5)throw Error("DOC compound root stream missing.");
  const miniFat:number[]=[];
  const miniFatSectors=v32(bytes,64);
  if(miniFatSectors>0&&miniFatSectors<1024){
    const data=chain(v32(bytes,60),miniFatSectors*sectorSize);
    for(let i=0;i<Math.min(data.length,miniFatSectors*sectorSize);i+=4)miniFat.push(v32(data,i));
  }
  const rootBytes=root.start<0xfffffffa?chain(root.start,MAX_BYTES).subarray(0,root.size):new Uint8Array();
  function getStream(name:string){
    const entry=entries.get(name);
    if(!entry||entry.type!==2)throw Error("Legacy DOC missing "+name+" stream.");
    if(entry.size>MAX_BYTES)throw Error("DOC stream exceeds 8 MB.");
    if(entry.size<4096&&miniFat.length){
      const parts:Uint8Array[]=[];const seen=new Set<number>();let n=entry.start,size=0;
      while(n!==END&&n!==FREE&&size<entry.size){
        if(seen.has(n)||n>=miniFat.length)throw Error("Corrupt DOC small stream.");
        seen.add(n);const off=n*miniSize;parts.push(bounds(rootBytes,off,miniSize));
        size+=miniSize;n=miniFat[n];
      }
      const out=new Uint8Array(size);let off=0;
      for(const part of parts){out.set(part,off);off+=part.length;}
      return out.subarray(0,entry.size);
    }
    return chain(entry.start,MAX_BYTES).subarray(0,entry.size);
  }
  return {getStream,entries};
}
function extractPieceTable(word:Uint8Array,table:Uint8Array):Piece[]{
  if(v16(word,0)!==0xa5ec)throw Error("Unsupported legacy DOC WordDocument signature.");
  const flags=v16(word,10);
  if(flags&0x0100)throw Error("Encrypted legacy DOC files are not supported.");
  const csw=v16(word,32),cslwAt=34+2*csw,cslw=v16(word,cslwAt);
  const cbAt=cslwAt+2+4*cslw,count=v16(word,cbAt);
  // fcClx/lcbClx is pair #33 for Word 97+ FIB format.
  if(count<34)throw Error("Legacy DOC piece table is unsupported.");
  const fcClx=v32(word,cbAt+2+33*8),lcbClx=v32(word,cbAt+2+33*8+4);
  if(lcbClx<5||lcbClx>table.length||fcClx+lcbClx>table.length)throw Error("DOC piece table is missing.");
  let p=fcClx,limit=fcClx+lcbClx;
  while(p<limit){
    const kind=table[p++];
    if(kind===1){const size=v16(table,p);p+=2+size;continue;}
    if(kind!==2)throw Error("Unsupported DOC piece table record.");
    const size=v32(table,p);p+=4;
    if(size<16||(size-4)%12||p+size>limit)throw Error("Corrupt DOC piece table.");
    const n=(size-4)/12,offset=p+4*(n+1),pieces:Piece[]=[];
    for(let i=0;i<n;i++){
      const cpStart=v32(table,p+i*4),cpEnd=v32(table,p+(i+1)*4);
      const raw=v32(table,offset+i*8+2),compressed=(raw&0x40000000)!==0;
      const fileOffset=compressed?(raw&0x3fffffff)/2:raw&0x3fffffff;
      if(cpEnd<cpStart||cpEnd-cpStart>500000||!Number.isSafeInteger(fileOffset))
        throw Error("Corrupt legacy DOC character positions.");
      pieces.push({cpStart,cpEnd,fileOffset,compressed});
    }
    return pieces;
  }
  throw Error("DOC text piece table missing.");
}
export async function importLegacyWordDoc(file:File){
  if(!file.name.toLowerCase().endsWith(".doc"))throw Error("Choose an old binary .doc file.");
  if(file.size>MAX_BYTES)throw Error("Choose a legacy DOC under 8 MB.");
  const raw=new Uint8Array(await file.arrayBuffer());
  const {getStream,entries}=compoundStreams(raw);
  const word=getStream("WordDocument");
  const useOneTable=(v16(word,10)&0x0200)!==0;
  const table=getStream(useOneTable?"1Table":"0Table");
  const pieces=extractPieceTable(word,table);
  let text="";
  for(const piece of pieces){
    const count=piece.cpEnd-piece.cpStart;
    if(!count)continue;
    const bytes=bounds(word,piece.fileOffset,count*(piece.compressed?1:2));
    text+=(piece.compressed?ansi:utf16).decode(bytes);
    if(text.length>300000)throw Error("Legacy DOC contains too much text.");
  }
  // Word 97 ends paragraphs with CR, tables often use 0x07 cell separators.
  const lines=text.replace(/\u0007/g,"\t").replace(/[\r\u000b\u000c]/g,"\n")
    .replace(/[\u0000-\u0006\u0008\u000e-\u001f]/g,"").split("\n").filter(v=>v.trim());
  const paragraphs=lines.slice(0,240).map(value=>({text:value.slice(0,4500),align:"left" as const}));
  const warnings=["Legacy DOC: text imported locally; font runs, tables, pictures and exact page geometry require visual review."];
  if(entries.has("Macros")||entries.has("VBA"))warnings.push("The document contains macros; none were executed or imported.");
  if(lines.length>240)warnings.push("Only the first 240 paragraphs were imported.");
  if(!paragraphs.length)warnings.push("No editable text found in this legacy DOC.");
  return {paragraphs,warnings};
}

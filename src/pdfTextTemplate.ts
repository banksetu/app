import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { BankFieldPlacement } from "./bankFormatUtils";
export type TextRun={text:string;x:number;y:number;width:number;height:number;fontSize:number};
export type TextTemplatePage={width:number;height:number;runs:TextRun[];fields:BankFieldPlacement[]};
const names:Record<string,string[]>={name:['customer name','applicant name','account holder name','full name','name'],accountNo:['account number','account no','a/c no'],customerId:['customer id','customer no','cif no','enrolment no','enrollment no'],aofNo:['reference number','reference no','aof no'],fatherName:['father / husband name','father name','father’s name','guardian name','c/o','s/o'],gender:['gender','sex'],mobile:['mobile number','mobile no','contact number','phone no'],aadhaar:['aadhaar number','aadhaar no','aadhar no'],pan:['pan number','pan no'],address:['full address','residential address','communication address','address'],postOffice:['post office','p.o.','p.o','po'],village:['village','vill.','vill'],pinCode:['pin code','pincode','pin-code','postal code','pin'],nominee:['nominee name','nominee'],dateOfBirth:['date of birth','dob','d.o.b.'],religion:['religion'],category:['category','caste'],branchName:['branch name'],ifsc:['ifsc code'],accountOpeningDate:['account opening date','opening date']};
const escaped=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const alternatives=Object.entries(names).flatMap(([field,labels])=>labels.map(label=>({field,label}))).sort((a,b)=>b.label.length-a.label.length);
const labelPattern=new RegExp('(?<![\\p{L}])('+alternatives.map(item=>escaped(item.label)).join('|')+')(?![\\p{L}])','giu');
export function splitLabelValues(text:string){
 const matches=[...text.matchAll(labelPattern)];
 return matches.map((match,index)=>({field:alternatives.find(item=>item.label.toLowerCase()===match[0].toLowerCase())!.field,label:match[0],start:match.index!,end:match.index!+match[0].length,value:text.slice(match.index!+match[0].length,matches[index+1]?.index??text.length).replace(/^[\s:=/\-]+/,'').replace(/[\s,;]+$/,'').trim()}));
}
export function parseAddressParts(text:string){
 const postOffice=text.match(/\b(?:P\.?\s*O\.?|Post\s+Office)\s*[:\-/]?\s*([^,;\n]+)/i)?.[1]?.trim();
 const village=text.match(/\b(?:VILL(?:AGE)?\.?)\s*[:\-/]\s*([^,;\n]+)/i)?.[1]?.trim();
 const pinCode=text.match(/(?:\bPIN(?:\s*CODE)?\s*[:.-]?\s*|[,\s])([1-9]\d{5})\b/i)?.[1];
 return {...(pinCode?{pinCode}:{}),...(postOffice?{postOffice}:{}),...(village?{address:village}:{})};
}
export async function readTextTemplate(pdf:PDFDocumentProxy, regions:BankFieldPlacement[]=[]):Promise<TextTemplatePage[]>{
 const pages:TextTemplatePage[]=[];
 const placed=new Set<string>();
 for(let n=1;n<=Math.min(pdf.numPages,10);n++){
  const page=await pdf.getPage(n),viewport=page.getViewport({scale:1}),content=await page.getTextContent();
  const runs:TextRun[]=[],fields:BankFieldPlacement[]=[];
  const items=content.items.filter(item=>'str' in item).map(item=>{const point=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);return {text:item.str,x:point[0],y:point[1]-(Math.abs(item.height)||10),width:item.width||item.str.length*5,height:Math.abs(item.height)||10,fontSize:(Math.abs(item.height)||10)*96/72};}).filter(item=>item.text.trim());
  const rows=new Map<number,TextRun[]>();for(const item of items){const key=Math.round(item.y/3)*3;rows.set(key,[...(rows.get(key)||[]),item]);}
  for(const row of rows.values()){
   row.sort((a,b)=>a.x-b.x);
   for(let index=0;index<row.length;index++){
    const item=row[index];
    const candidates=/capital letters|wish to|hereby|please|following type/i.test(item.text)?[]:splitLabelValues(item.text);
    // Words in instructions (e.g. 'Name of nominee') are fixed copy, not customer fields.
    const labels=candidates.filter(label=>!/^\s+of\b/i.test(item.text.slice(label.end)) && (label.start<8 || /[:=]/.test(item.text.slice(0,label.start))));
    const covered=regions.some(box=>(box.page||1)===n && item.x+item.width/2>=box.x/100*viewport.width && item.x+item.width/2<=(box.x+box.width)/100*viewport.width && item.y+item.height/2>=box.y/100*viewport.height && item.y+item.height/2<=(box.y+(box.height||2))/100*viewport.height);

    if(labels.length){
     for(const [li,label] of labels.entries()){
      const unit=item.width/Math.max(1,item.text.length),x=item.x+label.start*unit;
      runs.push({...item,text:item.text.slice(li===0?0:label.start,label.end)+(item.text.slice(label.end).match(/^[\s:=-]+/)?.[0]||''),x:li===0?item.x:x,width:Math.max(1,(label.end-(li===0?0:label.start))*unit)});
      const following=row[index+1];
      const valueX=label.value ? item.x+label.end*unit+4 : following && !splitLabelValues(following.text).length ? following.x : item.x+label.end*unit+4;
      const next=labels[li+1]?item.x+labels[li+1].start*unit:row.slice(index+1).find(other=>splitLabelValues(other.text).length)?.x??viewport.width-20;
      const width=Math.max(12,next-valueX-4);
      if(!placed.has(label.field)){placed.add(label.field);fields.push({field:label.field,page:n,x:valueX/viewport.width*100,y:item.y/viewport.height*100,width:width/viewport.width*100,height:item.height*1.4/viewport.height*100,fontSize:item.fontSize,align:'left',uppercase:false});}
     }
    }else if(!covered && !row.slice(0,index).some(other=>splitLabelValues(other.text).length && !/\bof\b/i.test(other.text))){runs.push(item);}
   }
  }
  pages.push({width:viewport.width,height:viewport.height,runs,fields});
 }
 return pages;
}
export async function readAutomaticCustomer(pdf:PDFDocumentProxy){
 const result:Record<string,string>={};
 const keys:Record<string,string>={customerId:'enrolId',fatherName:'coName',mobile:'contact',address:'fullAddress',village:'address'};
 for(let n=1;n<=Math.min(pdf.numPages,10);n++){
  const page=await pdf.getPage(n),content=await page.getTextContent();
  const rows=new Map<number,Array<{x:number;text:string}>>();for(const item of content.items)if('str' in item){const y=Math.round(item.transform[5]/3)*3;rows.set(y,[...(rows.get(y)||[]),{x:item.transform[4],text:item.str}]);}
  for(const row of rows.values()){
   const text=row.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ');
   for(const part of splitLabelValues(text))if(part.value && part.field!=='aadhaar' && !(['village','postOffice'].includes(part.field)&&!/[.:/\-]/.test(text.slice(part.end,part.end+3))&&part.label.toLowerCase()!=='post office'))result[keys[part.field]||part.field]=part.value;
   Object.assign(result,parseAddressParts(text));
  }
 }
 return result;
}

// Render only form graphics; never retain the sample customer's text or images.
export async function renderTemplateGraphics(pdf:PDFDocumentProxy, excluded:Set<number>){
 const graphics:string[]=[];
 for(let number=1;number<=Math.min(pdf.numPages,10);number++){
  const page=await pdf.getPage(number),viewport=page.getViewport({scale:1.5}),operators=await page.getOperatorList();
  const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  const context=canvas.getContext("2d");if(!context)throw new Error("Template graphics could not be prepared.");
  await page.render({canvas,canvasContext:context,viewport,annotationMode:0,operationsFilter:index=>!excluded.has(operators.fnArray[index])}).promise;
  graphics.push(canvas.toDataURL("image/png"));
 }
 return graphics;
}

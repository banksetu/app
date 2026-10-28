import { jsPDF } from 'jspdf';

export type CustomerPdfImage={dataUrl:string;width:number;height:number};
export type CustomerPdfRecord=Record<string,unknown>;
export type FastCustomerPdfOptions={
  cancelled?:()=>boolean;
  progress?:(done:number,total:number)=>void;
  yieldEvery?:number;
};
export const customersPerPdfPage=5;

const text=(value:unknown)=>String(value??'').trim();
const first=(record:CustomerPdfRecord,...keys:string[])=>{for(const key of keys){const value=text(record[key]);if(value)return value;}return'-';};
const address=(record:CustomerPdfRecord)=>first(record,'fullAddress')!=='-'?first(record,'fullAddress'):[first(record,'address'),first(record,'postOffice'),first(record,'pinCode')].filter(value=>value!=='-').join(', ')||'-';
const waitForPaint=()=>new Promise<void>(resolve=>typeof requestAnimationFrame==='function'?requestAnimationFrame(()=>resolve()):setTimeout(resolve,0));

async function compactPhoto(source:string):Promise<string>{
  if(!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(source)||typeof Image==='undefined'||typeof document==='undefined')return source;
  try{
    const image=new Image();image.src=source;
    await Promise.race([image.decode(),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Photo timeout')),2500))]);
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=192;
    const context=canvas.getContext('2d');if(!context)return source;
    const scale=Math.max(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight);
    const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    context.fillStyle='#f3f4f6';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,(canvas.width-width)/2,(canvas.height-height)/2,width,height);
    const result=canvas.toDataURL('image/jpeg',.72);canvas.width=0;canvas.height=0;return result;
  }catch{return'';}
}

function line(pdf:jsPDF,label:string,value:string,x:number,y:number,labelWidth:number,valueWidth:number,maxLines=1){
  pdf.setFont('helvetica','bold');pdf.setFontSize(5.5);pdf.setTextColor(55,65,81);pdf.text(label,x,y);
  pdf.text(':',x+labelWidth,y);
  pdf.setFont('helvetica','normal');pdf.setTextColor(17,24,39);
  const lines=pdf.splitTextToSize(value,valueWidth).slice(0,maxLines) as string[];
  pdf.text(lines.length?lines:['-'],x+labelWidth+2.2,y,{lineHeightFactor:1.05});
}

function drawCustomer(pdf:jsPDF,record:CustomerPdfRecord,index:number,photo:string){
  if(index&&index%customersPerPdfPage===0)pdf.addPage('a4','portrait');
  const margin=5,slotHeight=56.6,gap=1,slot=index%customersPerPdfPage;
  const x=margin,y=margin+slot*(slotHeight+gap),width=200;
  pdf.setDrawColor(145,158,171);pdf.setLineWidth(.18);pdf.setFillColor(255,255,255);pdf.roundedRect(x,y,width,slotHeight,1.2,1.2,'FD');
  pdf.setFont('helvetica','bold');pdf.setFontSize(7.5);pdf.setTextColor(17,24,39);pdf.text('CUSTOMER PREVIEW',x+width/2,y+4.5,{align:'center'});
  pdf.setDrawColor(31,41,55);pdf.line(x+3,y+6,x+width-3,y+6);
  const left=x+3,right=x+72,rowY=y+10.5,row=4.45;
  line(pdf,'AOF NO.',first(record,'aofNo'),left,rowY,22,38);
  line(pdf,'CIF / CUSTOMER ID',first(record,'enrolId','customerId','cifId'),left,rowY+row,22,38);
  line(pdf,'ACCOUNT NO.',first(record,'accountNo'),left,rowY+row*2,22,38);
  line(pdf,'A/C OPENING DATE',first(record,'accountOpeningDate'),left,rowY+row*3,22,38);
  line(pdf,'NOMINEE',first(record,'nominee').toUpperCase(),left,rowY+row*4,22,38);
  line(pdf,'MOBILE',first(record,'contact','mobile'),left,rowY+row*5,22,38);
  line(pdf,'AADHAAR NO.',first(record,'uidaiNo','aadhaarNo','aadharNo'),left,rowY+row*6,22,38);
  line(pdf,'NAME',first(record,'name').toUpperCase(),right,rowY,18,50);
  line(pdf,'C/O NAME',first(record,'coName','fatherName','guardianName').toUpperCase(),right,rowY+row,18,50);
  line(pdf,'ADDRESS',address(record).toUpperCase(),right,rowY+row*2,18,50,2);
  line(pdf,'PIN CODE',first(record,'pinCode'),right,rowY+row*4,18,50);
  line(pdf,'PAN',first(record,'pan').toUpperCase(),right,rowY+row*5,18,50);
  const photoX=x+174,photoY=y+9,photoWidth=19,photoHeight=23;
  pdf.setDrawColor(55,65,81);pdf.setFillColor(243,244,246);pdf.rect(photoX,photoY,photoWidth,photoHeight,'FD');
  if(photo){try{pdf.addImage(photo,'JPEG',photoX+.2,photoY+.2,photoWidth-.4,photoHeight-.4,undefined,'FAST');}catch{/* Keep the placeholder. */}}
  if(!photo){pdf.setFont('helvetica','bold');pdf.setFontSize(5);pdf.setTextColor(107,114,128);pdf.text(['CUSTOMER','PHOTO'],photoX+photoWidth/2,photoY+10,{align:'center'});}
  pdf.setFont('helvetica','bold');pdf.setFontSize(4.8);pdf.setTextColor(55,65,81);pdf.text('CUSTOMER PHOTO',photoX+photoWidth/2,photoY+26,{align:'center'});
  const statusY=y+49;pdf.setDrawColor(209,213,219);pdf.line(x+3,statusY-2.2,x+width-3,statusY-2.2);
  const statuses:[string,string][]=[['ACCOUNT STATUS',first(record,'status')],['DBT STATUS',first(record,'dbtStatus')],['PASSBOOK STATUS',first(record,'passbookStatus')]];
  statuses.forEach(([label,value],position)=>{const sx=x+4+position*65;pdf.setFont('helvetica','bold');pdf.setFontSize(5);pdf.setTextColor(55,65,81);pdf.text(label,sx,statusY);pdf.setFont('helvetica','normal');pdf.setTextColor(17,24,39);pdf.text(value,sx,statusY+3.4);});
}

/** Fast vector export: no per-customer DOM mount or html2canvas screenshot. */
export async function createFastCustomerPdf(records:CustomerPdfRecord[],options:FastCustomerPdfOptions={}):Promise<Blob>{
  if(!records.length)throw new Error('Select at least one customer.');
  const pdf=new jsPDF({unit:'mm',format:'a4',orientation:'portrait',compress:true,putOnlyUsedFonts:true});
  const chunkSize=24,yieldEvery=Math.max(24,options.yieldEvery||96);
  for(let start=0;start<records.length;start+=chunkSize){
    if(options.cancelled?.())throw new Error('PDF generation cancelled. No customer data was changed.');
    const chunk=records.slice(start,start+chunkSize);
    const photos=await Promise.all(chunk.map(record=>compactPhoto(first(record,'photoPreview','photoDataUrl')==='-'?'':first(record,'photoPreview','photoDataUrl'))));
    for(let offset=0;offset<chunk.length;offset++){
      if(options.cancelled?.())throw new Error('PDF generation cancelled. No customer data was changed.');
      const index=start+offset;drawCustomer(pdf,chunk[offset],index,photos[offset]);
      if(index===records.length-1||(index+1)%25===0)options.progress?.(index+1,records.length);
    }
    if(start+chunk.length<records.length&&(start+chunk.length)%yieldEvery<chunkSize)await waitForPaint();
  }
  const file=pdf.output('blob');if(file.size<1000)throw new Error('PDF output is empty. Retry generation.');return file;
}

/** A4 portrait with five fixed, unclipped customer sections. Image capture keeps Unicode and photos. */
export function customerPdfBuilder(){
  const pdf=new jsPDF({unit:'mm',format:'a4',orientation:'portrait',compress:true});
  const margin=5,slotHeight=56.6,gap=1,usableWidth=200;
  let count=0;
  return { add(image:CustomerPdfImage){
    const index=count++;
    if(index && index%customersPerPdfPage===0)pdf.addPage('a4','portrait');
    if(!image.dataUrl.startsWith('data:image/jpeg;base64,')||!Number.isFinite(image.width)||!Number.isFinite(image.height)||image.width<1||image.height<1)
      throw new Error('Customer preview image is invalid. No PDF was saved.');
    const slot=index%customersPerPdfPage;
    const scale=Math.min(usableWidth/image.width,slotHeight/image.height);
    const width=image.width*scale,height=image.height*scale;
    pdf.addImage(image.dataUrl,'JPEG',margin+(usableWidth-width)/2,margin+slot*(slotHeight+gap)+(slotHeight-height)/2,width,height,undefined,'FAST');
  }, finish(){if(!count)throw new Error('Select at least one customer.');return pdf.output('blob');},get count(){return count;} };
}
export function createCustomerPdf(images:CustomerPdfImage[]):Blob {
  const builder=customerPdfBuilder();for(const image of images)builder.add(image);return builder.finish();
}

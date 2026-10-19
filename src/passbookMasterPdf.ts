import { jsPDF } from 'jspdf';

// A4 geometry and value origins measured from the approved Word-export PDF.
// The blank background contains only its original labels and punctuation.
export type MasterValues = Record<
  'branchName'|'postOffice'|'district'|'branchPin'|'branchEmail'|'ifsc'|'micr'|'branchCode'|
  'customerId'|'accountNo'|'holder'|'jointHolder'|'pan'|'mobile'|'openedOn'|'issueDate'|
  'operatedBy'|'nominee'|'address1'|'address2'|'address3'|'address4'|'amount'|'bottomDate', string
>;

type Slot = { key:keyof MasterValues; x:number; baseline:number; end:number; size?:number; scale?:number };
export const MASTER_SLOTS:readonly Slot[] = [
  {key:'branchName',x:77.7,baseline:297.95,end:225,scale:.955},
  {key:'ifsc',x:288.7,baseline:297.95,end:423,scale:.956},
  {key:'branchCode',x:425.8,baseline:297.95,end:465,scale:.959},
  {key:'postOffice',x:97.75,baseline:310.40,end:225,scale:.915},
  {key:'district',x:109.4,baseline:322.85,end:225,scale:.954},
  {key:'branchPin',x:76.75,baseline:335.30,end:225,size:8.87,scale:.804},
  {key:'micr',x:289.6,baseline:335.30,end:409,scale:.93},
  {key:'branchEmail',x:76.2,baseline:347.75,end:225},
  {key:'customerId',x:76.45,baseline:360.20,end:225,scale:.95},
  {key:'holder',x:307.7,baseline:360.20,end:425,scale:.94},
  {key:'accountNo',x:76.7,baseline:372.65,end:225,scale:.92},
  {key:'jointHolder',x:308,baseline:372.65,end:425},
  {key:'pan',x:76.3,baseline:385.10,end:225},
  {key:'address1',x:288.55,baseline:385.10,end:425,scale:.9},
  {key:'mobile',x:76.3,baseline:397.55,end:225,scale:.94},
  {key:'address2',x:288.1,baseline:397.55,end:425,scale:.935},
  {key:'openedOn',x:76.25,baseline:410.00,end:225,scale:.94},
  {key:'address3',x:288.1,baseline:410.00,end:425},
  {key:'issueDate',x:75.9,baseline:422.45,end:225,scale:.927},
  {key:'address4',x:287.7,baseline:422.45,end:425},
  {key:'operatedBy',x:75.9,baseline:434.90,end:225},
  {key:'nominee',x:76.2,baseline:447.35,end:225},
  {key:'amount',x:488.6,baseline:472.70,end:510,scale:.837},
  {key:'bottomDate',x:511.7,baseline:472.70,end:565,scale:.835},
];

const base = import.meta.env.BASE_URL;
const asset = (name:string) => `${base}passbook/${name}`;
async function bytes(url:string):Promise<Uint8Array> {
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Passbook asset unavailable: ${nameOnly(url)}`);
  return new Uint8Array(await response.arrayBuffer());
}
function nameOnly(url:string){return url.slice(url.lastIndexOf('/')+1);}
function base64(data:Uint8Array):string {
  let result='';for(let i=0;i<data.length;i+=8192)result+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(result);
}

export async function createMasterPassbookPdf(values:MasterValues):Promise<Blob> {
  const [background,font]=await Promise.all([bytes(asset('master-blank.png')),bytes(asset('LiberationMono-Regular.ttf'))]);
  const pdf=new jsPDF({orientation:'portrait',unit:'pt',format:'a4',compress:true});
  pdf.addImage(background,'PNG',0,0,595.304,841.89);
  pdf.addFileToVFS('LiberationMono-Regular.ttf',base64(font));
  pdf.addFont('LiberationMono-Regular.ttf','MasterMono','normal');
  pdf.setFont('MasterMono','normal');pdf.setTextColor(0,0,0);
  const overflow:string[]=[];
  for(const slot of MASTER_SLOTS){
    const value=String(values[slot.key]??'');
    if(/[^\x20-\x7e]/.test(value)){overflow.push(`${slot.key} (font lacks this character)`);continue;}
    if(/[\r\n]/.test(value)) { overflow.push(slot.key);continue; }
    // Word's runs use 11 pt Courier New with compressed character widths.
    // The approved PDF embeds metrically compatible Liberation Mono.
    pdf.setFontSize(11);
    const scale=(slot.scale??.92)*(slot.size??9.2)/11;
    if(pdf.getTextWidth(value)*scale>slot.end-slot.x+.25) {overflow.push(slot.key);continue;}
    if(value)pdf.text(value,slot.x,slot.baseline,{horizontalScale:scale});
  }
  if(overflow.length)throw new Error(`These values exceed the approved fixed spaces: ${overflow.join(', ')}. Correct the source or request an explicit overflow rule; nothing was shortened.`);
  return pdf.output('blob');
}

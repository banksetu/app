import { jsPDF } from 'jspdf';
import type { Customer } from './schema';
import { afsmBusinessDate } from './afsmPolicy';
function afsmRowHeight(doc:jsPDF, customer:Customer):number {
  doc.setFontSize(9);
  return Math.max(9,Math.max(doc.splitTextToSize(String(customer.name||'Unnamed customer'),100).length,doc.splitTextToSize(String(customer.accountNo||'Missing account'),51).length)*3.2+3);
}
export function paginateAfsm(customers:Customer[], doc=new jsPDF({unit:'mm',format:'a4'})):Customer[][] {
  const pages:Customer[][]=[];let current:Customer[]=[];let used=0;
  for(const customer of customers){
    const h=afsmRowHeight(doc,customer);if(h>180)throw Error('Customer name or account number is too long. Correct the malformed value before printing.');
    const capacity=pages.length?224:194;
    if(current.length && (current.length===20 || used+h>capacity)){pages.push(current);current=[];used=0;}
    current.push(customer);used+=h;
  }
  if(current.length)pages.push(current);return pages;
}
export function makeAfsmPdf(bankName:string,customers:Customer[],date=new Date(),cspCode=""):Blob {
  if(!bankName.trim())throw Error('Select your bank in Bank Information before generating AFSM.');
  if(!customers.length)throw Error('Select at least one customer.');
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  let serial=1;
  const pages=paginateAfsm(customers,doc);
  pages.forEach((records,page)=>{
    if(page)doc.addPage();
    let y=page?18:52;
    if(!page){doc.setFont('helvetica','bold');doc.setFontSize(16);while(doc.splitTextToSize(bankName.trim().toUpperCase(),180).length>2&&doc.getFontSize()>8)doc.setFontSize(doc.getFontSize()-1);doc.text(doc.splitTextToSize(bankName.trim().toUpperCase(),180),105,19,{align:'center'});doc.setFontSize(13);doc.text('AFSM — DATA SEND BRANCH',105,36,{align:'center'});doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(`AFSM Form Date: ${afsmBusinessDate(date)}`,15,45);
      const cspLabel=`CSP Code: ${cspCode.trim().replace(/\s+/g,' ') || 'Not Configured'}`;
      doc.setFontSize(Math.min(10,10*88/Math.max(1,doc.getTextWidth(cspLabel))));
      doc.text(cspLabel,195,45,{align:'right'});
    }
    doc.setFontSize(9);doc.setFont('helvetica','bold');
    const row=(values:string[],height:number)=>{const xs=[15,28,87],widths=[13,59,108];values.forEach((text,i)=>{doc.rect(xs[i],y,widths[i],height);doc.text(text,xs[i]+3,y+5);});y+=height;};
    row(['SL','Account No','Name'],9);doc.setFont('helvetica','normal');
    records.forEach(customer=>{
      const name=doc.splitTextToSize(String(customer.name||'Unnamed customer').replace(/\s+/g,' ').trim(),100);
      const account=doc.splitTextToSize(String(customer.accountNo||'Missing account'),51);
      const xs=[15,28,87],widths=[13,59,108];const h=afsmRowHeight(doc,customer);xs.forEach((x,i)=>doc.rect(x,y,widths[i],h));
      doc.setFontSize(9);doc.setLineHeightFactor(1);doc.text(String(serial++),18,y+5);doc.text(account,31,y+4);doc.text(name,90,y+4);y+=h;
    });
    if(page===pages.length-1){doc.setFontSize(10);doc.line(18,266,90,266);doc.line(116,266,190,266);doc.text('Signature of Receiver',18,272);doc.text('Completion Date from Receiver',116,272);}
  });return doc.output('blob');
}

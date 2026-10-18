import { jsPDF } from 'jspdf';

export type CustomerPdfImage={dataUrl:string;width:number;height:number};
export const customersPerPdfPage=5;

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

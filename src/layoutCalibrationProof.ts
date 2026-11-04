import {jsPDF} from "jspdf";

/** Offline physical ruler/proof only. NO customer data or bank artwork.
 * This file is never passed to the PR2 transport or used to mark Printed.
 */
export type CalibrationPaper={widthMm:number;heightMm:number;foldMm:number;printStartMm:number};
export function validateCalibrationPaper(page:CalibrationPaper):void{
  if(![page.widthMm,page.heightMm,page.foldMm,page.printStartMm].every(Number.isFinite)||
    page.widthMm<50||page.widthMm>500||page.heightMm<50||page.heightMm>500||
    page.foldMm<0||page.foldMm>page.heightMm||
    page.printStartMm<0||page.printStartMm>page.heightMm)
    throw Error("Enter valid actual paper measurements before calibration.");
}
export function exportLayoutCalibrationProof(page:CalibrationPaper):Blob{
  validateCalibrationPaper(page);
  const {widthMm:w,heightMm:h,foldMm,printStartMm}=page;
  const pdf=new jsPDF({
    orientation:w>h?"landscape":"portrait",unit:"mm",format:[w,h],compress:true
  });
  pdf.setProperties({
    title:"BANK SETU PHYSICAL CALIBRATION — TEST ONLY",
    subject:"Unapproved printer ruler; no customer record or PR2 submission"
  });
  pdf.setDrawColor(0,0,0);
  pdf.setTextColor(0,0,0);
  pdf.setLineWidth(.17);
  pdf.setFont("helvetica","normal");
  pdf.setFontSize(8);
  const left=5,right=w-5,top=5,bottom=h-5;
  pdf.rect(left,top,right-left,bottom-top,"S");
  // Each marked tick is one physical centimeter. Avoid printer edge clipping:
  // the border is 5 mm inside the measured passbook stock.
  for(let x=10;x<w-7;x+=10){
    pdf.line(x,top,x,top+3);
    pdf.line(x,bottom-3,x,bottom);
    if(x%20===0)pdf.text(String(x)+"mm",x,top+8,{align:"center"});
  }
  for(let y=10;y<h-7;y+=10){
    pdf.line(left,y,left+3,y);
    pdf.line(right-3,y,right,y);
    if(y%20===0)pdf.text(String(y),left+4,y+1.5);
  }
  // Crosshair intersections measure skew and X/Y offset with a ruler.
  const spots=[[10,10],[w-10,10],[10,h-10],[w-10,h-10],[w/2,h/2]];
  for(const [x,y] of spots){
    pdf.line(x-3,y,x+3,y);pdf.line(x,y-3,x,y+3);
  }
  if(foldMm>0&&foldMm<h){
    pdf.setDrawColor(90,90,90);
    pdf.setLineDashPattern([2,2],0);
    pdf.line(left,foldMm,right,foldMm);
    pdf.setLineDashPattern([],0);
    if(foldMm>9&&foldMm<h-9)
      pdf.text("FOLD (VERIFY)",right-2,foldMm-2,{align:"right"});
  }
  if(printStartMm>0&&printStartMm<h){
    pdf.setDrawColor(0,0,0);
    pdf.setLineWidth(.4);
    pdf.line(left,printStartMm,right,printStartMm);
    if(printStartMm>10&&printStartMm<h-10)
      pdf.text("PRINT START",right-2,printStartMm-2,{align:"right"});
  }
  // Labels must stay INSIDE the 5 mm safe border. A footer 2 mm from the
  // edge could be clipped by the printer even when the ruler itself fits.
  const mm=(value:number)=>String(Math.round(value*10)/10);
  pdf.setFontSize(6);
  pdf.text("PAPER "+mm(w)+" x "+mm(h)+" mm | FOLD "+mm(foldMm)+" | START "+mm(printStartMm),
    w/2,h-12,{align:"center"});
  pdf.text(w<120?"CALIBRATION TEST ONLY":"CALIBRATION ONLY - NOT A CUSTOMER PASSBOOK",
    w/2,h-7,{align:"center"});

  return pdf.output("blob");
}

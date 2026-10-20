import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/legacy/build/pdf.mjs';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
export const WINDOWS_PR2_MESSAGE='Please use this button on only Windows EXE mode.';
export type Pr2Device={id:string;name:string;transport:string;profile:string|null;requiresReview?:boolean};
export type Pr2Settings={profile:string;verticalResolution:number;offsetX:number;offsetY:number;confirmMode:boolean;confirmModel:boolean;acceptRaster:boolean;baud:number;parity:string;dataBits:number;stopBits:number};
export type Pr2Raster={width:number;height:number;dpi:180;bits:string};
export type Pr2Outcome={state:string;completed:boolean;message?:string;replayed?:boolean};
export type Pr2Request={scope:string;id:string;device:Pr2Device;settings:Pr2Settings;raster:Pr2Raster;test?:boolean};
declare global {interface Window {bankSetuPr2?:{
 platform:string;protocol:1;
 prepare:(scope:string)=>Promise<{id:string;pdf:string}>;
 discover:(scope:string)=>Promise<{devices:Pr2Device[];profiles:{id:string;name:string}[];preferences?:Pr2Settings&{deviceId:string};queues:{name:string;port:string}[]}>;
 probe:(request:Pick<Pr2Request,'scope'|'device'|'settings'>)=>Promise<{pr2:boolean;paper:string}>;
 send:(request:Pr2Request)=>Promise<Pr2Outcome>;
 cancel:(request:{scope:string;id:string})=>Promise<boolean>;
 acknowledge:(request:{scope:string;deviceId:string})=>Promise<boolean>;
 onProgress:(callback:(event:{id:string;message:string})=>void)=>()=>void;
}}}
export const windowsPr2=()=>window.bankSetuPr2?.platform==='win32'&&window.bankSetuPr2.protocol===1;
export function canvasRaster(canvas:HTMLCanvasElement):Pr2Raster{
 const {width,height}=canvas,context=canvas.getContext('2d');if(!context)throw Error('Passbook graphics rendering is unavailable.');
 const data=context.getImageData(0,0,width,height).data,stride=Math.ceil(width/8),bytes=new Uint8Array(stride*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,a=data[i+3]/255,grey=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)*a+255*(1-a);if(grey<160)bytes[y*stride+(x>>3)]|=128>>(x&7);}
 let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {width,height,dpi:180,bits:btoa(text)};
}
export async function rasterizePassbook(pdf:string){
 GlobalWorkerOptions.workerSrc=worker;
 const loading=getDocument({data:Uint8Array.from(atob(pdf),c=>c.charCodeAt(0))});
 try{const doc=await loading.promise;if(doc.numPages!==1)throw Error('Direct PR2 printing requires one passbook page. No pages were resized or omitted.');
  const page=await doc.getPage(1),viewport=page.getViewport({scale:180/72});
  if(viewport.width>1736||viewport.height>2105)throw Error('The selected bank template exceeds the supported printer graphics area.');
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  await page.render({canvas,viewport,background:'white'}).promise;
  return {raster:canvasRaster(canvas),preview:canvas.toDataURL('image/png')};
 }finally{await loading.destroy();}
}
export function calibrationRaster(){const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1100;const c=canvas.getContext('2d')!;c.fillStyle='white';c.fillRect(0,0,1000,1100);c.strokeStyle='black';c.lineWidth=1;
 const mm=180/25.4;c.strokeRect(20*mm,90*mm,100*mm,40*mm);c.beginPath();c.moveTo(20*mm,110*mm);c.lineTo(120*mm,110*mm);c.stroke();return canvasRaster(canvas);}

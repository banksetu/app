import {extractTesseractLines,type OCRCandidate} from "./layoutTesseractBlocks";

/** OCR fallback bundled into Bank Setu's compiled app.
 * No uploaded scan, account value or photo is sent to a network OCR service.
 * Language models and WebAssembly are static files inside the app distribution.
 * On a hosted PWA, static model files must have been cached once before offline use.
 */
export async function recognizeBundledOfflineOCR(canvas:HTMLCanvasElement):Promise<OCRCandidate[]>{
  if(typeof window==="undefined"||typeof document==="undefined"||!canvas.width||!canvas.height)
    throw Error("Browser local canvas is required for bundled OCR.");
  if(canvas.width*canvas.height>3000000)
    throw Error("Reduce scanned page size before offline OCR.");
  // The emitted lazy chunk lives under /assets/; resolve OCR relative to the
  // chunk itself instead of a nested SPA route or Android page URL.
  const root=new URL("../",import.meta.url);
  if(root.origin!==window.location.origin)throw Error("Only same-origin local OCR bundles are permitted.");
  const asset=(suffix:string)=>new URL("ocr/"+suffix,root).href;
  // Lazy import keeps the heavy recognition library off the login path.
  const {createWorker}=await import("tesseract.js");
  const worker=await createWorker(["eng","hin"],1,{
    workerPath:asset("worker.min.js"),
    corePath:asset("core"),
    langPath:asset("lang"),
    workerBlobURL:false,
  });
  try{
    const result=await worker.recognize(canvas,{}, {blocks:true,text:true});
    return extractTesseractLines(result.data.blocks);
  }finally{
    await worker.terminate();
  }
}

import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { recordSafeRecovery } from './core/localData';

pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;

export default function PdfDocumentPreview({file}:{file:Blob}){
  const root=useRef<HTMLDivElement>(null);
  const [document,setDocument]=useState<pdfjs.PDFDocumentProxy|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let disposed=false;
    let task:ReturnType<typeof pdfjs.getDocument>|undefined;
    void (async()=>{
      try{
        const data=new Uint8Array(await file.arrayBuffer());
        if(disposed)return;
        task=pdfjs.getDocument({data});
        const opened=await task.promise;
        if(disposed)return;
        setDocument(opened);setError('');
      }catch{if(!disposed){setError('PDF preview failed. Retry generating the PDF.');recordSafeRecovery('pdf','preview','attention');}}
    })();
    return()=>{disposed=true;void task?.destroy();};
  },[file]);
  useEffect(()=>{
    if(!document||!root.current)return;
    let disposed=false;
    const renders=new Map<number,{cancel:()=>void}>();
    // React has committed the page nodes before this effect runs. Observing in
    // the document loading callback could miss every page and leave a blank view.
    const observer=new IntersectionObserver(entries=>{for(const entry of entries){
            const canvas=entry.target.querySelector('canvas');
            if(!(canvas instanceof HTMLCanvasElement))continue;
            const number=Number((entry.target as HTMLElement).dataset.page);
            if(!entry.isIntersecting){renders.get(number)?.cancel();renders.delete(number);canvas.width=0;canvas.height=0;continue;}
            if(renders.has(number)||canvas.width)return;
            void document.getPage(number).then(page=>{
              if(disposed||!entry.target.isConnected)return;
              const viewport=page.getViewport({scale:1.45});
              const context=canvas.getContext('2d');if(!context)return;
              canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
              const render=page.render({canvas,canvasContext:context,viewport});renders.set(number,render);
              void render.promise.catch(reason=>{if(reason?.name!=='RenderingCancelledException'){setError('PDF preview failed. Retry generating the PDF.');recordSafeRecovery('pdf','preview','attention');}}).finally(()=>renders.delete(number));
            }).catch(()=>{setError('PDF page could not be opened.');recordSafeRecovery('pdf','preview','attention');});
          }},{root:root.current,rootMargin:'500px'});
    root.current.querySelectorAll('[data-page]').forEach(node=>observer.observe(node));
    return()=>{disposed=true;observer.disconnect();renders.forEach(value=>value.cancel());};
  },[document]);
  return <div className="customer-pdf-preview" ref={root} role="region" aria-label="PDF pages">
    {error&&<p role="alert">{error}</p>}{!document&&!error&&<p>Opening PDF preview…</p>}
    {Array.from({length:document?.numPages||0},(_,index)=><div key={index} className="customer-pdf-page" data-page={index+1}><canvas aria-label={`A4 page ${index+1} of ${document?.numPages}`}/><span>Page {index+1} of {document?.numPages}</span></div>)}
  </div>;
}

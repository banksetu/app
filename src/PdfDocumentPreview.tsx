import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { recordSafeRecovery } from './core/localData';

pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;

export default function PdfDocumentPreview({file}:{file:Blob}){
  const root=useRef<HTMLDivElement>(null);
  const [loaded,setLoaded]=useState<{file:Blob;document:pdfjs.PDFDocumentProxy}|null>(null);
  const document=loaded?.file===file?loaded.document:null;
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
        setLoaded({file,document:opened});setError('');
      }catch{if(!disposed){setError('PDF preview failed. Retry generating the PDF.');recordSafeRecovery('pdf','preview','attention');}}
    })();
    return()=>{disposed=true;void task?.destroy();};
  },[file]);
  useEffect(()=>{
    if(!document||!root.current)return;
    const container=root.current;
    let disposed=false;
    const renders=new Map<number,{cancel:()=>void}>();
    const pending=new Map<number,object>();
    // React has committed the page nodes before this effect runs. Observing in
    // the document loading callback could miss every page and leave a blank view.
    const observer=new IntersectionObserver(entries=>{for(const entry of entries){
            const canvas=entry.target.querySelector('canvas');
            if(!(canvas instanceof HTMLCanvasElement))continue;
            const number=Number((entry.target as HTMLElement).dataset.page);
            if(!entry.isIntersecting){pending.delete(number);renders.get(number)?.cancel();renders.delete(number);canvas.width=0;canvas.height=0;continue;}
            if(pending.has(number)||renders.has(number)||canvas.width)continue;
            const attempt={};pending.set(number,attempt);
            void document.getPage(number).then(page=>{
              if(disposed||pending.get(number)!==attempt||!entry.target.isConnected)return;
              const viewport=page.getViewport({scale:1.45});
              const context=canvas.getContext('2d');if(!context)return;
              canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
              const render=page.render({canvas,canvasContext:context,viewport});renders.set(number,render);
              void render.promise.catch(reason=>{if(reason?.name!=='RenderingCancelledException'){setError('PDF preview failed. Retry generating the PDF.');recordSafeRecovery('pdf','preview','attention');}}).finally(()=>{if(pending.get(number)===attempt){pending.delete(number);renders.delete(number);}});
            }).catch(()=>{if(disposed||pending.get(number)!==attempt)return;pending.delete(number);setError('PDF page could not be opened.');recordSafeRecovery('pdf','preview','attention');});
          }},{root:container,rootMargin:'500px'});
    container.querySelectorAll('[data-page]').forEach(node=>observer.observe(node));
    return()=>{disposed=true;observer.disconnect();pending.clear();renders.forEach(value=>value.cancel());container.querySelectorAll('canvas').forEach(canvas=>{canvas.width=0;canvas.height=0;});};
  },[document]);
  return <div className="customer-pdf-preview" ref={root} role="region" aria-label="PDF pages">
    {error&&<p role="alert">{error}</p>}{!document&&!error&&<p>Opening PDF preview…</p>}
    {Array.from({length:document?.numPages||0},(_,index)=><div key={index} className="customer-pdf-page" data-page={index+1}><canvas aria-label={`A4 page ${index+1} of ${document?.numPages}`}/><span>Page {index+1} of {document?.numPages}</span></div>)}
  </div>;
}

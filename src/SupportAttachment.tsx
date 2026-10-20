import {useEffect,useRef,useState} from 'react';
import {callBankSetuWorker} from './workerApi';

export async function supportFileData(file:File){
 if(!/^(image\/(jpeg|png|webp)|audio\/(webm|ogg|mpeg|mp4|wav|x-wav))$/.test(file.type.split(';')[0]))throw Error('Choose a JPEG, PNG, WebP photo or supported audio. Video is not supported.');
 if(file.size>(file.type.startsWith('image/')?15*1024*1024:2*1024*1024))throw Error('Choose a photo below 15 MB or audio below 2 MB.');
 let blob:Blob=file;
 if(file.type.startsWith('image/')){
  const bitmap=await createImageBitmap(file),ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
  const context=canvas.getContext('2d');if(!context)throw Error('Photo preparation is unavailable.');
  context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Photo could not be prepared.')),'image/jpeg',.78));
 }
 if(!/^(image\/(jpeg|png|webp)|audio\/(webm|ogg|mpeg|mp4|wav|x-wav))$/.test(blob.type.split(';')[0]))throw Error('Choose a photo or audio file. Video is not supported.');
 if(blob.size>(blob.type.startsWith('image/')?1024*1024:2*1024*1024))throw Error('Photo limit is 1 MB after resizing; audio limit is 2 MB.');
 const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Attachment could not be read.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(blob);});
 return {data,mimeType:blob.type.split(';')[0]};
}

export function SupportMediaTools({disabled,onFile,onError,onRecording}:{disabled:boolean;onFile:(file:File)=>void;onError:(text:string)=>void;onRecording:(active:boolean)=>void}){
 const [recording,setRecording]=useState(false),[opening,setOpening]=useState(false),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(timer.current);if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop());};},[]);
 const pick=(file?:File)=>{if(file)onFile(file);};
 const record=async()=>{
  if(recording){recorder.current?.stop();return;}
  if(opening)return;setOpening(true);
  try{
   stream.current=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!alive.current){stream.current.getTracks().forEach(track=>track.stop());return;}
   const mime=['audio/webm','audio/ogg','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
   if(!mime)throw Error('Voice recording is unavailable. Choose an audio file instead.');
   const current=new MediaRecorder(stream.current,{mimeType:mime,audioBitsPerSecond:64000}),chunks:Blob[]=[];recorder.current=current;
   current.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   current.onstop=()=>{clearTimeout(timer.current);stream.current?.getTracks().forEach(track=>track.stop());recorder.current=null;if(alive.current){setRecording(false);onRecording(false);pick(new File(chunks,'support-voice',{type:mime}));}};
   current.start();setRecording(true);onRecording(true);timer.current=setTimeout(()=>current.stop(),120000);
  }catch(error){stream.current?.getTracks().forEach(track=>track.stop());onError(error instanceof Error?error.message:'Microphone could not be opened.');}finally{setOpening(false);}
 };
 return <div className="support-media-tools">
  <label>Photo<input aria-label="Attach support photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled||recording} onChange={e=>{pick(e.target.files?.[0]);e.target.value='';}}/></label>
  <label>Audio<input aria-label="Attach support audio" type="file" accept="audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav" disabled={disabled||recording} onChange={e=>{pick(e.target.files?.[0]);e.target.value='';}}/></label>
  {typeof MediaRecorder!=='undefined'&&typeof navigator.mediaDevices?.getUserMedia==='function'&&<button type="button" disabled={opening||(disabled&&!recording)} onClick={()=>void record()}>{opening?'Opening microphone…':recording?'Stop recording':'Record audio'}</button>}
  <small>Photo/audio expire after 24 hours. Text messages stay until the client account is deleted.</small>
 </div>;
}

export function SupportAttachment({attachment}:{attachment:{id:string;kind:'photo'|'audio';expiresAt:unknown}}){
 const expiry=typeof attachment.expiresAt==='string'?Date.parse(attachment.expiresAt):(attachment.expiresAt as {toMillis?:()=>number})?.toMillis?.()||0;
 const [expired,setExpired]=useState(Date.now()>=expiry),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const objectUrl=useRef(''),controller=useRef<AbortController|null>(null);
 useEffect(()=>{
  const retire=()=>{if(Date.now()<expiry)return;controller.current?.abort();URL.revokeObjectURL(objectUrl.current);objectUrl.current='';setUrl('');setExpired(true);};
  const timer=setTimeout(retire,Math.max(0,expiry-Date.now()));document.addEventListener('visibilitychange',retire);
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',retire);controller.current?.abort();URL.revokeObjectURL(objectUrl.current);};
 },[expiry]);
 const open=async()=>{
  const pending=new AbortController();controller.current=pending;setBusy(true);setError('');
  try{
   const result=await callBankSetuWorker<{data:string;mimeType:string}>('/support-media-read',{id:attachment.id},pending.signal);
   if(pending.signal.aborted)return;if(Date.now()>=expiry){setExpired(true);return;}
   const data=Uint8Array.from(atob(result.data),char=>char.charCodeAt(0));
   objectUrl.current=URL.createObjectURL(new Blob([data],{type:result.mimeType}));setUrl(objectUrl.current);
  }catch(reason){if(!pending.signal.aborted)setError(reason instanceof Error?reason.message:'Attachment could not be opened.');}finally{setBusy(false);}
 };
 return <div className="support-attachment">{expired?<small>{attachment.kind==='photo'?'Photo':'Audio'} expired after 24 hours.</small>:url?(attachment.kind==='photo'?<img src={url} alt="Support photo"/>:<audio controls preload="metadata" src={url}/>):<button type="button" disabled={busy} onClick={()=>void open()}>{busy?'Opening…':attachment.kind==='photo'?'View photo':'Play audio'}</button>}{error&&<small role="alert">{error}</small>}</div>;
}

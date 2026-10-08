import {useEffect,useRef,useState} from "react";

const cameraError=(error:unknown)=>{
  const name=(error as DOMException)?.name;
  if(name==="NotAllowedError"||name==="PermissionDeniedError")return "Camera permission denied. Allow camera access in device settings and try again.";
  if(name==="NotFoundError"||name==="DevicesNotFoundError")return "No camera is available on this device.";
  if(name==="NotReadableError"||name==="TrackStartError")return "Camera is busy. Close other camera apps and try again.";
  return error instanceof Error?error.message:"Camera could not be opened. Please try Browse Photo.";
};

export default function CustomerCamera({onUse,onClose}:{onUse:(photo:Blob)=>Promise<void>;onClose:()=>void}){
  const video=useRef<HTMLVideoElement>(null);
  const stream=useRef<MediaStream|null>(null);
  const [facing,setFacing]=useState<"environment"|"user">("environment");
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const [deviceId,setDeviceId]=useState("");
  const [captured,setCaptured]=useState<Blob|null>(null);
  const [previewUrl,setPreviewUrl]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;setLoading(true);setError("");
    const start=async()=>{
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){setError("Camera needs a secure HTTPS/app connection. Use Browse Photo on this device.");setLoading(false);return;}
      try{
        const current=await navigator.mediaDevices.getUserMedia({audio:false,video:deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:facing}}});
        if(!active){current.getTracks().forEach(track=>track.stop());return;}
        stream.current=current;
        if(video.current){video.current.srcObject=current;void video.current.play().catch(()=>undefined);}
        const found=await navigator.mediaDevices.enumerateDevices();
        if(active)setDevices(found.filter(item=>item.kind==="videoinput"));
      }catch(cause){if(active)setError(cameraError(cause));}
      finally{if(active)setLoading(false);}
    };
    void start();
    return()=>{active=false;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;};
  },[facing,deviceId]);
  useEffect(()=>()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);},[previewUrl]);
  const capture=async()=>{
    const source=video.current;if(!source?.videoWidth||!source.videoHeight){setError("Camera is still starting. Try Capture again.");return;}
    const canvas=document.createElement("canvas");canvas.width=source.videoWidth;canvas.height=source.videoHeight;
    canvas.getContext("2d")?.drawImage(source,0,0);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",0.94));
    if(!blob){setError("Photo could not be captured. Please retry.");return;}
    setCaptured(blob);setPreviewUrl(URL.createObjectURL(blob));setError("");
  };
  const use=async()=>{
    if(!captured)return;setBusy(true);setError("");
    try{await onUse(captured);}catch(cause){setError(cameraError(cause));}
    finally{setBusy(false);}
  };
  return <div className="customer-camera-overlay" onClick={onClose}>
    <section className="customer-camera-dialog" role="dialog" aria-modal="true" aria-label="Capture customer photo" onClick={event=>event.stopPropagation()}>
      <header><strong>📷 Customer Photo</strong><button type="button" aria-label="Close camera" onClick={onClose}>×</button></header>
      <div className="customer-camera-preview">
        <video ref={video} autoPlay playsInline muted style={{display:captured?"none":"block"}} />
        {captured&&<img src={previewUrl} alt="Captured customer photo" />}
        {loading&&<span role="status">Opening camera…</span>}
      </div>
      {error&&<p role="alert" className="customer-camera-error">{error}</p>}
      {devices.length>1&&<div className="customer-camera-devices">
        <label>Camera <select value={deviceId} onChange={event=>{setCaptured(null);setPreviewUrl("");setDeviceId(event.target.value);}}>
          <option value="">{facing==="environment"?"Rear camera":"Front camera"}</option>
          {devices.map((item,index)=><option key={item.deviceId} value={item.deviceId}>{item.label||`Camera ${index+1}`}</option>)}
        </select></label>
        <button type="button" onClick={()=>{setCaptured(null);setPreviewUrl("");setDeviceId("");setFacing(previous=>previous==="environment"?"user":"environment");}}>Switch front/rear</button>
      </div>}
      <footer>
        <button type="button" onClick={onClose}>Cancel</button>
        {captured?<><button type="button" onClick={()=>{setCaptured(null);setPreviewUrl("");}}>Retake</button><button type="button" disabled={busy} onClick={()=>void use()}>{busy?"Optimizing…":"Use Photo"}</button></>
          :<button type="button" disabled={loading||!!error||busy} onClick={()=>void capture()}>Capture</button>}
      </footer>
    </section>
  </div>;
}

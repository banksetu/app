import {useEffect,useState,type CSSProperties} from "react";
import {createPortal} from "react-dom";
import {DEFAULT_GLASS_SETTINGS,glassVariables,type GlassBackground,type GlassDesign,type GlassSettings,type GlassTone} from "./core/glassAppearance";
import {prepareGlassWallpaper} from "./core/glassBackgroundStore";
import "./GlassAppearancePanel.css";

const designs:{id:GlassDesign;label:string;description:string}[]=[
  {id:"classic",label:"Classic Glass",description:"Smooth frosted edges"},
  {id:"3d",label:"3D Glass",description:"Prismatic light and depth"},
  {id:"liquid",label:"Liquid Glass",description:"Fluid reflections and glow"}
];
const backgrounds:{id:GlassBackground;label:string}[]=[
  {id:"default",label:"Default"},{id:"office",label:"Office"},
  {id:"nature",label:"Nature"},{id:"dark",label:"Dark Blur"},{id:"custom",label:"Custom"}
];
const tones:{id:GlassTone;label:string}[]=[
  {id:"auto",label:"Auto"},{id:"white",label:"White Glass"},
  {id:"black",label:"Black Glass"},{id:"transparent",label:"Full Transparent"}
];
const sliders:{key:keyof GlassSettings;label:string;info:string}[]=[
  {key:"transparency",label:"Transparency",info:"How much background is visible"},
  {key:"blur",label:"Background Blur",info:"Frosting behind glass panels"},
  {key:"intensity",label:"Glass Intensity",info:"Edge highlights and reflections"},
  {key:"glow",label:"Border Glow",info:"Soft glow around interactive cards"},
  {key:"shadow",label:"Shadow Depth",info:"3D floating depth"},
  {key:"animationSpeed",label:"Animation Speed",info:"How fast items respond"},
  {key:"motionDelay",label:"Motion Delay",info:"Slight stagger when sections appear"}
];
export default function GlassAppearancePanel({
  initial,existingCustomUrl,onSave,onPreview,onClose
}:{
  initial:GlassSettings;existingCustomUrl?:string;
  onSave:(settings:GlassSettings,wallpaper?:Blob,remember?:boolean)=>Promise<void>;
  onPreview:(settings:GlassSettings)=>void;
  onClose:(saved?:boolean)=>void;
}){
  const [draft,setDraft]=useState<GlassSettings>({...initial});
  // Sliders and design/background selectors update the actual glass workspace live.
  // Parent restores the opening snapshot if the dialog closes without saving.
  useEffect(()=>{onPreview(draft);},[draft,onPreview]);
  const [previewUrl,setPreviewUrl]=useState("");
  const [uploaded,setUploaded]=useState<Blob|undefined>(undefined);
  const [remember,setRemember]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);},[previewUrl]);
  useEffect(()=>{
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!saving)onClose();};
    window.addEventListener("keydown",closeOnEscape);
    return()=>window.removeEventListener("keydown",closeOnEscape);
  },[saving,onClose]);
  const set=(update:Partial<GlassSettings>)=>setDraft(current=>({...current,...update}));
  const upload=async(file?:File)=>{
    if(!file)return;
    try{
      setError("");
      const prepared=await prepareGlassWallpaper(file);
      const url=URL.createObjectURL(prepared.blob);
      setPreviewUrl(url);setUploaded(prepared.blob);
      set({background:"custom",imageLuminance:prepared.luminance});
    }catch(cause){setError(cause instanceof Error?cause.message:"Background image not supported.");}
  };
  const save=async()=>{
    if(draft.background==="custom"&&!uploaded&&!existingCustomUrl){
      setError("Upload a background image before saving Custom.");return;
    }
    try{setSaving(true);setError("");await onSave(draft,uploaded,remember);onClose(true);}
    catch(cause){setError(cause instanceof Error?cause.message:"The appearance setting could not be saved.");}
    finally{setSaving(false);}
  };
  return createPortal(<div className="glass-appearance-overlay" role="presentation"
    onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)onClose();}}>
    <section className="glass-appearance-panel" role="dialog" aria-modal="true" aria-labelledby="glass-appearance-heading"
      data-design={draft.design} style={glassVariables(draft,previewUrl||existingCustomUrl) as CSSProperties}>
      <header className="glass-appearance-header">
        <span className="glass-appearance-header-icon" aria-hidden="true">◉</span>
        <div><h2 id="glass-appearance-heading">Appearance &amp; Background <span>Glass Mode</span></h2>
          <p>Personalize BANK SETU on this device. Available only when Glass Mode is selected.</p></div>
        <button type="button" aria-label="Close appearance settings" onClick={()=>onClose()} disabled={saving}>×</button>
      </header>
      <div className="glass-appearance-scroll">
        <fieldset><legend>Glass Design</legend>
          <div className="glass-appearance-choices glass-design-choices">
            {designs.map(item=><button type="button" key={item.id} className={"glass-design-tile "+item.id}
              aria-pressed={draft.design===item.id} onClick={()=>set({design:item.id})}>
              <span className="glass-design-preview" aria-hidden="true"><i/></span>
              <strong>{item.label}</strong><small>{item.description}</small>
            </button>)}
          </div>
        </fieldset>
        <fieldset><legend>Glass Surface</legend>
          <div className="glass-tone-choices">{tones.map(item=><button type="button" key={item.id}
            aria-pressed={draft.tone===item.id} onClick={()=>set({tone:item.id})}>{item.label}</button>)}</div>
          <small>Auto adjusts text contrast for your chosen wallpaper. Full Transparent keeps text and controls readable.</small>
        </fieldset>
        <fieldset><legend>Background</legend>
          <div className="glass-appearance-choices glass-background-choices">
            {backgrounds.map(item=><label key={item.id} className={"glass-background-tile "+item.id} data-selected={draft.background===item.id}>
              {item.id==="custom"?<>
                <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload custom glass wallpaper"
                  onChange={e=>void upload(e.currentTarget.files?.[0])}/>
                <span aria-hidden="true">＋</span>
              </>:<button type="button" aria-pressed={draft.background===item.id}
                onClick={()=>set({background:item.id})} aria-label={item.label+" background"}></button>}
              <strong>{item.label}</strong>
            </label>)}
          </div>
        </fieldset>
        <fieldset><legend>Glass &amp; Animation Controls</legend>
          <p className="glass-live-note" role="status">Live preview: move any slider to update the workspace immediately. Save to keep it on this device.</p>
          <div className="glass-sliders">{sliders.map(item=><label key={item.key} className="glass-slider-line">
            <span><strong>{item.label}</strong><small>{item.info}</small></span>
            <input id={"glass-setting-"+item.key} type="range" min="0" max="100" value={draft[item.key] as number}
              aria-label={item.label} onChange={e=>set({[item.key]:Number(e.target.value)})}/>
            <output htmlFor={"glass-setting-"+item.key}>{draft[item.key]}%</output>
          </label>)}</div>
          <div className="glass-motion-live-preview" aria-label="Live animation and stagger preview">
            <span>Motion Delay preview · changes replay immediately</span>
            <div key={draft.animationSpeed+":"+draft.motionDelay} className="glass-motion-preview-dots" aria-hidden="true">
              <i/><i/><i/><i/>
            </div>
          </div>
        </fieldset>
        {error&&<p className="glass-appearance-error" role="alert">{error}</p>}
      </div>
      <footer className="glass-appearance-actions">
        <label className="glass-remember"><input type="checkbox" checked={remember}
          onChange={e=>setRemember(e.target.checked)}/>Remember this setting on this device</label>
        <button type="button" onClick={()=>{setDraft({...DEFAULT_GLASS_SETTINGS});setError("");}} disabled={saving}>Reset</button>
        <button className="glass-save" type="button" onClick={()=>void save()} disabled={saving}>
          {saving?"Saving…":"Save Current Setting"}
        </button>
      </footer>
    </section>
  </div>,document.body);
}

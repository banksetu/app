export type GlassDesign="classic"|"3d"|"liquid";
export type GlassTone="auto"|"white"|"black"|"transparent";
export type GlassBackground="default"|"office"|"nature"|"dark"|"custom";
export type GlassSettings={
  design:GlassDesign;tone:GlassTone;background:GlassBackground;
  transparency:number;blur:number;intensity:number;glow:number;
  shadow:number;animationSpeed:number;motionDelay:number;imageLuminance:number;
};
export const DEFAULT_GLASS_SETTINGS:GlassSettings={
  design:"liquid",tone:"auto",background:"default",transparency:70,blur:40,
  intensity:70,glow:43,shadow:52,animationSpeed:55,motionDelay:55,imageLuminance:0.4
};
export function glassScope(uid:string,tenantId:string){
  return uid&&tenantId?encodeURIComponent(uid)+":"+encodeURIComponent(tenantId):"";
}
export function glassStorageKey(uid:string,tenantId:string){
  return "bankSetuGlass:"+glassScope(uid,tenantId);
}
const designs=["classic","3d","liquid"],tones=["auto","white","black","transparent"],backgrounds=["default","office","nature","dark","custom"];
const number=(value:unknown,fallback:number)=>typeof value==="number"&&Number.isFinite(value)?Math.max(0,Math.min(100,value)):fallback;
export function sanitizeGlassSettings(input:unknown):GlassSettings{
  const obj=input&&typeof input==="object"?input as Partial<GlassSettings>:{};
  const fallback=DEFAULT_GLASS_SETTINGS;
  return {
    design:designs.includes(String(obj.design))?obj.design as GlassDesign:fallback.design,
    tone:tones.includes(String(obj.tone))?obj.tone as GlassTone:fallback.tone,
    background:backgrounds.includes(String(obj.background))?obj.background as GlassBackground:fallback.background,
    transparency:number(obj.transparency,fallback.transparency),
    blur:number(obj.blur,fallback.blur),
    intensity:number(obj.intensity,fallback.intensity),
    glow:number(obj.glow,fallback.glow),
    shadow:number(obj.shadow,fallback.shadow),
    animationSpeed:number(obj.animationSpeed,fallback.animationSpeed),
    motionDelay:number(obj.motionDelay,fallback.motionDelay),
    imageLuminance:typeof obj.imageLuminance==="number"&&Number.isFinite(obj.imageLuminance)
      ?Math.max(0,Math.min(1,obj.imageLuminance)):fallback.imageLuminance
  };
}
export function storedGlassSettings(storage:Pick<Storage,"getItem">,uid:string,tenantId:string):GlassSettings{
  if(!uid||!tenantId)return {...DEFAULT_GLASS_SETTINGS};
  try{const raw=storage.getItem(glassStorageKey(uid,tenantId));return raw?sanitizeGlassSettings(JSON.parse(raw)):{...DEFAULT_GLASS_SETTINGS};}
  catch{return {...DEFAULT_GLASS_SETTINGS};}
}
export function saveGlassSettings(storage:Pick<Storage,"setItem">,uid:string,tenantId:string,settings:GlassSettings){
  if(!uid||!tenantId)throw new Error("No active user workspace for saving appearance.");
  storage.setItem(glassStorageKey(uid,tenantId),JSON.stringify(sanitizeGlassSettings(settings)));
}
export function glassDarkSurface(s:GlassSettings):boolean{
  if(s.tone==="white")return false;
  if(s.tone==="black")return true;
  // Transparent surfaces still choose readable light/dark text from the wallpaper.
  if(s.background==="default"||s.background==="nature")return false;
  if(s.background==="office"||s.background==="dark")return true;
  return s.imageLuminance<0.55;
}
export function glassVariables(settings:GlassSettings,customBackgroundUrl?:string):Record<string,string>{
  const s=sanitizeGlassSettings(settings);
  const dark=glassDarkSurface(s),opacity=s.tone==="transparent"?Math.max(.035,(100-s.transparency)/100*.42):Math.max(.12,(100-s.transparency)/100*.74);
  const fill=dark?"rgba(17,24,38,"+Math.min(.84,opacity+.16).toFixed(3)+")":"rgba(255,255,255,"+Math.min(.9,opacity+.15).toFixed(3)+")";
  const strongAlpha=Math.min(.9,opacity+(dark?.28:.36)).toFixed(3);
  const edgeAlpha=(.17+s.intensity*.0046).toFixed(3);
  const custom=customBackgroundUrl&&s.background==="custom"?'url("'+customBackgroundUrl.replace(/["\\]/g,"")+'")':null;
  const backgrounds:Record<Exclude<GlassBackground,"custom">,string>={
    default:"radial-gradient(ellipse at 75% 10%,#f2d9de 0%,transparent 55%),linear-gradient(135deg,#dfe9fb,#aabed9 50%,#d4b5c8)",
    office:"radial-gradient(circle at 73% 25%,#c79c71,transparent 43%),linear-gradient(135deg,#282e36,#68665e,#252c3b)",
    nature:"radial-gradient(circle at 75% 38%,#a5c67a,transparent 45%),linear-gradient(115deg,#244338,#779c6a,#d4cbaa)",
    dark:"radial-gradient(circle at 70% 27%,#4f4968,transparent 40%),linear-gradient(125deg,#0e1527,#2d394c,#101624)"
  };
  const background=custom||backgrounds[s.background==="custom"?"default":s.background];
  const blurPx=Math.round(4+s.blur*.32),transitionMs=Math.round(150+(100-s.animationSpeed)*2.8);
  return {
    "--glass-wallpaper":background,
    "--glass-wallpaper-blur":Math.round(s.blur*.28)+"px",
    "--glass-fill":fill,
    "--glass-fill-strong":dark?"rgba(16,24,38,"+strongAlpha+")":"rgba(255,255,255,"+strongAlpha+")",
    "--glass-text":dark?"#f8fbff":"#13233b",
    "--glass-muted":dark?"#d6e1ef":"#35465b",
    "--glass-line":dark?"rgba(255,255,255,"+edgeAlpha+")":"rgba(255,255,255,"+Math.min(.92,.36+s.intensity*.0054).toFixed(3)+")",
    "--glass-accent":dark?"#a6dfff":"#135b9f",
    "--glass-blur":blurPx+"px",
    "--glass-highlight":(0.05+s.intensity*.0022).toFixed(3),
    "--glass-glow":Math.round(s.glow*.22)+"px",
    "--glass-shadow":Math.round(9+s.shadow*.33)+"px",
    "--glass-motion":transitionMs+"ms",
    "--glass-entry-motion":Math.round(430+(100-s.animationSpeed)*2.4)+"ms",
    "--glass-stagger":Math.round(130+s.motionDelay*1.05)+"ms",
  };
}

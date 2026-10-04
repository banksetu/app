import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractBankCustomer } from "./bankPdf";
import { useEffect, useRef, useState } from "react";
import { BANK_TEMPLATE_FIELD_OPTIONS, renderBankSamplePages, type BankFieldPlacement } from "./bankFormatUtils";

export default function BankFormatLayoutEditor({
  mode = "print", onModeChange, sampleUrl, mimeType, initialMap, initialWidth, initialHeight, onSave, onClose,
}: {
  mode?: "print" | "extraction";
  onModeChange?: (mode: "print" | "extraction") => void;
  sampleUrl: string;
  mimeType: string;
  initialMap: BankFieldPlacement[];
  initialWidth: number;
  initialHeight: number;
  onSave: (mapping: BankFieldPlacement[], pageWidthMm: number, pageHeightMm: number) => Promise<void>;
  onClose: () => void;
}) {
  const [pages, setPages] = useState<Array<{ dataUrl: string; width: number; height: number }>>([]);
  const [selectedPage, setSelectedPage] = useState(1);
  const [fieldMap, setFieldMap] = useState<BankFieldPlacement[]>(initialMap);
  const [selectedField, setSelectedField] = useState<string>(BANK_TEMPLATE_FIELD_OPTIONS[0][0]);
  const [pageWidthMm, setPageWidthMm] = useState(initialWidth);
  const [pageHeightMm, setPageHeightMm] = useState(initialHeight);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [testValues, setTestValues] = useState<Record<string,string>>({});
  const [testPhoto, setTestPhoto] = useState("");
  const [testing, setTesting] = useState(false);
  const drawing = useRef<{x:number;y:number} | null>(null);
  const [draft, setDraft] = useState<{x:number;y:number;width:number;height:number} | null>(null);
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect=event.currentTarget.getBoundingClientRect();
    return {x:Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100)),y:Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100))};
  };
  const testExtraction = async (file:File) => {
    if(file.size>5*1024*1024){setError("Choose a PDF up to 5 MB.");return;}
    setTesting(true);setError("");setTestValues({});setTestPhoto("");
    const task=getDocument({data:new Uint8Array(await file.arrayBuffer())});
    try {
      const pdf=await task.promise;
      setTestValues(await extractBankCustomer(pdf,fieldMap,true));
      const photo=fieldMap.find(item=>item.field==="customerPhoto");
      if(photo && (photo.page||1)<=pdf.numPages){
        const page=await pdf.getPage(photo.page||1), viewport=page.getViewport({scale:1.5});
        const pageCanvas=document.createElement("canvas");pageCanvas.width=Math.ceil(viewport.width);pageCanvas.height=Math.ceil(viewport.height);
        const context=pageCanvas.getContext("2d");
        if(context){await page.render({canvas:pageCanvas,canvasContext:context,viewport}).promise;
          const crop=document.createElement("canvas");crop.width=Math.max(1,Math.round(photo.width/100*viewport.width));crop.height=Math.max(1,Math.round((photo.height||photo.width*.8)/100*viewport.height));
          crop.getContext("2d")?.drawImage(pageCanvas,photo.x/100*viewport.width,photo.y/100*viewport.height,crop.width,crop.height,0,0,crop.width,crop.height);setTestPhoto(crop.toDataURL("image/jpeg"));}
      }
    } catch(reason){setError(reason instanceof Error?reason.message:"PDF test failed.");}
    finally{await task.destroy();setTesting(false);}
  };

  useEffect(() => {
    let active = true;
    void renderBankSamplePages(sampleUrl, mimeType).then((rendered) => {
      if (!active) return;
      setPages(rendered);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not render the sample."));
    return () => { active = false; };
  }, [sampleUrl, mimeType]);

  const addPlacement = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!pages.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(99, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(99, ((event.clientY - rect.top) / rect.height) * 100));
    const exists = fieldMap.findIndex((item) => item.field === selectedField && (item.page || 1) === selectedPage);
    const next = { field: selectedField, page: selectedPage, x, y, width: 22, fontSize: 10, uppercase: false, align: "left" as const };
    setFieldMap((current) => exists < 0 ? [...current, next] : current.map((item, index) => index === exists ? { ...item, x, y } : item));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try { await onSave(fieldMap, pageWidthMm, pageHeightMm); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save this layout."); }
    finally { setSaving(false); }
  };

  const currentPage = pages[selectedPage - 1];
  const aspect = currentPage ? currentPage.width / currentPage.height : 1;
  const previewWidth = Math.min(900, Math.max(320, 600 * aspect));
  const previewHeight = previewWidth / aspect;

  return <div style={overlay} role="dialog" aria-modal="true" aria-label="Bank format field mapping">
    <section style={dialog}>
      <header style={header}><div><h2 style={{ margin: 0 }}>{mode === "extraction" ? "PDF से डेटा पढ़ने के sections चुनें" : "फॉर्म में print की जगह चुनें"}</h2><p style={help}>{mode === "extraction" ? "Field चुनें, फिर उसकी value के चारों ओर box खींचें। Label और पास के columns को box में न लें।" : "Field चुनकर उसकी print position पर क्लिक करें।"}</p></div><button type="button" style={quiet} onClick={onClose}>Close</button></header>
      {onModeChange && <div style={toolbar}><button type="button" style={quiet} disabled={mode==="extraction"} onClick={()=>{if(JSON.stringify(fieldMap)===JSON.stringify(initialMap)||window.confirm("Unsaved mapping changes will be lost. Switch mode?"))onModeChange("extraction");}}>1. डेटा कहाँ से पढ़ें</button><button type="button" style={quiet} disabled={mode==="print"} onClick={()=>{if(JSON.stringify(fieldMap)===JSON.stringify(initialMap)||window.confirm("Unsaved mapping changes will be lost. Switch mode?"))onModeChange("print");}}>2. कहाँ print करें</button><span>Switch करने से पहले Save करें।</span></div>}
      <div style={toolbar}>
        <label>Field to place <select value={selectedField} onChange={(event) => setSelectedField(event.target.value)}>{BANK_TEMPLATE_FIELD_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Sample page <select value={selectedPage} onChange={(event) => setSelectedPage(Number(event.target.value))}>{pages.map((_, index) => <option key={index} value={index + 1}>Page {index + 1}</option>)}</select></label>
        <label>Paper width (mm) <input type="number" min={50} max={500} value={pageWidthMm} onChange={(event) => setPageWidthMm(Number(event.target.value))} /></label>
        <label>Paper height (mm) <input type="number" min={50} max={500} value={pageHeightMm} onChange={(event) => setPageHeightMm(Number(event.target.value))} /></label>
      </div>
      {currentPage ? <div onClick={mode === "print" ? addPlacement : undefined} onPointerDown={event=>{
        if(mode!=="extraction")return;event.currentTarget.setPointerCapture(event.pointerId);drawing.current=point(event);setDraft({...drawing.current,width:0,height:0});
      }} onPointerMove={event=>{if(!drawing.current)return;const end=point(event),start=drawing.current;setDraft({x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)});}}
      onPointerUp={event=>{if(!drawing.current)return;const end=point(event),start=drawing.current;drawing.current=null;setDraft(null);
        const box={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)};
        if(box.width<1||box.height<.2)return;
        const next={field:selectedField,page:selectedPage,...box,fontSize:10,uppercase:false,align:"left" as const};
        setFieldMap(current=>[...current.filter(item=>!(item.field===selectedField&&(item.page||1)===selectedPage)),next]);
      }} onPointerCancel={()=>{drawing.current=null;setDraft(null);}} style={{ ...canvas, touchAction:mode==="extraction"?"none":"auto", width: previewWidth, height: previewHeight, backgroundImage: `url(${currentPage.dataUrl})` }}>
        {draft && <div style={{position:"absolute",left:`${draft.x}%`,top:`${draft.y}%`,width:`${draft.width}%`,height:`${draft.height}%`,border:"2px solid #008fff",background:"rgba(0,140,255,.16)",pointerEvents:"none"}} />}
        {fieldMap.map((item, index) => ({ item, index })).filter(({ item }) => (item.page || 1) === selectedPage).map(({ item, index }) => <button key={`${item.page || 1}-${item.field}`} type="button" draggable={mode==="print"} onDragEnd={(event) => {
          const rect = event.currentTarget.parentElement!.getBoundingClientRect();
          const x = Math.max(0, Math.min(99, ((event.clientX - rect.left) / rect.width) * 100));
          const y = Math.max(0, Math.min(99, ((event.clientY - rect.top) / rect.height) * 100));
          setFieldMap((current) => current.map((row, i) => i === index ? { ...row, x, y } : row));
        }} onClick={(event) => { event.stopPropagation(); setSelectedField(item.field); }} style={{ ...placed, left: `${item.x}%`, top: `${item.y}%`, width: `${item.width}%`, height:mode === "extraction" ? `${item.height || 2}%` : undefined, pointerEvents:mode === "extraction" ? "none" : "auto", fontSize: `${Math.max(10, item.fontSize)}px` }}>{BANK_TEMPLATE_FIELD_OPTIONS.find(([key]) => key === item.field)?.[1] || item.field}</button>)}
      </div> : <p style={help}>Preparing the sample preview…</p>}
      <div style={mapList}>{fieldMap.map((item, index) => <div key={`${item.page || 1}-${item.field}`} style={mapRow}>
        <strong>Page {item.page || 1}: {BANK_TEMPLATE_FIELD_OPTIONS.find(([key]) => key === item.field)?.[1] || item.field}</strong>
        <label>Width % <input type="number" min={1} max={100} value={item.width} onChange={(event) => setFieldMap((current) => current.map((row, i) => i === index ? { ...row, width: Number(event.target.value) } : row))} /></label>
        {(mode === "extraction" || item.field === "customerPhoto") && <label>Height % <input type="number" min={0.2} max={100-item.y} step={0.1} value={item.height || 2} onChange={event=>setFieldMap(current=>current.map((row,i)=>i===index?{...row,height:Number(event.target.value)}:row))} /></label>}
        <label>Font px <input type="number" min={5} max={48} value={item.fontSize} onChange={(event) => setFieldMap((current) => current.map((row, i) => i === index ? { ...row, fontSize: Number(event.target.value) } : row))} /></label>
        <label>Alignment <select value={item.align} onChange={(event) => setFieldMap((current) => current.map((row, i) => i === index ? { ...row, align: event.target.value as BankFieldPlacement["align"] } : row))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        <label><input type="checkbox" checked={item.uppercase} onChange={(event) => setFieldMap((current) => current.map((row, i) => i === index ? { ...row, uppercase: event.target.checked } : row))} /> Uppercase</label>
        <button type="button" style={quiet} onClick={() => setFieldMap((current) => current.filter((_, i) => i !== index))}>Remove</button>
      </div>)}</div>
      {mode === "extraction" && <section style={{marginTop:16,padding:12,background:"#eff9f6",borderRadius:10}}><strong>Test extraction — customer PDF चुनें (Drive पर upload नहीं होगा)</strong><input aria-label="Test extraction PDF" type="file" accept="application/pdf" disabled={testing} onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)void testExtraction(file);}} />{testing&&<p>Reading…</p>}<dl>{Object.entries(testValues).map(([field,value])=><div key={field}><dt>{field}</dt><dd>{value}</dd></div>)}</dl>{testPhoto&&<img src={testPhoto} alt="Extracted customer photo preview" style={{maxWidth:160,maxHeight:200}} />}<p style={help}>Text वाले PDF से extraction होता है। Scanned PDF में readable text न हो तो manual entry करें। Test values जाँचकर ही Save करें।</p></section>}
      {error && <p role="alert" style={{ color: "#a22" }}>{error}</p>}
      <footer style={footer}><span style={help}>Map each PDF page separately (up to 10 pages).</span><button type="button" style={saveButton} disabled={saving || testing} onClick={() => void save()}>{saving ? "Saving…" : mode === "extraction" ? "Save reading sections" : "Save print layout"}</button></footer>
    </section>
  </div>;
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 10000, padding: 20, background: "rgba(10,20,30,.72)", overflow: "auto" };
const dialog: React.CSSProperties = { maxWidth: 1020, margin: "20px auto", padding: 20, borderRadius: 16, background: "white", color: "#17202a", boxShadow: "0 20px 80px rgba(0,0,0,.3)" };
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "start" };
const toolbar: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, margin: "16px 0" };
const canvas: React.CSSProperties = { position: "relative", maxWidth: "100%", margin: "0 auto", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", border: "1px solid #ccd3dc", cursor: "crosshair", overflow: "hidden" };
const placed: React.CSSProperties = { position: "absolute", transform: "translate(-2px,-2px)", minHeight: 20, padding: "2px 4px", border: "1px solid #0b7665", background: "rgba(255,255,255,.82)", color: "#053f36", textAlign: "left", cursor: "move", whiteSpace: "nowrap", overflow: "hidden" };
const mapList: React.CSSProperties = { display: "grid", gap: 8, marginTop: 16 };
const mapRow: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: 10, border: "1px solid #e4e8ee", borderRadius: 8 };
const footer: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 18 };
const help: React.CSSProperties = { color: "#5c687a", fontSize: 13 };
const quiet: React.CSSProperties = { minHeight: 34, padding: "0 10px", border: "1px solid #c9d2df", borderRadius: 8, background: "white", color: "#17202a", cursor: "pointer" };
const saveButton: React.CSSProperties = { minHeight: 42, padding: "0 16px", border: 0, borderRadius: 9, background: "#176b54", color: "white", fontWeight: 700, cursor: "pointer" };

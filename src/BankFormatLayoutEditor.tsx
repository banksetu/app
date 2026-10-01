import { useEffect, useState } from "react";
import { BANK_TEMPLATE_FIELD_OPTIONS, renderBankSamplePages, type BankFieldPlacement } from "./bankFormatUtils";

export default function BankFormatLayoutEditor({
  sampleUrl, mimeType, initialMap, initialWidth, initialHeight, onSave, onClose,
}: {
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
      <header style={header}><div><h2 style={{ margin: 0 }}>Place fields on the bank sample</h2><p style={help}>Select a data field, then click where it should print. Drag placed labels to adjust them.</p></div><button type="button" style={quiet} onClick={onClose}>Close</button></header>
      <div style={toolbar}>
        <label>Field to place <select value={selectedField} onChange={(event) => setSelectedField(event.target.value)}>{BANK_TEMPLATE_FIELD_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Sample page <select value={selectedPage} onChange={(event) => setSelectedPage(Number(event.target.value))}>{pages.map((_, index) => <option key={index} value={index + 1}>Page {index + 1}</option>)}</select></label>
        <label>Paper width (mm) <input type="number" min={50} max={500} value={pageWidthMm} onChange={(event) => setPageWidthMm(Number(event.target.value))} /></label>
        <label>Paper height (mm) <input type="number" min={50} max={500} value={pageHeightMm} onChange={(event) => setPageHeightMm(Number(event.target.value))} /></label>
      </div>
      {currentPage ? <div onClick={addPlacement} style={{ ...canvas, width: previewWidth, height: previewHeight, backgroundImage: `url(${currentPage.dataUrl})` }}>
        {fieldMap.map((item, index) => ({ item, index })).filter(({ item }) => (item.page || 1) === selectedPage).map(({ item, index }) => <button key={`${item.page || 1}-${item.field}`} type="button" draggable onDragEnd={(event) => {
          const rect = event.currentTarget.parentElement!.getBoundingClientRect();
          const x = Math.max(0, Math.min(99, ((event.clientX - rect.left) / rect.width) * 100));
          const y = Math.max(0, Math.min(99, ((event.clientY - rect.top) / rect.height) * 100));
          setFieldMap((current) => current.map((row, i) => i === index ? { ...row, x, y } : row));
        }} onClick={(event) => { event.stopPropagation(); setSelectedField(item.field); }} style={{ ...placed, left: `${item.x}%`, top: `${item.y}%`, width: `${item.width}%`, fontSize: `${Math.max(10, item.fontSize)}px` }}>{BANK_TEMPLATE_FIELD_OPTIONS.find(([key]) => key === item.field)?.[1] || item.field}</button>)}
      </div> : <p style={help}>Preparing the sample preview…</p>}
      <div style={mapList}>{fieldMap.map((item, index) => <div key={`${item.page || 1}-${item.field}`} style={mapRow}>
        <strong>Page {item.page || 1}: {BANK_TEMPLATE_FIELD_OPTIONS.find(([key]) => key === item.field)?.[1] || item.field}</strong>
        <label>Width % <input type="number" min={1} max={100} value={item.width} onChange={(event) => setFieldMap((current) => current.map((row, i) => i === index ? { ...row, width: Number(event.target.value) } : row))} /></label>
        <label>Font px <input type="number" min={5} max={48} value={item.fontSize} onChange={(event) => setFieldMap((current) => current.map((row, i) => i === index ? { ...row, fontSize: Number(event.target.value) } : row))} /></label>
        <label>Alignment <select value={item.align} onChange={(event) => setFieldMap((current) => current.map((row, i) => i === index ? { ...row, align: event.target.value as BankFieldPlacement["align"] } : row))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        <label><input type="checkbox" checked={item.uppercase} onChange={(event) => setFieldMap((current) => current.map((row, i) => i === index ? { ...row, uppercase: event.target.checked } : row))} /> Uppercase</label>
        <button type="button" style={quiet} onClick={() => setFieldMap((current) => current.filter((_, i) => i !== index))}>Remove</button>
      </div>)}</div>
      {error && <p role="alert" style={{ color: "#a22" }}>{error}</p>}
      <footer style={footer}><span style={help}>Map each PDF page separately (up to 10 pages).</span><button type="button" style={saveButton} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save field layout"}</button></footer>
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

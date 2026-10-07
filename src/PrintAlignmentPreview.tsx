import { useEffect, useState } from "react";
import { auth } from "./firebase";

export type PrintOffset = { x: number; y: number };
const ZERO: PrintOffset = { x: 0, y: 0 };
const bounded = (number: number) => Number.isFinite(number) ? Math.max(-30, Math.min(30, Math.round(number * 2) / 2)) : 0;
const clean = (offset: PrintOffset): PrintOffset => ({ x: bounded(offset.x), y: bounded(offset.y) });
const mm = (number: number) => `${number > 0 ? "+" : ""}${number} mm`;
const bankId = (name: string) => /union bank/i.test(name) ? "union-bank" :
  /assam gramin|^agvb$|^agb$/i.test(name) ? "assam-gramin-bank" :
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");

function storageKey(bank: string) {
  const tenant = sessionStorage.getItem("bankSetuTenantId");
  const role = sessionStorage.getItem("bankSetuAccountRole");
  const scope = tenant || (["master_owner", "admin"].includes(role || "") && auth.currentUser?.uid ? `master:${auth.currentUser.uid}` : "");
  if (!scope) throw new Error("A verified workspace is required to save bank alignment.");
  return `banksetu:print-alignment:v1:${scope}:${bankId(bank)}`;
}

function savedOffset(bank: string): PrintOffset {
  try {
    const raw = localStorage.getItem(storageKey(bank));
    if (!raw) return ZERO;
    const parsed = JSON.parse(raw) as PrintOffset;
    return clean({ x: Number(parsed.x), y: Number(parsed.y) });
  } catch { return ZERO; }
}

function sourceDocument(selector: string): string {
  const source = document.querySelector<HTMLElement>(selector);
  if (!source) return "";
  const base = document.baseURI.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
    .map(node => node.outerHTML).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${base}">${styles}<style>
    html,body{margin:0!important;padding:0!important;width:210mm!important;height:170mm!important;background:transparent!important;overflow:visible!important}
    .union-document,.assam-quick-document,.passbook-shell{margin:0!important;box-shadow:none!important;border-radius:0!important}
    .union-document{width:210mm!important;height:170mm!important;overflow:visible!important}
    .union-lower,.union-fold{top:85mm!important}.union-lower{height:85mm!important}
    .assam-quick-document{width:210mm!important;height:170mm!important}
    .passbook-shell{width:210mm!important;height:170mm!important;overflow:visible!important}
    .passbook-cover-space{height:85mm!important}.passbook-print-area{top:85mm!important;height:85mm!important}
    .passbook-page{padding:0!important;margin:0!important;min-height:0!important}.preview-edit-button,.assam-quick-edit,.union-edit,.cover-note{display:none!important}
  </style></head><body><div class="passbook-page">${source.outerHTML}</div></body></html>`;
}

export default function PrintAlignmentPreview({ bankName, sourceSelector, onClose, onPrint }: {
  bankName: string;
  sourceSelector: string;
  onClose: () => void;
  onPrint: (offset: PrintOffset, test: boolean) => void | Promise<void>;
}) {
  const [offset, setOffset] = useState<PrintOffset>(() => savedOffset(bankName));
  const [saved, setSaved] = useState<PrintOffset>(() => savedOffset(bankName));
  const [step, setStep] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPreview(sourceDocument(sourceSelector)); }, [sourceSelector]);
  useEffect(() => { const previous=document.body.style.overflow; document.body.style.overflow="hidden"; return () => {document.body.style.overflow=previous;}; }, []);
  const move = (dx: number, dy: number) => setOffset(current => clean({x:current.x+dx*step,y:current.y+dy*step}));
  const print = async (test: boolean) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await onPrint(offset, test); if (!test) onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Print could not be started."); }
    finally { setBusy(false); }
  };
  return <div className="print-alignment-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="print-alignment-window" role="dialog" aria-modal="true" aria-label={`Print Alignment Preview for ${bankName}`}>
      <header><strong>▣ &nbsp;Bank Setu – Print Alignment Preview ({bankName})</strong><button type="button" aria-label="Close alignment preview" onClick={onClose}>×</button></header>
      <div className="print-alignment-columns">
        <div className="print-alignment-left">
          <div className="print-alignment-width">A4 Width (21 cm)</div>
          <div className="print-alignment-measured">
            <div className="print-alignment-measures">
              <span>Passbook<br/>Height<br/>(17 cm)</span><span>Printable<br/>Data Area<br/>(8.5 cm)</span>
            </div>
            <div className="print-alignment-paper">
              <div className="print-alignment-frame" style={{transform:`scale(${zoom})`}}>
                {preview ? <iframe title={`${bankName} actual passbook preview`} srcDoc={preview} sandbox="" style={{width:"210mm",height:"170mm",border:0,background:"transparent",transform:`translate(${offset.x}mm,${offset.y}mm)`,transformOrigin:"top left",pointerEvents:"none"}} /> :
                  <p role="alert">Passbook preview is unavailable.</p>}
              </div>
            </div>
          </div>
          <div className="print-alignment-zoom">
            <span>Page 1 of 1</span>
            <span><button type="button" onClick={() => setZoom(current => Math.max(.5,Math.round((current-.1)*10)/10))}>−</button> {Math.round(zoom*100)}% <button type="button" onClick={() => setZoom(current => Math.min(1.5,Math.round((current+.1)*10)/10))}>＋</button></span>
            <button type="button" onClick={() => setZoom(Math.min(1, (document.querySelector(".print-alignment-paper")?.clientWidth || 794) / 794))}>Fit to Page</button>
          </div>
        </div>
        <div className="print-alignment-settings">
          <h2>⚙ &nbsp; Print Alignment Settings</h2>
          <div className="print-alignment-panel">
            <h3>Move Layout (Entire Passbook Data)</h3>
            <div className="print-alignment-control-row">
              <div className="print-alignment-arrows">
                <button type="button" aria-label="Move up" onClick={() => move(0,-1)}>↑</button>
                <div><button type="button" aria-label="Move left" onClick={() => move(-1,0)}>←</button><output>{mm(offset.x)} / {mm(offset.y)}</output><button type="button" aria-label="Move right" onClick={() => move(1,0)}>→</button></div>
                <button type="button" aria-label="Move down" onClick={() => move(0,1)}>↓</button>
              </div>
              <fieldset><legend>Step Size</legend>{[.5,1,2,5].map(amount => <label key={amount}><input type="radio" name="print-alignment-step" checked={step===amount} onChange={() => setStep(amount)} /> {amount} mm</label>)}</fieldset>
            </div>
            <div className="print-alignment-inputs">
              <label>Left / Right Shift <span><input type="number" min="-30" max="30" step=".5" value={offset.x} onChange={event => setOffset(current => clean({...current,x:Number(event.target.value)}))} /> mm</span></label>
              <label>Up / Down Shift <span><input type="number" min="-30" max="30" step=".5" value={offset.y} onChange={event => setOffset(current => clean({...current,y:Number(event.target.value)}))} /> mm</span></label>
            </div>
            <div className="print-alignment-actions">
              <button type="button" className="reset" onClick={() => setOffset(ZERO)}>↶ &nbsp;Reset<br/><small>(to default)</small></button>
              <button type="button" className="save" onClick={() => {try {localStorage.setItem(storageKey(bankName),JSON.stringify(offset));setSaved(offset);setError("");} catch (cause) {setError(cause instanceof Error?cause.message:"Could not save alignment.");}}}>▣ &nbsp;Save for this Bank<br/><small>({bankName})</small></button>
            </div>
            <div className="print-alignment-saved"><strong>Current Saved Setting ({bankName})</strong><div><span>Left / Right: &nbsp; <b>{mm(saved.x)}</b><br/>Up / Down: &nbsp; <b>{mm(saved.y)}</b></span><button type="button" onClick={() => setOffset(saved)}>Use Saved</button></div></div>
            <p className="print-alignment-tip">ⓘ &nbsp;This adjustment moves the entire passbook layout. It does not change text, mapping or data. It only shifts the print position.</p>
            {error && <p role="alert" className="print-alignment-error">{error}</p>}
            <div className="print-alignment-final"><button type="button" disabled={busy} onClick={() => void print(true)}>🖨 &nbsp;Test Print<br/><small>(Optional)</small></button><button type="button" disabled={busy} onClick={() => void print(false)}>🖨 &nbsp;Final Print<br/><small>(Use this layout)</small></button></div>
          </div>
        </div>
      </div>
    </section>
    <style>{`
      .print-alignment-overlay{position:fixed;inset:0;z-index:5000;background:#2229;display:grid;place-items:center;padding:12px;overflow-y:auto;overscroll-behavior:contain;color:#272b32;font-family:Arial,sans-serif}
      .print-alignment-window{width:min(1536px,98vw);max-height:96dvh;background:#f6f5f5;border-radius:13px;box-shadow:0 24px 70px #0007;overflow:auto}
      .print-alignment-window>header{background:linear-gradient(105deg,#c50f43,#df204a);color:white;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:clamp(18px,2vw,29px)}
      .print-alignment-window>header button{border:0;background:none;color:white;font-size:36px;line-height:1;cursor:pointer}
      .print-alignment-columns{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(360px,1fr);gap:16px;padding:14px}
      .print-alignment-left{min-width:0;display:flex;flex-direction:column;align-items:center}
      .print-alignment-width{color:#94032f;font-size:20px;font-weight:800;border:1px solid #e399ad;border-radius:7px;background:#fff3f6;padding:7px 18px;margin:0 0 12px}
      .print-alignment-measured{display:flex;width:100%;min-height:0;align-items:stretch;gap:8px}
      .print-alignment-measures{display:flex;flex-direction:column;width:85px;flex:none;color:#95052e;font-weight:800;text-align:center;font-size:15px}
      .print-alignment-measures span{flex:1;border-left:3px solid #b40d43;display:grid;place-items:center;background:#fff2f4;border-radius:6px;margin:3px 0}
      .print-alignment-paper{flex:1;min-width:0;background:#aaa;padding:8px;border-radius:7px;overflow:auto;max-height:min(72dvh,740px);overscroll-behavior:contain;touch-action:pan-x pan-y}
      .print-alignment-frame{width:210mm;height:170mm;transform:scale(var(--alignment-zoom,1));transform-origin:top left;background:white;outline:2px dashed #c2144d;outline-offset:-12px;overflow:hidden;box-shadow:0 2px 10px #3338}
      .print-alignment-zoom{display:flex;justify-content:space-around;gap:10px;width:100%;background:#fafafa;padding:12px;border-radius:10px}
      .print-alignment-zoom button{background:#fff;border:1px solid #ccc;border-radius:6px;padding:6px 10px;cursor:pointer}
      .print-alignment-settings{background:#fff0f4;border:1px solid #eed4df;border-radius:14px;padding:14px;min-width:0}
      .print-alignment-settings h2{color:#92002d;font-size:23px;margin:6px 4px 16px}
      .print-alignment-panel{background:#fff8fa;border:1px solid #efdbe2;border-radius:13px;padding:18px}
      .print-alignment-panel h3{color:#92002d;font-size:17px;margin:0 0 12px}
      .print-alignment-control-row{display:flex;gap:12px;align-items:stretch}
      .print-alignment-arrows{flex:1;display:flex;flex-direction:column;align-items:center;gap:7px}
      .print-alignment-arrows>div{display:flex;align-items:center;justify-content:center;gap:7px;width:100%}
      .print-alignment-arrows button{width:55px;height:55px;font-size:34px}
      .print-alignment-arrows output{background:white;border:1px solid #bbb;border-radius:7px;text-align:center;padding:15px 3px;min-width:120px;font-size:13px}
      .print-alignment-control-row fieldset{border:1px solid #f0d4df;border-radius:7px;display:flex;flex-direction:column;gap:10px;min-width:115px;font-size:16px}
      .print-alignment-control-row legend{color:#93012d;font-weight:800}
      .print-alignment-inputs,.print-alignment-actions,.print-alignment-final{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
      .print-alignment-inputs label{font-weight:700}.print-alignment-inputs span{display:flex;align-items:center;background:#fff;border:1px solid #ccc;border-radius:6px;margin-top:7px;padding-right:10px}
      .print-alignment-inputs input{width:100%;min-width:0;border:0;padding:12px;font-size:16px}
      .print-alignment-actions button,.print-alignment-final button{border:0;border-radius:7px;color:white;font-size:17px;font-weight:800;min-height:70px;cursor:pointer}
      .print-alignment-actions .reset{background:#da2865}.print-alignment-actions .save{background:#176ac1}
      .print-alignment-saved{background:#fff4f8;border:1px solid #f2ccd9;border-radius:8px;margin-top:16px;padding:12px;color:#85062d}
      .print-alignment-saved>div{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:8px;color:#222}
      .print-alignment-saved button{background:#c3507c;border:0;border-radius:7px;color:white;padding:13px;cursor:pointer}
      .print-alignment-tip{background:#e0f1ff;border-radius:8px;padding:14px;line-height:1.4}
      .print-alignment-final button:first-child{background:#f6f6f6;border:1px solid #bbb;color:#2c3b42}
      .print-alignment-final button:last-child{background:#d71848}.print-alignment-error{color:#a50031}
      @media(max-width:1000px){.print-alignment-columns{grid-template-columns:1fr}.print-alignment-window{max-height:98vh}.print-alignment-measured{overflow:auto}.print-alignment-settings{width:100%;box-sizing:border-box}.print-alignment-paper{max-height:56dvh}}
      @media(max-width:540px){.print-alignment-overlay{padding:0}.print-alignment-window{width:100%;max-height:100dvh;border-radius:0}.print-alignment-window>header{padding:12px;font-size:18px}.print-alignment-columns{padding:8px;gap:8px}.print-alignment-paper{max-height:48dvh}.print-alignment-control-row{flex-wrap:wrap}.print-alignment-measures{width:65px;font-size:12px}.print-alignment-panel{padding:10px}.print-alignment-arrows output{min-width:95px}.print-alignment-arrows button{width:45px;height:45px}.print-alignment-inputs{grid-template-columns:1fr}.print-alignment-actions button,.print-alignment-final button{font-size:14px}.print-alignment-measured{width:100%}}
      @media print{.print-alignment-overlay{display:none!important}}
    `}</style>
  </div>;
}

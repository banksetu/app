import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callBankSetuWorker } from "./workerApi";
import { confirmAction } from "./uiDialogs";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import "./CustomizeLayoutStudio.css";
import { estimatePassbookBounds, type ScanBounds } from "./layoutScanGeometry";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

type Mode = "passbook" | "accountOpening";
type Kind = "text" | "field" | "rectangle" | "line" | "photo" | "image" | "ellipse";
type Origin = "static" | "customer" | "bank" | "preprinted" | "dotmatrix";
type Align = "left" | "center" | "right";
type Unit = "mm" | "cm" | "in";

type LayoutPart = {
  id: string;
  kind: Kind;
  page?: number;
  imageData?: string;
  origin: Origin;
  label: string;
  fieldKey: string;
  value: string;
  defaultValue: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  rotation: number;
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: Align;
  color: string;
  background: string;
  borderColor: string;
  borderWidth: number;
  letterSpacing: number;
  opacity: number;
  quick: boolean;
  dotMatrix: boolean;
  preprinted: boolean;
};
type Draft = { version: 1; mode: Mode; bankName: string; pageCount?:number; widthMm: number; heightMm: number; foldMm: number; printStartMm: number; elements: LayoutPart[] };
const PX_PER_MM = 3.2;
const defaults = { font: "Arial", size: 11, bold: false, italic: false, underline: false, align: "left" as Align, color: "#132a40", background: "transparent", borderColor: "#74869a", borderWidth: 1, letterSpacing: 0, opacity: 1, rotation: 0, quick: true, dotMatrix: false, preprinted: false };
const fonts = ["Arial", "Georgia", "Times New Roman", "Courier New", "Verdana", "Tahoma", "Noto Sans", "Noto Serif"];
const randomId = () => "part-" + Math.random().toString(36).slice(2, 11);

function addPart(kind: Kind, origin: Origin, label: string, fieldKey = "", x = 12, y = 15): LayoutPart {
  return { ...defaults, id: randomId(), kind, page:1, origin, label, fieldKey, value: "", defaultValue: "", x, y, width: kind === "line" ? 120 : kind === "photo" ? 34 : 80, height: kind === "photo" ? 42 : kind === "rectangle" ? 20 : 8, z: 1, quick: true, dotMatrix: origin === "customer" || origin === "bank" || origin === "dotmatrix", preprinted: origin === "preprinted" };
}
const within = (number: number, min: number, max: number) => Math.min(max, Math.max(min, number));
const round = (number: number) => Math.round(number * 10) / 10;
const factor = (unit: Unit) => unit === "cm" ? 10 : unit === "in" ? 25.4 : 1;
const valueInUnit = (mm: number, unit: Unit) => round(mm / factor(unit));
const valueInMm = (number: string, unit: Unit) => Number(number) * factor(unit);
const normalizeKey = (text: string) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
function initialDraft(mode: Mode, bankName: string): Draft {
  const heading = addPart("text", "static", bankName || "BANK NAME", "", 15, 18);
  heading.width = 140; heading.size = 16; heading.bold = true; heading.align = "center";
  const name = addPart("field", "customer", "Account Holder Name", "customerName", 16, 110);
  name.defaultValue = "Customer Name"; name.width = 110;
  const account = addPart("field", "customer", "Account Number", "accountNumber", 16, 124);
  account.defaultValue = "Account Number"; account.width = 110;
  const fold = mode === "passbook" ? 88 : 0;
  return { version: 1, mode, bankName, pageCount:1, widthMm: mode === "passbook" ? 190 : 210, heightMm: mode === "passbook" ? 175 : 297, foldMm: fold, printStartMm: mode === "passbook" ? 100 : 0, elements: [heading, name, account] };
}
function validDraft(draft: unknown, mode: Mode, bankName: string): draft is Draft {
  if (!draft || typeof draft !== "object") return false;
  const item = draft as Partial<Draft>;
  return item.version === 1 && item.mode === mode && item.bankName === bankName &&
    typeof item.widthMm === "number" && item.widthMm >= 50 && item.widthMm <= 500 &&
    typeof item.heightMm === "number" && item.heightMm >= 50 && item.heightMm <= 500 &&
    Array.isArray(item.elements) && item.elements.length <= 500 &&
    item.elements.every(part => typeof part.id === "string" && typeof part.x === "number" && typeof part.y === "number" && typeof part.label === "string");
}
function draftKey(mode: Mode, bankName: string) {
  const tenantId = sessionStorage.getItem("bankSetuTenantId") || "master";
  const uid = sessionStorage.getItem("bankSetuWorkspaceOwner") || "local";
  return "bankSetuLayoutDraft:v1:" + tenantId + ":" + uid + ":" + mode + ":" + bankName;
}

type CatalogEntry = { id:string; bankName:string; mode:Mode; status:string; widthMm:number; heightMm:number; foldMm:number; printStartMm:number; elements:LayoutPart[]; updatedAt?:string };
export default function CustomizeLayoutStudio({ mode, bankName, bankValues = {}, accountRole = "client_user" }: { mode: Mode; bankName: string; bankValues?: Record<string,string>; accountRole?:string }) {
  const storageKey = draftKey(mode, bankName);
  const [draft, setDraft] = useState<Draft>(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as unknown; if (validDraft(saved, mode, bankName)) return saved; } catch { /* Invalid local draft stays unused. */ }
    return initialDraft(mode, bankName);
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>("mm");
  const [selectedPage, setSelectedPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState<"quick" | "dotmatrix">("quick");
  const [notice, setNotice] = useState("Local draft only. Nothing here changes approved passbooks or PR2 printing.");
  const [busy, setBusy] = useState(false);
  const [scanSuggestion, setScanSuggestion] = useState<ScanBounds | null>(null);
  const [referencePages, setReferencePages] = useState<string[]>([]);
  const [referenceOpacity, setReferenceOpacity] = useState(0.4);
  const [referenceVisible, setReferenceVisible] = useState(false);
  const [splitSecondLine, setSplitSecondLine] = useState("");
  const [temporaryValues, setTemporaryValues] = useState<Record<string,string>>({});
  const [showLayers, setShowLayers] = useState(true);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [pendingReview, setPendingReview] = useState<CatalogEntry[]>([]);
  const [catalogChoice, setCatalogChoice] = useState<CatalogEntry | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(true);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [showProps, setShowProps] = useState(true);
  const undoRef = useRef<Draft[]>([]);
  const redoRef = useRef<Draft[]>([]);
  const dragRef = useRef<{ id: string; pageX: number; pageY: number; x: number; y: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const selected = draft.elements.find(part => part.id === selectedId) || null;
  const canReview = accountRole === "master_owner" || accountRole === "admin";
  const canSubmit = accountRole === "client_admin";
  const ordered = useMemo(() => [...draft.elements.filter(part => (part.page||1)===selectedPage)].sort((a, b) => a.z - b.z), [draft.elements,selectedPage]);

  const refreshCatalog = useCallback(async (review = false) => {
    if (!bankName.trim() && !review) return;
    setCatalogBusy(true);
    try {
      const response = await callBankSetuWorker<{templates:CatalogEntry[]}>("/list-layout-templates",{bankName,pending:review});
      const entries = (response.templates || []).filter(item=>item.mode === mode || review);
      if (review) setPendingReview(entries); else setCatalog(entries);
    } catch (error) {
      setNotice("Shared layout list unavailable: "+(error instanceof Error?error.message:"Connection required")+". Local editing remains available.");
    } finally { setCatalogBusy(false); }
  },[bankName,mode]);
  useEffect(()=>{void refreshCatalog();},[refreshCatalog]);
  const submitForReview = async () => {
    if (!canSubmit || busy || !bankName.trim()) return;
    if (!await confirmAction("Submit a sanitized draft (no customer values/photos) to Master Admin for manual review?")) return;
    setBusy(true);
    try {
      const response=await callBankSetuWorker<{success:boolean;id:string}>("/submit-layout-template",{template:draft});
      setNotice("Generic layout submitted for Master Admin review: "+response.id+". Nothing was published or activated.");
    } catch(error) {
      setNotice("Submission failed: "+(error instanceof Error?error.message:"Review the template's coordinates and labels."));
    } finally { setBusy(false); }
  };
  const useCatalogTemplate = async (entry:CatalogEntry) => {
    if (!await confirmAction("Use this approved generic layout as a new local draft? Your current unsaved layout will be replaced. Customer data is never copied.")) return;
    const restored:Draft={version:1,bankName,mode,widthMm:entry.widthMm,heightMm:entry.heightMm,foldMm:entry.foldMm,printStartMm:entry.printStartMm,elements:entry.elements.map(part=>({...part,id:randomId(),value:"",defaultValue:""}))};
    if (!validDraft(restored,mode,bankName)){setNotice("Catalog template is not compatible with this bank or editor version.");return;}
    setDraft(restored);setSelectedId(null);setCatalogChoice(null);setCatalogOpen(false);setDirty(true);setTemporaryValues({});undoRef.current=[];redoRef.current=[];
    setNotice("Approved generic layout copied into your local DRAFT. Verify physical size and printing; it has not been activated for customers.");
  };
  const reviewCatalog = async (entry:CatalogEntry, action:"approve"|"reject") => {
    if (!canReview || !await confirmAction(action === "approve" ? "Approve this generic layout for use by other tenants? Check that all text is generic and contains no private customer information." : "Reject this unapproved shared template?")) return;
    setCatalogBusy(true);
    try {
      await callBankSetuWorker("/review-layout-template",{id:entry.id,action});
      setNotice("Template review decision saved. "+(action==="approve"?"Approved layouts will be discoverable by bank.":"Submission rejected."));
      await refreshCatalog(true);
    } catch(error){setNotice("Review failed: "+(error instanceof Error?error.message:"Unknown error"));}
    finally {setCatalogBusy(false);}
  };
  const modify = useCallback((apply: (current: Draft) => Draft) => {
    setDraft(current => {
      const next = apply(current);
      if (next === current) return current;
      undoRef.current = [...undoRef.current.slice(-39), current];
      redoRef.current = [];
      return next;
    });
    setDirty(true);
  }, []);
  const edit = (change: Partial<LayoutPart>) => {
    if (!selectedId) return;
    modify(current => ({ ...current, elements: current.elements.map(part => part.id === selectedId ? { ...part, ...change } : part) }));
  };
  const setMeasure = (key: "widthMm" | "heightMm" | "foldMm" | "printStartMm", value: string) => {
    const mm = valueInMm(value, unit);
    if (!Number.isFinite(mm)) return;
    modify(current => ({ ...current, [key]: round(within(mm, key === "widthMm" || key === "heightMm" ? 50 : 0, 500)) }));
  };
  const append = (kind: Kind, origin: Origin, label: string, fieldKey = "") => {
    const part = addPart(kind, origin, label, fieldKey, 14, draft.foldMm ? draft.foldMm + 12 : 25);
    part.z = Math.max(0, ...draft.elements.map(p => p.z)) + 1;
    part.page = selectedPage;
    modify(current => ({ ...current, elements: [...current.elements, part] }));
    setSelectedId(part.id);
  };
  const moveZ = (increment: number) => {
    if (!selected) return;
    edit({ z: within(selected.z + increment, -1000, 1000) });
  };
  const undo = () => {
    const last = undoRef.current.pop();
    if (!last) return;
    redoRef.current.push(draft);
    setDraft(last);
    setDirty(true);
  };
  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(draft);
    setDraft(next);
    setDirty(true);
  };
  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setDirty(false);
      setNotice("Draft saved on this device only. It is not published or connected to PR2.");
    } catch {
      setNotice("Local storage is unavailable or full. Export JSON to keep this draft.");
    }
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = (normalizeKey(bankName) || "bank") + "-" + mode + "-draft.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
    setNotice("Template JSON exported. Draft only; not a verified print format.");
  };
  const proofPdf = async () => {
    setBusy(true);
    try {
      const { exportLayoutProofPdf } = await import("./layoutProofPdf");
      const blob = await exportLayoutProofPdf({ ...draft, elements: draft.elements.map(part => {
        if (temporaryValues[part.id] !== undefined) return {...part, value:temporaryValues[part.id]};
        if (part.origin === "bank" && typeof bankValues[part.fieldKey] === "string") return {...part,value:bankValues[part.fieldKey]};
        return part;
      }) }, preview);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = (normalizeKey(bankName) || "bank") + "-" + preview + "-proof-UNAPPROVED.pdf";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 500);
      setNotice("Unapproved layout proof exported for measurement only. Never use this proof for customer passbook printing until physically verified.");
    } catch (error) {
      setNotice("Could not export proof: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally { setBusy(false); }
  };
  const importGraphic = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setNotice("Choose a PNG, JPEG or WebP logo/graphic under 3 MB."); return;
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error("Image not readable"));img.src=objectUrl;});
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 512 / img.width, 512 / img.height);
      canvas.width = Math.max(1,Math.round(img.width*scale));
      canvas.height = Math.max(1,Math.round(img.height*scale));
      canvas.getContext("2d")?.drawImage(img,0,0,canvas.width,canvas.height);
      const imageData = canvas.toDataURL("image/webp",.82);
      if (imageData.length>1200000) throw Error("Graphic too complex. Resize it before importing.");
      const part = addPart("image","static",file.name.slice(0,100));
      part.imageData=imageData; part.page=selectedPage; part.width=45;
      part.height=round(45 * img.height / img.width);part.dotMatrix=false;
      part.z=Math.max(0,...draft.elements.map(p=>p.z))+1;
      modify(current=>({...current,elements:[...current.elements,part]}));
      setSelectedId(part.id);
      setNotice("Independent editable graphic imported. Logo artwork can be moved, scaled, layered or removed; full scanned pages are not used as backgrounds.");
    } catch(error) { setNotice("Graphic import failed: "+(error instanceof Error?error.message:"Unknown error")); }
    finally { URL.revokeObjectURL(objectUrl); }
  };
  const importPdf = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setNotice("Please choose a PDF sample."); return; }
    if (file.size > 12 * 1024 * 1024) { setNotice("Please choose a PDF up to 12 MB."); return; }
    setBusy(true);
    setReferencePages([]);
    setNotice("Reading the PDF's embedded text and coordinates...");
    try {
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      GlobalWorkerOptions.workerSrc = pdfWorker;
      const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      try {
        const pdf = await task.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const width = round(viewport.width / 72 * 25.4);
        const height = round(viewport.height / 72 * 25.4);
        const pageCount = Math.min(10, pdf.numPages);
        const elements: LayoutPart[] = [];
        const references:string[] = [];
        for (let index = 1; index <= pageCount; index++) {
          const pdfPage = index === 1 ? page : await pdf.getPage(index);
          const view = pdfPage.getViewport({ scale:1 });
          const textLayer = await pdfPage.getTextContent();
          try {
            // Reference images are display-only, NEVER persisted or printed.
            const previewViewport=pdfPage.getViewport({scale:Math.min(.9,480/Math.max(view.width,view.height))});
            const previewCanvas=document.createElement("canvas");
            previewCanvas.width=Math.ceil(previewViewport.width);
            previewCanvas.height=Math.ceil(previewViewport.height);
            const context=previewCanvas.getContext("2d");
            if (context) {
              await pdfPage.render({canvas:previewCanvas,canvasContext:context,viewport:previewViewport}).promise;
              references.push(previewCanvas.toDataURL("image/webp",.66));
              previewCanvas.width=0;previewCanvas.height=0;
            } else references.push("");
          } catch { references.push(""); }
          for (const item of textLayer.items) {
            if (!("str" in item) || !item.str.trim() || elements.length >= 300) continue;
            const part = addPart("text", "static", item.str.trim(), "", round(item.transform[4] / view.width * width), round((view.height - item.transform[5]) / view.height * height));
            part.page = index;
            part.width = round(Math.max(4, item.width / view.width * width));
            part.height = round(Math.max(3, item.height / view.height * height));
            part.size = within(Math.round(Math.abs(item.transform[0]) * 72 / 96) || 10, 5, 60);
            part.z = elements.length + 1;
            elements.push(part);
          }
        }
        setReferencePages(references);
        setReferenceVisible(true);
        // For an A4 scanner page, its paper dimensions are NOT the passbook dimensions.
        // Keep measured passbook size from the user's manual calibration until border analysis exists.
        const scannedA4 = (Math.abs(width - 210) < 5 && Math.abs(height - 297) < 5) || (Math.abs(width - 297) < 5 && Math.abs(height - 210) < 5);
        if (scannedA4 && mode === "passbook") {
          try {
            const scanView = page.getViewport({ scale: Math.min(1, 750 / Math.max(viewport.width, viewport.height)) });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(scanView.width);
            canvas.height = Math.ceil(scanView.height);
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (context) {
              await page.render({ canvas, canvasContext: context, viewport: scanView }).promise;
              const suggestion = estimatePassbookBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, width, height);
              setScanSuggestion(suggestion);
            }
          } catch { setScanSuggestion(null); }
        } else setScanSuggestion(null);
        let overlappingPairs = 0;
        for (let i = 0; i < elements.length; i++) for (let j = i + 1; j < elements.length; j++) {
          const a = elements[i], b = elements[j];
          if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.abs(a.y - b.y) < 2) overlappingPairs++;
        }
        modify(current => ({
          ...current,
          pageCount,
          widthMm: scannedA4 && mode === "passbook" ? current.widthMm : width,
          heightMm: scannedA4 && mode === "passbook" ? current.heightMm : height,
          elements: elements.length ? elements : current.elements,
        }));
        setSelectedPage(1);
        setSelectedId(elements[0]?.id || null);
        setNotice(elements.length ?
          "Imported " + elements.length + " editable PDF text elements across "+pageCount+" PDF pages. " + (overlappingPairs ? overlappingPairs + " possible overlapping text pairs; inspect and split layers manually. " : "") + "Graphics, OCR and actual passbook boundaries still require verification." :
          "No embedded PDF text found (possibly a scanned image). Use Add tools to reconstruct fields; automatic OCR is not yet active.");
        if (scannedA4 && mode === "passbook") setNotice("A4 scanner canvas detected. This is NOT the physical passbook size; enter/verify actual dimensions. " + (elements.length ? elements.length + " editable text elements imported." : "No embedded text; manual editing is available."));
      } finally { await task.destroy(); }
    } catch (error) {
      setNotice("PDF could not be read: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally { setBusy(false); }
  };

  const down = (event: ReactPointerEvent<HTMLDivElement>, part: LayoutPart) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(part.id);
    undoRef.current = [...undoRef.current.slice(-39), draft];
    redoRef.current = [];
    dragRef.current = { id: part.id, pageX: event.clientX, pageY: event.clientY, x: part.x, y: part.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const drag = dragRef.current;
    const dx = (event.clientX - drag.pageX) / (PX_PER_MM * zoom);
    const dy = (event.clientY - drag.pageY) / (PX_PER_MM * zoom);
    setDraft(current => ({ ...current, elements: current.elements.map(part => part.id === drag.id ? {
      ...part, x: round(within(drag.x + dx, 0, current.widthMm)), y: round(within(drag.y + dy, 0, current.heightMm))
    } : part) }));
    setDirty(true);
  };
  const dragEnd = () => { dragRef.current = null; };
  const toStyle = (part: LayoutPart): React.CSSProperties => ({
    position: "absolute", left: part.x * PX_PER_MM * zoom, top: part.y * PX_PER_MM * zoom,
    width: part.width * PX_PER_MM * zoom, height: part.height * PX_PER_MM * zoom,
    transform: "rotate(" + part.rotation + "deg)", zIndex: part.z + 1000,
    fontFamily: part.font, fontSize: part.size * zoom, fontWeight: part.bold ? 700 : 400,
    fontStyle: part.italic ? "italic" : "normal", textDecoration: part.underline ? "underline" : "none",
    textAlign: part.align, color: part.color, background: part.background, borderColor: part.borderColor,
    borderWidth: ["rectangle","photo","ellipse","image"].includes(part.kind) ? part.borderWidth * zoom : 0,
    borderStyle: "solid", letterSpacing: part.letterSpacing * zoom, opacity: part.opacity, borderRadius:part.kind==="ellipse"?"50%":undefined,
  });
  const partText = (part: LayoutPart) => {
    if (part.kind === "photo") return "PHOTO";
    if (part.kind === "rectangle" || part.kind === "line" || part.kind === "ellipse" || part.kind === "image") return "";
    if (temporaryValues[part.id] !== undefined && (part.origin === "customer" || part.origin === "bank" || part.origin === "dotmatrix")) return temporaryValues[part.id];
    return part.origin === "customer" || part.origin === "bank" || part.origin === "dotmatrix"
      ? (part.origin === "bank" && bankValues[part.fieldKey]) || part.value || part.defaultValue || "[" + (part.fieldKey || part.label) + "]" : part.label;
  };
  const selectionLabel = (part: LayoutPart) => part.label || part.fieldKey || part.kind;
  const field = (label: string, node: React.ReactNode) => <label className="ls-field"><span>{label}</span>{node}</label>;
  const number = (value: number, update: (next: number) => void, min = -1000, max = 1000, step = 1) => <input type="number" value={value} min={min} max={max} step={step} onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next)) update(within(next, min, max)); }} />;
  return <section className="layout-studio" aria-label={mode === "passbook" ? "Customize Passbook" : "Customize Account Opening Form"}>
    <header className="ls-header">
      <div><p className="ls-eyebrow">BANK SETU · TEMPLATE STUDIO · DRAFT</p><h2>{mode === "passbook" ? "Customize Passbook" : "Customize Account Opening Form"}</h2><p>Editable objects, precision coordinates and separate Quick / Dot Matrix visibility. Bank: <strong>{bankName || "Not selected"}</strong></p></div>
      <div className="ls-actions"><button type="button" onClick={undo} disabled={!undoRef.current.length}>↶ Undo</button><button type="button" onClick={redo} disabled={!redoRef.current.length}>↷ Redo</button><button type="button" onClick={() => {setTemporaryValues({});setNotice("Temporary print edits cleared; saved layout and customer records were unchanged.");}}>Clear Temporary Edits</button><button type="button" onClick={exportJson}>Export JSON</button><button type="button" disabled={busy} onClick={() => {void proofPdf();}}>Export {preview === "quick" ? "Quick" : "Dot Matrix"} Proof PDF</button><button type="button" className="ls-primary" onClick={save}>Save Draft{dirty ? " *" : ""}</button></div>
    </header>
    <div className="ls-notice" role="status">{busy ? "Processing PDF… " : ""}{notice}</div>
    <div className="ls-catalog-panel">
      <div className="ls-catalog-heading"><strong>Existing Approved Bank Templates</strong><button type="button" onClick={()=>setCatalogOpen(value=>!value)} aria-expanded={catalogOpen}>{catalogOpen?"Hide":"Show"}</button><button type="button" disabled={catalogBusy} onClick={()=>{setCatalogOpen(true);void refreshCatalog();}}>Refresh</button></div>
      {catalogOpen && <>
        <p>Existing templates for {bankName || "the selected bank"} can be previewed and copied without recreating the layout. No other tenant's customer records are shared.</p>
        {catalog.length===0 ? <p>No verified shared template is available for this bank. Upload your own passbook PDF or design manually.</p> :
          <div className="ls-catalog-list">{catalog.filter(item=>item.mode===mode).map(item=><div key={item.id} className="ls-catalog-card">
            <span>{item.bankName} · {item.mode==="passbook"?"Passbook":"Account Opening"}</span>
            <small>{item.widthMm} × {item.heightMm} mm · {item.elements.length} editable elements</small>
            <button type="button" onClick={()=>setCatalogChoice(item)}>Preview</button>
          </div>)}</div>}
        {catalogChoice && <div className="ls-catalog-preview">
          <strong>Preview: {catalogChoice.bankName} · Generic template</strong>
          <div className="ls-catalog-mini-paper" style={{aspectRatio:catalogChoice.widthMm+"/"+catalogChoice.heightMm}}>{catalogChoice.elements.slice(0,35).map(part=><span key={part.id} style={{position:"absolute",left:(part.x/catalogChoice.widthMm*100)+"%",top:(part.y/catalogChoice.heightMm*100)+"%",fontSize:8,color:"#172334",maxWidth:(part.width/catalogChoice.widthMm*100)+"%",overflow:"hidden"}}>{part.kind==="text"||part.kind==="field"?part.origin==="customer"?"[Customer field]":part.origin==="bank"?"[Bank Information]":part.label:part.kind==="photo"?"□ PHOTO":part.kind==="line"?"────":""}</span>)}</div>
          <div className="ls-actions"><button type="button" onClick={()=>{void useCatalogTemplate(catalogChoice);}}>Use This Template</button><button type="button" onClick={()=>{setCatalogChoice(null);setCatalogOpen(false);}}>No, Upload My Own PDF</button></div>
        </div>}
      </>}
      <div className="ls-actions">
        {canSubmit && <button type="button" disabled={busy} onClick={()=>{void submitForReview();}}>Submit Generic Template for Master Review</button>}
        {canReview && <button type="button" disabled={catalogBusy} onClick={()=>{void refreshCatalog(true);}}>View Pending Template Approvals</button>}
      </div>
      {canReview && pendingReview.length>0 && <div className="ls-catalog-list">{pendingReview.map(item=><div key={item.id} className="ls-catalog-card">
        <span>{item.bankName} · {item.mode} · {item.elements.length} elements</span>
        <small>Pending Master Review — inspect all text, physical measurements and customer-data safety</small>
        <button type="button" onClick={()=>setCatalogChoice(item)}>Inspect</button>
        <button type="button" onClick={()=>{void reviewCatalog(item,"approve");}}>Approve</button>
        <button type="button" onClick={()=>{void reviewCatalog(item,"reject");}}>Reject</button>
      </div>)}</div>}
    </div>
    <div className="ls-ribbon" role="toolbar" aria-label="Add and edit layout elements">
      <label className="ls-file-action">Upload PDF<input type="file" accept=".pdf,application/pdf" disabled={busy} onChange={event => { void importPdf(event); }} /></label><label className="ls-file-action">＋ Logo / Graphic<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>{void importGraphic(event);}} /></label>
      <button type="button" onClick={() => append("text", "static", "New text")}>＋ Text</button>
      <button type="button" onClick={() => append("text", "preprinted", "Preprinted Label")}>＋ Label</button>
      <button type="button" onClick={() => append("field", "customer", "Customer Field", "customerName")}>＋ Customer</button>
      <button type="button" onClick={() => append("field", "bank", "Bank Information", "branchName")}>＋ Bank Field</button>
      <button type="button" onClick={() => append("text", "dotmatrix", "Dot Matrix Field", "custom")}>＋ Dot Matrix</button>
      <button type="button" onClick={() => append("photo", "static", "Photo Box")}>▣ Photo Box</button>
      <button type="button" onClick={() => append("rectangle", "static", "Box")}>▢ Rectangle</button>
      <button type="button" onClick={() => append("ellipse", "static", "Circle / Oval")}>◯ Ellipse</button>
      <button type="button" onClick={() => append("line", "static", "Line")}>─ Line</button>
      <button type="button" onClick={() => append("text", "static", "Branch Manager")}>＋ Manager</button>
      <button type="button" onClick={() => append("text", "static", "Instructions")}>＋ Instructions</button>
    </div>
    {selected && <div className="ls-format-ribbon" role="toolbar" aria-label="Office-style selected element formatting">
      <strong>Format:</strong>
      <select aria-label="Font family" value={selected.font} onChange={event => edit({font:event.target.value})}>{fonts.map(font=><option key={font} value={font}>{font}</option>)}</select>
      <button type="button" title="Decrease font size" onClick={() => edit({size:Math.max(5,selected.size-1)})}>A−</button>
      <input aria-label="Font size" type="number" min={5} max={120} value={selected.size} onChange={event => edit({size:within(Number(event.target.value)||5,5,120)})}/>
      <button type="button" title="Increase font size" onClick={() => edit({size:Math.min(120,selected.size+1)})}>A+</button>
      <button type="button" aria-pressed={selected.bold} onClick={() => edit({bold:!selected.bold})}><strong>B</strong></button>
      <button type="button" aria-pressed={selected.italic} onClick={() => edit({italic:!selected.italic})}><em>I</em></button>
      <button type="button" aria-pressed={selected.underline} onClick={() => edit({underline:!selected.underline})}><u>U</u></button>
      <button type="button" title="Align left" aria-pressed={selected.align==="left"} onClick={() => edit({align:"left"})}>≡</button>
      <button type="button" title="Center align" aria-pressed={selected.align==="center"} onClick={() => edit({align:"center"})}>☷</button>
      <button type="button" title="Align right" aria-pressed={selected.align==="right"} onClick={() => edit({align:"right"})}>≣</button>
      <label>Text color <input type="color" aria-label="Text color" value={selected.color} onChange={event => edit({color:event.target.value})}/></label>
    </div>}
    {scanSuggestion && <div className="ls-scan-proposal" role="status">
      <strong>Scanner estimate (not verified)</strong> — {scanSuggestion.widthMm} × {scanSuggestion.heightMm} mm · {scanSuggestion.confidence} confidence.
      <span>{scanSuggestion.reason}</span>
      <button type="button" onClick={() => { modify(current => ({ ...current, widthMm:scanSuggestion.widthMm, heightMm:scanSuggestion.heightMm })); setNotice("Scanner estimate applied to local draft; confirm against physical dimensions before approval."); }}>Apply estimated size</button>
      <button type="button" onClick={() => setScanSuggestion(null)}>Dismiss</button>
    </div>}
    <div className="ls-settings">
      <label>Page <select value={selectedPage} onChange={event=>{setSelectedPage(Number(event.target.value));setSelectedId(null);}}>{Array.from({length:Math.max(1,draft.pageCount||1)},(_,index)=><option key={index} value={index+1}>Page {index+1}</option>)}</select></label>
      <button type="button" onClick={()=>modify(current=>({...current,pageCount:Math.min(10,(current.pageCount||1)+1)}))} disabled={(draft.pageCount||1)>=10}>+ Page</button>
      <label>Units <select value={unit} onChange={event => setUnit(event.target.value as Unit)}><option value="mm">mm</option><option value="cm">cm</option><option value="in">inch</option></select></label>
      <label>Width {number(valueInUnit(draft.widthMm, unit), next => setMeasure("widthMm", String(next)), 0, 500, .1)}</label>
      <label>Height {number(valueInUnit(draft.heightMm, unit), next => setMeasure("heightMm", String(next)), 0, 500, .1)}</label>
      <label>Fold from top {number(valueInUnit(draft.foldMm, unit), next => setMeasure("foldMm", String(next)), 0, 500, .1)}</label>
      <label>Print start {number(valueInUnit(draft.printStartMm, unit), next => setMeasure("printStartMm", String(next)), 0, 500, .1)}</label>
      <label><input type="checkbox" checked={referenceVisible} onChange={event=>setReferenceVisible(event.target.checked)}/> Show Original Reference</label>
      <label>Reference opacity <input aria-label="Original reference opacity" type="range" min={0.1} max={0.9} step={0.1} value={referenceOpacity} onChange={event=>setReferenceOpacity(Number(event.target.value))}/></label>
      <label>Zoom <select value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={0.6}>60%</option><option value={0.8}>80%</option><option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label>
      <label>Preview <select value={preview} onChange={event => setPreview(event.target.value as "quick" | "dotmatrix")}><option value="quick">Quick (full artwork)</option><option value="dotmatrix">Dot Matrix (print only)</option></select></label>
    </div>
    <div className="ls-workspace">
      <aside className="ls-panel ls-layers">
        <button type="button" className="ls-panel-title" onClick={() => setShowLayers(!showLayers)} aria-expanded={showLayers}>Layers ({draft.elements.length}) {showLayers ? "▾" : "▸"}</button>
        {showLayers && <div className="ls-layer-list">{[...ordered].reverse().map(part => <button key={part.id} type="button" className={selectedId === part.id ? "ls-layer selected" : "ls-layer"} onClick={() => setSelectedId(part.id)}><span>{part.kind === "photo" ? "▣" : part.kind === "rectangle" ? "▢" : part.kind === "line" ? "─" : part.origin === "customer" || part.origin === "bank" ? "◇" : "T"}</span><span>{selectionLabel(part)}</span><small>{part.origin}</small></button>)}</div>}
      </aside>
      <div className="ls-canvas-wrap">
        <div className="ls-paper" role="application" tabIndex={0} aria-label="Editable passbook page. Select an element then use arrow keys for fine adjustment." style={{width:draft.widthMm * PX_PER_MM * zoom, height:draft.heightMm * PX_PER_MM * zoom}} onPointerMove={dragging} onPointerUp={dragEnd} onPointerCancel={dragEnd} onKeyDown={event => {
          if (!selected || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
          event.preventDefault();
          const step = event.shiftKey ? 1 : .1;
          edit({ x: round(within(selected.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), 0, draft.widthMm)), y: round(within(selected.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), 0, draft.heightMm)) });
        }}>
          {referenceVisible && referencePages[selectedPage-1] && <img aria-hidden="true" alt="" src={referencePages[selectedPage-1]} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"fill",opacity:referenceOpacity,pointerEvents:"none",zIndex:2}}/>}
          {draft.foldMm > 0 && <div className="ls-fold" style={{top:draft.foldMm * PX_PER_MM * zoom}}><span>FOLD</span></div>}
          {draft.printStartMm > 0 && <div className="ls-print-start" style={{top:draft.printStartMm * PX_PER_MM * zoom}}><span>PRINT START</span></div>}
          {ordered.map(part => {
            const visible = preview === "quick" ? part.quick : part.dotMatrix && !part.preprinted;
            if (!visible) return null;
            return <div key={part.id} onPointerDown={event => down(event, part)}
              className={"ls-object " + (selectedId === part.id ? "selected " : "") + (part.kind === "line" ? "ls-line " : "") + (part.kind === "photo" ? "ls-photo " : "")}
              style={toStyle(part)} title={part.label + " · " + part.origin}>{part.kind==="image" && part.imageData ? <img alt={part.label} draggable={false} src={part.imageData} style={{width:"100%",height:"100%",objectFit:"fill",pointerEvents:"none"}}/> : partText(part)}</div>;
          })}
        </div>
        <p className="ls-canvas-note">Drag objects to position · Arrow keys: 0.1 mm · Shift+Arrow: 1 mm · Fold markers are guides only</p>
      </div>
      <aside className="ls-panel ls-properties">
        <button type="button" className="ls-panel-title" onClick={() => setShowProps(!showProps)} aria-expanded={showProps}>Properties {showProps ? "▾" : "▸"}</button>
        {showProps && (selected ? <div className="ls-properties-body">
          {field("Element name / Label", <input value={selected.label} onChange={event => edit({ label: event.target.value })} />)}
          {field("Element type", <select value={selected.kind} onChange={event => edit({ kind: event.target.value as Kind })}><option value="text">Text / Instructions</option><option value="field">Dynamic Field</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="line">Line</option><option value="photo">Photo Box</option><option value="image">Image</option></select>)}
          {field("Source / Meaning", <select value={selected.origin} onChange={event => edit({ origin: event.target.value as Origin, preprinted: event.target.value === "preprinted" })}><option value="static">Static / Graphic text</option><option value="preprinted">Already printed on paper</option><option value="customer">Customer Data</option><option value="bank">Bank Information</option><option value="dotmatrix">Dot Matrix Data / Label</option></select>)}
          {field("Mapped field key", <input value={selected.fieldKey} onChange={event => edit({ fieldKey: event.target.value })} placeholder="e.g. customerName" list={selected.origin==="bank" ? "ls-bank-fields" : undefined} />)}
          <datalist id="ls-bank-fields">{Object.keys(bankValues).sort().map(key=><option key={key} value={key}/>)}</datalist>
          {field("Default / Preview value", <input value={selected.defaultValue} onChange={event => edit({ defaultValue: event.target.value })} placeholder="Optional default" />)}
          {field("Manual field value", <input value={selected.value} onChange={event => edit({ value: event.target.value })} placeholder="Optional static override" />)}
          {["customer","bank","dotmatrix"].includes(selected.origin) && <div className="ls-overlap-tools">
            <strong>Temporary print edit — preview only</strong>
            {field("This print only (not saved to the template)", <input value={temporaryValues[selected.id] ?? ""} onChange={event => setTemporaryValues(current => ({...current,[selected.id]:event.target.value}))} placeholder={selected.defaultValue || selected.value || "Enter temporary print value"} />)}
            <button type="button" onClick={() => setTemporaryValues(current => {const next={...current}; delete next[selected.id]; return next;})}>Reset this print value</button>
          </div>}
          <div className="ls-overlap-tools">
            <strong>Overlapped / merged line repair</strong>
            <p>If original preprinted label and dot-matrix output overlap, name both separately. The current selected line becomes layer one.</p>
            {field("Second line / overprint text", <input value={splitSecondLine} onChange={event => setSplitSecondLine(event.target.value)} placeholder="Second line or value" />)}
            <button type="button" disabled={!splitSecondLine.trim()} onClick={() => {
              const first = selected;
              if (!first || !splitSecondLine.trim()) return;
              const second = { ...first, id: randomId(), label: splitSecondLine.trim(), origin: "dotmatrix" as Origin, preprinted: false, dotMatrix: true, quick: false, z: first.z + 1 };
              modify(current => ({ ...current, elements: [...current.elements.map(part => part.id === first.id ? { ...part, origin: "preprinted" as Origin, preprinted: true, dotMatrix: false } : part), second] }));
              setSelectedId(second.id);
              setSplitSecondLine("");
              setNotice("Two separate layers created. Confirm which layer is preprinted and correct both texts, positions and print settings.");
            }}>Split into editable layers</button>
          </div>
          <div className="ls-grid-two">{field("X (" + unit + ")", number(valueInUnit(selected.x, unit), next => edit({x:round(next * factor(unit))}), 0, 500, .1))}{field("Y (" + unit + ")", number(valueInUnit(selected.y, unit), next => edit({y:round(next * factor(unit))}), 0, 500, .1))}{field("Width (" + unit + ")", number(valueInUnit(selected.width, unit), next => edit({width:round(next * factor(unit))}), 1, 500, .1))}{field("Height (" + unit + ")", number(valueInUnit(selected.height, unit), next => edit({height:round(next * factor(unit))}), 1, 500, .1))}{field("Z layer", number(selected.z, next => edit({z:next}), -1000, 1000))}{field("Rotation (°)", number(selected.rotation, next => edit({rotation:next}), -360, 360))}</div>
          {field("Font family", <select value={selected.font} onChange={event => edit({font:event.target.value})}>{fonts.map(font => <option key={font} value={font}>{font}</option>)}</select>)}
          <div className="ls-grid-two">{field("Font size (px)", number(selected.size, next => edit({size:next}), 5, 120))}{field("Letter spacing", number(selected.letterSpacing, next => edit({letterSpacing:next}), -5, 30, .1))}</div>
          <div className="ls-toggle-row"><button type="button" aria-pressed={selected.bold} onClick={() => edit({bold:!selected.bold})}><strong>B</strong></button><button type="button" aria-pressed={selected.italic} onClick={() => edit({italic:!selected.italic})}><em>I</em></button><button type="button" aria-pressed={selected.underline} onClick={() => edit({underline:!selected.underline})}><u>U</u></button><button type="button" onClick={() => moveZ(1)}>Bring Forward</button><button type="button" onClick={() => moveZ(-1)}>Send Back</button></div>
          {field("Text alignment", <select value={selected.align} onChange={event => edit({align:event.target.value as Align})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>)}
          <div className="ls-grid-two">{field("Text color", <input type="color" value={selected.color} onChange={event => edit({color:event.target.value})}/>)}{field("Background color", <input type="color" value={selected.background === "transparent" ? "#ffffff" : selected.background} onChange={event => edit({background:event.target.value})}/>)}{field("Border color", <input type="color" value={selected.borderColor} onChange={event => edit({borderColor:event.target.value})}/>)}{field("Border width", number(selected.borderWidth, next => edit({borderWidth:next}), 0, 10, .5))}{field("Opacity", number(selected.opacity, next => edit({opacity:next}), 0, 1, .1))}</div>
          <label className="ls-inline-check"><input type="checkbox" checked={selected.background === "transparent"} onChange={event => edit({background:event.target.checked ? "transparent" : "#ffffff"})}/> Transparent background</label>
          <div className="ls-checks"><label><input type="checkbox" checked={selected.quick} onChange={event => edit({quick:event.target.checked})}/> Quick Passbook</label><label><input type="checkbox" checked={selected.dotMatrix} onChange={event => edit({dotMatrix:event.target.checked})}/> Dot Matrix output</label><label><input type="checkbox" checked={selected.preprinted} onChange={event => edit({preprinted:event.target.checked})}/> Preprinted on paper</label></div>
          <div className="ls-actions"><button type="button" onClick={() => { const duplicate={...selected,id:randomId(),x:selected.x+3,y:selected.y+3,z:selected.z+1};modify(current=>({...current,elements:[...current.elements,duplicate]}));setSelectedId(duplicate.id); }}>Duplicate</button><button type="button" className="ls-danger" onClick={() => { modify(current=>({...current,elements:current.elements.filter(item=>item.id!==selected.id)}));setSelectedId(null); }}>Delete</button></div>
        </div> : <p className="ls-empty">Select an object to edit every property: text, dynamic mapping, font, color, size, layers, coordinates and print behavior.</p>)}
      </aside>
    </div>
    <footer className="ls-footer">Phase 1 Visual Editor: local-only, unapproved draft. PDF image OCR, artwork reconstruction, physical scan detection, shared templates and PR2 activation require separate verified implementation.</footer>
  </section>;
}

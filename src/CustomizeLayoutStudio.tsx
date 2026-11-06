import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callBankSetuWorker } from "./workerApi";
import { confirmAction } from "./uiDialogs";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import {windowsLayoutEngineAvailable} from "./platform/layoutEngineGate";
import "./CustomizeLayoutStudio.css";
import { estimatePassbookBounds, mapScannedPageToPassbook, calibrateScanBounds, type ScanBounds } from "./layoutScanGeometry";
import { suggestPassbookLabel, findOverlappingPassbookText, type TextCollision } from "./layoutFieldInference";
import { reconcileImportedText, textForOverlapReview } from "./layoutImportReview";
import { splitPreprintedAndDynamic } from "./layoutLayerRepair";
import {startBlankLayout,alignElementToPage} from "./layoutBlankDocument.ts";
import {compressedTextStyle,typographyCompression} from "./layoutTypography.ts";
import {wordTransform,wordNudge,wordGroup,wordGroupIds,type WordAction} from "./layoutWordGeometry.ts";
import {smartSnap,type SnapGuide} from "./layoutSmartGuides.ts";
import {findEditableLabels,replaceEditableLabels} from "./layoutWordFindReplace.ts";
import {isLayoutLayerPrintable} from "./layoutOutputPolicy.ts";
import {readLocalLayouts,saveLocalLayout} from "./layoutLocalStore.ts";
import {synchronizeLocalLayoutSlots,publishLocalLayoutSlot} from "./layoutCloudRecovery.ts";
import { createPerspectiveMap, rectifyPerspectivePixels, type PerspectiveQuad } from "./layoutPerspectiveGeometry";
import { auditPassbookTemplate, type AuditItem } from "./layoutTemplateAudit";
import { validatePersistedLayoutDraft } from "./layoutDraftValidation";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import LayoutSetupWizard, {type LayoutSetup} from "./LayoutSetupWizard";
import {importWordDocx} from "./layoutWordDocumentImport";
import {customerRepository} from "./core/customerRepository";
import {currentLayoutScope} from "./layoutLocalStore";
import {layoutCustomerValue} from "./layoutCustomerValue";

type Mode = "passbook" | "accountOpening";
type Kind = "text" | "field" | "rectangle" | "line" | "photo" | "image" | "ellipse";
type Origin = "static" | "customer" | "bank" | "preprinted" | "dotmatrix";
type Align = "left" | "center" | "right" | "justify";
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
  fontCompression?:number;
  lineHeight?:number;
  locked?:boolean;
  groupId?:string;
  opacity: number;
  quick: boolean;
  dotMatrix: boolean;
  preprinted: boolean;
  needsReview?: boolean;
};
type Draft = { version: 1; mode: Mode; bankName: string; pageCount?:number; widthMm: number; heightMm: number; foldMm: number; printStartMm: number; sourceArtworkStatus?:"clean"|"needsReview"|"reviewed"; elements: LayoutPart[] };
const PX_PER_MM = 3.2;
const defaults = { font: "Arial", size: 11, bold: false, italic: false, underline: false, align: "left" as Align, color: "#132a40", background: "transparent", borderColor: "#74869a", borderWidth: 1, letterSpacing: 0, fontCompression:100, lineHeight:1.18,locked:false,opacity: 1, rotation: 0, quick: true, dotMatrix: false, preprinted: false };
const customerFieldKeys = ["name","customerName","accountNo","accountNumber","customerId","dateOfBirth","fatherName","address","addressLine1","addressLine2","addressLine3","mobile","aadhaar","pan","nominee","accountOpeningDate","accountType","mode","operatingMode","pinCode","postOffice","ifsc","status","gender","religion","category","branchName"];
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
  return validatePersistedLayoutDraft(draft, mode, bankName);
}
function draftKey(mode: Mode, bankName: string) {
  const tenantId = sessionStorage.getItem("bankSetuTenantId") || "";
  const uid = sessionStorage.getItem("bankSetuWorkspaceOwner") || "";
  // Never persist another tenant's template in a shared fallback 'master/local'
  // key when the active workspace identity has not been established.
  if(!tenantId||!uid)return null;
  return "bankSetuLayoutDraft:v1:" + tenantId + ":" + uid + ":" + mode + ":" + bankName;
}

type CatalogEntry = { id:string; bankName:string; mode:Mode; status:string; widthMm:number; heightMm:number; foldMm:number; printStartMm:number; elements:LayoutPart[]; updatedAt?:string };
type StudioProps={mode:Mode;bankName:string;bankValues?:Record<string,string>;accountRole?:string;bankOptions?:readonly string[]};
type StudioCoreProps=StudioProps & {setup:LayoutSetup;onBackToSetup:()=>void};
function CustomizeLayoutStudioCore({ mode, bankName, bankValues = {}, accountRole = "client_user",setup,onBackToSetup }: StudioCoreProps) {
  const storageKey = draftKey(mode, bankName);
  const [scopeEpoch,refreshWorkspaceScope]=useState(0);
  const [draft, setDraft] = useState<Draft>(() => {
    try { const saved = JSON.parse(storageKey ? localStorage.getItem(storageKey) || "null" : "null") as unknown; if (validDraft(saved, mode, bankName)) return saved; } catch { /* Invalid local draft stays unused. */ }
    return initialDraft(mode, bankName);
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wordSelectedIds,setWordSelectedIds]=useState<string[]>([]);
  const [wordGapMm,setWordGapMm]=useState(5);
  const [findWord,setFindWord]=useState("");
  const [replaceWord,setReplaceWord]=useState("");
  const [findAllPages,setFindAllPages]=useState(false);
  const [unit, setUnit] = useState<Unit>("mm");
  const [selectedPage, setSelectedPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [workspaceView,setWorkspaceView]=useState<"design"|"library">("design");
  const [easyMode,setEasyMode]=useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showRulers,setShowRulers]=useState(true);
  const [styleClipboard,setStyleClipboard]=useState<Partial<LayoutPart>|null>(null);
  const [snapGrid, setSnapGrid] = useState(false);
  const [smartGuidesEnabled,setSmartGuidesEnabled]=useState(false);
  const [activeGuides,setActiveGuides]=useState<SnapGuide[]>([]);
  const [preview, setPreview] = useState<"quick" | "dotmatrix">(setup.output);
  const [notice, setNotice] = useState("Local draft only. Nothing here changes approved passbooks or PR2 printing.");
  const [busy, setBusy] = useState(false);
  const [scanSuggestion, setScanSuggestion] = useState<ScanBounds | null>(null);
  const [scanFrame, setScanFrame] = useState<{pixelWidth:number;pixelHeight:number;paperWidthMm:number;paperHeightMm:number}|null>(null);
  const [scanMeasurements,setScanMeasurements]=useState<{widthMm:number|null;heightMm:number|null;foldMm:number|null;printStartMm:number|null}>({widthMm:null,heightMm:null,foldMm:null,printStartMm:null});
  const [scanOrientation,setScanOrientation]=useState<0|90|180|270>(0);
  const [scanFineRotation,setScanFineRotation]=useState(0);
  const [scanPerspective,setScanPerspective]=useState(false);
  const [scanCornerPercents,setScanCornerPercents]=useState<PerspectiveQuad|null>(null);
  const [scanHasImportedObjects,setScanHasImportedObjects]=useState(false);
  const [referencePages, setReferencePages] = useState<string[]>([]);
  const [referenceOpacity, setReferenceOpacity] = useState(0.4);
  const [referenceVisible, setReferenceVisible] = useState(false);
  const [visualDiff, setVisualDiff] = useState<{meanDifferencePercent:number;strongMismatchPercent:number;pixels:number}|null>(null);
  const [diffBusy, setDiffBusy] = useState(false);
  const [pr2Proof, setPr2Proof] = useState("");
  const [audit, setAudit] = useState<AuditItem[] | null>(null);
  const [physicalChecked, setPhysicalChecked] = useState(false);
  const [labelChecked, setLabelChecked] = useState(false);
  const [splitSecondLine, setSplitSecondLine] = useState("");
  const [splitSecondKey,setSplitSecondKey] = useState("");
  const [splitSecondSource,setSplitSecondSource] = useState<"customer"|"bank">("customer");
  const [suggestedLabels, setSuggestedLabels] = useState<Array<{ id:string; label:string; fieldKey:string; source:"customer"|"bank"; page:number }>>([]);
  const [collisions, setCollisions] = useState<TextCollision[]>([]);
  const [graphicWarnings,setGraphicWarnings]=useState<string[]>([]);

  const [printedLabelRule, setPrintedLabelRule] = useState<"all"|"none"|"some">("some");
  const [confirmedPreprinted, setConfirmedPreprinted] = useState<Record<string,boolean>>({});
  const [temporaryValues, setTemporaryValues] = useState<Record<string,string>>({});
  const [showLayers, setShowLayers] = useState(false);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [pendingReview, setPendingReview] = useState<CatalogEntry[]>([]);
  const [catalogChoice, setCatalogChoice] = useState<CatalogEntry | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(true);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [layoutSelection, setLayoutSelection] = useState<{active:boolean;revision:number;template?:{id:string;bankName:string;mode:Mode}|null}|null>(null);
  const [hardwareChecked, setHardwareChecked] = useState(false);
  const [showProps, setShowProps] = useState(true);
  const undoRef = useRef<Draft[]>([]);
  const redoRef = useRef<Draft[]>([]);
  const dragRef = useRef<{id:string;pageX:number;pageY:number;members:Array<{id:string;x:number;y:number;width:number;height:number}>}|null>(null);
  const resizeRef = useRef<{id:string;pageX:number;pageY:number;width:number;height:number}|null>(null);
  const [dirty, setDirty] = useState(false);
  const [savingLayout,setSavingLayout]=useState(false);
  const initialImportRef=useRef(false);
  const [mappingSource,setMappingSource]=useState<"customer"|"bank"|null>(null);
  const mapStartRef=useRef<{x:number;y:number}|null>(null);
  const [mapPendingRect,setMapPendingRect]=useState<{x:number;y:number;width:number;height:number}|null>(null);
  const editsRef=useRef(0);
  const lastCloudAutosaveRef=useRef(0);
  const [autosaveStatus,setAutosaveStatus]=useState("Draft autosave is enabled after editing.");
  const [previewOpen,setPreviewOpen]=useState(false);
  const [previewCustomers,setPreviewCustomers]=useState<Array<{key:string;display:string;data:Record<string,unknown>}>>([]);
  const [previewCustomerKey,setPreviewCustomerKey]=useState("");
  const localRevisionRef=useRef(0);
  const editingRef=useRef(false);
  const editorScopeRef=useRef(storageKey);
  const workspaceVersionRef=useRef(0);
  useEffect(()=>{editingRef.current=dirty;},[dirty]);
  const resetForNewWorkspace=useCallback(()=>{
    // Never bring another tenant's unsaved customer/template preview across.
    // Only the existing scoped repository may restore the new owner's draft.
    setDraft(initialDraft(mode,bankName));
    setSelectedId(null);setWordSelectedIds([]);setSelectedPage(1);setTemporaryValues({});
    setReferencePages([]);setReferenceVisible(false);setScanSuggestion(null);
    setScanFrame(null);setScanHasImportedObjects(false);
    setSuggestedLabels([]);setCollisions([]);setConfirmedPreprinted({});
    setGraphicWarnings([]);setVisualDiff(null);setAudit(null);setPr2Proof("");
    setPhysicalChecked(false);setLabelChecked(false);setHardwareChecked(false);
    setCatalog([]);setPendingReview([]);setLayoutSelection(null);
    undoRef.current=[];redoRef.current=[];localRevisionRef.current=0;
    editingRef.current=false;setDirty(false);
    setNotice("Workspace or selected bank changed. Previous tenant's unsaved preview was cleared; open a saved revision from the verified current workspace.");
  },[mode,bankName]);
  useEffect(()=>{
    const changed=()=>{
      workspaceVersionRef.current+=1;
      editorScopeRef.current=draftKey(mode,bankName);
      resetForNewWorkspace();
      refreshWorkspaceScope(n=>n+1);
    };
    window.addEventListener("banksetu-workspace-change",changed);
    return()=>window.removeEventListener("banksetu-workspace-change",changed);
  },[mode,bankName,resetForNewWorkspace]);
  useEffect(()=>{
    if(editorScopeRef.current!==storageKey){
      workspaceVersionRef.current+=1;
      editorScopeRef.current=storageKey;
      resetForNewWorkspace();
    }
  },[storageKey,resetForNewWorkspace]);
  const selected = draft.elements.find(part => part.id === selectedId) || null;
  const liveWordIds=selectedId?(wordSelectedIds.includes(selectedId)?wordSelectedIds:[selectedId]):[];
  const selectedWordParts=draft.elements.filter(p=>liveWordIds.includes(p.id)&&(p.page??1)===selectedPage);
  const selectWordObject=(part:LayoutPart,additive=false)=>{
    const members=wordGroupIds(draft.elements,part);
    if(additive){
      const current=new Set(liveWordIds),allPresent=members.every(id=>current.has(id));
      for(const id of members){if(allPresent)current.delete(id);else current.add(id);}
      const next=[...current];setWordSelectedIds(next);
      setSelectedId(next.includes(part.id)?part.id:(next[next.length-1]??null));
    }else{setWordSelectedIds(members);setSelectedId(part.id);}
  };
  const canReview = accountRole === "master_owner" || accountRole === "admin";
  const canSubmit = accountRole === "client_admin";
  const ordered = useMemo(() => [...draft.elements.filter(part => (part.page||1)===selectedPage)].sort((a, b) => a.z - b.z), [draft.elements,selectedPage]);

  useEffect(()=>{
    let active=true;
    const runVersion=workspaceVersionRef.current;
    // Existing authenticated Repository is shared by Web/Android IndexedDB
    // and Windows SQLite. Cloud only reconciles missing/changed generic drafts.
    void (async()=>{
      let info="";
      if(setup.method==="continue"&&navigator.onLine&&["client_admin","client_user"].includes(accountRole)){
        try{
          const result=await synchronizeLocalLayoutSlots(bankName,mode);
          if(result.conflicts)info="Other device changed a layout; your local edits were preserved for review.";
          else if(result.downloaded)info="Recovered "+result.downloaded+" bank layout(s) from small cloud backups.";
        }catch(error){info="Offline templates remain available. Cloud check: "+(error instanceof Error?error.message:"unavailable");}
      }
      try{
        const local=await readLocalLayouts(bankName,mode);
        if(!active||runVersion!==workspaceVersionRef.current)return;
        const slot=local.find(item=>item.slotId==="layout-1");
        if(slot && validDraft(slot.draft,mode,bankName)){
          localRevisionRef.current=slot.localRevision;
          if(!editingRef.current&&setup.method==="continue"){
            setDraft(slot.draft as unknown as Draft);
            if(info)setNotice(info);
          }
        }else if(storageKey){
          // One-way, non-destructive migration of older verified legacy drafts.
          const raw=localStorage.getItem(storageKey);
          const prior=raw?JSON.parse(raw) as unknown:null;
          if(validDraft(prior,mode,bankName)&&!editingRef.current&&setup.method==="continue"){
            const saved=await saveLocalLayout(bankName,mode,"layout-1",prior,0);
            if(active&&runVersion===workspaceVersionRef.current){
              localRevisionRef.current=saved.localRevision;
              setDraft(prior);
              setNotice("Previous local draft migrated into BANK SETU's existing SQLite/IndexedDB workspace repository. Legacy copy was retained.");
            }
          }
        }else if(info)setNotice(info);
      }catch(error){
        if(active&&runVersion===workspaceVersionRef.current)setNotice("Existing local draft was retained. Offline layout recovery: "+(error instanceof Error?error.message:"Unavailable"));
      }
    })();
    return()=>{active=false;};
  },[bankName,mode,accountRole,storageKey,scopeEpoch,setup.method]);

  const refreshCatalog = useCallback(async (review = false) => {
    if (!bankName.trim() && !review) return;
    const runVersion=workspaceVersionRef.current;
    setCatalogBusy(true);
    try {
      const response = await callBankSetuWorker<{templates:CatalogEntry[]}>("/list-layout-templates",{bankName,pending:review});
      if(runVersion!==workspaceVersionRef.current)return;
      const entries = (response.templates || []).filter(item=>item.mode === mode || review);
      if (review) setPendingReview(entries); else setCatalog(entries);
    } catch (error) {
      if(runVersion===workspaceVersionRef.current)setNotice("Shared layout list unavailable: "+(error instanceof Error?error.message:"Connection required")+". Local editing remains available.");
    } finally { if(runVersion===workspaceVersionRef.current)setCatalogBusy(false); }
  },[bankName,mode,scopeEpoch]);
  useEffect(()=>{void refreshCatalog();},[refreshCatalog]);
  const refreshSelection = useCallback(async()=>{
    if(!canSubmit || !bankName.trim())return;
    const runVersion=workspaceVersionRef.current;
    try{
      const state=await callBankSetuWorker<{active:boolean;revision:number;template?:{id:string;bankName:string;mode:Mode}|null}>("/get-workspace-layout-selection",{mode});
      if(runVersion===workspaceVersionRef.current)setLayoutSelection(state);
    } catch {if(runVersion===workspaceVersionRef.current)setLayoutSelection(null);}
  },[canSubmit,bankName,mode,scopeEpoch]);
  useEffect(()=>{void refreshSelection();},[refreshSelection]);
  const selectApprovedTemplate = async(action:"activate"|"rollback"|"disable",templateId?:string)=>{
    if(!storageKey||storageKey!==draftKey(mode,bankName)){
      setNotice("Template selection blocked: the verified tenant changed.");return;
    }
    if(!canSubmit || busy || !physicalChecked || !labelChecked || !hardwareChecked){
      setNotice("Only the Client Admin can select a template after confirming actual paper size, preprinted labels and a real PR2 calibration test.");return;
    }
    if(!await confirmAction("Change this workspace's selected layout? Bank Setu will keep version history. Only choose a physically verified approved bank template."))return;
    setBusy(true);
    try{
      const response=await callBankSetuWorker<{success:boolean;revision:number;active:boolean}>("/set-workspace-layout-selection",{
        mode,action,templateId,confirmedPhysicalSample:physicalChecked,confirmedPrintedLabels:labelChecked,confirmedPrinterCalibration:hardwareChecked,
      });
      await refreshSelection();setNotice("Workspace layout selection updated to revision "+response.revision+". You can revert or disable it using the same controls.");
    }catch(error){setNotice("Template activation was blocked: "+(error instanceof Error?error.message:"Unknown error"));}
    finally{setBusy(false);}
  };
  const submitForReview = async () => {
    if(!storageKey||storageKey!==draftKey(mode,bankName)){
      setNotice("Submission blocked: workspace identity changed. Reopen this tenant's editor.");return;
    }
    if (!canSubmit || busy || !bankName.trim()) return;
    if(!Object.keys(bankValues).length){setNotice("Configure this bank in Bank Information before submitting a Master Admin template.");return;}
    if(scanFrame && scanSuggestion){
      setNotice("Review and apply or explicitly skip the source PDF crop before submitting. An A4 scanner sheet is not a physical passbook.");
      return;
    }
    const report=auditPassbookTemplate(draft);
    setAudit(report);
    if (report.some(item=>item.severity==="error")) {setNotice("Fix all audit errors before submitting a template for Master approval.");return;}
    if(!physicalChecked || !labelChecked) {setNotice("Confirm physical dimensions and the preprinted label/PR2 separation before submission.");return;}
    if(draft.sourceArtworkStatus==="needsReview"){
      setNotice("Review unsupported PDF artwork against the original before submitting this shared template.");return;
    }
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
    const restored:Draft={version:1,bankName,mode,pageCount:(entry as CatalogEntry & {pageCount?:number}).pageCount||1,widthMm:entry.widthMm,heightMm:entry.heightMm,foldMm:entry.foldMm,printStartMm:entry.printStartMm,elements:entry.elements.map(part=>({...part,id:randomId(),value:""}))};
    if (!validDraft(restored,mode,bankName)){setNotice("Catalog template is not compatible with this bank or editor version.");return;}
    setDraft(restored);setSelectedId(null);setCatalogChoice(null);setCatalogOpen(false);setDirty(true);setTemporaryValues({});undoRef.current=[];redoRef.current=[];
    setPhysicalChecked(false);setLabelChecked(false);setHardwareChecked(false);
    setGraphicWarnings([]);setScanSuggestion(null);setScanFrame(null);
    setSuggestedLabels([]);setCollisions([]);setConfirmedPreprinted({});setReferencePages([]);setReferenceVisible(false);
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
    editsRef.current+=1;
    setDraft(current => {
      const next = apply(current);
      if (next === current) return current;
      undoRef.current = [...undoRef.current.slice(-39), current];
      redoRef.current = [];
      return next;
    });
    setDirty(true);
  }, []);
  const previewCustomer=previewOpen?previewCustomers.find(item=>item.key===previewCustomerKey)?.data:undefined;
  const loadPreviewCustomers=async()=>{
    if(!bankValues||!Object.keys(bankValues).length){
      setNotice("This bank is not the selected tenant bank. Configure it under Bank Information before previewing real customer data.");return;
    }
    try{
      const {scope}=currentLayoutScope();
      const saved=await customerRepository.read(scope);
      const customers=saved.records.filter(item=>!item.deleted).slice(0,100).map(item=>{
        const name=typeof item.customer.name==="string"?item.customer.name:"Customer";
        const account=String(item.customer.accountNo||"");
        return {key:item.key,display:name.slice(0,70)+(account?" · ****"+account.slice(-4):""),data:item.customer};
      });
      setPreviewCustomers(customers);
      setPreviewCustomerKey(customers[0]?.key||"");
      setPreviewOpen(true);
      setNotice(customers.length+" local customers available for read-only preview. This data never enters the saved template or shared catalog.");
    }catch(error){setNotice("Customer preview unavailable: "+(error instanceof Error?error.message:"No verified local customer repository"));}
  };
  const edit = (change: Partial<LayoutPart>) => {
    if (!selectedId||selected?.locked===true) return;
    modify(current => ({ ...current, elements: current.elements.map(part => part.id === selectedId ? { ...part, ...change } : part) }));
  };
  const setMeasure = (key: "widthMm" | "heightMm" | "foldMm" | "printStartMm", value: string) => {
    const mm = valueInMm(value, unit);
    if (!Number.isFinite(mm)) return;
    modify(current => ({ ...current, [key]: round(within(mm, key === "widthMm" || key === "heightMm" ? 50 : 0, 500)) }));
    // Any physical-size, crease or start-position edit invalidates past approvals.
    setPhysicalChecked(false);
    setHardwareChecked(false);
  };
  const append = (kind: Kind, origin: Origin, label: string, fieldKey = "") => {
    const part = addPart(kind, origin, label, fieldKey, 14, draft.foldMm ? draft.foldMm + 12 : 25);
    part.z = Math.max(0, ...draft.elements.map(p => p.z)) + 1;
    part.page = selectedPage;
    modify(current => ({ ...current, elements: [...current.elements, part] }));
    setSelectedId(part.id);setWordSelectedIds([part.id]);
  };
  const startFromBlank=async()=>{
    if(busy)return;
    if(!await confirmAction("Create a blank, measured passbook/page on this device? The current editor is preserved in Undo; export the JSON before replacing unsaved work."))return;
    try{
      modify(current=>startBlankLayout(current));
      setSelectedId(null);setWordSelectedIds([]);setSelectedPage(1);setPreview("quick");
      setReferencePages([]);setReferenceVisible(false);
      setScanSuggestion(null);setScanFrame(null);setScanHasImportedObjects(false);
      setSuggestedLabels([]);setCollisions([]);setConfirmedPreprinted({});
      setGraphicWarnings([]);setAudit(null);setVisualDiff(null);setPr2Proof("");
      setPhysicalChecked(false);setLabelChecked(false);setHardwareChecked(false);
      setTemporaryValues({});setNotice("A blank, bank-independent Word-style document is ready. Add text, labels, mapped fields, shapes and exact mm/cm/in coordinates. Undo restores your previous local editor.");
    }catch(error){setNotice(error instanceof Error?error.message:"Blank canvas could not be created.");}
  };
  const applyWordAction=(action:WordAction)=>{
    try{
      const next=wordTransform(draft.elements,liveWordIds,
        {widthMm:draft.widthMm,heightMm:draft.heightMm},action,selectedId??undefined);
      modify(current=>({...current,elements:next}));
      setPhysicalChecked(false);setHardwareChecked(false);
      setNotice("Word alignment applied to "+liveWordIds.length+" selected object(s). Recheck the paper proof before activation.");
    }catch(error){setNotice("Word alignment blocked: "+(error instanceof Error?error.message:"Invalid selection."));}
  };
  const groupWordSelection=()=>{
    if(selectedWordParts.length<2){setNotice("Select at least two objects to Group.");return;}
    try{
      const groupId="group-"+Math.random().toString(36).slice(2,12);
      const next=wordGroup(draft.elements,liveWordIds,groupId);
      modify(current=>({...current,elements:next}));
      setNotice("Selected objects grouped. Drag a group member to move the group together.");
    }catch(error){setNotice(error instanceof Error?error.message:"Could not group objects.");}
  };
  const ungroupWordSelection=()=>{
    const ids=[...new Set(selectedWordParts.flatMap(p=>p.groupId?
      draft.elements.filter(x=>x.groupId===p.groupId&&(x.page??1)===(p.page??1)).map(x=>x.id):[p.id]))];
    try{
      const next=wordGroup(draft.elements,ids,null);
      modify(current=>({...current,elements:next}));
      setWordSelectedIds(ids);if(ids.length)setSelectedId(ids[0]);
      setNotice("Object group removed; fields and customer mapping remain unchanged.");
    }catch(error){setNotice(error instanceof Error?error.message:"Could not ungroup objects.");}
  };
  const lockWordSelection=(locked:boolean)=>{
    if(!liveWordIds.length)return;
    const keys=new Set(liveWordIds);
    modify(current=>({...current,elements:current.elements.map(p=>keys.has(p.id)?{...p,locked}:p)}));
    setNotice(locked?"Selected design objects locked. Unlock before editing geometry.":"Selected objects unlocked.");
  };
  const deleteWordSelection=()=>{
    if(selectedWordParts.some(p=>p.locked)){setNotice("Unlock objects before deleting.");return;}
    const keys=new Set(liveWordIds);
    modify(current=>({...current,elements:current.elements.filter(p=>!keys.has(p.id))}));
    setSelectedId(null);setWordSelectedIds([]);
  };
  const moveSelectedTo=(axis:"horizontal"|"vertical",side:"start"|"center"|"end")=>{
    if(!selected)return;
    try{
      const moved=alignElementToPage(selected,{widthMm:draft.widthMm,heightMm:draft.heightMm},axis,side);
      edit({x:moved.x,y:moved.y});setPhysicalChecked(false);
    }catch(error){setNotice(error instanceof Error?error.message:"Element exceeds the current page.");}
  };
  const copySelectedStyle=()=>{
    if(!selected)return;
    const {font,size,bold,italic,underline,align,color,background,borderColor,borderWidth,letterSpacing,fontCompression,lineHeight,opacity,rotation}=selected;
    setStyleClipboard({font,size,bold,italic,underline,align,color,background,borderColor,borderWidth,letterSpacing,fontCompression,lineHeight,opacity,rotation});
    setNotice("Copied formatting only — no account number, customer field, tenant data or content was copied.");
  };
  const pasteSelectedStyle=()=>{
    if(!selected||!styleClipboard)return;
    edit(styleClipboard);setNotice("Formatting applied to this element. Existing customer mapping and text remain unchanged.");
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
  const save = async () => {
    if(!storageKey||storageKey!==draftKey(mode,bankName)){
      setNotice("Layout NOT saved: workspace changed; reload the verified bank and tenant first.");return;
    }
    if(savingLayout||busy)return;
    setSavingLayout(true);
    try{
      const saved=await saveLocalLayout(bankName,mode,"layout-1",draft,
        localRevisionRef.current);
      localRevisionRef.current=saved.localRevision;
      setDirty(false);
      setNotice("Editable Layout 1 saved in the existing BANK SETU offline workspace repository. Customer records and pending sync operations were not changed.");
      if(canSubmit&&navigator.onLine){
        try{
          const synced=await publishLocalLayoutSlot(bankName,mode,"layout-1");
          setNotice("Layout saved offline and a compact, customer-free recovery copy synced for this tenant (cloud revision "+synced.revision+"). Shared catalog publication still requires Master review.");
        }catch(error){
          setNotice("Layout SAVED offline. Cloud recovery is pending: "+(error instanceof Error?error.message:"Unavailable")+". No customer/PDF data was uploaded.");
        }
      }
    }catch(error){
      // Never mark success on quota/tenant/license/DB failures.
      setNotice("Layout NOT saved: "+(error instanceof Error?error.message:"Local database unavailable")+". Existing drafts were retained.");
    }finally{setSavingLayout(false);}
  };
  // Debounced, tenant-scoped autosave through the EXISTING local repository and Worker.
  // Never publish unreviewed OCR/Word content or actual customer preview values to cloud.
  useEffect(()=>{
    if(!dirty||busy||savingLayout||!storageKey)return;
    const editNumber=editsRef.current;
    const timer=window.setTimeout(()=>{
      if(editorScopeRef.current!==storageKey||!editingRef.current)return;
      setSavingLayout(true);
      void (async()=>{
        try{
          const slot=await saveLocalLayout(bankName,mode,"layout-1",draft,localRevisionRef.current);
          localRevisionRef.current=slot.localRevision;
          if(editsRef.current===editNumber)setDirty(false);
          setAutosaveStatus("Draft saved locally · "+new Date().toLocaleTimeString());
          if(canSubmit&&navigator.onLine&&Object.keys(bankValues).length>0&&
              Date.now()-lastCloudAutosaveRef.current>=30000&&
              !draft.elements.some(p=>p.needsReview)&&draft.sourceArtworkStatus!=="needsReview"){
            lastCloudAutosaveRef.current=Date.now();
            try{await publishLocalLayoutSlot(bankName,mode,"layout-1");
              setAutosaveStatus("Local draft and private cloud recovery synced");
            }catch{setAutosaveStatus("Saved offline · cloud sync pending");}
          }else{setAutosaveStatus("Saved offline · cloud review/sync pending");}
        }catch(error){setAutosaveStatus("Autosave pending: "+(error instanceof Error?error.message:"Database unavailable"));}
        finally{setSavingLayout(false);}
      })();
    },4000);
    return()=>window.clearTimeout(timer);
  },[draft,dirty,busy,savingLayout,storageKey,bankName,mode,canSubmit]);
  const syncNow = async () => {
    if(!storageKey||storageKey!==draftKey(mode,bankName)){
      setNotice("Cloud sync blocked: the active tenant changed.");return;
    }
    if(savingLayout||busy)return;
    if(dirty){setNotice("Save your unsaved changes locally before cloud recovery.");return;}
    setSavingLayout(true);
    try{
      const result=await synchronizeLocalLayoutSlots(bankName,mode);
      if(canSubmit){
        const slots=await readLocalLayouts(bankName,mode);
        for(const slot of slots.filter(item=>item.dirty&&!item.incoming)){
          await publishLocalLayoutSlot(bankName,mode,slot.slotId);
        }
      }
      const entries=await readLocalLayouts(bankName,mode);
      const current=entries.find(item=>item.slotId==="layout-1");
      if(current&&!editingRef.current&&validDraft(current.draft,mode,bankName)){
        setDraft(current.draft as unknown as Draft);
        localRevisionRef.current=current.localRevision;
      }
      setNotice(result.offline?"No network. All previously cached templates remain editable offline.":
        "Cloud recovery checked: "+result.downloaded+" updated, "+result.conflicts+" conflicts. Existing local edits were preserved.");
    }catch(error){
      setNotice("Existing offline templates kept. Cloud sync: "+(error instanceof Error?error.message:"Unavailable"));
    }finally{setSavingLayout(false);}
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
  const restoreDraftBackup=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    if(file.size>750*1024||!file.name.toLowerCase().endsWith(".json")){
      setNotice("Choose an editable BANK SETU layout JSON backup smaller than 750 KB.");return;
    }
    try{
      const parsed:unknown=JSON.parse(await file.text());
      if(!validDraft(parsed,mode,bankName))throw Error("Wrong bank, document type or invalid layout backup.");
      if(!await confirmAction("Restore this same-bank layout backup? Current unsaved edits will be replaced; no approved template is changed."))return;
      const restored=structuredClone(parsed as Draft);
      modify(()=>restored);
      setTemporaryValues({});setPreviewOpen(false);setPreviewCustomers([]);setPreviewCustomerKey("");
      setReferencePages([]);setReferenceVisible(false);setScanSuggestion(null);setScanFrame(null);
      setGraphicWarnings([]);setSelectedId(null);setWordSelectedIds([]);
      setPhysicalChecked(false);setLabelChecked(false);setHardwareChecked(false);
      setNotice("Verified same-bank editable layout restored. Review the paper dimensions, then save this draft.");
    }catch(error){setNotice("Layout backup rejected: "+(error instanceof Error?error.message:"Unreadable layout file"));}
  };
  const calibrationPdf=async()=>{
    try{
      const {exportLayoutCalibrationProof}=await import("./layoutCalibrationProof");
      const blob=exportLayoutCalibrationProof(draft);
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;link.download=(normalizeKey(bankName)||"bank")+"-physical-ruler-UNAPPROVED.pdf";
      link.click();window.setTimeout(()=>URL.revokeObjectURL(url),500);
      setNotice("Private-data-free physical test ruler exported. Confirm actual stock, model, driver, feed direction and 1 mm X/Y offsets. No PR2 job was sent and Printed status was not changed.");
    }catch(error){
      setNotice("Physical calibration sheet unavailable: "+(error instanceof Error?error.message:"Unknown error"));
    }
  };
  const proofPdf = async () => {
    setBusy(true);
    try {
      const { exportLayoutProofPdf } = await import("./layoutProofPdf");
      const blob = await exportLayoutProofPdf({ ...draft, elements: draft.elements.map(part => {
        if (temporaryValues[part.id] !== undefined) return {...part, value:temporaryValues[part.id]};
        if (part.origin === "bank" && typeof bankValues[part.fieldKey] === "string") return {...part,value:bankValues[part.fieldKey]};
        if (previewCustomer && part.origin==="customer") return {...part,value:layoutCustomerValue(previewCustomer,part.fieldKey)};
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
  const compareOriginal = async () => {
    const data=referencePages[selectedPage-1];
    const element=document.querySelector(".layout-studio .ls-paper");
    if(!data||!(element instanceof HTMLElement)){setNotice("Upload an original PDF before visual comparison.");return;}
    setDiffBusy(true);
    try {
      const [{default:html2canvas},{measureLayoutDifference}]=await Promise.all([import("html2canvas"),import("./layoutVisualDiff")]);
      const render=await html2canvas(element,{backgroundColor:"#ffffff",scale:Math.min(1,450/Math.max(element.clientWidth,element.clientHeight)),
        useCORS:false,allowTaint:false,
        ignoreElements:node=>node instanceof Element && (node.hasAttribute("data-original-overlay") || node.classList.contains("ls-resize-handle")),
        onclone:doc=>doc.querySelectorAll(".ls-object.selected").forEach(node=>node.classList.remove("selected")),
      });
      const referenceImage=new Image();referenceImage.src=data;await referenceImage.decode();
      const original=document.createElement("canvas");original.width=render.width;original.height=render.height;
      const context=original.getContext("2d"),renderContext=render.getContext("2d");
      if(!context||!renderContext)throw Error("Canvas comparison is unavailable on this device.");
      context.fillStyle="white";context.fillRect(0,0,original.width,original.height);
      context.drawImage(referenceImage,0,0,original.width,original.height);
      const report=measureLayoutDifference(context.getImageData(0,0,original.width,original.height).data,renderContext.getImageData(0,0,render.width,render.height).data);
      setVisualDiff(report);
      setNotice("Visual diagnostic: "+report.meanDifferencePercent+"% mean pixel difference. A4 cropping, fonts and image scanning must be verified separately. This is NOT printer accuracy certification.");
    } catch(error) {
      setNotice("Could not compare original and editable preview: "+(error instanceof Error?error.message:"Device limitation"));
    } finally {setDiffBusy(false);}
  };
  const changeScanEdge=(edge:"left"|"top"|"right"|"bottom",percentage:number)=>{
    const frame=scanFrame;
    if(!frame||!Number.isFinite(percentage)||percentage<0||percentage>100)return;
    const scale=edge==="left"||edge==="right"?frame.pixelWidth:frame.pixelHeight;
    const pixel=Math.round(scale*percentage/100);
    setScanSuggestion(current=>{
      if(!current)return current;
      const next={...current,[edge]:pixel};
      if(next.left<0||next.top<0||next.right>frame.pixelWidth||next.bottom>frame.pixelHeight||
         next.right-next.left<frame.pixelWidth*.025||next.bottom-next.top<frame.pixelHeight*.025)return current;
      return {...next,
        widthMm:round((next.right-next.left)/frame.pixelWidth*frame.paperWidthMm),
        heightMm:round((next.bottom-next.top)/frame.pixelHeight*frame.paperHeightMm),
        foldHint:undefined,confidence:"low",
        reason:"Manually adjusted crop edges. Verify that only the actual passbook is selected; blank passbook margins must be included."
      };
    });
  };
  const changeScanMeasurement=(field:"widthMm"|"heightMm"|"foldMm"|"printStartMm",raw:string)=>{
    const mm=raw.trim()===""?null:valueInMm(raw,unit);
    if(mm!==null&&(!Number.isFinite(mm)||mm<0||mm>500))return;
    setScanMeasurements(previous=>({...previous,[field]:mm}));
  };
  const applyScannerSuggestion = async () => {
    const proposal=scanSuggestion,frame=scanFrame;
    if(!proposal || !frame)return;
    if(!await confirmAction(scanHasImportedObjects
      ? "Apply the scanned crop, optional perspective correction and manual dimensions to this local DRAFT? Printer calibration is still required."
      : "No usable text was imported. Applying this image-only PDF will open an EMPTY editable canvas with the cropped reference; Undo can recover current editor objects. Save/export your previous draft first. Continue?"))return;
    try {
      const orientedBase=scanOrientation===90||scanOrientation===270
        ? {...proposal,widthMm:proposal.heightMm,heightMm:proposal.widthMm,foldHint:undefined}
        : scanOrientation===180?{...proposal,foldHint:undefined}:proposal;
      const oriented=scanPerspective?{...orientedBase,foldHint:undefined}:orientedBase;
      const bounds=calibrateScanBounds(oriented,scanMeasurements);
      const perspective:PerspectiveQuad|undefined=scanPerspective&&scanCornerPercents
        ? scanCornerPercents.map(point=>({
            x:point.x/100*frame.pixelWidth,y:point.y/100*frame.pixelHeight
          })) as PerspectiveQuad:undefined;
      if(scanPerspective&&!perspective)throw Error("Set all four physical passbook corners first.");
      if(perspective)createPerspectiveMap(perspective,frame.pixelWidth,frame.pixelHeight);
      const chosenPrintStart=scanMeasurements.printStartMm??0;
      if(chosenPrintStart<0||chosenPrintStart>bounds.heightMm)
        throw Error("Print-start distance must be within physical passbook height.");
      // Prepare the reference crop BEFORE editing the draft. A failed image decode
      // must never leave customer positions updated against an uncropped overlay.
      let croppedReference:string|null=null;
      if(referencePages[0]){
        const image=new Image();
        image.src=referencePages[0];
        await image.decode();
        const cropX=bounds.left/frame.pixelWidth*image.width,cropY=bounds.top/frame.pixelHeight*image.height;
        const cropW=(bounds.right-bounds.left)/frame.pixelWidth*image.width;
        const cropH=(bounds.bottom-bounds.top)/frame.pixelHeight*image.height;
        if(![cropX,cropY,cropW,cropH].every(Number.isFinite)||cropW<=0||cropH<=0)
          throw Error("Scanner crop is outside the source preview.");
        const canvas=document.createElement("canvas");
        if(perspective){
          const raw=document.createElement("canvas");
          raw.width=image.width;raw.height=image.height;
          const rawContext=raw.getContext("2d",{willReadFrequently:true});
          if(!rawContext)throw Error("Perspective image processing is unavailable.");
          rawContext.drawImage(image,0,0);
          const input=rawContext.getImageData(0,0,raw.width,raw.height).data;
          const quadInImage=perspective.map(point=>({
            x:point.x/frame.pixelWidth*image.width,
            y:point.y/frame.pixelHeight*image.height
          })) as PerspectiveQuad;
          const maximum=Math.max(1,Math.min(850,Math.round(Math.max(cropW,cropH))));
          const ratio=bounds.widthMm/bounds.heightMm;
          canvas.width=Math.max(1,Math.round(maximum*Math.min(1,ratio)));
          canvas.height=Math.max(1,Math.round(maximum*Math.min(1,1/ratio)));
          const pixels=rectifyPerspectivePixels(input,raw.width,raw.height,quadInImage,
            canvas.width,canvas.height,scanOrientation,scanFineRotation);
          const context=canvas.getContext("2d");
          if(!context)throw Error("Perspective output canvas is unavailable.");
          const output=context.createImageData(canvas.width,canvas.height);
          output.data.set(pixels);context.putImageData(output,0,0);
          raw.width=0;raw.height=0;
        }else{
          canvas.width=Math.max(1,Math.ceil(scanOrientation===90||scanOrientation===270?cropH:cropW));
          canvas.height=Math.max(1,Math.ceil(scanOrientation===90||scanOrientation===270?cropW:cropH));
          const context=canvas.getContext("2d");
          if(!context)throw Error("Canvas cropping is unavailable on this device.");
          context.translate(canvas.width/2,canvas.height/2);
          context.rotate((scanOrientation+scanFineRotation)*Math.PI/180);
          context.drawImage(image,cropX,cropY,cropW,cropH,-cropW/2,-cropH/2,cropW,cropH);
        }
        croppedReference=canvas.toDataURL("image/webp",.72);
        canvas.width=0;canvas.height=0;
      }
      // Calculate all coordinates before the state update: an invalid crop should
      // not partially replace a previously reviewed layout.
      // The existing draft may be older manual work when an image-only PDF
      // has no OCR. Never shift those physical coordinates as A4 scan geometry.
      const result=scanHasImportedObjects
        ? mapScannedPageToPassbook(bounds,frame.pixelWidth,frame.pixelHeight,
            frame.paperWidthMm,frame.paperHeightMm,draft.elements,scanOrientation,scanFineRotation,perspective)
        : {elements:[] as LayoutPart[],outsideCount:0};
      modify(current=>({...current,
        widthMm:bounds.widthMm,heightMm:bounds.heightMm,
        sourceArtworkStatus:graphicWarnings.length?"needsReview":"clean",
        foldMm:bounds.foldHint?.foldMm??0,
        printStartMm:chosenPrintStart,
        elements:result.elements,
      }));
      if(croppedReference)setReferencePages(previous=>[croppedReference!,...previous.slice(1)]);
      else setReferenceVisible(false);
      // Calibration is bound to actual paper geometry; changing geometry revokes
      // earlier confirmations even when the bank name stays the same.
      setPhysicalChecked(false);setHardwareChecked(false);
      setScanSuggestion(null);setScanFrame(null);
      setScanMeasurements({widthMm:null,heightMm:null,foldMm:null,printStartMm:null});
      setScanOrientation(0);setScanFineRotation(0);
      setScanPerspective(false);setScanCornerPercents(null);
      setScanHasImportedObjects(false);
      setNotice("Scanner crop applied ONLY to draft. "+(scanHasImportedObjects?"Imported positions were recalibrated. ":"Image-only PDF opened a blank canvas; existing editor version is recoverable using Undo. ")+result.outsideCount+
        " elements may cross the estimated border. Fold"+(bounds.foldHint?" gap":"")+
        " and print start are UNVERIFIED; physical ruler and printer re-approval required.");
    }catch(error){
      setNotice("Scanner crop NOT applied: "+(error instanceof Error?error.message:"Unknown error"));
    }
  };
  // The existing PR2 renderer is reused for compatibility; never dispatch
  // data to a printer or call the native bridge from the draft editor.
  const verifyPr2Raster = async () => {
    if(draft.mode!=="passbook"||(draft.pageCount||1)!==1){
      setNotice("Direct PR2 requires a single passbook page. Review one page at a time.");return;
    }
    setBusy(true);setPr2Proof("");
    try {
      const [{exportLayoutProofPdf},{rasterizePassbook}] = await Promise.all([
        import("./layoutProofPdf"),import("./platform/pr2")
      ]);
      const pdf=await exportLayoutProofPdf(draft,"dotmatrix");
      const bytes=new Uint8Array(await pdf.arrayBuffer());
      let binary="";
      for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const rendered=await rasterizePassbook(btoa(binary));
      setPr2Proof(rendered.preview);
      setNotice("Draft passed the existing PR2 raster size/render compatibility check. No printer was contacted. Paper sensing, font accuracy and physical X/Y alignment remain unverified.");
    }catch(error){
      setNotice("PR2 compatibility check failed: "+(error instanceof Error?error.message:"Unknown error"));
    }finally{setBusy(false);}
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
  const importPdfFile = async (file:File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setNotice("Please choose a PDF sample."); return; }
    if (file.size > 12 * 1024 * 1024) { setNotice("Please choose a PDF up to 12 MB."); return; }
    setBusy(true);
    setReferencePages([]);
    setSuggestedLabels([]);setCollisions([]);setConfirmedPreprinted({});setScanFrame(null);setScanSuggestion(null);
    setGraphicWarnings([]);
    setPhysicalChecked(false);setHardwareChecked(false);
    setScanMeasurements({widthMm:null,heightMm:null,foldMm:null,printStartMm:null});
    setScanOrientation(0);setScanFineRotation(0);
    setScanPerspective(false);setScanCornerPercents(null);
    setScanHasImportedObjects(false);
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
        let recognizedFromScan=0;
        let recognizedGraphics=0;
        let ocrStatus="";
        const sourceGraphicsWarnings:string[]=[];
        for (let index = 1; index <= pageCount; index++) {
          const pdfPage = index === 1 ? page : await pdf.getPage(index);
          const view = pdfPage.getViewport({ scale:1 });
          // A single template has one physical paper geometry. Mixed sizes in one
          // scanned PDF must not be silently stretched into incorrect printer XY.
          if(index>1 && (Math.abs(view.width-viewport.width)>1||Math.abs(view.height-viewport.height)>1))
            throw Error("PDF pages have different dimensions or orientations. Import each physical passbook size as a separate draft.");
          const textLayer = await pdfPage.getTextContent();
          let operatorList:Awaited<ReturnType<typeof pdfPage.getOperatorList>>|null=null;
          let hasRasterArtwork=false;
          try{
            operatorList=await pdfPage.getOperatorList();
            const {analyzePdfGraphicsCoverage}=await import("./layoutGraphicsCoverage");
            const coverage=analyzePdfGraphicsCoverage(operatorList);
            hasRasterArtwork=coverage.rasterImages>0;
            sourceGraphicsWarnings.push(...coverage.warnings.map(warning=>"PDF page "+index+": "+warning));
          }catch{
            sourceGraphicsWarnings.push("PDF page "+index+": graphics analysis unavailable; verify the original PDF before approval.");
          }

          // Import embedded PDF text BEFORE OCR or vector objects. Large raster
          // scans must never crowd out the original digitally mapped fields.
          for (const item of textLayer.items) {
            if (!("str" in item) || !item.str.trim() || elements.length >= 300) continue;
            // PDF coordinates are bottom-left and may be rotated by Page /Rotate.
            // The real PDF.js viewport maps them to the visible page orientation.
            const [screenX,screenY]=view.convertToViewportPoint(item.transform[4],item.transform[5]);
            if(!Number.isFinite(screenX)||!Number.isFinite(screenY))continue;
            const part = addPart("text", "static", item.str.trim(), "", round(screenX/view.width*width), round(screenY/view.height*height));
            part.page = index;
            part.width = round(Math.max(4, item.width / view.width * width));
            part.height = round(Math.max(3, item.height / view.height * height));
            part.size = within(Math.round(Math.abs(item.transform[0]) * 72 / 96) || 10, 5, 60);
            part.z = elements.length + 1;
            elements.push(part);
          }
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
              // A few digital headers do not mean the rest of the page is
              // searchable. Mixed digital+scanned PDFs still receive local OCR
              // suggestions for their raster-only regions (always reviewable).
              if (textLayer.items.filter(item=>"str" in item && item.str.trim()).length<12 ||
                  (hasRasterArtwork && textLayer.items.filter(item=>"str" in item && item.str.trim()).length<32)) {
                // Recognition at the 480px reference thumbnail loses small Hindi
                // and dot-matrix lines. Render one temporary larger OCR canvas,
                // without storing the high-resolution customer scan in drafts.
                let ocrCanvas=previewCanvas;
                try {
                  const maxDimension=Math.max(view.width,view.height);
                  const highScale=Math.min(1.7,1150/maxDimension);
                  if(highScale>Math.min(.9,480/maxDimension)*1.1){
                    const ocrView=pdfPage.getViewport({scale:highScale});
                    const higher=document.createElement("canvas");
                    higher.width=Math.ceil(ocrView.width);higher.height=Math.ceil(ocrView.height);
                    const higherContext=higher.getContext("2d",{willReadFrequently:true});
                    if(higherContext){
                      await pdfPage.render({canvas:higher,canvasContext:higherContext,viewport:ocrView}).promise;
                      ocrCanvas=higher;
                    }else{higher.width=0;higher.height=0;}
                  }
                  const {detectOfflineOpticalText}=await import("./layoutOnDeviceOCR");
                  const optical=await detectOfflineOpticalText(ocrCanvas,width,height);
                  ocrStatus=optical.warning;
                  for (const found of optical.items) {
                    if (elements.length>=300)break;
                    const part=addPart("text","static",found.label,"",found.x,found.y);
                    part.page=index;part.width=found.width;part.height=found.height;
                    part.needsReview=true; // Never accept OCR without user review.
                    part.z=elements.length+1;part.size=within(Math.round(found.height*3.2),5,60);
                    elements.push(part);recognizedFromScan++;
                  }
                }catch{
                  ocrStatus="Offline OCR failed on this page; original reference remains available for manual correction.";
                }finally{
                  if(ocrCanvas!==previewCanvas){ocrCanvas.width=0;ocrCanvas.height=0;}
                }
              }
              previewCanvas.width=0;previewCanvas.height=0;
            } else references.push("");
          } catch { references.push(""); }
          if (elements.length<290 && operatorList) {
            try {
              const {collectEditableVectorShapes}=await import("./layoutVectorImport");
              const shapes=collectEditableVectorShapes(operatorList,view,width,height,Math.min(80,300-elements.length));
              for(const shape of shapes){
                if(elements.length>=300)break;
                const part=addPart(shape.kind,"static",shape.kind==="line"?"PDF vector line":shape.kind==="ellipse"?"PDF vector ellipse":"PDF vector rectangle","",shape.x,shape.y);
                part.page=index;part.width=shape.width;part.height=shape.height;
                part.rotation=shape.rotation;part.color=shape.color;part.borderColor=shape.color;
                part.borderWidth=Math.max(.5,shape.borderWidth);part.background=shape.background;
                part.quick=true;part.dotMatrix=false;part.z=elements.length+1;
                elements.push(part);recognizedGraphics++;
              }
            }catch {
              sourceGraphicsWarnings.push("PDF page "+index+": vector artwork could not be analyzed; check the original manually.");
            }
          }

        }
        setReferencePages(references);
        setReferenceVisible(true);
        setGraphicWarnings(sourceGraphicsWarnings.slice(0,24));
        // For an A4 scanner page, its paper dimensions are NOT the passbook dimensions.
        // Keep measured passbook size from the user's manual calibration until border analysis exists.
        const scannedA4 = (Math.abs(width - 210) < 5 && Math.abs(height - 297) < 5) || (Math.abs(width - 297) < 5 && Math.abs(height - 210) < 5);
        if (mode === "passbook") {
          try {
            const scanView = page.getViewport({ scale: Math.min(1, 750 / Math.max(viewport.width, viewport.height)) });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(scanView.width);
            canvas.height = Math.ceil(scanView.height);
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (context) {
              await page.render({ canvas, canvasContext: context, viewport: scanView }).promise;
              const suggestion = estimatePassbookBounds(context.getImageData(0,0,canvas.width,canvas.height).data,
                canvas.width,canvas.height,width,height);
              // Full-frame is a manual starting point, NEVER proof that the A4 page
              // and the actual passbook are the same size.
              setScanSuggestion(suggestion??{
                left:0,top:0,right:canvas.width,bottom:canvas.height,
                widthMm:width,heightMm:height,confidence:"low",
                reason:"Outer boundary not detected. Manually adjust crop edges and enter physical measurements. The A4 scanner canvas is not the passbook."
              });
              setScanFrame({pixelWidth:canvas.width,pixelHeight:canvas.height,paperWidthMm:width,paperHeightMm:height});
            }
            canvas.width=0;canvas.height=0;
          } catch {
            setScanSuggestion(null);setScanFrame(null);
          }
        } else setScanSuggestion(null);
        // Mixed scans may report the same header twice: once as native PDF
        // text and once through OCR. Only exact overlapping OCR duplicates are
        // removed; distinct overprinted customer values stay independently editable.
        const reviewedImport=reconcileImportedText(elements);
        elements.splice(0,elements.length,...reviewedImport.elements);
        const overlapList = findOverlappingPassbookText(textForOverlapReview(elements),150);
        setCollisions(overlapList);
        const suggestions = elements.flatMap(part => {
          const hint=suggestPassbookLabel(part.label);
          return hint ? [{id:part.id,label:part.label,fieldKey:hint.fieldKey,source:hint.source,page:part.page||1}] : [];
        });
        setSuggestedLabels(suggestions);
        // No bank's paper is assumed preprinted. All suggested labels start
        // UNCLASSIFIED until each is positively reviewed by the user.
        setConfirmedPreprinted({});
        const overlappingPairs = overlapList.length;
        setScanHasImportedObjects(elements.length>0);
        if(elements.length) {
          modify(current => ({
            ...current,
            pageCount,
            sourceArtworkStatus:sourceGraphicsWarnings.length?"needsReview":"clean",
            widthMm: scannedA4 && mode === "passbook" ? current.widthMm : width,
            heightMm: scannedA4 && mode === "passbook" ? current.heightMm : height,
            elements,
          }));
        } else {
          // A scan without a usable OCR engine must not silently replace existing
          // local work, nor assign its old fields to a newly uploaded bank PDF.
          setReferenceVisible(true);
        }
        setSelectedPage(1);
        setSelectedId(elements[0]?.id || null);
        setNotice(elements.length ?
          "Imported " + elements.length + " editable objects across "+pageCount+" PDF pages (OCR suggestions: "+recognizedFromScan+", suppressed exact duplicate OCR: "+reviewedImport.duplicateOcrCount+", vector shapes: "+recognizedGraphics+"). " + (overlappingPairs ? overlappingPairs + " possible overlapping text pairs; inspect and split layers manually. " : "") + "Graphics, OCR and actual passbook boundaries still require verification." :
          "No readable PDF text found. "+(ocrStatus||"Optional on-device OCR was unable to identify text.")+" Existing draft was preserved; reference overlay and manual crop/calibration remain available.");
        if (scannedA4 && mode === "passbook" && elements.length) setNotice("A4 scanner canvas detected. This is NOT the physical passbook size; enter/verify actual dimensions. " + elements.length + " editable text objects imported. "+(ocrStatus||""));
      } finally { await task.destroy(); }
    } catch (error) {
      setNotice("PDF could not be read: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally { setBusy(false); }
  };

  const importPdf=(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];event.target.value="";
    if(file)void importPdfFile(file);
  };
  const importWordFile=async(file:File)=>{
    if(busy)return;
    setBusy(true);
    setNotice("Reading local Word document. The original file stays on this device.");
    try{
      const result=await importWordDocx(file);
      if(!result.paragraphs.length)throw Error("No editable text found. Check the document or create a new layout.");
      const nextParts:LayoutPart[]=[];
      let y=12,dropped=0;
      const usableHeight=draft.heightMm-12;
      for(const paragraph of result.paragraphs){
        const lines=paragraph.text.split("\n").length+Math.ceil(paragraph.text.length/54)-1;
        const height=within(Math.max(9,lines*4.4),9,40);
        if(y+height>usableHeight||nextParts.length>=280){dropped++;continue;}
        const part=addPart("text","static",paragraph.text,"",12,y);
        part.width=Math.max(30,draft.widthMm-24);
        part.height=height;part.align=paragraph.align;part.page=1;
        part.dotMatrix=setup.output==="dotmatrix";
        part.needsReview=true; // Unverified Word text must never leak through generic Master catalog.
        part.z=nextParts.length+1;
        nextParts.push(part);y+=height+3;
      }
      if(!nextParts.length)throw Error("Word text does not fit this paper. Correct the physical measurements first.");
      modify(current=>({...startBlankLayout(current),elements:nextParts,
        sourceArtworkStatus:result.warnings.length?"needsReview":"clean"}));
      setSelectedId(nextParts[0].id);setWordSelectedIds([nextParts[0].id]);
      setSelectedPage(1);setReferencePages([]);setGraphicWarnings(result.warnings);
      setPhysicalChecked(false);setLabelChecked(false);setHardwareChecked(false);
      setNotice(nextParts.length+" editable Word paragraph(s) imported. Every line needs review before Master approval. "+
        (dropped?dropped+" paragraph(s) did not fit the measured page. ":"")+
        result.warnings.join(" "));
    }catch(error){setNotice("Word import could not be completed: "+(error instanceof Error?error.message:"Invalid file"));}
    finally{setBusy(false);}
  };
  useEffect(()=>{
    if(initialImportRef.current)return;
    initialImportRef.current=true;
    if(setup.method==="continue")return;
    editingRef.current=true;
    if(setup.method==="blank"){
      modify(current=>startBlankLayout(current));
      setNotice("New blank document created. Choose fields, design your page, then review it.");
    }else if(setup.method==="pdf"&&setup.file){void importPdfFile(setup.file);}
    else if(setup.method==="word"&&setup.file){void importWordFile(setup.file);}
  // A wizard selection is immutable for the life of this keyed studio instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const down=(event:ReactPointerEvent<HTMLDivElement>,part:LayoutPart)=>{
    if(event.button!==0)return;
    event.preventDefault();event.stopPropagation();
    if(event.ctrlKey||event.metaKey||event.shiftKey){selectWordObject(part,true);return;}
    const ids=liveWordIds.length>1&&liveWordIds.includes(part.id)?liveWordIds:wordGroupIds(draft.elements,part);
    setWordSelectedIds(ids);setSelectedId(part.id);
    const members=draft.elements.filter(p=>ids.includes(p.id)&&(p.page??1)===selectedPage);
    if(members.some(p=>p.locked===true))return;
    undoRef.current=[...undoRef.current.slice(-39),draft];redoRef.current=[];
    dragRef.current={id:part.id,pageX:event.clientX,pageY:event.clientY,
      members:members.map(({id,x,y,width,height})=>({id,x,y,width,height}))};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const beginResize=(event:ReactPointerEvent<HTMLDivElement>,part:LayoutPart)=>{
    event.preventDefault();event.stopPropagation();
    if(part.locked)return;
    dragRef.current=null;
    undoRef.current=[...undoRef.current.slice(-39),draft];redoRef.current=[];
    resizeRef.current={id:part.id,pageX:event.clientX,pageY:event.clientY,width:part.width,height:part.height};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragging=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(resizeRef.current){
      const resizing=resizeRef.current;
      const dx=(event.clientX-resizing.pageX)/(PX_PER_MM*zoom);
      const dy=(event.clientY-resizing.pageY)/(PX_PER_MM*zoom);
      setDraft(current=>({...current,elements:current.elements.map(part=>part.id!==resizing.id?part:{
        ...part,width:round(within(snapGrid?Math.round((resizing.width+dx)/5)*5:resizing.width+dx,1,Math.max(1,current.widthMm-part.x))),
        height:round(within(snapGrid?Math.round((resizing.height+dy)/5)*5:resizing.height+dy,1,Math.max(1,current.heightMm-part.y)))
      })}));setDirty(true);return;
    }
    const drag=dragRef.current;if(!drag)return;
    const mx=(event.clientX-drag.pageX)/(PX_PER_MM*zoom);
    const my=(event.clientY-drag.pageY)/(PX_PER_MM*zoom);
    const anchor=drag.members.find(p=>p.id===drag.id)??drag.members[0];
    const proposed=smartGuidesEnabled&&!snapGrid?
      smartSnap(drag.members,draft.elements.filter(p=>!drag.members.some(m=>m.id===p.id)),
        mx,my,Math.min(1.5,2/(PX_PER_MM*zoom))):null;
    setActiveGuides(proposed?.guides??[]);
    const snapX=snapGrid?Math.round((anchor.x+mx)/5)*5-anchor.x:proposed?.dx??mx;
    const snapY=snapGrid?Math.round((anchor.y+my)/5)*5-anchor.y:proposed?.dy??my;
    const dx=within(snapX,Math.max(...drag.members.map(p=>-p.x)),
      Math.min(...drag.members.map(p=>draft.widthMm-p.x-p.width)));
    const dy=within(snapY,Math.max(...drag.members.map(p=>-p.y)),
      Math.min(...drag.members.map(p=>draft.heightMm-p.y-p.height)));
    const originals=new Map(drag.members.map(p=>[p.id,p]));
    setDraft(current=>({...current,elements:current.elements.map(p=>{
      const original=originals.get(p.id);
      return original?{...p,x:round(original.x+dx),y:round(original.y+dy)}:p;
    })}));setDirty(true);
  };
  const dragEnd=()=>{dragRef.current=null;resizeRef.current=null;setActiveGuides([]);};

  const toStyle = (part: LayoutPart): React.CSSProperties => ({
    position: "absolute", left: part.x * PX_PER_MM * zoom, top: part.y * PX_PER_MM * zoom,
    width: part.width * PX_PER_MM * zoom, height: part.height * PX_PER_MM * zoom,
    transform: "rotate(" + part.rotation + "deg)", transformOrigin:part.kind==="line"?"0 50%":undefined, zIndex: part.z + 1000,
    fontFamily: part.font, fontSize: part.size * zoom, fontWeight: part.bold ? 700 : 400,
    fontStyle: part.italic ? "italic" : "normal", textDecoration: part.underline ? "underline" : "none",
    textAlign: part.align, color: part.color, background: part.background, borderColor: part.borderColor,
    borderWidth: ["rectangle","photo","ellipse","image"].includes(part.kind) ? part.borderWidth * zoom : 0,
    borderStyle: "solid", opacity: part.opacity, borderRadius:part.kind==="ellipse"?"50%":undefined,
  });
  const partText = (part: LayoutPart) => {
    if (part.kind === "photo") return "PHOTO";
    if(part.kind==="image")return part.fieldKey==="bankLogo"?"BANK LOGO":"";
    if (part.kind === "rectangle" || part.kind === "line" || part.kind === "ellipse") return "";
    if (temporaryValues[part.id] !== undefined && (part.origin === "customer" || part.origin === "bank" || part.origin === "dotmatrix")) return temporaryValues[part.id];
    return part.origin === "customer" || part.origin === "bank" || part.origin === "dotmatrix"
      ? (part.origin === "customer" && previewCustomer?layoutCustomerValue(previewCustomer,part.fieldKey):"") ||
        (part.origin === "bank" && bankValues[part.fieldKey]) || part.value || part.defaultValue || "[" + (part.fieldKey || part.label) + "]" : part.label;
  };
  const displayPart=(part:LayoutPart)=>{
    if(part.kind!=="text"&&part.kind!=="field")return partText(part);
    return <span style={compressedTextStyle(part,zoom)}>{partText(part)}</span>;
  };
  const mapPointer=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    return {x:round(within((event.clientX-bounds.left)/(PX_PER_MM*zoom),0,draft.widthMm)),
      y:round(within((event.clientY-bounds.top)/(PX_PER_MM*zoom),0,draft.heightMm))};
  };
  const finishMapping=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const start=mapStartRef.current;
    if(!mappingSource||!start)return;
    mapStartRef.current=null;
    const end=mapPointer(event);
    const x=within(Math.min(start.x,end.x),0,draft.widthMm-10);
    const y=within(Math.min(start.y,end.y),0,draft.heightMm-8);
    const width=round(within(Math.abs(end.x-start.x),10,draft.widthMm-x));
    const height=round(within(Math.abs(end.y-start.y),8,draft.heightMm-y));
    if(draft.elements.length>=300){setNotice("Maximum layout elements reached.");setMappingSource(null);setMapPendingRect(null);return;}
    const key=mappingSource==="customer"?"name":(Object.keys(bankValues).sort()[0]||"branchName");
    const part=addPart("field",mappingSource,mappingSource==="customer"?"Customer Data":"Bank Information",key,x,y);
    part.width=width;part.height=height;part.page=selectedPage;part.z=Math.max(0,...draft.elements.map(item=>item.z))+1;
    modify(current=>({...current,elements:[...current.elements,part]}));
    setSelectedId(part.id);setWordSelectedIds([part.id]);setShowProps(true);
    setMappingSource(null);setMapPendingRect(null);
    setNotice("Field box created. Choose its exact field key in the Properties panel on the right.");
  };
  const selectionLabel = (part: LayoutPart) => part.label || part.fieldKey || part.kind;
  const field = (label: string, node: React.ReactNode) => <label className="ls-field"><span>{label}</span>{node}</label>;
  const number = (value: number, update: (next: number) => void, min = -1000, max = 1000, step = 1) => <input type="number" value={value} min={min} max={max} step={step} onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next)) update(within(next, min, max)); }} />;
  return <section className={"layout-studio ls-view-"+workspaceView+(easyMode?" ls-guided":" ls-advanced")} aria-label={mode === "passbook" ? "Customize Passbook" : "Customize Account Opening Form"}>
    <header className="ls-header">
      <button type="button" className="ls-wizard-link" onClick={onBackToSetup}>← Bank / Method / Print Type</button>
      <button type="button" onClick={()=>setEasyMode(mode=>!mode)}>{easyMode?"Advanced Tools":"Easy Tools"}</button>
      <div className="ls-heading">
        <span className="ls-brand-mark" aria-hidden="true">BS</span>
        <div className="ls-heading-copy">
          <p className="ls-eyebrow">BANK SETU · WINDOWS DOCUMENT STUDIO</p>
          <h2>{mode === "passbook" ? "Passbook Layout Studio" : "Account Opening Layout Studio"}</h2>
          <p>Design precise, editable layouts using real paper dimensions. <strong>{bankName || "Select a bank in Bank Information"}</strong></p>
          <div className="ls-status-tags" aria-label="Current editor configuration">
            <span>Windows EXE</span><span>Local draft</span>
            <span>{draft.widthMm} × {draft.heightMm} mm</span>
            <span>{draft.elements.length} elements</span>
          </div>
        </div>
      </div>
      <div className="ls-header-utilities">
      <div className="ls-header-main-actions"><button type="button" className="ls-primary" onClick={()=>{setWorkspaceView("design");void startFromBlank();}}>New Blank Layout (Word-style)</button><button type="button" onClick={()=>{const result=auditPassbookTemplate(draft);setAudit(result);setNotice("Draft audit: "+result.filter(x=>x.severity==="error").length+" errors, "+result.filter(x=>x.severity==="warning").length+" warnings. Hardware proof is still required.");}}>Run Layout Audit</button><button type="button" className="ls-primary" disabled={savingLayout} onClick={()=>{void save();}}>{savingLayout?"Saving/Syncing…":"Save Draft to Offline DB"}{dirty ? " *" : ""}</button><button type="button" disabled={savingLayout||busy} onClick={()=>{void syncNow();}}>Sync/Recover Layouts</button></div>
      <details className="ls-header-extra">
        <summary>More tools & exports <span aria-hidden="true">⌄</span></summary>
        <div className="ls-header-extra-actions">
          <label className="ls-file-action">Restore Layout Backup (JSON)<input type="file" accept=".json,application/json"
            onChange={event=>{void restoreDraftBackup(event);}}/></label>
          <button type="button" onClick={undo} disabled={!undoRef.current.length}>↶ Undo</button><button type="button" onClick={redo} disabled={!redoRef.current.length}>↷ Redo</button><button type="button" onClick={() => {setTemporaryValues({});setNotice("Temporary print edits cleared; saved layout and customer records were unchanged.");}}>Clear Temporary Edits</button><button type="button" onClick={exportJson}>Export JSON</button><button type="button" disabled={busy} onClick={() => {void proofPdf();}}>Export {preview === "quick" ? "Quick" : "Dot Matrix"} Proof PDF</button><button type="button" disabled={busy} onClick={()=>{void calibrationPdf();}}>Export Physical Calibration Ruler (No Print)</button>
        {mode==="passbook" && <button type="button" disabled={busy} onClick={()=>{void verifyPr2Raster();}}>Check PR2 Raster (No Print)</button>}</div>
      </details>
    </div>
    </header>
    <nav className="ls-workflow-nav" aria-label="Layout Studio workspace">
      <button type="button" aria-pressed={workspaceView==="design"} onClick={()=>setWorkspaceView("design")}>
        <span className="ls-workflow-number">01</span><span><strong>Design workspace</strong><small>Paper setup, PDF import and visual editing</small></span>
      </button>
      <button type="button" aria-pressed={workspaceView==="library"} onClick={()=>setWorkspaceView("library")}>
        <span className="ls-workflow-number">02</span><span><strong>Templates & approval</strong><small>Master review, activation and rollback</small></span>
      </button>
    </nav>
    <div className="ls-workflow-context">
      <span className="ls-workflow-indicator" aria-hidden="true"></span>
      {workspaceView==="design"
        ?"Edit locally with rulers, field mapping and live paper preview. Save a draft before seeking approval."
        :"Review generic bank templates and activation history. Hardware calibration is required before production use."}
    </div>
    {mappingSource&&<div className="ls-map-alert" role="status">Drag a box on the passbook paper, then choose the correct {mappingSource} field in Properties.
      <button type="button" onClick={()=>{setMappingSource(null);mapStartRef.current=null;setMapPendingRect(null);}}>Cancel mapping</button>
    </div>}
    <div className="ls-preview-strip" role="group" aria-label="Read-only customer preview and draft status">
      <button type="button" onClick={()=>{if(previewOpen)setPreviewOpen(false);else void loadPreviewCustomers();}}>👁 {previewOpen?"Hide Customer Preview":"Preview with Customer Data"}</button>
      {previewOpen&&<label>Customer <select value={previewCustomerKey} onChange={e=>setPreviewCustomerKey(e.target.value)}>
        {previewCustomers.map(item=><option key={item.key} value={item.key}>{item.display}</option>)}
      </select></label>}
      <small role="status">{autosaveStatus}</small>
    </div>
    <div className="ls-notice" role="status">{busy ? "Processing PDF… " : ""}{notice}</div>
    {(graphicWarnings.length>0||draft.sourceArtworkStatus==="needsReview") && <div className="ls-audit" role="group" aria-label="Original PDF graphics review">
      <strong>Source PDF artwork requires review — {graphicWarnings.length} warning(s)</strong>
      <p>Scanned page art, gradients, fonts and clipping cannot be silently treated as editable vectors. Check the in-memory original overlay. No uploaded customer image is shared.</p>
      {graphicWarnings.slice(0,12).map((warning,index)=><p key={index}>{warning}</p>)}
      <label><input type="checkbox" checked={draft.sourceArtworkStatus==="reviewed"} onChange={event=>
          modify(current=>({...current,sourceArtworkStatus:event.target.checked?"reviewed":"needsReview"}))}/>
        I checked the source PDF and manually recreated any REQUIRED unsupported artwork before template submission.</label>
    </div>}
    {pr2Proof && <details className="ls-audit"><summary>Unapproved dot-matrix proof — existing PR2 renderer</summary>
      <p>This does not certify physical Epson alignment or authorize production printing.</p>
      <img alt="Black and white draft PR2 raster preview" src={pr2Proof} style={{maxWidth:"100%",maxHeight:400,objectFit:"contain"}}/>
      <button type="button" onClick={()=>setPr2Proof("")}>Clear raster proof</button>
    </details>}
    {audit && <div className="ls-audit" role="status">
      <strong>Layout Audit · {audit.filter(item=>item.severity==="error").length} errors · {audit.filter(item=>item.severity==="warning").length} warnings</strong>
      {audit.length?audit.slice(0,35).map((item,i)=><div key={i} className="ls-audit-row">
        <strong>{item.severity==="error"?"Error":"Review"}</strong><span>{item.message}</span>
        {item.elementId && <button type="button" onClick={()=>{const element=draft.elements.find(x=>x.id===item.elementId);setSelectedId(item.elementId||null);if(element)setSelectedPage(element.page||1);}}>Select field</button>}
      </div>):<p>No static audit issues detected. Real PDF comparison and physical passbook printer tests are still required.</p>}
      <button type="button" onClick={()=>setAudit(null)}>Close Audit</button>
    </div>}
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
          <div className="ls-actions"><button type="button" onClick={()=>{setWorkspaceView("design");void useCatalogTemplate(catalogChoice);}}>Use This Template</button>{canSubmit && <button type="button" disabled={busy} onClick={()=>{void selectApprovedTemplate("activate",catalogChoice.id);}}>Activate Verified Template</button>}
             <button type="button" onClick={()=>{setCatalogChoice(null);setCatalogOpen(false);}}>No, Upload My Own PDF</button></div>
        </div>}
      </>}
      <div className="ls-actions">
        {canSubmit && <>
          <label><input type="checkbox" checked={physicalChecked} onChange={event=>setPhysicalChecked(event.target.checked)}/> I measured the real passbook, fold and print start</label>
          <label><input type="checkbox" checked={labelChecked} onChange={event=>setLabelChecked(event.target.checked)}/> I verified which labels are already printed</label>
           <label><input type="checkbox" checked={hardwareChecked} onChange={event=>setHardwareChecked(event.target.checked)}/> I performed an actual physical printer calibration and checked alignment</label>
          <button type="button" disabled={busy} onClick={()=>{void submitForReview();}}>Submit Generic Template for Master Review</button>
        </>}
        {canSubmit && <div className="ls-selection-status">
           <strong>Workspace Layout Selection</strong>
           <span>{layoutSelection?.active ? "Approved template "+layoutSelection.template?.id+" · revision "+layoutSelection.revision : "Custom layout not active. Existing bank print layout is unchanged."}</span>
           <button type="button" disabled={busy||!layoutSelection?.active} onClick={()=>{void selectApprovedTemplate("rollback");}}>Rollback Version</button>
           <button type="button" disabled={busy||!layoutSelection?.active} onClick={()=>{void selectApprovedTemplate("disable");}}>Disable Custom Layout</button>
           <button type="button" onClick={()=>{void refreshSelection();}}>Refresh</button>
          </div>}
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
    <section className="ls-tool-collection" aria-label="Document tools">
      <div className="ls-tool-card ls-tool-primary">
        <div className="ls-tool-heading"><span className="ls-tool-icon" aria-hidden="true">01</span><div><strong>Start & Import</strong><small>Choose your source document and graphics</small></div></div>
        <div className="ls-ribbon" role="toolbar" aria-label="Import source document">
      <label className="ls-file-action">Upload PDF<input type="file" accept=".pdf,application/pdf" disabled={busy} onChange={event => { void importPdf(event); }} /></label><label className="ls-file-action">＋ Logo / Graphic<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>{void importGraphic(event);}} /></label>
        </div>
      </div>
      <div className="ls-tool-card ls-tool-primary">
        <div className="ls-tool-heading"><span className="ls-tool-icon" aria-hidden="true">02</span><div><strong>Text & Customer Data</strong><small>Common fields used on passbooks</small></div></div>
        <div className="ls-ribbon" role="toolbar" aria-label="Add text and customer fields">
      <button type="button" onClick={() => append("text", "static", "New text")}>＋ Text</button>
      <button type="button" onClick={() => append("text", "preprinted", "Preprinted Label")}>＋ Label</button>
      <button type="button" onClick={() => append("field", "customer", "Customer Field", "customerName")}>＋ Customer</button>
      <button type="button" onClick={() => append("field", "bank", "Bank Information", "branchName")}>＋ Bank Field</button>
      <button type="button" aria-pressed={mappingSource==="customer"} onClick={()=>setMappingSource("customer")}>Draw Customer Data Box</button>
      <button type="button" aria-pressed={mappingSource==="bank"} onClick={()=>setMappingSource("bank")}>Draw Bank Data Box</button>
        </div>
      </div>
      <details className="ls-tool-card ls-tool-secondary">
        <summary><span className="ls-tool-icon" aria-hidden="true">03</span><span><strong>Graphics & Shapes</strong><small>Photo, logo, boxes, circles and lines</small></span><span aria-hidden="true">⌄</span></summary>
        <div className="ls-ribbon" role="toolbar" aria-label="Insert graphics and shapes">
      <button type="button" onClick={() => append("text", "dotmatrix", "Dot Matrix Field", "custom")}>＋ Dot Matrix</button>
      <button type="button" onClick={() => append("photo", "static", "Photo Box")}>▣ Photo Box</button><button type="button" onClick={() => { const part=addPart("image","bank","Bank Logo","bankLogo",15,18);part.width=38;part.height=25;part.dotMatrix=false;part.page=selectedPage;modify(current=>({...current,elements:[...current.elements,part]}));setSelectedId(part.id);}}>▣ Bank Logo Field</button>
      <button type="button" onClick={() => append("rectangle", "static", "Box")}>▢ Rectangle</button>
      <button type="button" onClick={() => append("ellipse", "static", "Circle / Oval")}>◯ Ellipse</button>
      <button type="button" onClick={() => append("line", "static", "Line")}>─ Line</button>
      <button type="button" onClick={() => append("text", "static", "Branch Manager")}>＋ Manager</button>
      <button type="button" onClick={() => append("text", "static", "Instructions")}>＋ Instructions</button>
        </div>
      </details>
    </section>
    {(suggestedLabels.length>0 || collisions.length>0) && <div className="ls-inference-panel">
      <strong>Review PDF labels and overlapping lines (not automatically approved)</strong>
      <p>{suggestedLabels.length} possible bank/customer labels · {collisions.length} possible overlapping text pairs. OCR can miss printed layers; confirm the physical passbook.</p>
      <fieldset className="ls-rule-fieldset"><legend>Which labels are already printed on original paper?</legend>
        <label><input type="radio" checked={printedLabelRule==="all"} onChange={()=>setPrintedLabelRule("all")}/> All suggested labels</label>
        <label><input type="radio" checked={printedLabelRule==="none"} onChange={()=>setPrintedLabelRule("none")}/> No labels</label>
        <label><input type="radio" checked={printedLabelRule==="some"} onChange={()=>setPrintedLabelRule("some")}/> I will verify individually</label>
      </fieldset>
      {suggestedLabels.length>0 && <div className="ls-inference-labels">
        {suggestedLabels.map(item=><div key={item.id} className="ls-inference-item">
          <span>{item.label} → <strong>{item.fieldKey}</strong> ({item.source}, page {item.page})</span>
          {printedLabelRule==="some" && <label>Paper layer classification
            <select aria-label={"Preprinted status for "+item.label}
              value={Object.prototype.hasOwnProperty.call(confirmedPreprinted,item.id)?(confirmedPreprinted[item.id]?"yes":"no"):"unknown"}
              onChange={event=>setConfirmedPreprinted(current=>{
                const next={...current};
                if(event.target.value==="unknown")delete next[item.id];
                else next[item.id]=event.target.value==="yes";
                return next;
              })}>
              <option value="unknown">Not reviewed</option>
              <option value="yes">Yes — already on paper</option>
              <option value="no">No — print label with values</option>
            </select>
          </label>}
          <button type="button" onClick={()=>{setSelectedPage(item.page);setSelectedId(item.id);setPreview("quick");}}>Inspect</button>
        </div>)}
      </div>}
      <button type="button" onClick={()=>{
        if(printedLabelRule==="some" && suggestedLabels.some(item=>!Object.prototype.hasOwnProperty.call(confirmedPreprinted,item.id))){
          setNotice("Classify EVERY suggested label explicitly as already printed or required in dot-matrix; no unchecked box is treated as approval.");return;
        }
        if(suggestedLabels.some(hint=>draft.elements.find(part=>part.id===hint.id)?.needsReview)){
          setNotice("Correct and review all OCR lines before creating automatic field mappings.");return;
        }
        let added=0;
        modify(current=>{
          const next=current.elements.map(part=>({...part}));const existing=new Set(next.filter(p=>p.kind==="field").map(p=>(p.page||1)+":"+p.fieldKey));
          for(const hint of suggestedLabels){
            if(next.length>=300)break;
            const label=next.find(p=>p.id===hint.id);if(!label)continue;
            const printed=printedLabelRule==="all" || (printedLabelRule==="some" && confirmedPreprinted[hint.id]===true);
            Object.assign(label,{origin:printed?"preprinted":"static",preprinted:printed,dotMatrix:!printed,quick:true});
            const key=hint.page+":"+hint.fieldKey;
            if(existing.has(key))continue;
            const fieldPart=addPart("field",hint.source,hint.label,hint.fieldKey,round(within(label.x+label.width+2,0,current.widthMm-20)),label.y);
            fieldPart.page=hint.page;fieldPart.width=Math.max(18,Math.min(75,current.widthMm-fieldPart.x));fieldPart.dotMatrix=true;fieldPart.quick=true;
            fieldPart.defaultValue="";fieldPart.value="";fieldPart.z=next.length+1;
            next.push(fieldPart);existing.add(key);added++;
          }
          return {...current,elements:next};
        });
        setSuggestedLabels([]);setNotice("Field suggestions applied to local DRAFT ("+added+" dynamic value boxes added). Inspect print labels and coordinates; physical accuracy is not guaranteed.");
      }}>Apply reviewed suggestions to Draft</button>
      {collisions.length>0 && <div className="ls-inference-labels">{collisions.slice(0,16).map((collision,i)=><div key={i} className="ls-inference-item">
        <span>Page {collision.page}: possible overlap {collision.intersectionMm} mm</span>
        <button type="button" onClick={()=>{setSelectedPage(collision.page);setSelectedId(collision.firstId);}}>Select first layer</button>
        <button type="button" onClick={()=>{setSelectedPage(collision.page);setSelectedId(collision.secondId);}}>Second layer</button>
      </div>)}</div>}
    </div>}
    <details className="ls-tool-card ls-word-suite">
      <summary><span className="ls-tool-icon" aria-hidden="true">W</span><span><strong>MS Word-style Tools</strong><small>Font, paragraph, spacing, Find & Replace, group, align and arrange</small></span><span aria-hidden="true">⌄</span></summary>
      <p className="ls-tool-note">Select a text object to format it. Select multiple objects for precise arrangement. These are the supported Word-style tools, not full Microsoft Word.</p>
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
      <button type="button" title="Justify paragraph" aria-pressed={selected.align==="justify"} onClick={()=>edit({align:"justify"})}>Justify</button>
      <label>Line spacing <select aria-label="Line spacing ratio" value={selected.lineHeight??1.18} onChange={event=>edit({lineHeight:Number(event.target.value)})}>
        {[.8,1,1.15,1.18,1.5,2,2.5,3].map(n=><option key={n} value={n}>{n}×</option>)}
      </select></label>
      <label>Letter gap <select aria-label="Letter spacing px" value={selected.letterSpacing??0}
        onChange={event=>edit({letterSpacing:Number(event.target.value)})}>
        {Array.from({length:21},(_,i)=>i*.5).map(n=><option key={n} value={n}>{n} px</option>)}
        {!Array.from({length:21},(_,i)=>i*.5).includes(selected.letterSpacing)&&
         <option value={selected.letterSpacing}>Legacy {selected.letterSpacing} px</option>}
      </select></label>
      <label>Font compress <select aria-label="Font compression percent" value={selected.fontCompression??100}
        onChange={event=>edit({fontCompression:Number(event.target.value)})}>
        {Array.from({length:11},(_,i)=>50+i*5).map(n=><option key={n} value={n}>{n}%</option>)}
        {!Array.from({length:11},(_,i)=>50+i*5).includes(selected.fontCompression??100)&&
         <option value={selected.fontCompression}>{selected.fontCompression}%</option>}
      </select></label>
      <label>Text color <input type="color" aria-label="Text color" value={selected.color} onChange={event => edit({color:event.target.value})}/></label>
    </div>}
    <div className="ls-word-gaps" role="group" aria-label="Find and replace generic labels">
      <strong>Find / Replace static text</strong>
      <label>Find <input type="text" maxLength={200} value={findWord} onChange={e=>setFindWord(e.target.value)} placeholder="Search editable label"/></label>
      <label>Replace with <input type="text" maxLength={500} value={replaceWord} onChange={e=>setReplaceWord(e.target.value)} placeholder="New label text"/></label>
      <label><input type="checkbox" checked={findAllPages} onChange={e=>setFindAllPages(e.target.checked)}/> All pages</label>
      <button type="button" onClick={()=>{
        const hits=findEditableLabels(draft.elements,findWord,findAllPages?undefined:selectedPage);
        if(hits.length){setSelectedId(draft.elements[hits[0]].id);setWordSelectedIds([draft.elements[hits[0]].id]);setSelectedPage(draft.elements[hits[0]].page??1);}
        setNotice(hits.length+" editable text object(s) found. Customer fields and preprinted layers are excluded.");
      }}>Find</button>
      <button type="button" onClick={()=>{
        try{
          const result=replaceEditableLabels(draft.elements,findWord,replaceWord,findAllPages?undefined:selectedPage);
          if(result.changed){modify(current=>({...current,elements:result.parts}));setPhysicalChecked(false);setHardwareChecked(false);}
          setNotice(result.changed+" static label occurrence(s) replaced. Recheck physical layout before approval.");
        }catch(error){setNotice(error instanceof Error?error.message:"Cannot replace text.");}
      }}>Replace all</button>
    </div>
    {selected && <div className="ls-word-precision" role="toolbar" aria-label="Word precision tools">
      <strong>Align selected ({selectedWordParts.length})</strong>
      <span className="ls-word-hint">Ctrl/Shift+Click objects or use Ctrl+A · reference = active selected object</span>
      <div className="ls-word-buttons">
        <button type="button" disabled={selectedWordParts.length<2} onClick={()=>applyWordAction({kind:"align",direction:"left",target:"selection"})}>Left edges</button>
        <button type="button" disabled={selectedWordParts.length<2} onClick={()=>applyWordAction({kind:"align",direction:"center",target:"selection"})}>Horizontal centers</button>
        <button type="button" disabled={selectedWordParts.length<2} onClick={()=>applyWordAction({kind:"align",direction:"right",target:"selection"})}>Right edges</button>
        <button type="button" disabled={selectedWordParts.length<2} onClick={()=>applyWordAction({kind:"align",direction:"top",target:"selection"})}>Top edges</button>
        <button type="button" disabled={selectedWordParts.length<2} onClick={()=>applyWordAction({kind:"align",direction:"middle",target:"selection"})}>Vertical centers</button>
        <button type="button" disabled={selectedWordParts.length<2} onClick={()=>applyWordAction({kind:"align",direction:"bottom",target:"selection"})}>Bottom edges</button>
        <button type="button" disabled={selectedWordParts.length<2} onClick={()=>applyWordAction({kind:"align",direction:"baseline",target:"selection"})}>Baseline</button>
        <button type="button" disabled={selectedWordParts.length<3} onClick={()=>applyWordAction({kind:"distribute",axis:"horizontal"})}>Distribute horizontally</button>
        <button type="button" disabled={selectedWordParts.length<3} onClick={()=>applyWordAction({kind:"distribute",axis:"vertical"})}>Distribute vertically</button>
        <button type="button" disabled={selectedWordParts.length<2} onClick={()=>applyWordAction({kind:"size",dimension:"width"})}>Equal width</button>
        <button type="button" disabled={selectedWordParts.length<2} onClick={()=>applyWordAction({kind:"size",dimension:"height"})}>Equal height</button>
        <button type="button" disabled={selectedWordParts.length<2} onClick={()=>applyWordAction({kind:"size",dimension:"both"})}>Equal size</button>
      </div>
      <div className="ls-word-gaps">
        <label>Exact gap (mm) <input type="number" min={0} max={50} step={.1} value={wordGapMm}
          onChange={event=>{const value=Number(event.target.value);if(Number.isFinite(value)&&value>=0&&value<=50)setWordGapMm(value);}}/></label>
        <button type="button" disabled={selectedWordParts.length<2} onClick={()=>applyWordAction({kind:"distribute",axis:"horizontal",gapMm:wordGapMm})}>Horizontal exact gap</button>
        <button type="button" disabled={selectedWordParts.length<2} onClick={()=>applyWordAction({kind:"distribute",axis:"vertical",gapMm:wordGapMm})}>Vertical exact gap</button>
        <button type="button" disabled={selectedWordParts.length<2} onClick={groupWordSelection}>Group</button>
        <button type="button" disabled={!selectedWordParts.some(p=>p.groupId)} onClick={ungroupWordSelection}>Ungroup</button>
        <button type="button" disabled={selectedWordParts.length===0||selectedWordParts.every(p=>p.locked)} onClick={()=>lockWordSelection(true)}>Lock</button>
        <button type="button" disabled={!selectedWordParts.some(p=>p.locked)} onClick={()=>lockWordSelection(false)}>Unlock</button>
        <button type="button" disabled={selectedWordParts.some(p=>p.locked)} onClick={deleteWordSelection}>Delete selected</button>
      </div>
    </div>}
    </details>
    {scanSuggestion && scanFrame && <div className="ls-scan-proposal" role="group" aria-label="Global scan calibration">
      <strong>Bank-independent scan calibration (unverified)</strong>
      {referencePages[0] && <div className="ls-scan-preview" style={{aspectRatio:scanFrame.pixelWidth+"/"+scanFrame.pixelHeight}}>
        <img src={referencePages[0]} alt="Local original PDF page; dotted selection marks proposed passbook crop" draggable={false}/>
        {scanPerspective&&scanCornerPercents ?
          <svg className="ls-scan-quad" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points={scanCornerPercents.map(point=>point.x+","+point.y).join(" ")}
              fill="rgba(214,64,69,.10)" stroke="#d64045" strokeWidth=".6" strokeDasharray="1.5 1"/>
          </svg> :
          <div className="ls-scan-selection" aria-hidden="true" style={{
            left:(scanSuggestion.left/scanFrame.pixelWidth*100)+"%",
            top:(scanSuggestion.top/scanFrame.pixelHeight*100)+"%",
            width:((scanSuggestion.right-scanSuggestion.left)/scanFrame.pixelWidth*100)+"%",
            height:((scanSuggestion.bottom-scanSuggestion.top)/scanFrame.pixelHeight*100)+"%"
          }}/>}

      </div>}
      <span>Estimated scan area: {scanSuggestion.widthMm} × {scanSuggestion.heightMm} mm · {scanSuggestion.confidence} confidence</span>
      <span>{scanSuggestion.reason}</span>
      <span>Crop edges (% of scanner PDF). Include the actual passbook's white borders; exclude empty A4 background.</span>
      <label><input type="checkbox" checked={scanPerspective} onChange={event=>{
          const enabled=event.target.checked;setScanPerspective(enabled);
          if(enabled){
            const pct=(value:number,extent:number)=>round(value/extent*100);
            setScanCornerPercents([
              {x:pct(scanSuggestion.left,scanFrame.pixelWidth),y:pct(scanSuggestion.top,scanFrame.pixelHeight)},
              {x:pct(scanSuggestion.right,scanFrame.pixelWidth),y:pct(scanSuggestion.top,scanFrame.pixelHeight)},
              {x:pct(scanSuggestion.right,scanFrame.pixelWidth),y:pct(scanSuggestion.bottom,scanFrame.pixelHeight)},
              {x:pct(scanSuggestion.left,scanFrame.pixelWidth),y:pct(scanSuggestion.bottom,scanFrame.pixelHeight)}
            ]);
          }else setScanCornerPercents(null);
        }}/> Advanced four-corner / trapezoid correction (optional)</label>
      {scanPerspective&&scanCornerPercents && <div className="ls-scan-corner-controls">
        {scanCornerPercents.map((point,index)=><div key={index} className="ls-scan-corner">
          <strong>{["Top left","Top right","Bottom right","Bottom left"][index]}</strong>
          {(["x","y"] as const).map(axis=><label key={axis}>{axis.toUpperCase()} %
            <input type="number" min={0} max={100} step={0.1} value={point[axis]}
              onChange={event=>{
                const value=Number(event.target.value);
                if(!Number.isFinite(value)||value<0||value>100)return;
                setScanCornerPercents(previous=>{
                  if(!previous)return previous;
                  const next=previous.map(p=>({...p})) as PerspectiveQuad;
                  next[index][axis]=value;
                  return next;
                });
              }}/>
          </label>)}
        </div>)}
        <p>Corner order: top left, top right, bottom right, bottom left. Crossing or invalid shapes are blocked before changing the draft. Enter ruler dimensions for accurate physical size.</p>
      </div>}

      <label>Rotate passbook inside scan clockwise (optional)
        <select value={scanOrientation} onChange={event=>setScanOrientation(Number(event.target.value) as 0|90|180|270)}>
          <option value={0}>0° — already upright</option><option value={90}>90°</option>
          <option value={180}>180°</option><option value={270}>270°</option>
        </select>
      </label>
      <span>Rotation also rotates the crop reference and editable first-page coordinates. Sideways scans swap the estimated width and height.</span>
      <label>Fine deskew / tilt correction (clockwise degrees, -8 to +8)
        <input type="number" min={-8} max={8} step={0.1} value={scanFineRotation}
          onChange={event=>{const value=Number(event.target.value);if(Number.isFinite(value)&&value>=-8&&value<=8)setScanFineRotation(value);}}/>
      </label>
      {scanSuggestion.skewHint && <span>Unverified outer-edge tilt suggestion: {scanSuggestion.skewHint.angleDeg}°. Copy this to the manual deskew control only after inspecting the original.</span>}
      <span>A small rotation can clip corners unless you include enough blank paper margin in the crop.</span>
      {(["left","top","right","bottom"] as const).map(edge=><label key={edge}>
        {edge==="left"?"Left edge":edge==="top"?"Top edge":edge==="right"?"Right edge":"Bottom edge"} (%)
        <input type="number" min={0} max={100} step={0.1}
          disabled={scanPerspective}
          value={round(scanSuggestion[edge]/((edge==="left"||edge==="right")?scanFrame.pixelWidth:scanFrame.pixelHeight)*100)}
          onChange={event=>changeScanEdge(edge,Number(event.target.value))}/>
      </label>)}
      <span>Optional physical measurements (leave empty to use scanner estimate). Units: {unit}.</span>
      {(["widthMm","heightMm","foldMm","printStartMm"] as const).map(field=><label key={field}>
        {field==="widthMm"?"Physical width":field==="heightMm"?"Physical height":field==="foldMm"?"Fold from top":"Print start from top"} ({unit})
        <input type="number" min={0} max={500/factor(unit)} step={0.1}
          placeholder={field==="widthMm"?String(valueInUnit(scanSuggestion.widthMm,unit)):
            field==="heightMm"?String(valueInUnit(scanSuggestion.heightMm,unit)):
            field==="foldMm"?(scanSuggestion.foldHint?String(valueInUnit(scanSuggestion.foldHint.foldMm,unit)):"Optional"):"Optional"}
          value={scanMeasurements[field]===null?"":valueInUnit(scanMeasurements[field]!,unit)}
          onChange={event=>changeScanMeasurement(field,event.target.value)}/>
      </label>)}
      {scanSuggestion.foldHint && <span>Possible fold gap: {scanSuggestion.foldHint.foldMm} mm (low confidence). Override if needed. Print start is independent.</span>}
      <button type="button" onClick={() => { void applyScannerSuggestion(); }}>Apply crop and measurements to local draft</button>
      <button type="button" onClick={() => {setScanSuggestion(null);setScanFrame(null);setScanPerspective(false);setScanCornerPercents(null);}}>Skip scan calibration</button>
    </div>}
    <section className="ls-tool-card ls-page-card" aria-label="Page setup">
      <div className="ls-tool-heading"><span className="ls-tool-icon" aria-hidden="true">04</span><div><strong>Page & Preview</strong><small>Measurements, zoom, preview and alignment settings</small></div></div>
    <div className="ls-settings">
      <label>Page <select value={selectedPage} onChange={event=>{setSelectedPage(Number(event.target.value));setSelectedId(null);}}>{Array.from({length:Math.max(1,draft.pageCount||1)},(_,index)=><option key={index} value={index+1}>Page {index+1}</option>)}</select></label>
      <button type="button" onClick={()=>modify(current=>({...current,pageCount:Math.min(10,(current.pageCount||1)+1)}))} disabled={(draft.pageCount||1)>=10}>+ Page</button>
      <label>Units <select value={unit} onChange={event => setUnit(event.target.value as Unit)}><option value="mm">mm</option><option value="cm">cm</option><option value="in">inch</option></select></label>
      <label>Width {number(valueInUnit(draft.widthMm, unit), next => setMeasure("widthMm", String(next)), 0, 500, .1)}</label>
      <label>Height {number(valueInUnit(draft.heightMm, unit), next => setMeasure("heightMm", String(next)), 0, 500, .1)}</label>
      <label>Fold from top {number(valueInUnit(draft.foldMm, unit), next => setMeasure("foldMm", String(next)), 0, 500, .1)}</label>
      <label>Print start {number(valueInUnit(draft.printStartMm, unit), next => setMeasure("printStartMm", String(next)), 0, 500, .1)}</label>
      <button type="button" disabled={diffBusy || !referencePages[selectedPage-1]} onClick={()=>{void compareOriginal();}}>{diffBusy?"Comparing…":"Compare Original vs Editor"}</button>
      {visualDiff && <span title="Only a pixel diagnostic, not bank passbook print certification">Pixel difference {visualDiff.meanDifferencePercent}% · Strong mismatch {visualDiff.strongMismatchPercent}%</span>}
      <label><input type="checkbox" checked={referenceVisible} onChange={event=>setReferenceVisible(event.target.checked)}/> Show Original Reference</label>
      <label>Reference opacity <input aria-label="Original reference opacity" type="range" min={0.1} max={0.9} step={0.1} value={referenceOpacity} onChange={event=>setReferenceOpacity(Number(event.target.value))}/></label>
      <label><input type="checkbox" checked={showRulers} onChange={e=>setShowRulers(e.target.checked)}/> Rulers</label><label><input type="checkbox" checked={showGrid} onChange={e=>setShowGrid(e.target.checked)}/> 5 mm grid</label>
      <label><input type="checkbox" checked={snapGrid} onChange={e=>{setSnapGrid(e.target.checked);if(e.target.checked)setShowGrid(true);}}/> Snap</label>
      <label><input type="checkbox" checked={smartGuidesEnabled} onChange={e=>{setSmartGuidesEnabled(e.target.checked);setActiveGuides([]);}}/> Smart alignment guides</label>
      <label>Zoom <select value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={0.6}>60%</option><option value={0.8}>80%</option><option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label>
      <label>Preview <select value={preview} onChange={event => setPreview(event.target.value as "quick" | "dotmatrix")}><option value="quick">Quick (full artwork)</option><option value="dotmatrix">Dot Matrix (print only)</option></select></label>
    </div>
    </section>
    <div className="ls-workspace">
      <aside className="ls-panel ls-layers">
        <button type="button" className="ls-panel-title" onClick={() => setShowLayers(!showLayers)} aria-expanded={showLayers}>Layers ({draft.elements.length}) {showLayers ? "▾" : "▸"}</button>
        {showLayers && <div className="ls-layer-list">{[...ordered].reverse().map(part => <button key={part.id} type="button" className={selectedId === part.id ? "ls-layer selected" : "ls-layer"} onClick={event=>selectWordObject(part,event.ctrlKey||event.metaKey||event.shiftKey)}><span>{part.kind === "photo" ? "▣" : part.kind === "rectangle" ? "▢" : part.kind === "line" ? "─" : part.origin === "customer" || part.origin === "bank" ? "◇" : "T"}</span><span>{selectionLabel(part)}</span><small>{part.origin}</small></button>)}</div>}
      </aside>
      <div className="ls-canvas-wrap">
        <div className="ls-paper-stage" style={{width:draft.widthMm*PX_PER_MM*zoom}}>
        {showRulers && <div className="ls-ruler-x" aria-hidden="true" style={{width:draft.widthMm*PX_PER_MM*zoom}}>
          {Array.from({length:Math.floor(draft.widthMm/10)+1},(_,index)=>index*10).map(mm=>
            <span key={mm} style={{left:mm*PX_PER_MM*zoom}}>{unit==="mm"?mm:valueInUnit(mm,unit)}</span>)}
        </div>}
        {showRulers && <div className="ls-ruler-y" aria-hidden="true" style={{height:draft.heightMm*PX_PER_MM*zoom}}>
          {Array.from({length:Math.floor(draft.heightMm/10)+1},(_,index)=>index*10).map(mm=>
            <span key={mm} style={{top:mm*PX_PER_MM*zoom}}>{unit==="mm"?mm:valueInUnit(mm,unit)}</span>)}
        </div>}
        <div className="ls-paper" role="application" tabIndex={0} aria-label="Editable passbook page. Select an element then use arrow keys for fine adjustment." style={{width:draft.widthMm * PX_PER_MM * zoom, height:draft.heightMm * PX_PER_MM * zoom,
          backgroundImage:showGrid?"linear-gradient(to right,#b4d7e444 1px,transparent 1px),linear-gradient(to bottom,#b4d7e444 1px,transparent 1px)":undefined,
          backgroundSize:showGrid?(5*PX_PER_MM*zoom)+"px "+(5*PX_PER_MM*zoom)+"px":undefined}} onPointerMove={dragging} onPointerUp={dragEnd} onPointerCancel={dragEnd} onKeyDown={event=>{
          const cmd=event.ctrlKey||event.metaKey,lower=event.key.toLowerCase();
          if(cmd&&lower==="z"){event.preventDefault();if(event.shiftKey)redo();else undo();return;}
          if(cmd&&lower==="y"){event.preventDefault();redo();return;}
          if(cmd&&lower==="a"){
            event.preventDefault();
            const ids=draft.elements.filter(p=>(p.page??1)===selectedPage&&isLayoutLayerPrintable(p,preview,bankName)).map(p=>p.id);
            setWordSelectedIds(ids);setSelectedId(ids[0]??null);return;
          }
          if(cmd&&lower==="g"){event.preventDefault();if(event.shiftKey)ungroupWordSelection();else groupWordSelection();return;}
          if(event.key==="Escape"){setWordSelectedIds([]);setSelectedId(null);return;}
          if(event.key==="Delete"||event.key==="Backspace"){
            if(liveWordIds.length){event.preventDefault();deleteWordSelection();}return;
          }
          if(!selected||!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key))return;
          event.preventDefault();
          const step=event.shiftKey?1:.1;
          const dx=event.key==="ArrowLeft"?-step:event.key==="ArrowRight"?step:0;
          const dy=event.key==="ArrowUp"?-step:event.key==="ArrowDown"?step:0;
          try{
            const next=wordNudge(draft.elements,liveWordIds,{widthMm:draft.widthMm,heightMm:draft.heightMm},dx,dy);
            modify(current=>({...current,elements:next}));setPhysicalChecked(false);setHardwareChecked(false);
          }catch(error){setNotice(error instanceof Error?error.message:"Cannot move selection.");}
        }}>
          {mappingSource&&<div className="ls-map-overlay" role="presentation"
            title="Drag over the paper to create a mapped field box"
            onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();
              const start=mapPointer(event);mapStartRef.current=start;
              setMapPendingRect({...start,width:0,height:0});event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event=>{
              if(!mapStartRef.current)return;
              const start=mapStartRef.current,end=mapPointer(event);
              setMapPendingRect({x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),
                width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)});
            }}
            onPointerUp={event=>{event.stopPropagation();finishMapping(event);}}
            onPointerCancel={()=>{mapStartRef.current=null;setMapPendingRect(null);}}>
            <span className="ls-map-hint">Draw {mappingSource==="customer"?"Customer":"Bank"} Data Box</span>
            {mapPendingRect&&<div className="ls-map-preview" style={{left:mapPendingRect.x*PX_PER_MM*zoom,
              top:mapPendingRect.y*PX_PER_MM*zoom,width:mapPendingRect.width*PX_PER_MM*zoom,
              height:mapPendingRect.height*PX_PER_MM*zoom}}/>}
          </div>}
          {referenceVisible && referencePages[selectedPage-1] && <img data-original-overlay="" aria-hidden="true" alt="" src={referencePages[selectedPage-1]} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"fill",opacity:referenceOpacity,pointerEvents:"none",zIndex:2}}/>}
          {draft.foldMm > 0 && <div className="ls-fold" style={{top:draft.foldMm * PX_PER_MM * zoom}}><span>FOLD</span></div>}
          {draft.printStartMm > 0 && <div className="ls-print-start" style={{top:draft.printStartMm * PX_PER_MM * zoom}}><span>PRINT START</span></div>}
          {activeGuides.map(guide=><div key={guide.axis} aria-hidden="true"
            title={"Aligned to "+guide.targetId}
            style={{position:"absolute",pointerEvents:"none",zIndex:99999,
              ...(guide.axis==="x"?{left:guide.position*PX_PER_MM*zoom,top:0,bottom:0,width:1}:
                {top:guide.position*PX_PER_MM*zoom,left:0,right:0,height:1}),
              background:"#0e9cbe",boxShadow:"0 0 0 1px #ffffff66"}} />)}
          {ordered.map(part => {
            const visible = isLayoutLayerPrintable(part,preview,bankName);
            if (!visible) return null;
            return <div key={part.id} onPointerDown={event => down(event, part)}
              className={"ls-object " + (liveWordIds.includes(part.id) ? "selected " : "") + (part.locked ? "ls-locked " : "") + (part.kind === "line" ? "ls-line " : "") + (part.kind === "photo" ? "ls-photo " : "")}
              style={toStyle(part)} title={part.label + " · " + part.origin}>
              {part.kind==="image" && part.imageData ? <img alt={part.label} draggable={false} src={part.imageData} style={{width:"100%",height:"100%",objectFit:"fill",pointerEvents:"none"}}/> : displayPart(part)}
              {selectedId===part.id && !part.locked && <div className="ls-resize-handle" role="presentation" onPointerDown={event=>beginResize(event,part)} title="Drag to resize element" />}
            </div>;
          })}
        </div>
        </div>
        <p className="ls-canvas-note">Drag objects · Ctrl/Shift+Click: multi-select · Ctrl+A: Select all page objects · Ctrl+G: Group · Ctrl+Shift+G: Ungroup · Arrows: 0.1 mm · Shift+Arrows: 1 mm · Fold markers are guides</p>
      </div>
      <aside className="ls-panel ls-properties">
        <button type="button" className="ls-panel-title" onClick={() => setShowProps(!showProps)} aria-expanded={showProps}>Properties {showProps ? "▾" : "▸"}</button>
        {showProps && (selected ? <div className="ls-properties-body">
          {field(selected.kind==="text"?"Editable text / Paragraph":"Element name / Label",
            selected.kind==="text"?
              <textarea rows={4} value={selected.label} onChange={event=>edit({label:event.target.value})}
                placeholder="Type a paragraph, header or multiple passbook lines here" maxLength={500}/>:
              <input value={selected.label} onChange={event=>edit({label:event.target.value})} />)}
          {(selected.kind==="text"||selected.kind==="field") && <div className="ls-overlap-tools">
            <strong>Unreadable scan line / OCR correction</strong>
            <label><input type="checkbox" checked={selected.needsReview===true}
              onChange={event=>edit({needsReview:event.target.checked})}/>
              We cannot read this line — correction required</label>
            {selected.needsReview && <p role="alert">This text cannot be submitted or published until you compare it with the original scan, correct the label above and mark it reviewed.</p>}
            <button type="button" disabled={!selected.needsReview||!selected.label.trim()||/unreadable|cannot read/i.test(selected.label)}
              onClick={()=>{edit({needsReview:false});setNotice("This OCR line was marked reviewed in the local draft. Check dimensions and print alignment separately.");}}>
              Mark corrected text as reviewed
            </button>
          </div>}
          {field("Element type", <select value={selected.kind} onChange={event => edit({ kind: event.target.value as Kind })}><option value="text">Text / Instructions</option><option value="field">Dynamic Field</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="line">Line</option><option value="photo">Photo Box</option><option value="image">Image</option></select>)}
          {field("Source / Meaning", <select value={selected.origin} onChange={event => {
            const origin=event.target.value as Origin;
            edit({origin,preprinted:origin==="preprinted",
              dotMatrix:origin==="preprinted"?false:
                (origin==="customer"||origin==="bank"||origin==="dotmatrix"?true:selected.dotMatrix)});
            setLabelChecked(false);
          }}><option value="static">Static / Graphic text</option><option value="preprinted">Already printed on paper</option><option value="customer">Customer Data</option><option value="bank">Bank Information</option><option value="dotmatrix">Dot Matrix Data / Label</option></select>)}
          {field("Mapped field key", selected.origin==="customer"?
            <select value={selected.fieldKey} onChange={event=>edit({fieldKey:event.target.value})}>
              {!customerFieldKeys.includes(selected.fieldKey)&&<option value={selected.fieldKey}>{selected.fieldKey||"Choose customer field"}</option>}
              {customerFieldKeys.map(key=><option value={key} key={key}>{key}</option>)}
            </select>:
            <input value={selected.fieldKey} onChange={event => edit({ fieldKey: event.target.value })} placeholder="e.g. branchName" list={selected.origin==="bank" ? "ls-bank-fields" : undefined} />)}
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
            {field("Second layer description (generic label only)", <input value={splitSecondLine} onChange={event=>setSplitSecondLine(event.target.value)} placeholder="Account Number / खाता संख्या" />)}
            {field("Second layer data source", <select value={splitSecondSource} onChange={event=>setSplitSecondSource(event.target.value as "customer"|"bank")}>
              <option value="customer">Current customer data</option><option value="bank">Selected bank information</option>
            </select>)}
            {field("Second layer field key (mandatory)", <input value={splitSecondKey} onChange={event=>setSplitSecondKey(event.target.value)} placeholder="accountNo / customerName / ifsc" list={splitSecondSource==="bank"?"ls-bank-fields":undefined}/>)}
            <button type="button" disabled={!splitSecondLine.trim()||!splitSecondKey.trim()} onClick={() => {
              if(!selected)return;
              if(draft.elements.length>=300){setNotice("Draft review limit reached; remove unused elements before splitting.");return;}
              if(draft.elements.some(part=>(part.page??1)===(selected.page??1)&&part.kind==="field"&&part.fieldKey===splitSecondKey.trim())){
                setNotice("That field is already mapped on this page. Select and reposition the existing field.");return;
              }
              try {
                const result=splitPreprintedAndDynamic(selected,randomId(),splitSecondLine,splitSecondKey,splitSecondSource);
                modify(current=>({...current,elements:[
                  ...current.elements.map(part=>part.id===selected.id?result.original:part),result.overprint
                ]}));
                setLabelChecked(false);setSelectedId(result.overprint.id);
                setSplitSecondLine("");setSplitSecondKey("");
                setNotice("Preprinted and dynamic text split safely; OCR/private value was NOT copied into the shared field. Recheck both layers and print offsets.");
              } catch(error){
                setNotice(error instanceof Error?error.message:"Invalid layer split");
              }
            }}>Split into mapped editable layers</button>
          </div>
          <div className="ls-grid-two">{field("X (" + unit + ")", number(valueInUnit(selected.x, unit), next => edit({x:round(within(next * factor(unit),0,Math.max(0,draft.widthMm-selected.width)))}), 0, 500, .1))}{field("Y (" + unit + ")", number(valueInUnit(selected.y, unit), next => edit({y:round(within(next * factor(unit),0,Math.max(0,draft.heightMm-selected.height)))}), 0, 500, .1))}{field("Width (" + unit + ")", number(valueInUnit(selected.width, unit), next => edit({width:round(within(next * factor(unit),1,Math.max(1,draft.widthMm-selected.x)))}), 1, 500, .1))}{field("Height (" + unit + ")", number(valueInUnit(selected.height, unit), next => edit({height:round(within(next * factor(unit),1,Math.max(1,draft.heightMm-selected.y)))}), 1, 500, .1))}{field("Z layer", number(selected.z, next => edit({z:next}), -1000, 1000))}{field("Rotation (°)", number(selected.rotation, next => edit({rotation:next}), -360, 360))}</div>
          {field("Font family", <select value={selected.font} onChange={event => edit({font:event.target.value})}>{fonts.map(font => <option key={font} value={font}>{font}</option>)}</select>)}
          <div className="ls-grid-two">{field("Font size (px)", number(selected.size, next => edit({size:next}), 5, 120))}{field("Letter gap (px)", <input type="number" aria-label="Letter gap 0 to 10 pixels"
            min={0} max={10} step={.5} value={selected.letterSpacing??0}
            onChange={event=>{const n=Number(event.target.value);
              if(Number.isFinite(n)&&n>=0&&n<=10&&Math.round(n*2)===n*2)edit({letterSpacing:n});
            }}/>)}</div>
          {field("Line spacing (multiple)", number(selected.lineHeight??1.18,next=>edit({lineHeight:next}),.8,3,.05))}
          {field("Font width / compression", <div className="ls-compress-control">
            <input type="range" aria-label="Font width compression slider" min={50} max={100} step={5}
              value={selected.fontCompression??100}
              onChange={event=>edit({fontCompression:Number(event.target.value)})}/>
            <input type="number" aria-label="Font compression percentage" min={50} max={100} step={1}
              value={selected.fontCompression??100}
              onChange={event=>{const n=Number(event.target.value);
                if(Number.isFinite(n)&&n>=50&&n<=100)edit({fontCompression:n});
              }}/>
            <span>{Math.round(typographyCompression(selected.fontCompression)*100)}% width</span>
          </div>)}
          <div className="ls-toggle-row"><button type="button" aria-pressed={selected.bold} onClick={() => edit({bold:!selected.bold})}><strong>B</strong></button><button type="button" aria-pressed={selected.italic} onClick={() => edit({italic:!selected.italic})}><em>I</em></button><button type="button" aria-pressed={selected.underline} onClick={() => edit({underline:!selected.underline})}><u>U</u></button><button type="button" onClick={() => moveZ(1)}>Bring Forward</button><button type="button" onClick={() => moveZ(-1)}>Send Back</button>
            <button type="button" onClick={copySelectedStyle}>Copy Style</button>
            <button type="button" disabled={!styleClipboard} onClick={pasteSelectedStyle}>Paste Style</button>
          </div>
          <div className="ls-word-align" role="toolbar" aria-label="Word-style element alignment">
            <strong>Align object to physical page:</strong>
            <button type="button" onClick={()=>moveSelectedTo("horizontal","start")}>Left</button>
            <button type="button" onClick={()=>moveSelectedTo("horizontal","center")}>Center</button>
            <button type="button" onClick={()=>moveSelectedTo("horizontal","end")}>Right</button>
            <button type="button" onClick={()=>moveSelectedTo("vertical","start")}>Top</button>
            <button type="button" onClick={()=>moveSelectedTo("vertical","center")}>Middle</button>
            <button type="button" onClick={()=>moveSelectedTo("vertical","end")}>Bottom</button>
          </div>
          {field("Text alignment", <select value={selected.align} onChange={event => edit({align:event.target.value as Align})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select>)}
          <div className="ls-grid-two">{field("Text color", <input type="color" value={selected.color} onChange={event => edit({color:event.target.value})}/>)}{field("Background color", <input type="color" value={selected.background === "transparent" ? "#ffffff" : selected.background} onChange={event => edit({background:event.target.value})}/>)}{field("Border color", <input type="color" value={selected.borderColor} onChange={event => edit({borderColor:event.target.value})}/>)}{field("Border width", number(selected.borderWidth, next => edit({borderWidth:next}), 0, 10, .5))}{field("Opacity", number(selected.opacity, next => edit({opacity:next}), 0, 1, .1))}</div>
          <label className="ls-inline-check"><input type="checkbox" checked={selected.background === "transparent"} onChange={event => edit({background:event.target.checked ? "transparent" : "#ffffff"})}/> Transparent background</label>
          <div className="ls-checks"><label><input type="checkbox" checked={selected.quick} onChange={event => edit({quick:event.target.checked})}/> Quick Passbook</label><label><input type="checkbox" checked={selected.dotMatrix} onChange={event => edit({dotMatrix:event.target.checked})}/> Dot Matrix output</label><label><input type="checkbox" checked={selected.preprinted} onChange={event => {
              const preprinted=event.target.checked;
              edit({preprinted,origin:preprinted?"preprinted":selected.origin==="preprinted"?"static":selected.origin,dotMatrix:preprinted?false:selected.dotMatrix});
              setLabelChecked(false);
            }}/> Preprinted on paper</label></div>
          <div className="ls-actions"><button type="button" onClick={() => { const duplicate={...selected,id:randomId(),x:selected.x+3,y:selected.y+3,z:selected.z+1,groupId:undefined,locked:false};modify(current=>({...current,elements:[...current.elements,duplicate]}));setSelectedId(duplicate.id);setWordSelectedIds([duplicate.id]); }}>Duplicate</button><button type="button" className="ls-danger" onClick={deleteWordSelection} disabled={selectedWordParts.some(part=>part.locked)}>Delete</button></div>
        </div> : <p className="ls-empty">Select an object to edit every property: text, dynamic mapping, font, color, size, layers, coordinates and print behavior.</p>)}
      </aside>
    </div>
    <footer className="ls-footer">Draft Windows Document Studio · Precision geometry and line spacing must be proofed on real paper. Only Master-approved and physically calibrated layouts may be activated. Existing bank printing and customer data remain unchanged.</footer>
  </section>;
}

/** Keep the heavy editor hooks and cloud/draft side effects completely
 * unmounted on Android/web. The native-shell check is not merely a hidden
 * navigation link: direct component imports also fail closed.
 */
export default function CustomizeLayoutStudio(props:StudioProps) {
  const [setup,setSetup]=useState<LayoutSetup|null>(null);
  if(!windowsLayoutEngineAvailable())return <section role="alert" className="ls-windows-only">
    <h2>Windows EXE only</h2>
    <p>Customize Layout and the advanced PDF-to-passbook engine are not available on Android or web. Existing bank/customer data and standard print features are unchanged.</p>
  </section>;
  if(!setup)return <LayoutSetupWizard currentBank={props.bankName} banks={props.bankOptions??[props.bankName]}
    accountOpening={props.mode==="accountOpening"} onOpen={setSetup}/>;
  const sameBank=setup.bankName.trim().toLowerCase()===props.bankName.trim().toLowerCase();
  return <CustomizeLayoutStudioCore key={setup.bankName+":"+setup.output+":"+setup.method}
    {...props} bankName={setup.bankName} bankValues={sameBank?props.bankValues:{}} setup={setup}
    onBackToSetup={()=>setSetup(null)}/>;
}

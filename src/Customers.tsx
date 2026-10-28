import AfsmConfirmation, { type AfsmBatch } from "./AfsmConfirmation";
import { afsmDisplay } from "./core/afsm";
import { identity } from "./core/localData";
import { snapshot } from "./AllCustomerData";
import { isAndroid, printAndroidPdf } from "./platform/android/runtime";
import { createFastCustomerPdf, customersPerPdfPage } from "./core/customerPdf";
import PdfDocumentPreview from "./PdfDocumentPreview";
import { classifyRecovery } from "./core/recovery";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import ModalPortal from "./ModalPortal";
import { localDataFetch, localModeEnabled, getDataIdToken, getLocalExportCustomers, getActiveLocalCustomers, getLocalStatus, recordSafeRecovery } from "./core/localData";
import {

  useEffect,
  useState,
  useRef,

  type FormEvent,
  type Ref,

} from "react";

import { getAuth } from "firebase/auth";
import { getCustomerSearchApiUrl } from "./tenantApi";
import { requireLicensedWrite } from "./core/licenseAccess";
import { loadPdfCustomers, selectCustomerPdfRecords } from "./core/pdfSelection";

const desktopBridge = () => (window as Window & {bankSetuDesktop?: {shareImage?: (image:string)=>Promise<void>;saveCustomerPdf?: (base64:string)=>Promise<{saved?:boolean;cancelled?:boolean}>;openCustomerPdf?: (base64:string)=>Promise<{opened?:boolean}>}}).bankSetuDesktop;

/* =========================================================

   BANK SETU - CUSTOMER PREVIEW

========================================================= */

type Customer = {
  recordId?: string;
  afsmStatus?: string;
  afsmSentAt?: string;

  enrolId: string;

  accountNo: string;

  name: string;

  coName: string;

  status: string;

  gender: string;

  contact: string;

  accountOpeningDate: string;

  address: string;

  nominee: string;

  postOffice: string;

  passbookStatus: string;

  uidaiNo: string;

  dbtStatus: string;

  purposeOfAdvance: string;

  fullAddress: string;

  pinCode: string;

  pan: string;

  aofNo: string;

  photoUrl?: string;

  photoPreview?: string;

};

type CustomerMatch = {
  rowNumber: number;
  enrolId?: string;
  accountNo?: string;
  name?: string;
  fatherName?: string;
  guardianName?: string;
  mobile?: string;
  contact?: string;
  accountOpeningDate?: string;
  uidaiNo?: string;
  pan?: string;
  aofNo?: string;
};

const emptyCustomer: Customer = {

  enrolId: "",

  accountNo: "",

  name: "",

  coName: "",

  status: "",

  gender: "",

  contact: "",

  accountOpeningDate: "",

  address: "",

  nominee: "",

  postOffice: "",

  passbookStatus: "",

  uidaiNo: "",

  dbtStatus: "",

  purposeOfAdvance: "",

  fullAddress: "",

  pinCode: "",

  pan: "",

  aofNo: "",

  photoUrl: "",

  photoPreview: "",

};

/* =========================================================

   HELPERS

========================================================= */

const safe = (

  value?: string | null

) => String(value ?? "").trim();

function makeAddress(customer: Customer) {

  if (safe(customer.fullAddress)) {

    return safe(customer.fullAddress);

  }

  return [

    safe(customer.address),

    safe(customer.postOffice),

    safe(customer.pinCode),

  ]

    .filter(Boolean)

    .join(", ");

}

/* =========================================================

   COMPONENT

========================================================= */

export default function Customers() {

  const [query, setQuery] = useState("");

  const [customer, setCustomer] =

    useState<Customer | null>(null);

  useEffect(()=>{
    if(!customer?.recordId || !localModeEnabled())return;
    let active=true;const scope=identity();
    const refresh=()=>{void getActiveLocalCustomers().then(records=>{if(!active||identity()!==scope)return;const found=records.find(record=>record.recordId===customer.recordId);if(found)setCustomer(current=>current?.recordId===found.recordId?{...current,afsmStatus:String((found as Record<string,unknown>).afsmStatus||""),afsmSentAt:String((found as Record<string,unknown>).afsmSentAt||"")}:current);}).catch(()=>{});};
    window.addEventListener("banksetu-sync-change",refresh);return()=>{active=false;window.removeEventListener("banksetu-sync-change",refresh);};
  },[customer?.recordId]);

  const [loading, setLoading] =

    useState(false);

  const [error, setError] =

    useState("");

  const [message, setMessage] =

    useState("");

  const [customerMatches, setCustomerMatches] =
    useState<CustomerMatch[]>([]);

  const [showMatchModal, setShowMatchModal] =
    useState(false);

  const [selectedMatchLoading, setSelectedMatchLoading] =
    useState<number | null>(null);

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfRecords, setPdfRecords] = useState<Record<string, unknown>[]>([]);
  const [pdfMode, setPdfMode] = useState<"all" | "date" | "account" | "search">("all");
  const [pdfFrom, setPdfFrom] = useState("");
  const [pdfTo, setPdfTo] = useState("");
  const [pdfSearch, setPdfSearch] = useState("");
  const [pdfSelected, setPdfSelected] = useState<Set<string>>(new Set());
  const customerPreviewCard = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfIncomplete, setPdfIncomplete] = useState(false);
  const pdfGenerating = useRef(false);
  const pdfCancelled = useRef(false);
  const [pdfBlob,setPdfBlob]=useState<Blob|null>(null);
  const [afsmBatch,setAfsmBatch]=useState<AfsmBatch|null>(null);
  const [pdfCount,setPdfCount]=useState(0);
  const [pdfProgress,setPdfProgress]=useState(0);
  const [pdfBusy,setPdfBusy]=useState(false);

  const pdfKey = (record: Record<string, unknown>) => String(record.recordId || record.rowNumber);
  const pdfMatches = selectCustomerPdfRecords(pdfRecords,pdfMode,pdfFrom,pdfTo,pdfSearch);
  const pdfValid = !pdfLoading && (pdfMode === "all" || (pdfMode === "date" && !!pdfFrom && !!pdfTo && pdfFrom <= pdfTo) || (pdfMode === "account" && !!pdfFrom.trim() && (!pdfTo.trim() || pdfFrom.trim() <= pdfTo.trim())) || (pdfMode === "search" && !!pdfSearch.trim()));
  const pdfChosen = pdfMode === "search" ? pdfMatches.filter(record => pdfSelected.has(pdfKey(record))) : pdfMatches;

  const openPdfSelection = async () => {
    if (pdfLoading || pdfGenerating.current) return;
    setError(""); setPdfBlob(null); setPdfOpen(true); setPdfLoading(true); setPdfSelected(new Set());
    try {
      await requireLicensedWrite();
      const [records, status] = localModeEnabled()
        ? await Promise.all([getLocalExportCustomers(), getLocalStatus()])
        : [[], {downloading:false,cacheLimited:false}];
      // A preview can load from Google before local reconciliation completes.
      // Only the bound, verified tenant bridge may supply missing pages.
      const requestPage=navigator.onLine && getCustomerSearchApiUrl(localModeEnabled())
        ? async (page:number,pageSize:number) => apiRequest({action:"getAllCustomers",page,pageSize}) : undefined;
      try {
        const selection=await loadPdfCustomers(records,status.downloading || status.cacheLimited,navigator.onLine,requestPage);
        setPdfRecords(selection.records);setPdfIncomplete(selection.incomplete);
      } catch (reason) {
        if (!records.length) throw reason;
        setPdfRecords(records);setPdfIncomplete(true);
        setError("Google customer pages are unavailable. Only this device's cached customers are selected; review the partial count before generating.");
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read customers for PDF preview."); }
    finally { setPdfLoading(false); }
  };

  /* =======================================================

     API REQUEST

  ======================================================= */

  const apiRequest = async (

    body: Record<string, unknown>

  ) => {

      const apiUrl = getCustomerSearchApiUrl(localModeEnabled());

    if (!apiUrl) {

      throw new Error(

        "Google Sheet API URL is not configured."

      );

    }

    const auth = getAuth();

    const user = auth.currentUser;

    if (!user) {

      throw new Error(

        "Firebase login session is not available. Please login again."

      );

    }

    const idToken =

      await getDataIdToken();

    const response =

      await localDataFetch(apiUrl, {

        method: "POST",

        headers: {

          "Content-Type":

            "text/plain;charset=utf-8",

        },

        body: JSON.stringify({

          ...body,

          idToken,

        }),

      });

    const result =

      await response.json();

    if (!result?.success) {

      const apiMessage =

        result?.message ||

        "Request could not be completed.";

      if (result?.code === "INVALID_ACTION") {

        throw new Error(

          `${apiMessage} Please deploy the latest Bank Setu Apps Script version.`

        );

      }

      throw new Error(apiMessage);

    }

    return result;

  };

  /* =======================================================

     UNIVERSAL SEARCH

  ======================================================= */

  const searchCustomer = async (
    event?: FormEvent
  ) => {
    event?.preventDefault();

    const searchValue = query.trim();

    if (!searchValue) {
      setError(
        "Enter Customer ID, Account Number, Aadhaar Number, Mobile Number, AOF Number or Name."
      );
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setCustomer(null);
    setCustomerMatches([]);
    setShowMatchModal(false);

    try {
      const result = await apiRequest({
        action: "searchCustomer",
        query: searchValue,
      });

      const matches: CustomerMatch[] =
        Array.isArray(result.matches)
          ? result.matches
          : [];

      if (
        result.multipleMatches === true &&
        matches.length > 1
      ) {
        setCustomerMatches(matches);
        setShowMatchModal(true);
        setMessage(
          result.message ||
            `${matches.length} matching customers found. Please select the required customer.`
        );
        return;
      }

      const loadedCustomer: Customer = {
        ...emptyCustomer,
        ...(result.customer || {}),
      };

      setCustomer(loadedCustomer);
      setMessage("Customer loaded successfully.");
    } catch (err) {
      setCustomer(null);
      setCustomerMatches([]);
      setShowMatchModal(false);
      setError(
        err instanceof Error
          ? err.message
          : "Customer could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  };

  const selectMatchedCustomer = async (
    match: CustomerMatch
  ) => {

    setSelectedMatchLoading(match.rowNumber);
    setError("");

    try {
      const result = await apiRequest({
        action: "getCustomerByRowNumber",
        rowNumber: match.rowNumber,
        includePhoto: true,
      });

      const loadedCustomer: Customer = {
        ...emptyCustomer,
        ...(result.customer || {}),
      };

      setCustomer(loadedCustomer);
      setCustomerMatches([]);
      setShowMatchModal(false);
      setMessage("Selected customer loaded successfully.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Selected customer could not be loaded."
      );
    } finally {
      setSelectedMatchLoading(null);
    }
  };

  const closeMatchModal = () => {
    setShowMatchModal(false);
    setCustomerMatches([]);
    setMessage("");
  };

  /* =======================================================

     SEARCH AGAIN

  ======================================================= */

  const searchAgain = () => {
    setQuery("");
    setCustomer(null);
    setCustomerMatches([]);
    setShowMatchModal(false);
    setSelectedMatchLoading(null);
    setError("");
    setMessage("");
  };

  /* =======================================================

     PRINT CURRENT CUSTOMER

  ======================================================= */

  const printCustomer = async () => {

    if (!customer) {

      setError(

        "Search and load a customer first."

      );

      return;

    }

    setError("");

    try { await requireLicensedWrite(); window.print(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "License verification is required to print."); }

  };

  /* =======================================================

     OPEN CUSTOMER WHATSAPP

  ======================================================= */

  const openWhatsApp = () => {

    if (!customer) {

      setError("Search and load a customer first.");

      return;

    }

    let mobile = safe(customer.contact).replace(/\D/g, "");

    if (!mobile) {

      setError("Customer mobile number is not available.");

      return;

    }

    if (mobile.length === 10) mobile = `91${mobile}`;

    setError("");

    window.open(`https://wa.me/${mobile}`, "_blank", "noopener,noreferrer");

  };

  const shareCustomer = async () => {
    if (!customer) return;
    try {
      await requireLicensedWrite();
      if (!customerPreviewCard.current) throw new Error("Customer preview is unavailable. Open it again and retry.");
      const blob = await snapshot(customer as unknown as Record<string, unknown>,customerPreviewCard.current);
      const name = "BankSetu-customer-preview.png";
      if (isAndroid()) {
        const data = await new Promise<string>((resolve,reject) => {const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
        const file = await Filesystem.writeFile({path:name,data,directory:Directory.Cache});
        await Promise.race([Share.share({title:"Bank Setu Customer Preview",files:[file.uri],dialogTitle:"Share customer preview"}),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("Android sharing did not open. Please try again.")),20000))]);
      } else if (desktopBridge()?.shareImage) {
        const data = await new Promise<string>((resolve,reject) => {const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
        await desktopBridge()!.shareImage!(data);
        setMessage("Preview image copied. Paste it into the WhatsApp chat.");
      } else if (navigator.share && navigator.canShare?.({files:[new File([blob],name,{type:"image/png"})]})) {
        await navigator.share({files:[new File([blob],name,{type:"image/png"})],title:"Bank Setu Customer Preview"});
      } else {
        const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage("Preview image downloaded for sharing.");
      }
    } catch (cause) {setError(cause instanceof Error?cause.message:"Could not share preview image.");}
  };

  const pdfBase64 = (blob:Blob) => new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('PDF data could not be read.'));reader.readAsDataURL(blob);});
  const saveCustomersPdf = async () => {
    if(!pdfBlob || pdfBusy)return;
    setPdfBusy(true);setError('');
    try{
      await requireLicensedWrite();
      const name='BankSetu-customers.pdf';
      if(isAndroid()){
        const file=await Filesystem.writeFile({path:name,data:await pdfBase64(pdfBlob),directory:Directory.Cache});
        try{await Share.share({title:'Bank Setu Customers PDF',files:[file.uri],dialogTitle:'Save or share PDF'});}
        finally{setTimeout(()=>void Filesystem.deleteFile({path:name,directory:Directory.Cache}).catch(()=>undefined),300000);}
      }else if(desktopBridge()?.saveCustomerPdf){
        const result=await desktopBridge()!.saveCustomerPdf!(await pdfBase64(pdfBlob));
        if(result.saved)setMessage('PDF saved.');
      }else{
        const url=URL.createObjectURL(pdfBlob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      }
    }catch(reason){setError(reason instanceof Error?reason.message:'PDF could not be saved.');}
    finally{setPdfBusy(false);}
  };
  const printCustomersPdf = async () => {
    if(!pdfBlob||pdfBusy)return;
    setPdfBusy(true);setError('');
    try{
      await requireLicensedWrite();
      if(isAndroid()){await printAndroidPdf(await pdfBase64(pdfBlob));setMessage('Android print dialog opened. Printing or cancellation is controlled there.');}
      else if(desktopBridge()?.openCustomerPdf){await desktopBridge()!.openCustomerPdf!(await pdfBase64(pdfBlob));setMessage('PDF opened in the system viewer. Choose Print there.');}
      else {setError('Download this PDF and use your device PDF viewer to print it.');}
    }catch(reason){setError(reason instanceof Error?reason.message:'Print dialog could not be opened.');}
    finally{setPdfBusy(false);}
  };
  const makeAllCustomersPdf = async (records: Record<string, unknown>[]) => {
    if(!pdfValid||!records.length||pdfGenerating.current)return;
    pdfGenerating.current=true;pdfCancelled.current=false;setPdfLoading(true);setPdfBlob(null);setAfsmBatch(null);setError('');setPdfProgress(0);
    try{
      await requireLicensedWrite();
      const batchScope=localModeEnabled()?identity():null;
      const batchIds=records.map(record=>String(record.recordId||""));
      const file=await createFastCustomerPdf(records,{cancelled:()=>pdfCancelled.current,progress:done=>setPdfProgress(done)});
      if(pdfCancelled.current)throw Error('PDF generation cancelled. No customer data was changed.');
      await requireLicensedWrite();
      if(batchScope&&identity()!==batchScope)throw Error("Workspace changed. Generate the PDF again.");
      setPdfBlob(file);setPdfCount(records.length);
      if(batchScope&&batchIds.every(Boolean))setAfsmBatch({scope:batchScope,ids:batchIds,operationId:crypto.randomUUID()});
      setMessage(`${records.length} customer records in ${Math.ceil(records.length/customersPerPdfPage)} A4 PDF page(s).${pdfIncomplete?' This device may have an incomplete cloud cache.':''}`);
      recordSafeRecovery('pdf','generate','verified');
    }catch(reason){
      recordSafeRecovery(classifyRecovery(reason),'generate','attention');
      setError(reason instanceof Error?reason.message:'PDF generation failed. You can retry without changing customer data.');
    }finally{pdfGenerating.current=false;setPdfLoading(false);}
  };

  /* =======================================================

     RENDER

  ======================================================= */

  return (

    <div className="customers-page" data-print-root="active">

      <style>{`

        * {

          box-sizing: border-box;

        }

        .customers-page {

          min-height: 100%;

          padding: 24px;

          color: #eaffff;

        }

        /* =============================================

           PAGE HEADER

        ============================================= */

        .customers-heading {

          max-width: 1100px;

          margin: 0 auto 20px;

        }

        .customers-heading h1 {

          margin: 0;

          font-size: 30px;

          font-weight: 900;

          color: #ffffff;

        }

        .customers-heading p {

          margin: 7px 0 0;

          color: rgba(220,249,255,.68);

          font-size: 13px;

        }

        /* =============================================

           SEARCH

        ============================================= */

        .customer-search-card {

          max-width: 1100px;

          margin: 0 auto 22px;

          padding: 20px;

          border-radius: 18px;

          border:

            1px solid rgba(91,231,255,.25);

          background:

            rgba(4,52,83,.62);

          box-shadow:

            0 15px 40px

            rgba(0,0,0,.18);

        }

        .search-label {

          display: block;

          margin-bottom: 9px;

          font-size: 12px;

          font-weight: 900;

          letter-spacing: 1.2px;

          color: #75f4e6;

        }

        .search-row {

          display: flex;

          gap: 10px;

        }

        .search-input {

          flex: 1;

          height: 48px;

          padding:

            0 16px;

          border-radius:

            12px;

          border:

            1px solid

            rgba(120,230,255,.25);

          outline: none;

          background:

            rgba(0,20,40,.65);

          color: white;

          font-size: 15px;

        }

        .search-input:focus {

          border-color:

            #65e9ff;

          box-shadow:

            0 0 0 3px

            rgba(101,233,255,.10);

        }

        .search-button {

          min-width: 130px;

          border: none;

          border-radius: 12px;

          padding: 0 20px;

          font-weight: 900;

          cursor: pointer;

          color: #043451;

          background:

            linear-gradient(

              135deg,

              #6ef1dd,

              #5bcaff

            );

        }

        .search-button:disabled {

          opacity: .6;

          cursor: wait;

        }

        /* =============================================
           MULTIPLE CUSTOMER MATCH MODAL
        ============================================= */

        .match-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(0, 12, 28, .78);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
        }

        .match-modal {
          width: min(760px, 100%);
          max-height: min(82vh, 760px);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border-radius: 18px;
          border: 1px solid rgba(101,233,255,.34);
          background: #073653;
          box-shadow: 0 24px 70px rgba(0,0,0,.45);
        }

        .match-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 20px 14px;
          border-bottom: 1px solid rgba(120,230,255,.18);
        }

        .match-modal-header h3 {
          margin: 0;
          color: #ffffff;
          font-size: 20px;
          font-weight: 900;
        }

        .match-modal-header p {
          margin: 6px 0 0;
          color: rgba(225,249,255,.72);
          font-size: 13px;
          line-height: 1.45;
        }

        .match-modal-close {
          flex: 0 0 auto;
          width: 38px;
          height: 38px;
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 10px;
          background: rgba(255,255,255,.08);
          color: #ffffff;
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
        }

        .match-list {
          overflow-y: auto;
          padding: 14px;
          display: grid;
          gap: 12px;
          overscroll-behavior: contain;
        }

        .match-card {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 14px;
          align-items: center;
          padding: 15px;
          border-radius: 14px;
          border: 1px solid rgba(120,230,255,.20);
          background: rgba(0,20,40,.48);
        }

        .match-name {
          margin-bottom: 8px;
          color: #8ff7eb;
          font-size: 17px;
          font-weight: 900;
          text-transform: uppercase;
          overflow-wrap: anywhere;
        }

        .match-details {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 5px 16px;
          color: rgba(235,251,255,.86);
          font-size: 12px;
          line-height: 1.45;
        }

        .match-details span {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .match-details b {
          color: #ffffff;
        }

        .match-select-button {
          min-width: 96px;
          min-height: 44px;
          padding: 0 16px;
          border: none;
          border-radius: 11px;
          background: linear-gradient(135deg, #6ef1dd, #5bcaff);
          color: #043451;
          font-weight: 900;
          cursor: pointer;
        }

        .match-select-button:disabled {
          opacity: .6;
          cursor: wait;
        }

        /* =============================================

           ALERT

        ============================================= */

        .customer-error,

        .customer-message {

          max-width: 1100px;

          margin:

            0 auto 18px;

          padding:

            13px 16px;

          border-radius:

            12px;

          font-size:

            13px;

          font-weight:

            700;

        }

        .customer-error {

          color:

            #ffd6d6;

          background:

            rgba(160,20,20,.25);

          border:

            1px solid

            rgba(255,100,100,.25);

        }

        .customer-message {

          color:

            #cffff1;

          background:

            rgba(20,150,115,.18);

          border:

            1px solid

            rgba(80,240,190,.20);

        }

        /* =============================================

           EMPTY

        ============================================= */

        .customer-empty {

          max-width:

            1100px;

          margin:

            25px auto;

          padding:

            50px 20px;

          text-align:

            center;

          border-radius:

            18px;

          border:

            1px dashed

            rgba(112,231,244,.23);

          color:

            rgba(220,249,255,.60);

          background:

            rgba(4,46,73,.35);

        }

        /* =============================================

           CUSTOMER PREVIEW

        ============================================= */

        .preview-wrapper {

          max-width:

            1100px;

          margin:

            0 auto;

        }

        .preview-title {

          margin-bottom:

            10px;

          font-size:

            13px;

          font-weight:

            900;

          letter-spacing:

            1px;

          color:

            #8ff7eb;

        }

        .customer-preview {

          position:

            relative;

          width:

            100%;

          min-height:

            420px;

          padding:

            28px;

          border-radius:

            18px;

          background:

            #ffffff;

          color:

            #111827;

          box-shadow:

            0 18px 55px

            rgba(0,0,0,.25);

        }

        .customer-preview-heading {

          text-align:

            center;

          margin-bottom:

            28px;

          padding-bottom:

            12px;

          border-bottom:

            2px solid

            #1f2937;

        }

        .customer-preview-heading h2 {

          margin: 0;

          font-size:

            24px;

          letter-spacing:

            .5px;

        }

        .customer-grid {

          display:

            grid;

          grid-template-columns:

            1fr 1.2fr 170px;

          gap:

            30px;

          align-items:

            start;

        }

        .info-column {

          min-width: 0;

          text-align: left;

        }

        .info-row {

          display:

            grid;

          grid-template-columns:

            145px 12px 1fr;

          gap:

            4px;

          margin-bottom:

            13px;

          align-items:

            start;

          font-size:

            14px;

          line-height:

            1.45;

          text-align: left;

        }

        .info-label {

          font-weight:

            800;

          color:

            #374151;

        }

        .info-colon {

          font-weight:

            800;

        }

        .info-value {

          font-weight:

            700;

          color:

            #111827;

          word-break:

            break-word;

          text-align: left;

        }

        .customer-name {

          text-transform:

            uppercase;

          font-weight:

            900;

        }

        .customer-address {

          text-transform:

            uppercase;

          line-height:

            1.6;

        }

        /* =============================================

           PHOTO

        ============================================= */

        .photo-section {

          display:

            flex;

          flex-direction:

            column;

          align-items:

            center;

        }

        .photo-box {

          width:

            150px;

          height:

            180px;

          border:

            2px solid

            #374151;

          background:

            #f3f4f6;

          display:

            flex;

          align-items:

            center;

          justify-content:

            center;

          overflow:

            hidden;

        }

        .photo-box img {

          width:

            100%;

          height:

            100%;

          object-fit:

            cover;

        }

        .photo-placeholder {

          color:

            #6b7280;

          font-size:

            14px;

          font-weight:

            800;

          text-align:

            center;

        }

        .photo-label {

          margin-top:

            7px;

          font-size:

            12px;

          font-weight:

            800;

          color:

            #374151;

        }

        /* Only the All PDF capture is compacted; normal preview and print stay intact. */
        .customer-preview.pdf-capture { min-height: 0; padding: 8px 12px; border-radius: 4px; box-shadow: none; }
        .pdf-capture .customer-preview-heading { margin-bottom: 6px; padding-bottom: 4px; border-bottom-width: 1px; }
        .pdf-capture .customer-preview-heading h2 { font-size: 18px; }
        .pdf-capture .customer-grid { grid-template-columns: 1fr 1.2fr 100px; gap: 12px; }
        .pdf-capture .info-row { margin-bottom: 3px; line-height: 1.18; font-size: 15px; }
        .pdf-capture .photo-box { width: 90px; height: 108px; border-width: 1px; }
        .pdf-capture .photo-label { margin-top: 3px; font-size: 10px; }
        .pdf-capture .customer-status-strip { margin-top: 5px; padding-top: 5px; }

        /* =============================================

           BUTTONS

        ============================================= */

        .customer-actions {

          display:

            flex;

          flex-wrap:

            wrap;

          justify-content:

            center;

          gap:

            12px;

          margin-top:

            22px;

        }

        .action-button {

          min-height:

            46px;

          padding:

            0 22px;

          border:

            none;

          border-radius:

            12px;

          font-size:

            14px;

          font-weight:

            900;

          cursor:

            pointer;

          transition:

            .18s ease;

        }

        .action-button:hover {

          transform:

            translateY(-1px);

        }

        .print-customer-button {

          color:

            #043451;

          background:

            linear-gradient(

              135deg,

              #6ef1dd,

              #5bcaff

            );

        }

        .search-again-button {

          color:

            #eaffff;

          border:

            1px solid

            rgba(110,241,221,.28);

          background:

            rgba(4,52,83,.85);

        }

        .all-pdf-button {

          color:

            white;

          background:

            linear-gradient(

              135deg,

              #6958d9,

              #916cff

            );

        }

        /* =============================================

           PRINT

        ============================================= */

        .customer-status-strip {

        margin-top: 22px;

        padding-top: 18px;

        border-top: 1px solid #d1d5db;

        display: grid;

        grid-template-columns: repeat(3, minmax(0, 1fr));

        gap: 18px;

        text-align: left;

      }

      .status-item {

        display: grid;

        grid-template-columns: auto 1fr;

        gap: 12px;

        align-items: baseline;

        min-width: 0;

        text-align: left;

      }

      .status-item span { font-size: 13px; font-weight: 800; color: #374151; white-space: nowrap; }

      .status-item strong { font-size: 14px; color: #111827; text-align: left; overflow-wrap: anywhere; }

      .whatsapp-button {

        color: #ffffff;

        background: #25D366;

      }

      @page {

          size: A4 portrait;

          margin: 12mm;

        }

        @media print {

          html,

          body {

            margin:

              0 !important;

            padding:

              0 !important;

            background:

              white !important;

          }

          body * {

            visibility:

              hidden !important;

          }

          .customer-preview,

          .customer-preview * {

            visibility:

              visible !important;

          }

          .customer-preview {

            position:

              absolute !important;

            left:

              0 !important;

            top:

              0 !important;

            width:

              100% !important;

            min-height:

              auto !important;

            padding:

              8mm !important;

            margin:

              0 !important;

            border:

              none !important;

            border-radius:

              0 !important;

            box-shadow:

              none !important;

            background:

              white !important;

          }

        }

        /* =============================================

           MOBILE

        ============================================= */

        @media (

          max-width: 850px

        ) {

          .customers-page {

            padding:

              14px;

          }

          .customer-search-card {
            width: 100%;
          }

          .search-row {
            width: 100%;
            flex-direction: column;
            align-items: stretch;
          }

          .search-input {
            flex: 0 0 auto;
            width: 100%;
            min-width: 0;
            height: 52px !important;
            min-height: 52px !important;
            padding: 0 14px;
            font-size: 16px;
            line-height: normal;
            display: block;
            appearance: none;
            -webkit-appearance: none;
          }

          .search-button {
            flex: 0 0 auto;
            width: 100%;
            min-height: 48px;
            height: 48px;
          }

          .match-modal-backdrop {
            padding: 12px;
            align-items: flex-end;
          }

          .match-modal {
            width: 100%;
            max-height: 88vh;
            border-radius: 18px 18px 12px 12px;
          }

          .match-card {
            grid-template-columns: 1fr;
          }

          .match-select-button {
            width: 100%;
          }

          .customer-grid {

            grid-template-columns:

              1fr;

          }

          .photo-section {

            align-items:

              flex-start;

          }

          .info-row {

            grid-template-columns:

              125px 10px 1fr;

          }

        }

        @media (max-width: 480px) {

          .customers-page {

            padding: 10px;

          }

          .customer-search-card {

            padding: 12px;

            border-radius: 14px;

          }

          .search-label {

            font-size: 11px;

            letter-spacing: .8px;

          }

          .search-input {
            width: 100%;
            min-width: 0;
            height: 52px !important;
            min-height: 52px !important;
            padding: 0 12px;
            font-size: 16px;
          }

          .search-button {
            width: 100%;
            min-width: 0;
            height: 48px;
            min-height: 48px;
            font-size: 14px;
          }

          .match-modal-header {
            padding: 15px 14px 12px;
          }

          .match-modal-header h3 {
            font-size: 18px;
          }

          .match-list {
            padding: 10px;
          }

          .match-card {
            padding: 13px;
          }

          .match-details {
            grid-template-columns: 1fr;
            gap: 4px;
          }

        }

        .pdf-dialog{width:min(960px,96vw);max-height:90vh;overflow:auto;background:#fff;color:#15283a;border-radius:16px;box-shadow:0 20px 70px #102d3855;padding:24px}
        .customer-pdf-preview{height:min(65vh,720px);overflow:auto;background:#dce5f2;border-radius:12px;padding:12px}.customer-pdf-page{display:grid;justify-items:center;gap:5px;margin:0 auto 14px;max-width:720px}.customer-pdf-page canvas{width:100%;background:#fff;box-shadow:0 4px 15px #34446b33}.pdf-dialog h2{margin:0;font-size:26px}.pdf-dialog p{margin:5px 0 20px;color:#64748b}
        .pdf-layout{display:grid;grid-template-columns:minmax(210px,38%) 1fr;gap:20px}
        .pdf-modes{display:grid;gap:10px}.pdf-mode{display:flex;align-items:center;gap:14px;border:1px solid #d9e2ed;border-radius:10px;padding:16px;cursor:pointer}.pdf-mode:has(input:checked){border-color:#2476f2;background:#eaf3ff}.pdf-mode input{accent-color:#1769dc}.pdf-detail{background:#f6f9fd;border:1px solid #dce8f5;border-radius:10px;padding:20px;min-height:220px}
        .pdf-fields{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.pdf-fields label{display:grid;gap:5px;flex:1;min-width:150px}.pdf-fields input{width:100%;padding:10px;border:1px solid #b9c8d9;border-radius:7px}
        .pdf-results{max-height:210px;overflow:auto;background:#fff;border:1px solid #dce8f5;border-radius:8px}.pdf-results label{display:block;padding:9px;border-bottom:1px solid #e8eef5}.pdf-results input{margin-right:8px}
        .pdf-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:24px}.pdf-actions button{border:0;border-radius:8px;padding:12px 18px;cursor:pointer}.pdf-actions button:last-child{background:#1469e7;color:white}.pdf-actions button:disabled{opacity:.5;cursor:not-allowed}
        @media(max-width:650px){.pdf-dialog{padding:16px}.pdf-layout{grid-template-columns:1fr}.pdf-modes{grid-template-columns:1fr 1fr}.pdf-mode{padding:10px;font-size:13px}}

        /* Direct single-customer print: keep the on-screen card layout on one A4 page.
           This is intentionally separate from the compact All PDF capture. */
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          html,body { width:210mm!important; min-height:297mm!important; margin:0!important; padding:0!important; background:#fff!important; }
          body * { visibility:hidden!important; }
          .customer-preview,.customer-preview * { visibility:visible!important; }
          .customer-preview {
            position:absolute!important;
            top:0!important;
            left:0!important;
            width:190mm!important;
            min-height:0!important;
            max-height:277mm!important;
            overflow:hidden!important;
            margin:0!important;
            padding:7mm!important;
            border:1px solid #d8dee8!important;
            border-radius:4mm!important;
            box-shadow:none!important;
            background:#fff!important;
            color:#111827!important;
            break-inside:avoid!important;
            page-break-inside:avoid!important;
          }
          .customer-preview .customer-preview-heading { margin-bottom:7mm!important; padding-bottom:3mm!important; border-bottom:2px solid #1f2937!important; background:#fff!important; color:#111827!important; }
          .customer-preview .customer-preview-heading h2 { color:#111827!important; font-size:18pt!important; }
          .customer-preview .customer-grid { display:grid!important; grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) 32mm!important; gap:6mm!important; align-items:start!important; overflow:visible!important; }
          .customer-preview .info-column { min-width:0!important; text-align:left!important; }
          .customer-preview .info-row { display:grid!important; grid-template-columns:31mm 3mm minmax(0,1fr)!important; gap:1mm!important; margin-bottom:3mm!important; align-items:start!important; font-size:9pt!important; line-height:1.35!important; text-align:left!important; }
          .customer-preview .info-label,.customer-preview .info-colon { color:#374151!important; }
          .customer-preview .info-value { color:#111827!important; text-align:left!important; overflow-wrap:anywhere!important; }
          .customer-preview .photo-section { display:flex!important; flex-direction:column!important; align-items:center!important; }
          .customer-preview .photo-box { width:30mm!important; height:36mm!important; border:1px solid #374151!important; background:#f3f4f6!important; }
          .customer-preview .photo-label { color:#374151!important; font-size:8pt!important; }
          .customer-preview .customer-status-strip { display:grid!important; grid-template-columns:repeat(3,minmax(0,1fr))!important; gap:4mm!important; margin-top:6mm!important; padding-top:4mm!important; border-top:1px solid #d1d5db!important; background:#fff!important; color:#111827!important; text-align:left!important; }
          .customer-preview .status-item { display:grid!important; grid-template-columns:auto minmax(0,1fr)!important; gap:2mm!important; text-align:left!important; }
          .customer-preview .status-item span { color:#374151!important; font-size:8pt!important; }
          .customer-preview .status-item strong { color:#111827!important; font-size:9pt!important; text-align:left!important; }
        }
      `}</style>

      {/* =============================================

          HEADER

      ============================================== */}

      <div className="customers-heading">

        <h1>

          Customers

        </h1>

        <p>

          Universal Customer Search • Preview • Print • PDF

        </p>

      </div>

      {/* =============================================

          SEARCH

      ============================================== */}

      <form

        className="customer-search-card"

        onSubmit={searchCustomer}

      >

        <label className="search-label">

          UNIVERSAL CUSTOMER SEARCH

        </label>

        <div className="search-row">

          <input

            className="search-input"

            value={query}

            onChange={(event) =>

              setQuery(

                event.target.value

              )

            }

            placeholder="Account No. / Customer ID / Aadhaar / Mobile / AOF No. / Name"

            autoComplete="off"

          />

          <button

            type="submit"

            className="search-button"

            disabled={loading}

          >

            {loading

              ? "Searching..."

              : "Search"}

          </button>

        </div>

      </form>

      {pdfOpen && <ModalPortal><div className="match-modal-backdrop" role="presentation" onMouseDown={event => { if(event.target === event.currentTarget && !pdfLoading) setPdfOpen(false); }}>
        <div className="pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="pdf-title">
          <h2 id="pdf-title">📄 Generate Customer PDFs</h2>
          {error && <p role="alert">{error}</p>}
          <p>Select which customers' preview PDFs you want to generate and download.</p>
          {pdfBlob ? <><p>{pdfCount} customers · {Math.ceil(pdfCount/customersPerPdfPage)} A4 pages{pdfIncomplete?' · Partial local/cloud data':''}</p><PdfDocumentPreview file={pdfBlob}/>{afsmBatch ? <AfsmConfirmation key={afsmBatch.operationId} batch={afsmBatch}/> : <p>AFSM confirmation requires this workspace’s verified local database and stable customer IDs. Connect it in Sync &amp; Backup, then generate the PDF again.</p>}<div className="pdf-actions"><button type="button" onClick={()=>{setPdfBlob(null);setPdfOpen(false)}}>Close</button><button type="button" disabled={pdfBusy} onClick={()=>void saveCustomersPdf()}>Download / Save</button><button type="button" disabled={pdfBusy} onClick={()=>void printCustomersPdf()}>Print</button></div></> : <><div className="pdf-layout">
            <div className="pdf-modes">{([['all','All Customers'],['date','Date Wise'],['account','Account Number Range'],['search','Search Customer']] as const).map(([mode,label]) => <label className="pdf-mode" key={mode}><input type="radio" name="pdf-mode" checked={pdfMode === mode} onChange={() => {setPdfMode(mode);setPdfFrom('');setPdfTo('');setPdfSelected(new Set());}}/><strong>{label}</strong></label>)}</div>
            <div className="pdf-detail">
              <strong>{pdfMode === 'all' ? 'All Customers' : pdfMode === 'date' ? 'Account Opening Date' : pdfMode === 'account' ? 'Account Number Range' : 'Search Customer'}</strong>
              {pdfMode === 'date' && <div className="pdf-fields"><label>From opening date<input type="date" value={pdfFrom} onChange={event=>setPdfFrom(event.target.value)}/></label><label>To opening date<input type="date" value={pdfTo} onChange={event=>setPdfTo(event.target.value)}/></label></div>}
              {pdfMode === 'account' && <div className="pdf-fields"><label>From account number<input type="text" value={pdfFrom} onChange={event=>setPdfFrom(event.target.value)}/></label><label>To account number (optional for exact match)<input type="text" value={pdfTo} onChange={event=>setPdfTo(event.target.value)}/></label></div>}
              {pdfMode === 'search' && <><div className="pdf-fields"><label>Name, account number or customer ID<input type="search" value={pdfSearch} onChange={event=>setPdfSearch(event.target.value)}/></label></div><label><input type="checkbox" checked={pdfMatches.length>0 && pdfMatches.every(record=>pdfSelected.has(pdfKey(record)))} onChange={event=>setPdfSelected(current=>{const next=new Set(current);pdfMatches.forEach(record=>{if(event.target.checked) next.add(pdfKey(record));else next.delete(pdfKey(record));});return next;})}/> Select all filtered results ({pdfMatches.length})</label><div className="pdf-results">{pdfMatches.map(record=><label key={pdfKey(record)}><input type="checkbox" checked={pdfSelected.has(pdfKey(record))} onChange={event=>setPdfSelected(current=>{const next=new Set(current);if(event.target.checked) next.add(pdfKey(record));else next.delete(pdfKey(record));return next;})}/>{String(record.name||'Unnamed')} · {String(record.accountNo||'No account')} · {String(record.enrolId||'No ID')}</label>)}</div></>}
              <p>{pdfLoading ? 'Loading local customers…' : `${pdfChosen.length} selected of ${pdfRecords.length} local customers`}</p>
              {pdfIncomplete && <p>Local download is incomplete. This export may be partial.</p>}
              <small>Output: one A4 PDF preview with the existing customer layout. The PDF has five customer sections per A4 page. Preview, save and print controls appear after generation.</small>
            </div>
          </div>
          <div className="pdf-actions"><button type="button" onClick={()=>{if(pdfLoading)pdfCancelled.current=true;else setPdfOpen(false);}}>{pdfLoading?'Cancel generation':'Cancel'}</button><button type="button" disabled={!pdfValid || !pdfChosen.length || pdfLoading} onClick={()=>void makeAllCustomersPdf(pdfChosen)}>{pdfLoading?`Preparing ${pdfProgress}/${pdfChosen.length}…`:"Generate PDF"}</button></div></>}
        </div>
      </div></ModalPortal>}

      {showMatchModal && customerMatches.length > 1 && <ModalPortal>
        <div
          className="match-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="multiple-customer-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeMatchModal();
            }
          }}
        >
          <div className="match-modal">
            <div className="match-modal-header">
              <div>
                <h3 id="multiple-customer-title">
                  {customerMatches.length} Customers Found
                </h3>
                <p>
                  More than one customer matches "{query}". Select the correct customer below.
                </p>
              </div>

              <button
                type="button"
                className="match-modal-close"
                onClick={closeMatchModal}
                aria-label="Close customer selection"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="match-list">
              {customerMatches.map((match, index) => (
                <div
                  className="match-card"
                  key={`${match.rowNumber}-${match.accountNo || match.enrolId || index}`}
                >
                  <div>
                    <div className="match-name">
                      {safe(match.name) || "NAME NOT AVAILABLE"}
                    </div>

                    <div className="match-details">
                      <span>
                        <b>C/O:</b>{" "}
                        {safe(match.fatherName) ||
                          safe(match.guardianName) ||
                          "-"}
                      </span>
                      <span>
                        <b>Mobile:</b>{" "}
                        {safe(match.mobile) ||
                          safe(match.contact) ||
                          "-"}
                      </span>
                      <span>
                        <b>Account No.:</b>{" "}
                        {safe(match.accountNo) || "-"}
                      </span>
                      <span>
                        <b>Customer ID:</b>{" "}
                        {safe(match.enrolId) || "-"}
                      </span>
                      <span>
                        <b>AOF No.:</b>{" "}
                        {safe(match.aofNo) || "-"}
                      </span>
                      <span>
                        <b>Opening Date:</b>{" "}
                        {safe(match.accountOpeningDate) || "-"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="match-select-button"
                    disabled={selectedMatchLoading !== null}
                    onClick={() => selectMatchedCustomer(match)}
                  >
                    {selectedMatchLoading === match.rowNumber
                      ? "Loading..."
                      : "Select"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ModalPortal>}

      {/* =============================================

          STATUS

      ============================================== */}

      {error && (

        <div className="customer-error">

          {error}

        </div>

      )}

      {message && (

        <div className="customer-message">

          {message}

        </div>

      )}

      {/* =============================================

          EMPTY

      ============================================== */}

      {!customer && !showMatchModal && (

        <div className="customer-empty">

          Search a customer to load

          Customer Preview.

        </div>

      )}

      {/* =============================================

          CUSTOMER

      ============================================== */}

      {customer && (

        <div className="preview-wrapper">

          <div className="preview-title">

            CUSTOMER PREVIEW

          </div>

          <div style={{padding:"12px",background:"var(--app-dark-surface, white)",color:"var(--app-dark-text, #18354d)",borderRadius:8}}><strong>Form Send to Branch</strong>: {afsmDisplay(customer as unknown as Record<string,unknown>)}</div>
          <CustomerPreviewCard customer={customer} cardRef={customerPreviewCard} />

          {/* =========================================

              BUTTONS

          ========================================== */}

          <div className="customer-actions">

            <button

              type="button"

              className="

                action-button

                print-customer-button

              "

              onClick={printCustomer}

            >

              🖨 Print

            </button>
            <button type="button" className="action-button whatsapp-button" onClick={() => void shareCustomer()}>↗ Share Image</button>

            <button

              type="button"

              className="

                action-button

                search-again-button

              "

              onClick={searchAgain}

            >

              🔎 Search Again

            </button>

            <button

              type="button"

              className="action-button whatsapp-button"

              onClick={openWhatsApp}

            >

              💬 WhatsApp

            </button>

            <button

              type="button"

              className="

                action-button

                all-pdf-button

              "

              onClick={

                openPdfSelection

              }

            >

              📄 All PDF

            </button>

          </div>

        </div>

      )}

    </div>

  );

}

function CustomerPreviewCard({customer,cardRef}:{customer:Customer;cardRef?:Ref<HTMLDivElement>}) {
  return (
          <div ref={cardRef} className="customer-preview">

            <div className="customer-preview-heading">

              <h2>

                CUSTOMER PREVIEW

              </h2>

            </div>

            <div className="customer-grid">

              <div className="info-column">

                <InfoRow label="AOF NO." value={customer.aofNo} />

                <InfoRow label="CIF / CUSTOMER ID" value={customer.enrolId} />

                <InfoRow label="ACCOUNT NO." value={customer.accountNo} />

                <InfoRow label="A/C OPENING DATE" value={customer.accountOpeningDate} />

                <InfoRow label="NOMINEE" value={customer.nominee} upper />

                <InfoRow label="MOBILE" value={customer.contact} />

                <InfoRow label="AADHAAR NO." value={customer.uidaiNo} />

              </div>

              <div className="info-column">

                <InfoRow label="NAME" value={customer.name} upper />

                <InfoRow label="C/O NAME" value={customer.coName} upper />

                <InfoRow label="ADDRESS" value={makeAddress(customer)} upper address />

                <InfoRow label="PIN CODE" value={customer.pinCode} />

                <InfoRow label="PAN" value={customer.pan} upper />

              </div>

              <div className="photo-section">

                <div className="photo-box">

                  {customer.photoPreview || customer.photoUrl ? (

                    <img src={customer.photoPreview || customer.photoUrl} alt="Customer" />

                  ) : (

                    <div className="photo-placeholder">CUSTOMER<br />PHOTO</div>

                  )}

                </div>

                <div className="photo-label">CUSTOMER PHOTO</div>

              </div>

            </div>

            <div className="customer-status-strip">

              <div className="status-item">

                <span>ACCOUNT STATUS</span>

                <strong>{safe(customer.status) || "-"}</strong>

              </div>

              <div className="status-item">

                <span>DBT STATUS</span>

                <strong>{safe(customer.dbtStatus) || "-"}</strong>

              </div>

              <div className="status-item">

                <span>PASSBOOK STATUS</span>

                <strong>{safe(customer.passbookStatus) || "-"}</strong>

              </div>

            </div>

          </div>

  );
}

/* =========================================================

   INFO ROW

========================================================= */

function InfoRow({

  label,

  value,

  upper = false,

  address = false,

}: {

  label: string;

  value?: string | null;

  upper?: boolean;

  address?: boolean;

}) {

  const finalValue =

    safe(value) || "-";

  return (

    <div className="info-row">

      <div className="info-label">

        {label}

      </div>

      <div className="info-colon">

        :

      </div>

      <div

        className={[

          "info-value",

          upper

            ? "customer-name"

            : "",

          address

            ? "customer-address"

            : "",

        ]

          .filter(Boolean)

          .join(" ")}

      >

        {finalValue}

      </div>

    </div>

  );

}

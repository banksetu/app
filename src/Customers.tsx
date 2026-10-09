import { snapshot } from "./AllCustomerData";
import { isAndroid } from "./platform/android/runtime";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { localDataFetch, localModeEnabled, getDataIdToken, getLocalExportCustomers, getLocalStatus } from "./core/localData";
import { renderToStaticMarkup } from "react-dom/server";
import {

  useState,
  useRef,

  type FormEvent,

} from "react";

import { getAuth } from "firebase/auth";
import { getCustomerSearchApiUrl } from "./tenantApi";

const desktopBridge = () => (window as Window & {bankSetuDesktop?: {shareImage?: (image:string)=>Promise<void>}}).bankSetuDesktop;

/* =========================================================

   BANK SETU - CUSTOMER PREVIEW

========================================================= */

type Customer = {

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
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfIncomplete, setPdfIncomplete] = useState(false);
  const pdfGenerating = useRef(false);

  const pdfKey = (record: Record<string, unknown>) => String(record.recordId || record.rowNumber);
  const pdfMatches = pdfRecords.filter(record => {
    if (pdfMode === "all") return true;
    if (pdfMode === "date") {
      const date = String(record.accountOpeningDate || "").trim();
      // The opening date is the only existing date on customer records.
      const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(date) ? `${date.slice(6)}-${date.slice(3,5)}-${date.slice(0,2)}` : "";
      return !!day && day >= pdfFrom && day <= pdfTo;
    }
    if (pdfMode === "account") {
      const account = String(record.accountNo || "").trim();
      return !!account && account >= pdfFrom.trim() && account <= (pdfTo.trim() || pdfFrom.trim());
    }
    const term = pdfSearch.trim().toLocaleLowerCase();
    return !!term && [record.name, record.accountNo, record.enrolId].some(value => String(value || "").toLocaleLowerCase().includes(term));
  });
  const pdfValid = !pdfLoading && (pdfMode === "all" || (pdfMode === "date" && !!pdfFrom && !!pdfTo && pdfFrom <= pdfTo) || (pdfMode === "account" && !!pdfFrom.trim() && (!pdfTo.trim() || pdfFrom.trim() <= pdfTo.trim())) || (pdfMode === "search" && !!pdfSearch.trim()));
  const pdfChosen = pdfMode === "search" ? pdfMatches.filter(record => pdfSelected.has(pdfKey(record))) : pdfMatches;

  const openPdfSelection = async () => {
    setError(""); setPdfOpen(true); setPdfLoading(true); setPdfSelected(new Set());
    try {
      const [records, status] = await Promise.all([getLocalExportCustomers(), getLocalStatus()]);
      setPdfRecords(records); setPdfIncomplete(status.downloading || status.cacheLimited);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read local customers."); setPdfOpen(false); }
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

  const printCustomer = () => {

    if (!customer) {

      setError(

        "Search and load a customer first."

      );

      return;

    }

    setError("");

    window.print();

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
      const blob = await snapshot(customer as unknown as Record<string, unknown>);
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

  const makeAllCustomersPdf = (records: Record<string, unknown>[]) => {
    if (!pdfValid || !records.length || pdfGenerating.current) return;
    pdfGenerating.current = true;
    setError("");
    const popup = window.open("", "_blank", "width=1050,height=850");
    if (!popup) { pdfGenerating.current = false; setError("Allow the PDF preview popup and try again."); return; }
    let cancelled = false;
    const originalStyles = document.querySelector(".customers-page > style")?.textContent || "";
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Bank Setu - All Customers PDF</title><style>${originalStyles}</style><style>
      @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}
      body{margin:0;background:#e7ebf0;color:#111827;font-family:Arial,sans-serif}
      .export-toolbar{position:sticky;top:0;z-index:2;background:#102d38;color:#fff;padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
      .export-toolbar button{padding:9px 16px;border:0;border-radius:7px;cursor:pointer}
      .export-page{width:194mm;height:281mm;margin:12px auto;background:#fff;page-break-after:always;break-after:page;overflow:hidden;display:flex;flex-direction:column;gap:3mm;padding:0}
      .export-page:last-child{page-break-after:auto;break-after:auto}
      .export-slot{height:90mm;flex:none;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
      .export-slot .customer-preview{width:1100px!important;min-height:420px!important;transform:scale(var(--card-scale,.66));transform-origin:top left;box-shadow:none!important;}
      .export-slot .customer-grid{grid-template-columns:1fr 1.2fr 170px!important;gap:30px!important}
      .export-slot .info-row{grid-template-columns:145px 12px 1fr!important}
      .export-slot .photo-section{align-items:center!important}
      @media print{html,body{background:white!important;margin:0!important;padding:0!important}body *{visibility:visible!important}.export-toolbar{display:none!important}.export-page{margin:0!important}.export-slot .customer-preview{position:static!important;padding:28px!important;border-radius:18px!important;width:1100px!important;transform:scale(var(--card-scale,.66))!important}.export-slot .customer-grid{grid-template-columns:1fr 1.2fr 170px!important}}
      @media screen and (max-width:850px){.export-page{zoom:.55;margin:8px auto}}
    </style></head><body><div class="export-toolbar"><strong id="progress">Loading local customers…</strong><button id="print" disabled>Save PDF / Print</button><button id="cancel">Cancel</button></div><div id="pages"></div></body></html>`);
    popup.document.close();
    popup.document.getElementById("cancel")?.addEventListener("click", () => { cancelled = true; popup.close(); });
    popup.document.getElementById("print")?.addEventListener("click", () => popup.print());
    setPdfLoading(true);
    void (async () => {
      try {
        setPdfOpen(false);
        const pages = popup.document.getElementById("pages")!;
        const progress = popup.document.getElementById("progress")!;
        let skipped = 0;
        let failed = 0;
        for (let i = 0; i < records.length; i += 3) {
          if (cancelled || popup.closed) return;
          const page = popup.document.createElement("main"); page.className = "export-page";
          for (const record of records.slice(i, i + 3)) {
            const item = previewCustomer(record);
            if (!item.name && !item.enrolId && !item.accountNo) { skipped++; continue; }
            try {
              const slot = popup.document.createElement("div"); slot.className = "export-slot";
              slot.innerHTML = renderToStaticMarkup(<CustomerPreviewCard customer={item} />);
              page.appendChild(slot);
            } catch { failed++; }
          }
          if (page.childElementCount) {
            pages.appendChild(page);
            for (const card of page.querySelectorAll<HTMLElement>(".customer-preview")) {
              card.style.setProperty("--card-scale",String(Math.min(.66,(90*96/25.4-2)/card.scrollHeight)));
            }
          }
          if (i % 30 === 0) { progress.textContent = `Preparing ${Math.min(i + 3, records.length)} / ${records.length} local customers…`; await new Promise(resolve => setTimeout(resolve, 0)); }
        }
        await popup.document.fonts?.ready;
        const images = [...popup.document.images];
        await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => { const timer=setTimeout(resolve,5000); img.onload = img.onerror = () => {clearTimeout(timer);resolve();}; })));
        if (cancelled || popup.closed) return;
        const incomplete = pdfIncomplete;
        progress.textContent = `${records.length - skipped - failed} ready · ${skipped} skipped · ${failed} failed · ${pages.childElementCount} A4 pages${incomplete ? " · local download incomplete; partial export" : ""}`;
        if (pages.childElementCount) popup.document.getElementById("print")!.removeAttribute("disabled");
        setMessage(incomplete ? "Local download is incomplete. PDF preview is marked partial." : `PDF preview ready for ${records.length - skipped - failed} customers; ${skipped} skipped, ${failed} failed.`);
      } catch (reason) { if (!popup.closed) popup.document.getElementById("progress")!.textContent = reason instanceof Error ? reason.message : "PDF preview failed."; setError(reason instanceof Error ? reason.message : "PDF preview failed."); }
      finally { pdfGenerating.current = false; setPdfLoading(false); }
    })();
  };

  /* =======================================================

     RENDER

  ======================================================= */

  return (

    <div className="customers-page">

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
        .pdf-dialog h2{margin:0;font-size:26px}.pdf-dialog p{margin:5px 0 20px;color:#64748b}
        .pdf-layout{display:grid;grid-template-columns:minmax(210px,38%) 1fr;gap:20px}
        .pdf-modes{display:grid;gap:10px}.pdf-mode{display:flex;align-items:center;gap:14px;border:1px solid #d9e2ed;border-radius:10px;padding:16px;cursor:pointer}.pdf-mode:has(input:checked){border-color:#2476f2;background:#eaf3ff}.pdf-mode input{accent-color:#1769dc}.pdf-detail{background:#f6f9fd;border:1px solid #dce8f5;border-radius:10px;padding:20px;min-height:220px}
        .pdf-fields{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.pdf-fields label{display:grid;gap:5px;flex:1;min-width:150px}.pdf-fields input{width:100%;padding:10px;border:1px solid #b9c8d9;border-radius:7px}
        .pdf-results{max-height:210px;overflow:auto;background:#fff;border:1px solid #dce8f5;border-radius:8px}.pdf-results label{display:block;padding:9px;border-bottom:1px solid #e8eef5}.pdf-results input{margin-right:8px}
        .pdf-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:24px}.pdf-actions button{border:0;border-radius:8px;padding:12px 18px;cursor:pointer}.pdf-actions button:last-child{background:#1469e7;color:white}.pdf-actions button:disabled{opacity:.5;cursor:not-allowed}
        @media(max-width:650px){.pdf-dialog{padding:16px}.pdf-layout{grid-template-columns:1fr}.pdf-modes{grid-template-columns:1fr 1fr}.pdf-mode{padding:10px;font-size:13px}}
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

      {pdfOpen && <div className="match-modal-backdrop" role="presentation" onMouseDown={event => { if(event.target === event.currentTarget && !pdfLoading) setPdfOpen(false); }}>
        <div className="pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="pdf-title">
          <h2 id="pdf-title">📄 Generate Customer PDFs</h2>
          <p>Select which customers' preview PDFs you want to generate and download.</p>
          <div className="pdf-layout">
            <div className="pdf-modes">{([['all','All Customers'],['date','Date Wise'],['account','Account Number Range'],['search','Search Customer']] as const).map(([mode,label]) => <label className="pdf-mode" key={mode}><input type="radio" name="pdf-mode" checked={pdfMode === mode} onChange={() => {setPdfMode(mode);setPdfFrom('');setPdfTo('');setPdfSelected(new Set());}}/><strong>{label}</strong></label>)}</div>
            <div className="pdf-detail">
              <strong>{pdfMode === 'all' ? 'All Customers' : pdfMode === 'date' ? 'Account Opening Date' : pdfMode === 'account' ? 'Account Number Range' : 'Search Customer'}</strong>
              {pdfMode === 'date' && <div className="pdf-fields"><label>From opening date<input type="date" value={pdfFrom} onChange={event=>setPdfFrom(event.target.value)}/></label><label>To opening date<input type="date" value={pdfTo} onChange={event=>setPdfTo(event.target.value)}/></label></div>}
              {pdfMode === 'account' && <div className="pdf-fields"><label>From account number<input type="text" value={pdfFrom} onChange={event=>setPdfFrom(event.target.value)}/></label><label>To account number (optional for exact match)<input type="text" value={pdfTo} onChange={event=>setPdfTo(event.target.value)}/></label></div>}
              {pdfMode === 'search' && <><div className="pdf-fields"><label>Name, account number or customer ID<input type="search" value={pdfSearch} onChange={event=>setPdfSearch(event.target.value)}/></label></div><label><input type="checkbox" checked={pdfMatches.length>0 && pdfMatches.every(record=>pdfSelected.has(pdfKey(record)))} onChange={event=>setPdfSelected(current=>{const next=new Set(current);pdfMatches.forEach(record=>{if(event.target.checked) next.add(pdfKey(record));else next.delete(pdfKey(record));});return next;})}/> Select all filtered results ({pdfMatches.length})</label><div className="pdf-results">{pdfMatches.map(record=><label key={pdfKey(record)}><input type="checkbox" checked={pdfSelected.has(pdfKey(record))} onChange={event=>setPdfSelected(current=>{const next=new Set(current);if(event.target.checked) next.add(pdfKey(record));else next.delete(pdfKey(record));return next;})}/>{String(record.name||'Unnamed')} · {String(record.accountNo||'No account')} · {String(record.enrolId||'No ID')}</label>)}</div></>}
              <p>{pdfLoading ? 'Loading local customers…' : `${pdfChosen.length} selected of ${pdfRecords.length} local customers`}</p>
              {pdfIncomplete && <p>Local download is incomplete. This export may be partial.</p>}
              <small>Output: one A4 PDF preview with the existing customer layout. Choose “Save as PDF” in the print dialog; its file name is set there.</small>
            </div>
          </div>
          <div className="pdf-actions"><button type="button" onClick={()=>setPdfOpen(false)} disabled={pdfLoading}>Cancel</button><button type="button" disabled={!pdfValid || !pdfChosen.length} onClick={()=>makeAllCustomersPdf(pdfChosen)}>Generate PDFs</button></div>
        </div>
      </div>}

      {showMatchModal && customerMatches.length > 1 && (
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
      )}

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

          <CustomerPreviewCard customer={customer} />

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

function previewCustomer(value: Record<string, unknown>): Customer {
  const field = (key: string) => String(value[key] ?? "");
  return {
    ...emptyCustomer, enrolId:field("enrolId"), accountNo:field("accountNo"), name:field("name"),
    coName:field("coName") || field("fatherName"), status:field("status"), gender:field("gender"),
    contact:field("contact") || field("mobile"), accountOpeningDate:field("accountOpeningDate"),
    address:field("address"), nominee:field("nominee"), postOffice:field("postOffice"),
    passbookStatus:field("passbookStatus"), uidaiNo:field("uidaiNo"), dbtStatus:field("dbtStatus"),
    purposeOfAdvance:field("purposeOfAdvance"), fullAddress:field("fullAddress"),
    pinCode:field("pinCode"), pan:field("pan"), aofNo:field("aofNo"),
    photoPreview:field("photoPreview") || field("photoDataUrl"),
  };
}

function CustomerPreviewCard({customer}:{customer:Customer}) {
  return (
          <div className="customer-preview">

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

import { localDataFetch, getDataIdToken } from "./core/localData";
import {

  useState,

  type FormEvent,

} from "react";

import { getAuth } from "firebase/auth";
import { getTenantApiUrl } from "./tenantApi";

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

  /* =======================================================

     API REQUEST

  ======================================================= */

  const apiRequest = async (

    body: Record<string, unknown>

  ) => {

      const apiUrl = getTenantApiUrl();

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

  /* =======================================================

     MAKE ALL CUSTOMERS PDF

     UI button is ready.

     Backend bulk-customer API will be connected

     in the next step.

  ======================================================= */

  const makeAllCustomersPdf = async () => {

    setError("");

    setMessage("");

    setLoading(true);

    try {

      const allCustomers: Customer[] = [];

      let page = 1;

      let hasNextPage = true;

      while (hasNextPage) {

        const result = await apiRequest({

          action: "getAllCustomers",

          page,

          pageSize: 50,

        });

        const batch = Array.isArray(result.customers)

          ? (result.customers as Customer[])

          : [];

        allCustomers.push(...batch);

        hasNextPage = Boolean(result.hasNextPage);

        page += 1;

        if (page > 1000) {

          throw new Error("Too many customer pages returned by the API.");

        }

      }

      if (allCustomers.length === 0) {

        throw new Error("No customer data found.");

      }

      const popup = window.open("", "_blank", "width=1000,height=800");

      if (!popup) {

        throw new Error("Popup was blocked. Please allow popups and try again.");

      }

      const esc = (value?: string | null) =>

        String(value ?? "")

          .replace(/&/g, "&amp;")

          .replace(/</g, "&lt;")

          .replace(/>/g, "&gt;")

          .replace(/"/g, "&quot;")

          .replace(/'/g, "&#039;");

      const customerCard = (item: Customer) => {

        const address = makeAddress(item);

        const photo = item.photoPreview || item.photoUrl || "";

        return `

          <section class="customer-card">

            <div class="details">

              <div><b>AOF NO.</b><span>${esc(item.aofNo)}</span></div>

              <div><b>CIF / CUSTOMER ID</b><span>${esc(item.enrolId)}</span></div>

              <div><b>ACCOUNT NO.</b><span>${esc(item.accountNo)}</span></div>

              <div><b>A/C OPENING DATE</b><span>${esc(item.accountOpeningDate)}</span></div>

              <div><b>MOBILE</b><span>${esc(item.contact)}</span></div>

              <div><b>AADHAAR NO.</b><span>${esc(item.uidaiNo)}</span></div>

            </div>

            <div class="details">

              <div><b>NAME</b><span>${esc(item.name).toUpperCase()}</span></div>

              <div><b>C/O NAME</b><span>${esc(item.coName).toUpperCase()}</span></div>

              <div><b>ADDRESS</b><span>${esc(address).toUpperCase()}</span></div>

              <div><b>PIN CODE</b><span>${esc(item.pinCode)}</span></div>

              <div><b>PAN</b><span>${esc(item.pan).toUpperCase()}</span></div>

              <div><b>NOMINEE</b><span>${esc(item.nominee).toUpperCase()}</span></div>

            </div>

            <div class="details status-col">

              <div><b>ACCOUNT STATUS</b><span>${esc(item.status)}</span></div>

              <div><b>DBT STATUS</b><span>${esc(item.dbtStatus)}</span></div>

              <div><b>PASSBOOK STATUS</b><span>${esc(item.passbookStatus)}</span></div>

            </div>

            <div class="photo-wrap">

              ${photo ? `<img src="${esc(photo)}" alt="Customer photo" />` : `<div class="no-photo">NO PHOTO</div>`}

            </div>

          </section>`;

      };

      const pages: string[] = [];

      for (let i = 0; i < allCustomers.length; i += 3) {

        pages.push(

          `<main class="pdf-page">${allCustomers

            .slice(i, i + 3)

            .map(customerCard)

            .join("")}</main>`

        );

      }

      popup.document.open();

      popup.document.write(`<!doctype html>

<html>

<head>

<meta charset="utf-8" />

<title>Bank Setu - All Customers</title>

<style>

  @page { size: A4; margin: 8mm; }

  * { box-sizing: border-box; }

  body { margin: 0; font-family: Arial, sans-serif; color: #111; background: #fff; }

  .pdf-page { width: 100%; min-height: 281mm; page-break-after: always; display: flex; flex-direction: column; gap: 4mm; }

  .pdf-page:last-child { page-break-after: auto; }

  .customer-card { height: 88mm; border: 1px solid #777; padding: 4mm; display: grid; grid-template-columns: 1.05fr 1.35fr .9fr 27mm; gap: 3mm; overflow: hidden; }

  .details { min-width: 0; }

  .details > div { display: grid; grid-template-columns: 42% 58%; gap: 2mm; margin-bottom: 2.2mm; align-items: start; font-size: 8.5pt; text-align: left; }

  .details b { font-size: 7.6pt; }

  .details span { overflow-wrap: anywhere; text-align: left; }

  .status-col > div { grid-template-columns: 52% 48%; }

  .photo-wrap { text-align: left; }

  .photo-wrap img, .no-photo { width: 25mm; height: 31mm; object-fit: cover; border: 1px solid #777; }

  .no-photo { display: flex; align-items: center; justify-content: center; font-size: 7pt; }

  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }

</style>

</head>

<body>${pages.join("")}</body>

</html>`);

      popup.document.close();

      window.setTimeout(() => {

        popup.focus();

        popup.print();

      }, 500);

      setMessage(`${allCustomers.length} customers loaded. Print dialog opened for PDF.`);

    } catch (err) {

      setError(

        err instanceof Error

          ? err.message

          : "All customers could not be loaded."

      );

    } finally {

      setLoading(false);

    }

  };

  const photo =

    customer?.photoPreview ||

    customer?.photoUrl ||

    "";

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

                  {photo ? (

                    <img src={photo} alt="Customer" />

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

                makeAllCustomersPdf

              }

            >

              📄 Make All Customers PDF

            </button>

          </div>

        </div>

      )}

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

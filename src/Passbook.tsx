import { localDataFetch, getDataIdToken } from "./core/localData";
import {

  useState,


  type FormEvent,

} from "react";

import { getAuth } from "firebase/auth";
import { getTenantApiUrl } from "./tenantApi";

import AssamQuickPassbook, { isAssamBank, isUnionBank, type PassbookBankInfo } from "./AssamQuickPassbook";
import UnionPassbook from "./UnionPassbook";



/* =========================================================

   BANK SETU - PASSBOOK PRINT

   Open Passbook Size: 20.5cm x 17.5cm



   IMPORTANT:

   - Preview Edit is TEMPORARY only.

   - Temporary edits NEVER update Google Sheet / Database.

   - Print marks Passbook Status as "Printed".

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


type EditableCustomer = Pick<

  Customer,

  | "enrolId"

  | "accountNo"

  | "name"

  | "coName"

  | "contact"

  | "accountOpeningDate"

  | "nominee"

  | "fullAddress"

  | "pan"

>;



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

};



/* =========================================================

   FIXED BRANCH INFORMATION

========================================================= */



const DEFAULT_BRANCH = {

  name: "BADARPUR",

  addressLine1: "PO:-BADARPUR",

  addressLine2: "DIST:-KARIMGANJ",

  pin: "788806",



  ifsc: "PUNB0RRBAGB",

  branchCode: "7345",

  micr: "788116106",



  email: "",

};



/* =========================================================

   HELPERS

========================================================= */



const safe = (value?: string | null) =>

  String(value ?? "").trim();


// Passbook output must use block/capital letters.
const printText = (value?: string | null) =>
  safe(value).toUpperCase();



function formatDate(value: string) {

  const raw = safe(value);



  if (!raw) return "";



  // Already DD-MM-YYYY / DD/MM/YYYY

  const normal = raw.match(

    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/

  );



  if (normal) {

    return `${normal[1].padStart(

      2,

      "0"

    )}-${normal[2].padStart(

      2,

      "0"

    )}-${normal[3]}`;

  }



  // YYYY-MM-DD

  const iso = raw.match(

    /^(\d{4})-(\d{1,2})-(\d{1,2})/

  );



  if (iso) {

    return `${iso[3].padStart(

      2,

      "0"

    )}-${iso[2].padStart(

      2,

      "0"

    )}-${iso[1]}`;

  }



  return raw;

}



function makePrintAddress(customer: Customer) {

  const full = safe(customer.fullAddress);



  if (full) return full.toUpperCase();



  return [

    safe(customer.address),

    safe(customer.postOffice),

    safe(customer.pinCode),

  ]

    .filter(Boolean)

    .join(", ")
    .toUpperCase();

}



/* =========================================================

   COMPONENT

========================================================= */



export default function Passbook({ formatType = "passbook", bankInfo }: { formatType?: "passbook" | "quickPassbook"; bankInfo?: PassbookBankInfo }) {
  const workspaceBranch = bankInfo?.branchName?.trim();
  const referenceBranch = !workspaceBranch || workspaceBranch.toUpperCase() === "BADARPUR";
  const branchAddress = bankInfo?.address?.trim().split(/\n+/) || [];
  const BRANCH = {
    ...DEFAULT_BRANCH,
    name: workspaceBranch?.toUpperCase() || DEFAULT_BRANCH.name,
    addressLine1: branchAddress[0]?.toUpperCase() || (referenceBranch ? DEFAULT_BRANCH.addressLine1 : ""),
    addressLine2: branchAddress.slice(1).join(" ").toUpperCase() || (referenceBranch ? DEFAULT_BRANCH.addressLine2 : ""),
    pin: referenceBranch ? DEFAULT_BRANCH.pin : "",
    ifsc: bankInfo?.ifsc || (referenceBranch ? DEFAULT_BRANCH.ifsc : ""),
    micr: bankInfo?.micr || (referenceBranch ? DEFAULT_BRANCH.micr : ""),
    branchCode: bankInfo?.branchCode || (referenceBranch ? DEFAULT_BRANCH.branchCode : ""),
    email: bankInfo?.branchEmail || "",
  };
  const isAssamQuick = formatType === "quickPassbook" && isAssamBank(bankInfo?.passbookBank);
  const isUnion = formatType === "passbook" && isUnionBank(bankInfo?.passbookBank || bankInfo?.bankName);


  const [query, setQuery] = useState("");

  const [customer, setCustomer] =

    useState<Customer | null>(null);



  const [previewCustomer, setPreviewCustomer] =

    useState<Customer | null>(null);



  const [rowNumber, setRowNumber] =

    useState<number | null>(null);



  const [loading, setLoading] = useState(false);

  const [printing, setPrinting] = useState(false);
  const [directPrinting, setDirectPrinting] = useState(false);



  const [message, setMessage] = useState("");

  const [error, setError] = useState("");



  const [editMode, setEditMode] = useState(false);

  const [customerMatches, setCustomerMatches] = useState<CustomerMatch[]>([]);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedMatchLoading, setSelectedMatchLoading] = useState<number | null>(null);



  /* =======================================================

     API HELPER

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



    const idToken = await getDataIdToken();



    const response = await localDataFetch(apiUrl, {

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



    const result = await response.json();



    if (!result?.success) {

      throw new Error(

        result?.message ||

          "Request could not be completed."

      );

    }



    return result;

  };



  /* =======================================================

     SEARCH

  ======================================================= */



  const searchCustomer = async (event?: FormEvent) => {
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
    setEditMode(false);
    setCustomer(null);
    setPreviewCustomer(null);
    setRowNumber(null);
    setCustomerMatches([]);
    setShowMatchModal(false);

    try {
      const result = await apiRequest({
        action: "searchCustomer",
        query: searchValue,
        includePhoto: isAssamQuick,
      });

      const matches: CustomerMatch[] = Array.isArray(result.matches)
        ? result.matches
        : [];

      if (result.multipleMatches === true && matches.length > 1) {
        setCustomerMatches(matches);
        setShowMatchModal(true);
        setMessage(
          result.message ||
            `${matches.length} matching customers found. Please select the required customer.`
        );
        return;
      }

      const loaded: Customer = {
        ...emptyCustomer,
        ...(result.customer || {}),
      };

      setCustomer(loaded);
      setPreviewCustomer({ ...loaded });
      setRowNumber(Number(result.rowNumber) || null);
      setMessage("Customer loaded successfully.");
    } catch (err) {
      setCustomer(null);
      setPreviewCustomer(null);
      setRowNumber(null);
      setCustomerMatches([]);
      setShowMatchModal(false);
      setError(
        err instanceof Error ? err.message : "Customer could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  };

  const selectMatchedCustomer = async (match: CustomerMatch) => {

    setSelectedMatchLoading(match.rowNumber);
    setError("");

    try {
      const result = await apiRequest({
        action: "getCustomerByRowNumber",
        rowNumber: match.rowNumber,
        includePhoto: isAssamQuick,
      });

      const loaded: Customer = {
        ...emptyCustomer,
        ...(result.customer || {}),
      };

      setCustomer(loaded);
      setPreviewCustomer({ ...loaded });
      setRowNumber(Number(result.rowNumber) || match.rowNumber || null);
      setCustomerMatches([]);
      setShowMatchModal(false);
      setMessage("Selected customer loaded successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Selected customer could not be loaded."
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

     TEMPORARY PREVIEW EDIT

  ======================================================= */



  const changePreviewField = (

    field: keyof EditableCustomer,

    value: string

  ) => {

    setPreviewCustomer((previous) => {

      if (!previous) return previous;



      return {

        ...previous,

        [field]: value,

      };

    });

  };



  const cancelTemporaryEdit = () => {

    if (customer) {

      setPreviewCustomer({

        ...customer,

      });

    }



    setEditMode(false);

    setMessage(

      "Temporary changes cancelled."

    );

  };



  const applyTemporaryEdit = () => {

    setEditMode(false);



    setMessage(

      "Preview updated temporarily. Database was not changed."

    );

  };



  /* =======================================================

     CLEAR

  ======================================================= */



  const clearPassbook = () => {


    setQuery("");

    setCustomer(null);

    setPreviewCustomer(null);

    setRowNumber(null);

    setEditMode(false);

    setError("");

    setMessage("");

  };



  /* =======================================================

     PRINT

  ======================================================= */



  const printPassbook = async () => {

    if (!previewCustomer) {

      setError(

        "Search and load a customer first."

      );

      return;

    }



    if (!rowNumber) {

      setError(

        "Customer row number is missing."

      );

      return;

    }



    setPrinting(true);

    setError("");

    setMessage("");



    try {

      /*

        IMPORTANT:

        Database में customer details update नहीं होतीं.

        केवल PASS BOOK status "Printed" होता है.

      */



      // IMPORTANT: open the browser/system print dialog FIRST.

      // A previous "Printed/Delivered" status must never block re-printing.

      window.print();



      // Only after the print dialog closes, try to mark the passbook as Printed.

      // Even if the backend says it was already printed, the print dialog has

      // already been shown and re-print remains available.

      try {

        await apiRequest({

          action: "markPassbookPrinted",

          rowNumber,

        });



        setCustomer((previous) =>

          previous

            ? { ...previous, passbookStatus: "Printed" }

            : previous

        );



        setPreviewCustomer((previous) =>

          previous

            ? { ...previous, passbookStatus: "Printed" }

            : previous

        );

      } catch (statusError) {

        console.warn(

          "Print dialog opened, but passbook status could not be updated:",

          statusError

        );

      }



      setMessage("Print dialog opened.");

    } catch (err) {

      setError(

        err instanceof Error

          ? err.message

          : "Passbook could not be printed."

      );

    } finally {

      setPrinting(false);

    }

  };



  /* =======================================================
     DIRECT PR2 / OLIVETTI RAW PRINT

     Browsers cannot open a USB/parallel printer and write RAW
     bytes to it directly. This button therefore talks to a
     small local printer bridge running on the operator PC.

     The printer itself must already be configured in OLIVETTI
     PR2/PR2E mode with PASSBOOK = Y. The local bridge receives
     the passbook data and sends it as RAW data to the printer.
  ======================================================= */

  const directPrinterSend = async () => {
    if (!previewCustomer) {
      setError("Search and load a customer first.");
      return;
    }

    if (!rowNumber) {
      setError("Customer row number is missing.");
      return;
    }

    setDirectPrinting(true);
    setError("");
    setMessage("");

    try {
      const response = await localDataFetch("http://127.0.0.1:18181/print-pr2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "OLIVETTI_PR2",
          passbook: {
            branch: {
              name: BRANCH.name,
              addressLine1: BRANCH.addressLine1,
              addressLine2: BRANCH.addressLine2,
              pin: BRANCH.pin,
              ifsc: BRANCH.ifsc,
              branchCode: BRANCH.branchCode,
              micr: BRANCH.micr,
              email: BRANCH.email,
            },
            customer: {
              enrolId: printText(previewCustomer.enrolId),
              accountNo: printText(previewCustomer.accountNo),
              pan: printText(previewCustomer.pan),
              contact: printText(previewCustomer.contact),
              accountOpeningDate: formatDate(previewCustomer.accountOpeningDate),
              nominee: printText(previewCustomer.nominee),
              name: printText(previewCustomer.name),
              coName: printText(previewCustomer.coName),
              address: makePrintAddress(previewCustomer),
            },
          },
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.message || "Direct printer bridge rejected the print job.");
      }

      try {
        await apiRequest({ action: "markPassbookPrinted", rowNumber });
        setCustomer((previous) =>
          previous ? { ...previous, passbookStatus: "Printed" } : previous
        );
        setPreviewCustomer((previous) =>
          previous ? { ...previous, passbookStatus: "Printed" } : previous
        );
      } catch (statusError) {
        console.warn("Direct print succeeded, but status update failed:", statusError);
      }

      setMessage("Passbook sent directly to Olivetti PR2 printer.");
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Make sure the BANK SETU PR2 Bridge is running on this computer.`
          : "Direct PR2 printing failed."
      );
    } finally {
      setDirectPrinting(false);
    }
  };

  const p = previewCustomer;



  /* =======================================================

     RENDER

  ======================================================= */



  return (

    <div className="passbook-page">

      <style>{`

        * {

          box-sizing: border-box;

        }



        .passbook-page {

          min-height: 100%;

          padding: 24px;

          color: #eaffff;

        }

        .passbook-page.bank-format-active .passbook-shell { display: none !important; }



        .passbook-heading {

          text-align: center;

          margin-bottom: 22px;

        }



        .passbook-heading h1 {

          margin: 0;

          font-size: 30px;

          font-weight: 800;

          color: #fff;

        }



        .passbook-heading p {

          margin: 7px 0 0;

          opacity: .72;

          font-size: 13px;

        }



        .passbook-search-card {

          max-width: 900px;

          margin: 0 auto 24px;

          padding: 20px;

          border-radius: 18px;

          border: 1px solid rgba(91,231,255,.25);

          background: rgba(4,52,83,.60);

          box-shadow: 0 15px 40px rgba(0,0,0,.18);

        }



        .passbook-search-label {

          display: block;

          margin-bottom: 9px;

          font-size: 12px;

          font-weight: 800;

          letter-spacing: 1.2px;

          color: #75f4e6;

        }



        .passbook-search-row {

          display: flex;

          gap: 10px;

        }



        .passbook-search-input {

          flex: 1;

          min-width: 0;

          height: 48px;

          padding: 0 16px;

          border-radius: 12px;

          border: 1px solid rgba(115,235,255,.28);

          outline: none;

          background: rgba(2,37,66,.78);

          color: white;

          font-size: 15px;

          font-weight: 700;

        }



        .passbook-search-input:focus {

          border-color: #62efe3;

          box-shadow: 0 0 0 3px rgba(98,239,227,.12);

        }





        /* Multiple customer selection */
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
          color: #fff;
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
          color: #fff;
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

        .match-details b { color: #fff; }

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

        .passbook-button {

          min-height: 46px;

          padding: 0 20px;

          border: 0;

          border-radius: 12px;

          cursor: pointer;

          font-weight: 800;

          font-size: 14px;

        }



        .search-button {

          background: linear-gradient(

            135deg,

            #6ef1dd,

            #5bcaff

          );

          color: #043451;

        }



        .passbook-message,

        .passbook-error {

          max-width: 900px;

          margin: 12px auto;

          padding: 11px 14px;

          border-radius: 10px;

          text-align: center;

          font-size: 13px;

          font-weight: 700;

        }



        .passbook-message {

          background: rgba(44,220,172,.13);

          border: 1px solid rgba(44,220,172,.28);

          color: #8affd9;

        }



        .passbook-error {

          background: rgba(255,92,92,.12);

          border: 1px solid rgba(255,92,92,.30);

          color: #ffb1b1;

        }



        .preview-heading {

          max-width: 20.5cm;

          margin: 25px auto 9px;

          display: flex;

          justify-content: space-between;

          align-items: center;

        }



        .preview-heading span:first-child {

          font-size: 13px;

          font-weight: 800;

          letter-spacing: 1px;

        }



        .status-chip {

          padding: 5px 10px;

          border-radius: 999px;

          background: rgba(100,240,218,.12);

          border: 1px solid rgba(100,240,218,.22);

          color: #7ff3df;

          font-size: 11px;

          font-weight: 800;

        }



        /* ===============================================

           PASSBOOK PREVIEW

           Exact physical canvas = 20.5cm x 17.5cm

        =============================================== */



        .passbook-shell {

          position: relative;

          width: 20.5cm;

          height: 17.5cm;

          margin: 0 auto;

          overflow: hidden;

          background: #f4f1e9;

          color: #1b1b1b;

          box-shadow:

            0 18px 55px rgba(0,0,0,.42);

          border-radius: 3px;

        }



        /*

          Upper half represents passbook cover.

          Nothing prints here.

        */

        .passbook-cover-space {

          position: absolute;

          left: 0;

          top: 0;

          width: 100%;

          height: 9cm;

          background:

            linear-gradient(

              180deg,

              #e8e5dc 0%,

              #f1eee6 100%

            );

          border-bottom: 1px dashed #b6b2a8;

        }



        .cover-note {

          position: absolute;

          inset: 0;

          display: flex;

          align-items: center;

          justify-content: center;

          color: #aaa69d;

          font-size: 12px;

          letter-spacing: 2px;

        }



        /*

          Bottom blank passbook page.

          All actual print data lives here.

        */

        .passbook-print-area {

          position: absolute;

          left: 0;

          top: 9cm;

          width: 20.5cm;

          height: 8.5cm;

          background: #fff;

          overflow: hidden;



          /* Narrow mono/typewriter look matching the supplied passbook sample. */

          font-family: "Courier New", "Nimbus Mono PS", "Liberation Mono", monospace;

          font-size: 9pt;

          font-weight: 500;

          font-stretch: condensed;

          letter-spacing: -0.72px;

          line-height: 1;

          -webkit-font-smoothing: none;

          text-rendering: geometricPrecision;
        text-transform: uppercase;

        }



        .pb-block {

          position: absolute;

          white-space: pre-wrap;

          text-align: left;

          margin: 0;

          padding: 0;

        }



        /* Positions calibrated from the supplied AGVB passbook sample.

           Content intentionally sits toward the LEFT, leaving more blank

           space at the far right just like the original print. */

        .pb-branch {

          left: .35cm;

          top: 2.31cm;

          width: 6.65cm;

        }



        .pb-ifsc {

          left: 7.75cm;

          top: 2.31cm;

          width: 5.9cm;

        }



        .pb-branch-code {

          left: 14.18cm;

          top: 2.31cm;

          width: 1.55cm;

          text-align: left;

        }



        .pb-micr {

          left: 7.75cm;

          top: 3.55cm;

          width: 5.9cm;

        }



        .pb-left-customer {

          left: .35cm;

          top: 4.29cm;

          width: 7.55cm;

        }



        .pb-right-customer {

          left: 7.75cm;

          top: 4.29cm;

          width: 8.65cm;

        }



        .pb-line {

          text-align: left;

          height: .40cm;

          line-height: .40cm;

          white-space: pre-wrap;

        }



        .pb-address-line {

          text-align: left;

          display: flex;

          align-items: flex-start;

          min-height: .40cm;

        }



        .pb-address-label {

          flex: 0 0 auto;

          white-space: nowrap;

        }



        .pb-address-value {

          display: inline-block;

          padding-left: .10cm;

          width: 5.95cm;

          white-space: pre-wrap;

          overflow-wrap: break-word;

          word-break: normal;

          line-height: 1.28;

        }



        /* ===============================================

           HOVER EDIT BUTTON

        =============================================== */



        .preview-edit-button {

          position: absolute;

          top: 10px;

          right: 10px;

          z-index: 30;



          width: 38px;

          height: 38px;



          display: flex;

          align-items: center;

          justify-content: center;



          border: 1px solid rgba(0,0,0,.15);

          border-radius: 50%;

          background: rgba(255,255,255,.94);

          color: #172b3c;

          cursor: pointer;

          font-size: 18px;



          opacity: 0;

          transform: translateY(-4px);

          transition:

            opacity .18s ease,

            transform .18s ease;

        }



        .passbook-shell:hover

          .preview-edit-button {

          opacity: 1;

          transform: translateY(0);

        }



        /* ===============================================

           TEMPORARY EDIT PANEL

        =============================================== */



        .edit-panel {

          max-width: 900px;

          margin: 20px auto 0;

          padding: 20px;

          border-radius: 16px;

          background: rgba(3,46,75,.94);

          border: 1px solid rgba(98,239,227,.25);

        }



        .edit-title {

          margin: 0 0 5px;

          font-size: 18px;

        }



        .edit-warning {

          margin: 0 0 16px;

          color: #8ceadd;

          font-size: 12px;

          font-weight: 700;

        }



        .edit-grid {

          display: grid;

          grid-template-columns:

            repeat(2, minmax(0,1fr));

          gap: 12px;

        }



        .edit-field label {

          display: block;

          margin-bottom: 5px;

          font-size: 11px;

          font-weight: 800;

          color: #a9dce4;

        }



        .edit-field input,

        .edit-field textarea {

          width: 100%;

          padding: 10px 11px;

          border-radius: 9px;

          border: 1px solid rgba(255,255,255,.13);

          background: rgba(0,20,40,.55);

          color: white;

          outline: none;

          font-size: 14px;

          font-weight: 700;

        }



        .edit-field textarea {

          min-height: 88px;

          resize: vertical;

        }



        .full-field {

          grid-column: 1 / -1;

        }



        .edit-actions,

        .passbook-actions {

          display: flex;

          justify-content: center;

          gap: 12px;

          margin-top: 18px;

          flex-wrap: wrap;

        }



        .apply-button {

          background: #64efdc;

          color: #05354a;

        }



        .cancel-button,

        .clear-button {

          background: rgba(255,255,255,.08);

          border: 1px solid rgba(255,255,255,.16);

          color: #d8f7fa;

        }



        .print-button {

          background: linear-gradient(

            135deg,

            #6ef1dd,

            #5bcaff

          );

          color: #043451;

          min-width: 170px;

        }



  
      .direct-print-button {
        background: linear-gradient(135deg, #ffd166, #ff9f43);
        color: #352000;
        min-width: 190px;
      }

      .passbook-empty {

          max-width: 900px;

          margin: 30px auto;

          padding: 45px 20px;

          text-align: center;

          border-radius: 18px;

          border: 1px dashed rgba(112,231,244,.23);

          color: rgba(220,249,255,.60);

          background: rgba(4,46,73,.35);

        }



        /* ===============================================

           PRINT RULES

        =============================================== */



        @page {

          size: 20.5cm 17.5cm;

          margin: 0;

        }



        @media print {

          html,

          body {

            margin: 0 !important;

            padding: 0 !important;

            width: 20.5cm !important;

            height: 17.5cm !important;

            background: white !important;

          }



          body * {

            visibility: hidden !important;

          }



          .passbook-shell,

          .passbook-shell * {

            visibility: visible !important;

          }

          /* Union's separate renderer must also remain visible when the
             browser print stylesheet hides the application shell. */
          .union-pb-document,

          .union-pb-document * {

            visibility: visible !important;

          }

          .union-pb-document {

            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 20.5cm !important;
            height: 17.5cm !important;
            margin: 0 !important;
            box-shadow: none !important;

          }



          .passbook-shell {

            position: fixed !important;

            left: 0 !important;

            top: 0 !important;



            width: 20.5cm !important;

            height: 17.5cm !important;



            margin: 0 !important;

            padding: 0 !important;



            box-shadow: none !important;

            border: none !important;

            border-radius: 0 !important;

            background: white !important;

          }



          /*

            Physical passbook already has the cover.

            We leave this entire area blank.

          */

          .passbook-cover-space {

            background: white !important;

            border: none !important;

          }



          .cover-note,

          .preview-edit-button {

            display: none !important;

          }



          .passbook-print-area {

            background: transparent !important;

          }

        }



        @media (max-width: 900px) {

          .passbook-page {

            padding: 15px;

          }



          .passbook-search-row {

            flex-direction: column;

          }

          .passbook-search-input {
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

          .match-card { grid-template-columns: 1fr; }
          .match-details { grid-template-columns: 1fr; }
          .match-select-button { width: 100%; }



          .edit-grid {

            grid-template-columns: 1fr;

          }



          .full-field {

            grid-column: auto;

          }



          .passbook-shell {

            transform-origin: top left;

          }

        }

      `}</style>



      {/* HEADER */}

      <div className="passbook-heading">

        <h1>{formatType === "quickPassbook" ? "Quick Passbook" : "Passbook Print"}</h1>

        <p>

          Search customer • Preview • Temporary Edit • Print

        </p>

      </div>





      {/* SEARCH */}

      <form

        className="passbook-search-card"

        onSubmit={searchCustomer}

      >

        <label className="passbook-search-label">

          UNIVERSAL CUSTOMER SEARCH

        </label>



        <div className="passbook-search-row">

          <input

            className="passbook-search-input"

            value={query}

            onChange={(e) =>

              setQuery(e.target.value)

            }

            placeholder="Customer ID / Account No. / Aadhaar / Mobile"

            autoComplete="off"

          />



          <button

            type="submit"

            className="passbook-button search-button"

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
            if (event.target === event.currentTarget) closeMatchModal();
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
                      <span><b>C/O:</b> {safe(match.fatherName) || safe(match.guardianName) || "-"}</span>
                      <span><b>Mobile:</b> {safe(match.mobile) || safe(match.contact) || "-"}</span>
                      <span><b>Account No.:</b> {safe(match.accountNo) || "-"}</span>
                      <span><b>Customer ID:</b> {safe(match.enrolId) || "-"}</span>
                      <span><b>AOF No.:</b> {safe(match.aofNo) || "-"}</span>
                      <span><b>Opening Date:</b> {safe(match.accountOpeningDate) || "-"}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="match-select-button"
                    disabled={selectedMatchLoading !== null}
                    onClick={() => selectMatchedCustomer(match)}
                  >
                    {selectedMatchLoading === match.rowNumber ? "Loading..." : "Select"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      {error && (

        <div className="passbook-error">

          {error}

        </div>

      )}



      {message && (

        <div className="passbook-message">

          {message}

        </div>

      )}



      {/* EMPTY STATE */}

      {!p && (

        <div className="passbook-empty">

          Search a customer to load the

          passbook preview.

        </div>

      )}



      {/* PASSBOOK */}

      {p && (

        <>

          <div className="preview-heading">

            <span>PASSBOOK PREVIEW</span>



            <span className="status-chip">

              {safe(p.passbookStatus) ||

                "Pending"}

            </span>

          </div>



          {isAssamQuick ? <AssamQuickPassbook customer={p} bankInfo={bankInfo} onEdit={() => setEditMode(true)} /> : isUnion ? <UnionPassbook customer={p} bankInfo={bankInfo} onEdit={() => setEditMode(true)} /> : (
<div className="passbook-shell">

            {/* HOVER EDIT */}

            <button

              type="button"

              className="preview-edit-button"

              title="Temporarily edit passbook"

              onClick={() =>

                setEditMode(true)

              }

            >

              ✎

            </button>



            {/* TOP COVER AREA */}

            <div className="passbook-cover-space">

              <div className="cover-note">

                PASSBOOK COVER — NO PRINT

              </div>

            </div>



            {/* BOTTOM PRINT PAGE */}

            <div className="passbook-print-area">



              {/* FIXED LEFT */}

              <div className="pb-block pb-branch">

                <div className="pb-line">

                  BRANCH NAME: {BRANCH.name}

                </div>



                <div className="pb-line">

                  BR. ADDRESS: {BRANCH.addressLine1}

                </div>



                <div className="pb-line">

                  {"             "}

                  {BRANCH.addressLine2}

                </div>



                <div className="pb-line">

                  {"             "}

                  {BRANCH.pin}

                </div>

              </div>



              {/* FIXED RIGHT */}

              <div className="pb-block pb-ifsc">

                IFSC CODE: {BRANCH.ifsc}

              </div>



              <div className="pb-block pb-branch-code">

                ({BRANCH.branchCode})

              </div>



              <div className="pb-block pb-micr">

                MICR CODE: {BRANCH.micr}

              </div>



              {/* LEFT CUSTOMER */}

              <div className="pb-block pb-left-customer">

                <div className="pb-line">

                  BR. EMAIL : {BRANCH.email}

                </div>



                <div className="pb-line">

                  CUSTOMER ID: {printText(p.enrolId)}

                </div>



                <div className="pb-line">

                  ACCOUNT NO.: {printText(p.accountNo)}

                </div>



                <div className="pb-line">

                  PAN NUMBER : {printText(p.pan)}

                </div>



                <div className="pb-line">

                  MOBILE NO. : {printText(p.contact)}

                </div>



                <div className="pb-line">

                  OPENED ON  :{" "}

                  {formatDate(

                    p.accountOpeningDate

                  )}

                </div>



                <div className="pb-line">

                  ISSUE DATE :{" "}

                  {formatDate(

                    p.accountOpeningDate

                  )}

                </div>



                <div className="pb-line">

                  OPERATED BY: SELF

                </div>



                <div className="pb-line">

                  NOMINEE    :{" "}

                  {safe(p.nominee)

                    ? "1"

                    : ""}

                </div>

              </div>



              {/* RIGHT CUSTOMER */}

              <div className="pb-block pb-right-customer">

                <div className="pb-line">

                  ACC. HOLDER : {printText(p.name)}

                </div>



                <div className="pb-line">

                  JOINT HOLDER:

                </div>



                <div className="pb-address-line">

                  <span className="pb-address-label">

                    CUST ADD. :

                  </span>



                  <span className="pb-address-value">

                    {makePrintAddress(p).toUpperCase()}

                  </span>

                </div>

              </div>

            </div>

          </div>
)}

          {/* TEMP EDIT */}

          {editMode && (

            <div className="edit-panel">

              <h3 className="edit-title">

                Temporary Passbook Edit

              </h3>



              <p className="edit-warning">

                Changes made here affect only

                this preview/print. Google Sheet

                and customer database will NOT be

                updated.

              </p>



              <div className="edit-grid">

                <EditInput

                  label="Customer ID"

                  value={p.enrolId}

                  onChange={(value) =>

                    changePreviewField(

                      "enrolId",

                      value

                    )

                  }

                />



                <EditInput

                  label="Account Number"

                  value={p.accountNo}

                  onChange={(value) =>

                    changePreviewField(

                      "accountNo",

                      value

                    )

                  }

                />



                <EditInput

                  label="Account Holder"

                  value={p.name}

                  onChange={(value) =>

                    changePreviewField(

                      "name",

                      value

                    )

                  }

                />



                <EditInput

                  label="C/O Name"

                  value={p.coName}

                  onChange={(value) =>

                    changePreviewField(

                      "coName",

                      value

                    )

                  }

                />



                <EditInput

                  label="PAN"

                  value={p.pan}

                  onChange={(value) =>

                    changePreviewField(

                      "pan",

                      value

                    )

                  }

                />



                <EditInput

                  label="Mobile"

                  value={p.contact}

                  onChange={(value) =>

                    changePreviewField(

                      "contact",

                      value

                    )

                  }

                />



                <EditInput

                  label="Opening Date"

                  value={p.accountOpeningDate}

                  onChange={(value) =>

                    changePreviewField(

                      "accountOpeningDate",

                      value

                    )

                  }

                />



                <EditInput

                  label="Nominee"

                  value={p.nominee}

                  onChange={(value) =>

                    changePreviewField(

                      "nominee",

                      value

                    )

                  }

                />



                <div className="edit-field full-field">

                  <label>

                    Customer Full Address

                  </label>



                  <textarea

                    value={p.fullAddress}

                    onChange={(e) =>

                      changePreviewField(

                        "fullAddress",

                        e.target.value

                      )

                    }

                  />

                </div>

              </div>



              <div className="edit-actions">

                <button

                  type="button"

                  className="passbook-button apply-button"

                  onClick={applyTemporaryEdit}

                >

                  Apply to Preview

                </button>



                <button

                  type="button"

                  className="passbook-button cancel-button"

                  onClick={cancelTemporaryEdit}

                >

                  Cancel Changes

                </button>

              </div>

            </div>

          )}



          {/* BUTTONS */}

          <div className="passbook-actions">

            <button

              type="button"

              className="passbook-button print-button"

              onClick={printPassbook}

              disabled={printing}

            >

              {printing

                ? "Preparing Print..."

                : "🖨 Print Passbook"}

            </button>



            {!isAssamQuick && (<button

              type="button"

              className="passbook-button direct-print-button"

              onClick={directPrinterSend}

              disabled={directPrinting || printing}

              title="Send RAW passbook job through local Olivetti PR2 bridge"

            >

              {directPrinting

                ? "Sending to PR2..."

                : "Direct Printer Send"}

            </button>)}



            <button

              type="button"

              className="passbook-button clear-button"

              onClick={clearPassbook}

            >

              Clear

            </button>

          </div>

        </>

      )}

    </div>

  );

}



/* =========================================================

   EDIT INPUT

========================================================= */



function EditInput({

  label,

  value,

  onChange,

}: {

  label: string;

  value: string;

  onChange: (value: string) => void;

}) {

  return (

    <div className="edit-field">

      <label>{label}</label>



      <input

        value={value || ""}

        onChange={(event) =>

          onChange(event.target.value)

        }

      />

    </div>

  );

}

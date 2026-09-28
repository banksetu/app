import {



  useState,



  



  type FormEvent,



} from "react";



import { getAuth } from "firebase/auth";







/* =========================================================



   BANK SETU - PASSBOOK PRINT



   Open Passbook Size: 20.5cm x 17.5cm







   IMPORTANT:



   - Preview Edit is TEMPORARY only.



   - Temporary edits NEVER update Google Sheet / Database.



   - Print marks Passbook Status as "Printed".



\========================================================= */







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



\========================================================= */







const BRANCH = {



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



\========================================================= */







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



\========================================================= */







type PassbookProps = {
  selectedBank?: string;
};

const ASSAM_GRAMIN_BANK_NAMES = new Set([
  "Assam Gramin Bank",
  "Assam Gramin Vikash Bank",
  "Assam Gramin Vikas Bank",
]);

export default function Passbook({ selectedBank = "" }: PassbookProps) {



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







  /* =======================================================



     API HELPER



  \======================================================= */







  const apiRequest = async (



    body: Record<string, unknown>



  ) => {



    const apiUrl =



      localStorage



        .getItem("bankSetuApiUrl")



        ?.trim() || "";







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







    const idToken = await user.getIdToken();







    const response = await fetch(apiUrl, {



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



  \======================================================= */







  const searchCustomer = async (



    event?: FormEvent



  ) => {



    event?.preventDefault();







    const searchValue = query.trim();







    if (!searchValue) {



      setError(



        "Enter Customer ID, Account Number, Aadhaar Number or Mobile Number."



      );



      return;



    }







    setLoading(true);



    setError("");



    setMessage("");



    setEditMode(false);







    try {



      const result = await apiRequest({



        action: "searchCustomer",



        query: searchValue,



      });







      const loaded: Customer = {



        ...emptyCustomer,



        ...(result.customer || {}),



      };







      setCustomer(loaded);







      // Separate copy = temporary preview.



      setPreviewCustomer({



        ...loaded,



      });







      setRowNumber(



        Number(result.rowNumber) || null



      );







      setMessage(



        "Customer loaded successfully."



      );



    } catch (err) {



      setCustomer(null);



      setPreviewCustomer(null);



      setRowNumber(null);







      setError(



        err instanceof Error



          ? err.message



          : "Customer could not be loaded."



      );



    } finally {



      setLoading(false);



    }



  };







  /* =======================================================



     TEMPORARY PREVIEW EDIT



  \======================================================= */







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



  \======================================================= */







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



  \======================================================= */







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

  \======================================================= */



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

      const response = await fetch("http\://127.0.0.1:18181/print-pr2", {

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







  const selectedPassbookBank = selectedBank.trim();
  const hasConfiguredTemplate =
    ASSAM_GRAMIN_BANK_NAMES.has(selectedPassbookBank);

  if (!hasConfiguredTemplate) {
    return (
      <div
        style={{
          minHeight: "100%",
          padding: "24px",
          color: "#eaffff",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "22px",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "30px",
              fontWeight: 800,
              color: "#f4ffff",
              textShadow: "0 1px 10px rgba(71, 255, 229, 0.12)",
            }}
          >
            Passbook Print
          </h1>
          <p
            style={{
              margin: "7px 0 0",
              color: "#9bdad2",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            Search customer • Preview • Temporary Edit • Print
          </p>
        </div>

        <div
          style={{
            maxWidth: "900px",
            margin: "42px auto 0",
            padding: "28px 24px",
            borderRadius: "18px",
            textAlign: "center",
            border: "1px solid rgba(77, 224, 202, 0.22)",
            background:
              "linear-gradient(145deg, rgba(8,36,48,.96), rgba(6,27,38,.96))",
            boxShadow: "0 18px 45px rgba(0,0,0,.20)",
          }}
        >
          <div style={{ fontSize: "34px", marginBottom: "12px" }}>📘</div>
          <h2
            style={{
              margin: "0 0 8px",
              color: "#f4ffff",
              fontSize: "20px",
            }}
          >
            Passbook Format Not Configured
          </h2>
          <p
            style={{
              margin: 0,
              color: "#a9c9ce",
              fontSize: "13px",
              lineHeight: 1.7,
            }}
          >
            {selectedPassbookBank
              ? `Passbook template for ${selectedPassbookBank} has not been added yet.`
              : "Please select a bank from Dashboard → Bank Information first."}
          </p>
        </div>
      </div>
    );
  }

  /* =======================================================



     RENDER



  \======================================================= */







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







        .passbook-heading {



          text-align: center;



          margin-bottom: 22px;



        }







        .passbook-heading h1 {



          margin: 0;



          font-size: 30px;



          font-weight: 800;



          color: #f4ffff;



          text-shadow: 0 1px 10px rgba(71, 255, 229, 0.12);



        }







        .passbook-heading p {



          margin: 7px 0 0;



          opacity: 1;



          color: #9bdad2;



          font-size: 13px;



          font-weight: 600;



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



        \=============================================== */







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
        font-variant: normal;



          letter-spacing: -1.05px;



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



        \=============================================== */







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



        \=============================================== */







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



        \=============================================== */







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



        <h1>Passbook Print</h1>



        <p>



          Search customer • Preview • Temporary Edit • Print
          {" • "}
          {selectedPassbookBank}



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







            <button



              type="button"



              className="passbook-button direct-print-button"



              onClick={directPrinterSend}



              disabled={directPrinting || printing}



              title="Send RAW passbook job through local Olivetti PR2 bridge"



            >



              {directPrinting



                ? "Sending to PR2..."



                : "Direct Printer Send"}



            </button>







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



\========================================================= */







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
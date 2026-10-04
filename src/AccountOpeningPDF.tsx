import { useCallback, useState, type FormEvent } from "react";

import { getAuth } from "firebase/auth";
import { getTenantApiUrl } from "./tenantApi";
import BankFormatPrint from "./BankFormatPrint";



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


const EMPTY: Customer = {

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



const safe = (value?: string | null) => String(value ?? "").trim();



function makeAddress(c: Customer) {

  if (safe(c.fullAddress)) return safe(c.fullAddress);

  return [safe(c.address), safe(c.postOffice), safe(c.pinCode)]

    .filter(Boolean)

    .join(", ");

}



function maskAadhaar(value: string) {

  const digits = value.replace(/\D/g, "");

  if (!digits) return "";

  if (digits.length <= 4) return digits;

  return `${"X".repeat(Math.max(8, digits.length - 4))}${digits.slice(-4)}`;

}



type EditableFieldProps = {

  value: string;

  onChange: (value: string) => void;

  placeholder?: string;

  selectOptions?: string[];

};



function EditableField({

  value,

  onChange,

  placeholder = "Click Edit",

  selectOptions,

}: EditableFieldProps) {

  const [editing, setEditing] = useState(false);

  const [draft, setDraft] = useState(value);



  const startEdit = () => {

    setDraft(value);

    setEditing(true);

  };



  const saveEdit = () => {

    onChange(draft.trim());

    setEditing(false);

  };



  return (

    <span className="editable-field">

      {editing ? (

        <span className="edit-box">

          {selectOptions ? (

            <select

              autoFocus

              value={draft}

              onChange={(e) => setDraft(e.target.value)}

              onBlur={saveEdit}

            >

              {selectOptions.map((item) => (

                <option key={item} value={item}>

                  {item}

                </option>

              ))}

            </select>

          ) : (

            <input

              autoFocus

              value={draft}

              placeholder={placeholder}

              onChange={(e) => setDraft(e.target.value)}

              onBlur={saveEdit}

              onKeyDown={(e) => {

                if (e.key === "Enter") e.currentTarget.blur();

                if (e.key === "Escape") setEditing(false);

              }}

            />

          )}

        </span>

      ) : (

        <>

          <span className={value ? "editable-value" : "editable-value empty"}>

            {value || placeholder}

          </span>

          <button

            type="button"

            className="edit-pencil"

            onClick={startEdit}

            aria-label="Edit field"

            title="Edit"

          >

            ✎ Edit

          </button>

        </>

      )}

    </span>

  );

}



export default function AccountOpeningPDF() {
  const [bankFormatActive, setBankFormatActive] = useState(false);
  const onBankFormatConfigured = useCallback((active: boolean) => setBankFormatActive(active), []);

  const [query, setQuery] = useState("");

  const [customer, setCustomer] = useState<Customer | null>(null);

  const [dob, setDob] = useState("");

  const [religion, setReligion] = useState("MINORITY COM - MUSLIMS");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  const [customerMatches, setCustomerMatches] = useState<CustomerMatch[]>([]);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedMatchLoading, setSelectedMatchLoading] = useState<number | null>(null);



  const apiRequest = async (body: Record<string, unknown>) => {

    const apiUrl = getTenantApiUrl();

    if (!apiUrl) throw new Error("Google Sheet API URL is not configured.");



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

      headers: { "Content-Type": "text/plain;charset=utf-8" },

      body: JSON.stringify({ ...body, idToken }),

    });



    const result = await response.json();



    if (!result?.success) {

      const apiMessage = result?.message || "Request could not be completed.";

      if (result?.code === "INVALID_ACTION") {

        throw new Error(

          `${apiMessage} Please deploy the latest Bank Setu Apps Script version.`

        );

      }

      throw new Error(apiMessage);

    }



    return result;

  };



  const searchCustomer = async (event?: FormEvent) => {
    event?.preventDefault();
    setBankFormatActive(false);
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
        ...EMPTY,
        ...(result.customer || {}),
      };

      setCustomer(loaded);
      setDob("");
      setReligion("MINORITY COM - MUSLIMS");
      setMessage("Account Opening Form generated successfully.");
    } catch (err) {
      setCustomer(null);
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
        includePhoto: true,
      });

      const loaded: Customer = {
        ...EMPTY,
        ...(result.customer || {}),
      };

      setCustomer(loaded);
      setDob("");
      setReligion("MINORITY COM - MUSLIMS");
      setCustomerMatches([]);
      setShowMatchModal(false);
      setMessage("Selected customer loaded successfully. Account Opening Form is ready.");
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


  const printForm = () => window.print();



  const c = customer || EMPTY;

  const photo = c.photoPreview || c.photoUrl || "";

  const address = makeAddress(c);

  const maskedAadhaar = maskAadhaar(c.uidaiNo);



  return (

    <div className={`aof-module${bankFormatActive ? " bank-format-active" : ""}`}>

      <style>{`

        * { box-sizing: border-box; }



        .aof-module {

          width: 100%;

          padding: 22px;

          color: #eaffff;

        }

        .aof-module.bank-format-active .print-area { display: none !important; }



        .module-head {

          max-width: 1100px;

          margin: 0 auto 18px;

          text-align: center;

        }



        .module-head h1 {

          margin: 0;

          font-size: clamp(24px, 4vw, 36px);

          color: #fff;

        }



        .module-head p {

          margin: 7px 0 0;

          color: #91aebd;

          font-size: 13px;

        }



        .search-panel {

          max-width: 1100px;

          margin: 0 auto 18px;

          padding: 16px;

          border: 1px solid rgba(91,224,205,.18);

          background: rgba(8,34,45,.72);

          border-radius: 16px;

        }



        .search-label {

          display: block;

          margin-bottom: 8px;

          color: #5ce3cc;

          font-size: 11px;

          font-weight: 800;

          letter-spacing: .7px;

        }



        .search-row {

          display: flex;

          gap: 10px;

        }



        .search-row input {

          flex: 1;

          min-width: 0;

          padding: 13px 14px;

          border-radius: 11px;

          border: 1px solid rgba(255,255,255,.13);

          outline: none;

          background: rgba(255,255,255,.055);

          color: #fff;

          font-size: 14px;

        }



        .search-row button,

        .action-button {

          border: 0;

          border-radius: 11px;

          padding: 12px 18px;

          cursor: pointer;

          font-weight: 800;

        }



        .search-row button {

          background: #62dddf;

          color: #07303a;

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

        .notice {

          max-width: 1100px;

          margin: 0 auto 14px;

          padding: 10px 13px;

          border-radius: 10px;

          font-size: 12px;

        }



        .notice.success {

          background: rgba(47,208,160,.09);

          color: #6ff0c9;

          border: 1px solid rgba(47,208,160,.15);

        }



        .notice.error {

          background: rgba(255,93,93,.09);

          color: #ffb4b4;

          border: 1px solid rgba(255,93,93,.16);

        }



        .preview-wrap {

          max-width: 1100px;

          margin: 0 auto;

          overflow-x: auto;

          padding-bottom: 8px;

        }



        .paper {

          width: 210mm;

          min-height: 297mm;

          margin: 0 auto 18px;

          padding: 8mm 8mm 9mm;

          background: #fff;

          color: #111;

          font-family: "Times New Roman", Times, serif;

          font-size: 10.5pt;

          line-height: 1.12;

          box-shadow: 0 12px 40px rgba(0,0,0,.32);

        }



        .bank-logo {

          display: block;

          width: 102mm;

          max-height: 23mm;

          object-fit: contain;

          margin: 0 auto 1mm;

        }



        .form-title {

          text-align: center;

          font-size: 19pt;

          margin: 0 0 3mm;

          font-weight: 400;

        }



        .section-line {

          margin: 1.7mm 0;

          font-weight: 700;

        }



        .top-profile {

          display: grid;

          grid-template-columns: minmax(0,1fr) 37mm;

          gap: 6mm;

          align-items: start;

        }



        .photo-block {

          text-align: center;

          font-weight: 700;

        }



        .photo-box {

          width: 35mm;

          height: 43mm;

          border: 1px solid #777;

          margin: 1.5mm auto 0;

          display: flex;

          align-items: center;

          justify-content: center;

          overflow: hidden;

          background: #fff;

        }



        .photo-box img {

          width: 100%;

          height: 100%;

          object-fit: cover;

        }



        .info-grid {

          display: grid;

          grid-template-columns: 42mm minmax(0,1fr);

          gap: 1.1mm 2mm;

          align-items: start;

        }



        .info-grid .label {

          white-space: nowrap;

        }



        .address-grid {

          display: grid;

          grid-template-columns: 50mm minmax(0,1fr);

          gap: 1.1mm 3mm;

          align-items: start;

        }



        .profile-grid {

          display: grid;

          grid-template-columns: 53mm minmax(0,1fr);

          gap: 1.2mm 3mm;

          align-items: start;

        }



        .kyc-grid {

          display: grid;

          grid-template-columns: 1.2fr .9fr .9fr;

          gap: 1mm 3mm;

          margin-top: 2mm;

        }



        .kyc-grid > div {

          min-height: 4mm;

        }



        .bold { font-weight: 700; }

        .caps { text-transform: uppercase; }



        .editable-field {

          position: relative;

          display: inline-flex;

          align-items: center;

          min-height: 18px;

          max-width: 100%;

        }



        .editable-value.empty {

          color: #777;

          font-style: italic;

        }



        .edit-pencil {

          position: absolute;

          left: calc(100% + 7px);

          top: 50%;

          transform: translateY(-50%);

          border: 1px solid #7b61ff;

          background: #fff;

          color: #5b3fe5;

          border-radius: 5px;

          padding: 2px 5px;

          font: 700 9px Arial, sans-serif;

          white-space: nowrap;

          opacity: 0;

          pointer-events: none;

          transition: opacity .15s ease;

          z-index: 4;

        }



        .editable-field:hover .edit-pencil,

        .editable-field:focus-within .edit-pencil {

          opacity: 1;

          pointer-events: auto;

        }



        .edit-box input,

        .edit-box select {

          min-width: 48mm;

          max-width: 75mm;

          padding: 3px 5px;

          border: 1px solid #6b55e7;

          border-radius: 4px;

          background: #fffbea;

          color: #111;

          font: 10pt Arial, sans-serif;

          outline: none;

        }



        .nomination-table {

          width: 100%;

          border-collapse: collapse;

          margin-top: 2mm;

        }



        .nomination-table th,

        .nomination-table td {

          text-align: left;

          vertical-align: top;

          padding: 1.2mm 1mm;

        }



        .two-col {

          display: grid;

          grid-template-columns: 1fr 1fr;

          gap: 9mm;

        }



        .declaration-box {

          border: 1px solid #222;

          min-height: 29mm;

          margin-top: 3mm;

          padding: 2mm;

        }



        .official-grid {

          display: grid;

          grid-template-columns: 1fr 1fr;

          gap: 10mm;

          min-height: 34mm;

        }



        .sign-row {

          display: grid;

          grid-template-columns: 1.2fr 1fr 1fr .8fr;

          gap: 4mm;

          margin-top: 5mm;

          text-align: center;

          font-weight: 700;

        }



        .actions {

          max-width: 1100px;

          margin: 0 auto;

          display: flex;

          justify-content: center;

          gap: 10px;

          flex-wrap: wrap;

        }



        .print-button {

          background: linear-gradient(135deg,#4fd9d5,#55bde5);

          color: #062f39;

        }



        .search-again {

          background: #123f53;

          color: #fff;

          border: 1px solid rgba(96,217,220,.25);

        }



        @media (max-width: 760px) {

          .aof-module { padding: 12px; }

          .search-row { flex-direction: column; }

          .search-row input {
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

          .search-row button {
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

          .preview-wrap {

            width: calc(100vw - 24px);

            -webkit-overflow-scrolling: touch;

          }

          .paper {

            transform-origin: top left;

          }

          .edit-pencil {

            opacity: 1;

            pointer-events: auto;

          }

        }



        @media print {

          @page { size: A4; margin: 0; }



          body * { visibility: hidden !important; }



          .print-area,

          .print-area * {

            visibility: visible !important;

          }



          .print-area {

            position: absolute;

            left: 0;

            top: 0;

            width: 210mm;

          }



          .paper {

            width: 210mm;

            height: 297mm;

            min-height: 297mm;

            margin: 0;

            padding: 8mm 8mm 9mm;

            box-shadow: none;

            page-break-after: always;

            overflow: hidden;

            print-color-adjust: exact;

            -webkit-print-color-adjust: exact;

          }



          .paper:last-child { page-break-after: auto; }



          .edit-pencil { display: none !important; }



          .editable-value.empty {

            color: transparent !important;

          }

        }


        /* ===== ORIGINAL PDF ALIGNMENT - FINAL SAFE OVERRIDE ===== */
        .paper {
          width: 210mm !important;
          min-height: 297mm !important;
          margin: 0 auto 18px !important;
          padding: 14mm 12mm 10mm !important;
          background: #fff !important;
          color: #111 !important;
          font-family: "Times New Roman", Times, serif !important;
          font-size: 10.5pt !important;
          line-height: 1.12 !important;
          text-align: left !important;
          overflow: hidden !important;
        }

        .paper .form-title {
          text-align: center !important;
          font-size: 19pt !important;
          margin: 0 0 3mm !important;
          font-weight: 400 !important;
        }

        .paper .bank-logo {
          display: block !important;
          width: 100mm !important;
          max-height: 22mm !important;
          object-fit: contain !important;
          margin: -1mm auto 1mm !important;
        }

        .paper .section-line {
          text-align: left !important;
          margin: 2.1mm 0 !important;
          font-weight: 700 !important;
        }

        .paper .top-profile {
          display: grid !important;
          grid-template-columns: minmax(0,1fr) 39mm !important;
          column-gap: 8mm !important;
          align-items: start !important;
          margin: 5mm 0 5mm 1mm !important;
          text-align: left !important;
        }

        .paper .info-grid {
          display: grid !important;
          grid-template-columns: 58mm minmax(0,1fr) !important;
          column-gap: 4mm !important;
          row-gap: 1.15mm !important;
          align-items: baseline !important;
          justify-items: start !important;
          text-align: left !important;
        }

        .paper .info-grid > span,
        .paper .address-grid > span,
        .paper .profile-grid > span,
        .paper .kyc-grid > div {
          text-align: left !important;
          justify-self: start !important;
        }

        .paper .photo-block {
          text-align: center !important;
          font-weight: 700 !important;
          margin-top: -4mm !important;
        }

        .paper .photo-box {
          width: 35mm !important;
          height: 43mm !important;
          margin: 1.5mm auto 0 !important;
        }

        .paper .address-grid {
          display: grid !important;
          grid-template-columns: 91mm minmax(0,1fr) !important;
          column-gap: 4mm !important;
          row-gap: 1.15mm !important;
          align-items: start !important;
          justify-items: start !important;
          margin: 3mm 0 3.5mm 1mm !important;
          text-align: left !important;
        }

        .paper .address-value {
          width: 82mm !important;
          max-width: 82mm !important;
          white-space: normal !important;
          overflow-wrap: break-word !important;
          word-break: normal !important;
          line-height: 1.16 !important;
          text-align: left !important;
        }

        .paper .profile-grid {
          display: grid !important;
          grid-template-columns: 91mm minmax(0,1fr) !important;
          column-gap: 4mm !important;
          row-gap: 1.05mm !important;
          align-items: start !important;
          justify-items: start !important;
          margin: 2.5mm 0 3mm 1mm !important;
          text-align: left !important;
        }

        .paper .profile-grid > span:nth-child(odd) {
          width: 91mm !important;
          text-align: left !important;
        }

        .paper .kyc-grid {
          display: grid !important;
          grid-template-columns: 75mm 52mm minmax(0,1fr) !important;
          column-gap: 4mm !important;
          row-gap: .9mm !important;
          margin: 2.5mm 0 0 1mm !important;
          align-items: start !important;
          justify-items: start !important;
          text-align: left !important;
        }

        .paper .editable-field {
          position: relative !important;
          display: inline-block !important;
          min-width: 34mm !important;
          min-height: 4.5mm !important;
          max-width: 100% !important;
          text-align: left !important;
          vertical-align: baseline !important;
        }

        .paper .editable-value {
          display: inline-block !important;
          min-width: 34mm !important;
          line-height: 1.12 !important;
          text-align: left !important;
        }

        /* Hover bridge: button touches the field, so pointer does not fall into a gap. */
        .paper .edit-pencil {
          position: absolute !important;
          left: 0 !important;
          bottom: calc(100% - 1px) !important;
          transform: none !important;
          margin: 0 !important;
          border: 1px solid #6b55e7 !important;
          background: #fff !important;
          color: #5b3fe5 !important;
          border-radius: 4px !important;
          padding: 2px 6px !important;
          font: 700 9px Arial, sans-serif !important;
          line-height: 14px !important;
          white-space: nowrap !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          z-index: 999 !important;
          box-shadow: 0 2px 6px rgba(0,0,0,.16) !important;
        }

        .paper .editable-field:hover .edit-pencil,
        .paper .editable-field:focus-within .edit-pencil,
        .paper .edit-pencil:hover {
          opacity: 1 !important;
          visibility: visible !important;
          pointer-events: auto !important;
        }

        .paper .edit-box {
          display: inline-block !important;
          max-width: 100% !important;
        }

        .paper .edit-box input,
        .paper .edit-box select {
          width: 58mm !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 2px 4px !important;
          text-align: left !important;
        }

        .paper .nomination-table {
          table-layout: fixed !important;
          width: 100% !important;
          border-collapse: collapse !important;
          text-align: left !important;
          margin: 0 !important;
        }

        /* PAGE 2 NOMINATION BLOCK - match original PDF column geometry */
        .paper .nomination-table col:nth-child(1) { width: 24mm; }
        .paper .nomination-table col:nth-child(2) { width: 25mm; }
        .paper .nomination-table col:nth-child(3) { width: 11mm; }
        .paper .nomination-table col:nth-child(4) { width: 30mm; }
        .paper .nomination-table col:nth-child(5) { width: auto; }

        .paper .nomination-table thead th {
          font-weight: 700 !important;
          line-height: 1.02 !important;
          padding: 0 1.2mm 0 0 !important;
          vertical-align: top !important;
        }

        .paper .nomination-table tbody td {
          font-weight: 700 !important;
          line-height: 1.02 !important;
          padding: 1.6mm 1.2mm 0 0 !important;
          vertical-align: top !important;
          white-space: normal !important;
          overflow-wrap: normal !important;
          word-break: normal !important;
        }

        .paper .nomination-table tbody td:first-child {
          width: 24mm !important;
          max-width: 24mm !important;
        }

        .paper .nominee-name-cell {
          white-space: normal !important;
          overflow-wrap: normal !important;
          word-break: normal !important;
        }

        .paper .nomination-table tbody tr {
          height: auto !important;
        }

        .paper:nth-of-type(2) {
          padding-top: 9mm !important;
        }

        .paper .nomination-table th,
        .paper .nomination-table td {
          text-align: left !important;
          vertical-align: top !important;
        }

        @media (max-width: 760px) {
          .paper .edit-pencil {
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: auto !important;
          }
        }

        @media print {
          .paper { text-align: left !important; }
          .paper .edit-pencil { display: none !important; }
        }

      `}</style>



      <div className="module-head">

        <h1>Account Opening PDF Sample</h1>

        <p>

          Search customer → preview original AOF format → temporary edit → print / save PDF

        </p>

      </div>



      <form className="search-panel" onSubmit={searchCustomer}>

        <label className="search-label">UNIVERSAL CUSTOMER SEARCH</label>

        <div className="search-row">

          <input

            value={query}

            onChange={(e) => setQuery(e.target.value)}

            placeholder="Account No / Aadhaar / CIF / Mobile / AOF No / Name"

          />

          <button type="submit" disabled={loading}>

            {loading ? "Searching..." : "Search"}

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


      {error ? <div className="notice error">{error}</div> : null}

      {message ? <div className="notice success">{message}</div> : null}



      {customer ? (

        <>

          <BankFormatPrint
            formatType="accountOpening"
            customer={{ ...c, fullAddress: address, uidaiNo: maskedAadhaar }}
            onConfigured={onBankFormatConfigured}
            onPrint={printForm}
          />

          <div className="preview-wrap">

            <div className="print-area">

              <section className="paper">

                <img

                  className="bank-logo"

                  src="/assam-gramin-bank-logo.jpg"

                  alt="Assam Gramin Bank"

                />



                <h2 className="form-title">Account Opening Form</h2>



                <div className="section-line">

                  1. TYPE OF ACCOUNT : I wish to open the following type of account SB Basic savings Bank deposit Account

                </div>



                <div className="section-line">

                  2. NATURE OF ACCOUNT : OTHER INDIVIDUAL

                </div>



                <div className="section-line">

                  3. FULL NAME, in CAPITAL Letters(leaving a space between first, middle &amp; last name)

                </div>



                <div className="top-profile">

                  <div className="info-grid">

                    <span className="label">Reference No</span>

                    <span>{c.aofNo || "—"}</span>



                    <span className="label">Customer Name</span>

                    <span>{c.name || "—"}</span>



                    <span className="label">Sex</span>

                    <span>{c.gender || "—"}</span>



                    <span className="label">Account No</span>

                    <span>{c.accountNo || "—"}</span>



                    <span className="label">Customer ID</span>

                    <span>{c.enrolId || "—"}</span>



                    <span className="label">Aadhaar No</span>

                    <span>{maskedAadhaar || "—"}</span>



                    <span className="label">Mobile No</span>

                    <span>{c.contact || "—"}</span>

                  </div>



                  <div className="photo-block">

                    Customer Photo :

                    <div className="photo-box">

                      {photo ? <img src={photo} alt="Customer" /> : null}

                    </div>

                  </div>

                </div>



                <div className="section-line">4. Mode of Operation : SELF</div>



                <div className="section-line">5. ADDRESS :</div>



                <div className="address-grid">

                  <span>Flat No./Bldg. Name</span>

                  <span className="address-value">{address || "—"}</span>



                  <span>Street / Road / Locality</span>

                  <span></span>



                  <span>City / District / State with pincode</span>

                  <span></span>



                  <span>Tel.No / Fax No.(with STD code)</span>

                  <span>{c.contact || "—"}</span>



                  <span>Email</span>

                  <span></span>

                </div>



                <div className="section-line">6. CUSTOMER PROFILE :</div>



                <div className="profile-grid">

                  <span>Date of Birth</span>

                  <EditableField

                    value={dob}

                    onChange={setDob}

                    placeholder="DD-MM-YYYY"

                  />



                  <span>Educational Qualification</span>

                  <span>--- SELECT ---</span>



                  <span>Nationality</span>

                  <span>INDIAN</span>



                  <span>Category</span>

                  <span>OTHERS</span>



                  <span>Religion</span>

                  <EditableField

                    value={religion}

                    onChange={setReligion}

                    selectOptions={[

                      "MINORITY COM - MUSLIMS",

                      "MINORITY COM - CHRISTIANS",

                      "MINORITY COM - SIKHS",

                      "MINORITY COM - BUDDHISTS",

                      "MINORITY COM - JAINS",

                      "MINORITY COM - PARSIS",

                      "HINDU",

                      "OTHER",

                    ]}

                  />



                  <span>PAN / GIR no(if not available, please fill form 60 / 61 at 12)</span>

                  <span>{c.pan || ""}</span>



                  <span>Occupation Type</span>

                  <span>OTHER NOT WORKING</span>



                  <span>Designation / Profession</span>

                  <span>

                    INDIVIDUALS AND ENTITIES SPECIFICALLY IDENTIFIED BY REGULATORS,

                    FIU AND OTHER COMPETENT AUTHORITIES AS HIGH-RISK

                  </span>



                  <span>Annual Income</span>

                  <span>&lt; 60000</span>



                  <span>Annual turnover / Receipt from business(Rs. Lakh)</span>

                  <span></span>



                  <span>Classification *</span>

                  <span></span>



                  <span>Name of Father / Guardian</span>

                  <span>{c.coName || "—"}</span>



                  <span>Marital Status</span>

                  <span>UNMARRIED</span>



                  <span>Name of Spouse (if married)</span>

                  <span></span>

                </div>



                <div className="section-line">

                  7. KNOW YOUR CUSTOMER (KYC) DOCUMENTS :

                </div>



                <div className="kyc-grid">

                  <div></div>

                  <div className="bold">ID Proof</div>

                  <div className="bold">Address Proof</div>



                  <div className="bold">Type of document</div>

                  <div>UIDAI</div>

                  <div>UIDAI</div>



                  <div className="bold">Document ID No.</div>

                  <div>{maskedAadhaar || "—"}</div>

                  <div>{maskedAadhaar || "—"}</div>



                  <div className="bold">Issuing Authority</div>

                  <div>UIDAI</div>

                  <div>UIDAI</div>



                  <div className="bold">Place of Issue</div>

                  <div></div>

                  <div></div>



                  <div className="bold">Date of Issue</div>

                  <div></div>

                  <div></div>



                  <div className="bold">Valid up to</div>

                  <div></div>

                  <div></div>

                </div>



                <p style={{ margin: "2mm 0 0" }}>

                  I attach the copies of documents opted for and produce the original copies of these documents for verification.

                </p>



                <div className="section-line">8. Nomination :</div>

                <p style={{ margin: "1mm 0" }}>I want to nominate as under</p>

              </section>



              <section className="paper">

                <table className="nomination-table">
                  <colgroup>
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                  </colgroup>

                  <thead>

                    <tr>

                      <th>Name of the nominee</th>

                      <th>Relationship</th>

                      <th>Age</th>

                      <th>Date of Birth in case of minor</th>

                      <th>

                        Person authorised in case of minor to receive the amount of

                        deposit on behalf of the nominee in event of my / minor&apos;s

                        death during the minority of nominee.

                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    <tr>

                      <td className="bold caps nominee-name-cell">{c.nominee || "—"}</td>

                      <td className="bold">MOTHER</td>

                      <td></td>

                      <td></td>

                      <td></td>

                    </tr>

                  </tbody>

                </table>



                <div style={{ marginTop: "2mm" }}>Date:</div>

                <div>Place: <span style={{ float: "right", marginRight: "25mm" }}>Signature of declarant</span></div>



                <div className="section-line">

                  WITNESS IN CASE OF NOMINATION (FOR THUMB IMPRESSION ONLY)

                </div>



                <div className="two-col">

                  <div>

                    <div className="bold">Name &amp; Signature of the first witnesses</div>

                    <div>Name:-</div>

                    <div>Signature:-</div>

                    <div>Address:-</div>

                  </div>

                  <div>

                    <div className="bold">Name &amp; Signature of the second witnesses</div>

                    <div>Name:-</div>

                    <div>Signature:-</div>

                    <div>Address:-</div>

                  </div>

                </div>



                <div className="section-line">

                  To be filled by those who do not have either PAN/GIR: (Select appropriate form)

                </div>



                <div className="two-col">

                  <div>

                    <div className="bold">Form No. 60</div>

                    <p>To be filled by person without PAN</p>

                    <p>1. Are you assessed to tax? Yes No</p>

                    <p>

                      2. If yes (i) Details of ward/Circle/Range where the last return

                      of income was filed_________

                    </p>

                  </div>



                  <div>

                    <div className="bold">Form No. 61</div>

                    <p>

                      To be filled by a person who has agricultural income and is not

                      in receipt of any other income chargeable to income tax

                    </p>

                    <p>

                      I hereby declare that my source of income is from agriculture

                      and i am not required to pay income-tax on any other income, if any.

                    </p>

                  </div>

                </div>



                <div className="declaration-box">

                  <div className="bold">Declaration</div>

                  <p>

                    I {c.name || "________________"} do hereby declare that what is stated

                    is true to the best of my knowledge and belief.

                  </p>

                  <div>Date:</div>

                  <div>

                    Place:

                    <span style={{ float: "right", marginRight: "25mm" }}>

                      Signature of declarant

                    </span>

                  </div>

                </div>



                <div className="section-line">Declaration/Undertaking</div>

                <div className="bold">

                  a) Please seed my Aadhaar / UID Number issued by UIDAI. I hereby give

                  my consent to the Bank to use my Aadhaar details to authenticate me

                  from UIDAI by using my biometrics for the purpose of Bank account.

                </div>

                <div className="bold">

                  b) I declare that I am desirous of receiving entitled benefits or

                  subsidies of welfare schemes funded from the Consolidated Fund of

                  India in my account directly.

                </div>



                <div style={{ marginTop: "2mm" }}>Date:</div>

                <div>

                  Place:

                  <span style={{ float: "right", marginRight: "25mm" }}>

                    Signature of declarant

                  </span>

                </div>



                <div className="section-line">For Official Use:</div>



                <div className="official-grid">

                  <div>

                    Specimen<br />

                    Signature /<br />

                    Thumb<br />

                    impression of<br />

                    the customer

                  </div>

                  <div style={{ textAlign: "center" }}>Photograph</div>

                </div>



                <div className="sign-row">

                  <span>Name</span>

                  <span>Signature</span>

                  <span>GBPA / PF No</span>

                  <span>Date</span>

                </div>



                <div style={{ marginTop: "3mm" }}>

                  <div>Rupay Debit Card issued</div>

                  <div>Signature Verified</div>

                  <div>Account Verified</div>

                  <div>Registration of Nomination</div>

                </div>



                <div className="bold" style={{ marginTop: "2mm" }}>

                  Assam Gramin Vikas Bank

                </div>

                <div style={{ marginTop: "2mm" }}>

                  (Authorized Official)

                  <span style={{ float: "right" }}>

                    Name_______________GBPA No____________

                  </span>

                </div>

              </section>

            </div>

          </div>



          <div className="actions">

            <button

              type="button"

              className="action-button print-button"

              onClick={printForm}

            >

              🖨 Print / Save PDF

            </button>



            <button

              type="button"

              className="action-button search-again"

              onClick={() => {

                setCustomer(null);

                setQuery("");

                setDob("");

                setReligion("MINORITY COM - MUSLIMS");

                setMessage("");

                setError("");

              }}

            >

              🔎 Search Again

            </button>

          </div>

        </>

      ) : null}

    </div>

  );

}

import type { CSSProperties } from "react";
import monoFontUrl from "./assets/DejaVuSansMono.ttf?url";

export type PassbookBankInfo = {
  bankName?: string; passbookBank?: string; branchName?: string; address?: string;
  ifsc?: string; micr?: string; branchCode?: string; branchEmail?: string; branchPhone?: string;
};

export function isAssamBank(value: string = "") {
  return /^(assam gramin(?: vikas)? bank|agvb|agb)$/.test(value.trim().toLowerCase().replace(/\s+/g, " "));
}

export function isUnionBank(value: string = "") {
  return /union bank(?: of india)?/.test(value.trim().toLowerCase().replace(/\s+/g, " "));
}

type RecordData = {
  enrolId: string; accountNo: string; name: string; contact: string;
  accountOpeningDate: string; fullAddress: string; address: string;
  postOffice: string; pinCode: string; pan: string; uidaiNo?: string; aadhaar?: string; aadhaarNo?: string; aadharNo?: string;
  photoPreview?: string; photoUrl?: string; jointHolder?: string; issueDate?: string;
};

const hints = [
  "Customers are requested to paste their recent passport-size photograph in the space provided below and get it attested by an official of the bank.",
  "Customers are advised to avail/update the nomination facility (up to four persons) in all their deposit accounts.",
  "Do not write or put your signature anywhere in this passbook.",
  "Please update your passbook regularly and this passbook is Non-transferable.",
  "In case of any change in your contact details such as address, phone number, or e-mail ID, kindly update the same at your home branch immediately.",
  "Never share your ATM card details, CVV, PIN, Mobile Banking login ID, password, OTP, or any confidential banking information with anyone.",
  "For withdrawal of cash through withdrawal slips, production of the passbook is mandatory.",
];
const upper = (value?: string) => String(value ?? "").trim().toUpperCase();
function date(value?: string) {
  if (!value) return "";
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[3] + "-" + iso[2] + "-" + iso[1] : value;
}
const at = (left: number, top: number, width: number): CSSProperties => ({
  position: "absolute", left: left + "mm", top: top + "mm", width: width + "mm",
});

export default function AssamQuickPassbook({ customer: c, bankInfo = {}, onEdit }: {
  customer: RecordData; bankInfo?: PassbookBankInfo; onEdit: () => void;
}) {
  const branch = upper(bankInfo.branchName);
  const referenceBranch = branch === "BADARPUR";
  const branchAddress = bankInfo.address || (referenceBranch ? "PO:-BADARPUR\nDIST:-KARIMGANJ\n788806" : "");
  const address = upper(c.fullAddress || [c.address, c.postOffice, c.pinCode].filter(Boolean).join("\n"));
  const photo = c.photoPreview || (/^(data:image\/|https:\/\/)/i.test(c.photoUrl || "") &&
    !/drive\.google\.com/i.test(c.photoUrl || "") ? c.photoUrl : "");
  return <div className="assam-quick-preview">
    <style>{`
      @font-face { font-family:"Assam Passbook Mono"; src:url("${monoFontUrl}") format("truetype"); font-style:normal; font-weight:400; font-display:block; }
      .assam-quick-preview { overflow-x:auto; padding:16px 0; }
      .assam-quick-document { position:relative; width:210mm; height:170mm; background:white;
        color:#242424; margin:0 auto; box-sizing:border-box; box-shadow:0 4px 24px #0002;
        font-family:"Assam Passbook Mono",monospace; font-size:2.5mm; line-height:2.4mm;
        text-align:left!important; letter-spacing:0; }
      .passbook-page .assam-quick-document * { box-sizing:border-box; text-align:left!important; }
      .passbook-page .assam-quick-document .assam-quick-hints h2,
      .passbook-page .assam-quick-document .assam-quick-title,
      .passbook-page .assam-quick-document .assam-quick-title *,
      .passbook-page .assam-quick-document .assam-quick-manager { text-align:center!important; }
      .passbook-page .assam-quick-document .assam-quick-title strong { color:#0782b2!important; }
      .assam-quick-version { margin:0 0 10px; color:#545467; font:12px Arial,sans-serif; text-align:left; }
      @media print { .assam-quick-version { display:none!important; } }
      .assam-quick-hints { text-align:left; font:3.25mm/3.8mm "Times New Roman",serif; }
      .assam-quick-hints h2 { margin:0 0 13mm; text-align:center; text-decoration:underline;
        font:bold 4mm "Times New Roman",serif; color:#242424; }
      .assam-quick-hints ol { margin:0; padding-left:6mm; list-style:decimal-leading-zero; }
      .assam-quick-hints li { padding-left:1mm; }
      .assam-quick-fold { position:absolute; top:85mm; width:100%; border-top:1px solid #ddd; }
      .assam-quick-title { color:#0782b2; text-align:center; font-family:Arial,sans-serif; }
      .assam-quick-title strong { font-size:5.3mm; line-height:7mm; }
      .assam-quick-title div { font-size:3.8mm; line-height:6mm; }
      .assam-quick-photo { border:0.4mm solid #333; padding:0.5mm; height:55mm; }
      .assam-quick-photo img { width:100%; height:100%; object-fit:cover; display:block; }
      .assam-quick-lines { text-align:left; }
      .assam-quick-field { display:grid; grid-template-columns:18mm 2mm minmax(0,1fr); align-items:start; min-height:2.4mm; }
      .assam-quick-text { display:block; width:142.857143%; transform:scaleX(0.7); transform-origin:left top;
        white-space:pre-wrap; overflow-wrap:anywhere; }
      .assam-quick-label { white-space:nowrap; }
      .assam-quick-manager { border-top:0.3mm solid #0782b2; color:#0782b2;
        text-align:center; font:bold 4.5mm/7mm Arial,sans-serif; }
      .assam-quick-edit { display:block; margin:12px auto 0; }
      @media print {
        @page { size:210mm 297mm; margin:0; }
        .assam-quick-document,.assam-quick-document * { visibility:visible!important; }
        .assam-quick-document { position:fixed!important; left:0!important; top:0!important;
          margin:0!important; box-shadow:none!important; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
        .assam-quick-edit { display:none!important; }
      }
    `}</style>
    <p className="assam-quick-version">Assam Quick Passbook · Aadhaar header · Layout v4</p>
    <article className="assam-quick-document" aria-label="Assam Gramin Bank quick passbook">
      <div className="assam-quick-hints" style={at(38, 7, 146)}>
        <h2>USEFUL HINTS</h2>
        <ol>{hints.map(hint => <li key={hint}>{hint}</li>)}</ol>
      </div>
      <div className="assam-quick-aadhaar" style={{...at(130, 5, 60), fontSize:"4mm"}}>{upper(c.uidaiNo || c.aadhaar || c.aadhaarNo || c.aadharNo)}</div>
      <div style={{...at(126, 13, 30), fontSize:"2.6mm"}}>Page 1.0</div>
      <div className="assam-quick-fold" />
      <svg className="assam-quick-emblem" style={{...at(54,92,12), height:"15mm"}} viewBox="0 0 64 88" role="img" aria-label="Assam Gramin Bank emblem">
        <g fill="#0782b2">
          <path d="M32 0C15 15 15 26 32 36C49 26 49 15 32 0Z"/>
          <path d="M10 24C-5 43 5 59 29 69V46C22 41 15 34 10 24Z"/>
          <path d="M54 24C69 43 59 59 35 69V46C42 41 49 34 54 24Z"/>
          <path d="M4 51C0 74 12 86 29 88V73C17 68 9 60 4 51Z"/>
          <path d="M60 51C64 74 52 86 35 88V73C47 68 55 60 60 51Z"/>
        </g>
      </svg>
      <div className="assam-quick-title" style={at(72,94,66)}>
        <strong>ASSAM GRAMIN BANK</strong><div>HEAD OFFICE : GUWAHATI</div>
      </div>
      <div className="assam-quick-photo" style={at(146,94,30)}>
        {photo && <img src={photo} alt="Customer photograph" />}
      </div>
      <div className="assam-quick-lines assam-quick-left" style={at(16,140,62)}>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">BRANCH NAME</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{branch}</span></div>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">BR. ADDRESS</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{upper(branchAddress)}</span></div>
      </div>
      <div className="assam-quick-lines assam-quick-right" style={at(81,140,51)}>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">IFSC CODE</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{upper(bankInfo.ifsc || (referenceBranch ? "PUNB0RRBAGB" : ""))}</span></div>
      </div>
      <div className="assam-quick-text" style={at(134,140,12)}>{bankInfo.branchCode || referenceBranch ? "(" + upper(bankInfo.branchCode || "7345") + ")" : ""}</div>
      <div className="assam-quick-lines assam-quick-right" style={at(81,147,60)}>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">MICR CODE</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{upper(bankInfo.micr || (referenceBranch ? "788116106" : ""))}</span></div>
      </div>
      <div className="assam-quick-lines assam-quick-left" style={at(16,151,64)}>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">BR. EMAIL</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{upper(bankInfo.branchEmail)}</span></div>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">CUSTOMER ID</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{upper(c.enrolId)}</span></div>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">ACCOUNT NO.</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{upper(c.accountNo)}</span></div>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">PAN NUMBER</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{upper(c.pan)}</span></div>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">MOBILE NO.</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{upper(c.contact)}</span></div>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">OPENED ON</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{date(c.accountOpeningDate)}</span></div>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">ISSUE DATE</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{date(c.issueDate)}</span></div>
      </div>
      <div className="assam-quick-lines assam-quick-right" style={at(81,151,60)}>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">ACC. HOLDER</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{upper(c.name)}</span></div>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">JOINT HOLDER</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{upper(c.jointHolder)}</span></div>
        <div className="assam-quick-field"><span className="assam-quick-text assam-quick-label">CUST ADD.</span><span className="assam-quick-text assam-quick-colon">:</span><span className="assam-quick-text">{address}</span></div>
      </div>
      <div className="assam-quick-manager" style={at(144,157,36)}>Branch Manager</div>
    </article>
    <button type="button" className="passbook-button assam-quick-edit" onClick={onEdit}>Temporary Edit</button>
  </div>;
}

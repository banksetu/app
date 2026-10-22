import {WordPassbookArtwork,wordPassbookValues} from './WordPassbookInfo';
import {passbookBranchForTenant} from './passbookInfoLayout';
import type { CSSProperties } from "react";

export type PassbookBankInfo = {
  bankName?: string; passbookBank?: string; branchName?: string; address?: string;
  ifsc?: string; micr?: string; branchCode?: string; branchEmail?: string; branchPhone?: string;
  branchAddress?: string; branchPostOffice?: string; branchDistrict?: string; branchPinCode?: string;
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
  photoPreview?: string; photoUrl?: string; jointHolder?: string; issueDate?: string; nominee?: string; coName?: string;
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
const at = (left: number, top: number, width: number): CSSProperties => ({
  position: "absolute", left: left + "mm", top: top + "mm", width: width + "mm",
});

export default function AssamQuickPassbook({ customer: c, bankInfo = {}, onEdit }: {
  customer: RecordData; bankInfo?: PassbookBankInfo; onEdit: () => void;
}) {
  const photo = c.photoPreview || (/^(data:image\/|https:\/\/)/i.test(c.photoUrl || "") &&
    !/drive\.google\.com/i.test(c.photoUrl || "") ? c.photoUrl : "");
  return <div className="assam-quick-preview">
    <style>{`
      .assam-quick-preview { overflow-x:auto; padding:16px 0; }
      .assam-quick-document { position:relative; width:205mm; height:175mm; background:white;
        color:#242424; margin:0 auto; box-sizing:border-box; box-shadow:0 4px 24px #0002;
        font-family:"Courier New",monospace; font-size:2.9mm; line-height:4.3mm;
        text-align:left!important; letter-spacing:normal; }
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
      .assam-quick-photo { border:0.4mm solid #333; padding:0.5mm; height:38mm; }
      .assam-quick-photo img { width:100%; height:100%; object-fit:cover; display:block; }
      .assam-quick-lines { text-align:left; white-space:pre-wrap; overflow-wrap:anywhere; }
      /* Printed fields only: compress labels, colons and values to 70% horizontally.
         Existing A4 page dimensions, row height and absolute field anchors are unchanged. */
      .assam-quick-field { display:grid; grid-template-columns:20mm minmax(0,1fr); column-gap:0; }
      .assam-quick-field > span:first-child { white-space:nowrap; }
      /* Slight ink-weight increase only; preserve font metrics and compression. */
      .assam-quick-field > span, .assam-quick-inline-field, .assam-quick-lines { -webkit-text-stroke:0.06mm currentColor; }
      .assam-quick-field > span,
      .assam-quick-inline-field {
        transform:scaleX(.70);
        transform-origin:left center;
        letter-spacing:normal;
      }
      .assam-quick-field > span:nth-child(2) { width:calc(100% / .70); }
      .assam-quick-address { grid-template-columns:17mm minmax(0,1fr); }
      .assam-quick-manager { border-top:0.3mm solid #0782b2; color:#0782b2;
        text-align:center; white-space:nowrap; font:bold 3.5mm/7mm Arial,sans-serif; }
      .assam-quick-edit { display:block; margin:12px auto 0; }
      @media print {
        @page { size:210mm 297mm; margin:0; }
        .assam-quick-document,.assam-quick-document * { visibility:visible!important; }
        .assam-quick-document { position:fixed!important; left:0!important; top:0!important;
          margin:0!important; box-shadow:none!important; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
        .assam-quick-edit { display:none!important; }
      }
    `}</style>
    <p className="assam-quick-version">Assam Quick Passbook · Aadhaar header · Layout v3</p>
    <article className="assam-quick-document" aria-label="Assam Gramin Bank quick passbook">
      <div className="assam-quick-hints" style={at(38, 7, 146)}>
        <h2>USEFUL HINTS</h2>
        <ol>{hints.map(hint => <li key={hint}>{hint}</li>)}</ol>
      </div>
      <div className="assam-quick-aadhaar" style={{...at(130, 5, 60), fontSize:"4mm"}}>{upper(c.uidaiNo || c.aadhaar || c.aadhaarNo || c.aadharNo)}</div>
      <div style={{...at(126, 13, 30), fontSize:"2.6mm"}}>Page 1.0</div>
      <div className="assam-quick-fold" />
      <svg style={{...at(54,92,12), height:"15mm"}} viewBox="0 0 64 88" role="img" aria-label="Assam Gramin Bank emblem">
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
      <div className="assam-quick-photo" style={at(146,98,30)}>
        {photo && <img src={photo} alt="Customer photograph" />}
      </div>
      <div className="assam-quick-data" style={{position:'absolute',left:0,top:'91mm'}}><WordPassbookArtwork quick values={wordPassbookValues(c,passbookBranchForTenant(bankInfo))}/></div>
      <div className="assam-quick-manager" style={at(144,157,36)}>Branch Manager</div>
    </article>
    <button type="button" className="passbook-button assam-quick-edit" onClick={onEdit}>Temporary Edit</button>
  </div>;
}

import type { CSSProperties } from "react";
import type { PassbookBankInfo } from "./AssamQuickPassbook";

export type PnbPassbookCustomer = {
  enrolId?: string; accountNo?: string; name?: string; coName?: string;
  accountOpeningDate?: string; fullAddress?: string; address?: string;
  postOffice?: string; pinCode?: string; uidaiNo?: string; issueDate?: string;
  photoPreview?: string; photoUrl?: string; photoDataUrl?: string;
  pnbBranchOffice?: string; pnbBranchPhone?: string; pnbMicr?: string; pnbIfsc?: string;
  pnbTollFree?: string; pnbTolledPhone?: string; pnbPrincipalOfficer?: string;
  pnbPrincipalPhone?: string; pnbPrincipalFax?: string; pnbModeOfOperation?: string;
  pnbNominationSerial?: string; pnbDistrict?: string; pnbState?: string;
  pnbCountry?: string; pnbIssueDate?: string; pnbDicgcAmount?: string;
};

const clean = (value?: string) => String(value ?? "").trim();
const upper = (value?: string) => clean(value).toUpperCase();
const date = (value?: string) => {
  const raw = clean(value);
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[3].padStart(2,"0")}-${iso[2].padStart(2,"0")}-${iso[1]}`;
  const normal = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return normal ? `${normal[1].padStart(2,"0")}-${normal[2].padStart(2,"0")}-${normal[3]}` : raw;
};
const at = (left:number, top:number, width:number):CSSProperties => ({position:"absolute",left:`${left}mm`,top:`${top}mm`,width:`${width}mm`});
const addressLines = (customer:PnbPassbookCustomer) => {
  const supplied=clean(customer.fullAddress).split(/\r?\n/).map(clean).filter(Boolean);
  if (supplied.length) return supplied.slice(0,3);
  return [customer.address,customer.postOffice].map(clean).filter(Boolean).slice(0,3);
};

const abbreviations = [
  [["Brought Forward","B/F"],["Carried Over","C/O"],["Cash","Cash"],["Cheque","Ch."],["Clearing","Clg."],["Commission","Com."],["Discount","Disc."],["Dividend Warrant","D/W"],["Draft","Dr."],["Electronic Clearing Services","ECS"],["Incidental Charges","I/C"]],
  [["Inter Sol","ISO"],["Internet","Intl."],["Inward Mail Transfer","IMT"],["Local Cheque/Demand Draft","L.D.D."],["National Electronic Fund Transfer","NEFT"],["Outstation Cheques / Bills","O.B.C."],["Outstation Cheques/Bills Purchased","DD"],["Real Time Gross Settlement","RTGS"],["Returning","Rtg."],["Transfer","Tr."]],
];

function PnbStationery({photo}:{photo:string}) {
  return <div className="pnb-stationery" aria-hidden="true">
    <div className="pnb-brand" style={at(20,9,66)}><b className="pnb-mark">प</b><div><strong>पंजाब नैशनल बैंक</strong><span>punjab national bank</span></div></div>
    <div className="pnb-aadhaar-side">अपने आधार नम्बर को अपने बैंक खाते से जोड़ें।<br/>अपने खाते की सुरक्षा हेतु मोबाइल नम्बर अपडेट रखें।</div>
    <div className="pnb-account-box" style={at(15,50,75)}><strong>खाता विवरण/ACCOUNT PARTICULARS</strong></div>
    <div className="pnb-aadhaar-copy" style={at(91,50,11)}>Link your Aadhaar Number with SB Account.<br/>Submit self certified copy of Aadhaar Card and Mobile Number.</div>
    <section className="pnb-abbreviations" style={at(110,7,96)}>
      <h2>पासबुक में प्रयुक्त शब्द-संक्षेप<br/><span>ABBREVIATIONS USED IN THE PASS BOOK</span></h2>
      <div className="pnb-abbreviation-columns">{abbreviations.map((column,index)=><div key={index}>{column.map(([term,code])=><div key={term}><span>{term}</span><b>{code}</b></div>)}</div>)}</div>
    </section>
    <section className="pnb-photo-row" style={at(110,82,97)}>
      {["Account Holder-1","Account Holder-2","Account Holder-3"].map((label,index)=><div key={label}><div className="pnb-photo-box">{index===0&&photo&&<img src={photo} alt=""/>}</div><span>नाम/Name____________</span><b>खाताधारक/{label}</b></div>)}
    </section>
    <section className="pnb-left-footer" style={at(15,157,77)}>
      <b>प्राधिकृत अधिकारी/प्रबंधक / Authorised Official/Manager</b>
      <p>कम्प्यूटर द्वारा सृजित विवरणियों पर किसी अधिकारी द्वारा अभिप्रमाणित करने / आरम्भाक्षर करने की आवश्यकता नहीं है। कृपया कम्प्यूटर द्वारा सृजित पासबुक / विवरणी पर हस्तलिखित प्रविष्टियां स्वीकार न करें।</p>
      <p>Computer generated entries shown in the statement of account do not require any authentication/initial from bank official. Please do not accept any manual entry in your computer generated Pass Book/Statement of account.</p>
    </section>
    <section className="pnb-right-footer" style={at(114,151,87)}>
      <p>बैंक ग्राहक के चेकों को खातों में उपलब्ध शेष राशि तक भुगतान करेगा।</p>
      <p>Bank shall only honour or pay the cheques of the customer against clear balance in the account.</p>
      <b>कृपया पास बुक न मोड़ें PLEASE DO NOT FOLD THE PASS BOOK</b>
      <span>Toll free 24 hours call centre 18001802222 / 18001032222</span>
    </section>
  </div>;
}

export default function PnbPassbook({customer:c,bankInfo:b={},formatType="passbook",onEdit}:{
  customer:PnbPassbookCustomer; bankInfo?:PassbookBankInfo; formatType?:"passbook"|"quickPassbook"; onEdit?:()=>void;
}) {
  const quick=formatType==="quickPassbook";
  const photo=clean(c.photoPreview)||clean(c.photoDataUrl)||clean(c.photoUrl);
  const branch=upper(c.pnbBranchOffice)||upper([b.branchName,b.branchDistrict,b.branchPinCode].map(clean).filter(Boolean).join(", "));
  const phone=clean(c.pnbBranchPhone)||clean(b.branchPhone);
  const micr=clean(c.pnbMicr)||clean(b.micr);
  const ifsc=clean(c.pnbIfsc)||clean(b.ifsc);
  const lines=addressLines(c);
  const district=upper(c.pnbDistrict);
  const state=upper(c.pnbState);
  const country=upper(c.pnbCountry);
  const pin=upper(c.pinCode);
  const dot=(field:string,text:string,left:number,top:number,width:number)=><span data-field={field} className="pnb-dot-line" style={at(left,top,width)}>{text}</span>;
  return <div className="pnb-preview">
    <style>{`
      .pnb-preview{overflow-x:auto;padding:16px 0;color:#222}.pnb-document{position:relative;width:213mm;height:190mm;margin:auto;background:#fff;overflow:hidden;box-shadow:0 4px 24px #0002;color:#171717}
      .pnb-document *{box-sizing:border-box}.pnb-document[data-mode="passbook"]{background:transparent}
      .pnb-dot-line{position:absolute;display:block;font:400 2.65mm/3.55mm "Courier New",monospace;color:#747474;white-space:pre;letter-spacing:.08mm;transform:scaleX(.72);transform-origin:left top;width:138.888%;z-index:3}
      .pnb-brand{display:flex;align-items:center;gap:3mm;font-family:Arial,sans-serif}.pnb-brand .pnb-mark{font:bold 16mm Arial,sans-serif;line-height:16mm}.pnb-brand div{display:flex;flex-direction:column}.pnb-brand strong{font-size:4.3mm}.pnb-brand span{font-size:4mm;font-weight:700}
      .pnb-account-box{height:102mm;border:.35mm solid #333}.pnb-account-box>strong{position:absolute;left:8mm;top:-2.8mm;background:white;padding:0 1mm;font:bold 3.5mm Arial,sans-serif;white-space:nowrap}
      .pnb-aadhaar-side{position:absolute;left:4mm;top:56mm;height:80mm;writing-mode:vertical-rl;transform:rotate(180deg);font:bold 2.5mm/3.4mm Arial,sans-serif;text-align:center}
      .pnb-aadhaar-copy{writing-mode:vertical-rl;transform:rotate(180deg);font:bold 2.25mm/3mm Arial,sans-serif;text-align:center}
      .pnb-abbreviations{font-family:Arial,sans-serif}.pnb-abbreviations h2{text-align:center;margin:0 0 5mm;font-size:3.1mm;line-height:3.8mm}.pnb-abbreviations h2 span{font-size:3mm}.pnb-abbreviation-columns{display:grid;grid-template-columns:1fr 1.1fr;gap:5mm;font-size:2.35mm;line-height:3.15mm}.pnb-abbreviation-columns>div>div{display:grid;grid-template-columns:1fr 10mm;gap:1mm}.pnb-abbreviation-columns b{font-weight:700}
      .pnb-photo-row{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;font:2.1mm/3mm Arial,sans-serif;text-align:center}.pnb-photo-row>div{min-width:0}.pnb-photo-box{width:28mm;height:38mm;border:.25mm solid #777;margin:0 auto 1mm;background:white}.pnb-photo-box img{width:100%;height:100%;object-fit:cover}.pnb-photo-row span,.pnb-photo-row b{display:block;white-space:nowrap}.pnb-photo-row b{font-size:2mm;margin-top:2mm}
      .pnb-left-footer{font-family:Arial,sans-serif}.pnb-left-footer>b{display:block;text-align:center;font-size:2.5mm}.pnb-left-footer p{margin:1.2mm 0;font-size:2.2mm;line-height:2.75mm}.pnb-right-footer{text-align:center;font-family:Arial,sans-serif}.pnb-right-footer p{margin:0 0 1mm;font-size:2mm;line-height:2.6mm}.pnb-right-footer b,.pnb-right-footer span{display:block;font-size:2mm;line-height:2.8mm}
      .pnb-edit{display:block;margin:12px auto 0}@media print{@page{size:213mm 190mm;margin:0}.pnb-preview{padding:0;overflow:visible}.pnb-document{margin:0;box-shadow:none;background:transparent;print-color-adjust:exact;-webkit-print-color-adjust:exact}.pnb-edit{display:none!important}}
      html.pr2-direct-preparing .pnb-stationery{display:none!important}
    `}</style>
    <article className="pnb-document" data-mode={formatType} aria-label={quick?"Punjab National Bank complete quick passbook":"Punjab National Bank dot matrix data only"}>
      {quick&&<PnbStationery photo={photo}/>} 
      <div className="pnb-dot-matrix" aria-label="Punjab National Bank dot matrix customer data">
        {dot("branchOffice",`BO: ${branch}`,17,30,86)}
        {dot("branchPhone",`Phone(${phone})`,17,34,86)}
        {dot("micr",`MICR Code: ${micr}`,17,60,70)}
        {dot("ifsc",`IFSC Code: ${ifsc}`,17,64,70)}
        {dot("bankContact",`*Contact: Tol Free-${clean(c.pnbTollFree)}, Tolled-${clean(c.pnbTolledPhone)}`,12,75,96)}
        {dot("principalOfficer",`*Principal Nodal Officer: ${clean(c.pnbPrincipalOfficer)} Ph-${clean(c.pnbPrincipalPhone)} Fax-${clean(c.pnbPrincipalFax)}`,12,79,96)}
        {dot("modeOfOperation",`Mode of Operation : ${upper(c.pnbModeOfOperation)}`,17,90,75)}
        {dot("customerNo",`Customer No. : ${upper(c.enrolId)}`,17,94,75)}
        {dot("aadhaar",`Aadhar No. : ${upper(c.uidaiNo)}`,17,98,75)}
        {dot("accountNo",`Account No. : ${upper(c.accountNo)}`,17,102,75)}
        {dot("customerName",upper(c.name),17,106,75)}
        {dot("openingDate",`Account Open Date : ${date(c.accountOpeningDate)}`,17,110,75)}
        {dot("guardian",`S/O: ${clean(c.coName)}`,17,114,75)}
        {dot("address1",upper(lines[0]),17,118,75)}
        {dot("address2",upper(lines[1]),17,122,75)}
        {dot("address3",[upper(lines[2]),district,state,country,pin&&`Pin : ${pin}`].filter(Boolean).join("    "),17,126,80)}
        {dot("nominationSerial",`Nomination Registered at SL. No. : ${clean(c.pnbNominationSerial)}`,17,132,84)}
        {dot("issueDate",`Date of Issue : ${date(c.pnbIssueDate||c.issueDate)}`,17,136,75)}
        {dot("dicgc",`Bank depositor is insured by DICGC upto a maximum Rs.${clean(c.pnbDicgcAmount)}`,4,149,101)}
        {dot("terms","Subject to change from time. (T&C applicable)",4,153,101)}
      </div>
    </article>
    {onEdit&&<button type="button" className="passbook-button pnb-edit" onClick={onEdit}>Temporary Edit</button>}
  </div>;
}

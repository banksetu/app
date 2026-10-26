import type { CSSProperties } from "react";
import type { PassbookBankInfo } from "./AssamQuickPassbook";

const pnbStationeryTemplate = new URL("./assets/pnb-passbook-blank-template.webp", import.meta.url).href;

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

function PnbStationery({photo,bankLogo}:{photo:string;bankLogo?:string}) {
  return <div className="pnb-stationery" aria-hidden="true">
    <img className="pnb-stationery-template" src={pnbStationeryTemplate} alt=""/>
    {bankLogo&&<img className="pnb-uploaded-logo" src={bankLogo} alt=""/>}
    {photo&&<img className="pnb-customer-photo" src={photo} alt=""/>}
  </div>;
}

export default function PnbPassbook({customer:c,bankInfo:b={},bankLogo,formatType="passbook",onEdit}:{
  customer:PnbPassbookCustomer; bankInfo?:PassbookBankInfo; bankLogo?:string; formatType?:"passbook"|"quickPassbook"; onEdit?:()=>void;
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
  const dot=(field:string,text:string,left:number,top:number,width:number)=><span data-field={field} className={`pnb-dot-line${field==="dicgc"||field==="terms"?" pnb-dot-left-fit":""}`} style={at(left,top,width)}>{text}</span>;
  return <div className="pnb-preview">
    <style>{`
      .pnb-preview{overflow-x:auto;padding:16px 10px 22px;color:#222}.pnb-document{position:relative;width:213mm;height:190mm;margin:auto;background:#fff;overflow:hidden;box-shadow:0 4px 24px #0002;color:#171717}
      .pnb-document *{box-sizing:border-box}.pnb-document[data-mode="passbook"]{background:linear-gradient(90deg,#fbf8ed 0%,#fffdf6 47.7%,#e8e2d3 49.75%,#d5cdbd 50%,#e9e3d5 50.25%,#fffdf7 52.3%,#faf6ea 100%);border:1px solid #b9aa8c;border-radius:4mm 5mm 5mm 4mm;box-shadow:0 2mm 5mm #291c0d28,0 .5mm 0 #fff inset}
      .pnb-document[data-mode="passbook"]::before{content:"";position:absolute;inset:2mm;border:1px solid #d8ccb5;border-radius:3mm 4mm 4mm 3mm;pointer-events:none;z-index:1}
      .pnb-document[data-mode="passbook"]::after{content:"";position:absolute;right:.9mm;top:5mm;bottom:5mm;width:1.2mm;border-right:.25mm solid #aa9b7d;border-radius:50%;box-shadow:.65mm 0 #e7dfcf;pointer-events:none;z-index:1}
      .pnb-dot-line{position:absolute;display:block;font:400 2.65mm/3.55mm "Courier New",monospace;color:#747474;white-space:pre;letter-spacing:.08mm;transform:scaleX(.72);transform-origin:left top;width:138.888%;z-index:3}
      .pnb-dot-left-fit{transform:scaleX(.58);width:172.413%}
      .pnb-stationery{position:absolute;inset:0;z-index:0}.pnb-stationery-template{display:block;width:100%;height:100%;object-fit:fill}.pnb-uploaded-logo{position:absolute;left:18mm;top:8mm;width:68mm;height:22mm;object-fit:contain;object-position:left center}.pnb-customer-photo{position:absolute;left:110.7mm;top:90.4mm;width:28.5mm;height:37.4mm;object-fit:cover}
      .pnb-edit{display:block;margin:12px auto 0}@media print{@page{size:213mm 190mm;margin:0}.pnb-preview{padding:0;overflow:visible}.pnb-document,.pnb-document[data-mode="passbook"]{margin:0;border:0;border-radius:0;box-shadow:none;background:transparent;print-color-adjust:exact;-webkit-print-color-adjust:exact}.pnb-document[data-mode="passbook"]::before,.pnb-document[data-mode="passbook"]::after{display:none!important}.pnb-edit{display:none!important}}
      html.pr2-direct-preparing .pnb-stationery{display:none!important}
    `}</style>
    <article className="pnb-document" data-mode={formatType} aria-label={quick?"Punjab National Bank complete quick passbook":"Punjab National Bank dot matrix data only"}>
      {quick&&<PnbStationery photo={photo} bankLogo={bankLogo}/>}
      <div className="pnb-dot-matrix" aria-label="Punjab National Bank dot matrix customer data">
        {dot("branchOffice",`BO: ${branch}`,17,30,86)}
        {dot("branchPhone",`Phone(${phone})`,17,34,86)}
        {dot("micr",`MICR Code: ${micr}`,17,57,70)}
        {dot("ifsc",`IFSC Code: ${ifsc}`,17,61,70)}
        {dot("bankContact",`*Contact: Tol Free-${clean(c.pnbTollFree)}, Tolled-${clean(c.pnbTolledPhone)}`,12,72,96)}
        {dot("principalOfficer",`*Principal Nodal Officer: ${clean(c.pnbPrincipalOfficer)} Ph-${clean(c.pnbPrincipalPhone)} Fax-${clean(c.pnbPrincipalFax)}`,12,76,96)}
        {dot("modeOfOperation",`Mode of Operation : ${upper(c.pnbModeOfOperation)}`,17,86,75)}
        {dot("customerNo",`Customer No. : ${upper(c.enrolId)}`,17,90,75)}
        {dot("aadhaar",`Aadhar No. : ${upper(c.uidaiNo)}`,17,94,75)}
        {dot("accountNo",`Account No. : ${upper(c.accountNo)}`,17,98,75)}
        {dot("customerName",upper(c.name),17,102,75)}
        {dot("openingDate",`Account Open Date : ${date(c.accountOpeningDate)}`,17,106,75)}
        {dot("guardian",`S/O: ${clean(c.coName)}`,17,110,75)}
        {dot("address1",upper(lines[0]),17,114,75)}
        {dot("address2",upper(lines[1]),17,118,75)}
        {dot("address3",[upper(lines[2]),district,state,country,pin&&`Pin : ${pin}`].filter(Boolean).join("    "),17,122,80)}
        {dot("nominationSerial",`Nomination Registered at SL. No. : ${clean(c.pnbNominationSerial)}`,17,128,84)}
        {dot("issueDate",`Date of Issue : ${date(c.pnbIssueDate||c.issueDate)}`,17,132,75)}
        {dot("dicgc",`Bank depositor is insured by DICGC upto a maximum Rs.${clean(c.pnbDicgcAmount)}`,4,143,101)}
        {dot("terms","Subject to change from time. (T&C applicable)",4,147,101)}
      </div>
    </article>
    {onEdit&&<button type="button" className="passbook-button pnb-edit" onClick={onEdit}>Temporary Edit</button>}
  </div>;
}

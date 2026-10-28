import type { CSSProperties } from "react";
import type { PassbookBankInfo } from "./AssamQuickPassbook";

type Customer = {
  enrolId?: string; customerId?: string; cifId?: string; accountNo?: string;
  name?: string; coName?: string; fatherName?: string; fullAddress?: string;
  address?: string; postOffice?: string; pinCode?: string; accountOpeningDate?: string;
  photoPreview?: string; photoUrl?: string; photoDataUrl?: string;
  accountType?: string; acType?: string; accountCategory?: string;
  modeOfOperation?: string; operationMode?: string; operatingInstruction?: string;
};

const clean = (value?: string) => String(value ?? "").trim();
const upper = (value?: string) => clean(value).toUpperCase();
const date = (value?: string) => {
  const raw = clean(value);
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[3].padStart(2,"0")}/${iso[2].padStart(2,"0")}/${iso[1]}`;
  return raw;
};
const at = (left:number, top:number, width:number):CSSProperties => ({position:"absolute",left:`${left}mm`,top:`${top}mm`,width:`${width}mm`});
const branchAddress = (bank:PassbookBankInfo) => [
  bank.branchAddress || bank.address,
  bank.branchPostOffice,
  bank.branchDistrict,
  bank.branchState,
  bank.branchPinCode,
].map(clean).filter(Boolean).join(", ");
const customerAddress = (customer:Customer) => clean(customer.fullAddress) || [customer.address,customer.postOffice,customer.pinCode].map(clean).filter(Boolean).join(", ");

const hindiProducts = [
  "प्रत्यक्ष आवास वित्त (व्यक्तिगत आवास के लिए)",
  "सेन्ट विद्यार्थी (भारत तथा विदेश में उच्च शिक्षा के लिए ऋण)",
  "सेन्ट व्हीकल (दो पहिया/चौ पहिया वाहनों के लिए व्यक्तिगत ऋण)",
  "सेन्ट मॉर्गेज (व्यक्तिगत प्रयोजन के लिए संपत्ति के समक्ष ऋण)",
  "सेन्ट ट्रेड (व्यापारियों के लिए कार्यशील पूंजी)",
  "सेन्ट स्वाभिमान (वरिष्ठ नागरिकों के लिए मार्गेज योजना)",
  "सेन्ट्रल किसान क्रेडिट कार्ड (किसानों की वित्तीय आवश्यकताओं को पूर्ण करने में समर्थ)",
  "सेन्ट्रल लघु उद्यमी क्रेडिट कार्ड",
  "सेन्ट रेन्टल्स (भावी किराए के समाश्रयण)",
  "सेन्ट कल्याणी (महिला उद्यमियों को ऋण)",
  "पेंशनरों को ऋण (व्यक्तिगत आवश्यकताओं की पूर्ति हेतु)",
  "लघु एवं मध्यम उद्यमी ऋण एसएमई उद्यमियों की आवश्यकताओं की पूर्ति हेतु)",
];
const englishProducts = [
  "Direct Housing Finance (For Personal Housing)",
  "Cent Vidyarthi (Education loan for higher studies in India & Abroad)",
  "Cent Vehicle (Personal loan for two/four wheelers)",
  "Cent Mortgage (Loan for personal use against property)",
  "Cent Trade (Working Capital for traders)",
  "Cent Swabhimaan (Reverse Mortgage Scheme for Senior Citizens)",
  "Central Kisan Credit Card (empowering farmers for their financial requirements)",
  "Central Laghu Udyami Credit Card",
  "Cent Rentals (Loan against future rentals)",
  "Cent Kalyani (Loan to women enterpreneurs)",
  "Loan to pensioners (to meet personal exigencies)",
  "Loan to MSME (to meet credit requirements for SME enterpreneurs)",
];

function CentralStationery({bankLogo,photo}:{bankLogo?:string;photo:string}) {
  return <>
    <section className="central-upper" aria-label="Central Bank printed passbook information">
      <div className="central-compliance"><b>हमारा बैंक बीसीएसबीआई कोड अनुपालित है, विस्तृत विवरण के लिए कृपया शाखा प्रबंधक से संपर्क कीजिए</b><span>We are BCSBI code compliant Bank. For details, please contact the Branch Manager</span></div>
      <div className="central-products central-products-hi"><h2>आपकी आवश्यकता के अनुरूप हमारे ऋण उत्पाद</h2><ul>{hindiProducts.map(item=><li key={item}>{item}</li>)}</ul><div className="central-warning"><span>कृपया अपना पिन नम्बर (एटीएम कार्ड / क्रेडिट कार्ड) किसी भी व्यक्ति को</span><span>फोन या ई-मेल द्वारा न दें, बैंक इस तरह कभी भी आपके व्यक्तिगत</span><span>विवरण नहीं मांगता है।</span></div></div>
      <div className="central-products central-products-en"><h2>Our Loan Products to meet your requirements</h2><ul>{englishProducts.map(item=><li key={item}>{item}</li>)}</ul><div className="central-warning"><span>Please do not disclose your PIN (ATM Card/Credit Card) to</span><span>anybody over phone or email, Bank never asks such personal</span><span>details this way.</span></div></div>
    </section>
    <div className="central-fold"/>
    <div className="central-logo">{bankLogo ? <img src={bankLogo} alt="Central Bank of India"/> : <div><b>CENTRAL BANK OF INDIA</b><strong>Central Bank of India</strong><small>CENTRAL TO YOU SINCE 1911</small></div>}</div>
    {photo && <img className="central-photo" src={photo} alt="Customer photograph"/>}
    <div className="central-manager"><span>अधिकारी&nbsp;&nbsp;/&nbsp;&nbsp;प्रबंधक</span><b>OFFICER&nbsp;&nbsp;/&nbsp;&nbsp;MANAGER</b></div>
  </>;
}

export default function CentralBankPassbook({customer:c,bankInfo:b={},bankLogo="",formatType="passbook",onEdit}:{
  customer:Customer; bankInfo?:PassbookBankInfo; bankLogo?:string; formatType?:"passbook"|"quickPassbook"; onEdit?:()=>void;
}) {
  const quick=formatType==="quickPassbook";
  const photo=clean(c.photoPreview)||clean(c.photoDataUrl)||clean(c.photoUrl);
  const branchTitle=[upper(b.branchName),upper(b.branchState)&&`(${upper(b.branchState)})`].filter(Boolean).join(" ");
  const accountType=upper(c.accountType||c.acType||c.accountCategory)||"SAVINGS";
  const mode=upper(c.modeOfOperation||c.operationMode)||"SELF";
  const operating=upper(c.operatingInstruction)||"SINGLY";
  const cif=upper(c.customerId||c.cifId||c.enrolId);
  const careOf=upper(c.coName||c.fatherName);
  return <div className="central-preview">
    <style>{`
      .central-preview{overflow-x:auto;padding:16px 8px 22px;color:#202b32}
      .central-bank-document{position:relative;width:190mm;height:173mm;margin:auto;overflow:hidden;background:linear-gradient(#eef5f6 0 49.7%,#fffaf5 50.3% 100%);box-shadow:0 4px 24px #0002;border:.2mm solid #87959b;font-family:"Noto Sans Devanagari","Nirmala UI","Mangal",Arial,sans-serif;color:#202b32}
      .central-bank-document[data-mode="passbook"]{background:transparent}
      .central-bank-document *{box-sizing:border-box;text-align:left}
      .central-upper{position:absolute;inset:0 0 auto 0;height:86mm;background:linear-gradient(180deg,#f1f7f8,#e8f1f3);font-size:1.95mm;line-height:3.62mm;color:#30383b}
      .central-compliance{position:absolute;left:49mm;top:5.2mm;width:92mm;height:8.2mm;border:.28mm solid #3f4d53;padding:.35mm 1mm;text-align:center!important;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:3mm}
      .central-compliance *{text-align:center!important}.central-compliance b{font-size:1.78mm;font-weight:650}.central-compliance span{font:400 1.9mm/2.75mm Arial,sans-serif}
      .central-products{position:absolute;top:15.2mm;width:74mm}.central-products h2{margin:0 0 .8mm;font-size:2.65mm;line-height:3.45mm;font-weight:700}.central-products ul{margin:0;padding-left:3.7mm}.central-products li{margin:0;padding-left:.35mm;line-height:3.62mm}.central-products-hi{left:10mm;width:67mm}.central-products-hi li{line-height:4.05mm}.central-products-en{left:99mm;width:74mm;font-family:Arial,sans-serif;font-size:2mm;line-height:3.62mm}.central-products-en h2{font-size:2.65mm}.central-warning{position:absolute;left:0;top:52.2mm;width:74mm;min-height:11.8mm;border:.28mm solid #3f4d53;padding:1.05mm 1.8mm;font-size:1.9mm;line-height:2.9mm;font-weight:400}.central-warning span{display:block;white-space:nowrap}
      .central-fold{position:absolute;left:0;top:85.2mm;width:100%;height:1.6mm;background:#d9d4ce;border-top:.2mm dashed #899498;border-bottom:.2mm solid #c4c0ba}
      .central-lower{position:absolute;left:0;top:86mm;width:190mm;height:87mm;font:400 10px/3.25mm "Courier New",monospace;letter-spacing:.3px;color:#4a4a48}
      .central-value,.central-label{position:absolute;display:block;white-space:pre-wrap;overflow-wrap:anywhere;transform:scaleX(.82);transform-origin:left top;width:121.95%}.central-label{font-weight:400;white-space:pre}.central-value{font-weight:400}.central-contact{font-size:9.5px;transform:scaleX(.8);width:125%}
      .central-logo{position:absolute;left:9.5mm;top:93.5mm;width:39mm;height:12.2mm;display:flex;align-items:center}.central-logo img{width:100%;height:100%;object-fit:contain;object-position:left center}.central-logo div{border:.25mm solid #344b57;width:100%;height:100%;padding:1.2mm 1.5mm;display:flex;flex-direction:column;justify-content:center;font-family:Arial,sans-serif}.central-logo b{font-size:1.8mm}.central-logo strong{font-size:2.4mm}.central-logo small{font-size:1.25mm;letter-spacing:.08mm}
      .central-photo{position:absolute;left:60.2mm;top:112.5mm;width:26.5mm;height:34mm;border:.3mm solid #37474f;object-fit:cover;padding:.35mm;background:#fff}
      .central-manager{position:absolute;left:145mm;top:158.5mm;width:38mm;text-align:center!important;color:#4a4a48;font-family:"Noto Sans Devanagari","Nirmala UI","Mangal",Arial,sans-serif;line-height:3.3mm}.central-manager *{display:block;text-align:center!important}.central-manager span{font-size:2.3mm;font-weight:600}.central-manager b{font:700 2.35mm/3.3mm Arial,sans-serif}
      .central-edit{display:block;margin:12px auto 0}
      @media print{@page{size:190mm 173mm;margin:0}.central-preview{padding:0;overflow:visible}.central-bank-document{margin:0;box-shadow:none;border:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}.central-bank-document[data-mode="passbook"]{background:transparent}.central-edit{display:none!important}}
      html.pr2-direct-preparing .central-upper,html.pr2-direct-preparing .central-fold,html.pr2-direct-preparing .central-logo,html.pr2-direct-preparing .central-photo,html.pr2-direct-preparing .central-manager{display:none!important}
    `}</style>
    <article className="central-bank-document" data-mode={formatType} aria-label={quick?"Central Bank of India complete quick passbook":"Central Bank of India passbook values only"}>
      {quick&&<CentralStationery bankLogo={bankLogo} photo={photo}/>} 
      <section className="central-lower">
        <span className="central-value" data-field="branchTitle" style={at(55,7,58)}>{branchTitle}</span>
        <span className="central-value" data-field="accountNo" style={at(55,11.6,64)}>ACCOUNT NO: {upper(c.accountNo)}</span>
        <span className="central-value" data-field="gstin" style={at(55,16.2,66)}>GSTIN: {upper(b.gstin)}</span>
        <span className="central-value" data-field="ckyc" style={at(55,20.8,66)}>CKYC NO: {upper(b.ckyc)}</span>
        <span className="central-label" style={at(9.5,27.8,48)}>BRANCH ADDRESS AND TEL NO.:</span>
        <span className="central-value" data-field="branchAddress" style={{...at(9.5,32,48),lineHeight:"3.5mm"}}>{upper(branchAddress(b))}</span>
        <span className="central-value" data-field="branchPhone" style={at(9.5,45.5,48)}>TEL: {upper(b.branchPhone)}</span>
        <span className="central-value" data-field="micr" style={at(9.5,55.5,48)}>MICR CODE: {upper(b.micr)}</span>
        <span className="central-value" data-field="ifsc" style={at(9.5,60,48)}>IFSC CODE: {upper(b.ifsc)}</span>
        <span className="central-value" data-field="openingDate" style={at(9.5,64.5,48)}>{date(c.accountOpeningDate)}</span>
        <span className="central-label" style={at(91,27.8,88)}>NAME AND ADDRESS OF ACCOUNT HOLDER/S:</span>
        <span className="central-value" data-field="name" style={at(91,32,88)}>{upper(c.name)}</span>
        <span className="central-value" data-field="address" style={{...at(91,37.2,88),lineHeight:"3.5mm",maxHeight:"13mm",overflow:"hidden"}}>{careOf&&`C/O: ${careOf}\n`}{upper(customerAddress(c))}</span>
        <span className="central-value" data-field="cif" style={at(91,51.8,72)}>CIF: {cif}</span>
        <span className="central-value" data-field="accountType" style={at(91,56.3,72)}>A/C TYPE: {accountType}</span>
        <span className="central-value" data-field="mode" style={at(91,60.8,72)}>MODE: {mode}</span>
        <span className="central-value" data-field="operating" style={at(91,65.3,72)}>OPERATING: {operating}</span>
        <span className="central-label central-contact" style={at(58,73.5,112)}>Toll Free: 18003030  WhatsApp Banking: 7900123123</span>
      </section>
    </article>
    {onEdit&&<button type="button" className="passbook-button central-edit" onClick={onEdit}>Temporary Edit</button>}
  </div>;
}

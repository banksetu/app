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
      <div className="central-products central-products-hi"><h2>आपकी आवश्यकता के अनुरूप हमारे ऋण उत्पाद</h2><ul>{hindiProducts.map(item=><li key={item}>{item}</li>)}</ul><div className="central-warning">कृपया अपना पिन नम्बर (एटीएम कार्ड / क्रेडिट कार्ड) किसी भी व्यक्ति को फोन या ई-मेल द्वारा न दें, बैंक इस तरह कभी भी आपके व्यक्तिगत विवरण नहीं मांगता है।</div></div>
      <div className="central-products central-products-en"><h2>Our Loan Products to meet your requirements</h2><ul>{englishProducts.map(item=><li key={item}>{item}</li>)}</ul><div className="central-warning">Please do not disclose your PIN (ATM Card/Credit Card) to anybody over phone or email, Bank never asks such personal details this way.</div></div>
    </section>
    <div className="central-fold"/>
    <div className="central-logo">{bankLogo ? <img src={bankLogo} alt="Central Bank of India"/> : <div><b>CENTRAL BANK OF INDIA</b><strong>Central Bank of India</strong><small>CENTRAL TO YOU SINCE 1911</small></div>}</div>
    {photo && <img className="central-photo" src={photo} alt="Customer photograph"/>}
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
      .central-bank-document *{box-sizing:border-box;text-align:left}
      .central-upper{position:absolute;inset:0 0 auto 0;height:86mm;background:linear-gradient(180deg,#f1f7f8,#e8f1f3);font-size:1.9mm;line-height:2.55mm}
      .central-compliance{position:absolute;left:50mm;top:5.4mm;width:90mm;height:7.8mm;border:.25mm solid #52636b;padding:.45mm 1mm;text-align:center!important;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:2.65mm}
      .central-compliance *{text-align:center!important}.central-compliance b{font-size:1.8mm}.central-compliance span{font-size:1.9mm}
      .central-products{position:absolute;top:14mm;width:78mm}.central-products h2{margin:0 0 1.2mm;font-size:2.8mm;line-height:3.1mm;font-weight:800}.central-products ul{margin:0;padding-left:3.4mm}.central-products li{margin:0 0 .55mm;padding-left:.2mm;line-height:2.55mm}.central-products-hi{left:10mm}.central-products-en{left:99mm;width:80mm;font-family:Arial,sans-serif;font-size:1.85mm}.central-products-en h2{font-size:2.75mm}.central-warning{position:absolute;left:0;top:54.8mm;width:100%;min-height:11.8mm;border:.25mm solid #52636b;padding:1.1mm 1.8mm;font-size:1.8mm;line-height:2.65mm}
      .central-fold{position:absolute;left:0;top:85.2mm;width:100%;height:1.6mm;background:#d9d4ce;border-top:.2mm dashed #899498;border-bottom:.2mm solid #c4c0ba}
      .central-lower{position:absolute;left:0;top:86mm;width:190mm;height:87mm;font:700 2.5mm/3.8mm "Courier New",monospace}
      .central-value,.central-label{position:absolute;display:block;white-space:pre-wrap;overflow-wrap:anywhere}.central-label{font-weight:400}.central-value{font-weight:700}
      .central-logo{position:absolute;left:9.5mm;top:93.5mm;width:39mm;height:12.2mm;display:flex;align-items:center}.central-logo img{width:100%;height:100%;object-fit:contain;object-position:left center}.central-logo div{border:.25mm solid #344b57;width:100%;height:100%;padding:1.2mm 1.5mm;display:flex;flex-direction:column;justify-content:center;font-family:Arial,sans-serif}.central-logo b{font-size:1.8mm}.central-logo strong{font-size:2.4mm}.central-logo small{font-size:1.25mm;letter-spacing:.08mm}
      .central-photo{position:absolute;left:58.5mm;top:113mm;width:23.8mm;height:30mm;border:.3mm solid #37474f;object-fit:cover;padding:.4mm;background:#fff}
      .central-edit{display:block;margin:12px auto 0}
      @media print{@page{size:190mm 173mm;margin:0}.central-preview{padding:0;overflow:visible}.central-bank-document{margin:0;box-shadow:none;border:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}.central-bank-document[data-mode="passbook"]{background:transparent}.central-edit{display:none!important}}
      html.pr2-direct-preparing .central-upper,html.pr2-direct-preparing .central-fold,html.pr2-direct-preparing .central-logo,html.pr2-direct-preparing .central-photo{display:none!important}
    `}</style>
    <article className="central-bank-document" data-mode={formatType} aria-label={quick?"Central Bank of India complete quick passbook":"Central Bank of India passbook values only"}>
      {quick&&<CentralStationery bankLogo={bankLogo} photo={photo}/>} 
      <section className="central-lower">
        <span className="central-value" data-field="branchTitle" style={at(55,4.5,55)}>{branchTitle}</span>
        <span className="central-value" data-field="accountNo" style={at(55,9.2,60)}>ACCOUNT NO: {upper(c.accountNo)}</span>
        <span className="central-value" data-field="gstin" style={at(55,13.9,62)}>GSTIN: {upper(b.gstin)}</span>
        <span className="central-value" data-field="ckyc" style={at(55,18.6,62)}>CKYC NO: {upper(b.ckyc)}</span>
        <span className="central-label" style={at(9.5,27.5,45)}>BRANCH ADDRESS AND TEL NO.:</span>
        <span className="central-value" data-field="branchAddress" style={{...at(9.5,32,44),lineHeight:"3.7mm"}}>{upper(branchAddress(b))}</span>
        <span className="central-value" data-field="branchPhone" style={at(9.5,45.5,44)}>TEL: {upper(b.branchPhone)}</span>
        <span className="central-value" data-field="micr" style={at(9.5,55,44)}>MICR CODE: {upper(b.micr)}</span>
        <span className="central-value" data-field="ifsc" style={at(9.5,59.5,44)}>IFSC CODE: {upper(b.ifsc)}</span>
        <span className="central-value" data-field="openingDate" style={at(9.5,64,44)}>{date(c.accountOpeningDate)}</span>
        <span className="central-label" style={at(88,27.5,75)}>NAME AND ADDRESS OF ACCOUNT HOLDER/S:</span>
        <span className="central-value" data-field="name" style={at(88,32,78)}>{upper(c.name)}</span>
        <span className="central-value" data-field="address" style={{...at(88,38,78),lineHeight:"3.9mm",maxHeight:"12mm",overflow:"hidden"}}>{careOf&&`C/O: ${careOf}\n`}{upper(customerAddress(c))}</span>
        <span className="central-value" data-field="cif" style={at(88,51.5,62)}>CIF: {cif}</span>
        <span className="central-value" data-field="accountType" style={at(88,56,62)}>A/C TYPE: {accountType}</span>
        <span className="central-value" data-field="mode" style={at(88,60.5,62)}>MODE: {mode}</span>
        <span className="central-value" data-field="operating" style={at(88,65,62)}>OPERATING: {operating}</span>
        <span className="central-label" style={{...at(67,70,72),textAlign:"center"}}>Toll Free: 18003030  WhatsApp Banking: 7900123123</span>
      </section>
    </article>
    {onEdit&&<button type="button" className="passbook-button central-edit" onClick={onEdit}>Temporary Edit</button>}
  </div>;
}

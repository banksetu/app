import type { CSSProperties } from "react";
import type { PassbookBankInfo } from "./AssamQuickPassbook";

type Customer = {
  accountNo?: string; name?: string; coName?: string; fatherName?: string;
  jointHolder?: string; fullAddress?: string; address?: string; postOffice?: string;
  pinCode?: string; nominee?: string; occupation?: string; accountOpeningDate?: string;
  photoPreview?: string; photoUrl?: string; photoDataUrl?: string;
};
const upper = (value?: string) => (value || "").trim().toUpperCase();
const date = (value?: string) => {
  const m = (value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : value || "";
};
const safeguards = [
  ["पासबुक में दर्शायी गयी प्रविष्टियों की जाँच करें तथा उनमें किसी प्रकार की त्रुटि या भूल होने पर हमें तुरंत सूचित करें।", "Verify the entries as reflected in the pass book and intimate us immediately of any errors or omissions."],
  ["पासबुक की सुरक्षित अभिरक्षा सुनिश्चित करें। पासबुक गुम होने, चोरी होने, नष्ट होने या कटफट जाने पर डुप्लिकेट पासबुक हेतु आवेदन करें। डुप्लिकेट पासबुक नाममात्र के प्रभार पर जारी की जाती है।", "Ensure safe custody of the passbook. In case it is lost, stolen, destroyed or spoilt, make an application for issuance of a duplicate pass book. Duplicate pass book is issued on nominal charge."],
];
const chequeSafeguards = [
  ["चेक लिखते समय स्थायी स्याही (बालपेन) का प्रयोग करें।", "While writing a cheque, use permanent ink (ballpen)."],
  ["चेक पर प्राप्तकर्ता का नाम और राशि लिखने के बाद खाली जगह में रेखा खींच दें।", "After payee's name and amount, please draw a line in the space left on the cheque."],
  ["चेक के सभी विवरण भरने के बाद ही हस्ताक्षर करें।", "A cheque should be signed after all details filled in and verified."],
  ["एमआईसीआर पट्टी पर कुछ न लिखें।", "Do not write on the MICR Strip."],
  ["चेक पर किसी का भुगतान करने से पूर्व चेक के बायें ऊपरी कोने पर दो समानांतर रेखाएँ खींच कर चेक को रेखांकित कर दें। रेखांकित चेक का भुगतान किसी अनधिकृत व्यक्ति को होने पर उसे पकड़ना आसान हो जाता है।", "Cross a cheque by drawing two parallel lines at the top left corner of the cheque before handing over. A crossed cheque makes it easy to track any wrong payment to an unintended beneficiary."],
  ["सुनिश्चित करें कि आप द्वारा जारी चेक के भुगतान हेतु आपके खाते में पर्याप्त राशि है। अपर्याप्त शेष राशि होने पर बैंक चेक लौटा देगा तथा सेवा प्रभार लगाया जाएगा। प्राप्तकर्ता आपके विरुद्ध आपराधिक कार्यवाही भी कर सकता है।", "Ensure that you have sufficient balance in the account to pay for the cheque you have issued. Bank will return the cheque and will charge you for the transaction. Beside, the payee can take criminal action against you for issue of a cheque without having the funds to pay for it."],
  ["यदि बैंक खाता संख्या के सत्यापन हेतु खाली चेक देने के लिए कहा जाए तो उसे देने से पहले उस पर एक कोने से दूसरे कोने तक निरस्त (Cancelled) शब्द लिख दें।", "If asked to give a blank cheque for verification of bank account number, write the word 'Cancelled' diagonally across the cheque before giving it."],
  ["चेकों पर किसी प्रकार का परिवर्तन/संशोधन न करें। प्राप्तकर्ता के नाम, राशि आदि में परिवर्तन हेतु नए चेक का प्रयोग करें।", "No changes/correction should be carried out on the cheques. For any change in the payee's name, amount (other than date for validation purposes) etc. fresh cheque forms should be used."],
];
// Coordinates are millimetres relative to the LOWER 106.68mm panel.
// Both modes deliberately share this overlay; only Quick Passbook adds stationery.
export default function UnionPassbook({ customer: c, bankInfo: b = {}, bankLogo = "", formatType = "passbook", onEdit }: {
  customer: Customer; bankInfo?: PassbookBankInfo; bankLogo?: string;
  formatType?: "passbook" | "quickPassbook"; onEdit?: () => void;
}) {
  const quick = formatType === "quickPassbook";
  const photo = c.photoPreview || c.photoDataUrl || c.photoUrl || "";
  const position = (x: number, y: number, width: number): CSSProperties => ({
    left: `${x}mm`, top: `${y}mm`, width: `${width}mm`,
  });
  const value = (field: string, text: string, x: number, y: number, w: number, extra: CSSProperties = {}) =>
    <span data-field={field} className="union-value" style={{ ...position(x,y,w), ...(field !== "address" ? {whiteSpace:"nowrap",fontSize:`${Math.min(3.2,w/Math.max(1,text.length*.61))}mm`} : {}), ...extra }}>{text}</span>;
  const label = (text: string, y: number, width = 65) =>
    <span className="union-label" style={position(4,y,width)}>{text}</span>;
  const instructions = (items: string[][]) => <ol>{items.map(([hi,en], i) =>
    <li key={i}><div lang="hi">{hi}</div><div>{en}</div></li>)}</ol>;
  return <div className="union-preview">
    <style>{`
      .union-document { position:relative; width:203.2mm; height:213.36mm; margin:auto; color:#111; background:white; box-shadow:0 3px 20px #0002; overflow:hidden; }
      .union-document * { box-sizing:border-box; text-align:left; }
      .union-upper { position:absolute; left:7mm; top:5mm; width:189.2mm; font:2.35mm/2.65mm Arial,sans-serif; }
      .union-upper h3 { font-size:3.2mm; line-height:3.7mm; margin:0 0 1mm; }
      .union-upper ol { margin:0 0 1mm; padding-left:5mm; }
      .union-upper li { padding-left:.5mm; margin-bottom:.6mm; }
      .union-lower { position:absolute; left:0; top:106.68mm; width:203.2mm; height:106.68mm; }
      .union-fold { position:absolute; top:106.68mm; left:0; width:100%; border-top:.2mm solid #ccc; }
      .union-value { position:absolute; font:700 3.2mm/4mm "Courier New",monospace; white-space:pre-wrap; overflow-wrap:anywhere; }
      .union-label { position:absolute; font:3mm/3.7mm Arial,sans-serif; white-space:pre-wrap; }
      .union-logo { position:absolute; left:70mm; top:7mm; width:55mm; height:10mm; object-fit:contain; }
      .union-brand { position:absolute; left:70mm; top:7mm; width:55mm; font:bold 4mm/4.5mm Arial,sans-serif; }
      .union-photo { position:absolute; left:161mm; top:28mm; width:30mm; height:38mm; object-fit:cover; }
      .union-edit { display:block; margin:12px auto; }
      @media print {
        @page { size:210mm 297mm; margin:0; }
        .union-document { margin:0; box-shadow:none; background:transparent; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
        .union-edit { display:none!important; }
      }
    `}</style>
    <article className="union-document" data-mode={formatType} aria-label={quick ? "Union Bank complete quick passbook" : "Union Bank values only"}>
      {quick && <>
        <section className="union-upper">
          <h3>पासबुक की सुरक्षा / Passbook safeguards:</h3>{instructions(safeguards)}
          <h3>चेकबुक की सुरक्षा / Cheque book safeguards:</h3>{instructions(chequeSafeguards)}
        </section><div className="union-fold"/>
      </>}
      <section className="union-lower">
        {quick && <>
          {bankLogo ? <img className="union-logo" src={bankLogo} alt="Union Bank of India"/> : <div className="union-brand">यूनियन बैंक<br/>Union Bank of India</div>}
          {label("शाखा BRANCH",20)}
          {label("शाखा का पता Branch Address :",27)}
          {label("शाखा का फोन नं. / Branch Phone No.",34)}
          {label("खाता क्र. Account No.",41)}
          {label("In the Name of :\nनाम Name",50)}
          {[0,1,2,3].map((n)=><span key={n} className="union-label" style={position(24,55+n*4,8)}>{["i)","ii)","iii)","iv)"][n]}</span>)}
          {label("पेशा Occupation",70)}
          {label("पता Address",77)}
          {label("खाता खोलने की तारीख\nDate of Opening A/c",92)}
          {label("नामांकन पंजीकृत / Nomination Registered हाँ Y/ नहीं N",100,106)}
          <span className="union-label" style={position(162,94,38)}>लेखाकार Accountant</span>
        </>}
        {value("branchHeading",upper(b.branchName),46,12,23)}
        {value("branch",upper(b.branchName),61,20,94)}
        {value("branchAddress",upper(b.address),66,26,88,{lineHeight:"3mm"})}
        {value("ifsc",upper(b.ifsc),47,30,108,{fontSize:"2.8mm"})}
        {value("branchPhone",upper(b.branchPhone),65,34,89)}
        {value("accountNo",upper(c.accountNo),60,41,94)}
        {value("name",upper(c.name),43,48,111)}
        {value("coName",c.coName || c.fatherName ? "C/O - "+upper(c.coName || c.fatherName) : "",43,52,111)}
        {value("jointHolder",upper(c.jointHolder),43,56,111)}
        {value("occupation",upper(c.occupation),43,69,111)}
        {value("address",upper(c.fullAddress || [c.address,c.postOffice,c.pinCode].filter(Boolean).join(", ")),43,75,113,{maxHeight:"12mm",overflow:"hidden"})}
        {value("openingDate",date(c.accountOpeningDate),61,88,39)}
        {value("nominee",upper(c.nominee),90,93,65)}
        {value("nomination",c.nominee ? "Y" : "",109,100,10)}
        {photo && <img className="union-photo" src={photo} alt="Customer photograph"/>}
      </section>
    </article>
    {onEdit && <button type="button" className="passbook-button union-edit" onClick={onEdit}>Temporary Edit</button>}
  </div>;
}

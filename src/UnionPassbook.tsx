import type { PassbookBankInfo } from "./AssamQuickPassbook";

type Customer = {
  accountNo?: string; name?: string; contact?: string; accountOpeningDate?: string;
  fullAddress?: string; address?: string; postOffice?: string; pinCode?: string;
  nominee?: string; uidaiNo?: string; aofNo?: string; purposeOfAdvance?: string;
};

const upper = (value?: unknown) => String(value ?? "").trim().toUpperCase();
const date = (value?: string) => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(value || "");
};

export default function UnionPassbook({ customer: c, bankInfo = {}, onEdit }: {
  customer: Customer; bankInfo?: PassbookBankInfo; onEdit: () => void;
}) {
  const address = upper(c.fullAddress || [c.address, c.postOffice, c.pinCode].filter(Boolean).join(", "));
  const field = (label: string, value: unknown) => <div className="union-pb-field"><span>{label}</span><strong>{upper(value)}</strong></div>;
  return <div className="union-pb-preview">
    <style>{`
      .union-pb-document{position:relative;width:205mm;height:175mm;margin:0 auto;background:#fff;color:#171717;box-sizing:border-box;font:3.25mm/4.5mm "Courier New",monospace;box-shadow:0 4px 24px #0002;overflow:hidden}
      .union-pb-document *{box-sizing:border-box;text-align:left}
      .union-pb-field{display:grid;grid-template-columns:62mm 1fr;column-gap:3mm;white-space:pre-wrap}
      .union-pb-field strong{font-weight:700;overflow-wrap:anywhere}
      .union-pb-section{position:absolute;left:14mm;width:177mm}
      .union-pb-top{top:10mm}.union-pb-account{top:43mm}.union-pb-profile{top:78mm}.union-pb-footer{top:145mm}
      .union-pb-address{max-height:18mm;overflow:hidden}
      .union-pb-accountant{position:absolute;right:12mm;bottom:7mm;font-weight:700}
      .union-pb-edit{display:block;margin:12px auto 0}
      @media print{ @page{size:205mm 175mm;margin:0}.union-pb-document{position:fixed;left:0;top:0;margin:0;box-shadow:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}.union-pb-edit{display:none!important} }
    `}</style>
    <article className="union-pb-document" aria-label="Union Bank passbook">
      <section className="union-pb-section union-pb-top">
        {field("शाखा BRANCH", bankInfo.branchName)}
        {field("शाखा का पता BRANCH ADDRESS", bankInfo.address)}
        {field("शाखा का फोन नं. / BRANCH PHONE NO.", bankInfo.branchPhone)}
      </section>
      <section className="union-pb-section union-pb-account">
        {field("खाता क्र. ACCOUNT NO.", c.accountNo)}
        {field("In the Name of / नाम Name", c.name)}
        {field("Aadhaar no", c.uidaiNo)}
      </section>
      <section className="union-pb-section union-pb-profile">
        {field("पेशा Occupation", c.purposeOfAdvance)}
        <div className="union-pb-field union-pb-address"><span>पता Address</span><strong>{address}</strong></div>
        {field("खाता खोलने की तारीख Date of Opening A/c", date(c.accountOpeningDate))}
        {field("नामांकन पंजीकृत Nomination Registered", c.nominee ? "YES" : "NO")}
      </section>
      <div className="union-pb-accountant">लेखाकार Accountant</div>
    </article>
    <button type="button" className="passbook-button union-pb-edit" onClick={onEdit}>Temporary Edit</button>
  </div>;
}

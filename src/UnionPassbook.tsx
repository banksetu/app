import type { PassbookBankInfo } from "./AssamQuickPassbook";

type Customer = {
  accountNo?: string;
  name?: string;
  coName?: string;
  fatherName?: string;
  jointHolder?: string;
  fullAddress?: string;
  address?: string;
  postOffice?: string;
  pinCode?: string;
  nominee?: string;
  purposeOfAdvance?: string;
  occupation?: string;
  accountOpeningDate?: string;
};

const upper = (value?: unknown) => String(value ?? "").trim().toUpperCase();

const date = (value?: string) => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(value || "");
};

export default function UnionPassbook({
  customer: c,
  bankInfo = {},
  onEdit,
}: {
  customer: Customer;
  bankInfo?: PassbookBankInfo;
  onEdit: () => void;
}) {
  // The Union Bank book already contains its logo, labels and static text.
  // This layer prints customer values only, using the same 205x175mm page
  // and lower-panel geometry as the Assam Gramin passbook preview.
  const address = upper(
    c.fullAddress ||
      [c.address, c.postOffice, c.pinCode].filter(Boolean).join(", "),
  );

  return (
    <div className="union-pb-preview">
      <style>{`
        .union-pb-document {
          position: relative;
          width: 205mm;
          height: 175mm;
          margin: 0 auto;
          background: transparent;
          color: #171717;
          box-sizing: border-box;
          font: 2.9mm/4.3mm "Courier New", monospace;
          overflow: hidden;
          box-shadow: 0 4px 24px #0002;
        }
        .union-pb-document * { box-sizing: border-box; text-align: left; }
        .union-pb-cover {
          position:absolute; left:0; top:0; width:100%; height:85mm;
          background:#f7f4ec; border-bottom:1px dashed #b9b3a8;
          color:#aaa398; display:flex; align-items:center; justify-content:center;
          letter-spacing:1.6mm; font:3mm Arial,sans-serif;
        }
        .union-pb-value {
          position: absolute;
          font-weight: 700;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        /* Same lower panel used by Assam Gramin: static book content stays
           on paper; only values are placed here for dot-matrix printing. */
        .union-pb-branch { left: 18mm; top: 123mm; width: 58mm; }
        .union-pb-account { left: 18mm; top: 140mm; width: 58mm; }
        .union-pb-name-1 { left: 81mm; top: 140mm; width: 58mm; }
        .union-pb-name-2 { left: 81mm; top: 146mm; width: 58mm; }
        .union-pb-name-3 { left: 81mm; top: 152mm; width: 58mm; }
        .union-pb-name-4 { left: 81mm; top: 158mm; width: 58mm; }
        .union-pb-occupation { left: 18mm; top: 158mm; width: 58mm; }
        .union-pb-address { left: 81mm; top: 164mm; width: 110mm; max-height: 7mm; overflow: hidden; }
        .union-pb-opening { left: 18mm; top: 168mm; width: 58mm; }
        .union-pb-nomination { left: 145mm; top: 168mm; width: 20mm; }
        .union-pb-edit { display: block; margin: 12px auto 0; }
        @media print {
          @page { size: 205mm 175mm; margin: 0; }
          .union-pb-cover { display:none !important; }
          .union-pb-document {
            position: fixed !important;
            left: 0;
            top: 0;
            margin: 0;
            box-shadow: none;
            background: transparent !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .union-pb-edit { display: none !important; }
        }
      `}</style>

      <article className="union-pb-document" aria-label="Union Bank passbook data">
        <div className="union-pb-cover" aria-hidden="true">PASSBOOK COVER — NO PRINT</div>
        <span className="union-pb-value union-pb-branch">{upper(bankInfo.branchName)}</span>
        <span className="union-pb-value union-pb-account">{upper(c.accountNo)}</span>
        <span className="union-pb-value union-pb-name-1">{upper(c.name)}</span>
        <span className="union-pb-value union-pb-name-2">{upper(c.coName || c.fatherName)}</span>
        <span className="union-pb-value union-pb-name-3">{upper(c.jointHolder)}</span>
        <span className="union-pb-value union-pb-name-4">{upper(c.nominee)}</span>
        <span className="union-pb-value union-pb-occupation">{upper(c.occupation || c.purposeOfAdvance)}</span>
        <span className="union-pb-value union-pb-address">{address}</span>
        <span className="union-pb-value union-pb-opening">{date(c.accountOpeningDate)}</span>
        <span className="union-pb-value union-pb-nomination">{c.nominee ? "Y" : "N"}</span>
      </article>

      <button type="button" className="passbook-button union-pb-edit" onClick={onEdit}>
        Temporary Edit
      </button>
    </div>
  );
}

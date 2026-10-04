import type { PassbookBankInfo } from "./AssamQuickPassbook";

type Customer = {
  accountNo?: string;
  name?: string;
  coName?: string;
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
  // Union Bank's physical book already has all labels, logo, branch details,
  // IFSC, accountant text and other static print. This layer prints values only.
  const address = upper(
    c.fullAddress ||
      [c.address, c.postOffice, c.pinCode].filter(Boolean).join(", "),
  );

  return (
    <div className="union-pb-preview">
      <style>{`
        .union-pb-document {
          position: relative;
          width: 8in;
          height: 8.4in;
          margin: 0 auto;
          background: transparent;
          color: #171717;
          box-sizing: border-box;
          font: 0.13in/0.18in "Courier New", monospace;
          overflow: hidden;
        }
        .union-pb-document * { box-sizing: border-box; text-align: left; }
        .union-pb-value {
          position: absolute;
          font-weight: 700;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        /* The book is 8.4in open and folds at 4.2in.
           Values are printed only in the lower 4.2in panel. */
        .union-pb-branch { left: 2.45in; top: 4.48in; width: 3.7in; text-align: center; }
        .union-pb-account { left: 2.45in; top: 5.08in; width: 3.7in; }
        .union-pb-name-1 { left: 2.45in; top: 5.55in; width: 4.9in; }
        .union-pb-name-2 { left: 2.45in; top: 5.90in; width: 4.9in; }
        .union-pb-name-3 { left: 2.45in; top: 6.25in; width: 4.9in; }
        .union-pb-name-4 { left: 2.45in; top: 6.60in; width: 4.9in; }
        .union-pb-occupation { left: 2.45in; top: 6.98in; width: 4.9in; }
        .union-pb-address { left: 2.45in; top: 7.34in; width: 5.2in; max-height: 0.42in; overflow: hidden; }
        .union-pb-opening { left: 2.45in; top: 7.86in; width: 2.8in; }
        .union-pb-nomination { left: 5.25in; top: 7.86in; width: 0.7in; }
        .union-pb-edit { display: block; margin: 12px auto 0; }
        @media print {
          @page { size: 8in 8.4in; margin: 0; }
          .union-pb-document {
            position: fixed;
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
        <span className="union-pb-value union-pb-branch">{upper(bankInfo.branchName)}</span>
        <span className="union-pb-value union-pb-account">{upper(c.accountNo)}</span>
        <span className="union-pb-value union-pb-name-1">{upper(c.name)}</span>
        <span className="union-pb-value union-pb-name-2">{upper(c.coName)}</span>
        <span className="union-pb-value union-pb-name-3"></span>
        <span className="union-pb-value union-pb-name-4"></span>
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

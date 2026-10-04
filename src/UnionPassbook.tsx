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
  // The physical Union Bank passbook already contains its logo, labels,
  // branch address/phone labels, accountant line and other static print.
  // Only customer/branch-specific dot-matrix values are overlaid here.
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
          background: #fff;
          color: #171717;
          box-sizing: border-box;
          font: 3.25mm/4.5mm "Courier New", monospace;
          box-shadow: 0 4px 24px #0002;
          overflow: hidden;
        }
        .union-pb-document * { box-sizing: border-box; text-align: left; }
        .union-pb-value {
          position: absolute;
          font-weight: 700;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .union-pb-branch { left: 67mm; top: 10mm; width: 95mm; text-align: center; }
        .union-pb-account { left: 68mm; top: 54mm; width: 92mm; }
        .union-pb-name-1 { left: 48mm; top: 69mm; width: 125mm; }
        .union-pb-name-2 { left: 48mm; top: 76mm; width: 125mm; }
        .union-pb-occupation { left: 68mm; top: 101mm; width: 110mm; }
        .union-pb-address { left: 68mm; top: 110mm; width: 125mm; max-height: 18mm; overflow: hidden; }
        .union-pb-opening { left: 68mm; top: 130mm; width: 75mm; }
        .union-pb-nomination { left: 96mm; top: 139mm; width: 25mm; }
        .union-pb-edit { display: block; margin: 12px auto 0; }
        @media print {
          @page { size: 205mm 175mm; margin: 0; }
          .union-pb-document {
            position: fixed;
            left: 0;
            top: 0;
            margin: 0;
            box-shadow: none;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .union-pb-edit { display: none !important; }
        }
      `}</style>

      <article className="union-pb-document" aria-label="Union Bank passbook">
        <span className="union-pb-value union-pb-branch">
          {upper(bankInfo.branchName)}
        </span>
        <span className="union-pb-value union-pb-account">
          {upper(c.accountNo)}
        </span>
        <span className="union-pb-value union-pb-name-1">
          {upper(c.name)}
        </span>
        <span className="union-pb-value union-pb-name-2">
          {upper(c.coName)}
        </span>
        <span className="union-pb-value union-pb-occupation">
          {upper(c.occupation || c.purposeOfAdvance)}
        </span>
        <span className="union-pb-value union-pb-address">{address}</span>
        <span className="union-pb-value union-pb-opening">
          {date(c.accountOpeningDate)}
        </span>
        <span className="union-pb-value union-pb-nomination">
          {c.nominee ? "Y" : "N"}
        </span>
      </article>

      <button
        type="button"
        className="passbook-button union-pb-edit"
        onClick={onEdit}
      >
        Temporary Edit
      </button>
    </div>
  );
}

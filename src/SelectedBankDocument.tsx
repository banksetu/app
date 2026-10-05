import Passbook from "./Passbook";
import AccountOpeningPDF from "./AccountOpeningPDF";
import CustomBankDocument from "./CustomBankDocument";
import { bankDocumentMode, type BankDocumentType } from "./bankDocumentPolicy";
import type { PassbookBankInfo } from "./AssamQuickPassbook";
export default function SelectedBankDocument({ formatType, bankInfo, bankLogo }: {
  formatType: BankDocumentType; bankInfo: PassbookBankInfo; bankLogo?: string;
}) {
  const bank = bankInfo.passbookBank || "";
  const mode = bankDocumentMode(bank);
  if (mode === "select") return <section role="status" className="bank-selection-required" style={{padding:24,background:"white",borderRadius:12,color:"#34344c"}}><h2>First select a bank</h2><p>Choose Bank for passbook printing in Bank Information, then save it.</p></section>;
  if (mode === "custom") return <CustomBankDocument key={bank + formatType} formatType={formatType} bankInfo={bankInfo} />;
  return formatType === "accountOpening" ? <AccountOpeningPDF /> : <Passbook formatType={formatType} bankInfo={bankInfo} bankLogo={bankLogo} />;
}

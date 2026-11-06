import {useState} from "react";
import CustomizeLayoutStudio from "./CustomizeLayoutStudio";
import "./CodespacesLayoutPreview.css";

/** Same draft editor as Windows, but with synthetic bank/customer data and
 * browser-local temporary drafts. The code path has NO customer repository,
 * Firebase, Master approval or PR2 device access in this mode.
 */
const banks=[
  "Assam Gramin Bank","Union Bank of India","Punjab National Bank",
  "Central Bank of India","State Bank of India (SBI)",
  "Punjab Bank of India","Canara Bank of India","Airtel Bank"
] as const;
const sampleBank={
  bankName:"Assam Gramin Bank",
  passbookBank:"Assam Gramin Bank",
  branchName:"Demo Branch",
  branchAddress:"Demo Road, Assam",
  address:"Demo Road, Assam",
  branchEmail:"demo@example.invalid",
  phone:"0000000000",
  ifsc:"DEMO0000000",
  micr:"000000000",
  gstin:"DEMO-NOT-VALID"
};
export default function CodespacesLayoutPreview(){
  const [mode,setMode]=useState<"passbook"|"accountOpening">("passbook");
  return <div className="codespaces-lab">
    <header className="codespaces-lab-banner" role="status">
      <div><strong>BANK SETU · Codespaces Draft Design Lab</strong>
        <p>Real draft editor, synthetic sample values. Only browser-local preview drafts are saved.
        Firebase, Master approval, customer records, licensing, and physical PR2 printing are NOT connected.</p>
      </div>
      <nav aria-label="Layout preview modes">
        <button type="button" aria-pressed={mode==="passbook"} onClick={()=>setMode("passbook")}>Passbook Designer</button>
        <button type="button" aria-pressed={mode==="accountOpening"} onClick={()=>setMode("accountOpening")}>Account Opening Designer</button>
        <a href="/?normal-app=1">Normal BANK SETU App</a>
      </nav>
    </header>
    <CustomizeLayoutStudio key={mode} mode={mode} previewOnly bankName={sampleBank.passbookBank}
      bankValues={sampleBank} bankOptions={banks} accountRole="client_user"/>
    <footer className="codespaces-lab-footer">
      Development preview only · Source: Draft PR #100 · Code remains on draft branch ·
      To test actual Windows drivers, databases, authorization and PR2 use a separate Windows test installation.
    </footer>
  </div>;
}

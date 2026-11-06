import {useState} from "react";
import type {ChangeEvent} from "react";
export type SetupMethod="pdf"|"word"|"blank"|"continue";
export type SetupOutput="quick"|"dotmatrix";
export type LayoutSetup={bankName:string;method:SetupMethod;output:SetupOutput;file?:File};
type Props={currentBank:string;banks:readonly string[];accountOpening:boolean;onOpen:(selection:LayoutSetup)=>void};
const safeBank=(value:string)=>value.trim().length>0&&value.trim().length<=120&&!/[\u0000-\u001f]/.test(value);
export default function LayoutSetupWizard({currentBank,banks,accountOpening,onOpen}:Props){
  const [step,setStep]=useState<"bank"|"method"|"output">("bank");
  const [bank,setBank]=useState(currentBank||"");
  const [custom,setCustom]=useState(false);
  const [method,setMethod]=useState<SetupMethod>("blank");
  const [output,setOutput]=useState<SetupOutput>("quick");
  const [file,setFile]=useState<File|null>(null);
  const [error,setError]=useState("");
  const known=[...new Set([...banks,currentBank].map(item=>item.trim()).filter(Boolean))];
  const chooseFile=(event:ChangeEvent<HTMLInputElement>)=>{
    const chosen=event.target.files?.[0]||null;
    setFile(chosen);setError("");
  };
  const nextBank=()=>{
    if(!safeBank(bank)){setError("Please select a valid bank name (maximum 120 characters).");return;}
    setError("");setStep("method");
  };
  const launch=()=>{
    if(!safeBank(bank))return setError("Choose a bank first.");
    if(method==="pdf"&&(file?.name.toLowerCase().endsWith(".pdf")!==true||file.size>12*1024*1024))
      return setError("Choose a PDF sample up to 12 MB.");
    if(method==="word"&&(!file||!/\.docx?$/i.test(file.name)||file.size>8*1024*1024))
      return setError("Choose a Word DOC or DOCX document up to 8 MB.");
    setError("");onOpen({bankName:bank.trim(),method,output:accountOpening?"quick":output,file:file||undefined});
  };
  return <section className="ls-start-wizard" aria-label="Passbook layout setup">
    <header><p className="ls-eyebrow">BANK SETU · DOCUMENT DESIGNER</p><h2>Design your passbook in easy steps</h2><p>Choose a bank, start with a sample or blank page, then edit with Word-style tools.</p></header>
    <nav className="ls-wizard-progress" aria-label="Setup progress">
      <span aria-current={step==="bank"?"step":undefined}>1 · Bank</span>
      <span aria-current={step==="method"?"step":undefined}>2 · Method</span>
      <span aria-current={step==="output"?"step":undefined}>3 · Print type</span>
    </nav>
    {step==="bank"&&<div className="ls-wizard-page">
      <h3>Please Select Your Bank</h3>
      <label className="ls-wizard-field">Bank name
        {!custom?<select value={known.includes(bank)?bank:""} onChange={e=>{setBank(e.target.value);setError("");}}>
          <option value="">Select bank</option>{known.map(name=><option key={name} value={name}>{name}</option>)}
        </select>:<input value={bank} maxLength={120} onChange={e=>setBank(e.target.value)} placeholder="Enter your bank name"/>}
      </label>
      <button type="button" className="ls-wizard-link" onClick={()=>{setCustom(v=>!v);setBank(currentBank||"");setError("");}}>{custom?"← Choose from bank list":"+ Create Your Own Bank"}</button>
      {custom&&<p>Custom bank designs remain draft until that bank is configured and reviewed for your workspace.</p>}
      <div className="ls-wizard-actions"><button type="button" className="ls-primary" onClick={nextBank}>Next: Choose method →</button></div>
    </div>}
    {step==="method"&&<div className="ls-wizard-page">
      <h3>How would you like to start?</h3>
      <div className="ls-wizard-choices">
      {([["pdf","Upload PDF Sample","Auto-read PDF text/OCR and open editable layout"],["word","Upload Word DOC/DOCX","Import editable Word DOC/DOCX text and basic styles"],["blank","Create New Layout","Start with an empty measured page"]] as const).map(([id,label,desc])=>
        <button key={id} type="button" aria-pressed={method===id} onClick={()=>{setMethod(id);setFile(null);setError("");setStep("output");}}>
          <strong>{label}</strong><small>{desc}</small>
        </button>)}</div>
      <button type="button" className="ls-wizard-link" onClick={()=>{setMethod("continue");setStep("output");}}>Continue Editing a saved draft</button>
      <div className="ls-wizard-actions"><button type="button" onClick={()=>setStep("bank")}>← Back</button></div>
    </div>}
    {step==="output"&&<div className="ls-wizard-page">
      <h3>{accountOpening?"Account Opening Document":"Which output do you want to design?"}</h3>
      {!accountOpening&&<div className="ls-wizard-choices">
        <button type="button" aria-pressed={output==="quick"} onClick={()=>setOutput("quick")}><strong>Quick Passbook</strong><small>Graphics, logos, text and customer photo</small></button>
        <button type="button" aria-pressed={output==="dotmatrix"} onClick={()=>setOutput("dotmatrix")}><strong>Passbook Print (PR2)</strong><small>Text-only output, original printer bridge</small></button>
      </div>}
      {(method==="pdf"||method==="word")&&<label className="ls-wizard-field">Select {method==="pdf"?"PDF sample":"Word document"}
        <input type="file" accept={method==="pdf"?"application/pdf,.pdf":".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document"} onChange={chooseFile}/>
        <small>{file?file.name:"Only a local sample is read. No original file is published."}</small>
      </label>}
      {method==="continue"&&<p>Open the existing tenant-specific draft. If there is no saved draft, the editor will provide a new page.</p>}
      <div className="ls-wizard-actions">
        <button type="button" onClick={()=>setStep("method")}>← Back</button>
        <button type="button" className="ls-primary" onClick={launch}>Open Word-style Editor →</button>
      </div>
    </div>}
    {error&&<p className="ls-wizard-error" role="alert">{error}</p>}
    <footer>Draft only · Master review required · Existing printed bank templates are unchanged.</footer>
  </section>;
}

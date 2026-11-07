import {lazy,Suspense,useEffect,useRef,useState} from "react";
import {windowsPr2} from "./platform/pr2";
const CustomPr2PrinterDialog=lazy(()=>import("./CustomPr2PrinterDialog"));
import type {CSSProperties} from "react";
import {requireLicensedWrite} from "./core/licenseAccess";
import {printCurrentDocument} from "./platform/print";
import {boundLayoutValue,visibleLayoutElement,templateCanRender,type ApprovedLayout,type LayoutDynamicElement} from "./layoutRuntimeValues";
import {isLayoutLayerPrintable} from "./layoutOutputPolicy.ts";
import {windowsLayoutEngineAvailable} from "./platform/layoutEngineGate";
import {preflightLayoutOutput} from "./layoutOutputPreflight.ts";
import {compressedTextStyle} from "./layoutTypography.ts";
import "./WorkspaceTemplateDocument.css";

function frame(part:LayoutDynamicElement):CSSProperties {
  return {
    position:"absolute",left:part.x+"mm",top:part.y+"mm",width:part.width+"mm",height:part.height+"mm",
    fontFamily:part.font||"Arial",fontSize:part.size+"px",fontWeight:part.bold?700:400,
    fontStyle:part.italic?"italic":"normal",textDecoration:part.underline?"underline":"none",
    color:part.color||"#000000",background:part.background||"transparent",borderColor:part.borderColor,
    borderWidth:["rectangle","ellipse","photo"].includes(part.kind)?Math.max(.1,part.borderWidth)+"px":0,
    borderStyle:"solid",borderRadius:part.kind==="ellipse"?"50%":undefined,
    opacity:part.opacity,transform:"rotate("+part.rotation+"deg)",
    textAlign:part.align,whiteSpace:"pre-wrap",overflow:"hidden",overflowWrap:"anywhere",lineHeight:part.lineHeight??1.18,
    zIndex:part.z+1000,
  };
}
export default function WorkspaceTemplateDocument({template,bankName,customer,bankInfo,output,bankLogo,onPr2Complete}:{
  template:ApprovedLayout;bankName:string;customer:Record<string,unknown>;bankInfo:Record<string,unknown>;
  output:"quick"|"dotmatrix";bankLogo?:string;onPr2Complete?:()=>void;
}){
  const [printing,setPrinting]=useState(false),[message,setMessage]=useState("");
  const [directPrinting,setDirectPrinting]=useState(false);
  const [directPreparing,setDirectPreparing]=useState(false);
  const [directPdfBase64,setDirectPdfBase64]=useState("");
  const [temporaryValues,setTemporaryValues]=useState<Record<string,string>>({});
  // A customer/template switch unmounts this document; never open a stale
  // print dialog or PR2 payload after an async licence/PDF operation finishes.
  const live=useRef(true),printGate=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  if(!windowsLayoutEngineAvailable())
    return <p role="alert">Custom Layout printing is available only inside BANK SETU Windows EXE. Your normal bank print options remain available.</p>;
  if(!templateCanRender(template,bankName,template.mode))
    return <p role="alert">The activated bank layout is incompatible. Use the existing bank print flow.</p>;
  const pages=Math.min(10,Math.max(1,template.pageCount||1));
  const width=template.widthMm,height=template.heightMm;
  const checkPrintData=()=>{
    const report=preflightLayoutOutput(
      template.elements,template,output,bankName,item=>
        temporaryValues[item.id]??boundLayoutValue(
          item as LayoutDynamicElement,customer,bankInfo)
    );
    if(report.errors.length)throw Error(
      "Custom template print blocked: "+report.errors.slice(0,3).join(" · ")+
      (report.errors.length>3?" (+"+(report.errors.length-3)+" more)":"")
    );
    return report;
  };
  const print=async()=>{
    if(printGate.current||printing||directPreparing||directPrinting)return;
    printGate.current=true;setPrinting(true);setMessage("");
    try{
      await requireLicensedWrite();
      if(!live.current)return;
      const report=checkPrintData();
      if(report.warnings.length)setMessage("Tight text fit: "+report.warnings.join(" · ")+". Verify printer preview.");
      const outcome=await printCurrentDocument(false);
      if(!live.current)return;
      setMessage(outcome.accepted?"Print job accepted by system. Confirm physical alignment before treating the passbook as printed.":outcome.cancelled?"Print was cancelled.":"Print dialog opened; verify its result.");
    }catch(error){if(live.current)setMessage(error instanceof Error?error.message:"Printer preview unavailable.");}
    finally{printGate.current=false;if(live.current)setPrinting(false);}
  };
  const startCustomPr2=async()=>{
    if(!windowsPr2()||output!=="dotmatrix"||template.mode!=="passbook"||
       (template.pageCount??1)!==1||directPreparing||directPrinting||printing||printGate.current)return;
    printGate.current=true;
    setDirectPreparing(true);setMessage("");
    try{
      await requireLicensedWrite();
      if(!live.current)return;
      checkPrintData();
      const relevant=template.elements.filter(item=>isLayoutLayerPrintable(item,"dotmatrix",bankName));
      if(!relevant.length)throw Error("No verified text/value layers are configured for the selected bank.");
      const checked=relevant.map(item=>{
        const dynamic=["customer","bank","dotmatrix"].includes(item.origin);
        const value=dynamic?(temporaryValues[item.id]??boundLayoutValue(item,customer,bankInfo)):item.label;
        if(!value?.trim())throw Error("Missing required customer/bank value: "+item.fieldKey+". Correct the customer record or this-print value.");
        if(dynamic && value===item.defaultValue &&
           !["accountType","mode","operatingMode"].includes(item.fieldKey))
          throw Error("Unverified placeholder/default for "+item.fieldKey+"; select actual customer/bank information first.");
        if(/[^\u0009\u000A\u000D\u0020-\u007E]/.test(value))
          throw Error("PR2 draft PDF cannot safely render this non-ASCII text without an embedded Unicode font: "+(item.fieldKey||item.label)+". Use verified bank-specific printer output instead.");
        return {...item,kind:item.kind as "text"|"field",value,defaultValue:""};
      });
      const {exportLayoutProofPdf}=await import("./layoutProofPdf");
      const document=await exportLayoutProofPdf({
        bankName,widthMm:template.widthMm,heightMm:template.heightMm,pageCount:1,
        elements:checked
      },"dotmatrix");
      const bytes=new Uint8Array(await document.arrayBuffer());
      if(!live.current)return;
      let binary="";
      for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      setDirectPdfBase64(btoa(binary));
      setDirectPrinting(true);
    }catch(error){
      if(live.current){
        setDirectPdfBase64("");
        setMessage("Custom direct PR2 blocked: "+(error instanceof Error?error.message:"Invalid document"));
      }
    }finally{printGate.current=false;if(live.current)setDirectPreparing(false);}
  };
  return <section className="workspace-template-document" aria-label="Activated bank passbook layout">
    <style>{`@media print {
      @page { size: ${width}mm ${height}mm; margin:0; }
      body * {visibility:hidden!important;}
      .workspace-template-document .workspace-template-pages,.workspace-template-document .workspace-template-pages * {visibility:visible!important;}
      .workspace-template-document .workspace-template-pages {position:fixed!important;left:0!important;top:0!important;padding:0!important;margin:0!important;box-shadow:none!important;}
      .workspace-template-document .workspace-template-page {width:${width}mm!important;height:${height}mm!important;margin:0!important;page-break-after:always;break-after:page;box-shadow:none!important;overflow:hidden!important;background:white!important;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
      .workspace-template-document .workspace-template-page:last-child {page-break-after:auto;break-after:auto}
      .workspace-template-document .workspace-template-controls {display:none!important}
    }`}</style>
    {directPrinting&&<Suspense fallback={<p>Connecting existing PR2 Bridge…</p>}><CustomPr2PrinterDialog
      bankName={bankName} layoutId={template.id} customPdfBase64={directPdfBase64} requirePhysicalConfirmation
      onClose={()=>{setDirectPrinting(false);setDirectPdfBase64("");}}
      onComplete={(result)=>{if(result.completed){setDirectPrinting(false);setDirectPdfBase64("");onPr2Complete?.();}}} /></Suspense>}
    <div className="passbook-page workspace-bridge-page"><div className="passbook-shell workspace-bridge-shell">
    <div className="workspace-template-pages">
      {Array.from({length:pages},(_,index)=>index+1).map(page=><div key={page} className="workspace-template-page" style={{width:width+"mm",height:height+"mm"}}>
        {template.elements.filter(item=>(item.page||1)===page&&visibleLayoutElement(item,output,bankName))
          .sort((a,b)=>a.z-b.z).map(item=>{
            const kind=item.kind;
            if(kind==="image" && output==="quick"){
              if(item.fieldKey!=="bankLogo" && !/\blogo\b/i.test(item.label))return null;
              if(!bankLogo||!/^data:image\/(png|jpeg|webp);base64,/.test(bankLogo))return null;
              return <img key={item.id} alt="Bank logo" src={bankLogo} style={{...frame(item),objectFit:"contain"}}/>;
            }
            if(kind==="photo"){
              if(output!=="quick")return null;
              const photo=customer.photoUrl||customer.photo||customer.photoData;
              const src=typeof photo==="string"&&(/^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/).test(photo)?photo:"";
              return src?<img key={item.id} src={src} alt="Customer photograph" style={{...frame(item),objectFit:"cover"}}/>:
                <div key={item.id} style={frame(item)} aria-label="Customer photo placeholder">PHOTO</div>;
            }
            if(kind==="rectangle"||kind==="ellipse")return <div key={item.id} style={frame(item)} aria-hidden="true"/>;
            if(kind==="line")return <div key={item.id} aria-hidden="true" style={{...frame(item),height:Math.max(.2,item.borderWidth)+"px",width:item.width+"mm",background:item.borderColor||item.color,transform:"rotate("+item.rotation+"deg)"}}/>;
            const text=temporaryValues[item.id]??boundLayoutValue(item,customer,bankInfo);
            return <span key={item.id} style={{...frame(item),color:output==="dotmatrix"?"#000":item.color,background:output==="dotmatrix"?"transparent":item.background}}>
              <span style={compressedTextStyle(item)}>{text}</span>
            </span>;
          })}
      </div>)}
    </div></div></div>
    <div className="workspace-template-controls">
      <p><strong>Print & Temporary Edit</strong> · {bankName} · {output==="quick"?"Quick Passbook":"PR2 Direct Passbook"}</p>
      <p>Preview uses this client's customer and Bank Information fields. Confirm the paper and printer settings before printing.</p>
      <button type="button" onClick={()=>{void print();}} disabled={printing||directPreparing||directPrinting}>{printing?"Opening Printer…":"Print Verified Layout"}</button>
      {output==="dotmatrix" && windowsPr2() && <button type="button" disabled={printing||directPrinting||directPreparing}
          onClick={()=>{void startCustomPr2();}}>{directPreparing?"Preparing custom data-only raster…":"Olivetti Mode Print — Custom Layout"}</button>}
      <details className="workspace-template-temporary"><summary>Temporary Edit — this print only</summary>
        <p>These changes affect the active preview and print job only. The Master Template and customer data are never modified.</p>
        <div className="workspace-template-temporary-grid">
          {template.elements.filter(item=>["customer","bank","dotmatrix"].includes(item.origin)).map(item=><label key={item.id}>
            <span>{item.label} · {item.fieldKey||"Unmapped"}</span>
            <input value={temporaryValues[item.id]??boundLayoutValue(item,customer,bankInfo)} maxLength={500}
              onChange={event=>setTemporaryValues(current=>({...current,[item.id]:event.target.value}))}/>
          </label>)}
        </div>
        <button type="button" onClick={()=>setTemporaryValues({})}>Reset Temporary Edits</button>
      </details>
      {message&&<p role="status">{message}</p>}
    </div>
  </section>;
}

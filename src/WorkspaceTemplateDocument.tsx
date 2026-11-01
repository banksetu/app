import {useState} from "react";
import type {CSSProperties} from "react";
import {requireLicensedWrite} from "./core/licenseAccess";
import {printCurrentDocument} from "./platform/print";
import {boundLayoutValue,visibleLayoutElement,templateCanRender,type ApprovedLayout,type LayoutDynamicElement} from "./layoutRuntimeValues";
import "./WorkspaceTemplateDocument.css";

function frame(part:LayoutDynamicElement):CSSProperties {
  return {
    position:"absolute",left:part.x+"mm",top:part.y+"mm",width:part.width+"mm",height:part.height+"mm",
    fontFamily:part.font||"Arial",fontSize:part.size+"px",fontWeight:part.bold?700:400,
    fontStyle:part.italic?"italic":"normal",textDecoration:part.underline?"underline":"none",
    color:part.color||"#000000",background:part.background||"transparent",borderColor:part.borderColor,
    borderWidth:["rectangle","ellipse","photo"].includes(part.kind)?Math.max(.1,part.borderWidth)+"px":0,
    borderStyle:"solid",borderRadius:part.kind==="ellipse"?"50%":undefined,
    letterSpacing:part.letterSpacing+"px",opacity:part.opacity,transform:"rotate("+part.rotation+"deg)",
    textAlign:part.align,whiteSpace:"pre-wrap",overflow:"hidden",overflowWrap:"anywhere",lineHeight:1.18,
    zIndex:part.z+1000,
  };
}
export default function WorkspaceTemplateDocument({template,bankName,customer,bankInfo,output,bankLogo}:{
  template:ApprovedLayout;bankName:string;customer:Record<string,unknown>;bankInfo:Record<string,unknown>;
  output:"quick"|"dotmatrix";bankLogo?:string;
}){
  const [printing,setPrinting]=useState(false),[message,setMessage]=useState("");
  if(!templateCanRender(template,bankName,template.mode))
    return <p role="alert">The activated bank layout is incompatible. Use the existing bank print flow.</p>;
  const pages=Math.min(10,Math.max(1,template.pageCount||1));
  const width=template.widthMm,height=template.heightMm;
  const print=async()=>{
    if(printing)return;setPrinting(true);setMessage("");
    try{
      await requireLicensedWrite();
      const outcome=await printCurrentDocument(false);
      setMessage(outcome.accepted?"Print job accepted by system. Confirm physical alignment before treating the passbook as printed.":outcome.cancelled?"Print was cancelled.":"Print dialog opened; verify its result.");
    }catch(error){setMessage(error instanceof Error?error.message:"Printer preview unavailable.");}
    finally{setPrinting(false);}
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
    <div className="workspace-template-controls">
      <p><strong>Approved Custom Template</strong> · {bankName} · {output==="quick"?"Quick Passbook":"Dot Matrix Data Only"}</p>
      <p>Preview uses this client's customer and Bank Information fields. Confirm the paper and printer settings before printing.</p>
      <button type="button" onClick={()=>{void print();}} disabled={printing}>{printing?"Opening Printer…":"Print Verified Layout"}</button>
      {message&&<p role="status">{message}</p>}
    </div>
    <div className="workspace-template-pages">
      {Array.from({length:pages},(_,index)=>index+1).map(page=><div key={page} className="workspace-template-page" style={{width:width+"mm",height:height+"mm"}}>
        {template.elements.filter(item=>(item.page||1)===page&&visibleLayoutElement(item,output))
          .sort((a,b)=>a.z-b.z).map(item=>{
            const kind=item.kind;
            if(kind==="image" && output==="quick"){
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
            const text=boundLayoutValue(item,customer,bankInfo);
            return <span key={item.id} style={{...frame(item),color:output==="dotmatrix"?"#000":item.color,background:output==="dotmatrix"?"transparent":item.background}}>{text}</span>;
          })}
      </div>)}
    </div>
  </section>;
}

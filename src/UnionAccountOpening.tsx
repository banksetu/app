import { useState } from "react";
import { UNION_AOF_BOXES, unionAofOverflow, unionAofValues } from "./unionAofLayout";

export default function UnionAccountOpening({ customer }: { customer: Record<string, unknown> }) {
  const [edits, setEdits] = useState<Record<string,string>>({});
  const [addressChecked, setAddressChecked] = useState(false);
  const values = {...unionAofValues(customer), ...edits};
  const overflow = unionAofOverflow(values);
  const photo = String(customer.photoPreview || customer.photoUrl || "");
  const dob = String(customer.dateOfBirth || customer.dob || "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob.slice(8)+dob.slice(5,7)+dob.slice(0,4) : /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(dob) ? dob.replace(/\D/g,"") : "";
  const gender = String(customer.gender || "").toLowerCase();
  const fields = [...new Map(UNION_AOF_BOXES.map(box=>[box.key,box])).values()];
  return <section className="union-aof-wrap">
    <div className="union-aof-controls">
      <p><b>Union Bank AOF-5 · Print preview</b> · नाम के हर अक्षर को अलग बॉक्स में रखा गया है। खाली जानकारी खाली रहेगी।</p>
      <p>पूरा पता: {String(customer.fullAddress || customer.address || "उपलब्ध नहीं")}</p>
      <details open><summary>नाम और पता जाँचें / इस प्रिंट के लिए सुधारें</summary>
        <p>House, Street, Village/City, Block, District और State के सही हिस्से भरें। पूरे पते से इन हिस्सों का अनुमान नहीं लगाया गया है।</p>
        <div className="union-aof-fields">{fields.map(box=><label key={box.key}>{box.label}<input value={values[box.key] || ""} onChange={event=>{setEdits(current=>({...current,[box.key]:event.target.value}));setAddressChecked(false);}} /></label>)}</div>
      </details>
      {!!overflow.length && <p role="alert">इन फ़ील्ड में बॉक्स से अधिक अक्षर हैं; प्रिंट से पहले सुधारें: {[...new Set(overflow.map(box=>box.label))].join(", ")}</p>}
      <label><input type="checkbox" checked={addressChecked} onChange={event=>setAddressChecked(event.target.checked)} /> मैंने नाम, पता और बाकी विवरण जाँच लिए हैं।</label>
      <button disabled={!!overflow.length || !addressChecked} onClick={()=>window.print()}>Print / Save PDF</button>
    </div>
    <div className="union-aof-pages">{[1,2].map(page=><section className="union-aof-page" key={page} aria-label={`Union account opening page ${page}`}>
      <img className="union-aof-background" src={`/union-aof/page-${page}.png`} alt="Union Bank blank account opening form" />
      {UNION_AOF_BOXES.filter(box=>box.page===page).map((box,index)=>{
        const value=(values[box.key] || "").toUpperCase();
        return <div key={`${box.key}-${index}`} className={box.text?"union-aof-text":"union-aof-boxes"} style={{left:`${box.x/1132*100}%`,top:`${box.y/1600*100}%`,width:`${(box.width || box.cells*24.8)/1132*100}%`,gridTemplateColumns:`repeat(${box.cells},1fr)`}}>
          {box.text ? value : Array.from(value).map((character,i)=><span key={i}>{character}</span>)}
        </div>;
      })}
      {page===1 && <>
        {Array.from(date).map((digit,index)=><span key={index} className="union-aof-digit" style={{left:`${([59,84,128,153,193,218,243,268][index])/1132*100}%`,top:`${452/1600*100}%`}}>{digit}</span>)}
        {['male','m','female','f'].includes(gender) && <span className="union-aof-digit" style={{left:`${(['male','m'].includes(gender)?309:344)/1132*100}%`,top:`${452/1600*100}%`}}>✓</span>}
        {photo && <img className="union-aof-photo" src={photo} alt="Customer" />}
      </>}
    </section>)}</div>
    <style>{`
      .union-aof-controls{margin:18px 0;padding:16px;background:white;border-radius:12px;color:#24344c}
      .union-aof-controls p{line-height:1.5}.union-aof-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:12px 0}
      .union-aof-fields label{display:grid;gap:4px;font-size:12px}.union-aof-fields input{min-width:0;padding:8px;color:#172b45;background:#fff;border:1px solid #b6c3d5;border-radius:6px}
      .union-aof-controls button{padding:10px 16px;margin:12px;background:#2861d3;color:white;border:0;border-radius:8px}.union-aof-controls button:disabled{opacity:.45}
      .union-aof-pages{overflow-x:auto}.union-aof-page{position:relative;width:210mm;height:297mm;margin:0 auto 16px;background:white;color:#111;font:9pt Arial,sans-serif;box-sizing:border-box}
      .union-aof-background{position:absolute;inset:0;width:100%;height:100%}.union-aof-boxes,.union-aof-text{position:absolute;height:4.4mm;line-height:4.4mm;color:#111}
      .union-aof-boxes{display:grid;overflow:visible}.union-aof-boxes span{text-align:center;white-space:pre}.union-aof-text{font-size:8pt;white-space:nowrap}
      .union-aof-digit{position:absolute;width:4.6mm;height:4.4mm;line-height:4.4mm;text-align:center;background:white;color:#111}
      .union-aof-photo{position:absolute;left:74.91%;top:73.0625%;width:14.58%;height:11.625%;object-fit:contain;background:white}
      @page{size:A4 portrait;margin:0}
      @media print{
        html,body{margin:0!important;padding:0!important}body *{visibility:hidden!important}
        .custom-bank-document > :not(.union-aof-wrap),.union-aof-controls{display:none!important}
        .custom-bank-document,.union-aof-wrap{position:static!important;margin:0!important;padding:0!important;border:0!important}
        .union-aof-pages{position:absolute!important;left:0;top:0;overflow:visible!important}
        .union-aof-page,.union-aof-page *{visibility:visible!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}
        .union-aof-page{margin:0!important;break-after:page}.union-aof-page:last-child{break-after:auto}
      }
    `}</style>
  </section>;
}

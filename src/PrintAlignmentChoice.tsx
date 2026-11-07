import ModalPortal from "./ModalPortal";
import type { PrintOffset } from "./printAlignmentStorage";

const mm=(value:number)=>`${value>0?"+":""}${value} mm`;

export default function PrintAlignmentChoice({bankName,mode,saved,onClose,onAdjust,onSkip}:{
  bankName:string;
  mode:"system"|"pr2";
  saved:PrintOffset;
  onClose:()=>void;
  onAdjust:()=>void;
  onSkip:()=>void;
}) {
  return <ModalPortal><div className="print-alignment-choice-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="print-alignment-choice" role="dialog" aria-modal="true" aria-label={`Choose print alignment for ${bankName}`}>
      <h2>Print Alignment</h2>
      <p>क्या इस print के लिए alignment बदलना है?</p>
      <div className="print-alignment-choice-saved"><strong>Saved alignment · {bankName}</strong><span>Left / Right: {mm(saved.x)} · Up / Down: {mm(saved.y)}</span></div>
      <p className="print-alignment-choice-note">No चुनने पर saved alignment के साथ सीधे {mode==="pr2"?"Olivetti / PR2 print":"printer preview"} खुलेगा। Saved setting नहीं होने पर 0 mm default लागू होगा।</p>
      <div className="print-alignment-choice-actions">
        <button type="button" className="skip" onClick={onSkip}>No · Open Print Preview</button>
        <button type="button" className="adjust" onClick={onAdjust}>Yes · Adjust Alignment</button>
        <button type="button" className="cancel" onClick={onClose}>Cancel</button>
      </div>
    </section>
    <style>{`
      .print-alignment-choice-overlay{position:fixed;inset:0;z-index:2147482100;background:#17203399;display:grid;place-items:center;padding:16px;font-family:Arial,sans-serif}
      .print-alignment-choice{width:min(520px,100%);background:#fff;color:#172338;border-radius:16px;padding:24px;box-shadow:0 24px 70px #0007}
      .print-alignment-choice h2{margin:0 0 10px;font-size:25px}.print-alignment-choice p{line-height:1.5}
      .print-alignment-choice-saved{display:grid;gap:7px;background:#f4f7fb;border:1px solid #d5deea;border-radius:10px;padding:13px;margin:15px 0}.print-alignment-choice-saved span{font-size:14px}
      .print-alignment-choice-note{font-size:14px;color:#4b5e73}.print-alignment-choice-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
      .print-alignment-choice-actions button{border:0;border-radius:9px;min-height:52px;padding:10px;font:700 14px Arial;cursor:pointer}.print-alignment-choice-actions .skip{background:#0b69c7;color:#fff}.print-alignment-choice-actions .adjust{background:#d71848;color:#fff}.print-alignment-choice-actions .cancel{grid-column:1/-1;background:#edf1f5;color:#26384b}
      @media(max-width:520px){.print-alignment-choice{padding:18px}.print-alignment-choice-actions{grid-template-columns:1fr}.print-alignment-choice-actions .cancel{grid-column:auto}}
      @media print{.print-alignment-choice-overlay{display:none!important}}
    `}</style>
  </div></ModalPortal>;
}

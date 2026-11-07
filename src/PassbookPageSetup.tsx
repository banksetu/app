import {useState,type CSSProperties} from "react";
import {PAPER_PRESETS,pageMeasurements,pageSetupFor,type MeasuredPage,type PageSetup} from "./layoutPageSetup.ts";
type Unit="mm"|"cm"|"in";
type Props={
  page:MeasuredPage;unit:Unit;onUnit:(unit:Unit)=>void;
  onMeasurement:(key:"widthMm"|"heightMm"|"foldMm"|"printStartMm",value:number)=>void;
  onPageSetup:(next:PageSetup)=>void;onPreset:(id:string)=>void;
  onOrientation:(value:"portrait"|"landscape")=>void;
};
const unitFactor=(u:Unit)=>u==="mm"?1:u==="cm"?10:25.4;
const toUnit=(mm:number,u:Unit)=>Number((mm/unitFactor(u)).toFixed(u==="mm"?2:3));
export default function PassbookPageSetup({
  page,unit,onUnit,onMeasurement,onPageSetup,onPreset,onOrientation
}:Props){
  const [foldedView,setFoldedView]=useState(false);
  const [editingMetric,setEditingMetric]=useState<{title:string;value:string}|null>(null);
  const cfg=pageSetupFor(page),measure=pageMeasurements(page);
  const showFolded=foldedView&&cfg.foldAxis!=="none";
  const p=Math.max(0.00001,page.widthMm),h=Math.max(.00001,page.heightMm);
  const axis=cfg.foldAxis;
  // Keep the raw text while focused: users can select all, Backspace and type
  // decimals without the controlled numeric input restoring the old value.
  const mmNumber=(title:string,value:number,update:(n:number)=>void,min=0,max=500)=>{
    const editing=editingMetric?.title===title;
    const commit=(raw:string)=>{
      setEditingMetric(null);
      if(!raw.trim())return;
      const n=Number(raw)*unitFactor(unit);
      if(Number.isFinite(n)&&n>=min&&n<=max)update(Math.round(n*1000)/1000);
    };
    return <label className="ls-page-metric" key={title}><span>{title} ({unit})</span>
      <input type="text" inputMode="decimal" aria-label={title}
        title={`Enter a value between ${toUnit(min,unit)} and ${toUnit(max,unit)} ${unit}`}
        value={editing?editingMetric.value:String(toUnit(value,unit))}
        onFocus={()=>setEditingMetric({title,value:String(toUnit(value,unit))})}
        onChange={event=>setEditingMetric({title,value:event.target.value})}
        onBlur={event=>commit(event.target.value)}
        onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();if(event.key==="Escape"){setEditingMetric(null);event.currentTarget.blur();}}}/>
    </label>;
  };
  const foldMax=axis==="vertical"?page.widthMm:page.heightMm;
  const viewedWidth=showFolded&&axis==="vertical"?
    Math.max(page.foldMm,page.widthMm-page.foldMm):page.widthMm;
  const viewedHeight=showFolded&&axis==="horizontal"?
    Math.max(page.foldMm,page.heightMm-page.foldMm):page.heightMm;
  const pageWidth=Math.min(330,Math.max(130,viewedWidth*.95));
  const pageHeight=pageWidth*viewedHeight/viewedWidth;
  const foldStyle:CSSProperties=axis==="vertical"?
    {left:(page.foldMm/p*100)+"%",top:0,bottom:0,borderLeft:"2px dashed #e19933"}:
    {top:(page.foldMm/h*100)+"%",left:0,right:0,borderTop:"2px dashed #e19933"};
  const startStyle:CSSProperties=axis==="vertical"?
    {left:(page.printStartMm/p*100)+"%",top:0,bottom:0,borderLeft:"2px dashed #0cae91"}:
    {top:(page.printStartMm/h*100)+"%",left:0,right:0,borderTop:"2px dashed #0cae91"};
  return <section className="ls-page-setup" aria-label="Passbook book fold and physical page settings">
    <div className="ls-page-setup-heading">
      <div><strong>Page Setup — Full Open Passbook</strong>
        <p>Enter the measured open book size, the centre crease, margins and the first data baseline.</p></div>
      <label>Unit <select value={unit} onChange={e=>onUnit(e.target.value as Unit)}>
        <option value="mm">mm</option><option value="cm">cm</option><option value="in">inches</option>
      </select></label>
    </div>
    <div className="ls-page-setup-columns">
      <div className="ls-page-settings-controls">
        <div className="ls-page-settings-group">
          <strong>1. Paper / Passbook Size</strong>
          <label>Preset (optional)
            <select aria-label="Paper presets" value="" onChange={e=>{if(e.target.value)onPreset(e.target.value)}}>
              <option value="">Custom — measured size</option>
              {PAPER_PRESETS.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>Orientation <select aria-label="Page orientation"
            value={page.widthMm>page.heightMm?"landscape":"portrait"}
            onChange={e=>onOrientation(e.target.value as "portrait"|"landscape")}>
            <option value="portrait">Portrait (tall)</option>
            <option value="landscape">Landscape (wide)</option>
          </select></label>
          <div className="ls-page-measure-grid">
            {mmNumber("Full open width",page.widthMm,v=>onMeasurement("widthMm",v),50,500)}
            {mmNumber("Full open height",page.heightMm,v=>onMeasurement("heightMm",v),50,500)}
          </div>
          <div className="ls-fold-direction-chooser" role="group" aria-label="Fold direction">
            <strong>Book Fold Direction</strong>
            <div className="ls-fold-direction-options">
              {([
                ["horizontal","Horizontal Fold","Top + Bottom halves"],
                ["vertical","Vertical Fold","Left + Right halves"],
                ["none","No Fold","Flat page / A4"]
              ] as const).map(([value,title,subtitle])=>
                <button key={value} type="button" className="ls-fold-direction-choice"
                  aria-pressed={axis===value}
                  title={"Choose "+title+". Existing text positions remain unchanged."}
                  onClick={()=>onPageSetup({...cfg,foldAxis:value})}>
                  <span className={"ls-fold-direction-icon ls-fold-direction-icon-"+value} aria-hidden="true">
                    <span className="ls-fold-direction-line"/>
                  </span>
                  <span className="ls-fold-direction-label"><strong>{title}</strong><small>{subtitle}</small></span>
                </button>)}
            </div>
            <small>Fold direction is separate from Portrait / Landscape. The blue size values are for the FULL OPEN book.</small>
          </div>
        </div>
        <div className="ls-page-settings-group">
          <strong>2. Fold Line Position</strong>
          <small>Fold line moves along the <strong>{axis==="horizontal"?"height (from top)":axis==="vertical"?"width (from left)":"flat page"}</strong>. Change fold direction above next to Book Size.</small>
          {axis!=="none"&&<>
            {mmNumber(axis==="horizontal"?"Fold from top":"Fold from left",page.foldMm,
              v=>onMeasurement("foldMm",v),0,foldMax)}
            <button type="button" onClick={()=>onMeasurement("foldMm",foldMax/2)}>
              Fold exactly in half
            </button>
          </>}
        </div>
        <div className="ls-page-settings-group">
          <strong>3. Print Start / Fold Distance</strong>
          {mmNumber(axis==="vertical"?"Data start from left":"Data start from top",
            page.printStartMm,v=>onMeasurement("printStartMm",v),0,foldMax)}
          {axis!=="none"&&mmNumber("Gap after fold",Math.max(0,measure.printStartFromFoldMm),
            v=>onMeasurement("printStartMm",page.foldMm+v),0,Math.max(0,foldMax-page.foldMm))}
          <small>The dotted green line is the start guide. Existing text stays at its exact X/Y coordinates.</small>
        </div>
        <div className="ls-page-settings-group">
          <strong>4. Margins / Printable Content</strong>
          <div className="ls-page-measure-grid">
            {([["marginLeftMm","Left"],["marginRightMm","Right"],
              ["marginTopMm","Top"],["marginBottomMm","Bottom"]] as const).map(([key,title])=>
                mmNumber(title+" margin",cfg[key],v=>onPageSetup({...cfg,[key]:v}),0,120))}
          </div>
        </div>
      </div>
      <div className="ls-page-fold-visual">
        <strong>Live Passbook Size Guide</strong>
        <p>Full open size: {page.widthMm} mm × {page.heightMm} mm ·
          {axis==="none"?" Flat":axis==="horizontal"?" Top + Bottom":" Left + Right"}</p>
        <div className="ls-page-view-toggle" role="group" aria-label="Open or folded passbook view">
          <button type="button" aria-pressed={!showFolded} onClick={()=>setFoldedView(false)}>Open Book</button>
          <button type="button" aria-pressed={showFolded} disabled={axis==="none"}
            onClick={()=>setFoldedView(true)}>Folded Book</button>
        </div>
        <div className="ls-page-preview-scroll">
          <div className={"ls-open-passbook"+(showFolded?" ls-closed-passbook":"")} role="img"
            aria-label={"Passbook fold at "+page.foldMm+" mm, data start "+page.printStartMm+" mm, full open size "+page.widthMm+" by "+page.heightMm+" millimetres"}
            style={{width:pageWidth,height:pageHeight}}>
            {!showFolded&&axis!=="none"&&<div className="ls-open-passbook-fold" style={foldStyle}><span>FOLD · {page.foldMm} mm</span></div>}
            {!showFolded&&page.printStartMm>0&&<div className="ls-open-passbook-start" style={startStyle}><span>DATA START · {page.printStartMm} mm</span></div>}
            {!showFolded&&<div className="ls-open-passbook-margins" style={{
              top:(cfg.marginTopMm/h*100)+"%",bottom:(cfg.marginBottomMm/h*100)+"%",
              left:(cfg.marginLeftMm/p*100)+"%",right:(cfg.marginRightMm/p*100)+"%"
            }}/>} 
            {!showFolded&&axis==="horizontal"&&<div className="ls-fold-panel-title" style={{top:"15%"}}>Upper / Cover Half</div>}
            {!showFolded&&axis==="horizontal"&&<div className="ls-fold-panel-title" style={{bottom:"11%"}}>Lower / Print Half</div>}
            {!showFolded&&axis==="vertical"&&<div className="ls-fold-panel-title" style={{top:"12%",left:"8%"}}>Left Half</div>}
            {!showFolded&&axis==="vertical"&&<div className="ls-fold-panel-title" style={{bottom:"11%",right:"8%"}}>Right Half</div>}
            {showFolded&&<div className="ls-book-closed-label">Folded Passbook
              <small>{viewedWidth.toFixed(1)} × {viewedHeight.toFixed(1)} mm</small>
            </div>}
          </div>
        </div>
        <div className="ls-page-zone-stats">
          <span>Fold half: {measure.firstHalfMm.toFixed(1)} + {measure.secondHalfMm.toFixed(1)} mm</span>
          <span>Data offset after fold: {measure.printStartFromFoldMm.toFixed(1)} mm</span>
          <span>Usable region: {measure.contentWidthMm.toFixed(1)} × {measure.contentHeightMm.toFixed(1)} mm</span>
        </div>
        {axis!=="none"&&<p role="note">The orange dotted line is the chosen {axis==="horizontal"?"horizontal (top-to-bottom)":"vertical (left-to-right)"} fold. The green line marks data start. Changing fold direction does not move saved text; verify the fold and PR2 X/Y coordinates on real paper before printing.</p>}
      </div>
    </div>
  </section>;
}

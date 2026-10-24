import { APPROVED_LABELS } from './approvedPassbookArtwork';
import { APPROVED_INFO_SLOTS, approvedPassbookValues, type ApprovedPassbookValues } from './ApprovedPassbookInfo';
import { WORD_GLYPHS, WORD_FONT_SIZE_PT, WORD_HORIZONTAL_SCALE, WORD_FONT_UNITS, WORD_ADVANCE_PT, WORD_INK_BOUNDS } from './wordPassbookGlyphs';

// Word typography with owner-approved colon/value alignment corrections.
// Row baselines, source/Quick artwork and the physical SVG remain unchanged.
const labels: {text:string;x:number;y:number;compression?:number}[] = [];
for (const c of APPROVED_LABELS) {
  const previous = labels.at(-1);
  const oldIndex = APPROVED_LABELS.indexOf(c);
  const oldPrevious = APPROVED_LABELS[oldIndex-1];
  if (!previous || c.y !== previous.y || c.char === ':' || previous.text === ':' ||
      (oldPrevious && c.x-oldPrevious.x > 20)) {
    labels.push({text:c.char,x:c.x,y:c.y});
  } else {
    // Recover only word spaces; discard old per-character advances/scales.
    if (oldPrevious && c.x-oldPrevious.x > 8) previous.text += ' ';
    previous.text += c.char;
  }
}
// Review correction: 1 mm label gap. Gaps are measured between ink
// edges, not the surrounding monospaced character cells. No paper/Y changes.
const unit = WORD_FONT_SIZE_PT / WORD_FONT_UNITS;
// 1.5 CSS pixels at 96 DPI, expressed in SVG point coordinates.
const WORD_LETTER_GAP_PT = 1.125;
// One CSS pixel at 96 DPI. The PLQ-20 proof needs this smaller gap so adjacent
// 70%-width glyphs stay distinct without restoring the normal 1.5 px tracking.
const PR2_MASTER_LETTER_GAP_PT = 0.75;
// Final physical proof: reduce only the isolated PR2 width by one percentage
// point. The approved normal application artwork remains at 70%.
const PR2_HORIZONTAL_SCALE = 0.69;
// Physical proof C established the face size. Keep it fixed and calibrate only
// the measured ink-edge-to-colon gap; the colon-to-data gap stays exactly 3 mm.
const PR2_MASTER_FONT_SIZE_PT = 9.25;
const PR2_LABEL_GAPS_PT = Object.freeze({A:0.75*72/25.4,B:1*72/25.4,C:1.25*72/25.4});
const wordAdvance = WORD_ADVANCE_PT + WORD_LETTER_GAP_PT;
const leftInk=(value:string)=> (WORD_INK_BOUNDS[value[0]]?.[0] ?? 0)*unit*WORD_HORIZONTAL_SCALE;
const rightInk=(value:string)=> (value.length-1)*wordAdvance+(WORD_INK_BOUNDS[value.at(-1)||'']?.[1] ?? 0)*unit*WORD_HORIZONTAL_SCALE;
export const WORD_LABEL_GAP_PT = 72/25.4;
export const WORD_DATA_GAP_PT = 3*72/25.4;
const colonLeft=leftInk(':');
const colonRight=rightInk(':');
const branch=labels.find(label=>label.text==='BRANCH NAME')!;
const holder=labels.find(label=>label.text==='ACC. HOLDER')!;
const ifsc=labels.find(label=>label.text==='IFSC CODE')!;
export const WORD_LEFT_COLON_X=branch.x+rightInk(branch.text)+WORD_LABEL_GAP_PT-colonLeft;
export const WORD_HOLDER_COLON_X=holder.x+rightInk('JOINT HOLDER')+WORD_LABEL_GAP_PT-colonLeft;
export const WORD_CODE_COLON_X=ifsc.x+rightInk(ifsc.text)+WORD_LABEL_GAP_PT-colonLeft;
for (const label of labels) {
  if (label.text==='JOINT HOLDER') {
    label.x=holder.x;
  }
  if (label.text==='MICR CODE') label.x=ifsc.x;
  if (label.text===':') {
    if(label.x<70) label.x=WORD_LEFT_COLON_X;
    else if(label.y===APPROVED_INFO_SLOTS.holder.y || label.y===APPROVED_INFO_SLOTS.jointHolder.y) label.x=WORD_HOLDER_COLON_X;
    else if(label.y===APPROVED_INFO_SLOTS.ifsc.y || label.y===APPROVED_INFO_SLOTS.micr.y) label.x=WORD_CODE_COLON_X;
  }
}
const branchDataX=WORD_LEFT_COLON_X+colonRight+WORD_DATA_GAP_PT;
const addressShift=branchDataX-labels.find(label=>label.text==='PO')!.x;
const districtShift=branchDataX-labels.find(label=>label.text==='DIST')!.x;
for(const label of labels) {
  if(label.y===APPROVED_INFO_SLOTS.postOffice.y && label.x>70) label.x+=addressShift;
  if(label.y===APPROVED_INFO_SLOTS.district.y) label.x+=districtShift;
}
export const WORD_LABELS = labels;
const leftFields=['branchName','branchEmail','customerId','accountNo','pan','mobile','openedOn','issueDate','operatedBy','nominee'];
export function wordValueX(key:string,value:string,quick=false) {
  if(quick && key==='branchCode')return 134*72/25.4;
  if(/^address[1-4]$/.test(key))return WORD_HOLDER_COLON_X+colonLeft-leftInk(value);
  if(key==='postOffice')return APPROVED_INFO_SLOTS[key].x+addressShift;
  if(key==='district')return APPROVED_INFO_SLOTS[key].x+districtShift;
  if(key==='branchPin')return branchDataX-leftInk(value);
  const colon=leftFields.includes(key)?WORD_LEFT_COLON_X:
    ['holder','jointHolder'].includes(key)?WORD_HOLDER_COLON_X:
    ['ifsc','micr'].includes(key)?WORD_CODE_COLON_X:undefined;
  return colon===undefined?APPROVED_INFO_SLOTS[key].x:colon+colonRight+WORD_DATA_GAP_PT-leftInk(value);
}


// Reuse the existing customer/tenant mapping, changing only Assam Print's
// final address rows. Never use branch district/state for a customer's address.
export function wordPassbookValues(...args:Parameters<typeof approvedPassbookValues>):ApprovedPassbookValues {
  const values=approvedPassbookValues(...args);
  const tail=values.address3;
  const state=tail.match(/\b(?:ANDHRA PRADESH|ARUNACHAL PRADESH|ASSAM|BIHAR|CHHATTISGARH|GOA|GUJARAT|HARYANA|HIMACHAL PRADESH|JHARKHAND|KARNATAKA|KERALA|MADHYA PRADESH|MAHARASHTRA|MANIPUR|MEGHALAYA|MIZORAM|NAGALAND|ODISHA|PUNJAB|RAJASTHAN|SIKKIM|TAMIL NADU|TELANGANA|TRIPURA|UTTAR PRADESH|UTTARAKHAND|WEST BENGAL|DELHI|JAMMU AND KASHMIR|LADAKH|PUDUCHERRY|CHANDIGARH|LAKSHADWEEP|ANDAMAN AND NICOBAR ISLANDS|DADRA AND NAGAR HAVELI AND DAMAN AND DIU)\b/);
  // If no state is present, split a postal suffix only. Preserve all unknown
  // text in row 3 instead of guessing a district or silently discarding data.
  const split=state?.index ?? tail.search(/\b(?:INDIA|PIN(?:CODE)?[ :.-]*\d{6}|\d{6})\b/);
  if(split>=0){
    values.address3=tail.slice(0,split).replace(/[,\s]+$/,'');
    values.address4=tail.slice(split).replace(/^[,\s]+/,'');
  }
  return values;
}

export function wordPassbookProblems(values:ApprovedPassbookValues,quick=false):string[] {
  return Object.entries(APPROVED_INFO_SLOTS).flatMap(([key,slot])=>{
    const value=values[key]||'';
    if ([...value].some(char=>WORD_GLYPHS[char]===undefined)) return [`${key}: contains a character unavailable in the Word font`];
    return ([ ...value ].length ? ([...value].length-1)*wordAdvance + WORD_ADVANCE_PT : 0) > slot.end-wordValueX(key,value,quick)
      ? [`${key}: exceeds the existing printing boundary at Word 10.2 pt / 70% width plus 1.5px letter gap`] : [];
  });
}

export function WordPassbookArtwork({values,quick=false,assamInkBoost=false,pr2MasterTypography=false,pr2MasterFontSizePt=PR2_MASTER_FONT_SIZE_PT,pr2LabelGapPt=WORD_LABEL_GAP_PT}:{values:ApprovedPassbookValues;quick?:boolean;assamInkBoost?:boolean;pr2MasterTypography?:boolean;pr2MasterFontSizePt?:number;pr2LabelGapPt?:number}) {
  // The isolated PR2 proof uses the selected bounded calibration face, 70%
  // glyph width and exactly 1 CSS pixel of tracking. Scale the Courier advance with
  // the face as well as the glyph; otherwise the glyph shrinks while its cell
  // stays wide and the physical result no longer looks 70% compressed.
  // The normal approved UI remains 10.2 pt / 1.5 px and is not changed here.
  const fontSize=pr2MasterTypography?pr2MasterFontSizePt:WORD_FONT_SIZE_PT;
  const advance=pr2MasterTypography
    ? WORD_ADVANCE_PT*(fontSize/WORD_FONT_SIZE_PT)+PR2_MASTER_LETTER_GAP_PT
    : WORD_ADVANCE_PT+WORD_LETTER_GAP_PT;
  const unit=fontSize/WORD_FONT_UNITS;
  const activeHorizontalScale=pr2MasterTypography?PR2_HORIZONTAL_SCALE:WORD_HORIZONTAL_SCALE;
  const activeLeftInk=(value:string)=> (WORD_INK_BOUNDS[value[0]]?.[0] ?? 0)*unit*activeHorizontalScale;
  const activeRightInk=(value:string)=> (value.length-1)*advance+(WORD_INK_BOUNDS[value.at(-1)||'']?.[1] ?? 0)*unit*activeHorizontalScale;
  const activeColonLeft=activeLeftInk(':');
  const activeColonRight=activeRightInk(':');
  const activeLeftColonX=branch.x+activeRightInk(branch.text)+pr2LabelGapPt-activeColonLeft;
  const activeHolderColonX=holder.x+activeRightInk('JOINT HOLDER')+pr2LabelGapPt-activeColonLeft;
  const activeCodeColonX=ifsc.x+activeRightInk(ifsc.text)+pr2LabelGapPt-activeColonLeft;
  const activeBranchDataX=activeLeftColonX+activeColonRight+WORD_DATA_GAP_PT;
  const activeAddressShift=activeBranchDataX-(labels.find(label=>label.text==='PO')!.x-addressShift);
  const activeDistrictShift=activeBranchDataX-(labels.find(label=>label.text==='DIST')!.x-districtShift);
  const activeLabelX=(label:{text:string;x:number;y:number})=>{
    if(!pr2MasterTypography)return label.x;
    if(label.text===':'){
      if(label.x<70)return activeLeftColonX;
      if(label.y===APPROVED_INFO_SLOTS.holder.y||label.y===APPROVED_INFO_SLOTS.jointHolder.y)return activeHolderColonX;
      if(label.y===APPROVED_INFO_SLOTS.ifsc.y||label.y===APPROVED_INFO_SLOTS.micr.y)return activeCodeColonX;
    }
    if(label.y===APPROVED_INFO_SLOTS.postOffice.y&&label.x>70)return label.x+(activeAddressShift-addressShift);
    if(label.y===APPROVED_INFO_SLOTS.district.y)return label.x+(activeDistrictShift-districtShift);
    return label.x;
  };
  const activeValueX=(key:string,value:string)=>{
    if(!pr2MasterTypography)return wordValueX(key,value,quick);
    if(quick&&key==='branchCode')return 134*72/25.4;
    if(/^address[1-4]$/.test(key))return activeHolderColonX+activeColonLeft-activeLeftInk(value);
    if(key==='postOffice')return APPROVED_INFO_SLOTS[key].x+activeAddressShift;
    if(key==='district')return APPROVED_INFO_SLOTS[key].x+activeDistrictShift;
    if(key==='branchPin')return activeBranchDataX-activeLeftInk(value);
    const colon=leftFields.includes(key)?activeLeftColonX:
      ['holder','jointHolder'].includes(key)?activeHolderColonX:
      ['ifsc','micr'].includes(key)?activeCodeColonX:undefined;
    return colon===undefined?APPROVED_INFO_SLOTS[key].x:colon+activeColonRight+WORD_DATA_GAP_PT-activeLeftInk(value);
  };
  const text=(value:string,x:number,y:number,compression=1)=>[...value].map((char,index)=>WORD_GLYPHS[char]
    ? <path key={index} d={WORD_GLYPHS[char]} vectorEffect={assamInkBoost ? 'non-scaling-stroke' : undefined} transform={`translate(${x+index*advance*compression} ${y}) scale(${unit*activeHorizontalScale*compression} ${-unit})`} /> : null);
  return <svg className="pb-approved-artwork pb-word-artwork" xmlns="http://www.w3.org/2000/svg"
    viewBox={`0 ${85*72/25.4} ${206*72/25.4} ${85*72/25.4}`}
    width="206mm" height="85mm" role="img" aria-label={pr2MasterTypography?`Passbook customer information — PR2 ${fontSize}pt, 69% width, 1px letter spacing, ${(pr2LabelGapPt*25.4/72).toFixed(2)}mm label gap, 3mm data gap`:'Passbook customer information — Courier New 10.2 pt, 70% width, 1.5px letter spacing'}
    style={{position:'absolute',left:0,top:0,display:'block',maxWidth:'none',fill:'#000',overflow:'visible',...(assamInkBoost?{stroke:'#000',strokeWidth:pr2MasterTypography?0.07:0.13,strokeLinejoin:'round' as const}: {})}}>
    <title>Passbook information</title>
    <g aria-label="Passbook labels">{labels.map((label,index)=><g key={index} data-label={label.text}>{text(label.text,activeLabelX(label),label.y,label.compression)}</g>)}</g>
    {Object.entries(APPROVED_INFO_SLOTS).map(([key,slot])=><g key={key} data-field={key} aria-label={`${key}: ${values[key]||''}`}>
      <title>{values[key]||''}</title>{text(values[key]||'',activeValueX(key,values[key]||''),slot.y)}
    </g>)}
  </svg>;
}

export default function WordPassbookInfo(props:{customer:Parameters<typeof approvedPassbookValues>[0];bank:Parameters<typeof approvedPassbookValues>[1]}) {
  const isolated=import.meta.env.VITE_PR2_LOCAL_MASTER_TYPOGRAPHY==='true';
  const requested=isolated?new URLSearchParams(globalThis.location?.search||'').get('pr2Variant')||'A':'A';
  const labelGap=PR2_LABEL_GAPS_PT[requested as keyof typeof PR2_LABEL_GAPS_PT]||PR2_LABEL_GAPS_PT.B;
  return <WordPassbookArtwork values={wordPassbookValues(props.customer,props.bank)} assamInkBoost pr2MasterTypography={isolated} pr2MasterFontSizePt={PR2_MASTER_FONT_SIZE_PT} pr2LabelGapPt={labelGap} />;
}

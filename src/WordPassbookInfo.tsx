import { APPROVED_LABELS } from './approvedPassbookArtwork';
import { APPROVED_INFO_SLOTS, approvedPassbookValues, type ApprovedPassbookValues } from './ApprovedPassbookInfo';
import { WORD_GLYPHS, WORD_FONT_SIZE_PT, WORD_HORIZONTAL_SCALE, WORD_FONT_UNITS, WORD_ADVANCE_PT } from './wordPassbookGlyphs';

// Typography only. Each label, colon and value retains its approved origin and
// baseline; the source artwork/Quick Passbook and physical SVG remain unchanged.
const labels: {text:string;x:number;y:number}[] = [];
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
export const WORD_LABELS = labels;

export function wordPassbookProblems(values:ApprovedPassbookValues):string[] {
  return Object.entries(APPROVED_INFO_SLOTS).flatMap(([key,slot])=>{
    const value=values[key]||'';
    if ([...value].some(char=>WORD_GLYPHS[char]===undefined)) return [`${key}: contains a character unavailable in the Word font`];
    return [...value].length*WORD_ADVANCE_PT > slot.end-slot.x
      ? [`${key}: exceeds the existing printing boundary at Word 10 pt / 70% compression`] : [];
  });
}

export function WordPassbookArtwork({values}:{values:ApprovedPassbookValues}) {
  const unit=WORD_FONT_SIZE_PT/WORD_FONT_UNITS;
  const text=(value:string,x:number,y:number)=>[...value].map((char,index)=>WORD_GLYPHS[char]
    ? <path key={index} d={WORD_GLYPHS[char]} transform={`translate(${x+index*WORD_ADVANCE_PT} ${y}) scale(${unit*WORD_HORIZONTAL_SCALE} ${-unit})`} /> : null);
  return <svg className="pb-approved-artwork pb-word-artwork" xmlns="http://www.w3.org/2000/svg"
    viewBox={`0 ${85*72/25.4} ${206*72/25.4} ${85*72/25.4}`}
    width="206mm" height="85mm" role="img" aria-label="Passbook customer information — Courier New 10 pt, 70%"
    style={{position:'absolute',left:0,top:0,display:'block',maxWidth:'none',fill:'#000',overflow:'visible'}}>
    <title>Passbook information</title>
    <g aria-label="Passbook labels">{labels.map((label,index)=><g key={index} data-label={label.text}>{text(label.text,label.x,label.y)}</g>)}</g>
    {Object.entries(APPROVED_INFO_SLOTS).map(([key,slot])=><g key={key} data-field={key} aria-label={`${key}: ${values[key]||''}`}>
      <title>{values[key]||''}</title>{text(values[key]||'',slot.x,slot.y)}
    </g>)}
  </svg>;
}

export default function WordPassbookInfo(props:{customer:Parameters<typeof approvedPassbookValues>[0];bank:Parameters<typeof approvedPassbookValues>[1]}) {
  return <WordPassbookArtwork values={approvedPassbookValues(props.customer,props.bank)} />;
}

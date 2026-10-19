import { APPROVED_GLYPHS, APPROVED_FOOTER_GLYPHS, APPROVED_LABELS, APPROVED_SLOTS, type ApprovedSlot } from './approvedPassbookArtwork';

type Customer = {
  enrolId?:string; accountNo?:string; name?:string; jointHolder?:string; coName?:string;
  pan?:string; contact?:string; accountOpeningDate?:string; issueDate?:string;
  nominee?:string; fullAddress?:string; address?:string; postOffice?:string; pinCode?:string;
};
type Branch = {name:string;postOffice:string;district:string;pin:string;email:string;ifsc:string;micr:string;branchCode:string};
export type ApprovedPassbookValues = Record<string,string>;
const upper = (value?:string) => String(value ?? '').trim().toUpperCase();
const PT_PER_MM = 72 / 25.4;

function date(value:string|undefined, separator:string) {
  const raw=upper(value);
  const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  const local=raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if(iso)return [iso[3],iso[2],iso[1]].join(separator);
  if(local)return [local[1].padStart(2,'0'),local[2].padStart(2,'0'),local[3]].join(separator);
  return raw;
}

// Glyph positions/widths come from the approved artwork. They never depend on
// the value's length: long names retain the same compression and font height.
export function approvedCharacterPosition(slot:ApprovedSlot,index:number) {
  const offsets=slot.offsets;
  return slot.x+(offsets[index] ?? (offsets.length ? offsets[offsets.length-1]+(index-offsets.length+1)*slot.advance : index*slot.advance));
}
export function approvedCharacterScale(slot:ApprovedSlot,index:number) {
  return slot.scales?.[index] ?? slot.scale;
}
function textWidth(value:string,slot:ApprovedSlot) {
  if(!value)return 0;
  return approvedCharacterPosition(slot,value.length-1)-slot.x+6.6*approvedCharacterScale(slot,value.length-1);
}

function addressLines(customer:Customer) {
  const source=upper(customer.fullAddress) || [customer.address,customer.postOffice,customer.pinCode].map(upper).filter(Boolean).join('\n');
  const careOf=upper(customer.coName);
  const paragraphs=(careOf && !source.includes(careOf) ? `C/O ${careOf}\n${source}` : source).split(/\r?\n/);
  const lines:string[]=[];
  for(const paragraph of paragraphs) {
    if(!paragraph.trim()){lines.push('');continue;}
    let line='';
    for(const word of paragraph.split(/\s+/)) {
      const candidate=line ? `${line} ${word}` : word;
      const slot=APPROVED_SLOTS[`address${Math.min(lines.length+1,4)}`];
      if(line && textWidth(candidate,slot)>slot.end-slot.x) {lines.push(line);line=word;}
      else line=candidate;
    }
    if(line)lines.push(line);
  }
  // The master reserves row three for locality and row four for the postal
  // line. Keep that blank row when locality is absent, as in the approved sample.
  if(lines.length===3 && /(?:\bPIN\b|\bINDIA\b)/.test(lines[2]))lines.splice(2,0,'');
  // Keep every character. An overlong final line is reported before printing;
  // it is never silently clipped, shrunk or moved onto another field's row.
  return [lines[0]||'',lines[1]||'',lines[2]||'',lines.slice(3).join(' ')];
}

export function approvedPassbookValues(customer:Customer,bank:Branch):ApprovedPassbookValues {
  const address=addressLines(customer);
  return {
    branchName:bank.name,postOffice:bank.postOffice,district:bank.district,branchPin:bank.pin,
    branchEmail:bank.email,ifsc:bank.ifsc,micr:bank.micr,
    branchCode:bank.branchCode ? `(${bank.branchCode.replace(/^\(|\)$/g,'')})` : '',
    customerId:upper(customer.enrolId),accountNo:upper(customer.accountNo),holder:upper(customer.name),
    jointHolder:upper(customer.jointHolder),pan:upper(customer.pan),mobile:upper(customer.contact),
    openedOn:date(customer.accountOpeningDate,'/'),issueDate:date(customer.issueDate,'-'),
    operatedBy:'SELF',nominee:upper(customer.nominee),
    address1:address[0],address2:address[1],address3:address[2],address4:address[3],
    amount:'0.00',bottomDate:date(customer.issueDate,'-'),
  };
}

export function approvedPassbookProblems(values:ApprovedPassbookValues):string[] {
  return Object.entries(APPROVED_SLOTS).flatMap(([key,slot])=>{
    const value=values[key]||'';
    const glyphs=slot.font==='footer' ? APPROVED_FOOTER_GLYPHS : APPROVED_GLYPHS;
    if([...value].some(char=>glyphs[char]===undefined))return [`${key}: contains a character outside the approved font`];
    return textWidth(value,slot)>slot.end-slot.x ? [`${key}: exceeds the approved space at its fixed compression`] : [];
  });
}

export function ApprovedPassbookArtwork({values}:{values:ApprovedPassbookValues}) {
  const glyph=(char:string,x:number,y:number,scale:number,footer=false,key?:string|number)=>{
    const path=(footer ? APPROVED_FOOTER_GLYPHS : APPROVED_GLYPHS)[char];
    const unit=11/(footer?1000:2048);
    return path ? <path key={key} d={path} transform={`translate(${x} ${y}) scale(${unit*scale} ${-unit})`} /> : null;
  };
  return <svg className="pb-approved-artwork" xmlns="http://www.w3.org/2000/svg"
    viewBox={`0 ${85*PT_PER_MM} ${206*PT_PER_MM} ${85*PT_PER_MM}`}
    width="206mm" height="85mm" role="img" aria-label="Approved passbook customer information"
    style={{position:'absolute',left:0,top:0,display:'block',maxWidth:'none',fill:'#000',overflow:'visible'}}>
    <title>Passbook information</title>
    <g aria-label="Passbook labels">{APPROVED_LABELS.map((c,index)=>glyph(c.char,c.x,c.y,c.scale,false,index))}</g>
    {Object.entries(APPROVED_SLOTS).map(([key,slot])=>{
      const value=values[key]||'';
      return <g key={key} data-field={key} aria-label={`${key}: ${value}`}>
        <title>{value}</title>
        {[...value].map((char,index)=>glyph(char,approvedCharacterPosition(slot,index),slot.y,approvedCharacterScale(slot,index),slot.font==='footer',index))}
      </g>;
    })}
  </svg>;
}

export default function ApprovedPassbookInfo({customer,bank}:{customer:Customer;bank:Branch}) {
  return <ApprovedPassbookArtwork values={approvedPassbookValues(customer,bank)} />;
}

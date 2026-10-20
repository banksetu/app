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
export const APPROVED_INFO_SLOTS:Record<string,ApprovedSlot> = {...APPROVED_SLOTS,
  nominee:{...APPROVED_SLOTS.nominee,scale:.75,offsets:[],advance:APPROVED_SLOTS.holder.advance}};

export function passbookPrintDate(now = new Date()) {
  return [String(now.getDate()).padStart(2,'0'),String(now.getMonth()+1).padStart(2,'0'),now.getFullYear()].join('-');
}

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
  let source=upper(customer.fullAddress) || [customer.address,customer.postOffice,customer.pinCode].map(upper).filter(Boolean).join(', ');
  const care=source.match(/^(?:C\/O|S\/O|D\/O|W\/O)\s*:?\s*([^,\n]+?)(?=\s+VILL(?:AGE)?\b|,|\n|$)/);
  const careOf=upper(customer.coName) || care?.[1]?.trim() || '';
  if(care)source=source.slice(care[0].length).replace(/^[,\s]+/,'');
  const parts=source.split(/\r?\n|,/).map(value=>value.trim()).filter(Boolean);
  const postal=/^(?:P\.?\s*O\.?\s*[: -]|POST(?:\s+OFFICE)?\b)/;
  const locality=/^(?:DIST(?:RICT)?\b|ASSAM\b|INDIA\b|PIN\b|\d{6}$)/;
  const village=upper(customer.address),post=upper(customer.postOffice);
  const selected=parts.map((part,index)=> /^(?:VILL(?:AGE)?\b|VILL-)/.test(part) || postal.test(part) ||
    (!!village && part===village) || (!!post && part===post) || (index===0 && !locality.test(part)));
  const second=parts.filter((_,index)=>selected[index]).map(part=>part.replace(/^(VILL(?:AGE)?|P\.?\s*O\.?)\s*[:-]\s*/,'$1-'));
  const third=parts.filter((_,index)=>!selected[index]);
  if(post && !source.includes(post))second.push(`P.O-${post}`);
  const pin=upper(customer.pinCode);
  if(pin && !source.includes(pin))third.push(`PIN-${pin}`);
  const location=third.join(', ').replace(/(?:^|,\s*)(\d{6})$/,(_,digits)=>`${third.length>1?', ':''}PIN-${digits}`);
  // Three fixed rows, no length-based compression or truncation. Overflow is
  // reported by approvedPassbookProblems at the same fixed glyph spacing.
  return [careOf ? `C/O ${careOf}` : '',second.join(', '),location,''];
}

export function approvedPassbookValues(customer:Customer,bank:Branch,now = new Date()):ApprovedPassbookValues {
  const address=addressLines(customer);
  const printedOn=passbookPrintDate(now);
  return {
    branchName:bank.name,postOffice:bank.postOffice,district:bank.district,branchPin:bank.pin,
    branchEmail:bank.email,ifsc:bank.ifsc,micr:bank.micr,
    branchCode:bank.branchCode ? `(${bank.branchCode.replace(/^\(|\)$/g,'')})` : '',
    customerId:upper(customer.enrolId),accountNo:upper(customer.accountNo),holder:upper(customer.name),
    jointHolder:upper(customer.jointHolder),pan:upper(customer.pan),mobile:upper(customer.contact),
    openedOn:date(customer.accountOpeningDate,'-'),issueDate:printedOn,
    operatedBy:'SELF',nominee:upper(customer.nominee ?? '1'),
    address1:address[0],address2:address[1],address3:address[2],address4:address[3],
    amount:'0.00',bottomDate:printedOn,
  };
}

export function approvedPassbookProblems(values:ApprovedPassbookValues):string[] {
  return Object.entries(APPROVED_INFO_SLOTS).flatMap(([key,slot])=>{
    const value=values[key]||'';
    const glyphs=slot.font==='footer' ? APPROVED_FOOTER_GLYPHS : APPROVED_GLYPHS;
    if([...value].some(char=>glyphs[char]===undefined))return [`${key}: contains a character outside the approved font`];
    return textWidth(value,slot)>slot.end-slot.x ? [`${key}: exceeds the approved space at its fixed compression`] : [];
  });
}

export function ApprovedPassbookArtwork({values,quick=false}:{values:ApprovedPassbookValues;quick?:boolean}) {
  const glyph=(char:string,x:number,y:number,scale:number,footer=false,key?:string|number)=>{
    const path=(footer ? APPROVED_FOOTER_GLYPHS : APPROVED_GLYPHS)[char];
    const unit=11/(footer?1000:2048);
    return path ? <path key={key} d={path} transform={`translate(${x} ${y}) scale(${unit*scale} ${-unit})`} /> : null;
  };
  const slots=quick?{...APPROVED_INFO_SLOTS,branchCode:{...APPROVED_INFO_SLOTS.branchCode,x:134*PT_PER_MM}}:APPROVED_INFO_SLOTS;
  return <svg className="pb-approved-artwork" xmlns="http://www.w3.org/2000/svg"
    viewBox={`0 ${85*PT_PER_MM} ${206*PT_PER_MM} ${85*PT_PER_MM}`}
    width="206mm" height="85mm" role="img" aria-label="Approved passbook customer information"
    style={{position:'absolute',left:0,top:0,display:'block',maxWidth:'none',fill:'#000',overflow:'visible'}}>
    <title>Passbook information</title>
    <g aria-label="Passbook labels">{APPROVED_LABELS.map((c,index)=>glyph(c.char,c.x,c.y,c.scale,false,index))}</g>
    {Object.entries(slots).map(([key,slot])=>{
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

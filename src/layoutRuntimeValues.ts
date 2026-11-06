import {isLayoutLayerPrintable} from "./layoutOutputPolicy.ts";
import {typographyIsValid} from "./layoutTypography.ts";
import { layoutCustomerValue } from "./layoutCustomerValue.ts";
export type LayoutDynamicElement = {
 id:string;kind:string;origin:string;label:string;fieldKey:string;value?:string;defaultValue?:string;
 x:number;y:number;width:number;height:number;z:number;page?:number;rotation:number;size:number;font:string;align:"left"|"center"|"right" | "justify";
 bold:boolean;italic:boolean;underline:boolean;color:string;background:string;borderColor:string;borderWidth:number;letterSpacing:number;lineHeight?:number;locked?:boolean;groupId?:string;fontCompression?:number;opacity:number;
 quick:boolean;dotMatrix:boolean;preprinted:boolean;
};
export type ApprovedLayout = {
 id:string;bankName:string;mode:"passbook"|"accountOpening";
 widthMm:number;heightMm:number;foldMm:number;printStartMm:number;pageCount?:number;elements:LayoutDynamicElement[];
};
const aliases:Record<string,string>={
  customerName:"name",customerId:"customerId",cifId:"customerId",cif:"customerId",
  accountNumber:"accountNo",accountNo:"accountNo",openingDate:"accountOpeningDate",
  fullAddress:"address",customerAddress:"address",mobileNo:"mobile",contact:"mobile",
  branch:"branchName",photo:"customerPhoto",
};
const allowedCustomerFields=new Set([
 "name","customerId","accountNo","dateOfBirth","religion","category","village",
 "fatherName","aofNo","gender","mobile","aadhaar","pan","address",
 "accountOpeningDate","nominee","postOffice","pinCode","status",
 "firstName","middleName","lastName","addressLine1","addressLine2","addressLine3",
 "accountType","operatingMode","mode","customerPhoto",
]);
/** Bank fields remain extensible for new institutions, but credentials,
 * tenant internals and session metadata must never be exposed by a template.
 */
export function safeLayoutBankFieldKey(key:string):boolean{
  return /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(key)&&
    !/(?:password|passphrase|secret|credential|token|api_?key|private_?key|license|firebase|oauth|refresh|session|tenant|permission|admin|role|identity)/i.test(key);
}
const own=(data:Record<string,unknown>,key:string)=>Object.prototype.hasOwnProperty.call(data,key)?data[key]:undefined;
const clean=(value:unknown)=>typeof value==="string"||typeof value==="number"?String(value).slice(0,500):"";
export function boundLayoutValue(element:LayoutDynamicElement,customer:Record<string,unknown>,bank:Record<string,unknown>):string {
  if(["static","preprinted"].includes(element.origin))return clean(element.label);
  const field=aliases[element.fieldKey]||element.fieldKey;
  if(element.origin==="bank"){
    if(!safeLayoutBankFieldKey(field))return "";
    const value=own(bank,field);
    return clean(value)||clean(element.defaultValue);
  }
  if(element.origin==="customer"||element.origin==="dotmatrix"){
    // A forbidden or unknown customer field must NOT substitute a free-form
    // defaultValue from a malformed/old catalog entry. This is especially
    // important when a local template is opened under another tenant.
    if(element.origin==="customer"&&!allowedCustomerFields.has(field))return "";
    if(element.origin==="dotmatrix"&&!allowedCustomerFields.has(field)&&
       !safeLayoutBankFieldKey(field))return "";
    // Values must be from explicitly allowed fields, not arbitrary customer object properties.
    if(allowedCustomerFields.has(field)){
      const value=layoutCustomerValue(customer,field);
      return value || clean(element.defaultValue);
    }
    // Bank values may be intentionally referenced from a dot-matrix line.
    if(element.origin==="dotmatrix"&&safeLayoutBankFieldKey(field)&&
       Object.prototype.hasOwnProperty.call(bank,field))
      return clean(own(bank,field))||clean(element.defaultValue);
  }
  return clean(element.defaultValue);
}
export function visibleLayoutElement(element:LayoutDynamicElement,output:"quick"|"dotmatrix",bankName=""):boolean{
  return isLayoutLayerPrintable(element,output,bankName);
}
/** A Worker result is still untrusted input until the client has checked it.
 * Reject malformed/partly loaded catalog documents before they reach a print
 * preview or a device. This does not change existing approved bank layouts.
 */
export function templateCanRender(template:ApprovedLayout,bankName:string,mode:"passbook"|"accountOpening"):boolean {
  if(!template||template.mode!==mode||typeof template.bankName!=="string"||
     template.bankName.trim().toLowerCase()!==bankName.trim().toLowerCase())return false;
  if(![template.widthMm,template.heightMm].every(v=>Number.isFinite(v)&&v>=50&&v<=500))return false;
  if(![template.foldMm,template.printStartMm].every(v=>
    Number.isFinite(v)&&v>=0&&v<=template.heightMm))return false;
  const pages=template.pageCount??1;
  if(!Number.isSafeInteger(pages)||pages<1||pages>10)return false;
  if(mode==="passbook"&&pages!==1)return false;
  if(!Array.isArray(template.elements)||template.elements.length<1||template.elements.length>300)return false;
  const ids=new Set<string>();
  for(const item of template.elements){
    if(!item||typeof item!=="object"||
       !["text","field","rectangle","line","photo","image","ellipse"].includes(item.kind)||
       !["static","customer","bank","preprinted","dotmatrix"].includes(item.origin)||
       typeof item.id!=="string"||!/^[\w-]{1,80}$/.test(item.id)||ids.has(item.id)||
       typeof item.label!=="string"||item.label.length>500||
       typeof item.fieldKey!=="string"||item.fieldKey.length>80||
       !["left","center","right","justify"].includes(item.align)||
       (item.locked!==undefined&&typeof item.locked!=="boolean")||
       (item.groupId!==undefined&&item.groupId!==""&&!/^group-[a-z0-9-]{1,64}$/i.test(item.groupId))||
       ![item.x,item.y,item.width,item.height,item.z,item.rotation,item.size,item.opacity].every(Number.isFinite)||
       item.x<0||item.y<0||item.width<=0||item.height<=0||
       item.x+item.width>template.widthMm+.25||item.y+item.height>template.heightMm+.25||
       item.z< -1000||item.z>1000||Math.abs(item.rotation)>360||
       item.size<4||item.size>120||item.opacity<0||item.opacity>1||
       !Number.isSafeInteger(item.page??1)||(item.page??1)<1||(item.page??1)>pages||
       typeof item.quick!=="boolean"||typeof item.dotMatrix!=="boolean"||
       typeof item.preprinted!=="boolean"||!typographyIsValid(item)||
       (["customer","bank","dotmatrix"].includes(item.origin)&&!item.fieldKey.trim())||
       (item.origin==="customer"&&!allowedCustomerFields.has(aliases[item.fieldKey]||item.fieldKey))||
       (item.origin==="bank"&&!safeLayoutBankFieldKey(item.fieldKey))||
       (item.origin==="dotmatrix"&&!allowedCustomerFields.has(aliases[item.fieldKey]||item.fieldKey)&&
         !safeLayoutBankFieldKey(item.fieldKey))||
       (item.kind==="image"&&(item.origin!=="bank"||item.fieldKey!=="bankLogo"))||
       (item.dotMatrix&&["image","photo","rectangle","line","ellipse"].includes(item.kind))
       )return false;
    ids.add(item.id);
  }
  return true;
}

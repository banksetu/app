import { bankTemplateValue } from "./bankFormatUtils";
export type LayoutDynamicElement = {
 id:string;kind:string;origin:string;label:string;fieldKey:string;value?:string;defaultValue?:string;
 x:number;y:number;width:number;height:number;z:number;page?:number;rotation:number;size:number;font:string;align:"left"|"center"|"right";
 bold:boolean;italic:boolean;underline:boolean;color:string;background:string;borderColor:string;borderWidth:number;letterSpacing:number;opacity:number;
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
const own=(data:Record<string,unknown>,key:string)=>Object.prototype.hasOwnProperty.call(data,key)?data[key]:undefined;
const clean=(value:unknown)=>typeof value==="string"||typeof value==="number"?String(value).slice(0,500):"";
export function boundLayoutValue(element:LayoutDynamicElement,customer:Record<string,unknown>,bank:Record<string,unknown>):string {
  if(["static","preprinted"].includes(element.origin))return clean(element.label);
  const field=aliases[element.fieldKey]||element.fieldKey;
  if(element.origin==="bank"){
    const value=own(bank,field);
    return clean(value)||clean(element.defaultValue);
  }
  if(element.origin==="customer"||element.origin==="dotmatrix"){
    // Values must be from explicitly allowed fields, not arbitrary customer object properties.
    if(allowedCustomerFields.has(field)){
      const value=bankTemplateValue(customer,field);
      return value || clean(element.defaultValue);
    }
    // Bank values may be intentionally referenced from a dot-matrix line.
    if(element.origin==="dotmatrix"&&Object.prototype.hasOwnProperty.call(bank,field))
      return clean(own(bank,field))||clean(element.defaultValue);
  }
  return clean(element.defaultValue);
}
export function visibleLayoutElement(element:LayoutDynamicElement,output:"quick"|"dotmatrix"):boolean{
  if(output==="quick")return element.quick;
  if(!element.dotMatrix||element.preprinted)return false;
  if(["image","photo","ellipse","rectangle"].includes(element.kind))return false;
  return true;
}
export function templateCanRender(template:ApprovedLayout,bankName:string,mode:"passbook"|"accountOpening"):boolean {
  if(!template||template.mode!==mode||template.bankName.trim().toLowerCase()!==bankName.trim().toLowerCase())return false;
  if(!Number.isFinite(template.widthMm)||!Number.isFinite(template.heightMm)||template.widthMm<50||template.heightMm<50||template.widthMm>500||template.heightMm>500)return false;
  if(!Array.isArray(template.elements)||!template.elements.length||template.elements.length>300)return false;
  if(mode==="passbook"&&(template.pageCount||1)!==1)return false;
  return true;
}

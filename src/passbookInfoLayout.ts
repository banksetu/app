// Coordinates are relative to the existing lower passbook print area (A4 top offset: 85 mm).
// The original photograph does not resolve sub-millimetre vertical position; final printer
// calibration continues to use the existing whole-page x/y alignment control.
export const PASSBOOK_PAPER_WIDTH_MM = 206;
export const PASSBOOK_CONTENT_END_MM = 149;
export const LEFT_LABEL_X_MM = 3.5;
export const LEFT_COLON_X_MM = 23.5;
export const LEFT_VALUE_X_MM = 27.5;
export const RIGHT_LABEL_X_MM = 77.5;
export const RIGHT_CODE_COLON_X_MM = 93.1;
export const RIGHT_CODE_VALUE_X_MM = 97.1;
export const RIGHT_HOLDER_COLON_X_MM = 97.3;
export const RIGHT_HOLDER_VALUE_X_MM = 101.3;
export const RIGHT_JOINT_COLON_X_MM = 98;
export const RIGHT_JOINT_VALUE_X_MM = 102;
export const RIGHT_ADDRESS_X_MM = 94.1;

export function passbookBranchForTenant(info:{branchName?:string;branchAddress?:string;branchPostOffice?:string;branchDistrict?:string;branchPinCode?:string;branchEmail?:string;ifsc?:string;micr?:string;branchCode?:string}={}) {
  const upper=(value?:string)=>String(value??'').trim().toUpperCase();
  return {name:upper(info.branchName),addressLine1:upper(info.branchAddress),postOffice:upper(info.branchPostOffice),
    district:upper(info.branchDistrict),pin:upper(info.branchPinCode),email:upper(info.branchEmail),
    ifsc:upper(info.ifsc),micr:upper(info.micr),branchCode:upper(info.branchCode)};
}
export function missingPassbookBranchFields(branch:ReturnType<typeof passbookBranchForTenant>) {
  return Object.entries({'Branch Name':branch.name,'Branch Address':branch.addressLine1,'Post Office':branch.postOffice,
    'District':branch.district,'Branch PIN':branch.pin,'IFSC':branch.ifsc,'MICR':branch.micr})
    .filter(([,value])=>!value).map(([name])=>name);
}

export const leftRows = [
  ['BRANCH NAME',23.1,'branchName'],['BR. ADDRESS',26.55,'branchAddress'],
  ['POST OFFICE',30,'branchPostOffice'],['DISTRICT',33.45,'branchDistrict'],
  ['PIN CODE',36.9,'branchPinCode'],['BR. EMAIL',42.9,'branchEmail'],
  ['CUSTOMER ID',46.35,'enrolId'],['ACCOUNT NO.',49.8,'accountNo'],
  ['PAN NUMBER',53.25,'pan'],['MOBILE NO.',56.7,'contact'],
  ['OPENED ON',60.15,'accountOpeningDate'],['ISSUE DATE',63.6,'issueDate'],
  ['OPERATED BY',67.05,'operatedBy'],['NOMINEE',70.5,'nominee'],
] as const;

export const targetWidthsMm:Record<string,number> = {
  enrolId:16,accountNo:22,pan:18,contact:21,accountOpeningDate:17,issueDate:17,operatedBy:6,
};

export function fitTextScale(value:string,widthMm:number,fontMm=2.7):number {
  const estimatedWidth=[...value].length*fontMm*.6;
  return estimatedWidth ? Math.min(1,widthMm/estimatedWidth) : 1;
}

export function addressPrintLines(value:string,maxChars=37):string[] {
  const result:string[]=[];
  for(const paragraph of value.trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean)) {
    let line='';
    for(const word of paragraph.split(/\s+/)) {
      if(line && (line+' '+word).length>maxChars){result.push(line);line='';}
      if(word.length>maxChars){if(line)result.push(line);for(let i=0;i<word.length;i+=maxChars)result.push(word.slice(i,i+maxChars));line='';}
      else line=line?line+' '+word:word;
    }
    if(line)result.push(line);
  }
  return result;
}

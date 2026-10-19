// Coordinates are relative to the lower print area (85 mm from the A4 top).
// Measured from the user's A4 scan (2007 x 2774 pixels, embedded at A4 size).
// The scanned sheet and passbook are slightly skewed; physical test-print calibration
// remains necessary for sub-millimetre placement on an individual printer.
export const PASSBOOK_PAPER_WIDTH_MM = 206;
export const PASSBOOK_CONTENT_END_MM = 149;
export const LEFT_LABEL_X_MM = 7;
export const LEFT_COLON_X_MM = 26.5;
export const LEFT_VALUE_X_MM = 29;
export const RIGHT_LABEL_X_MM = 77.5;
export const RIGHT_CODE_COLON_X_MM = 93.1;
export const RIGHT_CODE_VALUE_X_MM = 97.1;
export const RIGHT_HOLDER_COLON_X_MM = 97.3;
export const RIGHT_HOLDER_VALUE_X_MM = 101.3;
export const RIGHT_JOINT_COLON_X_MM = 98;
export const RIGHT_JOINT_VALUE_X_MM = 102;
export const RIGHT_ADDRESS_X_MM = 96.5;
export const RIGHT_BRANCH_CODE_X_MM = 138.5;
export const PASSBOOK_ROW_MM = 4.15;

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
  ['BRANCH NAME',21.9,'branchName'],['BR. ADDRESS',26.05,'branchAddress'],
  ['',30.2,'branchDistrict'],['',34.35,'branchPinCode'],
  ['BR. EMAIL',38.5,'branchEmail'],['CUSTOMER ID',42.65,'enrolId'],
  ['ACCOUNT NO.',46.8,'accountNo'],['PAN NUMBER',50.95,'pan'],
  ['MOBILE NO.',55.1,'contact'],['OPENED ON',59.25,'accountOpeningDate'],
  ['ISSUE DATE',63.4,'issueDate'],['OPERATED BY',67.55,'operatedBy'],
  ['NOMINEE',71.7,'nominee'],
] as const;

export const targetWidthsMm:Record<string,number> = {
  enrolId:16,accountNo:22,pan:18,contact:21,accountOpeningDate:17,issueDate:17,operatedBy:6,
};

export function fitTextScale(value:string,widthMm:number,fontMm=3):number {
  const estimatedWidth=[...value].length*fontMm*.602;
  return estimatedWidth ? Math.min(1,widthMm/estimatedWidth) : 1;
}

export function passbookBranchAddress(address:string,postOffice:string):string {
  if (!postOffice) return address;
  if (!address) return `PO:-${postOffice}`;
  return address.toUpperCase().includes(postOffice.toUpperCase()) ? address : `${address} PO:-${postOffice}`;
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

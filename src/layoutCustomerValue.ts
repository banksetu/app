/** Strict renderer binding for approved editor field keys.
 * Match existing Bank Format semantics: customerId maps to enrolId,
 * mobile to contact, full address to fullAddress, Aadhaar stays masked.
 */
export function layoutCustomerValue(customer:Record<string,unknown>,field:string):string{
  const text=(value:unknown)=>typeof value==="string"||typeof value==="number"?String(value).trim().slice(0,500):"";
  const address=text(customer.fullAddress)||text(customer.address);
  const name=text(customer.name);
  const rows=address.split(/\r?\n/).filter(Boolean);
  const words=address.trim().split(/\s+/).filter(Boolean);
  const addressLines=rows.length>=2?rows:[words.slice(0,Math.ceil(words.length/3)).join(" "),words.slice(Math.ceil(words.length/3),Math.ceil(words.length*2/3)).join(" "),words.slice(Math.ceil(words.length*2/3)).join(" ")];
  const nameWords=name.trim().split(/\s+/).filter(Boolean);
  const aadhaar=text(customer.uidaiNo||customer.aadhaar).replace(/\s/g,"");
  const data:Record<string,string>={
    customerName:name,accountNumber:text(customer.accountNo),
    name,firstName:nameWords.length>1?nameWords[0]:"",middleName:nameWords.length>2?nameWords.slice(1,-1).join(" "):"",lastName:nameWords.at(-1)||"",
    accountNo:text(customer.accountNo),
    customerId:text(customer.enrolId)||text(customer.customerId),
    dateOfBirth:text(customer.dateOfBirth)||text(customer.dob),religion:text(customer.religion),
    category:text(customer.category),village:text(customer.address),
    fatherName:text(customer.coName)||text(customer.fatherName)||text(customer.guardianName),
    aofNo:text(customer.aofNo),gender:text(customer.gender),mobile:text(customer.contact)||text(customer.mobile),
    aadhaar:aadhaar?"XXXXXXXX"+aadhaar.slice(-4):"",pan:text(customer.pan),
    address,accountOpeningDate:text(customer.accountOpeningDate),
    nominee:text(customer.nominee),postOffice:text(customer.postOffice),pinCode:text(customer.pinCode),
    status:text(customer.status),branchName:text(customer.branchName)||text(customer.branch),
    ifsc:text(customer.ifsc),accountType:text(customer.accountType),
    mode:text(customer.mode),operatingMode:text(customer.operatingMode),
    addressLine1:addressLines[0]||"",addressLine2:addressLines[1]||"",addressLine3:addressLines[2]||"",
    customerPhoto:"",
  };
  return Object.prototype.hasOwnProperty.call(data,field)?data[field]:"";
}

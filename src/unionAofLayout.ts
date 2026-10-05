import { splitPrintName } from "./bankFormatUtils";

// Coordinates measured on the user's blank two-page Union Bank AOF-5.
// The reference raster is 1132 x 1600; each cell has a 24.8px pitch.
export type AofBox = { key: string; label: string; page: number; x: number; y: number; cells: number; width?: number; text?: boolean };
export const UNION_AOF_BOXES: AofBox[] = [
  {key:"branchName",label:"Link branch",page:1,x:148,y:118,cells:14},
  {key:"customerId",label:"Customer ID",page:1,x:148,y:149,cells:9},
  {key:"accountNo",label:"Account number",page:1,x:148,y:179,cells:15},
  {key:"firstName",label:"First name",page:1,x:193,y:330,cells:11},
  {key:"middleName",label:"Middle name",page:1,x:498,y:330,cells:11},
  {key:"lastName",label:"Last name",page:1,x:797,y:330,cells:11},
  {key:"fatherFirstName",label:"Father / spouse first name",page:1,x:194,y:399,cells:11},
  {key:"fatherMiddleName",label:"Father / spouse middle name",page:1,x:498,y:399,cells:11},
  {key:"fatherLastName",label:"Father / spouse last name",page:1,x:798,y:399,cells:11},
  {key:"pan",label:"PAN",page:1,x:635,y:453,cells:10},
  {key:"aadhaar",label:"Aadhaar (masked)",page:1,x:774,y:504,cells:12},
  {key:"annualIncome",label:"Annual income",page:1,x:914,y:453,cells:6},
  {key:"education",label:"Education",page:1,x:59,y:594,cells:8},
  {key:"religion",label:"Religion",page:1,x:276,y:594,cells:10},
  {key:"houseNo",label:"Residence: house number",page:1,x:203,y:720,cells:15},
  {key:"street",label:"Residence: street",page:1,x:650,y:720,cells:17},
  {key:"village",label:"Residence: village / city",page:1,x:203,y:750,cells:12},
  {key:"block",label:"Residence: block",page:1,x:575,y:750,cells:20},
  {key:"district",label:"Residence: district",page:1,x:128,y:780,cells:21},
  {key:"state",label:"Residence: state",page:1,x:725,y:780,cells:14},
  {key:"pinCode",label:"Residence: PIN",page:1,x:128,y:810,cells:6},
  {key:"phone",label:"Residence: phone",page:1,x:401,y:810,cells:10},
  {key:"mobile",label:"Mobile",page:1,x:798,y:810,cells:11},
  {key:"permanentHouseNo",label:"Permanent: house number",page:1,x:203,y:877,cells:15},
  {key:"permanentStreet",label:"Permanent: street",page:1,x:650,y:877,cells:17},
  {key:"permanentVillage",label:"Permanent: village / city",page:1,x:203,y:907,cells:12},
  {key:"permanentBlock",label:"Permanent: block",page:1,x:575,y:907,cells:20},
  {key:"permanentDistrict",label:"Permanent: district",page:1,x:128,y:937,cells:13},
  {key:"permanentState",label:"Permanent: state",page:1,x:525,y:937,cells:14},
  {key:"permanentPinCode",label:"Permanent: PIN",page:1,x:923,y:937,cells:6},
  {key:"name",label:"Applicant name (declaration)",page:1,x:292,y:1428,cells:60,width:496,text:true},
  {key:"name",label:"Depositor name (nomination)",page:2,x:135,y:136,cells:80,width:930,text:true},
  {key:"branchName",label:"Nomination branch",page:2,x:198,y:191,cells:24,width:175,text:true},
  {key:"accountNo",label:"Nomination account number",page:2,x:702,y:223,cells:15},
  {key:"nomineeFirstName",label:"Nominee first name",page:2,x:177,y:298,cells:12},
  {key:"nomineeMiddleName",label:"Nominee middle name",page:2,x:513,y:298,cells:11},
  {key:"nomineeLastName",label:"Nominee last name",page:2,x:799,y:298,cells:11},
  {key:"nomineeRelationship",label:"Nominee relationship",page:2,x:245,y:332,cells:12},
  {key:"nomineeAge",label:"Nominee age",page:2,x:588,y:332,cells:2},
  {key:"nomineeHouseNo",label:"Nominee: house number",page:2,x:206,y:373,cells:15},
  {key:"nomineeStreet",label:"Nominee: street",page:2,x:653,y:373,cells:17},
  {key:"nomineeVillage",label:"Nominee: village / city",page:2,x:206,y:403,cells:12},
  {key:"nomineeBlock",label:"Nominee: block",page:2,x:579,y:403,cells:20},
  {key:"nomineeDistrict",label:"Nominee: district",page:2,x:131,y:433,cells:21},
  {key:"nomineeState",label:"Nominee: state",page:2,x:728,y:433,cells:14},
  {key:"nomineePinCode",label:"Nominee: PIN",page:2,x:131,y:463,cells:6},
  {key:"nomineeMobile",label:"Nominee: mobile",page:2,x:800,y:463,cells:11},
];

export function unionAofValues(customer: Record<string, unknown>): Record<string, string> {
  const value = (...keys: string[]) => keys.map(key => String(customer[key] ?? "").trim()).find(Boolean) || "";
  const name = splitPrintName(value("name"));
  const father = splitPrintName(value("coName", "fatherName", "guardianName"));
  const nominee = splitPrintName(value("nominee"));
  return {
    ...Object.fromEntries(UNION_AOF_BOXES.map(box => [box.key, value(box.key)])),
    ...name,
    name:value("name"), customerId:value("enrolId","customerId"), mobile:value("contact","mobile"),
    fatherFirstName:father.firstName, fatherMiddleName:father.middleName, fatherLastName:father.lastName,
    nomineeFirstName:nominee.firstName, nomineeMiddleName:nominee.middleName, nomineeLastName:nominee.lastName,
    village:value("village","address"),
    aadhaar:(()=>{const raw=value("uidaiNo","aadhaar").replace(/\s/g, "");return raw ? "XXXXXXXX"+raw.slice(-4) : "";})(),
  };
}

export function unionAofOverflow(values: Record<string,string>) {
  return UNION_AOF_BOXES.filter(box => !box.text && Array.from((values[box.key] || "").toUpperCase()).length > box.cells);
}

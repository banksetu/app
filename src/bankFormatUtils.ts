import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

export type BankFieldPlacement = {
  field: string;
  page?: number;
  x: number;
  y: number;
  width: number;
  height?: number;
  fontSize: number;
  uppercase: boolean;
  align: "left" | "center" | "right";
};

export function clearSampleRegions(context: Pick<CanvasRenderingContext2D, "fillStyle" | "fillRect">, width: number, height: number, regions: BankFieldPlacement[], page: number) {
  context.fillStyle = "#ffffff";
  for (const region of regions.filter(item => (item.page || 1) === page)) {
    if (!region.height || region.height <= 0) continue;
    context.fillRect(region.x/100*width, region.y/100*height, region.width/100*width, region.height/100*height);
  }
}
export function sourceSectionsToPrint(regions: BankFieldPlacement[]) {
  return regions.map(region => ({...region, fontSize: region.fontSize || 10, uppercase: false, align: "left" as const}));
}
export async function renderBankSamplePages(dataUrl: string, mimeType: string, clearRegions: BankFieldPlacement[] = []) {
  if (!mimeType.includes("pdf")) {
    const image = new Image(); image.src=dataUrl; await image.decode();
    const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext("2d");if(!context)throw new Error("Sample image could not be prepared.");
    context.drawImage(image,0,0);clearSampleRegions(context,canvas.width,canvas.height,clearRegions,1);
    return [{dataUrl:canvas.toDataURL("image/png"),width:canvas.width,height:canvas.height}];
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const loadingTask = getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  if (pdf.numPages > 10) throw new Error("Bank sample PDFs can contain up to 10 pages for field mapping and print preview.");
  const rendered = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser could not prepare the PDF sample preview.");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    clearSampleRegions(context,canvas.width,canvas.height,clearRegions,pageNumber);
    rendered.push({ dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height });
    page.cleanup();
  }
  await loadingTask.destroy();
  return rendered;
}

export async function renderBankSampleFirstPage(dataUrl: string, mimeType: string) {
  const pages = await renderBankSamplePages(dataUrl, mimeType);
  return pages[0];
}

export const BANK_TEMPLATE_FIELD_OPTIONS = [
  ["dateOfBirth", "Date of birth"], ["religion", "Religion"], ["category", "Category"], ["village", "Village"],
  ["name", "Customer name"], ["fatherName", "Father / guardian name"],
  ["accountNo", "Account number"], ["customerId", "Customer ID"],
  ["aofNo", "AOF number"], ["gender", "Gender"], ["mobile", "Mobile"],
  ["aadhaar", "Aadhaar"], ["pan", "PAN"], ["address", "Address"],
  ["branchName", "Branch name"], ["ifsc", "IFSC"],
  ["accountOpeningDate", "Account opening date"], ["nominee", "Nominee"],
  ["postOffice", "Post office"], ["pinCode", "PIN code"], ["status", "Status"],
  ["customerPhoto", "Customer photo"],
] as const;

// Derived print fields only: the original customer/extraction data stays intact.
export const BANK_PRINT_FIELD_OPTIONS = [
  ...BANK_TEMPLATE_FIELD_OPTIONS,
  ["firstName", "First name"], ["middleName", "Middle name"], ["lastName", "Last name"],
  ["addressLine1", "Address line 1"], ["addressLine2", "Address line 2"], ["addressLine3", "Address line 3"],
] as const;

export function splitPrintName(value: unknown) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: words.length > 1 ? words[0] : "",
    middleName: words.length > 2 ? words.slice(1, -1).join(" ") : "",
    lastName: words.at(-1) || "",
  };
}

export function splitPrintAddress(value: unknown, lineCount = 3): string[] {
  const count = Math.max(1, Math.min(3, Math.trunc(lineCount) || 3));
  const text = String(value ?? "").trim();
  const existing = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (existing.length > 1 && existing.length <= count) {
    return [...existing, ...Array(count - existing.length).fill("")];
  }
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (let index = 0; index < count; index++) {
    const target = Math.ceil(words.join(" ").length / (count - index));
    let line = "";
    while (words.length && (index === count - 1 || !line || (line + " " + words[0]).length <= target)) {
      line += (line ? " " : "") + words.shift();
    }
    lines.push(line);
  }
  return lines;
}

export function mergeAccountOpeningPrintMap(automatic: BankFieldPlacement[], manual: BankFieldPlacement[]) {
  const remaining = automatic.filter(item => !manual.some(saved => {
    if ((saved.page || 1) !== (item.page || 1)) return false;
    return saved.field === item.field ||
      (item.field === "name" && ["firstName", "middleName", "lastName"].includes(saved.field)) ||
      (["address", "village", "postOffice", "pinCode"].includes(item.field) && /^addressLine[123]$/.test(saved.field));
  }));
  // Legacy automatic layouts keep their fallback behavior. Explicit saved boxes are authoritative.
  return [...accountOpeningPrintMap(remaining), ...manual.map(item => ({ ...item }))];
}

export function bankTemplateValue(customer: Record<string, unknown>, field: string, addressLineCount = 3): string {
  const addressLines = splitPrintAddress(String(customer.fullAddress ?? "").trim() || customer.address, addressLineCount);
  const values: Record<string, unknown> = {
    ...splitPrintName(customer.name),
    addressLine1: addressLines[0], addressLine2: addressLines[1], addressLine3: addressLines[2],
    dateOfBirth: customer.dateOfBirth ?? customer.dob,
    religion: customer.religion, category: customer.category, village: customer.address,
    name: customer.name,
    fatherName: customer.coName ?? customer.fatherName ?? customer.guardianName,
    accountNo: customer.accountNo,
    customerId: customer.enrolId ?? customer.customerId,
    aofNo: customer.aofNo,
    gender: customer.gender,
    mobile: customer.contact ?? customer.mobile,
    aadhaar: (()=>{const value=String(customer.uidaiNo ?? customer.aadhaar ?? "").replace(/\s/g,"");return value?"XXXXXXXX"+value.slice(-4):"";})(),
    pan: customer.pan,
    address: String(customer.fullAddress ?? "").trim() || customer.address,
    branchName: customer.branchName ?? customer.branch,
    ifsc: customer.ifsc,
    accountOpeningDate: customer.accountOpeningDate,
    nominee: customer.nominee,
    postOffice: customer.postOffice,
    pinCode: customer.pinCode,
    status: customer.status,
  };
  return String(values[field] ?? "").trim();
}

export function accountOpeningPrintMap(mapping:BankFieldPlacement[]):BankFieldPlacement[]{
 const anchor=mapping.find(item=>item.field==="name")||mapping.find(item=>item.field==="accountNo");
 const addresses=new Map<number,BankFieldPlacement>();
 for(const item of mapping)if(item.field==="address"&&!addresses.has(item.page||1))addresses.set(item.page||1,item);
 return mapping.filter(item=>{
  const address=addresses.get(item.page||1);if(!address)return true;
  if(["village","postOffice","pinCode"].includes(item.field))return false;
  if(item.field==="fatherName"&&item.y>=address.y-1&&item.y<=address.y+9)return false;
  return item.field!=="address"||item===address;
 }).map(item=>{
  if(item.field==="customerPhoto")return item;
  const x=anchor&&(anchor.page||1)===(item.page||1)?anchor.x:item.x;
  if(item.field!=="address")return {...item,x,align:"left"};
  const next=mapping.filter(other=>(other.page||1)===(item.page||1)&&other.y>item.y+1&&!['address','village','postOffice','pinCode','customerPhoto','fatherName'].includes(other.field)).sort((a,b)=>a.y-b.y)[0];
  return {...item,x,width:Math.max(item.width,90-x),height:Math.max(.5,Math.min(9,(next?.y||99)-item.y-.5)),align:"left"};
 });
}

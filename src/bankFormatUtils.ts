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

export function bankTemplateValue(customer: Record<string, unknown>, field: string): string {
  const values: Record<string, unknown> = {
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
    address: customer.fullAddress ?? customer.address,
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

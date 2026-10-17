import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

export type BankFieldPlacement = {
  field: string;
  page?: number;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  uppercase: boolean;
  align: "left" | "center" | "right";
};

export async function renderBankSamplePages(dataUrl: string, mimeType: string) {
  if (!mimeType.includes("pdf")) return [{ dataUrl, width: 1, height: 1 }];
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
    name: customer.name,
    fatherName: customer.coName ?? customer.fatherName ?? customer.guardianName,
    accountNo: customer.accountNo,
    customerId: customer.enrolId ?? customer.customerId,
    aofNo: customer.aofNo,
    gender: customer.gender,
    mobile: customer.contact ?? customer.mobile,
    aadhaar: customer.uidaiNo ?? customer.aadhaar,
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

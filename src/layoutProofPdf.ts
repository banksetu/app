import { jsPDF } from "jspdf";

/** Independent, review-only proof. Never sends or marks a PR2 print as complete. */
type ProofPart = {
  kind: "text" | "field" | "rectangle" | "line" | "photo" | "ellipse" | "image";
  page?: number; imageData?: string;
  origin: string;
  label: string;
  fieldKey: string;
  value: string;
  defaultValue: string;
  x: number; y: number; width: number; height: number; z: number; rotation: number;
  font: string; size: number; bold: boolean; italic: boolean; underline: boolean;
  align: "left" | "center" | "right"; color: string; background: string;
  borderColor: string; borderWidth: number; letterSpacing: number; opacity: number;
  quick: boolean; dotMatrix: boolean; preprinted: boolean;
};
export type ProofLayout = {
  widthMm: number; heightMm: number; pageCount?: number; elements: ProofPart[];
};
export type ProofMode = "quick" | "dotmatrix";
const rgb = (hex: string): [number, number, number] => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return [0, 0, 0];
  return [1, 3, 5].map(n => parseInt(hex.slice(n, n + 2), 16)) as [number, number, number];
};
const fontFamily = (name: string) => /courier|mono/i.test(name) ? "courier" : /times|georgia|serif/i.test(name) ? "times" : "helvetica";
const partValue = (p: ProofPart) => p.origin === "customer" || p.origin === "bank" || p.origin === "dotmatrix"
  ? p.value || p.defaultValue || "[" + (p.fieldKey || p.label) + "]" : p.label;

export async function exportLayoutProofPdf(layout: ProofLayout, mode: ProofMode): Promise<Blob> {
  if (!Number.isFinite(layout.widthMm) || !Number.isFinite(layout.heightMm) || layout.widthMm < 50 ||
      layout.heightMm < 50 || layout.widthMm > 500 || layout.heightMm > 500 || layout.elements.length > 500)
    throw new Error("Passbook draft dimensions or object count are invalid.");
  const pdf = new jsPDF({
    orientation: layout.widthMm > layout.heightMm ? "landscape" : "portrait",
    unit: "mm",
    format: [layout.widthMm, layout.heightMm],
    compress: true,
  });
  pdf.setProperties({ title: "UNAPPROVED BANK SETU LAYOUT PROOF", subject: "Manual printer alignment proof — not an approved template" });
  const pages = Math.max(1, Math.min(10, layout.pageCount || 1));
  for (let pageNo = 1; pageNo <= pages; pageNo++) {
    if (pageNo > 1) pdf.addPage([layout.widthMm,layout.heightMm], layout.widthMm > layout.heightMm ? "landscape" : "portrait");
    for (const part of [...layout.elements].filter(p => (p.page || 1) === pageNo).sort((a, b) => a.z - b.z)) {
    if (mode === "quick" ? !part.quick : !part.dotMatrix || part.preprinted) continue;
    // Physical passbook stock already carries the artwork. Even a misconfigured
    // draft cannot include photos, logos, borders or shapes in Direct PR2 proof.
    if (mode === "dotmatrix" && part.kind !== "text" && part.kind !== "field") continue;
    if (part.x < 0 || part.y < 0 || part.x > layout.widthMm || part.y > layout.heightMm) continue;
    const x = part.x, y = part.y;
    const color = mode === "dotmatrix" ? [0,0,0] as const : rgb(part.color);
    pdf.setDrawColor(color[0],color[1],color[2]);
    pdf.setTextColor(color[0],color[1],color[2]);
    if (part.background !== "transparent" && mode === "quick") {
      const fill=rgb(part.background);pdf.setFillColor(fill[0],fill[1],fill[2]);
      pdf.rect(x, y, part.width, part.height, "F");
    }
    if (part.kind === "image") {
      if (mode === "quick" && part.imageData && part.imageData.length <= 1500000) {
        // Imported artwork can be PNG, JPEG or WebP; it is not always WebP.
        // Use the actual MIME format instead of interpreting every logo as WebP.
        const format=part.imageData.startsWith("data:image/png;base64,")?"PNG":
          part.imageData.startsWith("data:image/jpeg;base64,")?"JPEG":
          part.imageData.startsWith("data:image/webp;base64,")?"WEBP":null;
        if(format)pdf.addImage(part.imageData,format,x,y,part.width,part.height);
      }
      continue;
    }
    if (part.kind === "ellipse") {
      pdf.setLineWidth(Math.max(.15,part.borderWidth*.2646));
      pdf.ellipse(x+part.width/2,y+part.height/2,part.width/2,part.height/2,"S");
      continue;
    }
    if (part.kind === "rectangle" || part.kind === "photo") {
      pdf.setLineWidth(Math.max(.15,part.borderWidth * .2646));
      if (part.kind === "photo" && mode === "dotmatrix" && !part.dotMatrix) continue;
      pdf.rect(x,y,part.width,part.height,"S");
      if (part.kind === "photo") {
        pdf.setFont("helvetica", "normal");pdf.setFontSize(7);pdf.text("PHOTO",x+part.width/2,y+part.height/2,{align:"center"});
      }
      continue;
    }
    if (part.kind === "line") {
      pdf.setLineWidth(Math.max(.15,part.borderWidth * .2646));
      pdf.line(x,y,x+part.width,y);
      continue;
    }
    const font = fontFamily(part.font);
    const style = part.bold && part.italic ? "bolditalic" : part.bold ? "bold" : part.italic ? "italic" : "normal";
    pdf.setFont(font,style);
    // Onscreen font px to typographical points. Align via the same mm geometry.
    pdf.setFontSize(Math.max(4,part.size * .75));
    const lines = pdf.splitTextToSize(partValue(part), Math.max(2,part.width));
    pdf.text(lines.slice(0, 24), x + (part.align === "center" ? part.width / 2 : part.align === "right" ? part.width : 0),
      y + Math.min(part.height, Math.max(2,part.size * .2646)), { align: part.align, angle: part.rotation });
  }
  }
  return pdf.output("blob");
}

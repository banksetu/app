/**
 * BANK SETU shared bank-layout catalog. Only generic layout coordinates and
 * bank labels can be submitted. Never copy tenant/customer photos or records.
 * Approval is explicitly Master-Admin only in the worker route.
 */
const kinds = new Set(["text", "field", "rectangle", "line", "photo", "ellipse", "image"]);
const origins = new Set(["static", "customer", "bank", "preprinted", "dotmatrix"]);
const aligns = new Set(["left", "center", "right"]);
const pdfFormats = new Set(["passbook", "accountOpening"]);
const clean = (value, max) => String(value || "").trim().slice(0, max);
const finite = (value, lower, upper) => typeof value === "number" && Number.isFinite(value) && value >= lower && value <= upper;
const suspicious = text => /\b[A-Z]{5}\d{4}[A-Z]\b|\b\d[\d -]{9,19}\d\b|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
export const safeLayoutBankFieldKey=key=>/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(key)&&
  !/(?:password|passphrase|secret|credential|token|api_?key|private_?key|license|firebase|oauth|refresh|session|tenant|permission|admin|role|identity)/i.test(key);


export function normalizedBankKey(name) {
  const input = clean(name, 120).normalize("NFKC").toLowerCase();
  const ascii = input.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if(!input)return "";
  if(/^[\x00-\x7f]*$/.test(input))return ascii.slice(0,90);
  // Preserve keys of all existing ASCII banks. Bank names written partly or
  // fully in Hindi must not collapse to "" or collide on their ASCII prefix.
  let hash=0xcbf29ce484222325n;
  for(const symbol of input)hash=BigInt.asUintN(64,
    (hash ^ BigInt(symbol.codePointAt(0)))*0x100000001b3n);
  return (ascii.slice(0,50)||"bank")+"-u"+hash.toString(36);
}

export function sanitizeLayoutTemplate(raw, selectedBank) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("A layout draft is required.");
  const bankName = clean(selectedBank, 120);
  if (!bankName || clean(raw.bankName, 120).toLowerCase() !== bankName.toLowerCase())
    throw Error("The template bank must match the selected Bank Information.");
  if (!pdfFormats.has(raw.mode)) throw Error("Invalid bank layout type.");
  if(raw.sourceArtworkStatus!==undefined && !["clean","reviewed"].includes(raw.sourceArtworkStatus))
    throw Error("Unreviewed PDF raster/complex graphics require manual reconstruction before template sharing.");
  if (!finite(raw.widthMm, 50, 500) || !finite(raw.heightMm, 50, 500) ||
      !finite(raw.foldMm, 0, 500) || !finite(raw.printStartMm, 0, 500) ||
      raw.foldMm > raw.heightMm || raw.printStartMm > raw.heightMm)
    throw Error("Invalid template physical measurements.");
  const pageCount = raw.pageCount === undefined ? 1 : raw.pageCount;
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 10) throw Error("Template can contain 1–10 pages.");
  if (!Array.isArray(raw.elements) || !raw.elements.length || raw.elements.length > 300)
    throw Error("Template needs 1–300 editable elements.");
  const seen = new Set();
  const elements = raw.elements.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        !kinds.has(item.kind) || !origins.has(item.origin) ||
        !finite(item.x, 0, raw.widthMm) || !finite(item.y, 0, raw.heightMm) ||
        !finite(item.width, 1, 500) || !finite(item.height, 1, 500) ||
        item.x + item.width > raw.widthMm + .25 || item.y + item.height > raw.heightMm + .25 ||
        !finite(item.z, -1000, 1000) || !finite(item.rotation, -360, 360) ||
        !finite(item.size, 4, 120) || !finite(item.letterSpacing, -5, 30) ||
        !(item.fontCompression===undefined||finite(item.fontCompression,50,100)) ||
        !finite(item.opacity, 0, 1) || !finite(item.borderWidth, 0, 10) ||
        !aligns.has(item.align))
      throw Error("Invalid layout element " + (index + 1) + ".");
    const page = item.page === undefined ? 1 : item.page;
    if (!Number.isInteger(page) || page < 1 || page > pageCount) throw Error("Invalid element page.");
    if(item.needsReview===true)throw Error("Unverified or unreadable OCR text must be corrected before template sharing.");
    if(typeof item.label!=="string"||item.label.length>500)
      throw Error("Passbook text must be at most 500 characters; content was not silently truncated.");
    const label = clean(item.label, 500), fieldKey = clean(item.fieldKey, 80);
    if (!label || suspicious(label) || fieldKey && !/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(fieldKey))
      throw Error("A label might contain customer data or an invalid field mapping.");
    const id=clean(item.id, 80);
    if (!/^[\w-]{1,80}$/.test(id) || seen.has(id)) throw Error("Duplicate or invalid layer IDs.");
    seen.add(id);
    const origin = item.origin;
    if((origin==="bank"||origin==="dotmatrix") && fieldKey && !safeLayoutBankFieldKey(fieldKey))
      throw Error("A bank field must not expose tenant credentials, tokens, licences or private settings.");
    if(raw.mode==="passbook" && item.dotMatrix===true && !item.preprinted){
      if(!["text","field"].includes(item.kind))
        throw Error("Passbook dot-matrix output cannot include shapes, logos or photos.");
      if(/union bank/i.test(bankName) && ["static","preprinted"].includes(origin))
        throw Error("Union Bank passbooks print values only; static labels must not be included in dot-matrix output.");
    }
    if(item.kind==="image" && (item.imageData!==undefined || fieldKey!=="bankLogo" || origin!=="bank")) throw Error("Shared logos must be Bank Information image placeholders; embedded raster image pixels cannot be shared.");
    const staticLabel = origin === "static" || origin === "preprinted";
    const safe = {
      id, kind:item.kind, page, origin, label, fieldKey, value:"",
      // Public bank defaults, never customer- or branch-specific values.
      defaultValue:["accountType","mode","operatingMode"].includes(fieldKey) &&
        /^(?:saving|savings|savings account|current|current account|self|singly|jointly)$/i.test(String(item.defaultValue||"").trim())
        ? String(item.defaultValue).trim() : "",
      x:item.x, y:item.y, width:item.width, height:item.height, z:item.z,
      rotation:item.rotation, size:item.size, align:item.align, letterSpacing:item.letterSpacing,
      fontCompression:item.fontCompression===undefined?100:item.fontCompression,
      opacity:item.opacity, borderWidth:item.borderWidth,
      bold:item.bold===true, italic:item.italic===true, underline:item.underline===true,
      font:/^[a-zA-Z ,'-]{1,60}$/.test(item.font) ? item.font : "Arial",
      color:/^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : "#000000",
      background:item.background==="transparent" ? "transparent" : /^#[0-9a-fA-F]{6}$/.test(item.background) ? item.background : "transparent",
      borderColor:/^#[0-9a-fA-F]{6}$/.test(item.borderColor) ? item.borderColor : "#000000",
      quick:item.quick===true, dotMatrix:item.dotMatrix===true,
      preprinted:origin==="preprinted" || item.preprinted===true,
    };
    // Static visible bank instructions are retained only after Master review.
    // Neither client/customer field previews nor bank values are published.
    if(!staticLabel) safe.value="";
    if (item.kind === "photo") safe.dotMatrix = false;
    return safe;
  });
  const template = {
    version:1, bankName, bankKey:normalizedBankKey(bankName), mode:raw.mode, pageCount,
    widthMm:raw.widthMm, heightMm:raw.heightMm,
    foldMm:raw.foldMm, printStartMm:raw.printStartMm, elements,
  };
  if (JSON.stringify(template).length > 160000) throw Error("Template exceeds the catalog size limit.");
  return template;
}

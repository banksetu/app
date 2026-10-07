export type BankDocumentType = "passbook" | "quickPassbook" | "accountOpening";
export const bankKey = (name = "") => name.trim().toLowerCase().replace(/\s+/g, " ");
export const isAssamBank = (name = "") => /^(assam gramin(?: vikas)? bank|agvb|agb)$/.test(bankKey(name));
export function bankDocumentMode(name: string) { return !bankKey(name) ? "select" : isAssamBank(name) ? "builtin" : "custom"; }
export function templateMatchesBank(sample: { bankKey?: string } | undefined, name: string) {
  return !!sample && !!bankKey(name) && sample.bankKey === bankKey(name);
}

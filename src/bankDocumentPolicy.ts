export type BankDocumentType = "passbook" | "quickPassbook" | "accountOpening";
export const bankKey = (name = "") => name.trim().toLowerCase().replace(/\s+/g, " ");
export const isAssamBank = (name = "") => /^(assam gramin(?: vikas)? bank|agvb|agb)$/.test(bankKey(name));
export const isUnionBank = (name = "") => /union bank(?: of india)?/.test(bankKey(name));

export function bankDocumentMode(name: string) {
  const key = bankKey(name);
  if (!key) return "select";
  // Union Bank uses the built-in data-only passbook renderer. Its physical
  // book already contains all static labels and branding.
  if (isAssamBank(key) || isUnionBank(key)) return "builtin";
  return "custom";
}

export function templateMatchesBank(sample: { bankKey?: string } | undefined, name: string) {
  return !!sample && !!bankKey(name) && sample.bankKey === bankKey(name);
}

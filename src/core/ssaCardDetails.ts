import type { SsaCampaignEntry } from "./schema";

export type SsaCardKind = "total" | "apy" | "pmjjby" | "pmsby";

export const SSA_CARD_TITLES: Record<SsaCardKind, string> = {
  total: "Total Entry",
  apy: "Total APY",
  pmjjby: "Total PMJJBY",
  pmsby: "Total PMSBY"
};

/** The four clickable cards always use the exact same date/search-filtered
 * records as their totals; each scheme card lists only true enrollments. */
export function ssaCardRows(entries: SsaCampaignEntry[], card: SsaCardKind): SsaCampaignEntry[] {
  if(card === "total") return entries;
  return entries.filter(entry => entry[card] === true);
}

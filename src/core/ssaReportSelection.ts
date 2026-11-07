import type { SsaCampaignEntry } from "./schema";

export type SsaReportPeriod = "all" | "month" | "day" | "range";
export type SsaReportAudience = "all" | "customer";
export type SsaReportKind = "pdf" | "excel" | "share" | "print";

export type SsaReportSelection = {
  period: SsaReportPeriod;
  month: string;
  day: string;
  from: string;
  to: string;
  audience: SsaReportAudience;
  accountNo: string;
};

const isoDay = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isoMonth = /^\d{4}-(0[1-9]|1[0-2])$/;
const asRealDay = (value: string) => {
  if (!isoDay.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export function selectSsaReportEntries(entries: SsaCampaignEntry[], selection: SsaReportSelection): {
  rows: SsaCampaignEntry[];
  description: string;
} {
  let from = "0000-01-01", to = "9999-12-31";
  if (selection.period === "month") {
    if (!isoMonth.test(selection.month)) throw new Error("Select a valid report month.");
    const [year, month] = selection.month.split("-").map(Number);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    from = selection.month + "-01";
    to = selection.month + "-" + String(last).padStart(2, "0");
  } else if (selection.period === "day") {
    if (!asRealDay(selection.day)) throw new Error("Select a valid report day.");
    from = selection.day;
    to = selection.day;
  } else if (selection.period === "range") {
    if (!asRealDay(selection.from) || !asRealDay(selection.to))
      throw new Error("Select valid From and To dates.");
    if (selection.from > selection.to) throw new Error("From date must be on or before To date.");
    from = selection.from;
    to = selection.to;
  }
  const account = selection.accountNo.trim();
  if (selection.audience === "customer" && !account)
    throw new Error("Select an SSA customer by account number before generating the report.");
  const rows = entries
    .filter(row => row.entryDate >= from && row.entryDate <= to &&
      (selection.audience === "all" || row.accountNo === account))
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.accountNo.localeCompare(b.accountNo) ||
      a.entryId.localeCompare(b.entryId));
  const periodText = selection.period === "all" ? "All dates" :
    from === to ? from : from + " to " + to;
  return { rows, description: periodText + (selection.audience === "customer" ? " | Account: " + account : " | All SSA customers") };
}

export function ssaReportCounts(entries: SsaCampaignEntry[]) {
  return {
    entries: entries.length,
    apy: entries.filter(row => row.apy).length,
    pmjjby: entries.filter(row => row.pmjjby).length,
    pmsby: entries.filter(row => row.pmsby).length
  };
}

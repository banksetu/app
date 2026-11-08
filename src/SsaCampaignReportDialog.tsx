import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { SsaCampaignEntry } from "./core/ssaCampaign";
import {
  selectSsaReportEntries, ssaReportCounts,
  type SsaReportAudience, type SsaReportKind, type SsaReportPeriod, type SsaReportSelection
} from "./core/ssaReportSelection";
import "./SsaCampaignReportDialog.css";

const labels: Record<SsaReportKind, string> = {
  pdf: "Generate PDF", excel: "Generate Excel", share: "Share PDF", print: "Print A4"
};
const today = () => {
  const value = new Date();
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")].join("-");
};

export default function SsaCampaignReportDialog({
  kind, entries, hasMore, onClose, onGenerate
}: {
  kind: SsaReportKind;
  entries: SsaCampaignEntry[];
  hasMore: boolean;
  onClose: () => void;
  onGenerate: (selection: SsaReportSelection) => Promise<boolean>;
}) {
  const [period, setPeriod] = useState<SsaReportPeriod>("month");
  const [audience, setAudience] = useState<SsaReportAudience>("all");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [day, setDay] = useState(today());
  const [from, setFrom] = useState(today().slice(0, 7) + "-01");
  const [to, setTo] = useState(today());
  const [customerQuery, setCustomerQuery] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [busy, setBusy] = useState(false);
  const selection: SsaReportSelection = { period, audience, month, day, from, to, accountNo };
  const customers = useMemo(() => [...new Map(entries
    .filter(item => item.accountNo)
    .map(item => [item.accountNo, { accountNo: item.accountNo, name: item.name, customerId: item.customerId }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name)), [entries]);
  const matches = useMemo(() => {
    const query = customerQuery.trim().toLocaleLowerCase();
    return (query ? customers.filter(row => [row.accountNo, row.name, row.customerId]
      .some(value => value.toLocaleLowerCase().includes(query))) : customers).slice(0, 25);
  }, [customerQuery, customers]);
  let preview: ReturnType<typeof selectSsaReportEntries> | null = null, validationError = "";
  try { preview = selectSsaReportEntries(entries, selection); }
  catch (error) { validationError = error instanceof Error ? error.message : "Invalid report selection."; }
  const counts = ssaReportCounts(preview?.rows || []);
  const incomplete = hasMore && (period === "all" || audience === "all");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  const submit = async () => {
    if (busy || validationError || !preview?.rows.length || incomplete) return;
    setBusy(true);
    try { await onGenerate(selection); }
    finally { setBusy(false); }
  };
  return createPortal(
    <div className="ssa-export-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="ssa-export-dialog" role="dialog" aria-modal="true" aria-labelledby="ssa-export-title">
        <header className="ssa-export-heading">
          <div><h2 id="ssa-export-title">{labels[kind]}</h2>
            <p>Select exactly which SSA Campaign records to include.</p></div>
          <button type="button" aria-label="Close report options" onClick={onClose} disabled={busy}>×</button>
        </header>
        <div className="ssa-export-body">
          <fieldset className="ssa-export-group">
            <legend>1. Which customers?</legend>
            <label><input type="radio" name="ssa-audience" checked={audience === "all"}
              onChange={() => setAudience("all")} /> All SSA customers</label>
            <label><input type="radio" name="ssa-audience" checked={audience === "customer"}
              onChange={() => setAudience("customer")} /> One customer (search by account number or name)</label>
            {audience === "customer" && <div className="ssa-export-customer">
              <input type="search" aria-label="Search SSA customer" placeholder="Account number, customer ID or name"
                value={customerQuery} onChange={event => { setCustomerQuery(event.target.value); setAccountNo(""); }} />
              <div className="ssa-export-matches" role="listbox" aria-label="Matching SSA customers">
                {matches.map(item => <button type="button" role="option" aria-selected={accountNo === item.accountNo}
                  key={item.accountNo} onClick={() => { setAccountNo(item.accountNo); setCustomerQuery(item.accountNo); }}>
                  <strong>{item.name}</strong><span>{item.accountNo} · {item.customerId}</span>
                </button>)}
                {!matches.length && <p>No matching SSA entries found.</p>}
              </div>
              {accountNo && <small className="ssa-export-selected">Selected account: {accountNo}</small>}
            </div>}
          </fieldset>
          <fieldset className="ssa-export-group">
            <legend>2. Which date or period?</legend>
            <div className="ssa-export-options">
              <label><input type="radio" name="ssa-period" checked={period === "month"} onChange={() => setPeriod("month")} /> One month</label>
              <label><input type="radio" name="ssa-period" checked={period === "day"} onChange={() => setPeriod("day")} /> One day</label>
              <label><input type="radio" name="ssa-period" checked={period === "range"} onChange={() => setPeriod("range")} /> Date range</label>
              <label><input type="radio" name="ssa-period" checked={period === "all"} onChange={() => setPeriod("all")} /> All dates</label>
            </div>
            {period === "month" && <label className="ssa-export-date">Select month
              <input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>}
            {period === "day" && <label className="ssa-export-date">Select date
              <input type="date" value={day} onChange={event => setDay(event.target.value)} /></label>}
            {period === "range" && <div className="ssa-export-date-row">
              <label className="ssa-export-date">From<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
              <label className="ssa-export-date">To<input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} /></label>
            </div>}
          </fieldset>
          <div className="ssa-export-preview" aria-live="polite">
            <strong>{counts.entries} matching entries</strong>
            <span>APY {counts.apy} · PMJJBY {counts.pmjjby} · PMSBY {counts.pmsby}</span>
            {preview && <small>{preview.description}</small>}
          </div>
          {validationError && <p className="ssa-export-error" role="alert">{validationError}</p>}
          {incomplete && <p className="ssa-export-error" role="alert">
            More SSA records are available in Google Sheet. Load the complete list before exporting this broad selection.
          </p>}
          <p className="ssa-export-note">{kind === "share" ?
            "A real PDF file containing only these selected records will be shared if file sharing is supported." :
            kind === "print" ? "The selected rows will print as an A4 landscape table, with additional A4 pages if needed." :
            "Only the matching SSA Campaign records will be included."}</p>
        </div>
        <footer className="ssa-export-actions">
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="ssa-export-primary" onClick={() => void submit()}
            disabled={busy || !!validationError || !counts.entries || incomplete}>
            {busy ? "Preparing…" : labels[kind] + " (" + counts.entries + ")"}
          </button>
        </footer>
      </section>
    </div>, document.body
  );
}

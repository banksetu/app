import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { bankTemplateValue, renderBankSamplePages, type BankFieldPlacement } from "./bankFormatUtils";
import { getTenantApiUrl } from "./tenantApi";
import { templateMatchesBank } from "./bankDocumentPolicy";

type FormatType = "passbook" | "quickPassbook" | "accountOpening";
type FormatSettings = { bankKey?: string; fileId?: string; fieldMap?: BankFieldPlacement[]; pageWidthMm?: number; pageHeightMm?: number };

export default function BankFormatPrint({
  formatType, customer, onConfigured, onPrint, bankName, allowPrint = true,
}: { bankName?: string; allowPrint?: boolean; formatType: FormatType; customer: object; onConfigured: (active: boolean) => void; onPrint?: () => void }) {
  const [sources, setSources] = useState<string[]>([]);
  const [settings, setSettings] = useState<FormatSettings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setSources([]); setSettings(null); setError(""); onConfigured(false);
    const load = async () => {
      const tenantId = sessionStorage.getItem("bankSetuTenantId")?.trim() || "";
      if (!tenantId) throw new Error("A Client Admin must upload the selected bank samples in their connected workspace.");
      const snapshot = await getDoc(doc(db, "tenantSettings", tenantId));
      const data = snapshot.data();
      const selected = (data?.bankFormats?.[formatType] || {}) as FormatSettings;
      if (bankName && !templateMatchesBank(selected, bankName)) throw new Error("Upload this selected bank\'s sample in Bank Formats first.");
      if (!selected.fileId || !Array.isArray(selected.fieldMap) || selected.fieldMap.length === 0) {
        throw new Error("Upload this document sample and save its field layout in Bank Formats first.");
      }
      const apiUrl = String(data?.apiUrl || getTenantApiUrl() || "");
      const user = auth.currentUser;
      if (!user || !apiUrl) throw new Error("Sign in and connect this client workspace before printing its bank format.");
      const response = await fetch(apiUrl, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "getBankFormatPreview", idToken: await user.getIdToken(), formatType }),
      });
      const result = await response.json() as { success?: boolean; data?: string; mimeType?: string; message?: string };
      if (!response.ok || !result.success || !result.data || !result.mimeType) {
        throw new Error(result.message || "The saved bank sample could not be loaded. Deploy the latest Apps Script version.");
      }
      const rendered = await renderBankSamplePages(`data:${result.mimeType};base64,${result.data}`, result.mimeType);
      if (!active) return;
      setSources(rendered.map((page) => page.dataUrl));
      setSettings(selected);
      onConfigured(true);
    };
    void load().catch((reason: unknown) => {
      if (!active) return;
      onConfigured(false);
      setError(reason instanceof Error ? reason.message : "The saved bank sample could not be loaded.");
    });
    return () => { active = false; };
  }, [formatType, onConfigured, bankName]);

  if (!settings?.fieldMap?.length || !sources.length) return error ? <p role="alert" className="bank-format-print-error">{error}</p> : null;
  const values = customer as Record<string, unknown>;
  const pageWidthMm = settings.pageWidthMm || (formatType === "accountOpening" ? 210 : 205);
  const pageHeightMm = settings.pageHeightMm || (formatType === "accountOpening" ? 297 : 175);

  return <section className="bank-format-print-wrap">
    <div className="bank-format-print-actions"><span>Bank sample layout ready · {settings.fieldMap.length} mapped fields</span><button type="button" disabled={!allowPrint} onClick={() => onPrint ? onPrint() : window.print()}>Print bank format</button></div>
    <div className="bank-format-print-document" aria-label="Mapped bank document preview">
      {sources.map((source, pageIndex) => <section key={pageIndex} className="bank-format-print" style={{ width: `${pageWidthMm}mm`, height: `${pageHeightMm}mm`, backgroundImage: `url(${source})` }}>
        {settings.fieldMap!.filter((placement) => (placement.page || 1) === pageIndex + 1).map((placement) => {
          const value = bankTemplateValue(values, placement.field);
          const placementStyle = { left: `${placement.x}%`, top: `${placement.y}%`, width: `${placement.width}%`, fontSize: `${placement.fontSize}px`, textAlign: placement.align, textTransform: placement.uppercase ? "uppercase" : "none" } as const;
          if (placement.field === "customerPhoto") {
            const photo = String(values.photoPreview ?? values.photoUrl ?? "");
            return photo ? <img key={placement.field} alt="Customer" src={photo} style={{ ...placementStyle, position: "absolute", height: `${placement.width * .8}%`, objectFit: "cover" }} /> : null;
          }
          return <span key={placement.field} style={placementStyle}>{value}</span>;
        })}
      </section>)}
    </div>
    <style>{`
      .bank-format-print-wrap { margin: 22px auto; max-width: 100%; overflow-x: auto; }
      .bank-format-print-actions { display:flex; justify-content:center; align-items:center; gap:14px; margin:0 auto 12px; color:#d9eaf1; font-size:13px; }
      .bank-format-print-actions button { padding:10px 15px; border:0; border-radius:8px; background:#ffd166; color:#342300; font-weight:800; cursor:pointer; }
      .bank-format-print { position:relative; margin:0 auto; background-size:100% 100%; background-repeat:no-repeat; background-color:white; overflow:hidden; color:#111; box-shadow:0 8px 24px rgba(0,0,0,.24); }
      .bank-format-print:not(:last-child) { break-after:page; }
      .bank-format-print > span { position:absolute; display:block; white-space:pre-wrap; line-height:1.1; overflow:hidden; }
      @page { size:${pageWidthMm}mm ${pageHeightMm}mm; margin:0; }
      @media print {
        html, body { margin:0!important; padding:0!important; background:white!important; }
        body * { visibility:hidden!important; }
        .custom-bank-document > :not(.bank-format-print-wrap) { display:none!important; }
        .custom-bank-document { position:absolute!important; left:0!important; top:0!important; padding:0!important; margin:0!important; }
        .bank-format-print-actions { display:none!important; }
        .bank-format-print-wrap { margin:0!important; overflow:visible!important; }
        .bank-format-print-document { margin:0!important; }
        .bank-format-print, .bank-format-print * { visibility:visible!important; }
        .bank-format-print { position:relative!important; left:auto!important; top:auto!important; margin:0!important; box-shadow:none!important; }
        .bank-format-print:not(:last-child) { break-after:page!important; }
      }
    `}</style>
  </section>;
}

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readTextTemplate, type TextTemplatePage } from "./pdfTextTemplate";
import { localDataFetch, getDataIdToken } from "./core/localData";
import { useEffect, useState } from "react";
import { doc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "./firebase";
import { bankTemplateValue, renderBankSamplePages, type BankFieldPlacement } from "./bankFormatUtils";
import { getTenantApiUrl } from "./tenantApi";
import { templateMatchesBank } from "./bankDocumentPolicy";

type FormatType = "passbook" | "quickPassbook" | "accountOpening";
type FormatSettings = { bankKey?: string; fileId?: string; fieldMap?: BankFieldPlacement[]; extractionMap?: BankFieldPlacement[]; pageWidthMm?: number; pageHeightMm?: number };

export default function BankFormatPrint({
  formatType, customer, onConfigured, onPrint, bankName, allowPrint = true,
}: { bankName?: string; allowPrint?: boolean; formatType: FormatType; customer: object; onConfigured: (active: boolean) => void; onPrint?: () => void }) {
  const [textPages, setTextPages] = useState<TextTemplatePage[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [settings, setSettings] = useState<FormatSettings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setTextPages([]); setSources([]); setSettings(null); setError(""); onConfigured(false);
    const load = async () => {
      const tenantId = sessionStorage.getItem("bankSetuTenantId")?.trim() || "";
      if (!tenantId) throw new Error("A Client Admin must upload the selected bank samples in their connected workspace.");
      const snapshot = await getDocFromServer(doc(db, "tenantSettings", tenantId));
      const data = snapshot.data();
      const selected = (data?.bankFormats?.[formatType] || {}) as FormatSettings;
      if (bankName && !templateMatchesBank(selected, bankName)) throw new Error("Upload this selected bank\'s sample in Bank Formats first.");
      if (!selected.fileId) throw new Error("No saved sample found. Upload this document sample in Bank Formats.");
      if (formatType !== "accountOpening" && (!Array.isArray(selected.fieldMap) || selected.fieldMap.length === 0)) throw new Error("Your sample is saved. Its PRINT mapping is missing: Bank Formats → Edit field layout → कहाँ print करें → Save print layout. Reading sections are saved separately.");
      const apiUrl = String(data?.apiUrl || getTenantApiUrl() || "");
      const user = auth.currentUser;
      if (!user || !apiUrl) throw new Error("Sign in and connect this client workspace before printing its bank format.");
      const response = await localDataFetch(apiUrl, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "getBankFormatPreview", idToken: await getDataIdToken(), formatType }),
      });
      const result = await response.json() as { success?: boolean; data?: string; mimeType?: string; message?: string };
      if (!response.ok || !result.success || !result.data || !result.mimeType) {
        throw new Error(result.message || "The saved bank sample could not be loaded. Deploy the latest Apps Script version.");
      }
      if(formatType === "accountOpening") {
        if(!result.mimeType.includes("pdf"))throw new Error("Account Opening text template needs a readable PDF.");
        const task=getDocument({data:Uint8Array.from(atob(result.data),char=>char.charCodeAt(0))});
        try {
          const template=await readTextTemplate(await task.promise);
          if(!template.some(page=>page.runs.length))throw new Error("Readable PDF labels could not be identified. Check the sample's text layer.");
          const automatic=template.flatMap(page=>page.fields);
          const manual=selected.fieldMap||[];
          const photo=selected.extractionMap?.find(item=>item.field==="customerPhoto");
          if(photo&&!manual.some(item=>item.field==="customerPhoto"))automatic.push({...photo});
          const merged=[...automatic.filter(field=>!manual.some(item=>item.field===field.field&&(item.page||1)===(field.page||1))),...manual];
          if(active){setTextPages(template);setSettings({...selected,fieldMap:merged});onConfigured(true);}
          return;
        } finally {await task.destroy();}
      }
      const rendered = await renderBankSamplePages(`data:${result.mimeType};base64,${result.data}`, result.mimeType, selected.extractionMap || []);
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

  if (!settings?.fieldMap?.length || (!sources.length && !textPages.length)) return error ? <p role="alert" className="bank-format-print-error">{error}</p> : null;
  const values = customer as Record<string, unknown>;
  const pageWidthMm = settings.pageWidthMm || (formatType === "accountOpening" ? 210 : 205);
  const pageHeightMm = settings.pageHeightMm || (formatType === "accountOpening" ? 297 : 175);

  return <section className="bank-format-print-wrap">
    <div className="bank-format-print-actions"><span>Bank sample layout ready · {settings.fieldMap.length} mapped fields</span><button type="button" disabled={!allowPrint} onClick={() => onPrint ? onPrint() : window.print()}>Print bank format</button></div>
    <div className="bank-format-print-document" aria-label="Mapped bank document preview">
      {(textPages.length ? textPages.map(()=>"") : sources).map((source, pageIndex) => <section key={pageIndex} className="bank-format-print" style={{ width: `${pageWidthMm}mm`, height: `${textPages[pageIndex] ? pageWidthMm*textPages[pageIndex].height/textPages[pageIndex].width : pageHeightMm}mm`, backgroundImage: `url(${source})` }}>
        {textPages.length && pageIndex===0 && values.templateLogo ? <img alt="Bank logo" src={String(values.templateLogo)} style={{position:"absolute",left:"5%",top:"1%",width:"8%",height:"6%",objectFit:"contain"}} /> : null}
        {textPages[pageIndex]?.runs.map((run,index)=><span key={`label-${index}`} style={{left:`${run.x/textPages[pageIndex].width*100}%`,top:`${run.y/textPages[pageIndex].height*100}%`,width:`${run.width/textPages[pageIndex].width*100}%`,fontSize:`${run.fontSize}px`,color:"#111"}}>{run.text}</span>)}
        {settings.fieldMap!.filter((placement) => (placement.page || 1) === pageIndex + 1).map((placement) => {
          const value = bankTemplateValue(values, placement.field);
          const placementStyle = { left: `${placement.x}%`, top: `${placement.y}%`, width: `${placement.width}%`, fontSize: `${placement.fontSize}px`, textAlign: placement.align, textTransform: placement.uppercase ? "uppercase" : "none" } as const;
          if (placement.field === "customerPhoto") {
            const photo = String(values.photoPreview ?? values.photoUrl ?? "");
            return photo ? <img key={`${placement.field}-${placement.x}-${placement.y}`} alt="Customer" src={photo} style={{ ...placementStyle, position: "absolute", height: `${placement.height || placement.width * .8}%`, objectFit: "cover" }} /> : null;
          }
          return <span key={`${placement.field}-${placement.x}-${placement.y}`} style={placementStyle}>{value}</span>;
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

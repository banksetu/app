import { isAndroid, printAndroidDocument } from "./android/runtime";

export type PrintOutcome = { accepted: boolean; cancelled?: boolean; confirmation: "printer" | "dialog" };

declare global {
  interface Window {
    bankSetuPrintJob?: (options?: { duplex?: boolean }) => Promise<{accepted?:boolean;cancelled?:boolean}>;
  }
}

export async function printCurrentDocument(duplex: boolean): Promise<PrintOutcome> {
  if (window.bankSetuPrintJob) {
    const result = await window.bankSetuPrintJob({duplex});
    return {accepted:result.accepted === true,cancelled:result.cancelled === true,confirmation:"printer"};
  }
  if (isAndroid()) {
    await printAndroidDocument(duplex);
    return {accepted:false,confirmation:"dialog"};
  }
  window.print();
  return {accepted:false,confirmation:"dialog"};
}

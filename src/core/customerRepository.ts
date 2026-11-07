import { indexedDbRepository } from "../platform/web/indexedDbRepository";
import type { CustomerRepository, LocalState } from "./schema";
import type { LicenseReceipt } from "./licenseReceipt";
declare global {
  interface Window { bankSetuDesktop?: {
    read(scope: string): Promise<LocalState>;
    storage(): Promise<{ path: string; databasePath: string; usedBytes: number; freeBytes: number | null; totalBytes: number | null }>;
    recoveryStatus(scope:string):Promise<{pending:boolean;downloaded:number;cursor:number;completed:boolean;originalFound:boolean}>;
    completeRecovery(scope:string,count:number,revision:string):Promise<boolean>;
    commit(scope: string, before: LocalState, after: LocalState, receipt?: LicenseReceipt): Promise<void>;
    licenseSession(uid:string): Promise<void>;
    licenseStatus(authorization:LicenseReceipt): Promise<void>;
    licenseReceipt(receipt:LicenseReceipt): Promise<void>;
    version(): Promise<string>;
    checkUpdate(): Promise<unknown>;
    installUpdate(): Promise<void>;
    notify?(value:import('../platform/systemNotifications').SystemNotice):Promise<void>;
    onNotificationOpen?(callback:(page:string)=>void):()=>void;
    onAppMenuNavigate?(callback:(page:string)=>void):()=>void;
  } }
}
let serial: Promise<unknown> = Promise.resolve();
export const customerRepository: CustomerRepository = {
  read(scope) { return window.bankSetuDesktop ? window.bankSetuDesktop.read(scope) : indexedDbRepository.read(scope); },
  transact(scope, change) {
    if (!window.bankSetuDesktop) return indexedDbRepository.transact(scope, change);
    const run = serial.catch(() => undefined).then(async () => {
      const before = await window.bankSetuDesktop!.read(scope);
      const after = structuredClone(before); change(after);
      let receipt: LicenseReceipt | undefined;
      if (!scope.startsWith("offline:")) {
        try {
          const uid=scope.split(":",1)[0];
          const tenant=sessionStorage.getItem("bankSetuTenantId");
          if(tenant)receipt=(JSON.parse(localStorage.getItem(`bankSetuLicenseReceipt:${uid}:${tenant}`)||"null") as {receipt?:LicenseReceipt}|null)?.receipt;
        } catch { /* Native IPC verifies signed authorization independently. */ }
      }
      await window.bankSetuDesktop!.commit(scope, before, after, receipt);
    });
    serial = run; return run;
  },
};

import { indexedDbRepository } from "../platform/web/indexedDbRepository";
import type { CustomerRepository, LocalState } from "./schema";
declare global {
  interface Window { bankSetuDesktop?: {
    read(scope: string): Promise<LocalState>;
    storage(): Promise<{ path: string; databasePath: string; usedBytes: number; freeBytes: number | null; totalBytes: number | null }>;
    commit(scope: string, before: LocalState, after: LocalState): Promise<void>;
    version(): Promise<string>;
    checkUpdate(): Promise<unknown>;
    installUpdate(): Promise<void>;
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
      await window.bankSetuDesktop!.commit(scope, before, after);
    });
    serial = run; return run;
  },
};

import type { CustomerRepository, LocalState } from "../../core/schema";
let opened: Promise<IDBDatabase> | undefined;
const writeError=(error:unknown)=>error instanceof DOMException && error.name==='QuotaExceededError'
  ? new Error('Device or WebView storage is full. The customer was not saved. Free device space and retry; existing records and pending sync remain intact.')
  : error || new Error('Local save failed; record was not queued.');
function database() {
  return opened ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("banksetu-local-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspaces");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opened = undefined; reject(request.error); };
  });
}
export const indexedDbRepository: CustomerRepository = {
  async read(scope) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("workspaces", "readonly");
      const request = tx.objectStore("workspaces").get(scope);
      request.onsuccess = () => resolve(request.result || {records:[], operations:[]});
      request.onerror = () => reject(request.error);
    });
  },
  async transact(scope, change) {
    const db = await database();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("workspaces", "readwrite");
      const store = tx.objectStore("workspaces");
      const request = store.get(scope);
      request.onsuccess = () => {
        try {
          const state: LocalState = request.result || {records:[], operations:[]};
          change(state); store.put(state, scope);
        } catch (error) { tx.abort(); reject(writeError(error)); }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(writeError(tx.error));
      tx.onabort = () => reject(writeError(tx.error));
    });
  },
};

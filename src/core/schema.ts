import type { SignedSession } from "./offlineSession";
export type Customer = Record<string, unknown>;
export type CachedRecord = { key: string; scope: string; recordId: string; rowNumber: number; revision: string; customer: Customer; pending: boolean; deleted?: boolean; cachedAt?: number; photoCheckedAt?: number; photoMissingRef?: string; photoRetryAt?: number; photoFailures?: number; photoLastError?: string };
export type QueueOperation = { key: string; scope: string; operationId: string; recordId: string; action: string; statusOnly?: boolean; validationMode?: "full"; customer: Customer; baseRevision: string; rowNumber: number; createdAt: number; state: "pending" | "conflict" | "failed"; error?: string; remoteCustomer?: Customer; conflictSource?: "backup" | "google" };
export type LocalState = { records: CachedRecord[]; operations: QueueOperation[]; photoDiscoveryError?:string; photoIndex?: import("./photoState").PhotoIndex; photoPresence?: {checkedAt:number;customerIds:string[]}; resetId?: string; documents?: Record<string, unknown>; offlineSession?: SignedSession; pull?: {remoteRevision?:string; changeCursor?:number; changeEpoch?:string; lastFullCheckAt?:number; lastCompletedAt?:number; cacheLimited?: boolean; pageSize?: number; pageSuccesses?: number; changePending?:boolean; cursor: number; seen: string[]; startedAt: number} };
export interface CustomerRepository {
  read(scope: string): Promise<LocalState>;
  transact(scope: string, change: (state: LocalState) => void): Promise<void>;
}

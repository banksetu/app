import type { SignedSession } from "./offlineSession";
export type Customer = Record<string, unknown>;
export type CachedRecord = { key: string; scope: string; recordId: string; rowNumber: number; revision: string; customer: Customer; pending: boolean; deleted?: boolean; cachedAt?: number; photoCheckedAt?: number; photoMissingRef?: string };
export type QueueOperation = { key: string; scope: string; operationId: string; recordId: string; action: string; customer: Customer; baseRevision: string; rowNumber: number; createdAt: number; state: "pending" | "conflict" | "failed"; error?: string; remoteCustomer?: Customer; conflictSource?: "backup" | "google" };
export type LocalState = { records: CachedRecord[]; operations: QueueOperation[]; resetId?: string; documents?: Record<string, unknown>; offlineSession?: SignedSession; pull?: {cursor: number; seen: string[]; startedAt: number; lastCompletedAt?: number; cacheLimited?: boolean} };
export interface CustomerRepository {
  read(scope: string): Promise<LocalState>;
  transact(scope: string, change: (state: LocalState) => void): Promise<void>;
}

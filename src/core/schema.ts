export type Customer = Record<string, unknown>;
export type CachedRecord = { key: string; scope: string; recordId: string; rowNumber: number; revision: string; customer: Customer; pending: boolean; deleted?: boolean };
export type QueueOperation = { key: string; scope: string; operationId: string; recordId: string; action: string; customer: Customer; baseRevision: string; rowNumber: number; createdAt: number; state: "pending" | "conflict" | "failed"; error?: string; remoteCustomer?: Customer };
export type LocalState = { records: CachedRecord[]; operations: QueueOperation[]; documents?: Record<string, unknown> };
export interface CustomerRepository {
  read(scope: string): Promise<LocalState>;
  transact(scope: string, change: (state: LocalState) => void): Promise<void>;
}

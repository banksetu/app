import { getActiveLocalCustomers, identity as localIdentity } from "./core/localData";

export type CachedCustomer = Record<string, unknown> & { rowNumber?: number; recordId?: string };

const customerListCache = new Map<string, CachedCustomer[]>();

export const customerListScope = () => localIdentity();
export const readCustomerListCache = (scope: string) => customerListCache.get(scope) || [];

export function writeCustomerListCache(scope: string, customers: CachedCustomer[]) {
  customerListCache.set(scope, customers);
  if (customerListCache.size > 3) customerListCache.delete(customerListCache.keys().next().value!);
}

export async function preloadAllCustomerData() {
  const scope = customerListScope();
  if (customerListCache.has(scope)) return;
  writeCustomerListCache(scope, await getActiveLocalCustomers());
}

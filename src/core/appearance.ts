export type Appearance = 'light' | 'dark';

export function appearanceStorageKey(uid: string, tenantId: string) {
  return `bankSetuAppearance:${encodeURIComponent(uid)}:${encodeURIComponent(tenantId)}`;
}

export function storedAppearance(storage: Pick<Storage, 'getItem'>, uid: string, tenantId: string): Appearance {
  if (!uid || !tenantId) return 'light';
  return storage.getItem(appearanceStorageKey(uid, tenantId)) === 'dark' ? 'dark' : 'light';
}

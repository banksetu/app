export type Appearance = 'light' | 'dark' | 'glass';

export function appearanceStorageKey(uid: string, tenantId: string) {
  return `bankSetuAppearance:${encodeURIComponent(uid)}:${encodeURIComponent(tenantId)}`;
}
export function storedAppearance(storage: Pick<Storage, 'getItem'>, uid: string, tenantId: string): Appearance {
  if (!uid || !tenantId) return 'light';
  try {
    const mode=storage.getItem(appearanceStorageKey(uid, tenantId));
    return mode==='light'||mode==='dark'||mode==='glass'?mode:'light';
  }catch{return 'light';}
}

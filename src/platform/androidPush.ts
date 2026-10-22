import { Capacitor, registerPlugin } from '@capacitor/core';
import { auth } from '../firebase';

const native = registerPlugin<{
  bindPushAccount(value:{uid:string;tenantId:string;deviceId:string;refreshToken:string;worker:string}):Promise<void>;
  requestPermissions(): Promise<{ granted: boolean }>;
  getPushToken(): Promise<{ token: string }>;
  clearPushToken(): Promise<void>;
}>('BankSetuNotifications');
const worker = String(import.meta.env.VITE_BANKSETU_WORKER_URL || '').replace(/\/+$/, '');
const key = 'bankSetuPushDeviceId';
const accountKey = 'bankSetuPushAccountUid';
let lastAccount = localStorage.getItem(accountKey) || '';

async function deviceId() {
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
}

export async function registerAndroidPush() {
  if (Capacitor.getPlatform() !== 'android' || !worker || !navigator.onLine) return;
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;
  try {
    if (lastAccount && lastAccount !== uid) {
      try { await native.clearPushToken(); } catch { /* Rebind the existing token to this account below. */ }
      lastAccount = ''; localStorage.removeItem(accountKey);
    }
    if (localStorage.getItem('bankSetuSystemNotifications') === 'off') { await unregisterAndroidPush(); return; }
    const permission = await native.requestPermissions();
    if (!permission.granted || auth.currentUser?.uid !== uid) { if (!permission.granted) await unregisterAndroidPush(); return; }
    const tenantId=sessionStorage.getItem('bankSetuTenantId');
    if(!tenantId)return;
    await native.bindPushAccount({uid,tenantId,deviceId:await deviceId(),refreshToken:user.refreshToken,worker});
    const { token } = await native.getPushToken();
    if (auth.currentUser?.uid !== uid) return;
    const response = await fetch(`${worker}/push-register`, {
      method: 'POST', headers: { authorization: `Bearer ${await user.getIdToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ platform: 'android', deviceId: await deviceId(), token, scopedData:true }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok && auth.currentUser?.uid === uid) { lastAccount = uid; localStorage.setItem(accountKey,uid); }
  } catch { /* Push cannot block sign-in or customer data. Try on next app resume. */ }
}

export async function unregisterAndroidPush() {
  if (Capacitor.getPlatform() !== 'android') return;
  const user = auth.currentUser;
  try {
    if (user && worker && navigator.onLine) await fetch(`${worker}/push-unregister`, {
      method: 'POST', headers: { authorization: `Bearer ${await user.getIdToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: await deviceId() }), signal: AbortSignal.timeout(5000),
    });
  } catch { /* Native token invalidation still revokes the device. */ }
  try { await native.clearPushToken(); } catch { /* Retry on next account change. */ }
  lastAccount = '';
  localStorage.removeItem(accountKey);
}

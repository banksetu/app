import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const values = new Map();
const source = ts.transpileModule(readFileSync(new URL('../src/core/licenseReceipt.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(source, { exports, require: () => jwk, crypto: webcrypto, atob, TextEncoder, Uint8Array, Date, JSON, localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem:key=>values.delete(key) } });
const create = (claims) => {
  const payload = JSON.stringify(claims);
  return { payload, signature: sign('sha256', Buffer.from(payload), privateKey).toString('base64url') };
};

test('signed tenant license receipt is bounded and cannot be forged or reused for another workspace', async () => {
  const now = Date.now();
  const claims = { purpose: 'banksetu-license-v1', uid: 'uid-a', tenantId: 'tenant-a', revision: 1, state: 'active', plan: 'annual', issuedAt: now, validUntil: now + 8 * 3600000, expiresAt: new Date(now + 365 * 86400000).toISOString() };
  const receipt = create(claims);
  assert.equal((await exports.verifyLicenseReceipt(receipt, 'uid-a', 'tenant-a', now)).tenantId, 'tenant-a');
  await assert.rejects(exports.verifyLicenseReceipt(receipt, 'uid-a', 'tenant-b', now));
  await assert.rejects(exports.verifyLicenseReceipt({ ...receipt, payload: receipt.payload.replace('active', 'grace') }, 'uid-a', 'tenant-a', now));
  await assert.rejects(exports.verifyLicenseReceipt(receipt, 'uid-a', 'tenant-a', now + 8 * 3600000 + 1));
  await assert.rejects(exports.verifyLicenseReceipt(receipt, 'uid-a', 'tenant-a', now - 3600000, now));
  exports.saveLicenseReceipt(receipt, 'uid-a', 'tenant-a', now);
  assert.equal((await exports.cachedLicenseReceipt('uid-a', 'tenant-a')).uid, 'uid-a');
});

test('signed sample demo receipt ends exactly at server expiry and cannot use paid state',async()=>{
 const now=Date.now();
 const claims={purpose:'banksetu-license-v1',uid:'uid-demo',tenantId:'tenant-demo',revision:1,state:'demo_active',plan:'demo',issuedAt:now,validUntil:now+86400000,expiresAt:new Date(now+5*86400000).toISOString()};
 assert.equal((await exports.verifyLicenseReceipt(create(claims),'uid-demo','tenant-demo',now)).plan,'demo');
 await assert.rejects(exports.verifyLicenseReceipt(create({...claims,state:'active'}),'uid-demo','tenant-demo',now));
 await assert.rejects(exports.verifyLicenseReceipt(create({...claims,validUntil:now+6*86400000}),'uid-demo','tenant-demo',now));
});

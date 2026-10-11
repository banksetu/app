import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FLAGS, DEFAULT_PRICING, validatePricing, validateInquiry, addCalendarYear, licenseView, upgradeAmount, transitionLicense } from './licensing.js';

test('missing tenant entitlement never grants client write access', () => {
  assert.equal(DEFAULT_FLAGS.existingClientEnforcement, false);
  assert.equal(DEFAULT_FLAGS.newClientRequired, true);
  assert.deepEqual(licenseView(null, Date.now()), {state:'pending',daysRemaining:null,canWrite:false});
});
test('annual expiry uses calendar year including leap days and renewal extends existing expiry', () => {
  assert.equal(addCalendarYear('2024-02-29T12:00:00.000Z'), '2025-02-28T12:00:00.000Z');
  const first=transitionLicense(null,{kind:'annual',id:'one',quotedPaise:149900},'2024-02-29T12:00:00.000Z',DEFAULT_PRICING);
  assert.equal(first.expiresAt,'2025-02-28T12:00:00.000Z');
  const renewed=transitionLicense(first,{kind:'renewal',id:'two',quotedPaise:150000},'2025-01-01T12:00:00.000Z',DEFAULT_PRICING);
  assert.equal(renewed.expiresAt,'2026-02-28T12:00:00.000Z');
  assert.equal(renewed.revision,2);
  const expired=transitionLicense(first,{kind:'renewal',id:'three',quotedPaise:150000},'2025-03-20T12:00:00.000Z',DEFAULT_PRICING);
  assert.equal(expired.expiresAt,'2026-03-20T12:00:00.000Z');
});
test('annual expiry blocks new writes at the exact timestamp without a write-enabled grace period',()=>{
  const record={tenantId:'same',plan:'annual',status:'active',expiresAt:'2026-10-10T00:00:00.000Z',paidPaise:149900};
  assert.equal(licenseView(record,Date.parse('2026-09-15T00:00:00Z')).state,'expiring_soon');
  assert.equal(licenseView(record,Date.parse('2026-10-09T23:59:59.999Z')).canWrite,true);
  assert.deepEqual(licenseView(record,Date.parse('2026-10-10T00:00:00Z')),{state:'expired',daysRemaining:0,canWrite:false});
  assert.equal(licenseView(record,Date.parse('2026-10-18T00:00:00Z')).state,'expired');
  const next=transitionLicense(record,{kind:'upgrade',id:'upgrade',quotedPaise:350000},'2026-10-18T00:00:00Z',DEFAULT_PRICING);
  assert.equal(next.tenantId,'same');assert.equal(next.plan,'lifetime');assert.equal(next.expiresAt,null);
  assert.equal(licenseView(next,Date.parse('2030-10-18T00:00:00Z')).state,'active');
});
test('future India activation remains scheduled and calendar month duration clamps leap day',()=>{
  const now='2024-02-20T10:00:00.000Z';
  const future='2024-02-28T18:30:00.000Z';
  const license=transitionLicense(null,{kind:'annual',id:'future',quotedPaise:149900,startAt:future,durationMonths:12},now,DEFAULT_PRICING);
  assert.equal(license.status,'scheduled');
  assert.equal(license.expiresAt,'2025-02-27T18:30:00.000Z');
  assert.equal(licenseView(license,Date.parse(now)).canWrite,false);
  assert.equal(licenseView(license,Date.parse(future)).canWrite,true);
  assert.throws(()=>transitionLicense(null,{kind:'annual',startAt:'invalid',durationMonths:1},now,DEFAULT_PRICING));
});
test('prices are exact paise and upgrade credit is bounded',()=>{
  const pricing=validatePricing({...DEFAULT_PRICING,annualPaise:149900,lifetimePaise:499900,annualAvailable:true,lifetimeAvailable:true,upgradeCreditEnabled:true,maxCreditPaise:149900});
  assert.deepEqual(upgradeAmount(pricing,{plan:'annual',paidPaise:149900}),{duePaise:350000,creditPaise:149900});
  assert.throws(()=>validatePricing({...pricing,annualPaise:1.5}));
  assert.throws(()=>validatePricing({...pricing,lifetimePaise:-1}));
});
test('inquiry validates size and fields without accepting arbitrary pricing',()=>{
  const input={name:'Person',mobile:'9876543210',email:'',bankName:'Bank CSP',location:'',message:'',plan:'annual',requestId:'01234567-89ab-4cde-8fab-0123456789ab',quotedPaise:1};
  assert(!('quotedPaise' in validateInquiry(input)));
  assert.throws(()=>validateInquiry({...input,mobile:'123'}));
  assert.throws(()=>validateInquiry({...input,message:'x'.repeat(501)}));
});

test('suspended and revoked states never turn into active status when expiry changes',()=>{
  for(const status of ['suspended','revoked']){
    const record={tenantId:'tenant-a',plan:'lifetime',status,expiresAt:null};
    assert.equal(licenseView(record,Date.parse('2035-01-01T00:00:00Z')).canWrite,false);
  }
  assert.throws(()=>transitionLicense({plan:'annual',status:'revoked',expiresAt:'2026-01-01T00:00:00Z',revision:1},{kind:'renewal',id:'x',quotedPaise:100},'2026-02-01T00:00:00Z',DEFAULT_PRICING));
});

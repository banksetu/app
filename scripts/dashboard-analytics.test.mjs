import test from 'node:test';
import assert from 'node:assert/strict';
import { customerAnalytics, customerEntryMonth } from '../src/core/dashboardAnalytics.ts';
import { appearanceStorageKey, storedAppearance } from '../src/core/appearance.ts';

test('growth uses real entry timestamps, excluding account opening dates and undated records', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  const data = customerAnalytics([
    { createdAt:'2025-01-10T00:00:00Z', accountOpeningDate:'2020-01-01' },
    { createdAt:'2026-09-10T00:00:00Z' },
    { createdAt:'2026-10-12T00:00:00Z' },
    { accountOpeningDate:'2026-10-01' },
    { createdAt:'2027-01-01T00:00:00Z' },
  ], now);
  assert.equal(data.known,3);
  assert.equal(data.undated,2);
  assert.equal(data.earlier,1);
  assert.deepEqual(data.months.slice(-2).map(month => [month.entries,month.growth]),[[1,2],[1,3]]);
  assert.equal(customerEntryMonth({accountOpeningDate:'2026-10-01'},now),null);
});

test('personal appearance cannot leak between users or tenants', () => {
  const saved = new Map([[appearanceStorageKey('user-a','tenant-a'),'dark']]);
  const storage = { getItem:key => saved.get(key) ?? null };
  assert.equal(storedAppearance(storage,'user-a','tenant-a'),'dark');
  assert.equal(storedAppearance(storage,'user-b','tenant-a'),'light');
  assert.equal(storedAppearance(storage,'user-a','tenant-b'),'light');
  assert.equal(storedAppearance(storage,'','tenant-a'),'light');
});

test('Sheet display dates and local/offline creation dates count in Indian calendar months',()=>{
 const now=new Date('2026-11-01T03:00:00+05:30');
 for(const createdAt of ['19/10/2026 2:30:10 PM','19-10-2026','19/10/2026, 14:30:10','2026-10-19','10/19/2026','2026-10-19 14:30:10'])assert.equal(customerEntryMonth({createdAt},now),'2026-10');
 assert.equal(customerEntryMonth({createdAt:'2026-10-31T20:00:00Z'},now),'2026-11');
 for(const createdAt of ['31/02/2026','99/99/2026','19/10/2026 25:00','not a date'])assert.equal(customerEntryMonth({createdAt},now),null);
 const result=customerAnalytics([{createdAt:'19/10/2026 14:30:00'},{createdAt:'2026-10-31T20:00:00Z'},{accountOpeningDate:'2026-10-19'}],now);
 assert.equal(result.known,2);assert.equal(result.undated,1);assert.equal(result.thisMonth,1);assert.equal(result.monthlyAverage,2/12);
});

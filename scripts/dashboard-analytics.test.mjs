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

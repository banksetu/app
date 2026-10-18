type Customer = Record<string, unknown>;
export type MonthPoint = { key: string; label: string; entries: number; growth: number };

// Only creation timestamps recorded by Bank Setu qualify as an entry date.
// Account opening dates and cache hydration times are not entry history.
export function customerEntryMonth(customer: Customer, now = new Date()): string | null {
  const raw = customer.createdAt;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime()) || date.getTime() > now.getTime() || date.getUTCFullYear() < 2000) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function customerAnalytics(customers: Customer[], now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const months: MonthPoint[] = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    return { key: date.toISOString().slice(0, 7), label: date.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }), entries: 0, growth: 0 };
  });
  const counts = new Map(months.map(month => [month.key, month]));
  let known = 0, earlier = 0;
  for (const customer of customers) {
    const key = customerEntryMonth(customer, now);
    if (!key) continue;
    known++;
    if (key < months[0].key) earlier++;
    else counts.get(key) && counts.get(key)!.entries++;
  }
  let cumulative = earlier;
  for (const month of months) { cumulative += month.entries; month.growth = cumulative; }
  return { months, known, undated: customers.length - known, earlier };
}

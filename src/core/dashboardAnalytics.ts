type Customer = Record<string, unknown>;
export type MonthPoint = { key: string; label: string; entries: number; growth: number };

// Only creation timestamps recorded by Bank Setu qualify as an entry date.
// Account opening dates and cache hydration times are not entry history.
export function customerEntryMonth(customer: Customer, now = new Date()): string | null {
  const raw = customer.createdAt || customer.entryDate || customer.createdDate;
  if (typeof raw !== 'string') return null;
  let source=raw.trim();
  // Google Sheets display values use the workspace's Indian day/month format.
  const local=source.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if(local){
    let [,day,month]=local;if(Number(month)>12&&Number(day)<=12)[day,month]=[month,day];
    const [, , ,year,hour='0',minute='0',second='0',period]=local;
    let hours=Number(hour);if(period){if(hours<1||hours>12)return null;hours=hours%12+(period.toUpperCase()==='PM'?12:0);}
    const utc=new Date(Date.UTC(Number(year),Number(month)-1,Number(day),hours,Number(minute),Number(second)));
    if(utc.getUTCDate()!==Number(day)||utc.getUTCMonth()+1!==Number(month)||hours>23||Number(minute)>59||Number(second)>59)return null;
    source=`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${String(hours).padStart(2,'0')}:${minute.padStart(2,'0')}:${second.padStart(2,'0')}+05:30`;
  }else if(/^\d{4}-\d{2}-\d{2}$/.test(source))source+='T00:00:00+05:30';
  else if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(source))source=source.replace(' ','T')+'+05:30';
  else if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(source))return null;
  const date = new Date(source);
  if (!Number.isFinite(date.getTime()) || date.getTime() > now.getTime() || date.getUTCFullYear() < 2000) return null;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'}).formatToParts(date);
  return `${parts.find(part=>part.type==='year')!.value}-${parts.find(part=>part.type==='month')!.value}`;
}

export function customerAnalytics(customers: Customer[], now = new Date()) {
  const current=customerEntryMonth({createdAt:now.toISOString()},now)!;
  const [year,month]=current.split('-').map(Number);
  const start = new Date(Date.UTC(year,month-12,1));
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
  return { months, known, undated: customers.length - known, earlier,
    thisMonth:months.at(-1)!.entries,monthlyAverage:months.reduce((sum,point)=>sum+point.entries,0)/12 };
}

import type { Customer } from "./schema";
export function afsmBusinessDate(value: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric'}).format(value);
}
export function afsmDisplay(customer: Customer): string {
  const date=String(customer.afsmSentAt || '');
  const day=/^\d{2}\/\d{2}\/\d{4}$/.test(date)?date:date && Number.isFinite(Date.parse(date))?afsmBusinessDate(new Date(date)):'';
  return customer.afsmStatus==='sent' && day ? `AFSM Send to Branch (${day})` : 'Not Sent';
}

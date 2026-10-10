import { useEffect, useState } from 'react';
import { getActiveLocalCustomers } from './core/localData';

type Row = { recordId?: string; enrolId?: string; name?: string; accountNo?: string; status?: string; passbookStatus?: string };

export default function LicenseReadOnlyCustomers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { let mounted = true;
    void getActiveLocalCustomers().then(value => { if (mounted) setRows(value); }).catch(reason => { if (mounted) setError(reason instanceof Error ? reason.message : 'Local records could not be opened.'); });
    return () => { mounted = false; };
  }, []);
  const needle = query.trim().toLocaleLowerCase();
  const matching = rows.filter(row => [row.name, row.accountNo, row.enrolId].some(value => String(value || '').toLocaleLowerCase().includes(needle)));
  return <section style={{ background: '#fff', borderRadius: 16, padding: 20 }}>
    <h2>Existing customers · Read only</h2><p>{matching.length} of {rows.length} local records</p>
    <label>Search name, account number or customer ID<input value={query} onChange={event => setQuery(event.target.value)} style={{ display: 'block', width: '100%', maxWidth: 500, padding: 10, margin: '10px 0 20px' }}/></label>
    {error && <p role="alert">{error}</p>}
    <div style={{ maxHeight: 520, overflow: 'auto' }}><table style={{ width: '100%', textAlign: 'left' }}><thead><tr><th>Customer</th><th>Account</th><th>Customer ID</th><th>Status</th><th>Passbook</th></tr></thead><tbody>{matching.slice(0, 500).map(row => <tr key={row.recordId}><td>{row.name}</td><td>{row.accountNo}</td><td>{row.enrolId}</td><td>{row.status}</td><td>{row.passbookStatus}</td></tr>)}</tbody></table></div>
    {matching.length > 500 && <p>Showing the first 500 matches. Refine the search to view more.</p>}
  </section>;
}

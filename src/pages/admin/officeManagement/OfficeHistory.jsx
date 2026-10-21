import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listOfficeHistory } from './officeHistoryService';
import styles from './OfficeManagement.module.css';

const PAGE_SIZE = 100;
const types = [
  ['all', 'All activity'], ['office', 'Office information'],
  ['service_accounts', 'Service accounts'], ['documents', 'Documents'],
  ['compliance', 'Compliance'], ['maintenance', 'Maintenance'],
  ['opening_tasks', 'Opening tasks']
];
const display = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const fieldLabel = s => display(s);
const safeValue = v => v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const csvCell = value => {
  let text = String(value ?? '');
  // Prevent spreadsheet formula execution when exported CSV is opened.
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};
export default function OfficeHistory({ officeId, officeCode = 'office' }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState({});

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await listOfficeHistory(officeId, { limit: PAGE_SIZE });
      setRows(data); setHasMore(data.length === PAGE_SIZE);
    } catch (e) { setError(e.message || 'Could not load office history.'); }
    finally { setLoading(false); }
  }, [officeId]);
  useEffect(() => { setRows([]); setExpanded({}); reload(); }, [reload]);

  const loadMore = async () => {
    if (moreLoading) return;
    setMoreLoading(true); setError('');
    try {
      const data = await listOfficeHistory(officeId, { offset: rows.length, limit: PAGE_SIZE });
      setRows(current => [...current, ...data]); setHasMore(data.length === PAGE_SIZE);
    } catch (e) { setError(e.message || 'Could not load more activity.'); }
    finally { setMoreLoading(false); }
  };

  const filtered = useMemo(() => rows.filter(item => {
    if (category !== 'all' && item.entity !== category) return false;
    const day = String(item.occurred_at || '').slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    const text = [item.subject, item.entity, item.operation, item.actor_email,
      JSON.stringify(item.before_values), JSON.stringify(item.after_values)].join(' ').toLowerCase();
    return text.includes(search.trim().toLowerCase());
  }), [rows, category, search, from, to]);

  const download = () => {
    const headings = ['Timestamp', 'Category', 'Action', 'Subject', 'Changed by', 'Previous values', 'New values'];
    const csv = [headings, ...filtered.map(x => [x.occurred_at, display(x.entity), x.operation,
      x.subject, x.actor_email || x.actor_id || 'System / unknown', JSON.stringify(x.before_values),
      JSON.stringify(x.after_values)])].map(line => line.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `${officeCode}-activity-history.csv`; document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  };

  return <div>
    <div className={styles.serviceHeading}>
      <div><h2>Office Activity History</h2><p>Read-only timeline of operational changes at this location.</p></div>
      <button type="button" disabled={!filtered.length} onClick={download}>↓ Export loaded results</button>
    </div>
    <p className={styles.helper}>Activity is recorded from the time the history migration is installed. Existing records are not represented as past events. Filters and CSV export apply to loaded results.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.filters}>
      <select aria-label="Activity category" value={category} onChange={e => setCategory(e.target.value)}>
        {types.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select>
      <input aria-label="Search activity" placeholder="Search activity, employee, or changes..." value={search} onChange={e => setSearch(e.target.value)} />
      <label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
    </div>
    {loading ? <p>Loading activity history...</p> : !filtered.length ?
      <p className={styles.empty}>{rows.length ? 'No activity matches the current filters.' : 'No activity recorded yet. New changes will appear here.'}</p> :
      <div className={styles.historyTimeline}>
        {filtered.map(item => {
          const isOpen = !!expanded[item.id];
          const keys = Array.from(new Set([...Object.keys(item.before_values || {}), ...Object.keys(item.after_values || {})]));
          return <article key={item.id} className={styles.historyEntry}>
            <div className={styles.historyDot} aria-hidden="true" />
            <div className={styles.historyEntryBody}>
              <div className={styles.historyTop}><strong>{display(item.entity)} · {display(item.operation)}</strong><time dateTime={item.occurred_at}>{new Date(item.occurred_at).toLocaleString()}</time></div>
              <p className={styles.historySubject}>{item.subject}</p>
              <p className={styles.helper}>By {item.actor_email || item.actor_id || 'System / unknown'}</p>
              <button type="button" className={styles.historyToggle} aria-expanded={isOpen} onClick={() => setExpanded(old => ({ ...old, [item.id]: !old[item.id] }))}>{isOpen ? 'Hide changes ↑' : 'View changes ↓'}</button>
              {isOpen && <div className={styles.historyDiff}><table><thead><tr><th>Field</th><th>Previous</th><th>New</th></tr></thead><tbody>{keys.map(key => <tr key={key}><td>{fieldLabel(key)}</td><td>{safeValue(item.before_values?.[key])}</td><td>{safeValue(item.after_values?.[key])}</td></tr>)}</tbody></table></div>}
            </div>
          </article>;
        })}
      </div>}
    {hasMore && <div className={styles.actions}><button type="button" disabled={moreLoading} onClick={loadMore}>{moreLoading ? 'Loading...' : 'Load 100 more events'}</button></div>}
  </div>;
}

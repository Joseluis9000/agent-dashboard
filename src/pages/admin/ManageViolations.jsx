import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import styles from './ManageViolations.module.css';

// All calendar rules below come from the weekly schedule supplied by management.
// Production Mon-Sun is scheduled for Friday 18 days after its Monday.
// Example: 2026-08-24 through 2026-08-30 -> Friday 2026-09-11.
// A scheduled payday is NOT evidence that a commission or violation was paid.
const BUSINESS_TIME_ZONE = 'America/Los_Angeles';
const PAGE_SIZES = [25, 50, 100];
const TABLES = ['violations', 'disqualified_policies'];
const SOURCE_LABELS = { AR: 'AR report', EFT: 'EFT report', RP: 'RP report', CHARGEBACK: 'Chargebacks', SCANNING: 'Scanning', DISQUALIFIED: 'Disqualified policies' };
const clean = (value) => String(value ?? '').trim();
const emailKey = (value) => clean(value).toLowerCase();
const upper = (value) => clean(value).toUpperCase();
const finite = (value) => value === null || value === undefined || clean(value) === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const cents = (value) => Math.round((finite(value) ?? 0) * 100);
const money = (value) => finite(value) === null ? '\u2014' : Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const dateKey = (value) => {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  if (!match) return '';
  const key = `${match[1]}-${match[2]}-${match[3]}`;
  const d = new Date(`${key}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== key ? '' : key;
};
const businessDate = (value = new Date()) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return dateKey(value);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const addDays = (key, days) => {
  if (!dateKey(key)) return '';
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (key) => {
  if (!dateKey(key)) return '';
  const day = new Date(`${key}T12:00:00Z`).getUTCDay();
  return addDays(key, day === 0 ? -6 : 1 - day);
};
const displayDate = (key, long = false) => !dateKey(key) ? '\u2014' : new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', month: long ? 'long' : 'short', day: 'numeric', year: 'numeric',
}).format(new Date(`${dateKey(key)}T12:00:00Z`));
const displayTime = (value) => {
  const d = new Date(value);
  return !value || Number.isNaN(d.getTime()) ? '\u2014' : new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(d);
};
const weekLabel = (key) => !key ? 'Week not assigned' : `${displayDate(key)} - ${displayDate(addDays(key, 6))}`;
const scheduledPayday = (start) => addDays(start, 18);
const getPayContext = (today = businessDate()) => {
  const currentMonday = mondayOf(today);
  let friday = addDays(currentMonday, 4);
  if (today > friday) friday = addDays(friday, 7); // Weekend: show the next scheduled Friday.
  return { today, currentMonday, friday, payingWeek: addDays(mondayOf(friday), -14) };
};
const effectiveWeek = (row) => dateKey(row.deduction_week_start) || dateKey(row.week_start_date);
const officeKey = (value) => {
  const match = upper(value).match(/\bCA\s*(\d{1,3})\b/);
  return match ? `CA${match[1].padStart(3, '0')}` : clean(value);
};
const recordKind = (row, table) => table === 'disqualified_policies' ? 'disqualified'
  : /SCANNING|^SV$/i.test(clean(row.violation_type)) ? 'scanning'
    : /^AR(?:\s|$)/i.test(clean(row.violation_type)) ? 'ar' : 'other';
const isVoided = (row) => ['VOID', 'VOIDED'].includes(upper(row.status));
// Match the existing commission status rule; do not infer approval from source exceptions.
const isActivePolicy = (row) => !isVoided(row);
const sourceLabel = (row) => SOURCE_LABELS[upper(row.source_report_type)] || (row.import_batch_id ? 'Imported / type unavailable' : 'Manual / legacy');
const noteText = (details) => clean(details).split('\n').filter((line) => !/^\[(?:POLICY_.*AUDIT|MANAGE_STATUS_AUDIT)_V\d+\]/.test(line.trim())).join('\n');
const auditEntries = (details) => clean(details).split('\n').flatMap((line) => {
  const match = line.match(/^\[([^\]]*AUDIT[^\]]*)\]\s*(\{.*\})\s*$/);
  if (!match) return [];
  try { return [{ marker: match[1], ...JSON.parse(match[2]) }]; } catch { return []; }
});
const normalizeRecord = (raw, table) => ({ ...raw, raw, table, key: `${table}:${raw.id}`, kind: recordKind(raw, table),
  email: emailKey(raw.agent_email), office: officeKey(raw.office_code), week: effectiveWeek(raw),
  enteredDate: businessDate(raw.created_at || raw.reported_date), sourceDate: dateKey(raw.transaction_date),
  fee: finite(raw.fee_amount), notes: noteText(raw.details), audits: auditEntries(raw.details),
});
const attentionReasons = (row, directory) => {
  const reasons = [];
  if (!row.email) reasons.push('Agent email missing');
  else if (directory && !directory.has(row.email)) reasons.push('Agent not in directory');
  if (!row.office) reasons.push('Office missing');
  if (!row.week || mondayOf(row.week) !== row.week) reasons.push('Commission week needs review');
  if (dateKey(row.deduction_week_start) && dateKey(row.week_start_date) && row.deduction_week_start !== row.week_start_date) reasons.push('Week fields disagree');
  if (!isVoided(row) && row.kind === 'disqualified' && isActivePolicy(row) && !clean(row.linked_sync_key)) reasons.push('Policy receipt not linked');
  if (!isVoided(row) && row.kind !== 'disqualified' && (row.fee === null || row.fee < 0)) reasons.push('Fee needs review');
  if (!clean(row.policy_number || row.customer_id || row.reference_id)) reasons.push('Policy / customer identifier missing');
  if (!clean(row.details)) reasons.push('Explanation missing');
  if (row.kind === 'other') reasons.push('Unrecognized violation type');
  if (row.week && row.enteredDate && row.enteredDate > scheduledPayday(row.week)) reasons.push('Entered after scheduled payday');
  return reasons;
};
const summarize = (rows, directory) => {
  const result = { ar: 0, arFees: 0, scanning: 0, scanningFees: 0, policies: 0, linked: 0, attention: 0, voided: 0, agents: new Set(), total: rows.length };
  rows.forEach((row) => {
    if (row.email) result.agents.add(row.email);
    if (attentionReasons(row, directory).length) result.attention += 1;
    if (isVoided(row)) { result.voided += 1; return; }
    if (row.kind === 'ar') { result.ar += 1; result.arFees += cents(row.fee); }
    if (row.kind === 'scanning') { result.scanning += 1; result.scanningFees += cents(row.fee); }
    if (row.kind === 'disqualified' && isActivePolicy(row)) { result.policies += 1; if (row.linked_sync_key) result.linked += 1; }
  });
  return { ...result, arFees: result.arFees / 100, scanningFees: result.scanningFees / 100, agentCount: result.agents.size };
};

// Complete, ordered pagination. An access/query failure is surfaced, never converted to an empty list.
const fetchAll = async (build, signal, onProgress, label = 'records') => {
  const all = []; const size = 500; let offset = 0;
  while (true) {
    if (signal?.aborted) throw new Error('Request cancelled');
    let query = build().order('id', { ascending: true }).range(offset, offset + size - 1);
    if (signal && typeof query.abortSignal === 'function') query = query.abortSignal(signal);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message || `Unable to load ${label}`);
    const page = data || [];
    all.push(...page); offset += page.length;
    onProgress?.(`Loading ${label}: ${offset.toLocaleString()}${Number.isFinite(count) ? ` of ${count.toLocaleString()}` : ''}`);
    if (Number.isFinite(count) ? offset >= count : page.length < size) break;
    if (!page.length || offset > 100000) throw new Error(`The ${label} result is too large or incomplete. Narrow the date range.`);
  }
  return all;
};
const chunks = (values, size = 70) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
const weekQuery = (table, week, columns = '*') => supabase.from(table).select(columns, { count: 'exact' })
  .or(`deduction_week_start.eq.${week},and(deduction_week_start.is.null,week_start_date.eq.${week})`);
const yearQuery = (table, year) => supabase.from(table).select('id,agent_email,office_code,violation_type,fee_amount,status,week_start_date,deduction_week_start,linked_sync_key,created_at', { count: 'exact' })
  .or(`and(deduction_week_start.gte.${year}-01-01,deduction_week_start.lt.${year + 1}-01-01),and(deduction_week_start.is.null,week_start_date.gte.${year}-01-01,week_start_date.lt.${year + 1}-01-01)`);

function useRemote(loader) {
  const [state, setState] = useState({ loader: null, data: null, loading: true, error: '', progress: '' });
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setState({ loader, data: null, loading: true, error: '', progress: 'Loading records...' });
    const progress = (text) => { if (current) setState((prior) => ({ ...prior, progress: text })); };
    Promise.resolve().then(() => loader(controller.signal, progress)).then((data) => {
      if (current) setState({ loader, data, loading: false, error: '', progress: '', loadedAt: new Date().toISOString() });
    }).catch((error) => {
      if (current) setState({ loader, data: null, loading: false, error: error.message || 'Unable to load records.', progress: '' });
    });
    return () => { current = false; controller.abort(); };
  }, [loader]);
  return state.loader === loader ? state : { data: null, loading: true, error: '', progress: 'Loading records...' };
}
function useBusinessToday() {
  const [today, setToday] = useState(() => businessDate());
  useEffect(() => { const timer = setInterval(() => setToday(businessDate()), 60000); return () => clearInterval(timer); }, []);
  return today;
}
const paginate = (rows, page, size) => {
  const pages = Math.max(1, Math.ceil(rows.length / size)); const current = Math.max(1, Math.min(page, pages));
  const offset = (current - 1) * size;
  return { rows: rows.slice(offset, offset + size), page: current, pages, first: rows.length ? offset + 1 : 0, last: Math.min(offset + size, rows.length), total: rows.length };
};
function Pager({ info, onPage, label = 'records' }) {
  return <div className={styles.pager}><span role="status">Showing <b>{info.first}-{info.last}</b> of <b>{info.total.toLocaleString()}</b> {label}</span>
    <nav aria-label={`${label} pagination`}><button type="button" disabled={info.page === 1} onClick={() => onPage(1)}>First</button>
      <button type="button" disabled={info.page === 1} onClick={() => onPage(info.page - 1)}>Previous</button><span>{info.page} / {info.pages}</span>
      <button type="button" disabled={info.page === info.pages} onClick={() => onPage(info.page + 1)}>Next</button>
      <button type="button" disabled={info.page === info.pages} onClick={() => onPage(info.pages)}>Last</button></nav></div>;
}
function Loading({ text = 'Loading records...' }) {
  return <div className={styles.loading} role="status"><span className={styles.spinner} aria-hidden="true" /><div><strong>Please wait</strong><p>{text}</p></div></div>;
}
function Message({ children, danger = false }) {
  return <div className={danger ? styles.error : styles.notice} role={danger ? 'alert' : 'status'}>{children}</div>;
}
function Badge({ children, tone = 'neutral' }) { return <span className={`${styles.badge} ${styles[`tone_${tone}`]}`}>{children}</span>; }
const defaultFilters = { query: '', office: '', agent: '', kind: 'all', source: '', status: '', attention: false, batch: '' };
const filterRecords = (rows, filters, directory) => {
  const terms = filters.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (filters.office && row.office !== filters.office) return false;
    if (filters.agent === '(unassigned)' ? !!row.email : filters.agent && row.email !== filters.agent) return false;
    if (filters.kind !== 'all' && row.kind !== filters.kind) return false;
    if (filters.source && (upper(row.source_report_type) || 'LEGACY') !== filters.source) return false;
    if (filters.status && upper(row.status || 'Pending') !== filters.status) return false;
    if (filters.batch && String(row.import_batch_id) !== String(filters.batch)) return false;
    if (filters.attention && !attentionReasons(row, directory).length) return false;
    const haystack = [row.agent_email, directory?.get(row.email)?.full_name, row.office, row.region, row.client_name, row.policy_number,
      row.customer_id, row.reference_id, row.linked_receipt_id, row.source_report_type, row.violation_category, row.details,
      row.week, row.sourceDate, row.enteredDate, row.import_batch_id].map(clean).join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
};
const byAgent = (rows, directory) => {
  const grouped = new Map();
  rows.forEach((row) => { const key = row.email || '(unassigned)'; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(row); });
  return [...grouped].map(([email, records]) => ({ email, records, name: directory?.get(email)?.full_name || email,
    offices: [...new Set(records.map((row) => row.office).filter(Boolean))].sort().join(', '), ...summarize(records, directory) }))
    .sort((a, b) => b.attention - a.attention || (b.arFees + b.scanningFees) - (a.arFees + a.scanningFees) || a.name.localeCompare(b.name));
};
const makeLedgerSummary = (rows, record) => {
  const matches = rows.filter((entry) => String(entry.linked_violation_id) === String(record.id));
  const own = matches.filter((entry) => emailKey(entry.agent_email) === record.email);
  if (matches.length !== own.length) return { state: 'Identity mismatch', known: false, entries: matches };
  if (!own.length) return { state: record.remaining_balance != null ? 'Snapshot only' : 'Not in ledger', known: false, entries: [],
    snapshot: finite(record.remaining_balance), snapshotAt: record.reconciled_at };
  if (own.some((entry) => finite(entry.amount) === null)) return { state: 'Invalid ledger amount', known: false, entries: own };
  const total = own.reduce((sum, entry) => sum + cents(entry.amount), 0);
  const credits = own.reduce((sum, entry) => sum + Math.max(0, -cents(entry.amount)), 0);
  const charges = own.reduce((sum, entry) => sum + Math.max(0, cents(entry.amount)), 0);
  return { known: true, entries: own, balance: total / 100, credited: credits / 100, charges: charges / 100,
    state: total < 0 ? 'Credit balance' : total === 0 ? 'Settled' : credits > 0 ? 'Partially settled' : 'Outstanding' };
};

// Spreadsheet-safe CSV export of all filtered rows, not just the visible page.
const csvCell = (value) => {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const exportRecords = (rows, directory, name) => {
  const header = ['Record ID', 'Type', 'Agent', 'Agent email', 'Office', 'Production / commission week', 'Scheduled payday', 'Source transaction date',
    'Entered at', 'Customer', 'Policy', 'Customer ID', 'Category', 'Fee (not source amount)', 'Record status', 'Repayment snapshot status',
    'Remaining balance snapshot', 'Receipt', 'Source report', 'Batch ID', 'Full details'];
  const body = rows.map((row) => [row.id, row.kind, directory?.get(row.email)?.full_name, row.agent_email, row.office, row.week,
    scheduledPayday(row.week), row.sourceDate, row.created_at || row.reported_date, row.client_name, row.policy_number, row.customer_id,
    row.violation_category, row.fee, row.status || 'Pending', row.repayment_status, row.remaining_balance, row.linked_receipt_id,
    sourceLabel(row), row.import_batch_id, row.details]);
  const blob = new Blob(['\uFEFF' + [header, ...body].map((line) => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function RecordDetails({ record, ledger, ledgerError, directory, onEdit, onChangeStatus, onDelete, busy }) {
  const [nextStatus, setNextStatus] = useState(record.status || 'Pending');
  const [reason, setReason] = useState('');
  const issues = attentionReasons(record, directory);
  const dp = record.kind === 'disqualified';
  const repayment = !dp && ledger ? makeLedgerSummary(ledger, record) : null;
  const canDelete = !record.import_batch_id && !record.source_fingerprint && !record.reconciled_at && !(finite(record.amount_paid) > 0)
    && (dp || (!!ledger && !ledgerError && !repayment?.entries.length));
  return <div className={styles.recordDetails}>
    <div className={styles.detailTitle}><div><span className={styles.eyebrow}>RECORD DETAILS</span><h3>{record.client_name || 'Client not recorded'}</h3></div>
      <button type="button" onClick={() => onEdit(record)} disabled={busy}>Edit / match receipt</button></div>
    {!!issues.length && <Message danger>{issues.join(' \u00b7 ')}</Message>}
    <dl className={styles.detailGrid}>{[
      ['Agent email', record.agent_email], ['Source date', displayDate(record.sourceDate)], ['Commission week', weekLabel(record.week)],
      ['Scheduled payday', displayDate(scheduledPayday(record.week))], ['Entered at (Pacific)', displayTime(record.created_at || record.reported_date)],
      ['Entered by', record.manager_email], ['Policy', record.policy_number], ['Customer ID', record.customer_id], ['Reference', record.reference_id],
      ['Linked receipt', record.linked_receipt_id], ['Transaction sync key', record.linked_sync_key], ['Import source', sourceLabel(record)],
      ['Import batch', record.import_batch_id], ['Region recorded', record.region], ['Record ID', record.id],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{clean(value) || '\u2014'}</dd></div>)}</dl>
    <div className={styles.notePanel}><strong>Reason / source notes</strong><p>{record.notes || 'No explanation stored.'}</p></div>
    {record.audits.length > 0 && <details className={styles.auditPanel}><summary>View {record.audits.length} stored audit record(s)</summary>
      {record.audits.map((audit, index) => <pre key={index}>{JSON.stringify(audit, null, 2)}</pre>)}</details>}
    {!dp && <section className={styles.repaymentPanel}><h4>Repayment &amp; balance evidence</h4>
      <p>Record status is not payment status. Credits may include prior-payment reconciliation, waivers, or adjustments.</p>
      {ledgerError ? <Message>Ledger unavailable: {ledgerError}. No balance is assumed.</Message>
        : !ledger ? <p>Loading linked ledger activity...</p>
          : repayment.known ? <><div className={styles.repaymentValues}><span>Ledger charges <b>{money(repayment.charges)}</b></span>
            <span>Payments / credits <b>{money(repayment.credited)}</b></span><span>Remaining <b>{money(repayment.balance)}</b></span><Badge tone={repayment.balance > 0 ? 'amber' : 'green'}>{repayment.state}</Badge></div>
            <div className={styles.ledgerScroll}><table className={styles.miniTable}><thead><tr><th>Date</th><th>Activity</th><th>Amount</th><th>Why / reference</th></tr></thead>
              <tbody>{repayment.entries.map((entry) => <tr key={entry.id}><td>{displayDate(entry.entry_date)}</td><td>{entry.entry_type}</td><td>{money(entry.amount)}</td>
                <td>{entry.description || entry.reference || '\u2014'}</td></tr>)}</tbody></table></div></>
            : <Message>{repayment.state}. {repayment.snapshot != null ? `Stored remaining-balance snapshot: ${money(repayment.snapshot)}${repayment.snapshotAt ? `, reconciled ${displayTime(repayment.snapshotAt)}` : ''}. It is not a verified live ledger balance.` : 'No linked ledger entries were found; the original fee is not assumed to be the current balance.'}</Message>}
    </section>}
    <details className={styles.management}><summary>Management actions</summary>
      <p>Pending / Charged / Voided are record statuses, not proof of payment. This page does not apply commission repayments or finalize payroll.</p>
      <div className={styles.actionForm}><label>Record status<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)} disabled={busy}>
        {!['Pending', 'Charged', 'Voided'].includes(record.status || 'Pending') && <option value={record.status}>{record.status}</option>}
        <option>Pending</option><option>Charged</option><option>Voided</option></select></label>
        <label>Reason for this change<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Required for the audit trail" disabled={busy} /></label>
        <button type="button" disabled={busy || nextStatus === (record.status || 'Pending') || reason.trim().length < 10}
          onClick={() => onChangeStatus(record, nextStatus, reason)}>Save status</button></div>
      <p>For ledger-backed AR/SV records, voiding or restoring is blocked here until a coordinated ledger adjustment is available.</p>
      <button className={styles.dangerButton} type="button" disabled={busy || !canDelete} onClick={() => onDelete(record)}>Delete unlinked manual record</button>
      {!canDelete && <small>Imported, reconciled, or ledger-linked records are protected from deletion so history and duplicate detection remain intact.</small>}
    </details>
  </div>;
}

function WeekReview({ week, refresh, directory, directoryError, directoryLoading, initialFilters, onEdit, onMutation, onWeek }) {
  const [filters, setFilters] = useState(() => ({ ...defaultFilters, ...(initialFilters || {}) }));
  const [view, setView] = useState('records'); const [page, setPage] = useState(1); const [size, setSize] = useState(25);
  const [expanded, setExpanded] = useState(''); const [actionError, setActionError] = useState(''); const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState('attention'); const mutationLock = useRef(false);
  const loader = useCallback(async (signal, progress) => {
    const [ar, dp] = await Promise.all(TABLES.map((table) => fetchAll(() => weekQuery(table, week), signal, progress, table === 'violations' ? 'AR / scanning' : 'policies')));
    return [...ar.map((row) => normalizeRecord(row, 'violations')), ...dp.map((row) => normalizeRecord(row, 'disqualified_policies'))];
  // refresh is an explicit request token, not data used inside the query.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, refresh]);
  const remote = useRemote(loader); const rows = useMemo(() => remote.data || [], [remote.data]);
  const ledgerIds = useMemo(() => rows.filter((row) => row.table === 'violations').map((row) => String(row.id)), [rows]);
  const ledgerLoader = useCallback(async (signal) => {
    if (!ledgerIds.length) return [];
    const output = [];
    for (const ids of chunks(ledgerIds)) output.push(...await fetchAll(() => supabase.from('agent_commission_balance_ledger').select('*', { count: 'exact' }).in('linked_violation_id', ids), signal));
    return output;
  }, [ledgerIds]);
  const ledger = useRemote(ledgerLoader);
  const setFilter = (name, value) => { setFilters((prior) => ({ ...prior, [name]: value })); setPage(1); setExpanded(''); };
  const filtered = filterRecords(rows, filters, directory).sort((a, b) => {
    if (sort === 'attention') { const score = Number(!!attentionReasons(b, directory).length) - Number(!!attentionReasons(a, directory).length); if (score) return score; }
    if (sort === 'agent') return (directory?.get(a.email)?.full_name || a.email).localeCompare(directory?.get(b.email)?.full_name || b.email) || a.key.localeCompare(b.key);
    if (sort === 'office') return a.office.localeCompare(b.office) || a.key.localeCompare(b.key);
    return clean(b.created_at).localeCompare(clean(a.created_at)) || a.key.localeCompare(b.key);
  });
  const info = paginate(view === 'agents' ? byAgent(filtered, directory) : filtered, page, size);
  const stats = summarize(rows, directory); const offices = [...new Set(rows.map((row) => row.office).filter(Boolean))].sort();
  const agents = [...new Set(rows.map((row) => row.email).filter(Boolean))].sort((a, b) => (directory?.get(a)?.full_name || a).localeCompare(directory?.get(b)?.full_name || b));
  const sources = [...new Set(rows.map((row) => upper(row.source_report_type) || 'LEGACY'))].sort();
  const hasFilters = Object.entries(filters).some(([key, value]) => key === 'kind' ? value !== 'all' : !!value);

  const freshLedger = async (record) => fetchAll(() => supabase.from('agent_commission_balance_ledger').select('id', { count: 'exact' }).eq('linked_violation_id', String(record.id)));
  const changeStatus = async (record, next, reason) => {
    if (mutationLock.current || clean(reason).length < 10 || !['Pending', 'Charged', 'Voided'].includes(next)) return;
    mutationLock.current = true; setBusy(true); setActionError('');
    try {
      const financialChange = isVoided(record) !== (next === 'Voided');
      if (record.table === 'violations' && financialChange) {
        const entries = await freshLedger(record);
        if (entries.length || record.reconciled_at || (finite(record.amount_paid) ?? 0) > 0) throw new Error('This AR/SV has ledger or reconciliation history. Void/restore it through a coordinated balance adjustment, not a record-only status change. Nothing was changed.');
      }
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth?.user?.email) throw new Error('Sign in again before changing a record.');
      if (!window.confirm(`Change this record from ${record.status || 'Pending'} to ${next}? This does not record a payment.\n\nReason: ${reason}`)) return;
      const audit = { by: auth.user.email, at: new Date().toISOString(), from: record.status || 'Pending', to: next, reason: clean(reason) };
      const details = `${record.details || ''}\n[MANAGE_STATUS_AUDIT_V1] ${JSON.stringify(audit)}`.trim();
      let query = supabase.from(record.table).update({ status: next, details }).eq('id', record.id);
      query = record.status == null ? query.is('status', null) : query.eq('status', record.status);
      // Avoid overwriting a concurrent editor's notes or another status audit.
      query = record.details == null ? query.is('details', null) : query.eq('details', record.details);
      const { data, error } = await query.select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('The record changed or you do not have update access. Refresh and review it again.');
      onMutation();
    } catch (error) { setActionError(error.message || 'Status update failed.'); }
    finally { mutationLock.current = false; setBusy(false); }
  };
  const deleteRecord = async (record) => {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true); setActionError('');
    try {
      if (record.import_batch_id || record.source_fingerprint || record.reconciled_at || (finite(record.amount_paid) ?? 0) > 0) throw new Error('This record is protected. Retain its import and repayment history.');
      if (record.table === 'violations' && (await freshLedger(record)).length) throw new Error('This record has ledger entries and cannot be deleted here.');
      if (!window.confirm(`Permanently delete this unlinked manual record for ${record.client_name || record.agent_email}? This cannot be undone.`)) return;
      const { data, error } = await supabase.from(record.table).delete().eq('id', record.id).select('id');
      if (error) throw error; if (!data?.length) throw new Error('No record was deleted. Refresh or check your access.');
      setExpanded(''); onMutation();
    } catch (error) { setActionError(error.message); } finally { mutationLock.current = false; setBusy(false); }
  };

  if (remote.loading) return <Loading text={remote.progress} />;
  if (remote.error) return <Message danger>Could not load this week: {remote.error}. Totals are unavailable, not zero.</Message>;
  return <>
    <div className={styles.scopeLine}><span>{rows.length.toLocaleString()} saved records &middot; {stats.agentCount} agents &middot; {offices.length} offices</span>
      <span>Refreshed {displayTime(remote.loadedAt)} PT</span></div>
    <div className={styles.metrics}>
      <button type="button" className={styles.metric} onClick={() => { setFilter('kind', 'ar'); setView('records'); }}><span>AR fees assigned</span><strong>{money(stats.arFees)}</strong><small>{stats.ar} non-voided AR entries &middot; includes EFT / RP / chargebacks</small></button>
      <button type="button" className={styles.metric} onClick={() => { setFilter('kind', 'scanning'); setView('records'); }}><span>Scanning fees assigned</span><strong>{money(stats.scanningFees)}</strong><small>{stats.scanning} non-voided scanning entries</small></button>
      <button type="button" className={`${styles.metric} ${styles.metricPurple}`} onClick={() => { setFilter('kind', 'disqualified'); setView('records'); }}><span>Active disqualifications</span><strong>{stats.policies}</strong><small>{stats.linked} have receipt links &middot; not a verified Net NB reduction</small></button>
      <button type="button" className={`${styles.metric} ${stats.attention ? styles.metricAmber : styles.metricGreen}`} onClick={() => { setFilter('attention', !filters.attention); setView('records'); }}><span>Needs attention</span><strong>{stats.attention}</strong><small>Missing data, policy links, or entries after scheduled payday</small></button>
    </div>
    <p className={styles.disclaimer}>Cards cover the entire selected week. Fees are assigned charges, not amounts collected or commission payable. {stats.voided} voided record(s) are excluded from the fee cards.</p>
    {(directoryError || directoryLoading) && <Message>{directoryError ? `Agent directory unavailable: ${directoryError}. Emails remain visible; directory validation is unavailable.` : 'Agent names are still loading; email addresses are shown for now.'}</Message>}
    {!!actionError && <Message danger>{actionError}</Message>}
    <section className={styles.panel} aria-label="Weekly violations review">
      <header className={styles.panelHeader}><div><span className={styles.eyebrow}>WEEKLY REVIEW</span><h2>{view === 'agents' ? 'Agent impact' : 'Violation & policy records'}</h2>
        <p>Search every loaded record in this week, including notes and receipts.</p></div>
        <div className={styles.buttonGroup}><button type="button" className={view === 'records' ? styles.selected : ''} onClick={() => { setView('records'); setPage(1); }}>Records</button>
          <button type="button" className={view === 'agents' ? styles.selected : ''} onClick={() => { setView('agents'); setPage(1); }}>By agent</button>
          <button type="button" disabled={!filtered.length} onClick={() => exportRecords(filtered, directory, `violations_${week}_filtered`)}>Export filtered CSV</button></div></header>
      <div className={styles.filters}>
        <label className={styles.searchLabel}>Search this commission week<input type="search" value={filters.query} onChange={(event) => setFilter('query', event.target.value)} placeholder="Agent, customer, policy, receipt, notes..." /></label>
        <label>Office<select value={filters.office} onChange={(event) => setFilter('office', event.target.value)}><option value="">All offices</option>{offices.map((office) => <option key={office}>{office}</option>)}</select></label>
        <label>Agent<select value={filters.agent} onChange={(event) => setFilter('agent', event.target.value)}><option value="">All agents</option>{rows.some((row) => !row.email) && <option value="(unassigned)">Unassigned agents</option>}{agents.map((email) => <option key={email} value={email}>{directory?.get(email)?.full_name || email}</option>)}</select></label>
        <label>Source report<select value={filters.source} onChange={(event) => setFilter('source', event.target.value)}><option value="">All report sources</option>{sources.map((source) => <option key={source} value={source}>{SOURCE_LABELS[source] || 'Manual / legacy'}</option>)}</select></label>
        <label>Status<select value={filters.status} onChange={(event) => setFilter('status', event.target.value)}><option value="">All record statuses</option>{[...new Set(rows.map((row) => upper(row.status || 'Pending')))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      <div className={styles.filterFooter}><div className={styles.chips}>{[['all', 'All records'], ['ar', 'AR'], ['scanning', 'Scanning'], ['disqualified', 'Disqualified']].map(([key, label]) =>
        <button type="button" key={key} aria-pressed={filters.kind === key} className={filters.kind === key ? styles.chipActive : ''} onClick={() => setFilter('kind', key)}>{label}</button>)}
        <button type="button" aria-pressed={filters.attention} className={filters.attention ? styles.chipWarning : ''} onClick={() => setFilter('attention', !filters.attention)}>Needs attention {stats.attention}</button>
        {filters.batch && <Badge tone="purple">Batch #{filters.batch}</Badge>}
        {hasFilters && <button type="button" onClick={() => { setFilters({ ...defaultFilters }); setPage(1); }}>Clear filters</button>}</div>
        <div className={styles.miniControls}><label>Sort<select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="attention">Attention first</option><option value="newest">Newest entry</option><option value="agent">Agent</option><option value="office">Office</option></select></label>
          <label>Rows<select value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>{PAGE_SIZES.map((value) => <option key={value}>{value}</option>)}</select></label></div></div>
      <Pager info={info} onPage={setPage} label={view === 'agents' ? 'agents' : 'filtered records'} />
      <div className={styles.tableViewport}>
        {view === 'agents' ? <table className={styles.dataTable}><thead><tr><th>Agent / office</th><th>AR fees</th><th>Scanning fees</th><th>Disqualified</th><th>Needs attention</th><th>Records</th><th>Action</th></tr></thead><tbody>
          {info.rows.map((agent) => <tr key={agent.email}><td><strong>{agent.name}</strong><small>{agent.email}</small><small>{agent.offices}</small></td><td>{money(agent.arFees)}</td><td>{money(agent.scanningFees)}</td>
            <td>{agent.policies}</td><td><Badge tone={agent.attention ? 'amber' : 'green'}>{agent.attention}</Badge></td><td>{agent.total}</td><td><button type="button" className={styles.linkButton} onClick={() => { setFilter('agent', agent.email); setView('records'); }}>View records</button></td></tr>)}
        </tbody></table> : <table className={styles.dataTable}><thead><tr><th>Type / status</th><th>Agent / office</th><th>Customer / identifiers</th><th>Dates</th><th>Fee / balance</th><th>Reason / source</th><th>Action</th></tr></thead><tbody>
          {info.rows.map((row) => {
            const issues = attentionReasons(row, directory); const dp = row.kind === 'disqualified';
            const payment = !dp && ledger.data ? makeLedgerSummary(ledger.data, row) : null;
            return <React.Fragment key={row.key}><tr className={issues.length ? styles.attentionRow : ''}>
              <td><Badge tone={dp ? 'purple' : row.kind === 'scanning' ? 'blue' : 'neutral'}>{dp ? 'Disqualified' : row.kind === 'scanning' ? 'Scanning' : row.kind === 'ar' ? 'AR' : 'Other'}</Badge>
                <small>{row.violation_category || row.violation_type || '\u2014'}</small><Badge tone={isVoided(row) ? 'red' : 'neutral'}>{row.status || 'Pending'}</Badge>
                {!!issues.length && <small className={styles.warningText}>{issues[0]}{issues.length > 1 ? ` +${issues.length - 1}` : ''}</small>}</td>
              <td><strong>{directory?.get(row.email)?.full_name || row.agent_email || 'Agent missing'}</strong><small>{row.agent_email}</small><b>{row.office || '\u2014'}</b></td>
              <td><strong>{row.client_name || 'Client not recorded'}</strong><small>Policy: {row.policy_number || '\u2014'}</small>{row.customer_id && <small>ID: {row.customer_id}</small>}
                {row.linked_receipt_id && <small>Receipt: {row.linked_receipt_id}</small>}{dp && <small className={row.linked_sync_key ? styles.goodText : styles.warningText}>{row.linked_sync_key ? 'Receipt linked (not revalidated here)' : 'Receipt link missing'}</small>}</td>
              <td><span>{displayDate(row.sourceDate)}</span><small>Source transaction date</small><small>Entered {displayDate(row.enteredDate)}</small></td>
              <td className={styles.amountCell}>{dp ? <span className={styles.muted}>Policy count, not a fee</span> : <><strong>{money(row.fee)}</strong><small>Original fee</small>
                <small>{payment?.known ? `Remaining ${money(payment.balance)}` : ledger.loading ? 'Balance loading...' : ledger.error ? 'Balance unavailable' : payment?.state || 'Balance not verified'}</small></>}</td>
              <td><p className={styles.clampedNote}>{row.notes || 'No explanation stored.'}</p><small>{sourceLabel(row)}{row.import_batch_id ? ` \u00b7 Batch #${row.import_batch_id}` : ''}</small></td>
              <td><button type="button" className={styles.linkButton} aria-expanded={expanded === row.key} onClick={() => setExpanded(expanded === row.key ? '' : row.key)}>{expanded === row.key ? 'Hide details' : 'View details'}</button></td>
            </tr>{expanded === row.key && <tr><td colSpan={7} className={styles.expandedCell}><RecordDetails record={row} ledger={ledger.loading ? null : ledger.data}
              ledgerError={ledger.error} directory={directory} onEdit={onEdit} onChangeStatus={changeStatus} onDelete={deleteRecord} busy={busy} /></td></tr>}</React.Fragment>;
          })}
        </tbody></table>}
        {!info.total && <div className={styles.empty}><strong>{rows.length ? 'No records match these filters.' : 'No saved records returned for this commission week.'}</strong><p>{rows.length ? 'Clear a filter or search a different policy.' : 'This does not confirm that every report has been submitted.'}</p>
          <button type="button" onClick={() => rows.length ? setFilters({ ...defaultFilters }) : onWeek('history')}>{rows.length ? 'Reset filters' : 'Browse week history'}</button></div>}
      </div>
      <Pager info={info} onPage={setPage} label={view === 'agents' ? 'agents' : 'filtered records'} />
    </section>
  </>;
}

function WeekExplorer({ selected, context, refresh, onOpen }) {
  const [year, setYear] = useState(Number(selected.slice(0, 4))); const [query, setQuery] = useState('');
  const [onlyRecords, setOnlyRecords] = useState(true); const [page, setPage] = useState(1);
  const loader = useCallback(async (signal, progress) => {
    const lists = await Promise.all(TABLES.map((table) => fetchAll(() => yearQuery(table, year), signal, progress, `${year} ${table}`)));
    return lists.flatMap((list, index) => list.map((row) => normalizeRecord(row, TABLES[index])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, refresh]);
  const remote = useRemote(loader);
  const weeks = useMemo(() => {
    if (!remote.data) return [];
    const grouped = new Map(); remote.data.forEach((row) => { if (!grouped.has(row.week)) grouped.set(row.week, []); grouped.get(row.week).push(row); });
    let start = mondayOf(`${year}-01-01`); if (start < `${year}-01-01`) start = addDays(start, 7);
    const items = [];
    while (start < `${year + 1}-01-01`) { const records = grouped.get(start) || []; items.push({ start, records, stats: summarize(records, null) }); start = addDays(start, 7); }
    return items.reverse();
  }, [remote.data, year]);
  const filtered = weeks.filter((week) => (!onlyRecords || week.records.length) && (!query || [week.start, addDays(week.start, 6), weekLabel(week.start), scheduledPayday(week.start), displayDate(scheduledPayday(week.start))].join(' ').toLowerCase().includes(query.toLowerCase())));
  const info = paginate(filtered, page, 12);
  return <section className={styles.panel}><header className={styles.panelHeader}><div><span className={styles.eyebrow}>JUMP TO ANY WEEK</span><h2>Commission week explorer</h2><p>Browse by production week or search its scheduled payday. No repeated Previous Week clicks.</p></div>
      <div className={styles.yearControls}><button type="button" aria-label="Previous production year" disabled={year <= 2000} onClick={() => { setYear(year - 1); setPage(1); }}>&larr;</button><strong>{year}</strong>
        <button type="button" aria-label="Next production year" disabled={year >= 2100} onClick={() => { setYear(year + 1); setPage(1); }}>&rarr;</button></div></header>
    <div className={styles.explorerFilters}><label>Find week / scheduled payday<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Aug 24, Sep 11, 2026-08..." /></label>
      <label className={styles.checkLabel}><input type="checkbox" checked={onlyRecords} onChange={(event) => { setOnlyRecords(event.target.checked); setPage(1); }} />Only weeks with saved records</label></div>
    {remote.loading ? <Loading text={remote.progress} /> : remote.error ? <Message danger>Week history could not be loaded: {remote.error}</Message> : <>
      <Pager info={info} onPage={setPage} label="production weeks" /><div className={styles.weekGrid}>{info.rows.map(({ start, stats }) => {
        const pay = scheduledPayday(start); const tag = start === context.payingWeek ? 'Upcoming payout' : start === context.currentMonday ? 'Current production' : pay < context.today ? 'Past scheduled payday' : 'Scheduled';
        return <button type="button" key={start} className={`${styles.weekCard} ${start === selected ? styles.weekCardSelected : ''}`} onClick={() => onOpen(start)}>
          <div><Badge tone={start === context.payingWeek ? 'red' : 'neutral'}>{tag}</Badge><span>{stats.total} records</span></div><h3>{weekLabel(start)}</h3><p>Scheduled pay: <b>{displayDate(pay)}</b></p>
          <dl><div><dt>AR</dt><dd>{stats.ar} <small>{money(stats.arFees)}</small></dd></div><div><dt>Scanning</dt><dd>{stats.scanning} <small>{money(stats.scanningFees)}</small></dd></div><div><dt>Disqualified</dt><dd>{stats.policies}</dd></div></dl>
          <span className={styles.openWeek}>{stats.total ? 'Open this week' : 'Open week - no saved records'} &rarr;</span></button>;
      })}</div>{!info.total && <div className={styles.empty}>No weeks match this search in {year}. Clear the search or turn off the saved-records filter to browse every week.</div>}<Pager info={info} onPage={setPage} label="production weeks" />
      <p className={styles.disclaimer}>Year is based on the production-week Monday. A past payday does not mean paid. No saved records does not mean reports are complete.</p></>}
  </section>;
}

function ImportHistory({ today, refresh, onOpenWeek }) {
  const [from, setFrom] = useState(addDays(today, -90)); const [to, setTo] = useState(today); const [query, setQuery] = useState('');
  const [type, setType] = useState(''); const [page, setPage] = useState(1); const [expanded, setExpanded] = useState('');
  const loader = useCallback(async (signal, progress) => {
    if (!dateKey(from) || !dateKey(to) || from > to) throw new Error('Choose a valid import-date range.');
    // Fetch slightly beyond local-day bounds, then compare Pacific calendar dates.
    const raw = await fetchAll(() => supabase.from('violation_import_batches').select('*', { count: 'exact' })
      .gte('imported_at', `${from}T00:00:00Z`).lt('imported_at', `${addDays(to, 2)}T00:00:00Z`), signal, progress, 'import batches');
    const batches = raw.filter((batch) => businessDate(batch.imported_at) >= from && businessDate(batch.imported_at) <= to);
    const saved = []; const ids = batches.map((batch) => batch.id);
    for (const group of chunks(ids)) {
      for (const table of TABLES) {
        const records = await fetchAll(() => supabase.from(table).select('id,import_batch_id,week_start_date,deduction_week_start', { count: 'exact' }).in('import_batch_id', group), signal, progress, 'batch-linked records');
        saved.push(...records.map((row) => ({ ...row, table })));
      }
    }
    return batches.map((batch) => ({ ...batch, records: saved.filter((row) => String(row.import_batch_id) === String(batch.id)) }))
      .sort((a, b) => clean(b.imported_at).localeCompare(clean(a.imported_at)) || String(b.id).localeCompare(String(a.id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, refresh]);
  const remote = useRemote(loader);
  const filtered = (remote.data || []).filter((batch) => (!type || batch.report_type === type) && [batch.id, batch.report_type, SOURCE_LABELS[batch.report_type], batch.imported_by, displayTime(batch.imported_at)].join(' ').toLowerCase().includes(query.toLowerCase()));
  const info = paginate(filtered, page, 15);
  return <section className={styles.panel}><header className={styles.panelHeader}><div><span className={styles.eyebrow}>UPLOAD AUDIT</span><h2>Import history</h2><p>When a report was submitted, who submitted it, and which commission weeks received saved records.</p></div></header>
    <div className={styles.importFilters}><label>Imported from (Pacific)<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
      <label>Through<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
      <label>Report<select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="">All reports</option>{Object.entries(SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Find batch / manager<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Batch ID or manager email" /></label></div>
    <Message>Batch totals describe the import preview. <b>Saved records now</b> is counted from rows currently linked to that batch. A batch record alone is not proof that all rows were saved.</Message>
    {remote.loading ? <Loading text={remote.progress} /> : remote.error ? <Message danger>Import history unavailable: {remote.error}. Other dashboard views remain available.</Message> : <>
      <Pager info={info} onPage={setPage} label="batches" /><div className={styles.tableViewport}><table className={styles.dataTable}><thead><tr><th>Batch / report</th><th>Imported / manager</th><th>Rows read</th><th>Saved records now</th><th>Preview duplicates</th><th>Preview needs review</th><th>Commission weeks</th></tr></thead><tbody>
        {info.rows.map((batch) => {
          const groups = new Map(); batch.records.forEach((record) => { const week = effectiveWeek(record) || ''; groups.set(week, (groups.get(week) || 0) + 1); });
          return <React.Fragment key={batch.id}><tr><td><strong>#{batch.id}</strong><Badge tone={batch.report_type === 'DISQUALIFIED' ? 'purple' : 'blue'}>{SOURCE_LABELS[batch.report_type] || batch.report_type}</Badge></td>
            <td>{displayTime(batch.imported_at)}<small>{batch.imported_by || 'Manager not stored'}</small></td><td>{batch.rows_pasted ?? '\u2014'}</td>
            <td><strong>{batch.records.length}</strong>{batch.records.length === 0 && <small className={styles.warningText}>No saved rows linked</small>}</td><td>{batch.duplicate_rows ?? '\u2014'}</td>
            <td>{(finite(batch.review_rows) ?? 0) + (finite(batch.unmatched_rows) ?? 0)}</td><td><button className={styles.linkButton} type="button" aria-expanded={expanded === String(batch.id)} onClick={() => setExpanded(expanded === String(batch.id) ? '' : String(batch.id))}>{expanded === String(batch.id) ? 'Hide weeks' : `View ${groups.size} week(s)`}</button></td></tr>
            {expanded === String(batch.id) && <tr><td colSpan={7} className={styles.expandedCell}><div className={styles.batchWeeks}>
              {[...groups].sort(([a], [b]) => b.localeCompare(a)).map(([week, count]) => <button type="button" key={week || 'none'} disabled={!week} onClick={() => onOpenWeek(week, { batch: String(batch.id) })}><b>{weekLabel(week)}</b><span>{count} currently linked records &rarr;</span></button>)}
              {!groups.size && <p>No saved violation/policy rows are linked to this batch. It may have been empty, interrupted, or subsequently changed. Review before re-uploading.</p>}
              <small>Matched at preview: {batch.matched_rows ?? 'not recorded'}. Rows needing review were not automatically saved as pending violations. This view only shows records your account can read.</small>
            </div></td></tr>}
          </React.Fragment>;
        })}
      </tbody></table>{!info.total && <div className={styles.empty}>No import batches returned for these dates and filters.</div>}</div><Pager info={info} onPage={setPage} label="batches" />
    </>}
  </section>;
}

// -----------------------------------------------------------------------------
// All-week, read-only balance reporting. The signed ledger is authoritative.
// Imported fees and stored cutover snapshots are NOT added to live balances.
// -----------------------------------------------------------------------------
const PLACEHOLDER_ACCOUNT = 'nolongerhere@fiestainsurance.com';
const BALANCE_LEDGER = 'agent_commission_balance_ledger';
const balanceCategory = (value) => ['AR'].includes(upper(value)) ? 'AR'
  : ['SCANNING', 'SV'].includes(upper(value)) ? 'SCANNING' : 'UNKNOWN';
const balanceType = (value) => clean(value).toLowerCase().replace(/[\s-]+/g, '_');
const safeCents = (value) => {
  const amount = finite(value);
  if (amount === null) return null;
  const result = Math.round(amount * 100);
  return Number.isSafeInteger(result) ? result : null;
};
const fromCents = (value) => value === null || value === undefined ? null : value / 100;
const balanceMoney = (value) => money(fromCents(value));
const signedBalanceMoney = (value) => value === null ? '\u2014' : `${value > 0 ? '+' : ''}${balanceMoney(value)}`;
const isBalanceRecord = (row) => ['ar', 'scanning'].includes(row.kind);
const ledgerEventKind = (entry) => {
  const type = balanceType(entry.entry_type);
  const amount = safeCents(entry.amount);
  const reference = clean(entry.reference);
  const creator = clean(entry.created_by);
  // These are the actual markers written by the approved one-time cutover SQL.
  const cutover = reference.startsWith('cutover-') || creator.startsWith('commission-cutover-');
  if (cutover) return { kind: 'legacy', label: amount > 0 ? 'Legacy cleanup reversal' : 'Legacy cleanup - treated as paid', isPayment: false };
  if (reference.startsWith('legacy-violation-resolved:')) return { kind: 'adjustment', label: 'Legacy resolved adjustment', isPayment: false };
  if (type === 'commission_applied') return { kind: 'commission', label: amount > 0 ? 'Commission application reversed' : 'Commission applied', isPayment: true };
  if (['payment', 'manual_payment', 'direct_payment', 'external_payment', 'cash_payment', 'repayment'].includes(type)) {
    return { kind: 'payment', label: amount > 0 ? 'Payment reversed' : 'Payment recorded', isPayment: true };
  }
  if (['charge', 'opening_balance'].includes(type) && amount >= 0) return { kind: 'charge', label: type === 'opening_balance' ? 'Opening balance' : 'Charge recorded', isPayment: false };
  if (['void', 'voided', 'waiver', 'waived'].includes(type)) return { kind: 'adjustment', label: amount > 0 ? 'Waiver / void reversed' : 'Waiver / void credit', isPayment: false };
  if (['adjustment', 'credit', 'reversal', 'write_off'].includes(type)) return { kind: 'adjustment', label: amount > 0 ? 'Balance adjustment - increase' : 'Balance adjustment - credit', isPayment: false };
  return { kind: 'other', label: type ? `Other activity: ${clean(entry.entry_type)}` : 'Unclassified activity', isPayment: false };
};
const compareBalanceEvents = (a, b) => (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31')
  || clean(a.raw.created_at).localeCompare(clean(b.raw.created_at))
  || String(a.raw.id ?? a.index).localeCompare(String(b.raw.id ?? b.index), 'en', { numeric: true });

const loadBalanceReport = async (signal, progress) => {
  // Deliberately no selected-week, year, or payment-date restriction here.
  const ledger = await fetchAll(() => supabase.from(BALANCE_LEDGER).select('*', { count: 'exact' }), signal, progress, 'all-week AR / SV ledger');
  let violations = []; let recordsError = '';
  try {
    violations = await fetchAll(() => supabase.from('violations').select('*', { count: 'exact' }), signal, progress, 'violation explanations and ledger coverage');
  } catch (error) {
    if (signal?.aborted) throw error;
    recordsError = error.message;
  }
  const commissionIds = [...new Set(ledger.map((entry) => clean(entry.linked_commission_record_id)).filter(Boolean))];
  const commissions = []; let commissionsError = '';
  try {
    for (const ids of chunks(commissionIds)) {
      commissions.push(...await fetchAll(() => supabase.from('agent_commission_records')
        .select('id,agent_email,week_start_date', { count: 'exact' }).in('id', ids), signal, progress, 'linked commission weeks'));
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    commissionsError = error.message;
  }
  return { ledger, violations, commissions, recordsError, commissionsError };
};

const buildBalanceReport = (data, directory) => {
  if (!data) return { accounts: [], events: [], untracked: [], unknownCategoryCount: 0 };
  const records = data.violations.map((raw) => ({ ...normalizeRecord(raw, 'violations'),
    enteredDate: raw.created_at ? businessDate(raw.created_at) : dateKey(raw.reported_date) }));
  const recordsById = new Map(records.map((row) => [String(row.id), row]));
  const commissionsById = new Map(data.commissions.map((row) => [String(row.id), row]));
  const accountsByEmail = new Map();
  const ensureAccount = (email) => {
    const key = emailKey(email) || '(unassigned)';
    if (!accountsByEmail.has(key)) accountsByEmail.set(key, {
      email: key, name: directory?.get(key)?.full_name || (key === '(unassigned)' ? 'Unassigned ledger activity' : key),
      placeholder: key === PLACEHOLDER_ACCOUNT, events: [], items: [], issues: [], offices: new Set(),
      untracked: [], hasRecordCoverage: !data.recordsError,
    });
    return accountsByEmail.get(key);
  };
  const covered = new Set();
  const events = data.ledger.map((raw, index) => {
    const account = ensureAccount(raw.agent_email);
    const category = balanceCategory(raw.category);
    const amountCents = safeCents(raw.amount);
    const violationId = clean(raw.linked_violation_id);
    const record = recordsById.get(violationId) || null;
    const issues = [];
    if (amountCents === null) issues.push('Ledger amount is invalid or missing.');
    if (category === 'UNKNOWN') issues.push(`Ledger category is not AR / SCANNING: ${clean(raw.category) || '(blank)'}.`);
    if (account.email === '(unassigned)') issues.push('Ledger agent email is missing.');
    if (violationId && record && record.email !== account.email) issues.push('Linked violation belongs to a different agent.');
    const sourceCategory = record?.kind === 'ar' ? 'AR' : record?.kind === 'scanning' ? 'SCANNING' : '';
    if (record && sourceCategory !== category) issues.push('Ledger category differs from the linked violation.');
    if (violationId && !record) issues.push(data.recordsError ? 'Violation details could not be loaded.' : 'Linked violation was not returned by the source query.');
    if (record && record.email === account.email && sourceCategory === category) {
      covered.add(`${account.email}|${violationId}`);
      if (record.office) account.offices.add(record.office);
    }
    const commissionId = clean(raw.linked_commission_record_id);
    const commission = commissionsById.get(commissionId);
    let commissionWeek = '';
    const entryWeek = dateKey(raw.week_start_date);
    const classification = ledgerEventKind(raw);
    if (commission && emailKey(commission.agent_email) !== account.email) {
      issues.push('Linked commission belongs to a different agent.');
    } else if (commission) {
      const savedWeek = dateKey(commission.week_start_date);
      if (entryWeek && savedWeek && entryWeek !== savedWeek) issues.push('Ledger week and linked commission week disagree.');
      else commissionWeek = savedWeek || entryWeek;
    } else if (classification.kind === 'commission') {
      commissionWeek = entryWeek;
      if (commissionId) issues.push('Linked commission record is unavailable; any shown week comes from the ledger.');
    }
    const ledgerDate = dateKey(raw.entry_date);
    const recordedDate = raw.created_at ? businessDate(raw.created_at) : '';
    const event = { key: `ledger:${raw.id ?? index}`, index, raw, accountEmail: account.email, category, amountCents,
      violationId, record, commissionId, commissionWeek, ledgerWeek: entryWeek,
      ledgerDate, recordedDate, date: ledgerDate || recordedDate, dateBasis: ledgerDate ? 'Ledger date' : 'Recorded date only',
      classification, issues, runningNetCents: null };
    account.events.push(event);
    return event;
  });
  // Active source rows absent from the ledger remain visible as a coverage gap.
  // A original fee, Pending status, or old remaining_balance snapshot is not live debt.
  records.filter(isBalanceRecord).forEach((record) => {
    const key = `${record.email || '(unassigned)'}|${record.id}`;
    if (covered.has(key)) return;
    if (isVoided(record) || (record.fee !== null && record.fee <= 0 && !(finite(record.remaining_balance) > 0))) return;
    const account = ensureAccount(record.email);
    account.untracked.push(record);
    if (record.office) account.offices.add(record.office);
  });
  for (const account of accountsByEmail.values()) {
    account.events.sort(compareBalanceEvents);
    let running = 0;
    account.events.forEach((event) => {
      if (event.amountCents === null || event.category === 'UNKNOWN') running = null;
      else if (running !== null) running += event.amountCents;
      event.runningNetCents = running;
    });
    const groups = new Map();
    account.events.forEach((event) => {
      const key = `${event.category}:${event.violationId || '(account-level)'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(event);
    });
    for (const [key, itemEvents] of groups) {
      const first = itemEvents[0]; const record = first.record;
      const known = itemEvents.every((event) => event.amountCents !== null && event.category !== 'UNKNOWN');
      const remainingCents = known ? itemEvents.reduce((sum, event) => sum + event.amountCents, 0) : null;
      const increasesCents = known ? itemEvents.reduce((sum, event) => sum + Math.max(0, event.amountCents), 0) : null;
      const reductionsCents = known ? itemEvents.reduce((sum, event) => sum + Math.max(0, -event.amountCents), 0) : null;
      const paidCents = known ? itemEvents.filter((event) => event.classification.isPayment)
        .reduce((sum, event) => sum - event.amountCents, 0) : null;
      const legacyCents = known ? itemEvents.filter((event) => event.classification.kind === 'legacy')
        .reduce((sum, event) => sum - event.amountCents, 0) : null;
      const otherCreditsCents = known ? itemEvents.filter((event) => !event.classification.isPayment)
        .reduce((sum, event) => sum + Math.max(0, -event.amountCents), 0) : null;
      const issues = [...new Set(itemEvents.flatMap((event) => event.issues))];
      if (record && isVoided(record) && remainingCents !== null && remainingCents !== 0) issues.push('Voided source record still has a ledger balance.');
      if (!first.violationId) issues.push('Account-level activity is not allocated to an individual violation.');
      const status = !known ? 'Balance unavailable' : remainingCents < 0 ? 'Credit balance'
        : remainingCents > 0 ? (reductionsCents > 0 ? 'Partially settled' : 'Pending balance')
          : increasesCents === 0 ? 'No recorded balance' : legacyCents > 0 ? 'Settled - legacy cleanup'
            : otherCreditsCents > 0 ? 'Settled by credits' : 'Paid';
      account.items.push({ key, category: first.category, violationId: first.violationId, record, events: itemEvents,
        known, remainingCents, increasesCents, reductionsCents, paidCents, legacyCents, otherCreditsCents,
        status, issues, missingLedger: false, originalDate: record?.sourceDate || first.date });
    }
    account.untracked.forEach((record) => account.items.push({
      key: `untracked:${record.id}`, category: record.kind === 'ar' ? 'AR' : 'SCANNING', violationId: String(record.id),
      record, events: [], known: false, remainingCents: null, increasesCents: null, paidCents: null,
      legacyCents: null, otherCreditsCents: null, reductionsCents: null, missingLedger: true, originalDate: record.sourceDate || record.enteredDate,
      status: 'Not in ledger', issues: ['No matching AR/SV ledger entries for this agent and violation. The amount still owed is not assumed.'],
    }));
    account.items.sort((a, b) => (a.originalDate || '9999').localeCompare(b.originalDate || '9999') || a.key.localeCompare(b.key));
    account.categoryNets = {};
    for (const category of ['AR', 'SCANNING']) {
      const own = account.events.filter((event) => event.category === category);
      const uncovered = account.untracked.some((record) => (record.kind === 'ar' ? 'AR' : 'SCANNING') === category);
      account.categoryNets[category] = own.some((event) => event.amountCents === null) || (!own.length && uncovered)
        ? null : own.reduce((sum, event) => sum + event.amountCents, 0);
    }
    account.hasUnknownCategory = account.events.some((event) => event.category === 'UNKNOWN');
    account.totalCents = account.hasUnknownCategory || Object.values(account.categoryNets).some((value) => value === null) ? null
      : Object.values(account.categoryNets).reduce((sum, value) => sum + Math.max(0, value), 0);
    account.creditCents = Object.values(account.categoryNets).reduce((sum, value) => sum + (value === null ? 0 : Math.max(0, -value)), 0);
    const sumEffect = (predicate) => {
      const selected = account.events.filter(predicate);
      return selected.some((event) => event.amountCents === null || event.category === 'UNKNOWN') ? null : selected.reduce((sum, event) => sum - event.amountCents, 0);
    };
    account.paidCents = sumEffect((event) => event.classification.isPayment);
    account.legacyCents = sumEffect((event) => event.classification.kind === 'legacy');
    account.otherCreditCents = account.events.filter((event) => event.category !== 'UNKNOWN' && !event.classification.isPayment && event.classification.kind !== 'legacy')
      .reduce((sum, event) => sum + (event.amountCents === null ? 0 : Math.max(0, -event.amountCents)), 0);
    account.lastActivity = account.events[account.events.length - 1]?.date || '';
    account.lastPayment = account.events.filter((event) => event.classification.isPayment && event.amountCents < 0).slice(-1)[0]?.date || '';
    account.issues = [...new Set(account.items.flatMap((item) => item.issues))];
    if (account.untracked.length) account.issues.push(`${account.untracked.length} source record(s) need ledger coverage.`);
    if (data.recordsError) account.issues.push('Source record coverage could not be checked.');
    if (!account.email || account.email === '(unassigned)') account.issues.push('Agent identity needs review.');
    account.needsReview = account.issues.length > 0;
    account.openCount = account.items.filter((item) => item.remainingCents > 0).length;
    account.offices = [...account.offices].sort();
    account.searchText = [account.name, account.email, ...account.offices, ...account.items.flatMap((item) =>
      [item.violationId, item.record?.client_name, item.record?.policy_number, item.record?.customer_id, item.record?.notes])].map(clean).join(' ').toLowerCase();
  }
  return { accounts: [...accountsByEmail.values()], events,
    untracked: [...accountsByEmail.values()].flatMap((account) => account.untracked),
    unknownCategoryCount: events.filter((event) => event.category === 'UNKNOWN').length };
};

// A coverage issue is not evidence of money owed. Only a positive, known AR/SV
// category balance may put an account in the default outstanding list.
// Keep category credits separate; this page does not allocate them across categories.
const recordedOutstandingCents = (account) => ['AR', 'SCANNING'].reduce((sum, category) => {
  const value = account.categoryNets[category];
  return sum + (Number.isSafeInteger(value) && value > 0 ? value : 0);
}, 0);
const hasRecordedOutstandingBalance = (account) => recordedOutstandingCents(account) > 0;
const displayedAccountBalanceCents = (account) => Number.isSafeInteger(account.totalCents)
  ? account.totalCents : hasRecordedOutstandingBalance(account) ? recordedOutstandingCents(account) : null;

// A successful SELECT can still return no visible ledger rows. Do not turn that
// into "$0 owed" when source violations indicate that ledger coverage needs checking.
const balanceReadDiagnostics = (data, report) => {
  const ledgerRows = data?.ledger || [];
  const relevantRows = ledgerRows.filter((entry) => balanceCategory(entry.category) !== 'UNKNOWN');
  const coverageMissing = !!data?.recordsError || report.untracked.length > 0;
  const noLedgerReturned = ledgerRows.length === 0 && coverageMissing;
  const noSupportedRows = ledgerRows.length > 0 && relevantRows.length === 0;
  return {
    ledgerRows: ledgerRows.length,
    arSvLedgerRows: relevantRows.length,
    sourceRows: (data?.violations || []).length,
    noLedgerReturned,
    noSupportedRows,
    unavailable: noLedgerReturned || noSupportedRows,
  };
};

const balanceAccountScope = (accounts, scope) => accounts.filter((account) => scope === 'placeholder' ? account.placeholder : scope === 'all' || !account.placeholder);
const balanceAccountTotals = (accounts) => {
  const totals = { ar: 0, scanning: 0, owedAgents: 0, paid: 0, legacy: 0, other: 0, credits: 0, incomplete: 0, untracked: 0 };
  accounts.forEach((account) => {
    totals.ar += Math.max(0, account.categoryNets.AR ?? 0);
    totals.scanning += Math.max(0, account.categoryNets.SCANNING ?? 0);
    if (hasRecordedOutstandingBalance(account)) totals.owedAgents += 1;
    totals.paid += account.paidCents ?? 0;
    totals.legacy += account.legacyCents ?? 0;
    totals.other += account.otherCreditCents;
    totals.credits += account.creditCents;
    if (account.needsReview || account.totalCents === null) totals.incomplete += 1;
    totals.untracked += account.untracked.length;
  });
  return totals;
};
const filterBalanceAccounts = (accounts, query, show, sort) => {
  const words = clean(query).toLowerCase().split(/\s+/).filter(Boolean);
  return accounts.filter((account) => {
    const owes = hasRecordedOutstandingBalance(account);
    if (show === 'outstanding' && !owes) return false;
    if (show === 'settled' && (owes || account.totalCents === null || account.needsReview)) return false;
    if (show === 'review' && !account.needsReview) return false;
    return words.every((word) => account.searchText.includes(word));
  }).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name) || a.email.localeCompare(b.email);
    if (sort === 'recent') return b.lastActivity.localeCompare(a.lastActivity) || a.email.localeCompare(b.email);
    if (sort === 'review' && a.needsReview !== b.needsReview) return Number(b.needsReview) - Number(a.needsReview);
    return recordedOutstandingCents(b) - recordedOutstandingCents(a) || a.name.localeCompare(b.name) || a.email.localeCompare(b.email);
  });
};
const filterBalanceEvents = (events, filters, directory) => {
  const terms = clean(filters.query).toLowerCase().split(/\s+/).filter(Boolean);
  return events.filter((event) => {
    const { kind } = event.classification;
    if (filters.category && event.category !== filters.category) return false;
    if (filters.mode === 'changes' && kind === 'charge') return false;
    if (filters.mode === 'payments' && !event.classification.isPayment) return false;
    if (filters.mode === 'legacy' && kind !== 'legacy') return false;
    if (filters.mode === 'adjustments' && !['adjustment', 'other'].includes(kind)) return false;
    if (filters.from && (!event.date || event.date < filters.from)) return false;
    if (filters.to && (!event.date || event.date > filters.to)) return false;
    const search = [event.accountEmail, directory?.get(event.accountEmail)?.full_name, event.raw.id, event.violationId,
      event.raw.description, event.raw.reference, event.raw.created_by, event.record?.client_name, event.record?.policy_number,
      event.record?.customer_id, event.record?.notes, event.commissionId, event.commissionWeek, event.ledgerWeek, event.classification.label]
      .map(clean).join(' ').toLowerCase();
    return terms.every((term) => search.includes(term));
  }).sort((a, b) => -compareBalanceEvents(a, b));
};
const downloadBalanceCsv = (header, rows, name) => {
  const text = '\uFEFF' + [header, ...rows].map((line) => line.map((value) => typeof value === 'number' && Number.isFinite(value) ? String(value) : csvCell(value)).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a'); link.href = url; link.download = `${name}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const exportBalanceAccounts = (accounts) => downloadBalanceCsv(
  ['Agent', 'Email', 'Placeholder', 'Recorded offices', 'AR ledger net', 'Scanning ledger net', 'Recorded remaining (no category credit offset)',
    'Known positive ledger subtotal (not a complete balance when coverage is missing)', 'Credit balance', 'Net payments / commission applied', 'Legacy cleanup net credit', 'Other credits', 'Open ledger items', 'Untracked source records', 'Last payment ledger date', 'Last activity date', 'Needs review'],
  accounts.map((account) => [account.name, account.email, account.placeholder ? 'Yes' : 'No', account.offices.join(', '),
    fromCents(account.categoryNets.AR), fromCents(account.categoryNets.SCANNING), fromCents(account.totalCents), fromCents(displayedAccountBalanceCents(account)), fromCents(account.creditCents),
    fromCents(account.paidCents), fromCents(account.legacyCents), fromCents(account.otherCreditCents), account.openCount, account.untracked.length,
    account.lastPayment, account.lastActivity, account.issues.join(' | ')]), 'ar_sv_agent_balances');
const exportBalanceEvents = (events) => downloadBalanceCsv(
  ['Ledger ID', 'Agent email', 'Category', 'Activity', 'Entry type', 'Ledger date', 'Recorded at', 'Balance change', 'Agent net after entry',
    'Violation ID', 'Client', 'Policy', 'Violation week', 'Applied commission week', 'Commission ID', 'Reason', 'Reference', 'Recorded by', 'Legacy timing note', 'Review notes'],
  events.map((event) => [event.raw.id, event.accountEmail, event.category, event.classification.label, event.raw.entry_type,
    event.ledgerDate, event.raw.created_at, fromCents(event.amountCents), fromCents(event.runningNetCents), event.violationId,
    event.record?.client_name, event.record?.policy_number, event.record?.week, event.commissionWeek, event.commissionId,
    event.raw.description, event.raw.reference, event.raw.created_by, event.classification.kind === 'legacy' ? 'Cleanup recording date; original payment date unknown' : '',
    event.issues.join(' | ')]), 'ar_sv_payment_adjustment_history');


function BalanceHistory({ events, directory, onOpenWeek, initialMode = 'changes', compact = false }) {
  const [filters, setFilters] = useState({ query: '', category: '', mode: initialMode, from: '', to: '' });
  const [page, setPage] = useState(1); const [size, setSize] = useState(25); const [expanded, setExpanded] = useState('');
  const validDates = (!filters.from || !!dateKey(filters.from)) && (!filters.to || !!dateKey(filters.to)) &&
    (!filters.from || !filters.to || filters.from <= filters.to);
  const filtered = useMemo(() => validDates ? filterBalanceEvents(events, filters, directory) : [], [events, filters, directory, validDates]);
  const info = paginate(filtered, page, size);
  const change = (key, value) => { setFilters((previous) => ({ ...previous, [key]: value })); setPage(1); setExpanded(''); };
  const paymentNet = filtered.filter((event) => event.classification.isPayment && event.amountCents !== null).reduce((sum, event) => sum - event.amountCents, 0);
  const legacyNet = filtered.filter((event) => event.classification.kind === 'legacy' && event.amountCents !== null).reduce((sum, event) => sum - event.amountCents, 0);
  return <section className={`${styles.balanceHistory} ${compact ? styles.balanceHistoryCompact : ''}`} aria-label="Payment and adjustment history">
    <header className={styles.panelHeader}><div><span className={styles.eyebrow}>AUDIT HISTORY</span><h2>{initialMode === 'all' ? 'All ledger activity' : 'Payments & adjustments'}</h2>
      <p>Payment entries, commission applications, legacy cleanup and other credits stay separate.</p></div>
      <button type="button" disabled={!filtered.length || !validDates} onClick={() => exportBalanceEvents(filtered)}>Export filtered history</button></header>
    <div className={styles.balanceHistoryFilters}>
      <label className={styles.balanceSearch}>Find agent / client / payment<input aria-label="Search payment history" type="search" value={filters.query} onChange={(event) => change('query', event.target.value)} placeholder="Name, policy, reference, manager, reason..." /></label>
      <label>Activity<select aria-label="History activity" value={filters.mode} onChange={(event) => change('mode', event.target.value)}>
        <option value="changes">Payments & adjustments</option><option value="payments">Payments / commission applied</option><option value="legacy">Legacy cleanup</option><option value="adjustments">Other adjustments</option><option value="all">All ledger activity (incl. charges)</option>
      </select></label>
      <label>Category<select aria-label="History category" value={filters.category} onChange={(event) => change('category', event.target.value)}><option value="">AR + scanning</option><option value="AR">AR</option><option value="SCANNING">Scanning</option>{events.some((event) => event.category === 'UNKNOWN') && <option value="UNKNOWN">Unclassified</option>}</select></label>
      <label>Ledger date from<input aria-label="History from date" type="date" value={filters.from} onChange={(event) => change('from', event.target.value)} /></label>
      <label>Through<input aria-label="History through date" type="date" value={filters.to} onChange={(event) => change('to', event.target.value)} /></label>
    </div>
    <div className={styles.filterFooter}><div><p className={styles.balanceCaption}>History filters do not change today's recorded balance. Running balances include earlier and hidden ledger entries.</p>
      <p className={styles.balanceCaption}>In this filtered history: <b>{balanceMoney(paymentNet)}</b> net payments / commission applied; <b>{balanceMoney(legacyNet)}</b> legacy cleanup credits.</p></div>
      <div className={styles.miniControls}><button type="button" onClick={() => { setFilters({ query: '', category: '', mode: initialMode, from: '', to: '' }); setPage(1); }}>Reset</button>
        <label>Rows<select aria-label="History rows per page" value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>{PAGE_SIZES.map((value) => <option key={value}>{value}</option>)}</select></label></div></div>
    {!validDates ? <Message danger>The start date must be on or before the end date.</Message> : <>
      <Pager info={info} onPage={setPage} label="history entries" />
      <div className={styles.balanceTableViewport}><table className={`${styles.balanceTable} ${styles.balanceEventTable}`}>
        <caption className={styles.balanceSrOnly}>Recorded payments, commission applications and adjustments. Negative changes reduce balances.</caption>
        <thead><tr><th>When</th><th>Agent / category</th><th>Activity / source</th><th>Client / policy</th><th>Balance change</th><th>Agent net after entry</th><th>Why / action</th></tr></thead>
        <tbody>{info.rows.map((event) => <React.Fragment key={event.key}>
          <tr className={event.issues.length ? styles.attentionRow : ''}>
            <td><strong>{displayDate(event.date)}</strong><small>{event.dateBasis}</small><small>Recorded {displayTime(event.raw.created_at)} PT</small>
              {event.classification.kind === 'legacy' && <small className={styles.warningText}>Prior payment date unknown</small>}</td>
            <td><strong>{directory?.get(event.accountEmail)?.full_name || event.accountEmail}</strong><small>{event.accountEmail}</small>
              <Badge tone={event.category === 'AR' ? 'blue' : event.category === 'SCANNING' ? 'purple' : 'amber'}>{event.category === 'SCANNING' ? 'Scanning' : event.category}</Badge></td>
            <td><Badge tone={event.classification.kind === 'legacy' ? 'purple' : event.classification.isPayment ? 'green' : 'neutral'}>{event.classification.label}</Badge>
              <small>Ledger #{event.raw.id}</small>
              {event.commissionWeek ? <button className={styles.linkButton} type="button" onClick={() => onOpenWeek(event.commissionWeek)}>Applied from week {displayDate(event.commissionWeek)}</button>
                : event.commissionId ? <small>Commission #{event.commissionId} (week unavailable)</small> : <small>No linked commission record</small>}</td>
            <td><strong>{event.record?.client_name || (event.violationId ? 'Client details unavailable' : 'Account-level entry')}</strong>
              <small>{event.record?.policy_number ? `Policy: ${event.record.policy_number}` : event.record?.customer_id ? `Customer ID: ${event.record.customer_id}` : 'No policy detail returned'}</small>
              {event.record?.week && <small>Violation week: {displayDate(event.record.week)}</small>}</td>
            <td className={styles.balanceNumber}><strong className={event.amountCents < 0 ? styles.goodText : ''}>{signedBalanceMoney(event.amountCents)}</strong><small>{event.amountCents < 0 ? 'Reduces balance' : event.amountCents > 0 ? 'Increases balance' : event.amountCents === null ? 'Amount unavailable' : 'No balance change'}</small></td>
            <td className={styles.balanceNumber}>{balanceMoney(event.runningNetCents)}<small>Signed AR + SV net</small></td>
            <td><p className={styles.clampedNote}>{event.raw.description || 'No explanation stored.'}</p>
              {event.issues.length > 0 && <small className={styles.warningText}>{event.issues[0]}</small>}
              <button type="button" className={styles.linkButton} aria-expanded={expanded === event.key} onClick={() => setExpanded(expanded === event.key ? '' : event.key)}>{expanded === event.key ? 'Hide audit' : 'View audit'}</button></td>
          </tr>
          {expanded === event.key && <tr><td colSpan={7} className={styles.balanceExpandedCell}>
            <div className={styles.notePanel}><strong>Recorded reason</strong><p>{event.raw.description || 'No explanation stored.'}</p></div>
            {event.classification.kind === 'legacy' && <Message>This is the one-time cleanup: prior balances were treated as paid. The displayed date records that cleanup, not the unknown date the historical payment actually happened.</Message>}
            <dl className={styles.detailGrid}>{[
              ['Ledger entry', event.raw.id], ['Entry type (stored)', event.raw.entry_type], ['Reference', event.raw.reference], ['Recorded by', event.raw.created_by],
              ['Ledger date', event.raw.entry_date], ['Created at (Pacific)', displayTime(event.raw.created_at)], ['Linked violation', event.violationId], ['Linked commission', event.commissionId],
              ['Ledger week (stored)', event.ledgerWeek], ['Confirmed / ledger application week', event.commissionWeek],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{clean(value) || '\u2014'}</dd></div>)}</dl>
            {event.issues.length > 0 && <Message danger>{event.issues.join(' ')}</Message>}
          </td></tr>}
        </React.Fragment>)}</tbody>
      </table>{!info.total && <div className={styles.empty}><strong>No matching ledger activity.</strong><p>{events.length ? 'Change the date, activity type, or search to see other entries.' : 'No payment dates or amounts are invented for records without ledger entries.'}</p></div>}</div>
      <Pager info={info} onPage={setPage} label="history entries" />
      <p className={styles.disclaimer}>Dates reflect stored ledger data. Legacy and resolved adjustments are not new cash payments. Equal-date activity is ordered by stored creation time and ledger ID.</p>
    </>}
  </section>;
}

function BalanceObligations({ account, mode, directory, onOpenWeek }) {
  const [query, setQuery] = useState(''); const [page, setPage] = useState(1); const [size, setSize] = useState(25); const [expanded, setExpanded] = useState('');
  const terms = clean(query).toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = account.items.filter((item) => {
    if (mode === 'current' && item.known && item.remainingCents <= 0 && !item.issues.length) return false;
    if (mode === 'settled' && (!item.known || item.remainingCents > 0)) return false;
    const text = [item.violationId, item.category, item.record?.client_name, item.record?.policy_number, item.record?.customer_id, item.record?.notes, item.status].map(clean).join(' ').toLowerCase();
    return terms.every((word) => text.includes(word));
  });
  const info = paginate(filtered, page, size);
  const exportItems = () => downloadBalanceCsv(
    ['Agent', 'Category', 'Violation ID', 'Client', 'Policy', 'Customer ID', 'Source date', 'Violation week', 'Ledger increases', 'Net payments applied', 'Other credits (including legacy)', 'Remaining', 'Status', 'Source fee (not remaining)', 'Stored remaining snapshot (not live)', 'Notes', 'Review issues'],
    filtered.map((item) => [account.email, item.category, item.violationId, item.record?.client_name, item.record?.policy_number, item.record?.customer_id,
      item.originalDate, item.record?.week, fromCents(item.increasesCents), fromCents(item.paidCents), fromCents(item.otherCreditsCents), fromCents(item.remainingCents), item.status,
      item.record?.fee, item.record?.remaining_balance, item.record?.notes, item.issues.join(' | ')]), 'ar_sv_account_items');
  return <section aria-label="Individual AR and scanning balances">
    <div className={styles.balanceItemTools}><label>Find a violation<input aria-label="Search account violations" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Client, policy, category or reason" /></label>
      <div className={styles.miniControls}><button type="button" onClick={exportItems} disabled={!filtered.length}>Export items</button><label>Rows<select aria-label="Account items rows per page" value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>{PAGE_SIZES.map((value) => <option key={value}>{value}</option>)}</select></label></div></div>
    <Pager info={info} onPage={setPage} label="account items" />
    <div className={styles.balanceTableViewport}><table className={styles.balanceTable}>
      <thead><tr><th>Type / date</th><th>Client / policy</th><th>Ledger increases</th><th>Net paid / applied</th><th>Other credits</th><th>Remaining / status</th><th>Reason / history</th></tr></thead>
      <tbody>{info.rows.map((item) => <React.Fragment key={item.key}>
        <tr className={!item.known || item.issues.length ? styles.attentionRow : ''}>
          <td><Badge tone={item.category === 'AR' ? 'blue' : 'purple'}>{item.category === 'SCANNING' ? 'Scanning' : item.category}</Badge><small>{item.record?.violation_category || 'Ledger activity'}</small><small>{displayDate(item.originalDate)}</small></td>
          <td><strong>{item.record?.client_name || (item.violationId ? 'Source details unavailable' : 'Unallocated account activity')}</strong>
            <small>Policy: {item.record?.policy_number || '\u2014'}</small>{item.record?.customer_id && <small>Customer ID: {item.record.customer_id}</small>}
            {item.record?.week && <button type="button" className={styles.linkButton} onClick={() => onOpenWeek(item.record.week)}>Open violation week {displayDate(item.record.week)}</button>}</td>
          <td className={styles.balanceNumber}>{balanceMoney(item.increasesCents)}{item.record?.fee != null && <small>Source fee: {money(item.record.fee)}</small>}</td>
          <td className={styles.balanceNumber}>{balanceMoney(item.paidCents)}<small>Explicit payment / commission entries</small></td>
          <td className={styles.balanceNumber}>{balanceMoney(item.otherCreditsCents)}{item.legacyCents > 0 && <small>Includes {balanceMoney(item.legacyCents)} legacy cleanup</small>}</td>
          <td className={styles.balanceNumber}><strong>{balanceMoney(item.remainingCents)}</strong><Badge tone={!item.known ? 'amber' : item.remainingCents > 0 ? 'amber' : 'green'}>{item.status}</Badge>
            {item.missingLedger && finite(item.record?.remaining_balance) !== null && <small>Snapshot only: {money(item.record.remaining_balance)}</small>}</td>
          <td><p className={styles.clampedNote}>{item.record?.notes || item.events[0]?.raw.description || 'No explanation stored.'}</p>
            {!!item.issues.length && <small className={styles.warningText}>{item.issues[0]}</small>}
            <button type="button" className={styles.linkButton} aria-expanded={expanded === item.key} onClick={() => setExpanded(expanded === item.key ? '' : item.key)}>{expanded === item.key ? 'Hide timeline' : 'View timeline / why'}</button></td>
        </tr>
        {expanded === item.key && <tr><td colSpan={7} className={styles.balanceExpandedCell}>
          <div className={styles.notePanel}><strong>Original violation explanation</strong><p>{item.record?.notes || 'Original source details unavailable.'}</p></div>
          <dl className={styles.detailGrid}><div><dt>Violation ID</dt><dd>{item.violationId || 'Account-level entries'}</dd></div><div><dt>Source record status</dt><dd>{item.record?.status || '\u2014'}</dd></div>
            <div><dt>Stored repayment snapshot</dt><dd>{item.record?.repayment_status || 'Not stored'}</dd></div><div><dt>Snapshot balance / recorded at</dt><dd>{money(item.record?.remaining_balance)} / {displayTime(item.record?.reconciled_at)}</dd></div></dl>
          {item.issues.length > 0 && <Message>{item.issues.join(' ')}</Message>}
          {item.events.length ? <BalanceHistory events={item.events} directory={directory} onOpenWeek={onOpenWeek} initialMode="all" compact />
            : <Message>No ledger timeline is available. The original fee and repayment snapshot are shown as reference only; they are not counted as paid or outstanding.</Message>}
        </td></tr>}
      </React.Fragment>)}</tbody>
    </table>{!info.total && <div className={styles.empty}>{mode === 'current' ? 'No current ledger balance or untracked item matches this search.' : 'No settled items match this search.'}</div>}</div>
    <Pager info={info} onPage={setPage} label="account items" />
    <p className={`${styles.disclaimer} ${styles.balanceItemFootnote}`}>Individual items are not netted against unallocated account credits automatically. Credits and reversals remain visible; this view does not run FIFO collection.</p>
  </section>;
}

function BalanceAccount({ account, directory, onBack, onOpenWeek }) {
  const [view, setView] = useState('current');
  const settledCount = account.items.filter((item) => item.known && item.remainingCents <= 0).length;
  const currentCount = account.items.filter((item) => !item.known || item.remainingCents > 0 || item.issues.length > 0).length;
  return <section className={styles.panel} aria-label="Agent balance account">
    <header className={styles.panelHeader}><div><span className={styles.eyebrow}>AGENT ACCOUNT - ALL WEEKS</span><h2>{account.name}</h2><p>{account.email}{account.offices.length ? ` | Recorded offices: ${account.offices.join(', ')}` : ''}</p></div>
      <button type="button" onClick={onBack}>&larr; Back to agent balances</button></header>
    {account.placeholder && <Message>This is the placeholder account. Its records are visible for reporting only and are not changed by this dashboard.</Message>}
    <div className={styles.balanceAccountMetrics}>
      <div><span>AR ledger net</span><strong>{balanceMoney(account.categoryNets.AR)}</strong></div>
      <div><span>Scanning ledger net</span><strong>{balanceMoney(account.categoryNets.SCANNING)}</strong></div>
      <div><span>Net payments / commission applied</span><strong>{balanceMoney(account.paidCents)}</strong></div>
      <div><span>Legacy cleanup credit</span><strong>{balanceMoney(account.legacyCents)}</strong></div>
    </div>
    <div className={styles.balanceAccountScope}><strong>{account.totalCents === null ? 'Known ledger portion remaining' : 'Recorded remaining'}: {balanceMoney(displayedAccountBalanceCents(account))}</strong><span>Other credits: {balanceMoney(account.otherCreditCents)} &middot; Credit balances: {balanceMoney(account.creditCents)}</span>
      <small>AR and scanning are separate. A credit in one category is not silently applied to the other.</small></div>
    {account.needsReview && <Message><strong>Balance evidence needs review.</strong> {account.untracked.length > 0 && `${account.untracked.length} source record(s) are not represented in the ledger. `}
      Balances shown are tracked ledger amounts only. <details><summary>See account review notes</summary>{account.issues.map((issue) => <p key={issue}>{issue}</p>)}</details></Message>}
    <div className={styles.balanceSubTabs} role="group" aria-label="Agent account sections">
      {[['current', `Current owed / review (${currentCount})`], ['settled', `Paid / resolved (${settledCount})`], ['history', 'Payment & adjustment history'], ['ledger', 'All ledger activity']].map(([key, label]) =>
        <button type="button" key={key} aria-pressed={view === key} className={view === key ? styles.selected : ''} onClick={() => setView(key)}>{label}</button>)}
    </div>
    {['current', 'settled'].includes(view) ? <BalanceObligations key={view} account={account} mode={view} directory={directory} onOpenWeek={onOpenWeek} />
      : <BalanceHistory key={view} events={account.events} directory={directory} onOpenWeek={onOpenWeek} initialMode={view === 'ledger' ? 'all' : 'changes'} />}
  </section>;
}

function BalancesRepayment({ refresh, directory, directoryError, directoryLoading, onOpenWeek }) {
  const [view, setView] = useState('agents'); const [scope, setScope] = useState('agents');
  const [query, setQuery] = useState(''); const [show, setShow] = useState('outstanding'); const [sort, setSort] = useState('balance');
  const [page, setPage] = useState(1); const [size, setSize] = useState(25); const [selectedEmail, setSelectedEmail] = useState('');
  // The refresh token explicitly reloads the all-time read snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loader = useCallback((signal, progress) => loadBalanceReport(signal, progress), [refresh]);
  const remote = useRemote(loader);
  const report = useMemo(() => buildBalanceReport(remote.data, directory), [remote.data, directory]);
  const accounts = useMemo(() => balanceAccountScope(report.accounts, scope), [report.accounts, scope]);
  const totals = useMemo(() => balanceAccountTotals(accounts), [accounts]);
  const filtered = useMemo(() => filterBalanceAccounts(accounts, query, show, sort), [accounts, query, show, sort]);
  const allEvents = useMemo(() => accounts.flatMap((account) => account.events), [accounts]);
  const info = paginate(filtered, page, size); const selectedAccount = accounts.find((account) => account.email === selectedEmail);
  const placeholderCount = report.accounts.filter((account) => account.placeholder).length;
  const diagnostics = balanceReadDiagnostics(remote.data, report);
  const openReview = () => { setShow('review'); setView('agents'); setSelectedEmail(''); setPage(1); };
  const openOutstanding = () => { setShow('outstanding'); setView('agents'); setSelectedEmail(''); setPage(1); };
  const changeScope = (value) => { setScope(value); setPage(1); setSelectedEmail(''); };
  if (remote.loading) return <Loading text={remote.progress || 'Loading all-week balances and payment history...'} />;
  if (remote.error) return <Message danger>Balance ledger unavailable: {remote.error}. Balances and payments are unavailable, not zero. Use Refresh to retry.</Message>;
  return <>
    <div className={styles.balanceIntro}><div><span className={styles.eyebrow}>AR / SCANNING ACCOUNTS</span><h2>Balances &amp; repayment</h2>
      <p>Current recorded balances across all weeks, with the history behind every payment and credit.</p></div><Badge tone="blue">ALL WEEKS &middot; READ ONLY</Badge></div>
    <div className={styles.scopeLine}><span>{remote.data.ledger.length.toLocaleString()} ledger entries read &middot; {accounts.length} accounts in this scope</span><span>Refreshed {displayTime(remote.loadedAt)} PT</span></div>
    {(directoryLoading || directoryError) && <Message>{directoryLoading ? 'Agent directory loading; email addresses remain visible.' : `Agent directory unavailable: ${directoryError}. Balances are still grouped by exact normalized email.`}</Message>}
    {remote.data.recordsError && <Message danger>Violation explanations and coverage checks could not be loaded: {remote.data.recordsError}. Ledger amounts remain visible, but completeness cannot be verified.</Message>}
    {remote.data.commissionsError && <Message>Linked commission details could not be loaded: {remote.data.commissionsError}. Stored ledger dates and IDs remain visible.</Message>}
    {diagnostics.unavailable && <Message danger>
      <strong>{diagnostics.noLedgerReturned ? 'No balance-ledger entries were returned to this session.' : 'No recognized AR / Scanning ledger entries were returned.'}</strong>{' '}
      {diagnostics.noLedgerReturned
        ? 'Source records are visible, but current balances and payment history cannot be verified from this response. This does not mean every agent owes $0.'
        : 'Ledger entries were returned, but none use the recognized AR, SCANNING or SV categories. Their amounts are not being assumed to be zero.'}{' '}
      Do not recreate charges or rerun the paid-balance cleanup to fix this display. Compare the read-only ledger check with the counts below first.
      <details><summary>Balance data returned</summary>
        <p>Ledger rows: {diagnostics.ledgerRows.toLocaleString()} | AR / SV ledger rows: {diagnostics.arSvLedgerRows.toLocaleString()} | Source violation rows: {diagnostics.sourceRows.toLocaleString()}</p>
        <p>Table: {BALANCE_LEDGER}. No week, year, account status or payment-date filter is applied to this ledger read.</p>
      </details>
    </Message>}
    <div className={styles.metrics}>
      <div className={styles.metric}><span>Recorded AR remaining</span><strong style={diagnostics.unavailable ? { fontSize: 18 } : undefined}>{diagnostics.unavailable ? 'Unavailable' : balanceMoney(totals.ar)}</strong><small>Positive AR account balances</small></div>
      <div className={`${styles.metric} ${styles.metricPurple}`}><span>Recorded scanning remaining</span><strong style={diagnostics.unavailable ? { fontSize: 18 } : undefined}>{diagnostics.unavailable ? 'Unavailable' : balanceMoney(totals.scanning)}</strong><small>Positive scanning account balances</small></div>
      <div className={`${styles.metric} ${styles.metricAmber}`}><span>Agents with a balance</span><strong style={diagnostics.unavailable ? { fontSize: 18 } : undefined}>{diagnostics.unavailable ? 'Unavailable' : totals.owedAgents}</strong><small>{diagnostics.unavailable ? 'Ledger data needs verification' : `${balanceMoney(totals.ar + totals.scanning)} recorded outstanding`}</small></div>
      <div className={`${styles.metric} ${styles.metricGreen}`}><span>Net payments / commission applied</span><strong style={diagnostics.unavailable ? { fontSize: 18 } : undefined}>{diagnostics.unavailable ? 'Unavailable' : balanceMoney(totals.paid)}</strong><small>All-time explicit payment entries, less reversals</small></div>
    </div>
    <div className={styles.balanceCreditStrip}><span>Legacy cleanup credits <b>{diagnostics.unavailable ? 'Unavailable' : balanceMoney(totals.legacy)}</b></span><span>Other credits <b>{diagnostics.unavailable ? 'Unavailable' : balanceMoney(totals.other)}</b></span><span>Credit balances <b>{diagnostics.unavailable ? 'Unavailable' : balanceMoney(totals.credits)}</b></span></div>
    <p className={styles.disclaimer}>Cards cover all accounts in the account scope below, not the selected commission week or list filters. Category credit balances are shown separately. Cleanup credits are historical balances treated as paid, not cash collected on the cleanup date.</p>
    {totals.incomplete > 0 && <Message><strong>{totals.incomplete} account(s) need a coverage or data review.</strong> {totals.untracked > 0 && `${totals.untracked} source violation(s) have no matching ledger history. `}
      Untracked amounts and invalid amounts are not added to the cards or assumed paid. These accounts do not appear under <b>Currently owes a balance</b> unless they also have a positive recorded ledger balance.{' '}
      <button type="button" className={styles.linkButton} onClick={openReview}>Review data issues ({totals.incomplete})</button>
    </Message>}
    <div className={styles.balanceScopeTools}><div className={styles.buttonGroup}>
      <button type="button" className={view === 'agents' ? styles.selected : ''} onClick={openOutstanding}>Agent balances</button>
      <button type="button" className={view === 'history' ? styles.selected : ''} onClick={() => { setView('history'); setSelectedEmail(''); }}>Payment &amp; adjustment history</button></div>
      <label>Account scope<select aria-label="Balance account scope" value={scope} onChange={(event) => changeScope(event.target.value)}><option value="agents">Agents only</option><option value="all">Agents + placeholder</option><option value="placeholder">Placeholder only</option></select></label></div>
    <p className={styles.balanceCaption}>{scope === 'agents' ? `Placeholder account ${PLACEHOLDER_ACCOUNT} is excluded from these totals${placeholderCount ? ' and can be viewed separately above' : ''}.` : `Placeholder records are included for reporting only; this view does not change ${PLACEHOLDER_ACCOUNT}.`}</p>
    {selectedAccount && view === 'agents' ? <BalanceAccount key={selectedAccount.email} account={selectedAccount} directory={directory} onBack={() => setSelectedEmail('')} onOpenWeek={onOpenWeek} />
      : view === 'history' ? <section className={styles.panel}><BalanceHistory events={allEvents} directory={directory} onOpenWeek={onOpenWeek} /></section>
        : <section className={styles.panel} aria-label="Agent balances list">
          <header className={styles.panelHeader}><div><span className={styles.eyebrow}>CURRENT BALANCES</span><h2>{show === 'outstanding' ? 'Who still has a balance?' : show === 'review' ? 'Accounts needing data review' : show === 'settled' ? 'Settled accounts' : 'All accounts with activity'}</h2>
            <p>{show === 'outstanding' ? 'Only agents with a positive recorded AR or scanning balance appear here. Zero-balance and review-only accounts are excluded.' : 'This view includes review or historical records; appearing here does not by itself mean the agent owes money.'}</p></div>
            <button type="button" disabled={!filtered.length} onClick={() => exportBalanceAccounts(filtered)}>Export filtered balances</button></header>
          <div className={styles.balanceFilters}>
            <label className={styles.balanceSearch}>Search agents or records<input type="search" aria-label="Search agent balances" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Agent, email, office, client or policy..." /></label>
            <label>Show<select aria-label="Balance status filter" value={show} onChange={(event) => { setShow(event.target.value); setPage(1); }}><option value="outstanding">Currently owes a balance</option><option value="all">All accounts with activity</option><option value="settled">No remaining balance / settled</option><option value="review">Needs review (separate from owed)</option></select></label>
            <label>Sort<select aria-label="Balance sort" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="balance">Highest remaining</option><option value="name">Agent name</option><option value="recent">Recent ledger activity</option><option value="review">Needs review first</option></select></label>
            <label>Rows<select aria-label="Balance rows per page" value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>{PAGE_SIZES.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          <Pager info={info} onPage={setPage} label="balance accounts" />
          <div className={styles.balanceTableViewport}><table className={`${styles.balanceTable} ${styles.balanceAccountTable}`}>
            <thead><tr><th>Agent / office</th><th>AR remaining</th><th>Scanning remaining</th><th>Total remaining</th><th>Net paid / applied</th><th>Last payment / review</th><th>Action</th></tr></thead>
            <tbody>{info.rows.map((account) => <tr key={account.email} className={account.needsReview ? styles.attentionRow : ''}>
              <td><strong>{account.name}</strong><small>{account.email}</small><small>{account.offices.join(', ') || 'Office not recorded'}</small>{account.placeholder && <Badge tone="purple">Placeholder</Badge>}</td>
              <td className={styles.balanceNumber}>{balanceMoney(account.categoryNets.AR)}{account.categoryNets.AR < 0 && <small>Credit</small>}</td>
              <td className={styles.balanceNumber}>{balanceMoney(account.categoryNets.SCANNING)}{account.categoryNets.SCANNING < 0 && <small>Credit</small>}</td>
              <td className={styles.balanceNumber}><strong>{balanceMoney(displayedAccountBalanceCents(account))}</strong><small>{account.openCount} open ledger item(s)</small>
                {account.totalCents === null && hasRecordedOutstandingBalance(account) && <small className={styles.warningText}>Known portion only; another category is unverified</small>}
                {account.untracked.length > 0 && <small className={styles.warningText}>Tracked only; {account.untracked.length} untracked</small>}</td>
              <td className={styles.balanceNumber}>{account.events.length ? balanceMoney(account.paidCents) : 'No ledger returned'}<small>Legacy credit: {account.events.length ? balanceMoney(account.legacyCents) : 'Unverified'}</small><small>Other credits: {account.events.length ? balanceMoney(account.otherCreditCents) : 'Unverified'}</small></td>
              <td>{account.lastPayment ? displayDate(account.lastPayment) : <span className={styles.muted}>No explicit payment recorded</span>}<small>Last activity: {displayDate(account.lastActivity)}</small>
                <Badge tone={hasRecordedOutstandingBalance(account) || account.needsReview ? 'amber' : 'green'}>{hasRecordedOutstandingBalance(account) ? 'Balance remaining' : account.needsReview ? 'Data review only' : 'No recorded balance'}</Badge>{hasRecordedOutstandingBalance(account) && account.needsReview && <small className={styles.warningText}>Also has data to review</small>}</td>
              <td><button type="button" className={styles.linkButton} onClick={() => setSelectedEmail(account.email)}>View account &amp; history</button></td>
            </tr>)}</tbody>
          </table>{!info.total && <div className={styles.empty}>
            <strong>{diagnostics.unavailable ? 'Current owed balances could not be verified.' : show === 'outstanding' ? 'No positive recorded balances match this view.' : 'No accounts match this view.'}</strong>
            <p>{diagnostics.unavailable
              ? 'The ledger response needs checking. Source fees and old snapshots have not been substituted for current debt.'
              : show === 'outstanding'
                ? 'Only positive recorded balances are listed. Settled accounts stay in history; missing-ledger records stay in Needs review.'
                : 'Change the search or account scope to see other accounts.'}</p>
            {totals.incomplete > 0 && <button type="button" onClick={() => { setQuery(''); openReview(); }}>Review data issues</button>}{' '}
            <button type="button" onClick={() => { setQuery(''); setShow('all'); setPage(1); }}>View all accounts / history</button>
          </div>}</div>
          <Pager info={info} onPage={setPage} label="balance accounts" />
        </section>}
    <p className={styles.disclaimer}>Read-only reporting. This tab does not mark records paid, create adjustments, collect commissions, or alter source statuses. Only entries accessible to your account are included.</p>
  </>;
}


export default function ManageViolations() {
  const navigate = useNavigate(); const location = useLocation(); const today = useBusinessToday();
  const context = useMemo(() => getPayContext(today), [today]);
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const selectedWeek = mondayOf(params.get('week')) || context.payingWeek;
  const rawView = params.get('view'); const tab = ['review', 'history', 'imports', 'balances'].includes(rawView) ? rawView : 'review';
  const [refresh, setRefresh] = useState(0); const [revision, setRevision] = useState(0);
  const batchFilter = params.get('batch') || '';
  const initialFilters = batchFilter ? { batch: batchFilter } : null;
  const profileLoader = useCallback((signal) => fetchAll(() => supabase.from('profiles').select('id,email,full_name', { count: 'exact' }), signal), []);
  const profiles = useRemote(profileLoader);
  const directory = useMemo(() => profiles.data ? new Map(profiles.data.filter((profile) => profile.email).map((profile) => [emailKey(profile.email), profile])) : null, [profiles.data]);
  const setRoute = (week, view = tab, batch = batchFilter) => {
    const next = new URLSearchParams(location.search); next.set('week', week); next.set('view', view);
    if (batch) next.set('batch', batch); else next.delete('batch');
    navigate({ pathname: location.pathname, search: `?${next.toString()}` });
  };
  const openWeek = (week, filters = null) => { if (!dateKey(week)) return; setRevision((value) => value + 1); setRoute(mondayOf(week), 'review', filters?.batch || ''); };
  const switchTab = (view) => setRoute(selectedWeek, view);
  const editRecord = (record) => navigate('/admin/enter-violation', { state: { violationToEdit: { ...record.raw,
    violation_type: record.kind === 'disqualified' ? 'Disqualified Policy' : record.raw.violation_type } } });
  const selectedPay = scheduledPayday(selectedWeek);
  return <main className={styles.dashboard}>
    <header className={styles.topHeader}><div><span className={styles.eyebrow}>COMMISSION OPERATIONS</span><h1>Violations workspace</h1><p>Review the right week. Resolve exceptions. Keep the history.</p></div>
      <div className={styles.headerActions}><button type="button" onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
        <button type="button" className={styles.primaryButton} onClick={() => navigate('/admin/enter-violation')}>+ Paste / enter report</button></div></header>
    {tab !== 'balances' && <>
    <section className={styles.payHero} aria-label="Selected commission week">
      <div className={styles.heroMain}><span className={styles.heroKicker}>{selectedWeek === context.payingWeek ? 'UPCOMING FRIDAY PAYOUT' : 'SELECTED COMMISSION WEEK'}</span>
        <h2>{weekLabel(selectedWeek)}</h2><p>Production / assigned commission week</p>
        <div className={styles.quickWeeks}>
          <button type="button" className={selectedWeek === context.payingWeek ? styles.quickActive : ''} onClick={() => openWeek(context.payingWeek)}>Paying this Friday</button>
          <button type="button" className={selectedWeek === addDays(context.payingWeek, 7) ? styles.quickActive : ''} onClick={() => openWeek(addDays(context.payingWeek, 7))}>Next payout</button>
          <button type="button" className={selectedWeek === context.currentMonday ? styles.quickActive : ''} onClick={() => openWeek(context.currentMonday)}>Current production</button>
        </div>
      </div>
      <div className={styles.payDate}><span>Scheduled payday</span><strong>Friday, {displayDate(selectedPay)}</strong>
        <small>Schedule only &middot; not a paid / finalized status</small><small>Current production: {weekLabel(context.currentMonday)}</small></div>
    </section>
    <section className={styles.weekTools} aria-label="Week selection"><div className={styles.stepWeeks}>
      <button type="button" aria-label="Previous commission week" onClick={() => openWeek(addDays(selectedWeek, -7))}>&larr;</button>
      <button type="button" aria-label="Next commission week" onClick={() => openWeek(addDays(selectedWeek, 7))}>&rarr;</button></div>
      <label>Jump by any production date<input type="date" aria-label="Jump to production week" value={selectedWeek} onChange={(event) => { if (dateKey(event.target.value)) openWeek(event.target.value); }} /></label>
      <label>Or choose a scheduled payday<input type="date" aria-label="Jump by scheduled payday" value={selectedPay} step={7} min="2000-01-07" onChange={(event) => {
        const value = dateKey(event.target.value); if (value) openWeek(addDays(mondayOf(value), -14));
      }} /></label><p>Selecting a date jumps directly to its week. Dates and the Friday schedule use Pacific business time.</p>
    </section>
    </>}
    <nav className={styles.mainTabs} aria-label="Dashboard views">{[['review', 'Weekly review', 'Records, agents & exceptions'], ['history', 'Week explorer', 'Find any production week'], ['imports', 'Import history', 'Batches, managers & saved rows'], ['balances', 'Balances & repayment', 'Owed, paid & remaining']].map(([key, label, sub]) =>
      <button type="button" key={key} aria-current={tab === key ? 'page' : undefined} className={tab === key ? styles.activeTab : ''} onClick={() => switchTab(key)}><strong>{label}</strong><small>{sub}</small></button>)}</nav>
    {tab === 'review' && <WeekReview key={`${selectedWeek}:${batchFilter}:${revision}`} week={selectedWeek} refresh={refresh} directory={directory} directoryError={profiles.error} directoryLoading={profiles.loading}
      initialFilters={initialFilters} onEdit={editRecord} onMutation={() => setRefresh((value) => value + 1)} onWeek={switchTab} />}
    {tab === 'history' && <WeekExplorer selected={selectedWeek} context={context} refresh={refresh} onOpen={openWeek} />}
    {tab === 'imports' && <ImportHistory today={today} refresh={refresh} onOpenWeek={openWeek} />}
    {tab === 'balances' && <BalancesRepayment refresh={refresh} directory={directory} directoryError={profiles.error} directoryLoading={profiles.loading} onOpenWeek={openWeek} />}
    <footer className={styles.pageFooter}>Counts reflect saved rows accessible to your account. This dashboard does not finalize commissions, apply repayments, or change payroll dates.</footer>
  </main>;
}

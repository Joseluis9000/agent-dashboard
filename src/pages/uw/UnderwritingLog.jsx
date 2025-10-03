// src/pages/uw/UnderwritingLog.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthContext';

// Keep layout styles from dashboard
import dash from './UnderwritingDashboard.module.css';
// NEW: table/columns specific to the log
import log from './UnderwritingLog.module.css';

const PROCESSED_STATUSES = ['Approved', 'Declined', 'Cleared', 'Cannot Locate Policy'];

const fmt = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const dayRangeISO = (dateStr) => {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

export default function UnderwritingLog() {
  const { user, profile } = useAuth();
  const role = profile?.role || user?.user_metadata?.role || 'agent';
  const canSee = ['underwriter', 'uw_manager', 'supervisor', 'admin'].includes(role);

  const [dateStr, setDateStr] = useState(() => fmt(new Date()));
  const [search, setSearch] = useState('');
  const [assignee, setAssignee] = useState('All');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const { start, end } = useMemo(() => dayRangeISO(dateStr), [dateStr]);

  const load = useCallback(async () => {
    if (!canSee) return;
    setLoading(true); setMsg('');

    const { data, error } = await supabase
      .from('uw_submissions')
      .select('*')
      .gte('last_action_at', start)
      .lt('last_action_at', end)
      .order('last_action_at', { ascending: false });

    if (error) { setMsg(error.message); setRows([]); }
    else { setRows((data || []).filter(r => PROCESSED_STATUSES.includes(r.status))); }
    setLoading(false);
  }, [canSee, start, end]);

  useEffect(() => { load(); }, [load]);

  const onPrev = () => { const d = new Date(`${dateStr}T00:00:00`); d.setDate(d.getDate() - 1); setDateStr(fmt(d)); };
  const onNext = () => { const d = new Date(`${dateStr}T00:00:00`); d.setDate(d.getDate() + 1); setDateStr(fmt(d)); };

  const assignees = useMemo(() => {
    const set = new Set(rows.map(r => r.claimed_by_email).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(r => {
      if (assignee !== 'All' && r.claimed_by_email !== assignee) return false;
      if (!s) return true;
      return (
        (r.policy_number || '').toLowerCase().includes(s) ||
        (r.customer_name || '').toLowerCase().includes(s) ||
        (r.agent_email || '').toLowerCase().includes(s) ||
        (r.office_code || '').toLowerCase().includes(s) ||
        (r.transaction_type || '').toLowerCase().includes(s)
      );
    });
  }, [rows, assignee, search]);

  if (!canSee) return <div className={dash.container}><p>Not authorized.</p></div>;

  const badgeClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('approved')) return `${log.badge} ${log.badgeApproved}`;
    if (s.includes('cleared'))  return `${log.badge} ${log.badgeApproved}`;
    if (s.includes('cannot locate')) return `${log.badge} ${log.badgeLocate}`;
    if (s.includes('declined') || s.includes('rejected')) return `${log.badge} ${log.badgeDeclined}`;
    return `${log.badge} ${log.badgeNeutral}`;
  };

  return (
    <div className={dash.container}>
      <h1 className={dash.title}>Underwriting Log</h1>

      {/* Controls bar (reuses dash styles) */}
      <div className={dash.card} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className={dash.dayNav}>
          <button className={dash.iconBtn} onClick={onPrev} title="Previous day">‹</button>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            style={{ padding: '.55rem', border: '1px solid var(--border-strong)', borderRadius: 8 }}
          />
          <button className={dash.iconBtn} onClick={onNext} title="Next day">›</button>
        </div>

        <input
          placeholder="Search policy #, customer, agent email, office, transaction…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '.55rem', border: '1px solid var(--border-strong)', borderRadius: 8, minWidth: 280 }}
        />

        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          style={{ padding: '.55rem', border: '1px solid var(--border-strong)', borderRadius: 8, minWidth: 200 }}
        >
          {assignees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <button onClick={load} className={dash.refreshBtn}>Refresh</button>
      </div>

      {msg && <div className={dash.card} style={{ color: '#b00020' }}>{msg}</div>}

      <div className={dash.card}>
        {loading ? (
          <div>Loading…</div>
        ) : (
          <div className={dash.tableWrap}>
            <table className={log.table}>
              <thead>
                <tr>
                  <th className={log.colStatus}>Status</th>
                  <th className={log.colDate}>Last Updated</th>
                  <th className={log.colOffice}>Office</th>
                  <th className={log.colTxn}>Transaction</th>
                  <th className={log.colPolicy}>Policy #</th>
                  <th className={log.colCustomer}>Customer</th>
                  <th className={log.colAgent}>Agent Email</th>
                  <th className={log.colAssign}>Assigned To</th>
                  <th className={log.colNotes}>UW Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9}>No processed items for this day.</td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td className={log.colStatus}><span className={badgeClass(r.status)}>{r.status || '—'}</span></td>
                      <td className={log.colDate}>{r.last_action_at ? new Date(r.last_action_at).toLocaleString() : '—'}</td>
                      <td className={log.colOffice}>{r.office_code || '—'}</td>
                      <td className={log.colTxn}>{r.transaction_type || '—'}</td>
                      <td className={log.colPolicy}>{r.policy_number || '—'}</td>
                      <td className={log.colCustomer}>{r.customer_name || '—'}</td>
                      <td className={log.colAgent}>{r.agent_email || '—'}</td>
                      <td className={log.colAssign}>{r.claimed_by_email || 'Unassigned'}</td>
                      <td className={log.colNotes}>{r.uw_notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


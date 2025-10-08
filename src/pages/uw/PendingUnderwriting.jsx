// src/pages/uw/PendingUnderwriting.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../supabaseClient';
import styles from './UnderwritingDashboard.module.css'; // reuse dashboard styles

const ACTION_OPTIONS = ['Approved', 'Pending', 'Cannot Locate Policy'];

/* ---------- helpers (date) ---------- */
const pad = (n) => String(n).padStart(2, '0');
const yyyymm = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const thisMonthKey = () => yyyymm(new Date());
const monthStartISO = (monthKey /* YYYY-MM */) => `${monthKey}-01T00:00:00.000Z`;
const monthEndISO = (monthKey /* YYYY-MM */) => {
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day
  return `${monthKey}-${pad(lastDay)}T23:59:59.999Z`;
};
const diffAge = (iso) => {
  if (!iso) return { label: '—', danger: false };
  const now = Date.now();
  const then = new Date(iso).getTime();
  let mins = Math.max(0, Math.floor((now - then) / 60000));
  const danger = mins >= 48 * 60;
  if (mins < 60) return { label: `${mins} mins`, danger };
  const hrs = Math.floor(mins / 60);
  mins = mins % 60;
  if (hrs < 24) return { label: `${hrs} hrs ${mins} mins`, danger };
  const days = Math.floor(hrs / 24);
  return { label: `${days} days`, danger };
};

/* ---------- helpers (office grouping & labels) ---------- */
const officeKeyOf = (row) =>
  row.office_id || row.officeId || row.office_code || row.office || row.office_name || 'Unknown';

const officeLabelOf = (row) =>
  row.office_name || row.officeName || row.office || row.office_id || row.officeId || 'Unknown';

/** Count “new” per office. Adjust logic here if needed. */
const NEW_BADGE_STATUSES = new Set(['Pending', 'Cannot Locate Policy']);

const isNewForBadge = (row) => {
  // default: show as “new” if it’s still pending/CLP and unassigned
  const stillPending = NEW_BADGE_STATUSES.has(row.status);
  const unassigned = !row.claimed_by;
  return stillPending && unassigned;
};

/* ---------- component ---------- */
export default function PendingUnderwriting() {
  const { user, profile } = useAuth();
  const role = profile?.role || user?.user_metadata?.role || 'agent';
  const isUW = ['underwriter', 'uw_manager', 'supervisor', 'admin'].includes(role);

  // Month selector (default to current month)
  const [month, setMonth] = useState(thisMonthKey());

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // local action state (only used by claimer)
  const [actions, setActions] = useState({}); // { id: { status, note } }
  const setActionState = (id, patch) =>
    setActions((s) => ({ ...s, [id]: { ...(s[id] || { status: '', note: '' }), ...patch } }));

  // chat UI
  const [openChatRow, setOpenChatRow] = useState(null);
  const [draft, setDraft] = useState({});
  const composerRef = useRef(null);
  const emojiBtnRef = useRef(null);
  const emojiPanelRef = useRef(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiList = useMemo(
    () => ['😀','😁','😂','🤣','😊','😍','😉','😎','👍','🙏','🎉','✅','❌','📝','📎'],
    []
  );

  useEffect(() => {
    if (!showEmoji) return;
    const onDocClick = (e) => {
      if (
        emojiPanelRef.current &&
        !emojiPanelRef.current.contains(e.target) &&
        emojiBtnRef.current &&
        !emojiBtnRef.current.contains(e.target)
      ) setShowEmoji(false);
    };
    const onEsc = (e) => e.key === 'Escape' && setShowEmoji(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [showEmoji]);

  const insertEmoji = (emoji, rowId) => {
    const ta = composerRef.current;
    const current = draft[rowId] || '';
    if (!ta) {
      setDraft((s) => ({ ...s, [rowId]: current + emoji }));
      setShowEmoji(false);
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const next = current.slice(0, start) + emoji + current.slice(end);
    setDraft((s) => ({ ...s, [rowId]: next }));
    requestAnimationFrame(() => {
      ta?.focus?.();
      const pos = start + emoji.length;
      ta?.setSelectionRange?.(pos, pos);
    });
    setShowEmoji(false);
  };

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setMsg('');

    // “Pending Underwriting” = Pending or Cannot Locate Policy for the selected month
    const start = monthStartISO(month);
    const end = monthEndISO(month);

    const { data, error } = await supabase
      .from('uw_submissions')
      .select('*')
      .in('status', ['Pending', 'Cannot Locate Policy'])
      .gte('last_action_at', start)
      .lte('last_action_at', end)
      .order('last_action_at', { ascending: true });

    if (error) setMsg(`Load error: ${error.message}`);

    // optional sort: if the last message is from agent, bubble up
    const sorted = (data || []).slice().sort((a, b) => {
      const lastA = (Array.isArray(a.pending_items) ? a.pending_items : []).slice(-1)[0];
      const lastB = (Array.isArray(b.pending_items) ? b.pending_items : []).slice(-1)[0];
      const scoreA = lastA?.from === 'agent' ? new Date(lastA.at).getTime() : 0;
      const scoreB = lastB?.from === 'agent' ? new Date(lastB.at).getTime() : 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return new Date(b.last_action_at || b.created_at).getTime() - new Date(a.last_action_at || a.created_at).getTime();
    });

    setRows(sorted);
    setLoading(false);
  }, [user?.id, month]);

  useEffect(() => { load(); }, [load]);

  // mutations
  const claim = async (row) => {
    if (!user?.id || !user?.email) return;
    const { error } = await supabase
      .from('uw_submissions')
      .update({
        claimed_by: user.id,
        claimed_by_email: user.email,
        claimed_at: new Date().toISOString(),
        status: 'Claimed',
        last_action_at: new Date().toISOString(),
        last_updated_by: user.id,
        last_updated_by_email: user.email,
      })
      .eq('id', row.id)
      .is('claimed_by', null);

    if (error) return alert(error.message);
    setActions((s) => ({ ...s, [row.id]: { status: '', note: '' } }));
    load();
  };

  const appendMessage = async (rowId, thread, text) => {
    const newThread = [
      ...(Array.isArray(thread) ? thread : []),
      { from: 'uw', text, at: new Date().toISOString(), by: user?.email || null },
    ];
    const { error } = await supabase
      .from('uw_submissions')
      .update({
        pending_items: newThread,
        last_action_at: new Date().toISOString(),
        last_updated_by: user?.id || null,
        last_updated_by_email: user?.email || null,
      })
      .eq('id', rowId);
    if (error) throw error;
  };

  const sendChat = async (row) => {
    const text = (draft[row.id] || '').trim();
    if (!text) return;
    try {
      await appendMessage(row.id, row.pending_items, text);
      setDraft((s) => ({ ...s, [row.id]: '' }));
      setOpenChatRow(null);
      setShowEmoji(false);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const sendAction = async (row) => {
    const local = actions[row.id] || {};
    if (!local.status) return;
    if (!user?.id || !user?.email) return;

    const nextStatus = local.status;
    const now = new Date().toISOString();

    const update = {
      status: nextStatus,
      uw_notes: local.note || null,
      last_action_at: now,
      last_updated_by: user.id,
      last_updated_by_email: user.email,
      ...(nextStatus === 'Approved'
        ? { cleared_by: user.id, cleared_by_email: user.email, cleared_at: now }
        : { checked_by: user.id }),
    };

    const { error: upErr } = await supabase.from('uw_submissions').update(update).eq('id', row.id);
    if (upErr) return alert(upErr.message);

    if (local.note && local.note.trim()) {
      try { await appendMessage(row.id, row.pending_items, local.note.trim()); } catch {}
    }

    load();
  };

  /* ---------- office grouping + tabs ---------- */
  const offices = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = String(officeKeyOf(r));
      if (!map.has(key)) map.set(key, { key, label: officeLabelOf(r) });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const groupedByOffice = useMemo(() => {
    const g = new Map();
    for (const r of rows) {
      const key = String(officeKeyOf(r));
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(r);
    }
    return g;
  }, [rows]);

  const newCounts = useMemo(() => {
    const counts = {};
    for (const { key } of offices) {
      const list = groupedByOffice.get(key) || [];
      counts[key] = list.filter(isNewForBadge).length;
    }
    return counts;
  }, [offices, groupedByOffice]);

  const [activeOffice, setActiveOffice] = useState(null);
  useEffect(() => {
    // pick a sensible default tab whenever rows change
    if (!offices.length) { setActiveOffice(null); return; }
    if (activeOffice && offices.some(o => o.key === activeOffice)) return;
    // Prefer an office that has items. Otherwise, first office.
    const withItems = offices.find(o => (groupedByOffice.get(o.key) || []).length > 0) || offices[0];
    setActiveOffice(withItems.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, offices.length]);

  const activeRows = useMemo(
    () => (activeOffice ? (groupedByOffice.get(activeOffice) || []) : []),
    [groupedByOffice, activeOffice]
  );

  const orderNumber = (arr, id) => `#${arr.findIndex((r) => r.id === id) + 1}`;

  const onPrevMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    d.setUTCMonth(d.getUTCMonth() - 1);
    setMonth(yyyymm(d));
  };
  const onNextMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    d.setUTCMonth(d.getUTCMonth() + 1);
    const next = yyyymm(d);
    const current = thisMonthKey();
    // Don’t allow navigating beyond current month
    if (next > current) return;
    setMonth(next);
  };
  const isNextDisabled = month >= thisMonthKey();

  if (!isUW) return <div className={styles.container}><p>Not authorized.</p></div>;

  const ChatCell = ({ row }) => {
    const last = (Array.isArray(row.pending_items) ? row.pending_items : []).slice(-1)[0];

    return (
      <td style={{ minWidth: 340 }}>
        {openChatRow !== row.id && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {last ? (
              <div
                style={{
                  fontSize: '.9rem',
                  color: '#374151',
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: '8px 10px',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {last.from === 'uw' ? 'You' : 'Agent'} · {new Date(last.at).toLocaleString()}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{last.text}</div>
              </div>
            ) : (
              <div style={{ color: '#6b7280' }}>No messages yet.</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={styles.sendBtn}
                onClick={() => { setOpenChatRow(row.id); setShowEmoji(false); }}
              >
                Open conversation
              </button>
            </div>
          </div>
        )}

        {openChatRow === row.id && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 10,
              background: '#fff',
            }}
          >
            <div
              style={{
                maxHeight: 260,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {(Array.isArray(row.pending_items) ? row.pending_items : []).map((m, idx) => {
                const mine = m.from === 'uw';
                return (
                  <div
                    key={`${m.at}-${idx}`}
                    style={{
                      alignSelf: mine ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      background: mine ? '#e0f2fe' : '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {mine ? 'You' : 'Agent'} · {m.at ? new Date(m.at).toLocaleString() : ''}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', position: 'relative' }}>
              <textarea
                ref={composerRef}
                placeholder="Type a message…"
                value={draft[row.id] || ''}
                onChange={(e) => setDraft((s) => ({ ...s, [row.id]: e.target.value }))}
                style={{
                  flex: 1,
                  minHeight: 90,
                  padding: '0.6rem',
                  border: '1px solid #d1d5db',
                  borderRadius: 10,
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
                <button
                  type="button"
                  ref={emojiBtnRef}
                  onClick={() => setShowEmoji((v) => !v)}
                  title="Insert emoji"
                  aria-label="Insert emoji"
                  style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: '0.45rem 0.55rem',
                  }}
                >
                  <span style={{ fontSize: 18 }}>😊</span>
                </button>
                <button type="button" className={styles.sendBtn} onClick={() => sendChat(row)}>
                  Send message
                </button>
                <button
                  type="button"
                  className={styles.refreshBtn}
                  onClick={() => { setOpenChatRow(null); setShowEmoji(false); }}
                >
                  Close
                </button>

                {showEmoji && openChatRow === row.id && (
                  <div
                    ref={emojiPanelRef}
                    style={{
                      position: 'absolute',
                      bottom: 52,
                      right: 0,
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      boxShadow: '0 8px 24px rgba(16,24,40,.08)',
                      padding: 8,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(8,1fr)',
                      gap: 6,
                      zIndex: 50,
                    }}
                  >
                    {emojiList.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertEmoji(e, row.id)}
                        style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer' }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </td>
    );
  };

  const Row = ({ r, arr }) => {
    const age = diffAge(r.created_at);
    const mine = r.claimed_by === user?.id;
    const unassigned = !r.claimed_by;
    const local = actions[r.id] || { status: '', note: '' };
    const last = (Array.isArray(r.pending_items) ? r.pending_items : []).slice(-1)[0];
    const newReply = last?.from === 'agent';

    return (
      <tr key={r.id} style={newReply ? { boxShadow: 'inset 2px 0 0 #22c55e' } : undefined}>
        <td><span className={styles.orderCell}>{orderNumber(arr, r.id)}</span></td>
        <td>{(r.agent_email || '').split('@')[0] || '—'}</td>
        <td>{r.agent_email || '—'}</td>
        <td>{r.transaction_type || '—'}</td>
        <td>{r.policy_number || '—'}</td>
        <td>{r.phone_number || '—'}</td>
        <td>{r.customer_name || '—'}</td>
        <td>
          {r.claimed_by_email
            ? <span className={styles.assigneePill}>{r.claimed_by_email}</span>
            : <span className={`${styles.assigneePill} ${styles.unassigned}`}>Unassigned</span>}
        </td>
        <td className={age.danger ? styles.queueAgeWarn : ''}>{age.label}</td>
        <td>{r.last_action_at ? new Date(r.last_action_at).toLocaleString() : '—'}</td>

        <td className={styles.actionsCell} style={{ minWidth: 300 }}>
          {unassigned ? (
            <button className={styles.claimBtn} onClick={() => claim(r)}>Claim</button>
          ) : (
            <>
              <select
                className={styles.inlineSelect}
                value={mine ? local.status : r.status}
                disabled={!mine}
                onChange={(e) => setActionState(r.id, { status: e.target.value })}
              >
                <option value="">Select action…</option>
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>

              <button
                className={styles.sendBtn}
                disabled={!mine || !local.status}
                onClick={() => sendAction(r)}
              >
                Send
              </button>
            </>
          )}
        </td>

        <ChatCell row={r} />
      </tr>
    );
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Pending Underwriting</h1>

      {msg && <div className={styles.message}>{msg}</div>}

      <div className={styles.card}>
        <div className={styles.subHeader}>Select a Month</div>

        {/* Month nav + refresh */}
        <div className={styles.dayNav} style={{ marginBottom: 10, gap: 8 }}>
          <button className={styles.iconBtn} onClick={onPrevMonth} title="Previous month">‹</button>

          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={styles.inlineSelect}
            style={{ width: 180 }}
          />

          <button
            className={styles.iconBtn}
            onClick={onNextMonth}
            disabled={isNextDisabled}
            title="Next month"
          >
            ›
          </button>

          <button className={styles.refreshBtn} onClick={load} style={{ marginLeft: 'auto' }}>
            Refresh
          </button>
        </div>

        {/* Office tabs (like Google Sheets) */}
        <div className={styles.tabBar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {offices.length === 0 ? (
            <div className={styles.muted}>No offices for this month.</div>
          ) : (
            offices.map(({ key, label }) => {
              const active = key === activeOffice;
              const count = newCounts[key] || 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveOffice(key)}
                  className={`${styles.pill} ${active ? styles.pillActive : ''}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 12px',
                    borderRadius: 10,
                    border: active ? '1px solid #2563eb' : '1px solid #e5e7eb',
                    background: active ? '#eff6ff' : '#fff',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  <span>{label}</span>
                  {count > 0 && (
                    <span
                      style={{
                        minWidth: 20,
                        padding: '0 6px',
                        height: 20,
                        borderRadius: 10,
                        fontSize: 12,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#eef2ff',
                        border: '1px solid #c7d2fe',
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Table for active office */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Agent</th>
                <th>Emails</th>
                <th>Transaction Type</th>
                <th>Policy #</th>
                <th>Phone #</th>
                <th>Customer Name</th>
                <th>Assignee</th>
                <th>Queue Age</th>
                <th>Last Updated</th>
                <th>Actions</th>
                <th>Conversation</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12}>Loading…</td></tr>
              ) : !activeOffice ? (
                <tr><td colSpan={12}>No office selected.</td></tr>
              ) : activeRows.length === 0 ? (
                <tr><td colSpan={12}>No items for this month in this office.</td></tr>
              ) : (
                activeRows.map((r) => <Row key={r.id} r={r} arr={activeRows} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


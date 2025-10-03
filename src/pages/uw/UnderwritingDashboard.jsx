// src/pages/uw/UnderwritingDashboard.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../supabaseClient';
import styles from './UnderwritingDashboard.module.css';

const ACTION_OPTIONS = ['Approved', 'Pending', 'Cannot Locate Policy'];

/* ---------------- helpers ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const toDateKey = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
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
const dateKeyToDate = (key) => new Date(`${key}T12:00:00Z`);
const dayStartISO = (key) => `${key}T00:00:00.000Z`;
const dayEndISO = (key) => `${key}T23:59:59.999Z`;

const fmtShortDuration = (sec) => {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
};

/* --------------- component --------------- */
export default function UnderwritingDashboard() {
  const { user, profile } = useAuth();
  const role = profile?.role || user?.user_metadata?.role || 'agent';
  const isUW = ['underwriter', 'uw_manager', 'supervisor', 'admin'].includes(role);

  // data
  const [allForWork, setAllForWork] = useState([]); // Submitted + Claimed (anyone)
  const [pendingToday, setPendingToday] = useState([]); // Pending/CannotLocate with last_action_at today
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // KPI (from uw_log, today)
  const [processedToday, setProcessedToday] = useState(0);
  const [avgTurnSecToday, setAvgTurnSecToday] = useState(null);
  const [statusCountsToday, setStatusCountsToday] = useState({
    Approved: 0,
    Pending: 0,
    'Cannot Locate Policy': 0,
  });

  // day selector for "Pending Correction (Today)"
  const [day, setDay] = useState(() => toDateKey(new Date()));
  const dayDate = useMemo(() => dateKeyToDate(day), [day]);

  // local per-row action state (only used when user is the claimer)
  const [actions, setActions] = useState({}); // { [id]: { status: '', note: '' } }
  const setActionState = (id, patch) =>
    setActions((s) => ({ ...s, [id]: { ...(s[id] || { status: '', note: '' }), ...patch } }));

  // chat UI
  const [openChatRow, setOpenChatRow] = useState(null);
  const [draft, setDraft] = useState({}); // rowId -> text
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
      ) {
        setShowEmoji(false);
      }
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

  /* --------------- load data --------------- */
  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setMsg('');

    // Queue to work on: Submitted or Claimed
    const forWorkQ = supabase
      .from('uw_submissions')
      .select('*')
      .in('status', ['Submitted', 'Claimed'])
      .order('created_at', { ascending: true });

    // Pending correction list: today based on last_action_at
    const pendingQ = supabase
      .from('uw_submissions')
      .select('*')
      .in('status', ['Pending', 'Cannot Locate Policy'])
      .gte('last_action_at', dayStartISO(day))
      .lte('last_action_at', dayEndISO(day))
      .order('last_action_at', { ascending: true });

    // KPI: read uw_log for today
    const todayKey = toDateKey(new Date());
    const kpiQ = supabase
      .from('uw_log')
      .select('status, queue_age_seconds, action_at')
      .gte('action_at', dayStartISO(todayKey))
      .lte('action_at', dayEndISO(todayKey));

    const [fw, pd, kpi] = await Promise.all([forWorkQ, pendingQ, kpiQ]);

    if (fw.error) setMsg(`Queue error: ${fw.error.message}`);
    if (pd.error) setMsg((m) => m || `Pending error: ${pd.error.message}`);
    if (kpi.error) setMsg((m) => m || `KPI error: ${kpi.error.message}`);

    setAllForWork(fw.data || []);

    // Sort pending so newest agent reply floats to top
    setPendingToday((pd.data || []).slice().sort((a, b) => {
      const lastA = (Array.isArray(a.pending_items) ? a.pending_items : []).slice(-1)[0];
      const lastB = (Array.isArray(b.pending_items) ? b.pending_items : []).slice(-1)[0];
      const scoreA = lastA?.from === 'agent' ? new Date(lastA.at).getTime() : 0;
      const scoreB = lastB?.from === 'agent' ? new Date(lastB.at).getTime() : 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return new Date(b.last_action_at || b.created_at).getTime() - new Date(a.last_action_at || a.created_at).getTime();
    }));

    // KPIs
    const rows = kpi.data || [];
    setProcessedToday(rows.length);

    if (rows.length) {
      const valid = rows
        .map((r) => Number(r.queue_age_seconds))
        .filter((n) => Number.isFinite(n) && n >= 0);
      const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      setAvgTurnSecToday(avg);
    } else {
      setAvgTurnSecToday(null);
    }

    const counts = { Approved: 0, Pending: 0, 'Cannot Locate Policy': 0 };
    for (const r of rows) {
      if (counts[r.status] != null) counts[r.status] += 1;
    }
    setStatusCountsToday(counts);

    setLoading(false);
  }, [user?.id, day]);

  useEffect(() => {
    load();
  }, [load]);

  /* --------------- mutations --------------- */
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

    // 1) Update submission with chosen outcome + notes
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

    const { error: upErr } = await supabase
      .from('uw_submissions')
      .update(update)
      .eq('id', row.id);
    if (upErr) return alert(upErr.message);

    // 2) Optionally mirror the note into chat
    if (local.note && local.note.trim()) {
      try {
        await appendMessage(row.id, row.pending_items, local.note.trim());
      } catch {
        /* non-blocking */
      }
    }

    load();
  };

  /* --------------- derived views --------------- */
  const incomingUnclaimed = useMemo(
    () => (allForWork || []).filter((r) => !r.claimed_by && r.status === 'Submitted'),
    [allForWork]
  );
  const myClaimed = useMemo(
    () => (allForWork || []).filter((r) => r.claimed_by === user?.id),
    [allForWork, user?.id]
  );

  const orderNumber = (arr, id) => `#${arr.findIndex((r) => r.id === id) + 1}`;
  const todayKey = toDateKey(new Date());
  const onPrevDay = () => setDay(toDateKey(new Date(dayDate.getTime() - 86400000)));
  const onNextDay = () => setDay(toDateKey(new Date(dayDate.getTime() + 86400000)));

  /* --------------- render helpers --------------- */
  if (!isUW) return <div className={styles.container}><p>Not authorized.</p></div>;

  const ChatCell = ({ row, canMessage }) => {
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
                onClick={() => {
                  setOpenChatRow(row.id);
                  setShowEmoji(false);
                }}
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

            {canMessage ? (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  position: 'relative',
                }}
              >
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
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    position: 'relative',
                  }}
                >
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
                  <button
                    type="button"
                    className={styles.sendBtn}
                    onClick={() => sendChat(row)}
                  >
                    Send message
                  </button>
                  <button
                    type="button"
                    className={styles.refreshBtn}
                    onClick={() => {
                      setOpenChatRow(null);
                      setShowEmoji(false);
                    }}
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
                          style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: 22,
                            cursor: 'pointer',
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ color: '#6b7280' }}>Messaging disabled.</div>
            )}
          </div>
        )}
      </td>
    );
  };

  const RowBase = ({ r, arr, showActions, showChat }) => {
    const age = diffAge(r.created_at);
    const mine = r.claimed_by === user?.id;
    const unassigned = !r.claimed_by;
    const local = actions[r.id] || { status: '', note: '' };
    const last = (Array.isArray(r.pending_items) ? r.pending_items : []).slice(-1)[0];
    const newReply = last?.from === 'agent';

    return (
      <tr key={r.id} style={newReply ? { boxShadow: 'inset 2px 0 0 #22c55e' } : undefined}>
        <td>{orderNumber(arr, r.id)}</td>
        <td>{(r.agent_email || '').split('@')[0] || '—'}</td>
        <td>{r.agent_email || '—'}</td>
        <td>{r.transaction_type || '—'}</td>
        <td>{r.policy_number || '—'}</td>
        <td>{r.phone_number || '—'}</td>
        <td>{r.customer_name || '—'}</td>
        <td>
          {r.claimed_by_email || (
            <span className={styles.unassigned}>Unassigned</span>
          )}
        </td>
        <td className={age.danger ? styles.ageDanger : ''}>{age.label}</td>
        <td>{r.last_action_at ? new Date(r.last_action_at).toLocaleString() : '—'}</td>

        {showActions && (
          <td style={{ minWidth: 300 }}>
            {unassigned ? (
              <button className={styles.claimBtn} onClick={() => claim(r)}>
                Claim
              </button>
            ) : (
              <>
                <select
                  className={styles.select}
                  value={mine ? local.status : r.status}
                  disabled={!mine}
                  onChange={(e) =>
                    setActionState(r.id, { status: e.target.value })
                  }
                >
                  <option value="">Select action…</option>
                  {ACTION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>

                <textarea
                  className={styles.notes}
                  placeholder="Notes to agent…"
                  disabled={!mine}
                  value={mine ? local.note : r.uw_notes || ''}
                  onChange={(e) => setActionState(r.id, { note: e.target.value })}
                />

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
        )}

        {showChat && <ChatCell row={r} canMessage={true} />}
      </tr>
    );
  };

  // stacked bar segments for status today
  const segments = useMemo(() => {
    const a = statusCountsToday.Approved || 0;
    const p = statusCountsToday.Pending || 0;
    const c = statusCountsToday['Cannot Locate Policy'] || 0;
    const total = a + p + c || 1;
    return [
      { label: 'Approved', value: a, pct: (a / total) * 100, color: '#22c55e' },
      { label: 'Pending', value: p, pct: (p / total) * 100, color: '#f59e0b' },
      { label: 'Cannot Locate', value: c, pct: (c / total) * 100, color: '#ef4444' },
    ];
  }, [statusCountsToday]);

  /* ---------------- UI ---------------- */
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Underwriting Dashboard</h1>

      {msg && <div className={styles.message}>{msg}</div>}

      {/* Top 3 compact KPIs in one row */}
      <div
        className={styles.kpis}
        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
      >
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Total In Queue</div>
          <div className={styles.kpiValue}>{allForWork.length}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>My Claimed</div>
          <div className={styles.kpiValue}>{myClaimed.length}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Pending Correction (Today)</div>
          <div className={styles.kpiValue}>{pendingToday.length}</div>
        </div>
      </div>

      {/* Policies by Status (today) – keep full width, show Avg Turnaround + Processed Today */}
      <div className={styles.card}>
        <div className={styles.kpiLabel} style={{ marginBottom: 8 }}>
          Policies by Status (today)
        </div>
        <div
          className={styles.spark}
          style={{
            display: 'flex',
            overflow: 'hidden',
            height: 10,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#eef2f7',
          }}
        >
          {segments.map((s) => (
            <div key={s.label} style={{ width: `${s.pct}%`, background: s.color }} />
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 6,
            color: '#6b7280',
            fontSize: 12,
            flexWrap: 'wrap',
          }}
        >
          {segments.map((s) => (
            <div
              key={s.label}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: s.color,
                  borderRadius: 2,
                  display: 'inline-block',
                }}
              />
              {s.label} ({s.value})
            </div>
          ))}
        </div>
        <div style={{ marginTop: 6, color: '#6b7280', fontSize: 12 }}>
          Processed Today: <strong>{processedToday}</strong>
          {avgTurnSecToday != null && (
            <>
              {' '}
              • Avg Turnaround: <strong>{fmtShortDuration(avgTurnSecToday)}</strong>
            </>
          )}
        </div>
      </div>

      {/* INCOMING UNCLAIMED */}
      <h2 className={styles.subTitle}>Incoming (Unclaimed)</h2>
      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table>
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
                <tr>
                  <td colSpan={12}>Loading…</td>
                </tr>
              ) : incomingUnclaimed.length === 0 ? (
                <tr>
                  <td colSpan={12}>No unclaimed items.</td>
                </tr>
              ) : (
                incomingUnclaimed.map((r) => (
                  <RowBase
                    key={r.id}
                    r={r}
                    arr={incomingUnclaimed}
                    showActions={true}
                    showChat={true}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MY CLAIMED */}
      <h2 className={styles.subTitle}>My Claimed</h2>
      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table>
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
                <tr>
                  <td colSpan={12}>Loading…</td>
                </tr>
              ) : myClaimed.length === 0 ? (
                <tr>
                  <td colSpan={12}>Nothing claimed yet.</td>
                </tr>
              ) : (
                myClaimed.map((r) => (
                  <RowBase
                    key={r.id}
                    r={r}
                    arr={myClaimed}
                    showActions={true}
                    showChat={true}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PENDING CORRECTION (TODAY) – now with Claim + Actions */}
      <h2 className={styles.subTitle}>Pending Correction (Today)</h2>
      <div className={styles.pendingBar}>
        <button className={styles.dayBtn} onClick={onPrevDay}>
          &larr;
        </button>
        <div className={styles.dayLabel}>{dayDate.toLocaleDateString()}</div>
        <button
          className={styles.dayBtn}
          onClick={onNextDay}
          disabled={day >= todayKey}
        >
          &rarr;
        </button>
        <button className={styles.refreshBtn} onClick={load}>
          Refresh
        </button>
      </div>

      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table>
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
                <tr>
                  <td colSpan={12}>Loading…</td>
                </tr>
              ) : pendingToday.length === 0 ? (
                <tr>
                  <td colSpan={12}>No pending items for this day.</td>
                </tr>
              ) : (
                pendingToday.map((r) => (
                  <RowBase
                    key={r.id}
                    r={r}
                    arr={pendingToday}
                    showActions={true}
                    showChat={true}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}




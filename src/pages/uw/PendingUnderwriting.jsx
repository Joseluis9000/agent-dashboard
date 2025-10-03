// src/pages/uw/PendingUnderwriting.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../supabaseClient';
import styles from './UnderwritingDashboard.module.css'; // reuse dashboard styles

const ACTION_OPTIONS = ['Approved', 'Pending', 'Cannot Locate Policy'];

/* ---------- helpers ---------- */
const pad = (n) => String(n).padStart(2, '0');
const toDateKey = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dateKeyToDate = (key) => new Date(`${key}T12:00:00Z`);
const dayStartISO = (key) => `${key}T00:00:00.000Z`;
const dayEndISO = (key) => `${key}T23:59:59.999Z`;
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

/* ---------- component ---------- */
export default function PendingUnderwriting() {
  const { user, profile } = useAuth();
  const role = profile?.role || user?.user_metadata?.role || 'agent';
  const isUW = ['underwriter', 'uw_manager', 'supervisor', 'admin'].includes(role);

  // default to yesterday (anything older than today's “Pending Correction”)
  const todayKey = toDateKey(new Date());
  const yesterdayKey = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return toDateKey(d);
  }, []);

  const [day, setDay] = useState(yesterdayKey);
  const dayDate = useMemo(() => dateKeyToDate(day), [day]);

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

    // “Pending Underwriting” = Pending or Cannot Locate Policy, for the selected day,
    // but NOT today (your dashboard handles today).
    const { data, error } = await supabase
      .from('uw_submissions')
      .select('*')
      .in('status', ['Pending', 'Cannot Locate Policy'])
      .gte('last_action_at', dayStartISO(day))
      .lte('last_action_at', dayEndISO(day))
      .order('last_action_at', { ascending: true });

    if (error) setMsg(`Load error: ${error.message}`);

    // optional sort: if the last message is from agent, bubble up (needs attention)
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
  }, [user?.id, day]);

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
        status: 'Claimed', // you can keep “Pending” and just assign, but we’ve been standardizing on Claimed
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

  const orderNumber = (arr, id) => `#${arr.findIndex((r) => r.id === id) + 1}`;
  const onPrevDay = () => {
    const d = new Date(dayDate);
    d.setUTCDate(d.getUTCDate() - 1);
    setDay(toDateKey(d));
  };
  const onNextDay = () => {
    const d = new Date(dayDate);
    d.setUTCDate(d.getUTCDate() + 1);
    setDay(toDateKey(d));
  };

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
        <div className={styles.subHeader}>Select a Day (older than today)</div>
        <div className={styles.dayNav} style={{ marginBottom: 10 }}>
          <button className={styles.iconBtn} onClick={onPrevDay} title="Previous day">‹</button>
          <div className={styles.muted} style={{ fontWeight: 800 }}>
            {dayDate.toLocaleDateString()}
          </div>
          <button
            className={styles.iconBtn}
            onClick={onNextDay}
            disabled={day >= todayKey}
            title="Next day"
          >
            ›
          </button>
          <button className={styles.refreshBtn} onClick={load} style={{ marginLeft: 'auto' }}>
            Refresh
          </button>
        </div>

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
              ) : rows.length === 0 ? (
                <tr><td colSpan={12}>No items for this day.</td></tr>
              ) : (
                rows.map((r) => <Row key={r.id} r={r} arr={rows} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


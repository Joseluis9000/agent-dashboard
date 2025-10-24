// src/pages/agent/UnderwritingSubmit.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../supabaseClient';
import styles from './UnderwritingSubmit.module.css';

/* ---------- Office list ---------- */
const OFFICES = [
  { value: 'ca010', label: 'CA010 NOBLE' },
  { value: 'ca011', label: 'CA011 VISALIA' },
  { value: 'ca012', label: 'CA012 PORTERVILLE' },
  { value: 'ca016', label: 'CA016 NILES' },
  { value: 'ca022', label: 'CA022 TULARE' },
  { value: 'ca025', label: 'CA025 RIVERBANK' },
  { value: 'ca030', label: 'CA030 MERCED' },
  { value: 'ca045', label: 'CA045 ATWATER' },
  { value: 'ca046', label: 'CA046 TURLOCK' },
  { value: 'ca047', label: 'CA047 MING' },
  { value: 'ca048', label: 'CA048 NORRIS' },
  { value: 'ca049', label: 'CA049 WHITE' },
  { value: 'ca065', label: 'CA065 CROWS' },
  { value: 'ca074', label: 'CA074 CERES' },
  { value: 'ca075', label: 'CA075 MODESTO' },
  { value: 'ca076', label: 'CA076 PITSBURG' },
  { value: 'ca095', label: 'CA095 PATTERSON' },
  { value: 'ca103', label: 'CA103 ANTIOCH' },
  { value: 'ca104', label: 'CA104 RICHMOND' },
  { value: 'ca114', label: 'CA114 SAN LORENZO' },
  { value: 'ca117', label: 'CA117 VALLEJO' },
  { value: 'ca118', label: 'CA118 HOLLISTER' },
  { value: 'ca119', label: 'CA119 YOSEMITE' },
  { value: 'ca131', label: 'CA131 CHULA VISTA' },
  { value: 'ca132', label: 'CA132 NATIONAL CITY' },
  { value: 'ca133', label: 'CA133 LOGAN' },
  { value: 'ca149', label: 'CA149 REDWOOD CITY' },
  { value: 'ca150', label: 'CA150 MENLO PARK' },
  { value: 'ca166', label: 'CA166 EL CAJON' },
  { value: 'ca172', label: 'CA172 BRUNDAGE' },
  { value: 'ca183', label: 'CA183 HENDERSON' },
  { value: 'ca216', label: 'CA216 NAPA' },
  { value: 'ca229', label: 'CA229 CORCORAN' },
  { value: 'ca230', label: 'CA230 AVENAL' },
  { value: 'ca231', label: 'CA231 LIVINGSTON' },
  { value: 'ca236', label: 'CA236 SAN RAFAEL' },
  { value: 'ca238', label: 'CA238 CHOWCHILLA' },
  { value: 'ca239', label: 'CA239 COALINGA' },
  { value: 'ca240', label: 'CA240 ARVIN' },
  { value: 'ca248', label: 'CA248 SPRINGS' },
  { value: 'ca249', label: 'CA249 BRAWLEY' },
  { value: 'ca250', label: 'CA250 BARRIO LOGAN' },
  { value: 'ca251', label: 'CA251 LA PUENTE' },
];

/* ---------- Week helpers (Mon–Sun, UTC-safe) ---------- */
const toUTCDateOnly = (d) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const mondayOf = (d) => {
  const u = toUTCDateOnly(d);
  const dow = u.getUTCDay(); // 0=Sun
  const diff = u.getUTCDate() - dow + (dow === 0 ? -6 : 1);
  return new Date(Date.UTC(u.getUTCFullYear(), u.getUTCMonth(), diff));
};
const addDays = (d, n) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const isoDate = (d) => d.toISOString().split('T')[0];

const weekLabel = (start) => {
  const end = addDays(start, 6);
  const fmt = (x) =>
    `${String(x.getUTCMonth() + 1).padStart(2, '0')}/${String(x.getUTCDate()).padStart(2, '0')}/${x.getUTCFullYear()}`;
  return `${fmt(start)} – ${fmt(end)}`;
};

/* ---------- Component ---------- */
export default function UnderwritingSubmit() {
  const { user, profile } = useAuth();

  /* Form state */
  const [form, setForm] = useState({
    effective_date: isoDate(new Date()),  // default to today
    office_code: '',
    transaction_type: 'NB',               // NB | EN
    policy_number: '',
    customer_name: '',
    phone_number: '',
    premium: '',
    total_bf: '',
    split_pay: '',
    details: '',                          // will be used as first chat message
    priority: 3,
  });
  const [rememberOffice, setRememberOffice] = useState(true);

  /* My submissions state */
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [items, setItems] = useState({ pending: [], accepted: [] });
  const [uwMap, setUwMap] = useState({}); // { userId: 'FirstName' }
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  /* Chat UI state */
  const [openChatRow, setOpenChatRow] = useState(null);
  const [draft, setDraft] = useState({}); // rowId -> message text

  // Emoji UI (single picker for the currently open chat)
  const composerRef = useRef(null);
  const emojiBtnRef = useRef(null);
  const emojiPanelRef = useRef(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiList = [
    '😀','😁','😂','🤣','😊','😍','😎','🙂','😉',
    '🙌','👍','👏','🙏','💯','🔥','🎉','✅','❌','📝','📎','📷'
  ];

  const insertEmoji = (emoji) => {
    if (!openChatRow) return;
    const ta = composerRef.current;
    const current = draft[openChatRow] || '';
    if (!ta) {
      setDraft((s) => ({ ...s, [openChatRow]: current + emoji }));
      setShowEmoji(false);
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const next = current.slice(0, start) + emoji + current.slice(end);
    setDraft((s) => ({ ...s, [openChatRow]: next }));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
    });
    setShowEmoji(false);
  };

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

  // Prefill default office
  useEffect(() => {
    const def = localStorage.getItem('default_office_code');
    if (def) setForm((f) => ({ ...f, office_code: def }));
  }, []);

  /* Load my submissions for selected week */
  const loadMine = async () => {
    if (!user?.id) return;
    setLoading(true);
    setMsg('');

    const startIso = `${isoDate(weekStart)}T00:00:00Z`;
    const endIso = `${isoDate(addDays(weekStart, 6))}T23:59:59Z`;

    const { data, error } = await supabase
      .from('uw_submissions')
      .select('*')
      .eq('agent_id', user.id)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('loadMine error:', error);
      setMsg(`Error loading submissions: ${error.message}`);
      setItems({ pending: [], accepted: [] });
      setUwMap({});
      setLoading(false);
      return;
    }

    // Separate pending vs. accepted
    const pending = (data || []).filter((r) => (r.status || '').toLowerCase() !== 'approved');
    const accepted = (data || []).filter((r) => (r.status || '').toLowerCase() === 'approved');
    setItems({ pending, accepted });

    // Build Underwriter first-name map via profiles
    const ids = Array.from(
      new Set((data || []).map((r) => r.claimed_by).filter(Boolean))
    );
    if (ids.length) {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);
      if (!pErr && profs) {
        const map = {};
        for (const p of profs) {
          const first =
            (p.full_name || '')
              .split(/\s+/)[0]
              ?.trim() ||
            (p.email || '')
              .split('@')[0]
              .split(/[._-]/)[0];
          map[p.id] = first ? first.charAt(0).toUpperCase() + first.slice(1) : '—';
        }
        setUwMap(map);
      } else {
        setUwMap({});
      }
    } else {
      setUwMap({});
    }

    setLoading(false);
  };

  useEffect(() => {
    loadMine();
  }, [user?.id, weekStart]);

  /* Submit new request */
  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (!user?.id || !user?.email) {
      setMsg('Your session isn’t ready. Please log in again.');
      return;
    }

    if (rememberOffice && form.office_code) {
      localStorage.setItem('default_office_code', form.office_code);
    }

    const premiumNum = form.premium === '' ? null : Number(form.premium);
    const totalBfNum = form.total_bf === '' ? null : Number(form.total_bf);
    const splitPayNum = form.split_pay === '' ? null : Number(form.split_pay);

    const now = new Date().toISOString();

    // --- NEW: Get full agent name and office label ---
    const officeLabel = OFFICES.find(o => o.value === form.office_code)?.label || form.office_code;

    // Try to find the name from all possible locations
    const fullName = profile?.full_name ||  // 1. profile.full_name
                     user?.user_metadata?.full_name || // 2. metadata.full_name
                     user?.user_metadata?.name || '';  // 3. metadata.name (from auth)

    let agentFirstName = profile?.first_name || user?.user_metadata?.first_name || '';
    let agentLastName = profile?.last_name || user?.user_metadata?.last_name || '';

    // If first/last are blank, try splitting the full_name
    if (!agentFirstName && fullName) {
      const parts = fullName.split(' ');
      agentFirstName = parts[0] || '';
      agentLastName = parts.slice(1).join(' ') || '';
    }
// --- End new block ---

    // Build submission payload; details field is *not* stored — we push it as first message.
    const payload = {
      agent_id: user.id,
      agent_email: user.email,
      agent_first_name: agentFirstName, // <-- ADDED
      agent_last_name: agentLastName,  // <-- ADDED

      effective_date: form.effective_date || null,
      office_code: form.office_code.trim(),
      office: officeLabel, // <-- ADDED (This is the human-readable name)
      transaction_type: form.transaction_type || null,
      policy_number: form.policy_number.trim(),
      customer_name: form.customer_name?.trim() || null,
      phone_number: form.phone_number?.trim() || null,
      premium: Number.isFinite(premiumNum) ? premiumNum : null,
      total_bf: Number.isFinite(totalBfNum) ? totalBfNum : null, // <-- ADDED

      attachments: {
        total_bf: Number.isFinite(totalBfNum) ? totalBfNum : null,
        split_pay_amount: Number.isFinite(splitPayNum) ? splitPayNum : null,
      },

      // First conversation message (if provided)
      pending_items: form.details?.trim()
        ? [{ from: 'agent', text: form.details.trim(), at: now, by: user.email }]
        : [],

      status: 'Submitted',
      priority: Number(form.priority) || 3,

      last_action_at: now,
      last_updated_by: user.id,
      last_updated_by_email: user.email,
    };

    const { data: inserted, error } = await supabase
      .from('uw_submissions')
      .insert(payload)
      .select('id')   // keep the id so we can link total_bf
      .single();

    if (error) {
      setMsg(`Error: ${error.message}`);
      return;
    }

    // ✅ Save total_bf in its own table (no reading)
    if (Number.isFinite(totalBfNum)) {
      const bfRow = {
        policy_number: form.policy_number.trim(),
        amount: totalBfNum,
        office_code: form.office_code.trim() || null,
        agent_id: user.id,
        agent_email: user.email,
        submission_id: inserted?.id ?? null, // optional link to uw_submissions
        created_at: now,
        updated_at: now,
      };

      // Try upsert if a unique constraint exists, otherwise fallback to insert
      let bfErr = null;
      let upsertRes = await supabase
        .from('total_bf')
        .upsert(bfRow, { onConflict: 'policy_number' });
      if (upsertRes.error) {
        // Fallback to plain insert (in case no unique constraint)
        const ins2 = await supabase.from('total_bf').insert(bfRow);
        bfErr = ins2.error;
      }
      if (bfErr) console.error('total_bf save error:', bfErr);
    }

    setMsg('Submitted!');
    setForm((f) => ({
      effective_date: isoDate(new Date()),
      office_code: localStorage.getItem('default_office_code') || '',
      transaction_type: 'NB',
      policy_number: '',
      customer_name: '',
      phone_number: '',
      premium: '',
      total_bf: '',
      split_pay: '',
      details: '',
      priority: 3,
    }));
    loadMine();
  };

  /* Messaging helpers */
  const appendMessage = async (rowId, thread, text) => {
    const newThread = [
      ...(Array.isArray(thread) ? thread : []),
      { from: 'agent', text, at: new Date().toISOString(), by: user?.email || null },
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

  const sendMessage = async (row) => {
    const text = (draft[row.id] || '').trim();
    if (!text) return;
    try {
      await appendMessage(row.id, row.pending_items, text);
      setDraft((s) => ({ ...s, [row.id]: '' }));
      setOpenChatRow(null);
      setShowEmoji(false);
      loadMine();
    } catch (e) {
      alert(e.message);
    }
  };

  /* Small helpers */
  const prettyUnderwriter = (row) => {
    if (row.claimed_by && uwMap[row.claimed_by]) return uwMap[row.claimed_by];
    if (row.claimed_by_email) {
      const raw = row.claimed_by_email.split('@')[0].split(/[._-]/)[0];
      return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '—';
    }
    return '—';
  };

  const lastMessage = (row) => {
    const t = Array.isArray(row.pending_items) ? row.pending_items : [];
    return t.length ? t[t.length - 1] : null;
  };

  /* Render */
  if (!user) {
    return (
      <div className={styles.container}>
        <p>Loading session…</p>
      </div>
    );
  }

  const PendingRow = (r) => {
    const canMessage = (r.status || '').toLowerCase() !== 'approved';
    const last = lastMessage(r);
    return (
      <tr key={r.id} style={{ background: '#fff5f5' /* subtle red */ }}>
        <td>{new Date(r.created_at).toLocaleString()}</td>
        <td>{r.office_code || '—'}</td>
        <td>{r.transaction_type || '—'}</td>
        <td>{r.policy_number || '—'}</td>
        <td>{r.customer_name || '—'}</td>
        <td>{r.status || '—'}</td>
        <td>{prettyUnderwriter(r)}</td>
        <td className={styles.notesCell}>{r.uw_notes || '—'}</td>
        <td style={{ minWidth: 320 }}>
          {/* Collapsed preview */}
          {openChatRow !== r.id && (
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
                    {last.from === 'agent' ? 'You' : 'Underwriting'} ·{' '}
                    {new Date(last.at).toLocaleString()}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{last.text}</div>
                </div>
              ) : (
                <div style={{ color: '#6b7280' }}>No messages yet.</div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={styles.submit}
                  onClick={() => {
                    setOpenChatRow(r.id);
                    setShowEmoji(false);
                  }}
                >
                  Open conversation
                </button>
              </div>
            </div>
          )}

          {/* Expanded chat */}
          {openChatRow === r.id && (
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
                {(Array.isArray(r.pending_items) ? r.pending_items : []).map(
                  (m, idx) => {
                    const mine = m.from === 'agent';
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
                          {mine ? 'You' : 'Underwriting'} ·{' '}
                          {m.at ? new Date(m.at).toLocaleString() : ''}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                      </div>
                    );
                  }
                )}
              </div>

              {canMessage ? (
                <>
                  <div className={styles.composerRow}>
                    <textarea
                      ref={composerRef}
                      placeholder="Type a message…"
                      value={draft[r.id] || ''}
                      onChange={(e) =>
                        setDraft((s) => ({ ...s, [r.id]: e.target.value }))
                      }
                    />

                    <div className={styles.composerActions}>
                      <button
                        type="button"
                        ref={emojiBtnRef}
                        className={styles.emojiBtn}
                        onClick={() => setShowEmoji((v) => !v)}
                        aria-label="Insert emoji"
                        title="Insert emoji"
                      >
                        <span className={styles.emojiIcon}>😊</span>
                      </button>

                      <button
                        type="button"
                        className={styles.sendBtn}
                        onClick={() => sendMessage(r)}
                      >
                        Send message
                      </button>

                      <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={() => {
                          setOpenChatRow(null);
                          setShowEmoji(false);
                        }}
                      >
                        Close
                      </button>

                      {showEmoji && openChatRow === r.id && (
                        <div ref={emojiPanelRef} className={styles.emojiPanel}>
                          {emojiList.map((e) => (
                            <button
                              key={e}
                              type="button"
                              className={styles.emojiPick}
                              onClick={() => insertEmoji(e)}
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ color: '#6b7280' }}>
                  This policy is approved. Messaging is closed.
                </div>
              )}
            </div>
          )}
        </td>
      </tr>
    );
  };

  const AcceptedRow = (r) => {
    const last = lastMessage(r);
    return (
      <tr key={r.id}>
        <td>{new Date(r.created_at).toLocaleString()}</td>
        <td>{r.office_code || '—'}</td>
        <td>{r.transaction_type || '—'}</td>
        <td>{r.policy_number || '—'}</td>
        <td>{r.customer_name || '—'}</td>
        <td>{r.status || '—'}</td>
        <td>{prettyUnderwriter(r)}</td>
        <td className={styles.notesCell}>{r.uw_notes || '—'}</td>
        <td style={{ minWidth: 320 }}>
          {/* Collapsed preview only (messaging closed for approved) */}
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
                {last.from === 'agent' ? 'You' : 'Underwriting'} ·{' '}
                {new Date(last.at).toLocaleString()}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{last.text}</div>
            </div>
          ) : (
            <div style={{ color: '#6b7280' }}>No messages.</div>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Underwriting Submission</h1>

      {/* ---------- Submit form ---------- */}
      <form onSubmit={submit} className={styles.card}>
        <div className={styles.grid}>
          <input
            type="date"
            placeholder="Date"
            value={form.effective_date}
            onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
          />

          <div className={styles.officeGroup}>
            <select
              value={form.office_code}
              onChange={(e) => setForm({ ...form, office_code: e.target.value })}
              required
            >
              <option value="">Select Office</option>
              {OFFICES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className={styles.rememberOffice}>
              <input
                type="checkbox"
                checked={rememberOffice}
                onChange={(e) => setRememberOffice(e.target.checked)}
              />
              Remember as default
            </label>
          </div>

          {/* Transaction Type */}
          <select
            value={form.transaction_type}
            onChange={(e) => setForm({ ...form, transaction_type: e.target.value })}
            required
            title="Transaction Type"
          >
            <option value="NB">NB — New Business</option>
            <option value="EN">EN — Endorsement</option>
          </select>

          <input
            placeholder="Policy Number"
            value={form.policy_number}
            onChange={(e) => setForm({ ...form, policy_number: e.target.value })}
            required
          />
          <input
            placeholder="Customer Name"
            value={form.customer_name}
            onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
          />
          <input
            placeholder="Phone Number"
            value={form.phone_number}
            onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Premium"
            value={form.premium}
            onChange={(e) => setForm({ ...form, premium: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Total BF"
            value={form.total_bf}
            onChange={(e) => setForm({ ...form, total_bf: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Split Pay Amount (If Any)"
            value={form.split_pay}
            onChange={(e) => setForm({ ...form, split_pay: e.target.value })}
          />
        </div>

        {/* Replaced textarea with a message input that posts to conversation */}
        <input
          type="text"
          placeholder="Message to Underwriter (this will be saved in the conversation)"
          value={form.details}
          onChange={(e) => setForm({ ...form, details: e.target.value })}
        />

        <button type="submit" className={styles.submit}>
          Submit to Underwriting
        </button>
        {msg && <div className={styles.message}>{msg}</div>}
      </form>

      {/* ---------- My Submissions (with week selector & chat) ---------- */}
      <div className={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>My Submissions</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={() => setWeekStart((d) => addDays(d, -7))}
              title="Previous week"
            >
              ‹
            </button>
            <div style={{ fontWeight: 700 }}>{weekLabel(weekStart)}</div>
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={() => setWeekStart((d) => addDays(d, 7))}
              title="Next week"
            >
              ›
            </button>
            <button
              type="button"
              style={{
                border: '1px solid var(--border)',
                background: '#fff',
                borderRadius: 8,
                padding: '0.45rem 0.7rem',
              }}
              onClick={() => setWeekStart(mondayOf(new Date()))}
              title="Go to current week"
            >
              Today
            </button>
          </div>
        </div>

        {loading ? (
          <p>Loading…</p>
        ) : items.pending.length === 0 && items.accepted.length === 0 ? (
          <p>No submissions in this week.</p>
        ) : (
          <>
            {/* Pending Policies (always open) */}
            <h3 style={{ marginTop: 0 }}>Pending Policies</h3>
            {items.pending.length === 0 ? (
              <p>No pending policies.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Office</th>
                      <th>Transaction Type</th>
                      <th>Policy #</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Underwriter</th>
                      <th>UW Notes</th>
                      <th>Conversation</th>
                    </tr>
                  </thead>
                  <tbody>{items.pending.map(PendingRow)}</tbody>
                </table>
              </div>
            )}

            {/* Accepted Policies (collapsed by default) */}
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 600, marginTop: 16 }}>
                Accepted Policies
              </summary>
              {items.accepted.length === 0 ? (
                <p style={{ marginTop: 10 }}>No accepted policies.</p>
              ) : (
                <div className={styles.tableWrap} style={{ marginTop: 10 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Office</th>
                        <th>Transaction Type</th>
                        <th>Policy #</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Underwriter</th>
                        <th>UW Notes</th>
                        <th>Conversation</th>
                      </tr>
                    </thead>
                    <tbody>{items.accepted.map(AcceptedRow)}</tbody>
                  </table>
                </div>
              )}
            </details>
          </>
        )}
      </div>
    </div>
  );
}




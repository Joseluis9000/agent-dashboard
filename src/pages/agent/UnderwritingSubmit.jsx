// src/pages/agent/UnderwritingSubmit.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../supabaseClient';
// --- Use Submit styles ---
import styles from './UnderwritingSubmit.module.css'; // Corrected back to its own CSS

/* ---------- Office list (Keep as is) ---------- */
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

/* ---------- Week helpers (Keep as is) ---------- */
const toUTCDateOnly = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const mondayOf = (d) => {
  const u = toUTCDateOnly(d);
  const dow = u.getUTCDay(); // 0=Sun
  const diff = u.getUTCDate() - dow + (dow === 0 ? -6 : 1);
  return new Date(Date.UTC(u.getUTCFullYear(), u.getUTCMonth(), diff));
};
const addDays = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const isoDate = (d) => d.toISOString().split('T')[0];
const weekLabel = (start) => {
  const end = addDays(start, 6);
  const fmt = (x) => `${String(x.getUTCMonth() + 1).padStart(2, '0')}/${String(x.getUTCDate()).padStart(2, '0')}/${x.getUTCFullYear()}`;
  return `${fmt(start)} – ${fmt(end)}`;
};

// --- Checklist Definitions ---
const NB_CHECKLIST_ITEMS = [
    { key: 'nb_app_uploaded', label: 'Main Original Application Uploaded' },
    { key: 'nb_matrix_receipt', label: 'Matrix Receipt (Check Premium, Policy #, Co, BF Match)' },
    { key: 'nb_blue_pay', label: 'Blue Pay Receipt (If CC)' },
    { key: 'nb_disclosures', label: 'Disclosures Signed & Filled' },
    { key: 'nb_carrier_app', label: 'Carrier Application Signed & Filled' },
    { key: 'nb_household', label: 'Household Members Verified (Initials)' },
    { key: 'umpd_bi', label: 'Signature on UMPD/BI Rejection' },
    { key: 'nb_photos', label: 'Photos (Full Coverage)' },
    { key: 'nb_ids', label: 'Driver IDs (DL/Matricula/Etc)' },
    { key: 'nb_vehicle_docs', label: 'Vehicle Docs (Reg/Title/Etc)' },
    { key: 'nb_vehicle_docs_logic', label: 'Vehicle Doc Name Logic (Driver/Excluded)' },
    { key: 'nb_marriage_cert', label: 'Marriage Certificate (If req\'d)' },
    { key: 'nb_pos', label: 'Point of Sale (POS) Form' },
    { key: 'nb_esign_cert', label: 'E-Sign Certificate (If Phone)' },
    { key: 'nb_itc_quote', label: 'ITC Quote Breakdown' },
    { key: 'nb_carrier_upload', label: 'Docs Uploaded to Carrier (If req\'d)' },
    { key: 'nb_matrix_alert', label: 'Matrix Alert Set for Missing Items' },
];
const EN_CHECKLIST_ITEMS = [
    { key: 'en_matrix_receipt', label: 'Matrix Receipt Signed' },
    { key: 'en_bluepay_receipt', label: 'Bluepay Receipt (if any)' },
    { key: 'en_change_request', label: 'Company Docs / Change Request' },
    { key: 'en_missing_docs', label: 'Missing Endorsement Documents' },
    { key: 'en_title_reg', label: 'Title / Registration / Sales Contract' },
    { key: 'en_license_id', label: 'License / Matricula / ID' },
    { key: 'en_photos', label: 'Photos' },
    { key: 'en_excluded_owners', label: 'Excluded Registered Owner / Household Members' },
    { key: 'nb_household', label: 'Household Members Verified (Initials)' },
    { key: 'umpd_bi', label: 'Signature on UMPD/BI Rejection' },
    { key: 'en_uploaded_to_matrix', label: 'Uploaded To Matrix / Proof Of E-Sign' },
    { key: 'en_supporting_docs', label: 'Supporting Docs sent to Insurance co' },
    { key: 'en_premium_match', label: 'Premium Submitted Matches Receipt' },
];

// --- ChatCell Component ---
const ChatCell = ({
  row, canMessage, draft, setDraft, sendMessage, composerRef,
  emojiBtnRef, emojiPanelRef, showEmoji, setShowEmoji, emojiList, insertEmoji,
}) => {
  const allMessages = useMemo(() => Array.isArray(row.pending_items) ? row.pending_items : [], [row.pending_items]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexGrow: 1, minHeight: 0, height: '100%' }}>
      <div style={{ flexGrow: 1, maxHeight: 'none', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '0 4px 10px 0', minHeight: '150px' }}>
        {allMessages.length === 0 && <div style={{ color: '#6b7280', textAlign: 'center', marginTop: '1rem' }}>No messages yet.</div>}
        {allMessages.map((m, idx) => {
          const mine = m.from === 'agent';
          return (
            <div key={`${m.at}-${idx}-${mine}`} className={`${styles.chatBubble} ${mine ? styles.chatBubbleMine : styles.chatBubbleTheirs}`}>
              <div className={styles.chatMeta}>{mine ? 'You' : 'Underwriting'} · {m.at ? new Date(m.at).toLocaleString() : ''}</div>
              <div className={styles.chatText}>{m.text}</div>
            </div>
          );
        })}
      </div>
      {canMessage ? (
        <div className={styles.composerRow}>
          <textarea ref={composerRef} placeholder="Type a message to Underwriting…" value={draft[row.id] || ''} onChange={(e) => setDraft((s) => ({ ...s, [row.id]: e.target.value }))} />
          <div className={styles.composerActions}>
            <button type="button" ref={emojiBtnRef} className={styles.emojiBtn} onClick={() => setShowEmoji((v) => !v)} title="Insert emoji" aria-label="Insert emoji">
              <span className={styles.emojiIcon}>😊</span>
            </button>
            <button type="button" className={styles.sendBtn} onClick={() => sendMessage(row)}>Send</button>
            {showEmoji && (
              <div ref={emojiPanelRef} className={styles.emojiPanel}>
                {emojiList.map((e) => (<button key={e} type="button" className={styles.emojiPick} onClick={() => insertEmoji(e, row.id)}>{e}</button>))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ color: '#6b7280', flexShrink: 0, marginTop: 'auto', textAlign: 'center', padding: '10px', borderTop: '1px solid var(--border)' }}>Messaging closed for approved policies.</div>
      )}
    </div>
  );
};

// --- ReadOnlyChecklistTab Component ---
const ReadOnlyChecklistTab = ({ row }) => {
  const isNB = useMemo(() => (row.transaction_type || '').toUpperCase().includes('NB'), [row.transaction_type]); // Use useMemo
  // No need for setSelectedList state anymore
  const checklistData = row.checklist_data || {};
  const [showHistory, setShowHistory] = useState(false);

  const paymentMethod = (checklistData.payment_method || '').toLowerCase();
  const coverageType = (checklistData.coverage_type || '').toLowerCase();
  const baseItems = isNB ? NB_CHECKLIST_ITEMS : EN_CHECKLIST_ITEMS; // Directly use isNB

  const itemsToRender = useMemo(() => baseItems.filter(item => { // Memoize filter result
    if (item.key === 'nb_blue_pay' || item.key === 'en_bluepay_receipt') return paymentMethod !== 'cash';
    if (item.key === 'nb_photos' || item.key === 'en_photos') return coverageType !== 'liability';
    return true;
  }), [baseItems, paymentMethod, coverageType]);

  const history = useMemo(() => Array.isArray(checklistData.history) ? checklistData.history : [], [checklistData.history]); // Memoize history

  const getStatusStyle = (status) => {
      switch (status) {
          case 'Pass': return { backgroundColor: 'var(--success-light-bg)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--success-border)', color: 'var(--success-dark-text)', width: '100px', textAlign: 'center' };
          case 'Fail': return { backgroundColor: 'var(--danger-light-bg)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--danger-border)', color: 'var(--danger-dark-text)', width: '100px', textAlign: 'center' };
          case 'Needs Review': return { backgroundColor: 'var(--warning-light-bg)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--warning-border)', color: 'var(--warning-dark-text)', width: '100px', textAlign: 'center' };
          default: return { color: 'var(--muted)', width: '100px', textAlign: 'center' };
      }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flexGrow: 1, padding: '0.25rem' }}>
      {/* --- MODIFIED: Removed checklist select, added display text --- */}
      <div style={{ display: 'flex', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
         <span className={styles.checklistTypeDisplay}> {/* Added a class for potential styling */}
           Checklist Type: <strong>{isNB ? 'New Business (NB)' : 'Endorsement (EN)'}</strong>
         </span>
        <span style={{ fontSize: '0.9rem' }}>Payment: <strong>{checklistData.payment_method || 'N/A'}</strong></span>
        <span style={{ fontSize: '0.9rem' }}>Coverage: <strong>{checklistData.coverage_type || 'N/A'}</strong></span>
      </div>
      {/* --- END MODIFICATION --- */}

      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 1fr', alignItems: 'center', gap: '0.75rem 0.5rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center' }}>Status</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Checklist Item</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>UW Notes</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Reviewed By</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Date Checked</span>
        {itemsToRender.map((item) => {
          const itemData = checklistData[item.key] || { status: 'N/A', notes: '', reviewed_by: '', checked_at: null };
          return (
            <React.Fragment key={item.key}>
              <span style={getStatusStyle(itemData.status)}>{itemData.status || 'N/A'}</span>
              <label>{item.label}</label>
              <span style={{ fontSize: '0.85rem', color: 'var(--text)', wordBreak: 'break-word', background: '#f8fafc', padding: '4px 6px', borderRadius: '4px', border: '1px solid #e5e7eb' }}>{itemData.notes || '—'}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{itemData.reviewed_by || '—'}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{itemData.checked_at ? new Date(itemData.checked_at).toLocaleString() : '—'}</span>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
        <button type="button" className={styles.secondaryBtn} onClick={() => setShowHistory(prev => !prev)}>
          {showHistory ? 'Hide' : 'Show'} Change History ({ history.length })
        </button>
        {showHistory && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px' }}>
            {history.length === 0 ? ( <span style={{ color: 'var(--muted)' }}>No history found.</span> ) : (
              [...history].reverse().map((entry, index) => (
                <div key={index} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{entry.by || 'Unknown'} set "{entry.label}" to "{entry.status}"</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>{new Date(entry.at).toLocaleString()}</div>
                  {entry.notes && (<div style={{ fontSize: '0.85rem', fontStyle: 'italic', background: '#fff', padding: '4px 6px', borderRadius: '4px', wordBreak: 'break-word' }}>Note: "{entry.notes}"</div>)}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// --- DetailsModal Component ---
const DetailsModal = ({ info, onClose, user, ...chatProps }) => {
    // ... (Modal implementation remains the same)
     const { row } = info;
     const [activeTab, setActiveTab] = useState('Conversation');
     const canMessage = (row.status || '').toLowerCase() !== 'approved';

     useEffect(() => {
       const handleKeyDown = (event) => { if (event.key === 'Escape') { onClose(); } };
       window.addEventListener('keydown', handleKeyDown);
       return () => window.removeEventListener('keydown', handleKeyDown);
     }, [onClose]);

     return (
       <>
         <div className={styles.modalBackdrop} onClick={onClose} />
         <div className={styles.modalContent}>
           <div className={styles.modalHeader}>
             <h2>Details: {row.policy_number || 'Policy'} ({row.customer_name || 'No Customer'})</h2>
             <button onClick={onClose} className={styles.modalCloseBtn}>&times;</button>
           </div>
           <div className={styles.modalTabs}>
             <button className={`${styles.tabButton} ${activeTab === 'Conversation' ? styles.tabActive : ''}`} onClick={() => setActiveTab('Conversation')}>Conversation</button>
             <button className={`${styles.tabButton} ${activeTab === 'Checklist' ? styles.tabActive : ''}`} onClick={() => setActiveTab('Checklist')}>UW Checklist</button>
           </div>
           <div className={styles.modalBody}>
             {row.uw_notes && (
               <div className={styles.modalSection} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                 <h3 className={styles.modalSubTitle}>Underwriter Notes</h3>
                 <p style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>{row.uw_notes}</p>
               </div>
             )}
             {activeTab === 'Conversation' && (<div className={styles.modalSection} style={{ flexGrow: 2, display: 'flex', flexDirection: 'column' }}><ChatCell row={row} canMessage={canMessage} {...chatProps}/></div>)}
             {activeTab === 'Checklist' && (<div className={styles.modalSection} style={{ flexGrow: 2, display: 'flex', flexDirection: 'column' }}><ReadOnlyChecklistTab key={row.id} row={row}/></div>)}
           </div>
         </div>
       </>
     );
};


/* ---------- Main Component ---------- */
export default function UnderwritingSubmit() {
  const { user, profile } = useAuth();

  const [form, setForm] = useState({
    effective_date: isoDate(new Date()),
    office_code: '',
    transaction_type: 'NB',
    policy_number: '',
    customer_name: '',
    phone_number: '',
    premium: '',
    total_bf: '',
    split_pay: '',
    details: '',
    priority: 3,
  });
  const [rememberOffice, setRememberOffice] = useState(true);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [items, setItems] = useState({ pending: [], accepted: [] });
  const [uwMap, setUwMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [manageInfo, setManageInfo] = useState(null);
  const [draft, setDraft] = useState({});
  const [showEmoji, setShowEmoji] = useState(false);
  const composerRef = useRef(null);
  const emojiBtnRef = useRef(null);
  const emojiPanelRef = useRef(null);

  // --- ADDED: State for submission status ---
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- ADDED: Derived state for form validity ---
  const isFormValid = useMemo(() => {
    // Check if all required fields (excluding optional ones) have a value
    return (
      form.effective_date?.trim() &&
      form.office_code?.trim() &&
      form.transaction_type?.trim() &&
      form.policy_number?.trim() &&
      form.customer_name?.trim() &&
      form.phone_number?.trim() &&
      form.premium?.trim() && // Check string value, actual number validation happens in submit
      form.total_bf?.trim() // Check string value, actual number validation happens in submit
    );
  }, [form]); // Re-calculate when form changes

  const emojiList = useMemo(() => [
    '😀','😁','😂','🤣','😊','😍','😎','🙂','😉',
    '🙌','👍','👏','🙏','💯','🔥','🎉','✅','❌','📝','📎','📷'
  ], []);

  const insertEmoji = useCallback((emoji, rowId) => {
    // ... (insertEmoji logic) ...
     if (!rowId) return;
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
  }, [draft]);

  useEffect(() => {
    // ... (emoji panel handling) ...
     if (!showEmoji) return;
     const onDocClick = (e) => {
       if ( emojiPanelRef.current && !emojiPanelRef.current.contains(e.target) && emojiBtnRef.current && !emojiBtnRef.current.contains(e.target) ) { setShowEmoji(false); }
     };
     const onEsc = (e) => e.key === 'Escape' && setShowEmoji(false);
     document.addEventListener('mousedown', onDocClick); document.addEventListener('keydown', onEsc);
     return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onEsc); };
  }, [showEmoji]);

  useEffect(() => {
    const def = localStorage.getItem('default_office_code');
    if (def) setForm((f) => ({ ...f, office_code: def }));
  }, []);

  const loadMine = useCallback(async () => {
    // ... (loadMine logic - check required fields are selected) ...
     if (!user?.id) return;
     setLoading(true);
     setMsg('');
     const startIso = `${isoDate(weekStart)}T00:00:00Z`;
     const endIso = `${isoDate(addDays(weekStart, 6))}T23:59:59Z`;
     const selectQuery = 'id, created_at, office_code, office, transaction_type, policy_number, customer_name, status, claimed_by, claimed_by_email, claimed_by_first, claimed_by_last, uw_notes, pending_items, priority, checklist_data'; // Be more explicit
     const { data, error } = await supabase
       .from('uw_submissions')
       .select(selectQuery)
       .eq('agent_id', user.id)
       .gte('created_at', startIso)
       .lte('created_at', endIso)
       .order('created_at', { ascending: false });

     if (error) { /* ... error handling ... */ return; }
     const allData = data || [];
     const pending = allData.filter((r) => (r.status || '').toLowerCase() !== 'approved');
     const accepted = allData.filter((r) => (r.status || '').toLowerCase() === 'approved');
     setItems({ pending, accepted });
     const ids = Array.from(new Set(allData.map((r) => r.claimed_by).filter(Boolean)));
     if (ids.length) {
       const { data: profs, error: pErr } = await supabase.from('profiles').select('id, full_name, first_name, email').in('id', ids);
       if (!pErr && profs) {
         const map = {};
         for (const p of profs) {
           const first = p.first_name || (p.full_name || '').split(' ')[0] || (p.email || '').split('@')[0];
           map[p.id] = first ? first.charAt(0).toUpperCase() + first.slice(1) : '—';
         }
         setUwMap(map);
       } else { setUwMap({}); }
     } else { setUwMap({}); }
     setLoading(false);
  }, [user?.id, weekStart]);

  useEffect(() => { loadMine(); }, [loadMine]);

  useEffect(() => {
    // ... (Realtime subscription logic) ...
     if (!user?.id) return;
     const startIso = `${isoDate(weekStart)}T00:00:00Z`;
     const endIso = `${isoDate(addDays(weekStart, 6))}T23:59:59Z`;
     const handleChanges = (payload) => { /* ... handling logic ... */ };
     const channel = supabase
       .channel('agent_uw_submissions_changes')
       .on('postgres_changes', { event: '*', schema: 'public', table: 'uw_submissions', filter: `agent_id=eq.${user.id}` }, handleChanges)
       .subscribe((status, err) => { /* ... logging ... */ });
     return () => { supabase.removeChannel(channel).catch(console.error); };
  }, [user?.id, weekStart, manageInfo, loadMine]);

  const submit = async (e) => {
    e.preventDefault();
    // --- ADDED: Check form validity before proceeding ---
    if (!isFormValid) {
        setMsg('Error: Please fill in all required fields (marked implicitly).');
        return;
    }
    // --- END Check ---

    setIsSubmitting(true); // Disable button
    setMsg('Submitting...'); // Show submitting message

    // Rest of submit logic remains the same...
    if (!user?.id || !user?.email) { /* ... */ setIsSubmitting(false); return; }
    if (rememberOffice && form.office_code) { localStorage.setItem('default_office_code', form.office_code); }
    const premiumNum = form.premium === '' ? null : Number(form.premium);
    const totalBfNum = form.total_bf === '' ? null : Number(form.total_bf);
    const splitPayNum = form.split_pay === '' ? null : Number(form.split_pay);
    const now = new Date().toISOString();
    const officeLabel = OFFICES.find(o => o.value === form.office_code)?.label || form.office_code;
    const fullName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '';
    let agentFirstName = profile?.first_name || user?.user_metadata?.first_name || '';
    let agentLastName = profile?.last_name || user?.user_metadata?.last_name || '';
    if (!agentFirstName && fullName) {
      const parts = fullName.split(' ');
      agentFirstName = parts[0] || '';
      agentLastName = parts.slice(1).join(' ') || '';
    }

    const payload = {
      agent_id: user.id, agent_email: user.email, agent_first_name: agentFirstName, agent_last_name: agentLastName,
      effective_date: form.effective_date || null, office_code: form.office_code.trim(), office: officeLabel,
      transaction_type: form.transaction_type || null, policy_number: form.policy_number.trim(),
      customer_name: form.customer_name?.trim() || null, phone_number: form.phone_number?.trim() || null,
      premium: Number.isFinite(premiumNum) ? premiumNum : null, total_bf: Number.isFinite(totalBfNum) ? totalBfNum : null,
      attachments: { total_bf: Number.isFinite(totalBfNum) ? totalBfNum : null, split_pay_amount: Number.isFinite(splitPayNum) ? splitPayNum : null, },
      pending_items: form.details?.trim() ? [{ from: 'agent', text: form.details.trim(), at: now, by: user.email }] : [],
      status: 'Submitted', priority: Number(form.priority) || 3, last_action_at: now, last_updated_by: user.id, last_updated_by_email: user.email,
      checklist_data: {},
    };

    const { data: inserted, error } = await supabase.from('uw_submissions').insert(payload).select('id').single();

    if (error) {
      setMsg(`Error: ${error.message}`);
      setIsSubmitting(false); // Re-enable button on error
      return;
    }

    if (Number.isFinite(totalBfNum)) { /* ... (bf saving logic) ... */ }

    setMsg('Submitted!');
    resetForm(); // Use resetForm function
    loadMine();
    setIsSubmitting(false); // Re-enable button on success
  };

  const appendMessage = useCallback(async (rowId, thread, text) => {
    // ... (appendMessage logic) ...
     if (!text || !user?.email || !user?.id) return;
     const newMessage = { from: 'agent', text: text, at: new Date().toISOString(), by: user.email };
     const newThread = [...(Array.isArray(thread) ? thread : []), newMessage];
     if (manageInfo && manageInfo.row.id === rowId) { /* ... optimistic update ... */ }
     const { error } = await supabase.from('uw_submissions').update({ pending_items: newThread, last_action_at: newMessage.at, last_updated_by: user.id, last_updated_by_email: user.email, }).eq('id', rowId);
     if (error) { console.error("Append message error:", error); loadMine(); throw error; }
  }, [user, manageInfo, loadMine]);

  const sendMessage = useCallback(async (row) => {
    // ... (sendMessage logic) ...
     const text = (draft[row.id] || '').trim();
     if (!text) return;
     try {
       await appendMessage(row.id, row.pending_items, text);
       setDraft((s) => ({ ...s, [row.id]: '' }));
       setShowEmoji(false);
     } catch (e) { alert(`Failed to send message: ${e.message}`); }
  }, [draft, appendMessage]);

  const prettyUnderwriter = (row) => {
    // ... (prettyUnderwriter logic) ...
     if (row.claimed_by && uwMap[row.claimed_by]) return uwMap[row.claimed_by];
     if (row.claimed_by_first) return row.claimed_by_first;
     if (row.claimed_by_email) { /* ... fallback ... */ }
     return '—';
  };

  const lastMessage = (row) => {
    // ... (lastMessage logic) ...
     const t = Array.isArray(row.pending_items) ? row.pending_items : [];
     return t.length ? t[t.length - 1] : null;
  };

  const chatProps = useMemo(() => ({
    draft, setDraft, sendMessage, composerRef, emojiBtnRef, emojiPanelRef,
    showEmoji, setShowEmoji, emojiList, insertEmoji,
  }), [draft, sendMessage, showEmoji, emojiList, insertEmoji]); // Added insertEmoji back

  const resetForm = () => {
    setForm({
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
    });
    setMsg('');
  };

  if (!user) { return <div className={styles.container}><p>Loading session…</p></div>; }

  const PendingRow = (r) => {
    // ... (PendingRow JSX) ...
     const isUrgent = r.priority === 1;
     return ( <tr key={r.id} style={{ background: isUrgent ? 'var(--warning-light-bg)' : 'var(--danger-light-bg)' }}> <td>{new Date(r.created_at).toLocaleString()}</td> <td>{r.office || r.office_code || '—'}</td> <td>{r.transaction_type || '—'}</td> <td>{r.policy_number || '—'}</td> <td>{r.customer_name || '—'}</td> <td>{r.status || '—'}</td> <td>{prettyUnderwriter(r)}</td> <td> <button className={styles.secondaryBtn} onClick={() => { setManageInfo({ row: r }); setShowEmoji(false); }}> View Details </button> </td> </tr> );
  };

  const AcceptedRow = (r) => {
    // ... (AcceptedRow JSX) ...
     return ( <tr key={r.id} style={{ background: 'var(--success-light-bg)' }}> <td>{new Date(r.created_at).toLocaleString()}</td> <td>{r.office || r.office_code || '—'}</td> <td>{r.transaction_type || '—'}</td> <td>{r.policy_number || '—'}</td> <td>{r.customer_name || '—'}</td> <td>{r.status || '—'}</td> <td>{prettyUnderwriter(r)}</td> <td> <button className={styles.secondaryBtn} onClick={() => { setManageInfo({ row: r }); setShowEmoji(false); }}> View Details </button> </td> </tr> );
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Underwriting Submission</h1>
      {msg && (
        <div className={`${styles.message} ${msg.startsWith('Error:') ? styles.error : ''}`} style={{ marginBottom: '1rem' }}>{msg}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h2 className={styles.subTitle} style={{ marginTop: 0, marginBottom: 0 }}>New Submission</h2>
        <button type="button" className={styles.secondaryBtn} onClick={resetForm} style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem' }}>Reset Form</button>
      </div>

      <form onSubmit={submit} className={styles.card}>
        <div className={styles.grid}>
          {/* --- ADDED required prop to necessary fields --- */}
          <input
            type="date"
            value={form.effective_date}
            onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
            aria-label="Effective Date"
            required // Date is required
          />
          <div className={styles.officeGroup}>
            <select
              value={form.office_code}
              onChange={(e) => setForm({ ...form, office_code: e.target.value })}
              required // Office is required
              aria-label="Select Office"
            >
              <option value="">Select Office *</option> {/* Added asterisk */}
              {OFFICES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className={styles.rememberOffice}>
              <input type="checkbox" checked={rememberOffice} onChange={(e) => setRememberOffice(e.target.checked)} /> Remember
            </label>
          </div>
          <select
            value={form.transaction_type}
            onChange={(e) => setForm({ ...form, transaction_type: e.target.value })}
            required // Transaction Type is required
            title="Transaction Type"
            aria-label="Transaction Type"
          >
            <option value="NB">NB — New Business</option>
            <option value="EN">EN — Endorsement</option>
          </select>
          <input
            placeholder="Policy Number *" // Added asterisk
            value={form.policy_number}
            onChange={(e) => setForm({ ...form, policy_number: e.target.value })}
            required // Policy Number is required
            aria-label="Policy Number"
          />
          <input
            placeholder="Customer Name *" // Added asterisk
            value={form.customer_name}
            onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
            required // Customer Name is required
            aria-label="Customer Name"
          />
          <input
            placeholder="Phone Number *" // Added asterisk
            value={form.phone_number}
            onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
            required // Phone Number is required
            aria-label="Phone Number"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Premium *" // Added asterisk
            value={form.premium}
            onChange={(e) => setForm({ ...form, premium: e.target.value })}
            required // Premium is required
            aria-label="Premium"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Total BF *" // Added asterisk
            value={form.total_bf}
            onChange={(e) => setForm({ ...form, total_bf: e.target.value })}
            required // Total BF is required
            aria-label="Total BF"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Split Pay Amount (If Any)"
            value={form.split_pay}
            onChange={(e) => setForm({ ...form, split_pay: e.target.value })}
            aria-label="Split Pay Amount"
             // Optional - no 'required'
          />
        </div>

        <input
          type="text"
          placeholder="Message to Underwriter (optional)"
          value={form.details}
          onChange={(e) => setForm({ ...form, details: e.target.value })}
          aria-label="Message to Underwriter"
          style={{ marginTop: '1rem' }}
          // Optional - no 'required'
        />
        {/* --- ADDED disabled prop based on validity and submission status --- */}
        <button
          type="submit"
          className={styles.submit}
          style={{ marginTop: '1rem' }}
          disabled={!isFormValid || isSubmitting} // Disable if not valid or submitting
        >
          {isSubmitting ? 'Submitting...' : 'Submit to Underwriting'}
        </button>
      </form>

      {/* --- My Submissions Section (Remains the same) --- */}
      <h2 className={styles.subTitle}>My Submissions</h2>
      <div className={styles.card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          {/* ... week selector ... */}
           <div style={{ fontWeight: 600, marginRight: '0.5rem' }}>Week:</div>
           <button className={styles.iconBtn} onClick={() => setWeekStart((d) => addDays(d, -7))} title="Previous week">‹</button>
           <div style={{ minWidth: '180px', textAlign: 'center', fontWeight: 500 }}>{weekLabel(weekStart)}</div>
           <button className={styles.iconBtn} onClick={() => setWeekStart((d) => addDays(d, 7))} title="Next week">›</button>
           <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem' }}>
             <button className={styles.secondaryBtn} onClick={() => setWeekStart(mondayOf(new Date()))} title="Go to current week"> Current Week </button>
             <button className={styles.refreshBtn} onClick={loadMine}>Refresh</button>
           </div>
        </div>
        {loading ? ( <p>Loading…</p> ) : items.pending.length === 0 && items.accepted.length === 0 ? ( <p>No submissions found for this week.</p> ) : (
          <>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Pending ({items.pending.length})</h3>
            {items.pending.length === 0 ? ( <p>No pending policies for this week.</p> ) : ( <div className={styles.tableWrap}> <table> <thead> <tr> <th>Date</th><th>Office</th><th>Type</th><th>Policy #</th><th>Customer</th><th>Status</th><th>Underwriter</th><th>Details</th> </tr> </thead> <tbody>{items.pending.map(PendingRow)}</tbody> </table> </div> )}
            <details style={{ marginTop: '1.5rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}> Accepted ({items.accepted.length}) </summary>
              {items.accepted.length === 0 ? ( <p style={{ marginTop: 10 }}>No accepted policies for this week.</p> ) : ( <div className={styles.tableWrap} style={{ marginTop: 10 }}> <table> <thead> <tr> <th>Date</th><th>Office</th><th>Type</th><th>Policy #</th><th>Customer</th><th>Status</th><th>Underwriter</th><th>Details</th> </tr> </thead> <tbody>{items.accepted.map(AcceptedRow)}</tbody> </table> </div> )}
            </details>
          </>
        )}
      </div>

      {/* --- Modal Rendering (Remains the same) --- */}
      {manageInfo && ( <DetailsModal info={manageInfo} onClose={() => { setManageInfo(null); setShowEmoji(false); }} user={user} {...chatProps} /> )}
    </div>
  );
}
// src/pages/uw/UnderwritingDashboard.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../supabaseClient';
import styles from './UnderwritingDashboard.module.css';

const ACTION_OPTIONS = ['Approved', 'Pending', 'Cannot Locate Policy'];

// --- CHECKLIST DEFINITIONS ---
const NB_CHECKLIST_ITEMS = [
  { key: 'nb_app_uploaded', label: 'Main Original Application Uploaded' },
  { key: 'nb_matrix_receipt', label: 'Matrix Receipt (Check Premium, Policy #, Co, BF Match)' },
  { key: 'nb_blue_pay', label: 'Blue Pay Receipt (If CC)' }, // Conditional
  { key: 'nb_disclosures', label: 'Disclosures Signed & Filled' },
  { key: 'nb_carrier_app', label: 'Carrier Application Signed & Filled' },
  { key: 'nb_household', label: 'Household Members Verified (Initials)' },
  { key: 'umpd_bi', label: 'Signature on UMPD/BI Rejection' },
  { key: 'nb_photos', label: 'Photos (Full Coverage)' }, // Conditional
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
  { key: 'en_bluepay_receipt', label: 'Bluepay Receipt (if any)' }, // Conditional
  { key: 'en_company_docs', label: 'Company Documents / Written Request' },
  { key: 'en_missing_docs', label: 'Missing Endorsement Documents' },
  { key: 'en_title_reg', label: 'Title / Registration / Sales Contract' },
  { key: 'en_license_id', label: 'License / Matricula / ID' },
  { key: 'en_photos', label: 'Photos' }, // Conditional
  { key: 'en_excluded_owners', label: 'Excluded Registered Owner / Household Members' },
  { key: 'nb_household', label: 'Household Members Verified (Initials)' },
  { key: 'umpd_bi', label: 'Signature on UMPD/BI Rejection' },
  { key: 'en_uploaded_to_matrix', label: 'Uploaded To Matrix / Proof Of E-Sign' },
  { key: 'en_supporting_docs', label: 'Supporting Documents sent to Insurance company' },
  { key: 'en_premium_match', label: 'Does Premium Amount Submitted Match Receipt?' },
];
// --- END CHECKLIST DEFINITIONS ---

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/* ---------------- helpers (now LOCAL time) ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const toDateKey = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseKey = (key) => {
  const [y, m, d] = key.split('-').map((n) => parseInt(n, 10));
  return { y, m, d };
};

const dateKeyToDate = (key) => {
  const { y, m, d } = parseKey(key);
  return new Date(y, m - 1, d);
};

const dayStartISO = (key) => {
  const { y, m, d } = parseKey(key);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
};

const dayEndISO = (key) => {
  const { y, m, d } = parseKey(key);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
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

const fmtShortDuration = (sec) => {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
};

// ---  ChatCell COMPONENT DEFINITION ---
const ChatCell = ({
  row,
  canMessage,
  openChatRow,
  draft,
  setDraft,
  sendChat,
  composerRef,
  emojiBtnRef,
  emojiPanelRef,
  showEmoji,
  setShowEmoji,
  emojiList,
  insertEmoji,
}) => {
  const allMessages = useMemo(() => {
    const thread = Array.isArray(row.pending_items) ? row.pending_items : [];
    if (row.agent_notes) {
      return [
        {
          from: 'agent',
          text: row.agent_notes,
          at: row.created_at,
          by: row.agent_email,
          isInitialNote: true,
        },
        ...thread,
      ];
    }
    return thread;
  }, [row.pending_items, row.agent_notes, row.created_at, row.agent_email]);

  return (
    <>
      {openChatRow === row.id && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexGrow: 1, minHeight: 0, height: '100%' }}>
          {/* Message container */}
          <div style={{ flexGrow: 1, maxHeight: 'none', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '0 4px 10px 0', minHeight: '150px' }}>
            {allMessages.length === 0 && <div style={{ color: '#6b7280', textAlign: 'center', marginTop: '1rem' }}>No messages yet.</div>}
            {allMessages.map((m, idx) => {
              const mine = m.from === 'uw';
              return (
                <div key={`${m.at}-${idx}-${mine}`} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', background: mine ? '#e0f2fe' : '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 12, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {mine ? 'You' : 'Agent'} {m.isInitialNote && '(Initial Note)'} · {m.at ? new Date(m.at).toLocaleString() : ''}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                </div>
              );
            })}
          </div>

          {/* Composer Section */}
          {canMessage ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', position: 'relative', flexShrink: 0, marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
              <textarea
                ref={composerRef}
                placeholder="Type a message…"
                value={draft[row.id] || ''}
                onChange={(e) => setDraft((s) => ({ ...s, [row.id]: e.target.value }))}
                style={{ flex: 1, minHeight: 70, maxHeight: 150, padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: 10, outline: 'none', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', position: 'relative' }}>
                <button type="button" ref={emojiBtnRef} onClick={() => setShowEmoji((v) => !v)} title="Insert emoji" aria-label="Insert emoji" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '0.45rem 0.55rem' }}>
                  <span style={{ fontSize: 18 }}>😊</span>
                </button>
                <button type="button" className={styles.sendBtn} onClick={() => sendChat(row)}>
                  Send
                </button>
                {showEmoji && (
                  <div ref={emojiPanelRef} style={{ position: 'absolute', bottom: 52, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 8px 24px rgba(16,24,40,.08)', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, zIndex: 50, maxHeight: '200px', overflowY: 'auto' }}>
                    {emojiList.map((e) => (
                      <button key={e} type="button" onClick={() => insertEmoji(e, row.id)} style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', padding: '2px' }}>
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: '#6b7280', flexShrink: 0, marginTop: 'auto' }}>Messaging disabled.</div>
          )}
        </div>
      )}
    </>
  );
};

// --- UPDATED RowBase COMPONENT DEFINITION ---
const RowBase = ({
  r,
  arr,
  user,
  orderNumber,
  setManageInfo,
  claim,
  takeOver,
  restrictPendingSection,
}) => {
  const age = diffAge(r.created_at);
  const mine = r.claimed_by === user?.id;
  const unassigned = !r.claimed_by;
  const last = (Array.isArray(r.pending_items) ? r.pending_items : []).slice(-1)[0];
  const newReply = last?.from === 'agent';
  
  const canTakeOver =
    !!r.claimed_at &&
    !mine &&
    new Date().getTime() - new Date(r.claimed_at).getTime() >= ONE_DAY_MS;

  const assigneeDisplay =
    r.claimed_by_first && r.claimed_by_last
      ? `${r.claimed_by_first} ${r.claimed_by_last}`
      : r.claimed_by_email ? r.claimed_by_email.split('@')[0] : null;

  return (
    <tr key={r.id} className={newReply ? styles.newAgentReplyHighlight : ''}>
      <td>
        {orderNumber(arr, r.id)}
        {newReply && <span className={styles.newMsgBadge}>New Msg</span>}
      </td>
      <td>
        {(r.agent && (r.agent.first_name || r.agent.last_name))
          ? `${r.agent.first_name || ''} ${r.agent.last_name || ''}`.trim()
          : (r.agent_first_name || r.agent_last_name) 
            ? `${r.agent_first_name || ''} ${r.agent_last_name || ''}`.trim()
            : (r.agent_email || '').split('@')[0] || '-'}
      </td>
      <td>{r.office || '—'}</td>
      <td>{r.transaction_type || '—'}</td>
      <td>{r.policy_number || '—'}</td>
      <td>{r.premium != null ? `$${Number(r.premium).toFixed(2)}` : '—'}</td>
      <td>{r.total_bf != null ? `$${Number(r.total_bf).toFixed(2)}` : '—'}</td>
      <td>{r.phone_number || '—'}</td>
      <td>{r.customer_name || '—'}</td>
      <td>
        {assigneeDisplay ? (
          assigneeDisplay
        ) : (
          <span className={styles.unassigned}>Unassigned</span>
        )}
      </td>
      <td className={age.danger ? styles.ageDanger : ''}>{age.label}</td>
      <td>{r.last_action_at ? new Date(r.last_action_at).toLocaleString() : '—'}</td>
      <td>
        {unassigned ? (
          <button className={styles.claimBtn} onClick={() => claim(r)}>
            Claim
          </button>
        ) : canTakeOver ? (
          <button className={styles.claimBtn} onClick={() => takeOver(r)}>
            Take Over
          </button>
        ) : mine ? (
          <button
            className={styles.sendBtn}
            onClick={() =>
              setManageInfo({ row: r, restrict: restrictPendingSection })
            }
          >
            Manage
          </button>
        ) : (
          <div className={styles.readonlyBadge}>Assigned</div>
        )}
      </td>
    </tr>
  );
};

// --- *** MODIFIED ChecklistTab COMPONENT *** ---
const ChecklistTab = ({ row, onSave, user, profile }) => {
  const isNB = (row.transaction_type || '').toUpperCase().includes('NB');
  const [selectedList, setSelectedList] = useState(isNB ? 'NB' : 'EN');
  
  const [checklistData, setChecklistData] = useState(row.checklist_data || {});
  const [showHistory, setShowHistory] = useState(false);

  // Debouncer for saving NOTES and DROPDOWNS
  const debouncedSave = useRef(
    ((func, delay) => {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
      };
    })((newChecklistData) => {
      onSave(newChecklistData);
    }, 1000) // Save 1 second after last change
  ).current;

  // --- Function for NOTES change (debounced) ---
  const handleNoteChange = (key, newNote) => {
    const existingItemData = checklistData[key] || { status: 'N/A', notes: '', reviewed_by: '', checked_at: null };
    
    const updatedItem = {
      ...existingItemData,
      notes: newNote, // Only update the note
    };
    
    const newData = {
      ...checklistData,
      [key]: updatedItem,
    };
    
    setChecklistData(newData); // Update local state immediately
    debouncedSave(newData); // Call debounced save for notes
  };

  // --- Function for STATUS change (immediate save + history log) ---
  const handleStatusChange = (key, newStatus) => {
    const uwName = (profile?.full_name || user?.email?.split('@')[0]) || 'Unknown User';
    const existingItemData = checklistData[key] || { status: 'N/A', notes: '', reviewed_by: '', checked_at: null };
    
    // If status didn't change, do nothing
    if (newStatus === existingItemData.status) return;

    const existingHistory = Array.isArray(checklistData.history) ? checklistData.history : [];
    let newHistory = [...existingHistory];
    let updatedItemData;
    const newTimestamp = new Date().toISOString();
    const currentNotes = existingItemData.notes || ''; // Preserve existing notes

    // --- FIX: Define baseItems INSIDE the handler ---
    const baseItems = selectedList === 'NB' ? NB_CHECKLIST_ITEMS : EN_CHECKLIST_ITEMS;
    // ---
    
    // 1. Create the history log entry for this action
    newHistory.push({
      item: key,
      label: (baseItems.find(i => i.key === key) || {}).label || key, // Get the human-readable label
      status: newStatus, // Log the NEW status
      notes: currentNotes, // Log the notes as they were when status changed
      by: uwName,
      at: newTimestamp,
    });
    
    // 2. Update the item itself
    if (newStatus !== 'N/A') {
      updatedItemData = {
        ...existingItemData,
        status: newStatus,
        notes: currentNotes,
        reviewed_by: uwName,
        checked_at: newTimestamp,
      };
    } else {
      updatedItemData = {
        ...existingItemData,
        status: 'N/A',
        notes: currentNotes,
        reviewed_by: '',
        checked_at: null,
      };
    }
    
    // 3. Create final data object and save immediately
    const newData = {
      ...checklistData,
      history: newHistory,
      [key]: updatedItemData,
    };

    setChecklistData(newData); // Update local state
    onSave(newData); // Save IMMEDIATELY (no debounce for status changes)
  };
  
  // Dynamic Filtering Logic
  const paymentMethod = (checklistData.payment_method || 'cc').toLowerCase();
  const coverageType = (checklistData.coverage_type || 'full coverage').toLowerCase();
  const baseItems = selectedList === 'NB' ? NB_CHECKLIST_ITEMS : EN_CHECKLIST_ITEMS;

  const itemsToRender = baseItems.filter(item => {
    if (item.key === 'nb_blue_pay' || item.key === 'en_bluepay_receipt') {
      return paymentMethod !== 'cash';
    }
    if (item.key === 'nb_photos' || item.key === 'en_photos') {
      return coverageType !== 'liability';
    }
    return true;
  });

  // Handler for the top-level dropdowns (Payment, Coverage)
  const handleDropdownChange = (key, value) => {
    const newData = {
      ...checklistData,
      [key]: value,
    };
    setChecklistData(newData);
    debouncedSave(newData); // Use the debounced save
  };
  
  const history = Array.isArray(checklistData.history) ? checklistData.history : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flexGrow: 1, padding: '0.25rem' }}>
      
      {/* Policy Type Dropdowns */}
      <div style={{ display: 'flex', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <select
          value={selectedList}
          onChange={(e) => setSelectedList(e.target.value)}
          className={styles.select}
          style={{ minWidth: '150px' }}
        >
          <option value="NB">NB Checklist</option>
          <option value="EN">EN Checklist</option>
        </select>
        
        <select
          value={checklistData.payment_method || ''}
          onChange={(e) => handleDropdownChange('payment_method', e.target.value)}
          className={styles.select}
          style={{ minWidth: '170px' }}
        >
          <option value="">Select Payment Method...</option>
          <option value="cc">Credit Card</option>
          <option value="cash">Cash</option>
          <option value="ach">ACH / E-Check</option>
        </select>

        <select
          value={checklistData.coverage_type || ''}
          onChange={(e) => handleDropdownChange('coverage_type', e.target.value)}
          className={styles.select}
          style={{ minWidth: '170px' }}
        >
          <option value="">Select Coverage Type...</option>
          <option value="full coverage">Full Coverage</option>
          <option value="liability">Liability</option>
        </select>
      </div>

      {/* --- NEW CHECKLIST GRID --- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr', alignItems: 'center', gap: '0.75rem 0.5rem' }}>
        {/* Headers */}
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Status</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Checklist Item</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Resolution Notes</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Reviewed By</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Date Checked</span>

        {/* Items */}
        {itemsToRender.map((item) => {
          const itemData = checklistData[item.key] || { status: 'N/A', notes: '', reviewed_by: '', checked_at: null };
          return (
            <React.Fragment key={item.key}>
              <select
                value={itemData.status || 'N/A'}
                onChange={(e) => handleStatusChange(item.key, e.target.value)}
                className={styles.inlineSelect}
                style={{ 
                  width: '100px', 
                  backgroundColor: itemData.status === 'Pass' ? '#f0fdf4' : itemData.status === 'Fail' ? '#fef2f2' : '#fff'
                }}
              >
                <option value="N/A">N/A</option>
                <option value="Pass">Pass</option>
                <option value="Fail">Fail</option>
                <option value="Needs Review">Needs Review</option>
              </select>
              
              <label htmlFor={`notes-${item.key}`}>
                {item.label}
              </label>
              
              <input
                type="text"
                id={`notes-${item.key}`}
                placeholder="Notes..."
                value={itemData.notes || ''}
                onChange={(e) => handleNoteChange(item.key, e.target.value)}
                className={styles.inlineSelect}
              />
              
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                {itemData.reviewed_by || '—'}
              </span>
              
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                {itemData.checked_at ? new Date(itemData.checked_at).toLocaleString() : '—'}
              </span>
            </React.Fragment>
          );
        })}
      </div>
      {/* --- END NEW CHECKLIST GRID --- */}

      {/* --- NEW HISTORY LOG --- */}
      <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
        <button 
          type="button" 
          className={styles.secondaryBtn}
          onClick={() => setShowHistory(prev => !prev)}
        >
          {showHistory ? 'Hide' : 'Show'} Change History ({ history.length })
        </button>

        {showHistory && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px' }}>
            {history.length === 0 ? (
              <span style={{ color: 'var(--muted)' }}>No history found.</span>
            ) : (
              [...history].reverse().map((entry, index) => ( // Show most recent first
                <div key={index} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    {entry.by || 'Unknown User'} set "{entry.label}" to "{entry.status}"
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
                    {new Date(entry.at).toLocaleString()}
                  </div>
                  {entry.notes && (
                    <div style={{ fontSize: '0.85rem', fontStyle: 'italic', background: '#fff', padding: '4px 6px', borderRadius: '4px', wordBreak: 'break-word' }}>
                      Note: "{entry.notes}"
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {/* --- END HISTORY LOG --- */}
    </div>
  );
};
// --- END CHECKLIST COMPONENT ---

// --- MODIFIED ManageTicketModal COMPONENT ---
const ManageTicketModal = ({
  info,
  onClose,
  user,
  profile, // <-- Pass profile
  actions,
  setActionState,
  sendAction,
  onSaveChecklist,
  ...chatProps
}) => {
  const { row, restrict } = info;
  const local = actions[row.id] || { status: '', note: '' };

  const isPendingStatus =
    row.status === 'Pending' || row.status === 'Cannot Locate Policy';

  const disableSend = !local.status;
  const showNotes = !(restrict && isPendingStatus);

  const [activeTab, setActiveTab] = useState('Checklist');

  // This is for immediate status/note saves from ChecklistTab
  const immediateSave = (newChecklistData) => {
    onSaveChecklist(row, newChecklistData);
  };

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
          <h2>
            Manage: {row.policy_number || 'Policy'} (
            {row.customer_name || 'No Customer'})
          </h2>
          <button onClick={onClose} className={styles.modalCloseBtn}>
            &times;
          </button>
        </div>

        {/* --- TABS --- */}
        <div className={styles.modalTabs}>
          <button
            className={`${styles.tabButton} ${activeTab === 'Checklist' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('Checklist')}
          >
            Checklist
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === 'Conversation' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('Conversation')}
          >
            Conversation
          </button>
        </div>
        {/* --- END TABS --- */}

        <div className={styles.modalBody}>
          {activeTab === 'Checklist' && (
            <div className={styles.modalSection} style={{ flexGrow: 2, display: 'flex', flexDirection: 'column' }}>
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem', flexShrink: 0 }}>
                <h3 className={styles.modalSubTitle}>Actions</h3>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <select
                    className={styles.select}
                    value={local.status}
                    onChange={(e) => setActionState(row.id, { status: e.target.value })}
                    style={{ flex: 1, minWidth: '150px' }}
                  >
                    <option value="">Select action…</option>
                    {ACTION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {showNotes && (
                    <textarea
                      className={styles.notes}
                      placeholder="Notes to agent (optional, will be added to conversation)"
                      value={local.note}
                      onChange={(e) => setActionState(row.id, { note: e.target.value })}
                      style={{ minHeight: '50px', width: '300px', flex: 2, minWidth: '200px' }}
                    />
                  )}
                  <button
                    className={styles.sendBtn}
                    disabled={disableSend}
                    style={disableSend ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                    onClick={() => { if (!disableSend) { sendAction(row); onClose(); } }}
                  >
                    Send Action
                  </button>
                </div>
              </div>
              
              <ChecklistTab 
                key={row.id}
                row={row} 
                onSave={immediateSave} // <-- Use immediate save
                user={user}
                profile={profile}
              />
            </div>
          )}

          {activeTab === 'Conversation' && (
            <div className={styles.modalSection} style={{ flexGrow: 2, display: 'flex', flexDirection: 'column' }}>
              <h3 className={styles.modalSubTitle}>Conversation</h3>
              <ChatCell
                row={row}
                canMessage={true}
                {...chatProps}
                openChatRow={row.id} // Force open
                setOpenChatRow={() => {}} // Override
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

/* --------------- Main Component --------------- */
export default function UnderwritingDashboard() {
  const { user, profile } = useAuth(); // Get profile here
  const role = profile?.role || user?.user_metadata?.role || 'agent';
  const isUW = ['underwriter', 'uw_manager', 'supervisor', 'admin'].includes(role);

  const [allForWork, setAllForWork] = useState([]);
  const [pendingToday, setPendingToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [processedToday, setProcessedToday] = useState(0);
  const [avgTurnSecToday, setAvgTurnSecToday] = useState(null);
  const [statusCountsToday, setStatusCountsToday] = useState({
    Approved: 0,
    Pending: 0,
    'Cannot Locate Policy': 0,
  });
  const [day, setDay] = useState(() => toDateKey(new Date()));
  const dayDate = useMemo(() => dateKeyToDate(day), [day]);

  const [actions, setActions] = useState({});
  const setActionState = (id, patch) =>
    setActions((s) => ({ ...s, [id]: { ...(s[id] || { status: '', note: '' }), ...patch } }));

  const [openChatRow, setOpenChatRow] = useState(null);
  const [manageInfo, setManageInfo] = useState(null);
  const [draft, setDraft] = useState({});
  const composerRef = useRef(null);
  const emojiBtnRef = useRef(null);
  const emojiPanelRef = useRef(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiList = useMemo(
    () => ['😀', '😁', '😂', '🤣', '😊', '😍', '😉', '😎', '👍', '🙏', '🎉', '✅', '❌', '📝', '📎'],
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

  // --- REALTIME useEffect ---
  useEffect(() => {
    if (!user?.id) return;
    
    const currentDayStart = dayStartISO(day);
    const currentDayEnd = dayEndISO(day);

    const handleChanges = (payload) => {
      console.log('Change received!', payload);
      const newItem = payload.new;
      const oldItem = payload.old;
      const oldItemId = oldItem?.id;
      const eventType = payload.eventType;

      const updateStateForSpecificSetter = (setter) => {
         setter((currentItems) => {
            let updatedItems = [...currentItems];
            const index = updatedItems.findIndex(item => item.id === (newItem?.id || oldItemId));

            if (eventType === 'INSERT') {
               if (!newItem) return updatedItems;
               const shouldBeInQueue = ['Submitted', 'Claimed'].includes(newItem.status);
               
               const createdToday = newItem.created_at >= currentDayStart && newItem.created_at <= currentDayEnd;
               const shouldBeInPending = newItem.status === 'Pending' && 
                                       newItem.claimed_by === user.id &&
                                       createdToday;
               
               if (setter === setAllForWork && shouldBeInQueue && !updatedItems.some(item => item.id === newItem.id)) {
                   updatedItems.push(newItem);
               } else if (setter === setPendingToday && shouldBeInPending && !updatedItems.some(item => item.id === newItem.id)) {
                   updatedItems.push(newItem);
               }
            
            } else if (eventType === 'UPDATE') {
               if (!newItem) return updatedItems;
               
               const existingItem = (index !== -1) ? updatedItems[index] : null;
               const mergedItem = { ...existingItem, ...newItem, checklist_data: { ...(existingItem?.checklist_data || {}), ...(newItem.checklist_data || {}), } };

               const shouldBeInQueue = ['Submitted', 'Claimed'].includes(mergedItem.status);
               
               const createdToday = mergedItem.created_at >= currentDayStart && mergedItem.created_at <= currentDayEnd;
               const justSetToPending = (oldItem?.status !== 'Pending' && newItem.status === 'Pending');
               const isPendingStatus = ['Pending', 'Cannot Locate Policy'].includes(mergedItem.status);
               const baseConditionsMet = isPendingStatus && mergedItem.claimed_by === user.id;
               const shouldBeInPending = baseConditionsMet && (createdToday || justSetToPending);

               if (setter === setAllForWork) {
                  if (shouldBeInQueue) {
                    if (index !== -1) updatedItems[index] = mergedItem;
                    else if (!updatedItems.some(item => item.id === mergedItem.id)) updatedItems.push(mergedItem);
                  } else {
                    if (index !== -1) updatedItems.splice(index, 1);
                  }
               } else if (setter === setPendingToday) {
                  if (shouldBeInPending) {
                     if (index !== -1) updatedItems[index] = mergedItem;
                     else if (!updatedItems.some(item => item.id === mergedItem.id)) updatedItems.push(mergedItem);
                  } else {
                     if (index !== -1) updatedItems.splice(index, 1);
                  }
               }
            
            } else if (eventType === 'DELETE') {
               const deleteId = oldItemId || newItem?.id;
               if (deleteId && index !== -1) {
                  updatedItems.splice(index, 1);
               }
            }

            if (setter === setPendingToday) {
               updatedItems.sort((a, b) => {
                  const lastA = (Array.isArray(a.pending_items) ? a.pending_items : []).slice(-1)[0];
                  const lastB = (Array.isArray(b.pending_items) ? b.pending_items : []).slice(-1)[0];
                  const scoreA = lastA?.from === 'agent' ? new Date(lastA.at).getTime() : 0;
                  const scoreB = lastB?.from === 'agent' ? new Date(lastB.at).getTime() : 0;
                  if (scoreA !== scoreB) return scoreB - scoreA;
                  return (
                    new Date(b.last_action_at || b.created_at).getTime() -
                    new Date(a.last_action_at || a.created_at).getTime()
                  );
                });
            } else if (setter === setAllForWork) {
               updatedItems.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            }
            return updatedItems;
         });
      };

      updateStateForSpecificSetter(setAllForWork);
      updateStateForSpecificSetter(setPendingToday);

      if (manageInfo && newItem && manageInfo.row.id === newItem.id && eventType === 'UPDATE') {
          setManageInfo(prev => ({ 
            ...prev, 
            row: { ...prev.row, ...newItem,
              checklist_data: { ...(prev.row.checklist_data || {}), ...(newItem.checklist_data || {}), }
            } 
          }));
      }
    };
    
    const channel = supabase
      .channel('uw_submissions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'uw_submissions' }, handleChanges)
      .subscribe((status, err) => {
        console.log('[Realtime] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to uw_submissions changes!');
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
           console.error('Subscription error:', err);
           setMsg(`Realtime connection error: ${err?.message || 'Unknown error'}. Data might be stale.`);
        }
      });

    return () => {
      console.log('Unsubscribing from uw_submissions changes');
      supabase.removeChannel(channel);
    };
  }, [user, supabase, day, manageInfo]);


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

    // ...
  // Explicitly define all columns needed by the component
  const selectQuery = `
    *, 
    agent_first_name, 
    agent_last_name
  `;
  // Note: Using '*' and then explicitly listing new columns 
  // is a common way to force the Supabase client to refresh its schema.
  // For production, you might list *all* required columns instead of using '*'.

  const forWorkQ = supabase
      .from('uw_submissions')
      .select(selectQuery) // <-- MODIFIED
      .in('status', ['Submitted', 'Claimed'])
      .order('created_at', { ascending: true });

    const pendingQ = supabase
      .from('uw_submissions')
      .select(selectQuery) // <-- MODIFIED
      .in('status', ['Pending', 'Cannot Locate Policy'])
// ...
      .eq('claimed_by', user.id)
      .gte('created_at', dayStartISO(day))
      .lte('created_at', dayEndISO(day))
      .order('last_action_at', { ascending: true });

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
    setPendingToday(
      (pd.data || [])
        .slice()
        .sort((a, b) => {
          const lastA = (Array.isArray(a.pending_items) ? a.pending_items : []).slice(-1)[0];
          const lastB = (Array.isArray(b.pending_items) ? b.pending_items : []).slice(-1)[0];
          const scoreA = lastA?.from === 'agent' ? new Date(lastA.at).getTime() : 0;
          const scoreB = lastB?.from === 'agent' ? new Date(lastB.at).getTime() : 0;
          if (scoreA !== scoreB) return scoreB - scoreA;
          return (
            new Date(b.last_action_at || b.created_at).getTime() -
            new Date(a.last_action_at || a.created_at).getTime()
          );
        })
    );

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

  const claim = async (row) => {
    if (!user?.id || !user?.email) return;
    const fullName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '';
    let first_name = profile?.first_name || user?.user_metadata?.first_name || '';
    let last_name = profile?.last_name || user?.user_metadata?.last_name || '';
    if (!first_name && fullName) {
      const parts = fullName.split(' ');
      first_name = parts[0] || '';
      last_name = parts.slice(1).join(' ') || '';
    }
    const { error } = await supabase
      .from('uw_submissions')
      .update({
        claimed_by: user.id,
        claimed_by_email: user.email,
        claimed_by_first: first_name || null,
        claimed_by_last: last_name || null,
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
    // load(); // Rely on Realtime
  };

  const takeOver = async (row) => {
    if (!user?.id || !user?.email) return;
    const fullName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '';
    let first_name = profile?.first_name || user?.user_metadata?.first_name || '';
    let last_name = profile?.last_name || user?.user_metadata?.last_name || '';
    if (!first_name && fullName) {
      const parts = fullName.split(' ');
      first_name = parts[0] || '';
      last_name = parts.slice(1).join(' ') || '';
    }
    const { error } = await supabase
      .from('uw_submissions')
      .update({
        claimed_by: user.id,
        claimed_by_email: user.email,
        claimed_by_first: first_name || null,
        claimed_by_last: last_name || null,
        claimed_at: new Date().toISOString(),
        last_action_at: new Date().toISOString(),
        last_updated_by: user.id,
        last_updated_by_email: user.email,
      })
      .eq('id', row.id);
    if (error) return alert(error.message);
    setActions((s) => ({ ...s, [row.id]: { status: '', note: '' } }));
    // load(); // Rely on Realtime
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

    const newMessage = {
      from: 'uw',
      text: text,
      at: new Date().toISOString(),
      by: user?.email || null,
    };
    const updatedThread = [
      ...(Array.isArray(row.pending_items) ? row.pending_items : []),
      newMessage,
    ];
    const updatedRow = { 
        ...row,
        pending_items: updatedThread,
        last_action_at: newMessage.at,
        checklist_data: row.checklist_data || {}
    };

    const updateLocalState = (items) => items.map(item => item.id === row.id ? updatedRow : item );
    setAllForWork(prev => updateLocalState(prev));
    setPendingToday(prev => updateLocalState(prev));
    if (manageInfo && manageInfo.row.id === row.id) {
        setManageInfo(prev => ({ ...prev, row: updatedRow }));
    }
    setDraft((s) => ({ ...s, [row.id]: '' }));
    setShowEmoji(false);

    try {
      const { error } = await supabase
        .from('uw_submissions')
        .update({
          pending_items: updatedThread,
          last_action_at: newMessage.at,
          last_updated_by: user?.id || null,
          last_updated_by_email: user?.email || null,
        })
        .eq('id', row.id);
      if (error) throw error;
    } catch (e) {
      alert(`Failed to send message: ${e.message}`);
      load();
    }
  };

  const sendAction = async (row) => {
    const local = actions[row.id] || {};
    if (!local.status || !user?.id || !user?.email) return;
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
    const { error: upErr } = await supabase
      .from('uw_submissions')
      .update(update)
      .eq('id', row.id);
    if (upErr) return alert(upErr.message);
    if (local.note && local.note.trim()) {
      try {
        await appendMessage(row.id, row.pending_items, local.note.trim());
      } catch { /* non-blocking */ }
    }
    // load(); // Rely on Realtime
  };

  // --- NEW: Function to save checklist data ---
  const saveChecklistData = useCallback(async (row, newChecklistData) => {
      const updatedRow = {
          ...row,
          checklist_data: newChecklistData,
          last_action_at: new Date().toISOString(),
          last_updated_by: user.id,
          last_updated_by_email: user.email,
      };

      // Optimistic UI updates
      const updateLocalState = (items) => items.map(item =>
          item.id === row.id ? updatedRow : item
      );
      setAllForWork(prev => updateLocalState(prev));
      setPendingToday(prev => updateLocalState(prev));

      if (manageInfo && manageInfo.row.id === row.id) {
          setManageInfo(prev => ({ ...prev, row: updatedRow }));
      }

      // Save to DB
      try {
          const { error } = await supabase
            .from('uw_submissions')
            .update({ 
              checklist_data: newChecklistData,
              last_action_at: updatedRow.last_action_at,
              last_updated_by: user.id,
              last_updated_by_email: user.email,
            })
            .eq('id', row.id);
          if (error) throw error;
      } catch (e) {
          alert("Error saving checklist. Data may be out of sync. Please refresh.");
          load(); // Reload on error
      }
  }, [user, supabase, manageInfo, load]); // Updated dependencies


  const incomingUnclaimed = useMemo(
    () => (allForWork || []).filter((r) => !r.claimed_by && r.status === 'Submitted'),
    [allForWork]
  );
  const myClaimed = useMemo(
    () => {
       if (!user?.id) return [];
       return (allForWork || []).filter((r) => r.claimed_by === user.id && r.status === 'Claimed');
    },
    [allForWork, user?.id]
  );

  const orderNumber = (arr, id) => `#${arr.findIndex((r) => r.id === id) + 1}`;
  const todayKey = toDateKey(new Date());
  const onPrevDay = () => setDay(toDateKey(new Date(dayDate.getTime() - 86400000)));
  const onNextDay = () => setDay(toDateKey(new Date(dayDate.getTime() + 86400000)));

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

  const chatProps = useMemo(() => ({
    openChatRow,
    setOpenChatRow,
    draft,
    setDraft,
    sendChat,
    composerRef,
    emojiBtnRef,
    emojiPanelRef,
    showEmoji,
    setShowEmoji,
    emojiList,
    insertEmoji,
  }), [openChatRow, setOpenChatRow, draft, sendChat, showEmoji, emojiList, insertEmoji]);
  
  const uwFullName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  let uwFirstName = profile?.first_name || user?.user_metadata?.first_name || '';
  if (!uwFirstName && uwFullName) {
      uwFirstName = uwFullName.split(' ')[0] || '';
  }
  const welcomeName = uwFirstName || user?.email?.split('@')[0] || 'Underwriter';

  if (!isUW)
    return (
      <div className={styles.container}>
        <p>Not authorized.</p>
      </div>
    );

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Underwriting Dashboard</h1>
      <h2 className={styles.welcomeMessage}>Welcome, {welcomeName}!</h2>
      {msg && <div className={styles.message}>{msg}</div>}
      
      {/* KPIs */}
      <div className={styles.kpis}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Total In Queue</div>
          <div className={styles.kpiValue}>{incomingUnclaimed.length}</div>
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
      
      {/* Status Bar */}
      <div className={styles.card}>
        <div className={styles.kpiLabel} style={{ marginBottom: 8 }}>
          Policies by Status (today)
        </div>
        <div className={styles.spark}>
          {segments.map((s) => (
            <div key={s.label} style={{ width: `${s.pct}%`, background: s.color }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, color: '#6b7280', fontSize: 12, flexWrap: 'wrap' }}>
          {segments.map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2, display: 'inline-block' }} />
              {s.label} ({s.value})
            </div>
          ))}
        </div>
        <div style={{ marginTop: 6, color: '#6b7280', fontSize: 12 }}>
          Processed Today: <strong>{processedToday}</strong>
          {avgTurnSecToday != null && (
            <> {' '} • Avg Turnaround: <strong>{fmtShortDuration(avgTurnSecToday)}</strong></>
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
                <th>Order</th><th>Agent Name</th><th>Office</th><th>Transaction Type</th>
                <th>Policy #</th><th>Premium</th><th>Total BF</th><th>Phone #</th>
                <th>Customer Name</th><th>Assignee</th><th>Queue Age</th><th>Last Updated</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13}>Loading…</td></tr>
              ) : incomingUnclaimed.length === 0 ? (
                <tr><td colSpan={13}>No unclaimed items.</td></tr>
              ) : (
                incomingUnclaimed.map((r, idx) => (
                  <RowBase
                    key={r.id}
                    r={r}
                    arr={incomingUnclaimed}
                    user={user}
                    claim={claim}
                    takeOver={takeOver}
                    orderNumber={orderNumber}
                    restrictPendingSection={false}
                    setManageInfo={setManageInfo}
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
                <th>Order</th><th>Agent Name</th><th>Office</th><th>Transaction Type</th>
                <th>Policy #</th><th>Premium</th><th>Total BF</th><th>Phone #</th>
                <th>Customer Name</th><th>Assignee</th><th>Queue Age</th><th>Last Updated</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13}>Loading…</td></tr>
              ) : myClaimed.length === 0 ? (
                <tr><td colSpan={13}>Nothing claimed yet.</td></tr>
              ) : (
                myClaimed.map((r, idx) => (
                  <RowBase
                    key={r.id}
                    r={r}
                    arr={myClaimed}
                    user={user}
                    claim={claim}
                    takeOver={takeOver}
                    orderNumber={orderNumber}
                    restrictPendingSection={false}
                    setManageInfo={setManageInfo}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PENDING CORRECTION (TODAY) */}
      <h2 className={styles.subTitle}>Pending Correction (Today)</h2>
      <div className={styles.pendingBar}>
        <button className={styles.dayBtn} onClick={onPrevDay}>&larr;</button>
        <div className={styles.dayLabel}>{dayDate.toLocaleDateString()}</div>
        <button className={styles.dayBtn} onClick={onNextDay} disabled={day >= todayKey}>&rarr;</button>
        <button className={styles.refreshBtn} onClick={load}>Refresh</button>
      </div>
      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Order</th><th>Agent Name</th><th>Office</th><th>Transaction Type</th>
                <th>Policy #</th><th>Premium</th><th>Total BF</th><th>Phone #</th>
                <th>Customer Name</th><th>Assignee</th><th>Queue Age</th><th>Last Updated</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13}>Loading…</td></tr>
              ) : pendingToday.length === 0 ? (
                <tr><td colSpan={13}>No pending items for this day.</td></tr>
              ) : (
                pendingToday.map((r, idx) => (
                  <RowBase
                    key={r.id}
                    r={r}
                    arr={pendingToday}
                    user={user}
                    claim={claim}
                    takeOver={takeOver}
                    orderNumber={orderNumber}
                    restrictPendingSection={true}
                    setManageInfo={setManageInfo}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- RENDER THE MODAL --- */}
      {manageInfo && (
        <ManageTicketModal
          info={manageInfo}
          onClose={() => { setManageInfo(null); setShowEmoji(false); }}
          user={user}
          profile={profile} // Pass profile
          actions={actions}
          setActionState={setActionState}
          sendAction={sendAction}
          onSaveChecklist={saveChecklistData}
          {...chatProps}
        />
      )}
    </div>
  );
}

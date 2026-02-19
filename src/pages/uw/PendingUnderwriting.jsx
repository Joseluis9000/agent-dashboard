// src/pages/uw/PendingUnderwriting.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../supabaseClient';
import styles from './UnderwritingDashboard.module.css'; // Reuse dashboard styles

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
  { key: 'nb_marriage_cert', label: "Marriage Certificate (If req'd)" },
  { key: 'nb_pos', label: 'Point of Sale (POS) Form' },
  { key: 'nb_esign_cert', label: 'E-Sign Certificate (If Phone)' },
  { key: 'nb_itc_quote', label: 'ITC Quote Breakdown' },
  { key: 'nb_carrier_upload', label: "Docs Uploaded to Carrier (If req'd)" },
  { key: 'nb_matrix_alert', label: 'Matrix Alert Set for Missing Items' },
];

const EN_CHECKLIST_ITEMS = [
  { key: 'en_matrix_receipt', label: 'Matrix Receipt Signed' },
  { key: 'en_bluepay_receipt', label: 'Bluepay Receipt (if any)' }, // Conditional
  { key: 'en_change_request', label: 'Company Docs / Change Request' },
  { key: 'en_missing_docs', label: 'Missing Endorsement Documents' },
  { key: 'en_title_reg', label: 'Title / Registration / Sales Contract' },
  { key: 'en_license_id', label: 'License / Matricula / ID' },
  { key: 'en_photos', label: 'Photos' }, // Conditional
  { key: 'en_excluded_owners', label: 'Excluded Registered Owner / Household Members' },
  { key: 'nb_household', label: 'Household Members Verified (Initials)' }, // Re-using nb_household key
  { key: 'umpd_bi', label: 'Signature on UMPD/BI Rejection' }, // Re-using umpd_bi key
  { key: 'en_uploaded_to_matrix', label: 'Uploaded To Matrix / Proof Of E-Sign' },
  { key: 'en_supporting_docs', label: 'Supporting Docs sent to Insurance co' },
  { key: 'en_premium_match', label: 'Premium Submitted Matches Receipt' },
];

const TAX_CHECKLIST_ITEMS = [
  // --- 1. IDENTITY & DOCS ---
  { key: 'tax_uploads', label: 'All Docs Uploaded (ID, SSN, Income, 8879, Consent)' },
  { key: 'tax_matrix_receipt', label: 'Agency Matrix Receipt Created?' }, // <--- ADDED
  { key: 'tax_pii_match', label: 'PII Match: Name/DOB/SSN match ID Cards exactly?' },
  { key: 'tax_dep_match', label: 'Dependents: Names/DOBs match SSN Cards?' },

  // --- 2. INCOME & HEALTHCARE ---
  { key: 'tax_w2_match', label: 'W-2 Entry Matches Scan?' },
  { key: 'tax_overtime_match', label: 'Overtime Amount matches YTD on Paystub?' },
  { key: 'tax_tips_match', label: 'Tips Amount matches Paystub?' },
  { key: 'tax_healthcare', label: 'Healthcare: Did Agent select YES/NO for Covered CA?' },

  // --- 3. COMPLIANCE ---
  { key: 'tax_8867_dd', label: 'Form 8867 (Due Diligence) 100% Complete?' },
  { key: 'tax_credits_proof', label: 'Credits (CTC/EITC/AOTC): Proof Docs Uploaded?' },
  { key: 'tax_vehicle_credit', label: 'New Vehicle Credit: Document/Purchase Agreement present?' },

  // --- 4. BANK PRODUCT - GENERAL ---
  { key: 'tax_bank_selection', label: 'Bank Selection: Matches Client Request (RT vs Advance)?', isBank: true },

  // --- 5. ADVANCE SPECIFIC (The "Red" Flags) ---
  { key: 'tax_bank_delivery', label: 'Delivery: SBTPG Fast Cash Advance w/ DD or Check', isAdvanceCritical: true },
  { key: 'tax_bank_finance', label: 'Advance Amount: With Finance Charge Up to $7,000', isAdvanceCritical: true },
  { key: 'tax_bank_preack', label: 'Pre-Ack Question: MUST BE YES', isAdvanceCritical: true },
  { key: 'tax_bank_consent', label: 'Taxpayer Consent: MUST BE YES', isAdvanceCritical: true },
  { key: 'tax_bank_sigs', label: 'BOTH SBTPG Consent Forms Signed & Uploaded?', isAdvanceCritical: true },

  // --- 6. FINAL SIGN OFF ---
  { key: 'tax_refund_final', label: 'Refund Amount & Method Verified in E-File Section?' },
  { key: 'tax_signature_quality', label: 'Signature Check: Signed via Pad? (No Mouse Signatures)' },
  { key: 'tax_8879_signed', label: 'Tax Return Signed by Taxpayer?' },
];
// --- END CHECKLIST DEFINITIONS ---

// --- 1. KEYWORD DEFINITIONS ---
const KEYWORD_CATEGORIES = {
  RED: {
    label: 'Critical (App, Sig, Photo)',
    class: styles.highlightRed,
    color: '#fee2e2',
    keywords: [
      'missing app', 'missing application', 'missing entire app', 'missing pages', 'missing signature',
      'pending signature', 'no signature', 'client did not sign', 'missing photo', 'missing vehicle photo',
      'no photos', 'pending photos', 'missing bluepay', 'missing am receipt', 'missing payment receipt',
      'missing nb app', 'missing nb checklist', 'missing endo checklist', 'missing carrier receipt',
      'missing proof of upload to carrier', 'missing e-sign', 'pending e-sign', 'missing pos',
      'missing itc form', 'missing disclosure', 'missing privacy form', 'missing broker signature',
      'missing client signature', 'missing drop proof', 'missing proof of umbi rejection',
      'missing proof of exclusion', 'need signed exclusion form', 'need e-sign', 'need app',
      'need signatures', 'need photos',
      // Tax
      'missing 8879', 'missing consent', 'advance rejected', 'missing wet signature',
    ].map((k) => k.toLowerCase()),
  },
  BLUE: {
    label: 'Exclusions / Rejections',
    class: styles.highlightBlue,
    color: '#dbeafe',
    keywords: [
      'missing exclusion', 'pending exclusion', 'missing proof of exclusion', 'need exclusion form',
      'missing drop proof', 'missing upload proof', 'missing umbi rejection', 'need umbi rejection',
      'need drop proof', 'need proof of upload', 'missing proof of carrier upload',
      'missing proof of intl id upload', 'missing proof of marriage upload', 'missing excluded driver',
      'missing excluded owner',
    ].map((k) => k.toLowerCase()),
  },
  CYAN: {
    label: 'Corrections / Mismatches',
    class: styles.highlightCyan,
    color: '#cffafe',
    keywords: [
      'need to fix', 'fix bf', 'fix broker fee', 'fix amount', 'bf mismatch', 'broker fee mismatch',
      'mismatch receipt', 'mismatch carrier receipt', 'mismatch name', 'mismatch dob', 'mismatch vin',
      'mismatch address', 'mismatch store code', 'mismatch policy number', 'carrier amount mismatch',
      'incorrect broker fee', 'need to correct disclosure', 'need to fix disclosures',
      'need to cross out spanish form', 'missing amount match', 'need premium match',
      'does premium match receipt', 'premium mismatch',
      // Tax
      'w2 mismatch', 'refund mismatch', 'bank mismatch', 'matrix receipt',
    ].map((k) => k.toLowerCase()),
  },
  PURPLE: {
    label: 'Pending Docs (DL, Reg)',
    class: styles.highlightPurple,
    color: '#f3e8ff',
    keywords: [
      'pending docs', 'pending documents', 'missing registration', 'missing reg', 'missing dl',
      'missing driver license', 'missing id', 'missing cardholder id', 'missing matrícula',
      'missing international id', 'missing marriage cert', 'missing marriage certificate',
      'missing proof of marriage', 'pending registration', 'pending dl', 'pending marriage cert',
      'pending driver id', 'pending proof of marriage', 'need dl', 'need reg', 'need id',
      'need marriage cert', 'need document', 'missing valid registration', 'missing photos (liability)',
      'missing household members', 'need household statement',
      // Tax
      'missing ssn card', 'missing id', 'missing voided check', 'missing 8867',
    ].map((k) => k.toLowerCase()),
  },
};

const CATEGORY_PRIORITY = [
  KEYWORD_CATEGORIES.RED,
  KEYWORD_CATEGORIES.BLUE,
  KEYWORD_CATEGORIES.CYAN,
  KEYWORD_CATEGORIES.PURPLE,
];

// --- 2. CHECKLIST ITEM TO CATEGORY MAPPING ---
const CHECKLIST_ITEM_TO_CATEGORY = {
  // Insurance
  nb_app_uploaded: 'RED',
  nb_missing_app: 'RED',
  nb_original_app: 'RED',
  nb_blue_pay: 'RED',
  nb_disclosures: 'RED',
  nb_carrier_app: 'RED',
  nb_photos: 'RED',
  nb_pos: 'RED',
  nb_esign_cert: 'RED',
  nb_itc_quote: 'RED',
  umpd_bi: 'RED',
  en_bluepay_receipt: 'RED',
  en_missing_docs: 'RED',
  en_photos: 'RED',
  en_esign: 'RED',

  nb_household: 'BLUE',
  nb_excluded_owners: 'BLUE',
  nb_carrier_upload: 'BLUE',
  en_excluded_owners: 'BLUE',
  en_uploaded_to_matrix: 'BLUE',
  en_supporting_docs: 'BLUE',

  nb_matrix_receipt: 'CYAN',
  nb_premium_match_receipt: 'CYAN',
  nb_bf_match_disclosure: 'CYAN',
  en_matrix_receipt: 'CYAN',
  en_premium_match: 'CYAN',
  en_bf_check: 'CYAN',

  nb_ids: 'PURPLE',
  nb_vehicle_docs: 'PURPLE',
  nb_vehicle_docs_logic: 'PURPLE',
  nb_marriage_cert: 'PURPLE',
  nb_matrix_alert: 'PURPLE',
  en_company_docs: 'PURPLE',
  en_title_reg: 'PURPLE',
  en_license_id: 'PURPLE',
  en_matrix_alert: 'PURPLE',

  // Tax
  tax_uploads: 'RED',
  tax_signature_quality: 'RED',
  tax_8879_signed: 'RED',
  tax_bank_delivery: 'RED',
  tax_bank_finance: 'RED',
  tax_bank_preack: 'RED',
  tax_bank_consent: 'RED',
  tax_bank_sigs: 'RED',

  tax_matrix_receipt: 'CYAN', // Matrix Receipt
  tax_w2_match: 'CYAN',
  tax_overtime_match: 'CYAN',
  tax_tips_match: 'CYAN',
  tax_refund_final: 'CYAN',
  tax_bank_selection: 'CYAN',

  tax_pii_match: 'PURPLE',
  tax_dep_match: 'PURPLE',
  tax_healthcare: 'PURPLE',
  tax_8867_dd: 'PURPLE',
  tax_credits_proof: 'PURPLE',
  tax_vehicle_credit: 'PURPLE',
};
// --- END KEYWORD/CATEGORY DEFINITIONS ---

/* --- Helpers --- */
const pad = (n) => String(n).padStart(2, '0');
const yyyymm = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const thisMonthKey = () => yyyymm(new Date());
const monthStartISO = (monthKey) => `${monthKey}-01T00:00:00.000Z`;
const monthEndISO = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthKey}-${pad(lastDay)}T23:59:59.999Z`;
};

const diffAge = (iso) => {
  if (!iso) return { label: '—', danger: false };
  const now = Date.now();
  const then = new Date(iso).getTime();
  let mins = Math.max(0, Math.floor((now - then) / 60000));
  const danger = mins * 60 * 1000 >= 48 * 60 * 60 * 1000; // 48h visual danger cue
  if (mins < 60) return { label: `${mins} mins`, danger };
  const hrs = Math.floor(mins / 60);
  mins = mins % 60;
  if (hrs < 24) return { label: `${hrs}h ${mins}m`, danger };
  const days = Math.floor(hrs / 24);
  return { label: `${days}d`, danger };
};

// --- NEW: Resolution + Last UW Message helpers ---
const getFirstResolutionNote = (checklistData) => {
  const cd = checklistData || {};
  const history = Array.isArray(cd.history) ? cd.history : [];

  // 1) Earliest note from history that is Fail / Needs Review
  const sorted = [...history].sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));

  const earliestBad = sorted.find((h) => {
    const status = (h.status || '').toLowerCase();
    const notes = (h.notes || '').trim();
    return notes && (status === 'fail' || status === 'needs review');
  });
  if (earliestBad) return (earliestBad.notes || '').trim();

  // 2) Earliest note from history (any status)
  const earliestAny = sorted.find((h) => (h.notes || '').trim());
  if (earliestAny) return (earliestAny.notes || '').trim();

  // 3) Fallback: current checklist item notes (prefer Fail/Needs Review)
  const skipKeys = new Set(['history', 'payment_method', 'coverage_type', 'tax_return_type']);
  const entries = Object.entries(cd).filter(([k, v]) => !skipKeys.has(k) && v && typeof v === 'object');

  const badWithNotes = entries.find(([_, v]) => {
    const status = (v.status || '').toLowerCase();
    const notes = (v.notes || '').trim();
    return notes && (status === 'fail' || status === 'needs review');
  });
  if (badWithNotes) return (badWithNotes[1].notes || '').trim();

  const anyWithNotes = entries.find(([_, v]) => (v.notes || '').trim());
  return anyWithNotes ? (anyWithNotes[1].notes || '').trim() : '—';
};

const getLastUwMessageToAgent = (pendingItems) => {
  const items = Array.isArray(pendingItems) ? pendingItems : [];
  // "Last msg the UW sent to the agent" = most recent message FROM UW
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const m = items[i];
    if (m?.from === 'uw' && (m.text || '').trim()) return (m.text || '').trim();
  }
  return '—';
};

// --- HELPER FUNCTION for Checklist Keyword Matching ---
const getHighlightClass = (checklistData, uwNotes) => {
  if (!checklistData && !uwNotes) return '';

  let allNotes = (uwNotes || '').toLowerCase();
  const itemStatuses = {};

  if (checklistData) {
    for (const key in checklistData) {
      const item = checklistData[key];
      if (typeof item === 'object' && item) {
        if (item.notes) {
          allNotes += ' ' + item.notes.toLowerCase();
        }
        // Check for "Fail" or "Needs Review" status
        if (item.status === 'Fail' || item.status === 'Needs Review') {
          itemStatuses[key] = true;
        }
      }
    }
  }

  if (!allNotes.trim() && Object.keys(itemStatuses).length === 0) return '';

  for (const category of CATEGORY_PRIORITY) {
    // Check 1: "Fail" or "Needs Review" status on a relevant item
    for (const itemKey in itemStatuses) {
      const itemCategory = CHECKLIST_ITEM_TO_CATEGORY[itemKey]; // e.g., 'RED'
      if (KEYWORD_CATEGORIES[itemCategory] === category) {
        return category.class; // Return class (e.g., styles.highlightRed)
      }
    }

    // Check 2: Keywords in notes
    for (const keyword of category.keywords) {
      if (allNotes.includes(keyword)) {
        return category.class;
      }
    }
  }
  return ''; // No keywords found
};

/* ------------------- NEW: Office Tab Helpers ------------------- */
const hasNewAgentMsg = (r) => {
  const last = (Array.isArray(r.pending_items) ? r.pending_items : []).slice(-1)[0];
  return last?.from === 'agent';
};

const getOfficeKey = (r) => r.office || r.office_code || '—';
/* --------------------------------------------------------------- */

// --- ChatCell COMPONENT DEFINITION ---
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
    return Array.isArray(row.pending_items) ? row.pending_items : [];
  }, [row.pending_items]);

  return (
    <>
      {openChatRow === row.id && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexGrow: 1, minHeight: 0, height: '100%' }}>
          {/* Message container */}
          <div style={{ flexGrow: 1, maxHeight: 'none', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '0 4px 10px 0', minHeight: '150px' }}>
            {allMessages.length === 0 && (
              <div style={{ color: '#6b7280', textAlign: 'center', marginTop: '1rem' }}>
                No messages yet.
              </div>
            )}
            {allMessages.map((m, idx) => {
              const mine = m.from === 'uw';
              return (
                <div
                  key={`${m.at}-${idx}-${mine}`}
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', position: 'relative', flexShrink: 0, marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
              <textarea
                ref={composerRef}
                placeholder="Type a message…"
                value={draft[row.id] || ''}
                onChange={(e) => setDraft((s) => ({ ...s, [row.id]: e.target.value }))}
                style={{
                  flex: 1,
                  minHeight: 70,
                  maxHeight: 150,
                  padding: '0.6rem',
                  border: '1px solid #d1d5db',
                  borderRadius: 10,
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', position: 'relative' }}>
                <button
                  type="button"
                  ref={emojiBtnRef}
                  onClick={() => setShowEmoji((v) => !v)}
                  title="Insert emoji"
                  aria-label="Insert emoji"
                  style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '0.45rem 0.55rem' }}
                >
                  <span style={{ fontSize: 18 }}>😊</span>
                </button>
                <button type="button" className={styles.sendBtn} onClick={() => sendChat(row)}>
                  Send
                </button>
                {showEmoji && (
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
                      gridTemplateColumns: 'repeat(8, 1fr)',
                      gap: 6,
                      zIndex: 50,
                      maxHeight: '200px',
                      overflowY: 'auto',
                    }}
                  >
                    {emojiList.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertEmoji(e, row.id)}
                        style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', padding: '2px' }}
                      >
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

// --- *** UPDATED ChecklistTab COMPONENT *** ---
const ChecklistTab = ({ row, onSave, user, profile }) => {
  // Determine default list based on transaction type
  const getListType = useCallback(() => {
    const type = (row.transaction_type || '').toUpperCase();
    if (type.includes('TAX')) return 'TAX';
    if (type.includes('NB')) return 'NB';
    return 'EN';
  }, [row.transaction_type]);

  const [selectedList, setSelectedList] = useState(getListType());
  const [checklistData, setChecklistData] = useState(row.checklist_data || {});
  const [showHistory, setShowHistory] = useState(false);

  // --- FORCE UPDATE WHEN ROW CHANGES ---
  useEffect(() => {
    setSelectedList(getListType());
    setChecklistData(row.checklist_data || {});
  }, [row, getListType]);

  // Debouncer for saving
  const debouncedSave = useRef(
    ((func, delay) => {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
      };
    })((newChecklistData) => {
      onSave(newChecklistData);
    }, 1000)
  ).current;

  const handleNoteChange = (key, newNote) => {
    const existingItemData = checklistData[key] || { status: 'N/A', notes: '', reviewed_by: '', checked_at: null };
    const newData = { ...checklistData, [key]: { ...existingItemData, notes: newNote } };
    setChecklistData(newData);
    debouncedSave(newData);
  };

  const handleStatusChange = (key, newStatus) => {
    const uwName = (profile?.full_name || user?.email?.split('@')[0]) || 'Unknown User';
    const existingItemData = checklistData[key] || { status: 'N/A', notes: '', reviewed_by: '', checked_at: null };
    if (newStatus === existingItemData.status) return;

    const existingHistory = Array.isArray(checklistData.history) ? checklistData.history : [];
    let newHistory = [...existingHistory];
    const newTimestamp = new Date().toISOString();

    // Helper to find label
    let currentBaseItems = NB_CHECKLIST_ITEMS;
    if (selectedList === 'EN') currentBaseItems = EN_CHECKLIST_ITEMS;
    if (selectedList === 'TAX') currentBaseItems = TAX_CHECKLIST_ITEMS;

    newHistory.push({
      item: key,
      label: (currentBaseItems.find((i) => i.key === key) || {}).label || key,
      status: newStatus,
      notes: existingItemData.notes || '',
      by: uwName,
      at: newTimestamp,
    });

    const updatedItemData = {
      ...existingItemData,
      status: newStatus,
      reviewed_by: newStatus !== 'N/A' ? uwName : '',
      checked_at: newStatus !== 'N/A' ? newTimestamp : null,
    };

    const newData = { ...checklistData, history: newHistory, [key]: updatedItemData };
    setChecklistData(newData);
    onSave(newData);
  };

  // Logic Helpers
  const paymentMethod = (checklistData.payment_method || 'cc').toLowerCase();
  const coverageType = (checklistData.coverage_type || 'full coverage').toLowerCase();

  // Tax Return Type Logic: 'standard', 'bank_rt', 'bank_advance'
  const taxReturnType = (checklistData.tax_return_type || 'standard').toLowerCase();

  let baseItems = NB_CHECKLIST_ITEMS;
  if (selectedList === 'EN') baseItems = EN_CHECKLIST_ITEMS;
  if (selectedList === 'TAX') baseItems = TAX_CHECKLIST_ITEMS;

  // --- FILTERING LOGIC ---
  const itemsToRender = baseItems.filter((item) => {
    // 1. Insurance Filters
    if (selectedList !== 'TAX') {
      if (item.key === 'nb_blue_pay' || item.key === 'en_bluepay_receipt') return paymentMethod !== 'cash';
      if (item.key === 'nb_photos' || item.key === 'en_photos') return coverageType !== 'liability';
    }
    // 2. Tax Filters
    if (selectedList === 'TAX') {
      const isAdvance = taxReturnType === 'bank_advance';
      const isBank = taxReturnType === 'bank_rt' || isAdvance;

      // If item is strictly for Advance, only show if Advance is selected
      if (item.isAdvanceCritical && !isAdvance) return false;

      // If item is general Bank (RT or Advance), only show if Bank is selected
      if (item.isBank && !isBank) return false;
    }
    return true;
  });

  const handleDropdownChange = (key, value) => {
    const newData = { ...checklistData, [key]: value };
    setChecklistData(newData);
    debouncedSave(newData);
  };

  const history = Array.isArray(checklistData.history) ? checklistData.history : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flexGrow: 1, padding: '0.25rem' }}>
      {/* --- TOP CONTROLS --- */}
      <div style={{ display: 'flex', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b' }}>Checklist Type</label>
          <select
            value={selectedList}
            onChange={(e) => setSelectedList(e.target.value)}
            className={styles.select}
            style={{ minWidth: '150px' }}
          >
            <option value="NB">Insurance: NB</option>
            <option value="EN">Insurance: EN</option>
            <option value="TAX">Tax Return</option>
          </select>
        </div>

        {selectedList !== 'TAX' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b' }}>Payment</label>
              <select
                value={checklistData.payment_method || ''}
                onChange={(e) => handleDropdownChange('payment_method', e.target.value)}
                className={styles.select}
                style={{ minWidth: '140px' }}
              >
                <option value="">Select...</option>
                <option value="cc">Credit Card</option>
                <option value="cash">Cash</option>
                <option value="ach">ACH</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b' }}>Coverage</label>
              <select
                value={checklistData.coverage_type || ''}
                onChange={(e) => handleDropdownChange('coverage_type', e.target.value)}
                className={styles.select}
                style={{ minWidth: '140px' }}
              >
                <option value="">Select...</option>
                <option value="full coverage">Full Coverage</option>
                <option value="liability">Liability</option>
              </select>
            </div>
          </>
        )}

        {/* --- UPDATED TAX DROPDOWN --- */}
        {selectedList === 'TAX' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b' }}>Return Type</label>
            <select
              value={checklistData.tax_return_type || 'standard'}
              onChange={(e) => handleDropdownChange('tax_return_type', e.target.value)}
              className={styles.select}
              style={{
                minWidth: '220px',
                borderColor: checklistData.tax_return_type === 'bank_advance' ? '#ef4444' : '#d1d5db',
                borderWidth: checklistData.tax_return_type === 'bank_advance' ? '2px' : '1px',
              }}
            >
              <option value="standard">Standard (Direct to IRS)</option>
              <option value="bank_rt">Bank Product (RT Only - Check/DD)</option>
              <option value="bank_advance">🚨 Bank Product (ADVANCE) 🚨</option>
            </select>
          </div>
        )}
      </div>

      {/* --- CHECKLIST GRID --- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr', alignItems: 'center', gap: '0.75rem 0.5rem' }}>
        {/* Headers */}
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Status</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Checklist Item</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Resolution Notes</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Reviewed By</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Date Checked</span>

        {itemsToRender.map((item) => {
          const itemData = checklistData[item.key] || { status: 'N/A', notes: '', reviewed_by: '', checked_at: null };

          // Style Critical Advance Items
          const isCritical = item.isAdvanceCritical;
          const rowStyle = isCritical ? { backgroundColor: '#fef2f2', borderLeft: '4px solid #ef4444', paddingLeft: '5px' } : {};

          return (
            <React.Fragment key={item.key}>
              <div style={rowStyle}>
                <select
                  value={itemData.status || 'N/A'}
                  onChange={(e) => handleStatusChange(item.key, e.target.value)}
                  className={styles.inlineSelect}
                  style={{
                    width: '100px',
                    fontWeight: isCritical ? 'bold' : 'normal',
                    backgroundColor: itemData.status === 'Pass' ? '#f0fdf4' : itemData.status === 'Fail' ? '#fef2f2' : '#fff',
                  }}
                >
                  <option value="N/A">N/A</option>
                  <option value="Pass">Pass</option>
                  <option value="Fail">Fail</option>
                  <option value="Needs Review">Needs Review</option>
                </select>
              </div>

              <div style={rowStyle}>
                <label htmlFor={`notes-${item.key}`} style={{ fontWeight: isCritical ? 700 : 400, color: isCritical ? '#991b1b' : 'inherit' }}>
                  {isCritical && '⚠️ '}
                  {item.label}
                </label>
              </div>

              <div style={rowStyle}>
                <input
                  type="text"
                  id={`notes-${item.key}`}
                  placeholder="Notes..."
                  value={itemData.notes || ''}
                  onChange={(e) => handleNoteChange(item.key, e.target.value)}
                  className={styles.inlineSelect}
                />
              </div>

              <div style={rowStyle}>
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {itemData.reviewed_by || '—'}
                </span>
              </div>

              <div style={rowStyle}>
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {itemData.checked_at ? new Date(itemData.checked_at).toLocaleString() : '—'}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* --- HISTORY LOG --- */}
      <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
        <button type="button" className={styles.secondaryBtn} onClick={() => setShowHistory((prev) => !prev)}>
          {showHistory ? 'Hide' : 'Show'} Change History ({history.length})
        </button>
        {showHistory && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px' }}>
            {history.length === 0 ? (
              <span style={{ color: 'var(--muted)' }}>No history found.</span>
            ) : (
              [...history].reverse().map((entry, index) => (
                <div key={index} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    {entry.by || 'Unknown'} set "{entry.label}" to "{entry.status}"
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{new Date(entry.at).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
// --- END CHECKLIST COMPONENT ---

// --- ManageTicketModal COMPONENT DEFINITION ---
const ManageTicketModal = ({
  info,
  onClose,
  user,
  profile,
  actions,
  setActionState,
  sendAction,
  onSaveChecklist,
  ...chatProps
}) => {
  const { row, restrict } = info;
  const local = actions[row.id] || { status: '', note: '' };
  const disableSend = !local.status;
  const showNotes = !(restrict && (row.status === 'Pending' || row.status === 'Cannot Locate Policy'));
  const [activeTab, setActiveTab] = useState('Checklist');

  // Wrapper for checklist save function
  const handleChecklistSave = (newChecklistData) => {
    onSaveChecklist(row, newChecklistData);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <>
      <div className={styles.modalBackdrop} onClick={onClose} />
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>
            Manage: {row.policy_number || 'Policy'} ({row.customer_name || 'No Customer'})
          </h2>
          <button onClick={onClose} className={styles.modalCloseBtn}>
            &times;
          </button>
        </div>

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

        <div className={styles.modalBody}>
          {activeTab === 'Checklist' && (
            <div className={styles.modalSection} style={{ flexGrow: 2, display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '1rem',
                  marginBottom: '1rem',
                  flexShrink: 0,
                }}
              >
                <h3 className={styles.modalSubTitle}>Actions</h3>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <select
                    className={styles.select}
                    value={local.status}
                    onChange={(e) => setActionState(row.id, { status: e.target.value })}
                    style={{ flex: 1, minWidth: '150px' }}
                  >
                    <option value="">Select action…</option>
                    {/* On this page, we only allow "Approved" action */}
                    <option value="Approved">Approved</option>
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
                    onClick={() => {
                      if (!disableSend) {
                        sendAction(row);
                        onClose();
                      }
                    }}
                  >
                    Send Action
                  </button>
                </div>
              </div>

              <ChecklistTab
                key={row.id}
                row={row}
                onSave={handleChecklistSave} // Use wrapper
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
                openChatRow={row.id}
                setOpenChatRow={() => {}}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// --- RowBase COMPONENT ---
const RowBase = ({
  r,
  arr,
  user,
  orderNumber,
  setManageInfo,
  releaseClaim,
  claim,
  showReleaseButton,
}) => {
  const age = diffAge(r.last_action_at || r.created_at);
  const mine = r.claimed_by === user?.id;
  const last = (Array.isArray(r.pending_items) ? r.pending_items : []).slice(-1)[0];
  const newReply = last?.from === 'agent';

  // --- Get highlight class based on checklist notes AND uw_notes ---
  const errorClass = getHighlightClass(r.checklist_data, r.uw_notes);
  const rowClass = newReply ? styles.newAgentReplyHighlight : errorClass;

  const assigneeDisplay =
    r.claimed_by_first && r.claimed_by_last
      ? `${r.claimed_by_first} ${r.claimed_by_last}`
      : r.claimed_by_email
      ? r.claimed_by_email.split('@')[0]
      : null;

  const firstResolutionNote = getFirstResolutionNote(r.checklist_data);
  const lastUwMsg = getLastUwMessageToAgent(r.pending_items);

  return (
    <tr key={r.id} className={rowClass}>
      <td>
        {orderNumber(arr, r.id)}
        {newReply && <span className={styles.newMsgBadge}>New Msg</span>}
      </td>
      <td>
        {r.agent_first_name || r.agent_last_name
          ? `${r.agent_first_name || ''} ${r.agent_last_name || ''}`.trim()
          : (r.agent_email || '').split('@')[0] || '-'}
      </td>
      <td>{r.office || r.office_code || '—'}</td>
      <td>{r.transaction_type || '—'}</td>
      <td>{r.policy_number || '—'}</td>

      {/* ✅ Replaced Premium + Total BF */}
      <td title={firstResolutionNote} style={{ maxWidth: 320 }}>
        <span style={{ display: 'inline-block', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {firstResolutionNote || '—'}
        </span>
      </td>
      <td title={lastUwMsg} style={{ maxWidth: 320 }}>
        <span style={{ display: 'inline-block', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lastUwMsg || '—'}
        </span>
      </td>

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
        {mine ? (
          <>
            <button
              className={styles.sendBtn}
              onClick={() => setManageInfo({ row: r, restrict: true })}
              style={{ marginRight: showReleaseButton ? '8px' : '0' }}
            >
              Manage
            </button>
            {showReleaseButton && (
              <button
                className={styles.releaseBtn}
                onClick={() => {
                  if (window.confirm('Are you sure you want to release this item back to the queue?')) {
                    releaseClaim(r);
                  }
                }}
                title="Release claim back to available pool"
              >
                Release
              </button>
            )}
          </>
        ) : (
          // If not mine (either unassigned or assigned to someone else), show Claim button
          <button
            className={styles.claimBtn}
            onClick={() => {
              // Add confirmation if it's already claimed by someone
              const assigneeName = assigneeDisplay || 'another user';
              if (r.claimed_by && !window.confirm(`This item is already assigned to ${assigneeName}. Are you sure you want to re-claim it?`)) {
                return; // User cancelled
              }
              claim(r);
            }}
          >
            Claim
          </button>
        )}
      </td>
    </tr>
  );
};

/* ---------- Main Component ---------- */
export default function PendingUnderwriting() {
  const { user, profile } = useAuth();
  const role = profile?.role || user?.user_metadata?.role || 'agent';
  const isUW = ['underwriter', 'uw_manager', 'supervisor', 'admin'].includes(role);

  const [month, setMonth] = useState(thisMonthKey());
  const [allFetchedRows, setAllFetchedRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Region/Office Filtering State
  const [regionOfficeMap, setRegionOfficeMap] = useState({});
  const [regions, setRegions] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedOffice, setSelectedOffice] = useState('ALL');

  // Modal State
  const [actions, setActions] = useState({});
  const setActionState = (id, patch) =>
    setActions((s) => ({ ...s, [id]: { ...(s[id] || { status: '', note: '' }), ...patch } }));
  const [manageInfo, setManageInfo] = useState(null);

  // New filters for Available Pending
  const [dayFilter, setDayFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [errorFilter, setErrorFilter] = useState('ALL'); // Error filter by highlight class

  // NEW: Office Tabs for All Pending
  const [activeOfficeTab, setActiveOfficeTab] = useState('ALL');

  // Chat State
  const [openChatRow, setOpenChatRow] = useState(null);
  const [draft, setDraft] = useState({});
  const composerRef = useRef(null);
  const emojiBtnRef = useRef(null);
  const emojiPanelRef = useRef(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiList = useMemo(
    () => ['😀', '😁', '😂', '🤣', '😊', '😍', '😉', '😎', '👍', '🙏', '🎉', '✅', '❌', '📝', '📎'],
    []
  );

  // ✅ ESLint fix: memoize insertEmoji
  const insertEmoji = useCallback(
    (emoji, rowId) => {
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
    },
    [draft]
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
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [showEmoji]);

  useEffect(() => {
    const fetchRegions = async () => {
      const { data, error } = await supabase
        .from('office_regions')
        .select('office_code, office_name, region')
        .order('region')
        .order('office_name');
      if (error) {
        console.error('Error fetching office regions:', error);
        setMsg('Could not load region/office list.');
        return;
      }
      const map = {};
      const regionSet = new Set();
      (data || []).forEach((item) => {
        regionSet.add(item.region);
        if (!map[item.region]) {
          map[item.region] = [];
        }
        map[item.region].push({ code: item.office_code, name: item.office_name || item.office_code });
      });
      setRegionOfficeMap(map);
      setRegions(['ALL', ...Array.from(regionSet).sort()]);
      setSelectedRegion('ALL');
      setSelectedOffice('ALL');
    };
    fetchRegions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- UPDATED load Function ---
  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setMsg('');

    // --- Load main data in range (with filters) ---
    const start = monthStartISO(month);
    const end = monthEndISO(month);
    let query = supabase
      .from('uw_submissions')
      .select('*')
      .in('status', ['Pending', 'Cannot Locate Policy'])
      .gte('created_at', start)
      .lte('created_at', end);

    if (selectedOffice && selectedOffice !== 'ALL') {
      query = query.eq('office_code', selectedOffice);
    } else if (selectedRegion && selectedRegion !== 'ALL' && regionOfficeMap[selectedRegion]) {
      const officeCodesInRegion = regionOfficeMap[selectedRegion].map((o) => o.code);
      if (officeCodesInRegion.length > 0) {
        query = query.in('office_code', officeCodesInRegion);
      } else {
        setAllFetchedRows([]);
        setLoading(false);
        return;
      }
    }

    const { data, error } = await query.order('last_action_at', { ascending: false });
    if (error) {
      setMsg(`Load error: ${error.message}`);
    }

    const rows = data || [];
    const sorted = rows.slice().sort((a, b) => {
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

    setAllFetchedRows(sorted);
    setLoading(false);
  }, [user?.id, month, selectedRegion, selectedOffice, regionOfficeMap]);

  useEffect(() => {
    load();
  }, [load]);

  // --- UPDATED Realtime handleChanges ---
  useEffect(() => {
    if (!user?.id) return;
    const handleChanges = (payload) => {
      console.log('Pending Change received!', payload);
      const newItem = payload.new;
      const oldItem = payload.old;
      const oldItemId = oldItem?.id;
      const eventType = payload.eventType;

      setAllFetchedRows((currentRows) => {
        let updatedRows = [...currentRows];
        if (!newItem && eventType !== 'DELETE') return updatedRows;

        const relevantStatus = newItem ? ['Pending', 'Cannot Locate Policy'].includes(newItem.status) : false;
        const matchesDate = newItem
          ? newItem.created_at >= monthStartISO(month) && newItem.created_at <= monthEndISO(month)
          : false;
        const matchesFilters = newItem
          ? (selectedRegion === 'ALL' ||
              (regionOfficeMap[selectedRegion] &&
                regionOfficeMap[selectedRegion].some((o) => o.code === newItem.office_code))) &&
            (selectedOffice === 'ALL' || selectedOffice === newItem.office_code)
          : false;

        if (eventType === 'INSERT') {
          if (relevantStatus && matchesDate && matchesFilters && !updatedRows.some((item) => item.id === newItem.id)) {
            updatedRows.push(newItem);
          }
        } else if (eventType === 'UPDATE') {
          const index = updatedRows.findIndex((item) => item.id === newItem.id);
          if (relevantStatus && matchesDate && matchesFilters) {
            if (index !== -1) {
              const existingItem = updatedRows[index];
              updatedRows[index] = {
                ...existingItem,
                ...newItem,
                checklist_data: {
                  ...(existingItem.checklist_data || {}),
                  ...(newItem.checklist_data || {}),
                },
              };
            } else if (!updatedRows.some((item) => item.id === newItem.id)) {
              updatedRows.push(newItem);
            }
          } else {
            if (index !== -1) updatedRows.splice(index, 1);
          }
        } else if (eventType === 'DELETE') {
          const deleteId = oldItemId || newItem?.id;
          if (deleteId) updatedRows = updatedRows.filter((item) => item.id !== deleteId);
        }

        updatedRows.sort((a, b) => {
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
        return updatedRows;
      });

      if (manageInfo && newItem && manageInfo.row.id === newItem.id && eventType === 'UPDATE') {
        setManageInfo((prev) => ({
          ...prev,
          row: {
            ...prev.row,
            ...newItem,
            checklist_data: { ...(prev.row.checklist_data || {}), ...(newItem.checklist_data || {}) },
          },
        }));
      }
    };

    const channel = supabase
      .channel('pending_uw_submissions_changes_v3')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'uw_submissions',
          filter: `status=in.("Pending","Cannot Locate Policy")`,
        },
        handleChanges
      )
      .subscribe((status, err) => {
        console.log(`[Pending Realtime] Subscription status: ${status}`);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Pending Subscription error:', err);
          setMsg(`Realtime connection error: ${err?.message || 'Unknown error'}. Data might be stale.`);
        }
      });

    return () => {
      console.log('Unsubscribing from pending changes');
      supabase.removeChannel(channel).catch((error) => console.error('Error removing channel:', error));
    };
  }, [user?.id, month, selectedRegion, selectedOffice, regionOfficeMap, manageInfo]);

  // --- Action Functions ---
  const appendMessage = useCallback(
    async (rowId, thread, text, isUW = true) => {
      const sender = isUW ? 'uw' : 'agent';
      const senderEmail = user?.email || null;
      const newMessage = { from: sender, text: text, at: new Date().toISOString(), by: senderEmail };
      const newThread = [...(Array.isArray(thread) ? thread : []), newMessage];
      const { error } = await supabase
        .from('uw_submissions')
        .update({
          pending_items: newThread,
          last_action_at: newMessage.at,
          last_updated_by: user?.id,
          last_updated_by_email: senderEmail,
        })
        .eq('id', rowId);
      if (error) {
        console.error('Append message error:', error);
        throw error;
      }
    },
    [user?.email, user?.id]
  );

  const sendChat = useCallback(
    async (row) => {
      const text = (draft[row.id] || '').trim();
      if (!text) return;
      const newMessage = { from: 'uw', text: text, at: new Date().toISOString(), by: user?.email || null };
      const updatedThread = [...(Array.isArray(row.pending_items) ? row.pending_items : []), newMessage];
      const updatedRow = {
        ...row,
        pending_items: updatedThread,
        last_action_at: newMessage.at,
        checklist_data: row.checklist_data || {},
      };

      setAllFetchedRows((prev) => prev.map((item) => (item.id === row.id ? updatedRow : item)));
      if (manageInfo && manageInfo.row.id === row.id) {
        setManageInfo((prev) => ({ ...prev, row: updatedRow }));
      }
      setDraft((s) => ({ ...s, [row.id]: '' }));
      setShowEmoji(false);

      try {
        await appendMessage(row.id, row.pending_items, text, true);
      } catch (e) {
        alert(`Failed to send message: ${e.message}`);
        load();
      }
    },
    [appendMessage, draft, load, manageInfo, user?.email]
  );

  const sendAction = useCallback(
    async (row) => {
      const local = actions[row.id] || {};
      if (!local.status || !user?.id || !user?.email) return;
      const nextStatus = local.status;
      const uwNote = (local.note || '').trim();
      const now = new Date().toISOString();
      const updatePayload = {
        status: nextStatus,
        uw_notes: uwNote || null,
        last_action_at: now,
        last_updated_by: user.id,
        last_updated_by_email: user.email,
        ...(nextStatus === 'Approved'
          ? { cleared_by: user.id, cleared_by_email: user.email, cleared_at: now }
          : { checked_by: user.id }),
      };

      const { error: updateError } = await supabase
        .from('uw_submissions')
        .update(updatePayload)
        .eq('id', row.id)
        .eq('claimed_by', user.id); // Only current owner can update

      if (updateError) {
        alert(`Failed to update status: ${updateError.message}`);
        return;
      }

      if (uwNote) {
        try {
          await appendMessage(row.id, row.pending_items, uwNote, true);
        } catch (appendError) {
          console.error('Error appending action note to chat:', appendError);
        }
      }

      setActions((s) => {
        const nextState = { ...s };
        delete nextState[row.id];
        return nextState;
      });

      // Realtime will handle removing the row from the UI
    },
    [actions, appendMessage, user?.email, user?.id]
  );

  // ✅ ESLint fix: normalize user metadata fields outside claim()
  const userMeta = user?.user_metadata || {};
  const metaFullName = userMeta.full_name || userMeta.name || '';
  const metaFirstName = userMeta.first_name || '';
  const metaLastName = userMeta.last_name || '';

  const claim = useCallback(
    async (row) => {
      if (!user?.id || !user?.email) return;

      const fullName = profile?.full_name || metaFullName || '';
      let first_name = profile?.first_name || metaFirstName || '';
      let last_name = profile?.last_name || metaLastName || '';

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
          uw_notes: null,
        })
        .eq('id', row.id); // allow re-claim

      if (error) {
        console.error('Claim error:', error);
        alert(`Failed to claim: ${error.message}`);
        return;
      }
      load();
    },
    [
      load,
      metaFirstName,
      metaLastName,
      metaFullName,
      profile?.first_name,
      profile?.last_name,
      profile?.full_name,
      user?.email,
      user?.id,
    ]
  );

  const releaseClaim = useCallback(
    async (row) => {
      if (!user?.id || row.claimed_by !== user.id) return;
      const nowTimestamp = new Date().toISOString();

      const { error } = await supabase
        .from('uw_submissions')
        .update({
          status: 'Pending',
          claimed_by: null,
          claimed_by_email: null,
          claimed_by_first: null,
          claimed_by_last: null,
          claimed_at: null,
          last_action_at: nowTimestamp,
          uw_notes: 'Manually released to queue',
          last_updated_by: user.id,
          last_updated_by_email: user.email,
        })
        .eq('id', row.id)
        .eq('claimed_by', user.id);

      if (error) {
        console.error('Release claim error:', error);
        alert(`Failed to release claim: ${error.message}`);
        return;
      }

      load();
    },
    [load, user?.email, user?.id]
  );

  // --- NEW: Function to save checklist data ---
  const saveChecklistData = useCallback(
    async (row, newChecklistData) => {
      const updatedRow = {
        ...row,
        checklist_data: newChecklistData,
        last_action_at: new Date().toISOString(),
        last_updated_by: user.id,
        last_updated_by_email: user.email,
      };
      setAllFetchedRows((prev) => prev.map((item) => (item.id === row.id ? updatedRow : item)));
      if (manageInfo && manageInfo.row.id === row.id) {
        setManageInfo((prev) => ({ ...prev, row: updatedRow }));
      }
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
        alert('Error saving checklist. Data may be out of sync. Please refresh.');
        load();
      }
    },
    [load, manageInfo, user.id, user.email]
  );

  // --- Derived Lists ---
  const myPendingWork = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim();

    return (allFetchedRows || []).filter((r) => {
      if (r.claimed_by !== user?.id) return false;

      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (dayFilter) {
        const creationDate = (r.created_at || '').split('T')[0];
        if (creationDate !== dayFilter) return false;
      }
      if (searchLower) {
        const policy = r.policy_number?.toLowerCase() || '';
        const customer = r.customer_name?.toLowerCase() || '';
        const agent = r.agent_email?.toLowerCase() || '';
        if (!policy.includes(searchLower) && !customer.includes(searchLower) && !agent.includes(searchLower)) {
          return false;
        }
      }
      const rowErrorClass = getHighlightClass(r.checklist_data, r.uw_notes);
      if (errorFilter !== 'ALL' && rowErrorClass !== errorFilter) {
        return false;
      }
      return true;
    });
  }, [allFetchedRows, user?.id, searchQuery, statusFilter, dayFilter, errorFilter]);

  const availablePending = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim();

    return (allFetchedRows || []).filter((r) => {
      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (dayFilter) {
        const creationDate = (r.created_at || '').split('T')[0];
        if (creationDate !== dayFilter) return false;
      }
      if (searchLower) {
        const policy = r.policy_number?.toLowerCase() || '';
        const customer = r.customer_name?.toLowerCase() || '';
        const agent = r.agent_email?.toLowerCase() || '';
        if (!policy.includes(searchLower) && !customer.includes(searchLower) && !agent.includes(searchLower)) {
          return false;
        }
      }
      const rowErrorClass = getHighlightClass(r.checklist_data, r.uw_notes);
      if (errorFilter !== 'ALL' && rowErrorClass !== errorFilter) {
        return false;
      }
      return true;
    });
  }, [allFetchedRows, searchQuery, statusFilter, dayFilter, errorFilter]);

  /* ------------------- NEW: Office Tab Grouping ------------------- */
  const officeTabData = useMemo(() => {
    const rows = availablePending || [];

    const map = new Map(); // officeKey -> { officeKey, rows, total, newMsg }
    for (const r of rows) {
      const officeKey = getOfficeKey(r);
      if (!map.has(officeKey)) {
        map.set(officeKey, { officeKey, rows: [], total: 0, newMsg: 0 });
      }
      const entry = map.get(officeKey);
      entry.rows.push(r);
      entry.total += 1;
      if (hasNewAgentMsg(r)) entry.newMsg += 1;
    }

    const list = Array.from(map.values()).sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return String(a.officeKey).localeCompare(String(b.officeKey));
    });

    const allNewMsg = list.reduce((sum, x) => sum + x.newMsg, 0);
    return { list, allTotal: rows.length, allNewMsg };
  }, [availablePending]);

  const tabbedPendingRows = useMemo(() => {
    if (activeOfficeTab === 'ALL') return availablePending;
    const found = officeTabData.list.find((x) => x.officeKey === activeOfficeTab);
    return found ? found.rows : [];
  }, [activeOfficeTab, availablePending, officeTabData.list]);

  useEffect(() => {
    if (activeOfficeTab === 'ALL') return;
    const exists = officeTabData.list.some((x) => x.officeKey === activeOfficeTab);
    if (!exists) setActiveOfficeTab('ALL');
  }, [activeOfficeTab, officeTabData.list]);
  /* --------------------------------------------------------------- */

  // --- Other Helpers ---
  const orderNumber = (arr, id) => `#${arr.findIndex((r) => r.id === id) + 1}`;
  const onPrevMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    setMonth(yyyymm(d));
  };
  const onNextMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m, 1));
    const next = yyyymm(d);
    const current = thisMonthKey();
    if (next > current) return;
    setMonth(next);
  };
  const isNextDisabled = month >= thisMonthKey();
  const handleRegionChange = (e) => {
    setSelectedRegion(e.target.value);
    setSelectedOffice('ALL');
  };
  const handleOfficeChange = (e) => {
    setSelectedOffice(e.target.value);
  };
  const officesInSelectedRegion = useMemo(() => {
    if (selectedRegion && selectedRegion !== 'ALL' && regionOfficeMap[selectedRegion]) {
      return regionOfficeMap[selectedRegion];
    }
    return [];
  }, [selectedRegion, regionOfficeMap]);

  const monthStartDate = useMemo(() => monthStartISO(month).split('T')[0], [month]);
  const monthEndDate = useMemo(() => monthEndISO(month).split('T')[0], [month]);

  const chatProps = useMemo(
    () => ({
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
      openChatRow,
      setOpenChatRow,
    }),
    [draft, sendChat, showEmoji, emojiList, insertEmoji, openChatRow]
  );

  if (!isUW) return <div className={styles.container}><p>Not authorized.</p></div>;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Pending Underwriting</h1>

      {msg && <div className={styles.message}>{msg}</div>}

      {/* Filters Card */}
      <div className={styles.card}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Month Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className={styles.iconBtn} onClick={onPrevMonth} title="Previous month">‹</button>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={styles.inlineSelect}
              style={{ width: 180 }}
            />
            <button className={styles.iconBtn} onClick={onNextMonth} disabled={isNextDisabled} title="Next month">›</button>
          </div>
          {/* Region Selector */}
          <div>
            <label htmlFor="region-select" style={{ marginRight: '8px', fontWeight: 600 }}>Region:</label>
            <select
              id="region-select"
              value={selectedRegion || 'ALL'}
              onChange={handleRegionChange}
              className={styles.inlineSelect}
            >
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>
          {/* Office Selector (Conditional) */}
          {selectedRegion && selectedRegion !== 'ALL' && officesInSelectedRegion.length > 0 && (
            <div>
              <label htmlFor="office-select" style={{ marginRight: '8px', fontWeight: 600 }}>Office:</label>
              <select
                id="office-select"
                value={selectedOffice || 'ALL'}
                onChange={handleOfficeChange}
                className={styles.inlineSelect}
              >
                <option value="ALL">ALL OFFICES in {selectedRegion}</option>
                {officesInSelectedRegion.map((office) => (
                  <option key={office.code} value={office.code}>
                    {office.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className={styles.refreshBtn} onClick={load} style={{ marginLeft: 'auto' }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Error Legend Card */}
      <div className={styles.card} style={{ marginBottom: '1rem', padding: '0.75rem' }}>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Error Legend:</span>
          {CATEGORY_PRIORITY.map((cat) => (
            <div key={cat.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  backgroundColor: cat.color,
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                }}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{cat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* My Pending Work Section */}
      <h2 className={styles.subTitle}>My Pending Work ({myPendingWork.length})</h2>
      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Agent Name</th>
                <th>Office</th>
                <th>Transaction Type</th>
                <th>Policy #</th>

                {/* ✅ Replaced Premium + Total BF */}
                <th>First Resolution Note</th>
                <th>Last UW Msg</th>

                <th>Phone #</th>
                <th>Customer Name</th>
                <th>Assignee</th>
                <th>Queue Age</th>
                <th>Last Updated</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={13}>Loading…</td>
                </tr>
              ) : myPendingWork.length === 0 ? (
                <tr>
                  <td colSpan={13}>You have no pending items assigned.</td>
                </tr>
              ) : (
                myPendingWork.map((r) => (
                  <RowBase
                    key={r.id}
                    r={r}
                    arr={myPendingWork}
                    user={user}
                    orderNumber={orderNumber}
                    setManageInfo={setManageInfo}
                    releaseClaim={releaseClaim}
                    claim={claim}
                    showReleaseButton={true}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Pending Underwriting Section */}
      <h2 className={styles.subTitle}>
        All Pending Underwriting (Any Assignee) ({tabbedPendingRows.length})
      </h2>

      {/* Filter Bar */}
      <div className={styles.card} style={{ marginBottom: '0.5rem', padding: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={dayFilter}
            onChange={(e) => setDayFilter(e.target.value)}
            min={monthStartDate}
            max={monthEndDate}
            className={styles.inlineSelect}
          />
          {dayFilter && (
            <button
              onClick={() => setDayFilter('')}
              className={styles.clearBtn}
              title="Clear date"
              style={{ marginLeft: '-0.5rem' }}
            >
              &times;
            </button>
          )}

          <input
            type="search"
            placeholder="Search policy #, customer, agent..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, minWidth: '250px' }}
            className={styles.inlineSelect}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.inlineSelect}
            style={{ minWidth: '150px' }}
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Cannot Locate Policy">Cannot Locate</option>
          </select>

          {/* Error Filter */}
          <select
            value={errorFilter}
            onChange={(e) => setErrorFilter(e.target.value)}
            className={styles.inlineSelect}
            style={{ minWidth: '220px' }}
          >
            <option value="ALL">All Errors</option>
            {CATEGORY_PRIORITY.map((cat) => (
              <option key={cat.label} value={cat.class}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* NEW: Office Tabs */}
      <div className={styles.officeTabsWrap}>
        <button
          type="button"
          className={`${styles.officeTab} ${activeOfficeTab === 'ALL' ? styles.officeTabActive : ''}`}
          onClick={() => setActiveOfficeTab('ALL')}
        >
          <span>ALL</span>
          <span className={styles.officeBadge}>{officeTabData.allTotal}</span>
          {officeTabData.allNewMsg > 0 && (
            <span className={styles.officeNewMsgBadge}>New Msg {officeTabData.allNewMsg}</span>
          )}
        </button>

        {officeTabData.list.map((t) => (
          <button
            key={t.officeKey}
            type="button"
            className={`${styles.officeTab} ${activeOfficeTab === t.officeKey ? styles.officeTabActive : ''}`}
            onClick={() => setActiveOfficeTab(t.officeKey)}
          >
            <span>{t.officeKey}</span>
            <span className={styles.officeBadge}>{t.total}</span>
            {t.newMsg > 0 && (
              <span className={styles.officeNewMsgBadge}>New Msg {t.newMsg}</span>
            )}
          </button>
        ))}
      </div>

      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Agent Name</th>
                <th>Office</th>
                <th>Transaction Type</th>
                <th>Policy #</th>

                {/* ✅ Replaced Premium + Total BF */}
                <th>First Resolution Note</th>
                <th>Last UW Msg</th>

                <th>Phone #</th>
                <th>Customer Name</th>
                <th>Assignee</th>
                <th>Queue Age</th>
                <th>Last Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={13}>Loading…</td>
                </tr>
              ) : tabbedPendingRows.length === 0 ? (
                <tr>
                  <td colSpan={13}>No available pending items match filters.</td>
                </tr>
              ) : (
                tabbedPendingRows.map((r) => (
                  <RowBase
                    key={r.id}
                    r={r}
                    arr={tabbedPendingRows}
                    user={user}
                    orderNumber={orderNumber}
                    setManageInfo={setManageInfo}
                    releaseClaim={releaseClaim}
                    claim={claim}
                    showReleaseButton={false} // Don't show release button in main pool
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Render Modal */}
      {manageInfo && (
        <ManageTicketModal
          info={manageInfo}
          onClose={() => {
            setManageInfo(null);
            setShowEmoji(false);
          }}
          user={user}
          profile={profile}
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

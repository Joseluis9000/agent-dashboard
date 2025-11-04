// src/pages/uw/UnderwritingLog.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthContext';

// Keep layout styles from dashboard
import dash from './UnderwritingDashboard.module.css';
// NEW: table/columns specific to the log
import log from './UnderwritingLog.module.css';

// --- CHECKLIST DEFINITIONS (Copied from Dashboard) ---
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
  { key: 'nb_marriage_cert', label: "Marriage Certificate (If req'd)" },
  { key: 'nb_pos', label: 'Point of Sale (POS) Form' },
  { key: 'nb_esign_cert', label: 'E-Sign Certificate (If Phone)' },
  { key: 'nb_itc_quote', label: 'ITC Quote Breakdown' },
  { key: 'nb_carrier_upload', label: "Docs Uploaded to Carrier (If req'd)" },
  { key: 'nb_matrix_alert', label: 'Matrix Alert Set for Missing Items' },
];

const EN_CHECKLIST_ITEMS = [
  { key: 'en_matrix_receipt', label: 'Matrix Receipt Signed' },
  { key: 'en_bluepay_receipt', label: 'Bluepay Receipt (if any)' },
  { key: 'en_company_docs', label: 'Company Documents / Written Request' },
  { key: 'en_missing_docs', label: 'Missing Endorsement Documents' },
  { key: 'en_title_reg', label: 'Title / Registration / Sales Contract' },
  { key: 'en_license_id', label: 'License / Matricula / ID' },
  { key: 'en_photos', label: 'Photos' },
  { key: 'en_excluded_owners', label: 'Excluded Registered Owner / Household Members' },
  { key: 'nb_household', label: 'Household Members Verified (Initials)' },
  { key: 'umpd_bi', label: 'Signature on UMPD/BI Rejection' },
  { key: 'en_uploaded_to_matrix', label: 'Uploaded To Matrix / Proof Of E-Sign' },
  { key: 'en_supporting_docs', label: 'Supporting Documents sent to Insurance co' },
  { key: 'en_premium_match', label: 'Premium Submitted Matches Receipt' },
];
// --- END CHECKLISTS ---

/**
 * LOG STATUSES
 * Keep legacy "Approved" rows exactly as before, but also show "Accepted", "Pending", and "Cannot Locate Policy".
 * Include historical "Cleared"/"Declined" if present.
 */
const LOG_STATUSES = ['Approved', 'Accepted', 'Pending', 'Cannot Locate Policy', 'Cleared', 'Declined'];

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
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

/* ---------------- Read-only Chat Cell (screen) ---------------- */
const ChatCell = ({ row, canMessage, openChatRow }) => {
  const allMessages = useMemo(() => {
    const thread = Array.isArray(row.pending_items) ? row.pending_items : [];
    if (row.agent_notes) {
      return [{ from: 'agent', text: row.agent_notes, at: row.created_at, by: row.agent_email, isInitialNote: true }, ...thread];
    }
    return thread;
  }, [row.pending_items, row.agent_notes, row.created_at, row.agent_email]);

  return (
    <>
      {openChatRow === row.id && (
        <div
          className="conversation-tab-print"
          style={{ display: 'flex', flexDirection: 'column', gap: 10, flexGrow: 1, minHeight: 0, height: '100%' }}
        >
          <div
            style={{
              flexGrow: 1,
              maxHeight: 'none',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: '0 4px 10px 0',
              minHeight: '150px',
            }}
          >
            {allMessages.length === 0 && (
              <div style={{ color: '#6b7280', textAlign: 'center', marginTop: '1rem' }}>No messages yet.</div>
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
                    {mine ? 'Underwriter' : 'Agent'}
                    {m.by ? ` · ${m.by}` : ''} · {m.at ? new Date(m.at).toLocaleString() : ''}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                </div>
              );
            })}
          </div>
          {!canMessage && (
            <div
              style={{
                color: '#6b7280',
                flexShrink: 0,
                marginTop: 'auto',
                textAlign: 'center',
                padding: '1rem',
                borderTop: '1px solid var(--border)',
              }}
            >
              Messaging is disabled in the log.
            </div>
          )}
        </div>
      )}
    </>
  );
};

/* ---------------- Checklist (Read-only) ---------------- */
const ChecklistTab = ({ row, readOnly }) => {
  const isNB = (row.transaction_type || '').toUpperCase().includes('NB');
  const [selectedList, setSelectedList] = useState(isNB ? 'NB' : 'EN');
  const [checklistData, setChecklistData] = useState(row.checklist_data || {});
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setChecklistData(row.checklist_data || {});
  }, [row.checklist_data]);

  const paymentMethod = (checklistData.payment_method || 'cc').toLowerCase();
  const coverageType = (checklistData.coverage_type || 'full coverage').toLowerCase();
  const baseItems = selectedList === 'NB' ? NB_CHECKLIST_ITEMS : EN_CHECKLIST_ITEMS;

  const itemsToRender = baseItems.filter((item) => {
    if (item.key === 'nb_blue_pay' || item.key === 'en_bluepay_receipt') return paymentMethod !== 'cash';
    if (item.key === 'nb_photos' || item.key === 'en_photos') return coverageType !== 'liability';
    return true;
  });

  const handlePrint = () => window.print();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flexGrow: 1, padding: '0.25rem' }}>
      <div
        style={{ display: 'flex', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}
        className="checklist-dropdowns-print"
      >
        <select value={selectedList} onChange={(e) => setSelectedList(e.target.value)} disabled={readOnly} className={dash.select} style={{ minWidth: '150px' }}>
          <option value="NB">NB Checklist</option>
          <option value="EN">EN Checklist</option>
        </select>
        <select value={checklistData.payment_method || ''} disabled={readOnly} className={dash.select} style={{ minWidth: '170px' }}>
          <option value="">Select Payment Method...</option>
          <option value="cc">Credit Card</option>
          <option value="cash">Cash</option>
          <option value="ach">ACH / E-Check</option>
        </select>
        <select value={checklistData.coverage_type || ''} disabled={readOnly} className={dash.select} style={{ minWidth: '170px' }}>
          <option value="">Select Coverage Type...</option>
          <option value="full coverage">Full Coverage</option>
          <option value="liability">Liability</option>
        </select>
        <button type="button" className={dash.printBtn} onClick={handlePrint}>Print</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr', alignItems: 'center', gap: '0.75rem 0.5rem' }} className="checklist-grid-print">
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Status</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Checklist Item</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Resolution Notes</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Reviewed By</span>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--muted)' }}>Date Checked</span>

        {itemsToRender.map((item) => {
          const itemData = checklistData[item.key] || { status: 'N/A', notes: '', reviewed_by: '', checked_at: null };
          return (
            <React.Fragment key={item.key}>
              <div className="checklist-item-print">
                <select value={itemData.status || 'N/A'} disabled={readOnly} className={dash.inlineSelect} style={{ width: '100px', backgroundColor: itemData.status === 'Pass' ? '#f0fdf4' : itemData.status === 'Fail' ? '#fef2f2' : '#fff' }}>
                  <option value="N/A">N/A</option>
                  <option value="Pass">Pass</option>
                  <option value="Fail">Fail</option>
                  <option value="Needs Review">Needs Review</option>
                </select>
              </div>
              <div className="checklist-item-print"><label>{item.label}</label></div>
              <div className="checklist-item-print">
                <input type="text" placeholder="Notes..." value={itemData.notes || ''} readOnly={readOnly} className={dash.inlineSelect} />
              </div>
              <div className="checklist-item-print"><span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{itemData.reviewed_by || '—'}</span></div>
              <div className="checklist-item-print">
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{itemData.checked_at ? new Date(itemData.checked_at).toLocaleString() : '—'}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }} className="history-button-print">
        <button type="button" className={dash.secondaryBtn} onClick={() => setShowHistory((prev) => !prev)}>
          {showHistory ? 'Hide' : 'Show'} Change History {(Array.isArray(checklistData.history) ? checklistData.history.length : 0)}
        </button>
        {showHistory && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px' }} className="history-log-print">
            {(Array.isArray(checklistData.history) ? checklistData.history : []).length === 0 ? (
              <span style={{ color: 'var(--muted)' }}>No history found.</span>
            ) : (
              [...(checklistData.history || [])].reverse().map((entry, index) => (
                <div key={index} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{entry.by || 'Unknown User'} set "{entry.label}" to "{entry.status}"</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>{new Date(entry.at).toLocaleString()}</div>
                  {entry.notes && <div style={{ fontSize: '0.85rem', fontStyle: 'italic', background: '#fff', padding: '4px 6px', borderRadius: '4px', wordBreak: 'break-word' }}>Note: "{entry.notes}"</div>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------- Modal (Read-only; prints full legal report) ---------------- */
const ManageTicketModal = ({ info, onClose, user, profile }) => {
  const { row } = info;
  const [activeTab, setActiveTab] = useState('Checklist');

  const conversation = useMemo(() => {
    const thread = Array.isArray(row.pending_items) ? row.pending_items : [];
    const start = row.agent_notes
      ? [{ from: 'agent', text: row.agent_notes, at: row.created_at, by: row.agent_email, isInitialNote: true }]
      : [];
    return [...start, ...thread];
  }, [row.pending_items, row.agent_notes, row.created_at, row.agent_email]);

  const isNB = (row.transaction_type || '').toUpperCase().includes('NB');
  const baseItems = isNB ? NB_CHECKLIST_ITEMS : EN_CHECKLIST_ITEMS;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* PRINT CSS FIX: use visibility trick + dedicated id */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          #uw-print-root, #uw-print-root * { visibility: visible !important; }
          #uw-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 16px !important;
            display: block !important;
          }
        }
        #uw-print-root { display: none; }
        .uw-print-h1 { font-size: 20px; margin: 0 0 8px; }
        .uw-print-meta { font-size: 12px; color: #374151; margin-bottom: 12px; }
        .uw-print-section { margin-top: 16px; }
        .uw-print-h2 { font-size: 14px; margin: 0 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
        .uw-print-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
        .uw-print-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .uw-print-grid { display: grid; grid-template-columns: auto 1fr 1fr 1fr 1fr; gap: 6px 8px; align-items: center; }
        .uw-print-grid .th { font-weight: 600; font-size: 11px; color: #6b7280; }
        .uw-print-grid .td { font-size: 12px; }
        .uw-print-table { width: 100%; border-collapse: collapse; }
        .uw-print-table th, .uw-print-table td { border: 1px solid #e5e7eb; padding: 6px 8px; font-size: 12px; vertical-align: top; }
        .uw-print-note { white-space: pre-wrap; }
      `}</style>

      {/* Screen modal */}
      <div className={dash.modalBackdrop} onClick={onClose} />
      <div className={dash.modalContent}>
        <div className={dash.modalHeader}>
          <h2>Log: {row.policy_number || 'Policy'} ({row.customer_name || 'No Customer'})</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={dash.secondaryBtn} onClick={() => window.print()}>Print</button>
            <button onClick={onClose} className={dash.modalCloseBtn}>&times;</button>
          </div>
        </div>

        <div className={dash.modalTabs}>
          <button className={`${dash.tabButton} ${activeTab === 'Checklist' ? dash.tabActive : ''}`} onClick={() => setActiveTab('Checklist')}>Checklist</button>
          <button className={`${dash.tabButton} ${activeTab === 'Conversation' ? dash.tabActive : ''}`} onClick={() => setActiveTab('Conversation')}>Conversation</button>
        </div>

        <div className={dash.modalBody}>
          <div className={`${activeTab !== 'Checklist' ? dash.hidden : ''}`}>
            <ChecklistTab key={row.id} row={row} onSave={() => {}} readOnly={true} user={user} profile={profile} />
          </div>

          <div className={`${activeTab !== 'Conversation' ? dash.hidden : ''}`}>
            <div className={dash.modalSection} style={{ flexGrow: 2, display: 'flex', flexDirection: 'column' }}>
              <h3 className={dash.modalSubTitle}>Conversation</h3>
              <ChatCell row={row} canMessage={false} openChatRow={row.id} />
            </div>
          </div>
        </div>
      </div>

      {/* PRINT-ONLY REPORT */}
      <div id="uw-print-root" aria-hidden="true">
        <div>
          <h1 className="uw-print-h1">Underwriting Case Report</h1>
          <div className="uw-print-meta">Generated: {fmt(new Date().toISOString())}</div>

          {/* Header */}
          <div className="uw-print-box">
            <table className="uw-print-table">
              <tbody>
                <tr>
                  <th>Policy #</th><td className="uw-print-mono">{row.policy_number || '—'}</td>
                  <th>Status</th><td>{row.status || '—'}</td>
                </tr>
                <tr>
                  <th>Customer</th><td>{row.customer_name || '—'}</td>
                  <th>Transaction</th><td>{row.transaction_type || '—'}</td>
                </tr>
                <tr>
                  <th>Office</th><td>{row.office_code || '—'}</td>
                  <th>Phone</th><td>{row.phone_number || '—'}</td>
                </tr>
                <tr>
                  <th>Underwriter</th>
                  <td>
                    {(row.claimed_by_first || row.claimed_by_last)
                      ? `${row.claimed_by_first || ''} ${row.claimed_by_last || ''}`.trim()
                      : (row.cleared_by_email || row.last_updated_by_email || row.claimed_by_email || '—')}
                  </td>
                  <th>Agent</th>
                  <td>
                    {(row.agent_first_name || row.agent_last_name)
                      ? `${row.agent_first_name || ''} ${row.agent_last_name || ''}`.trim()
                      : (row.agent_email || '—')}
                  </td>
                </tr>
                <tr>
                  <th>Created</th><td>{fmt(row.created_at)}</td>
                  <th>Last Action</th><td>{fmt(row.last_action_at)}</td>
                </tr>
                <tr>
                  <th>Claimed</th><td>{fmt(row.claimed_at)}</td>
                  <th>Cleared</th><td>{fmt(row.cleared_at)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* UW Notes */}
          <div className="uw-print-section">
            <h2 className="uw-print-h2">UW Notes</h2>
            <div className="uw-print-box uw-print-note">
              {(row.uw_notes && row.uw_notes.trim()) ? row.uw_notes : '—'}
            </div>
          </div>

          {/* Conversation History */}
          <div className="uw-print-section">
            <h2 className="uw-print-h2">Conversation History</h2>
            <div className="uw-print-box">
              {conversation.length === 0 ? (
                <div>No messages.</div>
              ) : (
                <table className="uw-print-table">
                  <thead>
                    <tr>
                      <th style={{ width: '18%' }}>Time</th>
                      <th style={{ width: '22%' }}>Sender</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversation.map((m, i) => (
                      <tr key={`${m.at || i}-${i}`}>
                        <td>{fmt(m.at)}</td>
                        <td>
                          {(m.from === 'uw' ? 'Underwriter' : 'Agent')}
                          {m.by ? ` (${m.by})` : ''}
                          {m.isInitialNote ? ' [Initial Note]' : ''}
                        </td>
                        <td className="uw-print-note">{m.text || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Checklist Snapshot */}
          <div className="uw-print-section">
            <h2 className="uw-print-h2">Checklist Snapshot ({isNB ? 'NB' : 'EN'})</h2>
            <div className="uw-print-box">
              <div className="uw-print-grid">
                <div className="th">Status</div>
                <div className="th">Checklist Item</div>
                <div className="th">Resolution Notes</div>
                <div className="th">Reviewed By</div>
                <div className="th">Date Checked</div>

                {baseItems.map((item) => {
                  const d = (row.checklist_data || {})[item.key] || {};
                  return (
                    <React.Fragment key={item.key}>
                      <div className="td">{d.status || 'N/A'}</div>
                      <div className="td">{item.label}</div>
                      <div className="td uw-print-note">{d.notes || '—'}</div>
                      <div className="td">{d.reviewed_by || '—'}</div>
                      <div className="td">{fmt(d.checked_at)}</div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

/* ---------------- Main Component ---------------- */
export default function UnderwritingLog() {
  const { user, profile } = useAuth();
  const role = profile?.role || user?.user_metadata?.role || 'agent';
  const canSee = ['underwriter', 'uw_manager', 'supervisor', 'admin'].includes(role);

  const [month, setMonth] = useState(thisMonthKey());
  const [search, setSearch] = useState('');
  const [assignee, setAssignee] = useState('All');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Region/Office State
  const [regionOfficeMap, setRegionOfficeMap] = useState({});
  const [regions, setRegions] = useState([]); // <-- fixed
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedOffice, setSelectedOffice] = useState('ALL');

  // Modal State
  const [manageInfo, setManageInfo] = useState(null);
  const [openChatRow, setOpenChatRow] = useState(null);

  // KPI State
  const [kpiTimeframe, setKpiTimeframe] = useState('day');
  const [kpiStats, setKpiStats] = useState({});
  const [kpiLoading, setKpiLoading] = useState(true);

  // Fetch Region/Office mapping on mount
  useEffect(() => {
    const fetchRegions = async () => {
      const { data, error } = await supabase
        .from('office_regions')
        .select('office_code, office_name, region')
        .order('region')
        .order('office_name');
      if (!error && data) {
        const map = {};
        const regionSet = new Set();
        data.forEach((item) => {
          regionSet.add(item.region);
          if (!map[item.region]) map[item.region] = [];
          map[item.region].push({ code: item.office_code, name: item.office_name || item.office_code });
        });
        setRegionOfficeMap(map);
        setRegions(['ALL', ...Array.from(regionSet).sort()]);
      }
    };
    fetchRegions();
  }, []);

  /* -------- KPI (derive from rows; show names) -------- */
  const loadKpis = useCallback(() => {
    setKpiLoading(true);

    const now = new Date();
    let startOfTimeframe;
    const endOfTimeframe = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    if (kpiTimeframe === 'day') {
      startOfTimeframe = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (kpiTimeframe === 'week') {
      const dayOfWeek = now.getDay();
      startOfTimeframe = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0, 0);
    } else {
      startOfTimeframe = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }
    const startMs = startOfTimeframe.getTime();
    const endMs = endOfTimeframe.getTime();

    const stats = {};
    const bump = (email, field, name) => {
      const e = email || 'Unknown';
      if (!stats[e]) stats[e] = { name: undefined, Approved: 0, Accepted: 0, Pending: 0, 'Cannot Locate Policy': 0, Total: 0 };
      if (name && !stats[e].name) stats[e].name = name;
      stats[e][field] += 1;
      stats[e].Total += 1;
    };

    const normStatus = (s) => {
      const t = (s || '').toLowerCase();
      if (t.includes('approved')) return 'Approved';
      if (t.includes('accepted')) return 'Accepted';
      if (t === 'pending' || t.includes('pending')) return 'Pending';
      if (t.includes('cannot locate')) return 'Cannot Locate Policy';
      return null;
    };

    const chooseUWEmailFromRow = (r) =>
      r.last_updated_by_email || r.cleared_by_email || r.claimed_by_email || 'Unknown';

    for (const r of rows) {
      if (r.last_action_at) {
        const ts = new Date(r.last_action_at).getTime();
        if (ts >= startMs && ts <= endMs) {
          const bucket = normStatus(r.status);
          if (bucket) {
            const uwEmail = chooseUWEmailFromRow(r);
            const uwName =
              (uwEmail && uwEmail === r.claimed_by_email && (r.claimed_by_first || r.claimed_by_last)
                ? `${r.claimed_by_first || ''} ${r.claimed_by_last || ''}`.trim()
                : undefined);
            bump(uwEmail, bucket, uwName);
          }
        }
      }
    }

    setKpiStats(stats);
    setKpiLoading(false);
  }, [rows, kpiTimeframe]);

  useEffect(() => { loadKpis(); }, [loadKpis]);

  // Main data loader
  const load = useCallback(async () => {
    if (!canSee) return;
    setLoading(true);
    setMsg('');

    const start = monthStartISO(month);
    const end = monthEndISO(month);

    let query = supabase
      .from('uw_submissions')
      .select('*')
      .gte('created_at', start)
      .lt('created_at', end)
      .in('status', LOG_STATUSES);

    if (selectedOffice && selectedOffice !== 'ALL') {
      query = query.eq('office_code', selectedOffice);
    } else if (selectedRegion && selectedRegion !== 'ALL' && regionOfficeMap[selectedRegion]) {
      const officeCodesInRegion = regionOfficeMap[selectedRegion].map((o) => o.code);
      if (officeCodesInRegion.length > 0) query = query.in('office_code', officeCodesInRegion);
      else {
        setRows([]);
        setLoading(false);
        return;
      }
    }

    const { data, error } = await query.order('last_action_at', { ascending: false });

    if (error) {
      setMsg(error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [canSee, month, selectedRegion, selectedOffice, regionOfficeMap]);

  useEffect(() => { load(); }, [load]);

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
  const handleOfficeChange = (e) => setSelectedOffice(e.target.value);

  const officesInSelectedRegion = useMemo(() => {
    if (selectedRegion && selectedRegion !== 'ALL' && regionOfficeMap[selectedRegion]) {
      return regionOfficeMap[selectedRegion];
    }
    return [];
  }, [selectedRegion, regionOfficeMap]);

  const assignees = useMemo(() => {
    const set = new Set(rows.map((r) => r.claimed_by_email).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
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
    if (s.includes('accepted')) return `${log.badge} ${log.badgeApproved}`;
    if (s === 'pending' || s.includes('pending')) return `${log.badge} ${log.badgeNeutral}`;
    if (s.includes('cannot locate')) return `${log.badge} ${log.badgeLocate}`;
    if (s.includes('declined') || s.includes('rejected')) return `${log.badge} ${log.badgeDeclined}`;
    if (s.includes('cleared')) return `${log.badge} ${log.badgeApproved}`;
    return `${log.badge} ${log.badgeNeutral}`;
  };

  return (
    <div className={dash.container}>
      <h1 className={dash.title}>Underwriting Log</h1>

      {/* --- KPI Scorecard --- */}
      <div className={dash.card}>
        <h2 className={dash.subTitle}>UW Scorecard</h2>
        <div className={dash.kpiTimeframeBtns}>
          <button className={kpiTimeframe === 'day' ? dash.active : dash.inactive} onClick={() => setKpiTimeframe('day')}>Today</button>
          <button className={kpiTimeframe === 'week' ? dash.active : dash.inactive} onClick={() => setKpiTimeframe('week')}>This Week</button>
          <button className={kpiTimeframe === 'month' ? dash.active : dash.inactive} onClick={() => setKpiTimeframe('month')}>This Month</button>
        </div>

        {kpiLoading ? (
          <div>Loading stats...</div>
        ) : (
          <div className={dash.tableWrap}>
            <table className={dash.kpiTable}>
              <thead>
                <tr>
                  <th>Underwriter</th>
                  <th>Approved</th>
                  <th>Accepted</th>
                  <th>Pending</th>
                  <th>Cannot Locate</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(kpiStats).length === 0 ? (
                  <tr><td colSpan={6}>No activity found for this period.</td></tr>
                ) : (
                  Object.entries(kpiStats)
                    .sort(([, a], [, b]) => b.Total - a.Total)
                    .map(([email, s]) => {
                      const displayName = (s.name && s.name.trim()) || email || 'Unknown';
                      return (
                        <tr key={email}>
                          <td>{displayName}</td>
                          <td>{s.Approved}</td>
                          <td>{s.Accepted}</td>
                          <td>{s.Pending}</td>
                          <td>{s['Cannot Locate Policy']}</td>
                          <td>{s.Total}</td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* --- END KPI Scorecard --- */}

      {/* --- Controls bar --- */}
      <div className={dash.card} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className={dash.iconBtn} onClick={onPrevMonth} title="Previous month">‹</button>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={dash.inlineSelect} style={{ width: 180 }} />
        </div>

        <button className={dash.iconBtn} onClick={onNextMonth} disabled={isNextDisabled} title="Next month">›</button>

        <div>
          <label htmlFor="region-select" style={{ marginRight: '8px', fontSize: '0.9rem' }}>Region:</label>
          <select id="region-select" value={selectedRegion || 'ALL'} onChange={handleRegionChange} className={dash.inlineSelect}>
            {regions.map((region) => (<option key={region} value={region}>{region}</option>))}
          </select>
        </div>

        {selectedRegion && selectedRegion !== 'ALL' && officesInSelectedRegion.length > 0 && (
          <div>
            <label htmlFor="office-select" style={{ marginRight: '8px', fontSize: '0.9rem' }}>Office:</label>
            <select id="office-select" value={selectedOffice || 'ALL'} onChange={handleOfficeChange} className={dash.inlineSelect}>
              <option value="ALL">ALL OFFICES in {selectedRegion}</option>
              {officesInSelectedRegion.map((office) => (<option key={office.code} value={office.code}>{office.name}</option>))}
            </select>
          </div>
        )}

        <input placeholder="Search policy, customer, agent..." value={search} onChange={(e) => setSearch(e.target.value)} className={dash.inlineSelect} style={{ flex: 1, minWidth: 250 }} />

        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={dash.inlineSelect} style={{ minWidth: 200 }}>
          {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
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
                  <th className={log.colAgent}>Agent Name</th>
                  <th className={log.colAssign}>Underwriter</th>
                  <th className={log.colNotes}>UW Notes</th>
                  <th className={log.colAction}>View</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10}>No items for this period.</td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} onClick={() => { setManageInfo({ row: r }); setOpenChatRow(r.id); }} style={{ cursor: 'pointer' }}>
                      <td className={log.colStatus}><span className={badgeClass(r.status)}>{r.status || '—'}</span></td>
                      <td className={log.colDate}>{r.last_action_at ? new Date(r.last_action_at).toLocaleString() : '—'}</td>
                      <td className={log.colOffice}>{r.office_code || '—'}</td>
                      <td className={log.colTxn}>{r.transaction_type || '—'}</td>
                      <td className={log.colPolicy}>{r.policy_number || '—'}</td>
                      <td className={log.colCustomer}>{r.customer_name || '—'}</td>
                      <td className={log.colAgent}>
                        {r.agent_first_name || r.agent_last_name ? `${r.agent_first_name || ''} ${r.agent_last_name || ''}`.trim() : '—'}
                      </td>
                      <td className={log.colAssign}>
                        {r.claimed_by_first || r.claimed_by_last
                          ? `${r.claimed_by_first || ''} ${r.claimed_by_last || ''}`.trim()
                          : r.claimed_by_email || 'Unassigned'}
                      </td>
                      <td className={log.colNotes}>{r.uw_notes || '—'}</td>
                      <td className={log.colAction}>
                        <button
                          className={dash.sendBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            setManageInfo({ row: r });
                            setOpenChatRow(r.id);
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {manageInfo && (
        <ManageTicketModal
          info={manageInfo}
          onClose={() => { setManageInfo(null); setOpenChatRow(null); }}
          user={user}
          profile={profile}
        />
      )}
    </div>
  );
}

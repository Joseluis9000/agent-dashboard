import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import styles from './Inventory.module.css';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const qty = (value) => {
  const n = num(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

const formatRole = (role) => {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'regional') return 'Regional Manager';
  if (value === 'supervisor') return 'Supervisor';
  if (value === 'admin') return 'Admin';
  return role ? String(role) : '';
};

export default function SupervisorInventoryPanel({ officeCode, onRequestItem }) {
  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [search, setSearch] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [itemToAdd, setItemToAdd] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [inventoryTab, setInventoryTab] = useState('current');
  const [reportHistory, setReportHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedReportItems, setSelectedReportItems] = useState([]);
  const [reportSubmitters, setReportSubmitters] = useState({});
  const [customItems, setCustomItems] = useState([]);
  const [actionsOpenFor, setActionsOpenFor] = useState(null);
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [customItemForm, setCustomItemForm] = useState({
    item_name: '',
    category: '',
    description: '',
    unit: '',
    reported_on_hand: '',
    location_stored: '',
  });

  const load = useCallback(async () => {
    if (!officeCode) return;
    setLoading(true);

    const [catalogResult, officeResult, customResult] = await Promise.all([
      supabase.from('inventory_items')
        .select('*')
        .eq('active', true)
        .order('category')
        .order('sort_order')
        .order('item_name'),
      supabase.rpc('get_inventory_snapshot', {
        p_office_code: officeCode,
        p_region: null,
      }),
      supabase.from('office_inventory_custom_current')
        .select('*')
        .eq('office_code', officeCode)
        .order('submitted_at', { ascending: false }),
    ]);

    if (catalogResult.error) setMessage(catalogResult.error.message);
    if (officeResult.error) setMessage(officeResult.error.message);
    if (customResult.error) setMessage(customResult.error.message);

    const all = catalogResult.data || [];
    const selected = officeResult.data || [];
    const custom = customResult.data || [];
    setCatalog(all);
    setRows(selected);
    setCustomItems(custom);

    const next = {};
    selected.forEach((row) => {
      next[row.item_id] = Math.max(0, Math.round(num(row.current_on_hand)));
    });
    custom.forEach((row) => {
      next[`custom:${row.custom_item_id}`] = Math.max(0, Math.round(num(row.current_on_hand)));
    });
    setCounts(next);

    const selectedIds = new Set(selected.map((row) => row.item_id));
    setItemToAdd(all.find((item) => !selectedIds.has(item.id))?.id || '');
    setLoading(false);
  }, [officeCode]);

  useEffect(() => { load(); }, [load]);

  const selectedIds = useMemo(
    () => new Set(rows.map((row) => row.item_id)),
    [rows]
  );

  const available = useMemo(
    () => catalog.filter((item) => !selectedIds.has(item.id)),
    [catalog, selectedIds]
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.item_name, row.category, row.description, row.unit]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [rows, search]);


  const loadReportHistory = useCallback(async () => {
    if (!officeCode) return;

    setHistoryLoading(true);

    const { data, error } = await supabase
      .from('inventory_reports')
      .select('id, office_code, submitted_at, submitted_by, notes')
      .eq('office_code', officeCode)
      .order('submitted_at', { ascending: false })
      .limit(100);

    if (error) {
      setMessage(`Could not load report history: ${error.message}`);
      setReportHistory([]);
      setHistoryLoading(false);
      return;
    }

    const reports = data || [];
    setReportHistory(reports);

    const submitterIds = [
      ...new Set(
        reports
          .map((report) => report.submitted_by)
          .filter(Boolean)
      ),
    ];

    if (submitterIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', submitterIds);

      if (!profileError) {
        const submitterMap = {};
        (profileRows || []).forEach((profile) => {
          submitterMap[profile.id] = profile;
        });
        setReportSubmitters((current) => ({
          ...current,
          ...submitterMap,
        }));
      }
    }

    setHistoryLoading(false);
  }, [officeCode]);

  useEffect(() => {
    if (inventoryTab === 'history') {
      loadReportHistory();
    }
  }, [inventoryTab, loadReportHistory]);

  const openReport = async (report) => {
    setSelectedReport(report);
    setSelectedReportItems([]);

    const detailPromise = supabase
      .from('inventory_report_detail')
      .select('*')
      .eq('report_id', report.id)
      .order('category')
      .order('item_name');

    const profilePromise =
      report.submitted_by && !reportSubmitters[report.submitted_by]
        ? supabase
            .from('profiles')
            .select('id, full_name, email, role')
            .eq('id', report.submitted_by)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

    const [detailResult, profileResult] = await Promise.all([
      detailPromise,
      profilePromise,
    ]);

    if (detailResult.error) {
      setMessage(`Could not load report details: ${detailResult.error.message}`);
      return;
    }

    setSelectedReportItems(detailResult.data || []);

    if (profileResult.data?.id) {
      setReportSubmitters((current) => ({
        ...current,
        [profileResult.data.id]: profileResult.data,
      }));
    }
  };

  const addItem = async () => {
    if (!itemToAdd) return;
    setBusy(true);
    const { error } = await supabase.rpc('add_office_inventory_item', {
      p_office_code: officeCode,
      p_item_id: itemToAdd,
    });
    setBusy(false);
    if (error) return setMessage(`Could not add item: ${error.message}`);
    setMessage('Item added to this office inventory list.');
    setAddOpen(false);
    await load();
  };

  const removeItem = async (row) => {
    if (num(row.requested_qty) > 0 || num(row.pending_qty) > 0) {
      setMessage(`${row.item_name} has an open request. Finish it before removing the item.`);
      return;
    }

    if (!window.confirm(
      `Remove ${row.item_name} from ${officeCode}'s inventory list?\n\nHistory will be preserved.`
    )) return;

    setBusy(true);
    const { error } = await supabase.rpc('remove_office_inventory_item', {
      p_office_code: officeCode,
      p_item_id: row.item_id,
    });
    setBusy(false);

    if (error) return setMessage(`Could not remove item: ${error.message}`);
    setMessage(`${row.item_name} removed from this office list.`);
    await load();
  };

  const submitCustomItem = async () => {
    const required = [
      customItemForm.item_name,
      customItemForm.category,
      customItemForm.unit,
      customItemForm.reported_on_hand,
      customItemForm.location_stored,
    ];

    if (required.some((value) => String(value).trim() === '')) {
      setMessage('Complete Item Name, Category, Unit, Quantity On Hand, and Location Stored.');
      return;
    }

    setBusy(true);
    setMessage('');

    const { data: authData } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('office_inventory_custom_items')
      .insert({
        office_code: officeCode,
        item_name: customItemForm.item_name.trim(),
        category: customItemForm.category.trim(),
        description: customItemForm.description.trim() || null,
        unit: customItemForm.unit.trim(),
        reported_on_hand: Math.max(0, Math.round(num(customItemForm.reported_on_hand))),
        location_stored: customItemForm.location_stored.trim(),
        submitted_by: authData.user?.id,
      });

    setBusy(false);

    if (error) {
      setMessage(`Could not add custom item: ${error.message}`);
      return;
    }

    setMessage('Item added to your office inventory and sent to Operations for catalog review.');
    setCustomItemOpen(false);
    setCustomItemForm({
      item_name: '',
      category: '',
      description: '',
      unit: '',
      reported_on_hand: '',
      location_stored: '',
    });
    await load();
  };

  const submitReport = async () => {
    if (!rows.length) return;
    setBusy(true);
    setMessage('');

    const { error } = await supabase.rpc('submit_office_inventory_report', {
      p_office_code: officeCode,
      p_items: [
        ...rows.map((row) => ({
          item_id: row.item_id,
          quantity: Math.max(0, Math.round(num(counts[row.item_id]))),
        })),
        ...customItems.map((row) => ({
          custom_item_id: row.custom_item_id,
          quantity: Math.max(0, Math.round(num(counts[`custom:${row.custom_item_id}`]))),
        })),
      ],
      p_notes: reportNotes.trim() || null,
    });

    setBusy(false);
    if (error) return setMessage(`Inventory report failed: ${error.message}`);

    setMessage('Inventory report submitted.');
    setReportOpen(false);
    setReportNotes('');
    await load();
  };

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>OFFICE INVENTORY / {officeCode}</div>
          <h2>Current Inventory</h2>
          <p>
            Operations maintains the master item catalog. Your office keeps only the
            items it actually uses and needs to report.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => setAddOpen(!addOpen)}>
            + Add Item
          </button>
          <button className={styles.primaryButton} type="button" onClick={() => setReportOpen(!reportOpen)}>
            {reportOpen ? 'Close Report' : 'Submit Inventory Report'}
          </button>
        </div>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      <div className={styles.inventorySubTabs}>
        <button
          type="button"
          className={inventoryTab === 'current' ? styles.inventorySubTabActive : ''}
          onClick={() => setInventoryTab('current')}
        >
          Current Inventory
        </button>
        <button
          type="button"
          className={inventoryTab === 'history' ? styles.inventorySubTabActive : ''}
          onClick={() => setInventoryTab('history')}
        >
          Inventory Reports
          <span>{reportHistory.length}</span>
        </button>
      </div>

      {inventoryTab === 'current' && (
        <>

      {addOpen && (
        <div className={styles.addItemPanel}>
          <button
            type="button"
            className={styles.addPanelClose}
            onClick={() => {
              setAddOpen(false);
              setCustomItemOpen(false);
            }}
            aria-label="Close add inventory panel"
            title="Close"
          >
            ×
          </button>

          <div>
            <strong>Add to My Inventory</strong>
            <span>Choose from items Operations has made available.</span>
          </div>
          <div className={styles.addItemControls}>
            <select value={itemToAdd} onChange={(e) => setItemToAdd(e.target.value)}>
              {available.length ? available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.item_name} · {item.unit} · {item.category}
                </option>
              )) : <option value="">No additional items available</option>}
            </select>
            <button className={styles.primaryButton} type="button" disabled={!itemToAdd || busy} onClick={addItem}>
              Add Item
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => setCustomItemOpen(!customItemOpen)}>
              Item Not Listed
            </button>
          </div>
        </div>
      )}

      {customItemOpen && (
        <div className={styles.customItemPanel}>
          <div className={styles.customItemIntro}>
            <strong>Add an Item Not Listed</strong>
            <span>
              It will appear in your office inventory and reports immediately. Operations will review it before
              deciding whether to add it to the main catalog or merge it with an existing item.
            </span>
          </div>

          <div className={styles.customItemGrid}>
            <label><span>Item Name *</span><input value={customItemForm.item_name} onChange={(e) => setCustomItemForm((c) => ({ ...c, item_name: e.target.value }))} /></label>
            <label><span>Category *</span><input value={customItemForm.category} onChange={(e) => setCustomItemForm((c) => ({ ...c, category: e.target.value }))} /></label>
            <label className={styles.customWide}><span>Description</span><input value={customItemForm.description} onChange={(e) => setCustomItemForm((c) => ({ ...c, description: e.target.value }))} /></label>
            <label><span>Unit *</span><input value={customItemForm.unit} onChange={(e) => setCustomItemForm((c) => ({ ...c, unit: e.target.value }))} placeholder="each, ream, roll, box..." /></label>
            <label><span>Quantity On Hand *</span><input type="number" min="0" step="1" value={customItemForm.reported_on_hand} onChange={(e) => setCustomItemForm((c) => ({ ...c, reported_on_hand: e.target.value }))} /></label>
            <label className={styles.customWide}><span>Location Stored *</span><input value={customItemForm.location_stored} onChange={(e) => setCustomItemForm((c) => ({ ...c, location_stored: e.target.value }))} placeholder="Storage Room, Break Room..." /></label>
          </div>

          <div className={styles.customItemActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setCustomItemOpen(false)}>Cancel</button>
            <button className={styles.primaryButton} type="button" disabled={busy} onClick={submitCustomItem}>
              {busy ? 'Submitting...' : 'Add & Send for Review'}
            </button>
          </div>
        </div>
      )}

      {reportOpen && (
        <div className={styles.reportPanel}>
          <div className={styles.reportIntro}>
            <strong>Physical Inventory Report</strong>
            <span>Enter what is physically in your office right now.</span>
          </div>

          <div className={styles.reportList}>
            {rows.map((row) => (
              <label key={row.item_id} className={styles.reportListRow}>
                <span className={styles.reportItemIdentity}>
                  <strong>{row.item_name}</strong>
                  <small>{row.category} · {row.unit}</small>
                </span>
                <span className={styles.reportExpected}>
                  System: {qty(row.system_inventory)} {row.unit}
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={counts[row.item_id] ?? 0}
                  onChange={(e) => setCounts((current) => ({
                    ...current,
                    [row.item_id]: e.target.value,
                  }))}
                />
              </label>
            ))}

            {customItems.map((row) => (
              <label key={`custom-${row.custom_item_id}`} className={styles.reportListRow}>
                <span className={styles.reportItemIdentity}>
                  <strong>{row.item_name}</strong>
                  <small>{row.category} · {row.unit} · Pending Catalog Review</small>
                </span>
                <span className={styles.reportExpected}>System: {qty(row.system_inventory)} {row.unit}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={counts[`custom:${row.custom_item_id}`] ?? 0}
                  onChange={(e) => setCounts((current) => ({
                    ...current,
                    [`custom:${row.custom_item_id}`]: e.target.value,
                  }))}
                />
              </label>
            ))}
          </div>

          <label className={styles.notesField}>
            <span>Report Notes (Optional)</span>
            <textarea
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              placeholder="Anything Operations should know..."
            />
          </label>

          <div className={styles.reportActions}>
            <button className={styles.primaryButton} type="button" disabled={busy} onClick={submitReport}>
              {busy ? 'Submitting...' : 'Submit Inventory Report'}
            </button>
          </div>
        </div>
      )}

      <div className={styles.inventoryToolbar}>
        <div>
          <strong>{rows.length + customItems.length} tracked items</strong>
          <span>Remove items you do not use. You can add them back later.</span>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inventory..." />
      </div>

      <div className={styles.inventoryListWrap}>
        <table className={styles.inventoryList}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Unit</th>
              <th>Current On Hand</th>
              <th>Requested</th>
              <th>Pending</th>
              <th>System Inventory</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className={styles.emptyTableCell}>Loading inventory...</td></tr>
            ) : visibleRows.length === 0 ? (
              <tr><td colSpan="7" className={styles.emptyTableCell}>No inventory items in this view.</td></tr>
            ) : visibleRows.map((row) => (
              <tr key={row.item_id}>
                <td>
                  <div className={styles.inventoryItemCell}>
                    <strong>{row.item_name}</strong>
                    <span>{row.category}</span>
                    {row.description && <small>{row.description}</small>}
                  </div>
                </td>
                <td><span className={styles.unitPill}>{row.unit}</span></td>
                <td className={styles.numberCell}>{qty(row.current_on_hand)}</td>
                <td className={styles.numberCell}>{qty(row.requested_qty)}</td>
                <td className={styles.numberCell}>{qty(row.pending_qty)}</td>
                <td className={`${styles.numberCell} ${styles.systemCell}`}><strong>{qty(row.system_inventory)}</strong></td>
                <td>
                  <div className={styles.rowActionInline}>
                    <button
                      className={styles.requestInventoryButton}
                      type="button"
                      onClick={() => onRequestItem?.(row, row)}
                    >
                      Request Inventory
                    </button>

                    <div className={styles.editActionWrap}>
                      <button
                        className={styles.editPencilButton}
                        type="button"
                        onClick={() =>
                          setActionsOpenFor(
                            actionsOpenFor === row.item_id ? null : row.item_id
                          )
                        }
                        aria-label={`Edit ${row.item_name}`}
                        title="Remove from my inventory"
                      >
                        ✎
                      </button>

                      {actionsOpenFor === row.item_id && (
                        <div className={styles.editActionMenu}>
                          <button
                            className={styles.removeButton}
                            type="button"
                            disabled={busy}
                            onClick={() => removeItem(row)}
                          >
                            Remove from My Inventory
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}

            {!loading && customItems.map((row) => (
              <tr key={`custom-${row.custom_item_id}`} className={styles.customInventoryRow}>
                <td>
                  <div className={styles.inventoryItemCell}>
                    <strong>{row.item_name}</strong>
                    <span>{row.category}</span>
                    <small>{row.description || 'Custom office item'} · {row.location_stored || 'No location'}</small>
                    <span className={styles.reviewPill}>Pending Catalog Review</span>
                  </div>
                </td>
                <td><span className={styles.unitPill}>{row.unit}</span></td>
                <td className={styles.numberCell}>{qty(row.current_on_hand)}</td>
                <td className={styles.numberCell}>—</td>
                <td className={styles.numberCell}>—</td>
                <td className={`${styles.numberCell} ${styles.systemCell}`}><strong>{qty(row.system_inventory)}</strong></td>
                <td>
                  <div className={styles.rowActionInline}>
                    <span className={styles.pendingReviewText}>Pending Review</span>
                    <button
                      className={styles.editPencilButton}
                      type="button"
                      disabled
                      aria-label={`${row.item_name} is pending admin review`}
                      title="Pending Admin Review"
                    >
                      ✎
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </>
      )}

      {inventoryTab === 'history' && !selectedReport && (
        <div className={styles.historySection}>
          <div className={styles.historyHeader}>
            <div>
              <strong>Submitted Inventory Reports</strong>
              <span>Review the physical inventory counts previously submitted for {officeCode}.</span>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={loadReportHistory}>
              Refresh
            </button>
          </div>

          <div className={styles.historyTableWrap}>
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Report ID</th>
                  <th>Submitted By</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td colSpan="5" className={styles.emptyTableCell}>Loading report history...</td>
                  </tr>
                ) : reportHistory.length === 0 ? (
                  <tr>
                    <td colSpan="5" className={styles.emptyTableCell}>No inventory reports submitted yet.</td>
                  </tr>
                ) : (
                  reportHistory.map((report) => (
                    <tr key={report.id}>
                      <td>
                        <strong>{new Date(report.submitted_at).toLocaleDateString()}</strong>
                        <small>{new Date(report.submitted_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
                      </td>
                      <td className={styles.reportIdCell}>{String(report.id).slice(0, 8)}</td>
                      <td>
                        <strong>
                          {reportSubmitters[report.submitted_by]?.full_name ||
                            reportSubmitters[report.submitted_by]?.email ||
                            'Unknown'}
                        </strong>
                        {reportSubmitters[report.submitted_by]?.role && (
                          <small>
                            {formatRole(reportSubmitters[report.submitted_by].role)}
                          </small>
                        )}
                      </td>
                      <td>{report.notes || '—'}</td>
                      <td className={styles.rowActions}>
                        <button type="button" onClick={() => openReport(report)}>View Report</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedReport && (
        <div className={styles.historySection}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
              flexWrap: 'wrap',
              marginBottom: 18,
            }}
          >
            <div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setSelectedReport(null);
                  setSelectedReportItems([]);
                }}
                style={{ marginBottom: 12 }}
              >
                ← Back to Inventory Reports
              </button>

              <div className={styles.eyebrow}>INVENTORY REPORT</div>
              <h2 style={{ margin: '4px 0 4px' }}>
                {officeCode} · {new Date(selectedReport.submitted_at).toLocaleDateString()}
              </h2>
              <p style={{ margin: 0 }}>
                Full physical inventory count submitted by this office.
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div className={styles.card} style={{ padding: 14 }}>
              <small style={{ display: 'block', marginBottom: 4 }}>Submitted</small>
              <strong>{new Date(selectedReport.submitted_at).toLocaleString()}</strong>
            </div>

            <div className={styles.card} style={{ padding: 14 }}>
              <small style={{ display: 'block', marginBottom: 4 }}>Submitted By</small>
              <strong>
                {reportSubmitters[selectedReport.submitted_by]?.full_name ||
                  reportSubmitters[selectedReport.submitted_by]?.email ||
                  'Unknown'}
              </strong>
              {reportSubmitters[selectedReport.submitted_by]?.role && (
                <small
                  style={{
                    display: 'block',
                    marginTop: 4,
                    color: '#667085',
                    fontWeight: 700,
                  }}
                >
                  {formatRole(reportSubmitters[selectedReport.submitted_by].role)}
                </small>
              )}
            </div>

            <div className={styles.card} style={{ padding: 14 }}>
              <small style={{ display: 'block', marginBottom: 4 }}>Notes</small>
              <strong>{selectedReport.notes || 'No notes'}</strong>
            </div>

            <div className={styles.card} style={{ padding: 14 }}>
              <small style={{ display: 'block', marginBottom: 4 }}>Items Reported</small>
              <strong style={{ fontSize: 22 }}>{selectedReportItems.length}</strong>
            </div>

            <div className={styles.card} style={{ padding: 14 }}>
              <small style={{ display: 'block', marginBottom: 4 }}>Total Units Reported</small>
              <strong style={{ fontSize: 22 }}>
                {selectedReportItems.reduce(
                  (sum, item) => sum + Number(item.reported_quantity || 0),
                  0
                )}
              </strong>
            </div>
          </div>

          <div
            className={styles.historyTableWrap}
            style={{ overflow: 'visible', maxHeight: 'none' }}
          >
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Reported Qty</th>
                </tr>
              </thead>
              <tbody>
                {selectedReportItems.length === 0 ? (
                  <tr>
                    <td colSpan="4" className={styles.emptyTableCell}>
                      Loading report items...
                    </td>
                  </tr>
                ) : (
                  selectedReportItems.map((item) => (
                    <tr key={`${item.item_id || 'custom'}-${item.custom_item_id || ''}`}>
                      <td>
                        <strong>{item.item_name}</strong>
                        {item.description && <small>{item.description}</small>}
                      </td>
                      <td>{item.category || '—'}</td>
                      <td>
                        <span className={styles.unitPill}>{item.unit || '—'}</span>
                      </td>
                      <td className={styles.numberCell}>
                        <strong style={{ fontSize: 16 }}>
                          {qty(item.reported_quantity)}
                        </strong>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
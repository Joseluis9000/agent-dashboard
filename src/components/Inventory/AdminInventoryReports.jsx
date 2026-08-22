import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import styles from './Inventory.module.css';

const monthValue = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export default function AdminInventoryReports() {
  const [month, setMonth] = useState(monthValue());
  const [statusRows, setStatusRows] = useState([]);
  const [reports, setReports] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [view, setView] = useState('monthly');
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyReports, setHistoryReports] = useState([]);
  const [selectedOffice, setSelectedOffice] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedReportItems, setSelectedReportItems] = useState([]);
  const [message, setMessage] = useState('');

  const selectedMonthDate = `${month}-01`;


  const fetchAllReports = useCallback(async () => {
    setHistoryLoading(true);
    setMessage('');

    const pageSize = 1000;
    let from = 0;
    let allRows = [];

    while (true) {
      const { data, error } = await supabase
        .from('inventory_reports')
        .select('id, office_code, submitted_by, submitted_at, notes')
        .order('submitted_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        setMessage(`Could not load report history: ${error.message}`);
        setHistoryReports([]);
        setHistoryLoading(false);
        return;
      }

      const page = data || [];
      allRows = allRows.concat(page);

      if (page.length < pageSize) break;
      from += pageSize;
    }

    setHistoryReports(allRows);

    const ids = [...new Set(allRows.map((row) => row.submitted_by).filter(Boolean))];
    if (ids.length) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, office, region, role')
        .in('id', ids);

      if (!profileError) {
        setProfiles((current) => {
          const next = { ...current };
          (profileRows || []).forEach((profile) => {
            next[profile.id] = profile;
          });
          return next;
        });
      }
    }

    setHistoryLoading(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');

    const start = new Date(`${month}-01T00:00:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    const [statusResult, reportsResult] = await Promise.all([
      supabase.rpc('get_inventory_report_status', {
        p_month: selectedMonthDate,
      }),
      supabase
        .from('inventory_reports')
        .select('id, office_code, submitted_by, submitted_at, notes')
        .gte('submitted_at', start.toISOString())
        .lt('submitted_at', end.toISOString())
        .order('submitted_at', { ascending: false }),
    ]);

    if (statusResult.error) {
      setMessage(`Could not load report status: ${statusResult.error.message}`);
      setStatusRows([]);
    } else {
      setStatusRows(statusResult.data || []);
    }

    const reportRows = reportsResult.data || [];
    setReports(reportRows);

    const ids = [...new Set(reportRows.map((row) => row.submitted_by).filter(Boolean))];
    if (ids.length) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, office, region, role')
        .in('id', ids);

      if (!profileError) {
        const map = {};
        (profileRows || []).forEach((profile) => {
          map[profile.id] = profile;
        });
        setProfiles(map);
      }
    } else {
      setProfiles({});
    }

    setLoading(false);
  }, [month, selectedMonthDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (view === 'history') fetchAllReports();
  }, [view, fetchAllReports]);

  const pendingCount = statusRows.filter((row) => row.status === 'pending').length;
  const submittedCount = statusRows.filter((row) => row.status === 'submitted').length;

  const filteredStatus = useMemo(() => {
    const q = search.trim().toLowerCase();

    return statusRows.filter((row) => {
      if (filter !== 'all' && row.status !== filter) return false;

      if (!q) return true;

      return [
        row.office_code,
        row.region,
        row.supervisor_names,
        row.supervisor_emails,
        row.latest_submitter_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [statusRows, filter, search]);


  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();

    return historyReports.filter((row) => {
      if (!q) return true;
      const profile = profiles[row.submitted_by] || {};
      return [
        row.office_code,
        profile.full_name,
        profile.email,
        profile.region,
        row.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [historyReports, historySearch, profiles]);

  const officeHistory = useMemo(() => {
    const grouped = new Map();

    filteredHistory.forEach((row) => {
      const code = String(row.office_code || 'UNKNOWN').trim().toUpperCase();
      const profile = profiles[row.submitted_by] || {};
      const current = grouped.get(code) || {
        office_code: code,
        region: profile.region || '—',
        reports: [],
        latest: null,
      };

      current.reports.push(row);
      if (!current.latest || new Date(row.submitted_at) > new Date(current.latest.submitted_at)) {
        current.latest = row;
      }
      if (current.region === '—' && profile.region) current.region = profile.region;
      grouped.set(code, current);
    });

    return Array.from(grouped.values()).sort((a, b) =>
      a.office_code.localeCompare(b.office_code, undefined, { numeric: true })
    );
  }, [filteredHistory, profiles]);

  const selectedOfficeHistory = useMemo(() => {
    if (!selectedOffice) return [];
    return historyReports
      .filter((row) => String(row.office_code || '').trim().toUpperCase() === selectedOffice)
      .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  }, [historyReports, selectedOffice]);

  const openReport = async (reportId) => {
    if (!reportId) return;

    const report = [...reports, ...historyReports].find((row) => row.id === reportId);
    setSelectedReport(report || { id: reportId });
    setSelectedReportItems([]);

    const { data, error } = await supabase
      .from('inventory_report_detail')
      .select('*')
      .eq('report_id', reportId)
      .order('category')
      .order('item_name');

    if (error) {
      setMessage(`Could not load report: ${error.message}`);
      return;
    }

    setSelectedReportItems(data || []);
  };

  const reportItemSummary = useMemo(() => {
    const total = selectedReportItems.length;
    const zero = selectedReportItems.filter((item) => Number(item.reported_quantity || 0) === 0).length;
    const inStock = selectedReportItems.filter((item) => Number(item.reported_quantity || 0) > 0).length;
    const totalUnits = selectedReportItems.reduce(
      (sum, item) => sum + Number(item.reported_quantity || 0),
      0
    );

    return { total, zero, inStock, totalUnits };
  }, [selectedReportItems]);

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>OPERATIONS / INVENTORY REPORTING</div>
          <h2>Inventory Reports</h2>
          <p>
            Track monthly submission status and review the full history of physical inventory reports.
          </p>
        </div>

        <div className={styles.headerActions}>
          {view === 'monthly' && (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={styles.monthInput}
            />
          )}
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={view === 'monthly' ? load : fetchAllReports}
          >
            Refresh
          </button>
        </div>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      <div className={styles.inventorySubTabs} style={{ marginBottom: 18 }}>
        <button
          type="button"
          className={view === 'monthly' ? styles.inventorySubTabActive : ''}
          onClick={() => setView('monthly')}
        >
          Monthly Report Status
        </button>
        <button
          type="button"
          className={view === 'history' ? styles.inventorySubTabActive : ''}
          onClick={() => setView('history')}
        >
          Report History
        </button>
      </div>

      {selectedReport ? (
        <div style={{ padding: '4px 0 8px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'flex-start',
              marginBottom: 18,
              flexWrap: 'wrap',
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
                ← Back to {view === 'monthly' ? 'Monthly Report Status' : 'Report History'}
              </button>

              <div className={styles.eyebrow}>INVENTORY REPORT</div>
              <h2 style={{ margin: '4px 0 4px' }}>
                {selectedReportItems[0]?.office_code || selectedReport.office_code || 'Office Report'}
              </h2>
              <p style={{ margin: 0 }}>
                Full physical inventory count submitted by the office. All reported item counts are shown below.
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div className={styles.card} style={{ padding: 14 }}>
              <small style={{ display: 'block', marginBottom: 4 }}>Submitted</small>
              <strong>
                {selectedReport.submitted_at
                  ? new Date(selectedReport.submitted_at).toLocaleString()
                  : selectedReportItems[0]?.submitted_at
                    ? new Date(selectedReportItems[0].submitted_at).toLocaleString()
                    : '—'}
              </strong>
            </div>

            <div className={styles.card} style={{ padding: 14 }}>
              <small style={{ display: 'block', marginBottom: 4 }}>Submitted By</small>
              <strong>
                {profiles[selectedReport.submitted_by]?.full_name ||
                  profiles[selectedReport.submitted_by]?.email ||
                  selectedReport.latest_submitter_name ||
                  'Supervisor'}
              </strong>
              {profiles[selectedReport.submitted_by]?.role && (
                <small
                  style={{
                    display: 'block',
                    marginTop: 4,
                    color: '#667085',
                    textTransform: 'capitalize',
                  }}
                >
                  {profiles[selectedReport.submitted_by].role}
                </small>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(130px, 1fr))',
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div className={styles.card} style={{ padding: 14 }}>
              <small style={{ display: 'block' }}>Items Reported</small>
              <strong style={{ fontSize: 22 }}>{reportItemSummary.total}</strong>
            </div>
            <div className={styles.card} style={{ padding: 14 }}>
              <small style={{ display: 'block' }}>In Stock</small>
              <strong style={{ fontSize: 22 }}>{reportItemSummary.inStock}</strong>
            </div>
            <div className={styles.card} style={{ padding: 14 }}>
              <small style={{ display: 'block' }}>Reported at 0</small>
              <strong style={{ fontSize: 22 }}>{reportItemSummary.zero}</strong>
            </div>
            <div className={styles.card} style={{ padding: 14 }}>
              <small style={{ display: 'block' }}>Total Units Reported</small>
              <strong style={{ fontSize: 22 }}>{reportItemSummary.totalUnits}</strong>
            </div>
          </div>

          <div className={styles.historyTableWrap} style={{ overflow: 'visible', maxHeight: 'none' }}>
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
                    <tr key={`${item.item_id}-${item.custom_item_id || ''}`}>
                      <td>
                        <strong>{item.item_name}</strong>
                        {item.description && <small>{item.description}</small>}
                      </td>
                      <td>{item.category || '—'}</td>
                      <td>
                        <span className={styles.unitPill}>{item.unit || '—'}</span>
                      </td>
                      <td className={styles.numberCell}>
                        <strong style={{ fontSize: 16 }}>{item.reported_quantity}</strong>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : view === 'monthly' ? (
        <>
          <div className={styles.reportSummaryGrid}>
            <button
              type="button"
              className={`${styles.reportSummaryCard} ${filter === 'pending' ? styles.reportSummaryActive : ''}`}
              onClick={() => setFilter('pending')}
            >
              <span>Pending</span>
              <strong>{pendingCount}</strong>
              <small>Offices without a report this month</small>
            </button>

            <button
              type="button"
              className={`${styles.reportSummaryCard} ${filter === 'submitted' ? styles.reportSummaryActive : ''}`}
              onClick={() => setFilter('submitted')}
            >
              <span>Submitted</span>
              <strong>{submittedCount}</strong>
              <small>Offices that reported this month</small>
            </button>

            <button
              type="button"
              className={`${styles.reportSummaryCard} ${filter === 'all' ? styles.reportSummaryActive : ''}`}
              onClick={() => setFilter('all')}
            >
              <span>Total Offices</span>
              <strong>{statusRows.length}</strong>
              <small>Configured offices</small>
            </button>
          </div>

          <div className={styles.inventoryToolbar}>
            <div>
              <strong>{filteredStatus.length} offices in this view</strong>
              <span>
                Pending is based on whether an office submitted at least one report during {month}.
              </span>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search office, region, supervisor..."
            />
          </div>

          <div className={styles.historyTableWrap}>
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th>Office</th>
                  <th>Region</th>
                  <th>Supervisor</th>
                  <th>Status</th>
                  <th>Latest Report</th>
                  <th>Submitted By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" className={styles.emptyTableCell}>Loading inventory report status...</td></tr>
                ) : filteredStatus.length === 0 ? (
                  <tr><td colSpan="7" className={styles.emptyTableCell}>No offices match this view.</td></tr>
                ) : filteredStatus.map((row) => (
                  <tr key={row.office_code}>
                    <td><strong>{row.office_code}</strong></td>
                    <td>{row.region || '—'}</td>
                    <td>
                      <strong>{row.supervisor_names || 'No supervisor assigned'}</strong>
                      {row.supervisor_emails && <small>{row.supervisor_emails}</small>}
                    </td>
                    <td>
                      <span className={row.status === 'submitted' ? styles.submittedPill : styles.pendingPill}>
                        {row.status === 'submitted' ? 'Submitted' : 'Pending'}
                      </span>
                    </td>
                    <td>
                      {row.latest_submitted_at ? (
                        <>
                          <strong>{new Date(row.latest_submitted_at).toLocaleDateString()}</strong>
                          <small>{new Date(row.latest_submitted_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
                        </>
                      ) : '—'}
                    </td>
                    <td>{row.latest_submitter_name || '—'}</td>
                    <td className={styles.rowActions}>
                      {row.latest_report_id && (
                        <button type="button" onClick={() => openReport(row.latest_report_id)}>
                          View Report
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {!selectedOffice ? (
            <>
              <div className={styles.inventoryToolbar}>
                <div>
                  <strong>{officeHistory.length} offices with report history</strong>
                  <span>Select an office to review its complete inventory-report timeline.</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search office, region, submitter..."
                  />
                  <button type="button" className={styles.secondaryButton} onClick={fetchAllReports}>
                    Refresh
                  </button>
                </div>
              </div>

              <div className={styles.historyTableWrap}>
                <table className={styles.historyTable}>
                  <thead>
                    <tr>
                      <th>Office</th>
                      <th>Region</th>
                      <th>Reports</th>
                      <th>Latest Submission</th>
                      <th>Latest Submitted By</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyLoading ? (
                      <tr><td colSpan="6" className={styles.emptyTableCell}>Loading office history...</td></tr>
                    ) : officeHistory.length === 0 ? (
                      <tr><td colSpan="6" className={styles.emptyTableCell}>No submitted reports found.</td></tr>
                    ) : officeHistory.map((office) => {
                      const latestProfile = profiles[office.latest?.submitted_by] || {};
                      return (
                        <tr
                          key={office.office_code}
                          onClick={() => setSelectedOffice(office.office_code)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td><strong>{office.office_code}</strong></td>
                          <td>{office.region}</td>
                          <td><strong>{office.reports.length}</strong> submitted</td>
                          <td>
                            {office.latest ? (
                              <>
                                <strong>{new Date(office.latest.submitted_at).toLocaleDateString()}</strong>
                                <small>{new Date(office.latest.submitted_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
                              </>
                            ) : '—'}
                          </td>
                          <td>
                            <strong>{latestProfile.full_name || latestProfile.email || 'Supervisor'}</strong>
                            {latestProfile.full_name && latestProfile.email && <small>{latestProfile.email}</small>}
                          </td>
                          <td className={styles.rowActions}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOffice(office.office_code);
                              }}
                            >
                              View History
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '4px 0 8px' }}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setSelectedOffice(null)}
                  style={{ marginBottom: 14 }}
                >
                  ← Back to Offices
                </button>

                <div className={styles.eyebrow}>OFFICE INVENTORY HISTORY</div>
                <h2 style={{ margin: '4px 0' }}>{selectedOffice}</h2>
                <p style={{ marginTop: 0 }}>
                  Complete physical inventory report history for this office, newest first.
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))',
                  gap: 12,
                  marginBottom: 18,
                }}
              >
                <div className={styles.card} style={{ padding: 14 }}>
                  <small style={{ display: 'block' }}>Total Reports</small>
                  <strong style={{ fontSize: 22 }}>{selectedOfficeHistory.length}</strong>
                </div>
                <div className={styles.card} style={{ padding: 14 }}>
                  <small style={{ display: 'block' }}>Latest Report</small>
                  <strong>
                    {selectedOfficeHistory[0]?.submitted_at
                      ? new Date(selectedOfficeHistory[0].submitted_at).toLocaleDateString()
                      : '—'}
                  </strong>
                </div>
                <div className={styles.card} style={{ padding: 14 }}>
                  <small style={{ display: 'block' }}>Region</small>
                  <strong>{profiles[selectedOfficeHistory[0]?.submitted_by]?.region || '—'}</strong>
                </div>
              </div>

              <div className={styles.historyTableWrap}>
                <table className={styles.historyTable}>
                  <thead>
                    <tr>
                      <th>Submitted</th>
                      <th>Submitted By</th>
                      <th>Notes</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOfficeHistory.length === 0 ? (
                      <tr><td colSpan="4" className={styles.emptyTableCell}>No reports found for this office.</td></tr>
                    ) : selectedOfficeHistory.map((row) => {
                      const profile = profiles[row.submitted_by] || {};
                      return (
                        <tr key={row.id}>
                          <td>
                            <strong>{new Date(row.submitted_at).toLocaleDateString()}</strong>
                            <small>{new Date(row.submitted_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
                          </td>
                          <td>
                            <strong>{profile.full_name || profile.email || 'Supervisor'}</strong>
                            {profile.full_name && profile.email && <small>{profile.email}</small>}
                          </td>
                          <td>{row.notes || '—'}</td>
                          <td className={styles.rowActions}>
                            <button type="button" onClick={() => openReport(row.id)}>
                              View Report
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

    </section>
  );
}
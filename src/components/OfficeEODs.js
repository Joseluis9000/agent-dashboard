import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import styles from './OfficeEODs.module.css';
import ReportDetailModal from './Modals/ReportDetailModal';
import CorpSummaryView from './CorpSummaryView';

// --- INITIAL REGION DATA ---
const INITIAL_REGION_OFFICES = {
  'CEN-CAL': ['CA010', 'CA011', 'CA012', 'CA022', 'CA183', 'CA229', 'CA230', 'CA239'],
  'KERN COUNTY': ['CA016', 'CA047', 'CA048', 'CA049', 'CA172', 'CA240'],
  'THE VALLEY': ['CA025', 'CA030', 'CA045', 'CA046', 'CA065', 'CA074', 'CA075', 'CA095', 'CA118', 'CA119', 'CA231', 'CA238'],
  'BAY AREA': ['CA076', 'CA103', 'CA104', 'CA114', 'CA117', 'CA149', 'CA150', 'CA216', 'CA236', 'CA248'],
  'SOUTHERN CALI': ['CA131', 'CA132', 'CA133', 'CA166', 'CA249', 'CA250', 'CA251', 'CA252'],
};

const getInitialOfficeRegions = () => {
  const mapping = {};
  for (const region in INITIAL_REGION_OFFICES) {
    INITIAL_REGION_OFFICES[region].forEach((office) => {
      mapping[office] = region;
    });
  }
  return mapping;
};

// --- HELPER FUNCTIONS ---
const formatCurrency = (value) => `$${parseFloat(value).toFixed(2)}`;
const getYesterdayString = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
};

const OfficeEODs = () => {
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [viewMode, setViewMode] = useState('regional'); // 'regional' or 'corporate'

  // Region Management State
  const [officeRegions, setOfficeRegions] = useState({});
  const [editingOffice, setEditingOffice] = useState(null);
  const [newRegionName, setNewRegionName] = useState('');

  const [startDate, setStartDate] = useState(getYesterdayString());
  const [endDate, setEndDate] = useState(getYesterdayString());

  // --- DATA FETCHING & REGION PERSISTENCE ---
  useEffect(() => {
    // Load regions from localStorage, falling back to initial data
    const savedRegions = localStorage.getItem('officeRegions');
    const initialRegions = getInitialOfficeRegions();
    if (savedRegions) {
      setOfficeRegions({ ...initialRegions, ...JSON.parse(savedRegions) });
    } else {
      setOfficeRegions(initialRegions);
    }
  }, []);

  useEffect(() => {
    const fetchReports = async () => {
      setIsLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('eod_reports')
        .select('*')
        .gte('report_date', startDate)
        .lte('report_date', endDate)
        .order('report_date', { ascending: false })
        .order('office_number', { ascending: true });

      if (error) setError(error.message);
      else setReports(data || []);
      setIsLoading(false);
    };

    if (startDate && endDate) fetchReports();
  }, [startDate, endDate]);

  // --- DATA AGGREGATION BY REGION & OFFICE ---
  const aggregatedData = useMemo(() => {
    const regionMap = {};

    reports.forEach((report) => {
      const regionName = officeRegions[report.office_number] || 'Unassigned';
      if (!regionMap[regionName]) {
        regionMap[regionName] = { name: regionName, offices: {} };
      }

      const officeKey = `${report.report_date}-${report.office_number}`;
      if (!regionMap[regionName].offices[officeKey]) {
        regionMap[regionName].offices[officeKey] = {
          report_date: report.report_date,
          office_number: report.office_number,
          reports: [],
          total_nb_rw_count: 0,
          total_trust_deposit: 0,
          total_dmv_deposit: 0,
          total_revenue_deposit: 0,
          total_cash_difference: 0,
        };
      }

      const officeGroup = regionMap[regionName].offices[officeKey];
      officeGroup.reports.push(report);
      officeGroup.total_nb_rw_count += report.nb_rw_count || 0;
      officeGroup.total_trust_deposit += report.trust_deposit || 0;
      officeGroup.total_dmv_deposit += report.dmv_deposit || 0;
      officeGroup.total_revenue_deposit += report.revenue_deposit || 0;
      officeGroup.total_cash_difference += report.cash_difference || 0;
    });

    return Object.values(regionMap)
      .map((region) => {
        const offices = Object.values(region.offices).map((office) => {
          const corp_owes =
            office.total_trust_deposit < 0 ? Math.abs(office.total_trust_deposit) : 0;
          const adjusted_revenue_deposit = office.total_revenue_deposit - corp_owes;
          return { ...office, corp_owes, adjusted_revenue_deposit };
        });
        return { ...region, offices };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [reports, officeRegions]);

  // --- KPI CALCULATIONS ---
  const kpis = useMemo(() => {
    const allOfficeGroups = aggregatedData.flatMap((region) => region.offices);

    return allOfficeGroups.reduce(
      (acc, officeGroup) => {
        acc.totalRevenue += officeGroup.adjusted_revenue_deposit;
        acc.totalCorpOwes += officeGroup.corp_owes;
        acc.nbRwCount += officeGroup.total_nb_rw_count;
        acc.totalCashDifference += officeGroup.total_cash_difference;
        return acc;
      },
      { totalRevenue: 0, totalCorpOwes: 0, nbRwCount: 0, totalCashDifference: 0 }
    );
  }, [aggregatedData]);

  // --- EVENT HANDLERS ---
  const handleDayChange = (direction) => {
    const currentDate = new Date(`${startDate}T12:00:00Z`);
    currentDate.setUTCDate(currentDate.getUTCDate() + direction);
    const newDateStr = currentDate.toISOString().split('T')[0];
    setStartDate(newDateStr);
    setEndDate(newDateStr);
  };

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleEditRegion = (office_number, currentRegion) => {
    setEditingOffice(office_number);
    setNewRegionName(currentRegion === 'Unassigned' ? '' : currentRegion);
  };

  const handleSaveRegion = (officeNumber) => {
    const updatedRegions = { ...officeRegions, [officeNumber]: newRegionName.trim() };
    setOfficeRegions(updatedRegions);
    // Persist to localStorage
    const saved = JSON.parse(localStorage.getItem('officeRegions') || '{}');
    saved[officeNumber] = newRegionName.trim();
    localStorage.setItem('officeRegions', JSON.stringify(saved));

    setEditingOffice(null);
    setNewRegionName('');
  };

  return (
    <>
      <main className={styles.mainContent}>
        <div className={styles.pageHeader}>
          <h1>Office & Agent EODs</h1>
        </div>

        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Net Revenue Deposited</span>
            <span className={styles.kpiValue}>{formatCurrency(kpis.totalRevenue)}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total Corp Owes</span>
            <span className={styles.kpiValue} style={{ color: '#4299e1' }}>
              {formatCurrency(kpis.totalCorpOwes)}
            </span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total Policies (NB/RWR)</span>
            <span className={styles.kpiValue}>{kpis.nbRwCount}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Net Cash Over/Short</span>
            <span
              className={styles.kpiValue}
              style={{ color: kpis.totalCashDifference < 0 ? '#e53e3e' : '#38a169' }}
            >
              {formatCurrency(kpis.totalCashDifference)}
            </span>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.filterBar}>
            <div className={styles.dateRangePickers}>
              <div className={styles.dateFilter}>
                <label htmlFor="startDate">From:</label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className={styles.dateFilter}>
                <label htmlFor="endDate">To:</label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* View switcher uses shared button styles */}
            <div className={styles.viewSwitcher}>
              <button
                type="button"
                onClick={() => setViewMode('regional')}
                className={`${styles.navBtn} ${
                  viewMode === 'regional' ? styles.navBtnActive : ''
                }`}
              >
                Regional View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('corporate')}
                className={`${styles.navBtn} ${
                  viewMode === 'corporate' ? styles.navBtnActive : ''
                }`}
              >
                Corporate Summary
              </button>
            </div>

            {/* Arrows also use the same shared styles */}
            <div className={styles.daySwitcher}>
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navBtnIcon}`}
                onClick={() => handleDayChange(-1)}
                aria-label="Previous day"
              >
                &lt;
              </button>
              <span>Day</span>
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navBtnIcon}`}
                onClick={() => handleDayChange(1)}
                aria-label="Next day"
              >
                &gt;
              </button>
            </div>
          </div>

          {viewMode === 'regional' && (
            <div className={styles.tableContainer}>
              {isLoading ? (
                <p>Loading...</p>
              ) : error ? (
                <p>{error}</p>
              ) : (
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th style={{ width: '20px' }}></th>
                      <th>Date / Office</th>
                      <th>Region</th>
                      <th>Policies</th>
                      <th>Trust Deposit</th>
                      <th>Corp Owes</th>
                      <th>DMV Deposit</th>
                      <th>Net Revenue</th>
                      <th>Cash Diff.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregatedData.map((region) => (
                      <React.Fragment key={region.name}>
                        <tr className={styles.regionRow}>
                          <td colSpan="9">{region.name}</td>
                        </tr>
                        {region.offices.map((group) => {
                          const groupKey = `${group.report_date}-${group.office_number}`;
                          return (
                            <React.Fragment key={groupKey}>
                              <tr
                                className={styles.groupRow}
                                onClick={() => toggleGroup(groupKey)}
                              >
                                <td>
                                  <span
                                    className={
                                      expandedGroups.has(groupKey) ? styles.expanded : ''
                                    }
                                    style={{ marginLeft: '20px' }}
                                  >
                                    ▶
                                  </span>
                                </td>
                                <td>
                                  {group.report_date} - <strong>{group.office_number}</strong>
                                </td>
                                <td>
                                  {editingOffice === group.office_number ? (
                                    <div className={styles.editRegionForm}>
                                      <input
                                        type="text"
                                        value={newRegionName}
                                        onChange={(e) => setNewRegionName(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder="Enter Region Name"
                                      />
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSaveRegion(group.office_number);
                                        }}
                                      >
                                        Save
                                      </button>
                                      <button
                                        className={styles.cancelButton}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingOffice(null);
                                        }}
                                      >
                                        X
                                      </button>
                                    </div>
                                  ) : (
                                    <div className={styles.regionCell}>
                                      <span>
                                        {officeRegions[group.office_number] || 'Unassigned'}
                                      </span>
                                      <button
                                        className={styles.editButton}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEditRegion(
                                            group.office_number,
                                            officeRegions[group.office_number] || 'Unassigned'
                                          );
                                        }}
                                      >
                                        ✎
                                      </button>
                                    </div>
                                  )}
                                </td>
                                <td>{group.total_nb_rw_count}</td>
                                <td>{formatCurrency(Math.max(0, group.total_trust_deposit))}</td>
                                <td>
                                  {group.corp_owes > 0
                                    ? `(${formatCurrency(group.corp_owes)})`
                                    : '$0.00'}
                                </td>
                                <td>{formatCurrency(group.total_dmv_deposit)}</td>
                                <td>{formatCurrency(group.adjusted_revenue_deposit)}</td>
                                <td>{formatCurrency(group.total_cash_difference)}</td>
                              </tr>
                              {expandedGroups.has(groupKey) && (
                                <tr className={styles.detailRow}>
                                  <td colSpan="9">
                                    <table className={styles.subTable}>
                                      <thead>
                                        <tr>
                                          <th>Agent</th>
                                          <th>Policies</th>
                                          <th>Revenue</th>
                                          <th>Trust</th>
                                          <th>Cash Diff.</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {group.reports.map((r) => (
                                          <tr key={r.id} onClick={() => setSelectedReport(r)}>
                                            <td>{r.agent_email}</td>
                                            <td>{r.nb_rw_count}</td>
                                            <td>{formatCurrency(r.revenue_deposit)}</td>
                                            <td>{formatCurrency(Math.max(0, r.trust_deposit))}</td>
                                            <td>{formatCurrency(r.cash_difference)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {viewMode === 'corporate' && (
            <CorpSummaryView reports={reports} startDate={startDate} />
          )}
        </div>
      </main>
      {selectedReport && (
        <ReportDetailModal report={selectedReport} onClose={() => setSelectedReport(null)} />
      )}
    </>
  );
};

export default OfficeEODs;


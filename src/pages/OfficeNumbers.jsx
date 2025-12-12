import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import styles from '../components/AdminDashboard/AdminDashboard.module.css';

// --- ICONS & HELPERS ---
const ArrowUp = () => <span style={{ color: '#27ae60', fontWeight: 'bold' }}>▲</span>;
const ArrowDown = () => <span style={{ color: '#c0392b', fontWeight: 'bold' }}>▼</span>;

const formatCurrency = (val) =>
  parseFloat(val || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const formatCount = (val) => (val || 0).toLocaleString();
const formatPct = (val) => {
  if (val === null || val === undefined || val === Infinity || isNaN(val)) return '-';
  const color = val >= 0 ? '#27ae60' : '#c0392b';
  return (
    <span style={{ color, fontWeight: 'bold' }}>
      {val > 0 ? '+' : ''}
      {val.toFixed(1)}%
    </span>
  );
};
const safeDivide = (fees, count) => {
  const f = parseFloat(fees || 0);
  const c = parseFloat(count || 0);
  return c ? f / c : 0;
};
const formatAvg = (fees, count) => safeDivide(fees, count).toFixed(2);

// --- METRIC OPTIONS FOR SUMMARY MODAL ---
const METRIC_OPTIONS = [
  { label: 'New Business Fees', key: 'new_business_fees', goalKey: 'new_business_fees' },
  { label: 'New Business Count', key: 'new_business_count', goalKey: 'new_business_count', isCount: true },
  { label: 'Total Fees', key: 'total_fees', goalKey: 'total_fees' },
  { label: 'DMV Fees', key: 'dmv_fees', goalKey: 'dmv_fees' },
  { label: 'Renewal Fees', key: 'renewal_fees', goalKey: 'renewal_fees' },
  { label: 'Endorsement Fees', key: 'endorsement_fees', goalKey: 'endorsement_fees' },
];

const OfficeNumbers = () => {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [monthOptions, setMonthOptions] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');

  // View State
  const [activeView, setActiveView] = useState('summary');
  const [sortConfig, setSortConfig] = useState({ key: 'new_business_fees', direction: 'desc' });

  // Drill-down State
  const [selectedOfficeData, setSelectedOfficeData] = useState(null);
  const [modalMetric, setModalMetric] = useState(METRIC_OPTIONS[0]); // Default to NB Fees

  // --- CUSTOM REPORTS STATE ---
  const [customReportType, setCustomReportType] = useState('rollup'); // rollup | comparison | movers | mix
  const [rangeStartMonth, setRangeStartMonth] = useState('');
  const [rangeEndMonth, setRangeEndMonth] = useState('');
  const [compareStartMonth, setCompareStartMonth] = useState('');
  const [compareEndMonth, setCompareEndMonth] = useState('');
  const [selectedRegions, setSelectedRegions] = useState([]);
  const [selectedOffices, setSelectedOffices] = useState([]);
  const [moversMetric, setMoversMetric] = useState('total_fees'); // total_fees | new_business_fees | new_business_count | renewal_fees | dmv_fees

  useEffect(() => {
    const fetchSalesData = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('monthly_sales')
          .select('*')
          .order('month_start_date', { ascending: false });

        if (error) throw error;
        setSalesData(data || []);
        if (data && data.length > 0) {
          const uniqueMonths = [...new Set(data.map((item) => item.month_start_date))];
          setMonthOptions(uniqueMonths);
          setSelectedMonth(uniqueMonths[0]);

          // Init custom report defaults (newest as end)
          const end = uniqueMonths[0];
          const start = uniqueMonths[Math.min(5, uniqueMonths.length - 1)];
          setRangeEndMonth(end);
          setRangeStartMonth(start);

          // Comparison defaults (previous window)
          const cmpEnd = uniqueMonths[Math.min(6, uniqueMonths.length - 1)];
          const cmpStart = uniqueMonths[Math.min(11, uniqueMonths.length - 1)];
          setCompareEndMonth(cmpEnd);
          setCompareStartMonth(cmpStart);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchSalesData();
  }, []);

  // --- HELPER: Aggregates an array of rows into a single "Total" object ---
  const aggregateRows = (rows, label = 'TOTAL') => {
    const agg = {
      office: label,
      region: 'ALL',
      isGrandTotal: true, // Flag to identify this as a rollup
      month_start_date: rows[0]?.month_start_date || '',
      new_business_count: 0,
      new_business_fees: 0,
      endorsement_count: 0,
      endorsement_fees: 0,
      installment_count: 0,
      installment_fees: 0,
      dmv_count: 0,
      dmv_fees: 0,
      reissue_count: 0,
      reissue_fees: 0,
      renewal_count: 0,
      renewal_fees: 0,
      taxes_count: 0,
      tax_fees: 0,
      total_fees: 0,
    };

    rows.forEach((r) => {
      agg.new_business_count += parseFloat(r.new_business_count || 0);
      agg.new_business_fees += parseFloat(r.new_business_fees || 0);
      agg.endorsement_count += parseFloat(r.endorsement_count || 0);
      agg.endorsement_fees += parseFloat(r.endorsement_fees || 0);
      agg.installment_count += parseFloat(r.installment_count || 0);
      agg.installment_fees += parseFloat(r.installment_fees || 0);
      agg.dmv_count += parseFloat(r.dmv_count || 0);
      agg.dmv_fees += parseFloat(r.dmv_fees || 0);
      agg.reissue_count += parseFloat(r.reissue_count || 0);
      agg.reissue_fees += parseFloat(r.reissue_fees || 0);
      agg.renewal_count += parseFloat(r.renewal_count || 0);
      agg.renewal_fees += parseFloat(r.renewal_fees || 0);
      agg.taxes_count += parseFloat(r.taxes_count || 0);
      agg.tax_fees += parseFloat(r.tax_fees || 0);
    });

    agg.total_fees = agg.new_business_fees + agg.endorsement_fees + agg.dmv_fees + agg.renewal_fees;
    return agg;
  };

  // --- DATA PROCESSING ---
  const getComparisonData = (currentMonthDate, lookbackMonths) => {
    const currDate = new Date(currentMonthDate);
    currDate.setMonth(currDate.getMonth() - lookbackMonths);
    const year = currDate.getFullYear();
    const month = String(currDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  };

  const processedData = useMemo(() => {
    if (!selectedMonth) return { grouped: {}, grandTotal: null, flatList: [] };

    const currentMonthData = salesData.filter((item) => item.month_start_date === selectedMonth);
    const lastMonthStr = getComparisonData(selectedMonth, 1);
    const lastYearStr = getComparisonData(selectedMonth, 12);

    // Prepare Comparison Lookup Maps for Speed
    const lastMonthData = salesData.filter((d) => d.month_start_date === lastMonthStr);
    const lastYearData = salesData.filter((d) => d.month_start_date === lastYearStr);

    const grouped = {};
    const flatList = []; // For Leaderboard

    currentMonthData.forEach((row) => {
      const region = row.region || 'Unknown';
      if (!grouped[region]) grouped[region] = [];

      // Find comparison rows
      const prevMonthRow = lastMonthData.find((d) => d.office === row.office);
      const prevYearRow = lastYearData.find((d) => d.office === row.office);

      const calcChange = (curr, past) => (past ? ((curr - past) / past) * 100 : 0);

      const totalFees =
        parseFloat(row.new_business_fees || 0) +
        parseFloat(row.endorsement_fees || 0) +
        parseFloat(row.dmv_fees || 0) +
        parseFloat(row.renewal_fees || 0);

      const enhancedRow = {
        ...row,
        prevMonthRow,
        prevYearRow,
        nb_mom_pct: calcChange(parseFloat(row.new_business_fees || 0), parseFloat(prevMonthRow?.new_business_fees || 0)),
        nb_yoy_pct: calcChange(parseFloat(row.new_business_fees || 0), parseFloat(prevYearRow?.new_business_fees || 0)),
        total_fees: totalFees,
      };

      grouped[region].push(enhancedRow);
      flatList.push(enhancedRow);
    });

    // --- GRAND TOTAL CALCULATION ---
    const grandTotal = aggregateRows(currentMonthData, 'COMPANY TOTAL');

    // Calculate Grand Total Comparisons
    const prevMonthTotal = aggregateRows(lastMonthData);
    const prevYearTotal = aggregateRows(lastYearData);

    grandTotal.prevMonthRow = prevMonthTotal;
    grandTotal.prevYearRow = prevYearTotal;

    // Add Comparison %s to Grand Total
    const calcGtChange = (curr, past) => (past ? ((curr - past) / past) * 100 : 0);
    grandTotal.nb_mom_pct = calcGtChange(grandTotal.new_business_fees, prevMonthTotal.new_business_fees);
    grandTotal.nb_yoy_pct = calcGtChange(grandTotal.new_business_fees, prevYearTotal.new_business_fees);
    grandTotal.total_rev_trend = calcGtChange(grandTotal.total_fees, prevMonthTotal.total_fees);

    return { grouped, grandTotal, flatList };
  }, [salesData, selectedMonth]);

  // --- COMPANY HISTORY CALCULATOR (For Grand Total Modal) ---
  const getCompanyHistory = () => {
    const uniqueMonths = [
      ...new Set(
        salesData
          .filter((d) => d.month_start_date <= selectedMonth)
          .map((d) => d.month_start_date)
      ),
    ];

    uniqueMonths.sort((a, b) => new Date(b) - new Date(a));
    const last6 = uniqueMonths.slice(0, 6);

    return last6
      .map((m) => {
        const monthRows = salesData.filter((d) => d.month_start_date === m);
        return aggregateRows(monthRows);
      })
      .reverse();
  };

  // --- KPI CALCULATION HELPER ---
  const getKPIMetrics = (row) => {
    if (!row) return null;

    let rank = 0;
    let totalPeers = 0;

    if (row.isGrandTotal) {
      rank = 1;
      totalPeers = 1;
    } else {
      const regionPeers = salesData.filter(
        (d) => d.region === row.region && d.month_start_date === row.month_start_date
      );
      regionPeers.sort((a, b) => parseFloat(b.new_business_fees || 0) - parseFloat(a.new_business_fees || 0));
      rank = regionPeers.findIndex((p) => p.office === row.office) + 1;
      totalPeers = regionPeers.length;
    }

    const currDate = new Date(row.month_start_date);
    const currentYear = currDate.getFullYear();
    const prevYear = currentYear - 1;
    const currentMonthIndex = currDate.getMonth();

    const officeHistory = row.isGrandTotal ? salesData : salesData.filter((d) => d.office === row.office);

    const sumSubset = (rows) =>
      rows.reduce((sum, d) => sum + parseFloat(d.new_business_fees || 0), 0);

    const calcYTD = (year) => {
      const relevantRows = officeHistory.filter((d) => {
        const dDate = new Date(d.month_start_date);
        return dDate.getFullYear() === year && dDate.getMonth() <= currentMonthIndex;
      });
      return sumSubset(relevantRows);
    };

    const currentYTD = calcYTD(currentYear);
    const prevYTD = calcYTD(prevYear);
    const ytdDiff = currentYTD - prevYTD;
    const ytdPct = prevYTD ? (ytdDiff / prevYTD) * 100 : 0;

    const validHistory = officeHistory.filter((d) => d.month_start_date <= row.month_start_date);

    let monthlyHistory = [];
    if (row.isGrandTotal) {
      const monthMap = {};
      validHistory.forEach((r) => {
        if (!monthMap[r.month_start_date]) monthMap[r.month_start_date] = 0;
        monthMap[r.month_start_date] += parseFloat(r.new_business_fees || 0);
      });
      monthlyHistory = Object.keys(monthMap).map((k) => ({
        month_start_date: k,
        new_business_fees: monthMap[k],
      }));
    } else {
      monthlyHistory = validHistory;
    }

    monthlyHistory.sort((a, b) => new Date(b.month_start_date) - new Date(a.month_start_date));

    const last3Months = monthlyHistory.slice(1, 4);
    const avg3Month =
      last3Months.length > 0
        ? last3Months.reduce((sum, d) => sum + parseFloat(d.new_business_fees || 0), 0) / last3Months.length
        : parseFloat(row.new_business_fees || 0);

    const currentFees = parseFloat(row.new_business_fees || 0);
    const velocityDiff = currentFees - avg3Month;

    return { rank, totalPeers, currentYTD, prevYTD, ytdDiff, ytdPct, avg3Month, velocityDiff };
  };

  // -------------------------
  // CUSTOM REPORTS HELPERS
  // -------------------------
  const uniqueRegions = useMemo(() => {
    const r = [...new Set(salesData.map((d) => d.region).filter(Boolean))].sort();
    return r;
  }, [salesData]);

  const officesByRegion = useMemo(() => {
    const map = {};
    salesData.forEach((d) => {
      const region = d.region || 'Unknown';
      if (!map[region]) map[region] = new Set();
      if (d.office) map[region].add(d.office);
    });
    const out = {};
    Object.keys(map).forEach((k) => (out[k] = [...map[k]].sort()));
    return out;
  }, [salesData]);

  const allOffices = useMemo(() => {
    return [...new Set(salesData.map((d) => d.office).filter(Boolean))].sort();
  }, [salesData]);

  const isMonthInRange = (m, start, end) => {
    if (!m || !start || !end) return false;
    const min = start <= end ? start : end;
    const max = start <= end ? end : start;
    return m >= min && m <= max;
  };

  const calcTotalFees = (row) =>
    parseFloat(row.new_business_fees || 0) +
    parseFloat(row.endorsement_fees || 0) +
    parseFloat(row.dmv_fees || 0) +
    parseFloat(row.renewal_fees || 0);

  const normalizeRow = (row) => ({
    ...row,
    total_fees: calcTotalFees(row),
  });

  const filterRowsByScope = (rows) => {
    let scoped = rows;

    if (selectedRegions.length > 0) {
      scoped = scoped.filter((r) => selectedRegions.includes(r.region || 'Unknown'));
    }
    if (selectedOffices.length > 0) {
      scoped = scoped.filter((r) => selectedOffices.includes(r.office));
    }
    return scoped;
  };

  const rangeRows = useMemo(() => {
    const base = salesData.filter((d) => isMonthInRange(d.month_start_date, rangeStartMonth, rangeEndMonth));
    return filterRowsByScope(base).map(normalizeRow);
  }, [salesData, rangeStartMonth, rangeEndMonth, selectedRegions, selectedOffices]);

  const compareRows = useMemo(() => {
    const base = salesData.filter((d) => isMonthInRange(d.month_start_date, compareStartMonth, compareEndMonth));
    return filterRowsByScope(base).map(normalizeRow);
  }, [salesData, compareStartMonth, compareEndMonth, selectedRegions, selectedOffices]);

  const rollupData = useMemo(() => {
    if (!rangeRows.length) return { total: null, perOffice: [] };
    const byOffice = {};
    rangeRows.forEach((r) => {
      if (!byOffice[r.office]) byOffice[r.office] = [];
      byOffice[r.office].push(r);
    });
    const perOffice = Object.keys(byOffice)
      .sort()
      .map((office) => aggregateRows(byOffice[office], office));
    const total = aggregateRows(rangeRows, 'SELECTED TOTAL');
    return { total, perOffice };
  }, [rangeRows]);

  const comparisonData = useMemo(() => {
    if (!rangeRows.length || !compareRows.length) return { aTotal: null, bTotal: null };
    const aTotal = aggregateRows(rangeRows, 'PERIOD A');
    const bTotal = aggregateRows(compareRows, 'PERIOD B');
    return { aTotal, bTotal };
  }, [rangeRows, compareRows]);

  const moversData = useMemo(() => {
    // Movers compares START month vs END month for each office in scope (simple & intuitive)
    if (!rangeStartMonth || !rangeEndMonth) return [];
    const startRows = filterRowsByScope(
      salesData.filter((d) => d.month_start_date === rangeStartMonth).map(normalizeRow)
    );
    const endRows = filterRowsByScope(
      salesData.filter((d) => d.month_start_date === rangeEndMonth).map(normalizeRow)
    );

    const getVal = (row) => {
      if (!row) return 0;
      if (moversMetric === 'total_fees') return parseFloat(row.total_fees || 0);
      return parseFloat(row[moversMetric] || 0);
    };

    const officeSet = new Set();
    startRows.forEach((r) => officeSet.add(r.office));
    endRows.forEach((r) => officeSet.add(r.office));

    const results = [...officeSet].map((office) => {
      const s = startRows.find((r) => r.office === office);
      const e = endRows.find((r) => r.office === office);
      const startVal = getVal(s);
      const endVal = getVal(e);
      const diff = endVal - startVal;
      const pct = startVal ? (diff / startVal) * 100 : (endVal ? 100 : 0);
      return { office, region: e?.region || s?.region || 'Unknown', startVal, endVal, diff, pct };
    });

    results.sort((a, b) => b.diff - a.diff);
    return results;
  }, [salesData, rangeStartMonth, rangeEndMonth, selectedRegions, selectedOffices, moversMetric]);

  const mixShiftData = useMemo(() => {
    // Mix shift compares revenue composition at START month vs END month (per office)
    if (!rangeStartMonth || !rangeEndMonth) return { rows: [], totalStart: null, totalEnd: null };

    const startRows = filterRowsByScope(salesData.filter((d) => d.month_start_date === rangeStartMonth));
    const endRows = filterRowsByScope(salesData.filter((d) => d.month_start_date === rangeEndMonth));

    if (!startRows.length || !endRows.length) return { rows: [], totalStart: null, totalEnd: null };

    const totalStart = aggregateRows(startRows, 'START TOTAL');
    const totalEnd = aggregateRows(endRows, 'END TOTAL');

    const officeSet = new Set();
    startRows.forEach((r) => officeSet.add(r.office));
    endRows.forEach((r) => officeSet.add(r.office));

    const calcMix = (r) => {
      const nb = parseFloat(r?.new_business_fees || 0);
      const rn = parseFloat(r?.renewal_fees || 0);
      const en = parseFloat(r?.endorsement_fees || 0);
      const dmv = parseFloat(r?.dmv_fees || 0);
      const total = nb + rn + en + dmv;
      return {
        total,
        nbPct: total ? (nb / total) * 100 : 0,
        rnPct: total ? (rn / total) * 100 : 0,
        enPct: total ? (en / total) * 100 : 0,
        dmvPct: total ? (dmv / total) * 100 : 0,
      };
    };

    const rows = [...officeSet].map((office) => {
      const s = startRows.find((r) => r.office === office);
      const e = endRows.find((r) => r.office === office);
      const sMix = calcMix(s);
      const eMix = calcMix(e);
      return {
        office,
        region: e?.region || s?.region || 'Unknown',
        start: sMix,
        end: eMix,
        shift: {
          nb: eMix.nbPct - sMix.nbPct,
          rn: eMix.rnPct - sMix.rnPct,
          en: eMix.enPct - sMix.enPct,
          dmv: eMix.dmvPct - sMix.dmvPct,
        },
      };
    });

    return { rows, totalStart, totalEnd };
  }, [salesData, rangeStartMonth, rangeEndMonth, selectedRegions, selectedOffices]);

  // Auto-sync offices list when regions chosen (nice UX)
  useEffect(() => {
    // If no region selected, don't force offices.
    if (selectedRegions.length === 0) return;

    // If user already selected offices, keep them (but remove offices not in region)
    const allowed = new Set();
    selectedRegions.forEach((r) => (officesByRegion[r] || []).forEach((o) => allowed.add(o)));

    setSelectedOffices((prev) => prev.filter((o) => allowed.has(o)));
  }, [selectedRegions, officesByRegion]);

  // -------------------------
  // RENDER HELPERS
  // -------------------------
  const renderGrandTotalRow = () => {
    if (!processedData.grandTotal) return null;
    const gt = processedData.grandTotal;

    return (
      <div
        className={styles.grandTotalContainer}
        onClick={() => {
          setModalMetric(METRIC_OPTIONS[0]);
          setSelectedOfficeData(gt);
        }}
        style={{ cursor: 'pointer' }}
        title="Click to view Company Analysis"
      >
        <div className={styles.grandTotalLabel}>
          COMPANY TOTAL{' '}
          <span style={{ fontSize: '0.7rem', display: 'block', color: '#bdc3c7', fontWeight: 'normal' }}>
            (Click for Details)
          </span>
        </div>

        {activeView === 'summary' && (
          <div className={styles.gtGridSummary}>
            <div>
              <span>Total Fees:</span> {formatCurrency(gt.total_fees)}
            </div>
            <div>
              <span>New Biz #:</span> {formatCount(gt.new_business_count)}
            </div>
            <div>
              <span>New Biz $:</span> {formatCurrency(gt.new_business_fees)}
            </div>
            <div>
              <span>Renewals:</span> {formatCount(gt.renewal_count)}
            </div>
            <div>
              <span>DMV $:</span> {formatCurrency(gt.dmv_fees)}
            </div>
          </div>
        )}

        {activeView === 'trends' && (
          <div className={styles.gtGridTrends}>
            <div>
              <span>NB Fees:</span> {formatCurrency(gt.new_business_fees)}
            </div>
            <div>
              <span>MoM:</span> {formatPct(gt.nb_mom_pct)}
            </div>
            <div>
              <span>YoY:</span> {formatPct(gt.nb_yoy_pct)}
            </div>
            <div>
              <span>Total Rev Trend:</span> {formatPct(gt.total_rev_trend)}
            </div>
          </div>
        )}

        {(activeView === 'detailed' || activeView === 'ranking') && (
          <div className={styles.gtGridSummary}>
            <div>
              <span>NB $:</span> {formatCurrency(gt.new_business_fees)}
            </div>
            <div>
              <span>Endorse $:</span> {formatCurrency(gt.endorsement_fees)}
            </div>
            <div>
              <span>DMV $:</span> {formatCurrency(gt.dmv_fees)}
            </div>
            <div>
              <span>Tax $:</span> {formatCurrency(gt.tax_fees)}
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- MODAL A: SUMMARY SNAPSHOT ---
  const renderSummaryModal = () => {
    const curr = selectedOfficeData;
    const yoy = curr.prevYearRow || {};

    let history = [];
    if (curr.isGrandTotal) {
      history = getCompanyHistory();
    } else {
      history = salesData
        .filter((d) => d.office === curr.office && d.month_start_date <= curr.month_start_date)
        .sort((a, b) => new Date(b.month_start_date) - new Date(a.month_start_date))
        .slice(0, 6)
        .reverse();
    }

    const getVal = (row, key) => {
      if (!row) return 0;
      if (key === 'total_fees') {
        return (
          parseFloat(row.new_business_fees || 0) +
          parseFloat(row.endorsement_fees || 0) +
          parseFloat(row.dmv_fees || 0) +
          parseFloat(row.renewal_fees || 0)
        );
      }
      return parseFloat(row[key] || 0);
    };

    const metricKey = modalMetric.key;
    const isCount = modalMetric.isCount || false;
    const maxVal = Math.max(...history.map((h) => getVal(h, metricKey)));
    const currentVal = getVal(curr, metricKey);
    const targetVal = getVal(yoy, metricKey);
    const progressPct = targetVal > 0 ? Math.min((currentVal / targetVal) * 100, 100) : currentVal > 0 ? 100 : 0;

    const nbFees = parseFloat(curr.new_business_fees || 0);
    const renewFees = parseFloat(curr.renewal_fees || 0);
    const endorseFees = parseFloat(curr.endorsement_fees || 0);
    const totalMix = nbFees + renewFees + endorseFees;

    const nbPct = totalMix ? (nbFees / totalMix) * 100 : 0;
    const renewPct = totalMix ? (renewFees / totalMix) * 100 : 0;
    const endorsePct = totalMix ? (endorseFees / totalMix) * 100 : 0;

    return (
      <div className={styles.modalOverlay} onClick={() => setSelectedOfficeData(null)}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <div>
              <h2 style={{ margin: 0 }}>Performance: {curr.office}</h2>
              <span style={{ fontSize: '0.85rem', color: '#666' }}>{curr.month_start_date}</span>
            </div>
            <button onClick={() => setSelectedOfficeData(null)}>✖</button>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#666' }}>ANALYSIS VIEW:</label>
            <select
              className={styles.modalSelect}
              value={modalMetric.key}
              onChange={(e) => {
                const selected = METRIC_OPTIONS.find((m) => m.key === e.target.value);
                setModalMetric(selected);
              }}
            >
              {METRIC_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.comparisonGrid}>
            <div className={styles.compCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4>{modalMetric.label}</h4>
                <div className={styles.badgeNeutral}>Vs Last Year</div>
              </div>
              <div className={styles.heroNumber}>{isCount ? formatCount(currentVal) : formatCurrency(currentVal)}</div>
              <div style={{ marginTop: '15px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    marginBottom: '2px',
                  }}
                >
                  <span>Progress to beat Last Year</span>
                  <span>Target: {isCount ? formatCount(targetVal) : formatCurrency(targetVal)}</span>
                </div>
                <div className={styles.progressBarBg}>
                  <div
                    className={styles.progressBarFill}
                    style={{
                      width: `${progressPct}%`,
                      backgroundColor: progressPct >= 100 ? '#27ae60' : '#3498db',
                    }}
                  ></div>
                </div>
              </div>
              <div style={{ marginTop: '25px' }}>
                <span style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase' }}>6-Month Trend</span>
                <div className={styles.trendContainer}>
                  {history.map((h, i) => {
                    const val = getVal(h, metricKey);
                    const heightPct = maxVal ? (val / maxVal) * 100 : 0;
                    const isCurrent = i === history.length - 1;
                    const monthShort = new Date(h.month_start_date).toLocaleDateString('default', { month: 'short' });
                    return (
                      <div key={i} className={styles.trendBarWrapper}>
                        <div
                          className={styles.trendBar}
                          style={{ height: `${heightPct}%`, backgroundColor: isCurrent ? '#c0392b' : '#bdc3c7' }}
                        ></div>
                        <div className={styles.trendLabelVal}>
                          {isCount ? val : val > 999 ? (val / 1000).toFixed(1) + 'k' : val.toFixed(0)}
                        </div>
                        <div className={styles.trendLabelMonth}>{monthShort}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={styles.compCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h4>Revenue Composition</h4>
                <div className={styles.heroNumber} style={{ fontSize: '1.8rem' }}>
                  {formatCurrency(getVal(curr, 'total_fees'))}
                  <span style={{ fontSize: '0.9rem', color: '#666', fontWeight: 'normal', marginLeft: '10px' }}>
                    Total Fees
                  </span>
                </div>
                <div className={styles.mixBarContainer}>
                  <div className={styles.mixSegment} style={{ width: `${nbPct}%`, backgroundColor: '#c0392b' }}></div>
                  <div className={styles.mixSegment} style={{ width: `${renewPct}%`, backgroundColor: '#f1c40f' }}></div>
                  <div className={styles.mixSegment} style={{ width: `${endorsePct}%`, backgroundColor: '#3498db' }}></div>
                </div>
                <div className={styles.mixLegend}>
                  <span>
                    <span className={styles.dot} style={{ background: '#c0392b' }}></span> New Biz
                  </span>
                  <span>
                    <span className={styles.dot} style={{ background: '#f1c40f' }}></span> Renewal
                  </span>
                  <span>
                    <span className={styles.dot} style={{ background: '#3498db' }}></span> Endorse
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- MODAL B: EXECUTIVE ANALYSIS ---
  const renderExecutiveModal = () => {
    const curr = selectedOfficeData;
    const kpi = getKPIMetrics(curr);
    if (!kpi) return null;

    return (
      <div className={styles.modalOverlay} onClick={() => setSelectedOfficeData(null)}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <div>
              <h2 style={{ margin: 0, color: '#c0392b' }}>📈 Executive Analysis: {curr.office}</h2>
              <span style={{ fontSize: '0.85rem', color: '#666' }}>
                {curr.region} • {curr.month_start_date}
              </span>
            </div>
            {!curr.isGrandTotal && (
              <div className={styles.rankBadge}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Region Rank</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>
                  #{kpi.rank} <span style={{ fontSize: '0.9rem', color: '#ccc' }}>/ {kpi.totalPeers}</span>
                </div>
              </div>
            )}
          </div>

          <div className={styles.comparisonGrid}>
            <div className={styles.compCard} style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4>Year-to-Date (YTD) Performance</h4>
                <div className={kpi.ytdPct >= 0 ? styles.badgeGreen : styles.badgeRed}>
                  {kpi.ytdPct > 0 ? '▲ Ahead of' : '▼ Behind'} Last Year by {Math.abs(kpi.ytdPct).toFixed(1)}%
                </div>
              </div>
              <div className={styles.ytdContainer}>
                <div className={styles.ytdRow}>
                  <div style={{ width: '80px', fontWeight: 'bold' }}>2025 YTD</div>
                  <div className={styles.ytdBarBg}>
                    <div className={styles.ytdBarFill} style={{ width: '100%', background: '#2c3e50' }}></div>
                  </div>
                  <div style={{ width: '80px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(kpi.currentYTD)}</div>
                </div>
                <div className={styles.ytdRow}>
                  <div style={{ width: '80px', color: '#7f8c8d' }}>2024 YTD</div>
                  <div className={styles.ytdBarBg}>
                    <div
                      className={styles.ytdBarFill}
                      style={{
                        width: `${Math.min((kpi.prevYTD / (kpi.currentYTD || 1)) * 100, 100)}%`,
                        background: '#95a5a6',
                      }}
                    ></div>
                  </div>
                  <div style={{ width: '80px', textAlign: 'right', color: '#7f8c8d' }}>{formatCurrency(kpi.prevYTD)}</div>
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '10px', textAlign: 'center' }}>
                {curr.office} has generated <b>{formatCurrency(kpi.ytdDiff)} {kpi.ytdDiff >= 0 ? 'more' : 'less'}</b> in fees than at this point last year.
              </div>
            </div>

            <div className={styles.compCard}>
              <h4>Momentum (Vs. 3-Mo Avg)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '15px' }}>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: kpi.velocityDiff >= 0 ? '#27ae60' : '#c0392b' }}>
                  {kpi.velocityDiff >= 0 ? '+' : ''}
                  {formatCurrency(kpi.velocityDiff)}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '15px' }}>vs recent average</div>

                <div className={styles.velocityGrid}>
                  <div>
                    <span>Current Month</span>
                    <strong>{formatCurrency(curr.new_business_fees)}</strong>
                  </div>
                  <div>
                    <span>3-Mo Avg</span>
                    <strong>{formatCurrency(kpi.avg3Month)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.compCard}>
              <h4>Efficiency Metrics</h4>
              <div style={{ marginTop: '15px' }}>
                <div className={styles.statRow}>
                  <span>Avg Fee / New Biz</span>
                  <strong>${formatAvg(curr.new_business_fees, curr.new_business_count)}</strong>
                </div>
                <div className={styles.statRow}>
                  <span>Avg Fee / Renewal</span>
                  <strong>${formatAvg(curr.renewal_fees, curr.renewal_count)}</strong>
                </div>
                <div className={styles.statRow} style={{ borderTop: '1px solid #eee', paddingTop: '10px', marginTop: '10px' }}>
                  <span>MoM Growth</span>
                  <span style={{ fontWeight: 'bold', color: curr.nb_mom_pct >= 0 ? 'green' : 'red' }}>{formatPct(curr.nb_mom_pct)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDrillDownModal = () => {
    if (!selectedOfficeData) return null;
    if (activeView === 'trends') return renderExecutiveModal();
    return renderSummaryModal();
  };

  // --- TABLES RENDERING ---
  const renderSummaryTable = (rows) => (
    <table className={styles.ticketsTable}>
      <thead>
        <tr>
          <th style={{ width: '150px' }}>Office</th>
          <th>Total Fees</th>
          <th>New Biz #</th>
          <th>New Biz Fees</th>
          <th>Renewals #</th>
          <th>DMV Fees</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            onClick={() => {
              setModalMetric(METRIC_OPTIONS[0]);
              setSelectedOfficeData(row);
            }}
            className={styles.clickableRow}
          >
            <td style={{ fontWeight: 'bold' }}>{row.office}</td>
            <td style={{ fontWeight: 'bold', color: '#2c3e50' }}>{formatCurrency(row.total_fees)}</td>
            <td>{formatCount(row.new_business_count)}</td>
            <td>{formatCurrency(row.new_business_fees)}</td>
            <td>{formatCount(row.renewal_count)}</td>
            <td>{formatCurrency(row.dmv_fees)}</td>
            <td>
              <button className={styles.viewBtn}>View</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderTrendsTable = (rows) => (
    <table className={styles.ticketsTable}>
      <thead>
        <tr>
          <th style={{ width: '150px' }}>Office</th>
          <th style={{ backgroundColor: '#f0f8ff' }}>NB Fees (Curr)</th>
          <th style={{ backgroundColor: '#f0f8ff' }}>MoM %</th>
          <th style={{ backgroundColor: '#fff0f0' }}>YoY %</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            onClick={() => {
              setModalMetric(METRIC_OPTIONS[0]);
              setSelectedOfficeData(row);
            }}
            className={styles.clickableRow}
          >
            <td style={{ fontWeight: 'bold' }}>{row.office}</td>
            <td>{formatCurrency(row.new_business_fees)}</td>
            <td>
              {row.nb_mom_pct > 0 ? <ArrowUp /> : row.nb_mom_pct < 0 ? <ArrowDown /> : ''} {formatPct(row.nb_mom_pct)}
            </td>
            <td>{formatPct(row.nb_yoy_pct)}</td>
            <td>
              <button className={styles.viewBtn}>Compare</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // --- NEW: RANKINGS TABLE ---
  const renderRankingsTable = (rows) => {
    const sortedRows = [...rows].sort((a, b) => {
      const valA = parseFloat(a[sortConfig.key] || 0);
      const valB = parseFloat(b[sortConfig.key] || 0);
      return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });

    const maxVal = Math.max(...sortedRows.map((r) => parseFloat(r[sortConfig.key] || 0)));

    const handleSort = (key) => {
      let direction = 'desc';
      if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
      setSortConfig({ key, direction });
    };

    return (
      <div style={{ overflowX: 'auto', maxWidth: '100%', background: 'white', borderRadius: '8px', padding: '10px' }}>
        <h3 style={{ margin: '10px 0', color: '#f1c40f' }}>🏆 Company Leaderboard</h3>
        <table className={styles.ticketsTable}>
          <thead>
            <tr>
              <th style={{ width: '50px' }}>Rank</th>
              <th style={{ width: '150px' }}>Office</th>
              <th style={{ width: '100px' }}>Region</th>
              <th
                onClick={() => handleSort('new_business_fees')}
                style={{ cursor: 'pointer', textDecoration: sortConfig.key === 'new_business_fees' ? 'underline' : 'none' }}
              >
                New Biz Fees {sortConfig.key === 'new_business_fees' && (sortConfig.direction === 'desc' ? '▼' : '▲')}
              </th>
              <th
                onClick={() => handleSort('new_business_count')}
                style={{ cursor: 'pointer', textDecoration: sortConfig.key === 'new_business_count' ? 'underline' : 'none' }}
              >
                New Biz # {sortConfig.key === 'new_business_count' && (sortConfig.direction === 'desc' ? '▼' : '▲')}
              </th>
              <th
                onClick={() => handleSort('total_fees')}
                style={{ cursor: 'pointer', textDecoration: sortConfig.key === 'total_fees' ? 'underline' : 'none' }}
              >
                Total Fees {sortConfig.key === 'total_fees' && (sortConfig.direction === 'desc' ? '▼' : '▲')}
              </th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => {
              const isTop3 = index < 3;
              const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1;
              const barWidth = maxVal ? (parseFloat(row[sortConfig.key] || 0) / maxVal) * 100 : 0;

              return (
                <tr
                  key={row.id}
                  onClick={() => {
                    setModalMetric(METRIC_OPTIONS[0]);
                    setSelectedOfficeData(row);
                  }}
                  className={styles.clickableRow}
                >
                  <td style={{ fontSize: '1.2rem', textAlign: 'center', fontWeight: isTop3 ? 'bold' : 'normal' }}>
                    {rankIcon}
                  </td>
                  <td style={{ fontWeight: 'bold' }}>{row.office}</td>
                  <td>
                    <span style={{ fontSize: '0.75rem', background: '#eee', padding: '2px 6px', borderRadius: '4px' }}>
                      {row.region}
                    </span>
                  </td>

                  <td style={{ position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: '10%',
                        bottom: '10%',
                        width: `${barWidth}%`,
                        background: '#fef9e7',
                        zIndex: 0,
                      }}
                    ></div>
                    <span style={{ position: 'relative', zIndex: 1, fontWeight: 'bold', color: '#d35400' }}>
                      {formatCurrency(row.new_business_fees)}
                    </span>
                  </td>

                  <td>{formatCount(row.new_business_count)}</td>
                  <td>{formatCurrency(row.total_fees)}</td>
                  <td>
                    <button className={styles.viewBtn}>Analyze</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // --- FULL DETAILED TABLE (ALL COLUMNS) ---
  const renderDetailedTable = (rows) => (
    <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <table className={styles.ticketsTable}>
        <thead>
          <tr>
            <th className={styles.stickyCol}>Office</th>
            <th>New Business #</th>
            <th>New Business Fees</th>
            <th>NB Avg</th>
            <th>Endorsement #</th>
            <th>Endorsement Fees</th>
            <th>Endorsement Avg</th>
            <th>Installment #</th>
            <th>Installment Fees</th>
            <th>Installment Avg</th>
            <th>DMV #</th>
            <th>DMV Fees</th>
            <th>DMV Avg</th>
            <th>Reissue #</th>
            <th>Reissue Fees</th>
            <th>Reissue Avg</th>
            <th>Renewal #</th>
            <th>Renewal Fees</th>
            <th>Renewal Avg</th>
            <th>Taxes #</th>
            <th>Tax Fees</th>
            <th>Tax Avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={styles.stickyCol}>{row.office}</td>

              <td>{formatCount(row.new_business_count)}</td>
              <td>{formatCurrency(row.new_business_fees)}</td>
              <td>{formatAvg(row.new_business_fees, row.new_business_count)}</td>

              <td>{formatCount(row.endorsement_count)}</td>
              <td>{formatCurrency(row.endorsement_fees)}</td>
              <td>{formatAvg(row.endorsement_fees, row.endorsement_count)}</td>

              <td>{formatCount(row.installment_count)}</td>
              <td>{formatCurrency(row.installment_fees)}</td>
              <td>{formatAvg(row.installment_fees, row.installment_count)}</td>

              <td>{formatCount(row.dmv_count)}</td>
              <td>{formatCurrency(row.dmv_fees)}</td>
              <td>{formatAvg(row.dmv_fees, row.dmv_count)}</td>

              <td>{formatCount(row.reissue_count)}</td>
              <td>{formatCurrency(row.reissue_fees)}</td>
              <td>{formatAvg(row.reissue_fees, row.reissue_count)}</td>

              <td>{formatCount(row.renewal_count)}</td>
              <td>{formatCurrency(row.renewal_fees)}</td>
              <td>{formatAvg(row.renewal_fees, row.renewal_count)}</td>

              <td>{formatCount(row.taxes_count)}</td>
              <td>{formatCurrency(row.tax_fees)}</td>
              <td>{formatAvg(row.tax_fees, row.taxes_count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // -------------------------
  // CUSTOM REPORTS RENDERING
  // -------------------------
  const renderCustomReports = () => {
    const pillStyle = (active) => ({
      padding: '8px 12px',
      borderRadius: 999,
      border: active ? '2px solid #c0392b' : '1px solid #ddd',
      background: active ? '#fff5f5' : '#fff',
      cursor: 'pointer',
      fontWeight: active ? 800 : 600,
      fontSize: '0.85rem',
    });

    const chipStyle = (active) => ({
      padding: '6px 10px',
      borderRadius: 8,
      border: active ? '2px solid #2c3e50' : '1px solid #ddd',
      background: active ? '#f4f6f7' : '#fff',
      cursor: 'pointer',
      fontWeight: active ? 800 : 600,
      fontSize: '0.8rem',
    });

    const scopeLabel = () => {
      const regionText = selectedRegions.length ? selectedRegions.join(', ') : 'All Regions';
      const officeText = selectedOffices.length ? `${selectedOffices.length} offices` : 'All Offices';
      return `${regionText} • ${officeText}`;
    };

    const renderScopeControls = () => (
      <div style={{ background: 'white', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Range controls */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#666' }}>Range (Start → End)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select className={styles.monthSelector} value={rangeStartMonth} onChange={(e) => setRangeStartMonth(e.target.value)}>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {new Date(m).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                  </option>
                ))}
              </select>
              <select className={styles.monthSelector} value={rangeEndMonth} onChange={(e) => setRangeEndMonth(e.target.value)}>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {new Date(m).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Comparison controls (only for comparison) */}
          {customReportType === 'comparison' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#666' }}>Compare Against (Period B)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className={styles.monthSelector} value={compareStartMonth} onChange={(e) => setCompareStartMonth(e.target.value)}>
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {new Date(m).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                    </option>
                  ))}
                </select>
                <select className={styles.monthSelector} value={compareEndMonth} onChange={(e) => setCompareEndMonth(e.target.value)}>
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {new Date(m).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Region multi-select */}
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#666' }}>Regions</div>
            <select
              multiple
              value={selectedRegions}
              onChange={(e) => {
                const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
                setSelectedRegions(vals);
              }}
              style={{ width: '100%', minHeight: 90, padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
            >
              {uniqueRegions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
              <button className={styles.viewBtn} onClick={() => setSelectedRegions(uniqueRegions)}>
                Select All
              </button>
              <button className={styles.viewBtn} onClick={() => setSelectedRegions([])}>
                Clear
              </button>
            </div>
          </div>

          {/* Office multi-select */}
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#666' }}>Offices</div>
            <select
              multiple
              value={selectedOffices}
              onChange={(e) => {
                const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
                setSelectedOffices(vals);
              }}
              style={{ width: '100%', minHeight: 90, padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
            >
              {(selectedRegions.length
                ? selectedRegions.flatMap((r) => officesByRegion[r] || [])
                : allOffices
              )
                .filter(Boolean)
                .filter((v, i, arr) => arr.indexOf(v) === i)
                .sort()
                .map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
            </select>
            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
              <button
                className={styles.viewBtn}
                onClick={() => {
                  const pool = selectedRegions.length
                    ? selectedRegions.flatMap((r) => officesByRegion[r] || [])
                    : allOffices;
                  setSelectedOffices([...new Set(pool)].sort());
                }}
              >
                Select All
              </button>
              <button className={styles.viewBtn} onClick={() => setSelectedOffices([])}>
                Clear
              </button>
            </div>
          </div>

          {/* Movers metric */}
          {customReportType === 'movers' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#666' }}>Movers Metric</div>
              <select className={styles.monthSelector} value={moversMetric} onChange={(e) => setMoversMetric(e.target.value)}>
                <option value="total_fees">Total Fees</option>
                <option value="new_business_fees">New Biz Fees</option>
                <option value="new_business_count">New Biz Count</option>
                <option value="renewal_fees">Renewal Fees</option>
                <option value="dmv_fees">DMV Fees</option>
              </select>
            </div>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
          <b>Scope:</b> {scopeLabel()}
        </div>
      </div>
    );

    const renderRollup = () => (
      <div>
        {rollupData.total ? (
          <div className={styles.grandTotalContainer} style={{ cursor: 'default' }}>
            <div className={styles.grandTotalLabel}>
              SELECTED OFFICES TOTAL
              <span style={{ fontSize: '0.7rem', display: 'block', color: '#bdc3c7', fontWeight: 'normal' }}>
                {rangeStartMonth} → {rangeEndMonth}
              </span>
            </div>
            <div className={styles.gtGridSummary}>
              <div><span>Total Fees:</span> {formatCurrency(rollupData.total.total_fees)}</div>
              <div><span>New Biz #:</span> {formatCount(rollupData.total.new_business_count)}</div>
              <div><span>New Biz $:</span> {formatCurrency(rollupData.total.new_business_fees)}</div>
              <div><span>Renewals:</span> {formatCount(rollupData.total.renewal_count)}</div>
              <div><span>DMV $:</span> {formatCurrency(rollupData.total.dmv_fees)}</div>
            </div>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 10, padding: 14, color: '#888' }}>
            No data for that selection.
          </div>
        )}

        {rollupData.perOffice.length > 0 && (
          <div style={{ marginTop: 12, background: 'white', borderRadius: 10, padding: 10 }}>
            <h3 style={{ margin: '6px 0 10px 0' }}>Multi-Office Rollup</h3>
            <table className={styles.ticketsTable}>
              <thead>
                <tr>
                  <th style={{ width: '150px' }}>Office</th>
                  <th>Total Fees</th>
                  <th>New Biz #</th>
                  <th>New Biz Fees</th>
                  <th>Renewals #</th>
                  <th>DMV Fees</th>
                </tr>
              </thead>
              <tbody>
                {rollupData.perOffice.map((r) => (
                  <tr key={r.office}>
                    <td style={{ fontWeight: 'bold' }}>{r.office}</td>
                    <td style={{ fontWeight: 'bold' }}>{formatCurrency(r.total_fees)}</td>
                    <td>{formatCount(r.new_business_count)}</td>
                    <td>{formatCurrency(r.new_business_fees)}</td>
                    <td>{formatCount(r.renewal_count)}</td>
                    <td>{formatCurrency(r.dmv_fees)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );

    const renderComparison = () => {
      const a = comparisonData.aTotal;
      const b = comparisonData.bTotal;

      const diffPct = (curr, past) => (past ? ((curr - past) / past) * 100 : (curr ? 100 : 0));
      const row = (label, aVal, bVal, isCount = false) => {
        const diff = aVal - bVal;
        const pct = diffPct(aVal, bVal);
        return (
          <tr key={label}>
            <td style={{ fontWeight: 800 }}>{label}</td>
            <td>{isCount ? formatCount(aVal) : formatCurrency(aVal)}</td>
            <td>{isCount ? formatCount(bVal) : formatCurrency(bVal)}</td>
            <td style={{ fontWeight: 800, color: diff >= 0 ? '#27ae60' : '#c0392b' }}>
              {isCount ? formatCount(diff) : formatCurrency(diff)}
            </td>
            <td>{formatPct(pct)}</td>
          </tr>
        );
      };

      if (!a || !b) {
        return <div style={{ background: 'white', borderRadius: 10, padding: 14, color: '#888' }}>Select ranges that contain data.</div>;
      }

      return (
        <div style={{ background: 'white', borderRadius: 10, padding: 10 }}>
          <h3 style={{ margin: '6px 0 10px 0' }}>Period Comparison</h3>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
            <b>Period A:</b> {rangeStartMonth} → {rangeEndMonth} &nbsp; | &nbsp;
            <b>Period B:</b> {compareStartMonth} → {compareEndMonth}
          </div>
          <table className={styles.ticketsTable}>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Period A</th>
                <th>Period B</th>
                <th>Δ</th>
                <th>Δ%</th>
              </tr>
            </thead>
            <tbody>
              {row('Total Fees', a.total_fees, b.total_fees)}
              {row('New Biz Fees', a.new_business_fees, b.new_business_fees)}
              {row('New Biz Count', a.new_business_count, b.new_business_count, true)}
              {row('Renewal Fees', a.renewal_fees, b.renewal_fees)}
              {row('DMV Fees', a.dmv_fees, b.dmv_fees)}
              {row('Endorsement Fees', a.endorsement_fees, b.endorsement_fees)}
              {row('Tax Fees', a.tax_fees, b.tax_fees)}
            </tbody>
          </table>
        </div>
      );
    };

    const renderMovers = () => {
      const top = moversData.slice(0, 5);
      const bottom = [...moversData].reverse().slice(0, 5);

      const formatMetric = (v) => (moversMetric.includes('count') ? formatCount(v) : formatCurrency(v));

      if (!moversData.length) {
        return <div style={{ background: 'white', borderRadius: 10, padding: 14, color: '#888' }}>Select start/end months that contain data.</div>;
      }

      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'white', borderRadius: 10, padding: 10 }}>
            <h3 style={{ margin: '6px 0 10px 0' }}>🚀 Top Movers</h3>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
              <b>Metric:</b> {moversMetric} &nbsp; | &nbsp; <b>{rangeStartMonth}</b> → <b>{rangeEndMonth}</b>
            </div>
            <table className={styles.ticketsTable}>
              <thead>
                <tr>
                  <th>Office</th>
                  <th>Δ</th>
                  <th>Δ%</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r) => (
                  <tr key={r.office}>
                    <td style={{ fontWeight: 800 }}>{r.office}</td>
                    <td style={{ fontWeight: 800, color: r.diff >= 0 ? '#27ae60' : '#c0392b' }}>
                      {r.diff >= 0 ? '+' : ''}
                      {formatMetric(r.diff)}
                    </td>
                    <td>{formatPct(r.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background: 'white', borderRadius: 10, padding: 10 }}>
            <h3 style={{ margin: '6px 0 10px 0' }}>📉 Bottom Movers</h3>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
              <b>Metric:</b> {moversMetric} &nbsp; | &nbsp; <b>{rangeStartMonth}</b> → <b>{rangeEndMonth}</b>
            </div>
            <table className={styles.ticketsTable}>
              <thead>
                <tr>
                  <th>Office</th>
                  <th>Δ</th>
                  <th>Δ%</th>
                </tr>
              </thead>
              <tbody>
                {bottom.map((r) => (
                  <tr key={r.office}>
                    <td style={{ fontWeight: 800 }}>{r.office}</td>
                    <td style={{ fontWeight: 800, color: r.diff >= 0 ? '#27ae60' : '#c0392b' }}>
                      {r.diff >= 0 ? '+' : ''}
                      {formatMetric(r.diff)}
                    </td>
                    <td>{formatPct(r.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ gridColumn: '1 / -1', background: 'white', borderRadius: 10, padding: 10 }}>
            <h3 style={{ margin: '6px 0 10px 0' }}>All Offices (Sorted by Δ)</h3>
            <table className={styles.ticketsTable}>
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Office</th>
                  <th>Region</th>
                  <th>{rangeStartMonth}</th>
                  <th>{rangeEndMonth}</th>
                  <th>Δ</th>
                  <th>Δ%</th>
                </tr>
              </thead>
              <tbody>
                {moversData.map((r) => (
                  <tr key={r.office}>
                    <td style={{ fontWeight: 800 }}>{r.office}</td>
                    <td>{r.region}</td>
                    <td>{formatMetric(r.startVal)}</td>
                    <td>{formatMetric(r.endVal)}</td>
                    <td style={{ fontWeight: 800, color: r.diff >= 0 ? '#27ae60' : '#c0392b' }}>
                      {r.diff >= 0 ? '+' : ''}
                      {formatMetric(r.diff)}
                    </td>
                    <td>{formatPct(r.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    };

    const renderMixShift = () => {
      const { rows } = mixShiftData;

      if (!rows.length) {
        return <div style={{ background: 'white', borderRadius: 10, padding: 14, color: '#888' }}>Select start/end months that contain data.</div>;
      }

      const seg = (pct, color) => (
        <div style={{ width: `${Math.max(0, pct)}%`, background: color, height: 10, borderRadius: 6 }} />
      );

      return (
        <div style={{ background: 'white', borderRadius: 10, padding: 10 }}>
          <h3 style={{ margin: '6px 0 10px 0' }}>Revenue Mix Shift</h3>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
            Compare composition from <b>{rangeStartMonth}</b> → <b>{rangeEndMonth}</b>
          </div>

          <table className={styles.ticketsTable}>
            <thead>
              <tr>
                <th style={{ width: 160 }}>Office</th>
                <th>Start Mix</th>
                <th>End Mix</th>
                <th>Shift (NB / Ren / End / DMV)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.office}>
                  <td style={{ fontWeight: 800 }}>{r.office}</td>

                  <td>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {seg(r.start.nbPct, '#c0392b')}
                      {seg(r.start.rnPct, '#f1c40f')}
                      {seg(r.start.enPct, '#3498db')}
                      {seg(r.start.dmvPct, '#2ecc71')}
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                      NB {r.start.nbPct.toFixed(0)}% • Ren {r.start.rnPct.toFixed(0)}% • End {r.start.enPct.toFixed(0)}% • DMV {r.start.dmvPct.toFixed(0)}%
                    </div>
                  </td>

                  <td>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {seg(r.end.nbPct, '#c0392b')}
                      {seg(r.end.rnPct, '#f1c40f')}
                      {seg(r.end.enPct, '#3498db')}
                      {seg(r.end.dmvPct, '#2ecc71')}
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                      NB {r.end.nbPct.toFixed(0)}% • Ren {r.end.rnPct.toFixed(0)}% • End {r.end.enPct.toFixed(0)}% • DMV {r.end.dmvPct.toFixed(0)}%
                    </div>
                  </td>

                  <td style={{ fontSize: 12 }}>
                    <span style={{ color: r.shift.nb >= 0 ? '#27ae60' : '#c0392b', fontWeight: 800 }}>
                      NB {r.shift.nb >= 0 ? '+' : ''}{r.shift.nb.toFixed(1)}%
                    </span>
                    {'  '}|{'  '}
                    <span style={{ color: r.shift.rn >= 0 ? '#27ae60' : '#c0392b', fontWeight: 800 }}>
                      Ren {r.shift.rn >= 0 ? '+' : ''}{r.shift.rn.toFixed(1)}%
                    </span>
                    {'  '}|{'  '}
                    <span style={{ color: r.shift.en >= 0 ? '#27ae60' : '#c0392b', fontWeight: 800 }}>
                      End {r.shift.en >= 0 ? '+' : ''}{r.shift.en.toFixed(1)}%
                    </span>
                    {'  '}|{'  '}
                    <span style={{ color: r.shift.dmv >= 0 ? '#27ae60' : '#c0392b', fontWeight: 800 }}>
                      DMV {r.shift.dmv >= 0 ? '+' : ''}{r.shift.dmv.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 12, color: '#666', marginTop: 10 }}>
            <b>Legend:</b> <span style={{ color: '#c0392b' }}>New Biz</span> • <span style={{ color: '#f1c40f' }}>Renewal</span> •{' '}
            <span style={{ color: '#3498db' }}>Endorse</span> • <span style={{ color: '#2ecc71' }}>DMV</span>
          </div>
        </div>
      );
    };

    return (
      <div>
        {/* Report-type pills */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={pillStyle(customReportType === 'rollup')} onClick={() => setCustomReportType('rollup')}>
            📊 Multi-Office Rollup
          </div>
          <div style={pillStyle(customReportType === 'comparison')} onClick={() => setCustomReportType('comparison')}>
            🔄 Period Comparison
          </div>
          <div style={pillStyle(customReportType === 'movers')} onClick={() => setCustomReportType('movers')}>
            🚀 Top / Bottom Movers
          </div>
          <div style={pillStyle(customReportType === 'mix')} onClick={() => setCustomReportType('mix')}>
            🧠 Revenue Mix Shift
          </div>
        </div>

        {renderScopeControls()}

        {/* Optional small chips to guide user */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={chipStyle(true)}><b>Scope:</b> {scopeLabel()}</div>
          <div style={chipStyle(true)}><b>Range:</b> {rangeStartMonth} → {rangeEndMonth}</div>
          {customReportType === 'comparison' && (
            <div style={chipStyle(true)}><b>Compare:</b> {compareStartMonth} → {compareEndMonth}</div>
          )}
        </div>

        {customReportType === 'rollup' && renderRollup()}
        {customReportType === 'comparison' && renderComparison()}
        {customReportType === 'movers' && renderMovers()}
        {customReportType === 'mix' && renderMixShift()}
      </div>
    );
  };

  // --- MAIN RETURN ---
  if (loading) return <h2>Loading...</h2>;
  if (error) return <h2>Error: {error}</h2>;

  return (
    <div>
      {renderDrillDownModal()}

      <div className={styles.pageHeader}>
        <h1>Office Performance</h1>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className={styles.monthSelector}>
          {monthOptions.map((month) => (
            <option key={month} value={month}>
              {new Date(month).toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </option>
          ))}
        </select>
      </div>

      {/* PRIMARY TABS (yellow-highlight location) */}
      <div className={styles.tabContainer}>
        <button onClick={() => setActiveView('summary')} className={activeView === 'summary' ? styles.activeTab : styles.inactiveTab}>
          📊 Summary
        </button>
        <button onClick={() => setActiveView('trends')} className={activeView === 'trends' ? styles.activeTab : styles.inactiveTab}>
          📈 KPI & Trends
        </button>
        <button onClick={() => setActiveView('detailed')} className={activeView === 'detailed' ? styles.activeTab : styles.inactiveTab}>
          📑 Full Detail
        </button>
        <button onClick={() => setActiveView('ranking')} className={activeView === 'ranking' ? styles.activeTab : styles.inactiveTab}>
          🏆 Leaderboard
        </button>
        <button onClick={() => setActiveView('custom')} className={activeView === 'custom' ? styles.activeTab : styles.inactiveTab}>
          🧩 Custom Reports
        </button>
      </div>

      {/* Company total stays for native views; hide it for custom so it doesn't confuse the scope */}
      {activeView !== 'custom' && renderGrandTotalRow()}

      {/* RENDER CONTENT BASED ON VIEW */}

      {/* 1. CUSTOM REPORTS */}
      {activeView === 'custom' && renderCustomReports()}

      {/* 2. RANKING VIEW (No Regions, Just List) */}
      {activeView === 'ranking' && renderRankingsTable(processedData.flatList)}

      {/* 3. REGIONAL VIEWS (Summary, Trends, Detail) */}
      {activeView !== 'ranking' &&
        activeView !== 'custom' &&
        Object.keys(processedData.grouped)
          .sort()
          .map((region) => (
            <div key={region} className={styles.regionTableContainer}>
              <h2 style={{ borderBottom: '2px solid #c0392b', paddingBottom: '5px' }}>{region}</h2>
              {activeView === 'summary' && renderSummaryTable(processedData.grouped[region])}
              {activeView === 'trends' && renderTrendsTable(processedData.grouped[region])}
              {activeView === 'detailed' && renderDetailedTable(processedData.grouped[region])}
            </div>
          ))}
    </div>
  );
};

export default OfficeNumbers;

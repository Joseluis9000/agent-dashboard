// OfficeNumbers.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

const PAGE_SIZE = 1000;
const SETTINGS_STORAGE_KEY = 'officeNumbersPacingSettingsV5';

const FEE_TYPE_OPTIONS = [
  { value: 'broker', label: 'Broker Fee' },
  { value: 'endorsement', label: 'Endorsement Fee' },
  { value: 'renewal', label: 'Renewal Fee' },
  { value: 'reinstatement', label: 'Reinstatement Fee' },
  { value: 'payment', label: 'Payment Fee' },
  { value: 'registration', label: 'Registration Fee' },
  { value: 'convenience', label: 'Convenience Fee' },
  { value: 'tax_prep', label: 'Tax Prep / Product Fee' },
  { value: 'all', label: 'All Fees' },
];

const cleanStr = (value) => String(value ?? '').replace(/\r/g, '').trim();

const parseMoney = (value) => {
  const parsed = parseFloat(String(value || '0').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeOffice = (officeRaw = '') => {
  const match = String(officeRaw || '').match(/CA\d{3}/i);
  return match ? match[0].toUpperCase() : cleanStr(officeRaw) || 'Unknown';
};

const getOfficeNumber = (office = '') => {
  const match = String(office).match(/CA(\d{3})/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const getDateKeyFromTransfer = (row) => {
  const raw = cleanStr(row?.date_time);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

const isVoidedRow = (row) => cleanStr(row?.voided).toUpperCase().includes('VOIDED');

const getTransferTxnKey = (row) => {
  if (row.sync_key) return `sync:${row.sync_key}`;

  const receipt = cleanStr(row.receipt_id || row.receipt || '');
  const customerId = cleanStr(row.customer_id || row.id || '');
  const premium = parseMoney(row.premium).toFixed(2);
  const fee = parseMoney(row.fee).toFixed(2);
  const total = parseMoney(row.total).toFixed(2);
  const company = cleanStr(row.company);
  const type = cleanStr(row.type);

  return `${receipt}|${customerId}|${premium}|${fee}|${total}|${company}|${type}`;
};

const getFeeCategory = (row) => {
  const company = cleanStr(row?.company).toUpperCase();
  const policyType = cleanStr(row?.policy_type).toUpperCase();
  const type = cleanStr(row?.type).toUpperCase();
  const policy = cleanStr(row?.policy).toUpperCase();
  const combined = `${company} ${policyType} ${type} ${policy}`;

  if (combined.includes('BROKER FEE')) return 'broker';
  if (combined.includes('ENDORSEMENT FEE')) return 'endorsement';
  if (combined.includes('RENEWAL FEE')) return 'renewal';
  if (combined.includes('REINSTATEMENT FEE')) return 'reinstatement';
  if (combined.includes('PAYMENT FEE')) return 'payment';
  if (combined.includes('REGISTRATION FEE')) return 'registration';
  if (combined.includes('CONVENIENCE FEE')) return 'convenience';

  if (
    combined.includes('TAX PREP') ||
    combined.includes('TAX ESTIMATE') ||
    combined.includes('DEFENDMYID') ||
    combined.includes('MAX SHIELD')
  ) {
    return 'tax_prep';
  }

  return null;
};

const createFeeBucket = () => ({
  broker: 0,
  endorsement: 0,
  renewal: 0,
  reinstatement: 0,
  payment: 0,
  registration: 0,
  convenience: 0,
  tax_prep: 0,
  all: 0,
});

const calculateTransactionSummary = (rows = []) => {
  const seenTxn = new Set();
  let excludedRowsCount = 0;

  const validRows = rows.filter((row) => {
    if (isVoidedRow(row)) {
      excludedRowsCount += 1;
      return false;
    }

    const txnKey = getTransferTxnKey(row);
    if (seenTxn.has(txnKey)) {
      excludedRowsCount += 1;
      return false;
    }

    seenTxn.add(txnKey);
    return true;
  });

  let newBusinessCount = 0;
  let rewriteCount = 0;
  const feeTotals = createFeeBucket();
  const feeCounts = createFeeBucket();

  validRows.forEach((row) => {
    const type = cleanStr(row.type).toUpperCase();
    const fee = parseMoney(row.fee);

    if (type === 'NEW') newBusinessCount += 1;
    if (type === 'RWR') rewriteCount += 1;

    if (Math.abs(fee) > 0.0001) {
      feeTotals.all += fee;
      feeCounts.all += Math.sign(fee);
    }

    const feeCategory = getFeeCategory(row);
    if (feeCategory) {
      feeTotals[feeCategory] += fee;
      feeCounts[feeCategory] += Math.sign(fee);
    }
  });

  const validReceiptCount = new Set(
    validRows
      .map((row) => cleanStr(row.receipt_id || row.receipt || ''))
      .filter(Boolean)
  ).size;

  return {
    nb_rw_count: newBusinessCount + rewriteCount,
    new_business_count: newBusinessCount,
    rewrite_count: rewriteCount,
    fee_totals: feeTotals,
    fee_counts: feeCounts,
    raw_rows_count: rows.length,
    valid_rows_count: validRows.length,
    valid_receipts_count: validReceiptCount,
    excluded_rows_count: excludedRowsCount,
  };
};

const getCurrentMonthValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthDetails = (monthValue) => {
  const [year, month] = monthValue.split('-').map(Number);
  const nextMonthDate = new Date(year, month, 1);

  return {
    year,
    month,
    firstDay: `${year}-${String(month).padStart(2, '0')}-01`,
    nextMonthFirstDay: `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`,
    daysInMonth: new Date(year, month, 0).getDate(),
  };
};

const getComparisonMonthDetails = (monthValue) => {
  const [year, month] = monthValue.split('-').map(Number);

  const lastMonthDate = new Date(year, month - 2, 1);
  const lastYearDate = new Date(year - 1, month - 1, 1);

  const toMonthValue = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  return {
    lastMonth: {
      value: toMonthValue(lastMonthDate),
      ...getMonthDetails(toMonthValue(lastMonthDate)),
    },
    lastYear: {
      value: toMonthValue(lastYearDate),
      ...getMonthDetails(toMonthValue(lastYearDate)),
    },
  };
};

const buildHistoricalMetricMap = (rows, selectedFeeType, usesNbRwCount) => {
  const rowsByOffice = new Map();

  rows.forEach((row) => {
    const office = normalizeOffice(row.office);
    if (!office) return;

    if (!rowsByOffice.has(office)) rowsByOffice.set(office, []);
    rowsByOffice.get(office).push(row);
  });

  const metricByOffice = {};

  rowsByOffice.forEach((officeRows, office) => {
    const summary = calculateTransactionSummary(officeRows);
    const selectedFeeCount = summary.fee_counts[selectedFeeType] || 0;

    metricByOffice[office] = usesNbRwCount
      ? summary.nb_rw_count
      : selectedFeeCount;
  });

  return metricByOffice;
};

const getMonthLabel = (monthValue) => {
  const [year, month] = monthValue.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1));
};

const formatDateLabel = (dateKey) => {
  if (!dateKey) return 'No data loaded';
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
};

const formatCurrency = (value, digits = 0) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
}).format(Number(value) || 0);

const formatNumber = (value) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const formatDecimal = (value) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
}).format(Number(value) || 0);


const normalizeAgent = (row) => {
  const email = cleanStr(row?.agent_email).toLowerCase();
  return email || 'Unknown Agent';
};



const buildAgentHistoricalMetricMap = (rows, selectedFeeType, usesNbRwCount) => {
  const grouped = new Map();
  rows.forEach((row) => {
    const agent = normalizeAgent(row);
    if (!grouped.has(agent)) grouped.set(agent, []);
    grouped.get(agent).push(row);
  });
  const output = {};
  grouped.forEach((agentRows, agent) => {
    const summary = calculateTransactionSummary(agentRows);
    output[agent] = usesNbRwCount
      ? summary.nb_rw_count
      : (summary.fee_counts[selectedFeeType] || 0);
  });
  return output;
};

const getMostRecentCsrName = (rows = [], fallbackEmail = '') => {
  const sortedRows = [...rows].sort((a, b) => {
    const aDate = cleanStr(a?.date_time);
    const bDate = cleanStr(b?.date_time);
    return bDate.localeCompare(aDate);
  });

  const latestNamedRow = sortedRows.find((row) => cleanStr(row?.csr));

  if (latestNamedRow) {
    return cleanStr(latestNamedRow.csr);
  }

  const emailPrefix = cleanStr(fallbackEmail).split('@')[0] || 'Unknown Agent';

  return emailPrefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const getAgentOfficeAndRegion = (rows = [], officeRegions = {}) => {
  const officeCounts = new Map();

  rows.forEach((row) => {
    const office = normalizeOffice(row.office);
    if (!office || office === 'Unknown') return;
    officeCounts.set(office, (officeCounts.get(office) || 0) + 1);
  });

  const offices = Array.from(officeCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return getOfficeNumber(a[0]) - getOfficeNumber(b[0]);
    })
    .map(([office]) => office);

  const primaryOffice = offices[0] || 'Unknown';

  const regions = Array.from(
    new Set(
      offices
        .map((office) => cleanStr(officeRegions[office]))
        .filter(Boolean)
    )
  );

  return {
    primaryOffice,
    offices,
    region: regions.length > 0 ? regions.join(' / ') : 'Unassigned',
  };
};

const loadSavedSettings = () => {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { groupByRegion: true };
    const parsed = JSON.parse(raw);
    return { groupByRegion: parsed.groupByRegion !== false };
  } catch (error) {
    console.warn('Unable to load dashboard display settings:', error);
    return { groupByRegion: true };
  }
};

const createEmptyOfficeMetric = (officeName) => ({
  officeName,
  nbRwCount: 0,
  newBusinessCount: 0,
  rewriteCount: 0,
  feeTotals: createFeeBucket(),
  feeCounts: createFeeBucket(),
  transactionCount: 0,
  rawRows: 0,
  validRows: 0,
  excludedRows: 0,
  activeDays: new Set(),
});

const OfficeNumbers = () => {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
  const [monthlyRows, setMonthlyRows] = useState([]);
  const [lastMonthRows, setLastMonthRows] = useState([]);
  const [lastYearRows, setLastYearRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedFeeType, setSelectedFeeType] = useState('broker');
  const [viewMode, setViewMode] = useState('office');

  const initialSettings = useMemo(loadSavedSettings, []);
  const [officeGoals, setOfficeGoals] = useState({});
  const [agentGoals, setAgentGoals] = useState({});
  const [officeRegions, setOfficeRegions] = useState({});
  const [groupByRegion, setGroupByRegion] = useState(initialSettings.groupByRegion);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [savedOfficeRegions, setSavedOfficeRegions] = useState({});
  const [savedOfficeGoals, setSavedOfficeGoals] = useState({});
  const [savedAgentGoals, setSavedAgentGoals] = useState({});

  const [editingOfficeRegions, setEditingOfficeRegions] = useState({});
  const [editingOfficeGoals, setEditingOfficeGoals] = useState({});
  const [editingAgentGoals, setEditingAgentGoals] = useState({});

  const [savingKey, setSavingKey] = useState('');

  const currentMonthValue = getCurrentMonthValue();
  const monthDetails = useMemo(() => getMonthDetails(selectedMonth), [selectedMonth]);
  const comparisonMonths = useMemo(
    () => getComparisonMonthDetails(selectedMonth),
    [selectedMonth]
  );
  const selectedFeeConfig = useMemo(
    () => FEE_TYPE_OPTIONS.find((option) => option.value === selectedFeeType) || FEE_TYPE_OPTIONS[0],
    [selectedFeeType]
  );

  /*
   * Broker Fee is tied to the true NEW + RWR policy count.
   * Every other fee type is tied to its own matching fee-row count.
   */
  const isBrokerView = selectedFeeType === 'broker';

  const currentRole = cleanStr(currentProfile?.role).toLowerCase();
  const isAdmin = currentRole === 'admin';
  const canEditGoals = ['admin', 'regional'].includes(currentRole);
  const assignedRegion = cleanStr(currentProfile?.region);
  const normalizedAssignedRegion = assignedRegion.toUpperCase();

  const canViewOffice = useCallback((officeCode) => {
    if (isAdmin) return true;
    if (!normalizedAssignedRegion) return false;

    const officeRegion = cleanStr(
      officeRegions[normalizeOffice(officeCode)]
    ).toUpperCase();

    return officeRegion === normalizedAssignedRegion;
  }, [isAdmin, normalizedAssignedRegion, officeRegions]);


  const selectedMetricConfig = useMemo(() => {
    const usesNbRwCount = selectedFeeType === 'broker';

    return {
      usesNbRwCount,
      goalKey: usesNbRwCount ? 'nb_rw' : selectedFeeType,
      countLabel: usesNbRwCount
        ? 'NB/RW Count'
        : `${selectedFeeConfig.label} Count`,
      shortCountLabel: usesNbRwCount
        ? 'NB/RW'
        : selectedFeeConfig.label,
      goalLabel: usesNbRwCount
        ? 'NB/RW Count Goal'
        : `${selectedFeeConfig.label} Count Goal`,
      projectedLabel: usesNbRwCount
        ? 'Projected NB/RW Count'
        : `Projected ${selectedFeeConfig.label} Count`,
      goalPlaceholder: usesNbRwCount
        ? 'NB/RW count goal'
        : `${selectedFeeConfig.label} count goal`,
    };
  }, [selectedFeeType, selectedFeeConfig]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ groupByRegion })
      );
    } catch (error) {
      console.warn('Unable to save dashboard display settings:', error);
    }
  }, [groupByRegion]);

  const fetchProfileAndSettings = useCallback(async () => {
    setSettingsLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const user = authData?.user;
      if (!user) throw new Error('No authenticated user was found.');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, office, region')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      const [
        officeSettingsResult,
        officeGoalsResult,
        agentGoalsResult,
      ] = await Promise.all([
        supabase
          .from('office_dashboard_settings')
          .select('office_code, region'),
        supabase
          .from('office_monthly_goals')
          .select('office_code, report_month, nb_rw_goal')
          .eq('report_month', selectedMonth),
        supabase
          .from('agent_monthly_goals')
          .select('agent_email, report_month, nb_rw_goal')
          .eq('report_month', selectedMonth),
      ]);

      if (officeSettingsResult.error) throw officeSettingsResult.error;
      if (officeGoalsResult.error) throw officeGoalsResult.error;
      if (agentGoalsResult.error) throw agentGoalsResult.error;

      const regionMap = {};
      const savedRegionMap = {};

      (officeSettingsResult.data || []).forEach((row) => {
        const officeCode = normalizeOffice(row.office_code);
        const region = cleanStr(row.region);

        regionMap[officeCode] = region;

        if (region) {
          savedRegionMap[officeCode] = region;
        }
      });

      const officeGoalMap = {};
      const savedOfficeGoalMap = {};

      (officeGoalsResult.data || []).forEach((row) => {
        const officeCode = normalizeOffice(row.office_code);
        const goal = Number(row.nb_rw_goal) || 0;

        officeGoalMap[officeCode] = { nb_rw: goal };
        savedOfficeGoalMap[officeCode] = goal;
      });

      const agentGoalMap = {};
      const savedAgentGoalMap = {};

      (agentGoalsResult.data || []).forEach((row) => {
        const email = cleanStr(row.agent_email).toLowerCase();
        if (!email) return;

        const goal = Number(row.nb_rw_goal) || 0;
        agentGoalMap[email] = { nb_rw: goal };
        savedAgentGoalMap[email] = goal;
      });

      setCurrentProfile(profile);
      setOfficeRegions(regionMap);
      setOfficeGoals(officeGoalMap);
      setAgentGoals(agentGoalMap);

      setSavedOfficeRegions(savedRegionMap);
      setSavedOfficeGoals(savedOfficeGoalMap);
      setSavedAgentGoals(savedAgentGoalMap);

      setEditingOfficeRegions({});
      setEditingOfficeGoals({});
      setEditingAgentGoals({});
    } catch (error) {
      console.error('Error loading dashboard settings:', error);
      setErrorMessage(
        error?.message || 'Unable to load dashboard settings.'
      );
    } finally {
      setSettingsLoading(false);
    }
  }, [selectedMonth]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    const fetchRange = async (firstDay, nextMonthFirstDay) => {
      let allRows = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('daily_transaction_detail_transfers')
          .select('id, sync_key, receipt_id, customer_id, agent_email, csr, office, type, company, policy, policy_type, carrier_receipt, method, premium, fee, total, franchise_fee, voided, date_time')
          .gte('date_time', `${firstDay} 00:00:00`)
          .lt('date_time', `${nextMonthFirstDay} 00:00:00`)
          .order('date_time', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        const rows = data || [];
        allRows = allRows.concat(rows);

        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      return allRows;
    };

    try {
      const [currentRows, previousMonthRows, previousYearRows] =
        await Promise.all([
          fetchRange(
            monthDetails.firstDay,
            monthDetails.nextMonthFirstDay
          ),
          fetchRange(
            comparisonMonths.lastMonth.firstDay,
            comparisonMonths.lastMonth.nextMonthFirstDay
          ),
          fetchRange(
            comparisonMonths.lastYear.firstDay,
            comparisonMonths.lastYear.nextMonthFirstDay
          ),
        ]);

      setMonthlyRows(currentRows);
      setLastMonthRows(previousMonthRows);
      setLastYearRows(previousYearRows);
    } catch (error) {
      console.error('Error fetching office numbers:', error);
      setErrorMessage(
        error?.message || 'Unable to load the monthly office report.'
      );
      setMonthlyRows([]);
      setLastMonthRows([]);
      setLastYearRows([]);
    } finally {
      setLoading(false);
    }
  }, [
    monthDetails.firstDay,
    monthDetails.nextMonthFirstDay,
    comparisonMonths.lastMonth.firstDay,
    comparisonMonths.lastMonth.nextMonthFirstDay,
    comparisonMonths.lastYear.firstDay,
    comparisonMonths.lastYear.nextMonthFirstDay,
  ]);

  useEffect(() => {
    fetchProfileAndSettings();
    fetchDashboardData();
  }, [fetchProfileAndSettings, fetchDashboardData]);

  const visibleMonthlyRows = useMemo(
    () => monthlyRows.filter((row) => canViewOffice(row.office)),
    [monthlyRows, canViewOffice]
  );

  const visibleLastMonthRows = useMemo(
    () => lastMonthRows.filter((row) => canViewOffice(row.office)),
    [lastMonthRows, canViewOffice]
  );

  const visibleLastYearRows = useMemo(
    () => lastYearRows.filter((row) => canViewOffice(row.office)),
    [lastYearRows, canViewOffice]
  );

  const latestDataDate = useMemo(() => {
    return visibleMonthlyRows.reduce((latest, row) => {
      const date = getDateKeyFromTransfer(row);
      return date && (!latest || date > latest) ? date : latest;
    }, '');
  }, [visibleMonthlyRows]);

  const pacingDetails = useMemo(() => {
    if (!latestDataDate) {
      return {
        asOfDay: monthDetails.daysInMonth,
        totalDaysInMonth: monthDetails.daysInMonth,
        projectionMultiplier: 1,
        isPartialMonth: false,
      };
    }

    const [latestYear, latestMonth, latestDay] = latestDataDate.split('-').map(Number);
    const belongsToSelectedMonth =
      latestYear === monthDetails.year && latestMonth === monthDetails.month;

    const asOfDay = belongsToSelectedMonth
      ? Math.max(1, Math.min(latestDay, monthDetails.daysInMonth))
      : monthDetails.daysInMonth;

    return {
      asOfDay,
      totalDaysInMonth: monthDetails.daysInMonth,
      projectionMultiplier: asOfDay < monthDetails.daysInMonth
        ? monthDetails.daysInMonth / asOfDay
        : 1,
      isPartialMonth: asOfDay < monthDetails.daysInMonth,
    };
  }, [latestDataDate, monthDetails]);

  const lastMonthMetricByOffice = useMemo(
    () =>
      buildHistoricalMetricMap(
        visibleLastMonthRows,
        selectedFeeType,
        selectedMetricConfig.usesNbRwCount
      ),
    [visibleLastMonthRows, selectedFeeType, selectedMetricConfig.usesNbRwCount]
  );

  const lastYearMetricByOffice = useMemo(
    () =>
      buildHistoricalMetricMap(
        visibleLastYearRows,
        selectedFeeType,
        selectedMetricConfig.usesNbRwCount
      ),
    [visibleLastYearRows, selectedFeeType, selectedMetricConfig.usesNbRwCount]
  );


  const lastMonthMetricByAgent = useMemo(
    () => buildAgentHistoricalMetricMap(
      visibleLastMonthRows,
      selectedFeeType,
      selectedMetricConfig.usesNbRwCount
    ),
    [visibleLastMonthRows, selectedFeeType, selectedMetricConfig.usesNbRwCount]
  );

  const lastYearMetricByAgent = useMemo(
    () => buildAgentHistoricalMetricMap(
      visibleLastYearRows,
      selectedFeeType,
      selectedMetricConfig.usesNbRwCount
    ),
    [visibleLastYearRows, selectedFeeType, selectedMetricConfig.usesNbRwCount]
  );

  const officeMetrics = useMemo(() => {
    const dailyGroups = {};

    visibleMonthlyRows.forEach((row) => {
      const office = normalizeOffice(row.office);
      const date = getDateKeyFromTransfer(row);
      if (!office || !date) return;

      const key = `${office}|${date}`;
      if (!dailyGroups[key]) dailyGroups[key] = { office, date, rows: [] };
      dailyGroups[key].rows.push(row);
    });

    const metricsByOffice = {};

    Object.values(dailyGroups).forEach((group) => {
      const summary = calculateTransactionSummary(group.rows);

      if (!metricsByOffice[group.office]) {
        metricsByOffice[group.office] = createEmptyOfficeMetric(group.office);
      }

      const office = metricsByOffice[group.office];
      office.nbRwCount += summary.nb_rw_count;
      office.newBusinessCount += summary.new_business_count;
      office.rewriteCount += summary.rewrite_count;
      office.transactionCount += summary.valid_receipts_count;
      office.rawRows += summary.raw_rows_count;
      office.validRows += summary.valid_rows_count;
      office.excludedRows += summary.excluded_rows_count;

      Object.keys(office.feeTotals).forEach((feeType) => {
        office.feeTotals[feeType] += summary.fee_totals[feeType] || 0;
        office.feeCounts[feeType] += summary.fee_counts[feeType] || 0;
      });

      if (summary.valid_rows_count > 0) office.activeDays.add(group.date);
    });

    return Object.values(metricsByOffice)
      .map((office) => {
        const selectedFeeTotal = office.feeTotals[selectedFeeType] || 0;
        const selectedFeeCount = office.feeCounts[selectedFeeType] || 0;

        // Broker Fee average is based on the true NEW + RWR policy count.
        // Other fee categories use their own matching fee transaction count.
        const selectedFeeAvgDenominator = selectedFeeType === 'broker'
          ? office.nbRwCount
          : selectedFeeCount;
        const selectedFeeAvg = selectedFeeAvgDenominator !== 0
          ? selectedFeeTotal / selectedFeeAvgDenominator
          : 0;

        /*
         * Broker Fee uses the correct NEW + RWR policy count.
         * Other fee selections use the matching fee-transaction count.
         */
        const selectedMetricCount = selectedMetricConfig.usesNbRwCount
          ? office.nbRwCount
          : selectedFeeCount;

        const projectedCount =
          selectedMetricCount * pacingDetails.projectionMultiplier;

        const goal = isBrokerView
          ? Number(
              officeGoals?.[office.officeName]?.nb_rw
            ) || 0
          : 0;

        const actualGoalPercent =
          isBrokerView && goal > 0
            ? (selectedMetricCount / goal) * 100
            : 0;

        const projectedGoalPercent =
          isBrokerView && goal > 0
            ? (projectedCount / goal) * 100
            : 0;

        const difference = isBrokerView
          ? projectedCount - goal
          : 0;

        return {
          ...office,
          activeDays: office.activeDays.size,
          region: cleanStr(officeRegions[office.officeName]) || 'Unassigned',
          selectedFeeTotal,
          selectedFeeCount,
          selectedFeeAvg,
          selectedMetricCount,
          projectedCount,
          lastMonthCount:
            lastMonthMetricByOffice[office.officeName] ?? null,
          lastYearCount:
            lastYearMetricByOffice[office.officeName] ?? null,
          goal,
          actualGoalPercent,
          projectedGoalPercent,
          difference,
          status: goal <= 0 ? 'No Goal' : projectedCount >= goal ? 'On Track' : 'Behind',
        };
      })
      .sort((a, b) => getOfficeNumber(a.officeName) - getOfficeNumber(b.officeName));
  }, [
  visibleMonthlyRows,
  pacingDetails.projectionMultiplier,
  officeGoals,
  officeRegions,
  selectedFeeType,
  selectedMetricConfig,
  lastMonthMetricByOffice,
  lastYearMetricByOffice,
  isBrokerView,
]);
  const agentMetrics = useMemo(() => {
    const groups = new Map();

    visibleMonthlyRows.forEach((row) => {
      const agent = normalizeAgent(row);
      if (!groups.has(agent)) groups.set(agent, []);
      groups.get(agent).push(row);
    });

    return Array.from(groups.entries())
      .map(([agentEmail, rows]) => {
        const summary = calculateTransactionSummary(rows);
        const csrName = getMostRecentCsrName(rows, agentEmail);
        const selectedFeeTotal = summary.fee_totals[selectedFeeType] || 0;
        const selectedFeeCount = summary.fee_counts[selectedFeeType] || 0;

        const selectedMetricCount = selectedMetricConfig.usesNbRwCount
          ? summary.nb_rw_count
          : selectedFeeCount;

        const avgDenominator = selectedFeeType === 'broker'
          ? summary.nb_rw_count
          : selectedFeeCount;

        const selectedFeeAvg = avgDenominator
          ? selectedFeeTotal / avgDenominator
          : 0;

        const assignment = getAgentOfficeAndRegion(rows, officeRegions);
        const goal = isBrokerView
          ? Number(agentGoals?.[agentEmail]?.nb_rw) || 0
          : 0;

        const projectedCount =
          selectedMetricCount * pacingDetails.projectionMultiplier;

        const actualGoalPercent =
          goal > 0 ? (selectedMetricCount / goal) * 100 : 0;

        const projectedGoalPercent =
          goal > 0 ? (projectedCount / goal) * 100 : 0;

        return {
          agentEmail,
          csrName,
          office: assignment.primaryOffice,
          offices: assignment.offices,
          region: assignment.region,
          nbRwCount: summary.nb_rw_count,
          newBusinessCount: summary.new_business_count,
          rewriteCount: summary.rewrite_count,
          selectedMetricCount,
          selectedFeeTotal,
          selectedFeeCount,
          selectedFeeAvg,
          projectedCount,
          lastMonthCount: lastMonthMetricByAgent[agentEmail] ?? null,
          lastYearCount: lastYearMetricByAgent[agentEmail] ?? null,
          goal,
          actualGoalPercent,
          projectedGoalPercent,
          difference: projectedCount - goal,
          status:
            !isBrokerView
              ? ''
              : goal <= 0
                ? 'No Goal'
                : projectedCount >= goal
                  ? 'On Track'
                  : 'Behind',
        };
      })
      .sort((a, b) => {
        const regionCompare = a.region.localeCompare(
          b.region,
          undefined,
          { numeric: true, sensitivity: 'base' }
        );

        if (regionCompare !== 0) return regionCompare;

        const officeCompare =
          getOfficeNumber(a.office) - getOfficeNumber(b.office);

        if (officeCompare !== 0) return officeCompare;

        return a.agentEmail.localeCompare(b.agentEmail);
      });
  }, [
    visibleMonthlyRows,
    selectedFeeType,
    selectedMetricConfig,
    pacingDetails.projectionMultiplier,
    officeRegions,
    agentGoals,
    isBrokerView,
    lastMonthMetricByAgent,
    lastYearMetricByAgent,
  ]);

  const agentRegionGroups = useMemo(() => {
    if (!groupByRegion) {
      return [{ regionName: '', agents: agentMetrics }];
    }

    const grouped = new Map();

    agentMetrics.forEach((agent) => {
      const regionName = agent.region || 'Unassigned';

      if (!grouped.has(regionName)) grouped.set(regionName, []);
      grouped.get(regionName).push(agent);
    });

    return Array.from(grouped.entries())
      .map(([regionName, agents]) => ({
        regionName,
        agents: [...agents].sort((a, b) => {
          const officeCompare =
            getOfficeNumber(a.office) - getOfficeNumber(b.office);

          if (officeCompare !== 0) return officeCompare;
          return a.agentEmail.localeCompare(b.agentEmail);
        }),
      }))
      .sort((a, b) => {
        if (a.regionName === 'Unassigned') return 1;
        if (b.regionName === 'Unassigned') return -1;

        return a.regionName.localeCompare(
          b.regionName,
          undefined,
          { numeric: true, sensitivity: 'base' }
        );
      });
  }, [agentMetrics, groupByRegion]);

  const agentTotals = useMemo(() => {
    const result = agentMetrics.reduce((acc, agent) => {
      acc.nbRwCount += agent.nbRwCount;
      acc.newBusinessCount += agent.newBusinessCount;
      acc.rewriteCount += agent.rewriteCount;
      acc.selectedMetricCount += agent.selectedMetricCount;
      acc.selectedFeeTotal += agent.selectedFeeTotal;
      acc.selectedFeeCount += agent.selectedFeeCount;
      acc.projectedCount += agent.projectedCount;
      acc.goal += agent.goal;

      if (agent.lastMonthCount !== null) {
        acc.lastMonthCount += agent.lastMonthCount;
        acc.hasLastMonthData = true;
      }

      if (agent.lastYearCount !== null) {
        acc.lastYearCount += agent.lastYearCount;
        acc.hasLastYearData = true;
      }

      return acc;
    }, {
      nbRwCount: 0,
      newBusinessCount: 0,
      rewriteCount: 0,
      selectedMetricCount: 0,
      selectedFeeTotal: 0,
      selectedFeeCount: 0,
      projectedCount: 0,
      goal: 0,
      lastMonthCount: 0,
      lastYearCount: 0,
      hasLastMonthData: false,
      hasLastYearData: false,
    });

    const avgDenominator = selectedFeeType === 'broker'
      ? result.nbRwCount
      : result.selectedFeeCount;

    result.selectedFeeAvg = avgDenominator
      ? result.selectedFeeTotal / avgDenominator
      : 0;

    result.status =
      result.goal <= 0
        ? 'No Goal'
        : result.projectedCount >= result.goal
          ? 'On Track'
          : 'Behind';

    return result;
  }, [agentMetrics, selectedFeeType]);

  const regionGroups = useMemo(() => {
    if (!groupByRegion) return [{ regionName: '', offices: officeMetrics }];

    const grouped = new Map();
    officeMetrics.forEach((office) => {
      const regionName = office.region || 'Unassigned';
      if (!grouped.has(regionName)) grouped.set(regionName, []);
      grouped.get(regionName).push(office);
    });

    return Array.from(grouped.entries())
      .map(([regionName, offices]) => ({
        regionName,
        offices: [...offices].sort(
          (a, b) => getOfficeNumber(a.officeName) - getOfficeNumber(b.officeName)
        ),
      }))
      .sort((a, b) => {
        if (a.regionName === 'Unassigned') return 1;
        if (b.regionName === 'Unassigned') return -1;
        return a.regionName.localeCompare(b.regionName, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      });
  }, [officeMetrics, groupByRegion]);

  const totals = useMemo(() => {
    const result = officeMetrics.reduce((acc, office) => {
      acc.nbRwCount += office.nbRwCount;
      acc.newBusinessCount += office.newBusinessCount;
      acc.rewriteCount += office.rewriteCount;
      acc.selectedFeeTotal += office.selectedFeeTotal;
      acc.selectedFeeCount += office.selectedFeeCount;
      acc.selectedMetricCount += office.selectedMetricCount;
      acc.projectedCount += office.projectedCount;

      if (office.lastMonthCount !== null) {
        acc.lastMonthCount += office.lastMonthCount;
        acc.hasLastMonthData = true;
      }

      if (office.lastYearCount !== null) {
        acc.lastYearCount += office.lastYearCount;
        acc.hasLastYearData = true;
      }

      acc.goal += office.goal;
      acc.transactionCount += office.transactionCount;
      acc.excludedRows += office.excludedRows;
      return acc;
    }, {
      nbRwCount: 0,
      newBusinessCount: 0,
      rewriteCount: 0,
      selectedFeeTotal: 0,
      selectedFeeCount: 0,
      selectedMetricCount: 0,
      projectedCount: 0,
      lastMonthCount: 0,
      lastYearCount: 0,
      hasLastMonthData: false,
      hasLastYearData: false,
      goal: 0,
      transactionCount: 0,
      excludedRows: 0,
    });

    const selectedFeeAvgDenominator = selectedFeeType === 'broker'
      ? result.nbRwCount
      : result.selectedFeeCount;

    result.selectedFeeAvg = selectedFeeAvgDenominator !== 0
      ? result.selectedFeeTotal / selectedFeeAvgDenominator
      : 0;

    return result;
  }, [officeMetrics, selectedFeeType]);

  const updateOfficeGoal = (officeName, value) => {
    if (!isBrokerView || !canEditGoals) return;

    setOfficeGoals((current) => ({
      ...current,
      [officeName]: {
        ...(current[officeName] || {}),
        nb_rw: value,
      },
    }));
  };

  const saveOfficeGoal = async (officeName) => {
    if (!isBrokerView || !canEditGoals) return;

    const saveKey = `office-goal:${officeName}`;
    setSavingKey(saveKey);

    try {
      const nbRwGoal = Number(officeGoals?.[officeName]?.nb_rw) || 0;

      const { error } = await supabase
        .from('office_monthly_goals')
        .upsert(
          {
            office_code: officeName,
            report_month: selectedMonth,
            nb_rw_goal: nbRwGoal,
            updated_at: new Date().toISOString(),
            updated_by: currentProfile?.id || null,
          },
          { onConflict: 'office_code,report_month' }
        );

      if (error) throw error;

      setSavedOfficeGoals((current) => ({
        ...current,
        [officeName]: nbRwGoal,
      }));

      setEditingOfficeGoals((current) => ({
        ...current,
        [officeName]: false,
      }));
    } catch (error) {
      console.error('Unable to save office goal:', error);
      setErrorMessage(error?.message || 'Unable to save office goal.');
    } finally {
      setSavingKey('');
    }
  };

  const updateOfficeRegion = (officeName, value) => {
    if (!isAdmin) return;

    setOfficeRegions((current) => ({
      ...current,
      [officeName]: value,
    }));
  };

  const saveOfficeRegion = async (officeName) => {
    if (!isAdmin) return;

    const saveKey = `office-region:${officeName}`;
    setSavingKey(saveKey);

    try {
      const region = cleanStr(officeRegions[officeName]);

      if (!region) {
        throw new Error('Enter a region before saving.');
      }

      const { error } = await supabase
        .from('office_dashboard_settings')
        .upsert(
          {
            office_code: officeName,
            region,
            updated_at: new Date().toISOString(),
            updated_by: currentProfile?.id || null,
          },
          { onConflict: 'office_code' }
        );

      if (error) throw error;

      setOfficeRegions((current) => ({
        ...current,
        [officeName]: region,
      }));

      setSavedOfficeRegions((current) => ({
        ...current,
        [officeName]: region,
      }));

      setEditingOfficeRegions((current) => ({
        ...current,
        [officeName]: false,
      }));
    } catch (error) {
      console.error('Unable to save office region:', error);
      setErrorMessage(error?.message || 'Unable to save office region.');
    } finally {
      setSavingKey('');
    }
  };

  const updateAgentGoal = (agentEmail, value) => {
    if (!isBrokerView || !canEditGoals) return;

    setAgentGoals((current) => ({
      ...current,
      [agentEmail]: {
        ...(current[agentEmail] || {}),
        nb_rw: value,
      },
    }));
  };

  const saveAgentGoal = async (agentEmail) => {
    if (!isBrokerView || !canEditGoals) return;

    const normalizedEmail = cleanStr(agentEmail).toLowerCase();
    const saveKey = `agent-goal:${normalizedEmail}`;
    setSavingKey(saveKey);

    try {
      const nbRwGoal = Number(agentGoals?.[normalizedEmail]?.nb_rw) || 0;

      const { error } = await supabase
        .from('agent_monthly_goals')
        .upsert(
          {
            agent_email: normalizedEmail,
            report_month: selectedMonth,
            nb_rw_goal: nbRwGoal,
            updated_at: new Date().toISOString(),
            updated_by: currentProfile?.id || null,
          },
          { onConflict: 'agent_email,report_month' }
        );

      if (error) throw error;

      setSavedAgentGoals((current) => ({
        ...current,
        [normalizedEmail]: nbRwGoal,
      }));

      setEditingAgentGoals((current) => ({
        ...current,
        [normalizedEmail]: false,
      }));
    } catch (error) {
      console.error('Unable to save agent goal:', error);
      setErrorMessage(error?.message || 'Unable to save agent goal.');
    } finally {
      setSavingKey('');
    }
  };

  const startEditingOfficeRegion = (officeName) => {
    if (!isAdmin) return;

    setEditingOfficeRegions((current) => ({
      ...current,
      [officeName]: true,
    }));
  };

  const cancelEditingOfficeRegion = (officeName) => {
    setOfficeRegions((current) => ({
      ...current,
      [officeName]: savedOfficeRegions[officeName] || '',
    }));

    setEditingOfficeRegions((current) => ({
      ...current,
      [officeName]: false,
    }));
  };

  const startEditingOfficeGoal = (officeName) => {
    if (!canEditGoals) return;

    setEditingOfficeGoals((current) => ({
      ...current,
      [officeName]: true,
    }));
  };

  const cancelEditingOfficeGoal = (officeName) => {
    setOfficeGoals((current) => ({
      ...current,
      [officeName]: {
        ...(current[officeName] || {}),
        nb_rw: savedOfficeGoals[officeName] ?? '',
      },
    }));

    setEditingOfficeGoals((current) => ({
      ...current,
      [officeName]: false,
    }));
  };

  const startEditingAgentGoal = (agentEmail) => {
    if (!canEditGoals) return;

    const normalizedEmail = cleanStr(agentEmail).toLowerCase();

    setEditingAgentGoals((current) => ({
      ...current,
      [normalizedEmail]: true,
    }));
  };

  const cancelEditingAgentGoal = (agentEmail) => {
    const normalizedEmail = cleanStr(agentEmail).toLowerCase();

    setAgentGoals((current) => ({
      ...current,
      [normalizedEmail]: {
        ...(current[normalizedEmail] || {}),
        nb_rw: savedAgentGoals[normalizedEmail] ?? '',
      },
    }));

    setEditingAgentGoals((current) => ({
      ...current,
      [normalizedEmail]: false,
    }));
  };

  const renderOfficeRow = (office) => {
    const onTrack = office.status === 'On Track';

    return (
      <tr key={office.officeName}>
        <td style={styles.officeCell}>
          {office.officeName}
          <div style={styles.smallMuted}>{office.activeDays} days</div>
        </td>

        <td style={styles.regionCell}>
          {isAdmin && (
            !savedOfficeRegions[office.officeName] ||
            editingOfficeRegions[office.officeName]
          ) ? (
            <div style={styles.editFieldRow}>
              <input
                type="text"
                value={officeRegions[office.officeName] || ''}
                onChange={(event) =>
                  updateOfficeRegion(office.officeName, event.target.value)
                }
                placeholder="Region name"
                style={styles.inlineInput}
              />
              <button
                type="button"
                onClick={() => saveOfficeRegion(office.officeName)}
                disabled={savingKey === `office-region:${office.officeName}`}
                style={styles.saveMiniButton}
              >
                {savingKey === `office-region:${office.officeName}`
                  ? 'Saving'
                  : 'Save'}
              </button>
              {savedOfficeRegions[office.officeName] && (
                <button
                  type="button"
                  onClick={() => cancelEditingOfficeRegion(office.officeName)}
                  style={styles.cancelMiniButton}
                >
                  Cancel
                </button>
              )}
            </div>
          ) : (
            <div style={styles.savedFieldRow}>
              <span style={styles.savedFieldText}>
                {officeRegions[office.officeName] || 'Unassigned'}
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => startEditingOfficeRegion(office.officeName)}
                  style={styles.editMiniButton}
                  aria-label={`Edit ${office.officeName} region`}
                  title="Edit region"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </td>

        <td style={{ ...styles.numberCell, ...styles.metricCurrentCell }}>
          <strong>{formatNumber(office.selectedMetricCount)}</strong>
          <div style={styles.smallMuted}>
            {selectedMetricConfig.usesNbRwCount
              ? `${formatNumber(office.newBusinessCount)} NEW / ${formatNumber(office.rewriteCount)} RWR`
              : `${formatNumber(office.selectedFeeCount)} matching fee transaction(s)`}
          </div>
        </td>

        <td style={styles.numberCell}>
          <strong>{formatCurrency(office.selectedFeeTotal)}</strong>
          <div style={styles.smallMuted}>
            {formatNumber(office.selectedFeeCount)} fee transaction(s)
          </div>
        </td>

        <td style={styles.numberCell}>{formatCurrency(office.selectedFeeAvg, 2)}</td>

        {isBrokerView && (
          <td style={{...styles.goalCell, ...styles.metricGoalCell}}>
            {canEditGoals && (
              savedOfficeGoals[office.officeName] === undefined ||
              editingOfficeGoals[office.officeName]
            ) ? (
              <div style={styles.editFieldRow}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={officeGoals?.[office.officeName]?.nb_rw ?? ''}
                  onChange={(event) =>
                    updateOfficeGoal(office.officeName, event.target.value)
                  }
                  placeholder="NB/RW goal"
                  style={styles.goalInput}
                />
                <button
                  type="button"
                  onClick={() => saveOfficeGoal(office.officeName)}
                  disabled={savingKey === `office-goal:${office.officeName}`}
                  style={styles.saveMiniButton}
                >
                  {savingKey === `office-goal:${office.officeName}`
                    ? 'Saving'
                    : 'Save'}
                </button>
                {savedOfficeGoals[office.officeName] !== undefined && (
                  <button
                    type="button"
                    onClick={() => cancelEditingOfficeGoal(office.officeName)}
                    style={styles.cancelMiniButton}
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <div style={styles.savedFieldRow}>
                <span style={styles.savedGoalValue}>
                  {savedOfficeGoals[office.officeName] !== undefined
                    ? formatNumber(savedOfficeGoals[office.officeName])
                    : 'Not Set'}
                </span>
                {canEditGoals && (
                  <button
                    type="button"
                    onClick={() => startEditingOfficeGoal(office.officeName)}
                    style={styles.editMiniButton}
                    aria-label={`Edit ${office.officeName} goal for ${selectedMonth}`}
                    title={`Edit ${getMonthLabel(selectedMonth)} goal`}
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
          </td>
        )}

        <td style={{ ...styles.strongCell, ...styles.metricProjectedCell }}>
          {formatDecimal(office.projectedCount)}
        </td>

        <td style={styles.numberCell}>
          {office.lastMonthCount === null
            ? '—'
            : formatNumber(office.lastMonthCount)}
        </td>

        <td style={styles.numberCell}>
          {office.lastYearCount === null
            ? '—'
            : formatNumber(office.lastYearCount)}
        </td>

        {isBrokerView && (
          <>
            <td style={styles.progressCell}>
              {office.goal > 0 ? (
                <>
                  <div style={styles.progressText}>
                    {Math.round(office.actualGoalPercent)}%
                  </div>
                  <div style={styles.progressTrack}>
                    <div
                      style={{
                        ...styles.progressFill,
                        width: `${Math.min(office.actualGoalPercent, 100)}%`,
                      }}
                    />
                  </div>
                  <div style={styles.smallMuted}>
                    {Math.round(office.projectedGoalPercent)}% proj.
                  </div>
                </>
              ) : '—'}
            </td>

            <td style={styles.numberCell}>
              <span
                style={
                  office.status === 'No Goal'
                    ? styles.noGoalBadge
                    : onTrack
                      ? styles.onTrackBadge
                      : styles.behindBadge
                }
              >
                {office.status}
              </span>

              {office.goal > 0 && (
                <div
                  style={{
                    ...styles.difference,
                    color: onTrack ? '#047857' : '#be123c',
                  }}
                >
                  {office.difference >= 0 ? '+' : '-'}
                  {formatDecimal(Math.abs(office.difference))}
                </div>
              )}
            </td>
          </>
        )}
      </tr>
    );
  };

  return (
    <>
      <style>{`
        @media (max-width: 1500px) {
          .office-numbers-table th,
          .office-numbers-table td {
            line-height: 1.15;
          }
        }

        @media (max-width: 1250px) {
          .office-numbers-page {
            padding: 16px !important;
          }

          .office-numbers-table {
            font-size: 11px;
          }
        }
      `}</style>
      <div className="office-numbers-page" style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{viewMode === 'office' ? 'Monthly Office Performance' : 'Monthly Agent Performance'}</h1>
          <p style={styles.subtitle}>
            Switch between office and agent performance. NB/RW goals appear only in Broker Fee view; other fee views focus on counts, totals, averages, pacing, and historical comparisons.
          </p>
          {currentProfile && (
            <div style={styles.accessNote}>
              Access: {isAdmin ? 'All regions' : (assignedRegion || 'No region assigned')} • Role: {currentProfile.role || 'Unknown'}
            </div>
          )}
        </div>

        <div style={styles.monthSelector}>
          <label htmlFor="office-report-month" style={styles.monthLabel}>Report Month</label>
          <input
            id="office-report-month"
            type="month"
            value={selectedMonth}
            max={currentMonthValue}
            onChange={(event) => setSelectedMonth(event.target.value)}
            style={styles.monthInput}
          />
        </div>
      </div>

      <div style={styles.controlBar}>
        <div>
          <h2 style={styles.monthTitle}>{getMonthLabel(selectedMonth)}</h2>
          <p style={styles.monthDescription}>
            Data through <strong>{formatDateLabel(latestDataDate)}</strong>.{' '}
            {pacingDetails.isPartialMonth
              ? `${formatDateLabel(latestDataDate)} is treated as today: day ${pacingDetails.asOfDay} of ${pacingDetails.totalDaysInMonth}.`
              : 'The loaded data reaches the final day of the month.'}
          </p>
        </div>

        <div style={styles.controlsRight}>
          <div style={styles.segmentedControl}>
            <button
              type="button"
              onClick={() => setViewMode('office')}
              style={{
                ...styles.segmentButton,
                ...(viewMode === 'office' ? styles.segmentButtonActive : {}),
              }}
            >
              Offices
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agent')}
              style={{
                ...styles.segmentButton,
                ...(viewMode === 'agent' ? styles.segmentButtonActive : {}),
              }}
            >
              Agents
            </button>
          </div>

          <div style={styles.feeSelectorWrap}>
            <label htmlFor="fee-type-selector" style={styles.feeSelectorLabel}>Fee Type</label>
            <select
              id="fee-type-selector"
              value={selectedFeeType}
              onChange={(event) => setSelectedFeeType(event.target.value)}
              style={styles.feeSelector}
            >
              {FEE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={groupByRegion}
                onChange={(event) => setGroupByRegion(event.target.checked)}
              />
              Group by region
            </label>

          <button
            type="button"
            onClick={() => { fetchProfileAndSettings(); fetchDashboardData(); }}
            disabled={loading || settingsLoading}
            style={styles.primaryButton}
          >
            {loading || settingsLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {!isAdmin && currentProfile && !assignedRegion && (
        <div style={styles.errorBox}>
          <div>
            <strong>No region assigned</strong>
            <div>
              Add a region to this user's profile before the dashboard can show office or agent data.
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div style={styles.errorBox}>
          <div>
            <strong>Unable to load report</strong>
            <div>{errorMessage}</div>
          </div>
          <button type="button" onClick={() => { fetchProfileAndSettings(); fetchDashboardData(); }} style={styles.retryButton}>
            Retry
          </button>
        </div>
      )}

      {viewMode === 'office' && (
        <>
      <div style={styles.summaryGrid}>
        <SummaryCard
          label={selectedMetricConfig.countLabel}
          value={formatNumber(totals.selectedMetricCount)}
          subtext={
            selectedMetricConfig.usesNbRwCount
              ? `${formatNumber(totals.newBusinessCount)} NEW • ${formatNumber(totals.rewriteCount)} RWR`
              : `${formatNumber(totals.selectedFeeCount)} matching fee transaction(s)`
          }
        />
        <SummaryCard
          label={selectedFeeConfig.label}
          value={formatCurrency(totals.selectedFeeTotal)}
          subtext={`${formatNumber(totals.selectedFeeCount)} fee transaction(s)`}
        />
        <SummaryCard
          label={`Average ${selectedFeeConfig.label}`}
          value={formatCurrency(totals.selectedFeeAvg, 2)}
        />
        <SummaryCard
          label={selectedMetricConfig.projectedLabel}
          value={formatDecimal(totals.projectedCount)}
          subtext={`Based on data through ${formatDateLabel(latestDataDate)}`}
        />
        {isBrokerView && (
          <SummaryCard
            label="NB/RW Count Goal"
            value={totals.goal > 0 ? formatNumber(totals.goal) : 'Not Set'}
          />
        )}
        <SummaryCard
          label="Loaded Receipts"
          value={formatNumber(totals.transactionCount)}
          subtext={`${formatNumber(totals.excludedRows)} duplicate/voided rows excluded`}
        />
      </div>

      <div style={styles.tableCard}>
        {loading ? (
          <div style={styles.loading}>Loading office performance metrics...</div>
        ) : officeMetrics.length === 0 ? (
          <div style={styles.loading}>
            No daily_transaction_detail_transfers data was found for this month.
          </div>
        ) : (
          <div style={styles.tableWrapper}>
            <table
              className="office-numbers-table"
              style={{
                ...styles.table,
                minWidth: isBrokerView ? 1320 : 1040,
              }}
            >
              

              <tbody>
                {regionGroups.map((group) => {
                  const regionTotals = group.offices.reduce((acc, office) => {
                    acc.nbRwCount += office.nbRwCount;
                    acc.newBusinessCount += office.newBusinessCount;
                    acc.rewriteCount += office.rewriteCount;
                    acc.selectedFeeCount += office.selectedFeeCount;
                    acc.selectedMetricCount += office.selectedMetricCount;
                    acc.selectedFeeTotal += office.selectedFeeTotal;
                    acc.projectedCount += office.projectedCount;

                    if (office.lastMonthCount !== null) {
                      acc.lastMonthCount += office.lastMonthCount;
                      acc.hasLastMonthData = true;
                    }

                    if (office.lastYearCount !== null) {
                      acc.lastYearCount += office.lastYearCount;
                      acc.hasLastYearData = true;
                    }

                    acc.goal += office.goal;
                    return acc;
                  }, {
                    nbRwCount: 0,
                    newBusinessCount: 0,
                    rewriteCount: 0,
                    selectedFeeCount: 0,
                    selectedMetricCount: 0,
                    selectedFeeTotal: 0,
                    projectedCount: 0,
                    lastMonthCount: 0,
                    lastYearCount: 0,
                    hasLastMonthData: false,
                    hasLastYearData: false,
                    goal: 0,
                  });

                  const regionFeeAvgDenominator = selectedFeeType === 'broker'
                    ? regionTotals.nbRwCount
                    : regionTotals.selectedFeeCount;
                  const regionFeeAvg = regionFeeAvgDenominator !== 0
                    ? regionTotals.selectedFeeTotal / regionFeeAvgDenominator
                    : 0;

                  return (
                    <React.Fragment key={group.regionName || 'all-offices'}>
                      {groupByRegion && (
                        <>
                          <tr>
                            <td
                              colSpan={isBrokerView ? 11 : 8}
                              style={styles.regionHeaderCell}
                            >
                              <div style={styles.regionHeaderContent}>
                                <strong>{group.regionName}</strong>
                              </div>
                            </td>
                          </tr>

                          <tr>
                            <th style={styles.regionColumnHeaderCell}>Office</th>
                            <th style={styles.regionColumnHeaderCell}>Region</th>
                            <th
                              style={{
                                ...styles.regionColumnHeaderCell,
                                ...styles.metricCurrentHeaderCell,
                              }}
                            >
                              {selectedMetricConfig.shortCountLabel}
                            </th>
                            <th style={styles.regionColumnHeaderCell}>
                              {selectedFeeConfig.label}
                            </th>
                            <th style={styles.regionColumnHeaderCell}>Avg Fee</th>
                            {isBrokerView && (
                              <th
                                style={{
                                  ...styles.regionColumnHeaderCell,
                                  ...styles.metricGoalHeaderCell,
                                }}
                              >
                                NB/RW Count Goal
                              </th>
                            )}
                            <th
                              style={{
                                ...styles.regionColumnHeaderCell,
                                ...styles.metricProjectedHeaderCell,
                              }}
                            >
                              {selectedMetricConfig.projectedLabel}
                            </th>
                            <th style={styles.regionColumnHeaderCell}>
                              Last Month ({getMonthLabel(comparisonMonths.lastMonth.value)})
                            </th>
                            <th style={styles.regionColumnHeaderCell}>
                              Last Year ({getMonthLabel(comparisonMonths.lastYear.value)})
                            </th>
                            {isBrokerView && (
                              <>
                                <th style={styles.regionColumnHeaderCell}>
                                  Goal Progress
                                </th>
                                <th style={styles.regionColumnHeaderCell}>
                                  Status
                                </th>
                              </>
                            )}
                          </tr>
                        </>
                      )}

                      {group.offices.map(renderOfficeRow)}

                      {groupByRegion && (() => {
                        const regionActualGoalPercent =
                          regionTotals.goal > 0
                            ? (regionTotals.selectedMetricCount / regionTotals.goal) * 100
                            : 0;

                        const regionProjectedGoalPercent =
                          regionTotals.goal > 0
                            ? (regionTotals.projectedCount / regionTotals.goal) * 100
                            : 0;

                        const regionOnTrack =
                          regionTotals.goal > 0 &&
                          regionTotals.projectedCount >= regionTotals.goal;

                        return (
                          <tr>
                            <td
                              style={{
                                ...styles.regionTotalCell,
                                fontSize: 12,
                                textTransform: 'uppercase',
                                letterSpacing: '.02em',
                              }}
                            >
                              {group.regionName} Total
                            </td>
                            <td style={styles.regionTotalCell}>{group.regionName}</td>
                            <td style={{...styles.regionTotalCell,...styles.metricCurrentCell}}>
                              {formatNumber(regionTotals.selectedMetricCount)}
                            </td>
                            <td style={styles.regionTotalCell}>
                              {formatCurrency(regionTotals.selectedFeeTotal)}
                            </td>
                            <td style={styles.regionTotalCell}>
                              {formatCurrency(regionFeeAvg, 2)}
                            </td>

                            {isBrokerView && (
                              <td style={{...styles.regionTotalCell,...styles.metricGoalCell}}>
                                {regionTotals.goal > 0
                                  ? formatNumber(regionTotals.goal)
                                  : 'Not Set'}
                              </td>
                            )}

                            <td style={{...styles.regionTotalCell,...styles.metricProjectedCell}}>
                              {formatDecimal(regionTotals.projectedCount)}
                            </td>
                            <td style={styles.regionTotalCell}>
                              {regionTotals.hasLastMonthData
                                ? formatNumber(regionTotals.lastMonthCount)
                                : '—'}
                            </td>
                            <td style={styles.regionTotalCell}>
                              {regionTotals.hasLastYearData
                                ? formatNumber(regionTotals.lastYearCount)
                                : '—'}
                            </td>

                            {isBrokerView && (
                              <>
                                <td style={styles.regionTotalCell}>
                                  {regionTotals.goal > 0 ? (
                                    <>
                                      <div style={styles.progressText}>
                                        {Math.round(regionActualGoalPercent)}%
                                      </div>
                                      <div style={styles.progressTrack}>
                                        <div
                                          style={{
                                            ...styles.progressFill,
                                            width: `${Math.min(
                                              regionActualGoalPercent,
                                              100
                                            )}%`,
                                          }}
                                        />
                                      </div>
                                      <div style={styles.smallMuted}>
                                        {Math.round(regionProjectedGoalPercent)}% proj.
                                      </div>
                                    </>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td style={styles.regionTotalCell}>
                                  <span
                                    style={
                                      regionTotals.goal <= 0
                                        ? styles.noGoalBadge
                                        : regionOnTrack
                                          ? styles.onTrackBadge
                                          : styles.behindBadge
                                    }
                                  >
                                    {regionTotals.goal <= 0
                                      ? 'No Goal'
                                      : regionOnTrack
                                        ? 'On Track'
                                        : 'Behind'}
                                  </span>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })()}
                    </React.Fragment>
                  );
                })}
              </tbody>

              <tfoot>
                <tr>
                  <td style={styles.footerCell}>All Offices</td>
                  <td style={styles.footerCell}>—</td>
                  <td style={{ ...styles.footerCell, ...styles.metricCurrentCell }}>
                    {formatNumber(totals.selectedMetricCount)}
                  </td>
                  <td style={styles.footerCell}>{formatCurrency(totals.selectedFeeTotal)}</td>
                  <td style={styles.footerCell}>{formatCurrency(totals.selectedFeeAvg, 2)}</td>
                  <td style={{ ...styles.footerCell, ...styles.metricGoalCell }}>
                    {totals.goal > 0 ? formatNumber(totals.goal) : 'Not Set'}
                  </td>
                  <td style={{ ...styles.footerCell, ...styles.metricProjectedCell }}>
                    {formatDecimal(totals.projectedCount)}
                  </td>
                  <td style={styles.footerCell}>
                    {totals.hasLastMonthData
                      ? formatNumber(totals.lastMonthCount)
                      : '—'}
                  </td>
                  <td style={styles.footerCell}>
                    {totals.hasLastYearData
                      ? formatNumber(totals.lastYearCount)
                      : '—'}
                  </td>
                  <td style={styles.footerCell}>—</td>
                  <td style={styles.footerCell}>
                    {totals.goal <= 0
                      ? 'No Goal'
                      : totals.projectedCount >= totals.goal
                        ? 'On Track'
                        : 'Behind'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
        </>
      )}
      {viewMode === 'agent' && (
        <>
          <div style={styles.summaryGrid}>
            <SummaryCard
              label={selectedMetricConfig.countLabel}
              value={formatNumber(agentTotals.selectedMetricCount)}
              subtext={
                selectedMetricConfig.usesNbRwCount
                  ? `${formatNumber(agentTotals.newBusinessCount)} NEW • ${formatNumber(agentTotals.rewriteCount)} RWR`
                  : `${formatNumber(agentTotals.selectedFeeCount)} matching fee transaction(s)`
              }
            />
            <SummaryCard
              label={selectedFeeConfig.label}
              value={formatCurrency(agentTotals.selectedFeeTotal)}
              subtext={`${formatNumber(agentTotals.selectedFeeCount)} fee transaction(s)`}
            />
            <SummaryCard
              label={`Average ${selectedFeeConfig.label}`}
              value={formatCurrency(agentTotals.selectedFeeAvg, 2)}
            />
            <SummaryCard
              label={selectedMetricConfig.projectedLabel}
              value={formatDecimal(agentTotals.projectedCount)}
              subtext={`Based on data through ${formatDateLabel(latestDataDate)}`}
            />
            {isBrokerView && (
              <SummaryCard
                label="NB/RW Count Goal"
                value={
                  agentTotals.goal > 0
                    ? formatNumber(agentTotals.goal)
                    : 'Not Set'
                }
              />
            )}
            <SummaryCard
              label="Agents"
              value={formatNumber(agentMetrics.length)}
              subtext={isAdmin ? "Grouped by office region" : `Showing ${assignedRegion || "assigned"} region only`}
            />
          </div>

          <div style={styles.tableCard}>
            {loading ? (
              <div style={styles.loading}>Loading agent performance metrics...</div>
            ) : agentMetrics.length === 0 ? (
              <div style={styles.loading}>
                No agent transaction data was found for this month.
              </div>
            ) : (
              <div style={styles.tableWrapper}>
                <table
                  className="office-numbers-table"
                  style={{
                    ...styles.table,
                    minWidth: isBrokerView ? 1380 : 1120,
                  }}
                >
                  

                  <tbody>
                    {agentRegionGroups.map((group) => {
                      const regionTotals = group.agents.reduce((acc, agent) => {
                        acc.selectedMetricCount += agent.selectedMetricCount;
                        acc.selectedFeeTotal += agent.selectedFeeTotal;
                        acc.selectedFeeCount += agent.selectedFeeCount;
                        acc.nbRwCount += agent.nbRwCount;
                        acc.projectedCount += agent.projectedCount;
                        acc.goal += agent.goal;

                        if (agent.lastMonthCount !== null) {
                          acc.lastMonthCount += agent.lastMonthCount;
                          acc.hasLastMonthData = true;
                        }

                        if (agent.lastYearCount !== null) {
                          acc.lastYearCount += agent.lastYearCount;
                          acc.hasLastYearData = true;
                        }

                        return acc;
                      }, {
                        selectedMetricCount: 0,
                        selectedFeeTotal: 0,
                        selectedFeeCount: 0,
                        nbRwCount: 0,
                        projectedCount: 0,
                        goal: 0,
                        lastMonthCount: 0,
                        lastYearCount: 0,
                        hasLastMonthData: false,
                        hasLastYearData: false,
                      });

                      const avgDenominator = selectedFeeType === 'broker'
                        ? regionTotals.nbRwCount
                        : regionTotals.selectedFeeCount;

                      const regionAvg = avgDenominator
                        ? regionTotals.selectedFeeTotal / avgDenominator
                        : 0;

                      return (
                        <React.Fragment key={group.regionName || 'all-agents'}>
                          {groupByRegion && (
                            <>
                              <tr>
                                <td
                                  colSpan={isBrokerView ? 12 : 9}
                                  style={styles.regionHeaderCell}
                                >
                                  <div style={styles.regionHeaderContent}>
                                    <strong>{group.regionName}</strong>
                                  </div>
                                </td>
                              </tr>

                              <tr>
                                <th style={styles.regionColumnHeaderCell}>Agent</th>
                                <th style={styles.regionColumnHeaderCell}>Office</th>
                                <th style={styles.regionColumnHeaderCell}>Region</th>
                                <th
                                  style={{
                                    ...styles.regionColumnHeaderCell,
                                    ...styles.metricCurrentHeaderCell,
                                  }}
                                >
                                  {selectedMetricConfig.shortCountLabel}
                                </th>
                                <th style={styles.regionColumnHeaderCell}>
                                  {selectedFeeConfig.label}
                                </th>
                                <th style={styles.regionColumnHeaderCell}>Avg Fee</th>
                                {isBrokerView && (
                                  <th
                                    style={{
                                      ...styles.regionColumnHeaderCell,
                                      ...styles.metricGoalHeaderCell,
                                    }}
                                  >
                                    NB/RW Count Goal
                                  </th>
                                )}
                                <th
                                  style={{
                                    ...styles.regionColumnHeaderCell,
                                    ...styles.metricProjectedHeaderCell,
                                  }}
                                >
                                  {selectedMetricConfig.projectedLabel}
                                </th>
                                <th style={styles.regionColumnHeaderCell}>
                                  Last Month
                                </th>
                                <th style={styles.regionColumnHeaderCell}>
                                  Last Year
                                </th>
                                {isBrokerView && (
                                  <>
                                    <th style={styles.regionColumnHeaderCell}>
                                      Goal Progress
                                    </th>
                                    <th style={styles.regionColumnHeaderCell}>
                                      Status
                                    </th>
                                  </>
                                )}
                              </tr>
                            </>
                          )}

                          {group.agents.map((agent) => {
                            const onTrack = agent.status === 'On Track';

                            return (
                              <tr key={agent.agentEmail}>
                                <td style={styles.officeCell}>
                                  <div style={styles.agentName}>
                                    {agent.csrName}
                                  </div>
                                  <div style={styles.smallMuted}>
                                    {agent.agentEmail}
                                  </div>
                                </td>
                                <td style={styles.numberCell}>
                                  {agent.offices?.length > 0
                                    ? agent.offices.join(', ')
                                    : agent.office}
                                </td>
                                <td style={styles.numberCell}>{agent.region}</td>
                                <td
                                  style={{
                                    ...styles.numberCell,
                                    ...styles.metricCurrentCell,
                                  }}
                                >
                                  <strong>
                                    {formatNumber(agent.selectedMetricCount)}
                                  </strong>
                                  {selectedMetricConfig.usesNbRwCount && (
                                    <div style={styles.smallMuted}>
                                      {formatNumber(agent.newBusinessCount)} NEW /{' '}
                                      {formatNumber(agent.rewriteCount)} RWR
                                    </div>
                                  )}
                                </td>
                                <td style={styles.numberCell}>
                                  {formatCurrency(agent.selectedFeeTotal)}
                                  <div style={styles.smallMuted}>
                                    {formatNumber(agent.selectedFeeCount)} fee transaction(s)
                                  </div>
                                </td>
                                <td style={styles.numberCell}>
                                  {formatCurrency(agent.selectedFeeAvg, 2)}
                                </td>
                                {isBrokerView && (
                                  <td style={{...styles.goalCell, ...styles.metricGoalCell}}>
                                    {canEditGoals && (
                                      savedAgentGoals[agent.agentEmail] === undefined ||
                                      editingAgentGoals[agent.agentEmail]
                                    ) ? (
                                      <div style={styles.editFieldRow}>
                                        <input
                                          type="number"
                                          min="0"
                                          step="1"
                                          value={
                                            agentGoals?.[agent.agentEmail]?.nb_rw ?? ''
                                          }
                                          onChange={(event) =>
                                            updateAgentGoal(
                                              agent.agentEmail,
                                              event.target.value
                                            )
                                          }
                                          placeholder="NB/RW goal"
                                          style={styles.goalInput}
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            saveAgentGoal(agent.agentEmail)
                                          }
                                          disabled={
                                            savingKey ===
                                            `agent-goal:${agent.agentEmail}`
                                          }
                                          style={styles.saveMiniButton}
                                        >
                                          {savingKey ===
                                          `agent-goal:${agent.agentEmail}`
                                            ? 'Saving'
                                            : 'Save'}
                                        </button>
                                        {savedAgentGoals[agent.agentEmail] !==
                                          undefined && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              cancelEditingAgentGoal(
                                                agent.agentEmail
                                              )
                                            }
                                            style={styles.cancelMiniButton}
                                          >
                                            Cancel
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <div style={styles.savedFieldRow}>
                                        <span style={styles.savedGoalValue}>
                                          {savedAgentGoals[agent.agentEmail] !==
                                          undefined
                                            ? formatNumber(
                                                savedAgentGoals[agent.agentEmail]
                                              )
                                            : 'Not Set'}
                                        </span>
                                        {canEditGoals && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              startEditingAgentGoal(
                                                agent.agentEmail
                                              )
                                            }
                                            style={styles.editMiniButton}
                                            title={`Edit ${getMonthLabel(
                                              selectedMonth
                                            )} goal`}
                                          >
                                            Edit
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                )}
                                <td
                                  style={{
                                    ...styles.strongCell,
                                    ...styles.metricProjectedCell,
                                  }}
                                >
                                  {formatDecimal(agent.projectedCount)}
                                </td>
                                <td style={styles.numberCell}>
                                  {agent.lastMonthCount === null
                                    ? '—'
                                    : formatNumber(agent.lastMonthCount)}
                                </td>
                                <td style={styles.numberCell}>
                                  {agent.lastYearCount === null
                                    ? '—'
                                    : formatNumber(agent.lastYearCount)}
                                </td>
                                {isBrokerView && (
                                  <>
                                    <td style={styles.progressCell}>
                                      {agent.goal > 0 ? (
                                        <>
                                          <div style={styles.progressText}>
                                            {Math.round(agent.actualGoalPercent)}%
                                          </div>
                                          <div style={styles.progressTrack}>
                                            <div
                                              style={{
                                                ...styles.progressFill,
                                                width: `${Math.min(
                                                  agent.actualGoalPercent,
                                                  100
                                                )}%`,
                                              }}
                                            />
                                          </div>
                                          <div style={styles.smallMuted}>
                                            {Math.round(agent.projectedGoalPercent)}% proj.
                                          </div>
                                        </>
                                      ) : '—'}
                                    </td>
                                    <td style={styles.numberCell}>
                                      <span
                                        style={
                                          agent.status === 'No Goal'
                                            ? styles.noGoalBadge
                                            : onTrack
                                              ? styles.onTrackBadge
                                              : styles.behindBadge
                                        }
                                      >
                                        {agent.status}
                                      </span>
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}

                          {groupByRegion && (() => {
                            const regionActualGoalPercent =
                              regionTotals.goal > 0
                                ? (regionTotals.selectedMetricCount / regionTotals.goal) * 100
                                : 0;

                            const regionProjectedGoalPercent =
                              regionTotals.goal > 0
                                ? (regionTotals.projectedCount / regionTotals.goal) * 100
                                : 0;

                            const regionOnTrack =
                              regionTotals.goal > 0 &&
                              regionTotals.projectedCount >= regionTotals.goal;

                            return (
                              <tr>
                                <td
                                  style={{
                                    ...styles.regionTotalCell,
                                    fontSize: 12,
                                    textTransform: 'uppercase',
                                    letterSpacing: '.02em',
                                  }}
                                >
                                  {group.regionName} Total
                                </td>
                                <td style={styles.regionTotalCell}>All Offices</td>
                                <td style={styles.regionTotalCell}>
                                  {group.regionName}
                                </td>
                                <td style={styles.regionTotalCell}>
                                  {formatNumber(regionTotals.selectedMetricCount)}
                                </td>
                                <td style={styles.regionTotalCell}>
                                  {formatCurrency(regionTotals.selectedFeeTotal)}
                                </td>
                                <td style={styles.regionTotalCell}>
                                  {formatCurrency(regionAvg, 2)}
                                </td>

                                {isBrokerView && (
                                  <td style={styles.regionTotalCell}>
                                    {regionTotals.goal > 0
                                      ? formatNumber(regionTotals.goal)
                                      : 'Not Set'}
                                  </td>
                                )}

                                <td style={styles.regionTotalCell}>
                                  {formatDecimal(regionTotals.projectedCount)}
                                </td>
                                <td style={styles.regionTotalCell}>
                                  {regionTotals.hasLastMonthData
                                    ? formatNumber(regionTotals.lastMonthCount)
                                    : '—'}
                                </td>
                                <td style={styles.regionTotalCell}>
                                  {regionTotals.hasLastYearData
                                    ? formatNumber(regionTotals.lastYearCount)
                                    : '—'}
                                </td>

                                {isBrokerView && (
                                  <>
                                    <td style={styles.regionTotalCell}>
                                      {regionTotals.goal > 0 ? (
                                        <>
                                          <div style={styles.progressText}>
                                            {Math.round(regionActualGoalPercent)}%
                                          </div>
                                          <div style={styles.progressTrack}>
                                            <div
                                              style={{
                                                ...styles.progressFill,
                                                width: `${Math.min(
                                                  regionActualGoalPercent,
                                                  100
                                                )}%`,
                                              }}
                                            />
                                          </div>
                                          <div style={styles.smallMuted}>
                                            {Math.round(regionProjectedGoalPercent)}% proj.
                                          </div>
                                        </>
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                    <td style={styles.regionTotalCell}>
                                      <span
                                        style={
                                          regionTotals.goal <= 0
                                            ? styles.noGoalBadge
                                            : regionOnTrack
                                              ? styles.onTrackBadge
                                              : styles.behindBadge
                                        }
                                      >
                                        {regionTotals.goal <= 0
                                          ? 'No Goal'
                                          : regionOnTrack
                                            ? 'On Track'
                                            : 'Behind'}
                                      </span>
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })()}
                        </React.Fragment>
                      );
                    })}
                  </tbody>

                  <tfoot>
                    <tr>
                      <td style={styles.footerCell}>All Agents</td>
                      <td style={styles.footerCell}>—</td>
                      <td style={styles.footerCell}>—</td>
                      <td
                        style={{
                          ...styles.footerCell,
                          ...styles.metricCurrentCell,
                        }}
                      >
                        {formatNumber(agentTotals.selectedMetricCount)}
                      </td>
                      <td style={styles.footerCell}>
                        {formatCurrency(agentTotals.selectedFeeTotal)}
                      </td>
                      <td style={styles.footerCell}>
                        {formatCurrency(agentTotals.selectedFeeAvg, 2)}
                      </td>
                      {isBrokerView && (
                        <td
                          style={{
                            ...styles.footerCell,
                            ...styles.metricGoalCell,
                          }}
                        >
                          {agentTotals.goal > 0
                            ? formatNumber(agentTotals.goal)
                            : 'Not Set'}
                        </td>
                      )}
                      <td
                        style={{
                          ...styles.footerCell,
                          ...styles.metricProjectedCell,
                        }}
                      >
                        {formatDecimal(agentTotals.projectedCount)}
                      </td>
                      <td style={styles.footerCell}>
                        {agentTotals.hasLastMonthData
                          ? formatNumber(agentTotals.lastMonthCount)
                          : '—'}
                      </td>
                      <td style={styles.footerCell}>
                        {agentTotals.hasLastYearData
                          ? formatNumber(agentTotals.lastYearCount)
                          : '—'}
                      </td>
                      {isBrokerView && (
                        <>
                          <td style={styles.footerCell}>—</td>
                          <td style={styles.footerCell}>{agentTotals.status}</td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      </div>
    </>
  );
};


const SummaryCard = ({ label, value, subtext }) => (
  <div style={styles.summaryCard}>
    <div style={styles.summaryLabel}>{label}</div>
    <div style={styles.summaryValue}>{value}</div>
    {subtext && <div style={styles.summarySubtext}>{subtext}</div>}
  </div>
);

const styles = {
  page: {
    minHeight: '100vh',
    padding: 28,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 20,
    marginBottom: 24,
  },
  title: { margin: 0, fontSize: 30, fontWeight: 850 },
  subtitle: { maxWidth: 900, margin: '8px 0 0', color: '#64748b', lineHeight: 1.5 },
  monthSelector: { display: 'flex', flexDirection: 'column', gap: 6 },
  monthLabel: { color: '#475569', fontSize: 13, fontWeight: 800 },
  monthInput: {
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    background: '#fff',
    fontSize: 15,
  },
  controlBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 18,
    marginBottom: 20,
  },
  monthTitle: { margin: 0, fontSize: 22 },
  monthDescription: { margin: '5px 0 0', color: '#64748b', fontSize: 14 },
  controlsRight: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  feeSelectorWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  feeSelectorLabel: { color: '#475569', fontSize: 13, fontWeight: 800 },
  feeSelector: {
    minWidth: 175,
    padding: '9px 11px',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    background: '#fff',
    color: '#0f172a',
    fontSize: 14,
    fontWeight: 800,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    color: '#475569',
    fontSize: 13,
    fontWeight: 800,
  },
  primaryButton: {
    padding: '9px 14px',
    border: 0,
    borderRadius: 8,
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 800,
  },
  segmentedControl: {
    display: 'inline-flex', padding: 3, border: '1px solid #cbd5e1',
    borderRadius: 10, background: '#fff',
  },
  segmentButton: {
    padding: '8px 13px', border: 0, borderRadius: 7,
    background: 'transparent', color: '#475569', cursor: 'pointer', fontWeight: 800,
  },
  segmentButtonActive: { background: '#2563eb', color: '#fff' },
  commissionPanel: {
    padding: 14, marginBottom: 20, border: '1px solid #e2e8f0',
    borderRadius: 12, background: '#fff',
  },
  commissionPanelTitle: { marginBottom: 10, fontSize: 15, fontWeight: 900 },
  ruleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 },
  ruleCard: { padding: 12, border: '1px solid #dbe3ef', borderRadius: 10, background: '#f8fafc' },
  ruleTitle: { marginBottom: 6, color: '#475569', fontSize: 12, fontWeight: 900 },
  ruleText: { color: '#0f172a', fontSize: 13, fontWeight: 800, lineHeight: 1.45 },
  ruleNote: { marginTop: 10, padding: 11, border: '1px solid #dbe3ef', borderRadius: 9, background: '#f8fafc', fontSize: 12, lineHeight: 1.5 },
  warningNote: { marginTop: 8, color: '#92400e', fontSize: 12, fontWeight: 700 },
  weeklyTargetLabel: { display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 14, fontWeight: 900 },
  weeklyTargetInput: { width: 100, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 7, fontWeight: 800 },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    padding: 14,
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    background: '#fff',
    boxShadow: '0 1px 3px rgba(15,23,42,.05)',
  },
  summaryLabel: { marginBottom: 8, color: '#64748b', fontSize: 13, fontWeight: 800 },
  summaryValue: { fontSize: 21, fontWeight: 900 },
  summarySubtext: { marginTop: 6, color: '#64748b', fontSize: 12, fontWeight: 700 },
  errorBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    padding: 15,
    marginBottom: 20,
    border: '1px solid #fecdd3',
    borderRadius: 10,
    background: '#fff1f2',
    color: '#9f1239',
  },
  retryButton: {
    padding: '8px 14px',
    border: 0,
    borderRadius: 7,
    background: '#be123c',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 800,
  },
  tableCard: {
    overflow: 'hidden',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    background: '#fff',
    boxShadow: '0 1px 3px rgba(15,23,42,.05)',
  },
  tableWrapper: { overflowX: 'auto' },
  table: {
    width: '100%',
    minWidth: 1040,
    borderCollapse: 'collapse',
    textAlign: 'left',
    tableLayout: 'auto',
  },
  tableHeader: {
    padding: '9px 8px',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
    color: '#475569',
    fontSize: 9,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: '.025em',
    whiteSpace: 'nowrap',
  },
  officeCell: {
    minWidth: 150,
    maxWidth: 220,
    padding: '10px 8px',
    borderBottom: '1px solid #f1f5f9',
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  regionCell: {
    minWidth: 105,
    maxWidth: 135,
    padding: '8px 6px',
    borderBottom: '1px solid #f1f5f9',
  },
  numberCell: {
    padding: '10px 8px',
    borderBottom: '1px solid #f1f5f9',
    whiteSpace: 'nowrap',
    fontSize: 12,
  },
  goalCell: {
    minWidth: 95,
    maxWidth: 120,
    padding: '8px 6px',
    borderBottom: '1px solid #f1f5f9',
  },
  strongCell: {
    padding: '10px 8px',
    borderBottom: '1px solid #f1f5f9',
    fontWeight: 900,
    whiteSpace: 'nowrap',
    fontSize: 12,
  },
  progressCell: {
    minWidth: 95,
    maxWidth: 115,
    padding: '10px 8px',
    borderBottom: '1px solid #f1f5f9',
  },
  progressText: { marginBottom: 4, fontSize: 10, fontWeight: 800 },
  progressTrack: { height: 7, overflow: 'hidden', borderRadius: 999, background: '#e2e8f0' },
  progressFill: { height: '100%', borderRadius: 999, background: '#2563eb' },
  accessNote: {
    marginTop: 8,
    color: '#475569',
    fontSize: 12,
    fontWeight: 800,
  },
  readOnlyInput: {
    background: '#f1f5f9',
    color: '#64748b',
    cursor: 'not-allowed',
  },
  editFieldRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  savedFieldRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 34,
  },
  savedFieldText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 800,
  },
  savedGoalValue: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: 900,
  },
  editMiniButton: {
    padding: '3px 5px',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    background: '#fff',
    color: '#475569',
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 900,
  },
  saveMiniButton: {
    padding: '6px 8px',
    border: 0,
    borderRadius: 6,
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  cancelMiniButton: {
    padding: '6px 8px',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    background: '#fff',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  inlineInput: {
    width: '100%',
    minWidth: 72,
    boxSizing: 'border-box',
    padding: '6px 7px',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    background: '#fff',
    fontSize: 11,
  },
  goalInput: {
    width: '100%',
    minWidth: 62,
    boxSizing: 'border-box',
    padding: '6px 7px',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    background: '#fff',
    fontSize: 11,
    fontWeight: 800,
  },
  agentName: {
    fontSize: 13,
    fontWeight: 900,
    color: '#0f172a',
    lineHeight: 1.25,
  },
  smallMuted: {
    marginTop: 3,
    color: '#64748b',
    fontSize: 9,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  onTrackBadge: {
    display: 'inline-block',
    padding: '5px 9px',
    borderRadius: 999,
    background: '#d1fae5',
    color: '#047857',
    fontSize: 12,
    fontWeight: 900,
  },
  behindBadge: {
    display: 'inline-block',
    padding: '5px 9px',
    borderRadius: 999,
    background: '#ffe4e6',
    color: '#be123c',
    fontSize: 12,
    fontWeight: 900,
  },
  noGoalBadge: {
    display: 'inline-block',
    padding: '5px 9px',
    borderRadius: 999,
    background: '#e2e8f0',
    color: '#475569',
    fontSize: 12,
    fontWeight: 900,
  },
  difference: { marginTop: 5, fontSize: 12, fontWeight: 800 },
  regionHeaderCell: {
    padding: '9px 10px',
    borderTop: '2px solid #94a3b8',
    borderBottom: '1px solid #cbd5e1',
    background: '#e2e8f0',
  },
  regionColumnHeaderCell: {
    padding: '7px 8px',
    borderBottom: '1px solid #d4b106',
    background: '#fff59d',
    color: '#3f3f00',
    fontSize: 9,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: '.02em',
    whiteSpace: 'nowrap',
  },

  metricCurrentCell: {
    background: '#f5f9ff',
  },
  metricGoalCell: {
    background: '#fff8dc',
  },
  metricProjectedCell: {
    background: '#eef7ff',
  },
  metricCurrentHeaderCell: {
    background: '#dbeafe',
  },
  metricGoalHeaderCell: {
    background: '#fde68a',
  },
  metricProjectedHeaderCell: {
    background: '#dbeafe',
  },
  regionHeaderContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    color: '#334155',
  },
  regionTotalCell: {
    padding: '10px 8px',
    borderTop: '2px solid #93c5fd',
    borderBottom: '2px solid #60a5fa',
    background: '#dbeafe',
    color: '#0f172a',
    fontWeight: 900,
    whiteSpace: 'nowrap',
    fontSize: 11,
  },
  footerCell: {
    padding: '10px 8px',
    borderTop: '2px solid #0f172a',
    background: '#f1f5f9',
    fontWeight: 900,
    whiteSpace: 'nowrap',
    fontSize: 11,
  },
  loading: { padding: '50px 24px', color: '#64748b', textAlign: 'center', fontWeight: 700 },
};

export default OfficeNumbers;
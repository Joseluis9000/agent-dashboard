// OfficeNumbers.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

const PAGE_SIZE = 1000;
const SETTINGS_STORAGE_KEY = 'officeNumbersPacingSettingsV5';

// Module-level request caches survive React 18 StrictMode's development remount.
// They also let Offices/Agents reuse the same monthly dashboard RPC response.
const dashboardRequestCache = new Map();
const dashboardRequestInFlight = new Map();
const rawRangeRequestCache = new Map();
const rawRangeRequestInFlight = new Map();
const officeDetailRequestCache = new Map();
const officeDetailRequestInFlight = new Map();
const agentDetailRequestCache = new Map();
const agentDetailRequestInFlight = new Map();

const getCachedDashboardRows = async (month, force = false) => {
  if (!force && dashboardRequestCache.has(month)) {
    return dashboardRequestCache.get(month);
  }

  if (!force && dashboardRequestInFlight.has(month)) {
    return dashboardRequestInFlight.get(month);
  }

  const request = supabase
    .rpc('get_office_numbers_dashboard', { p_month: month })
    .then(({ data, error }) => {
      if (error) throw error;
      const rows = data || [];
      dashboardRequestCache.set(month, rows);
      return rows;
    })
    .finally(() => {
      dashboardRequestInFlight.delete(month);
    });

  dashboardRequestInFlight.set(month, request);
  return request;
};

const getCachedRawRange = async (firstDay, nextMonthFirstDay, force = false) => {
  const cacheKey = `${firstDay}|${nextMonthFirstDay}`;

  if (!force && rawRangeRequestCache.has(cacheKey)) {
    return rawRangeRequestCache.get(cacheKey);
  }

  if (!force && rawRangeRequestInFlight.has(cacheKey)) {
    return rawRangeRequestInFlight.get(cacheKey);
  }

  const request = (async () => {
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

    rawRangeRequestCache.set(cacheKey, allRows);
    return allRows;
  })().finally(() => {
    rawRangeRequestInFlight.delete(cacheKey);
  });

  rawRangeRequestInFlight.set(cacheKey, request);
  return request;
};

const getCachedOfficeDetail = async (month, officeCode, trendMonths = 12, force = false) => {
  const normalizedOffice = normalizeOffice(officeCode);
  const cacheKey = `${month}|${normalizedOffice}|${trendMonths}`;

  if (!force && officeDetailRequestCache.has(cacheKey)) {
    return officeDetailRequestCache.get(cacheKey);
  }

  if (!force && officeDetailRequestInFlight.has(cacheKey)) {
    return officeDetailRequestInFlight.get(cacheKey);
  }

  const request = supabase
    .rpc('get_office_numbers_detail', {
      p_month: month,
      p_office_code: normalizedOffice,
      p_trend_months: trendMonths,
    })
    .then(({ data, error }) => {
      if (error) throw error;
      const payload = Array.isArray(data) ? (data[0] || {}) : (data || {});
      officeDetailRequestCache.set(cacheKey, payload);
      return payload;
    })
    .finally(() => {
      officeDetailRequestInFlight.delete(cacheKey);
    });

  officeDetailRequestInFlight.set(cacheKey, request);
  return request;
};


const getCachedAgentDetail = async (month, agentEmail, trendMonths = 12, force = false) => {
  const normalizedEmail = cleanStr(agentEmail).toLowerCase();
  const cacheKey = `${month}|${normalizedEmail}|${trendMonths}`;

  if (!force && agentDetailRequestCache.has(cacheKey)) {
    return agentDetailRequestCache.get(cacheKey);
  }

  if (!force && agentDetailRequestInFlight.has(cacheKey)) {
    return agentDetailRequestInFlight.get(cacheKey);
  }

  const request = supabase
    .rpc('get_office_numbers_agent_detail', {
      p_month: month,
      p_agent_email: normalizedEmail,
      p_trend_months: trendMonths,
    })
    .then(({ data, error }) => {
      if (error) throw error;
      const payload = Array.isArray(data) ? (data[0] || {}) : (data || {});
      agentDetailRequestCache.set(cacheKey, payload);
      return payload;
    })
    .finally(() => {
      agentDetailRequestInFlight.delete(cacheKey);
    });

  agentDetailRequestInFlight.set(cacheKey, request);
  return request;
};

const INSURANCE_FEE_TYPES = [
  'broker',
  'endorsement',
  'renewal',
  'reinstatement',
  'payment',
];

const ALL_FEE_COMPONENT_TYPES = [
  ...INSURANCE_FEE_TYPES,
  'registration',
  'convenience',
  'tax_prep',
];

const FEE_TYPE_OPTIONS = [
  { value: 'broker', label: 'Broker Fee' },
  { value: 'endorsement', label: 'Endorsement Fee' },
  { value: 'renewal', label: 'Renewal Fee' },
  { value: 'reinstatement', label: 'Reinstatement Fee' },
  { value: 'payment', label: 'Payment Fee' },
  { value: 'insurance', label: 'Insurance Fees' },
  { value: 'registration', label: 'Registration Fee' },
  { value: 'convenience', label: 'Convenience Fee' },
  { value: 'tax_prep', label: 'Tax Prep / Product Fee' },
  { value: 'all', label: 'All Fees' },
];

const getFeeMetricFromRpcRow = (row, feeType, metric) => {
  if (!row) return 0;

  if (feeType === 'insurance') {
    return INSURANCE_FEE_TYPES.reduce(
      (sum, type) => sum + (Number(row[`${type}_fee_${metric}`]) || 0),
      0
    );
  }

  if (feeType === 'all') {
    const directValue = row[`all_fee_${metric}`];
    if (directValue !== undefined && directValue !== null) {
      return Number(directValue) || 0;
    }

    return ALL_FEE_COMPONENT_TYPES.reduce(
      (sum, type) => sum + (Number(row[`${type}_fee_${metric}`]) || 0),
      0
    );
  }

  return Number(row[`${feeType}_fee_${metric}`]) || 0;
};

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
  insurance: 0,
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

      if (INSURANCE_FEE_TYPES.includes(feeCategory)) {
        feeTotals.insurance += fee;
        feeCounts.insurance += Math.sign(fee);
      }
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

const OfficeNumbers = () => {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
  const [monthlyRows, setMonthlyRows] = useState([]);
  const [lastMonthRows, setLastMonthRows] = useState([]);
  const [lastYearRows, setLastYearRows] = useState([]);
  const [agentMonthlyRows, setAgentMonthlyRows] = useState([]);
  const [agentLastMonthRows, setAgentLastMonthRows] = useState([]);
  const [agentLastYearRows, setAgentLastYearRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedFeeType, setSelectedFeeType] = useState('broker');
  const [viewMode, setViewMode] = useState('office');
  const [selectedOffice, setSelectedOffice] = useState('');
  const [selectedAgentEmail, setSelectedAgentEmail] = useState('');
  const [officeDetailData, setOfficeDetailData] = useState(null);
  const [officeDetailLoading, setOfficeDetailLoading] = useState(false);
  const [officeDetailError, setOfficeDetailError] = useState('');
  const [agentDetailData, setAgentDetailData] = useState(null);
  const [agentDetailLoading, setAgentDetailLoading] = useState(false);
  const [agentDetailError, setAgentDetailError] = useState('');

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

  const fetchDashboardData = useCallback(async (options = {}) => {
    const { force = false, includeAgents = viewMode === 'agent' } = options;

    setLoading(true);
    setErrorMessage('');

    try {
      const combinedRows = await getCachedDashboardRows(selectedMonth, force);
      const currentRows = combinedRows.filter(
        (row) => cleanStr(row.comparison_period).toLowerCase() === 'current'
      );
      const previousMonthRows = combinedRows.filter(
        (row) => cleanStr(row.comparison_period).toLowerCase() === 'previous'
      );
      const previousYearRows = combinedRows.filter(
        (row) => cleanStr(row.comparison_period).toLowerCase() === 'last_year'
      );

      setMonthlyRows(currentRows);
      setLastMonthRows(previousMonthRows);
      setLastYearRows(previousYearRows);

      // Agent transaction detail is lazy-loaded only when Agents is opened.
      // The office dashboard RPC is reused from cache instead of being called again.
      if (includeAgents) {
        const [currentAgentRows, previousAgentRows, previousYearAgentRows] = await Promise.all([
          getCachedRawRange(monthDetails.firstDay, monthDetails.nextMonthFirstDay, force),
          getCachedRawRange(comparisonMonths.lastMonth.firstDay, comparisonMonths.lastMonth.nextMonthFirstDay, force),
          getCachedRawRange(comparisonMonths.lastYear.firstDay, comparisonMonths.lastYear.nextMonthFirstDay, force),
        ]);
        setAgentMonthlyRows(currentAgentRows);
        setAgentLastMonthRows(previousAgentRows);
        setAgentLastYearRows(previousYearAgentRows);
      }
    } catch (error) {
      console.error('Error fetching office numbers:', error);
      setErrorMessage(error?.message || 'Unable to load the monthly office report.');
      setMonthlyRows([]);
      setLastMonthRows([]);
      setLastYearRows([]);
      if (includeAgents) {
        setAgentMonthlyRows([]);
        setAgentLastMonthRows([]);
        setAgentLastYearRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [
    selectedMonth,
    viewMode,
    monthDetails.firstDay,
    monthDetails.nextMonthFirstDay,
    comparisonMonths.lastMonth.firstDay,
    comparisonMonths.lastMonth.nextMonthFirstDay,
    comparisonMonths.lastYear.firstDay,
    comparisonMonths.lastYear.nextMonthFirstDay,
  ]);

  const fetchOfficeDetail = useCallback(async (officeName, options = {}) => {
    const { force = false } = options;
    const normalizedOffice = normalizeOffice(officeName);
    if (!normalizedOffice || normalizedOffice === 'Unknown') return;

    setOfficeDetailLoading(true);
    setOfficeDetailError('');

    try {
      const payload = await getCachedOfficeDetail(
        selectedMonth,
        normalizedOffice,
        12,
        force
      );
      setOfficeDetailData(payload);
    } catch (error) {
      console.error('Error fetching office detail:', error);
      setOfficeDetailError(error?.message || 'Unable to load office detail.');
      setOfficeDetailData(null);
    } finally {
      setOfficeDetailLoading(false);
    }
  }, [selectedMonth]);

  const fetchAgentDetail = useCallback(async (agentEmail, options = {}) => {
    const { force = false } = options;
    const normalizedEmail = cleanStr(agentEmail).toLowerCase();
    if (!normalizedEmail || normalizedEmail === 'unknown agent') return;

    setAgentDetailLoading(true);
    setAgentDetailError('');

    try {
      const payload = await getCachedAgentDetail(selectedMonth, normalizedEmail, 12, force);
      setAgentDetailData(payload);
    } catch (error) {
      console.error('Error fetching agent detail:', error);
      setAgentDetailError(error?.message || 'Unable to load agent detail.');
      setAgentDetailData(null);
    } finally {
      setAgentDetailLoading(false);
    }
  }, [selectedMonth]);

  // Month/profile/settings load. Fee changes do not participate in fetching.
  useEffect(() => {
    fetchProfileAndSettings();
  }, [fetchProfileAndSettings]);

  // The office RPC loads once per month and is deduped across StrictMode remounts.
  useEffect(() => {
    fetchDashboardData({ includeAgents: false });
  }, [selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opening Agents lazy-loads raw rows, while reusing the cached office RPC result.
  useEffect(() => {
    if (viewMode !== 'agent') return;
    fetchDashboardData({ includeAgents: true });
  }, [viewMode, selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Office Detail uses a dedicated lightweight RPC. It does not load all-office raw agent rows.
  useEffect(() => {
    if (!selectedOffice || viewMode !== 'office') return;
    setOfficeDetailData(null);
    fetchOfficeDetail(selectedOffice);
  }, [selectedOffice, selectedMonth, viewMode, fetchOfficeDetail]);

  // Agent Detail is company/region/office scoped by the RPC based on the signed-in role.
  useEffect(() => {
    if (!selectedAgentEmail || viewMode !== 'office') return;
    setAgentDetailData(null);
    fetchAgentDetail(selectedAgentEmail);
  }, [selectedAgentEmail, selectedMonth, viewMode, fetchAgentDetail]);

  const visibleMonthlyRows = useMemo(
    () => monthlyRows.filter((row) => canViewOffice(row.office_code || row.office)),
    [monthlyRows, canViewOffice]
  );

  const visibleLastMonthRows = useMemo(
    () => lastMonthRows.filter((row) => canViewOffice(row.office_code || row.office)),
    [lastMonthRows, canViewOffice]
  );

  const visibleLastYearRows = useMemo(
    () => lastYearRows.filter((row) => canViewOffice(row.office_code || row.office)),
    [lastYearRows, canViewOffice]
  );

  const visibleAgentMonthlyRows = useMemo(
    () => agentMonthlyRows.filter((row) => canViewOffice(row.office)),
    [agentMonthlyRows, canViewOffice]
  );

  const visibleAgentLastMonthRows = useMemo(
    () => agentLastMonthRows.filter((row) => canViewOffice(row.office)),
    [agentLastMonthRows, canViewOffice]
  );

  const visibleAgentLastYearRows = useMemo(
    () => agentLastYearRows.filter((row) => canViewOffice(row.office)),
    [agentLastYearRows, canViewOffice]
  );

  const latestDataDate = useMemo(() => {
    return visibleMonthlyRows.reduce((latest, row) => {
      const date = cleanStr(row?.latest_data_date);
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

  const getOfficeSummaryMetric = useCallback((row) => {
    if (!row) return null;
    if (selectedMetricConfig.usesNbRwCount) return Number(row.nb_rw_count) || 0;
    return getFeeMetricFromRpcRow(row, selectedFeeType, 'count');
  }, [selectedFeeType, selectedMetricConfig.usesNbRwCount]);

  const lastMonthMetricByOffice = useMemo(() => {
    const output = {};
    visibleLastMonthRows.forEach((row) => {
      output[normalizeOffice(row.office_code)] = getOfficeSummaryMetric(row);
    });
    return output;
  }, [visibleLastMonthRows, getOfficeSummaryMetric]);

  const lastYearMetricByOffice = useMemo(() => {
    const output = {};
    visibleLastYearRows.forEach((row) => {
      output[normalizeOffice(row.office_code)] = getOfficeSummaryMetric(row);
    });
    return output;
  }, [visibleLastYearRows, getOfficeSummaryMetric]);


  const lastMonthMetricByAgent = useMemo(
    () => buildAgentHistoricalMetricMap(
      visibleAgentLastMonthRows,
      selectedFeeType,
      selectedMetricConfig.usesNbRwCount
    ),
    [visibleAgentLastMonthRows, selectedFeeType, selectedMetricConfig.usesNbRwCount]
  );

  const lastYearMetricByAgent = useMemo(
    () => buildAgentHistoricalMetricMap(
      visibleAgentLastYearRows,
      selectedFeeType,
      selectedMetricConfig.usesNbRwCount
    ),
    [visibleAgentLastYearRows, selectedFeeType, selectedMetricConfig.usesNbRwCount]
  );

  const officeMetrics = useMemo(() => {
    return visibleMonthlyRows
      .map((row) => {
        const officeName = normalizeOffice(row.office_code);
        const feeTotals = {
          broker: Number(row.broker_fee_total) || 0,
          endorsement: Number(row.endorsement_fee_total) || 0,
          renewal: Number(row.renewal_fee_total) || 0,
          reinstatement: Number(row.reinstatement_fee_total) || 0,
          payment: Number(row.payment_fee_total) || 0,
          registration: Number(row.registration_fee_total) || 0,
          convenience: Number(row.convenience_fee_total) || 0,
          tax_prep: Number(row.tax_prep_fee_total) || 0,
          insurance: getFeeMetricFromRpcRow(row, 'insurance', 'total'),
          all: Number(row.all_fee_total) || 0,
        };
        const feeCounts = {
          broker: Number(row.broker_fee_count) || 0,
          endorsement: Number(row.endorsement_fee_count) || 0,
          renewal: Number(row.renewal_fee_count) || 0,
          reinstatement: Number(row.reinstatement_fee_count) || 0,
          payment: Number(row.payment_fee_count) || 0,
          registration: Number(row.registration_fee_count) || 0,
          convenience: Number(row.convenience_fee_count) || 0,
          tax_prep: Number(row.tax_prep_fee_count) || 0,
          insurance: getFeeMetricFromRpcRow(row, 'insurance', 'count'),
          all: Number(row.all_fee_count) || 0,
        };

        const nbRwCount = Number(row.nb_rw_count) || 0;
        const newBusinessCount = row.new_business_count == null ? null : Number(row.new_business_count) || 0;
        const rewriteCount = row.rewrite_count == null ? null : Number(row.rewrite_count) || 0;
        const selectedFeeTotal = feeTotals[selectedFeeType] || 0;
        const selectedFeeCount = feeCounts[selectedFeeType] || 0;
        const selectedFeeAvgDenominator = selectedFeeType === 'broker'
          ? nbRwCount
          : selectedFeeCount;
        const selectedFeeAvg = selectedFeeAvgDenominator !== 0
          ? selectedFeeTotal / selectedFeeAvgDenominator
          : 0;
        const selectedMetricCount = selectedMetricConfig.usesNbRwCount
          ? nbRwCount
          : selectedFeeCount;
        const projectedCount = selectedMetricCount * pacingDetails.projectionMultiplier;
        const goal = isBrokerView ? Number(officeGoals?.[officeName]?.nb_rw) || 0 : 0;
        const actualGoalPercent = isBrokerView && goal > 0
          ? (selectedMetricCount / goal) * 100
          : 0;
        const projectedGoalPercent = isBrokerView && goal > 0
          ? (projectedCount / goal) * 100
          : 0;
        const difference = isBrokerView ? projectedCount - goal : 0;

        return {
          officeName,
          region: cleanStr(row.region) || cleanStr(officeRegions[officeName]) || 'Unassigned',
          dataSource: cleanStr(row.data_source) || 'detailed',
          nbRwCount,
          newBusinessCount,
          rewriteCount,
          feeTotals,
          feeCounts,
          transactionCount: Number(row.valid_receipt_count) || 0,
          rawRows: Number(row.raw_rows_count) || 0,
          validRows: Number(row.valid_rows_count) || 0,
          excludedRows: Number(row.excluded_rows_count) || 0,
          activeDays: Number(row.active_days) || 0,
          selectedFeeTotal,
          selectedFeeCount,
          selectedFeeAvg,
          selectedMetricCount,
          projectedCount,
          lastMonthCount: lastMonthMetricByOffice[officeName] ?? null,
          lastYearCount: lastYearMetricByOffice[officeName] ?? null,
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
    selectedFeeType,
    selectedMetricConfig.usesNbRwCount,
    pacingDetails.projectionMultiplier,
    officeGoals,
    officeRegions,
    isBrokerView,
    lastMonthMetricByOffice,
    lastYearMetricByOffice,
  ]);

  const agentMetrics = useMemo(() => {
    const groups = new Map();

    visibleAgentMonthlyRows.forEach((row) => {
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
    visibleAgentMonthlyRows,
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
      if (office.newBusinessCount !== null) acc.newBusinessCount += office.newBusinessCount;
      if (office.rewriteCount !== null) acc.rewriteCount += office.rewriteCount;
      if (office.dataSource === 'legacy') acc.hasLegacyData = true;
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
      hasLegacyData: false,
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

  const selectedOfficeMetric = useMemo(
    () => officeMetrics.find((office) => office.officeName === selectedOffice) || null,
    [officeMetrics, selectedOffice]
  );

  const selectedOfficeAgents = useMemo(() => {
    const rows = Array.isArray(officeDetailData?.agents) ? officeDetailData.agents : [];

    return rows
      .map((agent) => {
        const nbRwCount = Number(agent.nb_rw_count) || 0;
        const feeTotal = getFeeMetricFromRpcRow(agent, selectedFeeType, 'total');
        const feeCount = getFeeMetricFromRpcRow(agent, selectedFeeType, 'count');
        const selectedMetricCount = selectedMetricConfig.usesNbRwCount ? nbRwCount : feeCount;
        const avgDenominator = selectedFeeType === 'broker' ? nbRwCount : feeCount;
        const goal = isBrokerView ? Number(agent.nb_rw_goal) || 0 : 0;
        const projectedCount = selectedMetricCount * pacingDetails.projectionMultiplier;

        return {
          agentEmail: cleanStr(agent.agent_email) || 'Unknown Agent',
          csrName: cleanStr(agent.csr_name) || cleanStr(agent.agent_email) || 'Unknown Agent',
          nbRwCount,
          newBusinessCount: Number(agent.new_business_count) || 0,
          rewriteCount: Number(agent.rewrite_count) || 0,
          selectedMetricCount,
          selectedFeeTotal: feeTotal,
          selectedFeeCount: feeCount,
          selectedFeeAvg: avgDenominator ? feeTotal / avgDenominator : 0,
          goal,
          projectedCount,
          actualGoalPercent: goal > 0 ? (selectedMetricCount / goal) * 100 : 0,
          projectedGoalPercent: goal > 0 ? (projectedCount / goal) * 100 : 0,
          status: !isBrokerView
            ? ''
            : goal <= 0
              ? 'No Goal'
              : projectedCount >= goal
                ? 'On Track'
                : 'Behind',
          activeDays: Number(agent.active_days) || 0,
          validReceiptCount: Number(agent.valid_receipt_count) || 0,
          raw: agent,
          feeTotals: {
            broker: getFeeMetricFromRpcRow(agent, 'broker', 'total'),
            endorsement: getFeeMetricFromRpcRow(agent, 'endorsement', 'total'),
            renewal: getFeeMetricFromRpcRow(agent, 'renewal', 'total'),
            reinstatement: getFeeMetricFromRpcRow(agent, 'reinstatement', 'total'),
            payment: getFeeMetricFromRpcRow(agent, 'payment', 'total'),
            insurance: getFeeMetricFromRpcRow(agent, 'insurance', 'total'),
            registration: getFeeMetricFromRpcRow(agent, 'registration', 'total'),
            convenience: getFeeMetricFromRpcRow(agent, 'convenience', 'total'),
            tax_prep: getFeeMetricFromRpcRow(agent, 'tax_prep', 'total'),
            all: getFeeMetricFromRpcRow(agent, 'all', 'total'),
          },
          feeCounts: {
            broker: getFeeMetricFromRpcRow(agent, 'broker', 'count'),
            endorsement: getFeeMetricFromRpcRow(agent, 'endorsement', 'count'),
            renewal: getFeeMetricFromRpcRow(agent, 'renewal', 'count'),
            reinstatement: getFeeMetricFromRpcRow(agent, 'reinstatement', 'count'),
            payment: getFeeMetricFromRpcRow(agent, 'payment', 'count'),
            insurance: getFeeMetricFromRpcRow(agent, 'insurance', 'count'),
            registration: getFeeMetricFromRpcRow(agent, 'registration', 'count'),
            convenience: getFeeMetricFromRpcRow(agent, 'convenience', 'count'),
            tax_prep: getFeeMetricFromRpcRow(agent, 'tax_prep', 'count'),
            all: getFeeMetricFromRpcRow(agent, 'all', 'count'),
          },
        };
      })
      .sort((a, b) => {
        if (b.selectedMetricCount !== a.selectedMetricCount) {
          return b.selectedMetricCount - a.selectedMetricCount;
        }
        return b.selectedFeeTotal - a.selectedFeeTotal;
      });
  }, [
    officeDetailData,
    selectedFeeType,
    selectedMetricConfig.usesNbRwCount,
    isBrokerView,
    pacingDetails.projectionMultiplier,
  ]);

  const selectedOfficeTrend = useMemo(() => {
    const rows = Array.isArray(officeDetailData?.trend) ? officeDetailData.trend : [];

    return rows.map((row) => {
      const nbRwCount = Number(row.nb_rw_count) || 0;
      const feeCount = getFeeMetricFromRpcRow(row, selectedFeeType, 'count');
      const feeTotal = getFeeMetricFromRpcRow(row, selectedFeeType, 'total');

      return {
        month: cleanStr(row.month),
        dataSource: cleanStr(row.data_source) || 'none',
        selectedMetricCount: selectedMetricConfig.usesNbRwCount ? nbRwCount : feeCount,
        selectedFeeTotal: feeTotal,
        nbRwCount,
        goal: Number(row.nb_rw_goal) || 0,
      };
    });
  }, [officeDetailData, selectedFeeType, selectedMetricConfig.usesNbRwCount]);

  const selectedAgentMetric = useMemo(
    () => selectedOfficeAgents.find((agent) => agent.agentEmail === selectedAgentEmail) || null,
    [selectedOfficeAgents, selectedAgentEmail]
  );


  const allAuthorizedAgentMetric = useMemo(() => {
    const agent = agentDetailData?.agent;
    if (!agent) return selectedAgentMetric;

    const nbRwCount = Number(agent.nb_rw_count) || 0;
    const feeTotal = getFeeMetricFromRpcRow(agent, selectedFeeType, 'total');
    const feeCount = getFeeMetricFromRpcRow(agent, selectedFeeType, 'count');
    const selectedMetricCount = selectedMetricConfig.usesNbRwCount ? nbRwCount : feeCount;
    const avgDenominator = selectedFeeType === 'broker' ? nbRwCount : feeCount;
    const goal = isBrokerView ? Number(agent.nb_rw_goal) || 0 : 0;
    const projectedCount = selectedMetricCount * pacingDetails.projectionMultiplier;

    return {
      agentEmail: cleanStr(agent.agent_email) || selectedAgentEmail,
      csrName: cleanStr(agent.csr_name) || selectedAgentMetric?.csrName || selectedAgentEmail,
      nbRwCount,
      newBusinessCount: Number(agent.new_business_count) || 0,
      rewriteCount: Number(agent.rewrite_count) || 0,
      selectedMetricCount,
      selectedFeeTotal: feeTotal,
      selectedFeeCount: feeCount,
      selectedFeeAvg: avgDenominator ? feeTotal / avgDenominator : 0,
      goal,
      projectedCount,
      actualGoalPercent: goal > 0 ? (selectedMetricCount / goal) * 100 : 0,
      projectedGoalPercent: goal > 0 ? (projectedCount / goal) * 100 : 0,
      status: !isBrokerView ? '' : goal <= 0 ? 'No Goal' : projectedCount >= goal ? 'On Track' : 'Behind',
      activeDays: Number(agent.active_days) || 0,
      validReceiptCount: Number(agent.valid_receipt_count) || 0,
      raw: agent,
      feeTotals: {
        broker: getFeeMetricFromRpcRow(agent, 'broker', 'total'),
        endorsement: getFeeMetricFromRpcRow(agent, 'endorsement', 'total'),
        renewal: getFeeMetricFromRpcRow(agent, 'renewal', 'total'),
        reinstatement: getFeeMetricFromRpcRow(agent, 'reinstatement', 'total'),
        payment: getFeeMetricFromRpcRow(agent, 'payment', 'total'),
        insurance: getFeeMetricFromRpcRow(agent, 'insurance', 'total'),
        registration: getFeeMetricFromRpcRow(agent, 'registration', 'total'),
        convenience: getFeeMetricFromRpcRow(agent, 'convenience', 'total'),
        tax_prep: getFeeMetricFromRpcRow(agent, 'tax_prep', 'total'),
        all: getFeeMetricFromRpcRow(agent, 'all', 'total'),
      },
      feeCounts: {
        broker: getFeeMetricFromRpcRow(agent, 'broker', 'count'),
        endorsement: getFeeMetricFromRpcRow(agent, 'endorsement', 'count'),
        renewal: getFeeMetricFromRpcRow(agent, 'renewal', 'count'),
        reinstatement: getFeeMetricFromRpcRow(agent, 'reinstatement', 'count'),
        payment: getFeeMetricFromRpcRow(agent, 'payment', 'count'),
        insurance: getFeeMetricFromRpcRow(agent, 'insurance', 'count'),
        registration: getFeeMetricFromRpcRow(agent, 'registration', 'count'),
        convenience: getFeeMetricFromRpcRow(agent, 'convenience', 'count'),
        tax_prep: getFeeMetricFromRpcRow(agent, 'tax_prep', 'count'),
        all: getFeeMetricFromRpcRow(agent, 'all', 'count'),
      },
    };
  }, [agentDetailData, selectedAgentMetric, selectedAgentEmail, selectedFeeType, selectedMetricConfig.usesNbRwCount, isBrokerView, pacingDetails.projectionMultiplier]);

  const openOfficeDetail = (officeName) => {
    setSelectedAgentEmail('');
    setSelectedOffice(officeName);
    setOfficeDetailData(null);
    setOfficeDetailError('');
    setViewMode('office');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openAgentDetail = (agentEmail) => {
    setAgentDetailData(null);
    setAgentDetailError('');
    setSelectedAgentEmail(agentEmail);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderOfficeRow = (office) => {
    const onTrack = office.status === 'On Track';

    return (
      <tr key={office.officeName}>
        <td style={styles.officeCell}>
          <button
            type="button"
            onClick={() => openOfficeDetail(office.officeName)}
            style={styles.officeLinkButton}
            title={`Open ${office.officeName} detail`}
          >
            {office.officeName}
          </button>
          <div style={styles.smallMuted}>{office.activeDays} days · View detail</div>
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
              ? office.dataSource === 'legacy'
                ? 'Legacy data · NEW/RWR split unavailable'
                : `${formatNumber(office.newBusinessCount)} NEW / ${formatNumber(office.rewriteCount)} RWR`
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
              onClick={() => { setSelectedOffice(''); setViewMode('office'); }}
              style={{
                ...styles.segmentButton,
                ...(viewMode === 'office' ? styles.segmentButtonActive : {}),
              }}
            >
              Offices
            </button>
            <button
              type="button"
              onClick={() => { setSelectedOffice(''); setViewMode('agent'); }}
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
            onClick={() => { fetchProfileAndSettings(); fetchDashboardData({ force: true, includeAgents: viewMode === 'agent' }); }}
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
          <button type="button" onClick={() => { fetchProfileAndSettings(); fetchDashboardData({ force: true, includeAgents: viewMode === 'agent' }); }} style={styles.retryButton}>
            Retry
          </button>
        </div>
      )}

      {viewMode === 'office' && selectedOfficeMetric && selectedAgentMetric && (
        <AgentDetail
          agent={allAuthorizedAgentMetric || selectedAgentMetric}
          office={selectedOfficeMetric}
          selectedFeeConfig={selectedFeeConfig}
          selectedMetricConfig={selectedMetricConfig}
          selectedMonth={selectedMonth}
          pacingDetails={pacingDetails}
          isBrokerView={isBrokerView}
          hideEstimatedCommission={currentRole === 'supervisor'}
          detailData={agentDetailData}
          detailLoading={agentDetailLoading}
          detailError={agentDetailError}
          onRefresh={() => fetchAgentDetail(selectedAgentEmail, { force: true })}
          onBack={() => { setSelectedAgentEmail(''); setAgentDetailData(null); setAgentDetailError(''); }}
          onBackToSummary={() => {
            setSelectedAgentEmail('');
            setAgentDetailData(null);
            setAgentDetailError('');
            setSelectedOffice('');
            setOfficeDetailData(null);
            setOfficeDetailError('');
          }}
        />
      )}

      {viewMode === 'office' && selectedOfficeMetric && !selectedAgentMetric && (
        <OfficeDetail
          office={selectedOfficeMetric}
          agents={selectedOfficeAgents}
          trend={selectedOfficeTrend}
          detailData={officeDetailData}
          detailLoading={officeDetailLoading}
          detailError={officeDetailError}
          selectedFeeConfig={selectedFeeConfig}
          selectedMetricConfig={selectedMetricConfig}
          selectedMonth={selectedMonth}
          comparisonMonths={comparisonMonths}
          latestDataDate={latestDataDate}
          pacingDetails={pacingDetails}
          isBrokerView={isBrokerView}
          onOpenAgent={openAgentDetail}
          onRefreshDetail={() => fetchOfficeDetail(selectedOffice, { force: true })}
          onBack={() => {
            setSelectedAgentEmail('');
            setSelectedOffice('');
            setOfficeDetailData(null);
            setOfficeDetailError('');
          }}
        />
      )}

      {viewMode === 'office' && !selectedOfficeMetric && (
        <>
      <div style={styles.summaryGrid}>
        <SummaryCard
          label={selectedMetricConfig.countLabel}
          value={formatNumber(totals.selectedMetricCount)}
          subtext={
            selectedMetricConfig.usesNbRwCount
              ? totals.hasLegacyData
                ? 'Includes legacy months/rows where NEW/RWR split is unavailable'
                : `${formatNumber(totals.newBusinessCount)} NEW • ${formatNumber(totals.rewriteCount)} RWR`
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
            No Office Numbers data was found for this month.
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


const MetricBar = ({ label, value, max, displayValue }) => {
  const width = max > 0 ? Math.max(2, Math.min(100, (Number(value || 0) / max) * 100)) : 0;
  return (
    <div style={styles.metricBarRow}>
      <div style={styles.metricBarLabel}>{label}</div>
      <div style={styles.metricBarTrack}><div style={{ ...styles.metricBarFill, width: `${width}%` }} /></div>
      <div style={styles.metricBarValue}>{displayValue}</div>
    </div>
  );
};

const TrendBars = ({ rows = [], selectedMetricConfig }) => {
  const max = Math.max(1, ...rows.map((row) => Number(row.selectedMetricCount) || 0));

  return (
    <div style={styles.trendChart}>
      {rows.map((row) => {
        const value = Number(row.selectedMetricCount) || 0;
        const height = Math.max(3, (value / max) * 100);
        return (
          <div key={row.month} style={styles.trendColumn} title={`${row.month}: ${formatNumber(value)} ${selectedMetricConfig.shortCountLabel}`}>
            <div style={styles.trendValue}>{formatNumber(value)}</div>
            <div style={styles.trendBarWell}>
              <div style={{ ...styles.trendBar, height: `${height}%` }} />
            </div>
            <div style={styles.trendMonth}>{row.month ? row.month.slice(5) : '—'}</div>
            <div style={styles.trendSource}>{row.dataSource === 'legacy' ? 'L' : row.dataSource === 'detailed' ? 'D' : '—'}</div>
          </div>
        );
      })}
    </div>
  );
};

const OfficeDetail = ({
  office, agents, trend, detailData, detailLoading, detailError,
  selectedFeeConfig, selectedMetricConfig, selectedMonth, comparisonMonths,
  latestDataDate, pacingDetails, isBrokerView, onOpenAgent, onRefreshDetail, onBack,
}) => {
  const comparisonValues = [
    { label: 'Current', value: office.selectedMetricCount },
    { label: 'Last Month', value: office.lastMonthCount || 0 },
    { label: 'Last Year', value: office.lastYearCount || 0 },
  ];
  const comparisonMax = Math.max(1, ...comparisonValues.map((item) => Number(item.value) || 0));
  const pacingValues = [
    { label: 'Actual', value: office.selectedMetricCount },
    { label: 'Projected', value: office.projectedCount },
    ...(isBrokerView && office.goal > 0 ? [{ label: 'Goal', value: office.goal }] : []),
  ];
  const pacingMax = Math.max(1, ...pacingValues.map((item) => Number(item.value) || 0));

  const feeEntries = FEE_TYPE_OPTIONS
    .filter((item) => !['all', 'insurance'].includes(item.value))
    .map((item) => ({ label: item.label, value: Number(office.feeTotals?.[item.value]) || 0 }))
    .filter((item) => Math.abs(item.value) > 0.001);
  const feeMax = Math.max(1, ...feeEntries.map((item) => Math.abs(item.value)));
  const splitTotal = (Number(office.newBusinessCount) || 0) + (Number(office.rewriteCount) || 0);
  const newPercent = splitTotal > 0 ? (Number(office.newBusinessCount) || 0) / splitTotal * 100 : 0;
  const rpcOffice = detailData?.office || null;

  return (
    <div style={styles.detailPage}>
      <div style={styles.detailTopRow}>
        <div>
          <button type="button" onClick={onBack} style={styles.backButton}>← Back to Office Summary</button>
          <h2 style={styles.detailTitle}>{office.officeName} · {office.region}</h2>
          <div style={styles.detailSubtitle}>
            {getMonthLabel(selectedMonth)} · Data through {formatDateLabel(rpcOffice?.latest_data_date || latestDataDate)} · {office.activeDays} active day(s)
          </div>
        </div>
        <div style={styles.detailHeaderActions}>
          <button type="button" onClick={onRefreshDetail} disabled={detailLoading} style={styles.secondaryButton}>
            {detailLoading ? 'Refreshing...' : 'Refresh Detail'}
          </button>
          <span style={office.status === 'On Track' ? styles.onTrackBadge : office.status === 'Behind' ? styles.behindBadge : styles.noGoalBadge}>
            {office.status}
          </span>
        </div>
      </div>

      {detailError && (
        <div style={styles.errorBox}>
          <div><strong>Unable to load office detail</strong><div>{detailError}</div></div>
          <button type="button" onClick={onRefreshDetail} style={styles.retryButton}>Retry</button>
        </div>
      )}


      <div style={styles.detailKpiGrid}>
        <SummaryCard label={selectedMetricConfig.countLabel} value={formatNumber(office.selectedMetricCount)} subtext={office.dataSource === 'legacy' ? 'Legacy detail split unavailable' : `${formatNumber(office.newBusinessCount)} NEW • ${formatNumber(office.rewriteCount)} RWR`} />
        <SummaryCard label={selectedFeeConfig.label} value={formatCurrency(office.selectedFeeTotal)} subtext={`${formatNumber(office.selectedFeeCount)} fee transaction(s)`} />
        <SummaryCard label={`Average ${selectedFeeConfig.label}`} value={formatCurrency(office.selectedFeeAvg, 2)} />
        <SummaryCard label={selectedMetricConfig.projectedLabel} value={formatDecimal(office.projectedCount)} subtext={`Day ${pacingDetails.asOfDay} of ${pacingDetails.totalDaysInMonth}`} />
        {isBrokerView && <SummaryCard label="NB/RW Goal" value={office.goal > 0 ? formatNumber(office.goal) : 'Not Set'} subtext={office.goal > 0 ? `${Math.round(office.actualGoalPercent)}% actual · ${Math.round(office.projectedGoalPercent)}% projected` : ''} />}
        <SummaryCard label="Loaded Receipts" value={formatNumber(office.transactionCount)} subtext={`${formatNumber(office.excludedRows)} voided/excluded rows`} />
      </div>

      <div style={styles.chartGrid}>
        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>Performance Comparison</div>
          <div style={styles.chartSubtext}>{selectedMetricConfig.shortCountLabel}: current vs. {getMonthLabel(comparisonMonths.lastMonth.value)} vs. {getMonthLabel(comparisonMonths.lastYear.value)}</div>
          {comparisonValues.map((item) => <MetricBar key={item.label} label={item.label} value={item.value} max={comparisonMax} displayValue={formatNumber(item.value)} />)}
        </div>
        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>Goal & Pacing</div>
          <div style={styles.chartSubtext}>Actual performance, projected finish, and monthly goal.</div>
          {pacingValues.map((item) => <MetricBar key={item.label} label={item.label} value={item.value} max={pacingMax} displayValue={formatDecimal(item.value)} />)}
        </div>
        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>Fee Mix</div>
          <div style={styles.chartSubtext}>Revenue by fee category for this office.</div>
          {feeEntries.length ? feeEntries.map((item) => <MetricBar key={item.label} label={item.label} value={Math.abs(item.value)} max={feeMax} displayValue={formatCurrency(item.value)} />) : <div style={styles.emptyDetail}>No fee revenue in this period.</div>}
        </div>
        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>NEW vs RWR</div>
          <div style={styles.chartSubtext}>Policy mix for detailed-data months.</div>
          {office.dataSource === 'legacy' ? <div style={styles.emptyDetail}>NEW/RWR split is unavailable for legacy data.</div> : (
            <>
              <div style={styles.splitTrack}><div style={{ ...styles.splitNew, width: `${newPercent}%` }} /><div style={{ ...styles.splitRwr, width: `${100 - newPercent}%` }} /></div>
              <div style={styles.splitLegend}><span>{formatNumber(office.newBusinessCount)} NEW ({Math.round(newPercent)}%)</span><span>{formatNumber(office.rewriteCount)} RWR ({Math.round(100 - newPercent)}%)</span></div>
            </>
          )}
        </div>
      </div>

      <div style={styles.chartCardWide}>
        <div style={styles.chartTitle}>12-Month Performance Trend</div>
        <div style={styles.chartSubtext}>
          {selectedMetricConfig.shortCountLabel} by month. D = detailed transaction data; L = legacy monthly data.
        </div>
        {detailLoading && !trend.length ? (
          <div style={styles.emptyDetail}>Loading office trend...</div>
        ) : trend.length ? (
          <TrendBars rows={trend} selectedMetricConfig={selectedMetricConfig} />
        ) : (
          <div style={styles.emptyDetail}>No trend data is available for this office.</div>
        )}
      </div>

      <div style={styles.tableCard}>
        <div style={styles.detailSectionHeader}>
          <div>
            <div style={styles.chartTitle}>Agent Leaderboard</div>
            <div style={styles.chartSubtext}>Selected-office agent performance loaded from the lightweight Office Detail RPC.</div>
          </div>
          {rpcOffice && <div style={styles.detailDataPill}>{formatNumber(rpcOffice.valid_rows_count || 0)} valid rows</div>}
        </div>

        {detailLoading && !agents.length ? (
          <div style={styles.emptyDetail}>Loading agent breakdown...</div>
        ) : agents.length === 0 ? (
          <div style={styles.emptyDetail}>No agent detail found for this office and month.</div>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={{ ...styles.table, minWidth: isBrokerView ? 980 : 820 }}>
              <thead>
                <tr>
                  <th style={styles.tableHeader}>Agent</th>
                  <th style={styles.tableHeader}>{selectedMetricConfig.shortCountLabel}</th>
                  <th style={styles.tableHeader}>{selectedFeeConfig.label}</th>
                  <th style={styles.tableHeader}>Avg Fee</th>
                  {isBrokerView && <th style={styles.tableHeader}>Goal</th>}
                  <th style={styles.tableHeader}>Projected</th>
                  {isBrokerView && <th style={styles.tableHeader}>Status</th>}
                  <th style={styles.tableHeader}>Active Days</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.agentEmail}>
                    <td style={styles.officeCell}>
                      <button
                        type="button"
                        onClick={() => onOpenAgent(agent.agentEmail)}
                        style={styles.agentLinkButton}
                        title={`Open ${agent.csrName} detail`}
                      >
                        {agent.csrName}
                      </button>
                      <div style={styles.smallMuted}>{agent.agentEmail} · View detail</div>
                    </td>
                    <td style={{ ...styles.numberCell, ...styles.metricCurrentCell }}>
                      <strong>{formatNumber(agent.selectedMetricCount)}</strong>
                      {selectedMetricConfig.usesNbRwCount && (
                        <div style={styles.smallMuted}>{formatNumber(agent.newBusinessCount)} NEW / {formatNumber(agent.rewriteCount)} RWR</div>
                      )}
                    </td>
                    <td style={styles.numberCell}>{formatCurrency(agent.selectedFeeTotal)}</td>
                    <td style={styles.numberCell}>{formatCurrency(agent.selectedFeeAvg, 2)}</td>
                    {isBrokerView && <td style={{ ...styles.numberCell, ...styles.metricGoalCell }}>{agent.goal > 0 ? formatNumber(agent.goal) : 'Not Set'}</td>}
                    <td style={{ ...styles.numberCell, ...styles.metricProjectedCell }}>{formatDecimal(agent.projectedCount)}</td>
                    {isBrokerView && (
                      <td style={styles.numberCell}>
                        <span style={agent.status === 'On Track' ? styles.onTrackBadge : agent.status === 'Behind' ? styles.behindBadge : styles.noGoalBadge}>{agent.status}</span>
                      </td>
                    )}
                    <td style={styles.numberCell}>{formatNumber(agent.activeDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};


const AgentDetail = ({
  agent,
  office,
  selectedFeeConfig,
  selectedMetricConfig,
  selectedMonth,
  pacingDetails,
  isBrokerView,
  hideEstimatedCommission,
  detailData,
  detailLoading,
  detailError,
  onRefresh,
  onBack,
  onBackToSummary,
}) => {
  const feeEntries = FEE_TYPE_OPTIONS
    .filter((item) => !['all', 'insurance'].includes(item.value))
    .map((item) => ({
      label: item.label,
      value: Number(agent.feeTotals?.[item.value]) || 0,
      count: Number(agent.feeCounts?.[item.value]) || 0,
    }))
    .filter((item) => Math.abs(item.value) > 0.001 || item.count !== 0);

  const feeMax = Math.max(1, ...feeEntries.map((item) => Math.abs(item.value)));
  const splitTotal = (Number(agent.newBusinessCount) || 0) + (Number(agent.rewriteCount) || 0);
  const newPercent = splitTotal > 0
    ? ((Number(agent.newBusinessCount) || 0) / splitTotal) * 100
    : 0;
  const pacingValues = [
    { label: 'Actual', value: agent.selectedMetricCount },
    { label: 'Projected', value: agent.projectedCount },
    ...(isBrokerView && agent.goal > 0 ? [{ label: 'Goal', value: agent.goal }] : []),
  ];
  const pacingMax = Math.max(1, ...pacingValues.map((item) => Number(item.value) || 0));

  const weeklyRows = Array.isArray(detailData?.weeks) ? detailData.weeks : [];
  const officeRows = Array.isArray(detailData?.offices) ? detailData.offices : [];
  const trendRows = Array.isArray(detailData?.trend) ? detailData.trend : [];
  const trendMax = Math.max(1, ...trendRows.map((row) => Number(row.nb_rw_count) || 0));

  return (
    <div style={styles.detailPage}>
      <div style={styles.detailTopRow}>
        <div>
          <button type="button" onClick={onBack} style={styles.backButton}>← Back to {office.officeName} Detail</button>
          <div>
            <button type="button" onClick={onBackToSummary} style={styles.secondaryTextButton}>Office Summary</button>
          </div>
          <h2 style={styles.detailTitle}>{agent.csrName}</h2>
          <div style={styles.detailSubtitle}>
            {agent.agentEmail} · All authorized offices · {getMonthLabel(selectedMonth)}
          </div>
        </div>
        <span style={agent.status === 'On Track' ? styles.onTrackBadge : agent.status === 'Behind' ? styles.behindBadge : styles.noGoalBadge}>
          {isBrokerView ? agent.status : selectedFeeConfig.label}
        </span>
      </div>



      {detailError && (
        <div style={styles.errorBox}>
          <div><strong>Unable to load all-office agent detail</strong><div>{detailError}</div></div>
          <button type="button" onClick={onRefresh} style={styles.retryButton}>Retry</button>
        </div>
      )}

      <div style={styles.detailSectionHeader}>
        <div>
          <div style={styles.detailDataPill}>Scope: All Authorized Offices</div>
          <div style={styles.chartSubtext}>Admin = company-wide · Regional = assigned region · Supervisor = assigned office.</div>
        </div>
        <button type="button" onClick={onRefresh} disabled={detailLoading} style={styles.primaryButton}>
          {detailLoading ? 'Refreshing...' : 'Refresh Agent Detail'}
        </button>
      </div>
      <div style={styles.detailKpiGrid}>
        <SummaryCard
          label={selectedMetricConfig.countLabel}
          value={formatNumber(agent.selectedMetricCount)}
          subtext={selectedMetricConfig.usesNbRwCount ? `${formatNumber(agent.newBusinessCount)} NEW • ${formatNumber(agent.rewriteCount)} RWR` : `${formatNumber(agent.selectedFeeCount)} matching fee transaction(s)`}
        />
        <SummaryCard
          label={selectedFeeConfig.label}
          value={formatCurrency(agent.selectedFeeTotal)}
          subtext={`${formatNumber(agent.selectedFeeCount)} fee transaction(s)`}
        />
        <SummaryCard label={`Average ${selectedFeeConfig.label}`} value={formatCurrency(agent.selectedFeeAvg, 2)} />
        <SummaryCard label={selectedMetricConfig.projectedLabel} value={formatDecimal(agent.projectedCount)} subtext={`Day ${pacingDetails.asOfDay} of ${pacingDetails.totalDaysInMonth}`} />
        {isBrokerView && <SummaryCard label="NB/RW Goal" value={agent.goal > 0 ? formatNumber(agent.goal) : 'Not Set'} subtext={agent.goal > 0 ? `${Math.round(agent.actualGoalPercent)}% actual · ${Math.round(agent.projectedGoalPercent)}% projected` : ''} />}
        <SummaryCard label="Loaded Receipts" value={formatNumber(agent.validReceiptCount)} subtext={`${formatNumber(agent.activeDays)} active day(s)`} />
      </div>

      <div style={styles.chartGrid}>
        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>Goal & Pacing</div>
          <div style={styles.chartSubtext}>Actual performance, projected finish, and goal for this agent.</div>
          {pacingValues.map((item) => (
            <MetricBar key={item.label} label={item.label} value={item.value} max={pacingMax} displayValue={formatDecimal(item.value)} />
          ))}
        </div>

        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>Insurance Fees</div>
          <div style={styles.chartSubtext}>Broker + Endorsement + Renewal + Reinstatement + Payment. Payment is included here for reporting, but excluded from commission.</div>
          <div style={styles.agentInsuranceTotal}>{formatCurrency(agent.feeTotals?.insurance || 0)}</div>
          <div style={styles.chartSubtext}>{formatNumber(agent.feeCounts?.insurance || 0)} insurance fee transaction(s)</div>
          <div style={{ marginTop: 14 }}>
            {INSURANCE_FEE_TYPES.map((type) => {
              const option = FEE_TYPE_OPTIONS.find((item) => item.value === type);
              return (
                <div key={type} style={styles.agentFeeLine}>
                  <span>{option?.label || type}</span>
                  <strong>{formatCurrency(agent.feeTotals?.[type] || 0)}</strong>
                </div>
              );
            })}
          </div>
        </div>

        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>Fee Mix</div>
          <div style={styles.chartSubtext}>Revenue generated by fee category during the selected month.</div>
          {feeEntries.length ? feeEntries.map((item) => (
            <MetricBar key={item.label} label={item.label} value={Math.abs(item.value)} max={feeMax} displayValue={formatCurrency(item.value)} />
          )) : <div style={styles.emptyDetail}>No fee revenue in this period.</div>}
        </div>

        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>NEW vs RWR</div>
          <div style={styles.chartSubtext}>Current policy mix for this agent.</div>
          {splitTotal > 0 ? (
            <>
              <div style={styles.splitTrack}><div style={{ ...styles.splitNew, width: `${newPercent}%` }} /><div style={{ ...styles.splitRwr, width: `${100 - newPercent}%` }} /></div>
              <div style={styles.splitLegend}><span>{formatNumber(agent.newBusinessCount)} NEW ({Math.round(newPercent)}%)</span><span>{formatNumber(agent.rewriteCount)} RWR ({Math.round(100 - newPercent)}%)</span></div>
            </>
          ) : <div style={styles.emptyDetail}>No NEW/RWR production was recorded for this agent.</div>}
        </div>
      </div>


      <div style={styles.chartCard}>
        <div style={styles.chartTitle}>12-Month NB/RW Trend</div>
        <div style={styles.chartSubtext}>All authorized offices for this agent.</div>
        {trendRows.length ? trendRows.map((row) => (
          <MetricBar key={row.month} label={row.month} value={Number(row.nb_rw_count) || 0} max={trendMax} displayValue={formatNumber(row.nb_rw_count)} />
        )) : <div style={styles.emptyDetail}>No trend data returned.</div>}
      </div>

      {!hideEstimatedCommission && (
        <>
        <div style={styles.tableCard}>
          <div style={styles.detailSectionHeader}>
            <div>
              <div style={styles.chartTitle}>Weekly Performance & Estimated Commission</div>
              <div style={styles.chartSubtext}>Full Monday-Sunday commission weeks that overlap {getMonthLabel(selectedMonth)}. Tier 1 uses 8+ Net NBs OR $2,500 gross revenue. Payment Fees do not count toward commission revenue.</div>
              <div style={{ ...styles.chartSubtext, marginTop: 4, fontWeight: 700 }}>Estimated commission is for planning purposes only and does not include violation deductions. Final commission may differ.</div>
            </div>
            <div style={styles.detailDataPill}>$800 estimated gross pay / week</div>
          </div>
          <div style={styles.tableWrapper}>
            <table style={{ ...styles.table, minWidth: 1260 }}>
              <thead><tr>
                <th style={styles.tableHeader}>Week</th><th style={styles.tableHeader}>Gross NB</th><th style={styles.tableHeader}>Disq.</th><th style={styles.tableHeader}>Net NB</th>
                <th style={styles.tableHeader}>Commission Gross Revenue</th><th style={styles.tableHeader}>Est. Net Revenue</th><th style={styles.tableHeader}>Tier</th><th style={styles.tableHeader}>Rate</th>
                <th style={styles.tableHeader}>Est. Commission*</th><th style={styles.tableHeader}>Status</th>
              </tr></thead>
              <tbody>
                {weeklyRows.length ? weeklyRows.map((week) => (
                  <tr key={week.week_start}>
                    <td style={styles.officeCell}>{formatDateLabel(String(week.week_start))} – {formatDateLabel(String(week.week_end))}</td>
                    <td style={styles.numberCell}>{formatNumber(week.gross_nb_count)}</td><td style={styles.numberCell}>{formatNumber(week.disqualified_nb_count)}</td><td style={{...styles.numberCell,...styles.metricCurrentCell}}><strong>{formatNumber(week.net_nb_count)}</strong></td>
                    <td style={styles.numberCell}>{formatCurrency(week.gross_revenue)}</td><td style={styles.numberCell}>{formatCurrency(week.net_revenue)}</td><td style={styles.numberCell}><strong>{week.tier}</strong></td><td style={styles.numberCell}>{(Number(week.commission_rate) * 100).toFixed(1)}%</td>
                    <td style={{...styles.numberCell,fontWeight:900}}>{formatCurrency(week.base_commission)}</td><td style={styles.numberCell}>{week.status}</td>
                  </tr>
                )) : <tr><td colSpan={10} style={styles.loading}>{detailLoading ? 'Loading weekly commission estimate...' : 'No weekly data returned.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      <div style={styles.tableCard}>
        <div style={styles.detailSectionHeader}>
          <div><div style={styles.chartTitle}>Office Breakdown</div><div style={styles.chartSubtext}>Where this agent's selected-month production came from.</div></div>
          <div style={styles.detailDataPill}>{officeRows.length} office(s)</div>
        </div>
        <div style={styles.tableWrapper}><table style={{...styles.table,minWidth:900}}>
          <thead><tr><th style={styles.tableHeader}>Office</th><th style={styles.tableHeader}>Region</th><th style={styles.tableHeader}>NB/RW</th><th style={styles.tableHeader}>NEW</th><th style={styles.tableHeader}>RWR</th><th style={styles.tableHeader}>Insurance Fees</th><th style={styles.tableHeader}>Active Days</th></tr></thead>
          <tbody>{officeRows.length ? officeRows.map((row) => {
            const insurance = ['broker','endorsement','renewal','reinstatement','payment'].reduce((sum,type)=>sum+(Number(row[`${type}_fee_total`])||0),0);
            return <tr key={row.office_code}><td style={styles.officeCell}>{row.office_code}</td><td style={styles.numberCell}>{row.region || 'Unassigned'}</td><td style={{...styles.numberCell,...styles.metricCurrentCell}}><strong>{formatNumber(row.nb_rw_count)}</strong></td><td style={styles.numberCell}>{formatNumber(row.new_business_count)}</td><td style={styles.numberCell}>{formatNumber(row.rewrite_count)}</td><td style={styles.numberCell}>{formatCurrency(insurance)}</td><td style={styles.numberCell}>{formatNumber(row.active_days)}</td></tr>;
          }) : <tr><td colSpan={7} style={styles.loading}>{detailLoading ? 'Loading office breakdown...' : 'No office breakdown returned.'}</td></tr>}</tbody>
        </table></div>
      </div>

      <div style={styles.tableCard}>
        <div style={styles.detailSectionHeader}>
          <div>
            <div style={styles.chartTitle}>Fee Breakdown</div>
            <div style={styles.chartSubtext}>Current-month agent fee revenue and transaction counts.</div>
          </div>
          <div style={styles.detailDataPill}>All Fees {formatCurrency(agent.feeTotals?.all || 0)}</div>
        </div>
        <div style={styles.tableWrapper}>
          <table style={{ ...styles.table, minWidth: 720 }}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Fee Type</th>
                <th style={styles.tableHeader}>Transactions</th>
                <th style={styles.tableHeader}>Revenue</th>
                <th style={styles.tableHeader}>Average</th>
              </tr>
            </thead>
            <tbody>
              {FEE_TYPE_OPTIONS.filter((item) => item.value !== 'all').map((item) => {
                const count = Number(agent.feeCounts?.[item.value]) || 0;
                const total = Number(agent.feeTotals?.[item.value]) || 0;
                const avgDenominator = item.value === 'broker' ? agent.nbRwCount : count;
                return (
                  <tr key={item.value}>
                    <td style={styles.officeCell}>{item.label}</td>
                    <td style={styles.numberCell}>{formatNumber(count)}</td>
                    <td style={styles.numberCell}>{formatCurrency(total)}</td>
                    <td style={styles.numberCell}>{formatCurrency(avgDenominator ? total / avgDenominator : 0, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
  officeLinkButton: { padding: 0, border: 0, background: 'transparent', color: '#1d4ed8', cursor: 'pointer', font: 'inherit', fontWeight: 900, textDecoration: 'underline', textUnderlineOffset: 2 },
  agentLinkButton: { padding: 0, border: 0, background: 'transparent', color: '#1d4ed8', cursor: 'pointer', font: 'inherit', fontWeight: 900, textAlign: 'left', textDecoration: 'underline', textUnderlineOffset: 2 },
  secondaryTextButton: { padding: 0, marginBottom: 8, border: 0, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 800, textDecoration: 'underline', textUnderlineOffset: 2 },
  agentInsuranceTotal: { marginTop: 12, fontSize: 28, fontWeight: 950, color: '#0f172a' },
  agentFeeLine: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid #f1f5f9', color: '#475569', fontSize: 12 },
  detailPage: { marginBottom: 24 },
  detailTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 },
  backButton: { padding: 0, marginBottom: 8, border: 0, background: 'transparent', color: '#2563eb', cursor: 'pointer', fontWeight: 850 },
  detailTitle: { margin: 0, fontSize: 25, fontWeight: 900 },
  detailSubtitle: { marginTop: 5, color: '#64748b', fontSize: 13, fontWeight: 700 },
  detailKpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 },
  chartGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14, marginBottom: 16 },
  chartCard: { padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', boxShadow: '0 1px 3px rgba(15,23,42,.05)' },
  chartTitle: { fontSize: 15, fontWeight: 900, color: '#0f172a' },
  chartSubtext: { marginTop: 3, marginBottom: 14, color: '#64748b', fontSize: 11, fontWeight: 700 },
  metricBarRow: { display: 'grid', gridTemplateColumns: '90px 1fr 82px', alignItems: 'center', gap: 9, marginTop: 10 },
  metricBarLabel: { color: '#475569', fontSize: 11, fontWeight: 800 },
  metricBarTrack: { height: 12, overflow: 'hidden', borderRadius: 999, background: '#e2e8f0' },
  metricBarFill: { height: '100%', borderRadius: 999, background: '#2563eb' },
  metricBarValue: { textAlign: 'right', color: '#0f172a', fontSize: 11, fontWeight: 900 },
  splitTrack: { display: 'flex', height: 24, overflow: 'hidden', borderRadius: 999, background: '#e2e8f0', marginTop: 20 },
  splitNew: { height: '100%', background: '#2563eb' },
  splitRwr: { height: '100%', background: '#94a3b8' },
  splitLegend: { display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 10, color: '#475569', fontSize: 11, fontWeight: 800 },
  detailSectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, padding: 16, borderBottom: '1px solid #e2e8f0' },
  emptyDetail: { padding: 22, color: '#64748b', textAlign: 'center', fontSize: 12, fontWeight: 700 },
  detailHeaderActions: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  secondaryButton: { padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#334155', cursor: 'pointer', fontWeight: 800 },
  chartCardWide: { padding: 16, marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', boxShadow: '0 1px 3px rgba(15,23,42,.05)' },
  trendChart: { display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 220, marginTop: 18, overflowX: 'auto', paddingBottom: 4 },
  trendColumn: { flex: '1 0 54px', minWidth: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 },
  trendValue: { fontSize: 10, fontWeight: 900, color: '#334155' },
  trendBarWell: { width: 28, height: 140, display: 'flex', alignItems: 'flex-end', borderRadius: 6, background: '#eff6ff', overflow: 'hidden' },
  trendBar: { width: '100%', minHeight: 3, borderRadius: '6px 6px 0 0', background: '#2563eb' },
  trendMonth: { fontSize: 10, fontWeight: 800, color: '#475569' },
  trendSource: { width: 20, height: 20, display: 'grid', placeItems: 'center', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontSize: 9, fontWeight: 900 },
  detailDataPill: { padding: '5px 9px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 900 },
  loading: { padding: '50px 24px', color: '#64748b', textAlign: 'center', fontWeight: 700 },
};

export default OfficeNumbers;
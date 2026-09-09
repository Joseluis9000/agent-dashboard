import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import styles from './AgentCommission.module.css';
import {
  addDaysKey,
  calculateAgentCommission,
  getWeekRange,
} from "../../utils/commissionCalculations";

const TABLE_TRANSFERS = 'daily_transaction_detail_transfers';
const TABLE_VIOLATIONS = 'violations';
const TABLE_DISQUALIFIED = 'disqualified_policies';
const TABLE_COMMISSION_RECORDS = 'agent_commission_records';
const TABLE_BALANCE_LEDGER = 'agent_commission_balance_ledger';

const PRODUCTION_PAGE_SIZE = 15;
const HISTORY_PAGE_SIZE = 8;

const COMMISSION_CUTOVER_WEEK = '2026-08-24';

const COMMISSION_FEE_CATEGORIES = new Set([
  'BROKER FEE',
  'ENDORSEMENT FEE',
  'REINSTATEMENT FEE',
  'RENEWAL FEE',
]);

const shouldShowInCommissionLog = (row) => {
  const company = String(row?.company ?? '').trim().toUpperCase();

  if (!company) return true;

  // Always show the four fee categories that actually count toward commission.
  if (COMMISSION_FEE_CATEGORIES.has(company)) return true;

  // Hide unrelated fee rows so agents are not confused by amounts
  // that do not participate in the insurance commission formula.
  const unrelatedFeeMarkers = [
    'FEE',
    'OTH',
    'OTHER',
    'CC',
    'CREDIT CARD',
    'CONVENIENCE',
    'PAYMENT',
    'INSTALLMENT',
  ];

  const looksLikeUnrelatedFee = unrelatedFeeMarkers.some((marker) =>
    company === marker ||
    company.startsWith(`${marker} `) ||
    company.endsWith(` ${marker}`) ||
    company.includes(`${marker} FEE`) ||
    company.includes(`FEE ${marker}`)
  );

  return !looksLikeUnrelatedFee;
};

const money = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
}).format(Number(value) || 0);

const percent = (value) => `${((Number(value) || 0) * 100).toFixed(1)}%`;
const clean = (value) => String(value ?? '').trim();

const signedLedgerAmount = (row) => Number(row?.amount) || 0;

const ledgerCategory = (row) => {
  const raw = clean(row?.category || row?.violation_type || row?.type).toUpperCase();
  if (raw.includes('SCAN') || raw.includes('SV')) return 'SCANNING';
  if (raw.includes('AR')) return 'AR';
  return raw || 'OTHER';
};

const violationBalanceCategory = (row) => {
  const raw = [
    row?.category,
    row?.violation_category,
    row?.violation_type,
    row?.source_report_type,
    row?.source_report,
    row?.report_type,
    row?.type,
  ]
    .map((value) => clean(value).toUpperCase())
    .filter(Boolean)
    .join(' ');

  if (raw.includes('SCAN') || raw.includes('SV')) return 'SCANNING';
  if (raw.includes('AR') || raw.includes('EFT') || raw.includes('RP') || raw.includes('CHARGEBACK')) {
    return 'AR';
  }
  return 'OTHER';
};

const violationFeeAmount = (row) =>
  Number(row?.fee_amount ?? row?.fee ?? row?.amount ?? row?.source_amount) || 0;

const isOpenBalanceViolation = (row) => {
  const status = clean(row?.status).toUpperCase();
  return !new Set([
    'VOIDED',
    'PAID',
    'RESOLVED',
    'CLEARED',
    'REMOVED',
    'REINSTATED',
    'CLOSED',
  ]).has(status);
};

const paymentStatusLabel = (record) => {
  const status = clean(record?.payment_status).toLowerCase();
  if (status === 'paid') return 'Paid';
  if (status === 'partial') return 'Partially Paid';
  if (status === 'withheld') return 'Withheld';
  if (status === 'pending') return 'Pending';
  return 'Finalized';
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
};

const firstValue = (row, keys) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return '—';
};

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateFromKey = (key) => new Date(`${key}T12:00:00`);
const scheduledPaydayForWeek = (weekStart) => addDaysKey(weekStart, 18);

const getPayContext = (today = new Date()) => {
  const currentProduction = getWeekRange(today).weekStart;
  const thisFriday = addDaysKey(currentProduction, 4);
  const todayKey = localDateKey(today);
  const upcomingFriday = todayKey <= thisFriday ? thisFriday : addDaysKey(thisFriday, 7);
  const payoutWeekMonday = getWeekRange(dateFromKey(upcomingFriday)).weekStart;

  return {
    upcomingFriday,
    payingWeekStart: addDaysKey(payoutWeekMonday, -14),
    nextPayoutWeekStart: addDaysKey(payoutWeekMonday, -7),
    currentProductionWeekStart: currentProduction,
  };
};

async function fetchAll(buildQuery, pageSize = 1000) {
  let allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    allRows = allRows.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

export default function AgentCommission() {
  const payContext = useMemo(() => getPayContext(new Date()), []);
  const [anchorDate, setAnchorDate] = useState(() => dateFromKey(payContext.payingWeekStart));
  const week = useMemo(() => getWeekRange(anchorDate), [anchorDate]);

  const weekStart = week.weekStart;
  const weekEnd = week.weekEnd;
  const nextWeekStart = useMemo(() => addDaysKey(weekEnd, 1), [weekEnd]);
  const scheduledPayday = useMemo(() => scheduledPaydayForWeek(weekStart), [weekStart]);

  const isPayingThisFriday = weekStart === payContext.payingWeekStart;
  const isNextPayout = weekStart === payContext.nextPayoutWeekStart;
  const isCurrentProduction = weekStart === payContext.currentProductionWeekStart;
  const isAtCommissionCutover = weekStart <= COMMISSION_CUTOVER_WEEK;

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [violations, setViolations] = useState([]);
  const [disqualified, setDisqualified] = useState([]);
  const [publishedRecord, setPublishedRecord] = useState(null);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [balanceLedger, setBalanceLedger] = useState([]);
  const [allViolations, setAllViolations] = useState([]);
  const [allDisqualified, setAllDisqualified] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [productionPage, setProductionPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [activeView, setActiveView] = useState('current');
  const [historyModalRecord, setHistoryModalRecord] = useState(null);
  const [balanceModalTab, setBalanceModalTab] = useState('current');
  const [disqualifiedModalTab, setDisqualifiedModalTab] = useState('current');

  const loadCommissionWeek = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const authUser = authData?.user;
      if (!authUser?.email) throw new Error('No signed-in agent email was found.');

      const email = authUser.email.toLowerCase();
      setUser(authUser);

      const year = Number(weekStart.slice(0, 4));
      const yearStart = `${year}-01-01`;
      const nextYearStart = `${year + 1}-01-01`;
      const historyStart = yearStart > COMMISSION_CUTOVER_WEEK ? yearStart : COMMISSION_CUTOVER_WEEK;

      const [
        profileResult,
        transfersResult,
        violationsResult,
        disqualifiedResult,
        publishedResult,
        historyResult,
        balanceLedgerResult,
        allViolationsResult,
        allDisqualifiedResult,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, full_name, role, office, region')
          .eq('id', authUser.id)
          .maybeSingle(),

        fetchAll(() =>
          supabase
            .from(TABLE_TRANSFERS)
            .select('id, sync_key, agent_email, customer_id, customer, customer_type, receipt_id, reference, date_time, type, policy, policy_type, company, carrier_receipt, csr, office, method, premium, fee, total, franchise_fee, voided, source_sheet, source_row, synced_at')
            .eq('agent_email', email)
            .gte('date_time', `${weekStart} 00:00:00`)
            .lt('date_time', `${nextWeekStart} 00:00:00`)
            .order('date_time', { ascending: true })
            .order('sync_key', { ascending: true })
        ),

        fetchAll(() =>
          supabase
            .from(TABLE_VIOLATIONS)
            .select('*')
            .eq('agent_email', email)
            .or(`deduction_week_start.eq.${weekStart},and(deduction_week_start.is.null,week_start_date.eq.${weekStart})`)
            .order('created_at', { ascending: true })
        ),

        fetchAll(() =>
          supabase
            .from(TABLE_DISQUALIFIED)
            .select('*')
            .eq('agent_email', email)
            .or(`deduction_week_start.eq.${weekStart},and(deduction_week_start.is.null,week_start_date.eq.${weekStart})`)
            .order('created_at', { ascending: true })
        ),

        supabase
          .from(TABLE_COMMISSION_RECORDS)
          .select('*')
          .eq('agent_email', email)
          .eq('week_start_date', weekStart)
          .maybeSingle(),

        fetchAll(() =>
          supabase
            .from(TABLE_COMMISSION_RECORDS)
            .select('*')
            .eq('agent_email', email)
            .gte('week_start_date', historyStart)
            .lt('week_start_date', nextYearStart)
            .order('week_start_date', { ascending: false })
        ),

        fetchAll(() =>
          supabase
            .from(TABLE_BALANCE_LEDGER)
            .select('*')
            .eq('agent_email', email)
            .lt('entry_date', nextYearStart)
            .order('entry_date', { ascending: true })
            .order('id', { ascending: true })
        ),

        fetchAll(() =>
          supabase
            .from(TABLE_VIOLATIONS)
            .select('*')
            .eq('agent_email', email)
            .order('created_at', { ascending: false })
        ),

        fetchAll(() =>
          supabase
            .from(TABLE_DISQUALIFIED)
            .select('*')
            .eq('agent_email', email)
            .order('created_at', { ascending: false })
        ),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (publishedResult.error) throw publishedResult.error;

      setProfile(profileResult.data || null);
      setTransfers(transfersResult);
      setViolations(violationsResult);
      setDisqualified(disqualifiedResult);
      setPublishedRecord(publishedResult.data || null);
      setHistoryRecords(historyResult || []);
      setBalanceLedger(balanceLedgerResult || []);
      setAllViolations(allViolationsResult || []);
      setAllDisqualified(allDisqualifiedResult || []);
    } catch (error) {
      console.error('Unable to load agent commission:', error);
      setErrorMessage(error?.message || 'Unable to load commission data.');
      setTransfers([]);
      setViolations([]);
      setDisqualified([]);
      setPublishedRecord(null);
      setHistoryRecords([]);
      setBalanceLedger([]);
      setAllViolations([]);
      setAllDisqualified([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart, nextWeekStart]);

  useEffect(() => {
    loadCommissionWeek();
  }, [loadCommissionWeek]);

  const liveResult = useMemo(() => {
    const grossPay = Number(publishedRecord?.gross_pay) || 0;
    const licensed = publishedRecord ? publishedRecord.is_licensed_ca_doi !== false : true;

    return calculateAgentCommission({
      transactions: transfers,
      violations,
      disqualifiedPolicies: disqualified,
      grossPay,
      isLicensedCaDoi: licensed,
      weekStart,
    });
  }, [transfers, violations, disqualified, publishedRecord, weekStart]);

  const draftBalancePreview = useMemo(() => {
    // Only include balance activity that belongs to this commission week or
    // an earlier carried balance. This prevents later-week AR/SV from leaking
    // into an older commission preview.
    const arSvEntries = balanceLedger.filter((entry) => {
      if (!['AR', 'SCANNING'].includes(ledgerCategory(entry))) return false;

      const ledgerWeek = clean(entry.week_start_date);
      const entryDate = clean(entry.entry_date);

      if (ledgerWeek) return ledgerWeek <= weekStart;
      return !entryDate || entryDate <= scheduledPayday;
    });

    const currentBalance = Math.max(
      0,
      arSvEntries.reduce((sum, entry) => sum + signedLedgerAmount(entry), 0)
    );

    const currentViolationIds = new Set(
      violations
        .filter((row) => row?.id !== null && row?.id !== undefined)
        .map((row) => String(row.id))
    );

    const currentWeekObligations = new Map();
    arSvEntries.forEach((entry) => {
      const violationId = clean(entry.linked_violation_id);
      if (!violationId || !currentViolationIds.has(violationId)) return;
      const key = `${ledgerCategory(entry)}|${violationId}`;
      currentWeekObligations.set(
        key,
        (currentWeekObligations.get(key) || 0) + signedLedgerAmount(entry)
      );
    });

    const currentWeekLinkedBalance = [...currentWeekObligations.values()]
      .filter((amount) => amount > 0.009)
      .reduce((sum, amount) => sum + amount, 0);

    const commissionBeforeBalance = Math.max(
      0,
      Number(liveResult.commissionBeforeBalance ?? liveResult.finalPayableCommission) || 0
    );

    // Current-week AR/SV is already deducted by calculateAgentCommission.
    // Remove that same obligation from the ledger balance before projecting
    // the carried-balance FIFO application, matching the admin preview.
    const weeklyViolationLedgerApplied = liveResult.isLicensedCaDoi
      ? Math.min(
          Number(liveResult.basePayout) || 0,
          Number(liveResult.totalDeductions) || 0,
          currentWeekLinkedBalance
        )
      : 0;

    const carriedBalanceAfterWeekly = Math.max(
      0,
      currentBalance - weeklyViolationLedgerApplied
    );

    const balanceApplied = Math.min(
      commissionBeforeBalance,
      carriedBalanceAfterWeekly
    );

    return {
      currentBalance,
      currentWeekLinkedBalance,
      weeklyViolationLedgerApplied,
      carriedBalanceAfterWeekly,
      commissionBeforeBalance,
      balanceApplied,
      cashCommissionPayable: Math.max(0, commissionBeforeBalance - balanceApplied),
    };
  }, [balanceLedger, violations, liveResult, weekStart, scheduledPayday]);

  const displayResult = useMemo(() => {
    if (!publishedRecord) {
      return {
        ...liveResult,
        commissionBeforeBalance: draftBalancePreview.commissionBeforeBalance,
        balanceApplied: draftBalancePreview.balanceApplied,
        cashCommissionPayable: draftBalancePreview.cashCommissionPayable,
        finalPayableCommission: draftBalancePreview.cashCommissionPayable,
      };
    }

    return {
      ...liveResult,
      grossRevenue: Number(publishedRecord.gross_revenue ?? liveResult.grossRevenue),
      grossPay: Number(publishedRecord.gross_pay ?? liveResult.grossPay),
      royaltyDeduction: Number(publishedRecord.royalty_deduction ?? liveResult.royaltyDeduction),
      netRevenue: Number(publishedRecord.net_revenue ?? liveResult.netRevenue),
      grossNbCount: Number(publishedRecord.gross_nb_count ?? liveResult.grossNbCount),
      disqualifiedNbCount: Number(
        publishedRecord.disqualified_nb_count ?? liveResult.disqualifiedNbCount
      ),
      netNbCount: Number(publishedRecord.net_nb_count ?? liveResult.netNbCount),
      tierName: publishedRecord.tier || liveResult.tierName,
      commissionRate: Number(
        publishedRecord.commission_rate ?? liveResult.commissionRate
      ),
      basePayout: Number(publishedRecord.base_payout ?? liveResult.basePayout),
      totalDeductions: Number(
        publishedRecord.total_deductions ?? liveResult.totalDeductions
      ),
      calculatedWeeklyCommission: Number(
        publishedRecord.calculated_weekly_commission ??
          liveResult.calculatedWeeklyCommission
      ),
      commissionBeforeBalance: Number(
        publishedRecord.commission_before_balance ??
          ((Number(publishedRecord.final_payable_commission) || 0) +
            (Number(publishedRecord.balance_applied) || 0))
      ),
      balanceApplied: Number(publishedRecord.balance_applied) || 0,
      cashCommissionPayable: Number(
        publishedRecord.final_payable_commission ??
          liveResult.finalPayableCommission
      ),
      finalPayableCommission: Number(
        publishedRecord.final_payable_commission ??
          liveResult.finalPayableCommission
      ),
      violationCount: Number(
        publishedRecord.violation_count ?? liveResult.violationCount
      ),
      disqualifiedCount: Number(
        publishedRecord.disqualified_count ?? liveResult.disqualifiedCount
      ),
      isLicensedCaDoi: publishedRecord.is_licensed_ca_doi !== false,
      status: publishedRecord.status || liveResult.status,
      payoutDate: publishedRecord.payout_date || liveResult.payoutDate,
    };
  }, [publishedRecord, liveResult, draftBalancePreview]);

  const feeRows = useMemo(
    () => [
      {
        category: 'Broker Fee',
        revenue: liveResult.brokerFeeRevenue,
        count: liveResult.brokerFeeCount,
      },
      {
        category: 'Endorsement Fee',
        revenue: liveResult.endorsementFeeRevenue,
        count: liveResult.endorsementFeeCount,
      },
      {
        category: 'Reinstatement Fee',
        revenue: liveResult.reinstatementFeeRevenue,
        count: liveResult.reinstatementFeeCount,
      },
      {
        category: 'Renewal Fee',
        revenue: liveResult.renewalFeeRevenue,
        count: liveResult.renewalFeeCount,
      },
    ],
    [liveResult]
  );

  const activeViolations = useMemo(() => (
    violations.filter((row) => clean(row.status).toLowerCase() !== 'voided')
  ), [violations]);

  const activeDisqualified = useMemo(() => (
    disqualified.filter((row) => clean(row.status).toLowerCase() !== 'voided')
  ), [disqualified]);

  const visibleProductionRows = useMemo(
    () => transfers.filter(shouldShowInCommissionLog),
    [transfers]
  );

  const productionPageCount = Math.max(
    1,
    Math.ceil(visibleProductionRows.length / PRODUCTION_PAGE_SIZE)
  );

  const paginatedProductionRows = useMemo(() => {
    const start = (productionPage - 1) * PRODUCTION_PAGE_SIZE;
    return visibleProductionRows.slice(start, start + PRODUCTION_PAGE_SIZE);
  }, [visibleProductionRows, productionPage]);

  const productionRangeStart =
    visibleProductionRows.length === 0
      ? 0
      : (productionPage - 1) * PRODUCTION_PAGE_SIZE + 1;

  const productionRangeEnd = Math.min(
    productionPage * PRODUCTION_PAGE_SIZE,
    visibleProductionRows.length
  );

  useEffect(() => {
    setProductionPage(1);
  }, [weekStart, visibleProductionRows.length]);

  useEffect(() => {
    if (productionPage > productionPageCount) {
      setProductionPage(productionPageCount);
    }
  }, [productionPage, productionPageCount]);

  const selectedYear = Number(weekStart.slice(0, 4));
  const selectedYearStart = `${selectedYear}-01-01`;
  const selectedYearEnd = `${selectedYear}-12-31`;

  const ytdStats = useMemo(() => {
    const finalized = historyRecords.filter((record) => {
      const start = clean(record.week_start_date);
      return start >= selectedYearStart && start <= selectedYearEnd;
    });

    const finalizedCommission = finalized.reduce(
      (sum, record) => sum + (Number(record.final_payable_commission) || 0),
      0
    );

    const paidCommission = finalized.reduce((sum, record) => {
      const amountPaid = Number(record.amount_paid) || 0;
      return sum + amountPaid;
    }, 0);

    const netNb = finalized.reduce(
      (sum, record) => sum + (Number(record.net_nb_count) || 0),
      0
    );

    const deductions = finalized.reduce(
      (sum, record) => sum + (Number(record.total_deductions) || 0),
      0
    );

    const paidWeeks = finalized.filter(
      (record) => clean(record.payment_status).toLowerCase() === 'paid'
    ).length;

    const commissionWeeks = finalized.filter(
      (record) => Number(record.final_payable_commission) > 0
    );

    const averageWeeklyCommission =
      commissionWeeks.length > 0 ? finalizedCommission / commissionWeeks.length : 0;

    const bestWeek =
      finalized.length > 0
        ? [...finalized].sort(
            (a, b) =>
              (Number(b.final_payable_commission) || 0) -
              (Number(a.final_payable_commission) || 0)
          )[0]
        : null;

    return {
      finalizedCommission,
      paidCommission,
      netNb,
      deductions,
      paidWeeks,
      averageWeeklyCommission,
      bestWeek,
      finalizedWeeks: finalized.length,
    };
  }, [historyRecords, selectedYearStart, selectedYearEnd]);

  const activeUnledgeredViolations = useMemo(() => {
    const linkedViolationIds = new Set(
      balanceLedger
        .map((entry) => clean(entry.linked_violation_id))
        .filter(Boolean)
    );

    return allViolations.filter((row) => {
      const id = row?.id !== null && row?.id !== undefined ? String(row.id) : '';
      if (!id || linkedViolationIds.has(id)) return false;
      if (!isOpenBalanceViolation(row)) return false;
      if (!['AR', 'SCANNING'].includes(violationBalanceCategory(row))) return false;
      return violationFeeAmount(row) > 0.009;
    });
  }, [allViolations, balanceLedger]);

  const balanceStats = useMemo(() => {
    // Dashboard & History represents the agent's CURRENT account balance, not
    // a historical snapshot as of the selected production week's Sunday.
    // This is important because cleanup adjustments and imported violations
    // may be entered after the transaction date while still belonging to the
    // balance that exists today.
    const arSvEntries = balanceLedger.filter((row) =>
      ['AR', 'SCANNING'].includes(ledgerCategory(row))
    );

    const ledgerBalanceFor = (category) =>
      arSvEntries
        .filter((row) => ledgerCategory(row) === category)
        .reduce((sum, row) => sum + signedLedgerAmount(row), 0);

    const syntheticBalanceFor = (category) =>
      activeUnledgeredViolations
        .filter((row) => violationBalanceCategory(row) === category)
        .reduce((sum, row) => sum + violationFeeAmount(row), 0);

    const arBalance = Math.max(0, ledgerBalanceFor('AR') + syntheticBalanceFor('AR'));
    const scanningBalance = Math.max(
      0,
      ledgerBalanceFor('SCANNING') + syntheticBalanceFor('SCANNING')
    );

    const ytdEntries = arSvEntries.filter((row) => {
      const date = clean(row.entry_date);
      return date >= selectedYearStart && date <= selectedYearEnd;
    });

    const ytdPaidTowardBalance = Math.abs(
      ytdEntries
        .filter((row) =>
          ['payment', 'commission_applied'].includes(clean(row.entry_type).toLowerCase())
        )
        .reduce((sum, row) => sum + Math.min(0, signedLedgerAmount(row)), 0)
    );

    const ledgerYtdCharges = ytdEntries
      .filter(
        (row) =>
          clean(row.entry_type).toLowerCase() === 'charge' &&
          signedLedgerAmount(row) > 0
      )
      .reduce((sum, row) => sum + signedLedgerAmount(row), 0);

    const syntheticYtdCharges = activeUnledgeredViolations
      .filter((row) => {
        const date = clean(
          row.transaction_date || row.date || row.source_date || row.created_at
        ).slice(0, 10);
        return date >= selectedYearStart && date <= selectedYearEnd;
      })
      .reduce((sum, row) => sum + violationFeeAmount(row), 0);

    return {
      arBalance,
      scanningBalance,
      outstandingBalance: arBalance + scanningBalance,
      ytdPaidTowardBalance,
      ytdNewCharges: ledgerYtdCharges + syntheticYtdCharges,
    };
  }, [
    balanceLedger,
    activeUnledgeredViolations,
    selectedYearStart,
    selectedYearEnd,
  ]);

  const historyPageCount = Math.max(
    1,
    Math.ceil(historyRecords.length / HISTORY_PAGE_SIZE)
  );

  const paginatedHistoryRecords = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return historyRecords.slice(start, start + HISTORY_PAGE_SIZE);
  }, [historyRecords, historyPage]);

  const commissionChartRecords = useMemo(
    () =>
      [...historyRecords]
        .sort((a, b) =>
          clean(a.week_start_date).localeCompare(clean(b.week_start_date))
        )
        .slice(-12),
    [historyRecords]
  );

  const chartMax = Math.max(
    1,
    ...commissionChartRecords.map(
      (record) => Number(record.final_payable_commission) || 0
    )
  );

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedYear]);

  const violationById = useMemo(() => {
    const map = new Map();
    allViolations.forEach((row) => {
      if (row?.id !== null && row?.id !== undefined) {
        map.set(String(row.id), row);
      }
    });
    return map;
  }, [allViolations]);

  const violationBalanceItems = useMemo(() => {
    const grouped = new Map();

    // This page is the CURRENT balance account. Use the complete ledger so
    // later cleanup adjustments/payments correctly reduce older charges.
    balanceLedger.forEach((entry) => {
      const category = ledgerCategory(entry);
      if (!['AR', 'SCANNING'].includes(category)) return;

      const linkedId =
        entry?.linked_violation_id !== null && entry?.linked_violation_id !== undefined
          ? String(entry.linked_violation_id)
          : null;

      // Legacy cleanup rows were not always linked to individual violations.
      // Keep them together by category so their charges and cleanup credits net
      // to the real carried balance instead of creating fake open items.
      const key = linkedId ? `id:${linkedId}` : `legacy:${category}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          linkedViolationId: linkedId,
          category,
          entries: [],
          balance: 0,
          charged: 0,
          paid: 0,
          latestDate: null,
          synthetic: false,
        });
      }

      const item = grouped.get(key);
      const amount = signedLedgerAmount(entry);
      item.entries.push(entry);
      item.balance += amount;

      if (amount > 0) item.charged += amount;
      if (amount < 0) item.paid += Math.abs(amount);

      const date = clean(entry.entry_date);
      if (!item.latestDate || date > item.latestDate) item.latestDate = date;
    });

    // Some newly imported AR/SV rows can exist in violations before a matching
    // balance-ledger charge has been written. They still need to appear under
    // Pending so the agent sees exactly what is currently owed.
    activeUnledgeredViolations.forEach((violation) => {
      const linkedId = String(violation.id);
      const category = violationBalanceCategory(violation);
      const amount = violationFeeAmount(violation);
      const key = `id:${linkedId}`;
      const date = clean(
        violation.transaction_date ||
          violation.date ||
          violation.source_date ||
          violation.created_at
      ).slice(0, 10);

      grouped.set(key, {
        key,
        linkedViolationId: linkedId,
        category,
        entries: [],
        balance: amount,
        charged: amount,
        paid: 0,
        latestDate: date || null,
        synthetic: true,
        violation,
      });
    });

    return [...grouped.values()].map((item) => {
      const violation =
        item.violation ||
        (item.linkedViolationId ? violationById.get(item.linkedViolationId) : null);

      return {
        ...item,
        balance: Math.max(0, item.balance),
        violation,
      };
    });
  }, [balanceLedger, violationById, activeUnledgeredViolations]);

  const currentViolationBalances = useMemo(
    () =>
      violationBalanceItems
        .filter((item) => item.balance > 0.009)
        .sort((a, b) => clean(b.latestDate).localeCompare(clean(a.latestDate))),
    [violationBalanceItems]
  );

  const paidViolationBalances = useMemo(
    () =>
      violationBalanceItems
        .filter((item) => item.charged > 0 && item.balance <= 0.009)
        .sort((a, b) => clean(b.latestDate).localeCompare(clean(a.latestDate))),
    [violationBalanceItems]
  );

  const currentDisqualifiedPolicies = useMemo(() => {
    const historicalStatuses = new Set([
      'VOIDED',
      'RESOLVED',
      'CLEARED',
      'REMOVED',
      'REINSTATED',
      'CLOSED',
    ]);

    return allDisqualified.filter(
      (row) => !historicalStatuses.has(clean(row.status).toUpperCase())
    );
  }, [allDisqualified]);

  const historicalDisqualifiedPolicies = useMemo(() => {
    const historicalStatuses = new Set([
      'VOIDED',
      'RESOLVED',
      'CLEARED',
      'REMOVED',
      'REINSTATED',
      'CLOSED',
    ]);

    return allDisqualified.filter((row) =>
      historicalStatuses.has(clean(row.status).toUpperCase())
    );
  }, [allDisqualified]);

  const getViolationClient = (item) => {
    const row = item.violation || {};
    const client = firstValue(row, [
      'customer',
      'customer_name',
      'named_insured',
      'client_name',
      'insured_name',
    ]);

    if (client !== '—') return client;
    return item.linkedViolationId
      ? 'Violation details unavailable'
      : `Previous ${item.category === 'SCANNING' ? 'Scanning' : 'AR'} Balance`;
  };

  const getViolationPolicy = (item) => {
    const row = item.violation || {};
    const identifier = firstValue(row, [
      'policy_number',
      'policy',
      'receipt_id',
      'receipt',
      'customer_id',
    ]);

    if (identifier !== '—') return identifier;
    return item.linkedViolationId ? 'No policy / customer ID recorded' : 'Carried balance';
  };

  const getViolationReason = (item) => {
    const row = item.violation || {};
    const fromViolation = firstValue(row, [
      'details',
      'note',
      'notes',
      'reason',
      'description',
      'comment',
      'comments',
      'violation_reason',
    ]);

    if (fromViolation !== '—') return fromViolation;

    const chargeEntry = item.entries.find((entry) => signedLedgerAmount(entry) > 0);
    if (chargeEntry?.description) return chargeEntry.description;

    return item.linkedViolationId
      ? 'No reason was entered.'
      : 'Carried balance from before the detailed violation ledger was linked.';
  };

  const previousWeek = () => {
    if (weekStart <= COMMISSION_CUTOVER_WEEK) return;

    const previousWeekStart = addDaysKey(weekStart, -7);
    const safeWeekStart =
      previousWeekStart < COMMISSION_CUTOVER_WEEK
        ? COMMISSION_CUTOVER_WEEK
        : previousWeekStart;

    setAnchorDate(dateFromKey(safeWeekStart));
  };

  const nextWeek = () => {
    const date = new Date(`${weekStart}T12:00:00`);
    date.setDate(date.getDate() + 7);
    setAnchorDate(date);
  };

  const goToPayingWeek = () => {
    setAnchorDate(dateFromKey(payContext.payingWeekStart));
  };

  const goToNextPayout = () => {
    setAnchorDate(dateFromKey(payContext.nextPayoutWeekStart));
  };

  const goToCurrentProduction = () => {
    setAnchorDate(dateFromKey(payContext.currentProductionWeekStart));
  };

  const openHistoryModal = (record) => {
    setHistoryModalRecord(record);
  };

  const closeHistoryModal = () => {
    setHistoryModalRecord(null);
  };

  const viewFullHistoryWeek = () => {
    if (!historyModalRecord?.week_start_date) return;

    setAnchorDate(new Date(`${historyModalRecord.week_start_date}T12:00:00`));
    setActiveView('current');
    setHistoryModalRecord(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const tierExplanation = useMemo(() => {
    if (displayResult.netRevenue < 500) {
      return `${money(500 - displayResult.netRevenue)} short of the $500 minimum net revenue requirement.`;
    }

    if (displayResult.tierName === 'Tier 3') {
      return 'You reached the highest commission tier.';
    }

    const progress = displayResult.nextTierProgress;
    if (!progress) return 'Commission tier calculated from your weekly production.';

    const details = [];

    if (Number(progress.nbNeeded) > 0) {
      details.push(`${progress.nbNeeded} more Net NB`);
    }

    if (Number(progress.revenueNeeded) > 0) {
      details.push(`${money(progress.revenueNeeded)} more Gross Revenue`);
    }

    if (Number(progress.revenueOnlyNeeded) > 0) {
      details.push(
        `or ${money(progress.revenueOnlyNeeded)} more Gross Revenue to qualify by revenue alone`
      );
    }

    return details.length
      ? `${progress.message} You currently need ${details.join(' and ')}.`
      : progress.message;
  }, [displayResult]);

  const agentName = profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Agent';
  const isPublished = Boolean(publishedRecord);

  if (loading) {
    return <div className={styles.page}><div className={styles.loadingCard}>Loading commission...</div></div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>MY COMMISSION</div>
          <h1>{agentName}</h1>
          <div className={styles.subTitle}>
            Production week {formatDate(weekStart)} – {formatDate(weekEnd)}
          </div>
        </div>

        <div className={styles.headerActions}>
          {activeView === 'current' && (
            <>
              <button type="button" onClick={previousWeek} disabled={isAtCommissionCutover}>← Previous Week</button>
              <button
                type="button"
                onClick={goToPayingWeek}
                disabled={isPayingThisFriday}
                className={isPayingThisFriday ? styles.thisWeekActive : ''}
              >
                {isPayingThisFriday ? '✓ Paying This Friday' : 'Paying This Friday'}
              </button>
              <button
                type="button"
                onClick={goToNextPayout}
                disabled={isNextPayout}
                className={isNextPayout ? styles.thisWeekActive : ''}
              >
                Next Payout
              </button>
              <button
                type="button"
                onClick={goToCurrentProduction}
                disabled={isCurrentProduction}
                className={isCurrentProduction ? styles.thisWeekActive : ''}
              >
                Current Production
              </button>
              <button type="button" onClick={nextWeek}>Next Week →</button>
            </>
          )}
          <button type="button" onClick={loadCommissionWeek}>Refresh</button>
        </div>
      </div>

      {activeView === 'current' && (
        <section className={styles.payWeekBar}>
          <div>
            <span className={styles.payWeekEyebrow}>
              {isPayingThisFriday ? 'COMMISSION BEING PAID THIS FRIDAY' : 'SELECTED COMMISSION WEEK'}
            </span>
            <strong>{formatDate(weekStart)} – {formatDate(weekEnd)}</strong>
            <small>Production / commission week · Agent commission history begins 8/24/2026</small>
          </div>
          <div className={styles.payWeekDate}>
            <span>Scheduled payday</span>
            <strong>Friday, {formatDate(scheduledPayday)}</strong>
            <small>{isPublished ? 'Published final commission' : 'Projected until management publishes the week'}</small>
          </div>
        </section>
      )}

      {['current', 'dashboard'].includes(activeView) && (
        <div className={styles.viewTabsShell}>
          <div className={styles.viewTabs} role="tablist" aria-label="Commission dashboard views">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'current'}
            className={activeView === 'current' ? styles.viewTabActive : ''}
            onClick={() => setActiveView('current')}
          >
            <span className={styles.viewTabTitle}>Current Commission</span>
            <span className={styles.viewTabSub}>Weekly calculation & production</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'dashboard'}
            className={activeView === 'dashboard' ? styles.viewTabActive : ''}
            onClick={() => setActiveView('dashboard')}
          >
            <span className={styles.viewTabTitle}>Dashboard & History</span>
            <span className={styles.viewTabSub}>YTD, balances & past weeks</span>
          </button>
          </div>
        </div>
      )}

      {errorMessage && <div className={styles.errorBox}>{errorMessage}</div>}

      {activeView === 'balance' && (
        <div className={styles.tabPanel}>
          <section className={styles.detailPageHeader}>
            <div>
              <button
                type="button"
                className={styles.backToDashboardButton}
                onClick={() => {
                  setActiveView('dashboard');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                ← Back to Dashboard
              </button>

              <div className={styles.dashboardIntroEyebrow}>AR & SCANNING</div>
              <h2>Balance & Repayment</h2>
              <p>
                Review every outstanding AR and scanning violation, why it was given,
                what has been paid, and resolved history.
              </p>
            </div>

            <div
              className={`${styles.detailPageBalance} ${
                balanceStats.outstandingBalance > 0
                  ? styles.balanceOwed
                  : styles.balanceClear
              }`}
            >
              <span>Outstanding Balance</span>
              <strong>{money(balanceStats.outstandingBalance)}</strong>
            </div>
          </section>

          <section className={styles.detailPageKpis}>
            <DashboardMetric
              label="AR Balance"
              value={money(balanceStats.arBalance)}
              sub={`${currentViolationBalances.filter((item) => item.category === 'AR').length} open AR item(s)`}
              tone={balanceStats.arBalance > 0 ? 'danger' : 'success'}
            />
            <DashboardMetric
              label="Scanning Balance"
              value={money(balanceStats.scanningBalance)}
              sub={`${currentViolationBalances.filter((item) => item.category === 'SCANNING').length} open scanning item(s)`}
              tone={balanceStats.scanningBalance > 0 ? 'danger' : 'success'}
            />
            <DashboardMetric
              label={`${selectedYear} Paid / Applied`}
              value={money(balanceStats.ytdPaidTowardBalance)}
              sub="Payments and commission applied"
              tone="success"
            />
            <DashboardMetric
              label={`${selectedYear} New Charges`}
              value={money(balanceStats.ytdNewCharges)}
              sub="New AR and scanning charges"
            />
          </section>

          <section className={styles.card}>
            <div className={styles.fullPageTabs}>
              <button
                type="button"
                className={balanceModalTab === 'current' ? styles.fullPageTabActive : ''}
                onClick={() => setBalanceModalTab('current')}
              >
                Pending
                <span>{currentViolationBalances.length}</span>
              </button>
              <button
                type="button"
                className={balanceModalTab === 'history' ? styles.fullPageTabActive : ''}
                onClick={() => setBalanceModalTab('history')}
              >
                Paid
                <span>{paidViolationBalances.length}</span>
              </button>
            </div>

            <div className={styles.fullPageDetailBody}>
              {balanceModalTab === 'current' ? (
                currentViolationBalances.length === 0 ? (
                  <EmptyState text="No pending AR or scanning violations." />
                ) : (
                  <div className={styles.fullDetailRecordList}>
                    {currentViolationBalances.map((item) => (
                      <div className={styles.fullDetailRecord} key={item.key}>
                        <div className={styles.fullDetailRecordHeader}>
                          <div>
                            <span className={styles.detailTypeBadge}>{item.category}</span>
                            <div>
                              <strong>{getViolationClient(item)}</strong>
                              <small>{getViolationPolicy(item)}</small>
                            </div>
                          </div>

                          <div className={styles.fullDetailAmount}>
                            <span>Balance Owed</span>
                            <strong className={styles.balanceCharge}>
                              {money(item.balance)}
                            </strong>
                          </div>
                        </div>

                        <div className={styles.fullDetailInfoGrid}>
                          <div>
                            <span>Original Charge</span>
                            <strong>{money(item.charged)}</strong>
                          </div>
                          <div>
                            <span>Paid / Applied</span>
                            <strong className={styles.balanceCredit}>{money(item.paid)}</strong>
                          </div>
                          <div>
                            <span>Remaining</span>
                            <strong className={styles.balanceCharge}>{money(item.balance)}</strong>
                          </div>
                          <div>
                            <span>Last Activity</span>
                            <strong>{formatDate(item.latestDate)}</strong>
                          </div>
                        </div>

                        <div className={styles.fullDetailReason}>
                          <span>Why this violation was given</span>
                          <p>{getViolationReason(item)}</p>
                        </div>

                        <div className={styles.activityTimeline}>
                          <span className={styles.activityTimelineTitle}>Balance Activity</span>
                          {item.entries.length === 0 ? (
                            <div className={styles.activityTimelineRow}>
                              <span>{formatDate(item.latestDate)}</span>
                              <span>pending</span>
                              <span>Charge is recorded in the violations log and awaiting ledger settlement.</span>
                              <strong className={styles.balanceCharge}>+ {money(item.charged)}</strong>
                            </div>
                          ) : item.entries
                            .slice()
                            .sort((a, b) =>
                              clean(a.entry_date).localeCompare(clean(b.entry_date))
                            )
                            .map((entry) => (
                              <div
                                className={styles.activityTimelineRow}
                                key={entry.id || `${item.key}-${entry.entry_date}-${entry.amount}`}
                              >
                                <span>{formatDate(entry.entry_date)}</span>
                                <span>{clean(entry.entry_type).replaceAll('_', ' ')}</span>
                                <span>{entry.description || '—'}</span>
                                <strong
                                  className={
                                    signedLedgerAmount(entry) > 0
                                      ? styles.balanceCharge
                                      : styles.balanceCredit
                                  }
                                >
                                  {signedLedgerAmount(entry) > 0 ? '+' : '−'}{' '}
                                  {money(Math.abs(signedLedgerAmount(entry)))}
                                </strong>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : paidViolationBalances.length === 0 ? (
                <EmptyState text="No paid AR / scanning violations yet." />
              ) : (
                <div className={styles.fullDetailRecordList}>
                  {paidViolationBalances.map((item) => (
                    <div className={styles.fullDetailRecord} key={item.key}>
                      <div className={styles.fullDetailRecordHeader}>
                        <div>
                          <span className={`${styles.detailTypeBadge} ${styles.detailPaidBadge}`}>
                            {item.category} • RESOLVED
                          </span>
                          <div>
                            <strong>{getViolationClient(item)}</strong>
                            <small>{getViolationPolicy(item)}</small>
                          </div>
                        </div>

                        <div className={styles.fullDetailAmount}>
                          <span>Total Paid</span>
                          <strong className={styles.balanceCredit}>{money(item.paid)}</strong>
                        </div>
                      </div>

                      <div className={styles.fullDetailInfoGrid}>
                        <div>
                          <span>Original Charge</span>
                          <strong>{money(item.charged)}</strong>
                        </div>
                        <div>
                          <span>Total Paid / Applied</span>
                          <strong className={styles.balanceCredit}>{money(item.paid)}</strong>
                        </div>
                        <div>
                          <span>Remaining Balance</span>
                          <strong>{money(0)}</strong>
                        </div>
                        <div>
                          <span>Resolved / Last Activity</span>
                          <strong>{formatDate(item.latestDate)}</strong>
                        </div>
                      </div>

                      <div className={styles.fullDetailReason}>
                        <span>Original reason</span>
                        <p>{getViolationReason(item)}</p>
                      </div>

                      <div className={styles.activityTimeline}>
                        <span className={styles.activityTimelineTitle}>Payment History</span>
                        {item.entries
                          .slice()
                          .sort((a, b) =>
                            clean(a.entry_date).localeCompare(clean(b.entry_date))
                          )
                          .map((entry) => (
                            <div
                              className={styles.activityTimelineRow}
                              key={entry.id || `${item.key}-${entry.entry_date}-${entry.amount}`}
                            >
                              <span>{formatDate(entry.entry_date)}</span>
                              <span>{clean(entry.entry_type).replaceAll('_', ' ')}</span>
                              <span>{entry.description || '—'}</span>
                              <strong
                                className={
                                  signedLedgerAmount(entry) > 0
                                    ? styles.balanceCharge
                                    : styles.balanceCredit
                                }
                              >
                                {signedLedgerAmount(entry) > 0 ? '+' : '−'}{' '}
                                {money(Math.abs(signedLedgerAmount(entry)))}
                              </strong>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeView === 'disqualified' && (
        <div className={styles.tabPanel}>
          <section className={styles.detailPageHeader}>
            <div>
              <button
                type="button"
                className={styles.backToDashboardButton}
                onClick={() => {
                  setActiveView('dashboard');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                ← Back to Dashboard
              </button>

              <div className={styles.dashboardIntroEyebrow}>POLICY REVIEW</div>
              <h2>Disqualified Policies</h2>
              <p>
                Review policies currently affecting commission and the history of
                resolved or removed disqualifications.
              </p>
            </div>

            <div className={styles.detailPageBalance}>
              <span>Currently Disqualified</span>
              <strong>{currentDisqualifiedPolicies.length}</strong>
            </div>
          </section>

          <section className={styles.detailPageKpis}>
            <DashboardMetric
              label="Current Disqualified"
              value={currentDisqualifiedPolicies.length}
              sub="Currently affecting commission"
              tone={currentDisqualifiedPolicies.length > 0 ? 'danger' : 'success'}
            />
            <DashboardMetric
              label="Resolved History"
              value={historicalDisqualifiedPolicies.length}
              sub="Resolved, removed, reinstated, or voided"
            />
            <DashboardMetric
              label="Current Gross NB Impact"
              value={displayResult.disqualifiedNbCount}
              sub="Disqualified NB in selected commission week"
            />
            <DashboardMetric
              label="Current Net NB"
              value={displayResult.netNbCount}
              sub={`${displayResult.grossNbCount} gross NB before disqualifications`}
            />
          </section>

          <section className={styles.card}>
            <div className={styles.fullPageTabs}>
              <button
                type="button"
                className={disqualifiedModalTab === 'current' ? styles.fullPageTabActive : ''}
                onClick={() => setDisqualifiedModalTab('current')}
              >
                Current
                <span>{currentDisqualifiedPolicies.length}</span>
              </button>
              <button
                type="button"
                className={disqualifiedModalTab === 'history' ? styles.fullPageTabActive : ''}
                onClick={() => setDisqualifiedModalTab('history')}
              >
                History
                <span>{historicalDisqualifiedPolicies.length}</span>
              </button>
            </div>

            <div className={styles.fullPageDetailBody}>
              {(disqualifiedModalTab === 'current'
                ? currentDisqualifiedPolicies
                : historicalDisqualifiedPolicies
              ).length === 0 ? (
                <EmptyState
                  text={
                    disqualifiedModalTab === 'current'
                      ? 'No current disqualified policies.'
                      : 'No disqualified policy history yet.'
                  }
                />
              ) : (
                <div className={styles.fullDetailRecordList}>
                  {(disqualifiedModalTab === 'current'
                    ? currentDisqualifiedPolicies
                    : historicalDisqualifiedPolicies
                  ).map((row, index) => (
                    <div
                      className={styles.fullDetailRecord}
                      key={row.id || row.linked_sync_key || index}
                    >
                      <div className={styles.fullDetailRecordHeader}>
                        <div>
                          <span className={styles.detailTypeBadge}>
                            {clean(row.status).toUpperCase() || 'DISQUALIFIED'}
                          </span>
                          <div>
                            <strong>
                              {firstValue(row, [
                                'customer',
                                'customer_name',
                                'named_insured',
                                'client_name',
                                'policy_number',
                                'policy',
                              ])}
                            </strong>
                            <small>
                              {firstValue(row, [
                                'policy_number',
                                'policy',
                                'receipt_id',
                                'receipt',
                              ])}
                            </small>
                          </div>
                        </div>

                        <span className={styles.disqualifiedTag}>
                          {disqualifiedModalTab === 'current' ? 'CURRENT' : 'HISTORY'}
                        </span>
                      </div>

                      <div className={styles.fullDetailInfoGrid}>
                        <div>
                          <span>Office</span>
                          <strong>{firstValue(row, ['office', 'office_code'])}</strong>
                        </div>
                        <div>
                          <span>Date</span>
                          <strong>
                            {formatDate(
                              firstValue(row, [
                                'created_at',
                                'date_time',
                                'date',
                                'week_start_date',
                              ])
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Receipt</span>
                          <strong>{firstValue(row, ['receipt_id', 'receipt'])}</strong>
                        </div>
                        <div>
                          <span>Linked Transaction</span>
                          <strong>{firstValue(row, ['linked_sync_key', 'sync_key'])}</strong>
                        </div>
                      </div>

                      <div className={styles.fullDetailReason}>
                        <span>Why this policy was disqualified</span>
                        <p>
                          {firstValue(row, [
                            'note',
                            'notes',
                            'reason',
                            'disqualification_reason',
                            'description',
                            'comment',
                            'comments',
                          ])}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeView === 'current' && (
        <div className={styles.tabPanel}>
          <div className={`${styles.statusBanner} ${isPublished ? styles.finalBanner : styles.estimateBanner}`}>
        <div>
          <strong>{isPublished ? 'Final Commission' : 'Preliminary Commission'}</strong>
          <span>
            {isPublished
              ? 'This week has been published by management. Any AR / scanning amount applied from commission is already included in the cash-payable amount.'
              : 'This week is not published yet. The cash-payable amount includes a projection of your current carried AR / scanning balance and may change until management publishes the week.'}
          </span>
        </div>
        <div className={styles.statusPill}>{isPublished ? 'PUBLISHED' : 'IN PROGRESS'}</div>
      </div>

        </div>
      )}

      {activeView === 'dashboard' && (
        <div className={styles.tabPanel}>
          <div className={styles.dashboardIntro}>
            <div>
              <div className={styles.dashboardIntroEyebrow}>PERFORMANCE OVERVIEW</div>
              <h2>{selectedYear} Commission Dashboard</h2>
              <p>
                Review finalized commission, payment history, carried balances,
                and performance trends.
              </p>
            </div>
            <div className={styles.dashboardIntroPeriod}>{selectedYear}</div>
          </div>

          <section className={styles.dashboardKpis}>
        <DashboardMetric
          label={`${selectedYear} Commission Paid`}
          value={money(ytdStats.paidCommission)}
          sub={`${ytdStats.paidWeeks} paid week${ytdStats.paidWeeks === 1 ? '' : 's'}`}
          tone="success"
        />
        <DashboardMetric
          label={`${selectedYear} Finalized Commission`}
          value={money(ytdStats.finalizedCommission)}
          sub={`${ytdStats.finalizedWeeks} finalized week${ytdStats.finalizedWeeks === 1 ? '' : 's'}`}
        />
        <DashboardMetric
          label="Outstanding AR / Scanning"
          value={money(balanceStats.outstandingBalance)}
          sub={`AR ${money(balanceStats.arBalance)} • Scanning ${money(balanceStats.scanningBalance)}`}
          tone={balanceStats.outstandingBalance > 0 ? 'danger' : 'success'}
        />
        <DashboardMetric
          label={`${selectedYear} Net NB`}
          value={ytdStats.netNb}
          sub={`Avg weekly commission ${money(ytdStats.averageWeeklyCommission)}`}
        />
      </section>

          <section className={styles.dashboardSplit}>
        <div className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Commission Trend</h2>
              <p>Your last {commissionChartRecords.length} finalized commission weeks.</p>
            </div>
            <div className={styles.countBadge}>{selectedYear}</div>
          </div>

          {commissionChartRecords.length === 0 ? (
            <EmptyState text="No finalized commission history yet." />
          ) : (
            <div className={styles.miniChart}>
              {commissionChartRecords.map((record) => {
                const amount = Number(record.final_payable_commission) || 0;
                const height = Math.max(4, Math.round((amount / chartMax) * 100));
                return (
                  <button
                    type="button"
                    key={`${record.agent_email}-${record.week_start_date}`}
                    className={styles.chartColumn}
                    title={`${formatDate(record.week_start_date)}: ${money(amount)}`}
                    onClick={() =>
                      setAnchorDate(new Date(`${record.week_start_date}T12:00:00`))
                    }
                  >
                    <span className={styles.chartAmount}>{money(amount)}</span>
                    <span
                      className={styles.chartBar}
                      style={{ height: `${height}%` }}
                    />
                    <span className={styles.chartDate}>
                      {new Date(`${record.week_start_date}T12:00:00`).toLocaleDateString(
                        undefined,
                        { month: 'short', day: 'numeric' }
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Balance & Repayment</h2>
              <p>Outstanding AR and scanning violations with payment history.</p>
            </div>
            <div
              className={`${styles.balanceBadge} ${
                balanceStats.outstandingBalance > 0
                  ? styles.balanceOwed
                  : styles.balanceClear
              }`}
            >
              {money(balanceStats.outstandingBalance)}
            </div>
          </div>

          <div className={styles.summaryFeatureGrid}>
            <div className={styles.summaryFeature}>
              <span>Current AR Balance</span>
              <strong>{money(balanceStats.arBalance)}</strong>
            </div>
            <div className={styles.summaryFeature}>
              <span>Current Scanning Balance</span>
              <strong>{money(balanceStats.scanningBalance)}</strong>
            </div>
            <div className={styles.summaryFeature}>
              <span>Open Violations</span>
              <strong>{currentViolationBalances.length}</strong>
            </div>
            <div className={styles.summaryFeature}>
              <span>{selectedYear} Paid Toward Balance</span>
              <strong>{money(balanceStats.ytdPaidTowardBalance)}</strong>
            </div>
          </div>

          <button
            type="button"
            className={styles.summaryActionButton}
            onClick={() => {
              setBalanceModalTab('current');
              setActiveView('balance');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            View AR / Scanning Details →
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Disqualified Policies</h2>
            <p>Review policies currently affecting commission and previously resolved items.</p>
          </div>
          <div className={styles.countBadge}>{currentDisqualifiedPolicies.length}</div>
        </div>

        <div className={styles.disqualifiedDashboardRow}>
          <div>
            <span className={styles.summaryLabel}>Currently Disqualified</span>
            <strong>{currentDisqualifiedPolicies.length}</strong>
            <p>Policies that may still affect Net NB and commission tiers.</p>
          </div>

          <div>
            <span className={styles.summaryLabel}>History</span>
            <strong>{historicalDisqualifiedPolicies.length}</strong>
            <p>Resolved, removed, reinstated, or voided disqualifications.</p>
          </div>

          <button
            type="button"
            className={styles.summaryActionButton}
            onClick={() => {
              setDisqualifiedModalTab('current');
              setActiveView('disqualified');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            View Disqualified Policies →
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Commission History</h2>
            <p>Finalized weekly records. Open any week to review the full calculation.</p>
          </div>
          <div className={styles.countBadge}>{historyRecords.length}</div>
        </div>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th>Tier</th>
                <th>Net NB</th>
                <th>Gross Revenue</th>
                <th>Deductions</th>
                <th>Commission Earned</th>
                <th>AR / SV Applied</th>
                <th>Cash Payable</th>
                <th>Paid</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginatedHistoryRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className={styles.emptyCell}>
                    No finalized commission history yet.
                  </td>
                </tr>
              ) : (
                paginatedHistoryRecords.map((record) => (
                  <tr key={`${record.agent_email}-${record.week_start_date}`}>
                    <td>
                      {formatDate(record.week_start_date)} – {formatDate(record.week_end_date)}
                    </td>
                    <td>{record.tier || '—'}</td>
                    <td>{Number(record.net_nb_count) || 0}</td>
                    <td>{money(record.gross_revenue)}</td>
                    <td>{money(record.total_deductions)}</td>
                    <td><strong>{money(record.commission_before_balance ?? ((Number(record.final_payable_commission) || 0) + (Number(record.balance_applied) || 0)))}</strong></td>
                    <td>{money(record.balance_applied)}</td>
                    <td><strong>{money(record.final_payable_commission)}</strong></td>
                    <td>{money(record.amount_paid)}</td>
                    <td>
                      <span className={styles.historyStatus}>
                        {paymentStatusLabel(record)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.viewWeekButton}
                        onClick={() => openHistoryModal(record)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <SimplePager
          page={historyPage}
          pageCount={historyPageCount}
          setPage={setHistoryPage}
        />
      </section>

        </div>
      )}

      {activeView === 'current' && (
        <div className={styles.tabPanel}>
          <section className={styles.heroGrid}>
            <div className={styles.commissionHero}>
              <span className={styles.cardLabel}>
                {isPublished ? 'Cash Commission Payable' : 'Projected Cash Commission Payable'}
              </span>
              <div className={styles.heroAmount}>{money(displayResult.finalPayableCommission)}</div>
              <div className={styles.heroMeta}>
                <span>{displayResult.tierName}</span>
                <span>{isPublished ? 'Final' : 'Projected'}</span>
              </div>
            </div>
            <Metric
              label="Net NB"
              value={displayResult.netNbCount}
              sub={`${displayResult.grossNbCount} gross • ${displayResult.disqualifiedNbCount} disqualified`}
            />
            <Metric
              label="Gross Revenue"
              value={money(displayResult.grossRevenue)}
              sub={`${percent(displayResult.commissionRate)} commission tier`}
            />
            <Metric
              label="Current AR / SV Balance"
              value={money(isPublished ? balanceStats.outstandingBalance : draftBalancePreview.carriedBalanceAfterWeekly)}
              sub={
                Number(displayResult.balanceApplied || 0) > 0
                  ? `${money(displayResult.balanceApplied)} ${isPublished ? 'was applied' : 'will be applied'} to this commission`
                  : 'No carried balance projected against this commission'
              }
            />
          </section>

          <section className={styles.currentSectionHeading}>
            <div>
              <div className={styles.dashboardIntroEyebrow}>WEEKLY DETAIL</div>
              <h2>Commission Detail</h2>
              <p>See exactly how this week's commission was calculated.</p>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>How Your Commission Was Calculated</h2>
            <p>Every step used to arrive at your weekly commission.</p>
          </div>
          <div className={styles.tierBadge}>{displayResult.tierName} • {percent(displayResult.commissionRate)}</div>
        </div>

        <div className={styles.calcGrid}>
          <CalcRow label="Gross Revenue" value={money(displayResult.grossRevenue)} />
          <CalcRow label="20% Royalty Deduction" value={`− ${money(displayResult.royaltyDeduction)}`} negative />
          <CalcRow label="Gross Pay" value={`− ${money(displayResult.grossPay)}`} negative />
          <CalcRow label="Net Revenue" value={money(displayResult.netRevenue)} strong />
          <CalcRow label={`Commission Rate (${displayResult.tierName})`} value={percent(displayResult.commissionRate)} />
          <CalcRow label="Base Commission" value={money(displayResult.basePayout)} strong />
          <CalcRow label="Violation Deductions" value={`− ${money(displayResult.totalDeductions)}`} negative />
          <CalcRow
            label="Commission Before AR / Scanning Balance"
            value={money(displayResult.commissionBeforeBalance ?? displayResult.calculatedWeeklyCommission)}
            strong
          />
          {Number(displayResult.balanceApplied || 0) > 0 && (
            <CalcRow
              label={isPublished ? 'Applied to Outstanding AR / Scanning' : 'Projected to Outstanding AR / Scanning'}
              value={`− ${money(displayResult.balanceApplied)}`}
              negative
            />
          )}
          <CalcRow
            label={isPublished ? 'Cash Commission Payable' : 'Projected Cash Commission Payable'}
            value={money(displayResult.finalPayableCommission)}
            final
          />
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Why You Received {displayResult.tierName}</h2>
            <p>{tierExplanation}</p>
          </div>
        </div>

        <div className={styles.rulesGrid}>
          <Rule title="Minimum" text="$500+ net revenue is required before any commission can be paid." met={displayResult.netRevenue >= 500} />
          <Rule title="Tier 1 • 10%" text="8+ Net NB OR $2,500+ Gross Revenue" met={displayResult.netNbCount >= 8 || displayResult.grossRevenue >= 2500} />
          <Rule title="Tier 2 • 12.5%" text="17+ Net NB AND $3,500+ Gross Revenue, OR $5,000+ Gross Revenue" met={(displayResult.netNbCount >= 17 && displayResult.grossRevenue >= 3500) || displayResult.grossRevenue >= 5000} />
          <Rule title="Tier 3 • 15%" text="24+ Net NB AND $5,000+ Gross Revenue" met={displayResult.netNbCount >= 24 && displayResult.grossRevenue >= 5000} />
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Revenue Breakdown</h2>
            <p>Commissionable fee categories from your transaction detail.</p>
          </div>
        </div>
        <div className={styles.feeGrid}>
          {feeRows.map((row) => (
            <Metric key={row.category} label={row.category} value={money(row.revenue)} sub={`${row.count} active fee item${row.count === 1 ? '' : 's'}`} />
          ))}
        </div>
      </section>

      <section className={styles.twoColumn}>
        <div className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Violations & Charges</h2>
              <p>These deductions are taken after your base commission is calculated.</p>
            </div>
            <div className={styles.countBadge}>{activeViolations.length}</div>
          </div>

          {activeViolations.length === 0 ? (
            <EmptyState text="No active violations for this week." />
          ) : (
            <div className={styles.list}>
              {activeViolations.map((row, index) => {
                const violationLabel = firstValue(row, [
                  'violation_category',
                  'violation_type',
                  'violation',
                  'type',
                  'category',
                  'reason_type',
                ]);
                const client = firstValue(row, [
                  'client_name',
                  'customer_name',
                  'customer',
                  'named_insured',
                  'insured_name',
                ]);
                const policy = firstValue(row, [
                  'policy_number',
                  'policy',
                  'customer_id',
                  'receipt_id',
                  'receipt',
                ]);
                const violationDate = firstValue(row, [
                  'transaction_date',
                  'date_time',
                  'date',
                  'created_at',
                ]);
                const details = firstValue(row, [
                  'details',
                  'notes',
                  'note',
                  'reason',
                  'description',
                  'comments',
                  'comment',
                  'violation_reason',
                ]);

                return (
                  <div className={styles.listItem} key={row.id || row.sync_key || index}>
                    <div>
                      <strong>{violationLabel}</strong>
                      <div className={styles.listMeta}>
                        {client !== '—' ? client : 'Customer not recorded'}
                        {policy !== '—' ? ` • ${policy}` : ''}
                        {violationDate !== '—' ? ` • ${formatDate(violationDate)}` : ''}
                      </div>
                      <div className={styles.reason}>
                        {details !== '—' ? details : 'No additional details were recorded.'}
                      </div>
                    </div>
                    <div className={styles.deduction}>− {money(firstValue(row, ['fee_amount', 'fee', 'amount']))}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Disqualified Policies</h2>
              <p>Disqualified qualifying policies reduce your Net NB count and may affect your tier.</p>
            </div>
            <div className={styles.countBadge}>{activeDisqualified.length}</div>
          </div>

          {activeDisqualified.length === 0 ? (
            <EmptyState text="No active disqualified policies for this week." />
          ) : (
            <div className={styles.list}>
              {activeDisqualified.map((row, index) => (
                <div className={styles.listItem} key={row.id || row.linked_sync_key || index}>
                  <div>
                    <strong>{firstValue(row, ['policy_number', 'policy', 'receipt_id', 'customer_name', 'named_insured'])}</strong>
                    <div className={styles.listMeta}>Linked transaction: {firstValue(row, ['linked_sync_key', 'sync_key'])}</div>
                    <div className={styles.reason}>{firstValue(row, ['note', 'notes', 'reason', 'disqualification_reason', 'description', 'comment', 'comments'])}</div>
                  </div>
                  <div className={styles.disqualifiedTag}>DISQUALIFIED</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Commission Production Log</h2>
            <p>Commission-related policy and fee activity for this week.</p>
          </div>
          <div className={styles.countBadge}>{visibleProductionRows.length}</div>
        </div>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Receipt</th>
                <th>Policy</th>
                <th>Type</th>
                <th>Company</th>
                <th>Fee</th>
                <th>Office</th>
              </tr>
            </thead>
            <tbody>
              {visibleProductionRows.length === 0 ? (
                <tr><td colSpan={8} className={styles.emptyCell}>No commission-related transaction rows found for this week.</td></tr>
              ) : paginatedProductionRows.map((row, index) => (
                <tr key={row.sync_key || row.id || index}>
                  <td>{formatDate(row.date_time)}</td>
                  <td>{row.customer || '—'}</td>
                  <td>{row.receipt_id || '—'}</td>
                  <td>{row.policy || '—'}</td>
                  <td>{row.type || '—'}</td>
                  <td>{row.company || '—'}</td>
                  <td>{money(row.fee)}</td>
                  <td>{row.office || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.paginationBar}>
          <div className={styles.paginationInfo}>
            Showing <strong>{productionRangeStart}-{productionRangeEnd}</strong> of{' '}
            <strong>{visibleProductionRows.length}</strong> records
          </div>

          <div className={styles.paginationControls}>
            <button
              type="button"
              onClick={() => setProductionPage(1)}
              disabled={productionPage === 1}
              aria-label="First page"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => setProductionPage((page) => Math.max(1, page - 1))}
              disabled={productionPage === 1}
            >
              Previous
            </button>

            <span className={styles.pageIndicator}>
              Page <strong>{productionPage}</strong> of <strong>{productionPageCount}</strong>
            </span>

            <button
              type="button"
              onClick={() =>
                setProductionPage((page) => Math.min(productionPageCount, page + 1))
              }
              disabled={productionPage === productionPageCount}
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => setProductionPage(productionPageCount)}
              disabled={productionPage === productionPageCount}
              aria-label="Last page"
            >
              »
            </button>
          </div>
        </div>
      </section>

          <section className={styles.footerNote}>
            <strong>Expected payout:</strong> {formatDate(displayResult.payoutDate)}
            {isPublished
              ? ` • Finalized by management${Number(displayResult.balanceApplied || 0) > 0 ? ` • ${money(displayResult.balanceApplied)} applied to AR / scanning` : ''}.`
              : ' • Preliminary until the commission week is published.'}
          </section>
        </div>
      )}

      {historyModalRecord && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={closeHistoryModal}
        >
          <div
            className={styles.historyModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="commission-history-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.historyModalHeader}>
              <div>
                <div className={styles.modalEyebrow}>COMMISSION WEEK</div>
                <h2 id="commission-history-modal-title">
                  {formatDate(historyModalRecord.week_start_date)} –{' '}
                  {formatDate(historyModalRecord.week_end_date)}
                </h2>
                <p>
                  Finalized commission summary for this week.
                </p>
              </div>

              <button
                type="button"
                className={styles.modalClose}
                onClick={closeHistoryModal}
                aria-label="Close commission details"
              >
                ×
              </button>
            </div>

            <div className={styles.modalHeroRow}>
              <div className={styles.modalCommissionAmount}>
                <span>Cash Commission Payable</span>
                <strong>{money(historyModalRecord.final_payable_commission)}</strong>
                <div className={styles.modalPills}>
                  <span>{historyModalRecord.tier || 'No Tier'}</span>
                  <span>{percent(historyModalRecord.commission_rate)}</span>
                  <span>{paymentStatusLabel(historyModalRecord)}</span>
                </div>
              </div>

              <div className={styles.modalMiniMetrics}>
                <SmallStat
                  label="Net NB"
                  value={Number(historyModalRecord.net_nb_count) || 0}
                />
                <SmallStat
                  label="Gross Revenue"
                  value={money(historyModalRecord.gross_revenue)}
                />
                <SmallStat
                  label="Amount Paid"
                  value={money(historyModalRecord.amount_paid)}
                  success={Number(historyModalRecord.amount_paid) > 0}
                />
                <SmallStat
                  label="Deductions"
                  value={money(historyModalRecord.total_deductions)}
                  danger={Number(historyModalRecord.total_deductions) > 0}
                />
              </div>
            </div>

            <div className={styles.modalCalculation}>
              <ModalCalcRow
                label="Gross Revenue"
                value={money(historyModalRecord.gross_revenue)}
              />
              <ModalCalcRow
                label="20% Royalty"
                value={`− ${money(historyModalRecord.royalty_deduction)}`}
                negative
              />
              <ModalCalcRow
                label="Gross Pay"
                value={`− ${money(historyModalRecord.gross_pay)}`}
                negative
              />
              <ModalCalcRow
                label="Net Revenue"
                value={money(historyModalRecord.net_revenue)}
                strong
              />
              <ModalCalcRow
                label={`Commission Rate (${historyModalRecord.tier || 'No Tier'})`}
                value={percent(historyModalRecord.commission_rate)}
              />
              <ModalCalcRow
                label="Base Commission"
                value={money(historyModalRecord.base_payout)}
              />
              <ModalCalcRow
                label="Violations / Deductions"
                value={`− ${money(historyModalRecord.total_deductions)}`}
                negative
              />
              <ModalCalcRow
                label="Commission Before AR / Scanning"
                value={money(historyModalRecord.commission_before_balance ?? ((Number(historyModalRecord.final_payable_commission) || 0) + (Number(historyModalRecord.balance_applied) || 0)))}
                strong
              />
              {Number(historyModalRecord.balance_applied || 0) > 0 && (
                <ModalCalcRow
                  label="Applied to Outstanding AR / Scanning"
                  value={`− ${money(historyModalRecord.balance_applied)}`}
                  negative
                />
              )}
              <ModalCalcRow
                label="Cash Commission Payable"
                value={money(historyModalRecord.final_payable_commission)}
                final
              />
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalSecondaryButton}
                onClick={closeHistoryModal}
              >
                Close
              </button>

              <button
                type="button"
                className={styles.modalPrimaryButton}
                onClick={viewFullHistoryWeek}
              >
                View Full Weekly Report →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalCalcRow({ label, value, negative = false, strong = false, final = false }) {
  return (
    <div
      className={`${styles.modalCalcRow} ${strong ? styles.modalCalcStrong : ''} ${
        final ? styles.modalCalcFinal : ''
      }`}
    >
      <span>{label}</span>
      <strong className={negative ? styles.negative : ''}>{value}</strong>
    </div>
  );
}

function DashboardMetric({ label, value, sub, tone = 'default' }) {
  const toneClass =
    tone === 'success'
      ? styles.dashboardMetricSuccess
      : tone === 'danger'
        ? styles.dashboardMetricDanger
        : '';

  return (
    <div className={`${styles.dashboardMetric} ${toneClass}`}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.dashboardMetricValue}>{value}</div>
      {sub && <div className={styles.metricSub}>{sub}</div>}
    </div>
  );
}

function SmallStat({ label, value, danger = false, success = false }) {
  return (
    <div className={styles.smallStat}>
      <span>{label}</span>
      <strong className={danger ? styles.balanceCharge : success ? styles.balanceCredit : ''}>
        {value}
      </strong>
    </div>
  );
}

function SimplePager({ page, pageCount, setPage }) {
  if (pageCount <= 1) return null;

  return (
    <div className={styles.simplePager}>
      <button
        type="button"
        onClick={() => setPage((current) => Math.max(1, current - 1))}
        disabled={page === 1}
      >
        Previous
      </button>
      <span>Page {page} of {pageCount}</span>
      <button
        type="button"
        onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
        disabled={page === pageCount}
      >
        Next
      </button>
    </div>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{value}</div>
      {sub && <div className={styles.metricSub}>{sub}</div>}
    </div>
  );
}

function CalcRow({ label, value, negative = false, strong = false, final = false }) {
  return (
    <div className={`${styles.calcRow} ${strong ? styles.calcStrong : ''} ${final ? styles.calcFinal : ''}`}>
      <span>{label}</span>
      <strong className={negative ? styles.negative : ''}>{value}</strong>
    </div>
  );
}

function Rule({ title, text, met }) {
  return (
    <div className={`${styles.ruleCard} ${met ? styles.ruleMet : ''}`}>
      <div className={styles.ruleTop}>
        <strong>{title}</strong>
        <span>{met ? '✓ Met' : 'Not met'}</span>
      </div>
      <p>{text}</p>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className={styles.emptyState}>{text}</div>;
}

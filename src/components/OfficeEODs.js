import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import styles from './OfficeEODs.module.css';
import ReportDetailModal from './Modals/ReportDetailModal';
import CorpSummaryView from './CorpSummaryView';

const PAGE_SIZE = 1000;

const NB_RW_ROYALTY_EFFECTIVE_DATES = {
  CA010: '2026-05-01',
  CA011: '2026-05-01',
  CA012: '2026-05-01',
  CA022: '2026-05-01',
  CA031: '2026-05-01',
  CA103: '2026-05-01',
  CA104: '2026-05-01',
  CA114: '2026-05-01',
  CA117: '2026-05-01',
  CA118: '2026-05-01',
  CA119: '2026-05-01',
  CA131: '2026-05-01',
  CA132: '2026-05-01',
  CA133: '2026-05-01',
  CA149: '2026-05-01',
  CA150: '2026-05-01',
  CA166: '2026-05-01',
  CA183: '2026-05-01',
  CA216: '2026-05-01',
  CA229: '2026-05-01',
  CA230: '2026-05-01',
  CA231: '2026-05-01',
  CA238: '2026-05-01',
  CA239: '2026-05-01',
  CA240: '2026-05-01',
  CA243: '2026-05-01',
  CA248: '2026-05-01',
  CA249: '2026-05-01',
  CA250: '2026-05-01',
  CA269: '2026-05-01',
  CA270: '2026-05-01',
  CA271: '2026-05-01',
  CA272: '2026-05-01',
  CA273: '2026-05-01',
  CA274: '2026-05-01',
  CA276: '2026-05-01',
  CA045: '2026-07-07',
  CA046: '2026-07-07',
  CA016: '2026-08-17',
  CA047: '2026-09-28',
  CA048: '2026-09-28',
  CA049: '2026-09-28',
  CA172: '2027-06-28',
  CA030: '2027-07-07',
  CA025: '2027-07-18',
  CA065: '2027-07-18',
  CA236: '2027-09-19',
  CA069: '2027-10-15',
  CA074: '2027-12-20',
  CA075: '2027-12-20',
  CA076: '2027-12-20',
  CA095: '2028-07-31',
};

const INITIAL_REGION_OFFICES = {
  'CEN-CAL': ['CA010', 'CA011', 'CA012', 'CA022', 'CA183', 'CA229', 'CA230', 'CA239'],
  'KERN COUNTY': ['CA016', 'CA047', 'CA048', 'CA049', 'CA172', 'CA240'],
  'THE VALLEY': [
    'CA025', 'CA030', 'CA045', 'CA046', 'CA065', 'CA074',
    'CA075', 'CA095', 'CA118', 'CA119', 'CA231', 'CA238',
  ],
  'BAY AREA': ['CA076', 'CA103', 'CA104', 'CA114', 'CA117', 'CA149', 'CA150', 'CA216', 'CA236', 'CA248'],
  'SOUTHERN CALI': ['CA131', 'CA132', 'CA133', 'CA166', 'CA249', 'CA250', 'CA251', 'CA252'],
};

const getInitialOfficeRegions = () => {
  const mapping = {};
  Object.entries(INITIAL_REGION_OFFICES).forEach(([region, offices]) => {
    offices.forEach((office) => {
      mapping[office] = region;
    });
  });
  return mapping;
};

const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

const getYesterdayString = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
};

const getNextDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getOfficeCode = (office = '') => {
  const match = String(office).match(/CA\d{3}/i);
  return match ? match[0].toUpperCase() : '';
};

const normalizeDateOnly = (value = '') => {
  const rawDate = String(value || '').trim().split(' ')[0];

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }

  return '';
};

const isNbRwRoyaltyActive = (office = '', reportDate = '') => {
  const officeCode = getOfficeCode(office);
  const normalizedReportDate = normalizeDateOnly(reportDate);

  if (!NB_RW_ROYALTY_EFFECTIVE_DATES[officeCode]) return true;
  if (!normalizedReportDate) return false;

  return normalizedReportDate >= NB_RW_ROYALTY_EFFECTIVE_DATES[officeCode];
};

const cleanStr = (value) => String(value ?? '').replace(/\r/g, '').trim();

const parseMoney = (value) => {
  const parsed = parseFloat(String(value || '0').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeOffice = (officeRaw = '') => {
  const match = String(officeRaw || '').match(/CA\d{3}/i);
  return match ? match[0].toUpperCase() : String(officeRaw || '').trim().toUpperCase();
};

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();

const getDateKeyFromTransfer = (row) => {
  const raw = String(row?.date_time || '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

const isVoidIndicator = (row) => {
  const haystack = `${row?.type || ''} ${row?.company || ''} ${row?.method || ''}`.toLowerCase();
  return haystack.includes('void') || haystack.includes('cancel') || haystack.includes('reversal');
};

const computeReceiptsToExclude = (rows) => {
  const totalsByReceipt = {};
  const voidReceipts = new Set();

  rows.forEach((row) => {
    const receipt = cleanStr(row.receipt_id || row.receipt || '');
    if (!receipt) return;

    totalsByReceipt[receipt] = (totalsByReceipt[receipt] || 0) + parseMoney(row.total);
    if (isVoidIndicator(row)) voidReceipts.add(receipt);
  });

  const exclude = new Set();
  Object.entries(totalsByReceipt).forEach(([receipt, total]) => {
    if (Math.abs(total) < 0.01) exclude.add(receipt);
  });
  voidReceipts.forEach((receipt) => exclude.add(receipt));

  return exclude;
};

const getTransferTxnKey = (row) => {
  if (row.sync_key) return `sync:${row.sync_key}`;

  const receipt = cleanStr(row.receipt_id || row.receipt || '');
  const customerId = cleanStr(row.customer_id || row.id || '');
  const premium = parseMoney(row.premium).toFixed(2);
  const fee = parseMoney(row.fee).toFixed(2);
  const total = parseMoney(row.total).toFixed(2);

  return `${receipt}|${customerId}|${premium}|${fee}|${total}`;
};

const buildSubmittedReceiptSet = (report) => {
  const rows = getWashedSubmittedTransactionRows(report);
  const receipts = new Set();

  rows.forEach((row) => {
    const receipt = cleanStr(row.receipt || '');
    if (receipt) receipts.add(receipt);
  });

  return receipts;
};

const buildSubmittedPolicySet = (report) => {
  const rows = getWashedSubmittedTransactionRows(report);
  const policies = new Set();

  rows.forEach((row) => {
    const policy = cleanStr(row.policy_number || '');
    if (policy) policies.add(policy);
  });

  return policies;
};

const normalizeSubmittedTransactionRows = (report) => {
  const rows = report?.raw_transactions || [];

  return rows
    .map((txn) => ({
      receipt: cleanStr(txn.Receipt || txn.receipt || txn.receipt_id || ''),
      policy_number: cleanStr(txn.Policy || txn.policy || txn.policy_number || ''),
      customer: cleanStr(txn.Customer || txn.customer || txn.customer_name || ''),
      company: cleanStr(txn.Company || txn.company || ''),
      type: cleanStr(txn.Type || txn.type || ''),
      method: cleanStr(txn.Method || txn.method || ''),
      premium: parseMoney(txn.Premium || txn.premium),
      fee: parseMoney(txn.Fee || txn.fee),
      total: parseMoney(txn.Total || txn.total),
    }))
    .filter((item) => item.receipt || item.policy_number || item.company || item.total);
};

const computeSubmittedReceiptsToExclude = (submittedRows = []) => {
  const totalsByReceipt = {};

  submittedRows.forEach((row) => {
    const receipt = cleanStr(row.receipt || '');
    if (!receipt) return;

    totalsByReceipt[receipt] = (totalsByReceipt[receipt] || 0) + parseMoney(row.total);
  });

  const exclude = new Set();

  Object.entries(totalsByReceipt).forEach(([receipt, total]) => {
    if (Math.abs(total) < 0.01) exclude.add(receipt);
  });

  return exclude;
};

const getWashedSubmittedTransactionRows = (report) => {
  const submittedRows = normalizeSubmittedTransactionRows(report);
  const receiptsToExclude = computeSubmittedReceiptsToExclude(submittedRows);

  return submittedRows.filter((row) => {
    if (row.receipt && receiptsToExclude.has(row.receipt)) return false;
    return true;
  });
};

const getExcludedSubmittedWashReceipts = (report) => {
  const submittedRows = normalizeSubmittedTransactionRows(report);
  return [...computeSubmittedReceiptsToExclude(submittedRows)];
};


const normalizeSourceTransactionRows = (rows = []) => {
  return rows
    .map((row) => ({
      receipt: cleanStr(row.receipt_id || row.receipt || ''),
      policy_number: cleanStr(row.policy_number || row.policy || ''),
      customer: cleanStr(row.customer || row.customer_name || row.named_insured || ''),
      company: cleanStr(row.company || ''),
      type: cleanStr(row.type || ''),
      method: cleanStr(row.method || ''),
      premium: parseMoney(row.premium),
      fee: parseMoney(row.fee),
      total: parseMoney(row.total),
    }))
    .filter((item) => item.receipt || item.policy_number || item.company || item.total);
};

const rowMatchesByReceiptOrPolicy = (sourceItem, submittedRows = []) => {
  return submittedRows.some((submittedItem) => {
    if (sourceItem.receipt && submittedItem.receipt && sourceItem.receipt === submittedItem.receipt) return true;
    if (sourceItem.policy_number && submittedItem.policy_number && sourceItem.policy_number === submittedItem.policy_number) return true;
    return false;
  });
};

const buildMissingSourceRows = (sourceRows = [], submittedReport) => {
  const submittedRows = normalizeSubmittedTransactionRows(submittedReport);

  return normalizeSourceTransactionRows(sourceRows).filter(
    (sourceItem) => !rowMatchesByReceiptOrPolicy(sourceItem, submittedRows)
  );
};

const buildExtraSubmittedRows = (sourceRows = [], submittedReport) => {
  const sourceItems = normalizeSourceTransactionRows(sourceRows);

  // Do not flag fully voided/wash receipts as extra submitted rows.
  // Example: receipt has +$212.85 / -$212.85 and +$10 / -$10, net $0.
  return getWashedSubmittedTransactionRows(submittedReport).filter(
    (submittedItem) => !rowMatchesByReceiptOrPolicy(submittedItem, sourceItems)
  );
};


const buildReceiptAuditGroups = (details = []) => {
  const grouped = {};

  details.forEach((item) => {
    const receiptKey = item.receipt || `NO_RECEIPT_${item.policy_number || item.company || Math.random()}`;

    if (!grouped[receiptKey]) {
      grouped[receiptKey] = {
        receipt: item.receipt || '—',
        policies: new Set(),
        rows: [],
        premium: 0,
        fees: 0,
        total: 0,
      };
    }

    if (item.policy_number) grouped[receiptKey].policies.add(item.policy_number);

    grouped[receiptKey].rows.push(item);
    grouped[receiptKey].premium += Number(item.premium || 0);
    grouped[receiptKey].fees += Number(item.fee || 0);
    grouped[receiptKey].total += Number(item.total || 0);
  });

  return Object.values(grouped).map((group) => ({
    ...group,
    policies: [...group.policies],
    premium: Number(group.premium.toFixed(2)),
    fees: Number(group.fees.toFixed(2)),
    total: Number(group.total.toFixed(2)),
  }));
};

const buildMissingSummaryTotals = (details = []) => {
  return details.reduce(
    (acc, item) => {
      acc.receipts.add(item.receipt);
      if (item.policy_number) acc.policies.add(item.policy_number);
      acc.premium += Number(item.premium || 0);
      acc.fees += Number(item.fee || 0);
      acc.total += Number(item.total || 0);
      return acc;
    },
    {
      receipts: new Set(),
      policies: new Set(),
      premium: 0,
      fees: 0,
      total: 0,
    }
  );
};

const calculateEodSummaryFromTransfers = (rows = []) => {
  const receiptsToExclude = computeReceiptsToExclude(rows);
  const seenTxn = new Set();

  const validRows = rows.filter((row) => {
    const receipt = cleanStr(row.receipt_id || row.receipt || '');
    if (receipt && receiptsToExclude.has(receipt)) return false;

    const txnKey = getTransferTxnKey(row);
    if (seenTxn.has(txnKey)) return false;

    seenTxn.add(txnKey);
    return true;
  });

  const summary = {
    nb_rw_count: 0,
    dmv_count: 0,
    cash_premium: 0,
    cash_fee: 0,
    credit_premium: 0,
    credit_fee: 0,
    nb_rw_fee: 0,
    en_fee: 0,
    reissue_fee: 0,
    renewal_fee: 0,
    pys_fee: 0,
    tax_prep_fee: 0,
    registration_fee: 0,
    convenience_fee: 0,
    dmv_premium: 0,
    trust_deposit: 0,
    dmv_deposit: 0,
    revenue_deposit: 0,
  };

  let netNbRwForMath = 0;

  validRows.forEach((row) => {
    const total = parseMoney(row.total);
    const premium = parseMoney(row.premium);
    const fee = parseMoney(row.fee);

    const type = String(row.type || '').toUpperCase();
    const company = String(row.company || '');
    const method = String(row.method || '');
    const rowText = `${type} ${company}`.toUpperCase();

    if ((type.includes('NEW') || type.includes('RWR')) && total > 0) {
      summary.nb_rw_count += 1;
    }

    if (type.includes('NEW') || type.includes('RWR')) {
      if (total > 0) netNbRwForMath += 1;
      else if (total < 0) netNbRwForMath -= 1;
    }

    if (rowText.includes('REGISTRATION FEE')) summary.dmv_count += Math.sign(total);

    if (method.includes('Cash')) {
      summary.cash_premium += premium;
      summary.cash_fee += fee;
    } else if (method.includes('Credit Card')) {
      summary.credit_premium += premium;
      summary.credit_fee += fee;
    }

    if (rowText.includes('BROKER FEE')) summary.nb_rw_fee += fee;
    if (rowText.includes('ENDORSEMENT FEE')) summary.en_fee += fee;
    if (rowText.includes('REINSTATEMENT FEE')) summary.reissue_fee += fee;
    if (rowText.includes('RENEWAL FEE')) summary.renewal_fee += fee;
    if (rowText.includes('PAYMENT FEE')) summary.pys_fee += fee;
    if (rowText.includes('REGISTRATION FEE')) summary.registration_fee += fee;

    if (rowText.includes('CONVENIENCE FEE') || company.toUpperCase().includes('CONVENIENCE FEE (CC)')) {
      summary.convenience_fee += fee;
    }

    if (
      (rowText.includes('TAX') && (rowText.includes('PREP') || rowText.includes('ESTIMATE'))) ||
      rowText.includes('DEFENDMYID') ||
      rowText.includes('MAX SHIELD')
    ) {
      if (!method.includes('Wire')) summary.tax_prep_fee += fee;
    }

    if (rowText.includes('DMV') && rowText.includes('REGISTRATION') && !rowText.includes('FEE')) {
      summary.dmv_premium += premium;
    }
  });

  const totalPremium = summary.cash_premium + summary.credit_premium;
  const totalFee = summary.cash_fee + summary.credit_fee;
  const totalCreditPayment = summary.credit_premium + summary.credit_fee;

  const firstRow = validRows[0] || rows[0] || {};
  const office = firstRow.office || '';
  const reportDate = firstRow.date_time || '';

  const nbRwCorpFee = isNbRwRoyaltyActive(office, reportDate)
    ? summary.nb_rw_fee * 0.20
    : netNbRwForMath * 20;

  const feeRoyalty = (
    summary.pys_fee +
    summary.reissue_fee +
    summary.renewal_fee +
    summary.en_fee
  ) * 0.20;

  summary.trust_deposit =
    (totalPremium + summary.convenience_fee + nbRwCorpFee + feeRoyalty) -
    (summary.dmv_premium + totalCreditPayment);

  summary.dmv_deposit = summary.dmv_premium;

  summary.revenue_deposit =
    totalFee - (summary.convenience_fee + nbRwCorpFee + feeRoyalty);

  const validReceiptCount = new Set(
  validRows
    .map((row) => cleanStr(row.receipt_id || row.receipt || ''))
    .filter(Boolean)
).size;

return {
  ...summary,
  raw_rows_count: rows.length,
  valid_rows_count: validRows.length,
  valid_receipts_count: validReceiptCount,
  excluded_receipts_count: receiptsToExclude.size,
  valid_rows: validRows,
};
};

const fetchAllRowsForRange = async ({ table, startDate, endDate, dateColumn, select = '*' }) => {
  let from = 0;
  let allRows = [];
  const nextEndDate = getNextDateKey(endDate);

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .gte(dateColumn, `${startDate} 00:00:00`)
      .lt(dateColumn, `${nextEndDate} 00:00:00`)
      .order(dateColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const rows = data || [];
    allRows = allRows.concat(rows);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
};

const getAuditStatus = ({ isMissingEod, isIncompleteEod, hasDuplicateTransferData }) => {
  if (hasDuplicateTransferData) return 'Duplicate Transfer Data';
  if (isMissingEod) return 'Missing EOD';
  if (isIncompleteEod) return 'Incomplete EOD';
  return 'Matched';
};

const getTransactionRating = (count = 0) => {
  if (count <= 2) return { label: 'Extremely Low', emoji: '🚩', color: '#dc2626' };
  if (count <= 4) return { label: 'Needs Review', emoji: '⚠️', color: '#d97706' };
  if (count <= 7) return { label: 'Typical Day', emoji: '✅', color: '#16a34a' };
  if (count <= 10) return { label: 'High Productivity', emoji: '⭐', color: '#2563eb' };

  return { label: 'Exceptional', emoji: '🔥', color: '#7c3aed' };
};

const getVolumeScore = (count = 0) => {
  if (count <= 2) return 5;
  if (count <= 4) return 15;
  if (count <= 7) return 28;
  if (count <= 10) return 36;

  return 40;
};

const getComplexityPoints = (rows = []) => {
  return rows.reduce((sum, row) => {
    const type = String(row.type || '').toUpperCase();
    const company = String(row.company || '').toUpperCase();

    if (type.includes('NEW') || type.includes('RWR')) return sum + 5;
    if (type.includes('REN')) return sum + 4;
    if (company.includes('ENDORSEMENT') || type.includes('END')) return sum + 2;
    if (company.includes('REINSTATEMENT')) return sum + 2;
    if (company.includes('DMV') || company.includes('REGISTRATION')) return sum + 2;
    if (company.includes('PAYMENT')) return sum + 1;

    return sum + 1;
  }, 0);
};

const getProductivityScore = (row) => {
  const transactionCount = Number(row.valid_receipts_count || 0);

  const volumeScore = getVolumeScore(transactionCount);

  const complexityRaw = getComplexityPoints(row.valid_rows || []);
  const complexityScore = Math.min(30, complexityRaw);

  // Simple v1 office comparison until we add historical office medians
  const officeScore = transactionCount >= 5 ? 20 : Math.round((transactionCount / 5) * 20);

  // Simple v1 consistency score
  const consistencyScore =
  transactionCount <= 2
    ? 3
    : transactionCount <= 4
    ? 6
    : 10;

  const total = Math.min(100, volumeScore + complexityScore + officeScore + consistencyScore);

  return {
    total,
    volumeScore,
    complexityScore,
    officeScore,
    consistencyScore,
    transactionCount,
    rating: getTransactionRating(transactionCount),
    needsImmediateReview: total <= 39 || transactionCount <= 2,
  };
};


const firstValue = (row, keys, fallback = '—') => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return value;
    }
  }

  return fallback;
};

const formatDateTime = (value) => {
  if (!value || value === '—') return '—';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleString();
};



const getReportAuditMeta = (report) => {
  if (!report) {
    return {
      submittedAt: '—',
      updatedAt: '—',
      editedAt: '—',
      createdByDevice: '—',
      editedByDevice: '—',
      createdIp: '—',
      editedIp: '—',
      editCount: '—',
    };
  }

  return {
    submittedAt: formatDateTime(firstValue(report, ['created_at', 'submitted_at', 'inserted_at'])),
    updatedAt: formatDateTime(firstValue(report, ['updated_at', 'modified_at'])),
    editedAt: formatDateTime(firstValue(report, ['last_edited_at', 'edited_at', 'updated_at'])),
    createdByDevice: firstValue(report, ['device_type', 'created_device_type', 'submitted_device_type', 'user_agent', 'created_user_agent']),
    editedByDevice: firstValue(report, ['edited_device_type', 'last_edited_device_type', 'updated_device_type', 'edited_user_agent', 'updated_user_agent']),
    createdIp: firstValue(report, ['ip_address', 'created_ip', 'submitted_ip']),
    editedIp: firstValue(report, ['edited_ip', 'last_edited_ip', 'updated_ip']),
    editCount: firstValue(report, ['edit_count', 'revision_count', 'version'], '0'),
  };
};

const getSubmittedExpenses = (report) => {
  if (!report) return 0;

  return parseMoney(
    report.expenses_amount ??
    report.expenses ??
    report.expense_amount ??
    report.total_expenses ??
    0
  );
};

const getSubmittedReferralPayouts = (report) => {
  if (!report) return 0;

  const directValue =
    report.referrals_paid ??
    report.referral_paid ??
    report.referrals_paid_amount ??
    report.referral_payouts ??
    report.total_referrals_paid ??
    null;

  if (directValue !== null && directValue !== undefined) return parseMoney(directValue);

  const possibleLists = [
    report.referral_list,
    report.referrals,
    report.referral_payout_list,
    report.referral_payouts_list,
  ];

  for (const list of possibleLists) {
    if (Array.isArray(list)) {
      return list.reduce((sum, item) => {
        return sum + parseMoney(item?.amount ?? item?.fee ?? item?.total ?? item);
      }, 0);
    }
  }

  return 0;
};

const getExpenseNote = (report) => {
  if (!report) return '';

  return cleanStr(
    report.expenses_explanation ??
report.expenses_note ??
report.expense_note ??
report.expense_notes ??
report.expenses_description ??
report.expense_description ??
report.notes ??
''
  );
};

const getReportField = (report, keys, fallback = null) => {
  if (!report) return fallback;

  for (const key of keys) {
    const value = report?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }

  return fallback;
};

const getSubmittedReportNotes = (report) => {
  const notes = getReportField(report, [
    'notes',
    'note',
    'manager_notes',
    'agent_notes',
    'eod_notes',
    'comments',
  ], '');

  return cleanStr(notes);
};

const getSubmittedReportReceipts = (report) => {
  const receiptList = getReportField(report, [
    'receipts',
    'receipt_urls',
    'receipt_links',
    'uploaded_receipts',
    'receipt_files',
  ], []);

  if (Array.isArray(receiptList)) return receiptList;

  if (typeof receiptList === 'string') {
    try {
      const parsed = JSON.parse(receiptList);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      return receiptList
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
};

const getDisplayReceiptUrl = (receipt) => {
  if (!receipt) return '';

  if (typeof receipt === 'string') return receipt;

  return (
    receipt.url ||
    receipt.publicUrl ||
    receipt.public_url ||
    receipt.signedUrl ||
    receipt.signed_url ||
    receipt.path ||
    receipt.file_path ||
    ''
  );
};

const getDisplayReceiptName = (receipt, index) => {
  if (!receipt) return `Receipt ${index + 1}`;

  if (typeof receipt === 'string') {
    const parts = receipt.split('/');
    return parts[parts.length - 1] || `Receipt ${index + 1}`;
  }

  return (
    receipt.name ||
    receipt.filename ||
    receipt.file_name ||
    receipt.label ||
    `Receipt ${index + 1}`
  );
};

const EodTabButton = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: '8px 10px',
      border: 0,
      borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
      background: 'transparent',
      color: active ? '#1d4ed8' : '#64748b',
      fontWeight: 800,
      cursor: 'pointer',
      fontSize: 13,
    }}
  >
    {children}
  </button>
);

const SubmittedEodTabs = ({ row, meta }) => {
  const [activeSubmittedTab, setActiveSubmittedTab] = useState('summary');

const report = row.submitted_report;
const receipts = getSubmittedReportReceipts(report);
const notes = getSubmittedReportNotes(report);

const referralPolicyCounts = {};
(report?.referrals || []).forEach((r) => {
  const policy = r.policyNumber || r.policy_number || r.policy || r.Policy;
  if (!policy) return;
  referralPolicyCounts[policy] = (referralPolicyCounts[policy] || 0) + 1;
});

const hasDuplicateReferralPolicies = Object.values(referralPolicyCounts).some((count) => count > 1);

  if (!report) {
    return (
      <div style={{ color: '#dc2626', fontWeight: 800 }}>
        No submitted EOD exists in eod_reports for this agent/office/date.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid #e2e8f0', marginBottom: 14 }}>
        <EodTabButton active={activeSubmittedTab === 'summary'} onClick={() => setActiveSubmittedTab('summary')}>Summary</EodTabButton>
        <EodTabButton active={activeSubmittedTab === 'balancing'} onClick={() => setActiveSubmittedTab('balancing')}>Balancing & Payouts</EodTabButton>
        <EodTabButton active={activeSubmittedTab === 'transactions'} onClick={() => setActiveSubmittedTab('transactions')}>Transaction Log</EodTabButton>
        <EodTabButton active={activeSubmittedTab === 'receipts'} onClick={() => setActiveSubmittedTab('receipts')}>Receipts</EodTabButton>
        <EodTabButton active={activeSubmittedTab === 'notes'} onClick={() => setActiveSubmittedTab('notes')}>Notes</EodTabButton>
      </div>

      {activeSubmittedTab === 'summary' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 12 }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>Revenue Deposit</div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{formatCurrency(row.submitted_revenue_deposit)}</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>Trust Deposit</div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{formatCurrency(row.submitted_trust_deposit)}</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>DMV Deposit</div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{formatCurrency(row.submitted_dmv_deposit)}</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>Cash Difference</div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{formatCurrency(report?.cash_difference || 0)}</div>
            </div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
            <h4 style={{ margin: '0 0 8px' }}>Submission Audit</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 12, fontSize: 13 }}>
              <div><strong>Submitted At</strong><br />{meta.submittedAt}</div>
              <div><strong>Updated At</strong><br />{meta.updatedAt}</div>
              <div><strong>Edited At</strong><br />{meta.editedAt}</div>
              <div><strong>Edit Count</strong><br />{meta.editCount}</div>
              <div><strong>Submitted Device</strong><br />{meta.createdByDevice}</div>
              <div><strong>Edited Device</strong><br />{meta.editedByDevice}</div>
              <div><strong>Submitted IP</strong><br />{meta.createdIp}</div>
              <div><strong>Edited IP</strong><br />{meta.editedIp}</div>
            </div>
          </div>
        </div>
      )}

      {activeSubmittedTab === 'balancing' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
            <h4 style={{ margin: '0 0 8px' }}>Payouts</h4>
            <div style={{ fontSize: 13 }}>
              <div>
  <strong>Expenses:</strong> {formatCurrency(row.submitted_expenses)}

  {row.expense_note && (
    <div
      style={{
        marginTop:6,
        padding:'8px',
        background:'#f8fafc',
        border:'1px solid #e2e8f0',
        borderRadius:8,
        color:'#475569'
      }}
    >
      <strong>Reason:</strong> {row.expense_note}
    </div>
  )}
</div>
              <div style={{ marginTop:12 }}>
  <strong>Referrals Paid:</strong> {formatCurrency(row.submitted_referral_payouts)}
</div>

{Array.isArray(report?.referrals) && report.referrals.length > 0 && (

<div style={{ marginTop:12 }}>

{hasDuplicateReferralPolicies && (
  <div
    style={{
      marginBottom: 10,
      padding: '10px 12px',
      background: '#fef2f2',
      border: '1px solid #fecaca',
      color: '#991b1b',
      borderRadius: 8,
      fontWeight: 900,
    }}
  >
    🚩 Duplicate referral policy number detected. Verify this was not entered twice.
  </div>
)}

<table
style={{
width:'100%',
borderCollapse:'collapse',
fontSize:12
}}>

<thead>

<tr style={{background:'#f8fafc'}}>

<th style={{padding:8}}>Policy</th>

<th style={{padding:8}}>Customer</th>

<th style={{padding:8}}>Amount</th>

<th style={{padding:8}}>Notes</th>

</tr>

</thead>

<tbody>

{report.referrals.map((r,index)=>(

<tr
  key={index}
  style={{
    background:
      referralPolicyCounts[
        r.policyNumber || r.policy_number || r.policy || r.Policy
      ] > 1
        ? '#fef2f2'
        : undefined,
  }}
>

<td style={{ padding: 8, fontWeight: 800 }}>
  {r.policyNumber || r.policy_number || r.policy || r.Policy || '-'}

  {referralPolicyCounts[
    r.policyNumber || r.policy_number || r.policy || r.Policy
  ] > 1 && (
    <div
      style={{
        marginTop: 4,
        color: '#dc2626',
        fontWeight: 900,
        fontSize: 11,
      }}
    >
      🚩 Duplicate Policy
    </div>
  )}
</td>

<td style={{padding:8}}>
  {r.clientName || r.customer_name || r.customer || r.Customer || r.name || '-'}
</td>

<td style={{padding:8}}>
  {formatCurrency(r.amount || r.fee || r.total || 0)}
</td>

<td style={{padding:8}}>
  {r.reason || r.note || r.notes || r.description || '-'}
</td>

</tr>

))}

</tbody>

</table>

</div>

)}
            </div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
            <h4 style={{ margin: '0 0 8px' }}>Cash Balancing</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 6, fontSize: 13 }}>
              <div>Expected Cash:</div>
<div>
  <strong>
    {formatCurrency(
      Number(report?.cash_premium || 0) +
      Number(report?.cash_fee || 0)
    )}
  </strong>
</div>

<div>Actual Cash:</div>
<div>
  <strong>
    {formatCurrency(report?.total_cash_in_hand || 0)}
  </strong>
</div>

<div>Difference:</div>
<div
  style={{
    fontWeight: 900,
    color:
      Math.abs(Number(report?.cash_difference || 0)) > 5
        ? '#dc2626'
        : '#111827',
  }}
>
  {formatCurrency(report?.cash_difference || 0)}
</div>
            </div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
            <h4 style={{ margin: '0 0 8px' }}>A/R Corrections</h4>
            <div style={{ fontSize: 13 }}>
              {Array.isArray(report?.ar_corrections) && report.ar_corrections.length>0 ? (

report.ar_corrections.map((item,index)=>(

<div
key={index}
style={{
padding:'8px',
marginBottom:8,
background:'#f8fafc',
border:'1px solid #e2e8f0',
borderRadius:8
}}
>

{typeof item==='string'
? item
: JSON.stringify(item,null,2)}

</div>

))

):(

'No A/R Corrections were made.'

)}
            </div>
          </div>
        </div>
      )}

      {activeSubmittedTab === 'transactions' && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
          <h4 style={{ margin: '0 0 8px' }}>Submitted Transaction Log</h4>
          {Array.isArray(report?.raw_transactions) && report.raw_transactions.length > 0 ? (
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Receipt</th>
                    <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Policy #</th>
                    <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Customer</th>
                    <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Company</th>
                    <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Type</th>
                    <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Method</th>
                    <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Premium</th>
                    <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Fee</th>
                    <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.raw_transactions.slice(0, 500).map((txn, index) => (
                    <tr key={`${txn.Receipt || txn.receipt || index}-${index}`}>
                      <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{txn.Receipt || txn.receipt || txn.receipt_id || '—'}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{txn.Policy || txn.policy || txn.policy_number || '—'}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{txn.Customer || txn.customer || txn.customer_name || '—'}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{txn.Company || txn.company || '—'}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{txn.Type || txn.type || '—'}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{txn.Method || txn.method || '—'}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{formatCurrency(txn.Premium || txn.premium)}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{formatCurrency(txn.Fee || txn.fee)}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{formatCurrency(txn.Total || txn.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: '#64748b', fontWeight: 700 }}>No raw transaction log was saved on this submitted EOD.</div>
          )}
        </div>
      )}

      {activeSubmittedTab === 'receipts' && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
          <h4 style={{ margin: '0 0 8px' }}>Receipts</h4>
          {receipts.length > 0 ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {receipts.map((receipt, index) => {
                const url = getDisplayReceiptUrl(receipt);
                const name = getDisplayReceiptName(receipt, index);

                return url ? (
                  <a key={`${name}-${index}`} href={url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 800 }}>
                    {name}
                  </a>
                ) : (
                  <div key={`${name}-${index}`} style={{ color: '#334155', fontWeight: 700 }}>{name}</div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: '#64748b', fontWeight: 700 }}>No receipt uploads were found on this EOD.</div>
          )}
        </div>
      )}

      {activeSubmittedTab === 'notes' && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
          <h4 style={{ margin: '0 0 8px' }}>Notes</h4>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: notes ? '#334155' : '#64748b', fontWeight: notes ? 700 : 600 }}>
            {notes || 'No notes were submitted.'}
          </div>
        </div>
      )}
    </div>
  );
};

const buildIncompleteReasons = (row) => {
  const reasons = [];

  if (Math.abs(row.revenue_difference || 0) > 0.01) {
    const explainedByPayouts = Math.abs((row.total_payout_adjustments || 0) - Math.abs(row.raw_revenue_difference || 0)) <= 0.01;

    if (explainedByPayouts) {
      reasons.push(`Revenue difference is explained by approved payouts/expenses: ${formatCurrency(row.total_payout_adjustments)}.`);
    } else if ((row.total_payout_adjustments || 0) > 0) {
      reasons.push(`Revenue is off by ${formatCurrency(Math.abs(row.revenue_difference))} after applying ${formatCurrency(row.total_payout_adjustments)} in expenses/referral payouts.`);
    } else {
      reasons.push(`Agent did not include ${formatCurrency(Math.abs(row.revenue_difference))} in revenue deposit.`);
    }
  }

  if (Math.abs(row.trust_difference || 0) > 0.01) {
    reasons.push(`Agent did not include ${formatCurrency(Math.abs(row.trust_difference))} in trust deposit.`);
  }

  if (Math.abs(row.dmv_difference || 0) > 0.01) {
    reasons.push(`Agent did not include ${formatCurrency(Math.abs(row.dmv_difference))} in DMV deposit.`);
  }

  if (Math.abs(row.policies_difference || 0) > 0) {
    reasons.push(`Agent submitted ${row.submitted_nb_rw_count} policies but daily_eod_transfers shows ${row.nb_rw_count}.`);
  }

  const missingDetails = row.missing_transaction_details || row.missing_receipt_details || [];
  const missingGroups = buildReceiptAuditGroups(missingDetails);
  const missingTotals = buildMissingSummaryTotals(missingDetails);

  if (missingGroups.length > 0) {
    reasons.push(
      `Agent is missing ${missingGroups.length} receipt group(s), ${missingTotals.policies.size} policy number(s), ${formatCurrency(missingTotals.premium)} in premium, and ${formatCurrency(missingTotals.fees)} in fees.`
    );

    missingGroups.slice(0, 5).forEach((group) => {
      const policyText = group.policies.length ? `Policy ${group.policies.join(', ')}` : 'No policy number';
      reasons.push(
        `Missing receipt ${group.receipt}: ${policyText}; premium ${formatCurrency(group.premium)}, fees ${formatCurrency(group.fees)}, total ${formatCurrency(group.total)}.`
      );
    });

    if (missingGroups.length > 5) {
      reasons.push(`Plus ${missingGroups.length - 5} additional missing receipt group(s).`);
    }
  } else if (row.missing_receipts?.length > 0) {
    reasons.push(`Agent is missing ${row.missing_receipts.length} receipt(s) from their submitted EOD.`);
  }

  if (row.has_duplicate_transfer_data) {
    reasons.push('Duplicate sync_key data exists for this date in daily_eod_transfers. Verify sync data before finalizing audit.');
  }

  return reasons;
};

const AuditListModal = ({ title, rows, agentProfiles, onClose, onRowClick }) => (
  <div
    onClick={onClose}
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 18,
    }}
  >
    <div
      onClick={(event) => event.stopPropagation()}
      style={{
        width: 'min(920px, 100%)',
        maxHeight: '82vh',
        overflow: 'auto',
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
      }}
    >
      <div style={{ padding: 18, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>{rows.length} record(s)</div>
        </div>
        <button onClick={onClose} style={{ border: 0, background: 'transparent', fontSize: 22, cursor: 'pointer' }}>×</button>
      </div>

      <div style={{ padding: 18 }}>
        {rows.length === 0 ? (
          <div style={{ color: '#64748b', fontWeight: 700 }}>No records found for this filter.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
                <th style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>Agent</th>
                <th style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>Office / Date</th>
                <th style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>Status</th>
                <th style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>Expected Revenue</th>
                <th style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const email = normalizeEmail(row.agent_email);
                const name = agentProfiles[email] || row.agent_email?.split('@')[0] || 'Unknown Agent';
                const reasons = buildIncompleteReasons(row);

                return (
                  <tr key={row.id} onClick={() => onRowClick(row)} style={{ cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: 10 }}>
                      <strong>{name}</strong>
                      <div style={{ color: '#64748b', fontSize: 12 }}>{row.agent_email}</div>
                    </td>
                    <td style={{ padding: 10 }}>
                      <strong>{row.office_number}</strong>
                      <div style={{ color: '#64748b', fontSize: 12 }}>{row.report_date}</div>
                    </td>
                    <td style={{ padding: 10 }}>{row.audit_status}</td>
                    <td style={{ padding: 10 }}>{formatCurrency(row.expected_revenue_after_payouts ?? row.revenue_deposit)}</td>
                    <td style={{ padding: 10, color: Math.abs(row.revenue_difference || 0) > 0.01 ? '#dc2626' : '#16a34a', fontWeight: 900 }}>
                      {row.submitted_report ? formatCurrency(row.revenue_difference) : formatCurrency(row.revenue_deposit)}
                      {reasons[0] && <div style={{ color: '#64748b', fontWeight: 600, fontSize: 11, marginTop: 3 }}>{reasons[0]}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  </div>
);

const AuditDetailModal = ({ row, agentProfiles, onClose }) => {
  const [activeTab, setActiveTab] = useState('audit');

  const meta = getReportAuditMeta(row.submitted_report);
  const reasons = buildIncompleteReasons(row);
  const missingGroups = buildReceiptAuditGroups(row.missing_transaction_details || row.missing_receipt_details || []);
  const missingTotals = buildMissingSummaryTotals(row.missing_transaction_details || row.missing_receipt_details || []);
  const missingSourceRows = row.missing_source_rows || [];
  const extraSubmittedRows = row.extra_submitted_rows || [];
  const hasDepositMismatch = Math.abs(row.revenue_difference || 0) > 0.01 || Math.abs(row.trust_difference || 0) > 0.01 || Math.abs(row.dmv_difference || 0) > 0.01;
  const email = normalizeEmail(row.agent_email);
  const name = agentProfiles[email] || row.agent_email?.split('@')[0] || 'Unknown Agent';

  const tabStyle = (tab) => ({
    padding: '10px 12px',
    border: 0,
    borderBottom: activeTab === tab ? '3px solid #2563eb' : '3px solid transparent',
    background: 'transparent',
    color: activeTab === tab ? '#1d4ed8' : '#64748b',
    fontWeight: 900,
    cursor: 'pointer',
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 18,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(1240px, 100%)',
          maxHeight: '88vh',
          overflow: 'auto',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
        }}
      >
        <div style={{ padding: 18, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{row.audit_status === 'Matched' ? 'Clean EOD Audit' : `${row.audit_status} Audit`}</h2>
            <div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>{name} • {row.agent_email} • {row.office_number} • {row.report_date}</div>
          </div>
          <button onClick={onClose} style={{ border: 0, background: 'transparent', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '0 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 6 }}>
          <button type="button" style={tabStyle('audit')} onClick={() => setActiveTab('audit')}>Audit Summary</button>
          <button type="button" style={tabStyle('missing')} onClick={() => setActiveTab('missing')}>Missing Items</button>
          <button type="button" style={tabStyle('submitted')} onClick={() => setActiveTab('submitted')}>Submitted EOD</button>
          <button type="button" style={tabStyle('source')} onClick={() => setActiveTab('source')}>Source Transactions</button>
        </div>

        <div style={{ padding: 18, display: 'grid', gap: 16 }}>
          {activeTab === 'audit' && (
            <>
              <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                <h3 style={{ marginTop: 0 }}>What is missing / wrong</h3>
                {reasons.length === 0 ? (
                  <div style={{ color: '#15803d', fontWeight: 800 }}>
                    No missing items found.
                    {row.submitted_report && (
                      <div style={{ marginTop: 8, color: '#475569', fontWeight: 700 }}>
                        Submitted: {meta.submittedAt} • Edited: {meta.editedAt}
                      </div>
                    )}
                    {row.excluded_submitted_wash_receipts?.length > 0 && (
                      <div style={{ marginTop: 8, color: '#92400e', fontWeight: 800 }}>
                        Note: {row.excluded_submitted_wash_receipts.length} submitted receipt(s) washed/voided to $0.00 and were ignored as non-accounting warnings.
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {reasons.map((reason, index) => (
                        <li key={index} style={{ marginBottom: 6, fontWeight: 700 }}>{reason}</li>
                      ))}
                    </ul>

                    {missingGroups.length > 0 && (
                      <div style={{ marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>Missing transaction summary</div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 10, marginBottom: 10 }}>
                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                            <strong>Missing Receipts</strong><br />{missingGroups.length}
                          </div>
                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                            <strong>Missing Policies</strong><br />{missingTotals.policies.size}
                          </div>
                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                            <strong>Missing Premium</strong><br />{formatCurrency(missingTotals.premium)}
                          </div>
                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                            <strong>Missing Fees</strong><br />{formatCurrency(missingTotals.fees)}
                          </div>
                        </div>

                        <div style={{ maxHeight: 220, overflow: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                <th style={{ padding: 7, borderBottom: '1px solid #e2e8f0' }}>Receipt</th>
                                <th style={{ padding: 7, borderBottom: '1px solid #e2e8f0' }}>Policy #(s)</th>
                                <th style={{ padding: 7, borderBottom: '1px solid #e2e8f0' }}>Missing Premium</th>
                                <th style={{ padding: 7, borderBottom: '1px solid #e2e8f0' }}>Missing Fees</th>
                                <th style={{ padding: 7, borderBottom: '1px solid #e2e8f0' }}>Missing Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {missingGroups.slice(0, 25).map((group, index) => (
                                <tr key={`${group.receipt}-${index}`}>
                                  <td style={{ padding: 7, borderBottom: '1px solid #e2e8f0', fontWeight: 800 }}>{group.receipt}</td>
                                  <td style={{ padding: 7, borderBottom: '1px solid #e2e8f0', fontWeight: 800 }}>{group.policies.join(', ') || '—'}</td>
                                  <td style={{ padding: 7, borderBottom: '1px solid #e2e8f0' }}>{formatCurrency(group.premium)}</td>
                                  <td style={{ padding: 7, borderBottom: '1px solid #e2e8f0' }}>{formatCurrency(group.fees)}</td>
                                  <td style={{ padding: 7, borderBottom: '1px solid #e2e8f0' }}>{formatCurrency(group.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>

              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 12 }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                  <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>Expected Revenue</div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{formatCurrency(row.expected_revenue_after_payouts ?? row.revenue_deposit)}</div>
                  <div style={{ fontSize: 12 }}>Before payouts: {formatCurrency(row.revenue_deposit)}</div>
                  <div style={{ fontSize: 12 }}>Submitted: {row.submitted_report ? formatCurrency(row.submitted_revenue_deposit) : '—'}</div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                  <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>Expected Trust</div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{formatCurrency(row.trust_deposit)}</div>
                  <div style={{ fontSize: 12 }}>Submitted: {row.submitted_report ? formatCurrency(row.submitted_trust_deposit) : '—'}</div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                  <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>Expected DMV</div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{formatCurrency(row.dmv_deposit)}</div>
                  <div style={{ fontSize: 12 }}>Submitted: {row.submitted_report ? formatCurrency(row.submitted_dmv_deposit) : '—'}</div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                  <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>Policies</div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{row.nb_rw_count}</div>
                  <div style={{ fontSize: 12 }}>Submitted: {row.submitted_report ? row.submitted_nb_rw_count : '—'}</div>
                </div>
              </section>

              <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                <h3 style={{ marginTop: 0 }}>Expenses / Payout Verification</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 12, fontSize: 13 }}>
                  <div><strong>Expenses</strong><br />{formatCurrency(row.submitted_expenses)}</div>
                  <div><strong>Referral Payouts</strong><br />{formatCurrency(row.submitted_referral_payouts)}</div>
                  <div><strong>Total Payout Adjustment</strong><br />{formatCurrency(row.total_payout_adjustments)}</div>
                  <div><strong>Revenue Difference After Payouts</strong><br />{formatCurrency(row.revenue_difference)}</div>
                </div>
                {row.expense_note && (
                  <div style={{ marginTop: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700 }}>
                    <strong>Expense note:</strong> {row.expense_note}
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === 'missing' && (
            <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>Missing Receipts / Policies</h3>
              <div style={{ marginBottom: 10, color: '#64748b', fontSize: 13, fontWeight: 800 }}>
                Missing receipts: {(row.missing_receipts || []).length} • Missing policies: {(row.missing_policies || []).length} • Source rows missing from submission: {missingSourceRows.length} • Extra submitted rows: {extraSubmittedRows.length}
              </div>
              {row.is_missing_eod && (
                <div style={{ marginBottom: 12, color: '#dc2626', fontWeight: 800 }}>
                  Agent has transfer activity but no submitted EOD in eod_reports.
                </div>
              )}

              {row.excluded_submitted_wash_receipts?.length > 0 && (
                <div style={{ marginBottom: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 10, fontWeight: 800 }}>
                  Ignored washed/voided submitted receipt(s): {row.excluded_submitted_wash_receipts.join(', ')}. These net to $0.00 and do not make the EOD incomplete.
                </div>
              )}

              {missingGroups.length === 0 && missingSourceRows.length === 0 && extraSubmittedRows.length === 0 ? (
                <div style={{ color: hasDepositMismatch ? '#c2410c' : '#15803d', fontWeight: 800 }}>
                  {hasDepositMismatch
                    ? 'No receipt/policy row is missing, but the deposit totals do not match. Review the source vs submitted rows below.'
                    : row.excluded_submitted_wash_receipts?.length > 0
                      ? 'No missing receipt/policy details found. Submitted washed/voided receipts were ignored because they net to $0.00.'
                      : 'No missing receipt/policy details found.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {missingGroups.map((group, groupIndex) => (
                    <div key={`${group.receipt}-${groupIndex}`} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ background: '#f8fafc', padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr repeat(3, 120px)', gap: 10, alignItems: 'center', fontSize: 12 }}>
                        <div><strong>Receipt:</strong> {group.receipt}</div>
                        <div><strong>Policy #(s):</strong> {group.policies.join(', ') || '—'}</div>
                        <div><strong>Premium:</strong> {formatCurrency(group.premium)}</div>
                        <div><strong>Fees:</strong> {formatCurrency(group.fees)}</div>
                        <div><strong>Total:</strong> {formatCurrency(group.total)}</div>
                      </div>

                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#fff', textAlign: 'left' }}>
                            <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Policy #</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Company</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Type</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Method</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Premium</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Fee</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((item, index) => (
                            <tr key={`${group.receipt}-${item.policy_number}-${index}`}>
                              <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0', fontWeight: 800 }}>{item.policy_number || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{item.company || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{item.type || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{item.method || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{formatCurrency(item.premium)}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{formatCurrency(item.fee)}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{formatCurrency(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                  {missingSourceRows.length > 0 && (
                    <div style={{ border: '1px solid #fecaca', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ background: '#fef2f2', padding: 10, fontWeight: 900, color: '#991b1b' }}>
                        Source rows NOT found in submitted EOD ({missingSourceRows.length})
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#fff', textAlign: 'left' }}>
                            <th style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>Receipt</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>Policy #</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>Company</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>Type</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>Method</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>Premium</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>Fee</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {missingSourceRows.map((item, index) => (
                            <tr key={`${item.receipt}-${item.policy_number}-source-${index}`}>
                              <td style={{ padding: 8, borderBottom: '1px solid #fecaca', fontWeight: 800 }}>{item.receipt || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fecaca', fontWeight: 800 }}>{item.policy_number || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>{item.company || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>{item.type || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>{item.method || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>{formatCurrency(item.premium)}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>{formatCurrency(item.fee)}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fecaca' }}>{formatCurrency(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {extraSubmittedRows.length > 0 && (
                    <div style={{ border: '1px solid #fed7aa', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ background: '#fff7ed', padding: 10, fontWeight: 900, color: '#9a3412' }}>
                        Submitted rows NOT found in source data ({extraSubmittedRows.length})
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#fff', textAlign: 'left' }}>
                            <th style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>Receipt</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>Policy #</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>Customer</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>Company</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>Type</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>Method</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>Premium</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>Fee</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {extraSubmittedRows.map((item, index) => (
                            <tr key={`${item.receipt}-${item.policy_number}-submitted-${index}`}>
                              <td style={{ padding: 8, borderBottom: '1px solid #fed7aa', fontWeight: 800 }}>{item.receipt || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fed7aa', fontWeight: 800 }}>{item.policy_number || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>{item.customer || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>{item.company || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>{item.type || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>{item.method || '—'}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>{formatCurrency(item.premium)}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>{formatCurrency(item.fee)}</td>
                              <td style={{ padding: 8, borderBottom: '1px solid #fed7aa' }}>{formatCurrency(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {activeTab === 'submitted' && (
            <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>Submitted EOD</h3>
              <SubmittedEodTabs row={row} meta={meta} />
            </section>
          )}

          {activeTab === 'source' && (
            <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>daily_eod_transfers Source Audit</h3>
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                Source rows: <b>{row.raw_rows_count}</b> • Valid rows after wash/dedupe: <b>{row.valid_rows_count}</b> • Excluded wash/void receipts: <b>{row.excluded_receipts_count}</b>
              </div>
              <div style={{ maxHeight: 420, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                      <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Receipt</th>
                      <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Policy #</th>
                      <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Company</th>
                      <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Type</th>
                      <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Method</th>
                      <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Premium</th>
                      <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Fee</th>
                      <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(row.valid_rows || []).slice(0, 300).map((sourceRow, index) => (
                      <tr key={sourceRow.sync_key || `${sourceRow.receipt_id}-${index}`}>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{sourceRow.receipt_id || '—'}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{sourceRow.policy_number || sourceRow.policy || '—'}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{sourceRow.company || '—'}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{sourceRow.type || '—'}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{sourceRow.method || '—'}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{formatCurrency(sourceRow.premium)}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{formatCurrency(sourceRow.fee)}</td>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{formatCurrency(sourceRow.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

const OfficeEODs = () => {
  const [submittedReports, setSubmittedReports] = useState([]);
  const [transferRows, setTransferRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [auditModal, setAuditModal] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [expandedAuditRowId, setExpandedAuditRowId] = useState(null);
  const [viewMode, setViewMode] = useState('regional');

  const [officeRegions, setOfficeRegions] = useState({});
  const [editingOffice, setEditingOffice] = useState(null);
  const [newRegionName, setNewRegionName] = useState('');

  const [startDate, setStartDate] = useState(getYesterdayString());
  const [endDate, setEndDate] = useState(getYesterdayString());

  const [agentProfiles, setAgentProfiles] = useState({});

  useEffect(() => {
    const savedRegions = localStorage.getItem('officeRegions');
    const initialRegions = getInitialOfficeRegions();

    if (savedRegions) {
      setOfficeRegions({ ...initialRegions, ...JSON.parse(savedRegions) });
    } else {
      setOfficeRegions(initialRegions);
    }
  }, []);

  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase.from('profiles').select('email, full_name');

      if (data) {
        const mapping = {};
        data.forEach((profile) => {
          if (profile.email) mapping[normalizeEmail(profile.email)] = profile.full_name;
        });
        setAgentProfiles(mapping);
      }
    };

    fetchProfiles();
  }, []);

  useEffect(() => {
    const fetchAuditData = async () => {
      if (!startDate || !endDate) return;

      setIsLoading(true);
      setError(null);

      try {
        const [reportsData, transfersData] = await Promise.all([
          fetchAllRowsForRange({
            table: 'eod_reports',
            startDate,
            endDate,
            dateColumn: 'report_date',
            select: '*',
          }),
          fetchAllRowsForRange({
            table: 'daily_eod_transfers',
            startDate,
            endDate,
            dateColumn: 'date_time',
            select: '*',
          }),
        ]);

        setSubmittedReports(reportsData || []);
        setTransferRows(transfersData || []);
      } catch (err) {
        console.error('Error loading EOD audit data:', err);
        setError(err?.message || 'Failed to load EOD audit data.');
        setSubmittedReports([]);
        setTransferRows([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAuditData();
  }, [startDate, endDate]);

  const duplicateTransferDataByDate = useMemo(() => {
    const byDate = {};

    transferRows.forEach((row) => {
      const dateKey = getDateKeyFromTransfer(row);
      if (!dateKey) return;
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push(row.sync_key);
    });

    return Object.fromEntries(
      Object.entries(byDate).map(([dateKey, syncKeys]) => {
        const cleanKeys = syncKeys.filter(Boolean);
        return [dateKey, cleanKeys.length !== new Set(cleanKeys).size];
      })
    );
  }, [transferRows]);

  const expectedReports = useMemo(() => {
    const groups = {};

    transferRows.forEach((row) => {
      const reportDate = getDateKeyFromTransfer(row);
      const officeNumber = normalizeOffice(row.office);
      const agentEmail = normalizeEmail(row.agent_email);

      if (!reportDate || !officeNumber || !agentEmail) return;

      const key = `${reportDate}|${officeNumber}|${agentEmail}`;

      if (!groups[key]) {
        groups[key] = {
          id: `expected-${key}`,
          report_date: reportDate,
          office_number: officeNumber,
          agent_email: agentEmail,
          rows: [],
        };
      }

      groups[key].rows.push(row);
    });

    return Object.values(groups)
      .map((group) => {
        const summary = calculateEodSummaryFromTransfers(group.rows);

        return {
          id: group.id,
          report_date: group.report_date,
          office_number: group.office_number,
          agent_email: group.agent_email,
          source: 'daily_eod_transfers',
          expected_report: true,
          has_duplicate_transfer_data: !!duplicateTransferDataByDate[group.report_date],
          ...summary,
          raw_transfer_rows: group.rows,
        };
      })
      // If every transaction washed out/voided, the agent should not be treated as
      // missing an EOD. They had raw transfer rows, but no valid EOD deposit/count
      // is expected after wash/void cleanup.
      .filter((expected) => {
        const hasValidRows = Number(expected.valid_rows_count || 0) > 0;
        const hasExpectedMoney =
          Math.abs(Number(expected.revenue_deposit || 0)) > 0.01 ||
          Math.abs(Number(expected.trust_deposit || 0)) > 0.01 ||
          Math.abs(Number(expected.dmv_deposit || 0)) > 0.01;
        const hasExpectedPolicies = Number(expected.nb_rw_count || 0) > 0;

        return hasValidRows || hasExpectedMoney || hasExpectedPolicies;
      });
  }, [transferRows, duplicateTransferDataByDate]);

  const auditRows = useMemo(() => {
    const submittedLookup = {};

    submittedReports.forEach((report) => {
      const key = `${report.report_date}|${normalizeOffice(report.office_number)}|${normalizeEmail(report.agent_email)}`;
      submittedLookup[key] = report;
    });

    return expectedReports.map((expected) => {
      const key = `${expected.report_date}|${expected.office_number}|${expected.agent_email}`;
      const submitted = submittedLookup[key] || null;

      const expectedReceiptRows = (expected.valid_rows || [])
        .map((sourceRow) => ({
          receipt: cleanStr(sourceRow.receipt_id || sourceRow.receipt || ''),
          policy_number: cleanStr(sourceRow.policy_number || sourceRow.policy || ''),
          company: cleanStr(sourceRow.company || ''),
          type: cleanStr(sourceRow.type || ''),
          method: cleanStr(sourceRow.method || ''),
          premium: parseMoney(sourceRow.premium),
          fee: parseMoney(sourceRow.fee),
          total: parseMoney(sourceRow.total),
        }))
        .filter((item) => item.receipt || item.policy_number);

     

      const submittedReceipts = buildSubmittedReceiptSet(submitted);
      const submittedPolicies = buildSubmittedPolicySet(submitted);

      const missingReceiptDetails = expectedReceiptRows.filter((item) => {
        if (item.receipt && submittedReceipts.has(item.receipt)) return false;
        if (item.policy_number && submittedPolicies.has(item.policy_number)) return false;
        return true;
      });

      const missingReceipts = missingReceiptDetails
        .map((item) => item.receipt)
        .filter(Boolean);

      const missingPolicies = missingReceiptDetails
        .map((item) => item.policy_number)
        .filter(Boolean);

      const submittedExpenses = getSubmittedExpenses(submitted);
      const submittedReferralPayouts = getSubmittedReferralPayouts(submitted);
      const totalPayoutAdjustments = submittedExpenses + submittedReferralPayouts;

      // daily_eod_transfers calculates the revenue before manual EOD payouts.
      // eod_reports revenue is after agent-entered expenses/referrals.
      // So the fair expected revenue for comparison must subtract approved payouts.
      const expectedRevenueAfterPayouts = expected.revenue_deposit - totalPayoutAdjustments;

      const rawRevenueDifference = expected.revenue_deposit - Number(submitted?.revenue_deposit || 0);
      const revenueDifference = expectedRevenueAfterPayouts - Number(submitted?.revenue_deposit || 0);
      const trustDifference = expected.trust_deposit - Number(submitted?.trust_deposit || 0);
      const dmvDifference = expected.dmv_deposit - Number(submitted?.dmv_deposit || 0);
      const policiesDifference = expected.nb_rw_count - Number(submitted?.nb_rw_count || 0);

      const hasAmountDifference =
        Math.abs(revenueDifference) > 0.01 ||
        Math.abs(trustDifference) > 0.01 ||
        Math.abs(dmvDifference) > 0.01 ||
        Math.abs(policiesDifference) > 0;

      const isMissingEod = !submitted;

      // Only true accounting problems should mark an EOD as incomplete.
      // Fully washed/voided submitted receipts and extra zero-impact rows are warnings only.
      // They should not turn a financially correct EOD into an incomplete EOD.
      const isIncompleteEod = !!submitted && (hasAmountDifference || missingReceipts.length > 0);

      const productivity = getProductivityScore(expected);

      return {
        ...expected,
        productivity,
        transaction_count: productivity.transactionCount,
        productivity_score: productivity.total,
        productivity_rating: productivity.rating,
        needs_immediate_review: productivity.needsImmediateReview,
        submitted_report: submitted,
        submitted_report_id: submitted?.id || null,
        submitted_revenue_deposit: submitted?.revenue_deposit || 0,
        submitted_trust_deposit: submitted?.trust_deposit || 0,
        submitted_dmv_deposit: submitted?.dmv_deposit || 0,
        submitted_nb_rw_count: submitted?.nb_rw_count || 0,
        submitted_expenses: submittedExpenses,
        submitted_referral_payouts: submittedReferralPayouts,
        total_payout_adjustments: totalPayoutAdjustments,
        expected_revenue_after_payouts: expectedRevenueAfterPayouts,
        raw_revenue_difference: rawRevenueDifference,
        expense_note: getExpenseNote(submitted),
        revenue_difference: revenueDifference,
        trust_difference: trustDifference,
        dmv_difference: dmvDifference,
        policies_difference: policiesDifference,
        missing_receipts: missingReceipts,
        missing_policies: missingPolicies,
        missing_receipt_details: missingReceiptDetails,
        missing_transaction_details: missingReceiptDetails,
        missing_source_rows: buildMissingSourceRows(expected.valid_rows || [], submitted),
        extra_submitted_rows: buildExtraSubmittedRows(expected.valid_rows || [], submitted),
        excluded_submitted_wash_receipts: getExcludedSubmittedWashReceipts(submitted),
        submitted_audit_meta: getReportAuditMeta(submitted),
        is_missing_eod: isMissingEod,
        is_incomplete_eod: isIncompleteEod,
        audit_status: getAuditStatus({
          isMissingEod,
          isIncompleteEod,
          hasDuplicateTransferData: expected.has_duplicate_transfer_data,
        }),
      };
    });
  }, [submittedReports, expectedReports]);

  const effectiveReports = useMemo(() => {
    return auditRows.map((row) => ({
      ...row,
      nb_rw_count: row.nb_rw_count,
      trust_deposit: row.trust_deposit,
      dmv_deposit: row.dmv_deposit,
      revenue_deposit: row.revenue_deposit,
      cash_difference: row.submitted_report?.cash_difference || 0,
    }));
  }, [auditRows]);

  const aggregatedData = useMemo(() => {
    const regionMap = {};

    effectiveReports.forEach((report) => {
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
          missing_eod_count: 0,
          incomplete_eod_count: 0,
          duplicate_transfer_count: 0,
        };
      }

      const officeGroup = regionMap[regionName].offices[officeKey];

      officeGroup.reports.push(report);
      officeGroup.total_nb_rw_count += report.nb_rw_count || 0;
      officeGroup.total_trust_deposit += report.trust_deposit || 0;
      officeGroup.total_dmv_deposit += report.dmv_deposit || 0;
      officeGroup.total_revenue_deposit += report.revenue_deposit || 0;
      officeGroup.total_cash_difference += report.cash_difference || 0;
      if (report.is_missing_eod) officeGroup.missing_eod_count += 1;
      if (report.is_incomplete_eod) officeGroup.incomplete_eod_count += 1;
      if (report.has_duplicate_transfer_data) officeGroup.duplicate_transfer_count += 1;
    });

    return Object.values(regionMap)
      .map((region) => {
        const offices = Object.values(region.offices).map((office) => {
          const corp_owes = office.total_trust_deposit < 0 ? Math.abs(office.total_trust_deposit) : 0;
          const adjusted_revenue_deposit = office.total_revenue_deposit - corp_owes;

          return { ...office, corp_owes, adjusted_revenue_deposit };
        });

        return { ...region, offices };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [effectiveReports, officeRegions]);

  const kpis = useMemo(() => {
    const allRows = auditRows;

    return allRows.reduce(
      (acc, row) => {
        const corpOwes = row.trust_deposit < 0 ? Math.abs(row.trust_deposit) : 0;

        acc.totalRevenue += row.revenue_deposit - corpOwes;
        acc.totalCorpOwes += corpOwes;
        acc.nbRwCount += row.nb_rw_count || 0;
        acc.totalCashDifference += row.cash_difference || 0;
        if (row.is_missing_eod) acc.missingEods += 1;
        if (row.is_incomplete_eod) acc.incompleteEods += 1;
        if (row.has_duplicate_transfer_data) acc.duplicateRows += 1;
        if (row.needs_immediate_review) acc.immediateReviews += 1;
        return acc;
      },
      {
        totalRevenue: 0,
        totalCorpOwes: 0,
        nbRwCount: 0,
        totalCashDifference: 0,
        missingEods: 0,
        incompleteEods: 0,
        duplicateRows: 0,
        immediateReviews: 0,
      }
    );
  }, [auditRows]);


  const missingEodRows = useMemo(() => {
    return auditRows.filter((row) => row.is_missing_eod);
  }, [auditRows]);

  const incompleteEodRows = useMemo(() => {
    return auditRows.filter((row) => row.is_incomplete_eod);
  }, [auditRows]);

  const immediateReviewRows = useMemo(() => {
    return auditRows.filter((row) => row.needs_immediate_review);
  }, [auditRows]);

  const openAuditListModal = (type) => {
    if (type === 'immediate') {
      setAuditModal({
        type: 'list',
        title: 'Agents Needing Immediate Productivity Review',
        rows: immediateReviewRows,
      });
      return;
    }
    if (type === 'missing') {
      setAuditModal({
        type: 'list',
        title: 'Agents Missing EOD Submissions',
        rows: missingEodRows,
      });
      return;
    }

    if (type === 'incomplete') {
      setAuditModal({
        type: 'list',
        title: 'Agents With Incomplete EODs',
        rows: incompleteEodRows,
      });
    }
  };

  const openAuditDetailModal = (row) => {
    setAuditModal({
      type: 'detail',
      row,
    });
  };

  const handleDayChange = (direction) => {
    const currentDate = new Date(`${startDate}T12:00:00`);
    currentDate.setDate(currentDate.getDate() + direction);
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

  const handleEditRegion = (officeNumber, currentRegion) => {
    setEditingOffice(officeNumber);
    setNewRegionName(currentRegion === 'Unassigned' ? '' : currentRegion);
  };

  const handleSaveRegion = (officeNumber) => {
    const updatedRegions = { ...officeRegions, [officeNumber]: newRegionName.trim() };

    setOfficeRegions(updatedRegions);

    const saved = JSON.parse(localStorage.getItem('officeRegions') || '{}');
    saved[officeNumber] = newRegionName.trim();
    localStorage.setItem('officeRegions', JSON.stringify(saved));

    setEditingOffice(null);
    setNewRegionName('');
  };

  const getDisplayName = (row) => {
    const email = normalizeEmail(row.agent_email);
    return agentProfiles[email] || row.agent_email?.split('@')[0] || 'Unknown Agent';
  };

  const getAuditBadgeStyle = (row) => {
    if (row.has_duplicate_transfer_data) return { background: '#fee2e2', color: '#991b1b' };
    if (row.is_missing_eod) return { background: '#fee2e2', color: '#991b1b' };
    if (row.is_incomplete_eod) return { background: '#fef3c7', color: '#92400e' };
    return { background: '#dcfce7', color: '#166534' };
  };

  return (
    <>
      <main className={styles.mainContent}>
        <div className={styles.pageHeader}>
          <h1>Office & Agent EODs</h1>
        </div>

        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Net Revenue Expected</span>
            <span className={styles.kpiValue}>{formatCurrency(kpis.totalRevenue)}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total Corp Owes</span>
            <span className={styles.kpiValue} style={{ color: '#4299e1' }}>{formatCurrency(kpis.totalCorpOwes)}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total Policies (NB/RWR)</span>
            <span className={styles.kpiValue}>{kpis.nbRwCount}</span>
          </div>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => openAuditListModal('missing')}
            style={{ textAlign: 'left', border: 'none', cursor: 'pointer' }}
            title="Click to view agents missing EOD submissions"
          >
            <span className={styles.kpiLabel}>Missing EODs</span>
            <span className={styles.kpiValue} style={{ color: kpis.missingEods > 0 ? '#e53e3e' : '#38a169' }}>
              {kpis.missingEods}
            </span>
          </button>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => openAuditListModal('incomplete')}
            style={{ textAlign: 'left', border: 'none', cursor: 'pointer' }}
            title="Click to view agents with incomplete EODs"
          >
            <span className={styles.kpiLabel}>Incomplete EODs</span>
            <span className={styles.kpiValue} style={{ color: kpis.incompleteEods > 0 ? '#d97706' : '#38a169' }}>
              {kpis.incompleteEods}
            </span>
          </button>
          <button
            type="button"
            className={styles.kpiCard}
            onClick={() => openAuditListModal('immediate')}
            style={{ textAlign: 'left', border: 'none', cursor: 'pointer' }}
            title="Click to view agents needing immediate productivity review">
            <span className={styles.kpiLabel}>Immediate Reviews</span>
            <span className={styles.kpiValue} style={{ color: kpis.immediateReviews > 0 ? '#dc2626' : '#38a169' }}>
              {kpis.immediateReviews}
            </span>
          </button>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Duplicate Transfer Data</span>
            <span className={styles.kpiValue} style={{ color: kpis.duplicateRows > 0 ? '#e53e3e' : '#38a169' }}>
              {kpis.duplicateRows}
            </span>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.filterBar}>
            <div className={styles.dateRangePickers}>
              <div className={styles.dateFilter}>
                <label htmlFor="startDate">From:</label>
                <input type="date" id="startDate" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className={styles.dateFilter}>
                <label htmlFor="endDate">To:</label>
                <input type="date" id="endDate" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <div className={styles.viewSwitcher}>
              <button type="button" onClick={() => setViewMode('regional')} className={`${styles.navBtn} ${viewMode === 'regional' ? styles.navBtnActive : ''}`}>
                Regional View
              </button>
              <button type="button" onClick={() => setViewMode('corporate')} className={`${styles.navBtn} ${viewMode === 'corporate' ? styles.navBtnActive : ''}`}>
                Corporate Summary
              </button>
            </div>

            <div className={styles.daySwitcher}>
              <button type="button" className={`${styles.navBtn} ${styles.navBtnIcon}`} onClick={() => handleDayChange(-1)}>&lt;</button>
              <span>Day</span>
              <button type="button" className={`${styles.navBtn} ${styles.navBtnIcon}`} onClick={() => handleDayChange(1)}>&gt;</button>
            </div>
          </div>

         {!isLoading && !error && (
            <div
              style={{
                marginBottom: 14,
                padding: '12px 14px',
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#334155',
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Legend</div>

              <div>
                ▶ Click office row to expand agents.
              </div>

              <div>
                ✅ Matched = submitted EOD matches transfer data.
              </div>

              <div>
                🚩 Missing EOD = agent has transfer activity but did not submit an EOD.
              </div>

              <div>
                ⚠️ Incomplete EOD = EOD was submitted, but deposits, policies, or receipts do not match transfer data.
              </div>

              <div style={{ marginTop: 6 }}>
                Productivity Score: 95–100 Elite • 85–94 Excellent • 75–84 Meets Expectations • 60–74 Needs Improvement • 40–59 Low Productivity • 0–39 Immediate Review
              </div>

              <div>
                Completed Transactions:
1–2 🚩 Extremely Low •
3–4 ⚠️ Needs Review •
5–7 ✅ Typical Day •
8–10 ⭐ High Productivity •
11+ 🔥 Exceptional
              </div>
            </div>
          )}
            {!isLoading && !error && kpis.immediateReviews > 0 && (
            <div
              onClick={() => openAuditListModal('immediate')}
              style={{
                marginBottom: 14,
                padding: '12px 14px',
                borderRadius: 10,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              🚩 {kpis.immediateReviews} agent(s) need immediate productivity review.
            </div>
          )}

          {isLoading && <p>Loading EOD audit data...</p>}
          {error && <p className={styles.errorText}>Error: {error}</p>}

          {!isLoading && !error && viewMode === 'regional' && (
            <div className={styles.tableContainer} style={{ overflowX: 'auto', width: '100%' }}>
              <table className={styles.dataTable} style={{ minWidth: 1250 }}>
                <thead>
                  <tr>
                    <th style={{ width: '20px' }}></th>
                    <th>Date / Office</th>
                    <th>Region</th>
                    <th>Policies</th>
                    <th>Trust Expected</th>
                    <th>Corp Owes</th>
                    <th>DMV Expected</th>
                    <th>Net Revenue Expected</th>
                    <th>Audit Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedData.length === 0 ? (
                    <tr>
                      <td colSpan="9">No daily_eod_transfers data found for the selected date range.</td>
                    </tr>
                  ) : (
                    aggregatedData.map((region) => (
                      <React.Fragment key={region.name}>
                        <tr className={styles.regionRow}>
                          <td colSpan="9">{region.name}</td>
                        </tr>

                        {region.offices.map((group) => {
                          const groupKey = `${group.report_date}-${group.office_number}`;
                          const auditIssueCount =
                            group.missing_eod_count +
                            group.incomplete_eod_count +
                            group.duplicate_transfer_count;

                          return (
                            <React.Fragment key={groupKey}>
                              <tr className={styles.groupRow} onClick={() => toggleGroup(groupKey)}>
                                <td>
                                  <span className={expandedGroups.has(groupKey) ? styles.expanded : ''} style={{ marginLeft: '20px' }}>
                                    ▶
                                  </span>
                                </td>
                                <td>{group.report_date} - <strong>{group.office_number}</strong></td>
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
                                      <button onClick={(e) => { e.stopPropagation(); handleSaveRegion(group.office_number); }}>Save</button>
                                      <button className={styles.cancelButton} onClick={(e) => { e.stopPropagation(); setEditingOffice(null); }}>X</button>
                                    </div>
                                  ) : (
                                    <div className={styles.regionCell}>
                                      <span>{officeRegions[group.office_number] || 'Unassigned'}</span>
                                      <button
                                        className={styles.editButton}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEditRegion(group.office_number, officeRegions[group.office_number] || 'Unassigned');
                                        }}
                                      >
                                        ✎
                                      </button>
                                    </div>
                                  )}
                                </td>
                                <td>{group.total_nb_rw_count}</td>
                                <td>{formatCurrency(Math.max(0, group.total_trust_deposit))}</td>
                                <td>{group.corp_owes > 0 ? `(${formatCurrency(group.corp_owes)})` : '$0.00'}</td>
                                <td>{formatCurrency(group.total_dmv_deposit)}</td>
                                <td>{formatCurrency(group.adjusted_revenue_deposit)}</td>
                                <td style={{ color: auditIssueCount > 0 ? '#e53e3e' : '#38a169', fontWeight: 800 }}>
                                  {auditIssueCount > 0 ? `${auditIssueCount} Issue(s)` : 'Clean'}
                                </td>
                              </tr>

                              {expandedGroups.has(groupKey) && (
                                <tr className={styles.detailRow}>
                                  <td colSpan="9">
                                    <table
  className={styles.subTable}
  style={{
    minWidth: 1600,
    tableLayout: 'auto'
  }}
>
                                      <thead>
                                        <tr>
                                          <th>Agent</th>
<th>Productivity</th>
<th>Status</th>
<th>Expected Revenue</th>
<th>Submitted Revenue</th>
                                          <th>Difference</th>
                                          <th>Trust Diff.</th>
                                          <th>DMV Diff.</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {group.reports.map((row) => {
                                          const isOpen = expandedAuditRowId === row.id;
                                          const badgeStyle = getAuditBadgeStyle(row);

                                          return (
                                            <React.Fragment key={row.id}>
                                              <tr
                                                className={row.is_missing_eod ? styles.missingEodRow : undefined}
                                                onClick={() => {
                                                  if (row.submitted_report || row.is_missing_eod || row.is_incomplete_eod || row.has_duplicate_transfer_data) {
                                                    openAuditDetailModal(row);
                                                  } else {
                                                    setExpandedAuditRowId(isOpen ? null : row.id);
                                                  }
                                                }}
                                                style={{ cursor: 'pointer' }}
                                              >
                                                <td>
  <div style={{ fontWeight: 'bold', color: '#2d3748' }}>{getDisplayName(row)}</div>
  <div style={{ fontSize: '0.75rem', color: '#718096' }}>{row.agent_email}</div>
</td>
<td>
  <div style={{ fontWeight: 900, color: row.productivity_rating?.color }}>
    <div style={{ fontWeight: 900, color: row.productivity_rating?.color }}>
  {row.transaction_count}
</div>

<div style={{ fontSize: 11 }}>
  Completed Transactions
</div>
  </div>
  <div style={{ fontSize: 12, fontWeight: 800 }}>
    {row.productivity_score}%
  </div>
  <div style={{ fontSize: 11, color: row.productivity_rating?.color, fontWeight: 800 }}>
    {row.productivity_rating?.emoji} {row.productivity_rating?.label}
  </div>
</td>
<td>
  <span style={{
    display: 'inline-block',
    padding: '2px 8px',
                                                    borderRadius: 999,
                                                    fontSize: '0.75rem',
                                                    fontWeight: 800,
                                                    ...badgeStyle,
                                                  }}>
                                                    {row.audit_status}
                                                  </span>
                                                  {row.excluded_submitted_wash_receipts?.length > 0 && (
                                                    <div style={{ fontSize: 11, color: '#92400e', fontWeight: 800, marginTop: 3 }}>
                                                      {row.excluded_submitted_wash_receipts.length} washed receipt(s)
                                                    </div>
                                                  )}
                                                </td>
                                                <td>{formatCurrency(row.expected_revenue_after_payouts ?? row.revenue_deposit)}</td>
                                                <td>{row.submitted_report ? formatCurrency(row.submitted_revenue_deposit) : '—'}</td>
                                                <td style={{ color: Math.abs(row.revenue_difference) > 0.01 ? '#e53e3e' : '#38a169', fontWeight: 800 }}>
                                                  {row.submitted_report ? formatCurrency(row.revenue_difference) : formatCurrency(row.revenue_deposit)}
                                                </td>
                                                <td>{row.submitted_report ? formatCurrency(row.trust_difference) : formatCurrency(row.trust_deposit)}</td>
                                                <td>{row.submitted_report ? formatCurrency(row.dmv_difference) : formatCurrency(row.dmv_deposit)}</td>
                                              </tr>

                                              {isOpen && (
                                                <tr>
                                                  <td colSpan="8" style={{ padding: 12, background: '#fff' }}>
                                                    <div style={{ fontSize: 12 }}>
                                                      <strong>Audit Details</strong>
                                                      <div style={{ marginTop: 6 }}>
                                                        Source rows from daily_eod_transfers: <b>{row.raw_rows_count}</b> |
                                                        Valid rows after wash/dedupe: <b>{row.valid_rows_count}</b> |
                                                        Excluded wash/void receipts: <b>{row.excluded_receipts_count}</b>
                                                      </div>

                                                      {row.has_duplicate_transfer_data && (
                                                        <div style={{ marginTop: 8, color: '#c53030', fontWeight: 800 }}>
                                                          Duplicate sync_key data was detected for this date. Verify the Google sync before trusting totals.
                                                        </div>
                                                      )}

                                                      {row.is_missing_eod && (
                                                        <div style={{ marginTop: 8, color: '#c53030', fontWeight: 800 }}>
                                                          Agent has data in daily_eod_transfers but no matching row in eod_reports.
                                                        </div>
                                                      )}

                                                      {row.missing_receipts.length > 0 && (
                                                        <div style={{ marginTop: 8 }}>
                                                          <strong>Receipts in daily_eod_transfers but missing from submitted EOD:</strong>
                                                          <ul className={styles.missingReceiptsList}>
                                                            {row.missing_receipts.slice(0, 100).map((receipt) => (
                                                              <li key={receipt} className={styles.missingReceiptItem}>{receipt}</li>
                                                            ))}
                                                          </ul>
                                                        </div>
                                                      )}

                                                      {row.submitted_report && (
                                                        <button
                                                          className={styles.viewReportBtn}
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedReport(row.submitted_report);
                                                          }}
                                                        >
                                                          View Submitted EOD Report
                                                        </button>
                                                      )}
                                                    </div>
                                                  </td>
                                                </tr>
                                              )}
                                            </React.Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && !error && viewMode === 'corporate' && (
            <CorpSummaryView reports={effectiveReports} startDate={startDate} />
          )}
        </div>
      </main>

      {auditModal?.type === 'list' && (
        <AuditListModal
          title={auditModal.title}
          rows={auditModal.rows}
          agentProfiles={agentProfiles}
          onClose={() => setAuditModal(null)}
          onRowClick={(row) => openAuditDetailModal(row)}
        />
      )}

      {auditModal?.type === 'detail' && (
        <AuditDetailModal
          row={auditModal.row}
          agentProfiles={agentProfiles}
          onClose={() => setAuditModal(null)}
        />
      )}

      {selectedReport && <ReportDetailModal report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </>
  );
};

export default OfficeEODs;

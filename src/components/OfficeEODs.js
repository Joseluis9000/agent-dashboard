import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import styles from './OfficeEODs.module.css';
import ReportDetailModal from './Modals/ReportDetailModal';
import CorpSummaryView from './CorpSummaryView';
import Papa from 'papaparse';

// --- LOCAL CALCULATION LOGIC ---

const calculateEodSummaryOG = (trans, expenses = 0, referralList = []) => {
  // 1. Wash receipts (exclude same-day voids) - WE KEEP THIS HERE FOR MATH ACCURACY
  const totalsByReceipt = trans.reduce((acc, t) => {
    const receipt = t.Receipt;
    const total = parseFloat(String(t.Total || '0').replace(/,/g, '')) || 0;
    if (!acc[receipt]) acc[receipt] = 0;
    acc[receipt] += total;
    return acc;
  }, {});

  const receiptsToExclude = new Set();
  for (const receipt in totalsByReceipt) {
    if (Math.abs(totalsByReceipt[receipt]) < 0.01) {
      receiptsToExclude.add(receipt);
    }
  }

  const filteredTrans = trans.filter((t) => !receiptsToExclude.has(t.Receipt));

  // 2. Initialize summary
  const summary = {
    nb_rw_count: 0, dmv_count: 0, cash_premium: 0, cash_fee: 0,
    credit_premium: 0, credit_fee: 0, nb_rw_fee: 0, en_fee: 0,
    reissue_fee: 0, renewal_fee: 0, pys_fee: 0, tax_prep_fee: 0,
    registration_fee: 0, convenience_fee: 0, dmv_premium: 0,
  };

  let netNbRwForMath = 0;

  // 3. Iterate transactions
  for (const t of filteredTrans) {
    const total = parseFloat(String(t.Total || '0').replace(/,/g, '')) || 0;
    const premium = parseFloat(String(t.Premium || '0').replace(/,/g, '')) || 0;
    const fee = parseFloat(String(t.Fee || '0').replace(/,/g, '')) || 0;

    const type = String(t.Type || '').toUpperCase();
    const company = String(t.Company || '');
    const method = String(t.Method || '');

    const rowText = (type + ' ' + company).toUpperCase();

    // --- COUNT LOGIC ---
    if ((type.includes('NEW') || type.includes('RWR')) && total > 0) {
      summary.nb_rw_count += 1;
    }

    if (type.includes('NEW') || type.includes('RWR')) {
      if (total > 0) netNbRwForMath += 1;
      else if (total < 0) netNbRwForMath -= 1;
    }

    // Financials
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
      if (!method.includes('Wire')) {
        summary.tax_prep_fee += fee;
      }
    }

    if (rowText.includes('DMV') && rowText.includes('REGISTRATION') && !rowText.includes('FEE')) {
      summary.dmv_premium += premium;
    }
  }

  const totalPremium = summary.cash_premium + summary.credit_premium;
  const totalFee = summary.cash_fee + summary.credit_fee;
  const totalCreditPayment = summary.credit_premium + summary.credit_fee;

  const nbRwCorpFee = netNbRwForMath * 20;
  const feeRoyalty = (summary.pys_fee + summary.reissue_fee + summary.renewal_fee + summary.en_fee) * 0.20;

  const totalReferralsPaid = (referralList || []).reduce((sum, ref) => sum + (parseFloat(ref.amount) || 0), 0);
  const expensesVal = parseFloat(expenses) || 0;

  summary.trust_deposit =
    (totalPremium + summary.convenience_fee + nbRwCorpFee + feeRoyalty) -
    (summary.dmv_premium + totalCreditPayment);

  summary.dmv_deposit = summary.dmv_premium;

  summary.revenue_deposit =
    totalFee - (summary.convenience_fee + nbRwCorpFee + feeRoyalty + expensesVal + totalReferralsPaid);

  return summary;
};

// --- INITIAL REGION DATA ---
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
  for (const region in INITIAL_REGION_OFFICES) {
    INITIAL_REGION_OFFICES[region].forEach((office) => {
      mapping[office] = region;
    });
  }
  return mapping;
};

// --- HELPERS ---
const formatCurrency = (value) => `$${parseFloat(value || 0).toFixed(2)}`;

const getYesterdayString = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
};

const normalizeName = (s = '') =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, '');

const normalizeOffice = (officeRaw = '') => {
  const m = String(officeRaw).match(/CA\d{3}/i);
  return m ? m[0].toUpperCase() : String(officeRaw || '').trim().toUpperCase();
};

const toDateKeyFromMatrix = (dtRaw = '') => {
  const s = String(dtRaw || '').trim();
  if (!s) return '';

  // ✅ FIX: Extract "YYYY-MM-DD" directly from string to prevent Timezone shifts
  // This ensures "2026-01-14 19:00" stays "2026-01-14" regardless of UTC conversion
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  // Fallback for weird formats
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toISOString().slice(0, 10);
};

const inRange = (dateKey, startDate, endDate) => {
  if (!dateKey || !startDate || !endDate) return false;
  return dateKey >= startDate && dateKey <= endDate;
};

const parseMoney = (v) => {
  const n = parseFloat(String(v || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

const isNbRwType = (t) => {
  const x = String(t || '').trim().toUpperCase();
  return x.includes('NEW') || x.includes('RWR');
};

const makeTxnKey = ({ receipt, customerId, premium, fee, total }) => {
  const r = String(receipt || '').trim();
  const c = String(customerId || '').trim();
  const p = Number(premium || 0).toFixed(2);
  const f = Number(fee || 0).toFixed(2);
  const t = Number(total || 0).toFixed(2);
  return `${r}|${c}|${p}|${f}|${t}`;
};

// NEW: clean CSV stray \r
const cleanStr = (v) => String(v ?? '').replace(/\r/g, '').trim();

// --- Name matching improvements (best-score candidate) ---
const tokenizeName = (s = '') =>
  normalizeName(String(s || '').replace(/,/g, ' '))
    .split(' ')
    .map(t => t.trim())
    .filter(Boolean);

const nameScore = (csvNorm, profileNorm) => {
  if (!csvNorm || !profileNorm) return 0;
  if (csvNorm === profileNorm) return 100;

  const a = tokenizeName(csvNorm);
  const b = tokenizeName(profileNorm);
  if (!a.length || !b.length) return 0;

  const aSet = new Set(a);
  const bSet = new Set(b);

  const overlap = [...aSet].filter(x => bSet.has(x)).length;

  const aFirst = a[0];
  const bFirst = b[0];
  const aLast = a[a.length - 1];
  const bLast = b[b.length - 1];

  const firstMatch = aFirst && bFirst && aFirst === bFirst;
  const lastMatch = aLast && bLast && aLast === bLast;

  let score = overlap * 25;
  if (lastMatch) score += 40;
  if (firstMatch) score += 20;

  score = Math.min(99, score);

  if (score === 0 && (profileNorm.includes(csvNorm) || csvNorm.includes(profileNorm))) score = 35;

  return score;
};

const getBestOfficeCandidate = ({ csvNorm, officeReports = [], emailToNameMap }) => {
  let best = null;
  const scored = [];

  for (const r of officeReports) {
    const email = String(r.agent_email || '').trim().toLowerCase();
    const profileName = emailToNameMap.get(email) || r.agent_email || '';
    const normProfile = normalizeName(profileName || '');
    const score = nameScore(csvNorm, normProfile);

    const item = { score, email, name: profileName, report: r };
    scored.push(item);
    if (!best || score > best.score) best = item;
  }

  scored.sort((a, b) => b.score - a.score);
  return { best, scored };
};

// --- Receipt overlap helpers for mapping modal ---
const buildAgentReceiptSetFromRaw = (raw = []) => {
  const s = new Set();
  raw.forEach((t) => {
    const r = cleanStr(t?.Receipt || '');
    if (r) s.add(r);
  });
  return s;
};

const calcReceiptOverlap = (matrixReceipts = [], agentRawTxns = []) => {
  const agentSet = buildAgentReceiptSetFromRaw(agentRawTxns);
  const matched = [];
  const unmatched = [];

  (matrixReceipts || []).forEach((r) => {
    if (agentSet.has(r)) matched.push(r);
    else unmatched.push(r);
  });

  return { matched, unmatched, matchedCount: matched.length, total: (matrixReceipts || []).length };
};

// Keep helper logic for local use if needed, though now mainly used inside calculateEodSummaryOG
const isVoidIndicator = (row) => {
  const hay = `${row?.type || ''} ${row?.company || ''} ${row?.method || ''}`.toLowerCase();
  return hay.includes('void') || hay.includes('cancel') || hay.includes('reversal');
};

const computeReceiptsToExclude = (rows) => {
  const totalsByReceipt = {};
  const voidReceipts = new Set();

  for (const r of rows) {
    const receipt = String(r.receipt || '').trim();
    if (!receipt) continue;

    totalsByReceipt[receipt] = (totalsByReceipt[receipt] || 0) + (Number(r.total) || 0);
    if (isVoidIndicator(r)) voidReceipts.add(receipt);
  }

  const exclude = new Set();
  for (const receipt in totalsByReceipt) {
    if (Math.abs(totalsByReceipt[receipt]) < 0.01) exclude.add(receipt);
  }
  voidReceipts.forEach((receipt) => exclude.add(receipt));

  return { exclude, totalsByReceipt };
};

// NEW: fetch all rows for a given import
const fetchAllByImportId = async (importId) => {
  const PAGE_SIZE = 1000;
  let all = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('matrix_eod_transactions_raw')
      .select('*')
      .eq('source_import_id', importId)
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
};

const OfficeEODs = () => {
  const fileInputRef = useRef(null);

  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [viewMode, setViewMode] = useState('regional');

  const [officeRegions, setOfficeRegions] = useState({});
  const [editingOffice, setEditingOffice] = useState(null);
  const [newRegionName, setNewRegionName] = useState('');

  const [startDate, setStartDate] = useState(getYesterdayString());
  const [endDate, setEndDate] = useState(getYesterdayString());

  // Matrix CSV overlay state
  const [matrixOverlayReports, setMatrixOverlayReports] = useState([]);
  const [matrixMissingCount, setMatrixMissingCount] = useState(0);
  const [matrixUploadedName, setMatrixUploadedName] = useState('');

  const [reportDiscrepancies, setReportDiscrepancies] = useState({});
  const [knownEmails, setKnownEmails] = useState(new Set());
  const [agentProfiles, setAgentProfiles] = useState({});

  // store & status
  const [matrixStoreStatus, setMatrixStoreStatus] = useState(null);
  const [isStoringMatrix, setIsStoringMatrix] = useState(false);

  // Toggles for Debug Views
  const [showExcludedDebug, setShowExcludedDebug] = useState(false);
  const [showValidRowsDebug, setShowValidRowsDebug] = useState(false);

  const [expandedMissingRowId, setExpandedMissingRowId] = useState(null);

  // NEW: Map Name Modal state
  const [mapModal, setMapModal] = useState({
    open: false,
    rowId: null,
    csvName: '',
    csvNorm: '',
    suggestedEmail: '',
    candidates: [],
    receipts: [],
    csvTransactions: [], // ✅ NEW: store raw transactions to show in modal
  });
  const [mapSelectedEmail, setMapSelectedEmail] = useState('');
  const [mapSaving, setMapSaving] = useState(false);
  const [mapError, setMapError] = useState('');

  const closeMapModal = () => {
    setMapModal({ 
      open: false, 
      rowId: null, 
      csvName: '', 
      csvNorm: '', 
      suggestedEmail: '', 
      candidates: [], 
      receipts: [],
      csvTransactions: [], // ✅ Reset
    });
    setMapSelectedEmail('');
    setMapSaving(false);
    setMapError('');
  };

  const openMapNameModal = ({ rowId, csvName, csvNorm, suggestedEmail, candidates, receipts, csvTransactions }) => {
    setMapError('');
    const nextEmail =
      (suggestedEmail || '').trim().toLowerCase() ||
      (candidates?.[0]?.email || '').trim().toLowerCase() ||
      '';
    setMapSelectedEmail(nextEmail);
    setMapModal({
      open: true,
      rowId,
      csvName: csvName || '',
      csvNorm: csvNorm || '',
      suggestedEmail: suggestedEmail || '',
      candidates: candidates || [],
      receipts: receipts || [],
      csvTransactions: csvTransactions || [], // ✅ Load into modal
    });
  };

  // ✅ UPDATED: Uses UPSERT to allow overwriting existing mappings
  const saveNameMapping = async () => {
    if (!mapModal.csvName || !mapSelectedEmail) {
      setMapError('Please choose an email.');
      return;
    }

    setMapSaving(true);
    setMapError('');

    try {
      const payload = {
        csv_name: mapModal.csvName.trim(),
        agent_email: mapSelectedEmail.trim().toLowerCase(),
      };

      // CHANGE 1: Use .upsert() instead of .insert()
      // 'onConflict' tells Supabase which column to check for duplicates (csv_name)
      const { error } = await supabase
        .from('name_mappings')
        .upsert(payload, { onConflict: 'csv_name' });

      if (error) {
        throw error;
      }

      // Update overlay row immediately (clears badge)
      setMatrixOverlayReports((prev) =>
        prev.map((r) => {
          if (r.id !== mapModal.rowId) return r;
          return {
            ...r,
            is_unmapped_name: false,
            agent_email: payload.agent_email,
            collision_report_name: null,
          };
        })
      );

      closeMapModal();
    } catch (e) {
      console.error(e);
      // CHANGE 2: Simplified error message since duplicates are now handled
      setMapError(e?.message || 'Failed to save mapping.');
    } finally {
      setMapSaving(false);
    }
  };

  // Load regions
  useEffect(() => {
    const savedRegions = localStorage.getItem('officeRegions');
    const initialRegions = getInitialOfficeRegions();
    if (savedRegions) setOfficeRegions({ ...initialRegions, ...JSON.parse(savedRegions) });
    else setOfficeRegions(initialRegions);
  }, []);

  // Fetch Agent Profiles
  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase.from('profiles').select('email, full_name');
      if (data) {
        const mapping = {};
        data.forEach(p => {
          if (p.email) mapping[p.email.toLowerCase()] = p.full_name;
        });
        setAgentProfiles(mapping);
      }
    };
    fetchProfiles();
  }, []);

  // Fetch Reports (IMPORTANT: include raw_transactions so discrepancy & receipt overlap logic works)
  useEffect(() => {
    const fetchReports = async () => {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('eod_reports')
        .select('*') // keep * if raw_transactions is in it; if not, change to '*, raw_transactions'
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

  // Filter CSV Overlay (keep your existing behavior)
  useEffect(() => {
    if (!matrixOverlayReports.length) return;
    const filtered = matrixOverlayReports.filter((r) => inRange(r.report_date, startDate, endDate));
    const missing = filtered.filter((r) => r.is_missing_eod).length;
    setMatrixOverlayReports(filtered);
    setMatrixMissingCount(missing);
  }, [startDate, endDate]);

  const effectiveReports = useMemo(() => {
    if (!matrixOverlayReports.length) return reports;
    return [...reports, ...matrixOverlayReports];
  }, [reports, matrixOverlayReports]);

  const aggregatedData = useMemo(() => {
    const regionMap = {};

    effectiveReports.forEach((report) => {
      const regionName = officeRegions[report.office_number] || 'Unassigned';
      if (!regionMap[regionName]) regionMap[regionName] = { name: regionName, offices: {} };

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
          const corp_owes = office.total_trust_deposit < 0 ? Math.abs(office.total_trust_deposit) : 0;
          const adjusted_revenue_deposit = office.total_revenue_deposit - corp_owes;
          return { ...office, corp_owes, adjusted_revenue_deposit };
        });
        return { ...region, offices };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [effectiveReports, officeRegions]);

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
    const saved = JSON.parse(localStorage.getItem('officeRegions') || '{}');
    saved[officeNumber] = newRegionName.trim();
    localStorage.setItem('officeRegions', JSON.stringify(saved));
    setEditingOffice(null);
    setNewRegionName('');
  };

  // ✅ RAW STORE: insert into matrix_eod_transactions_raw (no upsert)
  const storeMatrixTransactionsRaw = async ({ rawRows }) => {
    setIsStoringMatrix(true);
    setMatrixStoreStatus(null);
    try {
      const CHUNK_SIZE = 1000;
      let insertedTotal = 0;
      let errorTotal = 0;

      for (let i = 0; i < rawRows.length; i += CHUNK_SIZE) {
        const chunk = rawRows.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
          .from('matrix_eod_transactions_raw')
          .insert(chunk)
          .select('id');

        if (error) {
          console.error('RAW Matrix store chunk error:', error);
          errorTotal += chunk.length;
        } else {
          insertedTotal += (data || []).length;
        }
      }

      return { inserted: insertedTotal, errors: errorTotal };
    } finally {
      setIsStoringMatrix(false);
    }
  };

  const handleUploadMatrixCSV = async (file) => {
    if (!file) return;
    setMatrixUploadedName(file.name);
    setReportDiscrepancies({});

    // 1. Build lookup for Existing Reports
    const officeSubmissionLookup = {};
    (reports || []).forEach(r => {
      const key = `${r.report_date}|${r.office_number}`;
      if (!officeSubmissionLookup[key]) officeSubmissionLookup[key] = [];
      officeSubmissionLookup[key].push(r);
    });

    const emailSubmissionLookup = {};
    (reports || []).forEach(r => {
      const email = String(r.agent_email || '').trim().toLowerCase();
      const key = `${r.report_date}|${r.office_number}|${email}`;
      emailSubmissionLookup[key] = r;
    });

    // 2. Fetch Profiles & Name Mappings
    let profiles = [];
    let nameMappings = [];
    try {
      const { data: profileData } = await supabase.from('profiles').select('email, full_name');
      profiles = profileData || [];

      const { data: mapData } = await supabase.from('name_mappings').select('csv_name, agent_email');
      nameMappings = mapData || [];
    } catch {
      profiles = [];
      nameMappings = [];
    }

    const fullNameToEmail = new Map();
    const emailToNameMap = new Map();
    const knownEmailsSet = new Set();

    // A. Standard Profiles
    profiles.forEach((p) => {
      const full = normalizeName(p.full_name || '');
      const email = String(p.email || '').trim().toLowerCase();
      if (full && email) fullNameToEmail.set(full, email);
      if (email) {
        emailToNameMap.set(email, p.full_name);
        knownEmailsSet.add(email);
      }
    });

    // B. Custom Mappings
    nameMappings.forEach((m) => {
      const csvName = normalizeName(m.csv_name || '');
      const email = String(m.agent_email || '').trim().toLowerCase();
      if (csvName && email) fullNameToEmail.set(csvName, email);
      if (email) knownEmailsSet.add(email);
    });

    setKnownEmails(knownEmailsSet);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data || [];

        // ✅ A) Build RAW payload from exact Matrix headers (NO filter/dedupe/wash)
        const importId = crypto?.randomUUID?.() ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

        const rawPayload = rows.map((r, idx) => {
          const receipt = cleanStr(r['Receipt']);
          const customerId = cleanStr(r['ID']);
          const customerName = cleanStr(r['Customer']);
          const customerType = cleanStr(r['Customer Type']);
          const dateTimeRaw = cleanStr(r['Date / Time']);
          const csrRaw = cleanStr(r['CSR']);
          const officeRaw = cleanStr(r['Office']);
          const type = cleanStr(r['Type']);
          const company = cleanStr(r['Company']);
          const policyNumber = cleanStr(r['Policy']);
          const financed = cleanStr(r['Financed']);
          const referenceNumber = cleanStr(r['Reference']);
          const method = cleanStr(r['Method']);

          const premium = parseMoney(r['Premium']);
          const fee = parseMoney(r['Fee']);
          const total = parseMoney(r['Total']);

          const office = normalizeOffice(officeRaw);
          const dateKey = toDateKeyFromMatrix(dateTimeRaw); // can be ''
          const csrNorm = normalizeName(csrRaw);

          const txnKey = makeTxnKey({ receipt, customerId, premium, fee, total });

          // ✅ unique per CSV row (NO DB dedupe)
          const fingerprint = `${file.name}|${importId}|row:${idx}`;

          return {
            source_file_name: file.name,
            source_import_id: importId,
            source_row_index: idx,

            receipt: receipt || null,
            customer_id: customerId || null,
            customer_name: customerName || null,
            customer_type: customerType || null,
            occurred_at_raw: dateTimeRaw || null,

            csr_name: csrRaw || null,
            csr_norm: csrNorm || null,

            office_number: office || null,
            report_date: dateKey || null,

            type: type || null,
            company: company || null,
            policy_number: policyNumber || null,
            financed: financed || null,
            reference_number: referenceNumber || null,
            method: method || null,

            premium: Number(premium || 0),
            fee: Number(fee || 0),
            total: Number(total || 0),

            txn_key: txnKey || null,
            fingerprint,
          };
        });

        // ✅ B) Store raw payload
        let storeResult = { inserted: 0, errors: 0 };
        try {
          storeResult = await storeMatrixTransactionsRaw({ rawRows: rawPayload });
        } catch (e) {
          console.error('Matrix RAW store failed:', e);
        }

        // ✅ C) Read back from DB (authoritative)
        let dbRows = [];
        try {
          dbRows = await fetchAllByImportId(importId);
        } catch (e) {
          console.error('fetchAllByImportId failed:', e);
        }

        const fromDb = (dbRows || []).map((t) => ({
          receipt: cleanStr(t.receipt),
          csrRaw: cleanStr(t.csr_name),
          csrNorm: normalizeName(cleanStr(t.csr_norm || t.csr_name)),
          office: normalizeOffice(t.office_number || ''),
          dateTimeRaw: cleanStr(t.occurred_at_raw),
          dateKey: t.report_date ? String(t.report_date) : '',
          customerId: cleanStr(t.customer_id),
          customerName: cleanStr(t.customer_name),
          policyNumber: cleanStr(t.policy_number),
          customerType: cleanStr(t.customer_type),
          financed: cleanStr(t.financed),
          referenceNumber: cleanStr(t.reference_number),
          type: cleanStr(t.type),
          company: cleanStr(t.company),
          method: cleanStr(t.method),
          premium: Number(t.premium || 0),
          fee: Number(t.fee || 0),
          total: Number(t.total || 0),
          txnKey: cleanStr(t.txn_key),
          fingerprint: cleanStr(t.fingerprint),
        }));

        // ✅ D) NOW filter/wash/dedupe for UI overlay + comparison
        const filtered = fromDb
          .filter((x) => x.csrRaw && x.office && x.dateKey)
          .filter((x) => inRange(x.dateKey, startDate, endDate));

        const { exclude: receiptsToExclude, totalsByReceipt } = computeReceiptsToExclude(filtered);
        const excludedRowsData = filtered.filter((t) => t.receipt && receiptsToExclude.has(t.receipt));

        const seenTxn = new Set();
        const deduped = [];
        for (const t of filtered) {
          const k = t.txnKey || `${t.receipt}|${t.customerId}|${t.total}`;
          if (seenTxn.has(k)) continue;
          seenTxn.add(k);
          deduped.push(t);
        }

        // ✅ FIX: only use t.receipt
        const dedupedAndFiltered = deduped.filter((t) => !receiptsToExclude.has(t.receipt));

        setMatrixStoreStatus({
          inserted: storeResult.inserted,
          errors: storeResult.errors,
          excludedWashReceipts: receiptsToExclude.size,
          normalizedRows: rawPayload.length,
          rowsAfterWash: dedupedAndFiltered.length,
          rowsAfterCsvDedupe: deduped.length,
          excludedRowsData,
          validRowsData: dedupedAndFiltered,
        });

        // 6. Group by Agent using the FILTERED list (so math stays correct in UI)
        const grouped = new Map();
        const newDiscrepancies = {};

        for (const t of dedupedAndFiltered) {
          const key = `${t.dateKey}|${t.office}|${t.csrNorm}`;
          if (!grouped.has(key)) {
            grouped.set(key, {
              report_date: t.dateKey,
              office_number: t.office,
              csrRaw: t.csrRaw,
              csrNorm: t.csrNorm,
              _txns: [],
              _policyKeys: new Set(),
              nb_rw_count: 0,
              revenue_deposit: 0,
              trust_deposit: 0,
              dmv_deposit: 0,
              _debug: { rowsUsed: 0, receiptsExcluded: [], receiptTotals: {}, sampleKeys: [], sampleTransactions: [] },
              _bestCandidate: null,
              _candidates: [],
            });
          }
          const g = grouped.get(key);

          if (isNbRwType(t.type) && Number(t.premium) > 0) {
            const uniqueRef = t.receipt || t.policyNumber || t.customerName || Math.random();
            const policyKey = `${uniqueRef}|${String(t.customerId || '').trim()}`;
            g._policyKeys.add(policyKey);
          }

          g._txns.push(t);
          g._debug.rowsUsed += 1;
          if (g._debug.sampleKeys.length < 10) g._debug.sampleKeys.push(t.fingerprint);
          if (g._debug.sampleTransactions.length < 25) g._debug.sampleTransactions.push(t);
        }

        const overlay = [];
        let missingCount = 0;
        const excludedList = Array.from(receiptsToExclude).slice(0, 50);

        for (const g of grouped.values()) {
          const ogTxns = (g._txns || []).map((t) => ({
            Receipt: t.receipt, ID: t.customerId, Customer: t.customerName, 'Customer Type': '', 'Date / Time': t.dateTimeRaw,
            CSR: t.csrRaw, Office: t.office, Type: t.type, Company: t.company, Policy: t.policyNumber, Financed: '',
            'Reference #': '', Method: t.method, Premium: String(t.premium ?? 0), Fee: String(t.fee ?? 0), Total: String(t.total ?? 0),
          }));

          const summary = calculateEodSummaryOG(ogTxns, 0, []);

          g.nb_rw_count = summary.nb_rw_count;
          g.trust_deposit = Number(summary?.trust_deposit || 0);
          g.dmv_deposit = Number(summary?.dmv_deposit || 0);
          g.revenue_deposit = Number(summary?.revenue_deposit || 0);
          delete g._policyKeys;

          // NEW: unique receipts in question for this CSR group (for modal)
          const groupReceipts = Array.from(
            new Set((g._txns || []).map(t => cleanStr(t.receipt)).filter(Boolean))
          );

          const mappedEmail = fullNameToEmail.get(g.csrNorm) || '';
          let isUnmappedName = !mappedEmail;
          let collisionReportName = null;

          // A. Try Email Lookup (Exact)
          const emailKey = `${g.report_date}|${g.office_number}|${mappedEmail}`;
          let existingReport = emailSubmissionLookup[emailKey];

          // B. Try Office Fallback (BEST-SCORE candidate, not “first report”)
          if (!existingReport) {
            const officeKey = `${g.report_date}|${g.office_number}`;
            const officeReports = officeSubmissionLookup[officeKey] || [];

            if (officeReports.length > 0) {
              const { best, scored } = getBestOfficeCandidate({
                csvNorm: g.csrNorm,
                officeReports,
                emailToNameMap,
              });

              // Strong match? auto-link
              if (best && best.score >= 60) {
                existingReport = best.report;
                isUnmappedName = false;
              } else if (best && best.score > 0) {
                collisionReportName = `${best.name} (${best.score})`;
                g._bestCandidate = best;
                g._candidates = scored.slice(0, 8);
              } else {
                const topNames = officeReports
                  .slice(0, 3)
                  .map(rr => {
                    const em = String(rr.agent_email || '').trim().toLowerCase();
                    return emailToNameMap.get(em) || rr.agent_email;
                  })
                  .join(', ');
                collisionReportName = topNames || 'Unknown';
                g._candidates = officeReports.slice(0, 8).map(rr => ({
                  score: 0,
                  email: String(rr.agent_email || '').trim().toLowerCase(),
                  name: emailToNameMap.get(String(rr.agent_email || '').trim().toLowerCase()) || rr.agent_email,
                  report: rr,
                }));
              }
            }
          }

          // ✅ 7. Check for Discrepancies if Linked
          if (existingReport) {
            const agentRaw = existingReport.raw_transactions || [];

            const agentReceipts = new Set();
            const agentPolicies = new Set();
            const agentCustomers = new Set();

            agentRaw.forEach(t => {
              const r = cleanStr(t.Receipt || '');
              if (r) agentReceipts.add(r);

              const p = cleanStr(t.Policy || '');
              if (p) agentPolicies.add(p);

              const c = cleanStr(t.Customer || '').toLowerCase();
              const prem = parseFloat(cleanStr(t.Premium || '0').replace(/,/g, '')).toFixed(2);
              if (c) agentCustomers.add(`${c}|${prem}`);
            });

            const missingReceipts = [];
            g._txns.forEach(t => {
              const matReceipt = cleanStr(t.receipt || '');
              const matPolicy = cleanStr(t.policyNumber || '');
              const matCust = cleanStr(t.customerName || '').toLowerCase();
              const matPrem = Number(t.premium || 0).toFixed(2);
              const matCustKey = `${matCust}|${matPrem}`;

              if (matReceipt && agentReceipts.has(matReceipt)) return;
              if (matPolicy && agentPolicies.has(matPolicy)) return;
              if (matCust && agentCustomers.has(matCustKey)) return;

              missingReceipts.push(matReceipt || `(No Receipt - ${t.customerName})`);
            });

            if (missingReceipts.length > 0) {
              newDiscrepancies[existingReport.id] = missingReceipts;
            }
            continue;
          }

          // ✅ 8. Missing -> Create New Row
          missingCount += 1;

          const agentDisplay = isUnmappedName ? g.csrRaw : (mappedEmail || `missing:${g.csrRaw}`);

          const debugReceiptTotals = {};
          Object.keys(totalsByReceipt).slice(0, 100).forEach((receipt) => { debugReceiptTotals[receipt] = totalsByReceipt[receipt]; });

          overlay.push({
            id: `matrix-${g.report_date}-${g.office_number}-${g.csrNorm}`,
            report_date: g.report_date,
            office_number: g.office_number,
            agent_email: agentDisplay,
            nb_rw_count: g.nb_rw_count,
            trust_deposit: g.trust_deposit,
            dmv_deposit: g.dmv_deposit,
            revenue_deposit: g.revenue_deposit,
            cash_difference: 0,
            is_missing_eod: true,
            is_unmapped_name: isUnmappedName,
            collision_report_name: collisionReportName,
            source: 'matrix_csv',
            csr_name: g.csrRaw,
            csr_norm: g.csrNorm,

            // NEW: for Map Name button + receipt evidence
            _group_receipts: groupReceipts,
            _match_candidates: g._candidates || [],
            _suggested_email: g._bestCandidate?.email || '',

            // ✅ SAVE RAW TXNS FOR MODAL (before delete)
            _raw_csv_rows: g._txns || [],

            _debug: { ...g._debug, receiptsExcluded: excludedList, receiptTotals: debugReceiptTotals },
          });
          delete g._txns;
        }

        setMatrixOverlayReports(overlay);
        setMatrixMissingCount(missingCount);
        setReportDiscrepancies(newDiscrepancies);
      },
      error: (err) => {
        console.error(err);
        alert('Failed to parse Matrix EOD CSV. Make sure it is the End_Of_Day_Detail export.');
      },
    });
  };

  const clearMatrixOverlay = () => {
    setMatrixOverlayReports([]);
    setMatrixMissingCount(0);
    setMatrixUploadedName('');
    setExpandedMissingRowId(null);
    setMatrixStoreStatus(null);
    setReportDiscrepancies({});
    closeMapModal();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <main className={styles.mainContent}>
        <div className={styles.pageHeader}>
          <h1>Office & Agent EODs</h1>
        </div>

        {/* Map Name Modal (with receipts + overlap evidence) */}
        {mapModal.open && (
          <div
            onClick={closeMapModal}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(640px, 100%)',
                background: '#fff',
                borderRadius: 10,
                padding: 16,
                boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong>Map CSV Name → Agent Email</strong>
                <button
                  type="button"
                  onClick={closeMapModal}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18 }}
                >
                  ✕
                </button>
              </div>

              <div style={{ fontSize: 13, marginBottom: 15 }}>
                <div><b>CSV Name:</b> {mapModal.csvName || '—'}</div>
                
                {/* --- ✅ NEW: CSV CONTEXT TABLE --- */}
                <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: '#F7FAFC', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#4A5568', borderBottom: '1px solid #E2E8F0' }}>
                        RAW CSV TRANSACTIONS (Who is this?)
                    </div>
                    <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead style={{ background: '#fff', position: 'sticky', top: 0 }}>
                                <tr style={{ textAlign: 'left', color: '#718096' }}>
                                    <th style={{ padding: '4px 8px' }}>Date</th>
                                    <th style={{ padding: '4px 8px' }}>Customer</th>
                                    <th style={{ padding: '4px 8px' }}>Policy</th>
                                    <th style={{ padding: '4px 8px' }}>Total</th>
                                    <th style={{ padding: '4px 8px' }}>Rcpt</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(mapModal.csvTransactions || []).map((t, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #EDF2F7' }}>
                                        <td style={{ padding: '4px 8px' }}>{t.dateKey}</td>
                                        <td style={{ padding: '4px 8px', fontWeight: 600 }}>{t.customerName}</td>
                                        <td style={{ padding: '4px 8px' }}>{t.policyNumber}</td>
                                        <td style={{ padding: '4px 8px' }}>${Number(t.total).toFixed(2)}</td>
                                        <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{t.receipt}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                {/* ------------------------------------ */}

                <div style={{ opacity: 0.7, marginTop: 8 }}>
                  These are the receipts coming from the Matrix CSV for this name/office/day. Pick the agent whose EOD contains the most of these receipts.
                </div>
              </div>

              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                Choose email to map (shows matched receipts):
              </label>

              <select
                value={mapSelectedEmail}
                onChange={(e) => setMapSelectedEmail(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #CBD5E0' }}
              >
                <option value="">— Select —</option>

                {/* Group 1: The candidates the system found (Active in this office today) */}
                <optgroup label="Suggested (Active in Office)">
                  {(mapModal.candidates || []).map((c) => {
                    const mc = c?.overlap?.matchedCount ?? 0;
                    const tot = c?.overlap?.total ?? (mapModal.receipts?.length || 0);
                    return (
                      <option key={c.email} value={c.email}>
                        {c.name} — {c.email} (Match: {mc}/{tot})
                      </option>
                    );
                  })}
                </optgroup>

                {/* Group 2: Everyone else (The Fix) */}
                <optgroup label="All Other Agents">
                  {Object.entries(agentProfiles || {})
                    // Filter out people already shown in the top group
                    .filter(([email]) => !(mapModal.candidates || []).some(c => c.email === email))
                    // Sort alphabetically
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([email, name]) => (
                      <option key={email} value={email}>
                        {name} — {email}
                      </option>
                    ))}
                </optgroup>
              </select>

              {/* Evidence: receipts matched/unmatched for selected agent */}
              {(() => {
                const chosen = (mapModal.candidates || []).find((c) => c.email === mapSelectedEmail);
                
                // If chosen exists (they submitted an EOD), use their data. 
                // If not (you picked an 'Other Agent' who hasn't submitted), assume 0 matches.
                const matched = chosen?.overlap?.matched || [];
                // If no chosen report exists, ALL receipts are unmatched
                const unmatched = chosen ? (chosen.overlap?.unmatched || []) : (mapModal.receipts || []);
                const total = mapModal.receipts?.length || 0;

                return (
                  <div style={{ marginTop: 12, fontSize: 12 }}>
                    <div style={{ marginBottom: 6 }}>
                      <b>Receipts in question:</b> {total}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontWeight: 800, marginBottom: 6, color: '#2F855A' }}>
                          Matched with selected agent ({matched.length})
                        </div>
                        <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                          {matched.length ? (
                            matched.map((r) => <div key={r} style={{ fontFamily: 'monospace' }}>{r}</div>)
                          ) : (
                            <div style={{ opacity: 0.7 }}>No matches</div>
                          )}
                        </div>
                      </div>

                      <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontWeight: 800, marginBottom: 6, color: '#C05621' }}>
                          Not in selected agent EOD ({unmatched.length})
                        </div>
                        <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                          {unmatched.length ? (
                            unmatched.map((r) => <div key={r} style={{ fontFamily: 'monospace' }}>{r}</div>)
                          ) : (
                            <div style={{ opacity: 0.7 }}>All receipts matched</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Optional warning if match looks weak OR if we picked someone with no EOD */}
                    {mapSelectedEmail && matched.length === 0 && (
                      <div style={{ marginTop: 10, color: '#c53030', fontWeight: 700 }}>
                        {!chosen 
                          ? "⚠️ Agent has no EOD submission for this day (0 matches). Mapping them will fix the name for future reports."
                          : "⚠️ Low confidence: matched 0 receipts. Double-check selection."
                        }
                      </div>
                    )}
                  </div>
                );
              })()}

              {mapError && <div style={{ marginTop: 10, color: '#c53030', fontSize: 12 }}>{mapError}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={closeMapModal}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E0', background: '#fff' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={mapSaving || !mapSelectedEmail}
                  onClick={saveNameMapping}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #2b6cb0',
                    background: mapSaving ? '#bee3f8' : '#ebf8ff',
                    color: '#2b6cb0',
                    fontWeight: 800,
                    cursor: mapSaving ? 'default' : 'pointer',
                  }}
                >
                  {mapSaving ? 'Saving…' : 'Save Mapping'}
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                After saving, the badge clears immediately. To fully re-link CSV names during matching, re-upload the CSV once.
              </div>
            </div>
          </div>
        )}

        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Net Revenue Deposited</span>
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
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Net Cash Over/Short</span>
            <span className={styles.kpiValue} style={{ color: kpis.totalCashDifference < 0 ? '#e53e3e' : '#38a169' }}>
              {formatCurrency(kpis.totalCashDifference)}
            </span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Missing EODs</span>
            <span className={styles.kpiValue} style={{ color: matrixMissingCount > 0 ? '#e53e3e' : '#38a169' }}>
              {matrixOverlayReports.length ? matrixMissingCount : '—'}
            </span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>CSV Stored</span>
            <span className={styles.kpiValue} style={{ fontSize: 14 }}>
              {isStoringMatrix ? 'Storing…' : matrixStoreStatus ? `${matrixStoreStatus.inserted} rows` : '—'}
            </span>
          </div>
        </div>

        {/* ✅ UPDATED DEBUG DASHBOARD */}
        {matrixStoreStatus && (
          <div className={styles.debugBox}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>🔍</span>
                <strong style={{ fontSize: '0.9rem' }}>CSV Debug Dashboard</strong>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setShowValidRowsDebug(!showValidRowsDebug)}
                  style={{ padding: '4px 12px', fontSize: '0.8rem', cursor: 'pointer', border: '1px solid #38a169', background: '#f0fff4', borderRadius: '4px', color: '#2f855a' }}
                >
                  {showValidRowsDebug ? 'Hide' : 'View'} All Valid Rows
                </button>
                {matrixStoreStatus.excludedWashReceipts > 0 && (
                  <button
                    onClick={() => setShowExcludedDebug(!showExcludedDebug)}
                    style={{ padding: '4px 12px', fontSize: '0.8rem', cursor: 'pointer', border: '1px solid #4299e1', background: '#ebf8ff', borderRadius: '4px', color: '#2b6cb0' }}
                  >
                    {showExcludedDebug ? 'Hide' : 'View'} {matrixStoreStatus.excludedWashReceipts} Excluded Receipts
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', fontWeight: 'bold' }}>Input Rows</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#2d3748' }}>{matrixStoreStatus.normalizedRows}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', fontWeight: 'bold' }}>After Wash</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#2d3748' }}>{matrixStoreStatus.rowsAfterWash}</div>
                <div style={{ fontSize: '0.7rem', color: '#e53e3e' }}>({matrixStoreStatus.excludedWashReceipts} receipts excluded)</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', fontWeight: 'bold' }}>Stored in DB</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#38a169' }}>{matrixStoreStatus.inserted}</div>
                {matrixStoreStatus.errors > 0 && <div style={{ fontSize: '0.7rem', color: '#e53e3e' }}>({matrixStoreStatus.errors} errors)</div>}
              </div>
            </div>

            {showExcludedDebug && matrixStoreStatus.excludedRowsData && (
              <div style={{ marginTop: '16px', overflowX: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                <h4 style={{ fontSize: '0.85rem', marginBottom: '8px', color: '#c53030' }}>Excluded (Wash/Void) Transactions</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#edf2f7', textAlign: 'left' }}>
                      <th style={{ padding: '6px' }}>Receipt</th>
                      <th style={{ padding: '6px' }}>Date</th>
                      <th style={{ padding: '6px' }}>Customer</th>
                      <th style={{ padding: '6px' }}>Type</th>
                      <th style={{ padding: '6px' }}>Method</th>
                      <th style={{ padding: '6px', textAlign: 'right' }}>Premium</th>
                      <th style={{ padding: '6px', textAlign: 'right' }}>Fee</th>
                      <th style={{ padding: '6px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixStoreStatus.excludedRowsData.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #edf2f7' }}>
                        <td style={{ padding: '6px' }}>{row.receipt}</td>
                        <td style={{ padding: '6px' }}>{row.dateTimeRaw}</td>
                        <td style={{ padding: '6px' }}>{row.customerName}</td>
                        <td style={{ padding: '6px' }}>{row.type}</td>
                        <td style={{ padding: '6px' }}>{row.method}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(row.premium)}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(row.fee)}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showValidRowsDebug && matrixStoreStatus.validRowsData && (
              <div style={{ marginTop: '16px', overflowX: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                <h4 style={{ fontSize: '0.85rem', marginBottom: '8px', color: '#2f855a' }}>All Valid Transactions (Processed)</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#f0fff4', textAlign: 'left' }}>
                      <th style={{ padding: '6px' }}>Office</th>
                      <th style={{ padding: '6px' }}>CSR</th>
                      <th style={{ padding: '6px' }}>Receipt</th>
                      <th style={{ padding: '6px' }}>Customer</th>
                      <th style={{ padding: '6px' }}>Type</th>
                      <th style={{ padding: '6px' }}>Method</th>
                      <th style={{ padding: '6px', textAlign: 'right' }}>Premium</th>
                      <th style={{ padding: '6px', textAlign: 'right' }}>Fee</th>
                      <th style={{ padding: '6px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixStoreStatus.validRowsData.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #edf2f7' }}>
                        <td style={{ padding: '6px' }}>{row.office}</td>
                        <td style={{ padding: '6px' }}>{row.csrRaw}</td>
                        <td style={{ padding: '6px' }}>{row.receipt}</td>
                        <td style={{ padding: '6px' }}>{row.customerName}</td>
                        <td style={{ padding: '6px' }}>{row.type}</td>
                        <td style={{ padding: '6px' }}>{row.method}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(row.premium)}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(row.fee)}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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

            <div className={styles.viewSwitcher} style={{ gap: 8 }}>
              <label className={styles.navBtn} style={{ cursor: 'pointer' }}>
                Upload Matrix EOD CSV
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    handleUploadMatrixCSV(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {matrixOverlayReports.length > 0 && (
                <button type="button" className={styles.navBtn} onClick={clearMatrixOverlay}>Clear CSV</button>
              )}
              {matrixUploadedName && <span style={{ fontSize: 12, opacity: 0.75 }}>{matrixUploadedName}</span>}
            </div>

            <div className={styles.viewSwitcher}>
              <button type="button" onClick={() => setViewMode('regional')} className={`${styles.navBtn} ${viewMode === 'regional' ? styles.navBtnActive : ''}`}>Regional View</button>
              <button type="button" onClick={() => setViewMode('corporate')} className={`${styles.navBtn} ${viewMode === 'corporate' ? styles.navBtnActive : ''}`}>Corporate Summary</button>
            </div>

            <div className={styles.daySwitcher}>
              <button type="button" className={`${styles.navBtn} ${styles.navBtnIcon}`} onClick={() => handleDayChange(-1)}>&lt;</button>
              <span>Day</span>
              <button type="button" className={`${styles.navBtn} ${styles.navBtnIcon}`} onClick={() => handleDayChange(1)}>&gt;</button>
            </div>
          </div>

          {viewMode === 'regional' && (
            <div className={styles.tableContainer}>
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
                            <tr className={styles.groupRow} onClick={() => toggleGroup(groupKey)}>
                              <td><span className={expandedGroups.has(groupKey) ? styles.expanded : ''} style={{ marginLeft: '20px' }}>▶</span></td>
                              <td>{group.report_date} - <strong>{group.office_number}</strong></td>
                              <td>
                                {editingOffice === group.office_number ? (
                                  <div className={styles.editRegionForm}>
                                    <input type="text" value={newRegionName} onChange={(e) => setNewRegionName(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Enter Region Name" />
                                    <button onClick={(e) => { e.stopPropagation(); handleSaveRegion(group.office_number); }}>Save</button>
                                    <button className={styles.cancelButton} onClick={(e) => { e.stopPropagation(); setEditingOffice(null); }}>X</button>
                                  </div>
                                ) : (
                                  <div className={styles.regionCell}>
                                    <span>{officeRegions[group.office_number] || 'Unassigned'}</span>
                                    <button className={styles.editButton} onClick={(e) => { e.stopPropagation(); handleEditRegion(group.office_number, officeRegions[group.office_number] || 'Unassigned'); }}>✎</button>
                                  </div>
                                )}
                              </td>
                              <td>{group.total_nb_rw_count}</td>
                              <td>{formatCurrency(Math.max(0, group.total_trust_deposit))}</td>
                              <td>{group.corp_owes > 0 ? `(${formatCurrency(group.corp_owes)})` : '$0.00'}</td>
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
                                      {group.reports.map((r) => {
                                        const isMissing = !!r.is_missing_eod;
                                        const isDebugOpen = expandedMissingRowId === r.id;
                                        const missingReceipts = reportDiscrepancies[r.id] || [];

                                        const isUnknownEmail = !isMissing && r.agent_email && !knownEmails.has(r.agent_email.toLowerCase());

                                        let displayName = '';
                                        let displayEmail = '';

                                        if (r.is_unmapped_name) {
                                          displayName = r.agent_email;
                                          displayEmail = '(No Email Linked)';
                                        } else {
                                          displayEmail = r.agent_email;
                                          const profileName = agentProfiles[r.agent_email?.toLowerCase()];
                                          if (profileName) {
                                            displayName = profileName;
                                          } else {
                                            displayName = r.csr_name || r.agent_email?.split('@')[0];
                                          }
                                        }

                                        return (
                                          <React.Fragment key={r.id}>
                                            <tr
                                              className={isMissing ? styles.missingEodRow : undefined}
                                              onClick={() => {
                                                if (!isMissing) {
                                                  if (missingReceipts.length > 0) {
                                                    setExpandedMissingRowId(isDebugOpen ? null : r.id);
                                                  } else {
                                                    setSelectedReport(r);
                                                  }
                                                  return;
                                                }
                                                setExpandedMissingRowId(isDebugOpen ? null : r.id);
                                              }}
                                              style={{ cursor: 'pointer' }}
                                            >
                                              <td>
                                                <div style={{ fontWeight: 'bold', color: '#2d3748' }}>{displayName}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#718096' }}>{displayEmail}</div>

                                                {isMissing && <span className={styles.missingBadge}>EOD NOT SUBMITTED</span>}

                                                {r.is_unmapped_name && (
                                                  <span style={{ marginLeft: 8, backgroundColor: '#FEFCBF', color: '#B7791F', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                    ⚠️ Name Not Mapped
                                                  </span>
                                                )}

                                                {isUnknownEmail && (
                                                  <span style={{ marginLeft: 8, backgroundColor: '#FEFCBF', color: '#B7791F', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                    ⚠️ Name Not Mapped
                                                  </span>
                                                )}

                                                {r.collision_report_name && (
                                                  <>
                                                    <span style={{ marginLeft: 8, backgroundColor: '#FEFCBF', color: '#B7791F', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                      ⚠️ CSV Name Mismatch (closest: {r.collision_report_name})
                                                    </span>

                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();

                                                        const receipts = r._group_receipts || [];

                                                        const scoredCandidates = (r._match_candidates || [])
                                                          .map((c) => {
                                                            const reportRaw = c.report?.raw_transactions || [];
                                                            const overlap = calcReceiptOverlap(receipts, reportRaw);
                                                            return { ...c, overlap };
                                                          })
                                                          .sort((a, b) => (b.overlap?.matchedCount || 0) - (a.overlap?.matchedCount || 0));

                                                        openMapNameModal({
                                                          rowId: r.id,
                                                          csvName: r.csr_name || r.agent_email || '',
                                                          csvNorm: normalizeName(r.csr_name || ''),
                                                          suggestedEmail: (r._suggested_email || '').trim().toLowerCase(),
                                                          candidates: scoredCandidates,
                                                          receipts: receipts,
                                                          csvTransactions: r._raw_csv_rows || [], // ✅ PASS DATA HERE
                                                        });
                                                      }}
                                                      style={{
                                                        marginLeft: 8,
                                                        padding: '2px 8px',
                                                        fontSize: '0.75rem',
                                                        borderRadius: 4,
                                                        border: '1px solid #2b6cb0',
                                                        background: '#ebf8ff',
                                                        color: '#2b6cb0',
                                                        cursor: 'pointer',
                                                        fontWeight: 'bold',
                                                      }}
                                                    >
                                                      Map Name
                                                    </button>
                                                  </>
                                                )}

                                                {!isMissing && missingReceipts.length > 0 && (
                                                  <span className={styles.warningBadge}>
                                                    ⚠️ {missingReceipts.length} Missing Receipts
                                                  </span>
                                                )}
                                              </td>
                                              <td>{r.nb_rw_count}</td>
                                              <td>{formatCurrency(r.revenue_deposit)}</td>
                                              <td>{formatCurrency(Math.max(0, r.trust_deposit))}</td>
                                              <td>{formatCurrency(r.cash_difference)}</td>
                                            </tr>

                                            {!isMissing && isDebugOpen && missingReceipts.length > 0 && (
                                              <tr>
                                                <td colSpan={5} className={styles.missingReceiptsDetail}>
                                                  <div className={styles.missingReceiptsContainer}>
                                                    <strong>Missing Matrix Receipts:</strong>
                                                    <div>These receipts appear in the Matrix CSV but were NOT in their EOD submission:</div>
                                                    <ul className={styles.missingReceiptsList}>
                                                      {missingReceipts.map(rec => (
                                                        <li key={rec} className={styles.missingReceiptItem}>{rec}</li>
                                                      ))}
                                                    </ul>
                                                    <button
                                                      className={styles.viewReportBtn}
                                                      onClick={(e) => { e.stopPropagation(); setSelectedReport(r); }}
                                                    >
                                                      View Full Report Details
                                                    </button>
                                                  </div>
                                                </td>
                                              </tr>
                                            )}

                                            {isMissing && isDebugOpen && (
                                              <tr>
                                                <td colSpan={5} style={{ padding: 12, background: '#fff' }}>
                                                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                                                    <div><b>CSV Debug</b></div>
                                                    <div>Rows used: <b>{r._debug?.rowsUsed ?? 0}</b></div>
                                                    <div>Receipts excluded (wash/void): <b>{(r._debug?.receiptsExcluded || []).length}</b></div>
                                                    <div style={{ marginTop: 8 }}>
                                                      <b>All Transactions for {displayName}</b>
                                                      <div style={{ overflowX: 'auto', marginTop: 6, maxHeight: '300px', overflowY: 'auto' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                          <thead>
                                                            <tr>
                                                              <th style={{ textAlign: 'left' }}>Receipt</th>
                                                              <th style={{ textAlign: 'left' }}>ID</th>
                                                              <th style={{ textAlign: 'left' }}>Type</th>
                                                              <th style={{ textAlign: 'left' }}>Method</th>
                                                              <th style={{ textAlign: 'right' }}>Premium</th>
                                                              <th style={{ textAlign: 'right' }}>Fee</th>
                                                              <th style={{ textAlign: 'right' }}>Total</th>
                                                            </tr>
                                                          </thead>
                                                          <tbody>
                                                            {(r._debug?.sampleTransactions || []).map((t, idx) => (
                                                              <tr key={`${t.receipt}-${idx}`}>
                                                                <td>{t.receipt}</td>
                                                                <td>{t.customerId}</td>
                                                                <td>{t.type}</td>
                                                                <td>{t.method}</td>
                                                                <td style={{ textAlign: 'right' }}>{formatCurrency(t.premium)}</td>
                                                                <td style={{ textAlign: 'right' }}>{formatCurrency(t.fee)}</td>
                                                                <td style={{ textAlign: 'right' }}>{Number(t.total).toFixed(2)}</td>
                                                              </tr>
                                                            ))}
                                                          </tbody>
                                                        </table>
                                                      </div>
                                                    </div>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {viewMode === 'corporate' && <CorpSummaryView reports={effectiveReports} startDate={startDate} />}
        </div>
      </main>

      {selectedReport && <ReportDetailModal report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </>
  );
};

export default OfficeEODs;
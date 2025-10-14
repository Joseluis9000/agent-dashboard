import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './EODReport.module.css';
import BetaWarningModal from '../components/BetaWarningModal';
import { supabase } from '../supabaseClient';
import SuccessModal from '../components/Modals/SuccessModal';

const HEADERS = [
  'Receipt', 'ID', 'Customer', 'Customer Type', 'Date / Time', 'CSR', 'Office',
  'Type', 'Company', 'Policy', 'Financed', 'Reference #', 'Method', 'Premium', 'Fee', 'Total'
];

const FEE_TYPES = [
  'Broker Fee', 'Endorsement Fee', 'Reinstatement Fee', 'Renewal Fee',
  'Payment Fee', 'Tax Prep Fee', 'Registration Fee'
];

const findFeeType = (companyName = '') =>
  FEE_TYPES.find(fee => companyName.includes(fee)) || '';

// fee rows helper
const isFeeCompany = (company = '') => {
  const base = company.toLowerCase();
  const feeHits = FEE_TYPES.some(ft => base.includes(ft.toLowerCase()));
  return feeHits || base.includes('convenience fee');
};

const EODReport = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const reportToEdit = location.state?.reportToEdit;

  const [editingReportId, setEditingReportId] = useState(null);
  const [logText, setLogText] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');
  const [cashInHand, setCashInHand] = useState('');
  const [expensesAmount, setExpensesAmount] = useState('');
  const [expensesExplanation, setExpensesExplanation] = useState('');
  const [referrals, setReferrals] = useState([{ clientName: '', amount: '', policyNumber: '', id: 1 }]);
  const [arCorrections, setArCorrections] = useState([{ receiptNumber: '', premium: '', fee: '', ccFee: '', feeType: '', id: Date.now() }]);
  const [agentInitials, setAgentInitials] = useState('');
  const [verifiedReceipts, setVerifiedReceipts] = useState(false);
  const [verifiedDocs, setVerifiedDocs] = useState(false);
  const [notes, setNotes] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(!reportToEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [user, setUser] = useState(null);
  const [receiptFiles, setReceiptFiles] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Step-2 alerting/highlighting
  const [verifyAlerts, setVerifyAlerts] = useState([]);
  const [invalidRowIdx, setInvalidRowIdx] = useState(new Set());

  // paste locking + audit info
  const [isPasteLocked, setIsPasteLocked] = useState(false);
  const [clientIp, setClientIp] = useState('');
  const [userAgent, setUserAgent] = useState('');
  const [lastEditMeta, setLastEditMeta] = useState(null);

  // helpers
  const num = useCallback((v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }, []);

  // robust date check helper
  const isValidDateTime = useCallback((s) => {
    if (!s) return false;
    const d = new Date(s);
    return !Number.isNaN(d.getTime());
  }, []);

  // analyzeTransactions – structure-only detection (no keyword heuristics)
  const analyzeTransactions = useCallback((trans) => {
    const bad = [];
    const totalsByOffice = {};

    trans.forEach((t, idx) => {
      const receiptOk = /^\d+$/.test((t.Receipt || '').trim());
      const idOk = /^\d+$/.test((t.ID || '').trim());
      const dateOk = isValidDateTime((t['Date / Time'] || '').trim());

      // Flag only when structural fields aren't valid.
      const looksLikeSummary = !(receiptOk && idOk && dateOk);
      if (looksLikeSummary) bad.push(idx);

      const office = (t.Office || '').trim();
      if (office) {
        const total = num(t.Total);
        totalsByOffice[office] = (totalsByOffice[office] || 0) + total;
      }
    });

    const realOffices = Object.entries(totalsByOffice)
      .filter(([, sum]) => Math.abs(sum) > 0.009)
      .map(([office]) => office);

    return { bad, realOffices };
  }, [isValidDateTime, num]);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user || null);
    };
    fetchUser();

    // client audit info
    setUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : '');
    // best-effort IP fetch (client-side)
    try {
      fetch('https://api.ipify.org?format=json')
        .then(r => r.json())
        .then(d => setClientIp(d?.ip || ''))
        .catch(() => setClientIp(''));
    } catch {
      setClientIp('');
    }
  }, []);

  useEffect(() => {
    if (reportToEdit) {
      setEditingReportId(reportToEdit.id);
      const rawText = (reportToEdit.raw_transactions || [])
        .map(t => HEADERS.map(h => t[h] || '').join('\t'))
        .join('\n');
      setLogText(rawText);
      setTransactions(reportToEdit.raw_transactions || []);
      setCashInHand(String(reportToEdit.total_cash_in_hand || ''));
      setExpensesAmount(reportToEdit.expenses_amount || '');
      setExpensesExplanation(reportToEdit.expenses_explanation || '');
      setReferrals(
        reportToEdit.referrals && reportToEdit.referrals.length > 0
          ? reportToEdit.referrals
          : [{ clientName: '', amount: '', policyNumber: '', id: 1 }]
      );
      const loadedCorrections = reportToEdit.ar_corrections || [];
      setArCorrections(
        loadedCorrections.length > 0
          ? loadedCorrections
          : [{ receiptNumber: '', premium: '', fee: '', ccFee: '', feeType: '', id: Date.now() }]
      );
      setAgentInitials(reportToEdit.agent_initials || '');
      setVerifiedReceipts(reportToEdit.verified_receipts_match || false);
      setVerifiedDocs(reportToEdit.verified_docs_uploaded || false);
      setNotes(reportToEdit.notes || '');

      // Lock paste box in edit mode
      setIsPasteLocked(true);

      // last edit meta (show in UI)
      const edits = reportToEdit.edits || [];
      if (edits.length > 0) {
        const last = edits[edits.length - 1];
        setLastEditMeta(last);
      } else if (reportToEdit.created_at && reportToEdit.created_by) {
        setLastEditMeta({ ts: reportToEdit.created_at, editor: reportToEdit.created_by, action: 'created' });
      }
    }
  }, [reportToEdit]);

  // alerts when transactions change
  useEffect(() => {
    if (transactions.length === 0) {
      setVerifyAlerts([]);
      setInvalidRowIdx(new Set());
      return;
    }
    const { bad, realOffices } = analyzeTransactions(transactions);

    const alerts = [];
    const errorRowIndices = new Set(bad); // Initialize with structurally bad rows

    if (bad.length > 0) {
      alerts.push(`You pasted ${bad.length} line(s) that look like totals/labels. Remove these rows before continuing.`);
    }
    if (realOffices.length > 1) {
      alerts.push(
        `Multiple offices detected: ${realOffices.join(
          ', '
        )}. Only one office is allowed. Voided/cancelling rows are ignored—fix the paste so only the correct office remains.`
      );
    }

    // Pre-calculate net fees per receipt to handle voids correctly
    const receiptFeeTotals = {};
    transactions.forEach(t => {
      const receipt = t.Receipt;
      if (!receipt) return;
      if (!receiptFeeTotals[receipt]) {
        receiptFeeTotals[receipt] = {
          paymentFee: 0,
          convenienceFee: 0,
          // NEW: Specifically track convenience fees charged to cash
          cashConvenienceFee: 0,
        };
      }
      const fee = parseFloat(t.Fee) || 0;
      const company = t.Company || '';
      const method = t.Method || '';

      if (company.includes('Payment Fee')) {
        receiptFeeTotals[receipt].paymentFee += fee;
      }
      if (company.includes('Convenience Fee')) {
        receiptFeeTotals[receipt].convenienceFee += fee;
        if (method.includes('Cash')) {
          receiptFeeTotals[receipt].cashConvenienceFee += fee;
        }
      }
    });

    // New validation alerts for payment rules
    transactions.forEach((t, index) => {
      const fee = parseFloat(t.Fee) || 0;
      const company = t.Company || '';
      const method = t.Method || '';
      const receipt = t.Receipt;

      // 1. Alert for Installment fee > $10, only if not fully voided
      if (company.includes('Payment Fee') && fee > 10) {
        if (receipt && Math.abs(receiptFeeTotals[receipt]?.paymentFee) > 0.01) {
          alerts.push(`Receipt #${receipt}: Installment fee of $${fee.toFixed(2)} is over the $10 limit.`);
          errorRowIndices.add(index);
        }
      }

      // Checks specific to Convenience Fees
      if (company.includes('Convenience Fee')) {
        const isMonetaryVoided = receipt && Math.abs(receiptFeeTotals[receipt]?.convenienceFee) < 0.01;
        const isCashErrorVoided = receipt && Math.abs(receiptFeeTotals[receipt]?.cashConvenienceFee) < 0.01;

        // 2. Alert for CC fee > $7, only if not fully voided
        if (fee > 7 && !isMonetaryVoided) {
          alerts.push(`Receipt #${receipt}: Convenience fee of $${fee.toFixed(2)} is over the $7 limit.`);
          errorRowIndices.add(index);
        }

        // 3. Alert for CC fee with Cash payment, only if not fully voided
        if (method.includes('Cash') && !isCashErrorVoided) {
          alerts.push(`Receipt #${receipt}: Convenience fee was incorrectly charged with a Cash payment.`);
          errorRowIndices.add(index);
        }
      }
    });

    setVerifyAlerts(alerts);
    setInvalidRowIdx(errorRowIndices);
  }, [transactions, analyzeTransactions]);

  // Check existing report per date & office
  useEffect(() => {
    const checkForExistingReport = async (currentUser) => {
      if (!currentUser || reportToEdit || transactions.length === 0) return;

      const reportDate = (transactions[0]['Date / Time'] || '').split(' ')[0];
      if (!reportDate) return;

      const { realOffices } = analyzeTransactions(transactions);
      const currentOffice = realOffices[0] || (transactions[0]?.Office || '').trim();

      const { data: existing, error } = await supabase
        .from('eod_reports')
        .select('id, office_number')
        .eq('agent_email', currentUser.email)
        .eq('report_date', reportDate);

      if (error) return;

      if (existing && existing.length > 0) {
        const officesAlreadySubmitted = new Set(existing.map(r => (r.office_number || '').trim()));
        if (officesAlreadySubmitted.has(currentOffice)) {
          alert(`You already submitted an EOD for ${currentOffice} on ${reportDate}. Edit it from "Office & Agent EODs".`);
          navigate('/office-eods');
        }
      }
    };
    if (user) checkForExistingReport(user);
  }, [user, reportToEdit, navigate, transactions, analyzeTransactions]);

  const handleFileChange = (event) => setReceiptFiles([...event.target.files]);

  const parsePastedText = (text) => {
    const lines = text.trim().split('\n');
    const numericalFields = new Set(['Premium', 'Fee', 'Total']);

    return lines.map(line => {
      const columns = line.split('\t');
      const transaction = {};
      
      HEADERS.forEach((header, index) => {
        const value = columns[index] || '';
        // If the header is one of the numerical fields, remove commas.
        if (numericalFields.has(header)) {
          transaction[header] = value.replace(/,/g, '');
        } else {
          transaction[header] = value;
        }
      });
      
      return transaction;
    });
  };

  const calculateSummary = useCallback((trans, expenses, referralList) => {
    // STEP 1: Find and exclude any receipts that are a complete wash (e.g., a same-day void).
    // This handles cases like Julio Delgado's receipt #2594 correctly.
    const totalsByReceipt = trans.reduce((acc, t) => {
      const receipt = t.Receipt;
      const total = parseFloat(t.Total) || 0;
      if (!acc[receipt]) {
        acc[receipt] = 0;
      }
      acc[receipt] += total;
      return acc;
    }, {});

    const receiptsToExclude = new Set();
    for (const receipt in totalsByReceipt) {
      if (Math.abs(totalsByReceipt[receipt]) < 0.01) {
        receiptsToExclude.add(receipt);
      }
    }

    const filteredTrans = trans.filter(t => !receiptsToExclude.has(t.Receipt));

    // Initialize the summary object
    const summary = {
      nb_rw_count: 0, dmv_count: 0, cash_premium: 0, cash_fee: 0,
      credit_premium: 0, credit_fee: 0, nb_rw_fee: 0, en_fee: 0,
      reissue_fee: 0, renewal_fee: 0, pys_fee: 0, tax_prep_fee: 0,
      registration_fee: 0, convenience_fee: 0, dmv_premium: 0,
    };

    // STEP 2: Calculate the summary from the filtered list of transactions.
    for (const t of filteredTrans) {
      const total = parseFloat(t.Total) || 0;
      const premium = parseFloat(t.Premium) || 0;
      const fee = parseFloat(t.Fee) || 0;
      const type = t.Type || '';
      const company = t.Company || '';
      const method = t.Method || '';

      // *** THIS IS THE KEY CHANGE FOR THE COUNT ***
      // Only add to the count if the transaction is a NEW/RWR and has a positive total.
      if ((type.includes('NEW') || type.includes('RWR')) && total > 0) {
        summary.nb_rw_count += 1;
      }
      
      // All other financial calculations still include negative values to keep the money totals correct.
      if (company.includes('Registration Fee')) summary.dmv_count += Math.sign(total);
      if (method.includes('Cash')) {
        summary.cash_premium += premium;
        summary.cash_fee += fee;
      } else if (method.includes('Credit Card')) {
        summary.credit_premium += premium;
        summary.credit_fee += fee;
      }
      if (company.includes('Broker Fee')) summary.nb_rw_fee += fee;
      if (company.includes('Endorsement Fee')) summary.en_fee += fee;
      if (company.includes('Reinstatement Fee')) summary.reissue_fee += fee;
      if (company.includes('Renewal Fee')) summary.renewal_fee += fee;
      if (company.includes('Payment Fee')) summary.pys_fee += fee;
      if (company.includes('Registration Fee')) summary.registration_fee += fee;
      if (company.includes('Convenience Fee (c')) summary.convenience_fee += fee;
      if (company.includes('Dmv - Registration S')) summary.dmv_premium += premium;
      if (company.includes('Tax Prep Fee') && !method.includes('Wire')) summary.tax_prep_fee += fee;
    }

    // ... (the rest of the function remains the same)
    const totalPremium = summary.cash_premium + summary.credit_premium;
    const totalFee = summary.cash_fee + summary.credit_fee;
    const totalCreditPayment = summary.credit_premium + summary.credit_fee;
    const nbRwCorpFee = summary.nb_rw_count * 20;
    const feeRoyalty = (summary.pys_fee + summary.reissue_fee + summary.renewal_fee + summary.en_fee) * 0.20;
    const totalReferralsPaid = referralList.reduce((sum, ref) => sum + (parseFloat(ref.amount) || 0), 0);

    summary.trust_deposit =
      (totalPremium + summary.convenience_fee + nbRwCorpFee + feeRoyalty) -
      (summary.dmv_premium + totalCreditPayment);

    summary.dmv_deposit = summary.dmv_premium;

    summary.revenue_deposit =
      totalFee - (summary.convenience_fee + nbRwCorpFee + feeRoyalty + (parseFloat(expenses) || 0) + totalReferralsPaid);

    return summary;
  }, []);

  const eodDataMemo = useMemo(() => {
    if (transactions.length === 0) return null;
    return calculateSummary(transactions, expensesAmount, referrals);
  }, [transactions, expensesAmount, referrals, calculateSummary]);

  const commissionableSummary = useMemo(() => {
    if (!eodDataMemo) return null;
    const arReceiptNumbers = new Set(arCorrections.map(c => c.receiptNumber?.trim()).filter(p => p));
    if (arReceiptNumbers.size === 0) return eodDataMemo;
    const arCorrectedTransactions = transactions.filter(t => arReceiptNumbers.has(t.Receipt));
    if (arCorrectedTransactions.length === 0) return eodDataMemo;
    const arSummary = calculateSummary(arCorrectedTransactions, 0, []);
    const finalSummary = {};
    for (const key in eodDataMemo) {
      const totalValue = eodDataMemo[key];
      const arValue = arSummary[key] || 0;
      if (typeof totalValue === 'number' && !key.includes('_deposit')) {
        finalSummary[key] = totalValue - arValue;
      } else {
        finalSummary[key] = totalValue;
      }
    }
    return finalSummary;
  }, [eodDataMemo, transactions, arCorrections, calculateSummary]);

  // LOCKED paste handler
  const handlePaste = async (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    setError('');
    try {
      const parsed = parsePastedText(pastedText);
      setTransactions(parsed);
      setLogText(pastedText);
      setIsPasteLocked(true); // lock after successful parse
    } catch (err) {
      setError('Failed to parse the data. Please ensure it is tab-separated.');
      setTransactions([]);
      setIsPasteLocked(false);
    }
  };

  const handleArCorrectionChange = (index, event) => {
    const newReceiptNumber = event.target.value;
    const newArCorrections = [...arCorrections];
    const currentCorrection = { ...newArCorrections[index], receiptNumber: newReceiptNumber };
    const matchingTransactions = transactions.filter(t => t.Receipt === newReceiptNumber);

    if (matchingTransactions.length > 0) {
      let totalPremium = 0, mainFee = 0, convenienceFee = 0, detectedFeeType = '';
      matchingTransactions.forEach(t => {
        totalPremium += parseFloat(t.Premium) || 0;
        const currentFee = parseFloat(t.Fee) || 0;
        if (t.Company.includes('Convenience Fee')) {
          convenienceFee += currentFee;
        } else if (currentFee > 0) {
          mainFee += currentFee;
          if (!detectedFeeType) detectedFeeType = findFeeType(t.Company);
        }
      });
      currentCorrection.premium = totalPremium.toFixed(2);
      currentCorrection.fee = mainFee.toFixed(2);
      currentCorrection.ccFee = convenienceFee.toFixed(2);
      currentCorrection.feeType = detectedFeeType;
    } else {
      currentCorrection.premium = '';
      currentCorrection.fee = '';
      currentCorrection.ccFee = '';
      currentCorrection.feeType = '';
    }
    newArCorrections[index] = currentCorrection;
    setArCorrections(newArCorrections);
  };

  const addArCorrection = () =>
    setArCorrections([...arCorrections, { receiptNumber: '', premium: '', fee: '', ccFee: '', feeType: '', id: Date.now() }]);

  const removeArCorrection = (index) => setArCorrections(arCorrections.filter((_, i) => i !== index));

  const handleReferralChange = (index, event) => {
    const newReferrals = [...referrals];
    newReferrals[index][event.target.name] = event.target.value;
    setReferrals(newReferrals);
  };
  const addReferral = () => setReferrals([...referrals, { clientName: '', amount: '', policyNumber: '', id: Date.now() }]);
  const removeReferral = (index) => setReferrals(referrals.filter((_, i) => i !== index));

  const validateForm = () => {
    const errors = {};
    if (cashInHand === null || String(cashInHand).trim() === '') {
      errors.cashInHand = 'Actual cash in hand is required.';
    }
    if (parseFloat(expensesAmount) > 0 && !expensesExplanation.trim()) {
      errors.expensesExplanation = 'An explanation is required for expenses.';
    }
    referrals.forEach((ref, index) => {
      if (parseFloat(ref.amount) > 0) {
        if (!ref.clientName.trim()) errors[`ref_clientName_${index}`] = 'Client name is required.';
        if (!ref.policyNumber.trim()) errors[`ref_policyNumber_${index}`] = 'Policy number is required.';
      }
    });
    if (!agentInitials.trim()) {
      errors.agentInitials = 'Agent initials are required.';
    }
    if (!verifiedReceipts) {
      errors.verifiedReceipts = 'You must verify receipts match.';
    }
    if (!verifiedDocs) {
      errors.verifiedDocs = 'You must verify documents are uploaded.';
    }
    if (receiptFiles.length === 0 && (!reportToEdit || !reportToEdit.receipt_urls || reportToEdit.receipt_urls.length === 0)) {
      errors.receiptFiles = 'At least one receipt/deposit slip must be uploaded.';
    }
    if (transactions.length === 0) {
      alert('Cannot submit an empty report. Please paste transaction data.');
      return false;
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    // block if Step 2 has alerts
    if (verifyAlerts.length > 0) {
      alert("Fix the issues in 'Verify Pasted Data' before submitting.");
      return;
    }

    if (!validateForm()) {
      alert('Please fix the errors before submitting.');
      return;
    }
    if (!user) {
      alert('Could not find user information. Please make sure you are logged in.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const uploadedUrls = [];
      if (receiptFiles.length > 0) {
        const uploadPromises = receiptFiles.map(file => {
          const sanitizedName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
          const filePath = `public/${user.id}/${Date.now()}_${sanitizedName}`;
          return supabase.storage.from('receipts').upload(filePath, file);
        });
        const uploadResults = await Promise.all(uploadPromises);
        for (const result of uploadResults) {
          if (result.error) throw result.error;
          const { data } = supabase.storage.from('receipts').getPublicUrl(result.data.path);
          uploadedUrls.push(data.publicUrl);
        }
      }

      const transactionDate =
        transactions.length > 0
          ? transactions[0]['Date / Time'].split(' ')[0]
          : new Date().toISOString().split('T')[0];

      const { realOffices } = analyzeTransactions(transactions);
      const currentOffice = realOffices[0] || (transactions[0]?.Office || 'N/A');

      if (!editingReportId) {
        const { data: existingSame, error: exErr } = await supabase
          .from('eod_reports')
          .select('id')
          .eq('agent_email', user.email)
          .eq('report_date', transactionDate)
          .eq('office_number', currentOffice)
          .limit(1)
          .maybeSingle();

        if (!exErr && existingSame) {
          alert(`You already submitted an EOD for ${currentOffice} on ${transactionDate}. Edit it from "Office & Agent EODs".`);
          setIsSubmitting(false);
          return;
        }
      }

      const nowIso = new Date().toISOString();

      const reportDataBase = {
        report_date: transactionDate,
        agent_email: user.email,
        office_number: currentOffice,
        ...eodDataMemo,
        total_cash_in_hand: parseFloat(cashInHand) || 0,
        cash_difference: cashDifference,
        expenses_amount: parseFloat(expensesAmount) || 0,
        expenses_explanation: expensesExplanation,
        referrals: referrals.filter(r => r.clientName && r.amount),
        ar_corrections: arCorrections.filter(c => c.receiptNumber),
        agent_initials: agentInitials,
        notes: notes,
        verified_receipts_match: verifiedReceipts,
        verified_docs_uploaded: verifiedDocs,
        raw_transactions: transactions,
        receipt_urls: uploadedUrls.length > 0 ? uploadedUrls : (reportToEdit?.receipt_urls || []),
      };

      if (editingReportId) {
        // append to edits[]
        const newEditEntry = {
          ts: nowIso,
          editor: user.email,
          action: 'update',
          user_agent: userAgent,
          ip: clientIp || null
        };

        const prevEdits = Array.isArray(reportToEdit?.edits) ? reportToEdit.edits : [];
        const reportData = {
          ...reportDataBase,
          edits: [...prevEdits, newEditEntry]
        };

        const { error } = await supabase.from('eod_reports').update(reportData).eq('id', editingReportId);
        if (error) throw error;
        setLastEditMeta(newEditEntry);
      } else {
        // include created_* fields
        const reportData = {
          ...reportDataBase,
          created_at: nowIso,
          created_ip: clientIp || null,
          created_user_agent: userAgent || null,
          created_by: user.email,
          edits: [] // starts empty
        };
        const { data: newReport, error } = await supabase.from('eod_reports').insert([reportData]).select().single();
        if (error) throw error;
        setEditingReportId(newReport.id);
        setLastEditMeta({ ts: nowIso, editor: user.email, action: 'created' });
      }

      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error submitting EOD report:', error.message);
      setSubmitError(`Submission failed: ${error.message}`);
      alert(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalCashCollected = eodDataMemo ? eodDataMemo.cash_premium + eodDataMemo.cash_fee : 0;
  const totalReferralsPaid = referrals.reduce((sum, ref) => sum + (parseFloat(ref.amount) || 0), 0);
  const totalCashPayouts = (parseFloat(expensesAmount) || 0) + totalReferralsPaid;
  const cashForDMV = eodDataMemo ? eodDataMemo.dmv_deposit : 0;
  const cashForTrust = eodDataMemo ? Math.max(0, eodDataMemo.trust_deposit) : 0;
  const netCashCollected = totalCashCollected - totalCashPayouts;
  const cashForRevenue = netCashCollected - cashForDMV - cashForTrust;
  const expectedCashInHand = cashForDMV + cashForTrust + cashForRevenue;
  const cashDifference = cashInHand ? parseFloat(cashInHand) - expectedCashInHand : 0;

  // Step 2 display tweaks
  const displayCell = (header, row) => {
    if ((header === 'Type' || header === 'Policy') && isFeeCompany(row.Company)) return '';
    if (header === 'Reference #' && !(row.Method || '').includes('Credit Card')) return '';
    return row[header];
  };

  const formatEditMeta = (meta) => {
    if (!meta) return null;
    const at = new Date(meta.ts).toLocaleString();
    const who = meta.editor || 'unknown';
    const act = meta.action || 'update';
    return `${act} by ${who} at ${at}`;
  };

  return (
    <>
      {isModalOpen && <BetaWarningModal onClose={() => setIsModalOpen(false)} />}

      <main className={styles.mainContent}>
        <div className={styles.pageHeader}>
          <h1>{editingReportId ? 'Edit EOD Report' : 'Agent End of Day Report'}</h1>
        </div>

        <div className={styles.card}>
          <h2>Step 1: Paste Transaction Log</h2>
          <p>Copy the transaction data from your source and paste it below (data only, no headers).</p>

          <textarea
            className={styles.logTextarea}
            onPaste={handlePaste}
            onChange={(e) => {
              // ignore manual typing while locked
              if (!isPasteLocked) setLogText(e.target.value);
            }}
            value={logText}
            placeholder="Right-click and paste your copied transaction data here..."
            readOnly={isPasteLocked}
          />

          {isPasteLocked && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <small style={{ color: '#666' }}>
                Pasted data is <strong>locked</strong>. {lastEditMeta ? <>Last {formatEditMeta(lastEditMeta)}</> : ''}
              </small>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => {
                  if (window.confirm('Clear pasted data and unlock to paste again?')) {
                    setLogText('');
                    setTransactions([]);
                    setIsPasteLocked(false);
                    setVerifyAlerts([]);
                    setInvalidRowIdx(new Set());
                  }
                }}
              >
                Clear &amp; paste again
              </button>
            </div>
          )}

          {error && <p className={styles.errorText}>{error}</p>}
        </div>

        {transactions.length > 0 && (
          <div className={`${styles.card} ${styles.tableCard}`}>
            <h2>Step 2: Verify Pasted Data</h2>

            {verifyAlerts.length > 0 && (
              <div className={styles.alertBox}>
                <ul>
                  {verifyAlerts.map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
              </div>
            )}

            <div className={styles.tableContainer}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>{HEADERS.map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {transactions.map((t, index) => (
                    <tr
                      key={`${t.Receipt}-${t.ID}-${index}`}
                      className={invalidRowIdx.has(index) ? styles.rowError : ''}
                    >
                      {HEADERS.map(h => <td key={`${h}-${index}`}>{displayCell(h, t)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {transactions.length > 0 && commissionableSummary && (
          <div className={styles.bottomGrid}>
            <div className={styles.summaryColumn}>
              <div className={styles.card}>
                <h2>Step 3: Auto-Calculated Summary</h2>
                <p style={{ fontSize: '0.8rem', fontStyle: 'italic', opacity: 0.8, marginTop: '-10px', marginBottom: '15px' }}>
                  Note: A/R Corrections are excluded from this summary.
                </p>
                <div className={styles.resultsGrid}>
                  {Object.entries(commissionableSummary)
                    .filter(([key]) => !key.includes('_deposit'))
                    .map(([key, value]) => (
                      <div key={key} className={styles.resultItem}>
                        <span className={styles.resultKey}>{key.replace(/_/g, ' ')}:</span>
                        <span className={styles.resultValue}>
                          {key.includes('count') ? value : value.toFixed(2)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              <div className={styles.card}>
                <h2>Step 4: Deposit Calculation</h2>
                <div className={styles.depositsGrid}>
                  <div className={styles.depositItem}>
                    <span className={styles.depositKey}>Trust Deposit</span>
                    <span className={styles.depositValue}>${eodDataMemo.trust_deposit.toFixed(2)}</span>
                  </div>
                  <div className={styles.depositItem}>
                    <span className={styles.depositKey}>DMV Deposit</span>
                    <span className={styles.depositValue}>${eodDataMemo.dmv_deposit.toFixed(2)}</span>
                  </div>
                  <div className={styles.depositItem}>
                    <span className={styles.depositKey}>Revenue Deposit</span>
                    <span className={styles.depositValue}>${eodDataMemo.revenue_deposit.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.entryColumn}>
              <div className={styles.card}>
                <h2>Step 5: Payouts, Balancing & Verification</h2>

                <div className={styles.inputGroup}>
                  <label>Expenses Amount</label>
                  <input type="number" value={expensesAmount} onChange={e => setExpensesAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div className={styles.inputGroup}>
                  <label>Expenses Explanation</label>
                  <input type="text" value={expensesExplanation} onChange={e => setExpensesExplanation(e.target.value)} placeholder="Reason for expense..." />
                  {formErrors.expensesExplanation && <span className={styles.errorText}>{formErrors.expensesExplanation}</span>}
                </div>

                <div className={styles.referralSection}>
                  <label>A/R Corrections</label>
                  <p style={{ fontSize: '0.8rem', fontStyle: 'italic', opacity: 0.8, margin: '0 0 10px 0' }}>
                    Enter the Receipt # to auto-fill details and exclude it from your commissionable summary.
                  </p>
                  <div className={styles.arCorrectionGrid}>
                    <div className={styles.referralHeader}>Receipt #</div>
                    <div className={styles.referralHeader}>Premium</div>
                    <div className={styles.referralHeader}>Fee</div>
                    <div className={styles.referralHeader}>CC Fee</div>
                    <div className={styles.referralHeader}>Fee Type</div>
                    <div />
                    {arCorrections.map((corr, index) => (
                      <React.Fragment key={corr.id}>
                        <input type="text" name="receiptNumber" value={corr.receiptNumber} onChange={e => handleArCorrectionChange(index, e)} placeholder="Receipt #" />
                        <input type="number" name="premium" value={corr.premium} placeholder="Premium" disabled />
                        <input type="number" name="fee" value={corr.fee} placeholder="Fee" disabled />
                        <input type="number" name="ccFee" value={corr.ccFee} placeholder="CC Fee" disabled />
                        <select name="feeType" value={corr.feeType} disabled>
                          <option value="">{corr.feeType || 'Fee Type'}</option>
                        </select>
                        <div>
                          {arCorrections.length > 1 && (
                            <button type="button" onClick={() => removeArCorrection(index)} className={styles.removeButton}>-</button>
                          )}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <button type="button" onClick={addArCorrection} className={styles.addButton}>+ Add A/R Correction</button>
                </div>

                <div className={styles.referralSection}>
                  <label>Referral Payments</label>
                  <div className={styles.referralGrid}>
                    <div className={styles.referralHeader}>Client Name</div>
                    <div className={styles.referralHeader}>Amount</div>
                    <div className={styles.referralHeader}>Policy Number</div>
                    <div />
                    {referrals.map((ref, index) => (
                      <React.Fragment key={ref.id}>
                        <div>
                          <input type="text" name="clientName" value={ref.clientName} onChange={e => handleReferralChange(index, e)} placeholder="Client Name" />
                          {formErrors[`ref_clientName_${index}`] && <span className={styles.errorText}>{formErrors[`ref_clientName_${index}`]}</span>}
                        </div>
                        <div>
                          <input type="number" name="amount" value={ref.amount} onChange={e => handleReferralChange(index, e)} placeholder="Amount" />
                        </div>
                        <div>
                          <input type="text" name="policyNumber" value={ref.policyNumber} onChange={e => handleReferralChange(index, e)} placeholder="Policy Number" />
                          {formErrors[`ref_policyNumber_${index}`] && <span className={styles.errorText}>{formErrors[`ref_policyNumber_${index}`]}</span>}
                        </div>
                        <div>
                          {referrals.length > 1 && (
                            <button type="button" onClick={() => removeReferral(index)} className={styles.removeButton}>-</button>
                          )}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <button type="button" onClick={addReferral} className={styles.addButton}>+ Add Referral</button>
                </div>

                <div className={styles.balancingSection}>
                  <h3>Cash Balancing</h3>
                  <div className={styles.balanceItem}>
                    <span>(=) Total Expected Cash in Hand:</span>
                    <strong>${expectedCashInHand.toFixed(2)}</strong>
                  </div>
                  <div className={styles.balanceItem}>
                    <label htmlFor="cashInHand">Your Actual Cash in Hand:</label>
                    <input id="cashInHand" type="number" value={cashInHand} onChange={e => setCashInHand(e.target.value)} placeholder="Cash Amount" />
                  </div>
                  {formErrors.cashInHand && <span className={styles.errorText}>{formErrors.cashInHand}</span>}
                  <div className={styles.balanceItem}>
                    <span>Difference (Over / Short):</span>
                    <strong className={
                      (cashDifference < 0 || cashDifference > 5) ? styles.short :
                        (cashDifference > 0 && cashDifference <= 5) ? styles.over : ''
                    }>
                      ${cashDifference.toFixed(2)}
                    </strong>
                  </div>
                </div>

                <div className={styles.verificationSection}>
                  <h3>Final Verification</h3>
                  <div className={styles.inputGroup}>
                    <label>Your Initials</label>
                    <input type="text" value={agentInitials} onChange={e => setAgentInitials(e.target.value)} placeholder="A.S." />
                    {formErrors.agentInitials && <span className={styles.errorText}>{formErrors.agentInitials}</span>}
                  </div>
                  <div className={styles.checkboxGroup}>
                    <input type="checkbox" id="verifyReceipts" checked={verifiedReceipts} onChange={() => setVerifiedReceipts(!verifiedReceipts)} />
                    <label htmlFor="verifyReceipts">I verified all names, accounting types, and amounts match MATRIX receipts.</label>
                    {formErrors.verifiedReceipts && <span className={styles.errorText}>{formErrors.verifiedReceipts}</span>}
                  </div>
                  <div className={styles.checkboxGroup}>
                    <input type="checkbox" id="verifyDocs" checked={verifiedDocs} onChange={() => setVerifiedDocs(!verifiedDocs)} />
                    <label htmlFor="verifyDocs">I checked all transactions and ensured all supporting documents are uploaded.</label>
                    {formErrors.verifiedDocs && <span className={styles.errorText}>{formErrors.verifiedDocs}</span>}
                  </div>
                  <div className={styles.inputGroup}>
                    <label>Upload Receipts / Deposit Slips</label>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileChange}
                    />
                    {receiptFiles.length > 0 && (
                      <ul style={{ listStyleType: 'none', padding: 0, marginTop: '10px', textAlign: 'left' }}>
                        {receiptFiles.map((file, index) => (
                          <li key={index} style={{ fontSize: '0.9rem' }}>📄 {file.name}</li>
                        ))}
                      </ul>
                    )}
                    {formErrors.receiptFiles && <span className={styles.errorText}>{formErrors.receiptFiles}</span>}
                  </div>
                  <div className={styles.inputGroup}>
                    <label>Notes</label>
                    <textarea
                      className={styles.notesTextarea}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Add any relevant notes for the day here..."
                      rows="4"
                    />
                  </div>
                </div>

                {submitError && <p className={styles.errorText} style={{ textAlign: 'center' }}>{submitError}</p>}
                <button
                  onClick={handleSubmit}
                  className={styles.submitButton}
                  disabled={isSubmitting || transactions.length === 0 || verifyAlerts.length > 0}
                >
                  {isSubmitting ? 'Submitting...' : (editingReportId ? 'Update Report' : 'Submit EOD Report')}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {showSuccessModal && (
        <SuccessModal
          message={`Your EOD report has been ${reportToEdit ? 'updated' : 'saved'} correctly.`}
          onClose={() => setShowSuccessModal(false)}
          onGoToDashboard={() => navigate('/office-eods')}
        />
      )}
    </>
  );
};

export default EODReport;



import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import styles from './EnterViolation.module.css';

const ListManagerModal = ({ isOpen, onClose, title, items, onAddItem, onDeleteItem }) => {
  const [newItem, setNewItem] = useState('');
  if (!isOpen) return null;

  const handleAdd = () => {
    if (newItem.trim()) {
      onAddItem(newItem.trim().toUpperCase());
      setNewItem('');
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3>Manage {title}</h3>
          <button onClick={onClose} className={styles.closeButton}>&times;</button>
        </div>

        <div className={styles.itemList}>
          {items.map(item => (
            <div key={item.id} className={styles.item}>
              <span>{item.name}</span>
              <button onClick={() => onDeleteItem(item.id)} className={styles.deleteItemButton}>
                Delete
              </button>
            </div>
          ))}
        </div>

        <div className={styles.addItemForm}>
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder={`New ${title}...`}
          />
          <button onClick={handleAdd}>Add Item</button>
        </div>
      </div>
    </div>
  );
};

const getWeekRange = (date) => {
  const d = new Date(date);
  const todayUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayOfWeek = todayUTC.getUTCDay();
  const diff = todayUTC.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
  const sunday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff + 6));

  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
};

const todayKey = () => new Date().toISOString().split('T')[0];

const getOfficeCodeOnly = (officeValue) => {
  return String(officeValue || '').trim().split(/\s+/)[0];
};

const getUploadedDateOnly = (dateValue) => {
  return String(dateValue || '').slice(0, 10);
};

const normalizeText = (value) => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

const normalizeKeyText = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const moneyNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

// Explicitly parse report dates; do not depend on the browser's date locale.
// Two-digit years in these modern reports mean 20xx (26 -> 2026).
const parseUsDateToKey = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  let year;
  let month;
  let day;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})$/);

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (us) {
    month = Number(us[1]);
    day = Number(us[2]);
    year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
  } else {
    return '';
  }

  // Reject impossible dates instead of moving them into another month/week.
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return '';

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const buildSourceFingerprint = (reportType, parts = []) =>
  [reportType, ...parts.map((part) => normalizeKeyText(part))].join('|');

const chunkArray = (items, size = 100) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};


// Read the entire paste, not one physical line at a time. Sheets/CSV can
// quote notes containing newlines, commas, or tabs. Keep those in their cell.
const readDelimitedRows = (rawText, delimiter) => {
  const input = String(rawText ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const records = [];
  let cells = [];
  let value = '';
  let quoted = false;
  let lineNumber = 1;
  let rowStartLine = 1;

  const finishCell = () => {
    cells.push(value.trim());
    value = '';
  };
  const finishRow = () => {
    finishCell();
    // Metadata is not another column; it points back to the original paste.
    cells.sourceLine = rowStartLine;
    if (cells.some((cell) => cell !== '')) records.push(cells);
    cells = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        value += char;
        if (char === '\n') lineNumber += 1;
      }
    } else if (char === '"' && value.trim() === '') {
      // A quote inside an unquoted note/name is literal, not a new CSV field.
      quoted = true;
      value = '';
    } else if (char === delimiter) {
      finishCell();
    } else if (char === '\n') {
      finishRow();
      lineNumber += 1;
      rowStartLine = lineNumber;
    } else {
      value += char;
    }
  }

  if (quoted) {
    throw new Error(`Unclosed quoted cell near pasted line ${rowStartLine}. Copy the complete cells, including the end of the notes.`);
  }
  if (value !== '' || cells.length > 0) finishRow();
  return records;
};

const parsePastedTable = (rawText) => {
  const knownHeaders = new Set([
    'store', 'store no', 'store number', 'office', 'date', 'report date',
    'transaction date', 'customer id', 'policy number', 'customer name',
    'customer', 'agent', 'agent name', 'emails', 'bf amount', 'fee',
    'reason policy was disqualified',
  ]);

  const candidates = ['\t', ','].map((delimiter) => {
    try {
      const records = readDelimitedRows(rawText, delimiter);
      // Detect once for the whole table. A tab embedded in a CSV agent name
      // must not change how that one row is split.
      let officeRows = 0;
      let headerScore = 0;
      let multiCellRows = 0;
      records.forEach((record) => {
        if (record.length > 1) multiCellRows += 1;
        if (/^CA\d{3}\.?$/i.test(record[0] || '')) officeRows += 1;
        const recognized = record.filter((cell) => knownHeaders.has(normalizeText(cell))).length;
        if (recognized >= 2) headerScore = Math.max(headerScore, recognized);
      });
      return {
        delimiter,
        records,
        score: officeRows * 1000 + headerScore * 100 + multiCellRows,
        error: null,
      };
    } catch (error) {
      return { delimiter, records: [], score: -1, error };
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best.error) throw best.error;
  if (best.score === 0 && candidates.some((candidate) => candidate.error)) {
    throw candidates.find((candidate) => candidate.error).error;
  }
  return best;
};

const splitPastedLine = (line) => {
  // findHeaderRow has already parsed each logical record and chosen its delimiter.
  if (Array.isArray(line)) return line;
  return parsePastedTable(line).records[0] || [];
};

const findHeaderRow = (rawText, requiredHeaders = []) => {
  const table = parsePastedTable(rawText);
  const lines = table.records;

  for (let index = 0; index < lines.length; index += 1) {
    const normalized = lines[index].map((cell) => normalizeText(cell));
    const hasRequired = requiredHeaders.every((header) =>
      normalized.includes(normalizeText(header))
    );
    if (hasRequired) {
      return {
        lines, headerIndex: index, headers: normalized,
        hasHeader: true, delimiter: table.delimiter,
      };
    }
  }

  return {
    lines, headerIndex: -1, headers: [],
    hasHeader: false, delimiter: table.delimiter,
  };
};

const getHeaderIndex = (headers, ...names) =>
  headers.findIndex((header) =>
    names.some((name) => header === normalizeText(name))
  );

const resolveColumnIndex = (found, fallbackIndex, ...names) => {
  if (!found?.hasHeader) return fallbackIndex;
  return getHeaderIndex(found.headers, ...names);
};

const getCell = (cells, index) => (index >= 0 ? String(cells[index] || '').trim() : '');

const inferArCategory = (...values) => {
  const text = normalizeText(values.filter(Boolean).join(' '));

  if (text.includes('eft')) return 'EFT-AR';
  if (text.includes('chargeback')) return 'Chargeback-AR';
  if (text.includes('rp')) return 'RP-AR';
  if (text.includes('shortage')) return 'Shortage-AR';
  if (text.includes('void')) return 'Voiding-AR';
  if (text.includes('unmatched') && text.includes('cc')) return 'Unmatched CC-AR';
  if (text.includes('no receipt') || text.includes('no-receipt')) return 'No receipt-AR';

  return 'Other-AR';
};

const parseArReportPaste = (rawText) => {
  const found = findHeaderRow(rawText, ['Store No', 'Date', 'Status', 'Type']);
  if (!found) return [];

  const { lines, headerIndex } = found;

  const indexes = {
    store: resolveColumnIndex(found, 0, 'Store No'),
    date: resolveColumnIndex(found, 1, 'Date'),
    status: resolveColumnIndex(found, 2, 'Status'),
    type: resolveColumnIndex(found, 3, 'Type'),
    narrative: resolveColumnIndex(found, 4, 'Narrative'),
    customerId: resolveColumnIndex(found, 5, 'Customer ID'),
    policy: resolveColumnIndex(found, 6, 'Policy Number'),
    internalReference: resolveColumnIndex(found, 7, 'Internal Reference'),
    externalReference: resolveColumnIndex(found, 8, 'External Reference'),
    amount: resolveColumnIndex(found, 9, 'Amount'),
    agent: resolveColumnIndex(found, 10, 'Agent Name'),
    notes: resolveColumnIndex(found, 11, 'Notes'),
  };

  return lines.slice(found.hasHeader ? headerIndex + 1 : 0).map((line) => {
    const cells = splitPastedLine(line);

    const office = getCell(cells, indexes.store).toUpperCase();
    const sourceDate = parseUsDateToKey(getCell(cells, indexes.date));
    const sourceStatus = getCell(cells, indexes.status);
    const sourceType = getCell(cells, indexes.type);
    const narrative = getCell(cells, indexes.narrative);
    const customerId = getCell(cells, indexes.customerId);
    const policy = getCell(cells, indexes.policy);
    const internalReference = getCell(cells, indexes.internalReference);
    const externalReference = getCell(cells, indexes.externalReference);
    const sourceAmount = moneyNumber(getCell(cells, indexes.amount));
    const sourceAgentName = getCell(cells, indexes.agent);
    const sourceNotes = getCell(cells, indexes.notes);

    if (!/^CA\d{3}$/i.test(office) || !sourceDate) return null;

    const hasIdentifier =
      customerId || policy || internalReference || externalReference;

    if (!hasIdentifier) return null;

    const category = inferArCategory(sourceType, narrative, sourceNotes);

    return {
      source_report_type: 'AR',
      office_code: office,
      report_date: sourceDate,
      transaction_date: sourceDate,
      source_status: sourceStatus,
      source_type: sourceType,
      narrative,
      customer_id: customerId,
      policy_number: policy,
      internal_reference: internalReference,
      external_reference: externalReference,
      source_amount: sourceAmount,
      source_agent_name: sourceAgentName,
      source_notes: sourceNotes,
      client_name: narrative || policy || customerId || 'AR Report Item',
      violation_type: 'AR Violation',
      violation_category: category,
      fee_amount: 10,
      source_fingerprint: buildSourceFingerprint('AR', [
        office,
        sourceDate,
        sourceStatus,
        sourceType,
        customerId,
        policy,
        internalReference,
        externalReference,
        sourceAmount.toFixed(2),
      ]),
    };
  }).filter(Boolean);
};

const parseEftPaste = (rawText) => {
  const found = findHeaderRow(rawText, [
    'Office',
    'Report Date',
    'Policy Number',
    'Customer',
  ]);

  if (!found) return [];

  const { lines, headerIndex } = found;
  const indexes = {
    office: resolveColumnIndex(found, 0, 'Office'),
    reportDate: resolveColumnIndex(found, 1, 'Report Date'),
    policy: resolveColumnIndex(found, 2, 'Policy Number'),
    customer: resolveColumnIndex(found, 3, 'Customer'),
    company: resolveColumnIndex(found, 4, 'Company'),
    premium: resolveColumnIndex(found, 5, 'Premium'),
    agent: resolveColumnIndex(found, 6, 'Agent'),
    notes: resolveColumnIndex(found, 7, 'Notes'),
  };

  return lines.slice(found.hasHeader ? headerIndex + 1 : 0).map((line) => {
    const cells = splitPastedLine(line);

    const office = getCell(cells, indexes.office).toUpperCase();
    const reportDate = parseUsDateToKey(getCell(cells, indexes.reportDate));
    const policyNumber = getCell(cells, indexes.policy);
    const customer = getCell(cells, indexes.customer);
    const company = getCell(cells, indexes.company);
    const premium = moneyNumber(getCell(cells, indexes.premium));
    const sourceAgentName = getCell(cells, indexes.agent);
    const sourceNotes = getCell(cells, indexes.notes);

    if (!/^CA\d{3}$/i.test(office) || !reportDate || !policyNumber || !customer) {
      return null;
    }

    return {
      source_report_type: 'EFT',
      office_code: office,
      report_date: reportDate,
      transaction_date: reportDate,
      policy_number: policyNumber,
      client_name: customer,
      company,
      source_amount: premium,
      source_agent_name: sourceAgentName,
      source_notes: sourceNotes,
      violation_type: 'AR Violation',
      violation_category: 'EFT-AR',
      fee_amount: 10,
      source_fingerprint: buildSourceFingerprint('EFT', [
        office,
        reportDate,
        policyNumber,
        customer,
        premium.toFixed(2),
      ]),
    };
  }).filter(Boolean);
};

const parseRpPaste = (rawText) => {
  const found = findHeaderRow(rawText, [
    'Office',
    'Date',
    'Policy Number',
    'Narrative',
    'Insured',
  ]);

  if (!found) return [];

  const { lines, headerIndex } = found;
  const indexes = {
    office: resolveColumnIndex(found, 0, 'Office'),
    date: resolveColumnIndex(found, 1, 'Date'),
    policy: resolveColumnIndex(found, 2, 'Policy Number'),
    narrative: resolveColumnIndex(found, 3, 'Narrative'),
    insured: resolveColumnIndex(found, 4, 'Insured'),
    payments: resolveColumnIndex(found, 5, 'Payments'),
    checkIssued: resolveColumnIndex(found, 6, 'Check Issued'),
    agent: resolveColumnIndex(found, 7, 'Agent'),
  };

  return lines.slice(found.hasHeader ? headerIndex + 1 : 0).map((line) => {
    const cells = splitPastedLine(line);

    const office = getCell(cells, indexes.office).toUpperCase();
    const sourceDate = parseUsDateToKey(getCell(cells, indexes.date));
    const policy = getCell(cells, indexes.policy);
    const narrative = getCell(cells, indexes.narrative);
    const insured = getCell(cells, indexes.insured);
    const payments = moneyNumber(getCell(cells, indexes.payments));
    const checkIssued = getCell(cells, indexes.checkIssued);
    const sourceAgentName = getCell(cells, indexes.agent);

    if (!/^CA\d{3}$/i.test(office) || !sourceDate || !policy || !insured) {
      return null;
    }

    return {
      source_report_type: 'RP',
      office_code: office,
      report_date: sourceDate,
      transaction_date: sourceDate,
      policy_number: policy,
      client_name: insured,
      narrative,
      source_amount: payments,
      check_issued: checkIssued,
      source_agent_name: sourceAgentName,
      violation_type: 'AR Violation',
      violation_category: 'RP-AR',
      fee_amount: 10,
      source_fingerprint: buildSourceFingerprint('RP', [
        office,
        sourceDate,
        policy,
        insured,
        payments.toFixed(2),
        checkIssued,
      ]),
    };
  }).filter(Boolean);
};

const parseChargebackPaste = (rawText) => {
  const found = findHeaderRow(rawText, [
    'Store Number',
    'Customer Name',
    'Policy Number',
    'Amount',
  ]);

  if (!found) return [];

  const { lines, headerIndex } = found;
  const indexes = {
    store: resolveColumnIndex(found, 0, 'Store Number'),
    customer: resolveColumnIndex(found, 1, 'Customer Name'),
    policy: resolveColumnIndex(found, 2, 'Policy Number'),
    amount: resolveColumnIndex(found, 3, 'Amount'),
    responseBy: resolveColumnIndex(found, 4, 'Date To Response By'),
    agent: resolveColumnIndex(found, 5, 'Agent Name'),
    notes: resolveColumnIndex(found, 6, 'Notes'),
  };

  return lines.slice(found.hasHeader ? headerIndex + 1 : 0).map((line) => {
    const cells = splitPastedLine(line);

    const office = getCell(cells, indexes.store).toUpperCase();
    const customer = getCell(cells, indexes.customer);
    const policy = getCell(cells, indexes.policy);
    const sourceAmount = moneyNumber(getCell(cells, indexes.amount));
    const responseByRaw = getCell(cells, indexes.responseBy);
    const responseBy = parseUsDateToKey(responseByRaw) || responseByRaw;
    const responseByFingerprint = /^\d{1,2}[-/]\d{1,2}[-/]\d{2}$/.test(responseByRaw)
      ? responseByRaw
      : responseBy;
    const sourceAgentName = getCell(cells, indexes.agent);
    const sourceNotes = getCell(cells, indexes.notes);

    if (!/^CA\d{3}$/i.test(office) || !customer || !policy) return null;

    return {
      source_report_type: 'CHARGEBACK',
      office_code: office,
      report_date: '',
      transaction_date: '',
      policy_number: policy,
      client_name: customer,
      source_amount: sourceAmount,
      response_by: responseBy,
      source_agent_name: sourceAgentName,
      source_notes: sourceNotes,
      violation_type: 'AR Violation',
      violation_category: 'Chargeback-AR',
      fee_amount: 10,
      source_fingerprint: buildSourceFingerprint('CHARGEBACK', [
        office,
        policy,
        customer,
        sourceAmount.toFixed(2),
        responseByFingerprint,
      ]),
    };
  }).filter(Boolean);
};

const parseScanningPaste = (rawText) => {
  const found = findHeaderRow(rawText, [
    'Office',
    'Customer ID',
    'Customer Name',
    'Fee',
    'Transaction Date',
  ]);

  if (!found) return [];

  const { lines, headerIndex } = found;
  const indexes = {
    office: resolveColumnIndex(found, 0, 'Office'),
    customerId: resolveColumnIndex(found, 1, 'Customer ID'),
    customerName: resolveColumnIndex(found, 2, 'Customer Name'),
    fee: resolveColumnIndex(found, 3, 'Fee'),
    type: resolveColumnIndex(found, 4, 'Type'),
    transactionDate: resolveColumnIndex(found, 5, 'Transaction Date'),
    taskType: resolveColumnIndex(found, 6, 'Task Type'),
    csr: resolveColumnIndex(found, 7, 'CSR'),
    comments: resolveColumnIndex(found, 8, 'Comments'),
    policy: resolveColumnIndex(found, 9, 'Policy'),
    notes: resolveColumnIndex(found, 10, 'Notes'),
  };

  return lines.slice(found.hasHeader ? headerIndex + 1 : 0).map((line) => {
    const cells = splitPastedLine(line);

    const office = getCell(cells, indexes.office).toUpperCase();
    const customerId = getCell(cells, indexes.customerId);
    const clientName = getCell(cells, indexes.customerName);
    const fee = moneyNumber(getCell(cells, indexes.fee));
    const transactionType = getCell(cells, indexes.type);
    const transactionDate = parseUsDateToKey(getCell(cells, indexes.transactionDate));
    const taskType = getCell(cells, indexes.taskType);
    const csr = getCell(cells, indexes.csr);
    const comments = getCell(cells, indexes.comments);
    const policy = getCell(cells, indexes.policy);
    const sourceNotes = getCell(cells, indexes.notes);

    if (!/^CA\d{3}$/i.test(office) || !customerId || !clientName || !transactionDate) {
      return null;
    }

    const rowWeek = getWeekRange(new Date(`${transactionDate}T12:00:00`));

    return {
      source_report_type: 'SCANNING',
      customer_id: customerId,
      client_name: clientName,
      source_csr: csr,
      office_code: office,
      transaction_type: transactionType,
      transaction_date: transactionDate,
      task_type: taskType,
      comments,
      policy_number: policy,
      source_notes: sourceNotes,
      source_amount: fee,
      violation_type: 'Scanning Violation',
      violation_category: fee > 0 ? 'Charged-SV' : 'Uncharged-SV',
      fee_amount: fee,
      deduction_week_start: rowWeek.start,
      deduction_week_end: rowWeek.end,
      source_fingerprint: buildSourceFingerprint('SCANNING', [
        office,
        customerId,
        transactionDate,
        policy,
        taskType,
        fee.toFixed(2),
      ]),
    };
  }).filter(Boolean);
};


const getImportParseErrors = (row) =>
  Array.isArray(row?.validation_errors) ? row.validation_errors : [];

const parseDisqualifiedPolicyPaste = (rawText) => {
  const found = findHeaderRow(rawText, [
    'Store', 'Date', 'Policy Number', 'Customer Name',
    'BF Amount', 'Reason Policy was Disqualified',
  ]);
  const indexes = {
    store: resolveColumnIndex(found, 0, 'Store'),
    date: resolveColumnIndex(found, 1, 'Date'),
    agent: resolveColumnIndex(found, 2, 'Agent'),
    policy: resolveColumnIndex(found, 3, 'Policy Number'),
    customer: resolveColumnIndex(found, 4, 'Customer Name'),
    bfAmount: resolveColumnIndex(found, 5, 'BF Amount'),
    reason: resolveColumnIndex(found, 6, 'Reason Policy was Disqualified'),
    exceptionBy: resolveColumnIndex(found, 7, 'Exception by'),
    yes: resolveColumnIndex(found, 8, 'Yes'),
    no: resolveColumnIndex(found, 9, 'No'),
    email: resolveColumnIndex(found, 12, 'EMAILS', 'Email', 'Agent Email'),
  };
  const rows = [];
  const ignoredRows = [];
  const normalizedOffices = [];

  // Inspect every record, including data before a repeated header in a paste.
  // Only titles, headers, and non-data lines are ignored; malformed policies
  // remain in the preview, marked Fix Source Data and excluded from saving.
  found.lines.forEach((line, index) => {
    const cells = splitPastedLine(line);
    const sourceRow = cells.sourceLine || index + 1;
    const labels = cells.map((cell) => normalizeText(cell));
    const isHeader = labels.includes('policy number') && labels.includes('date') && labels.includes('customer name');
    const sourceOffice = getCell(cells, indexes.store);
    const sourceDate = getCell(cells, indexes.date);
    const policy = getCell(cells, indexes.policy);
    const customer = getCell(cells, indexes.customer);
    const isTitle = /^(new business\s*&\s*rewrites|week of\b|all available\b)/i.test(sourceOffice);
    const isSection = /^CA\d{3}\s*\(\d+\)$/i.test(sourceOffice);
    const looksLikeData = /^CA/i.test(sourceOffice) || Boolean(policy && customer && sourceDate);

    if (isHeader || isTitle || isSection || !looksLikeData) {
      ignoredRows.push({
        row: sourceRow,
        reason: isHeader ? 'Header' : isTitle || isSection ? 'Title / section / footer' : 'Non-data line',
        value: cells.filter(Boolean).join(' | '),
      });
      return;
    }

    // The supplied sheet contains CA022. Keep the source spelling in the
    // audit details while using CA022 to look up the actual office.
    const upperOffice = sourceOffice.trim().toUpperCase();
    const office = /^CA\d{3}\.$/.test(upperOffice) ? upperOffice.slice(0, -1) : upperOffice;
    if (office !== upperOffice) {
      normalizedOffices.push({ row: sourceRow, from: sourceOffice, to: office });
    }
    const transactionDate = parseUsDateToKey(sourceDate);
    const validationErrors = [];
    if (!/^CA\d{3}$/.test(office)) validationErrors.push('Office must be a CA code such as CA022.');
    if (!transactionDate) validationErrors.push(`Missing or invalid date: ${sourceDate || '(blank)'}. Use M/D/YY or M/D/YYYY.`);
    if (!policy) validationErrors.push('Policy Number is missing.');
    if (!customer) validationErrors.push('Customer Name is missing.');
    if (cells.length < 7) validationErrors.push('Copy the full row through the disqualification reason column.');
    if (!found.hasHeader && cells.length > 13) {
      validationErrors.push('More than 13 columns detected. Check for an extra tab or shifted columns.');
    }

    const directEmail = getCell(cells, indexes.email);
    const lastCell = String(cells[cells.length - 1] || '').trim();
    const sourceEmail = directEmail || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(lastCell) ? lastCell : '');
    const rowWeek = transactionDate
      ? getWeekRange(new Date(`${transactionDate}T12:00:00`))
      : { start: '', end: '' };

    rows.push({
      source_report_type: 'DISQUALIFIED',
      source_row_number: sourceRow,
      source_office_raw: sourceOffice,
      source_date_raw: sourceDate,
      validation_errors: validationErrors,
      office_code: office,
      report_date: transactionDate,
      transaction_date: transactionDate,
      source_agent_name: getCell(cells, indexes.agent),
      source_agent_email: sourceEmail,
      policy_number: policy,
      client_name: customer,
      source_amount: moneyNumber(getCell(cells, indexes.bfAmount)),
      disqualification_reason: getCell(cells, indexes.reason),
      exception_by: getCell(cells, indexes.exceptionBy),
      exception_yes: getCell(cells, indexes.yes),
      exception_no: getCell(cells, indexes.no),
      violation_type: 'Disqualified Policy',
      violation_category: 'Other-DP',
      fee_amount: 0,
      deduction_week_start: rowWeek.start,
      deduction_week_end: rowWeek.end,
      source_fingerprint: validationErrors.length ? '' : buildSourceFingerprint('DISQUALIFIED', [
        office, transactionDate, policy, customer,
      ]),
    });
  });

  rows.parseSummary = {
    policyRows: rows.length,
    correctionRows: rows.filter((row) => getImportParseErrors(row).length > 0).length,
    ignoredRows,
    normalizedOffices,
    delimiter: found.delimiter === '\t' ? 'tab-separated' : 'CSV',
  };
  return rows;
};


const IMPORT_CONFIG = {
  ar: {
    label: 'AR Reports',
    reportType: 'AR',
    parser: parseArReportPaste,
    targetTable: 'violations',
    usesTransactionWeek: false,
    description: 'Manager-cleaned AR report. All source statuses are imported.',
  },
  eft: {
    label: 'EFT Reports',
    reportType: 'EFT',
    parser: parseEftPaste,
    targetTable: 'violations',
    usesTransactionWeek: false,
    description: 'EFT ARs are charged to the deduction week selected on this page.',
  },
  rp: {
    label: 'RP Reports',
    reportType: 'RP',
    parser: parseRpPaste,
    targetTable: 'violations',
    usesTransactionWeek: false,
    description: 'RP ARs are charged to the deduction week selected on this page.',
  },
  chargeback: {
    label: 'Chargebacks',
    reportType: 'CHARGEBACK',
    parser: parseChargebackPaste,
    targetTable: 'violations',
    usesTransactionWeek: false,
    description: 'Chargebacks are charged to the deduction week selected on this page.',
  },
  scanning: {
    label: 'Scanning Violations',
    reportType: 'SCANNING',
    parser: parseScanningPaste,
    targetTable: 'violations',
    usesTransactionWeek: true,
    description: 'Scanning deductions are assigned to the week of each transaction date.',
  },
  disqualified: {
    label: 'Disqualified Policies',
    reportType: 'DISQUALIFIED',
    parser: parseDisqualifiedPolicyPaste,
    targetTable: 'disqualified_policies',
    usesTransactionWeek: true,
    description: 'Disqualified policies are assigned to the policy transaction week.',
  },
};

const groupEodMatchesByReceipt = (records = []) => {
  const grouped = {};

  records.forEach((record) => {
    const groupKey = [
      record.receipt_id || '',
      getUploadedDateOnly(record.date_time),
      record.office || '',
      normalizeText(record.customer),
    ].join('|');

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        ...record,
        grouped_match: true,
        receipt_id: record.receipt_id,
        receipt_sync_keys: [],
        receipt_row_ids: [],
        receipt_rows: [],
        receipt_total: 0,
        receipt_companies: [],
        receipt_policies: [],
        receipt_types: [],
      };
    }

    grouped[groupKey].receipt_rows.push(record);
    grouped[groupKey].receipt_row_ids.push(record.id);
    grouped[groupKey].receipt_sync_keys.push(record.sync_key);

    grouped[groupKey].receipt_total += Number(record.total || 0);

    if (record.company && !grouped[groupKey].receipt_companies.includes(record.company)) {
      grouped[groupKey].receipt_companies.push(record.company);
    }

    if (record.policy && !grouped[groupKey].receipt_policies.includes(record.policy)) {
      grouped[groupKey].receipt_policies.push(record.policy);
    }

    if (record.type && !grouped[groupKey].receipt_types.includes(record.type)) {
      grouped[groupKey].receipt_types.push(record.type);
    }
  });

  return Object.values(grouped);
};

const VIOLATION_CATEGORIES = [
  'No receipt-AR',
  'RP-AR',
  'EFT-AR',
  'Voiding-AR',
  'Unmatched CC-AR',
  'Shortage-AR',
  'Chargeback-AR',
  'Other-AR',
  'Charged-SV',
  'Uncharged-SV',
  'Unposted-DP',
  'Missing App-DP',
  'Missing Signatures-DP',
  'Missing Docs-DP',
  'Photo Issues-DP',
  'ID / REG Issues-DP',
  'Incorrect Info-DP',
  'Other-DP',
];

const calcFee = (violation_type, violation_category) => {
  if (violation_type === 'AR Violation') return 10;

  if (violation_type === 'Scanning Violation') {
    if (violation_category === 'Charged-SV') return 25;
    if (violation_category === 'Uncharged-SV') return 0;
  }

  return 0;
};

const createInitialRow = (agentEmail = '') => ({
  id: Date.now() + Math.random(),
  agent_email: agentEmail,
  office_code: '',
  region: '',
  violation_type: 'AR Violation',
  violation_category: '',
  transaction_date: todayKey(),
  reported_date: todayKey(),

  client_name: '',
  customer_id: '',
  policy_number: '',
  reference_id: '',

  variance_amount: 0,
  fee_amount: 10,
  details: '',

  match_results: [],
  selected_match: null,
  linked_eod_transfer_id: null,
  linked_sync_key: null,
  linked_receipt_id: null,
  linked_receipt_sync_keys: null,
  linked_receipt_row_ids: null,
  match_status: 'unmatched',
  isSearching: false,
});

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: '#334155',
};

const inputStyle = {
  height: 38,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '0 10px',
  fontSize: 13,
  background: '#fff',
};

// Review controls are display-only. Original indexes always refer to importRows,
// never to the filtered or paginated array, so assignments cannot move to another row.
const REVIEW_PAGE_SIZES = [25, 50, 100];
const reviewEmailKey = (value) => String(value ?? '').trim().toLowerCase();
const reviewMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : '—';
};

const reviewNotes = (row) => [
  row.disqualification_reason,
  row.narrative,
  row.task_type && `Task: ${row.task_type}`,
  row.comments && `Comments: ${row.comments}`,
  row.source_notes && `Notes: ${row.source_notes}`,
  row.details,
].filter(Boolean).join(' | ');

// AR/SV assignment and policy disqualification verification are different rules.
// Keep this shared gate consistent in the review table, counters and save handler.
const isDisqualifiedRow = (row) =>
  row?.source_report_type === 'DISQUALIFIED' || row?.violation_type === 'Disqualified Policy';

const isSheetMark = (value) =>
  ['x', 'yes', 'y', 'true', '1', 'checked', 'approved'].includes(normalizeText(value));

// Exception columns are a decision, not just notes:
//   Yes = exception approved -> do not import as disqualified.
//   No  = exception denied   -> continue through normal disqualification review.
// If an approver is present but neither/both decisions are marked, force review.
const getDisqualificationExceptionState = (row) => {
  if (!isDisqualifiedRow(row)) return { state: 'none', skip: false, needsReview: false };
  const yes = isSheetMark(row?.exception_yes);
  const no = isSheetMark(row?.exception_no);
  const approver = String(row?.exception_by || '').trim();
  if (yes && no) return { state: 'conflict', skip: false, needsReview: true,
    message: 'Both Exception Yes and No are marked. Correct the source row before importing.' };
  if (yes) return { state: 'approved', skip: true, needsReview: false,
    message: `Exception approved${approver ? ` by ${approver}` : ''}. This policy will not be imported as disqualified.` };
  if (no) return { state: 'denied', skip: false, needsReview: false,
    message: `Exception denied${approver ? ` by ${approver}` : ''}. Continue with the normal disqualification process.` };
  if (approver) return { state: 'undecided', skip: false, needsReview: true,
    message: `Exception reviewer ${approver} is listed, but neither Yes nor No is marked.` };
  return { state: 'none', skip: false, needsReview: false };
};

const isMissingTransactionAgent = (value) => {
  const normalized = normalizeText(value);
  return !normalized || ['email not found', 'not found', 'unknown', 'n/a', 'na', 'none'].includes(normalized);
};

const policyEmailKey = (value) => String(value ?? '').trim().toLowerCase();
const policyOfficeKey = (value) => {
  const match = String(value ?? '').trim().toUpperCase().match(/^(CA\d{3})(?:\b|\.)/);
  return match ? match[1] : '';
};
const isVoidedPolicyTransaction = (row) =>
  String(row?.voided ?? '').trim().toUpperCase().includes('VOIDED') ||
  ['VOID', 'TRUE', 'YES', 'Y', '1'].includes(String(row?.voided ?? '').trim().toUpperCase()) ||
  ['VOID', 'VOIDED'].includes(String(row?.type ?? '').trim().toUpperCase());

// Only documented display differences are equivalent. Do not strip arbitrary
// trailing digits: a non-zero term (-01, -02, ...) remains a different policy.
const policyIdentity = (value, expectedOffice = '') => {
  const raw = String(value ?? '').trim();
  let text = raw.normalize('NFKC').toUpperCase().replace(/[\u2010-\u2015\u2212]/g, '-');
  const annotation = text.match(/\s*(?:\(\s*(CA\d{1,3})\s*\)|\[\s*(CA\d{1,3})\s*\]|(?:\s+|-\s*)(CA\d{1,3}))\s*$/);
  const annotationLabel = annotation ? annotation[1] || annotation[2] || annotation[3] : '';
  // CA49 is an annotation for CA049, not an instruction to change an office.
  const annotationOffice = annotationLabel
    ? `CA${annotationLabel.slice(2).padStart(3, '0')}` : '';
  const annotationConflict = !!annotationOffice && annotationOffice !== policyOfficeKey(expectedOffice);
  if (annotation && !annotationConflict) text = text.slice(0, annotation.index).trim();
  const key = normalizeKeyText(text);
  const placeholder = !key || ['APPLICATION', 'APP', 'PENDING', 'TBD', 'NA', 'NONE', 'UNKNOWN'].includes(key);
  const zeroTerm = /-\s*00\s*$/.test(text);
  const baseKey = zeroTerm ? normalizeKeyText(text.replace(/-\s*00\s*$/, '')) : key;
  return { raw, key, baseKey, zeroTerm, placeholder, annotationOffice, annotationConflict };
};

const comparePolicyNumbers = (sourcePolicy, transactionPolicy, office) => {
  const source = policyIdentity(sourcePolicy, office);
  const transaction = policyIdentity(transactionPolicy, office);
  if (source.annotationConflict || transaction.annotationConflict) {
    return { matches: false, kind: 'different', explanation: 'The appended office label does not match the actual office.' };
  }
  if (source.placeholder || transaction.placeholder) {
    return { matches: false, kind: 'placeholder', explanation: 'A policy value is blank or a placeholder such as Application. Manager confirmation is required.' };
  }
  if (source.key === transaction.key) {
    return { matches: true, kind: source.raw === transaction.raw ? 'exact' : 'formatting',
      explanation: source.raw === transaction.raw ? 'Policy numbers match.'
        : 'Policy numbers match after formatting cleanup (spacing, punctuation or the matching office suffix).' };
  }
  if (source.zeroTerm !== transaction.zeroTerm && source.baseKey === transaction.baseKey) {
    return { matches: true, kind: 'optional_zero_term',
      explanation: 'Policy numbers match with an optional, explicitly separated -00 suffix. Other term numbers are not ignored.' };
  }
  return { matches: false, kind: 'different', explanation: 'Policy number differs from the source row.' };
};

// Receipt numbers are text in the transaction table. A numeric receipt may have
// whitespace, thousands separators or leading zeros; other identifiers stay literal.
const policyReceiptKey = (value) => {
  const text = String(value ?? '').normalize('NFKC').trim().toUpperCase();
  const numeric = text.replace(/[\s,]/g, '');
  return /^\d+$/.test(numeric) ? numeric.replace(/^0+(?=\d)/, '') : text;
};
const receiptMatches = (value, requested) => !!policyReceiptKey(requested) &&
  policyReceiptKey(value) === policyReceiptKey(requested);
const receiptMatchFields = (candidate, requested, includeAlternate = false) =>
  (includeAlternate ? ['receipt_id', 'carrier_receipt', 'reference'] : ['receipt_id'])
    .filter((field) => receiptMatches(candidate?.[field], requested));
const policySourceBinding = (row, email) => JSON.stringify([
  String(row.policy_number ?? '').trim(), policyOfficeKey(row.office_code),
  parseUsDateToKey(row.transaction_date), policyEmailKey(email),
  normalizeText(row.client_name), String(row.customer_id ?? '').trim(),
]);
const policyTransactionBinding = (row) => JSON.stringify([
  String(row?.sync_key ?? ''), String(row?.receipt_id ?? ''), String(row?.policy ?? '').trim(),
  policyOfficeKey(row?.office), getUploadedDateOnly(row?.date_time),
  policyEmailKey(row?.agent_email), String(row?.type ?? '').trim().toUpperCase(),
  normalizeText(row?.customer), String(row?.customer_id ?? '').trim(),
]);

const hasApprovedPolicyOverride = (source, transaction, assignedEmail) => {
  const approval = source.policy_link_override;
  return !!approval && approval.version === 1 && approval.confirmed_same_customer === true &&
    String(approval.reason ?? '').trim().length >= 10 &&
    approval.source_binding === policySourceBinding(source, assignedEmail) &&
    approval.transaction_binding === policyTransactionBinding(transaction) &&
    receiptMatchFields(transaction, approval.requested_receipt, approval.include_alternate).length > 0;
};

// Policy-number differences alone can be explicitly confirmed. The identity of
// the actual transaction, office, date and agent are never bypassed by that approval.
const getPolicyCoreIssues = (source, transaction, assignedEmail) => {
  if (!transaction) return ['Find and select the policy transaction by receipt number.'];
  const problems = [];
  const managerOverride = source?.policy_link_override?.kind === 'manager_override' &&
    hasApprovedPolicyOverride(source, transaction, assignedEmail);
  if (!String(transaction.sync_key ?? '').trim()) problems.push('Transaction has no sync key.');
  if (!String(transaction.receipt_id ?? '').trim()) problems.push('Transaction has no receipt number.');
  if (isVoidedPolicyTransaction(transaction)) problems.push('This transaction is voided.');
  if (!['NEW', 'RWR'].includes(String(transaction.type ?? '').trim().toUpperCase()) ||
      /\b(?:broker fee|endorsement fee|renewal fee|reinstatement fee|convenience fee|payment fee|installment fee)\b/i.test(String(transaction.company ?? ''))) {
    problems.push('Select the NEW or RWR policy transaction, not a payment or fee row.');
  }
  if (!policyOfficeKey(source.office_code) ||
      policyOfficeKey(source.office_code) !== policyOfficeKey(transaction.office)) {
    problems.push(`Office differs: source ${source.office_code || 'missing'}, transaction ${transaction.office || 'missing'}. Review a source-office correction before linking.`);
  }
  const sourceDate = parseUsDateToKey(source.transaction_date);
  if (!sourceDate || sourceDate !== getUploadedDateOnly(transaction.date_time)) {
    problems.push(`Transaction date differs: source ${sourceDate || 'missing'}, transaction ${getUploadedDateOnly(transaction.date_time) || 'missing'}. Correct the source date before linking.`);
  }
  if (!policyEmailKey(assignedEmail)) {
    problems.push('Select a valid agent for this policy.');
  } else if (isMissingTransactionAgent(transaction.agent_email)) {
    if (!managerOverride) problems.push('Transaction has no usable agent email. Verify the sheet agent and use Manager override to link this receipt.');
  } else if (policyEmailKey(assignedEmail) !== policyEmailKey(transaction.agent_email) && !managerOverride) {
    problems.push('Receipt belongs to a different agent. Correct the agent assignment or use Manager override after verification.');
  }
  return problems;
};
// A different store is never treated as formatting. An office correction is
// offered only after an exact receipt lookup and matching policy/customer,
// date, agent and NEW/RWR checks. The original source identity stays intact.
const getPolicyOfficeCorrectionPlan = (source, transaction, assignedEmail,
  requestedReceipt = '', includeAlternate = false) => {
  const fromOffice = policyOfficeKey(source?.office_code);
  const toOffice = policyOfficeKey(transaction?.office);
  const correctedSource = { ...source, office_code: toOffice };
  const errors = [];
  if (!fromOffice || !toOffice || fromOffice === toOffice) {
    errors.push('A valid, different source and transaction office is required.');
  }
  if (!receiptMatchFields(transaction, requestedReceipt, includeAlternate).length) {
    errors.push('Enter and search the exact receipt before correcting the source office.');
  }
  if (getImportParseErrors(source).length) errors.push('Correct the source-data errors first.');
  errors.push(...getPolicyCoreIssues(correctedSource, transaction, assignedEmail));
  if (!comparePolicyNumbers(source?.policy_number, transaction?.policy, toOffice).matches) {
    errors.push('Office correction requires a matching policy number; correct other source differences first.');
  }
  const sameCustomerName = !!normalizeKeyText(source?.client_name) &&
    normalizeKeyText(source.client_name) === normalizeKeyText(transaction?.customer);
  const sameCustomerId = !!String(source?.customer_id ?? '').trim() &&
    String(source.customer_id).trim() === String(transaction?.customer_id ?? '').trim();
  if (!sameCustomerName && !sameCustomerId) {
    errors.push('The customer name or customer ID must also match before correcting an office.');
  }
  return { fromOffice, toOffice, correctedSource, errors: [...new Set(errors)] };
};

const correctPolicySourceOffice = (row, candidate, canonicalEmail, confirmation) => {
  const plan = getPolicyOfficeCorrectionPlan(row, candidate, canonicalEmail,
    confirmation?.requestedReceipt, !!confirmation?.includeAlternate);
  if (plan.errors.length) throw new Error(plan.errors.join(' '));
  const reason = String(confirmation?.reason ?? '').trim();
  if (confirmation?.confirmed !== true || reason.length < 10) {
    throw new Error('Confirm the source-office correction and provide a reason of at least 10 characters.');
  }
  const correction = {
    version: 1, original_office: String(row.office_code), from_office: plan.fromOffice,
    corrected_office: plan.toOffice, reason, confirmed_same_customer: true,
    confirmed_at: new Date().toISOString(), requested_receipt: String(confirmation.requestedReceipt).trim(),
    receipt_id: String(candidate.receipt_id), sync_key: String(candidate.sync_key),
    policy_from_sheet: String(row.policy_number ?? ''), transaction_policy: String(candidate.policy ?? ''),
    source_customer: String(row.client_name ?? ''), transaction_customer: String(candidate.customer ?? ''),
    transaction_date: getUploadedDateOnly(candidate.date_time), assigned_agent: canonicalEmail,
    original_source_fingerprint: row.source_fingerprint || null,
  };
  return {
    ...clearPolicyLink(row), office_code: plan.toOffice,
    // Do not mutate the manager's sheet, transaction table, or original fingerprint.
    source_office_raw: row.source_office_raw || String(row.office_code),
    source_office_corrections: [...(row.source_office_corrections || []), correction],
  };
};

const getPolicyCandidateIssues = (source, transaction, assignedEmail) => {
  const problems = getPolicyCoreIssues(source, transaction, assignedEmail);
  if (transaction && !comparePolicyNumbers(source.policy_number, transaction.policy, source.office_code).matches &&
      !hasApprovedPolicyOverride(source, transaction, assignedEmail)) {
    problems.push('Policy number differs from the source row. Review the policy difference and confirm it with a reason.');
  }
  return problems;
};

const hasVerifiedPolicyLink = (row, canonicalEmail) => {
  if (!row?.policy_link_verified || !row.selected_match) return false;
  if (!String(row.linked_sync_key ?? '').trim() || !String(row.linked_receipt_id ?? '').trim()) return false;
  if (String(row.selected_match.sync_key ?? '') !== String(row.linked_sync_key) ||
      String(row.selected_match.receipt_id ?? '') !== String(row.linked_receipt_id)) return false;
  if (getPolicyCandidateIssues(row, row.selected_match, canonicalEmail).length) return false;
  const policyWeek = getWeekRange(`${row.transaction_date}T12:00:00`);
  return (!row.deduction_week_start || row.deduction_week_start === policyWeek.start) &&
    (!row.deduction_week_end || row.deduction_week_end === policyWeek.end);
};

const clearPolicyLink = (row) => ({
  ...row,
  selected_match: null,
  linked_eod_transfer_id: null,
  linked_sync_key: null,
  linked_receipt_id: null,
  linked_receipt_sync_keys: null,
  linked_receipt_row_ids: null,
  policy_link_verified: false,
  policy_link_override: null,
  policy_link_audit: null,
});

const getManagerPolicyOverridePlan = (source, transaction, assignedEmail, requestedReceipt = '', includeAlternate = false) => {
  const errors = [];
  const receiptFields = receiptMatchFields(transaction, requestedReceipt, includeAlternate);
  if (!receiptFields.length) errors.push('Enter and search the exact receipt before using Manager override.');
  if (!transaction || !String(transaction.sync_key ?? '').trim()) errors.push('The transaction needs a sync key.');
  if (!transaction || !String(transaction.receipt_id ?? '').trim()) errors.push('The transaction needs a receipt number.');
  if (transaction && isVoidedPolicyTransaction(transaction)) errors.push('A voided transaction cannot be linked.');
  if (transaction && (!['NEW', 'RWR'].includes(String(transaction.type ?? '').trim().toUpperCase()) ||
      /\b(?:broker fee|endorsement fee|renewal fee|reinstatement fee|convenience fee|payment fee|installment fee)\b/i.test(String(transaction.company ?? '')))) {
    errors.push('Manager override can only use the NEW/RWR policy line, not a fee/payment line.');
  }
  const sourceDate = parseUsDateToKey(source?.transaction_date);
  const transactionDate = getUploadedDateOnly(transaction?.date_time);
  if (!sourceDate || sourceDate !== transactionDate) {
    errors.push('Source date must match the selected transaction date before an override can be used.');
  }
  const sameCustomerName = !!normalizeKeyText(source?.client_name) &&
    normalizeKeyText(source.client_name) === normalizeKeyText(transaction?.customer);
  const sameCustomerId = !!String(source?.customer_id ?? '').trim() &&
    String(source.customer_id).trim() === String(transaction?.customer_id ?? '').trim();
  if (!sameCustomerName && !sameCustomerId) {
    errors.push('Customer name or customer ID must match before Manager override is allowed.');
  }
  if (!policyEmailKey(assignedEmail)) errors.push('Choose a valid agent before using Manager override.');
  return { errors: [...new Set(errors)], receiptFields, sourceDate, transactionDate };
};

const attachPolicyTransaction = (row, candidate, canonicalEmail, method = 'receipt selection', confirmation = null) => {
  const correctingOffice = confirmation?.kind === 'office_correction';
  const managerOverride = confirmation?.kind === 'manager_override';
  if (correctingOffice) {
    row = correctPolicySourceOffice(row, candidate, canonicalEmail, confirmation);
  }

  let effectiveEmail = canonicalEmail;
  if (managerOverride) {
    const reason = String(confirmation?.reason ?? '').trim();
    const requestedEmail = policyEmailKey(confirmation?.agent_email || canonicalEmail);
    const requestedOffice = policyOfficeKey(confirmation?.office_code || candidate?.office || row.office_code);
    const plan = getManagerPolicyOverridePlan(row, candidate, requestedEmail,
      confirmation?.requestedReceipt, !!confirmation?.includeAlternate);
    if (plan.errors.length) throw new Error(plan.errors.join(' '));
    if (confirmation?.confirmed !== true || reason.length < 10) {
      throw new Error('Confirm the Manager override and provide a reason of at least 10 characters.');
    }
    if (!requestedOffice || requestedOffice !== policyOfficeKey(candidate?.office)) {
      throw new Error(`For a Manager override, the corrected office must match the transaction office ${candidate?.office || '(missing)'}.`);
    }
    const candidateAgent = isMissingTransactionAgent(candidate?.agent_email) ? '' : policyEmailKey(candidate.agent_email);
    if (candidateAgent && requestedEmail !== candidateAgent) {
      throw new Error(`The selected transaction belongs to ${candidate.agent_email}. Choose that agent, or verify a different receipt.`);
    }

    const originalOffice = policyOfficeKey(row.office_code);
    const correction = originalOffice !== requestedOffice ? {
      version: 1, original_office: String(row.office_code || ''), from_office: originalOffice,
      corrected_office: requestedOffice, reason, confirmed_same_customer: true,
      confirmed_at: new Date().toISOString(), requested_receipt: String(confirmation.requestedReceipt || '').trim(),
      receipt_id: String(candidate.receipt_id || ''), sync_key: String(candidate.sync_key || ''),
      policy_from_sheet: String(row.policy_number ?? ''), transaction_policy: String(candidate.policy ?? ''),
      source_customer: String(row.client_name ?? ''), transaction_customer: String(candidate.customer ?? ''),
      transaction_date: getUploadedDateOnly(candidate.date_time), assigned_agent: requestedEmail,
      original_source_fingerprint: row.source_fingerprint || null, manager_override: true,
    } : null;

    row = {
      ...clearPolicyLink(row),
      office_code: requestedOffice,
      agent_email: requestedEmail,
      source_office_raw: row.source_office_raw || String(row.office_code || ''),
      source_office_corrections: correction
        ? [...(row.source_office_corrections || []), correction]
        : (row.source_office_corrections || []),
    };
    effectiveEmail = requestedEmail;
  }

  const comparison = comparePolicyNumbers(row.policy_number, candidate?.policy, row.office_code);
  let approval = null;
  if (confirmation && !correctingOffice) {
    const reason = String(confirmation.reason ?? '').trim();
    const fields = receiptMatchFields(candidate, confirmation.requestedReceipt, !!confirmation.includeAlternate);
    if (reason.length < 10 || confirmation.confirmed !== true || !fields.length) {
      throw new Error('Enter the receipt number, confirm the same customer/transaction, and provide a reason of at least 10 characters.');
    }
    approval = {
      version: 1, kind: managerOverride ? 'manager_override' : 'policy_override', reason, confirmed_same_customer: true,
      requested_receipt: String(confirmation.requestedReceipt).trim(),
      include_alternate: !!confirmation.includeAlternate, receipt_match_fields: fields,
      source_binding: policySourceBinding(row, effectiveEmail),
      transaction_binding: policyTransactionBinding(candidate), confirmed_at: new Date().toISOString(),
      transaction_agent_missing: isMissingTransactionAgent(candidate?.agent_email),
      manager_selected_agent: effectiveEmail,
      manager_corrected_office: policyOfficeKey(row.office_code),
    };
  }
  const proposed = { ...row, policy_link_override: approval };
  const problems = getPolicyCandidateIssues(proposed, candidate, effectiveEmail);
  if (problems.length) throw new Error(problems.join(' '));
  const policyWeek = getWeekRange(`${row.transaction_date}T12:00:00`);
  const selectedAt = approval?.confirmed_at || new Date().toISOString();
  return {
    ...proposed,
    agent_email: effectiveEmail,
    selected_match: candidate,
    linked_eod_transfer_id: candidate.id ?? null,
    linked_sync_key: candidate.sync_key,
    linked_receipt_id: String(candidate.receipt_id),
    linked_receipt_sync_keys: [candidate.sync_key],
    linked_receipt_row_ids: candidate.id == null ? [] : [candidate.id],
    policy_link_verified: true,
    policy_link_method: correctingOffice ? 'manager-confirmed source office correction'
      : managerOverride ? 'manager override with verified receipt'
        : approval ? 'manager-confirmed policy number difference' : `${method} (${comparison.kind})`,
    policy_link_audit: {
      version: 1,
      method: correctingOffice ? 'source_office_correction' : managerOverride ? 'manager_override' : approval ? 'manual_policy_override' : comparison.kind,
      selected_at: selectedAt,
      source_policy: String(row.policy_number ?? ''), transaction_policy: String(candidate.policy ?? ''),
      source_customer: String(row.client_name ?? ''), transaction_customer: String(candidate.customer ?? ''),
      receipt_id: String(candidate.receipt_id), sync_key: String(candidate.sync_key),
      office: policyOfficeKey(candidate.office), transaction_date: getUploadedDateOnly(candidate.date_time),
      transaction_agent: String(candidate.agent_email || ''), assigned_agent: effectiveEmail, transaction_type: String(candidate.type ?? ''),
      reason: correctingOffice
        ? `Source office corrected from ${row.source_office_corrections[row.source_office_corrections.length - 1].from_office} to ${row.office_code}. ${String(confirmation.reason).trim()}`
        : approval?.reason || comparison.explanation,
      requested_receipt: approval?.requested_receipt || null,
      confirmed_same_customer: approval ? true : null,
      manager_override: managerOverride,
    },
    policy_link_error: '', assignment_conflict: '', match_status: 'matched',
    deduction_week_start: policyWeek.start, deduction_week_end: policyWeek.end,
  };
};
// Keep audit data in the existing details field: no destructive source updates
// and no new schema is required. manager_email/imported_by remain the DB actor fields.
const appendPolicyLinkAudit = (details, row, savedBy = '') => {
  if (!isDisqualifiedRow(row) || !row.policy_link_audit || !row.linked_sync_key) return details;
  const audit = {
    ...row.policy_link_audit, saved_by: savedBy || '(assigned on save)',
    source_office_corrections: (row.source_office_corrections || []).map((item) => ({
      ...item, saved_by: savedBy || '(assigned on save)',
    })),
  };
  const readable = `Policy link: sheet "${audit.source_policy}" -> transaction "${audit.transaction_policy}"; receipt ${audit.receipt_id}. ${audit.reason}`;
  return `${details || ''}\n${readable}\n[POLICY_LINK_AUDIT_V1] ${JSON.stringify(audit)}`.trim();
};

const getImportReadiness = (row, canonicalEmail) => {
  const errors = getImportParseErrors(row);
  const exception = getDisqualificationExceptionState(row);
  const requiresTransaction = isDisqualifiedRow(row) && !exception.skip;
  const linkVerified = requiresTransaction && hasVerifiedPolicyLink(row, canonicalEmail);
  const transactionRequired = requiresTransaction && !linkVerified;
  const ready = !row.is_duplicate && !exception.skip && !exception.needsReview &&
    errors.length === 0 && !!canonicalEmail && !row.assignment_conflict && !transactionRequired;
  const statusLabel = row.is_duplicate ? 'Already Imported'
    : exception.skip ? 'Exception Approved — Skipped'
      : exception.needsReview ? 'Check Exception Decision'
        : errors.length ? 'Fix Source Data'
          : !canonicalEmail ? 'Select Agent'
            : row.assignment_conflict ? 'Check Agent'
              : transactionRequired ? 'Match Receipt Required' : 'Ready to import';
  const issue = row.is_duplicate ? ''
    : exception.skip || exception.needsReview ? exception.message
      : errors.length ? errors.join(' ')
        : !canonicalEmail ? 'Select a valid agent before importing.'
          : row.assignment_conflict || (transactionRequired
            ? row.policy_link_error || 'A verified policy transaction is required. Search by receipt number.' : '');
  return { errors, exception, skipped: exception.skip, requiresTransaction, linkVerified, transactionRequired, ready, statusLabel, issue };
};
const POLICY_TRANSACTION_COLUMNS = 'id,sync_key,agent_email,customer_id,customer,receipt_id,carrier_receipt,reference,date_time,type,policy,company,csr,office,premium,fee,total,voided';

// Read every page. Never treat the first 150 office transactions as the whole day.
const fetchPolicyTransactionPages = async (buildQuery) => {
  const result = [];
  const pageSize = 200;
  let offset = 0;
  while (true) {
    const { data, error, count } = await buildQuery()
      .order('id', { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    result.push(...page);
    offset += page.length;
    if (typeof count === 'number' ? offset >= count : page.length < pageSize) break;
    if (!page.length) throw new Error('The transaction lookup was incomplete. Retry the search.');
    if (offset >= 10000) throw new Error('Too many transactions to verify safely. Use a specific receipt number.');
  }
  return result;
};

const escapePolicyLike = (value) => String(value).replace(/[\\%_]/g, '\\$&');

const fetchPolicyReceiptCandidates = async (source, receiptNumber = '', options = {}) => {
  const receipt = String(receiptNumber ?? '').trim();
  if (receipt) {
    // Search all offices and dates the signed-in user is authorized to read.
    // Selection still checks the source office/date/agent. No RLS bypass is used.
    const key = policyReceiptKey(receipt);
    const fields = options.includeAlternate ? ['receipt_id', 'carrier_receipt', 'reference'] : ['receipt_id'];
    const found = new Map();
    for (const field of fields) {
      const exact = await fetchPolicyTransactionPages(() => supabase
        .from('daily_transaction_detail_transfers').select(POLICY_TRANSACTION_COLUMNS, { count: 'exact' })
        .eq(field, receipt));
      const formatted = await fetchPolicyTransactionPages(() => supabase
        .from('daily_transaction_detail_transfers').select(POLICY_TRANSACTION_COLUMNS, { count: 'exact' })
        .ilike(field, `%${escapePolicyLike(key)}%`));
      let rows = [...exact, ...formatted];
      // Last-resort numeric formatting search; client-side exact normalization
      // prevents receipt 440 from being confused with 1440 or 4400.
      if (!rows.some((item) => receiptMatches(item[field], key)) && /^\d+$/.test(key)) {
        const pattern = `%${key.split('').map(escapePolicyLike).join('%')}%`;
        rows = rows.concat(await fetchPolicyTransactionPages(() => supabase
          .from('daily_transaction_detail_transfers').select(POLICY_TRANSACTION_COLUMNS, { count: 'exact' })
          .ilike(field, pattern)));
      }
      rows.filter((item) => receiptMatches(item[field], key)).forEach((item) => {
        const rowKey = item.id != null ? `id:${item.id}` : `sync:${item.sync_key}`;
        const current = found.get(rowKey);
        const lookupFields = [...new Set([...(current?.policy_lookup_fields || []), field])];
        found.set(rowKey, { ...item, policy_lookup_fields: lookupFields });
      });
    }
    return [...found.values()];
  }

  const office = policyOfficeKey(source.office_code);
  if (!office) throw new Error('Correct the source office before looking up a policy.');
  const date = parseUsDateToKey(source.transaction_date);
  if (!date) throw new Error('Correct the transaction date first.');
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const data = await fetchPolicyTransactionPages(() => supabase
    .from('daily_transaction_detail_transfers')
    .select(POLICY_TRANSACTION_COLUMNS, { count: 'exact' })
    .ilike('office', `%${office}%`)
    .gte('date_time', `${date} 00:00:00`)
    .lt('date_time', `${next.toISOString().slice(0, 10)} 00:00:00`));
  return data.filter((transaction) => policyOfficeKey(transaction.office) === office);
};

const uniquePolicyTransactions = (transactions) => {
  const seen = new Set();
  return transactions.filter((transaction) => {
    const key = String(transaction.sync_key || `row:${transaction.id}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// Recheck policy links against current database rows immediately before any save.
// This is a page-level safeguard; it does not create a database trigger.
const revalidatePolicyLinks = async (rows) => {
  const keys = [...new Set(rows.map((row) => String(row.linked_sync_key || '').trim()).filter(Boolean))];
  const byKey = new Map();
  for (const keyChunk of chunkArray(keys, 100)) {
    const transactions = await fetchPolicyTransactionPages(() =>
      supabase.from('daily_transaction_detail_transfers')
        .select(POLICY_TRANSACTION_COLUMNS, { count: 'exact' }).in('sync_key', keyChunk));
    transactions.forEach((transaction) => {
      const key = String(transaction.sync_key);
      const list = byKey.get(key) || [];
      list.push(transaction);
      byKey.set(key, list);
    });
  }
  return rows.map((row) => {
    const candidates = byKey.get(String(row.linked_sync_key || '')) || [];
    const transaction = candidates.length === 1 ? candidates[0] : null;
    const errors = getPolicyCandidateIssues(row, transaction, row.agent_email);
    if (transaction && String(row.linked_receipt_id || '') !== String(transaction.receipt_id || '')) {
      errors.push('The linked receipt changed. Match it again.');
    }
    if (row.transaction_date && row.deduction_week_start &&
        getWeekRange(`${row.transaction_date}T12:00:00`).start !== row.deduction_week_start) {
      errors.push('Commission week differs from the policy transaction week.');
    }
    return { row, transaction, errors };
  });
};

const buildImportReviewEntries = (rows, agents, config, selectedWeekStart) => {
  const directory = new Map();
  agents.forEach((agent) => {
    const key = reviewEmailKey(agent.email);
    if (key && !directory.has(key)) directory.set(key, agent);
  });

  return rows.map((row, originalIndex) => {
    const agent = directory.get(reviewEmailKey(row.agent_email));
    const canonicalEmail = agent?.email || '';
    const readiness = getImportReadiness(row, canonicalEmail);
    const { errors, ready, statusLabel, issue, transactionRequired, linkVerified, requiresTransaction, skipped, exception } = readiness;
    const isManual = !!row.manually_assigned || row.match_status === 'agent_assigned';
    const sourceDate = row.report_date || row.transaction_date || row.source_date_raw || '';
    const deductionWeek = config.usesTransactionWeek
      ? row.deduction_week_start || '' : selectedWeekStart;
    const notes = reviewNotes(row);
    const fields = [
      originalIndex + 1, row.source_row_number, row.office_code, row.source_office_raw,
      row.client_name, row.policy_number, row.customer_id, row.internal_reference,
      row.external_reference, row.linked_receipt_id, row.reference_id,
      row.source_agent_name, row.source_csr, row.source_agent_email, row.agent_email,
      agent?.full_name, canonicalEmail, row.selected_match?.agent_email,
      sourceDate, deductionWeek, row.source_amount, row.fee_amount,
      row.source_status, row.source_type, row.violation_category, row.company,
      row.response_by, row.check_issued, row.exception_by, row.exception_yes,
      row.exception_no, row.selected_match?.policy, row.policy_link_audit?.reason, notes, issue, statusLabel,
    ];
    return {
      row, originalIndex, key: `preview-${originalIndex}`, canonicalEmail, agent,
      errors, ready, isManual, statusLabel, issue, sourceDate, deductionWeek, notes,
      transactionRequired, linkVerified, requiresTransaction, skipped, exception,
      searchText: fields.filter((value) => value !== null && value !== undefined)
        .join(' ').toLowerCase(),
    };
  });
};

const filterImportReviewEntries = (entries, query, office, status, sort) => {
  const terms = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = entries.filter((entry) => {
    if (office && String(entry.row.office_code || '') !== office) return false;
    if (!terms.every((term) => entry.searchText.includes(term))) return false;
    if (status === 'review' && entry.ready) return false;
    if (status === 'ready' && !entry.ready) return false;
    if (status === 'manual' && !entry.isManual) return false;
    if (status === 'unlinked' && !entry.transactionRequired) return false;
    if (status === 'skipped' && !entry.skipped) return false;
    return true;
  });
  return filtered.sort((a, b) => {
    if (sort === 'review') {
      const priority = Number(a.ready) - Number(b.ready);
      if (priority) return priority;
    }
    if (sort === 'office') {
      const order = String(a.row.office_code || '').localeCompare(String(b.row.office_code || ''));
      if (order) return order;
    }
    if (sort === 'agent') {
      const order = String(a.agent?.full_name || a.canonicalEmail)
        .localeCompare(String(b.agent?.full_name || b.canonicalEmail));
      if (order) return order;
    }
    if (sort === 'date') {
      const order = String(a.sourceDate).localeCompare(String(b.sourceDate));
      if (order) return order;
    }
    return a.originalIndex - b.originalIndex;
  });
};

const getImportReviewPage = (entries, requestedPage, pageSize) => {
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, requestedPage));
  const offset = (page - 1) * pageSize;
  return {
    page, pageCount, total: entries.length,
    first: entries.length ? offset + 1 : 0,
    last: Math.min(offset + pageSize, entries.length),
    rows: entries.slice(offset, offset + pageSize),
  };
};

function ImportReviewPager({ pageInfo, onPageChange, label, disabled = false }) {
  const { page, pageCount, first, last, total } = pageInfo;
  return (
    <div className={styles.reviewPager}>
      <span className={styles.reviewRange} role="status">
        Showing <strong>{first.toLocaleString()}–{last.toLocaleString()}</strong> of{' '}
        <strong>{total.toLocaleString()}</strong> {label === 'duplicates' ? 'skipped rows' : 'filtered rows'}
      </span>
      <nav className={styles.reviewPagerButtons} aria-label={`${label} pagination`}>
        <button type="button" aria-label={`${label}: first page`} disabled={disabled || page === 1}
          onClick={() => onPageChange(1)}>First</button>
        <button type="button" aria-label={`${label}: previous page`} disabled={disabled || page === 1}
          onClick={() => onPageChange(page - 1)}>Previous</button>
        <span>Page <strong>{page}</strong> of <strong>{pageCount}</strong></span>
        <button type="button" aria-label={`${label}: next page`} disabled={disabled || page === pageCount}
          onClick={() => onPageChange(page + 1)}>Next</button>
        <button type="button" aria-label={`${label}: last page`} disabled={disabled || page === pageCount}
          onClick={() => onPageChange(pageCount)}>Last</button>
      </nav>
    </div>
  );
}

// Yield before synchronous parsing so the browser can paint the wait state.
const yieldForImportPaint = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
  else setTimeout(resolve, 0);
});

function ImportActivityPanel({ activity, onCancel }) {
  const [elapsed, setElapsed] = useState(0);
  const panelRef = useRef(null);
  useEffect(() => {
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - activity.startedAt) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    if (panelRef.current?.scrollIntoView) panelRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return () => clearInterval(timer);
  }, [activity.startedAt]);
  const total = Number(activity.total) || 0;
  const completed = Math.min(total, Math.max(0, Number(activity.completed) || 0));
  const determinate = total > 0 && (activity.phase === 'matching' || activity.phase === 'duplicates');
  const label = activity.title || 'Working on the report';
  const progressText = determinate
    ? `${completed.toLocaleString()} of ${total.toLocaleString()} ${activity.phase === 'duplicates' ? 'source identities checked' : 'rows reviewed'}`
    : activity.detail || 'Waiting for the server';
  return (
    <section className={styles.importActivity} ref={panelRef} aria-label="Import progress">
      <div className={styles.importActivityHeading}>
        <span className={styles.importActivitySpinner} aria-hidden="true" />
        <div role="status" aria-live="polite" aria-atomic="true">
          <strong>{label}</strong><p>{progressText}</p>
        </div>
        <span className={styles.importActivityElapsed}>{elapsed}s elapsed</span>
      </div>
      <progress className={styles.importActivityProgress} max={determinate ? total : 100}
        value={determinate ? completed : undefined} aria-label={label} />
      <div className={styles.importActivityFooter}>
        <p>{onCancel
          ? 'Preview only. Nothing is being saved. Please wait while the report is checked.'
          : 'Saving is in progress. Please keep this page open and do not submit the batch again.'}
          {elapsed >= 20 && ' Large batches or slower server responses can take longer.'}</p>
        {onCancel && <button type="button" className={styles.importSecondaryButton} onClick={onCancel}>Cancel preview</button>}
      </div>
    </section>
  );
}

function PolicyReceiptMatcher({ row, originalIndex, agentOptions, onLink, onUnlink, disabled }) {
  const [receipt, setReceipt] = useState(String(row.linked_receipt_id || ''));
  const [results, setResults] = useState(row.policy_search_results || []);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [includeAlternate, setIncludeAlternate] = useState(false);
  const [overrideKey, setOverrideKey] = useState('');
  const [reviewKind, setReviewKind] = useState('policy');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [overrideOffice, setOverrideOffice] = useState('');
  const [overrideAgent, setOverrideAgent] = useState('');
  const requestVersion = useRef(0);
  const contextKey = [row.source_fingerprint, row.policy_number, row.office_code,
    row.transaction_date, row.agent_email].join('|');

  const resetConfirmation = () => {
    setOverrideKey(''); setOverrideReason(''); setOverrideConfirmed(false); setReviewKind('policy');
    setOverrideOffice(''); setOverrideAgent('');
  };
  useEffect(() => {
    requestVersion.current += 1;
    setSearching(false); setResults(row.policy_search_results || []); setSearched(false); setError('');
    setOverrideKey(''); setOverrideReason(''); setOverrideConfirmed(false); setReviewKind('policy');
    return () => { requestVersion.current += 1; };
  }, [contextKey, row.policy_search_results]);
  useEffect(() => {
    if (disabled) { requestVersion.current += 1; setSearching(false); }
  }, [disabled]);

  const canonical = (email) => agentOptions.find((agent) =>
    policyEmailKey(agent.email) === policyEmailKey(email))?.email || '';
  const linked = hasVerifiedPolicyLink(row, canonical(row.agent_email));
  const search = async () => {
    const version = ++requestVersion.current;
    setSearching(true); setError(''); setResults([]); setSearched(false); resetConfirmation();
    try {
      const found = await fetchPolicyReceiptCandidates(row, receipt, { includeAlternate });
      if (version !== requestVersion.current) return;
      const candidates = receipt.trim() ? found : found.filter((candidate) =>
        comparePolicyNumbers(row.policy_number, candidate.policy, row.office_code).matches);
      const sorted = uniquePolicyTransactions(candidates).sort((a, b) => {
        const score = (candidate) => {
          const assigned = canonical(row.agent_email) || canonical(candidate.agent_email);
          return getPolicyCoreIssues(row, candidate, assigned).length * 10 +
            (comparePolicyNumbers(row.policy_number, candidate.policy, row.office_code).matches ? 0 : 1);
        };
        return score(a) - score(b);
      });
      setResults(sorted); setSearched(true);
    } catch (searchError) {
      if (version === requestVersion.current) setError(searchError.message || 'Receipt search failed.');
    } finally {
      if (version === requestVersion.current) setSearching(false);
    }
  };

  const choose = (candidate, confirmation = null) => {
    try {
      onLink(originalIndex, candidate, row, confirmation);
      setError(''); resetConfirmation();
    } catch (selectionError) { setError(selectionError.message); }
  };

  return (
    <section className={styles.policyLinkPanel} aria-label={`Match receipt for row ${originalIndex + 1}`}>
      <div className={styles.policyLinkHeading}>
        <div><strong>{linked ? `Linked receipt: ${row.linked_receipt_id}` : 'Match a policy transaction'}</strong>
          <p>Sheet policy: <b>{row.policy_number || 'not provided'}</b> | {row.office_code} | {row.transaction_date}.
            Choose the NEW/RWR policy line, not a broker-fee or payment line.</p>
        </div>
        {linked && <button type="button" className={styles.reviewToolButton} disabled={disabled || searching}
          onClick={() => onUnlink(originalIndex, row)}>Remove receipt link</button>}
      </div>
      {linked && row.policy_link_audit && <div className={styles.policyMatchNotice} role="status">
        <strong>{row.policy_link_override ? 'Manager-confirmed policy difference' : 'Policy match verified'}</strong>
        <span>Sheet: {row.policy_number} | Transaction: {row.selected_match?.policy || '(blank)'}</span>
        <span>{row.policy_link_audit.reason}</span>
      </div>}
      <div className={styles.policySearchControls}>
        <label>Receipt number (optional)
          <input type="text" value={receipt} disabled={disabled || searching}
            aria-label={`Receipt number for row ${originalIndex + 1}`}
            placeholder="Enter the receipt number shown in transaction details"
            onChange={(event) => { setReceipt(event.target.value); setResults([]); setSearched(false); setError(''); resetConfirmation(); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); if (!disabled && !searching) search(); }
            }} />
        </label>
        <button type="button" className={styles.importPrimaryButton} disabled={disabled || searching}
          onClick={search}>{searching ? <><span className={styles.importButtonSpinner} aria-hidden="true" />Searching...</> : receipt.trim() ? 'Search receipt' : 'Find policy transactions'}</button>
      </div>
      <label className={styles.policySearchOption}><input type="checkbox" checked={includeAlternate}
        disabled={disabled || searching} onChange={(event) => {
          setIncludeAlternate(event.target.checked); setResults([]); setSearched(false); resetConfirmation();
        }} />Also search carrier receipt and reference fields</label>
      <p className={styles.policyHelpText}>Receipt search checks all offices and dates available to your account.
        With no receipt number, search uses the sheet office and source date. Matching office labels such as (CA048)
        or CA49 (for CA049), and an optional -00 suffix are allowed. A genuinely different policy requires a reason and confirmation.
        An incorrect sheet office can be corrected to a verified transaction office with a separate reason and confirmation.
        Date, agent, customer and NEW/RWR checks still apply. Linking here does not save the import.</p>
      {error && <p className={styles.reviewIssue} role="alert">{error}</p>}
      {searched && results.length === 0 && <div className={styles.policyEmpty} role="status">
        <strong>No accessible transaction matched that receipt.</strong>
        <p>Confirm it is the receipt_id in daily_transaction_detail_transfers, or enable carrier/reference search.
          This search has no office/date restriction. A record visible in the database editor but not here may need
          an administrator to check this app's project and read permissions. Do not substitute another receipt.</p>
      </div>}
      {searched && results.length > 0 && <p className={styles.policyHelpText} role="status">
        {results.length} transaction line(s) found. Eligible policy lines appear first; other lines explain why they cannot be used.
      </p>}
      {results.length > 0 && <div className={`${styles.policyCandidateList} ${overrideKey ? styles.policyCandidateListExpanded : ''}`}>
        {results.map((candidate, index) => {
          const effectiveEmail = canonical(row.agent_email) || canonical(candidate.agent_email);
          const coreProblems = getPolicyCoreIssues(row, candidate, effectiveEmail);
          const comparison = comparePolicyNumbers(row.policy_number, candidate.policy, row.office_code);
          const approved = hasApprovedPolicyOverride(row, candidate, effectiveEmail);
          const selected = linked && String(row.linked_sync_key) === String(candidate.sync_key);
          const candidateKey = `${candidate.sync_key || candidate.id}-${index}`;
          const canConfirm = !coreProblems.length && !comparison.matches &&
            receiptMatchFields(candidate, receipt, includeAlternate).length > 0;
          const officePlan = getPolicyOfficeCorrectionPlan(row, candidate, effectiveEmail, receipt, includeAlternate);
          const officeDiffers = !!officePlan.fromOffice && !!officePlan.toOffice && officePlan.fromOffice !== officePlan.toOffice;
          const canCorrectOffice = officeDiffers && officePlan.errors.length === 0;
          const managerPlan = getManagerPolicyOverridePlan(row, candidate, effectiveEmail, receipt, includeAlternate);
          const onlyCorrectableCoreProblems = coreProblems.length > 0 && coreProblems.every((problem) =>
            /office differs|different agent|no usable agent email/i.test(problem));
          const canManagerOverride = managerPlan.errors.length === 0 &&
            (onlyCorrectableCoreProblems || (!comparison.matches && coreProblems.length === 0));
          const open = overrideKey === candidateKey;
          const officeOpen = open && reviewKind === 'office';
          const managerOpen = open && reviewKind === 'manager';
          return (
            <article className={`${styles.policyCandidate} ${coreProblems.length ? styles.policyCandidateBlocked : !comparison.matches && !approved ? styles.policyCandidateReview : ''}`}
              key={candidateKey}>
              <div className={styles.policyCandidateTop}>
                <strong>Receipt {candidate.receipt_id || 'missing'} | {candidate.type || 'No type'} | {candidate.policy || 'No policy'}</strong>
                {canManagerOverride && !selected ? (
                  <button type="button" className={styles.policyMatchButton} disabled={disabled || searching}
                    onClick={() => {
                      setOverrideKey(managerOpen ? '' : candidateKey); setReviewKind('manager');
                      setOverrideReason(''); setOverrideConfirmed(false);
                      setOverrideOffice(policyOfficeKey(candidate.office) || policyOfficeKey(row.office_code));
                      setOverrideAgent(isMissingTransactionAgent(candidate.agent_email)
                        ? (canonical(row.agent_email) || effectiveEmail)
                        : (canonical(candidate.agent_email) || candidate.agent_email));
                    }}>
                    {managerOpen ? 'Cancel override' : 'Manager override'}
                  </button>
                ) : canCorrectOffice ? (
                  <button type="button" className={styles.policyMatchButton} disabled={disabled || searching}
                    onClick={() => { setOverrideKey(officeOpen ? '' : candidateKey); setReviewKind('office'); setOverrideReason(''); setOverrideConfirmed(false); }}>
                    {officeOpen ? 'Cancel correction' : 'Review office correction'}
                  </button>
                ) : !comparison.matches && !approved && !coreProblems.length ? (
                  <button type="button" className={styles.policyMatchButton}
                    disabled={disabled || searching || !canConfirm}
                    onClick={() => { setOverrideKey(open ? '' : candidateKey); setReviewKind('policy'); setOverrideReason(''); setOverrideConfirmed(false); }}>
                    {open ? 'Cancel review' : 'Review policy difference'}
                  </button>
                ) : <button type="button" className={styles.reviewToolButton}
                  disabled={disabled || searching || !!coreProblems.length || selected || (!comparison.matches && !approved)}
                  onClick={() => choose(candidate)}>{selected ? 'Linked' : 'Use this transaction'}</button>}
              </div>
              <div className={styles.policyCandidateMeta}>
                <span>{candidate.customer || 'Customer not recorded'}</span>
                <span>{candidate.office} | {getUploadedDateOnly(candidate.date_time)} | {candidate.company || 'Carrier not recorded'}</span>
                <span>Agent: {candidate.agent_email || 'not recorded'} | Transaction line total: {reviewMoney(candidate.total)}</span>
                {candidate.policy_lookup_fields?.length > 0 && <span>Found in: {candidate.policy_lookup_fields.join(', ')}</span>}
              </div>
              {coreProblems.length > 0 ? <p className={styles.reviewIssue}>{coreProblems.join(' ')}</p>
                : comparison.matches ? <p className={styles.policyEligible}>{comparison.explanation} Office, date and agent also match.</p>
                  : approved ? <p className={styles.policyEligible}>Policy difference confirmed: {row.policy_link_override.reason}</p>
                    : <p className={styles.policyDifferenceText}>{comparison.explanation}
                        {!canConfirm && ' Enter and search the receipt number to enable a documented manual match.'}</p>}
              {managerOpen && canManagerOverride && !selected && <div className={`${styles.policyOverridePanel} ${styles.policyManagerOverridePanel}`}>
                <strong>Manager override — correct the source assignment and link this verified receipt</strong>
                <p className={styles.policyHelpText}>Use this only after verifying the receipt/customer. The source row is corrected in this import only; the transaction table is not edited.</p>
                <div className={styles.policyOverrideFields}>
                  <label>Office to use
                    <input type="text" value={overrideOffice} disabled={disabled || searching}
                      onChange={(event) => setOverrideOffice(event.target.value.toUpperCase())} />
                  </label>
                  <label>Agent to charge / disqualify
                    <select value={overrideAgent} disabled={disabled || searching}
                      onChange={(event) => setOverrideAgent(event.target.value)}>
                      <option value="">Select agent</option>
                      {agentOptions.map((agent) => <option key={agent.email} value={agent.email}>
                        {agent.full_name ? `${agent.full_name} — ${agent.email}` : agent.email}
                      </option>)}
                    </select>
                  </label>
                </div>
                <dl className={styles.policyComparisonGrid}>
                  <div><dt>Sheet office</dt><dd>{row.office_code || '(missing)'}</dd></div>
                  <div><dt>Transaction office</dt><dd>{candidate.office || '(missing)'}</dd></div>
                  <div><dt>Sheet agent</dt><dd>{canonical(row.agent_email) || row.agent_email || '(missing)'}</dd></div>
                  <div><dt>Transaction agent</dt><dd>{candidate.agent_email || '(missing)'}</dd></div>
                  <div><dt>Sheet policy</dt><dd>{row.policy_number || '(missing)'}</dd></div>
                  <div><dt>Transaction policy</dt><dd>{candidate.policy || '(missing)'}</dd></div>
                </dl>
                <label className={styles.policyOverrideReason}>Why is this override correct?
                  <textarea value={overrideReason} maxLength={1200} disabled={disabled || searching}
                    placeholder="Example: receipt/customer verified. Transaction has Email Not Found, so I am keeping the agent from the manager sheet."
                    onChange={(event) => setOverrideReason(event.target.value)} />
                </label>
                <label className={styles.policyConfirmCheck}>
                  <input type="checkbox" checked={overrideConfirmed} disabled={disabled || searching}
                    onChange={(event) => setOverrideConfirmed(event.target.checked)} />
                  I verified this receipt belongs to this customer and approve these corrected values for this disqualification.
                </label>
                <button type="button" className={styles.importPrimaryButton}
                  disabled={disabled || searching || !overrideConfirmed || overrideReason.trim().length < 10 || !overrideOffice || !overrideAgent}
                  onClick={() => choose(candidate, { kind: 'manager_override', reason: overrideReason, confirmed: overrideConfirmed,
                    requestedReceipt: receipt, includeAlternate, office_code: overrideOffice, agent_email: overrideAgent })}>
                  Apply override and link receipt
                </button>
              </div>}
              {officeOpen && canCorrectOffice && !selected && <div className={`${styles.policyOverridePanel} ${styles.policyOfficeCorrectionPanel}`}>
                <strong>Correct this record's source office and link the verified receipt</strong>
                <dl className={styles.policyComparisonGrid}>
                  <div><dt>Original office from sheet</dt><dd>{row.office_code}</dd></div>
                  <div><dt>Verified transaction office</dt><dd>{officePlan.toOffice}</dd></div>
                  <div><dt>Customer from sheet</dt><dd>{row.client_name || '(not recorded)'}</dd></div>
                  <div><dt>Customer in transaction table</dt><dd>{candidate.customer || '(not recorded)'}</dd></div>
                  <div><dt>Policy from sheet</dt><dd>{row.policy_number}</dd></div>
                  <div><dt>Policy in transaction table</dt><dd>{candidate.policy}</dd></div>
                </dl>
                <label className={styles.policyOverrideReason}>Reason for correcting the source office
                  <textarea aria-label={`Office correction reason for ${candidate.receipt_id}`}
                    value={overrideReason} maxLength={1200} disabled={disabled || searching}
                    placeholder="Example: office was mistyped on the UW sheet; I verified the customer, policy and receipt against the transaction record."
                    onChange={(event) => setOverrideReason(event.target.value)} />
                </label>
                <label className={styles.policyConfirmCheck}>
                  <input type="checkbox" checked={overrideConfirmed} disabled={disabled || searching}
                    onChange={(event) => setOverrideConfirmed(event.target.checked)} />
                  I verified the source office is incorrect. Use {officePlan.toOffice} for this record only and link this receipt.
                </label>
                <p>The original office, corrected office, reason, receipt, confirmation time and saving manager are retained in the audit details.
                  This does not change the manager's sheet or daily_transaction_detail_transfers.</p>
                <button type="button" className={styles.importPrimaryButton}
                  disabled={disabled || searching || !overrideConfirmed || overrideReason.trim().length < 10}
                  onClick={() => choose(candidate, { kind: 'office_correction', reason: overrideReason,
                    confirmed: overrideConfirmed, requestedReceipt: receipt, includeAlternate })}>
                  Correct office to {officePlan.toOffice} and link
                </button>
              </div>}
              {open && reviewKind === 'policy' && canConfirm && !selected && <div className={styles.policyOverridePanel}>
                <strong>Confirm this is the correct transaction despite its policy value</strong>
                <dl className={styles.policyComparisonGrid}>
                  <div><dt>Policy from sheet</dt><dd>{row.policy_number || '(blank)'}</dd></div>
                  <div><dt>Policy in transaction table</dt><dd>{candidate.policy || '(blank / not recorded)'}</dd></div>
                  <div><dt>Customer from sheet</dt><dd>{row.client_name || '(not recorded)'}</dd></div>
                  <div><dt>Customer in transaction table</dt><dd>{candidate.customer || '(not recorded)'}</dd></div>
                </dl>
                <label className={styles.policyOverrideReason}>Reason for linking different policy values
                  <textarea aria-label={`Policy mismatch reason for ${candidate.receipt_id}`} value={overrideReason}
                    maxLength={1200} disabled={disabled || searching}
                    placeholder="Example: transaction policy was entered as Application; I verified the receipt against this customer's application."
                    onChange={(event) => setOverrideReason(event.target.value)} />
                </label>
                <label className={styles.policyConfirmCheck}><input type="checkbox" checked={overrideConfirmed}
                  disabled={disabled || searching} onChange={(event) => setOverrideConfirmed(event.target.checked)} />
                  I verified this is the same customer/policy transaction. Keep the sheet policy and link this receipt.
                </label>
                <p>The original sheet policy, transaction policy, receipt, reason, timestamp and saving manager are retained in the record's details.
                  This does not edit daily_transaction_detail_transfers.</p>
                <button type="button" className={styles.importPrimaryButton}
                  disabled={disabled || searching || !overrideConfirmed || overrideReason.trim().length < 10}
                  onClick={() => choose(candidate, { reason: overrideReason, confirmed: overrideConfirmed,
                    requestedReceipt: receipt, includeAlternate })}>Confirm and link receipt</button>
              </div>}
            </article>
          );
        })}
      </div>}
    </section>
  );
}

function ImportReviewDetails({ entry, buildDetails, agentOptions, onLink, onUnlink, disabled, readOnly }) {
  const { row, canonicalEmail } = entry;
  const fields = [
    ['Policy number from sheet', row.policy_number], ['Policy in linked transaction', row.selected_match?.policy],
    ['Policy match reason', row.policy_link_audit?.reason], ['Match confirmed at', row.policy_link_audit?.selected_at],
    ['Original sheet office', row.source_office_raw], ['Assigned office', row.office_code],
    ['Office correction reason', (row.source_office_corrections || []).map((item) => `${item.from_office} to ${item.corrected_office}: ${item.reason}`).join(' | ')],
    ['Customer ID', row.customer_id],
    ['Sheet agent / CSR', row.source_agent_name || row.source_csr],
    ['Sheet email', row.source_agent_email], ['Assigned email', canonicalEmail],
    ['Transaction email', row.selected_match?.agent_email],
    ['Linked receipt', row.linked_receipt_id], ['Linked sync key', row.linked_sync_key],
    ['Internal reference', row.internal_reference], ['External reference', row.external_reference],
    ['Source status (reference only)', row.source_status], ['Company', row.company],
    ['Source date', entry.sourceDate], ['Response deadline', row.response_by],
    ['Check issued', row.check_issued], ['Exception by (reference only)', row.exception_by],
    ['Exception Yes (reference only)', row.exception_yes], ['Exception No (reference only)', row.exception_no],
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  return (
    <div className={styles.reviewDetailsPanel}>
      {isDisqualifiedRow(row) && !readOnly && (
        <PolicyReceiptMatcher row={row} originalIndex={entry.originalIndex}
          agentOptions={agentOptions} onLink={onLink} onUnlink={onUnlink} disabled={disabled} />
      )}
      <div className={styles.reviewDetailsTitle}>Record {entry.originalIndex + 1}: full source details</div>
      {entry.issue && <p className={styles.reviewIssue}>{entry.issue}</p>}
      <dl className={styles.reviewDetailsGrid}>
        {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}
      </dl>
      {!row.linked_sync_key && !readOnly && (
        <p className={styles.reviewLinkNotice}>
          {isDisqualifiedRow(row)
            ? 'A verified policy transaction is required before this disqualification can be imported.'
            : 'Receipt link: optional. The assigned agent, commission week, fee and source details determine this AR/SV entry.'}
        </p>
      )}
      <div className={styles.reviewDetailsTitle}>
        {row.is_duplicate ? 'Source details from this paste (not re-imported)' : 'Details that will be saved'}
      </div>
      <p className={styles.reviewFullNotes}>{buildDetails(row)}</p>
      {row.source_raw_cells && (
        <details><summary>Original pasted cells</summary>
          <p className={styles.reviewFullNotes}>{row.source_raw_cells.join(' | ')}</p>
        </details>
      )}
    </div>
  );
}

function ImportReviewTable({ entries, agentOptions, config, expandedRows, onToggleRow,
  onAssign, onLink, onUnlink, buildDetails, disabled, readOnly = false, wrapNotes = false, tableRef }) {
  const isPolicy = config.reportType === 'DISQUALIFIED';
  const columns = isPolicy ? 7 : 8;
  return (
    <div className={`${styles.reviewTableViewport} ${readOnly ? styles.reviewDuplicateViewport : ''}`}
      ref={tableRef} role="region" tabIndex={0}
      aria-label={readOnly ? 'Already imported records' : 'New records preview'}>
      <table className={styles.reviewDataTable}>
        <caption className={styles.reviewSrOnly}>
          {readOnly ? 'Skipped duplicate records' : 'New report rows. Filters and pages do not limit the import.'}
        </caption>
        <thead><tr>
          <th scope="col" className={styles.reviewStatusColumn}>Row / status</th>
          <th scope="col" className={styles.reviewOfficeColumn}>Office / date</th>
          <th scope="col" className={styles.reviewCustomerColumn}>Customer / identifiers</th>
          <th scope="col" className={styles.reviewAgentColumn}>Agent assignment</th>
          <th scope="col" className={styles.reviewWeekColumn}>Commission week</th>
          <th scope="col" className={styles.reviewAmountColumn}>{isPolicy ? 'BF amount' : 'Source amount'}</th>
          {!isPolicy && <th scope="col" className={styles.reviewAmountColumn}>Fee</th>}
          <th scope="col" className={styles.reviewNotesColumn}>Reason / notes</th>
        </tr></thead>
        <tbody>
          {entries.length === 0 ? (
            <tr><td colSpan={columns} className={styles.reviewEmpty}>
              No rows match these filters. Clear the filters to see the rest of the batch.
            </td></tr>
          ) : entries.map((entry) => {
            const { row, canonicalEmail } = entry;
            const needsAgent = !readOnly && !canonicalEmail;
            const expanded = expandedRows.has(entry.key);
            return (
              <React.Fragment key={entry.key}>
                <tr className={!readOnly && !entry.ready && !entry.skipped ? styles.reviewAttentionRow : entry.skipped ? styles.reviewSkippedRow : ''}
                  data-original-index={entry.originalIndex}>
                  <td>
                    <div className={styles.reviewRowNumber}>
                      #{entry.originalIndex + 1}
                      {row.source_row_number && <span> · line {row.source_row_number}</span>}
                    </div>
                    <span className={`${styles.reviewBadge} ${readOnly ? styles.reviewBadgeDuplicate
                      : entry.ready ? styles.reviewBadgeReady : styles.reviewBadgeWarning}`}>
                      {entry.statusLabel}
                    </span>
                    {!!entry.issue && <div className={styles.reviewIssue}>{entry.issue}</div>}
                  </td>
                  <td><strong>{row.office_code || '—'}</strong>
                    {row.source_office_corrections?.length > 0 && <span className={styles.policyOfficeCorrected}>
                      Corrected from {row.source_office_raw}
                    </span>}
                    <span className={styles.reviewSecondary}>{entry.sourceDate || '—'}</span>
                    {!entry.sourceDate && row.response_by && (
                      <span className={styles.reviewSecondary}>Respond by {row.response_by}</span>
                    )}
                  </td>
                  <td><strong className={styles.reviewCustomerName}>{row.client_name || '—'}</strong>
                    {row.policy_number && <span className={styles.reviewIdentifier}>Policy: {row.policy_number}</span>}
                    {row.customer_id && <span className={styles.reviewIdentifier}>ID: {row.customer_id}</span>}
                    {isPolicy && row.policy_link_audit && row.selected_match?.policy !== row.policy_number && (
                      <span className={styles.reviewSecondary}>Receipt policy: {row.selected_match?.policy || '(blank)'}</span>
                    )}
                  </td>
                  <td className={needsAgent ? styles.reviewAgentMissingCell : ''}>
                    {readOnly ? <span className={styles.reviewSecondary}>
                      Previously saved; no new assignment will be made.
                    </span> : <>
                      <select
                        className={`${styles.agentAssignmentSelect} ${needsAgent
                          ? styles.agentAssignmentNeedsReview : styles.agentAssignmentReady}`}
                        value={canonicalEmail} disabled={disabled}
                        aria-label={`Agent for row ${entry.originalIndex + 1}`}
                        aria-invalid={needsAgent}
                        onChange={(event) => onAssign(entry.originalIndex, event.target.value)}>
                        <option value="">&#9888; SELECT AGENT — REQUIRED</option>
                        {agentOptions.map((agent) => <option key={agent.email} value={agent.email}>
                          {agent.full_name ? `${agent.full_name} — ${agent.email}` : agent.email}
                        </option>)}
                      </select>
                      <span className={styles.reviewSecondary}>
                        {row.source_agent_name || row.source_csr
                          ? `Sheet: ${row.source_agent_name || row.source_csr}`
                          : row.source_agent_email ? `Sheet: ${row.source_agent_email}` : 'No agent name in source'}
                      </span>
                      {isPolicy && <div className={styles.policyLinkSummary}>
                        <span className={entry.linkVerified ? styles.policyLinkedLabel : styles.reviewUnlinked}>
                          {entry.linkVerified ? `Receipt ${row.linked_receipt_id} linked` : 'Policy receipt required'}
                        </span>
                        <button type="button" disabled={disabled}
                          className={entry.linkVerified ? styles.reviewDetailsButton : styles.policyMatchButton}
                          aria-expanded={expanded} aria-controls={`review-details-${entry.originalIndex}`}
                          onClick={() => { if (!expanded) onToggleRow(entry.key); }}>
                          {entry.linkVerified ? 'Review / change receipt' : 'Match receipt'}
                        </button>
                      </div>}
                    </>}
                  </td>
                  <td>{readOnly ? <span className={styles.reviewSecondary}>Unchanged</span>
                    : entry.deductionWeek || '—'}</td>
                  <td className={styles.reviewMoney}>{reviewMoney(row.source_amount)}</td>
                  {!isPolicy && <td className={styles.reviewMoney}>{reviewMoney(row.fee_amount)}</td>}
                  <td>
                    <div className={wrapNotes ? styles.reviewFullNotes : styles.reviewNotesExcerpt}>
                      {entry.notes || 'No reason or notes in the pasted row.'}
                    </div>
                    <button type="button" className={styles.reviewDetailsButton}
                      aria-expanded={expanded} aria-controls={`review-details-${entry.originalIndex}`}
                      onClick={() => onToggleRow(entry.key)}>
                      {expanded ? 'Hide details' : 'View full details'}
                    </button>
                  </td>
                </tr>
                {expanded && <tr id={`review-details-${entry.originalIndex}`}>
                  <td colSpan={columns} className={styles.reviewExpandedCell}>
                    <ImportReviewDetails entry={entry} buildDetails={buildDetails} agentOptions={agentOptions}
                      onLink={onLink} onUnlink={onUnlink} disabled={disabled} readOnly={readOnly} />
                  </td>
                </tr>}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ImportReviewWorkspace({ rows, agents, config, weekStart, onAssign, onLink, onUnlink, onSave,
  saving, parsing, counts, buildDetails }) {
  const [query, setQuery] = useState('');
  const [office, setOffice] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('review');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [duplicatePage, setDuplicatePage] = useState(1);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateQuery, setDuplicateQuery] = useState('');
  const [wrapNotes, setWrapNotes] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedRows, setExpandedRows] = useState(() => new Set());
  const tableRef = useRef(null);
  const duplicateTableRef = useRef(null);
  const busy = saving || parsing;
  const isPolicy = config.reportType === 'DISQUALIFIED';

  const agentOptions = useMemo(() => {
    const seen = new Set();
    return agents.filter((agent) => {
      const key = reviewEmailKey(agent.email);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [agents]);
  const entries = useMemo(() => buildImportReviewEntries(rows, agents, config, weekStart),
    [rows, agents, config, weekStart]);
  const newEntries = useMemo(() => entries.filter((entry) => !entry.row.is_duplicate), [entries]);
  const duplicateEntries = useMemo(() => entries.filter((entry) => entry.row.is_duplicate), [entries]);
  const offices = useMemo(() => [...new Set(newEntries.map((entry) => entry.row.office_code).filter(Boolean))].sort(), [newEntries]);
  const filtered = useMemo(() => filterImportReviewEntries(newEntries, query, office, status, sort),
    [newEntries, query, office, status, sort]);
  const filteredDuplicates = useMemo(() => filterImportReviewEntries(duplicateEntries, duplicateQuery, '', 'all', 'source'),
    [duplicateEntries, duplicateQuery]);
  const pageInfo = getImportReviewPage(filtered, page, pageSize);
  const duplicatePageInfo = getImportReviewPage(filteredDuplicates, duplicatePage, 10);
  const readyTotal = newEntries.filter((entry) => entry.ready).length;
  const skippedTotal = newEntries.filter((entry) => entry.skipped).length;
  const reviewTotal = newEntries.filter((entry) => !entry.ready && !entry.skipped).length;
  const hiddenReady = readyTotal - filtered.filter((entry) => entry.ready).length;
  const filtersActive = !!query || !!office || status !== 'all';
  const unlinkedCount = newEntries.filter((entry) => entry.transactionRequired).length;

  useEffect(() => { setPage(pageInfo.page); }, [pageInfo.page]);
  useEffect(() => { setDuplicatePage(duplicatePageInfo.page); }, [duplicatePageInfo.page]);
  useEffect(() => { if (tableRef.current) tableRef.current.scrollTop = 0; },
    [pageInfo.page, pageSize, query, office, status, sort]);
  useEffect(() => { if (duplicateTableRef.current) duplicateTableRef.current.scrollTop = 0; },
    [duplicatePageInfo.page, duplicateQuery]);

  const resetFilters = () => { setQuery(''); setOffice(''); setStatus('all'); setPage(1); };
  const chooseStatus = (nextStatus) => { setStatus(nextStatus); setPage(1); };
  const toggleRow = (key) => setExpandedRows((previous) => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const tableProps = {
    agentOptions, config, expandedRows, onToggleRow: toggleRow,
    onAssign, onLink, onUnlink, buildDetails, disabled: busy, wrapNotes,
  };

  return (
    <div className={`${styles.reviewWorkspace} ${expanded ? styles.reviewWorkspaceExpanded : ''}`}>
      <div className={styles.reviewMetrics} aria-label="Whole batch summary">
        <div><span>Rows found</span><strong>{counts.total}</strong><small>Entire pasted batch</small></div>
        <button type="button" disabled={busy} onClick={() => chooseStatus('ready')}>
          <span>Ready to import</span><strong>{readyTotal}</strong><small>Show ready rows</small>
        </button>
        <button type="button" disabled={busy} onClick={() => setShowDuplicates((value) => !value)}>
          <span>Already imported</span><strong>{duplicateEntries.length}</strong><small>Excluded from this import</small>
        </button>
        <button type="button" disabled={busy} className={reviewTotal ? styles.reviewMetricAttention : ''}
          onClick={() => chooseStatus('review')}>
          <span>Needs review</span><strong>{reviewTotal}</strong><small>Show rows that cannot be saved yet</small>
        </button>
      </div>

      {duplicateEntries.length > 0 && (
        <section className={styles.reviewDuplicates}>
          <div className={styles.reviewSectionTop}>
            <div><h4>Already Imported <span>{duplicateEntries.length}</span></h4>
              <p>These rows are skipped. The preview below is from this paste, not a reload of saved history.</p>
            </div>
            <button type="button" className={styles.reviewToolButton} aria-expanded={showDuplicates}
              aria-controls="review-duplicate-panel" onClick={() => setShowDuplicates((value) => !value)}>
              {showDuplicates ? 'Hide skipped rows' : 'Review skipped rows'}
            </button>
          </div>
          {showDuplicates && <div id="review-duplicate-panel">
            <div className={styles.reviewDuplicateSearch}>
              <label>Search skipped rows<input type="search" aria-label="Search skipped rows" value={duplicateQuery}
                onChange={(event) => { setDuplicateQuery(event.target.value); setDuplicatePage(1); }}
                placeholder="Customer, policy, office, notes..." /></label>
            </div>
            <ImportReviewPager pageInfo={duplicatePageInfo} onPageChange={setDuplicatePage} label="duplicates" />
            <ImportReviewTable {...tableProps} entries={duplicatePageInfo.rows} readOnly tableRef={duplicateTableRef} />
            <ImportReviewPager pageInfo={duplicatePageInfo} onPageChange={setDuplicatePage} label="duplicates" />
          </div>}
        </section>
      )}

      <section className={styles.reviewNewSection}>
        <div className={styles.reviewSectionTop}>
          <div><span className={styles.reviewEyebrow}>REVIEW BEFORE IMPORTING</span>
            <h4>{config.label} <span>{newEntries.length} new rows</span></h4>
            <p>{isPolicy
              ? 'Disqualifications require a verified policy receipt. Use Match receipt for any unlinked row.'
              : 'Verify the agent, commission week, fee and explanation. Original receipt linking is optional.'}</p>
          </div>
          <button type="button" className={styles.reviewToolButton} aria-pressed={expanded}
            onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Standard height' : 'Expand review'}
          </button>
        </div>

        <div className={styles.reviewFilters}>
          <label className={styles.reviewSearchField}>Search all new rows
            <input type="search" aria-label="Search all new rows" value={query} disabled={busy}
              placeholder="Name, email, policy, ID, office or notes..."
              onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          </label>
          <label>Office<select aria-label="Office" value={office} disabled={busy}
            onChange={(event) => { setOffice(event.target.value); setPage(1); }}>
            <option value="">All offices</option>
            {offices.map((value) => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <label>Show<select aria-label="Show" value={status} disabled={busy} onChange={(event) => chooseStatus(event.target.value)}>
            <option value="all">All new rows</option><option value="review">Needs review</option>
            <option value="ready">Ready to import</option><option value="manual">Manual / name assigned</option>
            {isPolicy && <option value="unlinked">Receipt match required</option>}
            {isPolicy && <option value="skipped">Approved exceptions — skipped</option>}
          </select></label>
          <label>Sort by<select aria-label="Sort by" value={sort} disabled={busy}
            onChange={(event) => { setSort(event.target.value); setPage(1); }}>
            <option value="review">Needs review first</option><option value="source">Original paste order</option>
            <option value="office">Office</option><option value="agent">Agent name</option><option value="date">Source date</option>
          </select></label>
          <label>Rows per page<select aria-label="Rows per page" value={pageSize} disabled={busy}
            onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            {REVIEW_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select></label>
        </div>

        <div className={styles.reviewQuickActions}>
          <div>
            <button type="button" disabled={busy} aria-pressed={status === 'review'}
              className={`${styles.reviewFilterChip} ${status === 'review' ? styles.reviewChipActive : ''}`}
              onClick={() => chooseStatus(status === 'review' ? 'all' : 'review')}>
              Needs review <strong>{reviewTotal}</strong>
            </button>
            {isPolicy && <button type="button" disabled={busy} aria-pressed={status === 'unlinked'}
              className={`${styles.reviewFilterChip} ${status === 'unlinked' ? styles.reviewChipActive : ''}`}
              onClick={() => chooseStatus(status === 'unlinked' ? 'all' : 'unlinked')}>
              Receipt match required <strong>{unlinkedCount}</strong>
            </button>}
            {isPolicy && skippedTotal > 0 && <button type="button" disabled={busy} aria-pressed={status === 'skipped'}
              className={`${styles.reviewFilterChip} ${status === 'skipped' ? styles.reviewChipActive : ''}`}
              onClick={() => chooseStatus(status === 'skipped' ? 'all' : 'skipped')}>
              Approved exceptions skipped <strong>{skippedTotal}</strong>
            </button>}
            {filtersActive && <button type="button" className={styles.reviewDetailsButton}
              onClick={resetFilters} disabled={busy}>Clear filters</button>}
          </div>
          <label className={styles.reviewWrapToggle}><input type="checkbox" checked={wrapNotes}
            onChange={(event) => setWrapNotes(event.target.checked)} />Wrap full notes</label>
        </div>

        <ImportReviewPager pageInfo={pageInfo} onPageChange={setPage} label="new records" disabled={busy} />
        <ImportReviewTable {...tableProps} entries={pageInfo.rows} tableRef={tableRef} />
        <ImportReviewPager pageInfo={pageInfo} onPageChange={setPage} label="new records" disabled={busy} />

        <div className={styles.reviewSaveBar}>
          <div><strong>{readyTotal} ready rows across ALL pages</strong>
            <p>Search, office filters and pagination only change the view. They do not limit this import.</p>
            {(hiddenReady > 0 || reviewTotal > 0) && <p className={styles.reviewSaveWarning}>
              {hiddenReady > 0 ? `${hiddenReady} ready rows are hidden by the current filters and will also be imported. ` : ''}
              {reviewTotal > 0 ? `${reviewTotal} rows needing review will not be imported. ` : ''}
              {skippedTotal > 0 ? `${skippedTotal} approved exception row(s) will be skipped.` : ''}
            </p>}
          </div>
          <button type="button" className={styles.importPrimaryButton} onClick={onSave}
            disabled={busy || readyTotal === 0}>
            {saving ? 'Importing...' : `Import all ${readyTotal} ready rows`}
          </button>
        </div>
      </section>
    </div>
  );
}


const EnterViolation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const violationToEdit = location.state?.violationToEdit;

  const [currentDate, setCurrentDate] = useState(new Date());
  const week = useMemo(() => getWeekRange(currentDate), [currentDate]);

  const [rows, setRows] = useState([createInitialRow()]);
  const [agentList, setAgentList] = useState([]);
  const [officeList, setOfficeList] = useState([]);
  const [regionList, setRegionList] = useState([]);

  const [isOfficeModalOpen, setIsOfficeModalOpen] = useState(false);
  const [isRegionModalOpen, setIsRegionModalOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [importModal, setImportModal] = useState(null);
  const [importText, setImportText] = useState('');
  const [importRows, setImportRows] = useState([]);
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importReceipt, setImportReceipt] = useState(null);
  const [importActivity, setImportActivity] = useState(null);
  const policyDayCache = useRef(new Map());
  const importSaveInFlight = useRef(false);
  const previewVersion = useRef(0);
  const [importParseSummary, setImportParseSummary] = useState(null);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [pasteEditorOpen, setPasteEditorOpen] = useState(true);

  useEffect(() => () => { previewVersion.current += 1; }, []);

  useEffect(() => {
    const fetchLists = async () => {
      const { data: agents } = await supabase
        .from('profiles')
        .select('email, full_name')
        .order('full_name');

      setAgentList(agents || []);

      if (!violationToEdit && agents && agents.length > 0) {
        setRows([createInitialRow(agents[0].email)]);
      }

      fetchOffices();
      fetchRegions();
    };

    fetchLists();
  }, [violationToEdit]);

  useEffect(() => {
    if (!violationToEdit) return;

    setRows([{
      ...createInitialRow(violationToEdit.agent_email || ''),
      ...violationToEdit,
      id: violationToEdit.id,
      violation_type:
        violationToEdit.violation_type === 'AR Shortage'
          ? 'AR Violation'
          : violationToEdit.violation_type,
      violation_category: violationToEdit.violation_category || '',
      transaction_date: violationToEdit.transaction_date || todayKey(),
      reported_date: violationToEdit.reported_date || todayKey(),
      customer_id: violationToEdit.customer_id || '',
      policy_number: violationToEdit.policy_number || '',
      linked_eod_transfer_id: violationToEdit.linked_eod_transfer_id || null,
      linked_sync_key: violationToEdit.linked_sync_key || null,
      linked_receipt_id: violationToEdit.linked_receipt_id || null,
      linked_receipt_sync_keys: violationToEdit.linked_receipt_sync_keys || null,
      linked_receipt_row_ids: violationToEdit.linked_receipt_row_ids || null,
      match_status: violationToEdit.match_status || 'unmatched',
      selected_match: violationToEdit.linked_sync_key
        ? {
            id: violationToEdit.linked_eod_transfer_id,
            sync_key: violationToEdit.linked_sync_key,
            receipt_id: violationToEdit.linked_receipt_id,
            receipt_sync_keys: violationToEdit.linked_receipt_sync_keys || [],
            receipt_row_ids: violationToEdit.linked_receipt_row_ids || [],
          }
        : null,
    }]);

    setCurrentDate(new Date((violationToEdit.deduction_week_start || violationToEdit.week_start_date) + 'T12:00:00'));
  }, [violationToEdit]);

  const fetchOffices = async () => {
    const { data } = await supabase
      .from('offices')
      .select('id, office_name')
      .order('office_name');

    setOfficeList((data || []).map(o => ({ id: o.id, name: o.office_name })));
  };

  const fetchRegions = async () => {
    const { data } = await supabase
      .from('regions')
      .select('id, region_name')
      .order('region_name');

    setRegionList((data || []).map(r => ({ id: r.id, name: r.region_name })));
  };

  const addOffice = async (name) => {
    await supabase.from('offices').insert({ office_name: name });
    fetchOffices();
  };

  const deleteOffice = async (id) => {
    await supabase.from('offices').delete().eq('id', id);
    fetchOffices();
  };

  const addRegion = async (name) => {
    await supabase.from('regions').insert({ region_name: name });
    fetchRegions();
  };

  const deleteRegion = async (id) => {
    await supabase.from('regions').delete().eq('id', id);
    fetchRegions();
  };

  const getPrimarySearchValue = (row) => {
    if (row.violation_type === 'Scanning Violation') {
      return row.customer_id || row.client_name;
    }

    return row.policy_number || row.reference_id || row.client_name;
  };

  const handleRowChange = (index, field, value) => {
    const newRows = [...rows];
    newRows[index][field] = value;

    if (field === 'violation_type') {
      newRows[index].violation_category = '';
      newRows[index].variance_amount = value === 'AR Violation' ? newRows[index].variance_amount : 0;
      newRows[index].fee_amount = calcFee(value, '');
      newRows[index].match_results = [];
      newRows[index].selected_match = null;
      newRows[index].linked_eod_transfer_id = null;
      newRows[index].linked_sync_key = null;
      newRows[index].linked_receipt_id = null;
      newRows[index].linked_receipt_sync_keys = null;
      newRows[index].linked_receipt_row_ids = null;
      newRows[index].match_status = 'unmatched';
    }

    if (field === 'violation_category') {
      newRows[index].fee_amount = calcFee(newRows[index].violation_type, value);
    }

    if (
      [
        'transaction_date',
        'agent_email',
        'office_code',
        'client_name',
        'customer_id',
        'policy_number',
        'reference_id',
      ].includes(field)
    ) {
      newRows[index].selected_match = null;
      newRows[index].linked_eod_transfer_id = null;
      newRows[index].linked_sync_key = null;
      newRows[index].linked_receipt_id = null;
      newRows[index].linked_receipt_sync_keys = null;
      newRows[index].linked_receipt_row_ids = null;
      newRows[index].match_status = 'unmatched';
      newRows[index].match_results = [];
    }

    setRows(newRows);

    const updatedRow = newRows[index];
    const searchValue = getPrimarySearchValue(updatedRow);

    if (
      updatedRow.transaction_date &&
      updatedRow.agent_email &&
      updatedRow.office_code &&
      searchValue &&
      String(searchValue).trim().length >= 3
    ) {
      searchEodMatches(index, updatedRow, searchValue);
    }
  };

  const searchEodMatches = async (index, rowOverride, searchValueOverride) => {
    const row = rowOverride || rows[index];
    const rawQuery = String(searchValueOverride || getPrimarySearchValue(row) || '').trim();
    if (isDisqualifiedRow(row)) return; // DP uses the verified receipt selector below.

    if (!row.agent_email || !row.transaction_date || !row.office_code || rawQuery.length < 3) {
      return;
    }

    const searchingRows = [...rows];
    searchingRows[index] = {
      ...searchingRows[index],
      isSearching: true,
      selected_match: null,
      linked_eod_transfer_id: null,
      linked_sync_key: null,
      linked_receipt_id: null,
      linked_receipt_sync_keys: null,
      linked_receipt_row_ids: null,
      match_status: 'unmatched',
    };
    setRows(searchingRows);

    const likeQuery = `%${rawQuery}%`;
    const cleanQuery = rawQuery.replace(/[^a-zA-Z0-9]/g, '');
    const cleanLikeQuery = `%${cleanQuery}%`;
    const officeCodeOnly = getOfficeCodeOnly(row.office_code);

    const orFilters =
      row.violation_type === 'Scanning Violation'
        ? [
            `customer_id.ilike.${likeQuery}`,
            `customer.ilike.${likeQuery}`,
            `csr.ilike.${likeQuery}`,
            `sync_key.ilike.${likeQuery}`,
            `customer_id.ilike.${cleanLikeQuery}`,
            `sync_key.ilike.${cleanLikeQuery}`,
          ]
        : [
            `policy.ilike.${likeQuery}`,
            `customer.ilike.${likeQuery}`,
            `reference.ilike.${likeQuery}`,
            `sync_key.ilike.${likeQuery}`,
            `policy.ilike.${cleanLikeQuery}`,
            `reference.ilike.${cleanLikeQuery}`,
            `sync_key.ilike.${cleanLikeQuery}`,
          ];

    let queryBuilder = supabase
      .from('daily_transaction_detail_transfers')
      .select(`
        id,
        sync_key,
        agent_email,
        receipt_id,
        customer_id,
        customer,
        date_time,
        csr,
        office,
        company,
        policy,
        reference,
        premium,
        fee,
        total,
        type
      `)
      .eq('agent_email', row.agent_email)
      .gte('date_time', row.transaction_date)
      .lte('date_time', `${row.transaction_date} 23:59:59`)
      .or(orFilters.join(','))
      .limit(30);

    if (officeCodeOnly) {
      queryBuilder = queryBuilder.ilike('office', `%${officeCodeOnly}%`);
    }

    const { data, error: searchError } = await queryBuilder;

    const updatedRows = [...rows];
    updatedRows[index] = {
      ...updatedRows[index],
      isSearching: false,
    };

    if (searchError) {
      updatedRows[index].match_results = [];
      setRows(updatedRows);
      setError(`Failed to search EOD matches: ${searchError.message}`);
      return;
    }

    updatedRows[index].match_results = groupEodMatchesByReceipt(data || []);
    setRows(updatedRows);
  };

  const selectMatch = (rowIndex, match) => {
    const newRows = [...rows];

    newRows[rowIndex].selected_match = match;
    newRows[rowIndex].linked_eod_transfer_id = match.id;
    newRows[rowIndex].linked_sync_key = match.sync_key;
    newRows[rowIndex].linked_receipt_id = match.receipt_id || null;
    newRows[rowIndex].linked_receipt_sync_keys = match.receipt_sync_keys || [match.sync_key];
    newRows[rowIndex].linked_receipt_row_ids = match.receipt_row_ids || [match.id];
    newRows[rowIndex].match_status = 'matched';
    newRows[rowIndex].match_results = [];

    newRows[rowIndex].client_name = newRows[rowIndex].client_name || match.customer || '';
    newRows[rowIndex].customer_id = newRows[rowIndex].customer_id || match.customer_id || '';
    newRows[rowIndex].policy_number =
      newRows[rowIndex].policy_number ||
      match.policy ||
      match.receipt_policies?.[0] ||
      '';

    newRows[rowIndex].reference_id =
      newRows[rowIndex].reference_id ||
      match.policy ||
      match.receipt_id ||
      match.customer_id ||
      match.reference ||
       '';

    newRows[rowIndex].office_code = newRows[rowIndex].office_code || match.office || '';

    setRows(newRows);
  };

  const clearMatch = (rowIndex) => {
    const newRows = [...rows];

    newRows[rowIndex].selected_match = null;
    newRows[rowIndex].linked_eod_transfer_id = null;
    newRows[rowIndex].linked_sync_key = null;
    newRows[rowIndex].linked_receipt_id = null;
    newRows[rowIndex].linked_receipt_sync_keys = null;
    newRows[rowIndex].linked_receipt_row_ids = null;
    newRows[rowIndex].match_status = 'unmatched';
    newRows[rowIndex].match_results = [];

    setRows(newRows);
  };

  const cancelImportPreview = () => {
    if (importSaveInFlight.current) return;
    previewVersion.current += 1;
    setImportParsing(false);
    setImportActivity(null);
    setImportRows([]);
    setImportParseSummary(null);
    setMessage('Preview cancelled. Nothing has been saved.');
  };

  const closeImportModal = () => {
    if (importSaving || importSaveInFlight.current) return;
    previewVersion.current += 1;
    setImportParsing(false);
    setImportActivity(null);
    setMessage('');
    setImportModal(null);
    setImportText('');
    setImportRows([]);
    setImportParseSummary(null);
    setImportReceipt(null);
    setError('');
  };

  const loadDuplicateFingerprints = async (fingerprints, targetTable = 'violations', onProgress = () => {}, isCurrent = () => true) => {
    const existing = new Set();
    const uniqueFingerprints = [...new Set(fingerprints.filter(Boolean))];
    let completed = 0;
    onProgress(0, uniqueFingerprints.length);

    for (const chunk of chunkArray(uniqueFingerprints, 100)) {
      if (!isCurrent()) return existing;
      if (!chunk.length) continue;

      const { data, error: duplicateError } = await supabase
        .from(targetTable)
        .select('source_fingerprint')
        .in('source_fingerprint', chunk);

      if (!isCurrent()) return existing;
      if (duplicateError) throw duplicateError;

      (data || []).forEach((row) => {
        if (row.source_fingerprint) existing.add(row.source_fingerprint);
      });
      completed += chunk.length;
      onProgress(completed, uniqueFingerprints.length);
    }

    return existing;
  };

  const findAgentEmailByName = (sourceAgentName) => {
    const normalized = normalizeText(sourceAgentName);
    if (!normalized) return '';

    const exact = agentList.filter(
      (agent) => normalizeText(agent.full_name) === normalized && agent.email
    );
    const uniqueEmails = new Set(exact.map((agent) => policyEmailKey(agent.email)));
    return uniqueEmails.size === 1 ? exact[0].email : '';
  };

  const buildCandidateIdentifiers = (row) => {
    return [
      row.policy_number,
      row.customer_id,
      row.internal_reference,
      row.external_reference,
    ]
      .map((value) => normalizeKeyText(value))
      .filter(Boolean);
  };

  const getCanonicalAgentEmail = (candidateEmail = '') => {
    const normalizedEmail = normalizeText(candidateEmail);
    if (!normalizedEmail) return '';

    const profile = agentList.find(
      (agent) => normalizeText(agent.email) === normalizedEmail
    );

    return profile?.email || '';
  };

  const matchDisqualifiedImportRow = async (row) => {
    const fromEmail = getCanonicalAgentEmail(row.source_agent_email);
    const fromName = getCanonicalAgentEmail(findAgentEmailByName(row.source_agent_name));
    const sourceAgent = fromEmail || fromName;
    const cacheKey = `${policyOfficeKey(row.office_code)}|${row.transaction_date}`;
    if (!policyDayCache.current.has(cacheKey)) {
      policyDayCache.current.set(cacheKey, fetchPolicyReceiptCandidates(row));
    }
    let transactions;
    try {
      transactions = await policyDayCache.current.get(cacheKey);
    } catch (lookupError) {
      policyDayCache.current.delete(cacheKey);
      // Keep the row visible for receipt lookup; never silently drop a policy on a lookup error.
      return { ...clearPolicyLink(row), agent_email: sourceAgent, match_status: 'unmatched',
        policy_link_error: `Transaction lookup failed: ${lookupError.message}` };
    }
    const policyRows = uniquePolicyTransactions(transactions.filter((candidate) =>
      comparePolicyNumbers(row.policy_number, candidate.policy, row.office_code).matches));
    const available = policyRows.filter((candidate) => {
      const assigned = sourceAgent || getCanonicalAgentEmail(candidate.agent_email);
      return getPolicyCandidateIssues(row, candidate, assigned).length === 0;
    });
    const base = { ...clearPolicyLink(row), agent_email: sourceAgent,
      policy_search_results: policyRows, match_status: sourceAgent ? 'agent_assigned' : 'unmatched' };
    if (available.length === 1) {
      const candidate = available[0];
      return attachPolicyTransaction(base, candidate,
        sourceAgent || getCanonicalAgentEmail(candidate.agent_email), 'automatic policy/date/office match');
    }
    return { ...base, policy_link_error: available.length > 1
      ? 'Several policy transactions match. Enter the receipt number and select the correct transaction.'
      : 'No verified policy transaction selected. Search by receipt number.' };
  };

  const matchImportRow = async (row) => {
    if (isDisqualifiedRow(row)) return matchDisqualifiedImportRow(row);
    const officeCode = getOfficeCodeOnly(row.office_code);
    const identifiers = buildCandidateIdentifiers(row);
    const cleanCustomer = normalizeText(row.client_name);
    const cleanCsr = normalizeText(row.source_csr);
    const exactAgentFromSheet = findAgentEmailByName(row.source_agent_name);
    const exactEmailFromSheet = getCanonicalAgentEmail(row.source_agent_email);

    let query = supabase
      .from('daily_transaction_detail_transfers')
      .select(
        'id, sync_key, agent_email, customer_id, customer, receipt_id, reference, date_time, type, policy, company, csr, office, premium, fee, total'
      )
      .ilike('office', `%${officeCode}%`)
      .limit(150);

    if (row.transaction_date) {
      query = query
        .gte('date_time', `${row.transaction_date} 00:00:00`)
        .lte('date_time', `${row.transaction_date} 23:59:59`);
    } else if (row.policy_number) {
      const rawPolicy = String(row.policy_number).trim();
      query = query.or(
        `policy.ilike.%${rawPolicy}%,reference.ilike.%${rawPolicy}%,receipt_id.ilike.%${rawPolicy}%`
      );
    }

    const { data, error: matchError } = await query;
    if (matchError) {
      const assigned = exactEmailFromSheet || getCanonicalAgentEmail(exactAgentFromSheet);
      return { ...clearPolicyLink(row), agent_email: assigned,
        match_status: assigned ? 'agent_assigned' : 'unmatched',
        optional_lookup_note: `Optional receipt lookup was unavailable: ${matchError.message}` };
    }

    const candidates = (data || []).filter((candidate) => {
      const candidateIdentifiers = [
        candidate.policy,
        candidate.customer_id,
        candidate.reference,
        candidate.receipt_id,
        candidate.sync_key,
      ]
        .map((value) => normalizeKeyText(value))
        .filter(Boolean);

      const identifierMatch =
        identifiers.length > 0 &&
        identifiers.some((identifier) => candidateIdentifiers.includes(identifier));

      const customerMatch =
        cleanCustomer &&
        normalizeText(candidate.customer) === cleanCustomer;

      const csrMatch =
        cleanCsr &&
        normalizeText(candidate.csr) === cleanCsr;

      if (row.source_report_type === 'SCANNING') {
        return identifierMatch && (!cleanCsr || csrMatch);
      }

      return identifierMatch || customerMatch;
    });

    const grouped = groupEodMatchesByReceipt(candidates);

    if (grouped.length === 1) {
      const match = grouped[0];
      const sheetEmail = exactEmailFromSheet || getCanonicalAgentEmail(exactAgentFromSheet);
      const transactionEmail = getCanonicalAgentEmail(match.agent_email);
      if (sheetEmail && transactionEmail && policyEmailKey(sheetEmail) !== policyEmailKey(transactionEmail)) {
        return { ...clearPolicyLink(row), agent_email: sheetEmail, match_status: 'ambiguous',
          match_results: grouped,
          assignment_conflict: `Sheet agent ${sheetEmail} differs from transaction agent ${transactionEmail}. Select the responsible agent to confirm.` };
      }

      return {
        ...row,
        match_status: 'matched',
        match_results: grouped,
        selected_match: match,
        agent_email:
          exactEmailFromSheet ||
          getCanonicalAgentEmail(match.agent_email) ||
          getCanonicalAgentEmail(exactAgentFromSheet) ||
          '',
        client_name: row.client_name || match.customer || '',
        customer_id: row.customer_id || match.customer_id || '',
        policy_number:
          row.policy_number ||
          match.policy ||
          match.receipt_policies?.[0] ||
          '',
        linked_eod_transfer_id: match.id || null,
        linked_sync_key: match.sync_key || null,
        linked_receipt_id: match.receipt_id || null,
        linked_receipt_sync_keys: match.receipt_sync_keys || [match.sync_key],
        linked_receipt_row_ids: match.receipt_row_ids || [match.id],
      };
    }

    if (exactEmailFromSheet || exactAgentFromSheet) {
      const fallbackEmail =
        exactEmailFromSheet || getCanonicalAgentEmail(exactAgentFromSheet);

      return {
        ...row,
        agent_email: fallbackEmail,
        match_status: fallbackEmail ? 'agent_assigned' : 'unmatched',
        match_results: grouped,
      };
    }

    return {
      ...row,
      match_status: grouped.length > 1 ? 'ambiguous' : 'unmatched',
      match_results: grouped,
    };
  };

  const previewImport = async () => {
    if (importSaveInFlight.current || importParsing) return;
    const version = ++previewVersion.current;
    const startedAt = Date.now();
    const isCurrent = () => version === previewVersion.current;
    const progress = (next) => {
      if (isCurrent()) setImportActivity({ startedAt, ...next });
    };
    policyDayCache.current.clear();
    setImportParsing(true);
    setImportRows([]);
    setImportParseSummary(null);
    setImportReceipt(null);
    setError('');
    setMessage('');
    progress({ phase: 'parsing', title: 'Reading your pasted report', detail: 'Checking dates, columns and source data...' });
    try {
      await yieldForImportPaint();
      if (!isCurrent()) return;
      const config = IMPORT_CONFIG[importModal];
      if (!config) throw new Error('Select a report type first.');
      const parsed = config.parser(importText);
      setImportParseSummary(parsed.parseSummary || null);
      if (!parsed.length) {
        throw new Error(`No ${config.label} rows were recognized. Paste rows in the expected column order; headers are optional.`);
      }
      const existingFingerprints = await loadDuplicateFingerprints(
        parsed.map((row) => row.source_fingerprint), config.targetTable,
        (completed, total) => progress({ phase: 'duplicates', title: 'Checking for previous imports', completed, total }), isCurrent
      );
      if (!isCurrent()) return;
      const withDuplicates = parsed.map((row) => ({ ...row,
        is_duplicate: existingFingerprints.has(row.source_fingerprint) }));
      const matched = [];
      progress({ phase: 'matching', title: 'Matching agents and reviewing transactions', completed: 0, total: parsed.length });
      await yieldForImportPaint();
      for (const row of withDuplicates) {
        if (!isCurrent()) return;
        if (getImportParseErrors(row).length > 0) {
          matched.push({ ...row, match_status: 'parse_error', agent_email: '' });
        } else if (row.is_duplicate) {
          matched.push({ ...row, match_status: 'duplicate' });
        } else {
          matched.push(await matchImportRow(row));
        }
        if (!isCurrent()) return;
        progress({ phase: 'matching', title: 'Matching agents and reviewing transactions', completed: matched.length, total: parsed.length });
        // Cached matches and duplicate rows can finish without an I/O wait.
        // Yield periodically so the real counts and Cancel button can render.
        if (matched.length % 10 === 0) await yieldForImportPaint();
      }
      if (!isCurrent()) return;
      setImportRows(matched);
      setPasteEditorOpen(false);
    } catch (previewError) {
      if (isCurrent()) setError(`Import preview failed: ${previewError.message}`);
    } finally {
      if (isCurrent()) { setImportParsing(false); setImportActivity(null); }
    }
  };

  const setImportRowAgent = (rowIndex, agentEmail) => {
    if (importSaveInFlight.current) return;
    const email = getCanonicalAgentEmail(agentEmail);
    setImportRows((currentRows) => currentRows.map((row, index) => {
      if (index !== rowIndex || row.is_duplicate) return row;
      let next = { ...row, agent_email: email, assignment_conflict: '',
        match_status: email ? 'agent_assigned' : 'unmatched', manually_assigned: !!email };
      if (isDisqualifiedRow(row)) {
        if (!hasVerifiedPolicyLink(next, email)) next = { ...clearPolicyLink(next),
          policy_link_error: 'Agent assignment changed or has no verified link. Match the policy receipt.' };
      } else if (row.selected_match && policyEmailKey(row.selected_match.agent_email) !== policyEmailKey(email)) {
        next = clearPolicyLink(next);
      }
      return next;
    }));
  };

  const linkImportedPolicy = (index, candidate, expectedRow, confirmation = null) => {
    if (importSaveInFlight.current) return;
    const email = getCanonicalAgentEmail(expectedRow.agent_email) || getCanonicalAgentEmail(candidate.agent_email);
    const linked = attachPolicyTransaction(expectedRow, candidate, email, 'manager receipt selection', confirmation);
    setImportRows((currentRows) => currentRows.map((row, currentIndex) =>
      currentIndex === index && row === expectedRow ? linked : row));
  };

  const unlinkImportedPolicy = (index, expectedRow) => {
    if (importSaveInFlight.current) return;
    setImportRows((currentRows) => currentRows.map((row, currentIndex) =>
      currentIndex === index && row === expectedRow ? { ...clearPolicyLink(row),
        match_status: 'agent_assigned', policy_link_error: 'Receipt link removed. Select the correct policy transaction.' } : row));
  };

  const linkManualPolicy = (index, candidate, expectedRow, confirmation = null) => {
    const email = getCanonicalAgentEmail(expectedRow.agent_email) || getCanonicalAgentEmail(candidate.agent_email);
    const linked = attachPolicyTransaction(expectedRow, candidate, email, 'manager receipt selection', confirmation);
    setRows((currentRows) => currentRows.map((row, currentIndex) =>
      currentIndex === index && row === expectedRow ? linked : row));
  };

  const unlinkManualPolicy = (index, expectedRow) => {
    setRows((currentRows) => currentRows.map((row, currentIndex) =>
      currentIndex === index && row === expectedRow ? clearPolicyLink(row) : row));
  };

  const getImportCounts = () => importRows.reduce((counts, row) => {
    counts.total += 1;
    const state = getImportReadiness(row, getCanonicalAgentEmail(row.agent_email));
    if (row.is_duplicate) counts.duplicates += 1;
    else if (state.skipped) counts.skipped += 1;
    else if (state.ready) counts.matched += 1;
    else counts.review += 1;
    return counts;
  }, { total: 0, matched: 0, duplicates: 0, review: 0, unmatched: 0, skipped: 0 });

  const buildImportedDetails = (row, savedBy = '') => {
    const parts = [`Imported from ${row.source_report_type} report.`];

    if (row.source_office_raw && row.source_office_raw.toUpperCase() !== row.office_code) {
      parts.push(row.source_office_corrections?.length
        ? `Original sheet office: ${row.source_office_raw}; manager-corrected office: ${row.office_code}.`
        : `Sheet office: ${row.source_office_raw}; normalized office: ${row.office_code}.`);
    }

    if (isDisqualifiedRow(row) && row.linked_sync_key) {
      parts.push(`Verified policy receipt: ${row.linked_receipt_id}. Linked transaction: ${row.linked_sync_key}.`);
      if (row.policy_link_method) parts.push(`Link method: ${row.policy_link_method}.`);
    }
    if (row.optional_lookup_note) parts.push(row.optional_lookup_note);
    if (row.source_status) parts.push(`Source status: ${row.source_status}.`);
    if (row.source_type) parts.push(`Source type: ${row.source_type}.`);
    if (row.narrative) parts.push(`Narrative: ${row.narrative}.`);
    if (row.company) parts.push(`Company: ${row.company}.`);
    if (row.task_type) parts.push(`Task: ${row.task_type}.`);
    if (row.comments) parts.push(`Comments: ${row.comments}.`);
    if (row.source_notes) parts.push(`Notes: ${row.source_notes}.`);
    if (row.source_agent_name) parts.push(`Sheet agent: ${row.source_agent_name}.`);
    if (row.internal_reference) parts.push(`Internal ref: ${row.internal_reference}.`);
    if (row.external_reference) parts.push(`External ref: ${row.external_reference}.`);
    if (row.check_issued) parts.push(`Check issued: ${row.check_issued}.`);
    if (row.response_by) parts.push(`Response by: ${row.response_by}.`);
    if (row.disqualification_reason) {
      parts.push(`Disqualification reason: ${row.disqualification_reason}.`);
    }
    if (row.exception_by) parts.push(`Exception by: ${row.exception_by}.`);
    if (row.exception_yes) parts.push(`Exception Yes: ${row.exception_yes}.`);
    if (row.exception_no) parts.push(`Exception No: ${row.exception_no}.`);
    const exceptionState = getDisqualificationExceptionState(row);
    if (exceptionState.state !== 'none') parts.push(`Exception decision: ${exceptionState.state}.`);
    if (row.source_agent_email) {
      parts.push(`Sheet email: ${row.source_agent_email}.`);
    }

    if (Number.isFinite(Number(row.source_amount))) {
      parts.push(`Source amount: $${Number(row.source_amount || 0).toFixed(2)}.`);
    }

    return appendPolicyLinkAudit(parts.join(' '), row, savedBy);
  };

  const saveImport = async () => {
    if (importSaveInFlight.current || importParsing) return;
    const config = IMPORT_CONFIG[importModal];
    const importable = importRows.filter((row) =>
      getImportReadiness(row, getCanonicalAgentEmail(row.agent_email)).ready);

    if (!config) {
      setError('Select a report type first.');
      return;
    }

    if (!importable.length) {
      setError('There are no new rows with an assigned agent to import.');
      return;
    }

    if (
      !window.confirm(
        `Import ALL ${importable.length} ready ${config.label} rows across every page? Current search and filters do not limit this import.`
      )
    ) {
      return;
    }

    importSaveInFlight.current = true;
    setImportSaving(true);
    setError('');
    const startedAt = Date.now();
    setImportActivity({ startedAt, phase: 'session', title: 'Preparing your import', detail: 'Checking your sign-in session...' });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) throw new Error('Your session expired. Sign in before importing.');
      if (config.reportType === 'DISQUALIFIED') {
        setImportActivity({ startedAt, phase: 'validating', title: 'Rechecking policy receipt links',
          detail: `Verifying ${importable.length} ready policy records before saving...` });
        const checked = await revalidatePolicyLinks(importable);
        const invalid = checked.filter((item) => item.errors.length > 0);
        if (invalid.length) {
          const failed = new Map(invalid.map((item) => [item.row, item.errors.join(' ')]));
          setImportRows((currentRows) => currentRows.map((row) => failed.has(row)
            ? { ...clearPolicyLink(row), policy_link_error: failed.get(row), match_status: 'agent_assigned' } : row));
          throw new Error(`${invalid.length} policy link(s) changed or could not be verified. No batch was saved. Review the highlighted rows.`);
        }
      }
      const counts = getImportCounts();

      setImportActivity({ startedAt, phase: 'batch', title: 'Creating the import receipt', detail: 'Recording the batch information...' });
      const { data: batch, error: batchError } = await supabase
        .from('violation_import_batches')
        .insert({
          report_type: config.reportType,
          deduction_week_start: config.usesTransactionWeek ? null : week.start,
          deduction_week_end: config.usesTransactionWeek ? null : week.end,
          rows_pasted: counts.total,
          matched_rows: counts.matched,
          duplicate_rows: counts.duplicates,
          review_rows: counts.review,
          unmatched_rows: counts.unmatched,
          imported_by: user?.email || null,
        })
        .select('id')
        .single();

      if (batchError) throw batchError;

      const payload = importable.map((row) => {
        const deductionWeekStart = config.usesTransactionWeek
          ? row.deduction_week_start
          : week.start;

        const deductionWeekEnd = config.usesTransactionWeek
          ? row.deduction_week_end
          : week.end;

        return {
          agent_email: row.agent_email,
          office_code: row.office_code,
          region: '',
          violation_type: row.violation_type,
          violation_category: row.violation_category,
          transaction_date: row.transaction_date || null,
          reported_date: todayKey(),
          week_start_date: deductionWeekStart,
          week_end_date: deductionWeekEnd,
          deduction_week_start: deductionWeekStart,
          deduction_week_end: deductionWeekEnd,
          customer_id: row.customer_id || null,
          policy_number: row.policy_number || null,
          variance_amount: 0,
          fee_amount: Number(row.fee_amount || 0),
          client_name: row.client_name || row.policy_number || row.customer_id || 'Imported Report Item',
          reference_id:
            row.policy_number ||
            row.customer_id ||
            row.internal_reference ||
            row.external_reference ||
            row.linked_receipt_id ||
            null,
          details: buildImportedDetails(row, user.email),
          linked_eod_transfer_id: row.linked_eod_transfer_id || null,
          linked_sync_key: row.linked_sync_key || null,
          linked_receipt_id: row.linked_receipt_id || null,
          linked_receipt_sync_keys: row.linked_receipt_sync_keys || null,
          linked_receipt_row_ids: row.linked_receipt_row_ids || null,
          match_status: row.linked_sync_key ? 'matched' : 'manual_agent',
          manager_email: user?.email || null,
          source_report_type: row.source_report_type,
          source_fingerprint: row.source_fingerprint,
          import_batch_id: batch.id,
        };
      });

      setImportActivity({ startedAt, phase: 'saving', title: `Saving ${payload.length} ready records`,
        detail: 'Waiting for Supabase to confirm the save. Please do not refresh or resubmit.' });
      const { data: savedRows, error: insertError } = await supabase
        .from(config.targetTable)
        .upsert(payload, {
          onConflict: 'source_fingerprint',
          ignoreDuplicates: true,
        })
        .select('id, violation_type, deduction_week_start');

      if (insertError) throw insertError;

      const weekCounts = {};
      (savedRows || []).forEach((row) => {
        const key = row.deduction_week_start || 'Unknown';
        weekCounts[key] = (weekCounts[key] || 0) + 1;
      });

      setImportReceipt({
        saved: savedRows?.length || 0,
        duplicates: counts.duplicates + Math.max(0, payload.length - (savedRows?.length || 0)),
        review: counts.review,
        unmatched: counts.unmatched,
        weekCounts,
        batchId: batch.id,
      });

      setMessage('');
    } catch (saveError) {
      setError(`Import failed: ${saveError.message}`);
    } finally {
      importSaveInFlight.current = false;
      setImportSaving(false);
      setImportActivity(null);
    }
  };

  const addRow = () => {
    setRows([
      ...rows,
      createInitialRow(agentList.length > 0 ? agentList[0].email : ''),
    ]);
  };

  const removeRow = (index) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const buildViolationPayload = (row, userEmail) => ({
    agent_email: row.agent_email,
    office_code: row.office_code,
    region: row.region,
    violation_type: row.violation_type,
    violation_category: row.violation_category,

    transaction_date: row.transaction_date || null,
    reported_date: row.reported_date || todayKey(),

    week_start_date: week.start,
    week_end_date: week.end,
    deduction_week_start: week.start,
    deduction_week_end: week.end,

    customer_id: row.customer_id || null,
    policy_number: row.policy_number || null,

    variance_amount: row.violation_type === 'AR Violation'
      ? Number(row.variance_amount || 0)
      : 0,
    fee_amount: calcFee(row.violation_type, row.violation_category),

    client_name: row.client_name,
    reference_id: row.reference_id || row.policy_number || row.customer_id,
    details: appendPolicyLinkAudit(row.details, row, userEmail),

    linked_eod_transfer_id: row.linked_eod_transfer_id,
    linked_sync_key: row.linked_sync_key,
    linked_receipt_id: row.linked_receipt_id,
    linked_receipt_sync_keys: row.linked_receipt_sync_keys,
    linked_receipt_row_ids: row.linked_receipt_row_ids,
    match_status: row.linked_sync_key ? 'matched' : 'unmatched',

    manager_email: userEmail,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (importSaveInFlight.current || isSubmitting) return;

    setIsSubmitting(true);
    setMessage('');
    setError('');

    let user;
    try {
      const authResult = await supabase.auth.getUser();
      if (authResult.error || !authResult.data?.user?.email) throw new Error('Please sign in before saving.');
      user = authResult.data.user;
      const policies = rows.filter(isDisqualifiedRow);
      if (policies.length) {
        for (const row of policies) {
          if (!getCanonicalAgentEmail(row.agent_email) || !row.linked_sync_key) {
            throw new Error('Every disqualified policy requires a valid agent and a selected receipt.');
          }
          const policyWeek = getWeekRange(`${row.transaction_date}T12:00:00`);
          if (policyWeek.start !== week.start) {
            throw new Error('For manual disqualifications, select the commission week of the policy transaction date.');
          }
        }
        const checked = await revalidatePolicyLinks(policies);
        if (checked.some((item) => item.errors.length)) {
          throw new Error('Verify each disqualified policy receipt: ' + checked.flatMap((item) => item.errors).join(' '));
        }
      }
    } catch (validationError) {
      setError(validationError.message || 'Unable to validate the policy links.');
      setIsSubmitting(false);
      return;
    }

    if (violationToEdit) {
      const rowToUpdate = rows[0];
      const targetTable = rowToUpdate.violation_type === 'Disqualified Policy' ? 'disqualified_policies' : 'violations';

      const { error: updateError } = await supabase
        .from(targetTable)
        .update(buildViolationPayload(rowToUpdate, user?.email))
        .eq('id', violationToEdit.id);

      if (updateError) {
        setError(`Failed to update data: ${updateError.message}`);
      } else {
        setMessage('Successfully updated!');
        setTimeout(() => navigate('/admin/violations'), 1500);
      }

      setIsSubmitting(false);
      return;
    }

    // Split items into separate buckets depending on violation type
    const violationsToInsert = [];
    const disqualifiedToInsert = [];

    for (const row of rows) {
      if (!row.agent_email || !row.transaction_date || !row.client_name || !row.office_code) {
        setError('Please fill out all required fields: Agent, Transaction Date, Office, and Client Name.');
        setIsSubmitting(false);
        return;
      }

      if (row.violation_type === 'Scanning Violation' && !row.customer_id) {
        setError('Scanning Violations require Customer ID.');
        setIsSubmitting(false);
        return;
      }

      if ((row.violation_type === 'AR Violation' || row.violation_type === 'Disqualified Policy') && !row.policy_number) {
        setError(`${row.violation_type}s require a Policy Number.`);
        setIsSubmitting(false);
        return;
      }

      const payload = buildViolationPayload(row, user?.email);
      if (row.violation_type === 'Disqualified Policy') {
        disqualifiedToInsert.push(payload);
      } else {
        violationsToInsert.push(payload);
      }
    }

    // Fire insertions out contextually based on where they belong
    try {
      if (violationsToInsert.length > 0) {
        const { error: insertErr } = await supabase.from('violations').insert(violationsToInsert);
        if (insertErr) throw insertErr;
      }

      if (disqualifiedToInsert.length > 0) {
        const { error: disqErr } = await supabase.from('disqualified_policies').insert(disqualifiedToInsert);
        if (disqErr) throw disqErr;
      }

      setMessage('All records successfully saved!');
      setRows([createInitialRow(agentList.length > 0 ? agentList[0].email : '')]);
    } catch (err) {
      setError(`Failed to save entries: ${err.message}`);
    }

    setIsSubmitting(false);
  };

  const goToPreviousWeek = () => {
    setCurrentDate(d => { const next = new Date(d); next.setDate(next.getDate() - 7); return next; });
  };

  const goToNextWeek = () => {
    setCurrentDate(d => { const next = new Date(d); next.setDate(next.getDate() + 7); return next; });
  };

  return (
    <div className={`${styles.container} ${styles.reviewPage}`}>
      <div className={styles.header}>
        <button onClick={() => navigate('/admin/violations')} className={styles.backButton}>
          &larr; Back to Dashboard
        </button>

        <h2>{violationToEdit ? 'Edit Record' : 'Enter AR / SV / Disqualified Deductions'}</h2>
      </div>

      {!violationToEdit && (
        <div className={styles.importToolbar}>
          <div>
            <span className={styles.importEyebrow}>MANAGER SHEET IMPORT</span>
            <strong>Paste directly from the managers' working sheets.</strong>
            <p>
              This is the primary entry method. Choose a report type, paste the rows, review matches,
              and import. Manual entry is available below only when needed.
            </p>
          </div>

          <div className={styles.importToolbarActions}>
            {Object.entries(IMPORT_CONFIG).map(([key, config]) => (
              <button
                key={key}
                type="button"
                className={`${styles.reportImportButton} ${
                  importModal === key ? styles.reportImportButtonActive : ''
                }`}
                disabled={importParsing || importSaving || isSubmitting}
                onClick={() => {
                  previewVersion.current += 1;
                  setImportParsing(false);
                  setImportModal(importModal === key ? null : key);
                  setPasteEditorOpen(true);
                  setImportText('');
                  setImportRows([]);
                  setImportParseSummary(null);
                  setImportReceipt(null);
                  setError('');
                  setMessage('');
                }}
              >
                {importModal === key ? `Close ${config.label}` : config.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {importModal && (
        <section className={styles.inlineImportSection}>
          <div className={styles.inlineImportHeader}>
            <div>
              <span className={styles.importEyebrow}>
{IMPORT_CONFIG[importModal]?.reportType || 'REPORT'}
              </span>
              <h3>
{`Paste ${IMPORT_CONFIG[importModal]?.label || 'Report'}`}
              </h3>
              <p>
{IMPORT_CONFIG[importModal]?.usesTransactionWeek
                  ? `${IMPORT_CONFIG[importModal]?.description} Previously imported rows will be skipped.`
                  : `${IMPORT_CONFIG[importModal]?.description} Selected deduction week: ${week.start} – ${week.end}. Previously imported rows will be skipped.`}
              </p>
            </div>

            <button
              type="button"
              className={styles.inlineImportClose}
              onClick={closeImportModal}
              disabled={importParsing || importSaving}
            >
              Close
            </button>
          </div>

          {error && (
            <div className={styles.errorMessage} role="alert" style={{ margin: '12px 18px', textAlign: 'left' }}>
              {error}
            </div>
          )}

          {importActivity && <ImportActivityPanel activity={importActivity}
            onCancel={importParsing && !importSaving ? cancelImportPreview : undefined} />}
          {message === 'Preview cancelled. Nothing has been saved.' && (
            <p className={styles.importActivityCancelled} role="status">{message}</p>
          )}

          {!importReceipt && (
            <>

              <details
                className={styles.pasteInputPanel}
                open={importRows.length === 0 || pasteEditorOpen}
                onToggle={(event) => setPasteEditorOpen(event.currentTarget.open)}
              >
                <summary>
                  {importRows.length > 0
                    ? 'Pasted source data - expand to view or edit'
                    : 'Paste report rows here'}
                </summary>
              <div className={styles.inlineImportPasteRow}>
                <textarea
                  className={styles.importTextarea}
                  value={importText}
                  disabled={importParsing || importSaving || isSubmitting}
                  onChange={(event) => {
                    previewVersion.current += 1;
                    setImportParsing(false);
                    setImportText(event.target.value);
                    setImportRows([]);
                    setImportParseSummary(null);
                  }}
                  placeholder={`Paste ${IMPORT_CONFIG[importModal]?.label || 'report'} rows here. Headers are optional as long as the columns stay in the expected order...`}
                />

                <div className={styles.inlineImportPasteActions}>
                  <button
                    type="button"
                    className={styles.importSecondaryButton}
                    disabled={importParsing || importSaving || isSubmitting}
                    onClick={() => {
                      previewVersion.current += 1;
                      setImportParsing(false);
                      setImportText('');
                      setImportRows([]);
                      setImportParseSummary(null);
                      setImportReceipt(null);
                    }}
                  >
                    Clear
                  </button>

                  <button
                    type="button"
                    className={styles.importPrimaryButton}
                    onClick={previewImport}
                    disabled={importSaving || isSubmitting || importParsing || !importText.trim()}
                  >
                    {importParsing ? 'Matching Transactions...' : 'Preview & Match'}
                  </button>
                </div>
              </div>
              </details>

              {importParseSummary && (
                <div
                  role="status"
                  style={{ margin: '12px 18px', padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 10, background: '#f8fafc', color: '#334155', fontSize: 12 }}
                >
                  <strong>Paste check: {importParseSummary.policyRows} policy rows read.</strong>{' '}
                  {importParseSummary.correctionRows} need source corrections;{' '}
                  {importParseSummary.ignoredRows.length} title, header, or non-data rows ignored.
                  <div style={{ marginTop: 5 }}>
                    Dates such as 8/24/26 and 8/24/2026 are both accepted. Two-digit years mean 20xx.
                    Rows needing corrections stay in the preview and cannot be imported until corrected.
                  </div>
                  {importParseSummary.normalizedOffices.length > 0 && (
                    <div style={{ marginTop: 6, color: '#92400e' }}>
                      Office formatting corrected:{' '}
                      {importParseSummary.normalizedOffices.map((item) =>
                        `line ${item.row}: ${item.from} to ${item.to}`
                      ).join('; ')}. The original spelling is retained in saved details.
                    </div>
                  )}
                  {importParseSummary.ignoredRows.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>See ignored non-data rows</summary>
                      {importParseSummary.ignoredRows.map((item, index) => (
                        <div key={`${item.row}-${index}`} style={{ marginTop: 6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                          Line {item.row}: {item.reason} - {item.value}
                        </div>
                      ))}
                    </details>
                  )}
                </div>
              )}

              {importRows.length > 0 && (
                <ImportReviewWorkspace
                  key={importModal}
                  rows={importRows}
                  agents={agentList}
                  config={IMPORT_CONFIG[importModal]}
                  weekStart={week.start}
                  onAssign={setImportRowAgent}
                  onLink={linkImportedPolicy}
                  onUnlink={unlinkImportedPolicy}
                  onSave={saveImport}
                  saving={importSaving}
                  parsing={importParsing}
                  counts={getImportCounts()}
                  buildDetails={buildImportedDetails}
                />
              )}
            </>
          )}

          {importReceipt && (
            <div className={styles.importReceipt}>
              <div className={styles.importReceiptIcon}>✓</div>
              <h3>Import Complete</h3>
              <p>Batch #{importReceipt.batchId}</p>

              <div className={styles.importSummaryGrid}>
                <div className={styles.importMatched}>
                  <span>Saved</span>
                  <strong>{importReceipt.saved}</strong>
                </div>
                <div className={styles.importDuplicate}>
                  <span>Duplicates Skipped</span>
                  <strong>{importReceipt.duplicates}</strong>
                </div>
                <div className={styles.importReview}>
                  <span>Needs Review</span>
                  <strong>{importReceipt.review + importReceipt.unmatched}</strong>
                </div>
              </div>

              <div className={styles.importReceiptWeeks}>
                <strong>Deduction weeks saved</strong>
                {Object.entries(importReceipt.weekCounts).map(([weekStart, count]) => (
                  <div key={weekStart}>
                    <span>{weekStart}</span>
                    <strong>{count} row{count === 1 ? '' : 's'}</strong>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className={styles.importPrimaryButton}
                onClick={closeImportModal}
              >
                Done
              </button>
            </div>
          )}
        </section>
      )}

      {!violationToEdit && (
        <section className={styles.manualEntryShell}>
          <button
            type="button"
            className={`${styles.manualEntryToggle} ${
              manualEntryOpen ? styles.manualEntryToggleOpen : ''
            }`}
            onClick={() => setManualEntryOpen((open) => !open)}
          >
            <div>
              <span className={styles.manualEntryEyebrow}>OPTIONAL</span>
              <strong>Manual Entry</strong>
              <small>
                Use this only when you need to enter AR / SV / Disqualified records manually.
              </small>
            </div>

            <span className={styles.manualEntryChevron}>
              {manualEntryOpen ? '−' : '+'}
            </span>
          </button>

          {manualEntryOpen && (
            <div className={styles.manualEntryBody}>
      <form onSubmit={handleSubmit} className={styles.formCard}>
        <div className={styles.weekSelector}>
          <button type="button" onClick={goToPreviousWeek}>
            &larr; Previous Week
          </button>

          <h3>
            Deduction Week: {new Date(week.start + 'T12:00:00').toLocaleDateString()} -{' '}
            {new Date(week.end + 'T12:00:00').toLocaleDateString()}
          </h3>

          <button type="button" onClick={goToNextWeek}>
            Next Week &rarr;
          </button>
        </div>

        {message && <div className={styles.successMessage}>{message}</div>}
        {error && <div className={styles.errorMessage}>{error}</div>}

        {rows.map((row, index) => (
          <div
            key={row.id}
            style={{
              border: '1px solid #dbe3ef',
              borderRadius: 12,
              padding: 18,
              marginBottom: 18,
              background: '#ffffff',
              boxShadow: '0 2px 8px rgba(15,23,42,0.05)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))',
                gap: 14,
                alignItems: 'end',
              }}
            >
              <div style={fieldStyle}>
                <label style={labelStyle}>Agent / CSR</label>
                <select
                  style={inputStyle}
                  value={row.agent_email}
                  onChange={(e) => handleRowChange(index, 'agent_email', e.target.value)}
                >
                  {agentList.map(agent => (
                    <option key={agent.email} value={agent.email}>
                      {agent.full_name || agent.email}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Transaction Date</label>
                <input
                  style={inputStyle}
                  type="date"
                  value={row.transaction_date}
                  onChange={(e) => handleRowChange(index, 'transaction_date', e.target.value)}
                  required
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  Office{' '}
                  <button type="button" onClick={() => setIsOfficeModalOpen(true)} className={styles.editListButton}>
                    Edit
                  </button>
                </label>
                <select
                  style={inputStyle}
                  value={row.office_code}
                  onChange={(e) => handleRowChange(index, 'office_code', e.target.value)}
                  required
                >
                  <option value="">Select Office</option>
                  {officeList.map(office => (
                    <option key={office.id} value={office.name}>
                      {office.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  Region{' '}
                  <button type="button" onClick={() => setIsRegionModalOpen(true)} className={styles.editListButton}>
                    Edit
                  </button>
                </label>
                <select
                  style={inputStyle}
                  value={row.region}
                  onChange={(e) => handleRowChange(index, 'region', e.target.value)}
                >
                  <option value="">Select Region</option>
                  {regionList.map(region => (
                    <option key={region.id} value={region.name}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Violation Type</label>
                <select
                  style={inputStyle}
                  value={row.violation_type}
                  onChange={(e) => handleRowChange(index, 'violation_type', e.target.value)}
                >
                  <option value="AR Violation">AR Violation</option>
                  <option value="Scanning Violation">Scanning Violation</option>
                  <option value="Disqualified Policy">Disqualified Policy</option>
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Category</label>
                <select
                  style={inputStyle}
                  value={row.violation_category}
                  onChange={(e) => handleRowChange(index, 'violation_category', e.target.value)}
                >
                  <option value="">Select Category</option>
                  {VIOLATION_CATEGORIES.map(opt => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Customer</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Customer"
                  value={row.client_name}
                  onChange={(e) => handleRowChange(index, 'client_name', e.target.value)}
                  required
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  {row.violation_type === 'Scanning Violation' ? 'Customer ID' : 'Policy Number'}
                </label>

                {row.violation_type === 'Scanning Violation' ? (
                  <input
                    style={inputStyle}
                    type="text"
                    placeholder="Customer ID"
                    value={row.customer_id}
                    onChange={(e) => handleRowChange(index, 'customer_id', e.target.value)}
                    required
                  />
                ) : (
                  <input
                    style={inputStyle}
                    type="text"
                    placeholder="Policy Number"
                    value={row.policy_number}
                    onChange={(e) => {
                      handleRowChange(index, 'policy_number', e.target.value);
                      handleRowChange(index, 'reference_id', e.target.value);
                    }}
                    required
                  />
                )}
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Variance</label>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  value={row.variance_amount}
                  onChange={(e) => handleRowChange(index, 'variance_amount', e.target.value)}
                  disabled={row.violation_type !== 'AR Violation'}
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Fee</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={row.fee_amount}
                  readOnly
                  disabled
                />
              </div>

              <div style={{ ...fieldStyle, gridColumn: 'span 2' }}>
                <label style={labelStyle}>Details</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Details..."
                  value={row.details}
                  onChange={(e) => handleRowChange(index, 'details', e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className={styles.removeButton}
                  disabled={!!violationToEdit}
                  style={{ height: 38, width: '100%' }}
                >
                  Remove
                </button>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              {row.isSearching && (
                <div style={{ padding: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
                  Searching possible EOD matches...
                </div>
              )}

              {isDisqualifiedRow(row) && (
                <PolicyReceiptMatcher row={row} originalIndex={index} agentOptions={agentList}
                  onLink={linkManualPolicy} onUnlink={unlinkManualPolicy} disabled={isSubmitting} />
              )}
              {!isDisqualifiedRow(row) && row.match_results.length > 0 && !row.selected_match && (
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: 10,
                    boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
                    padding: 10,
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}
                >
                  <strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                    Possible Receipt Matches
                  </strong>

                  {row.match_results.map(match => (
                    <button
                      key={`${match.receipt_id}-${match.date_time}-${match.customer}`}
                      type="button"
                      onClick={() => selectMatch(index, match)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 12,
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        background: '#f9fafb',
                        marginBottom: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <strong>{match.customer || 'Unknown Customer'}</strong>
                      <br />
                      Receipt: {match.receipt_id || 'N/A'} | Rows grouped: {match.receipt_rows?.length || 1}
                      <br />
                      Date: {match.date_time || 'N/A'} | CSR: {match.csr || 'N/A'} | Office: {match.office || 'N/A'}
                      <br />
                      Policy: {match.receipt_policies?.join(', ') || match.policy || 'N/A'} | Customer ID: {match.customer_id || 'N/A'}
                      <br />
                      Receipt Total: ${Number(match.receipt_total || match.total || 0).toFixed(2)}
                      <br />
                      Type: {match.receipt_types?.join(', ') || match.type || 'N/A'}
                      <br />
                      Companies: {match.receipt_companies?.join(', ') || match.company || 'N/A'}
                      <br />
                      <small>Primary Sync Key: {match.sync_key}</small>
                    </button>
                  ))}
                </div>
              )}

              {!isDisqualifiedRow(row) && row.selected_match && (
                <div style={{ padding: 12, background: '#e8f5e9', border: '1px solid #86efac', borderRadius: 10, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <strong>Matched Receipt Group</strong>
                      <br />
                      {row.selected_match.customer || 'Unknown Customer'} | Receipt: {row.selected_match.receipt_id || 'N/A'}
                      <br />
                      Total: ${Number(row.selected_match.receipt_total || row.selected_match.total || 0).toFixed(2)} | Type: {row.selected_match.receipt_types?.join(', ') || row.selected_match.type || 'N/A'}
                    </div>
                    <button
                      type="button"
                      onClick={() => clearMatch(index)}
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      Clear Match
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
          <button
            type="button"
            onClick={addRow}
            style={{
              height: 38,
              padding: '0 16px',
              borderRadius: 6,
              background: '#22c55e',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            disabled={!!violationToEdit}
          >
            + Add Another Row
          </button>

          <button
            type="submit"
            style={{
              height: 38,
              padding: '0 24px',
              borderRadius: 6,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save All Entries'}
          </button>
        </div>
      </form>

            </div>
          )}
        </section>
      )}

      {violationToEdit && (
      <form onSubmit={handleSubmit} className={styles.formCard}>
        <div className={styles.weekSelector}>
          <button type="button" onClick={goToPreviousWeek}>
            &larr; Previous Week
          </button>

          <h3>
            Deduction Week: {new Date(week.start + 'T12:00:00').toLocaleDateString()} -{' '}
            {new Date(week.end + 'T12:00:00').toLocaleDateString()}
          </h3>

          <button type="button" onClick={goToNextWeek}>
            Next Week &rarr;
          </button>
        </div>

        {message && <div className={styles.successMessage}>{message}</div>}
        {error && <div className={styles.errorMessage}>{error}</div>}

        {rows.map((row, index) => (
          <div
            key={row.id}
            style={{
              border: '1px solid #dbe3ef',
              borderRadius: 12,
              padding: 18,
              marginBottom: 18,
              background: '#ffffff',
              boxShadow: '0 2px 8px rgba(15,23,42,0.05)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))',
                gap: 14,
                alignItems: 'end',
              }}
            >
              <div style={fieldStyle}>
                <label style={labelStyle}>Agent / CSR</label>
                <select
                  style={inputStyle}
                  value={row.agent_email}
                  onChange={(e) => handleRowChange(index, 'agent_email', e.target.value)}
                >
                  {agentList.map(agent => (
                    <option key={agent.email} value={agent.email}>
                      {agent.full_name || agent.email}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Transaction Date</label>
                <input
                  style={inputStyle}
                  type="date"
                  value={row.transaction_date}
                  onChange={(e) => handleRowChange(index, 'transaction_date', e.target.value)}
                  required
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  Office{' '}
                  <button type="button" onClick={() => setIsOfficeModalOpen(true)} className={styles.editListButton}>
                    Edit
                  </button>
                </label>
                <select
                  style={inputStyle}
                  value={row.office_code}
                  onChange={(e) => handleRowChange(index, 'office_code', e.target.value)}
                  required
                >
                  <option value="">Select Office</option>
                  {officeList.map(office => (
                    <option key={office.id} value={office.name}>
                      {office.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  Region{' '}
                  <button type="button" onClick={() => setIsRegionModalOpen(true)} className={styles.editListButton}>
                    Edit
                  </button>
                </label>
                <select
                  style={inputStyle}
                  value={row.region}
                  onChange={(e) => handleRowChange(index, 'region', e.target.value)}
                >
                  <option value="">Select Region</option>
                  {regionList.map(region => (
                    <option key={region.id} value={region.name}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Violation Type</label>
                <select
                  style={inputStyle}
                  value={row.violation_type}
                  onChange={(e) => handleRowChange(index, 'violation_type', e.target.value)}
                >
                  <option value="AR Violation">AR Violation</option>
                  <option value="Scanning Violation">Scanning Violation</option>
                  <option value="Disqualified Policy">Disqualified Policy</option>
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Category</label>
                <select
                  style={inputStyle}
                  value={row.violation_category}
                  onChange={(e) => handleRowChange(index, 'violation_category', e.target.value)}
                >
                  <option value="">Select Category</option>
                  {VIOLATION_CATEGORIES.map(opt => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Customer</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Customer"
                  value={row.client_name}
                  onChange={(e) => handleRowChange(index, 'client_name', e.target.value)}
                  required
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  {row.violation_type === 'Scanning Violation' ? 'Customer ID' : 'Policy Number'}
                </label>

                {row.violation_type === 'Scanning Violation' ? (
                  <input
                    style={inputStyle}
                    type="text"
                    placeholder="Customer ID"
                    value={row.customer_id}
                    onChange={(e) => handleRowChange(index, 'customer_id', e.target.value)}
                    required
                  />
                ) : (
                  <input
                    style={inputStyle}
                    type="text"
                    placeholder="Policy Number"
                    value={row.policy_number}
                    onChange={(e) => {
                      handleRowChange(index, 'policy_number', e.target.value);
                      handleRowChange(index, 'reference_id', e.target.value);
                    }}
                    required
                  />
                )}
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Variance</label>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  value={row.variance_amount}
                  onChange={(e) => handleRowChange(index, 'variance_amount', e.target.value)}
                  disabled={row.violation_type !== 'AR Violation'}
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Fee</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={row.fee_amount}
                  readOnly
                  disabled
                />
              </div>

              <div style={{ ...fieldStyle, gridColumn: 'span 2' }}>
                <label style={labelStyle}>Details</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Details..."
                  value={row.details}
                  onChange={(e) => handleRowChange(index, 'details', e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className={styles.removeButton}
                  disabled={!!violationToEdit}
                  style={{ height: 38, width: '100%' }}
                >
                  Remove
                </button>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              {row.isSearching && (
                <div style={{ padding: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
                  Searching possible EOD matches...
                </div>
              )}

              {isDisqualifiedRow(row) && (
                <PolicyReceiptMatcher row={row} originalIndex={index} agentOptions={agentList}
                  onLink={linkManualPolicy} onUnlink={unlinkManualPolicy} disabled={isSubmitting} />
              )}
              {!isDisqualifiedRow(row) && row.match_results.length > 0 && !row.selected_match && (
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: 10,
                    boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
                    padding: 10,
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}
                >
                  <strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                    Possible Receipt Matches
                  </strong>

                  {row.match_results.map(match => (
                    <button
                      key={`${match.receipt_id}-${match.date_time}-${match.customer}`}
                      type="button"
                      onClick={() => selectMatch(index, match)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 12,
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        background: '#f9fafb',
                        marginBottom: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <strong>{match.customer || 'Unknown Customer'}</strong>
                      <br />
                      Receipt: {match.receipt_id || 'N/A'} | Rows grouped: {match.receipt_rows?.length || 1}
                      <br />
                      Date: {match.date_time || 'N/A'} | CSR: {match.csr || 'N/A'} | Office: {match.office || 'N/A'}
                      <br />
                      Policy: {match.receipt_policies?.join(', ') || match.policy || 'N/A'} | Customer ID: {match.customer_id || 'N/A'}
                      <br />
                      Receipt Total: ${Number(match.receipt_total || match.total || 0).toFixed(2)}
                      <br />
                      Type: {match.receipt_types?.join(', ') || match.type || 'N/A'}
                      <br />
                      Companies: {match.receipt_companies?.join(', ') || match.company || 'N/A'}
                      <br />
                      <small>Primary Sync Key: {match.sync_key}</small>
                    </button>
                  ))}
                </div>
              )}

              {!isDisqualifiedRow(row) && row.selected_match && (
                <div style={{ padding: 12, background: '#e8f5e9', border: '1px solid #86efac', borderRadius: 10, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <strong>Matched Receipt Group</strong>
                      <br />
                      {row.selected_match.customer || 'Unknown Customer'} | Receipt: {row.selected_match.receipt_id || 'N/A'}
                      <br />
                      Total: ${Number(row.selected_match.receipt_total || row.selected_match.total || 0).toFixed(2)} | Type: {row.selected_match.receipt_types?.join(', ') || row.selected_match.type || 'N/A'}
                    </div>
                    <button
                      type="button"
                      onClick={() => clearMatch(index)}
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      Clear Match
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
          <button
            type="button"
            onClick={addRow}
            style={{
              height: 38,
              padding: '0 16px',
              borderRadius: 6,
              background: '#22c55e',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            disabled={!!violationToEdit}
          >
            + Add Another Row
          </button>

          <button
            type="submit"
            style={{
              height: 38,
              padding: '0 24px',
              borderRadius: 6,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save All Entries'}
          </button>
        </div>
      </form>

      )}
      <ListManagerModal
        isOpen={isOfficeModalOpen}
        onClose={() => setIsOfficeModalOpen(false)}
        title="Offices"
        items={officeList}
        onAddItem={addOffice}
        onDeleteItem={deleteOffice}
      />

      <ListManagerModal
        isOpen={isRegionModalOpen}
        onClose={() => setIsRegionModalOpen(false)}
        title="Regions"
        items={regionList}
        onAddItem={addRegion}
        onDeleteItem={deleteRegion}
      />
    </div>
  );
};

export default EnterViolation;
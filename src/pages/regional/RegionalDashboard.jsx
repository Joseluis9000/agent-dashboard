// src/pages/regional/RegionalDashboard.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import styles from './RegionalDashboard.module.css';

const PAGE_SIZE = 1000;

const SCOREBOARD_REGION_LOGOS = {
  'BAY AREA': '/bay.png',
  'CEN-CAL': '/cen-cal.png',
  'KERN': '/kern-county.png',
  'SOUTHERN CALIFORNIA': '/southern-cali.png',
  'STANISLAUS': '/stanislaus.png',
  'MERCED': '/merced.png',
  'SAN DIEGO': '/san-diego.png',
};

function getScoreboardRegionLogo(regionName) {
  return SCOREBOARD_REGION_LOGOS[normalizeRegion(regionName)] || '';
}

function clean(value) {
  return String(value ?? '').replace(/\r/g, '').trim();
}

function normalizeRegion(value = '') {
  return clean(value)
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeOffice(value = '') {
  const match = String(value || '').match(/CA\d{3}/i);
  return match ? match[0].toUpperCase() : clean(value) || 'Unknown';
}

function monthBounds(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return {
    year,
    month,
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
    daysInMonth: new Date(year, month, 0).getDate(),
    firstDay: `${year}-${String(month).padStart(2, '0')}-01`,
    nextMonthFirstDay: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-01`,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function isVoided(row) {
  return clean(row?.voided).toUpperCase().includes('VOIDED');
}

function transferKey(row) {
  if (row?.sync_key) return `sync:${row.sync_key}`;
  return [
    clean(row?.receipt_id),
    clean(row?.customer_id || row?.id),
    Number(row?.premium || 0).toFixed(2),
    Number(row?.fee || 0).toFixed(2),
    Number(row?.total || 0).toFixed(2),
    clean(row?.company),
    clean(row?.type),
  ].join('|');
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatDecimal(value) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function formatCurrency(value, digits = 2) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseMoney(value) {
  const parsed = parseFloat(String(value ?? '').replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTransactionDate(value) {
  const text = clean(value);
  const match = text.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let [, month, day, year, hour, minute, second, meridiem] = match;
  year = Number(year);
  if (year < 100) year += 2000;
  hour = Number(hour);
  if (meridiem.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (meridiem.toUpperCase() === 'AM' && hour === 12) hour = 0;

  const parsed = new Date(year, Number(month) - 1, Number(day), hour, Number(minute), Number(second));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => clean(value))) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => clean(value))) rows.push(row);
  }

  return rows;
}

function buildScoreboardTransactionKey(row) {
  return [
    clean(row.receipt_id),
    clean(row.customer_id),
    Number(row.premium || 0).toFixed(2),
    Number(row.fee || 0).toFixed(2),
    Number(row.total || 0).toFixed(2),
    clean(row.company),
    clean(row.type),
  ].join('|');
}

function normalizeScoreboardCsv(csvText) {
  const parsed = parseCsv(csvText.replace(/^\uFEFF/, ''));
  if (parsed.length < 2) throw new Error('The Transaction Detail file does not contain any transaction rows.');

  const headers = parsed[0].map((value) => clean(value));
  const required = ['Cust ID', 'Customer', 'Receipt', 'Date/Time', 'Type', 'Policy #', 'Policy Type', 'Company', 'CSR', 'Office', 'Premium', 'Fees', 'Total'];
  const missing = required.filter((name) => !headers.includes(name));
  if (missing.length) throw new Error(`This does not look like the expected Transaction Detail export. Missing: ${missing.join(', ')}`);

  const indexOf = (name) => headers.indexOf(name);
  const normalized = [];
  const reportDates = new Set();

  parsed.slice(1).forEach((sourceRow) => {
    const transactionDate = parseTransactionDate(sourceRow[indexOf('Date/Time')]);
    if (!transactionDate) return;

    const reportDate = localDateKey(transactionDate);
    reportDates.add(reportDate);

    const row = {
      receipt_id: clean(sourceRow[indexOf('Receipt')]),
      customer_id: clean(sourceRow[indexOf('Cust ID')]),
      customer: clean(sourceRow[indexOf('Customer')]),
      agent_email: null,
      csr: clean(sourceRow[indexOf('CSR')]),
      office: normalizeOffice(sourceRow[indexOf('Office')]),
      region: null,
      type: clean(sourceRow[indexOf('Type')]),
      company: clean(sourceRow[indexOf('Company')]),
      policy: clean(sourceRow[indexOf('Policy #')]),
      policy_type: clean(sourceRow[indexOf('Policy Type')]),
      premium: parseMoney(sourceRow[indexOf('Premium')]),
      fee: parseMoney(sourceRow[indexOf('Fees')]),
      total: parseMoney(sourceRow[indexOf('Total')]),
      transaction_date_time: transactionDate.toISOString(),
      // The Matrix export currently has an unnamed trailing column for VOIDED.
      voided: clean(sourceRow[headers.length]).toUpperCase().includes('VOID'),
    };

    if (!row.receipt_id && !row.customer_id && !row.office) return;
    row.transaction_key = buildScoreboardTransactionKey(row);
    normalized.push(row);
  });

  if (!normalized.length) throw new Error('No usable Transaction Detail rows were found in this file.');
  if (reportDates.size !== 1) throw new Error(`The scoreboard upload must contain one business date only. This file contains ${reportDates.size} dates.`);

  return {
    reportDate: Array.from(reportDates)[0],
    rows: normalized,
  };
}

async function fetchRegionalTransfers(supabaseClient, offices, firstDay, nextMonthFirstDay) {
  let rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseClient
      .from('daily_transaction_detail_transfers')
      .select('id, sync_key, receipt_id, customer_id, agent_email, csr, office, type, company, premium, fee, total, voided, date_time')
      .in('office', offices)
      .gte('date_time', `${firstDay} 00:00:00`)
      .lt('date_time', `${nextMonthFirstDay} 00:00:00`)
      .order('date_time', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const page = data || [];
    rows = rows.concat(page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function isSystemClosed(row) {
  return (
    clean(row?.outcome).toLowerCase() === 'sold' ||
    clean(row?.system_outcome_signal).toLowerCase() === 'sold' ||
    clean(row?.bridge_policy_status_value).toLowerCase() === 'bound' ||
    clean(row?.bridge_policy_status).toLowerCase() === 'policy bound'
  );
}

function elapsed(value) {
  if (!value) return '—';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default function RegionalDashboard() {
  const { supabaseClient, profile } = useAuth();
  const navigate = useNavigate();

  const role = clean(profile?.role).toLowerCase();
  const region = normalizeRegion(profile?.region);
  const [officeRegions, setOfficeRegions] = useState([]);
  const [monthQuotes, setMonthQuotes] = useState([]);
  const [liveQuotes, setLiveQuotes] = useState([]);
  const [dealSaves, setDealSaves] = useState([]);
  const [productionRows, setProductionRows] = useState([]);
  const [topAgents, setTopAgents] = useState([]);
  const [topCompanies, setTopCompanies] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const scoreboardFileRef = useRef(null);
  const [scoreboardModalOpen, setScoreboardModalOpen] = useState(false);
  const [scoreboardLoading, setScoreboardLoading] = useState(false);
  const [scoreboardUploading, setScoreboardUploading] = useState(false);
  const [scoreboardError, setScoreboardError] = useState('');
  const [scoreboardScope, setScoreboardScope] = useState('company');
  const [scoreboardData, setScoreboardData] = useState({
    snapshot: null,
    regions: [],
    offices: [],
    agents: [],
  });

  const regionalName =
    clean(profile?.full_name) ||
    clean(profile?.csr_name) ||
    clean(profile?.email) ||
    'Regional Manager';

  const regionalOffices = useMemo(
    () =>
      officeRegions
        .map((row) => normalizeOffice(row.office_code))
        .filter((office) => office && office !== 'Unknown')
        .sort(),
    [officeRegions]
  );

  const loadDashboard = useCallback(async () => {
    if (!supabaseClient) return;

    if (role !== 'regional') {
      setError('Regional Dashboard requires role = regional.');
      setLoading(false);
      return;
    }

    if (!region) {
      setError('Your regional profile does not have a region assigned.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const settingsResult = await supabaseClient
      .from('office_dashboard_settings')
      .select('office_code, region')
      .order('office_code');

    if (settingsResult.error) {
      setError(`Could not load regional offices: ${settingsResult.error.message}`);
      setLoading(false);
      return;
    }

    const settings = (settingsResult.data || []).filter(
      (row) => normalizeRegion(row.region) === region
    );
    setOfficeRegions(settings);

    const offices = settings
      .map((row) => normalizeOffice(row.office_code))
      .filter((office) => office && office !== 'Unknown');

    if (!offices.length) {
      setMonthQuotes([]);
      setLiveQuotes([]);
      setDealSaves([]);
      setProductionRows([]);
      setTopAgents([]);
      setTopCompanies([]);
      setLoading(false);
      return;
    }

    const bounds = monthBounds();
    const { start, end } = bounds;

    const [monthResult, liveResult, dealSaveResult, productionResult, goalResult, transferRows] = await Promise.all([
      supabaseClient
        .from('quote_log_view')
        .select('*')
        .in('office', offices)
        .gte('started_at', start)
        .lt('started_at', end)
        .order('started_at', { ascending: false }),

      supabaseClient
        .from('quote_log_view')
        .select('*')
        .in('office', offices)
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false }),

      supabaseClient
        .from('quote_deal_save_requests')
        .select('id, quote_id, customer_name, office, requested_by_name, current_broker_fee, premium, status, created_at, updated_at')
        .in('office', offices)
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),

      supabaseClient.rpc('get_office_numbers_dashboard', { p_month: bounds.monthKey }),

      supabaseClient
        .from('office_monthly_goals')
        .select('office_code, report_month, nb_rw_goal')
        .eq('report_month', bounds.monthKey)
        .in('office_code', offices),

      fetchRegionalTransfers(supabaseClient, offices, bounds.firstDay, bounds.nextMonthFirstDay),
    ]);

    const firstError = monthResult.error || liveResult.error || dealSaveResult.error || productionResult.error || goalResult.error;
    if (firstError) {
      setError(`Could not load the regional dashboard: ${firstError.message}`);
      setLoading(false);
      return;
    }

    setMonthQuotes(monthResult.data || []);
    setLiveQuotes(liveResult.data || []);
    setDealSaves(dealSaveResult.data || []);

    const officeSet = new Set(offices);
    const currentProduction = (productionResult.data || []).filter(
      (row) => clean(row.comparison_period).toLowerCase() === 'current' && officeSet.has(normalizeOffice(row.office_code || row.office))
    );

    const goalMap = {};
    (goalResult.data || []).forEach((row) => {
      goalMap[normalizeOffice(row.office_code)] = Number(row.nb_rw_goal) || 0;
    });

    const latestDataDate = currentProduction.reduce((latest, row) => {
      const value = clean(row.latest_data_date);
      return value && (!latest || value > latest) ? value : latest;
    }, '');

    let asOfDay = bounds.daysInMonth;
    if (latestDataDate) {
      const [year, month, day] = latestDataDate.split('-').map(Number);
      if (year === bounds.year && month === bounds.month) {
        asOfDay = Math.max(1, Math.min(day, bounds.daysInMonth));
      }
    }

    const projectionMultiplier = asOfDay < bounds.daysInMonth ? bounds.daysInMonth / asOfDay : 1;
    const productionByOffice = new Map(
      currentProduction.map((row) => [normalizeOffice(row.office_code || row.office), Number(row.nb_rw_count) || 0])
    );

    const nextProductionRows = offices.map((office) => {
      const actual = productionByOffice.get(office) || 0;
      const goal = goalMap[office] || 0;
      const pace = actual * projectionMultiplier;
      const pacePercent = goal > 0 ? (pace / goal) * 100 : 0;
      const shortfall = goal > 0 ? Math.max(0, Math.ceil(goal - pace)) : 0;
      const status = goal <= 0 ? 'No Goal' : pacePercent < 75 ? 'Critical' : pacePercent < 95 ? 'Needs Attention' : 'On Track';
      return { office, actual, goal, pace, pacePercent, shortfall, status };
    });
    setProductionRows(nextProductionRows);

    const seenTransactions = new Set();
    const validSales = (transferRows || []).filter((row) => {
      if (isVoided(row)) return false;
      const key = transferKey(row);
      if (seenTransactions.has(key)) return false;
      seenTransactions.add(key);
      const type = clean(row.type).toUpperCase();
      return type === 'NEW' || type === 'RWR';
    });

    const agentBuckets = new Map();
    const companyBuckets = new Map();
    validSales.forEach((row) => {
      const email = clean(row.agent_email).toLowerCase() || 'unknown-agent';
      const office = normalizeOffice(row.office);
      const stamp = new Date(row.date_time || 0).getTime();
      const csr = clean(row.csr);
      if (!agentBuckets.has(email)) {
        agentBuckets.set(email, { email, name: csr || email, office, count: 0, latestNameAt: stamp });
      }
      const agent = agentBuckets.get(email);
      agent.count += 1;
      if (csr && stamp >= agent.latestNameAt) {
        agent.name = csr;
        agent.office = office;
        agent.latestNameAt = stamp;
      }

      const company = clean(row.company);
      if (company) companyBuckets.set(company, (companyBuckets.get(company) || 0) + 1);
    });

    setTopAgents(Array.from(agentBuckets.values()).sort((a, b) => b.count - a.count).slice(0, 5));
    setTopCompanies(Array.from(companyBuckets.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5));
    setLastUpdated(new Date());
    setLoading(false);
  }, [supabaseClient, role, region]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);


  const loadScoreboard = useCallback(async (reportDate = localDateKey()) => {
    if (!supabaseClient) return null;

    setScoreboardLoading(true);
    setScoreboardError('');

    try {
      const [snapshotResult, regionResult, officeResult, agentResult] = await Promise.all([
        supabaseClient
          .from('scoreboard_current_snapshot')
          .select('*')
          .eq('report_date', reportDate)
          .maybeSingle(),
        supabaseClient
          .from('scoreboard_region_totals')
          .select('*')
          .eq('report_date', reportDate)
          .order('region'),
        supabaseClient
          .from('scoreboard_office_totals')
          .select('*')
          .eq('report_date', reportDate)
          .order('office'),
        supabaseClient
          .from('scoreboard_agent_totals')
          .select('*')
          .eq('report_date', reportDate),
      ]);

      const firstError = snapshotResult.error || regionResult.error || officeResult.error || agentResult.error;
      if (firstError) throw firstError;

      const next = {
        snapshot: snapshotResult.data || null,
        regions: regionResult.data || [],
        offices: officeResult.data || [],
        agents: agentResult.data || [],
      };
      setScoreboardData(next);
      return next;
    } catch (loadError) {
      console.error('[RegionalDashboard] scoreboard load failed:', loadError);
      setScoreboardError(loadError?.message || 'Unable to load the daily scoreboard.');
      return null;
    } finally {
      setScoreboardLoading(false);
    }
  }, [supabaseClient]);

  useEffect(() => {
    loadScoreboard();
  }, [loadScoreboard]);

  const handleScoreboardUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !supabaseClient) return;

    setScoreboardUploading(true);
    setScoreboardError('');

    let uploadId = null;

    try {
      const text = await file.text();
      const normalized = normalizeScoreboardCsv(text);
      const uploadProfileName = clean(profile?.full_name || profile?.csr_name || profile?.email) || 'Regional Manager';

      const { data: upload, error: uploadError } = await supabaseClient
        .from('scoreboard_uploads')
        .insert({
          report_date: normalized.reportDate,
          uploaded_by: profile?.id || null,
          uploaded_by_name: uploadProfileName,
          uploaded_by_email: clean(profile?.email) || null,
          uploaded_by_region: clean(profile?.region) || null,
          file_name: file.name,
          status: 'processing',
        })
        .select('id')
        .single();

      if (uploadError) throw uploadError;
      uploadId = upload.id;

      const { data: ingestResult, error: ingestError } = await supabaseClient.rpc('ingest_scoreboard_upload', {
        p_upload_id: uploadId,
        p_report_date: normalized.reportDate,
        p_rows: normalized.rows,
      });

      if (ingestError) throw ingestError;

      await loadScoreboard(normalized.reportDate);
      setScoreboardScope('company');
      setScoreboardModalOpen(true);

      console.info('[RegionalDashboard] scoreboard upload complete:', ingestResult);
    } catch (uploadError) {
      console.error('[RegionalDashboard] scoreboard upload failed:', uploadError);
      setScoreboardError(uploadError?.message || 'Unable to process the Transaction Detail file.');

      if (uploadId) {
        await supabaseClient
          .from('scoreboard_uploads')
          .update({ status: 'failed', error_message: uploadError?.message || 'Upload failed', completed_at: new Date().toISOString() })
          .eq('id', uploadId);
      }
    } finally {
      setScoreboardUploading(false);
    }
  }, [supabaseClient, profile, loadScoreboard]);

  useEffect(() => {
    if (!supabaseClient || !region) return undefined;

    const channel = supabaseClient
      .channel(`regional-dashboard-${region}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, loadDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_workflow' }, loadDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_deal_save_requests' }, loadDashboard)
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [supabaseClient, region, loadDashboard]);

  const monthClosed = useMemo(
    () => monthQuotes.filter(isSystemClosed),
    [monthQuotes]
  );

  const activeAgents = useMemo(
    () =>
      new Set(
        liveQuotes
          .map((row) => clean(row.captured_agent_name || row.agent_email))
          .filter(Boolean)
      ).size,
    [liveQuotes]
  );

  const officeRows = useMemo(() => {
    return regionalOffices.map((office) => {
      const officeMonth = monthQuotes.filter((row) => normalizeOffice(row.office) === office);
      const officeLive = liveQuotes.filter((row) => normalizeOffice(row.office) === office);
      const officeClosed = officeMonth.filter(isSystemClosed);
      const officeDealSaves = dealSaves.filter((row) => normalizeOffice(row.office) === office);

      return {
        office,
        monthQuotes: officeMonth.length,
        live: officeLive.length,
        closed: officeClosed.length,
        dealSaves: officeDealSaves.length,
      };
    });
  }, [regionalOffices, monthQuotes, liveQuotes, dealSaves]);

  const recentLive = useMemo(
    () => liveQuotes.slice(0, 6),
    [liveQuotes]
  );

  const regionalProduction = useMemo(
    () => productionRows.reduce((sum, row) => sum + row.actual, 0),
    [productionRows]
  );

  const regionalGoal = useMemo(
    () => productionRows.reduce((sum, row) => sum + row.goal, 0),
    [productionRows]
  );

  const regionalPace = useMemo(
    () => productionRows.reduce((sum, row) => sum + row.pace, 0),
    [productionRows]
  );

  const productionAttention = useMemo(
    () => productionRows
      .filter((row) => row.goal > 0 && row.pacePercent < 95)
      .sort((a, b) => a.pacePercent - b.pacePercent),
    [productionRows]
  );

  const topOffices = useMemo(
    () => [...productionRows].sort((a, b) => b.actual - a.actual).slice(0, 5),
    [productionRows]
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>REGIONAL / PERFORMANCE OVERVIEW</p>
          <h1>{region || 'Region'}</h1>
          <p className={styles.subtitle}>
            Welcome, {regionalName}. Production, office performance, live sales activity, and the company daily scoreboard in one view.
          </p>
        </div>

        <div className={styles.headerActions}>
          {lastUpdated && (
            <span className={styles.updatedAt}>
              Updated {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button type="button" className={styles.secondaryButton} onClick={loadDashboard}>
            Refresh
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => navigate('/regional/quote-operations')}
          >
            Open Quote Operations
          </button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.executiveStrip}>
        <div>
          <span>Regional Production</span>
          <strong>{formatNumber(regionalProduction)}</strong>
          <small>NB/RW month to date</small>
        </div>
        <div>
          <span>Regional Goal</span>
          <strong>{regionalGoal ? formatNumber(regionalGoal) : 'Not Set'}</strong>
          <small>{regionalGoal ? `${Math.round((regionalProduction / regionalGoal) * 100)}% achieved` : 'Goals come from Office Numbers'}</small>
        </div>
        <div>
          <span>Projected Pace</span>
          <strong>{formatDecimal(regionalPace)}</strong>
          <small>{regionalGoal ? `${Math.round((regionalPace / regionalGoal) * 100)}% of goal pace` : 'Current month projection'}</small>
        </div>
      </section>

      <section className={styles.metricGrid}>
        <MetricCard label="Offices" value={regionalOffices.length} detail={`${region || 'Region'} offices`} />
        <MetricCard label="Quoting Now" value={liveQuotes.length} detail={`${activeAgents} active agent${activeAgents === 1 ? '' : 's'}`} tone="live" />
        <MetricCard label="Closed This Month" value={monthClosed.length} detail="Policy bound / closed" tone="closed" />
        <MetricCard label="Deal Save Waiting" value={dealSaves.length} detail="Manager assistance requested" tone={dealSaves.length ? 'attention' : ''} />
      </section>

      <section className={styles.managementGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.sectionKicker}>PRODUCTION</p>
              <h2>Offices Needing Attention</h2>
              <p>Prioritized by projected month-end pace against each office's NB/RW goal.</p>
            </div>
          </div>

          {loading ? (
            <div className={styles.empty}>Loading production pace…</div>
          ) : productionAttention.length === 0 ? (
            <div className={styles.emptySuccess}>All offices with goals are currently on pace.</div>
          ) : (
            <div className={styles.attentionList}>
              {productionAttention.map((row) => (
                <button
                  type="button"
                  key={row.office}
                  className={styles.attentionRow}
                  onClick={() => navigate(`/regional/quote-operations?office=${encodeURIComponent(row.office)}`)}
                >
                  <div className={styles.attentionOffice}>
                    <strong>{row.office}</strong>
                    <span>{formatNumber(row.actual)} of {formatNumber(row.goal)} MTD</span>
                  </div>
                  <div className={styles.attentionProgress}>
                    <div className={styles.progressTrack}>
                      <span className={row.status === 'Critical' ? styles.progressCritical : styles.progressWarning} style={{ width: `${Math.min(100, Math.max(0, row.pacePercent))}%` }} />
                    </div>
                    <small>{Math.round(row.pacePercent)}% projected goal pace</small>
                  </div>
                  <div className={styles.attentionProjection}>
                    <span>Projected</span>
                    <strong>{formatDecimal(row.pace)}</strong>
                  </div>
                  <div className={`${styles.statusPill} ${row.status === 'Critical' ? styles.statusCritical : styles.statusWarning}`}>
                    {row.status}{row.shortfall ? ` · ${row.shortfall} short` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={`${styles.panel} ${dealSaves.length ? styles.attentionPanel : ''}`}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.sectionKicker}>MANAGER ASSIST</p>
              <h2>Deal Save Requests</h2>
              <p>Agents currently asking for help with the down / broker fee.</p>
            </div>
          </div>

          {dealSaves.length === 0 ? (
            <div className={styles.empty}>No Deal Save requests are waiting.</div>
          ) : (
            <div className={styles.dealSaveList}>
              {dealSaves.slice(0, 5).map((request) => (
                <div className={styles.dealSaveRow} key={request.id}>
                  <div className={styles.dealSaveTop}>
                    <strong>{request.customer_name || 'Customer'}</strong>
                    <span>{elapsed(request.created_at)} ago</span>
                  </div>
                  <p>{normalizeOffice(request.office)} · {request.requested_by_name || 'Agent'}</p>
                  <div className={styles.moneyRow}>
                    <span>Premium <strong>${Number(request.premium || 0).toFixed(0)}</strong></span>
                    <span>BF <strong>${Number(request.current_broker_fee || 0).toFixed(0)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button type="button" className={styles.fullButton} onClick={() => navigate('/regional/quote-operations')}>
            Open Quote Operations
          </button>
        </section>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.sectionKicker}>OFFICES</p>
            <h2>Office Performance</h2>
            <p>Current-month quote activity across your assigned offices.</p>
          </div>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading regional offices…</div>
        ) : officeRows.length === 0 ? (
          <div className={styles.empty}>No offices are mapped to {region || 'this region'} in office_dashboard_settings.</div>
        ) : (
          <div className={styles.officeTable}>
            <div className={styles.officeHeader}>
              <span>Office</span>
              <span>Month Quotes</span>
              <span>Live</span>
              <span>Closed</span>
              <span>Deal Saves</span>
            </div>
            {officeRows.map((row) => (
              <button
                type="button"
                key={row.office}
                className={styles.officeRow}
                onClick={() => navigate(`/regional/quote-operations?office=${encodeURIComponent(row.office)}`)}
              >
                <strong>{row.office}</strong>
                <span>{row.monthQuotes}</span>
                <span>{row.live}</span>
                <span>{row.closed}</span>
                <span className={row.dealSaves ? styles.attentionText : ''}>{row.dealSaves}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className={styles.activityGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.sectionKicker}>LIVE SALES</p>
              <h2>Live Quote Activity</h2>
              <p>Customers currently being quoted in your region.</p>
            </div>
            <button type="button" className={styles.textButton} onClick={() => navigate('/regional/quote-operations')}>
              View all
            </button>
          </div>

          {recentLive.length === 0 ? (
            <div className={styles.empty}>No live quotes right now.</div>
          ) : (
            <div className={styles.liveList}>
              {recentLive.map((quote) => (
                <div className={styles.liveRow} key={quote.id}>
                  <div>
                    <strong>{quote.customer_name || 'Unnamed Customer'}</strong>
                    <span>{normalizeOffice(quote.office)} · {quote.captured_agent_name || quote.agent_email || 'Unknown agent'}</span>
                  </div>
                  <div className={styles.liveMeta}>
                    <strong>{quote.carrier || 'Carrier not selected'}</strong>
                    <span>{elapsed(quote.updated_at || quote.started_at)} ago</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={`${styles.panel} ${styles.scoreboardCard}`}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.sectionKicker}>DAILY SALES</p>
              <h2>G&amp;P Scoreboard</h2>
              <p>Company-wide NB and Broker Fee results from today's Transaction Detail uploads.</p>
            </div>
          </div>

          <div className={styles.scoreboardCardBody}>
            {scoreboardError && <div className={styles.scoreboardInlineError}>{scoreboardError}</div>}

            {scoreboardLoading ? (
              <div className={styles.scoreboardCardEmpty}>Loading today's scoreboard…</div>
            ) : scoreboardData.snapshot ? (
              <>
                <div className={styles.scoreboardAsOf}>
                  <span>Scoreboard as of</span>
                  <strong>{new Date(scoreboardData.snapshot.scoreboard_as_of).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong>
                  <small>{new Date(`${scoreboardData.snapshot.report_date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</small>
                </div>
                <div className={styles.scoreboardMiniMetrics}>
                  <div><span>NB</span><strong>{formatNumber(scoreboardData.snapshot.company_nb)}</strong></div>
                  <div><span>BF</span><strong>{formatCurrency(scoreboardData.snapshot.company_broker_fee, 0)}</strong></div>
                  <div><span>AVG</span><strong>{formatCurrency(scoreboardData.snapshot.company_avg_broker_fee, 0)}</strong></div>
                </div>
                <p className={styles.scoreboardUploader}>Last uploaded by {scoreboardData.snapshot.uploaded_by_name || 'Manager'}</p>
              </>
            ) : (
              <div className={styles.scoreboardCardEmpty}>No company scoreboard has been uploaded for today yet.</div>
            )}
          </div>

          <div className={styles.scoreboardCardActions}>
            <input
              ref={scoreboardFileRef}
              type="file"
              accept=".csv,text/csv"
              className={styles.hiddenFileInput}
              onChange={handleScoreboardUpload}
            />
            <button
              type="button"
              className={styles.uploadButton}
              onClick={() => scoreboardFileRef.current?.click()}
              disabled={scoreboardUploading}
            >
              {scoreboardUploading ? 'Processing…' : 'Upload Transaction Details'}
            </button>
            <button
              type="button"
              className={styles.viewScoreboardButton}
              onClick={() => setScoreboardModalOpen(true)}
              disabled={!scoreboardData.snapshot || scoreboardLoading}
            >
              View Scoreboard
            </button>
          </div>
        </section>
      </section>

      <section className={styles.leadersSection}>
        <div className={styles.sectionTitleRow}>
          <div>
            <p className={styles.sectionKicker}>LEADERS</p>
            <h2>Top Performers</h2>
            <p>Current-month NEW + RWR leaders within {region || 'this region'}.</p>
          </div>
        </div>
        <div className={styles.leaderboardGrid}>
          <RegionalLeaderboard title="Top Agents" rows={topAgents.map((row) => ({ label: row.name, sublabel: row.office, value: row.count }))} />
          <RegionalLeaderboard title="Top Offices" rows={topOffices.map((row) => ({ label: row.office, sublabel: `${Math.round(row.pacePercent || 0)}% goal pace`, value: row.actual }))} />
          <RegionalLeaderboard title="Top Companies Sold" rows={topCompanies.map((row) => ({ label: row.name, sublabel: 'NEW + RWR', value: row.count }))} />
        </div>
      </section>

      {scoreboardModalOpen && (
        <ScoreboardModal
          data={scoreboardData}
          region={region}
          scope={scoreboardScope}
          onScopeChange={setScoreboardScope}
          onClose={() => setScoreboardModalOpen(false)}
          onUpload={() => scoreboardFileRef.current?.click()}
          uploading={scoreboardUploading}
        />
      )}
    </main>
  );
}

function ScoreboardModal({ data, region, scope, onScopeChange, onClose, onUpload, uploading }) {
  const snapshot = data.snapshot;
  const normalizedRegion = normalizeRegion(region);
  const isRegion = scope === 'region';
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [screenshotView, setScreenshotView] = useState('offices');

  const scopedOffices = useMemo(
    () => isRegion ? data.offices.filter((row) => normalizeRegion(row.region) === normalizedRegion) : data.offices,
    [data.offices, isRegion, normalizedRegion]
  );
  const scopedAgents = useMemo(
    () => isRegion ? data.agents.filter((row) => normalizeRegion(row.region) === normalizedRegion) : data.agents,
    [data.agents, isRegion, normalizedRegion]
  );
  const scopedRegions = useMemo(
    () => isRegion ? data.regions.filter((row) => normalizeRegion(row.region) === normalizedRegion) : data.regions,
    [data.regions, isRegion, normalizedRegion]
  );

  const scopedNb = scopedOffices.reduce((sum, row) => sum + Number(row.nb || 0), 0);
  const scopedBf = scopedOffices.reduce((sum, row) => sum + Number(row.broker_fee || 0), 0);
  const scopedAvg = scopedNb ? scopedBf / scopedNb : 0;
  const topOffices = [...scopedOffices].sort(scoreboardRankSort).slice(0, 5);
  const topAgents = [...scopedAgents].sort(scoreboardRankSort).slice(0, 5);

  const officesByRegion = useMemo(() => {
    const groups = new Map();
    scopedOffices.forEach((office) => {
      const name = clean(office.region) || 'Unassigned';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(office);
    });
    return Array.from(groups.entries())
      .map(([name, offices]) => ({ name, offices: offices.sort((a, b) => clean(a.office).localeCompare(clean(b.office), undefined, { numeric: true })) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [scopedOffices]);

  const sortedScopedAgents = useMemo(
    () => [...scopedAgents].sort(scoreboardRankSort),
    [scopedAgents]
  );

  const screenshotAgentColumns = useMemo(() => {
    const columnCount = 3;
    const perColumn = Math.max(1, Math.ceil(sortedScopedAgents.length / columnCount));
    return Array.from({ length: columnCount }, (_, index) =>
      sortedScopedAgents.slice(index * perColumn, (index + 1) * perColumn)
    ).filter((rows) => rows.length);
  }, [sortedScopedAgents]);

  if (!snapshot) return null;

  return (
    <div className={`${styles.modalBackdrop} ${screenshotMode ? styles.screenshotBackdrop : ''}`} role="presentation" onMouseDown={onClose}>
      <div className={`${styles.scoreboardModal} ${screenshotMode ? styles.scoreboardScreenshotMode : ''}`} role="dialog" aria-modal="true" aria-label="Daily G&P Scoreboard" onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.scoreboardModalHeader}>
          <div>
            <p className={styles.scoreboardModalEyebrow}>DAILY G&amp;P SCOREBOARD</p>
            <h2>{new Date(`${snapshot.report_date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2>
            <p>Scoreboard as of <strong>{new Date(snapshot.scoreboard_as_of).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong> · Last uploaded by {snapshot.uploaded_by_name || 'Manager'}</p>
          </div>
          <button type="button" className={styles.modalCloseButton} onClick={onClose} aria-label="Close scoreboard">×</button>
        </div>

        <div className={styles.scoreboardToolbar}>
          <div className={styles.scoreboardScopeToggle}>
            <button type="button" className={scope === 'company' ? styles.scopeActive : ''} onClick={() => onScopeChange('company')}>Company</button>
            <button type="button" className={scope === 'region' ? styles.scopeActive : ''} onClick={() => onScopeChange('region')}>My Region</button>
          </div>
          <div className={styles.scoreboardToolbarActions}>
            <button type="button" className={styles.screenshotButton} onClick={() => { setScreenshotView('offices'); setScreenshotMode(true); }}>Screenshot View</button>
            <button type="button" className={styles.modalUploadButton} onClick={onUpload} disabled={uploading}>{uploading ? 'Processing…' : 'Upload New File'}</button>
          </div>
        </div>

        {screenshotMode && (
          <div className={styles.screenshotControls} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className={screenshotView === 'offices' ? styles.screenshotControlActive : ''} onClick={() => setScreenshotView('offices')}>Office Board</button>
            <button type="button" className={screenshotView === 'agents' ? styles.screenshotControlActive : ''} onClick={() => setScreenshotView('agents')}>Agent Board</button>
            <button type="button" onClick={() => setScreenshotMode(false)}>Exit Screenshot View</button>
          </div>
        )}

        <div className={styles.scoreboardModalBody}>
          <div className={styles.scoreboardShareHeader}>
            <div>
              <strong>{isRegion ? `${region} G&P SCOREBOARD` : 'G&P COMPANY SCOREBOARD'}</strong>
              <span>{new Date(`${snapshot.report_date}T12:00:00`).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div>
              <span>Scoreboard as of</span>
              <strong>{new Date(snapshot.scoreboard_as_of).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong>
            </div>
          </div>

          {(!screenshotMode || screenshotView === 'offices') && (
            <>
              <div className={styles.scoreboardTitleBand}>
                <strong>{isRegion ? `${region} SCOREBOARD` : 'G&P COMPANY SCOREBOARD'}</strong>
                <span>{isRegion ? 'Your region only' : 'All regions'}</span>
              </div>

              <div className={styles.scoreboardSummaryStrip}>
                <div><span>NB</span><strong>{formatNumber(isRegion ? scopedNb : snapshot.company_nb)}</strong></div>
                <div><span>BF</span><strong>{formatCurrency(isRegion ? scopedBf : snapshot.company_broker_fee)}</strong></div>
                <div><span>AVG</span><strong>{formatCurrency(isRegion ? scopedAvg : snapshot.company_avg_broker_fee)}</strong></div>
              </div>

              <div className={styles.scoreboardSheetGrid}>
                <div className={styles.scoreboardRegionsColumn}>
                  {officesByRegion.map((group) => {
                    const regionTotal = scopedRegions.find((row) => normalizeRegion(row.region) === normalizeRegion(group.name));
                    return <ScoreboardRegionBlock key={group.name} name={group.name} offices={group.offices} total={regionTotal} />;
                  })}
                </div>

                {!screenshotMode && (
                  <div className={styles.scoreboardLeadersColumn}>
                    <ScoreboardRanking title="TOP 5 OFFICES" rows={topOffices} labelKey="office" />
                    <ScoreboardRanking title="TOP 5 AGENTS" rows={topAgents} labelKey="agent_name" sublabelKey="office" />
                  </div>
                )}
              </div>

              {screenshotMode && (
                <div className={styles.scoreboardScreenshotFooter}>
                  <section className={styles.scoreboardGrandTotal}>
                    <div className={styles.scoreboardGrandTotalTitle}>G&amp;P TOTAL:</div>
                    <div className={styles.scoreboardGrandTotalMetrics}>
                      <div><span>NB</span><strong>{formatNumber(isRegion ? scopedNb : snapshot.company_nb)}</strong></div>
                      <div><span>BF</span><strong>{formatCurrency(isRegion ? scopedBf : snapshot.company_broker_fee)}</strong></div>
                      <div><span>AVG</span><strong>{formatCurrency(isRegion ? scopedAvg : snapshot.company_avg_broker_fee)}</strong></div>
                    </div>
                  </section>
                  <ScoreboardRanking title="TOP 5 OFFICES" rows={topOffices} labelKey="office" />
                  <ScoreboardRanking title="TOP 5 AGENTS" rows={topAgents} labelKey="agent_name" sublabelKey="office" />
                </div>
              )}
            </>
          )}

          {(!screenshotMode || screenshotView === 'agents') && (
            <section className={`${styles.agentScoreboardSection} ${screenshotMode ? styles.agentScreenshotBoard : ''}`}>
              <div className={styles.agentScoreboardHeader}>
                <strong>{isRegion ? `${region} AGENTS` : 'G&P AGENT SCOREBOARD'}</strong>
                <span>{scopedAgents.length} agents with activity</span>
              </div>

              {screenshotMode ? (
                <div className={styles.agentScreenshotLayout}>
                  <div className={styles.agentScreenshotColumns}>
                    {screenshotAgentColumns.map((column, columnIndex) => (
                      <div className={styles.agentScreenshotColumn} key={`agent-column-${columnIndex}`}>
                        <div className={styles.agentScreenshotHeader}><span>Agent</span><span>NB</span><span>BF</span><span>AVG</span></div>
                        {column.map((agent) => (
                          <div className={styles.agentScreenshotRow} key={`${agent.agent_key}-${agent.office}`}>
                            <strong>{agent.agent_name}</strong>
                            <span>{formatNumber(agent.nb)}</span>
                            <span>{formatCurrency(agent.broker_fee, 0)}</span>
                            <span>{formatCurrency(agent.avg_broker_fee, 0)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <ScoreboardRanking title="TOP 5 AGENTS" rows={topAgents} labelKey="agent_name" sublabelKey="office" />
                </div>
              ) : (
                <div className={styles.agentScoreboardTable}>
                  <div className={styles.scoreboardTableHeader}><span>Agent</span><span>Office</span><span>NB</span><span>BF</span><span>AVG</span></div>
                  {sortedScopedAgents.map((agent) => (
                    <div className={styles.scoreboardTableRow} key={`${agent.agent_key}-${agent.office}`}>
                      <strong>{agent.agent_name}</strong>
                      <span>{agent.office}</span>
                      <span>{formatNumber(agent.nb)}</span>
                      <span>{formatCurrency(agent.broker_fee)}</span>
                      <span>{formatCurrency(agent.avg_broker_fee)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function scoreboardRankSort(a, b) {
  const nbDiff = Number(b.nb || 0) - Number(a.nb || 0);
  if (nbDiff) return nbDiff;
  const feeDiff = Number(b.broker_fee || 0) - Number(a.broker_fee || 0);
  if (feeDiff) return feeDiff;
  return clean(a.office || a.agent_name).localeCompare(clean(b.office || b.agent_name), undefined, { numeric: true });
}

function ScoreboardRegionBlock({ name, offices, total }) {
  const fallbackNb = offices.reduce((sum, row) => sum + Number(row.nb || 0), 0);
  const fallbackBf = offices.reduce((sum, row) => sum + Number(row.broker_fee || 0), 0);
  const totalNb = Number(total?.nb ?? fallbackNb);
  const totalBf = Number(total?.broker_fee ?? fallbackBf);
  const totalAvg = totalNb ? totalBf / totalNb : 0;

  return (
    <section className={styles.regionScoreboardBlock}>
      <div className={styles.regionScoreboardTitle}>
        {getScoreboardRegionLogo(name) ? (
          <img className={styles.regionScoreboardLogo} src={getScoreboardRegionLogo(name)} alt={`${name} region`} />
        ) : (
          <span>{name}</span>
        )}
      </div>
      <div className={styles.scoreboardTableHeader}><span>Office</span><span>NB</span><span>BF</span><span>AVG</span></div>
      {offices.map((office) => (
        <div className={styles.scoreboardTableRow} key={office.office}>
          <strong>{office.office}</strong>
          <span>{formatNumber(office.nb)}</span>
          <span>{formatCurrency(office.broker_fee)}</span>
          <span>{formatCurrency(office.avg_broker_fee)}</span>
        </div>
      ))}
      <div className={styles.scoreboardTotalRow}>
        <strong>{name} TOTAL</strong>
        <span>{formatNumber(totalNb)}</span>
        <span>{formatCurrency(totalBf)}</span>
        <span>{formatCurrency(totalAvg)}</span>
      </div>
    </section>
  );
}

function ScoreboardRanking({ title, rows, labelKey, sublabelKey }) {
  const nameHeader = labelKey === 'office' ? 'Office' : 'Agent';

  return (
    <section className={styles.scoreboardRanking}>
      <div className={styles.scoreboardRankingTitle}>{title}</div>
      <div className={styles.scoreboardRankingHeader}>
        <span>#</span>
        <span>{nameHeader}</span>
        <span>NB</span>
        <span>BF</span>
        <span>AVG</span>
      </div>
      {rows.length ? rows.map((row, index) => (
        <div className={styles.scoreboardRankingRow} key={`${row[labelKey]}-${index}`}>
          <span className={styles.scoreboardRank}>{index + 1}</span>
          <div><strong>{row[labelKey]}</strong>{sublabelKey && <small>{row[sublabelKey]}</small>}</div>
          <span>{formatNumber(row.nb)}</span>
          <span>{formatCurrency(row.broker_fee, 0)}</span>
          <span>{formatCurrency(row.avg_broker_fee, 0)}</span>
        </div>
      )) : <div className={styles.scoreboardRankingEmpty}>No activity yet.</div>}
    </section>
  );
}

function RegionalLeaderboard({ title, rows }) {
  return (
    <article className={styles.leaderboardCard}>
      <div className={styles.leaderboardHeader}><h3>{title}</h3></div>
      <div className={styles.leaderboardList}>
        {rows.length ? rows.map((row, index) => (
          <div key={`${row.label}-${index}`} className={styles.leaderboardRow}>
            <span className={styles.rankNumber}>{index + 1}</span>
            <div>
              <strong>{row.label}</strong>
              <span>{row.sublabel}</span>
            </div>
            <b>{formatNumber(row.value)}</b>
          </div>
        )) : <div className={styles.empty}>No production data yet.</div>}
      </div>
    </article>
  );
}

function MetricCard({ label, value, detail, tone = '' }) {
  return (
    <article className={`${styles.metricCard} ${tone ? styles[tone] : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
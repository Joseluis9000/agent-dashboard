// src/pages/AdminDashboard.jsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  ChartNoAxesCombined,
  ExternalLink,
  Megaphone,
  RefreshCw,
  Target,
  Ticket,
  Trophy,
  Users,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { supabase } from '../supabaseClient';
import styles from '../components/AdminDashboard/AdminDashboard.module.css';

const PAGE_SIZE = 1000;
const ATTENTION_OUTCOMES = new Set(['lost_deal', 'walk']);
const STALE_AFTER_MS = 60 * 60 * 1000;

const cleanStr = (value) => String(value ?? '').replace(/\r/g, '').trim();

const normalizeOffice = (value = '') => {
  const match = String(value || '').match(/CA\d{3}/i);
  return match ? match[0].toUpperCase() : cleanStr(value) || 'Unknown';
};

const getCurrentMonth = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthBounds = (monthValue) => {
  const [year, month] = monthValue.split('-').map(Number);
  const next = new Date(year, month, 1);
  return {
    year,
    month,
    daysInMonth: new Date(year, month, 0).getDate(),
    firstDay: `${year}-${String(month).padStart(2, '0')}-01`,
    nextMonthFirstDay: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`,
  };
};

const formatNumber = (value) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0);

const formatDecimal = (value) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value) || 0);

const formatRelativeTime = (value) => {
  if (!value) return 'No recent activity';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'No recent activity';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const isVoided = (row) => cleanStr(row?.voided).toUpperCase().includes('VOIDED');

const transferKey = (row) => {
  if (row?.sync_key) return `sync:${row.sync_key}`;
  return [
    cleanStr(row?.receipt_id),
    cleanStr(row?.customer_id || row?.id),
    Number(row?.premium || 0).toFixed(2),
    Number(row?.fee || 0).toFixed(2),
    Number(row?.total || 0).toFixed(2),
    cleanStr(row?.company),
    cleanStr(row?.type),
  ].join('|');
};

const latestTimestamp = (row) =>
  new Date(row?.updated_at || row?.bridged_back_at || row?.started_at || row?.created_at || 0).getTime();

async function fetchAllCurrentMonthTransfers(firstDay, nextMonthFirstDay) {
  let rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('daily_transaction_detail_transfers')
      .select('id, sync_key, receipt_id, customer_id, agent_email, csr, office, type, company, policy, policy_type, premium, fee, total, voided, date_time')
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

function getDashboardDisplayStatus(quote, now = Date.now()) {
  if (quote?.status === 'bridged_back' || quote?.bridged_back_at) return 'completed';
  if (quote?.status === 'in_progress') {
    const started = new Date(quote.started_at).getTime();
    if (Number.isFinite(started) && now - started >= STALE_AFTER_MS) return 'stale';
    return 'in_progress';
  }
  return quote?.status || 'unknown';
}

function hasDashboardLicenseSignal(quote) {
  return Boolean(quote?.any_license_entered || Number(quote?.drivers_with_license || 0) > 0);
}

function hasDashboardFullVinSignal(quote) {
  return Boolean(quote?.any_full_vin_entered || Number(quote?.vehicles_with_full_vin || 0) > 0);
}

function dashboardYesStage(quote) {
  const payment = cleanStr(quote?.payment_method).toLowerCase();
  const secondYes = quote?.second_yes_id_vin === true ||
    (quote?.second_yes_id_vin !== false && hasDashboardLicenseSignal(quote) && hasDashboardFullVinSignal(quote));
  const thirdYes = quote?.third_yes_payment_ready === true ||
    payment === 'cash' || payment === 'card' ||
    (quote?.third_yes_payment_ready !== false && secondYes && Boolean(quote?.bridged_back_at || quote?.status === 'bridged_back' || quote?.carrier));

  if (thirdYes) return 3;
  if (secondYes) return 2;
  if (quote?.first_yes_ready_now === true) return 1;
  return 0;
}

function buildQuoteGroups(quotes, workflowRows, dealSaveRows) {
  const workflowById = new Map((workflowRows || []).map((row) => [row.quote_id, row]));
  const dealSaveIds = new Set((dealSaveRows || []).map((row) => row.quote_id).filter(Boolean));
  const groups = new Map();

  (quotes || []).forEach((quote) => {
    const merged = { ...quote, ...(workflowById.get(quote.id) || {}) };
    const key = merged.matrix_customer_id ? `customer:${merged.matrix_customer_id}` : `quote:${merged.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(merged);
  });

  return Array.from(groups.entries()).map(([key, rows]) => {
    const sorted = [...rows].sort((a, b) => latestTimestamp(b) - latestTimestamp(a));
    const latest = sorted[0] || {};

    const explicit = sorted.find((row) => {
      const outcome = cleanStr(row.outcome).toLowerCase();
      return outcome === 'sold' || outcome === 'follow_up' || ATTENTION_OUTCOMES.has(outcome) || row.follow_up_needed === true;
    });

    const outcome = cleanStr(explicit?.outcome).toLowerCase();
    const hasDealSave = sorted.some((row) => dealSaveIds.has(row.id));
    const latestStatus = getDashboardDisplayStatus(latest);
    const yesStage = Math.max(0, ...sorted.map(dashboardYesStage));
    const latestDisposition = cleanStr(latest?.outcome).toLowerCase();
    const hasExplicitFinalOutcome = Boolean(
      latestDisposition === 'sold' ||
      latestDisposition === 'follow_up' ||
      ATTENTION_OUTCOMES.has(latestDisposition) ||
      latest?.follow_up_needed === true
    );

    const isClosed = outcome === 'sold' || latest?.policy_bound_detected === true || latest?.system_outcome_signal === 'sold';
    const isFollowUp = !isClosed && (outcome === 'follow_up' || explicit?.follow_up_needed === true);

    const isLostDealOrWalk = !isClosed && !isFollowUp && (ATTENTION_OUTCOMES.has(outcome) || (hasDealSave && Boolean(explicit)));
    const unresolvedAfterYes = !isClosed && !isFollowUp && !isLostDealOrWalk && !hasExplicitFinalOutcome && yesStage > 0 && (latestStatus === 'stale' || latestStatus === 'completed');

    const isAttention = isLostDealOrWalk || unresolvedAfterYes;
    const isLive = !isClosed && !isFollowUp && !isAttention && latestStatus === 'in_progress';

    const attentionType = isLostDealOrWalk
      ? (outcome === 'walk' && !hasDealSave ? 'Walk' : 'Lost Deal')
      : unresolvedAfterYes
        ? `${yesStage === 1 ? '1st' : yesStage === 2 ? '2nd' : '3rd'} Yes - No Outcome`
        : '';

    const isDidNotRewrite = cleanStr(outcome).toLowerCase() === 'did_not_rw_stayed_current_carrier' ||
      cleanStr(outcome).toLowerCase() === 'did_not_rewrite_current_carrier';

    return {
      key,
      rows: sorted,
      latest,
      customerName: latest.customer_name || 'Unnamed Customer',
      agentName: latest.captured_agent_name || latest.agent_email || 'Unknown Agent',
      office: normalizeOffice(latest.office),
      lastActivityAt: latest.updated_at || latest.started_at || latest.created_at,
      outcome,
      hasDealSave,
      yesStage,
      attentionType,
      isClosed,
      isFollowUp,
      isAttention,
      isLive,
      isDidNotRewrite,
    };
  });
}

const AdminDashboard = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const currentMonth = useMemo(getCurrentMonth, []);
  const monthDetails = useMemo(() => getMonthBounds(currentMonth), [currentMonth]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [regionProduction, setRegionProduction] = useState([]);
  const [topAgents, setTopAgents] = useState([]);
  const [topOffices, setTopOffices] = useState([]);
  const [topCompanies, setTopCompanies] = useState([]);
  const [quoteSnapshot, setQuoteSnapshot] = useState({ attention: 0, open: 0, followups: 0, items: [] });
  const [ticketSnapshot, setTicketSnapshot] = useState({ pending: 0, notStarted: 0, inProgress: 0 });

  const adminName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Admin';

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [
        dashboardResult,
        officeSettingsResult,
        officeGoalsResult,
        ticketsResult,
        quoteResult,
        followUpWorkflowResult,
        transferRows,
      ] = await Promise.all([
        supabase.rpc('get_office_numbers_dashboard', { p_month: currentMonth }),
        supabase.from('office_dashboard_settings').select('office_code, region'),
        supabase.from('office_monthly_goals').select('office_code, report_month, nb_rw_goal').eq('report_month', currentMonth),
        supabase.from('tickets').select('id, status, assigned_to, urgency, created_at'),
        supabase
          .from('quote_log_view')
          .select('*')
          .gte('started_at', `${monthDetails.firstDay}T00:00:00`)
          .lt('started_at', `${monthDetails.nextMonthFirstDay}T00:00:00`)
          .order('started_at', { ascending: false }),
        supabase
          .from('quote_workflow')
          .select('quote_id, outcome, follow_up_needed, follow_up_at, quote_business_type, existing_client_reason, first_yes_ready_now, second_yes_id_vin, third_yes_payment_ready, payment_method')
          .or('follow_up_needed.eq.true,outcome.eq.follow_up')
          .gte('follow_up_at', `${monthDetails.firstDay}T00:00:00`)
          .lt('follow_up_at', `${monthDetails.nextMonthFirstDay}T00:00:00`),
        fetchAllCurrentMonthTransfers(monthDetails.firstDay, monthDetails.nextMonthFirstDay),
      ]);

      const firstError =
        dashboardResult.error ||
        officeSettingsResult.error ||
        officeGoalsResult.error ||
        ticketsResult.error ||
        quoteResult.error ||
        followUpWorkflowResult.error;
      if (firstError) throw firstError;

      const dashboardRows = (dashboardResult.data || []).filter(
        (row) => cleanStr(row.comparison_period).toLowerCase() === 'current'
      );

      const regionMap = {};
      (officeSettingsResult.data || []).forEach((row) => {
        regionMap[normalizeOffice(row.office_code)] = cleanStr(row.region) || 'Unassigned';
      });

      const goalMap = {};
      (officeGoalsResult.data || []).forEach((row) => {
        goalMap[normalizeOffice(row.office_code)] = Number(row.nb_rw_goal) || 0;
      });

      const latestDataDate = dashboardRows.reduce((latest, row) => {
        const value = cleanStr(row.latest_data_date);
        return value && (!latest || value > latest) ? value : latest;
      }, '');

      let asOfDay = monthDetails.daysInMonth;
      if (latestDataDate) {
        const [year, month, day] = latestDataDate.split('-').map(Number);
        if (year === monthDetails.year && month === monthDetails.month) {
          asOfDay = Math.max(1, Math.min(day, monthDetails.daysInMonth));
        }
      }
      const projectionMultiplier = asOfDay < monthDetails.daysInMonth
        ? monthDetails.daysInMonth / asOfDay
        : 1;

      const officeRows = dashboardRows.map((row) => {
        const office = normalizeOffice(row.office_code || row.office);
        const actual = Number(row.nb_rw_count) || 0;
        const goal = goalMap[office] || 0;
        const pace = actual * projectionMultiplier;
        return {
          office,
          region: cleanStr(row.region) || regionMap[office] || 'Unassigned',
          actual,
          goal,
          pace,
        };
      });

      const regionBuckets = new Map();
      officeRows.forEach((row) => {
        if (!regionBuckets.has(row.region)) {
          regionBuckets.set(row.region, { region: row.region, actual: 0, goal: 0, pace: 0, offices: 0 });
        }
        const bucket = regionBuckets.get(row.region);
        bucket.actual += row.actual;
        bucket.goal += row.goal;
        bucket.pace += row.pace;
        bucket.offices += 1;
      });

      const regional = Array.from(regionBuckets.values())
        .map((row) => ({
          ...row,
          actualPercent: row.goal > 0 ? (row.actual / row.goal) * 100 : 0,
          pacePercent: row.goal > 0 ? (row.pace / row.goal) * 100 : 0,
          status: row.goal <= 0 ? 'No Goal' : row.pace >= row.goal ? 'On Track' : 'Behind',
        }))
        .sort((a, b) => b.actual - a.actual);

      setRegionProduction(regional);
      setTopOffices(
        [...officeRows]
          .sort((a, b) => b.actual - a.actual)
          .slice(0, 5)
      );

      const seenTransactions = new Set();
      const validSales = (transferRows || []).filter((row) => {
        if (isVoided(row)) return false;
        const key = transferKey(row);
        if (seenTransactions.has(key)) return false;
        seenTransactions.add(key);
        const type = cleanStr(row.type).toUpperCase();
        return type === 'NEW' || type === 'RWR';
      });

      const agentBuckets = new Map();
      const companyBuckets = new Map();

      validSales.forEach((row) => {
        const email = cleanStr(row.agent_email).toLowerCase() || 'unknown-agent';
        const office = normalizeOffice(row.office);
        const stamp = new Date(row.date_time || 0).getTime();
        const csr = cleanStr(row.csr);

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

        const company = cleanStr(row.company);
        if (company) companyBuckets.set(company, (companyBuckets.get(company) || 0) + 1);
      });

      setTopAgents(
        Array.from(agentBuckets.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
      );
      setTopCompanies(
        Array.from(companyBuckets.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
      );

      const activeTickets = (ticketsResult.data || []).filter(
        (ticket) => !['Completed', 'Cancelled'].includes(ticket.status)
      );
      setTicketSnapshot({
        pending: activeTickets.length,
        notStarted: activeTickets.filter((ticket) => !ticket.assigned_to).length,
        inProgress: activeTickets.filter((ticket) => Boolean(ticket.assigned_to)).length,
      });

      const quoteRowMap = new Map((quoteResult.data || []).filter((row) => row?.id).map((row) => [row.id, row]));
      const scheduledFollowUpRows = followUpWorkflowResult.data || [];
      const scheduledFollowUpIds = [...new Set(scheduledFollowUpRows.map((row) => row.quote_id).filter(Boolean))];

      for (let index = 0; index < scheduledFollowUpIds.length; index += 200) {
        const ids = scheduledFollowUpIds.slice(index, index + 200);
        const { data: followUpQuotes, error: followUpQuoteError } = await supabase
          .from('quote_log_view')
          .select('*')
          .in('id', ids);
        if (followUpQuoteError) throw followUpQuoteError;
        (followUpQuotes || []).forEach((row) => { if (row?.id) quoteRowMap.set(row.id, row); });
      }

      const quoteRows = Array.from(quoteRowMap.values());
      const quoteIds = [...new Set(quoteRows.map((row) => row.id).filter(Boolean))];
      let workflowRows = [...scheduledFollowUpRows];
      let dealSaveRows = [];
      let supplementalQuoteRows = [];
      let quoteEventRows = [];

      for (let index = 0; index < quoteIds.length; index += 200) {
        const ids = quoteIds.slice(index, index + 200);
        const [workflowResult, dealSaveResult, supplementalResult, eventsResult] = await Promise.all([
          supabase
            .from('quote_workflow')
            .select('quote_id, outcome, follow_up_needed, follow_up_at, quote_business_type, existing_client_reason, first_yes_ready_now, second_yes_id_vin, third_yes_payment_ready, payment_method')
            .in('quote_id', ids),
          supabase
            .from('quote_deal_save_requests')
            .select('id, quote_id, status, created_at, updated_at')
            .in('quote_id', ids),
          // Match Quote Operations: these fields are what allow 2nd/3rd Yes to be
          // inferred from the actual license/VIN activity captured by the extension.
          supabase
            .from('quotes')
            .select('id, driver_count, drivers_with_license, any_license_entered, vehicle_count, vehicles_with_full_vin, any_full_vin_entered')
            .in('id', ids),
          // POLICY_BOUND is authoritative in Quote Operations and must be reflected
          // here too so the dashboard uses the same final classification.
          supabase
            .from('quote_events')
            .select('quote_id, event_type, event_at, created_at')
            .in('quote_id', ids),
        ]);
        if (workflowResult.error) throw workflowResult.error;
        if (dealSaveResult.error) throw dealSaveResult.error;
        if (supplementalResult.error) throw supplementalResult.error;
        if (eventsResult.error) throw eventsResult.error;
        const knownWorkflowIds = new Set(workflowRows.map((row) => row.quote_id));
        (workflowResult.data || []).forEach((row) => {
          if (!knownWorkflowIds.has(row.quote_id)) workflowRows.push(row);
        });
        dealSaveRows = dealSaveRows.concat(dealSaveResult.data || []);
        supplementalQuoteRows = supplementalQuoteRows.concat(supplementalResult.data || []);
        quoteEventRows = quoteEventRows.concat(eventsResult.data || []);
      }

      const supplementalById = new Map(supplementalQuoteRows.map((row) => [row.id, row]));
      const policyBoundById = new Map();
      quoteEventRows.forEach((event) => {
        if (cleanStr(event?.event_type).toUpperCase() !== 'POLICY_BOUND') return;
        const eventAt = event.event_at || event.created_at || null;
        const existing = policyBoundById.get(event.quote_id);
        if (!existing || new Date(eventAt || 0).getTime() > new Date(existing || 0).getTime()) {
          policyBoundById.set(event.quote_id, eventAt);
        }
      });

      const enrichedQuoteRows = quoteRows.map((row) => ({
        ...row,
        ...(supplementalById.get(row.id) || {}),
        policy_bound_detected: policyBoundById.has(row.id),
        policy_bound_at: policyBoundById.get(row.id) || null,
      }));

      const quoteGroups = buildQuoteGroups(enrichedQuoteRows, workflowRows, dealSaveRows);
      const attentionGroups = quoteGroups
        .filter((group) => group.isAttention)
        .sort((a, b) => {
          const aRank = a.outcome === 'lost_deal' || a.hasDealSave ? 0 : 1;
          const bRank = b.outcome === 'lost_deal' || b.hasDealSave ? 0 : 1;
          if (aRank !== bRank) return aRank - bRank;
          return latestTimestamp(a.latest) - latestTimestamp(b.latest);
        });

      // Keep the dashboard counts aligned with the Quote Operations tabs.
      // "Open Quotes" means the actual Quotes bucket only (stage 0 / regular quotes),
      // not every unresolved customer record.
      const dashboardQuoteGroups = quoteGroups.filter((group) => {
        if (group.isClosed || group.isLive || group.isFollowUp) return false;
        if (group.isDidNotRewrite) return true;
        return Number(group.yesStage || 0) === 0;
      });

      setQuoteSnapshot({
        attention: attentionGroups.length,
        open: dashboardQuoteGroups.length,
        followups: quoteGroups.filter((group) => group.isFollowUp).length,
        items: attentionGroups.slice(0, 4),
      });

      setLastUpdated(new Date());
    } catch (loadError) {
      console.error('[AdminDashboard] load failed:', loadError);
      setError(loadError?.message || 'Unable to load the admin dashboard.');
    } finally {
      setLoading(false);
    }
  }, [currentMonth, monthDetails]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const companyTotal = useMemo(
    () => regionProduction.reduce((sum, row) => sum + row.actual, 0),
    [regionProduction]
  );
  const companyGoal = useMemo(
    () => regionProduction.reduce((sum, row) => sum + row.goal, 0),
    [regionProduction]
  );
  const companyPace = useMemo(
    () => regionProduction.reduce((sum, row) => sum + row.pace, 0),
    [regionProduction]
  );

  const openPage = (path) => navigate(path);

  return (
    <main className={styles.adminHome}>
      <section className={styles.homeHero}>
        <div>
          <div className={styles.homeEyebrow}>ADMIN / EXECUTIVE OVERVIEW</div>
          <h1>Welcome, {adminName}</h1>
          <p>Production, quote opportunities, support workload, and company leaders in one view.</p>
        </div>
        <div className={styles.homeHeroActions}>
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
          <button type="button" onClick={loadDashboard} disabled={loading}>
            <RefreshCw size={16} className={loading ? styles.spinIcon : ''} />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </section>

      {error && <div className={styles.homeError}>{error}</div>}

      <section className={styles.executiveStrip}>
        <div>
          <span>Company Production</span>
          <strong>{formatNumber(companyTotal)}</strong>
          <small>NB/RW month to date</small>
        </div>
        <div>
          <span>Company Goal</span>
          <strong>{companyGoal ? formatNumber(companyGoal) : 'Not Set'}</strong>
          <small>{companyGoal ? `${Math.round((companyTotal / companyGoal) * 100)}% achieved` : 'Goals come from Office Numbers'}</small>
        </div>
        <div>
          <span>Projected Pace</span>
          <strong>{formatDecimal(companyPace)}</strong>
          <small>{companyGoal ? `${Math.round((companyPace / companyGoal) * 100)}% of goal pace` : 'Current month projection'}</small>
        </div>
      </section>

      <section className={styles.homeSection}>
        <div className={styles.sectionTitleRow}>
          <div>
            <div className={styles.sectionKicker}><ChartNoAxesCombined size={16} /> Production</div>
            <h2>Regional Production</h2>
            <p>Total to date, projected month-end pace, and monthly goal by region.</p>
          </div>
          <button type="button" className={styles.textLinkButton} onClick={() => openPage('/admin/office-numbers')}>
            Open Office Numbers <ExternalLink size={14} />
          </button>
        </div>

        <div className={styles.regionGrid}>
          {regionProduction.map((region) => {
            const progress = Math.min(100, Math.max(0, region.actualPercent));
            return (
              <article key={region.region} className={styles.regionCard}>
                <div className={styles.regionCardTop}>
                  <div>
                    <span>{region.region}</span>
                    <strong>{formatNumber(region.actual)}</strong>
                    <small>production to date</small>
                  </div>
                  <span className={`${styles.statusPill} ${region.status === 'On Track' ? styles.statusOnTrack : region.status === 'Behind' ? styles.statusBehind : styles.statusNoGoal}`}>
                    {region.status}
                  </span>
                </div>
                <div className={styles.productionProgressTrack}>
                  <div className={styles.productionProgressFill} style={{ width: `${progress}%` }} />
                </div>
                <div className={styles.regionMetrics}>
                  <div><span>Goal</span><strong>{region.goal ? formatNumber(region.goal) : '—'}</strong></div>
                  <div><span>Pace</span><strong>{formatDecimal(region.pace)}</strong></div>
                  <div><span>Projected</span><strong>{region.goal ? `${Math.round(region.pacePercent)}%` : '—'}</strong></div>
                </div>
              </article>
            );
          })}
          {!loading && regionProduction.length === 0 && <div className={styles.emptyState}>No regional production data is available for this month yet.</div>}
        </div>
      </section>

      <section className={styles.snapshotGrid}>
        <button type="button" className={`${styles.snapshotCard} ${styles.snapshotAttention}`} onClick={() => openPage('/admin/quote-log')}>
          <AlertTriangle size={20} />
          <div><span>Needs Attention</span><strong>{quoteSnapshot.attention}</strong><small>Lost Deals, Walks & unresolved 3 Yes</small></div>
        </button>
        <button type="button" className={styles.snapshotCard} onClick={() => openPage('/admin/quote-log')}>
          <Target size={20} />
          <div><span>Open Quotes</span><strong>{quoteSnapshot.open}</strong><small>Unresolved quote opportunities</small></div>
        </button>
        <button type="button" className={styles.snapshotCard} onClick={() => openPage('/admin/quote-log')}>
          <CalendarClock size={20} />
          <div><span>Follow-Ups</span><strong>{quoteSnapshot.followups}</strong><small>Customers scheduled for follow-up</small></div>
        </button>
        <button type="button" className={styles.snapshotCard} onClick={() => openPage('/admin/tickets')}>
          <Ticket size={20} />
          <div><span>Pending Tickets</span><strong>{ticketSnapshot.pending}</strong><small>{ticketSnapshot.notStarted} not started · {ticketSnapshot.inProgress} in progress</small></div>
        </button>
      </section>

      <section className={styles.twoColumnGrid}>
        <article className={styles.homePanel}>
          <div className={styles.panelHeader}>
            <div><span className={styles.panelKicker}>QUOTE OPERATIONS</span><h2>Needs Attention</h2></div>
            <button type="button" onClick={() => openPage('/admin/quote-log')}>View All</button>
          </div>
          <div className={styles.attentionList}>
            {quoteSnapshot.items.map((item) => (
              <button type="button" key={item.key} className={styles.attentionRow} onClick={() => openPage('/admin/quote-log')}>
                <span className={styles.attentionDot} />
                <div>
                  <strong>{item.customerName}</strong>
                  <span>{item.agentName} · {item.office}</span>
                </div>
                <div className={styles.attentionMeta}>
                  <strong>{item.attentionType || (item.outcome === 'walk' && !item.hasDealSave ? 'Walk' : 'Lost Deal')}</strong>
                  <span>{formatRelativeTime(item.lastActivityAt)}</span>
                </div>
              </button>
            ))}
            {!loading && quoteSnapshot.items.length === 0 && (
              <div className={styles.emptyState}>Nothing currently needs attention.</div>
            )}
          </div>
        </article>

        <article className={styles.homePanel}>
          <div className={styles.panelHeader}>
            <div><span className={styles.panelKicker}>SUPPORT</span><h2>Ticket Workload</h2></div>
            <button type="button" onClick={() => openPage('/admin/tickets')}>Open Tickets</button>
          </div>
          <div className={styles.ticketHeroNumber}>{ticketSnapshot.pending}</div>
          <div className={styles.ticketBreakdown}>
            <div><span>Not Started</span><strong>{ticketSnapshot.notStarted}</strong></div>
            <div><span>In Progress</span><strong>{ticketSnapshot.inProgress}</strong></div>
          </div>
          <p className={styles.panelFootnote}>Pending excludes tickets marked Completed or Cancelled.</p>
        </article>
      </section>

      <section className={styles.homeSection}>
        <div className={styles.sectionTitleRow}>
          <div>
            <div className={styles.sectionKicker}><Trophy size={16} /> Leaders</div>
            <h2>Top Performers</h2>
            <p>Current-month NB/RW production leaders.</p>
          </div>
        </div>

        <div className={styles.leaderboardGrid}>
          <LeaderboardCard title="Top Agents" icon={<Users size={18} />} rows={topAgents.map((row) => ({ label: row.name, sublabel: row.office, value: row.count }))} />
          <LeaderboardCard title="Top Offices" icon={<Building2 size={18} />} rows={topOffices.map((row) => ({ label: row.office, sublabel: row.region, value: row.actual }))} />
          <LeaderboardCard title="Top Companies Sold" icon={<Trophy size={18} />} rows={topCompanies.map((row) => ({ label: row.name, sublabel: 'NEW + RWR', value: row.count }))} />
        </div>
      </section>

      <section className={styles.connecteamPanel}>
        <div className={styles.connecteamIcon}><Megaphone size={22} /></div>
        <div className={styles.connecteamCopy}>
          <span className={styles.panelKicker}>CONNECTEAM</span>
          <h2>Company Updates</h2>
          <p>This space is reserved for the Connecteam Updates API feed. The dashboard layout is ready so the feed can be wired here without redesigning the page.</p>
        </div>
        <div className={styles.connecteamStatus}>API READY TO CONNECT</div>
      </section>
    </main>
  );
};

const LeaderboardCard = ({ title, icon, rows }) => (
  <article className={styles.leaderboardCard}>
    <div className={styles.leaderboardHeader}><span>{icon}</span><h3>{title}</h3></div>
    <div className={styles.leaderboardList}>
      {rows.length ? rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className={styles.leaderboardRow}>
          <span className={styles.rankNumber}>{index + 1}</span>
          <div><strong>{row.label}</strong><span>{row.sublabel}</span></div>
          <b>{formatNumber(row.value)}</b>
        </div>
      )) : <div className={styles.emptyState}>No production data yet.</div>}
    </div>
  </article>
);

export default AdminDashboard;

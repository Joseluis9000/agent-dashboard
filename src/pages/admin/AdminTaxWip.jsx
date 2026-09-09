import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import styles from './AdminTaxWip.module.css';
import {
  addDaysKey,
  calculateAgentCommission,
  getWeekRange,
} from '../../utils/commissionCalculations';

const TABLE_TRANSFERS = 'daily_transaction_detail_transfers';
const TABLE_VIOLATIONS = 'violations';
const TABLE_DISQUALIFIED = 'disqualified_policies';
const TABLE_COMMISSION_RECORDS = 'agent_commission_records';
const TABLE_BALANCE_LEDGER = 'agent_commission_balance_ledger';

const BUSINESS_TIME_ZONE = 'America/Los_Angeles';
const PAGE_SIZES = [25, 50, 100];

const clean = (value) => String(value ?? '').trim();
const emailKey = (value) => clean(value).toLowerCase();
const upper = (value) => clean(value).toUpperCase();
const numberOrZero = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const money = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
}).format(numberOrZero(value));

const percent = (value) => `${(numberOrZero(value) * 100).toFixed(1)}%`;

const dateKey = (value) => {
  const raw = clean(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
};

const displayDate = (value, long = false) => {
  const key = dateKey(value);
  if (!key) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: long ? 'long' : 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${key}T12:00:00Z`));
};

const displayDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
};

const businessDate = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const addDays = (key, days) => {
  if (!dateKey(key)) return '';
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const mondayOf = (key) => {
  if (!dateKey(key)) return '';
  const d = new Date(`${key}T12:00:00Z`);
  const day = d.getUTCDay();
  return addDays(key, day === 0 ? -6 : 1 - day);
};

// Management schedule: production Monday-Sunday is paid Friday 18 days after Monday.
// Example: 2026-08-24 through 2026-08-30 -> Friday 2026-09-11.
const scheduledPayday = (weekStart) => addDays(weekStart, 18);

const getPayContext = (today = businessDate()) => {
  const currentMonday = mondayOf(today);
  let friday = addDays(currentMonday, 4);
  if (today > friday) friday = addDays(friday, 7);
  return {
    today,
    currentMonday,
    friday,
    payingWeek: addDays(mondayOf(friday), -14),
  };
};

const weekLabel = (weekStart) =>
  `${displayDate(weekStart, true)} – ${displayDate(addDays(weekStart, 6), true)}`;


const normalizeOffice = (value) => {
  const match = upper(value).match(/\bCA\s*(\d{1,3})\b/);
  return match ? `CA${match[1].padStart(3, '0')}` : clean(value);
};

async function fetchAll(buildQuery, pageSize = 1000, maxRows = 250000) {
  const output = [];
  let from = 0;

  while (from < maxRows) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    output.push(...rows);
    if (rows.length < pageSize) break;
    from += rows.length;
  }

  return output;
}


const buildMissedBy = (result) => {
  if (!result) return '—';
  if (result.netRevenue < 500) {
    return `${money(500 - result.netRevenue)} short of the $500 minimum net revenue`;
  }
  if (result.commissionRate > 0) {
    const next = result.nextTierProgress;
    if (!next) return 'Qualified';
    const pieces = [];
    if (numberOrZero(next.nbNeeded) > 0) pieces.push(`${next.nbNeeded} Net NB`);
    if (numberOrZero(next.revenueNeeded) > 0) {
      pieces.push(`${money(next.revenueNeeded)} Gross Revenue`);
    }
    if (numberOrZero(next.revenueOnlyNeeded) > 0) {
      pieces.push(`or ${money(next.revenueOnlyNeeded)} revenue-only`);
    }
    return pieces.length ? `Next tier: ${pieces.join(' + ')}` : 'Qualified';
  }

  const nbShort = Math.max(8 - numberOrZero(result.netNbCount), 0);
  const revenueShort = Math.max(2500 - numberOrZero(result.grossRevenue), 0);
  const parts = [];
  if (nbShort) parts.push(`${nbShort} Net NB short`);
  if (revenueShort) parts.push(`${money(revenueShort)} Gross Revenue short`);
  return parts.join(' / ') || 'Did not meet tier requirements';
};

const resultFromPublished = (live, saved, weekStart) => {
  if (!saved) return {
    ...live,
    commissionBeforeBalance: Math.max(0, numberOrZero(live.finalPayableCommission)),
    balanceApplied: 0,
    payoutDate: scheduledPayday(weekStart),
    published: false,
  };

  return {
    ...live,
    grossRevenue: Number(saved.gross_revenue ?? live.grossRevenue),
    grossPay: Number(saved.gross_pay ?? live.grossPay),
    royaltyDeduction: Number(saved.royalty_deduction ?? live.royaltyDeduction),
    netRevenue: Number(saved.net_revenue ?? live.netRevenue),
    grossNbCount: Number(saved.gross_nb_count ?? live.grossNbCount),
    disqualifiedNbCount: Number(saved.disqualified_nb_count ?? live.disqualifiedNbCount),
    netNbCount: Number(saved.net_nb_count ?? live.netNbCount),
    tierName: saved.tier || live.tierName,
    commissionRate: Number(saved.commission_rate ?? live.commissionRate),
    basePayout: Number(saved.base_payout ?? live.basePayout),
    totalDeductions: Number(saved.total_deductions ?? live.totalDeductions),
    calculatedWeeklyCommission: Number(
      saved.calculated_weekly_commission ?? live.calculatedWeeklyCommission
    ),
    commissionBeforeBalance: Number(
      saved.commission_before_balance ??
      (numberOrZero(saved.final_payable_commission) + numberOrZero(saved.balance_applied)) ??
      live.finalPayableCommission
    ),
    balanceApplied: Number(saved.balance_applied ?? 0),
    finalPayableCommission: Number(
      saved.final_payable_commission ?? live.finalPayableCommission
    ),
    violationCount: Number(saved.violation_count ?? live.violationCount),
    disqualifiedCount: Number(saved.disqualified_count ?? live.disqualifiedCount),
    isLicensedCaDoi: saved.is_licensed_ca_doi !== false,
    status: saved.status || live.status,
    payoutDate: saved.payout_date || scheduledPayday(weekStart),
    published: true,
    publishedAt: saved.published_at,
    publishedBy: saved.published_by,
  };
};

const hasPublishedDrift = (live, saved) => {
  if (!saved) return false;
  const compare = [
    ['gross_revenue', live.grossRevenue],
    ['net_revenue', live.netRevenue],
    ['gross_nb_count', live.grossNbCount],
    ['disqualified_nb_count', live.disqualifiedNbCount],
    ['net_nb_count', live.netNbCount],
    ['total_deductions', live.totalDeductions],
  ];
  return compare.some(([field, liveValue]) =>
    Math.abs(numberOrZero(saved[field]) - numberOrZero(liveValue)) > 0.009
  );
};

const paginate = (rows, page, size) => {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(page, 1), pages);
  const start = (current - 1) * size;
  return {
    rows: rows.slice(start, start + size),
    page: current,
    pages,
    total: rows.length,
    first: rows.length ? start + 1 : 0,
    last: Math.min(start + size, rows.length),
  };
};

function Badge({ children, tone = 'neutral' }) {
  return <span className={`${styles.badge} ${styles[`tone_${tone}`]}`}>{children}</span>;
}

function Loading({ text = 'Loading commission data...' }) {
  return (
    <div className={styles.loading}>
      <span className={styles.spinner} aria-hidden="true" />
      <div>
        <strong>Please wait</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function Pager({ info, onPage }) {
  return (
    <div className={styles.pager}>
      <span>
        Showing <b>{info.first}-{info.last}</b> of <b>{info.total}</b> agents
      </span>
      <div>
        <button type="button" disabled={info.page === 1} onClick={() => onPage(1)}>First</button>
        <button type="button" disabled={info.page === 1} onClick={() => onPage(info.page - 1)}>Previous</button>
        <span>{info.page} / {info.pages}</span>
        <button type="button" disabled={info.page === info.pages} onClick={() => onPage(info.page + 1)}>Next</button>
        <button type="button" disabled={info.page === info.pages} onClick={() => onPage(info.pages)}>Last</button>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, tone = 'blue' }) {
  return (
    <div className={`${styles.metric} ${styles[`metric_${tone}`]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function AgentDetail({ bundle, publishedRecord, balance, weekStart }) {
  if (!bundle) {
    return (
      <section className={styles.panel}>
        <div className={styles.empty}>Select an agent to review their commission details.</div>
      </section>
    );
  }

  const { agent, liveResult, displayResult, transactions, violations, disqualified } = bundle;
  const activeViolations = violations.filter((row) => upper(row.status) !== 'VOIDED');
  const activeDisqualified = disqualified.filter((row) => upper(row.status) !== 'VOIDED');
  const feeRows = [
    ['Broker Fee', liveResult.brokerFeeRevenue, liveResult.brokerFeeCount],
    ['Endorsement Fee', liveResult.endorsementFeeRevenue, liveResult.endorsementFeeCount],
    ['Reinstatement Fee', liveResult.reinstatementFeeRevenue, liveResult.reinstatementFeeCount],
    ['Renewal Fee', liveResult.renewalFeeRevenue, liveResult.renewalFeeCount],
  ];

  return (
    <section className={styles.agentDetail}>
      <header className={styles.detailHeader}>
        <div>
          <span className={styles.eyebrow}>AGENT COMMISSION REVIEW</span>
          <h2>{agent.full_name || agent.email}</h2>
          <p>{agent.email} · {agent.offices.join(', ') || 'Office not identified'}</p>
        </div>
        <div className={styles.detailBadges}>
          <Badge tone={publishedRecord ? 'green' : 'amber'}>
            {publishedRecord ? 'PUBLISHED' : 'DRAFT'}
          </Badge>
          <Badge tone={displayResult.finalPayableCommission > 0 ? 'green' : 'neutral'}>
            {displayResult.status}
          </Badge>
        </div>
      </header>

      {publishedRecord && hasPublishedDrift(liveResult, publishedRecord) && (
        <div className={styles.warningBox}>
          <strong>Source data changed after this commission was published.</strong>
          <p>
            The published amount remains the agent-facing final result. Live source values are shown
            in the detail below so management can investigate without silently rewriting history.
          </p>
        </div>
      )}

      <div className={styles.detailMetrics}>
        <Metric label="Cash commission payable" value={money(displayResult.finalPayableCommission)} sub={displayResult.tierName} tone="green" />
        <Metric label="Net NB" value={displayResult.netNbCount} sub={`${displayResult.grossNbCount} gross · ${displayResult.disqualifiedNbCount} disqualified`} />
        <Metric label="Gross revenue" value={money(displayResult.grossRevenue)} />
        <Metric label="Current AR / SV balance" value={balance == null ? '—' : money(balance)} sub={displayResult.balanceApplied > 0 ? `${money(displayResult.balanceApplied)} will be / was applied` : 'No balance application'} tone="amber" />
      </div>

      <div className={styles.detailGrid}>
        <section className={styles.subPanel}>
          <h3>Commission calculation</h3>
          <dl className={styles.calcList}>
            <div><dt>Gross Revenue</dt><dd>{money(displayResult.grossRevenue)}</dd></div>
            <div><dt>20% Royalty</dt><dd>− {money(displayResult.royaltyDeduction)}</dd></div>
            <div><dt>Gross Pay</dt><dd>− {money(displayResult.grossPay)}</dd></div>
            <div className={styles.calcStrong}><dt>Net Revenue</dt><dd>{money(displayResult.netRevenue)}</dd></div>
            <div><dt>{displayResult.tierName} Rate</dt><dd>{percent(displayResult.commissionRate)}</dd></div>
            <div><dt>Base Commission</dt><dd>{money(displayResult.basePayout)}</dd></div>
            <div><dt>Violation Deductions</dt><dd>− {money(displayResult.totalDeductions)}</dd></div>
            <div className={styles.calcStrong}><dt>Commission Before AR / SV</dt><dd>{money(displayResult.commissionBeforeBalance ?? displayResult.finalPayableCommission + numberOrZero(displayResult.balanceApplied))}</dd></div>
            <div><dt>AR / Scanning Balance Applied</dt><dd>− {money(displayResult.balanceApplied || 0)}</dd></div>
            <div className={styles.calcFinal}><dt>Cash Commission Payable</dt><dd>{money(displayResult.finalPayableCommission)}</dd></div>
          </dl>
        </section>

        <section className={styles.subPanel}>
          <h3>Qualification</h3>
          <div className={styles.qualifyHero}>
            <strong>{displayResult.tierName} · {percent(displayResult.commissionRate)}</strong>
            <p>{buildMissedBy(displayResult)}</p>
          </div>
          <dl className={styles.infoGrid}>
            <div><dt>Licensed</dt><dd>{displayResult.isLicensedCaDoi ? 'Yes' : 'No'}</dd></div>
            <div><dt>Violations</dt><dd>{displayResult.violationCount}</dd></div>
            <div><dt>Disqualified</dt><dd>{displayResult.disqualifiedCount}</dd></div>
            <div><dt>Scheduled payday</dt><dd>{displayDate(scheduledPayday(weekStart))}</dd></div>
          </dl>
          {publishedRecord && (
            <p className={styles.publishedMeta}>
              Published {displayDateTime(publishedRecord.published_at)} by {publishedRecord.published_by || 'management'}
            </p>
          )}
        </section>
      </div>

      <section className={styles.subPanel}>
        <h3>Commissionable revenue breakdown</h3>
        <div className={styles.feeGrid}>
          {feeRows.map(([category, revenue, count]) => (
            <Metric key={category} label={category} value={money(revenue)} sub={`${count} active item${count === 1 ? '' : 's'}`} />
          ))}
        </div>
      </section>

      <div className={styles.detailGrid}>
        <section className={styles.subPanel}>
          <div className={styles.subHeader}>
            <div><h3>Violations & charges</h3><p>Assigned to this commission week.</p></div>
            <Badge tone={activeViolations.length ? 'amber' : 'green'}>{activeViolations.length}</Badge>
          </div>
          <div className={styles.compactList}>
            {activeViolations.length ? activeViolations.map((row) => (
              <div key={row.id}>
                <div>
                  <strong>{row.violation_category || row.violation_type || 'Violation'}</strong>
                  <small>{row.client_name || row.policy_number || row.customer_id || 'Client not recorded'}</small>
                  <small>{clean(row.details) || 'No explanation stored.'}</small>
                </div>
                <b>− {money(row.fee_amount)}</b>
              </div>
            )) : <p className={styles.emptySmall}>No active violations.</p>}
          </div>
        </section>

        <section className={styles.subPanel}>
          <div className={styles.subHeader}>
            <div><h3>Disqualified policies</h3><p>Verified production exclusions for this week.</p></div>
            <Badge tone={activeDisqualified.length ? 'purple' : 'green'}>{activeDisqualified.length}</Badge>
          </div>
          <div className={styles.compactList}>
            {activeDisqualified.length ? activeDisqualified.map((row) => (
              <div key={row.id}>
                <div>
                  <strong>{row.policy_number || row.linked_receipt_id || 'Policy'}</strong>
                  <small>{row.client_name || 'Customer not recorded'}</small>
                  <small>{clean(row.details) || 'No explanation stored.'}</small>
                </div>
                <Badge tone={row.linked_sync_key ? 'green' : 'amber'}>
                  {row.linked_sync_key ? 'RECEIPT LINKED' : 'LINK MISSING'}
                </Badge>
              </div>
            )) : <p className={styles.emptySmall}>No active disqualified policies.</p>}
          </div>
        </section>
      </div>

      <details className={styles.productionDetails}>
        <summary>View source transaction log ({transactions.length} rows)</summary>
        <div className={styles.tableViewport}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Date</th><th>Customer</th><th>Receipt</th><th>Policy</th>
                <th>Type</th><th>Company</th><th>Fee</th><th>Office</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((row, index) => (
                <tr key={row.sync_key || row.id || index}>
                  <td>{displayDate(row.date_time)}</td>
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
      </details>
    </section>
  );
}

export default function AdminTaxWip() {
  const today = businessDate();
  const payContext = useMemo(() => getPayContext(today), [today]);
  const [anchorDate, setAnchorDate] = useState(() =>
    new Date(`${payContext.payingWeek}T12:00:00`)
  );

  const week = useMemo(() => getWeekRange(anchorDate), [anchorDate]);
  const weekStart = week.weekStart;
  const weekEnd = week.weekEnd;
  const nextWeekStart = useMemo(() => addDaysKey(weekEnd, 1), [weekEnd]);

  const [transactions, setTransactions] = useState([]);
  const [violations, setViolations] = useState([]);
  const [disqualified, setDisqualified] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [publishedRecords, setPublishedRecords] = useState([]);
  const [balanceLedger, setBalanceLedger] = useState([]);

  const [grossPayByAgent, setGrossPayByAgent] = useState({});
  const [licenseByAgent, setLicenseByAgent] = useState({});
  const [selectedEmail, setSelectedEmail] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Loading commission week...');
  const [error, setError] = useState('');
  const [publishStatus, setPublishStatus] = useState('');
  const [publishing, setPublishing] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [officeFilter, setOfficeFilter] = useState('');
  const [sort, setSort] = useState('attention');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const loadWeeklyData = useCallback(async () => {
    setLoading(true);
    setError('');
    setPublishStatus('');
    setLoadingText('Loading production, violations, policies and published records...');

    try {
      const [tx, vio, dp, published, allProfiles, ledger] = await Promise.all([
        fetchAll(() =>
          supabase
            .from(TABLE_TRANSFERS)
            .select('*')
            .gte('date_time', `${weekStart} 00:00:00`)
            .lt('date_time', `${nextWeekStart} 00:00:00`)
            .not('agent_email', 'is', null)
            .order('agent_email', { ascending: true })
            .order('date_time', { ascending: true })
            .order('sync_key', { ascending: true })
        ),
        fetchAll(() =>
          supabase
            .from(TABLE_VIOLATIONS)
            .select('*')
            .or(`deduction_week_start.eq.${weekStart},and(deduction_week_start.is.null,week_start_date.eq.${weekStart})`)
            .order('created_at', { ascending: true })
        ),
        fetchAll(() =>
          supabase
            .from(TABLE_DISQUALIFIED)
            .select('*')
            .or(`deduction_week_start.eq.${weekStart},and(deduction_week_start.is.null,week_start_date.eq.${weekStart})`)
            .order('created_at', { ascending: true })
        ),
        fetchAll(() =>
          supabase
            .from(TABLE_COMMISSION_RECORDS)
            .select('*')
            .eq('week_start_date', weekStart)
            .order('agent_email', { ascending: true })
        ),
        fetchAll(() =>
          supabase
            .from('profiles')
            .select('id,email,full_name,office,region,role')
            .not('email', 'is', null)
            .order('full_name', { ascending: true })
        ),
        fetchAll(() =>
          supabase
            .from(TABLE_BALANCE_LEDGER)
            .select('id,agent_email,category,amount,entry_type,entry_date,linked_violation_id')
            .in('category', ['AR', 'SCANNING'])
            .order('id', { ascending: true })
        ),
      ]);

      setTransactions(tx);
      setViolations(vio);
      setDisqualified(dp);
      setPublishedRecords(published);
      setProfiles(allProfiles);
      setBalanceLedger(ledger);

      const publishedMap = new Map(
        published.map((record) => [emailKey(record.agent_email), record])
      );

      setGrossPayByAgent((prior) => {
        const next = { ...prior };
        publishedMap.forEach((record, email) => {
          next[email] = String(numberOrZero(record.gross_pay));
        });
        return next;
      });

      setLicenseByAgent((prior) => {
        const next = { ...prior };
        publishedMap.forEach((record, email) => {
          next[email] = record.is_licensed_ca_doi !== false;
        });
        return next;
      });
    } catch (loadError) {
      console.error('Unable to load commission manager:', loadError);
      setError(loadError?.message || 'Unable to load commission data.');
      setTransactions([]);
      setViolations([]);
      setDisqualified([]);
      setPublishedRecords([]);
      setProfiles([]);
      setBalanceLedger([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart, nextWeekStart]);

  useEffect(() => {
    loadWeeklyData();
  }, [loadWeeklyData]);

  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [emailKey(profile.email), profile])),
    [profiles]
  );

  const publishedMap = useMemo(
    () => new Map(publishedRecords.map((record) => [emailKey(record.agent_email), record])),
    [publishedRecords]
  );

  const txByAgent = useMemo(() => {
    const map = new Map();
    transactions.forEach((row) => {
      const email = emailKey(row.agent_email);
      if (!email) return;
      if (!map.has(email)) map.set(email, []);
      map.get(email).push(row);
    });
    return map;
  }, [transactions]);

  const violationsByAgent = useMemo(() => {
    const map = new Map();
    violations.forEach((row) => {
      const email = emailKey(row.agent_email);
      if (!email) return;
      if (!map.has(email)) map.set(email, []);
      map.get(email).push(row);
    });
    return map;
  }, [violations]);

  const dpByAgent = useMemo(() => {
    const map = new Map();
    disqualified.forEach((row) => {
      const email = emailKey(row.agent_email);
      if (!email) return;
      if (!map.has(email)) map.set(email, []);
      map.get(email).push(row);
    });
    return map;
  }, [disqualified]);

  const balancesByAgent = useMemo(() => {
    const map = new Map();
    balanceLedger.forEach((entry) => {
      const email = emailKey(entry.agent_email);
      if (!email) return;
      map.set(email, (map.get(email) || 0) + numberOrZero(entry.amount));
    });
    return map;
  }, [balanceLedger]);


  const linkedBalancesByAgent = useMemo(() => {
    const obligations = new Map();
    balanceLedger.forEach((entry) => {
      const email = emailKey(entry.agent_email);
      const violationId = clean(entry.linked_violation_id);
      const category = upper(entry.category);
      if (!email || !violationId || !['AR', 'SCANNING'].includes(category)) return;
      const key = `${email}|${category}|${violationId}`;
      obligations.set(key, (obligations.get(key) || 0) + numberOrZero(entry.amount));
    });
    const totals = new Map();
    obligations.forEach((amount, key) => {
      if (amount <= 0.009) return;
      const email = key.split('|')[0];
      totals.set(email, (totals.get(email) || 0) + amount);
    });
    return totals;
  }, [balanceLedger]);

  const currentWeekLinkedBalancesByAgent = useMemo(() => {
    const currentIds = new Map();
    violations.forEach((row) => {
      const email = emailKey(row.agent_email);
      if (email && row?.id !== null && row?.id !== undefined) {
        currentIds.set(String(row.id), email);
      }
    });

    const perViolation = new Map();
    balanceLedger.forEach((entry) => {
      const violationId = clean(entry.linked_violation_id);
      const email = emailKey(entry.agent_email);
      const category = upper(entry.category);
      if (!violationId || !email || !['AR', 'SCANNING'].includes(category)) return;
      if (currentIds.get(violationId) !== email) return;
      const key = `${email}|${category}|${violationId}`;
      perViolation.set(key, (perViolation.get(key) || 0) + numberOrZero(entry.amount));
    });

    const totals = new Map();
    perViolation.forEach((amount, key) => {
      if (amount <= 0.009) return;
      const email = key.split('|')[0];
      totals.set(email, (totals.get(email) || 0) + amount);
    });
    return totals;
  }, [balanceLedger, violations]);

  const agentEmails = useMemo(() => {
    const set = new Set();
    transactions.forEach((row) => {
      const email = emailKey(row.agent_email);
      if (email) set.add(email);
    });
    violations.forEach((row) => {
      const email = emailKey(row.agent_email);
      if (email) set.add(email);
    });
    disqualified.forEach((row) => {
      const email = emailKey(row.agent_email);
      if (email) set.add(email);
    });
    publishedRecords.forEach((row) => {
      const email = emailKey(row.agent_email);
      if (email) set.add(email);
    });
    return [...set];
  }, [transactions, violations, disqualified, publishedRecords]);

  const commissionRows = useMemo(() => {
    return agentEmails.map((email) => {
      const profile = profileMap.get(email);
      const agentTransactions = txByAgent.get(email) || [];
      const agentViolations = violationsByAgent.get(email) || [];
      const agentDisqualified = dpByAgent.get(email) || [];
      const publishedRecord = publishedMap.get(email);

      const grossPayValue =
        publishedRecord
          ? numberOrZero(publishedRecord.gross_pay)
          : grossPayByAgent[email] === undefined || grossPayByAgent[email] === ''
            ? 0
            : numberOrZero(grossPayByAgent[email]);

      const licensed =
        publishedRecord
          ? publishedRecord.is_licensed_ca_doi !== false
          : licenseByAgent[email] !== false;

      const liveResult = calculateAgentCommission({
        transactions: agentTransactions,
        violations: agentViolations,
        disqualifiedPolicies: agentDisqualified,
        grossPay: grossPayValue,
        isLicensedCaDoi: licensed,
        weekStart,
      });

      const currentBalance = Math.max(0, balancesByAgent.get(email) || 0);
      const linkedBalance = Math.max(0, linkedBalancesByAgent.get(email) || 0);
      const currentWeekLinkedBalance = Math.max(0, currentWeekLinkedBalancesByAgent.get(email) || 0);
      const commissionBeforeBalance = Math.max(0, numberOrZero(liveResult.commissionBeforeBalance ?? liveResult.finalPayableCommission));

      // Current-week AR/SV is already deducted inside calculateAgentCommission.
      // Preview its ledger settlement first so we do not subtract the same
      // violation again as carried balance.
      const weeklyViolationLedgerApplied = licensed
        ? Math.min(numberOrZero(liveResult.basePayout), numberOrZero(liveResult.totalDeductions), currentWeekLinkedBalance)
        : 0;
      const carriedBalanceAfterWeekly = Math.max(0, currentBalance - weeklyViolationLedgerApplied);
      const previewBalanceApplied = Math.min(commissionBeforeBalance, carriedBalanceAfterWeekly);
      const previewCashPayable = Math.max(0, commissionBeforeBalance - previewBalanceApplied);

      const draftResult = {
        ...liveResult,
        commissionBeforeBalance,
        balanceApplied: previewBalanceApplied,
        finalPayableCommission: previewCashPayable,
      };

      const displayResult = publishedRecord
        ? resultFromPublished(liveResult, publishedRecord, weekStart)
        : draftResult;

      const offices = [...new Set(
        agentTransactions.map((row) => normalizeOffice(row.office)).filter(Boolean)
      )].sort();

      const grossPayReady =
        Boolean(publishedRecord) ||
        (grossPayByAgent[email] !== undefined && grossPayByAgent[email] !== '');

      return {
        email,
        agent: {
          email,
          full_name: profile?.full_name || publishedRecord?.agent_name || email,
          office: profile?.office,
          region: profile?.region,
          offices,
        },
        transactions: agentTransactions,
        violations: agentViolations,
        disqualified: agentDisqualified,
        publishedRecord,
        liveResult,
        displayResult,
        grossPayReady,
        balance: currentBalance,
        linkedBalance,
        currentWeekLinkedBalance,
        weeklyViolationLedgerApplied,
        carriedBalanceAfterWeekly,
        autoBalanceReady: currentBalance <= linkedBalance + 0.009,
        drift: hasPublishedDrift(liveResult, publishedRecord),
      };
    });
  }, [
    agentEmails,
    profileMap,
    txByAgent,
    violationsByAgent,
    dpByAgent,
    publishedMap,
    grossPayByAgent,
    licenseByAgent,
    balancesByAgent,
    linkedBalancesByAgent,
    currentWeekLinkedBalancesByAgent,
    weekStart,
  ]);

  useEffect(() => {
    if (!commissionRows.length) {
      setSelectedEmail('');
      return;
    }
    if (!commissionRows.some((row) => row.email === selectedEmail)) {
      setSelectedEmail(commissionRows[0].email);
    }
  }, [commissionRows, selectedEmail]);

  const allPublished =
    commissionRows.length > 0 &&
    commissionRows.every((row) => Boolean(row.publishedRecord));

  const missingGrossPayCount = commissionRows.filter(
    (row) => !row.publishedRecord && !row.grossPayReady
  ).length;

  const linkedPolicyMissingCount = commissionRows.reduce(
    (sum, row) =>
      sum +
      row.disqualified.filter(
        (item) => upper(item.status) !== 'VOIDED' && !clean(item.linked_sync_key)
      ).length,
    0
  );

  const unlinkedBalanceCount = commissionRows.filter(
    (row) => row.balance > 0.009 && !row.autoBalanceReady
  ).length;

  const offices = useMemo(
    () => [...new Set(commissionRows.flatMap((row) => row.agent.offices))].sort(),
    [commissionRows]
  );

  const filteredRows = useMemo(() => {
    const terms = clean(search).toLowerCase().split(/\s+/).filter(Boolean);

    const rows = commissionRows.filter((row) => {
      if (officeFilter && !row.agent.offices.includes(officeFilter)) return false;

      const payable = row.displayResult.finalPayableCommission > 0;
      if (statusFilter === 'payable' && !payable) return false;
      if (statusFilter === 'nonpayable' && payable) return false;
      if (statusFilter === 'needs_input' && row.grossPayReady) return false;
      if (statusFilter === 'violations' && row.displayResult.violationCount <= 0) return false;
      if (statusFilter === 'disqualified' && row.displayResult.disqualifiedCount <= 0) return false;
      if (statusFilter === 'balance' && row.balance <= 0) return false;
      if (statusFilter === 'drift' && !row.drift) return false;

      const haystack = [
        row.agent.full_name,
        row.email,
        row.agent.office,
        row.agent.region,
        ...row.agent.offices,
        row.displayResult.status,
        row.displayResult.tierName,
      ].join(' ').toLowerCase();

      return terms.every((term) => haystack.includes(term));
    });

    return [...rows].sort((a, b) => {
      if (sort === 'name') {
        return a.agent.full_name.localeCompare(b.agent.full_name);
      }
      if (sort === 'payable') {
        return b.displayResult.finalPayableCommission - a.displayResult.finalPayableCommission;
      }
      if (sort === 'balance') {
        return b.balance - a.balance || a.agent.full_name.localeCompare(b.agent.full_name);
      }

      const attentionA =
        Number(!a.grossPayReady) +
        Number(a.drift) +
        Number(a.displayResult.violationCount > 0) +
        Number(a.displayResult.disqualifiedCount > 0) +
        Number(!a.displayResult.isLicensedCaDoi);
      const attentionB =
        Number(!b.grossPayReady) +
        Number(b.drift) +
        Number(b.displayResult.violationCount > 0) +
        Number(b.displayResult.disqualifiedCount > 0) +
        Number(!b.displayResult.isLicensedCaDoi);

      return attentionB - attentionA || a.agent.full_name.localeCompare(b.agent.full_name);
    });
  }, [commissionRows, officeFilter, search, statusFilter, sort]);

  const pageInfo = paginate(filteredRows, page, pageSize);
  const selectedBundle = commissionRows.find((row) => row.email === selectedEmail) || null;

  const totals = useMemo(() => {
    return commissionRows.reduce(
      (acc, row) => {
        const result = row.displayResult;
        acc.finalPayable += result.finalPayableCommission;
        acc.grossRevenue += result.grossRevenue;
        acc.grossPay += result.grossPay;
        acc.violations += result.violationCount;
        acc.disqualified += result.disqualifiedCount;
        acc.balance += Math.max(0, row.balance);
        if (result.finalPayableCommission > 0) acc.payableAgents += 1;
        else acc.nonPayableAgents += 1;
        return acc;
      },
      {
        finalPayable: 0,
        grossRevenue: 0,
        grossPay: 0,
        violations: 0,
        disqualified: 0,
        balance: 0,
        payableAgents: 0,
        nonPayableAgents: 0,
      }
    );
  }, [commissionRows]);

  const jumpToWeek = (value) => {
    const monday = mondayOf(value);
    if (!monday) return;
    setAnchorDate(new Date(`${monday}T12:00:00`));
    setPage(1);
  };

  const jumpByPayday = (value) => {
    const pay = dateKey(value);
    if (!pay) return;
    jumpToWeek(addDays(mondayOf(pay), -14));
  };

  const handlePublish = async () => {
    if (!commissionRows.length || allPublished || publishing) return;

    if (missingGrossPayCount > 0) {
      setPublishStatus(
        `${missingGrossPayCount} agent(s) still need Gross Pay entered. Enter a value, including 0 when intentional, before publishing.`
      );
      return;
    }

    if (linkedPolicyMissingCount > 0) {
      setPublishStatus(
        `${linkedPolicyMissingCount} active disqualified polic${linkedPolicyMissingCount === 1 ? 'y is' : 'ies are'} missing a verified transaction link. Resolve them before publishing.`
      );
      return;
    }

    if (unlinkedBalanceCount > 0) {
      setPublishStatus(
        `${unlinkedBalanceCount} agent balance account(s) contain outstanding AR / scanning amounts that are not fully tied to individual violations. Review those ledger accounts before publishing so FIFO repayment history stays accurate.`
      );
      return;
    }

    const confirmText =
      `Publish commission week ${weekLabel(weekStart)}?\n\n` +
      `${commissionRows.length} agents\n` +
      `${money(totals.finalPayable)} total payable\n` +
      `Scheduled payday: ${displayDate(scheduledPayday(weekStart))}\n\n` +
      `Publishing will automatically apply available commission to the oldest outstanding AR / scanning violations first, then freeze the cash-payable result agents see.`;

    if (!window.confirm(confirmText)) return;

    setPublishing(true);
    setPublishStatus('');

    try {
      const payload = commissionRows.map((row) => {
        const result = row.liveResult;
        return {
          agent_email: row.email,
          agent_name: row.agent.full_name,
          gross_revenue: result.grossRevenue,
          gross_pay: result.grossPay,
          royalty_deduction: result.royaltyDeduction,
          net_revenue: result.netRevenue,
          gross_nb_count: result.grossNbCount,
          disqualified_nb_count: result.disqualifiedNbCount,
          net_nb_count: result.netNbCount,
          broker_fee_revenue: result.brokerFeeRevenue,
          endorsement_fee_revenue: result.endorsementFeeRevenue,
          reinstatement_fee_revenue: result.reinstatementFeeRevenue,
          renewal_fee_revenue: result.renewalFeeRevenue,
          commission_rate: result.commissionRate,
          tier: result.tierName,
          base_payout: result.basePayout,
          total_deductions: result.totalDeductions,
          calculated_weekly_commission: result.calculatedWeeklyCommission,
          commission_before_balance: Math.max(0, numberOrZero(result.finalPayableCommission)),
          violation_count: result.violationCount,
          disqualified_count: result.disqualifiedCount,
          is_licensed_ca_doi: result.isLicensedCaDoi,
          status: result.status,
        };
      });

      const { data: publishResult, error: publishError } = await supabase.rpc(
        'publish_commission_week_with_balance_application',
        {
          p_week_start: weekStart,
          p_week_end: weekEnd,
          p_payout_date: scheduledPayday(weekStart),
          p_records: payload,
        }
      );

      if (publishError) throw publishError;

      const appliedTotal = (publishResult?.agents || []).reduce(
        (sum, item) => sum + numberOrZero(item.balance_applied),
        0
      );
      setPublishStatus(
        `Published ${payload.length} commission records. ${money(appliedTotal)} was automatically applied to outstanding AR / scanning balances.`
      );
      await loadWeeklyData();
    } catch (publishError) {
      console.error('Publish failed:', publishError);
      setPublishStatus(`Publish failed: ${publishError?.message || 'Unknown error'}`);
    } finally {
      setPublishing(false);
    }
  };

  const exportCsv = () => {
    const rows = commissionRows.map((row) => {
      const result = row.displayResult;
      return [
        row.agent.full_name,
        row.email,
        weekStart,
        weekEnd,
        scheduledPayday(weekStart),
        result.grossRevenue,
        result.grossPay,
        result.royaltyDeduction,
        result.netRevenue,
        result.grossNbCount,
        result.disqualifiedNbCount,
        result.netNbCount,
        result.tierName,
        result.commissionRate,
        result.basePayout,
        result.totalDeductions,
        result.calculatedWeeklyCommission,
        result.finalPayableCommission,
        result.violationCount,
        result.disqualifiedCount,
        row.balance,
        result.isLicensedCaDoi ? 'Licensed' : 'Unlicensed',
        result.status,
        buildMissedBy(result),
        row.publishedRecord?.published_at || '',
        row.publishedRecord?.published_by || '',
      ];
    });

    const headers = [
      'Agent Name', 'Agent Email', 'Week Start', 'Week End', 'Scheduled Payday',
      'Gross Revenue', 'Gross Pay', 'Royalty Deduction', 'Net Revenue',
      'Gross NB', 'Disqualified NB', 'Net NB', 'Tier', 'Commission Rate',
      'Base Commission', 'Violation Deductions', 'Calculated Commission',
      'Final Payable Commission', 'Violation Count', 'Disqualified Count',
      'Current AR/SV Balance', 'License Status', 'Status', 'Qualification / Next Tier',
      'Published At', 'Published By',
    ];

    const csvCell = (value) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };

    const blob = new Blob(
      ['\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8;' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commissions_${weekStart}_${allPublished ? 'published' : 'draft'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (loading) {
    return (
      <main className={styles.dashboard}>
        <Loading text={loadingText} />
      </main>
    );
  }

  return (
    <main className={styles.dashboard}>
      <header className={styles.topHeader}>
        <div>
          <span className={styles.eyebrow}>COMMISSION OPERATIONS</span>
          <h1>Commission Manager</h1>
          <p>Review the production week, resolve exceptions, and publish the same result agents see.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={loadWeeklyData}>Refresh</button>
          <button type="button" onClick={exportCsv} disabled={!commissionRows.length}>Export CSV</button>
          <button
            type="button"
            className={styles.publishButton}
            onClick={handlePublish}
            disabled={publishing || allPublished || !commissionRows.length}
          >
            {allPublished ? 'Published' : publishing ? 'Publishing...' : 'Publish Week'}
          </button>
        </div>
      </header>

      <section className={styles.payHero}>
        <div>
          <span className={styles.heroKicker}>
            {weekStart === payContext.payingWeek ? 'UPCOMING FRIDAY PAYOUT' : 'SELECTED COMMISSION WEEK'}
          </span>
          <h2>{weekLabel(weekStart)}</h2>
          <p>Production / commission week</p>
          <div className={styles.quickWeeks}>
            <button
              type="button"
              className={weekStart === payContext.payingWeek ? styles.quickActive : ''}
              onClick={() => jumpToWeek(payContext.payingWeek)}
            >
              Paying this Friday
            </button>
            <button
              type="button"
              className={weekStart === addDays(payContext.payingWeek, 7) ? styles.quickActive : ''}
              onClick={() => jumpToWeek(addDays(payContext.payingWeek, 7))}
            >
              Next payout
            </button>
            <button
              type="button"
              className={weekStart === payContext.currentMonday ? styles.quickActive : ''}
              onClick={() => jumpToWeek(payContext.currentMonday)}
            >
              Current production
            </button>
          </div>
        </div>

        <div className={styles.payDate}>
          <span>Scheduled payday</span>
          <strong>Friday, {displayDate(scheduledPayday(weekStart), true)}</strong>
          <small>{allPublished ? 'Published commission week' : 'Draft · not final until published'}</small>
          {publishedRecords[0] && (
            <small>
              Published {displayDateTime(publishedRecords[0].published_at)} by {publishedRecords[0].published_by || 'management'}
            </small>
          )}
        </div>
      </section>

      <section className={styles.weekTools}>
        <div className={styles.weekSteps}>
          <button type="button" onClick={() => jumpToWeek(addDays(weekStart, -7))}>←</button>
          <button type="button" onClick={() => jumpToWeek(addDays(weekStart, 7))}>→</button>
        </div>
        <label>
          Jump by production date
          <input
            type="date"
            value={weekStart}
            onChange={(event) => jumpToWeek(event.target.value)}
          />
        </label>
        <label>
          Or scheduled payday
          <input
            type="date"
            value={scheduledPayday(weekStart)}
            onChange={(event) => jumpByPayday(event.target.value)}
          />
        </label>
        <span>
          Production is Monday-Sunday. The scheduled payout is the Friday two weeks later.
        </span>
      </section>

      {error && <div className={styles.errorBox}>{error}</div>}
      {publishStatus && (
        <div className={publishStatus.toLowerCase().includes('failed') ? styles.errorBox : styles.noticeBox}>
          {publishStatus}
        </div>
      )}

      <section className={styles.metrics}>
        <Metric label="Cash commission payable" value={money(totals.finalPayable)} sub={`${totals.payableAgents} agents with cash payable`} tone="green" />
        <Metric label="Gross revenue" value={money(totals.grossRevenue)} sub={`${commissionRows.length} agents in review`} />
        <Metric label="Gross pay entered" value={money(totals.grossPay)} sub={missingGrossPayCount ? `${missingGrossPayCount} still need input` : 'All agent inputs complete'} tone={missingGrossPayCount ? 'amber' : 'green'} />
        <Metric label="Current AR / SV balances" value={money(totals.balance)} sub="Available commission will be applied FIFO at publish" tone="amber" />
      </section>

      <section className={styles.readinessPanel}>
        <div>
          <span className={styles.eyebrow}>PUBLISH READINESS</span>
          <h2>{allPublished ? 'This week is published' : missingGrossPayCount || linkedPolicyMissingCount ? 'Review required before publishing' : 'Ready for final review'}</h2>
        </div>
        <div className={styles.readinessItems}>
          <div className={missingGrossPayCount ? styles.readinessBad : styles.readinessGood}>
            <strong>{missingGrossPayCount}</strong><span>Gross pay inputs missing</span>
          </div>
          <div className={linkedPolicyMissingCount ? styles.readinessBad : styles.readinessGood}>
            <strong>{linkedPolicyMissingCount}</strong><span>Disqualified policies without receipt link</span>
          </div>
          <div className={unlinkedBalanceCount ? styles.readinessBad : styles.readinessGood}>
            <strong>{unlinkedBalanceCount}</strong><span>Balances not fully linked for FIFO</span>
          </div>
          <div className={styles.readinessNeutral}>
            <strong>{totals.violations}</strong><span>Active violation deductions</span>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>WEEKLY COMMISSION REVIEW</span>
            <h2>Agent commissions</h2>
            <p>
              Gross pay and licensing are editable until the week is published. Published rows use the saved final snapshot.
            </p>
          </div>
        </header>

        <div className={styles.filters}>
          <label className={styles.searchLabel}>
            Search agents
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Name, email, office, region..."
            />
          </label>

          <label>
            Office
            <select value={officeFilter} onChange={(event) => { setOfficeFilter(event.target.value); setPage(1); }}>
              <option value="">All offices</option>
              {offices.map((office) => <option key={office}>{office}</option>)}
            </select>
          </label>

          <label>
            Show
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
              <option value="all">All agents</option>
              <option value="payable">Payable commission</option>
              <option value="nonpayable">No payable commission</option>
              <option value="needs_input">Gross pay needs input</option>
              <option value="violations">Has violations</option>
              <option value="disqualified">Has disqualified policies</option>
              <option value="balance">Has AR / SV balance</option>
              <option value="drift">Published source changed</option>
            </select>
          </label>

          <label>
            Sort
            <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
              <option value="attention">Attention first</option>
              <option value="name">Agent name</option>
              <option value="payable">Highest commission</option>
              <option value="balance">Highest AR / SV balance</option>
            </select>
          </label>

          <label>
            Rows
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
              {PAGE_SIZES.map((size) => <option key={size}>{size}</option>)}
            </select>
          </label>
        </div>

        <Pager info={pageInfo} onPage={setPage} />

        <div className={styles.tableViewport}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Agent / office</th>
                <th>Gross pay</th>
                <th>Licensed</th>
                <th>Gross / net revenue</th>
                <th>Net NB</th>
                <th>Tier / rate</th>
                <th>Viol. / Disq.</th>
                <th>AR / SV balance</th>
                <th>Cash payable</th>
                <th>Status / next step</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {pageInfo.rows.map((row) => {
                const result = row.displayResult;
                const published = Boolean(row.publishedRecord);
                const needsAttention =
                  !row.grossPayReady ||
                  row.drift ||
                  !result.isLicensedCaDoi ||
                  result.violationCount > 0 ||
                  result.disqualifiedCount > 0;

                return (
                  <tr
                    key={row.email}
                    className={`${needsAttention ? styles.attentionRow : ''} ${selectedEmail === row.email ? styles.selectedRow : ''}`}
                  >
                    <td>
                      <strong>{row.agent.full_name}</strong>
                      <small>{row.email}</small>
                      <small>{row.agent.offices.join(', ') || row.agent.office || 'Office not identified'}</small>
                      {published && <Badge tone="green">Published</Badge>}
                      {row.drift && <Badge tone="amber">Source changed</Badge>}
                    </td>

                    <td>
                      <input
                        className={`${styles.grossPayInput} ${!row.grossPayReady ? styles.inputRequired : ''}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          published
                            ? String(numberOrZero(row.publishedRecord.gross_pay))
                            : grossPayByAgent[row.email] ?? ''
                        }
                        disabled={published}
                        placeholder="Required"
                        onChange={(event) =>
                          setGrossPayByAgent((prior) => ({
                            ...prior,
                            [row.email]: event.target.value,
                          }))
                        }
                      />
                      {!row.grossPayReady && <small className={styles.warningText}>Required before publish</small>}
                    </td>

                    <td>
                      <label className={styles.licenseToggle}>
                        <input
                          type="checkbox"
                          checked={
                            published
                              ? row.publishedRecord.is_licensed_ca_doi !== false
                              : licenseByAgent[row.email] !== false
                          }
                          disabled={published}
                          onChange={(event) =>
                            setLicenseByAgent((prior) => ({
                              ...prior,
                              [row.email]: event.target.checked,
                            }))
                          }
                        />
                        <span>{result.isLicensedCaDoi ? 'Licensed' : 'Unlicensed'}</span>
                      </label>
                    </td>

                    <td>
                      <strong>{money(result.grossRevenue)}</strong>
                      <small>Net {money(result.netRevenue)}</small>
                    </td>

                    <td>
                      <strong>{result.netNbCount}</strong>
                      <small>{result.grossNbCount} gross · {result.disqualifiedNbCount} disq.</small>
                    </td>

                    <td>
                      <strong>{result.tierName}</strong>
                      <small>{percent(result.commissionRate)}</small>
                    </td>

                    <td>
                      <strong>{result.violationCount} / {result.disqualifiedCount}</strong>
                      <small>{money(result.totalDeductions)} deductions</small>
                    </td>

                    <td>
                      <strong>{money(row.balance)}</strong>
                      <small>{row.autoBalanceReady ? 'FIFO ready' : 'Needs ledger review before publish'}</small>
                    </td>

                    <td className={styles.payableCell}>
                      <strong>{money(result.finalPayableCommission)}</strong>
                      <small>{published ? `${money(result.balanceApplied || 0)} balance applied` : `${money(result.balanceApplied || 0)} projected to balance`}</small>
                    </td>

                    <td>
                      <Badge tone={result.finalPayableCommission > 0 ? 'green' : 'neutral'}>
                        {result.status}
                      </Badge>
                      <small>{buildMissedBy(result)}</small>
                    </td>

                    <td>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => setSelectedEmail(row.email)}
                      >
                        {selectedEmail === row.email ? 'Selected' : 'Review agent'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!pageInfo.total && (
            <div className={styles.empty}>
              No agents match these filters.
            </div>
          )}
        </div>

        <Pager info={pageInfo} onPage={setPage} />
      </section>

      <AgentDetail
        bundle={selectedBundle}
        publishedRecord={selectedBundle?.publishedRecord}
        balance={selectedBundle?.balance}
        weekStart={weekStart}
      />

      <footer className={styles.footerNote}>
        <strong>Important:</strong> publishing now applies available commission to the oldest outstanding linked AR / scanning violations first. The remainder is saved as cash commission payable, and each balance application is written to the repayment ledger.
      </footer>
    </main>
  );
}

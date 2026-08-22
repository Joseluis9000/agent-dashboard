// src/pages/regional/RegionalDashboard.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import styles from './RegionalDashboard.module.css';

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
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setLoading(false);
      return;
    }

    const { start, end } = monthBounds();

    const [monthResult, liveResult, dealSaveResult] = await Promise.all([
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
    ]);

    const firstError = monthResult.error || liveResult.error || dealSaveResult.error;
    if (firstError) {
      setError(`Could not load the regional dashboard: ${firstError.message}`);
      setLoading(false);
      return;
    }

    setMonthQuotes(monthResult.data || []);
    setLiveQuotes(liveResult.data || []);
    setDealSaves(dealSaveResult.data || []);
    setLoading(false);
  }, [supabaseClient, role, region]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Regional Dashboard</p>
          <h1>{region || 'Region'}</h1>
          <p className={styles.subtitle}>
            Welcome, {regionalName}. Monitor office activity, live quotes, closed business,
            and Deal Save requests across your region.
          </p>
        </div>

        <div className={styles.headerActions}>
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

      <section className={styles.metricGrid}>
        <MetricCard label="Offices" value={regionalOffices.length} detail={`${region || 'Region'} offices`} />
        <MetricCard label="Quoting Now" value={liveQuotes.length} detail={`${activeAgents} active agent${activeAgents === 1 ? '' : 's'}`} tone="live" />
        <MetricCard label="Closed This Month" value={monthClosed.length} detail="Policy bound / closed" tone="closed" />
        <MetricCard label="Deal Save Waiting" value={dealSaves.length} detail="Manager assistance requested" tone={dealSaves.length ? 'attention' : ''} />
      </section>

      <section className={styles.layout}>
        <div className={styles.mainColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
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

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <h2>Live Quote Activity</h2>
                <p>Customers currently being quoted in your region.</p>
              </div>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => navigate('/regional/quote-operations')}
              >
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
                      <span>
                        {normalizeOffice(quote.office)} · {quote.captured_agent_name || quote.agent_email || 'Unknown agent'}
                      </span>
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
        </div>

        <aside className={styles.sideColumn}>
          <section className={`${styles.panel} ${dealSaves.length ? styles.attentionPanel : ''}`}>
            <div className={styles.panelHeading}>
              <div>
                <h2>Deal Save Requests</h2>
                <p>Agents currently asking for management help with the down / broker fee.</p>
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
                      <span>⏱️ {elapsed(request.created_at)}</span>
                    </div>
                    <p>
                      {normalizeOffice(request.office)} · {request.requested_by_name || 'Agent'}
                    </p>
                    <div className={styles.moneyRow}>
                      <span>Premium <strong>${Number(request.premium || 0).toFixed(0)}</strong></span>
                      <span>BF <strong>${Number(request.current_broker_fee || 0).toFixed(0)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className={styles.fullButton}
              onClick={() => navigate('/regional/quote-operations')}
            >
              Open Quote Operations
            </button>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <h2>Regional Focus</h2>
                <p>Keep the team centered on the live sales process.</p>
              </div>
            </div>
            <div className={styles.focusList}>
              <div><strong>1</strong><span>Respond quickly when Deal Save alerts hit Connecteam.</span></div>
              <div><strong>2</strong><span>Review Lost Deals and Walks for coaching opportunities.</span></div>
              <div><strong>3</strong><span>Watch existing-client re-writes by office and outcome.</span></div>
            </div>
          </section>
        </aside>
      </section>
    </main>
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
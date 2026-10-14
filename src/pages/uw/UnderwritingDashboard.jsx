// src/pages/uw/UnderwritingDashboard.jsx
import React, { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../supabaseClient';
import styles from './UnderwritingDashboard.module.css';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatAsOf = (value) => {
  if (!value) return 'Not updated yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not updated yet' : date.toLocaleString();
};

export default function UnderwritingDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const role = profile?.role || user?.user_metadata?.role || 'agent';
  const isUW = ['underwriter', 'uw_manager', 'supervisor', 'admin'].includes(role);

  const [scoreboard, setScoreboard] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const fullName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    '';

  const firstName =
    profile?.first_name ||
    user?.user_metadata?.first_name ||
    fullName.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'Underwriter';

  const loadScoreboard = useCallback(async () => {
    setLoading(true);
    setError('');

    const today = new Date();
    const reportDate =
      `${today.getFullYear()}-` +
      `${String(today.getMonth() + 1).padStart(2, '0')}-` +
      `${String(today.getDate()).padStart(2, '0')}`;

    const { data, error: snapshotError } = await supabase
      .from('scoreboard_current_snapshot')
      .select('*')
      .eq('report_date', reportDate)
      .maybeSingle();

    if (snapshotError) {
      setError(snapshotError.message);
      setScoreboard(null);
    } else {
      setScoreboard(data || null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadScoreboard();
  }, [loadScoreboard]);

  useEffect(() => {
    const channel = supabase
      .channel('uw_dashboard_scoreboard_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scoreboard_uploads' },
        () => loadScoreboard()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadScoreboard]);

  const metrics = useMemo(() => {
    const nb =
      scoreboard?.company_nb ??
      scoreboard?.nb ??
      scoreboard?.total_nb ??
      0;

    const brokerFee =
      scoreboard?.company_broker_fee ??
      scoreboard?.broker_fee ??
      scoreboard?.total_broker_fee ??
      0;

    const avg =
      scoreboard?.company_avg_broker_fee ??
      scoreboard?.avg_broker_fee ??
      (Number(nb) > 0 ? Number(brokerFee) / Number(nb) : 0);

    return { nb, brokerFee, avg };
  }, [scoreboard]);

  const reportDate =
    scoreboard?.report_date ||
    scoreboard?.scoreboard_date ||
    scoreboard?.date ||
    null;

  const asOf =
    scoreboard?.scoreboard_as_of ||
    scoreboard?.updated_at ||
    scoreboard?.completed_at ||
    null;

  const uploadedBy =
    scoreboard?.uploaded_by_name ||
    scoreboard?.last_uploaded_by ||
    scoreboard?.uploaded_by_email ||
    '—';

  if (!isUW) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>Not authorized.</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>UW PORTAL</div>
          <h1 className={styles.title}>Underwriting Operations</h1>
          <p className={styles.subtitle}>
            Welcome, {firstName}. Manage daily operational tools and company support from one place.
          </p>
        </div>
        <div className={styles.heroBadge}>Operations</div>
      </section>

      {error && (
        <div className={styles.error}>
          Scoreboard data could not be loaded: {error}
        </div>
      )}

      <section className={styles.moduleGrid}>
        <button
          type="button"
          className={`${styles.moduleCard} ${styles.moduleCardActive}`}
          onClick={() => navigate('/uw/scoreboard')}
        >
          <span className={styles.moduleIcon}>S</span>
          <span className={styles.moduleContent}>
            <span className={styles.moduleTopLine}>
              <strong>Scoreboard</strong>
              <span className={styles.activePill}>Active</span>
            </span>
            <span>Update and view the Daily G&amp;P Scoreboard.</span>
          </span>
          <span className={styles.moduleArrow}>→</span>
        </button>

        <div className={styles.moduleCard}>
          <span className={styles.moduleIcon}>O</span>
          <span className={styles.moduleContent}>
            <span className={styles.moduleTopLine}>
              <strong>Office Directory</strong>
              <span className={styles.soonPill}>Coming Soon</span>
            </span>
            <span>Office numbers, contacts, and operational information.</span>
          </span>
        </div>

        <div className={styles.moduleCard}>
          <span className={styles.moduleIcon}>D</span>
          <span className={styles.moduleContent}>
            <span className={styles.moduleTopLine}>
              <strong>Daily Tasks</strong>
              <span className={styles.soonPill}>Coming Soon</span>
            </span>
            <span>Recurring responsibilities and operational follow-up.</span>
          </span>
        </div>

        <button
          type="button"
          className={`${styles.moduleCard} ${styles.moduleCardActive}`}
          onClick={() => navigate('/uw/retention')}
        >
          <span className={styles.moduleIcon}>R</span>
          <span className={styles.moduleContent}>
            <span className={styles.moduleTopLine}>
              <strong>Retention</strong>
              <span className={styles.activePill}>Active</span>
            </span>
            <span>Work renewal queues, policy history, and customer retention follow-up.</span>
          </span>
          <span className={styles.moduleArrow}>→</span>
        </button>
      </section>

      <section className={styles.scoreboardCard}>
        <div className={styles.scoreboardHeader}>
          <div>
            <div className={styles.sectionEyebrow}>LIVE COMPANY TOOL</div>
            <h2>Daily G&amp;P Scoreboard</h2>
            <p>
              Upload transaction details and keep the company scoreboard current.
            </p>
          </div>

          <div className={styles.scoreboardActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={loadScoreboard}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => navigate('/uw/scoreboard')}
            >
              Update / View Scoreboard
            </button>
          </div>
        </div>

        <div className={styles.scoreboardMeta}>
          <div>
            <span>Report Date</span>
            <strong>{reportDate || '—'}</strong>
          </div>
          <div>
            <span>Last Updated</span>
            <strong>{formatAsOf(asOf)}</strong>
          </div>
          <div>
            <span>Updated By</span>
            <strong>{uploadedBy}</strong>
          </div>
        </div>

        <div className={styles.metricGrid}>
          <div className={styles.metricCard}>
            <span>NB</span>
            <strong>{loading ? '—' : Number(metrics.nb || 0).toLocaleString()}</strong>
          </div>
          <div className={styles.metricCard}>
            <span>BROKER FEE</span>
            <strong>{loading ? '—' : formatCurrency(metrics.brokerFee)}</strong>
          </div>
          <div className={styles.metricCard}>
            <span>AVG BF</span>
            <strong>{loading ? '—' : formatCurrency(metrics.avg)}</strong>
          </div>
        </div>
      </section>

      <section className={styles.quickAccess}>
        <div className={styles.quickAccessHeader}>
          <div>
            <div className={styles.sectionEyebrow}>UW OPERATIONS</div>
            <h2>Quick Access</h2>
          </div>
        </div>

        <div className={styles.quickLinks}>
          <button type="button" onClick={() => navigate('/uw/scoreboard')}>
            <span>
              <strong>Scoreboard</strong>
              <small>View and update company production</small>
            </span>
            <span>Open →</span>
          </button>

          <button type="button" onClick={() => navigate('/uw/retention')}>
            <span>
              <strong>Retention</strong>
              <small>Renewal queue and policy lifecycle</small>
            </span>
            <span>Open →</span>
          </button>

          <div className={styles.disabledQuickLink}>
            <span>
              <strong>Office Directory</strong>
              <small>Office contacts and numbers</small>
            </span>
            <span>Coming Soon</span>
          </div>
        </div>
      </section>
    </div>
  );
}

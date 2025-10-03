// src/pages/AgentViolations.jsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import styles from './AgentViolations.module.css';

/** Monday–Sunday helper (UTC-safe) */
const getWeekRange = (date) => {
  const d = new Date(date);
  const todayUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayOfWeek = todayUTC.getUTCDay();
  const diff = todayUTC.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
  const sunday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff + 6));
  return { start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] };
};

// Backwards-compatible helper while old rows still say "AR Shortage"
const isAR = (vt) => vt === 'AR Violation' || vt === 'AR Shortage';

const AgentViolations = () => {
  const { user, loading: authLoading } = useAuth();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const week = useMemo(() => getWeekRange(currentDate), [currentDate]);
  // Prefer the authenticated user; keep localStorage as a last-ditch fallback
  const userEmail = user?.email || localStorage.getItem('userEmail') || null;

  const fetchViolations = useCallback(async () => {
    // Wait until the auth context finishes the initial check
    if (authLoading) return;

    // If we still don't have an email, stop the spinner and show a hint
    if (!userEmail) {
      setViolations([]);
      setError('Could not determine your user email. Please log out and sign back in.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase
        .from('violations')
        .select('*')
        .eq('week_start_date', week.start)
        .eq('agent_email', userEmail)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AgentViolations] supabase error:', error);
        setError(error.message || 'Failed to fetch violations.');
        setViolations([]);
      } else {
        setViolations(data || []);
      }
    } catch (e) {
      console.error('[AgentViolations] unexpected fetch error:', e);
      setError('Unexpected error loading violations.');
      setViolations([]);
    } finally {
      setLoading(false);
    }
  }, [authLoading, userEmail, week.start]);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  const goToPreviousWeek = () => {
    const nd = new Date(currentDate);
    nd.setDate(nd.getDate() - 7);
    setCurrentDate(nd);
  };
  const goToNextWeek = () => {
    const nd = new Date(currentDate);
    nd.setDate(nd.getDate() + 7);
    setCurrentDate(nd);
  };

  const arList = useMemo(() => violations.filter((v) => isAR(v.violation_type)), [violations]);
  const scList = useMemo(
    () => violations.filter((v) => v.violation_type === 'Scanning Violation'),
    [violations]
  );

  const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;
  const sum = (arr, key) => arr.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

  const totals = useMemo(
    () => ({
      arCount: arList.length,
      arFees: sum(arList, 'fee_amount'),
      scCount: scList.length,
      scFees: sum(scList, 'fee_amount'),
      allCount: violations.length,
      allFees: sum(violations, 'fee_amount'),
    }),
    [arList, scList, violations]
  );

  const renderCardList = (rows) => {
    if (!rows.length) return <p>No violations for this period.</p>;
    return (
      <div className={styles.dataList}>
        {rows.map((v) => (
          <div key={v.id} className={styles.dataGrid}>
            <p><strong>Date Entered:</strong> {new Date(v.created_at).toLocaleDateString()}</p>
            <p><strong>Office:</strong> {v.office_code}</p>
            <p><strong>Region:</strong> {v.region || 'N/A'}</p>
            <p><strong>Category:</strong> {v.violation_category || '—'}</p>
            <p><strong>Client:</strong> {v.client_name}</p>
            <p><strong>Policy #:</strong> {v.reference_id}</p>
            <p><strong>Variance:</strong> {fmtMoney(v.variance_amount)}</p>
            <p><strong>Fee:</strong> {fmtMoney(v.fee_amount)}</p>
            <p><strong>Status:</strong> {v.status || 'Pending'}</p>
            <p><strong>Entered By:</strong> {v.manager_email ? v.manager_email.split('@')[0] : 'N/A'}</p>
            {v.details ? <p className={styles.details}><strong>Details:</strong> {v.details}</p> : null}
          </div>
        ))}
      </div>
    );
  };

  // While AuthProvider is still resolving the initial session, keep a simple splash
  if (authLoading) {
    return <div className={styles.mainContent}><p>Loading session…</p></div>;
  }

  return (
    <div className={styles.mainContent}>
      <h1 className={styles.pageTitle}>My Violations</h1>

      <div className={styles.navCard}>
        <button onClick={goToPreviousWeek} className={styles.weekButton}>&larr; Previous Week</button>
        <div className={styles.weekRange}>
          {new Date(week.start + 'T12:00:00').toLocaleDateString()} - {new Date(week.end + 'T12:00:00').toLocaleDateString()}
        </div>
        <button onClick={goToNextWeek} className={styles.weekButton}>Next Week &rarr;</button>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>This Week Totals</h2>
        <div className={styles.totalsContainer}>
          <p><strong>AR Violations:</strong> {totals.arCount} • {fmtMoney(totals.arFees)}</p>
          <p><strong>Scanning Violations:</strong> {totals.scCount} • {fmtMoney(totals.scFees)}</p>
          <p><strong>Total:</strong> {totals.allCount} • {fmtMoney(totals.allFees)}</p>
        </div>
      </div>

      {loading ? (
        <div className={styles.card}><p>Loading violations…</p></div>
      ) : error ? (
        <div className={`${styles.card} ${styles.errorText}`}><p>Error: {error}</p></div>
      ) : (
        <>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>AR Violations</h2>
            {renderCardList(arList)}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Scanning Violations</h2>
            {renderCardList(scList)}
          </div>
        </>
      )}
    </div>
  );
};

export default AgentViolations;



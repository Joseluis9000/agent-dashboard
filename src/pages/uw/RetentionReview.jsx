import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import styles from './RetentionQueue.module.css';
import { OPTIONS, policyIdentity, emptyReview, reviewFrom, validateReview, actionsFor, needsNotes, needsFollowUp } from './retentionRules';

const labels = {
  policy_status: 'Policy status', payments_current: 'Payments current?', verification_source: 'Verified through',
  next_action: 'Next action', contact_result: 'Contact result', work_status: 'Work status', verification_obstacle: 'What prevented verification?',
};
const timestamp = value => new Date(value).toLocaleString();
const dayLabel = value => value ? new Date(value + 'T12:00:00').toLocaleDateString() : '—';
const todayValue = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const friendlyError = error => /does not exist|schema cache/i.test(error?.message || '')
  ? 'Review storage is not installed yet. Run supabase/retention_reviews.sql from the update package, then reopen this account.'
  : error?.message || 'The review could not be saved. Your entries are still here.';

export default function RetentionReview({ row, businessDay, onSaved, onDirtyChange }) {
  const [form, setForm] = useState(emptyReview);
  const [baseline, setBaseline] = useState(JSON.stringify(emptyReview()));
  const [expectedId, setExpectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [customerHistory, setCustomerHistory] = useState(false);
  const requestRef = useRef(null);
  const alive = useRef(true);
  const firstInput = useRef(null);
  const identity = policyIdentity(row);
  const canSave = Boolean(identity.customer_id && identity.policy_number);
  const dirty = JSON.stringify(form) !== baseline;
  const policyQuery = () => supabase.from('uw_retention_reviews').select('*')
    .eq('customer_id', identity.customer_id).eq('policy_number', identity.policy_number).eq('carrier_name', identity.carrier_name);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    async function load() {
      if (!canSave) { setLoading(false); setError('A customer ID and policy number are required to save a review.'); return; }
      setLoading(true);
      try {
        const { data, error: loadError } = await policyQuery().eq('business_day', businessDay).order('saved_at', { ascending: false }).order('id', { ascending: false }).limit(1);
        if (loadError) throw loadError;
        if (!cancelled) {
          const current = data?.[0];
          const next = current ? reviewFrom(current) : emptyReview();
          setForm(next); setBaseline(JSON.stringify(next)); setExpectedId(current?.id || null);
        }
      } catch (e) { if (!cancelled) setError(friendlyError(e)); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; alive.current = false; };
    // The parent remounts this component for each policy / business day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { onDirtyChange(dirty || saving); }, [dirty, saving, onDirtyChange]);
  useEffect(() => {
    const guard = e => { if (dirty || saving) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, saving]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      if (!canSave) return;
      setHistoryLoading(true);
      try {
        let query = customerHistory ? supabase.from('uw_retention_reviews').select('*').eq('customer_id', identity.customer_id) : policyQuery();
        const { data, error: historyError } = await query.order('saved_at', { ascending: false }).order('id', { ascending: false }).range(historyPage * 20, historyPage * 20 + 20);
        if (historyError) throw historyError;
        if (!cancelled) { setHistory(data.slice(0, 20)); setHasMore(data.length > 20); }
      } catch (e) { if (!cancelled) setError(friendlyError(e)); }
      finally { if (!cancelled) setHistoryLoading(false); }
    }
    loadHistory();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyPage, customerHistory, historyVersion]);

  const change = (key, value) => {
    requestRef.current = null;
    setNotice(''); setErrors({});
    setForm(previous => {
      const next = { ...previous, [key]: value };
      if (key === 'policy_status') {
        next.next_action = ''; next.verification_obstacle = '';
        next.work_status = 'In progress';
        next.payments_current = value === 'Payment Due' ? 'No' : '';
      }
      if (key === 'contact_result' && value === 'Callback requested') next.work_status = 'Follow-up needed';
      return next;
    });
  };
  const quickActive = () => {
    requestRef.current = null; setErrors({}); setNotice('');
    setForm(previous => ({ ...previous, policy_status: 'Active', payments_current: 'Yes', next_action: 'None needed', work_status: 'Completed', contact_result: 'Not contacted', follow_up_date: '', verification_obstacle: '' }));
  };
  const save = async (mode, nextAccount = false) => {
    if (saving || loading || !canSave) return;
    const next = { ...form };
    if (mode === 'draft' && next.work_status === 'Completed') next.work_status = 'In progress';
    if (mode === 'finish') next.work_status = next.policy_status === 'Unable to Verify' || next.contact_result === 'Callback requested' || next.work_status === 'Follow-up needed' || (['Payment Due', 'Cancelled', 'Renewal Due'].includes(next.policy_status) && next.work_status !== 'Completed') ? 'Follow-up needed' : 'Completed';
    const found = validateReview(next, { draft: mode === 'draft', today: todayValue() });
    setForm(next); setErrors(found); setNotice(''); setError('');
    if (Object.keys(found).length) { firstInput.current?.focus(); return; }
    setSaving(true);
    try {
      const payload = { ...next, ...identity, business_day: businessDay, customer_name: row.customer_name || '', office_code: row.office_code || '', last_payment_date: next.last_payment_date || null, last_payment_amount: next.last_payment_amount === '' ? null : Number(next.last_payment_amount), follow_up_date: next.follow_up_date || null };
      // Retain the request ID on transport errors so retrying the same save cannot duplicate it.
      if (!requestRef.current || requestRef.current.signature !== JSON.stringify(payload)) requestRef.current = { id: window.crypto.randomUUID(), signature: JSON.stringify(payload) };
      const { data, error: saveError } = await supabase.rpc('uw_retention_save_review', { p_review: payload, p_mode: mode, p_expected_latest_id: expectedId, p_request_id: requestRef.current.id });
      if (saveError) throw saveError;
      if (!alive.current) return;
      const stored = Array.isArray(data) ? data[0] : data;
      const savedForm = reviewFrom(stored);
      setForm(savedForm); setBaseline(JSON.stringify(savedForm)); setExpectedId(stored.id); setErrors({}); requestRef.current = null;
      setHistoryPage(0); setHistoryVersion(value => value + 1);
      setNotice(`Saved ${timestamp(stored.saved_at)} by ${stored.reviewer_name}.`);
      onDirtyChange(false); onSaved(stored, nextAccount);
    } catch (e) { if (alive.current) setError(friendlyError(e)); }
    finally { if (alive.current) setSaving(false); }
  };
  const selectField = key => (
    <label className={styles.reviewField} key={key}>
      <span>{labels[key]}{key === 'verification_obstacle' ? ' *' : ''}</span>
      <select ref={key === 'policy_status' ? firstInput : undefined} value={form[key]} onChange={e => change(key, e.target.value)} aria-invalid={Boolean(errors[key])}>
        <option value="">Select…</option>
        {(key === 'next_action' ? actionsFor(form.policy_status) : OPTIONS[key]).map(option => <option key={option}>{option}</option>)}
      </select>
      {errors[key] && <small className={styles.fieldError}>{errors[key]}</small>}
    </label>
  );
  const dateField = (key, label, required) => (
    <label className={styles.reviewField}>
      <span>{label}{required ? ' *' : ' (optional)'}</span>
      <input type="date" value={form[key]} max={key === 'last_payment_date' ? todayValue() : undefined} onChange={e => change(key, e.target.value)} aria-invalid={Boolean(errors[key])} />
      {errors[key] && <small className={styles.fieldError}>{errors[key]}</small>}
    </label>
  );
  return <section className={styles.reviewCard} aria-label="Policy review">
    <header className={styles.sectionHeader}><span>RETENTION REVIEW · {dayLabel(businessDay)}</span><h3>Verify, document, and follow up</h3></header>
    <div className={styles.reviewBody}>
      <p className={styles.reviewHint}>Each save adds a history entry. A new business day starts a fresh review. Save Progress allows incomplete answers; Finish Review checks required fields.</p>
      {error && <div className={styles.error} role="alert">{error}{/changed by another/i.test(error) && <p>Copy your notes before closing, then reopen the account to load the latest review.</p>}</div>}
      {notice && <div className={styles.saveNotice} role="status">{notice}</div>}
      {loading ? <p>Loading saved review…</p> : <fieldset disabled={saving || !canSave} className={styles.reviewFieldset}>
        <button type="button" className={styles.quickActive} onClick={quickActive}>✓ Active — Payments Current</button>
        <p className={styles.reviewHint}>For active accounts, select a verification source, then save. Additional notes are optional.</p>
        {Object.keys(errors).length > 0 && <div className={styles.error} role="alert">Please check the highlighted fields before finishing.</div>}
        <div className={styles.reviewGrid}>
          {selectField('policy_status')}{selectField('payments_current')}{selectField('verification_source')}
          {form.policy_status === 'Unable to Verify' && selectField('verification_obstacle')}
          {dateField('last_payment_date', 'Last verified payment date', false)}
          <label className={styles.reviewField}><span>Last verified payment amount (optional)</span><input type="number" step="0.01" min="0" value={form.last_payment_amount} onChange={e => change('last_payment_amount', e.target.value)} aria-invalid={Boolean(errors.last_payment_amount)} />{errors.last_payment_amount && <small className={styles.fieldError}>{errors.last_payment_amount}</small>}</label>
          {selectField('next_action')}{selectField('contact_result')}
          {dateField('follow_up_date', 'Follow-up date', needsFollowUp(form))}{selectField('work_status')}
        </div>
        <label className={styles.reviewField}><span>Additional notes {needsNotes(form) ? '* Required to finish this review' : '(optional)'}</span><textarea rows={5} maxLength={10000} value={form.notes} onChange={e => change('notes', e.target.value)} placeholder="Payment findings, call details, cancellation reason, reinstatement options, quotes, or renewal decision…" aria-invalid={Boolean(errors.notes)} />{errors.notes && <small className={styles.fieldError}>{errors.notes}</small>}</label>
        <div className={styles.reviewHint}>{form.notes.length.toLocaleString()} / 10,000 characters · {dirty ? 'Unsaved changes' : 'No unsaved changes'}</div>
        <div className={styles.reviewActions}>
          <button type="button" onClick={() => save('draft')}>Save Progress</button>
          <button type="button" onClick={() => save('finish')}>{saving ? 'Saving…' : 'Finish Review'}</button>
          <button type="button" onClick={() => save('finish', true)}>Finish & Next</button>
        </div>
        <p className={styles.reviewHint}>Finish Review marks the account Completed, or keeps it Follow-up needed for unresolved accounts. Only select Completed when no further work is needed. If payment was collected, update the policy status and payment findings before completing.</p>
      </fieldset>}
    </div>
    <header className={styles.sectionHeader}><span>SAVED FINDINGS</span><h3>Review history</h3><label className={styles.historyToggle}><input type="checkbox" checked={customerHistory} onChange={e => { setCustomerHistory(e.target.checked); setHistoryPage(0); }} /> Include this customer's other policies</label></header>
    <div className={styles.reviewBody}>
      {historyLoading ? <p>Loading history…</p> : history.length === 0 ? <p>No saved reviews yet.</p> : history.map(entry => <article className={styles.historyEntry} key={entry.id}>
        <strong>{entry.policy_status} · {entry.work_status}</strong>
        <small>{timestamp(entry.saved_at)} · {entry.reviewer_name} · Worklist {dayLabel(entry.business_day)}</small>
        <small>{entry.policy_number} · {entry.carrier_name} · {entry.office_code}</small>
        <dl className={styles.historyDetails}>
          <div><dt>Payments current</dt><dd>{entry.payments_current || '—'}</dd></div>
          <div><dt>Verified through</dt><dd>{entry.verification_source || '—'}</dd></div>
          <div><dt>Last payment</dt><dd>{dayLabel(entry.last_payment_date)}{entry.last_payment_amount !== null ? ` · $${Number(entry.last_payment_amount).toFixed(2)}` : ''}</dd></div>
          <div><dt>Next action</dt><dd>{entry.next_action || '—'}</dd></div>
          <div><dt>Contact</dt><dd>{entry.contact_result || '—'}</dd></div>
          <div><dt>Follow-up</dt><dd>{dayLabel(entry.follow_up_date)}</dd></div>
          {entry.verification_obstacle && <div><dt>Verification issue</dt><dd>{entry.verification_obstacle}</dd></div>}
        </dl>
        {entry.notes && <p className={styles.historyNotes}>{entry.notes}</p>}
      </article>)}
      <div className={styles.reviewActions}><button type="button" disabled={!historyPage || historyLoading} onClick={() => setHistoryPage(p => p - 1)}>Newer</button><span>History page {historyPage + 1}</span><button type="button" disabled={!hasMore || historyLoading} onClick={() => setHistoryPage(p => p + 1)}>Older</button></div>
    </div>
  </section>;
}

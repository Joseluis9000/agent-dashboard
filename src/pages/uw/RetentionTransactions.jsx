import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import styles from './RetentionQueue.module.css';

const PAGE_SIZE = 25;
const currency = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const dateLabel = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const typeLabel = value => ({ NEW: 'New Business', RWR: 'Rewrite', REN: 'Renewal', INS: 'Payment', REI: 'Reinstatement', END: 'Endorsement' }[value] || value || 'Additional line');
const itemKey = item => JSON.stringify([item.receipt_id, item.transaction_day, item.office_code, item.normalized_policy, item.transaction_type]);
const blank = () => ({ items: [], has_more: false, next_offset: 0, latest_payment: null, latest_transaction: null });
const errorLabel = error => /schema cache|does not exist|could not find the function/i.test(error?.message || '')
  ? 'Transaction history is not installed yet. Run supabase/retention_transaction_history.sql from the update package, then select Refresh History.'
  : error?.message || 'Could not load transaction history. Try again.';

export default function RetentionTransactions({ row, businessDay }) {
  const customerId = String(row.customer_id || '').trim();
  const policy = String(row.policy_number || '').trim();
  const [scope, setScope] = useState(policy ? 'policy' : 'customer');
  const [paymentsOnly, setPaymentsOnly] = useState(false);
  const [result, setResult] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const cache = useRef(new Map());
  const generation = useRef(0);
  const requestBusy = useRef(false);
  const cacheKey = JSON.stringify([customerId, scope === 'policy' ? policy : null, paymentsOnly]);

  useEffect(() => {
    const version = ++generation.current;
    setError(''); setLoadingMore(false); requestBusy.current = false;
    const cached = cache.current.get(cacheKey);
    if (cached) { setResult(cached); setLoading(false); return () => { generation.current += 1; }; }
    setResult(blank()); setLoading(Boolean(customerId));
    if (!customerId) { setError('A customer ID is required to find transaction history.'); return undefined; }
    async function load() {
      try {
        const { data, error: rpcError } = await supabase.rpc('uw_retention_transaction_history', {
          p_customer_id: customerId, p_policy: scope === 'policy' ? policy : null,
          p_payments_only: paymentsOnly, p_limit: PAGE_SIZE, p_offset: 0,
        });
        if (rpcError) throw rpcError;
        if (!data || !Array.isArray(data.items)) throw new Error('The transaction history response was incomplete. Try Refresh History.');
        if (generation.current !== version) return;
        cache.current.set(cacheKey, data); setResult(data);
      } catch (e) { if (generation.current === version) setError(errorLabel(e)); }
      finally { if (generation.current === version) setLoading(false); }
    }
    load();
    return () => { generation.current += 1; };
  }, [customerId, policy, scope, paymentsOnly, cacheKey, refresh]);

  const loadMore = async () => {
    if (requestBusy.current || loading || !result.has_more) return;
    requestBusy.current = true; setLoadingMore(true); setError('');
    const version = generation.current;
    try {
      const { data, error: rpcError } = await supabase.rpc('uw_retention_transaction_history', {
        p_customer_id: customerId, p_policy: scope === 'policy' ? policy : null,
        p_payments_only: paymentsOnly, p_limit: PAGE_SIZE, p_offset: result.next_offset,
      });
      if (rpcError) throw rpcError;
      if (!data || !Array.isArray(data.items)) throw new Error('The transaction history response was incomplete. Please retry.');
      if (generation.current !== version) return;
      const merged = { ...data, items: [...new Map([...result.items, ...data.items].map(item => [itemKey(item), item])).values()] };
      cache.current.set(cacheKey, merged); setResult(merged);
    } catch (e) { if (generation.current === version) setError(errorLabel(e)); }
    finally { if (generation.current === version) { requestBusy.current = false; setLoadingMore(false); } }
  };

  const summary = (title, entry, payment = false) => <div className={styles.transactionSummaryCard}>
    <span>{title}</span>
    {entry ? <><strong>{dateLabel(entry.transaction_day)} · {typeLabel(entry.transaction_type)}</strong><small>{entry.policy_number} · {entry.carrier_name || 'Carrier unavailable'}</small>
      <small>{payment ? `Policy premium ${currency(entry.policy_premium_total)} · ` : ''}Receipt total {currency(entry.collected_total)}</small>
      {Number(entry.receipt_policy_count) > 1 && <small>Shared receipt · {entry.receipt_policy_count} policies</small>}
      {entry.transaction_day > businessDay && <small className={styles.afterDay}>After worklist day</small>}
    </> : <strong>No matching record found</strong>}
  </div>;

  return <section className={styles.transactionCard} aria-label="Payment and policy history">
    <header className={styles.sectionHeader}><span>RECORDED TRANSACTIONS</span><h3>Payment &amp; Policy History</h3></header>
    <div className={styles.reviewBody}>
      <div className={styles.transactionToolbar}>
        <div className={styles.transactionTabs} role="group" aria-label="Transaction scope">
          <button type="button" aria-pressed={scope === 'policy'} disabled={!policy} onClick={() => setScope('policy')}>This Policy</button>
          <button type="button" aria-pressed={scope === 'customer'} onClick={() => setScope('customer')}>All Customer Policies</button>
        </div>
        <label className={styles.historyToggle}><input type="checkbox" checked={paymentsOnly} onChange={e => setPaymentsOnly(e.target.checked)} /> Payments only (INS)</label>
        <button type="button" disabled={loading || loadingMore || !customerId} onClick={() => { cache.current.clear(); setRefresh(value => value + 1); }}>Refresh History</button>
      </div>
      <p className={styles.reviewHint}>Showing recorded activity across all available dates for {scope === 'policy' ? `policy ${policy}` : `customer ${customerId}`}, including activity after {dateLabel(businessDay)}. Carrier-direct payments may not be in these records.</p>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {loading ? <p role="status">Loading payment and policy history…</p> : <>
        {!error && <div className={styles.transactionSummaryGrid}>{summary('Latest recorded payment (INS)', result.latest_payment, true)}{summary('Latest recorded transaction', result.latest_transaction)}</div>}
        <p className={styles.reviewHint}>Amounts labeled Receipt cover the whole receipt, including fees and any other policies on it. Policy premium is shown separately. These records do not automatically mark coverage Active.</p>
        <div className={styles.transactionList}>
          {result.items.length === 0 && !error && <p>{paymentsOnly ? 'No recorded INS payments found for this selection.' : 'No recorded policy transactions found for this selection.'}</p>}
          {result.items.map(item => <article className={styles.transactionEntry} key={itemKey(item)}>
            <div className={styles.transactionEntryHeader}><div><strong>{dateLabel(item.transaction_day)} · {typeLabel(item.transaction_type)}</strong><small>{item.transaction_type} · {item.policy_number} · {item.carrier_name || 'Carrier unavailable'}</small><small>{item.office_code || 'Office unavailable'} · Receipt {item.receipt_id} · {item.payment_method || 'Method unavailable'}</small></div>{item.transaction_day > businessDay && <span className={styles.afterDay}>After worklist day</span>}</div>
            <dl className={styles.transactionAmounts}><div><dt>Policy premium</dt><dd>{currency(item.policy_premium_total)}</dd></div><div><dt>Receipt fees</dt><dd>{currency(item.fee_total)}</dd></div><div><dt>Receipt total</dt><dd>{currency(item.collected_total)}</dd></div></dl>
            {Number(item.receipt_policy_count) > 1 && <p className={styles.sharedReceipt}>Shared receipt: contains {item.receipt_policy_count} policies. Receipt amounts repeat when viewing its other policies; do not add them together.</p>}
            <details><summary>Receipt details</summary><div className={styles.historyReceiptLines}>{(item.receipt_lines || []).map((line, index) => <div key={index}><strong>{line.company || 'Additional line'}</strong><small>{typeLabel(line.type)}{line.policy_number ? ` · ${line.policy_number}` : ''}</small><small>Premium {currency(line.premium)} · Fee {currency(line.fee)} · Total {currency(line.total)}</small></div>)}</div></details>
          </article>)}
        </div>
        <div className={styles.transactionFooter}><span>{result.items.length} {paymentsOnly ? 'payment' : 'transaction'} entries loaded</span>{result.has_more && <button type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load More'}</button>}</div>
      </>}
    </div>
  </section>;
}

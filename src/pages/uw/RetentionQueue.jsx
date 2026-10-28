// src/pages/uw/RetentionQueue.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthContext';
import styles from './RetentionQueue.module.css';

import RetentionReview from './RetentionReview';
import RetentionTransactions from './RetentionTransactions';
import { policyIdentity, policyKey } from './retentionRules';

const PAGE_SIZE = 100;

const getLocalDateValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDateValue = (dateValue, amount) => {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return getLocalDateValue(date);
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
};

const formatTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const transactionLabel = (value) => {
  const key = String(value || '').toUpperCase();

  const labels = {
    NEW: 'New Business',
    RWR: 'Rewrite',
    REN: 'Renewal',
    INS: 'Payment',
    REI: 'Reinstatement',
    END: 'Endorsement',
  };

  return labels[key] || key || '—';
};

const transactionClass = (value) => {
  const key = String(value || '').toUpperCase();

  if (['NEW', 'RWR', 'REN'].includes(key)) return styles.typeAnchor;
  if (key === 'INS') return styles.typePayment;
  if (key === 'REI') return styles.typeReinstatement;
  if (key === 'END') return styles.typeEndorsement;

  return '';
};

export default function RetentionQueue() {
  const { user, profile } = useAuth();

  const role = String(
    profile?.role || user?.user_metadata?.role || ''
  ).toLowerCase();

  const isUW = [
    'underwriter',
    'uw_manager',
    'supervisor',
    'admin',
    'regional',
  ].includes(role);

  const [selectedDay, setSelectedDay] = useState(() => getLocalDateValue());
  const [office, setOffice] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [anchorOnly, setAnchorOnly] = useState(false);
  const [page, setPage] = useState(0);

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    worklist_count: 0,
    customers: 0,
    policies: 0,
    retention_anchors: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  const [reviewSummaries, setReviewSummaries] = useState({});
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('original');
  const [summaryRefresh, setSummaryRefresh] = useState(0);
  const dirtyRef = useRef(false);
  const setReviewDirty = useCallback(value => { dirtyRef.current = value; }, []);
  const closeReview = useCallback(() => {
    if (dirtyRef.current && !window.confirm('This review has unsaved changes or a save in progress. Close it?')) return;
    dirtyRef.current = false;
    setSelectedRow(null);
  }, []);
  useEffect(() => {
    if (!selectedRow) return undefined;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previousFocus = document.activeElement;
    const drawer = document.querySelector('[data-retention-drawer]');
    const focusable = () => Array.from(drawer?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || []).filter(el => el.getClientRects().length);
    focusable()[0]?.focus();
    const handleKey = event => {
      if (event.key === 'Escape') closeReview();
      if (event.key === 'Tab') {
        const fields = focusable(); const first = fields[0]; const last = fields[fields.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', handleKey); previousFocus?.focus(); };
  }, [selectedRow, closeReview]);

  useEffect(() => {
    let cancelled = false;
    async function loadReviews() {
      setReviewLoading(true); setReviewError(''); setReviewSummaries({});
      try {
        const unique = [...new Map(items.filter(row => row.customer_id && row.policy_number).map(row => [policyKey(row), policyIdentity(row)])).values()];
        const merged = {};
        for (let offset = 0; offset < unique.length; offset += 200) {
          const { data, error: fetchError } = await supabase.rpc('uw_retention_review_summaries', { p_keys: unique.slice(offset, offset + 200), p_day: selectedDay });
          if (fetchError) throw fetchError;
          (data || []).forEach(entry => { merged[policyKey(entry)] = entry; });
        }
        if (!cancelled) setReviewSummaries(merged);
      } catch (err) {
        if (!cancelled) setReviewError('Review summaries unavailable. Run the included Supabase SQL if not installed. ' + (err?.message || ''));
      } finally { if (!cancelled) setReviewLoading(false); }
    }
    if (isUW && !loading) loadReviews();
    return () => { cancelled = true; };
  }, [items, selectedDay, isUW, loading, summaryRefresh]);

  const loadWorklist = useCallback(async () => {
    if (dirtyRef.current && !window.confirm('Discard unsaved review changes and refresh?')) return;
    dirtyRef.current = false;
    setLoading(true);
    setError('');
    setSelectedRow(null);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'uw_retention_daily_policy_worklist',
        {
          p_day: selectedDay,
          p_office: office || null,
        }
      );

      if (rpcError) throw rpcError;

      setItems(Array.isArray(data?.items) ? data.items.filter((item) => item && typeof item === 'object') : []);
      setSummary({
        worklist_count: Number(data?.worklist_count || 0),
        customers: Number(data?.customers || 0),
        policies: Number(data?.policies || 0),
        retention_anchors: Number(data?.retention_anchors || 0),
      });
    } catch (err) {
      console.error('[RetentionQueue] daily worklist failed', err);
      setError(err?.message || 'Could not load the daily policy worklist.');
      setItems([]);
      setSummary({
        worklist_count: 0,
        customers: 0,
        policies: 0,
        retention_anchors: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [office, selectedDay]);

  useEffect(() => {
    if (!isUW) return;
    loadWorklist();
  }, [isUW, loadWorklist]);

  useEffect(() => {
    setPage(0);
  }, [selectedDay, office, search, typeFilter, anchorOnly, reviewFilter, sortOrder]);

  const offices = useMemo(
    () =>
      [...new Set(items.map((row) => row.office_code).filter(Boolean))].sort(),
    [items]
  );

  const transactionTypes = useMemo(
    () =>
      [...new Set(items.map((row) => row.transaction_type).filter(Boolean))].sort(),
    [items]
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    const result = items.filter((row) => {
      const current = reviewSummaries[policyKey(row)]?.current_review;
      if (reviewFilter === 'unstarted' && current) return false;
      if (reviewFilter === 'completed' && current?.work_status !== 'Completed') return false;
      if (reviewFilter === 'followup' && current?.work_status !== 'Follow-up needed') return false;
      if (reviewFilter === 'due' && !(current?.follow_up_date && current.follow_up_date <= getLocalDateValue() && current.work_status !== 'Completed')) return false;
      if (reviewFilter === 'inprogress' && current?.work_status !== 'In progress') return false;
      if (
        typeFilter !== 'all' &&
        String(row.transaction_type || '').toUpperCase() !== typeFilter
      ) {
        return false;
      }

      if (anchorOnly && !row.retention_anchor) {
        return false;
      }

      if (!query) return true;

      const haystack = [
        row.customer_name,
        row.customer_id,
        row.policy_number,
        row.carrier_name,
        row.office_code,
        row.receipt_id,
        row.transaction_type,
        current?.notes,
        current?.policy_status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
    if (sortOrder === 'customer') result.sort((a, b) => String(a.customer_name || '').localeCompare(String(b.customer_name || '')));
    if (sortOrder === 'followup') result.sort((a, b) => String(reviewSummaries[policyKey(a)]?.current_review?.follow_up_date || '9999').localeCompare(String(reviewSummaries[policyKey(b)]?.current_review?.follow_up_date || '9999')));
    return result;
  }, [items, search, typeFilter, anchorOnly, reviewSummaries, reviewFilter, sortOrder]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);

  const pagedItems = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, safePage]);

  const matrixUrl = selectedRow?.customer_id
    ? `https://agents.agencymatrix.com/customersDisplay.php?id=${encodeURIComponent(
        selectedRow.customer_id
      )}`
    : '';

  if (!isUW) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>Not authorized.</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>UW OPERATIONS</div>
          <h1>Retention Worklist</h1>
          <p>
            Review daily policy activity, verify coverage, and save investigation findings. Prior reviews stay with each policy for future reference.
          </p>
        </div>

        <button
          type="button"
          className={styles.refreshButton}
          onClick={loadWorklist}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh Day'}
        </button>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {reviewError && <div className={styles.error} role="alert">{reviewError}</div>}

      <section className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span>Selected Day</span>
          <strong className={styles.summaryDate}>
            {formatDate(selectedDay)}
          </strong>
        </div>

        <div className={styles.summaryCard}>
          <span>Transactions</span>
          <strong>{summary.worklist_count.toLocaleString()}</strong>
        </div>

        <div className={styles.summaryCard}>
          <span>Customers</span>
          <strong>{summary.customers.toLocaleString()}</strong>
        </div>

        <div className={styles.summaryCard}>
          <span>Policies</span>
          <strong>{summary.policies.toLocaleString()}</strong>
        </div>

        <button
          type="button"
          className={`${styles.summaryCard} ${styles.anchorSummary}`}
          onClick={() => setAnchorOnly((value) => !value)}
        >
          <span>Retention Anchors</span>
          <strong>{summary.retention_anchors.toLocaleString()}</strong>
          <small>{anchorOnly ? 'Showing anchors only' : 'NEW / RWR / REN'}</small>
        </button>
      </section>

      <section className={styles.queueCard}>
        <div className={styles.filters}>
          <div className={styles.searchWrap}>
            <label htmlFor="retention-search">Search</label>
            <input
              id="retention-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Customer, policy, customer ID, carrier, receipt…"
            />
          </div>

          <div>
            <label htmlFor="retention-office">Office</label>
            <select
              id="retention-office"
              value={office}
              onChange={(e) => setOffice(e.target.value)}
            >
              <option value="">All Offices</option>
              {offices.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="retention-type">Transaction Type</label>
            <select
              id="retention-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All Types</option>
              {transactionTypes.map((item) => (
                <option key={item} value={item}>
                  {item} — {transactionLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="retention-day">Business Day</label>
            <div className={styles.dayPicker}>
              <button
                type="button"
                title="Previous day"
                onClick={() =>
                  setSelectedDay((value) => shiftDateValue(value, -1))
                }
              >
                ←
              </button>

              <input
                id="retention-day"
                type="date"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
              />

              <button
                type="button"
                title="Next day"
                onClick={() =>
                  setSelectedDay((value) => shiftDateValue(value, 1))
                }
              >
                →
              </button>

              <button
                type="button"
                className={styles.todayButton}
                onClick={() => setSelectedDay(getLocalDateValue())}
              >
                Today
              </button>
            </div>
          </div>
        </div>

        <div className={styles.filterBar}>
          <label className={styles.anchorToggle}>
            <input
              type="checkbox"
              checked={anchorOnly}
              onChange={(e) => setAnchorOnly(e.target.checked)}
            />
            <span>Show only retention anchors (NEW / RWR / REN)</span>
          </label>

          <div className={styles.tableCount}>
            {filteredItems.length.toLocaleString()} matching rows
          </div>
        </div>

        <div className={styles.reviewToolbar}>
          <label>Review status <select value={reviewFilter} disabled={reviewLoading || Boolean(reviewError)} onChange={e => setReviewFilter(e.target.value)}>
            <option value="all">All reviews</option><option value="unstarted">Not started</option><option value="inprogress">In progress</option><option value="followup">Follow-up needed</option><option value="due">Follow-ups due</option><option value="completed">Completed</option>
          </select></label>
          <label>Sort <select value={sortOrder} onChange={e => setSortOrder(e.target.value)}><option value="original">Transaction order</option><option value="customer">Customer A–Z</option><option value="followup">Follow-up date</option></select></label>
          <span>{reviewLoading ? 'Loading review history…' : 'Review filters apply to the selected business day.'}</span>
        </div>
        <div className={styles.tableMeta}>
          <span>
            {summary.worklist_count.toLocaleString()} policy transactions on{' '}
            {formatDate(selectedDay)}
          </span>
          <span>
            Page {safePage + 1} of {pageCount}
          </span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Policy</th>
                <th>Carrier</th>
                <th>Office</th>
                <th>Type</th>
                <th>Premium</th>
                <th>Fees</th>
                <th>Total</th>
                <th>Retention</th>
                <th>Policy status / Work</th>
                <th>Next action / Follow-up</th>
                <th>Latest notes / Previous review</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={13} className={styles.emptyCell}>
                    Loading daily policy activity…
                  </td>
                </tr>
              )}

              {!loading && pagedItems.length === 0 && (
                <tr>
                  <td colSpan={13} className={styles.emptyCell}>
                    No insurance policy transactions were found for{' '}
                    {formatDate(selectedDay)}.
                  </td>
                </tr>
              )}

              {!loading &&
                pagedItems.map((row, index) => (
                  <tr
                    className={reviewSummaries[policyKey(row)]?.current_review?.policy_status === 'Active' ? styles.activeRow : undefined}
                    key={`${row.receipt_id}-${row.policy_number}-${index}`}
                  >
                    <td>
                      {row.customer_id ? (
                        <>
                          <a
                            href={`https://agents.agencymatrix.com/customersDisplay.php?id=${encodeURIComponent(
                              row.customer_id
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.matrixCustomerLink}
                          >
                            {row.customer_name || 'Unknown Customer'}
                          </a>

                          <a
                            href={`https://agents.agencymatrix.com/customersDisplay.php?id=${encodeURIComponent(
                              row.customer_id
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.matrixCustomerId}
                          >
                            {row.customer_id}
                          </a>
                        </>
                      ) : (
                        <>
                          <strong>{row.customer_name || 'Unknown Customer'}</strong>
                          <small>—</small>
                        </>
                      )}
                    </td>

                    <td>
                      <strong>{row.policy_number || '—'}</strong>
                      <small>Receipt {row.receipt_id || '—'}</small>
                    </td>

                    <td>{row.carrier_name || '—'}</td>

                    <td>
                      <span className={styles.officeBadge}>
                        {row.office_code || '—'}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`${styles.typeBadge} ${transactionClass(
                          row.transaction_type
                        )}`}
                      >
                        {row.transaction_type || '—'}
                      </span>
                      <small>{transactionLabel(row.transaction_type)}</small>
                    </td>

                    <td>{formatCurrency(row.premium_total)}</td>
                    <td>{formatCurrency(row.fee_total)}</td>
                    <td>
                      <strong>{formatCurrency(row.collected_total)}</strong>
                    </td>

                    <td>
                      {row.retention_anchor ? (
                        <span className={styles.anchorBadge}>Anchor</span>
                      ) : (
                        <span className={styles.normalBadge}>Activity</span>
                      )}
                    </td>

                    <td>
                      <strong>{reviewLoading ? 'Loading…' : reviewError ? 'Unavailable' : reviewSummaries[policyKey(row)]?.current_review?.policy_status || 'Not verified'}</strong>
                      <small>{reviewLoading ? '' : reviewError ? '' : reviewSummaries[policyKey(row)]?.current_review?.work_status || 'Not started'}</small>
                    </td>
                    <td>
                      {reviewSummaries[policyKey(row)]?.current_review?.next_action || '—'}
                      <small>{formatDate(reviewSummaries[policyKey(row)]?.current_review?.follow_up_date)}</small>
                    </td>
                    <td className={styles.notesCell}>
                      <span title={reviewSummaries[policyKey(row)]?.current_review?.notes || ''}>{reviewSummaries[policyKey(row)]?.current_review?.notes || '—'}</span>
                      {reviewSummaries[policyKey(row)]?.previous_review && <small>Previous: {reviewSummaries[policyKey(row)].previous_review.policy_status} · {formatDate(reviewSummaries[policyKey(row)].previous_review.business_day)}</small>}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.openButton}
                        onClick={() => setSelectedRow(row)}
                      >
                        Work Account
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className={styles.pagination}>
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            disabled={safePage === 0}
          >
            Previous
          </button>

          <button
            type="button"
            onClick={() =>
              setPage((value) => Math.min(pageCount - 1, value + 1))
            }
            disabled={safePage >= pageCount - 1}
          >
            Next
          </button>
        </div>
      </section>

      {selectedRow && (
        <div
          className={styles.drawerBackdrop}
          onMouseDown={closeReview}
        >
          <aside
            className={styles.drawer}
            data-retention-drawer
            role="dialog" aria-modal="true" aria-label="Policy investigation"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={styles.drawerHeader}>
              <div>
                <div className={styles.eyebrow}>DAILY TRANSACTION</div>
                <h2>{selectedRow.customer_name || 'Customer'}</h2>
                <p>{selectedRow.policy_number || 'Policy'}</p>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={closeReview}
              >
                ×
              </button>
            </div>

            <div className={styles.drawerActions}>
              {matrixUrl && (
                <a
                  href={matrixUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.matrixButton}
                >
                  Open Customer in Agency Matrix ↗
                </a>
              )}
            </div>

            <RetentionTransactions
              key={`transactions-${policyKey(selectedRow)}-${selectedDay}`}
              row={selectedRow}
              businessDay={selectedDay}
            />

            <RetentionReview
              key={`${policyKey(selectedRow)}-${selectedDay}`}
              row={selectedRow}
              businessDay={selectedDay}
              onDirtyChange={setReviewDirty}
              onSaved={(saved, goNext) => {
                setSummaryRefresh(value => value + 1);
                if (goNext) {
                  dirtyRef.current = false;
                  const position = filteredItems.findIndex(row => policyKey(row) === policyKey(selectedRow));
                  const next = filteredItems.slice(position + 1).find(row => policyKey(row) !== policyKey(selectedRow));
                  setSelectedRow(next || null);
                }
              }}
            />

            <section className={styles.detailGrid}>
              <div>
                <span>Customer ID</span>
                <strong>{selectedRow.customer_id || '—'}</strong>
              </div>
              <div>
                <span>Office</span>
                <strong>{selectedRow.office_code || '—'}</strong>
              </div>
              <div>
                <span>Carrier</span>
                <strong>{selectedRow.carrier_name || '—'}</strong>
              </div>
              <div>
                <span>Transaction</span>
                <strong>
                  {selectedRow.transaction_type || '—'} —{' '}
                  {transactionLabel(selectedRow.transaction_type)}
                </strong>
              </div>
              <div>
                <span>Receipt</span>
                <strong>{selectedRow.receipt_id || '—'}</strong>
              </div>
              <div>
                <span>Time</span>
                <strong>{formatTime(selectedRow.date_time)}</strong>
              </div>
              <div>
                <span>Payment Method</span>
                <strong>{selectedRow.payment_method || '—'}</strong>
              </div>
              <div>
                <span>Policy Type</span>
                <strong>{selectedRow.policy_type || '—'}</strong>
              </div>
            </section>

            <section className={styles.amountGrid}>
              <div>
                <span>Premium</span>
                <strong>{formatCurrency(selectedRow.premium_total)}</strong>
              </div>
              <div>
                <span>Fees</span>
                <strong>{formatCurrency(selectedRow.fee_total)}</strong>
              </div>
              <div>
                <span>Collected</span>
                <strong>{formatCurrency(selectedRow.collected_total)}</strong>
              </div>
            </section>



            <section className={styles.receiptCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span>RECEIPT DETAIL</span>
                  <h3>Transaction Lines</h3>
                </div>
              </div>

              <div className={styles.receiptLines}>
                {Array.isArray(selectedRow.receipt_lines) &&
                selectedRow.receipt_lines.length > 0 ? (
                  selectedRow.receipt_lines.filter((line) => line && typeof line === 'object').map((line, index) => (
                    <div className={styles.receiptLine} key={index}>
                      <div>
                        <strong>{line.company || 'Transaction'}</strong>
                        <small>{line.type || 'Fee / Additional Line'}</small>
                      </div>

                      <div className={styles.receiptAmounts}>
                        <span>Premium {formatCurrency(line.premium)}</span>
                        <span>Fee {formatCurrency(line.fee)}</span>
                        <strong>{formatCurrency(line.total)}</strong>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyCell}>
                    No receipt line detail returned.
                  </div>
                )}
              </div>
            </section>


          </aside>
        </div>
      )}
    </div>
  );
}

// src/pages/agent/AgentQuoteLog.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../AuthContext';
import QuoteSalesFlow from '../../components/QuoteSalesFlow/QuoteSalesFlow';
import styles from './AgentQuoteLog.module.css';

const STALE_AFTER_MS = 60 * 60 * 1000;

function clean(value) {
  return String(value ?? '').replace(/\r/g, '').trim();
}

function normalizeName(value) {
  return clean(value).replace(/\s+/g, ' ').toLowerCase();
}

function normalizeOffice(value = '') {
  const match = String(value || '').match(/CA\d{3}/i);
  return match ? match[0].toUpperCase() : clean(value) || 'Unknown';
}

function monthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthBounds(value) {
  const [year, month] = String(value || monthValue()).split('-').map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function localDateKey(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function groupFollowUpAt(group) {
  const values = (group?.quotes || [])
    .map((quote) => quote?.follow_up_at)
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return values[0] || null;
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}


function eventLabel(event) {
  return clean(event?.event_label || event?.event_type).replaceAll('_', ' ') || 'Quote activity';
}

function elapsedLabel(value, now = Date.now()) {
  if (!value) return '—';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '—';
  const mins = Math.floor(Math.max(0, now - time) / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

function latestTimestamp(row) {
  return new Date(
    row?.last_live_activity_at ||
      row?.updated_at ||
      row?.bridged_back_at ||
      row?.started_at ||
      row?.created_at ||
      0
  ).getTime();
}

function isLiveQuote(quote, now = Date.now()) {
  if (!quote || quote.outcome || quote.follow_up_needed) return false;
  if (quote.status !== 'in_progress') return false;
  const activity = latestTimestamp(quote);
  return Number.isFinite(activity) && now - activity < STALE_AFTER_MS;
}

function outcomeInfo(quote) {
  const outcome = clean(quote?.outcome).toLowerCase();
  if (outcome === 'sold') return { key: 'closed', label: 'Closed' };
  if (outcome === 'follow_up' || quote?.follow_up_needed) return { key: 'follow_up', label: 'Follow Up' };
  if (outcome) return { key: 'not_closed', label: 'Not Closed' };
  if (quote?.status === 'bridged_back' || quote?.bridged_back_at) return { key: 'completed', label: 'Completed' };
  if (quote?.status === 'in_progress') return { key: 'open', label: 'In Progress' };
  return { key: 'open', label: 'Open' };
}

function groupQuotes(rows) {
  const map = new Map();

  rows.forEach((quote) => {
    const key = quote.matrix_customer_id
      ? `customer:${quote.matrix_customer_id}`
      : `quote:${quote.id}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        matrixCustomerId: quote.matrix_customer_id || null,
        quotes: [],
      });
    }
    map.get(key).quotes.push(quote);
  });

  return [...map.values()]
    .map((group) => {
      const quotes = [...group.quotes].sort((a, b) => latestTimestamp(b) - latestTimestamp(a));
      const latest = quotes[0] || {};
      return {
        ...group,
        quotes,
        latest,
        customerName: latest.customer_name || 'Unnamed Customer',
        office: normalizeOffice(latest.office),
        carrier: latest.carrier || '—',
        lastActivityAt:
          latest.last_live_activity_at ||
          latest.updated_at ||
          latest.bridged_back_at ||
          latest.started_at ||
          latest.created_at,
        outcome: outcomeInfo(latest),
      };
    })
    .sort((a, b) => latestTimestamp(b.latest) - latestTimestamp(a.latest));
}

function mergeRows(baseRows, supplementalRows, workflowRows) {
  const supplementalById = new Map(supplementalRows.map((row) => [row.id, row]));
  const workflowById = new Map(workflowRows.map((row) => [row.quote_id, row]));

  return baseRows.map((row) => ({
    ...row,
    ...(supplementalById.get(row.id) || {}),
    ...(workflowById.get(row.id) || {}),
  }));
}


function quoteOwnedByAgent(row, agentEmail, agentNames) {
  const ownerEmail = clean(row?.originating_agent_email || row?.agent_email).toLowerCase();
  if (agentEmail && ownerEmail && ownerEmail === agentEmail) return true;
  const ownerName = normalizeName(row?.originating_agent_name || row?.captured_agent_name || row?.csr_name);
  return Boolean(ownerName && agentNames.includes(ownerName));
}

function quoteActivelyWorkedByAgent(row, agentEmail, agentNames) {
  const workerEmail = clean(row?.agent_email).toLowerCase();
  if (agentEmail && workerEmail && workerEmail === agentEmail) return true;
  const workerName = normalizeName(row?.captured_agent_name || row?.csr_name);
  return Boolean(workerName && agentNames.includes(workerName));
}

export default function AgentQuoteLog() {
  const { supabaseClient, profile, user } = useAuth();
  const [month, setMonth] = useState(monthValue());
  const [quotes, setQuotes] = useState([]);
  const [quoteEvents, setQuoteEvents] = useState([]);
  const [internalNotes, setInternalNotes] = useState([]);
  const [officeAccess, setOfficeAccess] = useState([]);
  const [customerHistory, setCustomerHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('live');
  const [selectedGroupKey, setSelectedGroupKey] = useState('');
  const [selectedFollowUpDay, setSelectedFollowUpDay] = useState('');
  const [now, setNow] = useState(Date.now());
  const refreshTimer = useRef(null);
  const fetchRequestRef = useRef(0);

  const agentEmail = clean(profile?.email || user?.email).toLowerCase();
  const agentNames = useMemo(
    () =>
      [...new Set([
        profile?.csr_name,
        profile?.turborater_agent_name,
        profile?.full_name,
        user?.user_metadata?.full_name,
      ].map(normalizeName).filter(Boolean))],
    [profile?.csr_name, profile?.turborater_agent_name, profile?.full_name, user?.user_metadata?.full_name]
  );

  const fetchOfficeAccess = useCallback(async () => {
    if (!supabaseClient) return [];
    const { data, error: accessError } = await supabaseClient.rpc('get_agent_active_office_access');
    if (accessError) {
      console.error('[AgentQuoteLog] office access query failed:', accessError);
      setOfficeAccess([]);
      return [];
    }
    const rows = data || [];
    setOfficeAccess(rows);
    return rows;
  }, [supabaseClient]);

  const fetchQuotes = useCallback(
    async ({ quiet = false } = {}) => {
      if (!supabaseClient || (!agentEmail && agentNames.length === 0)) return;

      const requestId = ++fetchRequestRef.current;
      if (!quiet) setLoading(true);
      setError('');

      const { start, end } = monthBounds(month);
      const accessRows = await fetchOfficeAccess();
      const allowedOffices = [...new Set(
        accessRows
          .map((row) => normalizeOffice(row.office))
          .filter((office) => office && office !== 'Unknown')
      )];

      const baseQueries = [];

      // Follow-up appointments are scheduled by follow_up_at, which may be in this
      // month even when the original quote started in a previous month. Pull those
      // quote IDs separately, then apply the same agent ownership matching used by
      // the rest of My Quotes.
      const followUpWorkflowResult = await supabaseClient
        .from('quote_workflow')
        .select('quote_id, follow_up_at')
        .or('follow_up_needed.eq.true,outcome.eq.follow_up')
        .gte('follow_up_at', start)
        .lt('follow_up_at', end);

      if (followUpWorkflowResult.error) {
        console.error('[AgentQuoteLog] follow-up calendar query failed:', followUpWorkflowResult.error);
      }

      const followUpQuoteIds = [...new Set((followUpWorkflowResult.data || []).map((row) => row.quote_id).filter(Boolean))];

      if (agentEmail) {
        baseQueries.push(
          supabaseClient.from('quote_log_view').select('*').eq('agent_email', agentEmail).gte('started_at', start).lt('started_at', end).order('started_at', { ascending: false }),
          supabaseClient.from('quote_log_view').select('*').eq('agent_email', agentEmail).eq('status', 'in_progress').order('started_at', { ascending: false })
        );
      }

      agentNames.forEach((name) => {
        baseQueries.push(
          supabaseClient.from('quote_log_view').select('*').ilike('captured_agent_name', name).gte('started_at', start).lt('started_at', end).order('started_at', { ascending: false }),
          supabaseClient.from('quote_log_view').select('*').ilike('captured_agent_name', name).eq('status', 'in_progress').order('started_at', { ascending: false })
        );
      });

      allowedOffices.forEach((office) => {
        baseQueries.push(
          supabaseClient.from('quote_log_view').select('*').eq('office', office).gte('started_at', start).lt('started_at', end).order('started_at', { ascending: false }),
          supabaseClient.from('quote_log_view').select('*').eq('office', office).eq('status', 'in_progress').order('started_at', { ascending: false })
        );
      });

      if (followUpQuoteIds.length > 0) {
        for (let index = 0; index < followUpQuoteIds.length; index += 200) {
          const ids = followUpQuoteIds.slice(index, index + 200);
          if (agentEmail) {
            baseQueries.push(
              supabaseClient.from('quote_log_view').select('*').in('id', ids).eq('agent_email', agentEmail)
            );
          }
          agentNames.forEach((name) => {
            baseQueries.push(
              supabaseClient.from('quote_log_view').select('*').in('id', ids).ilike('captured_agent_name', name)
            );
          });
        }
      }

      const results = await Promise.all(baseQueries);
      const queryError = results.find((result) => result.error)?.error;
      if (queryError) {
        console.error('[AgentQuoteLog] quote query failed:', queryError);
        if (requestId === fetchRequestRef.current) {
          setError(`Could not load Quote Log: ${queryError.message}`);
          if (!quiet) setLoading(false);
        }
        return;
      }

      const rowMap = new Map();
      results.forEach((result) => {
        (result.data || []).forEach((row) => {
          if (row?.id) rowMap.set(row.id, row);
        });
      });

      const baseRows = [...rowMap.values()];
      const quoteIds = baseRows.map((row) => row.id).filter(Boolean);
      const supplementalRows = [];
      const workflowRows = [];
      const eventRows = [];
      const noteRows = [];

      for (let index = 0; index < quoteIds.length; index += 200) {
        const ids = quoteIds.slice(index, index + 200);
        const [quoteResult, workflowResult, eventResult, noteResult] = await Promise.all([
          supabaseClient
            .from('quotes')
            .select('id, originating_agent_email, originating_agent_name, originating_office, last_worked_by_email, last_worked_by_name, driver_count, drivers_with_license, any_license_entered, first_license_entered_at, vehicle_count, vehicles_with_full_vin, any_full_vin_entered, first_full_vin_entered_at, high_intent_detected, high_intent_detected_at, completeness_observed_at, last_live_activity_at, drivers_summary, vehicles_summary, turborater_office, office_source, office_mismatch, captured_device_id')
            .in('id', ids),
          supabaseClient
            .from('quote_workflow')
            .select('quote_id, contact_method, quote_business_type, existing_client_reason, first_yes_ready_now, second_yes_id_vin, third_yes_payment_ready, payment_method, first_yes_recorded_at, second_yes_recorded_at, third_yes_recorded_at, outcome, follow_up_needed, follow_up_at, agent_notes, not_closed_explanation, lost_deal_manager_name, lost_deal_broker_fee')
            .in('quote_id', ids),
          supabaseClient.from('quote_events').select('id, quote_id, event_type, event_label, event_at, created_at').in('quote_id', ids).order('event_at', { ascending: false }),
          supabaseClient.from('quote_internal_notes').select('id, quote_id, note_text, author_email, author_name, author_role, note_source, created_at').in('quote_id', ids).order('created_at', { ascending: false }),
        ]);

        if (quoteResult.error) console.error('[AgentQuoteLog] quote detail query failed:', quoteResult.error);
        else supplementalRows.push(...(quoteResult.data || []));
        if (workflowResult.error) console.error('[AgentQuoteLog] workflow query failed:', workflowResult.error);
        else workflowRows.push(...(workflowResult.data || []));
        if (eventResult.error) console.error('[AgentQuoteLog] event query failed:', eventResult.error);
        else eventRows.push(...(eventResult.data || []));
        if (noteResult.error) console.error('[AgentQuoteLog] internal notes query failed:', noteResult.error);
        else noteRows.push(...(noteResult.data || []));
      }

      if (requestId !== fetchRequestRef.current) return;

      const merged = mergeRows(baseRows, supplementalRows, workflowRows)
        .map((row) => ({
          ...row,
          access_scope: quoteOwnedByAgent(row, agentEmail, agentNames)
            ? 'owned'
            : allowedOffices.includes(normalizeOffice(row.office))
              ? 'office'
              : quoteActivelyWorkedByAgent(row, agentEmail, agentNames)
                ? 'worked'
                : 'none',
        }))
        .filter((row) => row.access_scope !== 'none');

      setQuotes(merged);
      setQuoteEvents(eventRows);
      setInternalNotes(noteRows);
      if (!quiet) setLoading(false);
    },
    [supabaseClient, agentEmail, agentNames, month, fetchOfficeAccess]
  );

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => fetchQuotes({ quiet: true }), 30000);
    return () => clearInterval(timer);
  }, [fetchQuotes]);

  useEffect(() => {
    if (!supabaseClient) return undefined;

    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => fetchQuotes({ quiet: true }), 700);
    };

    const channel = supabaseClient
      .channel(`agent-quote-log-${agentEmail || 'user'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_workflow' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_events' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_internal_notes' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabaseClient.removeChannel(channel);
    };
  }, [supabaseClient, agentEmail, fetchQuotes]);

  const groups = useMemo(() => groupQuotes(quotes), [quotes]);

  useEffect(() => {
    if (!selectedGroupKey) return;
    if (!groups.some((group) => group.key === selectedGroupKey)) setSelectedGroupKey('');
  }, [groups, selectedGroupKey]);

  const filteredGroups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter((group) => {
      const haystack = [
        group.customerName,
        group.office,
        group.carrier,
        group.matrixCustomerId,
        ...group.quotes.flatMap((quote) => [quote.matrix_quote_id, quote.phone, quote.email, quote.lead_source]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [groups, search]);

  const ownedGroups = useMemo(
    () => filteredGroups.filter((group) => group.quotes.some((quote) => quote.access_scope === 'owned')),
    [filteredGroups]
  );

  const officeGroups = useMemo(
    () => filteredGroups.filter((group) =>
      !group.quotes.some((quote) => quote.access_scope === 'owned') &&
      group.quotes.some((quote) => quote.access_scope === 'office')
    ),
    [filteredGroups]
  );

  const liveGroups = useMemo(
    () => filteredGroups.filter((group) => group.quotes.some((quote) => isLiveQuote(quote, now))),
    [filteredGroups, now]
  );

  const calendarFollowUpGroups = useMemo(
    () => ownedGroups
      .filter((group) => group.outcome.key === 'follow_up')
      .filter((group) => {
        const followUpAt = groupFollowUpAt(group);
        return followUpAt && monthValue(new Date(followUpAt)) === month;
      })
      .sort((a, b) => new Date(groupFollowUpAt(a) || 0) - new Date(groupFollowUpAt(b) || 0)),
    [ownedGroups, month]
  );

  const followUpGroups = useMemo(
    () => selectedFollowUpDay
      ? calendarFollowUpGroups.filter((group) => localDateKey(groupFollowUpAt(group)) === selectedFollowUpDay)
      : calendarFollowUpGroups,
    [calendarFollowUpGroups, selectedFollowUpDay]
  );

  const closedGroups = useMemo(
    () => ownedGroups.filter((group) => group.outcome.key === 'closed'),
    [ownedGroups]
  );

  const historyGroups = useMemo(
    () => ownedGroups.filter((group) => !group.quotes.some((quote) => isLiveQuote(quote, now))),
    [ownedGroups, now]
  );

  const activeLiveGroup = useMemo(() => {
    const group = liveGroups.find((candidate) =>
      candidate.quotes.some((quote) =>
        isLiveQuote(quote, now) && quoteActivelyWorkedByAgent(quote, agentEmail, agentNames)
      )
    ) || liveGroups[0] || null;
    if (!group) return null;
    const liveQuote = group.quotes.find((quote) => isLiveQuote(quote, now));
    if (!liveQuote || group.quotes[0]?.id === liveQuote.id) return group;
    return {
      ...group,
      latest: liveQuote,
      quotes: [liveQuote, ...group.quotes.filter((quote) => quote.id !== liveQuote.id)],
    };
  }, [liveGroups, now, agentEmail, agentNames]);

  const selectedGroup = groups.find((group) => group.key === selectedGroupKey) || null;
  const workflowGroup = selectedGroup || (activeTab === 'live' ? activeLiveGroup : null);


  useEffect(() => {
    let cancelled = false;
    const customerId = selectedGroup?.matrixCustomerId;

    if (!customerId || !supabaseClient) {
      setCustomerHistory([]);
      return undefined;
    }

    supabaseClient
      .rpc('get_agent_customer_quote_history', { p_matrix_customer_id: String(customerId) })
      .then(({ data, error: historyError }) => {
        if (cancelled) return;
        if (historyError) {
          console.error('[AgentQuoteLog] customer history query failed:', historyError);
          setCustomerHistory([]);
          return;
        }
        setCustomerHistory((data || []).filter((row) => row.id !== selectedGroup.latest?.id));
      });

    return () => { cancelled = true; };
  }, [selectedGroup?.matrixCustomerId, selectedGroup?.latest?.id, supabaseClient]);

  const eventsByQuote = useMemo(() => {
    const map = {};
    quoteEvents.forEach((event) => {
      if (!map[event.quote_id]) map[event.quote_id] = [];
      map[event.quote_id].push(event);
    });
    return map;
  }, [quoteEvents]);

  const notesByQuote = useMemo(() => {
    const map = {};
    internalNotes.forEach((note) => {
      if (!map[note.quote_id]) map[note.quote_id] = [];
      map[note.quote_id].push(note);
    });
    return map;
  }, [internalNotes]);

  const closedCount = ownedGroups.filter((group) => group.outcome.key === 'closed').length;
  const closeRate = ownedGroups.length ? Math.round((closedCount / ownedGroups.length) * 100) : 0;

  const tabGroups = activeTab === 'office'
    ? officeGroups
    : activeTab === 'follow_up'
      ? followUpGroups
      : activeTab === 'closed'
        ? closedGroups
        : historyGroups;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>AGENT QUOTE LOG</div>
          <h1>My Quotes</h1>
          <p>
            Your own quotes stay with you. Approved office access is temporary and does not transfer ownership.
            {officeAccess.length > 0 ? ` Current office access: ${officeAccess.map((row) => normalizeOffice(row.office)).join(', ')}.` : ''}
          </p>
        </div>
        <button type="button" className={styles.refreshButton} onClick={() => fetchQuotes()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && <div className={styles.errorBox}>{error}</div>}

      <section className={styles.statsGrid}>
        <StatCard label="Live Now" value={liveGroups.length} tone="live" />
        <StatCard label="My Quotes This Month" value={ownedGroups.length} />
        <StatCard label="Follow-Ups" value={followUpGroups.length} tone="follow" />
        <StatCard label="Closed" value={closedCount} tone="closed" />
        <StatCard label="Close Rate" value={`${closeRate}%`} />
      </section>

      <nav className={styles.tabs}>
        <TabButton active={activeTab === 'live'} onClick={() => { setActiveTab('live'); setSelectedGroupKey(''); }} label="Live Session" count={liveGroups.length} />
        <TabButton active={activeTab === 'quotes'} onClick={() => { setActiveTab('quotes'); setSelectedGroupKey(''); }} label="My Quotes" count={historyGroups.length} />
        <TabButton active={activeTab === 'office'} onClick={() => { setActiveTab('office'); setSelectedGroupKey(''); }} label="Office Quotes" count={officeGroups.length} />
        <TabButton active={activeTab === 'follow_up'} onClick={() => { setActiveTab('follow_up'); setSelectedFollowUpDay(''); setSelectedGroupKey(''); }} label="Follow-Ups" count={calendarFollowUpGroups.length} />
        <TabButton active={activeTab === 'calendar'} onClick={() => { setActiveTab('calendar'); setSelectedFollowUpDay(''); setSelectedGroupKey(''); }} label="Calendar" count={calendarFollowUpGroups.length} />
        <TabButton active={activeTab === 'closed'} onClick={() => { setActiveTab('closed'); setSelectedGroupKey(''); }} label="Closed Deals" count={closedGroups.length} />
      </nav>

      {activeTab === 'live' && (
        <section className={styles.liveSection}>
          {activeLiveGroup ? (
            <>
              <div className={styles.liveHeading}>
                <div>
                  <span className={styles.liveDot} />
                  <strong>Live TurboRater Session</strong>
                  <small>Updates automatically. A live session can be your quote or an office quote you are actively helping with.</small>
                </div>
                {liveGroups.length > 1 && <span>{liveGroups.length} live quotes</span>}
              </div>
              <QuoteSalesFlow
                group={activeLiveGroup}
                mode="agent"
                onSaved={() => fetchQuotes({ quiet: true })}
                onViewDetails={() => setSelectedGroupKey(activeLiveGroup.key)}
              />
              {liveGroups.length > 1 && (
                <div className={styles.liveSwitcher}>
                  {liveGroups.map((group) => (
                    <button key={group.key} type="button" onClick={() => setSelectedGroupKey(group.key)}>
                      <strong>{group.customerName}</strong>
                      <span>{group.office} · {elapsedLabel(group.lastActivityAt, now)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <EmptyState title="No live quote right now" detail="Start a quote in TurboRater and it will appear here automatically when the extension captures it." />
          )}
        </section>
      )}

      {activeTab === 'calendar' && (
        <AgentFollowUpCalendar
          month={month}
          groups={calendarFollowUpGroups}
          onOpen={(group) => setSelectedGroupKey(group.key)}
          onSelectDay={(date) => {
            setSelectedFollowUpDay(date);
            setActiveTab('follow_up');
          }}
        />
      )}

      {activeTab !== 'live' && activeTab !== 'calendar' && (
        <section className={styles.listSection}>
          <div className={styles.listToolbar}>
            <div>
              <div className={styles.listTitleRow}>
                {activeTab === 'follow_up' && selectedFollowUpDay && (
                  <button type="button" className={styles.backToCalendarButton} onClick={() => { setSelectedFollowUpDay(''); setActiveTab('calendar'); }}>
                    ← Back to Calendar
                  </button>
                )}
                <strong>{activeTab === 'quotes' ? 'My Quote History' : activeTab === 'office' ? 'Current Office Quotes' : activeTab === 'follow_up' ? (selectedFollowUpDay ? `Follow-Ups · ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${selectedFollowUpDay}T12:00:00`))}` : 'My Follow-Ups') : 'My Closed Deals'}</strong>
              </div>
              <small>{activeTab === 'office' ? 'Temporary office access from an approved extension.' : 'My Quotes are owned by the agent who originally created that Matrix quote.'}</small>
            </div>
            <div className={styles.filters}>
              <input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setSelectedFollowUpDay(''); }} />
              <input type="search" placeholder="Search customer, carrier, quote…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>

          {loading && groups.length === 0 ? (
            <div className={styles.loading}>Loading your quotes…</div>
          ) : tabGroups.length === 0 ? (
            <EmptyState title="Nothing here yet" detail="Quotes matching this view will appear here automatically." />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Office</th>
                    <th>Carrier</th>
                    <th>Quote</th>
                    <th>Last Activity</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tabGroups.map((group) => (
                    <tr key={group.key}>
                      <td><strong>{group.customerName}</strong><span>{group.latest.phone || group.latest.email || '—'}</span></td>
                      <td>{group.office}</td>
                      <td>{group.carrier}</td>
                      <td>{group.latest.matrix_quote_id || '—'}</td>
                      <td>{formatDateTime(group.lastActivityAt)}<span>{elapsedLabel(group.lastActivityAt, now)} ago</span></td>
                      <td><StatusBadge status={group.outcome.key} label={group.outcome.label} /></td>
                      <td><button type="button" className={styles.openButton} onClick={() => setSelectedGroupKey(group.key)}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {selectedGroup && (
        <div className={styles.drawerBackdrop} onMouseDown={() => setSelectedGroupKey('')}>
          <section className={styles.drawer} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div>
                <span>QUOTE DETAILS & WORKFLOW</span>
                <h2>{selectedGroup.customerName}</h2>
                <p>{selectedGroup.office} · Quote #{selectedGroup.latest.matrix_quote_id || '—'} · {selectedGroup.outcome.label}</p>
              </div>
              <button type="button" onClick={() => setSelectedGroupKey('')}>×</button>
            </div>

            <div className={styles.modalGrid}>
              <AgentQuoteDetails
                group={selectedGroup}
                eventsByQuote={eventsByQuote}
                notesByQuote={notesByQuote}
                customerHistory={customerHistory}
              />
              <div className={styles.workflowColumn}>
                <QuoteSalesFlow
                  group={workflowGroup}
                  mode="agent"
                  onSaved={() => fetchQuotes({ quiet: true })}
                />
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function AgentFollowUpCalendar({ month, groups, onOpen, onSelectDay }) {
  const [year, monthNumber] = String(month || monthValue()).split('-').map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const leading = first.getDay();
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(first);

  const byDay = new Map();
  groups.forEach((group) => {
    const key = localDateKey(groupFollowUpAt(group));
    if (!key) return;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(group);
  });
  byDay.forEach((rows) => rows.sort((a, b) => new Date(groupFollowUpAt(a)) - new Date(groupFollowUpAt(b))));

  const cells = [];
  for (let index = 0; index < leading; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <section className={styles.calendarSection}>
      <div className={styles.calendarHeading}>
        <div>
          <strong>My Follow-Up Calendar</strong>
          <small>{monthLabel} · Only follow-ups that belong to your own quotes are shown.</small>
        </div>
        <span>{groups.length} appointment{groups.length === 1 ? '' : 's'}</span>
      </div>

      <div className={styles.calendarWrap}>
        <div className={styles.calendarWeekdays}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <strong key={day}>{day}</strong>)}
        </div>
        <div className={styles.calendarGrid}>
          {cells.map((day, index) => {
            if (!day) return <div key={`blank-${index}`} className={`${styles.calendarDay} ${styles.calendarDayBlank}`} />;
            const key = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const appointments = byDay.get(key) || [];
            return (
              <div key={key} className={`${styles.calendarDay} ${appointments.length ? styles.calendarDayHasAppointments : ''}`}>
                <button type="button" className={styles.calendarDayHeader} onClick={() => appointments.length && onSelectDay(key)}>
                  <span>{day}</span>
                  {appointments.length > 0 && <strong>{appointments.length}</strong>}
                </button>
                <div className={styles.calendarAppointments}>
                  {appointments.slice(0, 3).map((group) => (
                    <button key={group.key} type="button" className={styles.calendarAppointment} onClick={() => onOpen(group)}>
                      <time>{new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(groupFollowUpAt(group)))}</time>
                      <strong>{group.customerName}</strong>
                      <span>{group.office} · {group.latest.phone || 'No phone'}</span>
                    </button>
                  ))}
                  {appointments.length > 3 && (
                    <button type="button" className={styles.calendarMore} onClick={() => onSelectDay(key)}>
                      View {appointments.length - 3} more appointment{appointments.length - 3 === 1 ? '' : 's'} →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AgentQuoteDetails({ group, eventsByQuote, notesByQuote, customerHistory = [] }) {
  const latest = group.latest || {};
  const drivers = safeArray(latest.drivers_summary);
  const vehicles = safeArray(latest.vehicles_summary);
  const licensed = Number(latest.drivers_with_license || 0);
  const driverCount = Number(latest.driver_count || drivers.length || 0);
  const fullVins = Number(latest.vehicles_with_full_vin || 0);
  const vehicleCount = Number(latest.vehicle_count || vehicles.length || 0);
  const bridged = Boolean(latest.bridged_back_at || latest.status === 'bridged_back' || latest.bridge_policy_status);
  const notes = group.quotes
    .flatMap((quote) => notesByQuote[quote.id] || [])
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const events = group.quotes
    .flatMap((quote) => eventsByQuote[quote.id] || [])
    .sort((a, b) => new Date(b.event_at || b.created_at || 0) - new Date(a.event_at || a.created_at || 0));

  return (
    <div className={styles.detailsColumn}>
      <section className={styles.detailCard}>
        <div className={styles.detailCardHeading}>
          <strong>Quote Snapshot</strong>
          <span>Key information everyone can use to help the customer.</span>
        </div>
        <div className={styles.snapshotGrid}>
          <DetailField label="Carrier" value={latest.carrier || '—'} />
          <DetailField label="Premium" value={formatMoney(latest.total_premium)} />
          <DetailField label="Down Payment" value={formatMoney(latest.down_payment)} />
          <DetailField label="Monthly Payment" value={formatMoney(latest.monthly_payment)} />
          <DetailField label="Phone Number" value={latest.phone || '—'} />
          <DetailField label="Matrix Customer ID" value={group.matrixCustomerId || latest.matrix_customer_id || '—'} />
          <DetailField label="Started" value={formatDateTime(latest.started_at)} />
          <DetailField label="Last Activity" value={formatDateTime(group.lastActivityAt)} />
        </div>
      </section>

      <section className={styles.detailCard}>
        <div className={styles.detailCardHeading}>
          <strong>Quote Progress</strong>
          <span>DL/VIN readiness and bridge status from TurboRater.</span>
        </div>
        <div className={styles.progressTiles}>
          <ProgressTile label="Driver License" value={`${licensed}/${driverCount || 0}`} good={licensed > 0} detail={licensed > 0 ? 'Entered' : 'Not detected'} />
          <ProgressTile label="Full VIN" value={`${fullVins}/${vehicleCount || 0}`} good={fullVins > 0} detail={fullVins > 0 ? 'Entered' : 'Not detected'} />
          <ProgressTile label="Bridged" value={bridged ? 'YES' : 'NO'} good={bridged} detail={latest.bridge_policy_status || latest.status || '—'} />
        </div>
      </section>

      {(drivers.length > 0 || vehicles.length > 0) && (
        <section className={styles.detailCard}>
          <div className={styles.detailCardHeading}><strong>Drivers & Vehicles</strong><span>No license or VIN numbers are displayed.</span></div>
          <div className={styles.compactList}>
            {drivers.map((driver, index) => (
              <div key={`driver-${driver.index || index}`}><strong>{driver.name || `Driver ${index + 1}`}</strong><span>{driver.dob || 'DOB —'} · {driver.driverType || 'Driver'} · DL {driver.licenseEntered ? '✓ Entered' : '—'}</span></div>
            ))}
            {vehicles.map((vehicle, index) => (
              <div key={`vehicle-${vehicle.index || index}`}><strong>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || `Vehicle ${index + 1}`}</strong><span>{vehicle.fullVinEntered ? '✓ Full VIN entered' : vehicle.vinPresent ? 'Partial / ITC VIN' : 'VIN not detected'}</span></div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.detailCard}>
        <div className={styles.detailCardHeading}><strong>Team Notes</strong><span>Agent, supervisor, and admin notes stay visible so the team can pick up where someone left off.</span></div>
        {latest.captured_note && <div className={styles.capturedNote}><span>TurboRater Note</span><p>{latest.captured_note}</p></div>}
        <div className={styles.noteHistory}>
          {notes.map((note) => (
            <article key={note.id}>
              <div><strong>{note.author_name || note.author_email || 'Team Member'}</strong><span>{clean(note.author_role || note.note_source || 'internal').replaceAll('_', ' ')}</span><time>{formatDateTime(note.created_at)}</time></div>
              <p>{note.note_text}</p>
            </article>
          ))}
          {notes.length === 0 && !latest.captured_note && <div className={styles.mutedEmpty}>No team notes yet.</div>}
        </div>
      </section>

      {customerHistory.length > 0 && (
        <section className={styles.detailCard}>
          <div className={styles.detailCardHeading}>
            <strong>Customer History</strong>
            <span>Earlier quotes for this Matrix customer. History follows the customer; ownership stays with the originating agent.</span>
          </div>
          <div className={styles.compactList}>
            {customerHistory.slice(0, 8).map((row) => (
              <div key={row.id}>
                <strong>{row.captured_agent_name || row.agent_email || 'Agent not recorded'} · {normalizeOffice(row.office)}</strong>
                <span>
                  Quote #{row.matrix_quote_id || '—'} · {row.carrier || 'No carrier'} · {formatMoney(row.down_payment)} DP · {formatMoney(row.monthly_payment)} / mo · {formatDateTime(row.started_at)}
                  {row.latest_note ? ` · Note: ${row.latest_note}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {events.length > 0 && (
        <details className={styles.timelineDetails}>
          <summary>Recent Quote Activity ({events.length})</summary>
          <div className={styles.timelineList}>
            {events.slice(0, 12).map((event) => <div key={event.id}><time>{formatDateTime(event.event_at || event.created_at)}</time><strong>{eventLabel(event)}</strong></div>)}
          </div>
        </details>
      )}
    </div>
  );
}

function DetailField({ label, value }) {
  return <div className={styles.detailField}><span>{label}</span><strong>{value}</strong></div>;
}

function ProgressTile({ label, value, good, detail }) {
  return <div className={`${styles.progressTile} ${good ? styles.progressGood : ''}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function StatCard({ label, value, tone = '' }) {
  return (
    <div className={`${styles.statCard} ${tone ? styles[`stat_${tone}`] : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TabButton({ active, onClick, label, count }) {
  return (
    <button type="button" className={`${styles.tabButton} ${active ? styles.tabActive : ''}`} onClick={onClick}>
      <span>{label}</span><strong>{count}</strong>
    </button>
  );
}

function StatusBadge({ status, label }) {
  return <span className={`${styles.statusBadge} ${styles[`status_${status}`] || ''}`}>{label}</span>;
}

function EmptyState({ title, detail }) {
  return (
    <div className={styles.emptyState}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}
// src/pages/agent/AgentQuoteLog.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../AuthContext';
import QuoteSalesFlow from '../../components/QuoteSalesFlow/QuoteSalesFlow';
import styles from './AgentQuoteLog.module.css';
import {
  STALE_AFTER_MS as SHARED_STALE_AFTER_MS,
  QUOTE_PRIMARY_BUCKETS,
  classifyQuoteGroup as sharedClassifyQuoteGroup,
  getThreeYesStage as sharedGetThreeYesStage,
  inferQuoteBusinessType as sharedInferQuoteBusinessType,
  inferExistingClientReason as sharedInferExistingClientReason,
  isGroupClosed as sharedIsGroupClosed,
  isGroupFollowUp as sharedIsGroupFollowUp,
  isGroupLive as sharedIsGroupLive,
  isGroupRegularQuote as sharedIsGroupRegularQuote,
} from '../../utils/quoteClassification';

const STALE_AFTER_MS = SHARED_STALE_AFTER_MS;

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
  const classifiedFollowUpAt = group?.classification?.quote?.follow_up_at;
  if (classifiedFollowUpAt) return classifiedFollowUpAt;

  const values = (group?.quotes || [])
    .map((quote) => quote?.follow_up_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
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

function classificationStatus(classification) {
  const primary = classification?.primary;
  if (primary === QUOTE_PRIMARY_BUCKETS.CLOSED) return { key: 'closed', label: 'Closed' };
  if (primary === QUOTE_PRIMARY_BUCKETS.FOLLOW_UP) return { key: 'follow_up', label: 'Follow Up' };
  if (primary === QUOTE_PRIMARY_BUCKETS.ATTENTION) {
    return { key: 'attention', label: classification?.attention?.title || 'Needs Attention' };
  }
  return { key: 'open', label: classification?.live ? 'In Progress' : 'Quote' };
}

function isLiveQuote(quote, now = Date.now()) {
  if (!quote) return false;
  const group = { quotes: [quote], latest: quote };
  return sharedIsGroupLive(group, { now, staleAfterMs: STALE_AFTER_MS });
}

function groupQuotes(rows, now = Date.now()) {
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
      const classification = sharedClassifyQuoteGroup(
        { ...group, quotes, latest },
        { now, staleAfterMs: STALE_AFTER_MS }
      );
      const stage = Math.max(0, ...quotes.map((quote) => sharedGetThreeYesStage(quote)));
      const businessType = sharedInferQuoteBusinessType(latest);

      return {
        ...group,
        quotes,
        latest,
        customerName: latest.customer_name || 'Unnamed Customer',
        office: normalizeOffice(latest.office),
        agentName:
          latest.originating_agent_name ||
          latest.captured_agent_name ||
          latest.csr_name ||
          latest.originating_agent_email ||
          latest.agent_email ||
          'Agent not recorded',
        carrier: latest.carrier || latest.carrier_bridge_carrier || '—',
        lastActivityAt:
          latest.last_live_activity_at ||
          latest.updated_at ||
          latest.matrix_bridge_back_at ||
          latest.bridged_back_at ||
          latest.started_at ||
          latest.created_at,
        classification,
        outcome: classificationStatus(classification),
        yesStage: stage,
        stageQuote: quotes.find((quote) => sharedGetThreeYesStage(quote) === stage) || latest,
        businessType,
        existingClientReason:
          businessType === 'existing_client' ? sharedInferExistingClientReason(latest) : '',
      };
    })
    .sort((a, b) => latestTimestamp(b.latest) - latestTimestamp(a.latest));
}

// Keep workflow writes aligned with Admin / Regional / Supervisor logs.
// Prefer the quote the shared classifier is actually using for the customer group
// instead of blindly writing to the newest quote record.
function workflowTargetQuoteForGroup(group) {
  if (!group) return null;

  const classifiedQuote = group?.classification?.quote;
  if (classifiedQuote?.id) {
    return group.quotes?.find((quote) => quote.id === classifiedQuote.id) || classifiedQuote;
  }

  return group?.quotes?.find((quote) => {
    const status = clean(quote?.status).toLowerCase();
    return status && status !== 'in_progress';
  }) || group?.quotes?.[0] || group?.latest || null;
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
  const [officeDeviceVerification, setOfficeDeviceVerification] = useState({
    state: 'idle',
    verified: false,
    deviceName: '',
    office: '',
    region: '',
    officeLogAccess: false,
    expiresAt: null,
    message: '',
  });
  const [customerHistory, setCustomerHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('live');
  const [officeStatusFilter, setOfficeStatusFilter] = useState('attention');
  const [officeTimeFilter, setOfficeTimeFilter] = useState('month');
  const [selectedGroupKey, setSelectedGroupKey] = useState('');
  const [selectedFollowUpDay, setSelectedFollowUpDay] = useState('');
  const [now, setNow] = useState(Date.now());
  const refreshTimer = useRef(null);
  const fetchRequestRef = useRef(0);
  const officeVerifyRequestRef = useRef('');
  const officeVerifyTimeoutRef = useRef(null);
  const officeVerifyHeartbeatRef = useRef(null);

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


  const verifyOfficeQuoteDevice = useCallback(async ({ quiet = false } = {}) => {
    if (!supabaseClient) return false;

    if (!quiet) {
      setOfficeDeviceVerification((current) => ({
        ...current,
        state: 'checking',
        message: 'Checking this computer for approved Office Quotes access…',
      }));
    }

    try {
      const { data, error: challengeError } = await supabaseClient.rpc(
        'create_agent_device_access_challenge'
      );

      if (challengeError) throw challengeError;

      const challengeId =
        typeof data === 'string'
          ? data
          : data?.challenge_id || data?.id || null;

      if (!challengeId) {
        throw new Error('No device verification challenge was returned.');
      }

      const requestId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `fiesta-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      officeVerifyRequestRef.current = requestId;

      window.postMessage(
        {
          source: 'fiesta-dashboard',
          type: 'FIESTA_AGENT_DEVICE_VERIFY_REQUEST',
          requestId,
          challengeId,
        },
        window.location.origin
      );

      if (officeVerifyTimeoutRef.current) {
        clearTimeout(officeVerifyTimeoutRef.current);
      }

      officeVerifyTimeoutRef.current = setTimeout(() => {
        if (officeVerifyRequestRef.current !== requestId) return;

        officeVerifyRequestRef.current = '';
        setOfficeDeviceVerification({
          state: 'blocked',
          verified: false,
          deviceName: '',
          office: '',
          region: '',
          officeLogAccess: false,
          expiresAt: null,
          message:
            'Office Quotes requires Passive Quote Capture v0.11.8 on an approved Fiesta computer.',
        });
        setOfficeAccess([]);
      }, 7000);

      return true;
    } catch (verifyError) {
      console.error('[AgentQuoteLog] Office Quotes device verification failed:', verifyError);
      setOfficeDeviceVerification({
        state: 'blocked',
        verified: false,
        deviceName: '',
        office: '',
        region: '',
        officeLogAccess: false,
        expiresAt: null,
        message:
          verifyError?.message ||
          'This computer could not be verified for Office Quotes.',
      });
      setOfficeAccess([]);
      return false;
    }
  }, [supabaseClient]);

  useEffect(() => {
    const handleOfficeDeviceVerification = async (event) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;

      const message = event.data || {};
      if (message.source !== 'fiesta-extension') return;
      if (message.type !== 'FIESTA_AGENT_DEVICE_VERIFY_RESPONSE') return;
      if (!message.requestId || message.requestId !== officeVerifyRequestRef.current) return;

      officeVerifyRequestRef.current = '';

      if (officeVerifyTimeoutRef.current) {
        clearTimeout(officeVerifyTimeoutRef.current);
        officeVerifyTimeoutRef.current = null;
      }

      if (!message.ok) {
        setOfficeDeviceVerification({
          state: 'blocked',
          verified: false,
          deviceName: '',
          office: '',
          region: '',
          officeLogAccess: false,
          expiresAt: null,
          message:
            message.error ||
            'This computer could not be verified for Office Quotes.',
        });
        setOfficeAccess([]);
        return;
      }

      const officeLogAccess = Boolean(message.officeLogAccess);

      setOfficeDeviceVerification({
        state: officeLogAccess ? 'verified' : 'no_office_access',
        verified: true,
        deviceName: clean(message.deviceName) || 'Approved Fiesta computer',
        office: normalizeOffice(message.office),
        region: clean(message.region),
        officeLogAccess,
        expiresAt: message.expiresAt || null,
        message: officeLogAccess
          ? 'This approved computer can access its Office Quotes.'
          : 'This computer is approved, but Office Quotes access has not been enabled by the office supervisor.',
      });

      const accessRows = await fetchOfficeAccess();
      if (!officeLogAccess || accessRows.length === 0) {
        setOfficeAccess([]);
      }
    };

    window.addEventListener('message', handleOfficeDeviceVerification);

    return () => {
      window.removeEventListener('message', handleOfficeDeviceVerification);
      if (officeVerifyTimeoutRef.current) {
        clearTimeout(officeVerifyTimeoutRef.current);
      }
    };
  }, [fetchOfficeAccess]);

  // Only Office Quotes uses v0.11.8 verification for now.
  // My Quotes / Needs Attention / Follow-Ups / Closed remain compatible
  // with agents still running older extension versions.
  useEffect(() => {
    const needsOfficeVerification =
      activeTab === 'office' ||
      activeTab === 'follow_up' ||
      activeTab === 'calendar';

    if (!needsOfficeVerification) {
      if (officeVerifyHeartbeatRef.current) {
        clearInterval(officeVerifyHeartbeatRef.current);
        officeVerifyHeartbeatRef.current = null;
      }
      return undefined;
    }

    // Office verification never blocks the agent's own Follow-Ups/Calendar.
    // It only adds shared-office follow-ups when the approved extension responds.
    verifyOfficeQuoteDevice({ quiet: activeTab !== 'office' });

    officeVerifyHeartbeatRef.current = setInterval(() => {
      verifyOfficeQuoteDevice({ quiet: true });
    }, 60 * 1000);

    const verifyOnFocus = () => {
      if (document.visibilityState === 'visible') {
        verifyOfficeQuoteDevice({ quiet: true });
      }
    };

    document.addEventListener('visibilitychange', verifyOnFocus);

    return () => {
      document.removeEventListener('visibilitychange', verifyOnFocus);
      if (officeVerifyHeartbeatRef.current) {
        clearInterval(officeVerifyHeartbeatRef.current);
        officeVerifyHeartbeatRef.current = null;
      }
    };
  }, [activeTab, verifyOfficeQuoteDevice]);

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

      // Supabase/PostgREST can cap a single response. Page every primary dataset
      // so the agent view always classifies the complete set of authorized quotes.
      const fetchAllPaged = async (buildQuery, label, pageSize = 1000) => {
        const rows = [];
        let from = 0;

        while (true) {
          const { data, error } = await buildQuery().range(from, from + pageSize - 1);
          if (error) {
            console.error(`[AgentQuoteLog] ${label} page failed at ${from}:`, error);
            return { data: rows, error };
          }

          const page = data || [];
          rows.push(...page);
          if (page.length < pageSize) break;
          from += pageSize;
        }

        return { data: rows, error: null };
      };

      const baseQueries = [];

      // Follow-up appointments are scheduled by follow_up_at, which may be in this
      // month even when the original quote started in a previous month. Pull those
      // quote IDs separately, then apply the same agent ownership matching used by
      // the rest of My Quotes.
      const followUpWorkflowResult = await fetchAllPaged(
        () => supabaseClient
          .from('quote_workflow')
          .select('quote_id, follow_up_at')
          .or('follow_up_needed.eq.true,outcome.eq.follow_up')
          .gte('follow_up_at', start)
          .lt('follow_up_at', end)
          .order('follow_up_at', { ascending: true })
          .order('quote_id', { ascending: true }),
        'follow-up workflow'
      );

      if (followUpWorkflowResult.error) {
        console.error('[AgentQuoteLog] follow-up calendar query failed:', followUpWorkflowResult.error);
      }

      const followUpQuoteIds = [...new Set((followUpWorkflowResult.data || []).map((row) => row.quote_id).filter(Boolean))];

      if (agentEmail) {
        baseQueries.push(
          fetchAllPaged(() => supabaseClient.from('quote_log_view').select('*').eq('agent_email', agentEmail).gte('started_at', start).lt('started_at', end).order('started_at', { ascending: false }).order('id', { ascending: false }), 'owned quote history'),
          fetchAllPaged(() => supabaseClient.from('quote_log_view').select('*').eq('agent_email', agentEmail).eq('status', 'in_progress').order('started_at', { ascending: false }).order('id', { ascending: false }), 'owned live quotes')
        );
      }

      agentNames.forEach((name) => {
        baseQueries.push(
          fetchAllPaged(() => supabaseClient.from('quote_log_view').select('*').ilike('captured_agent_name', name).gte('started_at', start).lt('started_at', end).order('started_at', { ascending: false }).order('id', { ascending: false }), `name quote history ${name}`),
          fetchAllPaged(() => supabaseClient.from('quote_log_view').select('*').ilike('captured_agent_name', name).eq('status', 'in_progress').order('started_at', { ascending: false }).order('id', { ascending: false }), `name live quotes ${name}`)
        );
      });

      allowedOffices.forEach((office) => {
        baseQueries.push(
          fetchAllPaged(() => supabaseClient.from('quote_log_view').select('*').eq('office', office).gte('started_at', start).lt('started_at', end).order('started_at', { ascending: false }).order('id', { ascending: false }), `office quote history ${office}`),
          fetchAllPaged(() => supabaseClient.from('quote_log_view').select('*').eq('office', office).eq('status', 'in_progress').order('started_at', { ascending: false }).order('id', { ascending: false }), `office live quotes ${office}`)
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
      const dealSaveRows = [];

      for (let index = 0; index < quoteIds.length; index += 200) {
        const ids = quoteIds.slice(index, index + 200);
        const fetchQuoteEventsForIds = async (quoteIdBatch) => {
          const rows = [];
          const pageSize = 1000;
          let from = 0;

          while (true) {
            const { data, error } = await supabaseClient
              .from('quote_events')
              .select('id, quote_id, capture_id, event_type, event_label, event_at, metadata, created_at')
              .in('quote_id', quoteIdBatch)
              .order('event_at', { ascending: true })
              .range(from, from + pageSize - 1);

            if (error) return { data: rows, error };
            const page = data || [];
            rows.push(...page);
            if (page.length < pageSize) break;
            from += pageSize;
          }

          return { data: rows, error: null };
        };

        const [quoteResult, workflowResult, eventResult, noteResult, dealSaveResult] = await Promise.all([
          supabaseClient
            .from('quotes')
            .select('id, status, extension_version, originating_agent_email, originating_agent_name, originating_office, last_worked_by_email, last_worked_by_name, carrier, total_premium, down_payment, monthly_payment, bridged_back_at, bridge_policy_status, bridge_policy_status_value, system_outcome_signal, carrier_bridge_started_at, carrier_bridge_carrier, matrix_bridge_back_at, driver_count, drivers_with_license, any_license_entered, first_license_entered_at, vehicle_count, vehicles_with_full_vin, any_full_vin_entered, first_full_vin_entered_at, high_intent_detected, high_intent_detected_at, completeness_observed_at, last_live_activity_at, drivers_summary, vehicles_summary, turborater_office, office_source, office_mismatch, captured_device_id')
            .in('id', ids),
          supabaseClient
            .from('quote_workflow')
            .select('quote_id, contact_method, quote_business_type, existing_client_reason, first_yes_ready_now, second_yes_id_vin, third_yes_payment_ready, payment_method, first_yes_recorded_at, second_yes_recorded_at, third_yes_recorded_at, outcome, follow_up_needed, follow_up_at, agent_notes, not_closed_explanation, lost_deal_manager_name, lost_deal_broker_fee')
            .in('quote_id', ids),
          fetchQuoteEventsForIds(ids),
          supabaseClient
            .from('quote_internal_notes')
            .select('id, quote_id, note_text, author_email, author_name, author_role, note_source, created_at')
            .in('quote_id', ids)
            .order('created_at', { ascending: false }),
          supabaseClient
            .from('quote_deal_save_requests')
            .select('id, quote_id, customer_name, office, requested_by_email, requested_by_name, requested_by_role, current_broker_fee, premium, status, created_at, updated_at')
            .in('quote_id', ids)
            .order('created_at', { ascending: false }),
        ]);

        if (quoteResult.error) console.error('[AgentQuoteLog] quote detail query failed:', quoteResult.error);
        else supplementalRows.push(...(quoteResult.data || []));
        if (workflowResult.error) console.error('[AgentQuoteLog] workflow query failed:', workflowResult.error);
        else workflowRows.push(...(workflowResult.data || []));
        if (eventResult.error) console.error('[AgentQuoteLog] event query failed:', eventResult.error);
        else eventRows.push(...(eventResult.data || []));
        if (noteResult.error) console.error('[AgentQuoteLog] internal notes query failed:', noteResult.error);
        else noteRows.push(...(noteResult.data || []));
        if (dealSaveResult.error) console.error('[AgentQuoteLog] Deal Save query failed:', dealSaveResult.error);
        else dealSaveRows.push(...(dealSaveResult.data || []));

      }

      if (requestId !== fetchRequestRef.current) return;

      const policyBoundByQuoteId = new Map();
      eventRows.forEach((event) => {
        if (String(event?.event_type || '').toUpperCase() !== 'POLICY_BOUND') return;
        const existing = policyBoundByQuoteId.get(event.quote_id);
        const eventAt = event.event_at || event.created_at || null;
        if (!existing || new Date(eventAt || 0).getTime() > new Date(existing || 0).getTime()) {
          policyBoundByQuoteId.set(event.quote_id, eventAt);
        }
      });

      const latestInternalNoteByQuoteId = new Map();
      noteRows.forEach((note) => {
        if (!note?.quote_id) return;
        const existing = latestInternalNoteByQuoteId.get(note.quote_id);
        const noteAt = new Date(note.created_at || 0).getTime();
        const existingAt = new Date(existing?.created_at || 0).getTime();
        if (!existing || noteAt > existingAt) latestInternalNoteByQuoteId.set(note.quote_id, note);
      });

      const latestDealSaveByQuoteId = new Map();
      dealSaveRows.forEach((request) => {
        if (!request?.quote_id) return;
        const existing = latestDealSaveByQuoteId.get(request.quote_id);
        const requestAt = new Date(request.updated_at || request.created_at || 0).getTime();
        const existingAt = new Date(existing?.updated_at || existing?.created_at || 0).getTime();
        if (!existing || requestAt > existingAt) latestDealSaveByQuoteId.set(request.quote_id, request);
      });

      const merged = mergeRows(baseRows, supplementalRows, workflowRows)
        .map((row) => {
          const policyBoundAt = policyBoundByQuoteId.get(row.id) || null;
          const latestInternalNote = latestInternalNoteByQuoteId.get(row.id) || null;
          return {
            ...row,
            policy_bound_detected: Boolean(policyBoundAt),
            policy_bound_at: policyBoundAt,
            latest_internal_note: latestInternalNote?.note_text || null,
            latest_internal_note_at: latestInternalNote?.created_at || null,
            latest_deal_save_request: latestDealSaveByQuoteId.get(row.id) || null,
            access_scope: quoteOwnedByAgent(row, agentEmail, agentNames)
              ? 'owned'
              : allowedOffices.includes(normalizeOffice(row.office))
                ? 'office'
                : quoteActivelyWorkedByAgent(row, agentEmail, agentNames)
                  ? 'worked'
                  : 'none',
          };
        })
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
    if (
      activeTab === 'office' &&
      officeDeviceVerification.verified &&
      officeDeviceVerification.officeLogAccess
    ) {
      fetchQuotes({ quiet: true });
    }
  }, [
    activeTab,
    officeDeviceVerification.verified,
    officeDeviceVerification.officeLogAccess,
    officeDeviceVerification.office,
    fetchQuotes,
  ]);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_deal_save_requests' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabaseClient.removeChannel(channel);
    };
  }, [supabaseClient, agentEmail, fetchQuotes]);

  const groups = useMemo(() => groupQuotes(quotes, now), [quotes, now]);

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
        group.agentName,
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

  const officeBuckets = useMemo(() => {
    const buckets = { attention: [], quotes: [], follow_up: [], closed: [] };
    officeGroups.forEach((group) => {
      const primary = group.classification?.primary;
      if (primary === QUOTE_PRIMARY_BUCKETS.ATTENTION) buckets.attention.push(group);
      else if (primary === QUOTE_PRIMARY_BUCKETS.FOLLOW_UP) buckets.follow_up.push(group);
      else if (primary === QUOTE_PRIMARY_BUCKETS.CLOSED) buckets.closed.push(group);
      else buckets.quotes.push(group);
    });
    return buckets;
  }, [officeGroups]);

  const officeBoardGroups = useMemo(() => {
    const nowDate = new Date(now);
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const withinTime = (group) => {
      const stamp = new Date(group.lastActivityAt || 0).getTime();
      if (!Number.isFinite(stamp)) return false;
      if (officeTimeFilter === 'today') return stamp >= todayStart;
      if (officeTimeFilter === 'week') return stamp >= weekStart.getTime();
      return true;
    };

    const attentionPriority = (group) => {
      const title = clean(group.classification?.attention?.title).toLowerCase();
      if (group.yesStage >= 3 || title.includes('3rd yes') || title.includes('third yes')) return 0;
      if (group.yesStage >= 2 || title.includes('2nd yes') || title.includes('second yes')) return 1;
      if (title.includes('lost') || title.includes('walk')) return 2;
      if (title.includes('carrier') || title.includes('bridge')) return 3;
      if (title.includes('stale')) return 4;
      return 5;
    };

    const source =
      officeStatusFilter === 'all'
        ? officeGroups
        : officeBuckets[officeStatusFilter] || [];

    return source
      .filter(withinTime)
      .sort((a, b) => {
        if (officeStatusFilter === 'attention' || officeStatusFilter === 'all') {
          const aAttention = a.classification?.primary === QUOTE_PRIMARY_BUCKETS.ATTENTION;
          const bAttention = b.classification?.primary === QUOTE_PRIMARY_BUCKETS.ATTENTION;
          if (aAttention !== bAttention) return aAttention ? -1 : 1;
          if (aAttention && bAttention) {
            const priorityDiff = attentionPriority(a) - attentionPriority(b);
            if (priorityDiff) return priorityDiff;
          }
        }
        return new Date(b.lastActivityAt || 0).getTime() - new Date(a.lastActivityAt || 0).getTime();
      });
  }, [officeGroups, officeBuckets, officeStatusFilter, officeTimeFilter, now]);

  const liveGroups = useMemo(
    () => filteredGroups.filter((group) =>
      sharedIsGroupLive(group, { now, staleAfterMs: STALE_AFTER_MS })
    ),
    [filteredGroups, now]
  );

  const officeVerificationIsCurrent = useMemo(() => {
    if (!officeDeviceVerification.verified || !officeDeviceVerification.officeLogAccess) {
      return false;
    }

    const expiresAt = officeDeviceVerification.expiresAt
      ? new Date(officeDeviceVerification.expiresAt).getTime()
      : null;

    return !expiresAt || !Number.isFinite(expiresAt) || expiresAt > now;
  }, [
    officeDeviceVerification.verified,
    officeDeviceVerification.officeLogAccess,
    officeDeviceVerification.expiresAt,
    now,
  ]);

  const followUpSourceGroups = useMemo(() => {
    const byKey = new Map();

    ownedGroups.forEach((group) => byKey.set(group.key, group));

    if (officeVerificationIsCurrent) {
      officeGroups.forEach((group) => byKey.set(group.key, group));
    }

    return [...byKey.values()];
  }, [ownedGroups, officeGroups, officeVerificationIsCurrent]);

  const calendarFollowUpGroups = useMemo(
    () => followUpSourceGroups
      .filter((group) => sharedIsGroupFollowUp(group, { now, staleAfterMs: STALE_AFTER_MS }))
      .filter((group) => {
        const followUpAt = groupFollowUpAt(group);
        return followUpAt && monthValue(new Date(followUpAt)) === month;
      })
      .sort((a, b) => new Date(groupFollowUpAt(a) || 0) - new Date(groupFollowUpAt(b) || 0)),
    [followUpSourceGroups, month, now]
  );

  const followUpGroups = useMemo(
    () => selectedFollowUpDay
      ? calendarFollowUpGroups.filter((group) => localDateKey(groupFollowUpAt(group)) === selectedFollowUpDay)
      : calendarFollowUpGroups,
    [calendarFollowUpGroups, selectedFollowUpDay]
  );

  const closedGroups = useMemo(
    () => ownedGroups.filter((group) =>
      sharedIsGroupClosed(group, { now, staleAfterMs: STALE_AFTER_MS })
    ),
    [ownedGroups, now]
  );

  const attentionGroups = useMemo(
    () => ownedGroups.filter((group) => group.classification?.primary === QUOTE_PRIMARY_BUCKETS.ATTENTION),
    [ownedGroups]
  );

  const quoteGroups = useMemo(
    () => ownedGroups.filter((group) =>
      !sharedIsGroupLive(group, { now, staleAfterMs: STALE_AFTER_MS }) &&
      sharedIsGroupRegularQuote(group, { now, staleAfterMs: STALE_AFTER_MS })
    ),
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

  const selectedWorkflowGroup = useMemo(() => {
    if (!selectedGroup) return null;
    const targetQuote = workflowTargetQuoteForGroup(selectedGroup);
    if (!targetQuote?.id || selectedGroup.quotes?.[0]?.id === targetQuote.id) return selectedGroup;
    return {
      ...selectedGroup,
      latest: targetQuote,
      quotes: [targetQuote, ...selectedGroup.quotes.filter((quote) => quote.id !== targetQuote.id)],
    };
  }, [selectedGroup]);

  const workflowGroup = selectedWorkflowGroup || (activeTab === 'live' ? activeLiveGroup : null);


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

  const closedCount = closedGroups.length;
  const resolvedBase = quoteGroups.length + attentionGroups.length + followUpGroups.length + closedGroups.length;
  const closeRate = resolvedBase ? Math.round((closedCount / resolvedBase) * 100) : 0;

  const tabGroups = activeTab === 'office'
    ? officeBoardGroups
    : activeTab === 'attention'
      ? attentionGroups
      : activeTab === 'follow_up'
        ? followUpGroups
        : activeTab === 'closed'
          ? closedGroups
          : quoteGroups;

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
        <StatCard label="My Quotes This Month" value={quoteGroups.length} />
        <StatCard label="Follow-Ups" value={followUpGroups.length} tone="follow" />
        <StatCard label="Closed" value={closedCount} tone="closed" />
        <StatCard label="Close Rate" value={`${closeRate}%`} />
      </section>

      <nav className={styles.tabs}>
        <TabButton active={activeTab === 'live'} onClick={() => { setActiveTab('live'); setSelectedGroupKey(''); }} label="Live Session" count={liveGroups.length} />
        <TabButton active={activeTab === 'quotes'} onClick={() => { setActiveTab('quotes'); setSelectedGroupKey(''); }} label="My Quotes" count={quoteGroups.length} />
        <TabButton active={activeTab === 'attention'} onClick={() => { setActiveTab('attention'); setSelectedGroupKey(''); }} label="Needs Attention" count={attentionGroups.length} />
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

      {activeTab === 'office' && (
        <OfficeQuoteDeviceGate
          verification={officeDeviceVerification}
          officeAccess={officeAccess}
          onRetry={() => verifyOfficeQuoteDevice()}
        />
      )}

      {activeTab === 'office' &&
        officeDeviceVerification.verified &&
        officeDeviceVerification.officeLogAccess && (
          <section className={styles.officeBoardControls}>
            <div className={styles.officeStatusFilters}>
              {[
                ['attention', 'Needs Attention', officeBuckets.attention.length],
                ['quotes', 'Quotes', officeBuckets.quotes.length],
                ['follow_up', 'Follow-Ups', officeBuckets.follow_up.length],
                ['closed', 'Closed', officeBuckets.closed.length],
                ['all', 'All', officeGroups.length],
              ].map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.officeFilterChip} ${officeStatusFilter === key ? styles.officeFilterChipActive : ''}`}
                  onClick={() => setOfficeStatusFilter(key)}
                >
                  <span>{label}</span>
                  <strong>{count}</strong>
                </button>
              ))}
            </div>
            <div className={styles.officeTimeFilters}>
              {[
                ['today', 'Today'],
                ['week', 'This Week'],
                ['month', 'This Month'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.officeTimeButton} ${officeTimeFilter === key ? styles.officeTimeButtonActive : ''}`}
                  onClick={() => setOfficeTimeFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
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
                <strong>{activeTab === 'quotes' ? 'My Quotes' : activeTab === 'attention' ? 'Needs Attention' : activeTab === 'office' ? 'Current Office Quotes' : activeTab === 'follow_up' ? (selectedFollowUpDay ? `Follow-Ups · ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${selectedFollowUpDay}T12:00:00`))}` : 'My Follow-Ups') : 'My Closed Deals'}</strong>
              </div>
              <small>{
                activeTab === 'office'
                  ? 'Shared office opportunities, organized by action needed. Ownership stays with the originating agent.'
                  : activeTab === 'follow_up'
                    ? 'Your follow-ups are always shown. Verified shared-office follow-ups are included while Office Quotes access is active.'
                    : 'My Quotes are owned by the agent who originally created that Matrix quote.'
              }</small>
            </div>
            <div className={styles.filters}>
              <input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setSelectedFollowUpDay(''); }} />
              <input type="search" placeholder="Search customer, carrier, quote…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>

          {activeTab === 'office' && !officeDeviceVerification.verified ? (
            <EmptyState
              title="Office Quotes locked"
              detail="This tab requires Passive Quote Capture v0.11.8 on an approved Fiesta office computer."
            />
          ) : activeTab === 'office' && !officeDeviceVerification.officeLogAccess ? (
            <EmptyState
              title="Office access not enabled"
              detail="This computer is approved, but a supervisor must enable Office Log Access for this device."
            />
          ) : loading && groups.length === 0 ? (
            <div className={styles.loading}>Loading your quotes…</div>
          ) : tabGroups.length === 0 ? (
            <EmptyState
              title={activeTab === 'office' ? 'No office quotes match these filters' : 'Nothing here yet'}
              detail={activeTab === 'office' ? 'Try another status or time range.' : 'Quotes matching this view will appear here automatically.'}
            />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>{activeTab === 'office' ? 'Agent' : 'Office'}</th>
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
                      <td>{activeTab === 'office' ? group.agentName : group.office}</td>
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
                {selectedGroup.quotes.some((quote) => quote.access_scope === 'office') && (
                  <OfficeQuickOutcome
                    group={selectedGroup}
                    supabaseClient={supabaseClient}
                    profile={profile}
                    onSaved={async () => {
                      await fetchQuotes({ quiet: true });
                      setSelectedGroupKey('');
                    }}
                  />
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}



function OfficeQuickOutcome({ group, supabaseClient, profile, onSaved }) {
  const quote = workflowTargetQuoteForGroup(group) || {};
  const [outcome, setOutcome] = useState('');
  const [explanation, setExplanation] = useState('');
  const [managerName, setManagerName] = useState('');
  const [brokerFee, setBrokerFee] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setOutcome('');
    setExplanation('');
    setManagerName('');
    setBrokerFee('');
    setMessage('');
  }, [quote?.id]);

  const saveOutcome = async () => {
    if (!supabaseClient || !quote?.id || !outcome) return;

    if ((outcome === 'lost_deal' || outcome === 'walk') && !explanation.trim()) {
      setMessage('Add a short explanation of what happened.');
      return;
    }

    if (outcome === 'lost_deal') {
      if (!managerName.trim()) {
        setMessage('Enter the manager who approved the lower broker fee.');
        return;
      }
      const fee = Number(brokerFee);
      if (!Number.isFinite(fee) || fee < 0) {
        setMessage('Enter the broker fee the deal was lost at.');
        return;
      }
    }

    setSaving(true);
    setMessage('');

    const savedAt = new Date().toISOString();
    const currentWorkflow = quote || {};

    const payload = {
      quote_id: quote.id,
      quote_reason: currentWorkflow.quote_reason || null,
      outcome: outcome === 'closed' ? 'sold' : outcome,
      follow_up_needed: false,
      follow_up_at: null,
      completed_by_email: profile?.email || null,
      contact_method: currentWorkflow.contact_method || null,
      quote_business_type: currentWorkflow.quote_business_type || group?.businessType || 'new_business',
      existing_client_reason:
        currentWorkflow.existing_client_reason || group?.existingClientReason || null,
      not_closed_type: outcome === 'closed' ? null : outcome,
      not_closed_explanation: outcome === 'closed' ? null : explanation.trim(),
      lost_deal_manager_name: outcome === 'lost_deal' ? managerName.trim() : null,
      lost_deal_broker_fee: outcome === 'lost_deal' ? Number(brokerFee) : null,
      first_yes_ready_now: currentWorkflow.first_yes_ready_now ?? null,
      second_yes_id_vin: currentWorkflow.second_yes_id_vin ?? null,
      third_yes_payment_ready: currentWorkflow.third_yes_payment_ready ?? null,
      payment_method: currentWorkflow.payment_method || null,
      first_yes_recorded_at: currentWorkflow.first_yes_recorded_at || null,
      second_yes_recorded_at: currentWorkflow.second_yes_recorded_at || null,
      third_yes_recorded_at: currentWorkflow.third_yes_recorded_at || null,
      agent_notes: currentWorkflow.agent_notes || null,
      updated_at: savedAt,
    };

    const { error: workflowError } = await supabaseClient
      .from('quote_workflow')
      .upsert(payload, { onConflict: 'quote_id' });

    if (workflowError) {
      setSaving(false);
      setMessage(`Save failed: ${workflowError.message}`);
      return;
    }

    const authorName =
      clean(profile?.csr_name) ||
      clean(profile?.turborater_agent_name) ||
      clean(profile?.full_name) ||
      clean(profile?.email) ||
      'Agent';

    const outcomeLabel =
      outcome === 'closed' ? 'Closed' : outcome === 'lost_deal' ? 'Lost Deal' : 'Walk';

    const noteParts = [
      `Office Quote final outcome recorded: ${outcomeLabel}`,
      `Customer: ${group?.customerName || quote.customer_name || 'Unknown'}`,
      `Quote: ${quote.matrix_quote_id || '—'}`,
      ...(explanation.trim() ? [`Explanation: ${explanation.trim()}`] : []),
      ...(outcome === 'lost_deal'
        ? [`Manager approval: ${managerName.trim()}`, `BF lost at: $${Number(brokerFee).toFixed(2)}`]
        : []),
    ];

    const { error: noteError } = await supabaseClient
      .from('quote_internal_notes')
      .insert({
        quote_id: quote.id,
        note_text: noteParts.join(' · '),
        author_email: profile?.email || null,
        author_name: authorName,
        author_role: clean(profile?.role) || 'agent',
        note_source: 'agent_office_quote_outcome',
      });

    setSaving(false);

    if (noteError) {
      setMessage(`Outcome saved, but history note failed: ${noteError.message}`);
      if (onSaved) await onSaved();
      return;
    }

    setMessage(`${outcomeLabel} saved.`);
    if (onSaved) await onSaved();
  };

  return (
    <section className={styles.officeOutcomeCard}>
      <div className={styles.officeOutcomeHeading}>
        <div>
          <span>OFFICE QUOTE FINAL OUTCOME</span>
          <strong>Already know how this quote ended?</strong>
          <p>
            Use this when the quote was already closed or fully lost and you are only recording the final disposition.
            This does not require re-entering the 3 Yes process.
          </p>
        </div>
      </div>

      <div className={styles.officeOutcomeButtons}>
        <button
          type="button"
          className={`${styles.officeOutcomeButton} ${outcome === 'closed' ? styles.officeOutcomeClosed : ''}`}
          onClick={() => {
            setOutcome('closed');
            setExplanation('');
            setManagerName('');
            setBrokerFee('');
            setMessage('');
          }}
        >
          ✓ Closed
        </button>
        <button
          type="button"
          className={`${styles.officeOutcomeButton} ${outcome === 'lost_deal' ? styles.officeOutcomeLost : ''}`}
          onClick={() => {
            setOutcome('lost_deal');
            setMessage('');
          }}
        >
          Lost Deal
        </button>
        <button
          type="button"
          className={`${styles.officeOutcomeButton} ${outcome === 'walk' ? styles.officeOutcomeWalk : ''}`}
          onClick={() => {
            setOutcome('walk');
            setManagerName('');
            setBrokerFee('');
            setMessage('');
          }}
        >
          Walk
        </button>
      </div>

      {(outcome === 'lost_deal' || outcome === 'walk') && (
        <div className={styles.officeOutcomeForm}>
          {outcome === 'lost_deal' && (
            <div className={styles.officeOutcomeGrid}>
              <label>
                <span>Manager Who Approved Lower BF</span>
                <input
                  type="text"
                  value={managerName}
                  onChange={(event) => setManagerName(event.target.value)}
                  placeholder="Manager name"
                />
              </label>
              <label>
                <span>Broker Fee Deal Was Lost At</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={brokerFee}
                  onChange={(event) => setBrokerFee(event.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>
          )}

          <label>
            <span>Required Explanation</span>
            <textarea
              rows={3}
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              placeholder={
                outcome === 'lost_deal'
                  ? 'What happened after the lower broker fee was approved?'
                  : 'Why did the customer walk / not close?'
              }
            />
          </label>
        </div>
      )}

      {outcome && (
        <div className={styles.officeOutcomeFooter}>
          {message && <span className={styles.officeOutcomeMessage}>{message}</span>}
          <button
            type="button"
            className={styles.officeOutcomeSave}
            disabled={saving}
            onClick={saveOutcome}
          >
            {saving ? 'Saving…' : `Save ${outcome === 'closed' ? 'Closed' : outcome === 'lost_deal' ? 'Lost Deal' : 'Walk'} Outcome`}
          </button>
        </div>
      )}
    </section>
  );
}

function OfficeQuoteDeviceGate({ verification, officeAccess, onRetry }) {
  const verified = Boolean(verification?.verified);
  const officeLogAccess = Boolean(verification?.officeLogAccess);
  const activeOffices = [...new Set(
    (officeAccess || [])
      .map((row) => normalizeOffice(row.office))
      .filter((office) => office && office !== 'Unknown')
  )];

  const stateLabel =
    verification?.state === 'checking'
      ? 'Checking extension…'
      : verified && officeLogAccess
        ? 'Office access verified'
        : verified
          ? 'Computer verified'
          : 'Office Quotes locked';

  return (
    <section
      className={`${styles.officeVerifyCard} ${
        verified && officeLogAccess
          ? styles.officeVerifyCardActive
          : verified
            ? styles.officeVerifyCardWarning
            : styles.officeVerifyCardLocked
      }`}
    >
      <div className={styles.officeVerifyDot} aria-hidden="true" />

      <div className={styles.officeVerifyCopy}>
        <span className={styles.officeVerifyEyebrow}>OFFICE QUOTES SECURITY</span>
        <strong>{stateLabel}</strong>
        <p>
          {verification?.state === 'checking'
            ? 'Verifying Passive Quote Capture v0.11.8 on this computer…'
            : verified && officeLogAccess
              ? `${verification.deviceName}${verification.office ? ` · ${verification.office}` : ''}. Verification refreshes automatically while this tab is open.${activeOffices.length ? ` Active office access: ${activeOffices.join(', ')}.` : ''}`
              : verified
                ? `${verification.deviceName}${verification.office ? ` · ${verification.office}` : ''} is approved, but shared Office Quotes have not been enabled for this device.`
                : verification?.message ||
                  'Office Quotes requires an approved Fiesta computer running Passive Quote Capture v0.11.8.'}
        </p>
      </div>

      <div className={styles.officeVerifyActions}>
        <span className={styles.officeVerifyStatus}>
          {verified && officeLogAccess ? 'Verified' : verified ? 'Approval needed' : 'Locked'}
        </span>
        {verification?.state !== 'checking' && !(verified && officeLogAccess) && (
          <button type="button" className={styles.officeVerifyButton} onClick={onRetry}>
            Verify Again
          </button>
        )}
      </div>
    </section>
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
          <small>{monthLabel} · Your follow-ups are shown, plus shared-office follow-ups when this computer has verified Office Quotes access.</small>
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
          <DetailField label="Matrix Quote ID" value={latest.matrix_quote_id || '—'} />
          <DetailField label="Rater ID" value={latest.rater_id || '—'} />
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
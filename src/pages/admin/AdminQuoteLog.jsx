// src/pages/admin/AdminQuoteLog.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../AuthContext';
import styles from './AdminQuoteLog.module.css';

const STALE_AFTER_MS = 60 * 60 * 1000;

const NOT_CLOSED_REASONS = [
  ['lost_deal', 'Lost Deal'],
  ['walk', 'Walk'],
];

const EXISTING_CLIENT_NOT_CLOSED_REASONS = [
  ['did_not_rw_stayed_current_carrier', 'Did Not RW - Stayed With Current Carrier'],
];

const LEGACY_NOT_CLOSED_REASONS = [
  ['driving_record_price_increase', 'Driving Record Increased Price'],
  ['underwriting_carrier_decline', 'Underwriting / Carrier Will Not Accept'],
  ['down_payment_over_budget', 'Down Payment Higher Than Customer Has'],
  ['cannot_beat_current_monthly', 'Cannot Beat Current Monthly Payment'],
  ['overall_price_too_high', 'Overall Price Too High'],
  ['price_changed_after_rating', 'Price Changed After Rating / Bridging'],
  ['coverage_price_too_high', 'Coverage Needed Makes Price Too High'],
  ['no_competitive_market', 'No Competitive Carrier / Market Available'],
  ['customer_shopping', 'Customer Wants to Shop / Compare'],
  ['needs_time_decision_maker', 'Customer Needs More Time / Decision Maker'],
  ['no_better_price', 'No Better Price'],
  ['customer_declined', 'Customer Declined'],
  ['existing_policy_retained', 'Existing Policy / Endorsement Was Better'],
  ['not_eligible', 'Uninsurable / Not Eligible'],
  ['other', 'Other'],
];

const ALL_NOT_CLOSED_REASONS = [
  ...NOT_CLOSED_REASONS,
  ...EXISTING_CLIENT_NOT_CLOSED_REASONS,
  ...LEGACY_NOT_CLOSED_REASONS,
];

const QUOTE_BUSINESS_TYPES = [
  ['new_business', 'New Quote'],
  ['existing_client', 'Existing Client / Re-Write'],
];

const EXISTING_CLIENT_REASONS = [
  ['payment', 'Payment'],
  ['rewrite_endorsement', 'Endorsement Comparison'],
  ['renewal', 'Renewal'],
  ['reinstatement', 'Reinstatement'],
  ['rewrite_recent_policy', 'Re-Write - Policy Within Last 6 Months'],
];

const PAYMENT_METHODS = [
  ['cash', 'Cash'],
  ['card', 'Card'],
  ['neither', 'Neither / Not Ready to Pay'],
];

const TABS = [
  ['live', 'Live Activity'],
  ['attention', 'Needs Attention'],
  ['quotes', 'Quotes'],
  ['closed', 'Closed Deals'],
  ['devices', 'Trusted Devices'],
];


function cleanStr(value) {
  return String(value ?? '').replace(/\r/g, '').trim();
}

function normalizeOffice(officeRaw = '') {
  const match = String(officeRaw || '').match(/CA\d{3}/i);
  return match ? match[0].toUpperCase() : cleanStr(officeRaw) || 'Unknown';
}

function getOfficeNumber(office = '') {
  const match = String(office).match(/CA(\d{3})/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function monthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthBounds(value) {
  const [year, month] = value.split('-').map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function dateValue(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function rangeBounds(mode, selectedDate, selectedMonth) {
  if (mode === 'month') return monthBounds(selectedMonth);

  const anchor = parseLocalDate(selectedDate);
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);

  if (mode === 'week') {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  }

  const end = new Date(start);
  end.setDate(end.getDate() + (mode === 'week' ? 7 : 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function shiftRange(mode, selectedDate, selectedMonth, direction) {
  if (mode === 'month') {
    const [year, month] = selectedMonth.split('-').map(Number);
    return { month: monthValue(new Date(year, month - 1 + direction, 1)), date: selectedDate };
  }

  const d = parseLocalDate(selectedDate);
  d.setDate(d.getDate() + direction * (mode === 'week' ? 7 : 1));
  return { month: monthValue(d), date: dateValue(d) };
}

function rangeLabel(mode, selectedDate, selectedMonth) {
  if (mode === 'month') {
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
      .format(new Date(year, month - 1, 1));
  }

  const { start, end } = rangeBounds(mode, selectedDate, selectedMonth);
  const startDate = new Date(start);
  if (mode === 'day') {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(startDate);
  }
  const endDate = new Date(new Date(end).getTime() - 1);
  const left = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(startDate);
  const right = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(endDate);
  return `${left} – ${right}`;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n);
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function elapsedLabel(value, now = Date.now()) {
  if (!value) return '—';
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return '—';
  const ms = Math.max(0, now - t);
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function getDisplayStatus(quote, now = Date.now()) {
  if (quote?.status === 'bridged_back' || quote?.bridged_back_at) return 'completed';

  if (quote?.status === 'in_progress') {
    const started = new Date(quote.started_at).getTime();
    if (Number.isFinite(started) && now - started >= STALE_AFTER_MS) return 'stale';
    return 'in_progress';
  }

  return quote?.status || 'unknown';
}

function latestTimestamp(q) {
  return new Date(
    q.updated_at || q.bridged_back_at || q.started_at || q.created_at || 0
  ).getTime();
}

function reasonLabel(outcome) {
  return (
    ALL_NOT_CLOSED_REASONS.find(([value]) => value === outcome)?.[1] ||
    (outcome === 'sold'
      ? 'Closed'
      : outcome === 'follow_up'
        ? 'Follow Up'
        : '—')
  );
}

function toDatetimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}


function inferQuoteBusinessType(quote) {
  const explicit = cleanStr(quote?.quote_business_type).toLowerCase();
  if (explicit === 'new_business' || explicit === 'existing_client') return explicit;

  const source = cleanStr(quote?.lead_source).toLowerCase();
  if (/re[- ]?write|rewrite|renew|reinstat|endorsement|existing/.test(source)) {
    return 'existing_client';
  }
  return 'new_business';
}

function quoteBusinessTypeLabel(quote) {
  return inferQuoteBusinessType(quote) === 'existing_client'
    ? 'Existing Client / Re-Write'
    : 'New Quote';
}

function inferExistingClientReason(quote) {
  const explicit = cleanStr(quote?.existing_client_reason).toLowerCase();
  if (EXISTING_CLIENT_REASONS.some(([value]) => value === explicit)) return explicit;

  const source = cleanStr(quote?.lead_source).toLowerCase();
  if (/payment/.test(source)) return 'payment';
  if (/endorsement/.test(source)) return 'rewrite_endorsement';
  if (/renewal/.test(source)) return 'renewal';
  if (/reinstat/.test(source)) return 'reinstatement';
  if (/re[- ]?write|rewrite|prior policy|previous policy/.test(source)) return 'rewrite_recent_policy';

  return '';
}

function existingClientReasonLabel(quote) {
  const reason = inferExistingClientReason(quote);
  return EXISTING_CLIENT_REASONS.find(([value]) => value === reason)?.[1] || 'Existing Client / Re-Write';
}

function hasLicenseSignal(quote) {
  return Boolean(quote?.any_license_entered || Number(quote?.drivers_with_license || 0) > 0);
}

function hasFullVinSignal(quote) {
  return Boolean(quote?.any_full_vin_entered || Number(quote?.vehicles_with_full_vin || 0) > 0);
}

function firstYesConfirmed(quote) {
  return quote?.first_yes_ready_now === true;
}

function secondYesConfirmed(quote) {
  if (quote?.second_yes_id_vin === true) return true;
  if (quote?.second_yes_id_vin === false) return false;
  return hasLicenseSignal(quote) && hasFullVinSignal(quote);
}

function thirdYesConfirmed(quote) {
  if (quote?.third_yes_payment_ready === true) return true;
  if (quote?.third_yes_payment_ready === false) return false;

  const payment = cleanStr(quote?.payment_method).toLowerCase();
  if (payment === 'cash' || payment === 'card') return true;

  // Until the agent quote page records the payment question directly,
  // a completed carrier bridge after the 2nd Yes is a strong 3rd-Yes fallback.
  return secondYesConfirmed(quote) && Boolean(
    quote?.bridged_back_at ||
    quote?.status === 'bridged_back' ||
    quote?.carrier
  );
}

function threeYesStage(quote) {
  if (thirdYesConfirmed(quote)) return 3;
  if (secondYesConfirmed(quote)) return 2;
  if (firstYesConfirmed(quote)) return 1;
  return 0;
}

function threeYesEvidenceLabel(quote) {
  const drivers = Number(quote?.driver_count || 0);
  const licensed = Number(quote?.drivers_with_license || 0);
  const vehicles = Number(quote?.vehicle_count || 0);
  const fullVins = Number(quote?.vehicles_with_full_vin || 0);
  const payment = cleanStr(quote?.payment_method);
  const stage = threeYesStage(quote);

  if (stage === 3) {
    return payment
      ? `Payment ready: ${payment === 'cash' ? 'Cash' : payment === 'card' ? 'Card' : payment}`
      : 'Carrier bridge detected after ID/license + VIN';
  }
  if (stage === 2) return `${licensed}/${drivers || 0} licenses · ${fullVins}/${vehicles || 0} full VINs`;
  if (stage === 1) return 'Customer confirmed they are ready to start if the price works';
  return 'Regular quote';
}

function quoteStage(quote) {
  const stage = threeYesStage(quote);
  if (stage === 3) return { label: '3rd Yes', tone: 'third', stage };
  if (stage === 2) return { label: '2nd Yes', tone: 'second', stage };
  if (stage === 1) return { label: '1st Yes', tone: 'first', stage };
  if (Number(quote?.driver_count || 0) > 0 || Number(quote?.vehicle_count || 0) > 0) {
    return { label: 'Quote', tone: 'active', stage: 0 };
  }
  return { label: 'Early Quote', tone: 'early', stage: 0 };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function currentQuoteForGroup(group) {
  return group?.quotes?.[0] || {};
}

function latestGroupNote(group) {
  const notes = safeArray(group?.quotes)
    .map((quote) => ({
      text: cleanStr(quote?.latest_internal_note || quote?.agent_notes || quote?.captured_note),
      at: quote?.latest_internal_note_at || quote?.updated_at || quote?.bridged_back_at || quote?.started_at || quote?.created_at || null,
    }))
    .filter((note) => note.text)
    .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());

  return notes[0] || null;
}

function groupFollowUpAt(group) {
  const followUps = safeArray(group?.quotes)
    .map((quote) => quote?.follow_up_at || null)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return group?.outcome?.followUpAt || followUps[0] || null;
}

function briefText(value, max = 92) {
  const text = cleanStr(value);
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function isGroupClosed(group) {
  return group?.outcome?.status === 'closed';
}

function isGroupLive(group) {
  // A workflow disposition is authoritative. As soon as an agent/admin/supervisor
  // records Not Closed, Follow Up, or Closed, the customer leaves Live Activity
  // even if the raw TurboRater quote row is still technically "in_progress".
  return Number(group?.inProgressCount || 0) > 0 && group?.outcome?.status === 'open';
}

function isDidNotRewriteGroup(group) {
  if (group?.outcome?.status !== 'not_closed') return false;
  const outcome = cleanStr(group?.outcome?.source?.outcome).toLowerCase();
  return (
    outcome === 'did_not_rw_stayed_current_carrier' ||
    outcome === 'did_not_rewrite_current_carrier'
  );
}


function parseEventIndex(eventType, prefix) {
  if (!String(eventType || '').startsWith(prefix)) return null;
  const value = Number(String(eventType).slice(prefix.length));
  return Number.isFinite(value) ? value : null;
}

function reconcileTimelineEvents(quote, events = []) {
  const validDriverIndexes = new Set(
    safeArray(quote?.drivers_summary)
      .filter((row) => row?.licenseEntered)
      .map((row) => Number(row.index))
      .filter(Number.isFinite)
  );

  const validVehicleIndexes = new Set(
    safeArray(quote?.vehicles_summary)
      .filter((row) => row?.fullVinEntered)
      .map((row) => Number(row.index))
      .filter(Number.isFinite)
  );

  return [...events]
    .filter((event) => {
      const type = String(event?.event_type || '');
      const driverIndex = parseEventIndex(type, 'LICENSE_ENTERED_DRIVER_');
      if (driverIndex !== null) return validDriverIndexes.has(driverIndex);

      const vehicleIndex = parseEventIndex(type, 'FULL_VIN_ENTERED_VEHICLE_');
      if (vehicleIndex !== null) return validVehicleIndexes.has(vehicleIndex);

      if (type === 'FIRST_LICENSE_ENTERED') return Boolean(quote?.any_license_entered);
      if (type === 'FIRST_FULL_VIN_ENTERED') return Boolean(quote?.any_full_vin_entered);
      if (type === 'HIGH_INTENT_DETECTED') return hasLicenseSignal(quote) || hasFullVinSignal(quote);
      return true;
    })
    .sort((a, b) => new Date(a.event_at || 0) - new Date(b.event_at || 0));
}

function eventDisplay(event) {
  const type = String(event?.event_type || '');
  const metadata = event?.metadata || {};

  if (type === 'QUOTE_STARTED') return 'Quote started';
  if (type === 'FIRST_LICENSE_ENTERED') return 'Driver license detected';
  if (type === 'FIRST_FULL_VIN_ENTERED') return 'Full 17-character VIN detected';
  if (type === 'HIGH_INTENT_DETECTED') return 'ID / VIN intent signal detected';
  if (type === 'BRIDGE_BACK') return metadata.carrier ? `Bridge Back · ${metadata.carrier}` : 'Bridge Back completed';
  if (type === 'POLICY_BOUND') return 'Policy bound / closed';

  const driverIndex = parseEventIndex(type, 'LICENSE_ENTERED_DRIVER_');
  if (driverIndex !== null) return `Driver ${driverIndex} license entered`;

  const vehicleIndex = parseEventIndex(type, 'FULL_VIN_ENTERED_VEHICLE_');
  if (vehicleIndex !== null) {
    const vehicle = [metadata.year, metadata.make, metadata.model].filter(Boolean).join(' ');
    return vehicle ? `Vehicle ${vehicleIndex} full VIN · ${vehicle}` : `Vehicle ${vehicleIndex} full VIN entered`;
  }

  return event?.event_label || type.replaceAll('_', ' ');
}

function customerOutcomeFromQuotes(quotes) {
  const sorted = [...quotes].sort((a, b) => latestTimestamp(b) - latestTimestamp(a));
  const latest = sorted[0] || null;
  const completed = sorted.filter((q) => getDisplayStatus(q) === 'completed');
  const notClosedValues = new Set(ALL_NOT_CLOSED_REASONS.map(([value]) => value));

  const dispositionForQuote = (quote) => {
    if (!quote) return null;

    if (quote.outcome === 'sold') {
      return { status: 'closed', source: quote, reason: 'Closed / Policy Sold' };
    }

    if (quote.outcome === 'follow_up' || quote.follow_up_needed) {
      return {
        status: 'follow_up',
        source: quote,
        reason: 'Follow Up',
        followUpAt: quote.follow_up_at || null,
      };
    }

    if (notClosedValues.has(quote.outcome)) {
      return {
        status: 'not_closed',
        source: quote,
        reason: reasonLabel(quote.outcome),
      };
    }

    return null;
  };

  // POLICY_BOUND is authoritative for the CURRENT quote attempt.
  // If TurboRater/extension reports POLICY_BOUND, the quote is closed even when
  // the agent never completed the 3 Yes workflow or manually selected Closed.
  if (latest?.policy_bound_detected === true) {
    return {
      status: 'closed',
      source: latest,
      reason: 'Policy Bound (Auto Detected)',
      systemClosed: true,
      policyBoundAt: latest.policy_bound_at || null,
    };
  }

  // IMPORTANT:
  // A newly-started quote attempt is authoritative for LIVE status.
  // If this customer had a previous Lost Deal / Walk / other disposition but
  // TurboRater starts a NEW in-progress quote, the customer returns to Live Activity.
  // We preserve the old disposition in history; it just must not suppress the new attempt.
  if (latest && getDisplayStatus(latest) === 'in_progress') {
    const currentDisposition = dispositionForQuote(latest);
    if (currentDisposition) return currentDisposition;

    const previousLostDeal = sorted
      .slice(1)
      .find((quote) => quote.outcome === 'lost_deal');

    return {
      status: 'open',
      source: latest,
      reason: previousLostDeal ? 'Re-Opened Lost Deal' : 'Open',
      reopenedLostDeal: Boolean(previousLostDeal),
      previousLostDeal: previousLostDeal || null,
    };
  }

  // When there is no newer active attempt, the newest explicit workflow
  // disposition wins. This preserves normal historical Closed / Follow Up /
  // Not Closed behavior.
  for (const quote of sorted) {
    const disposition = dispositionForQuote(quote);
    if (disposition) return disposition;
  }

  const systemBound = completed.find(
    (q) =>
      q.policy_bound_detected === true ||
      q.system_outcome_signal === 'sold' ||
      String(q.bridge_policy_status_value || '').toLowerCase() === 'bound' ||
      String(q.bridge_policy_status || '').toLowerCase() === 'policy bound'
  );

  if (systemBound) {
    return {
      status: 'closed',
      source: systemBound,
      reason: 'Policy Bound (TurboRater)',
      systemClosed: true,
    };
  }

  return {
    status: 'open',
    source: completed[0] || latest || null,
    reason: 'Open',
  };
}

function groupQuotesByCustomer(quotes, now, officeRegions = {}) {
  const map = new Map();

  for (const quote of quotes) {
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
  }

  return [...map.values()]
    .map((group) => {
      const sorted = [...group.quotes].sort((a, b) => latestTimestamp(b) - latestTimestamp(a));
      const latest = sorted[0];
      const completed = sorted.filter((q) => getDisplayStatus(q, now) === 'completed');
      const inProgress = sorted.filter((q) => getDisplayStatus(q, now) === 'in_progress');
      const stale = sorted.filter((q) => getDisplayStatus(q, now) === 'stale');
      const premiums = completed.map((q) => Number(q.total_premium)).filter(Number.isFinite);
      const outcome = customerOutcomeFromQuotes(sorted);
      const office = normalizeOffice(latest?.office || 'Unknown');

      return {
        ...group,
        quotes: sorted,
        latest,
        completedCount: completed.length,
        inProgressCount: inProgress.length,
        staleCount: stale.length,
        bestPremium: premiums.length ? Math.min(...premiums) : null,
        customerName: latest?.customer_name || 'Unnamed Customer',
        phone: latest?.phone || '',
        email: latest?.email || '',
        agentName: latest?.captured_agent_name || latest?.agent_email || 'Unknown agent',
        office,
        region: cleanStr(officeRegions[office]) || 'Unassigned',
        lastActivityAt:
          latest?.updated_at ||
          latest?.bridged_back_at ||
          latest?.started_at ||
          latest?.created_at,
        outcome,
        yesStage: outcome.status === 'open' && getDisplayStatus(latest, now) === 'in_progress'
          ? threeYesStage(latest)
          : Math.max(0, ...sorted.map(threeYesStage)),
        stageQuote: outcome.status === 'open' && getDisplayStatus(latest, now) === 'in_progress'
          ? latest
          : sorted.find((q) => threeYesStage(q) === Math.max(0, ...sorted.map(threeYesStage))) || latest,
        businessType: inferQuoteBusinessType(latest),
        existingClientReason: inferQuoteBusinessType(latest) === 'existing_client'
          ? inferExistingClientReason(latest)
          : '',
      };
    })
    .sort((a, b) => new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0));
}

function getAttentionItem(group) {
  if (!group || group?.outcome?.status !== 'not_closed') return null;

  const outcome = cleanStr(group?.outcome?.source?.outcome).toLowerCase();

  if (outcome === 'lost_deal') {
    return {
      level: 'critical',
      title: 'Lost Deal',
      detail: 'Manager help / lower broker fee was requested or approved, but the customer still did not close.',
      sortValue: 0,
      stage: Number(group?.yesStage || 0),
      category: 'lost_deal',
    };
  }

  if (outcome === 'walk') {
    return {
      level: 'high',
      title: 'Walk',
      detail: 'Customer left on price before the agent contacted management for Deal Save help.',
      sortValue: 1,
      stage: Number(group?.yesStage || 0),
      category: 'walk',
    };
  }

  return null;
}


export default function AdminQuoteLog() {
  const { supabaseClient, profile } = useAuth();

  const [activeTab, setActiveTab] = useState('live');
  const [timeView, setTimeView] = useState('month');
  const [month, setMonth] = useState(monthValue());
  const [selectedDate, setSelectedDate] = useState(dateValue());
  const [quotes, setQuotes] = useState([]);
  const [quoteEvents, setQuoteEvents] = useState([]);
  const [quoteInternalNotes, setQuoteInternalNotes] = useState([]);
  const [officeRegions, setOfficeRegions] = useState({});
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  const [deviceTokens, setDeviceTokens] = useState([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceSaving] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState('');
  const [deviceSearch, setDeviceSearch] = useState('');
  const refreshTimer = useRef(null);
  const deviceRefreshTimer = useRef(null);
  const fetchRequestRef = useRef(0);

  const [agentEntry, setAgentEntry] = useState({
    status: '',
    reason: '',
    follow_up_at: '',
    notes: '',
  });

  const fetchOfficeSettings = useCallback(async () => {
    if (!supabaseClient) return;
    setSettingsLoading(true);

    const { data, error: settingsError } = await supabaseClient
      .from('office_dashboard_settings')
      .select('office_code, region');

    if (settingsError) {
      console.error('[AdminQuoteLog] office settings query failed:', settingsError);
      setError((current) => current || `Could not load office regions: ${settingsError.message}`);
      setSettingsLoading(false);
      return;
    }

    const regionMap = {};
    (data || []).forEach((row) => {
      const officeCode = normalizeOffice(row.office_code);
      if (!officeCode || officeCode === 'Unknown') return;
      regionMap[officeCode] = cleanStr(row.region) || 'Unassigned';
    });

    setOfficeRegions(regionMap);
    setSettingsLoading(false);
  }, [supabaseClient]);


  const fetchDeviceTokens = useCallback(async ({ quiet = false } = {}) => {
    if (!supabaseClient || cleanStr(profile?.role).toLowerCase() !== 'admin') return;

    if (!quiet) {
      setDeviceLoading(true);
      setDeviceMessage('');
    }

    const { data, error: tokenError } = await supabaseClient
      .from('extension_devices')
      .select('id, user_email, token_hash, device_name, office, region, platform, is_active, created_at, last_used_at, approval_status, requested_by_name, requested_by_email, requested_at, approved_by, approved_at, rejected_by, rejected_at, rejection_reason')
      .order('created_at', { ascending: false });

    if (tokenError) {
      console.error('[AdminQuoteLog] extension device query failed:', tokenError);
      if (!quiet) {
        setDeviceMessage(`Could not load trusted devices: ${tokenError.message}`);
        setDeviceLoading(false);
      }
      return;
    }

    setDeviceTokens(data || []);
    if (!quiet) setDeviceLoading(false);
  }, [supabaseClient, profile?.role]);

  const fetchQuotes = useCallback(
    async ({ quiet = false } = {}) => {
      if (!supabaseClient) return;
      const requestId = ++fetchRequestRef.current;
      if (!quiet) setLoading(true);
      setError('');

      const { start, end } = rangeBounds(timeView, selectedDate, month);
      const [historyResult, liveResult] = await Promise.all([
        supabaseClient
          .from('quote_log_view')
          .select('*')
          .gte('started_at', start)
          .lt('started_at', end)
          .order('started_at', { ascending: false }),
        // Live Activity is intentionally independent of Day / Week / Month.
        supabaseClient
          .from('quote_log_view')
          .select('*')
          .eq('status', 'in_progress')
          .order('started_at', { ascending: false }),
      ]);

      if (historyResult.error || liveResult.error) {
        const queryError = historyResult.error || liveResult.error;
        console.error('[AdminQuoteLog] query failed:', queryError);
        setError(`Could not load Quote Operations: ${queryError.message}`);
        if (!quiet) setLoading(false);
        return;
      }

      const rowMap = new Map();
      [...(historyResult.data || []), ...(liveResult.data || [])].forEach((row) => {
        if (row?.id) rowMap.set(row.id, row);
      });
      const baseRows = [...rowMap.values()];
      const quoteIds = [...new Set(baseRows.map((row) => row.id).filter(Boolean))];
      const supplementalRows = [];
      const workflowRows = [];
      const eventRows = [];
      const internalNoteRows = [];

      for (let index = 0; index < quoteIds.length; index += 200) {
        const ids = quoteIds.slice(index, index + 200);

        const [
          { data: quoteData, error: quoteError },
          { data: eventsData, error: eventsError },
          { data: workflowData, error: workflowError },
          { data: notesData, error: notesError },
        ] = await Promise.all([
          supabaseClient
            .from('quotes')
            .select('id, driver_count, drivers_with_license, any_license_entered, first_license_entered_at, vehicle_count, vehicles_with_full_vin, any_full_vin_entered, first_full_vin_entered_at, high_intent_detected, high_intent_detected_at, completeness_observed_at, last_live_activity_at, drivers_summary, vehicles_summary')
            .in('id', ids),
          supabaseClient
            .from('quote_events')
            .select('id, quote_id, capture_id, event_type, event_label, event_at, metadata, created_at')
            .in('quote_id', ids)
            .order('event_at', { ascending: true }),
          supabaseClient
            .from('quote_workflow')
            .select('quote_id, quote_business_type, existing_client_reason, first_yes_ready_now, second_yes_id_vin, third_yes_payment_ready, payment_method, first_yes_recorded_at, second_yes_recorded_at, third_yes_recorded_at')
            .in('quote_id', ids),
          supabaseClient
            .from('quote_internal_notes')
            .select('id, quote_id, note_text, author_email, author_name, author_role, note_source, created_at')
            .in('quote_id', ids)
            .order('created_at', { ascending: false }),
        ]);

        if (quoteError) {
          console.error('[AdminQuoteLog] completeness query failed:', quoteError);
        } else {
          supplementalRows.push(...(quoteData || []));
        }

        if (eventsError) {
          console.error('[AdminQuoteLog] quote events query failed:', eventsError);
        } else {
          eventRows.push(...(eventsData || []));
        }

        if (workflowError) {
          console.error('[AdminQuoteLog] 3 Yes workflow query failed:', workflowError);
        } else {
          workflowRows.push(...(workflowData || []));
        }

        if (notesError) {
          console.error('[AdminQuoteLog] internal notes query failed:', notesError);
        } else {
          internalNoteRows.push(...(notesData || []));
        }
      }

      const supplementalById = new Map(supplementalRows.map((row) => [row.id, row]));
      const workflowById = new Map(workflowRows.map((row) => [row.quote_id, row]));

      // quote_events is the most reliable source for an auto-detected policy bind.
      // Attach that signal directly to the quote row so classification can remove
      // the quote from Live Activity immediately, even if quote.status still says
      // in_progress and the agent never completed the workflow form.
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
      internalNoteRows.forEach((note) => {
        if (!note?.quote_id) return;
        const existing = latestInternalNoteByQuoteId.get(note.quote_id);
        const noteAt = note.created_at || null;
        if (!existing || new Date(noteAt || 0).getTime() > new Date(existing.created_at || 0).getTime()) {
          latestInternalNoteByQuoteId.set(note.quote_id, note);
        }
      });

      const mergedRows = baseRows.map((row) => {
        const policyBoundAt = policyBoundByQuoteId.get(row.id) || null;
        const latestInternalNote = latestInternalNoteByQuoteId.get(row.id) || null;
        return {
          ...row,
          ...(supplementalById.get(row.id) || {}),
          ...(workflowById.get(row.id) || {}),
          policy_bound_detected: Boolean(policyBoundAt),
          policy_bound_at: policyBoundAt,
          latest_internal_note: latestInternalNote?.note_text || null,
          latest_internal_note_at: latestInternalNote?.created_at || null,
        };
      });

      // Ignore stale overlapping refresh responses. This prevents the live UI
      // from briefly jumping backward when several realtime events arrive together.
      if (requestId !== fetchRequestRef.current) return;

      setQuotes(mergedRows);
      setQuoteEvents(eventRows);
      setQuoteInternalNotes(internalNoteRows);
      if (!quiet) setLoading(false);
    },
    [timeView, selectedDate, month, supabaseClient]
  );

  const refreshAll = useCallback(async () => {
    const jobs = [fetchQuotes(), fetchOfficeSettings()];
    if (cleanStr(profile?.role).toLowerCase() === 'admin') {
      jobs.push(fetchDeviceTokens());
    }
    await Promise.all(jobs);
  }, [fetchQuotes, fetchOfficeSettings, fetchDeviceTokens, profile?.role]);

  useEffect(() => {
    fetchOfficeSettings();
  }, [fetchOfficeSettings]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  useEffect(() => {
    if (cleanStr(profile?.role).toLowerCase() === 'admin') {
      fetchDeviceTokens();
    }
  }, [fetchDeviceTokens, profile?.role]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Realtime is primary. This quiet fallback refresh catches missed websocket
    // events without flashing loading states or resetting the selected tab/drawer.
    const id = setInterval(() => fetchQuotes({ quiet: true }), 30000);
    return () => clearInterval(id);
  }, [fetchQuotes]);

  useEffect(() => {
    if (cleanStr(profile?.role).toLowerCase() !== 'admin') return undefined;

    // Device realtime is primary. A quiet 15-second fallback keeps approvals,
    // disables, removals, and new registrations accurate if a websocket event
    // is missed, without flashing a loading state.
    const id = setInterval(() => fetchDeviceTokens({ quiet: true }), 15000);
    return () => clearInterval(id);
  }, [fetchDeviceTokens, profile?.role]);

  useEffect(() => {
    if (!supabaseClient) return undefined;

    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => fetchQuotes({ quiet: true }), 850);
    };

    const channel = supabaseClient
      .channel('admin-quote-log-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_workflow' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_events' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_internal_notes' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extension_devices' }, () => {
        if (cleanStr(profile?.role).toLowerCase() !== 'admin') return;
        if (deviceRefreshTimer.current) clearTimeout(deviceRefreshTimer.current);
        deviceRefreshTimer.current = setTimeout(
          () => fetchDeviceTokens({ quiet: true }),
          500
        );
      })
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (deviceRefreshTimer.current) clearTimeout(deviceRefreshTimer.current);
      supabaseClient.removeChannel(channel);
    };
  }, [fetchQuotes, fetchDeviceTokens, profile?.role, supabaseClient]);

  const customerGroups = useMemo(
    () => groupQuotesByCustomer(quotes, now, officeRegions),
    [quotes, now, officeRegions]
  );


  useEffect(() => {
    if (!selectedCustomer?.key) return;
    const refreshed = customerGroups.find((group) => group.key === selectedCustomer.key);
    if (refreshed) setSelectedCustomer(refreshed);
  }, [customerGroups, selectedCustomer?.key]);

  const userRole = cleanStr(profile?.role || profile?.user_role).toLowerCase();
  const profileRegion = cleanStr(profile?.region);
  const profileOffice = normalizeOffice(profile?.office);
  const isAdmin = userRole === 'admin';
  const isRegional = ['regional', 'regional_manager', 'region_manager'].includes(userRole);
  const isSupervisor = userRole === 'supervisor';

  useEffect(() => {
    if (isRegional && profileRegion) {
      setRegionFilter(profileRegion);
      setOfficeFilter('all');
      setAgentFilter('all');
    } else if (isSupervisor && profileOffice && profileOffice !== 'Unknown') {
      setOfficeFilter(profileOffice);
      setAgentFilter('all');
    }
  }, [isRegional, isSupervisor, profileRegion, profileOffice]);

  const regions = useMemo(() => {
    const values = new Set(Object.values(officeRegions).filter(Boolean));
    customerGroups.forEach((group) => values.add(group.region || 'Unassigned'));
    return [...values].sort((a, b) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [officeRegions, customerGroups]);

  const offices = useMemo(() => {
    const values = new Set();

    Object.entries(officeRegions).forEach(([office, region]) => {
      if (regionFilter === 'all' || region === regionFilter) values.add(normalizeOffice(office));
    });

    customerGroups.forEach((group) => {
      if (regionFilter === 'all' || group.region === regionFilter) values.add(group.office);
    });

    return [...values].sort((a, b) => getOfficeNumber(a) - getOfficeNumber(b));
  }, [officeRegions, customerGroups, regionFilter]);

  const agents = useMemo(() => {
    const values = new Set();
    customerGroups.forEach((group) => {
      if (regionFilter !== 'all' && group.region !== regionFilter) return;
      if (officeFilter !== 'all' && group.office !== officeFilter) return;
      if (group.agentName) values.add(group.agentName);
    });
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [customerGroups, regionFilter, officeFilter]);

  const scopeGroups = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return customerGroups.filter((group) => {
      if (isRegional && profileRegion && group.region !== profileRegion) return false;
      if (isSupervisor && profileOffice !== 'Unknown' && group.office !== profileOffice) return false;
      if (regionFilter !== 'all' && group.region !== regionFilter) return false;
      if (officeFilter !== 'all' && group.office !== officeFilter) return false;
      if (agentFilter !== 'all' && group.agentName !== agentFilter) return false;

      if (!needle) return true;

      const haystack = [
        group.customerName,
        group.matrixCustomerId,
        group.phone,
        group.email,
        group.agentName,
        group.office,
        group.region,
        ...group.quotes.flatMap((q) => [
          q.carrier,
          q.matrix_quote_id,
          q.rater_id,
          q.captured_note,
          q.agent_notes,
          q.lead_source,
          q.marketing_number,
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [customerGroups, regionFilter, officeFilter, agentFilter, search, isRegional, isSupervisor, profileRegion, profileOffice]);

  const selectedBounds = useMemo(
    () => rangeBounds(timeView, selectedDate, month),
    [timeView, selectedDate, month]
  );

  const historicalGroups = useMemo(() => {
    const startMs = new Date(selectedBounds.start).getTime();
    const endMs = new Date(selectedBounds.end).getTime();
    return scopeGroups.filter((group) =>
      group.quotes.some((quote) => {
        const t = new Date(quote.started_at || quote.created_at || 0).getTime();
        return Number.isFinite(t) && t >= startMs && t < endMs;
      })
    );
  }, [scopeGroups, selectedBounds]);

  const liveGroups = useMemo(
    () => scopeGroups.filter((group) => isGroupLive(group)),
    [scopeGroups]
  );


  const quoteEventsByQuote = useMemo(() => {
    const map = {};
    quoteEvents.forEach((event) => {
      if (!event?.quote_id) return;
      if (!map[event.quote_id]) map[event.quote_id] = [];
      map[event.quote_id].push(event);
    });
    return map;
  }, [quoteEvents]);

  const internalNotesByQuote = useMemo(() => {
    const map = {};
    quoteInternalNotes.forEach((note) => {
      if (!note?.quote_id) return;
      if (!map[note.quote_id]) map[note.quote_id] = [];
      map[note.quote_id].push(note);
    });
    Object.values(map).forEach((rows) =>
      rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    );
    return map;
  }, [quoteInternalNotes]);

  const closedGroups = useMemo(
    () => historicalGroups.filter((group) => isGroupClosed(group)),
    [historicalGroups]
  );

  const quoteGroups = useMemo(
    () => historicalGroups.filter((group) => {
      if (isGroupClosed(group) || isGroupLive(group)) return false;
      if (group.outcome?.status === 'follow_up') return false;

      // "Did Not RW - Stayed With Current Carrier" belongs under the
      // existing-client Quote classification that created the re-write,
      // even when the quote reached the 3 Yes process before it was retained.
      if (isDidNotRewriteGroup(group)) return true;

      return Number(group.yesStage || 0) === 0;
    }),
    [historicalGroups]
  );

  const newQuoteGroups = useMemo(
    () => quoteGroups.filter((group) => group.businessType !== 'existing_client'),
    [quoteGroups]
  );

  const existingClientQuoteGroups = useMemo(
    () => quoteGroups.filter((group) => group.businessType === 'existing_client'),
    [quoteGroups]
  );

  const paymentQuoteGroups = useMemo(
    () => existingClientQuoteGroups.filter((group) => group.existingClientReason === 'payment'),
    [existingClientQuoteGroups]
  );

  const endorsementQuoteGroups = useMemo(
    () => existingClientQuoteGroups.filter((group) => group.existingClientReason === 'rewrite_endorsement'),
    [existingClientQuoteGroups]
  );

  const renewalQuoteGroups = useMemo(
    () => existingClientQuoteGroups.filter((group) => group.existingClientReason === 'renewal'),
    [existingClientQuoteGroups]
  );

  const reinstatementQuoteGroups = useMemo(
    () => existingClientQuoteGroups.filter((group) => group.existingClientReason === 'reinstatement'),
    [existingClientQuoteGroups]
  );

  const recentRewriteQuoteGroups = useMemo(
    () => existingClientQuoteGroups.filter((group) => group.existingClientReason === 'rewrite_recent_policy'),
    [existingClientQuoteGroups]
  );

  const unclassifiedExistingQuoteGroups = useMemo(
    () => existingClientQuoteGroups.filter((group) => !group.existingClientReason),
    [existingClientQuoteGroups]
  );

  const newClosedGroups = useMemo(
    () => closedGroups.filter((group) => group.businessType !== 'existing_client'),
    [closedGroups]
  );

  const existingClientClosedGroups = useMemo(
    () => closedGroups.filter((group) => group.businessType === 'existing_client'),
    [closedGroups]
  );

  const paymentClosedGroups = useMemo(
    () => existingClientClosedGroups.filter((group) => group.existingClientReason === 'payment'),
    [existingClientClosedGroups]
  );

  const endorsementClosedGroups = useMemo(
    () => existingClientClosedGroups.filter((group) => group.existingClientReason === 'rewrite_endorsement'),
    [existingClientClosedGroups]
  );

  const renewalClosedGroups = useMemo(
    () => existingClientClosedGroups.filter((group) => group.existingClientReason === 'renewal'),
    [existingClientClosedGroups]
  );

  const reinstatementClosedGroups = useMemo(
    () => existingClientClosedGroups.filter((group) => group.existingClientReason === 'reinstatement'),
    [existingClientClosedGroups]
  );

  const recentRewriteClosedGroups = useMemo(
    () => existingClientClosedGroups.filter((group) => group.existingClientReason === 'rewrite_recent_policy'),
    [existingClientClosedGroups]
  );

  const unclassifiedExistingClosedGroups = useMemo(
    () => existingClientClosedGroups.filter((group) => !group.existingClientReason),
    [existingClientClosedGroups]
  );

  const attentionGroups = useMemo(() => {
    return historicalGroups
      .map((group) => ({ group, attention: getAttentionItem(group) }))
      .filter((item) => item.attention)
      .sort((a, b) => {
        if (a.attention.sortValue !== b.attention.sortValue) {
          return a.attention.sortValue - b.attention.sortValue;
        }
        return new Date(a.group.lastActivityAt || 0) - new Date(b.group.lastActivityAt || 0);
      });
  }, [historicalGroups]);

  const lostDealAttention = useMemo(
    () => attentionGroups.filter((item) => item.attention?.category === 'lost_deal'),
    [attentionGroups]
  );

  const walkAttention = useMemo(
    () => attentionGroups.filter((item) => item.attention?.category === 'walk'),
    [attentionGroups]
  );

  const stats = useMemo(() => {
    const activeAgents = new Set(liveGroups.map((g) => g.agentName).filter(Boolean)).size;
    const activeOffices = new Set(liveGroups.map((g) => g.office).filter(Boolean)).size;

    return {
      customers: historicalGroups.length,
      closed: closedGroups.length,
      live: liveGroups.length,
      attention: attentionGroups.length,
      quotes: quoteGroups.length,
      activeAgents,
      activeOffices,
    };
  }, [historicalGroups, closedGroups, liveGroups, attentionGroups, quoteGroups]);

  const liveByRegion = useMemo(() => {
    const grouped = new Map();

    liveGroups.forEach((group) => {
      const region = group.region || 'Unassigned';
      if (!grouped.has(region)) grouped.set(region, new Map());
      const officeMap = grouped.get(region);
      if (!officeMap.has(group.office)) officeMap.set(group.office, []);
      officeMap.get(group.office).push(group);
    });

    return [...grouped.entries()]
      .map(([region, officeMap]) => ({
        region,
        offices: [...officeMap.entries()]
          .map(([office, groups]) => ({
            office,
            groups: [...groups].sort((a, b) => {
              const stageDiff = Number(b.yesStage || 0) - Number(a.yesStage || 0);
              if (stageDiff) return stageDiff;
              return new Date(b.lastActivityAt || 0).getTime() - new Date(a.lastActivityAt || 0).getTime();
            }),
          }))
          .sort((a, b) => getOfficeNumber(a.office) - getOfficeNumber(b.office)),
      }))
      .sort((a, b) => {
        if (a.region === 'Unassigned') return 1;
        if (b.region === 'Unassigned') return -1;
        return a.region.localeCompare(b.region, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [liveGroups]);

  const trustedDeviceCount = useMemo(
    () => deviceTokens.filter((row) =>
      (row.approval_status || (row.is_active ? 'approved' : 'pending')) === 'approved' &&
      row.is_active
    ).length,
    [deviceTokens]
  );

  const filteredDeviceTokens = useMemo(() => {
    const needle = deviceSearch.trim().toLowerCase();
    return deviceTokens.filter((row) => {
      if (regionFilter !== 'all' && cleanStr(row.region || 'Unassigned') !== regionFilter) return false;
      if (officeFilter !== 'all' && normalizeOffice(row.office) !== officeFilter) return false;
      if (!needle) return true;
      return [row.user_email, row.office, row.region, row.platform, row.device_name, row.token_hash]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [deviceTokens, deviceSearch, regionFilter, officeFilter]);


  const approveDevice = async (row) => {
    if (!isAdmin || !row?.id) return;
    setDeviceMessage('');

    const { error: updateError } = await supabaseClient
      .from('extension_devices')
      .update({
        approval_status: 'approved',
        is_active: true,
        approved_by: profile?.id || null,
        approved_at: new Date().toISOString(),
        rejected_by: null,
        rejected_at: null,
        rejection_reason: null,
      })
      .eq('id', row.id);

    if (updateError) {
      setDeviceMessage(`Could not approve device: ${updateError.message}`);
      return;
    }

    await fetchDeviceTokens();
    setDeviceMessage(`${row.device_name || 'Device'} approved.`);
  };

  const rejectDevice = async (row) => {
    if (!isAdmin || !row?.id) return;
    const reason = window.prompt(
      `Reject ${row.device_name || 'this device'}? Optional reason:`,
      ''
    );
    if (reason === null) return;

    setDeviceMessage('');
    const { error: updateError } = await supabaseClient
      .from('extension_devices')
      .update({
        approval_status: 'rejected',
        is_active: false,
        rejected_by: profile?.id || null,
        rejected_at: new Date().toISOString(),
        rejection_reason: String(reason || '').trim() || null,
      })
      .eq('id', row.id);

    if (updateError) {
      setDeviceMessage(`Could not reject device: ${updateError.message}`);
      return;
    }

    await fetchDeviceTokens();
    setDeviceMessage(`${row.device_name || 'Device'} rejected.`);
  };

  const toggleDeviceToken = async (row) => {
    if (!isAdmin || !row?.id) return;
    setDeviceMessage('');
    const { error: updateError } = await supabaseClient
      .from('extension_devices')
      .update({ is_active: !row.is_active })
      .eq('id', row.id);

    if (updateError) {
      setDeviceMessage(`Could not update device token: ${updateError.message}`);
      return;
    }
    await fetchDeviceTokens();
  };

  const deleteDeviceToken = async (row) => {
    if (!isAdmin || !row?.id) return;
    if (!window.confirm(`Remove ${row.device_name || 'this trusted device'}?`)) return;

    const { error: deleteError } = await supabaseClient
      .from('extension_devices')
      .delete()
      .eq('id', row.id);

    if (deleteError) {
      setDeviceMessage(`Could not remove device token: ${deleteError.message}`);
      return;
    }
    await fetchDeviceTokens();
    setDeviceMessage('Trusted device removed.');
  };

  const scopeLabel = useMemo(() => {
    const parts = [];
    if (regionFilter !== 'all') parts.push(regionFilter);
    if (officeFilter !== 'all') parts.push(officeFilter);
    if (agentFilter !== 'all') parts.push(agentFilter);
    return parts.length ? parts.join(' · ') : 'All Regions · All Offices';
  }, [regionFilter, officeFilter, agentFilter]);

  const openCustomer = (group) => {
    const isSame = selectedCustomer?.key === group.key;

    if (isSame) {
      setSelectedCustomer(null);
      setSaveMessage('');
      return;
    }

    setSelectedCustomer(group);
    setSaveMessage('');

    const current = group.outcome;
    const currentQuote = group.quotes[0] || {};
    setAgentEntry({
      status: current.status === 'open' ? '' : current.status,
      reason: current.status === 'not_closed' ? current.source?.outcome || '' : '',
      follow_up_at: current.status === 'follow_up' ? toDatetimeLocal(current.followUpAt) : '',
      notes: '',
      business_type: currentQuote.quote_business_type || inferQuoteBusinessType(currentQuote),
      existing_client_reason: currentQuote.existing_client_reason || '',
      first_yes: currentQuote.first_yes_ready_now === true ? 'yes' : currentQuote.first_yes_ready_now === false ? 'no' : '',
      second_yes: currentQuote.second_yes_id_vin === true ? 'yes' : currentQuote.second_yes_id_vin === false ? 'no' : 'auto',
      payment_method: currentQuote.payment_method || '',
    });
  };

  const buildOverrideHistoryText = ({
    outcome,
    followUpAt,
    firstYesValue,
    secondYesValue,
    thirdYesValue,
  }) => {
    const businessType =
      agentEntry.business_type === 'existing_client'
        ? 'Existing Client / Re-Write'
        : 'New Quote';

    const rewriteReason =
      agentEntry.business_type === 'existing_client'
        ? existingClientReasonLabel(agentEntry.existing_client_reason) || 'Needs Classification'
        : null;

    const firstYesLabel =
      firstYesValue === true ? 'Yes' : firstYesValue === false ? 'No' : 'Not recorded';

    const secondYesLabel =
      agentEntry.second_yes === 'auto'
        ? 'System detection'
        : secondYesValue === true
          ? 'Yes'
          : secondYesValue === false
            ? 'No'
            : 'Not recorded';

    const thirdYesLabel =
      agentEntry.payment_method === 'cash'
        ? 'Cash'
        : agentEntry.payment_method === 'card'
          ? 'Card'
          : agentEntry.payment_method === 'neither'
            ? 'Neither / Not Ready'
            : thirdYesValue === true
              ? 'Yes'
              : 'Not recorded';

    const outcomeLabel =
      outcome === 'sold'
        ? 'Closed'
        : outcome === 'follow_up'
          ? 'Follow Up'
          : reasonLabel(outcome) || 'Not Closed';

    const parts = [
      'Supervisor override saved',
      `Quote Type: ${businessType}${rewriteReason ? ` - ${rewriteReason}` : ''}`,
      `1st Yes: ${firstYesLabel}`,
      `2nd Yes: ${secondYesLabel}`,
      `3rd Yes / Payment: ${thirdYesLabel}`,
      `Outcome: ${outcomeLabel}`,
    ];

    if (followUpAt) {
      parts.push(`Follow Up: ${formatDateTime(followUpAt)}`);
    }

    return parts.join(' · ');
  };

  const saveCustomerOutcome = async (event) => {
    event.preventDefault();
    if (!selectedCustomer) return;

    const targetQuote =
      selectedCustomer.quotes.find((q) => getDisplayStatus(q, now) === 'completed') ||
      selectedCustomer.quotes[0];

    if (!targetQuote?.id) {
      setSaveMessage('Save failed: no quote record is available for this customer.');
      return;
    }

    let outcome = null;
    let followUpNeeded = false;
    let followUpAt = null;

    if (agentEntry.status === 'closed') outcome = 'sold';
    if (agentEntry.status === 'not_closed') outcome = agentEntry.reason || null;
    if (agentEntry.status === 'follow_up') {
      outcome = 'follow_up';
      followUpNeeded = true;
      followUpAt = agentEntry.follow_up_at
        ? new Date(agentEntry.follow_up_at).toISOString()
        : null;
    }

    if (!outcome) {
      setSaveMessage('Choose an outcome before saving.');
      return;
    }

    if (agentEntry.status === 'not_closed' && !agentEntry.reason) {
      setSaveMessage('Choose why the customer was not closed.');
      return;
    }

    if (
      agentEntry.status === 'not_closed' &&
      agentEntry.reason === 'did_not_rw_stayed_current_carrier' &&
      !agentEntry.notes.trim()
    ) {
      setSaveMessage('Add an explanation of why the customer stayed with the current carrier.');
      return;
    }

    setSaving(true);
    setSaveMessage('');

    const savedAt = new Date().toISOString();
    const firstYesValue = agentEntry.first_yes === '' ? null : agentEntry.first_yes === 'yes';
    const secondYesValue = agentEntry.second_yes === 'auto' ? null : agentEntry.second_yes === 'yes';
    const thirdYesValue = agentEntry.payment_method === ''
      ? null
      : agentEntry.payment_method === 'cash' || agentEntry.payment_method === 'card';

    const payload = {
      quote_id: targetQuote.id,
      quote_reason: targetQuote.quote_reason || null,
      outcome,
      agent_notes: agentEntry.notes.trim() || null,
      follow_up_needed: followUpNeeded,
      follow_up_at: followUpAt,
      completed_by_email: profile?.email || null,
      quote_business_type: agentEntry.business_type || inferQuoteBusinessType(targetQuote),
      existing_client_reason: agentEntry.business_type === 'existing_client'
        ? agentEntry.existing_client_reason || null
        : null,
      first_yes_ready_now: firstYesValue,
      second_yes_id_vin: secondYesValue,
      third_yes_payment_ready: thirdYesValue,
      payment_method: agentEntry.payment_method || null,
      first_yes_recorded_at: firstYesValue === true
        ? targetQuote.first_yes_recorded_at || savedAt
        : null,
      second_yes_recorded_at: (secondYesValue === true || (secondYesValue === null && secondYesConfirmed(targetQuote)))
        ? targetQuote.second_yes_recorded_at || savedAt
        : null,
      third_yes_recorded_at: thirdYesValue === true
        ? targetQuote.third_yes_recorded_at || savedAt
        : null,
      updated_at: savedAt,
    };

    const { error: saveError } = await supabaseClient
      .from('quote_workflow')
      .upsert(payload, { onConflict: 'quote_id' });

    if (saveError) {
      console.error('[AdminQuoteLog] workflow save failed:', saveError);
      setSaveMessage(`Save failed: ${saveError.message}`);
      setSaving(false);
      return;
    }

    const overrideHistoryText = buildOverrideHistoryText({
      outcome,
      followUpAt,
      firstYesValue,
      secondYesValue,
      thirdYesValue,
    });

    const overrideSource =
      cleanStr(profile?.role).toLowerCase() === 'admin'
        ? 'admin_override'
        : 'supervisor_override';

    const { error: overrideHistoryError } = await appendInternalNote(
      targetQuote.id,
      overrideHistoryText,
      overrideSource
    );

    if (overrideHistoryError) {
      console.error('[AdminQuoteLog] override history save failed:', overrideHistoryError);
      setSaveMessage(`Override saved, but history failed: ${overrideHistoryError.message}`);
      setSaving(false);
      await fetchQuotes({ quiet: true });
      return;
    }

    if (agentEntry.notes.trim()) {
      const { error: noteError } = await appendInternalNote(
        targetQuote.id,
        agentEntry.notes,
        cleanStr(profile?.role).toLowerCase() || 'supervisor'
      );
      if (noteError) {
        console.error('[AdminQuoteLog] internal note save failed:', noteError);
        setSaveMessage(`Override saved, but internal note history failed: ${noteError.message}`);
        setSaving(false);
        await fetchQuotes({ quiet: true });
        return;
      }
      setAgentEntry((current) => ({ ...current, notes: '' }));
    }

    await fetchQuotes({ quiet: true });
    setSaveMessage('Saved');
    setSaving(false);
  };

  const appendInternalNote = async (quoteId, noteText, source = 'supervisor') => {
    const cleanNote = String(noteText || '').trim();
    if (!quoteId || !cleanNote) return { error: null };

    const role = cleanStr(profile?.role).toLowerCase() || source;
    const authorName =
      cleanStr(profile?.csr_name) ||
      cleanStr(profile?.full_name) ||
      cleanStr(profile?.name) ||
      cleanStr(profile?.email) ||
      'Internal User';

    return supabaseClient
      .from('quote_internal_notes')
      .insert({
        quote_id: quoteId,
        note_text: cleanNote,
        author_email: profile?.email || null,
        author_name: authorName,
        author_role: role,
        note_source: source || role,
      });
  };
  const handleRegionChange = (value) => {
    setRegionFilter(value);
    setOfficeFilter('all');
    setAgentFilter('all');
  };

  const handleOfficeChange = (value) => {
    setOfficeFilter(value);
    setAgentFilter('all');
  };

  const clearFilters = () => {
    setSearch('');
    setRegionFilter('all');
    setOfficeFilter('all');
    setAgentFilter('all');
  };

  const pageLoading = loading || settingsLoading;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Admin / Supervisor View</p>
          <h1>Quote Operations</h1>
          <p className={styles.subtitle}>
            Track the 3 Yes sales process live, recover strong lost opportunities, separate new quotes from existing-client reviews, and confirm closed business by region and office.
          </p>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.timeViewControl}>
            <span>Time View</span>
            <div className={styles.timeViewTabs}>
              {['day', 'week', 'month'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={timeView === mode ? styles.timeViewTabActive : ''}
                  onClick={() => setTimeView(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className={styles.rangeNavigator}>
              <button
                type="button"
                aria-label="Previous period"
                onClick={() => {
                  const next = shiftRange(timeView, selectedDate, month, -1);
                  setSelectedDate(next.date);
                  setMonth(next.month);
                }}
              >‹</button>
              {timeView === 'month' ? (
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              ) : (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setMonth(monthValue(parseLocalDate(e.target.value)));
                  }}
                />
              )}
              <button
                type="button"
                aria-label="Next period"
                onClick={() => {
                  const next = shiftRange(timeView, selectedDate, month, 1);
                  setSelectedDate(next.date);
                  setMonth(next.month);
                }}
              >›</button>
            </div>
            <strong className={styles.rangeLabel}>{rangeLabel(timeView, selectedDate, month)}</strong>
          </div>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={refreshAll}
            disabled={pageLoading}
          >
            {pageLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <section className={styles.scopeBar}>
        <div className={styles.scopeTitle}>
          <span>Viewing</span>
          <strong>{scopeLabel}</strong>
        </div>

        {isAdmin ? (
          <label>
            <span>Region</span>
            <select value={regionFilter} onChange={(e) => handleRegionChange(e.target.value)}>
              <option value="all">All Regions</option>
              {regions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            <span>Region</span>
            <input value={profileRegion || 'Assigned Region'} disabled />
          </label>
        )}

        {isSupervisor ? (
          <label>
            <span>Office</span>
            <input value={profileOffice} disabled />
          </label>
        ) : (
          <label>
            <span>Office</span>
            <select value={officeFilter} onChange={(e) => handleOfficeChange(e.target.value)}>
              <option value="all">All Offices</option>
              {offices.map((office) => (
                <option key={office} value={office}>{office}</option>
              ))}
            </select>
          </label>
        )}

        <label>
          <span>Agent</span>
          <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
            <option value="all">All Agents</option>
            {agents.map((agent) => (
              <option key={agent} value={agent}>{agent}</option>
            ))}
          </select>
        </label>

        <label className={styles.scopeSearch}>
          <span>Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, quote, phone, carrier..."
          />
        </label>

        <button type="button" className={styles.clearButton} onClick={clearFilters}>
          Clear
        </button>
      </section>

      <section className={styles.statsGrid}>
        <DashboardStat
          label="Quoting Now"
          value={stats.live}
          note={`${stats.activeAgents} agents · ${stats.activeOffices} offices`}
          tone="live"
        />
        <DashboardStat
          label="Needs Attention"
          value={stats.attention}
          note="1st / 2nd / 3rd Yes + follow-up"
          tone="attention"
        />
        <DashboardStat
          label="Quotes"
          value={stats.quotes}
          note={`${newQuoteGroups.length} new · ${existingClientQuoteGroups.length} existing`}
        />
        <DashboardStat
          label="Closed Deals"
          value={stats.closed}
          note={`${newClosedGroups.length} new · ${existingClientClosedGroups.length} existing`}
          tone="closed"
        />
      </section>

      <nav className={styles.tabBar} aria-label="Quote operations views">
        {TABS.filter(([value]) => value !== 'devices' || isAdmin).map(([value, label]) => {
          const count = value === 'live'
            ? stats.live
            : value === 'attention'
              ? stats.attention
              : value === 'quotes'
                ? stats.quotes
                : value === 'closed'
                  ? stats.closed
                  : value === 'devices'
                    ? trustedDeviceCount
                    : stats.customers;

          return (
            <button
              key={value}
              type="button"
              className={`${styles.tabButton} ${activeTab === value ? styles.tabButtonActive : ''}`}
              onClick={() => setActiveTab(value)}
            >
              <span>{label}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </nav>

      {activeTab === 'live' && (
        <LiveActivityView
          groups={liveGroups}
          grouped={liveByRegion}
          now={now}
          onOpen={openCustomer}
          quoteEventsByQuote={quoteEventsByQuote}
          internalNotesByQuote={internalNotesByQuote}
          viewerRole={userRole}
        />
      )}

      {activeTab === 'attention' && (
        <div className={styles.bucketSplitStack}>
          <NeedsAttentionView
            title="Lost Deals"
            description="Not-closed deals where management was contacted for Deal Save help / a lower broker fee, but the customer still did not close."
            items={lostDealAttention}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No Lost Deals in this view"
            emptyDetail="Lost Deals will appear here after the final Not Closed outcome is recorded."
          />
          <NeedsAttentionView
            title="Walks"
            description="Not-closed deals where the customer left on price before the agent contacted management for Deal Save help."
            items={walkAttention}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No Walks in this view"
            emptyDetail="Walks will appear here after the final Not Closed outcome is recorded."
          />
        </div>
      )}

      {activeTab === 'quotes' && (
        <div className={styles.bucketSplitStack}>
          <QuoteBucketView
            title="New Quotes"
            description="New prospects that remained regular quotes and did not progress into the 3 Yes process."
            groups={newQuoteGroups}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No new quotes in this view"
            emptyDetail="Regular new-business quotes will appear here after they stop being live."
            mode="quotes"
          />
          <QuoteBucketView
            title="Payment"
            description="Existing-client re-writes created while reviewing a current-policy payment."
            groups={paymentQuoteGroups}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No payment re-writes in this view"
            emptyDetail="Payment re-writes will appear here."
            mode="quotes"
          />
          <QuoteBucketView
            title="Endorsement Comparison"
            description="Existing-client re-writes created to compare a policy change or endorsement against a new rate."
            groups={endorsementQuoteGroups}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No endorsement comparisons in this view"
            emptyDetail="Endorsement comparison re-writes will appear here."
            mode="quotes"
          />
          <QuoteBucketView
            title="Renewal"
            description="Existing-client re-writes created while reviewing an upcoming or current renewal."
            groups={renewalQuoteGroups}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No renewal quotes in this view"
            emptyDetail="Renewal comparison re-writes will appear here."
            mode="quotes"
          />
          <QuoteBucketView
            title="Reinstatement"
            description="Existing-client re-writes created while evaluating a reinstatement opportunity."
            groups={reinstatementQuoteGroups}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No reinstatement quotes in this view"
            emptyDetail="Reinstatement re-writes will appear here."
            mode="quotes"
          />
          <QuoteBucketView
            title="Re-Write - Policy Within Last 6 Months"
            description="Former clients whose prior policy with us was within the last six months and are being re-quoted."
            groups={recentRewriteQuoteGroups}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No recent-policy re-writes in this view"
            emptyDetail="Recent prior-policy re-writes will appear here."
            mode="quotes"
          />
          {unclassifiedExistingQuoteGroups.length > 0 && (
            <QuoteBucketView
              title="Existing Client - Needs Classification"
              description="Existing-client re-writes that still need one of the five re-write reasons assigned."
              groups={unclassifiedExistingQuoteGroups}
              now={now}
              onOpen={openCustomer}
              emptyTitle="No unclassified existing-client quotes"
              emptyDetail="All existing-client quotes are classified."
              mode="quotes"
            />
          )}
        </div>
      )}

      {activeTab === 'closed' && (
        <div className={styles.bucketSplitStack}>
          <QuoteBucketView
            title="New Business Closed"
            description="Confirmed sold / policy-bound new-business deals."
            groups={newClosedGroups}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No new-business closes in this view"
            emptyDetail="Closed new-business deals will appear here automatically."
            mode="closed"
          />
          <QuoteBucketView
            title="Payment Closed"
            description="Closed re-write deals that originated from a current-policy payment review."
            groups={paymentClosedGroups}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No closed payment re-writes in this view"
            emptyDetail="Closed payment re-writes will appear here."
            mode="closed"
          />
          <QuoteBucketView
            title="Endorsement Comparison Closed"
            description="Closed re-write deals that originated from an endorsement comparison."
            groups={endorsementClosedGroups}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No closed endorsement comparisons in this view"
            emptyDetail="Closed endorsement comparison re-writes will appear here."
            mode="closed"
          />
          <QuoteBucketView
            title="Renewal Closed"
            description="Closed re-write deals that originated from a renewal review."
            groups={renewalClosedGroups}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No closed renewals in this view"
            emptyDetail="Closed renewal re-writes will appear here."
            mode="closed"
          />
          <QuoteBucketView
            title="Reinstatement Closed"
            description="Closed re-write deals that originated from a reinstatement review."
            groups={reinstatementClosedGroups}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No closed reinstatements in this view"
            emptyDetail="Closed reinstatement re-writes will appear here."
            mode="closed"
          />
          <QuoteBucketView
            title="Re-Write - Policy Within Last 6 Months Closed"
            description="Closed deals from former clients whose prior policy with us was within the last six months."
            groups={recentRewriteClosedGroups}
            now={now}
            onOpen={openCustomer}
            emptyTitle="No closed recent-policy re-writes in this view"
            emptyDetail="Closed recent prior-policy re-writes will appear here."
            mode="closed"
          />
          {unclassifiedExistingClosedGroups.length > 0 && (
            <QuoteBucketView
              title="Existing Client Closed - Needs Classification"
              description="Closed existing-client re-writes that still need one of the five re-write reasons assigned."
              groups={unclassifiedExistingClosedGroups}
              now={now}
              onOpen={openCustomer}
              emptyTitle="No unclassified existing-client closes"
              emptyDetail="All existing-client closed deals are classified."
              mode="closed"
            />
          )}
        </div>
      )}

      {activeTab === 'devices' && isAdmin && (
        <DeviceTokenManager
          rows={filteredDeviceTokens}
          allRows={deviceTokens}
          loading={deviceLoading}
          saving={deviceSaving}
          message={deviceMessage}
          search={deviceSearch}
          setSearch={setDeviceSearch}
          offices={offices}
          officeRegions={officeRegions}
          onApprove={approveDevice}
          onReject={rejectDevice}
          onToggle={toggleDeviceToken}
          onDelete={deleteDeviceToken}
          onRefresh={() => fetchDeviceTokens()}
        />
      )}

      {selectedCustomer && (
        <CustomerDrawer
          group={selectedCustomer}
          now={now}
          onClose={() => {
            setSelectedCustomer(null);
            setSaveMessage('');
          }}
          agentEntry={agentEntry}
          setAgentEntry={setAgentEntry}
          saveCustomerOutcome={saveCustomerOutcome}
          saving={saving}
          saveMessage={saveMessage}
          quoteEventsByQuote={quoteEventsByQuote}
          internalNotesByQuote={internalNotesByQuote}
        />
      )}
    </div>
  );
}

function maskToken(token = '') {
  const value = String(token || '');
  if (value.length <= 18) return value;
  return `${value.slice(0, 9)}...${value.slice(-7)}`;
}

function DeviceTokenManager({
  rows,
  allRows,
  loading,
  saving,
  message,
  search,
  setSearch,
  onApprove,
  onReject,
  onToggle,
  onDelete,
  onRefresh,
}) {
  const statusOf = (row) => row.approval_status || (row.is_active ? 'approved' : 'pending');
  const pendingRows = rows.filter((row) => statusOf(row) === 'pending');
  const trustedRows = rows.filter((row) => statusOf(row) !== 'pending');
  const approvedCount = allRows.filter((row) => statusOf(row) === 'approved' && row.is_active).length;
  const pendingCount = allRows.filter((row) => statusOf(row) === 'pending').length;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>Trusted Extension Devices</h2>
          <p>Employees register a shared computer once from the extension. Admin approves the computer here; the device is never permanently assigned to an agent.</p>
        </div>
        <div className={styles.deviceSummaryPills}>
          <span className={`${styles.countPill} ${pendingCount ? styles.attentionCountPill : ''}`}>
            {pendingCount} pending
          </span>
          <span className={`${styles.countPill} ${styles.trustedDevicePill}`}>{approvedCount} trusted</span>
        </div>
      </div>

      {message && <div className={styles.deviceMessage}>{message}</div>}

      <div className={styles.deviceRegistryToolbar}>
        <div>
          <span>Computer approvals</span>
          <strong>{rows.length} shown</strong>
        </div>
        <div className={styles.deviceToolbarActions}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search requester, office, device, fingerprint..."
          />
          <button type="button" className={styles.secondaryButton} onClick={onRefresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <div className={styles.pendingDeviceSection}>
        <div className={styles.pendingDeviceHeading}>
          <div>
            <span>Action required</span>
            <h3>Pending Device Approvals</h3>
          </div>
          <strong>{pendingRows.length}</strong>
        </div>

        {pendingRows.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>No computers are waiting for approval</strong>
            <span>New registration requests from the Chrome extension will appear here automatically.</span>
          </div>
        ) : (
          <div className={styles.pendingDeviceGrid}>
            {pendingRows.map((row) => (
              <article key={row.id || row.token_hash} className={styles.pendingDeviceCard}>
                <div className={styles.pendingDeviceTop}>
                  <div>
                    <span className={styles.pendingLabel}>Pending approval</span>
                    <h4>{row.device_name || 'Unnamed computer'}</h4>
                    <p>{normalizeOffice(row.office)} · {row.region || 'Unassigned'}</p>
                  </div>
                  <span className={`${styles.deviceStatus} ${styles.deviceStatusPending}`}>Pending</span>
                </div>

                <div className={styles.pendingDeviceMeta}>
                  <div>
                    <span>Requested by</span>
                    <strong>{row.requested_by_name || 'Unknown requester'}</strong>
                    <small>{row.requested_by_email || 'No email supplied'}</small>
                  </div>
                  <div>
                    <span>Requested</span>
                    <strong>{formatDateTime(row.requested_at || row.created_at)}</strong>
                    <small>{row.platform || 'web'} · {maskToken(row.token_hash)}</small>
                  </div>
                </div>

                <div className={styles.pendingDeviceActions}>
                  <button type="button" className={styles.primaryButton} disabled={saving} onClick={() => onApprove(row)}>
                    Approve Device
                  </button>
                  <button type="button" className={styles.dangerTextButton} disabled={saving} onClick={() => onReject(row)}>
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className={styles.deviceRegistryCard}>
        <div className={styles.deviceRegistryToolbar}>
          <div>
            <span>Trusted device history</span>
            <strong>{approvedCount} active trusted · {trustedRows.length} history rows</strong>
          </div>
        </div>

        <div className={styles.deviceTableWrap}>
          <table className={styles.deviceTable}>
            <thead>
              <tr>
                <th>Device</th>
                <th>Office</th>
                <th>Requested By</th>
                <th>Fingerprint</th>
                <th>Approval</th>
                <th>Last Used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trustedRows.map((row) => {
                const approval = statusOf(row);
                return (
                  <tr key={row.id || row.token_hash}>
                    <td>
                      <strong>{row.device_name || 'Unnamed trusted device'}</strong>
                      <span className={styles.subCell}>{row.platform || 'web'} · shared browser</span>
                    </td>
                    <td>
                      <strong>{normalizeOffice(row.office)}</strong>
                      <span className={styles.subCell}>{row.region || 'Unassigned'}</span>
                    </td>
                    <td>
                      <strong>{row.requested_by_name || 'Legacy registration'}</strong>
                      <span className={styles.subCell}>{row.requested_by_email || '—'}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.tokenCopyButton}
                        title="Copy fingerprint"
                        onClick={() => navigator.clipboard?.writeText(row.token_hash || '')}
                      >
                        {maskToken(row.token_hash)}
                      </button>
                    </td>
                    <td>
                      <span className={`${styles.deviceStatus} ${approval === 'approved' ? (row.is_active ? styles.deviceStatusActive : styles.deviceStatusInactive) : styles.deviceStatusRejected}`}>
                        {approval === 'approved' ? (row.is_active ? 'Approved' : 'Disabled') : 'Rejected'}
                      </span>
                      {approval === 'rejected' && row.rejection_reason && (
                        <span className={styles.subCell}>{row.rejection_reason}</span>
                      )}
                    </td>
                    <td>{row.last_used_at ? formatDateTime(row.last_used_at) : 'Never'}</td>
                    <td>
                      <div className={styles.deviceRowActions}>
                        {approval === 'approved' && (
                          <button type="button" className={styles.secondaryButton} onClick={() => onToggle(row)}>
                            {row.is_active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                        <button type="button" className={styles.dangerTextButton} onClick={() => onDelete(row)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && trustedRows.length === 0 && (
                <tr>
                  <td colSpan="7" className={styles.emptyTable}>No approved or rejected devices match this view.</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan="7" className={styles.emptyTable}>Loading trusted devices...</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function LiveActivityView({ groups, grouped, now, onOpen, quoteEventsByQuote, viewerRole }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <div>
          <div className={styles.headingWithDot}>
            <span className={styles.liveDot} />
            <h2>Live Activity</h2>
          </div>
          <p>Watch active quotes move through Quote → 1st Yes → 2nd Yes → 3rd Yes in real time.</p>
        </div>
        <span className={styles.countPill}>{groups.length} live</span>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          title="No live quotes right now"
          detail="As soon as an approved computer starts a quote, it will appear here automatically."
        />
      ) : (
        <div className={styles.liveRegionList}>
          {grouped.map((region) => (
            <div key={region.region} className={styles.liveRegionBlock}>
              {viewerRole === 'admin' && (
                <div className={styles.regionHeader}>
                  <strong>{region.region}</strong>
                  <span>{region.offices.reduce((sum, office) => sum + office.groups.length, 0)} active</span>
                </div>
              )}

              {region.offices.map((office) => (
                <div key={`${region.region}-${office.office}`} className={styles.liveOfficeBlock}>
                  {viewerRole !== 'supervisor' && (
                    <div className={styles.officeLiveHeader}>
                      <strong>{office.office}</strong>
                      <span>{office.groups.length} live</span>
                    </div>
                  )}
                  <div className={styles.liveDealGrid}>
                    {office.groups.map((group) => {
                    const quote = currentQuoteForGroup(group);
                    const stage = quoteStage(quote);
                    const events = reconcileTimelineEvents(quote, quoteEventsByQuote[quote.id] || []);
                    const recentEvents = events.slice(-3).reverse();
                    const drivers = Number(quote.driver_count || 0);
                    const licensed = Number(quote.drivers_with_license || 0);
                    const vehicles = Number(quote.vehicle_count || 0);
                    const fullVins = Number(quote.vehicles_with_full_vin || 0);

                    return (
                      <article key={group.key} className={`${styles.liveDealCard} ${styles[`liveDealCard_${stage.tone}`] || ''}`}>
                        <div className={styles.liveDealTop}>
                          <div>
                            <span className={styles.liveNowLabel}>
                              ● LIVE · {elapsedLabel(quote.started_at || group.lastActivityAt, now)}
                              {group.outcome?.reopenedLostDeal ? ' · RE-OPENED LOST DEAL' : ''}
                            </span>
                            <h3>{group.customerName}</h3>
                            <p>{group.agentName} · {group.office}</p>
                          </div>
                          <span className={`${styles.intentBadge} ${styles[`intentBadge_${stage.tone}`] || ''}`}>
                            {stage.label}
                          </span>
                        </div>

                        <div className={styles.liveSignalGrid}>
                          <div>
                            <span>Drivers</span>
                            <strong>{drivers ? `${licensed}/${drivers}` : '—'}</strong>
                            <small>with license</small>
                          </div>
                          <div>
                            <span>Vehicles</span>
                            <strong>{vehicles ? `${fullVins}/${vehicles}` : '—'}</strong>
                            <small>full VIN</small>
                          </div>
                          <div>
                            <span>Last activity</span>
                            <strong>{elapsedLabel(quote.last_live_activity_at || group.lastActivityAt, now)}</strong>
                            <small>ago</small>
                          </div>
                        </div>

                        <div className={styles.liveTimelineMini}>
                          {recentEvents.length === 0 ? (
                            <span className={styles.mutedText}>Waiting for the next 3 Yes milestone…</span>
                          ) : recentEvents.map((event) => (
                            <div key={event.id || `${event.event_type}-${event.event_at}`}>
                              <time>{formatDateTime(event.event_at)}</time>
                              <span>{eventDisplay(event)}</span>
                            </div>
                          ))}
                        </div>

                        <div className={styles.liveDealFooter}>
                          <span>
                            {quote.carrier || 'Carrier not selected yet'}
                            {quote.monthly_payment ? ` · ${formatMoney(quote.monthly_payment)}/mo` : ''}
                          </span>
                          <button type="button" className={styles.secondaryButton} onClick={() => onOpen(group)}>
                            View Deal
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NeedsAttentionView({
  items,
  now,
  onOpen,
  title = 'Needs Attention',
  description = 'Not-closed deals that need management review.',
  emptyTitle = 'Nothing needs attention',
  emptyDetail = 'Not-closed deals will appear here when they match this category.',
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={`${styles.countPill} ${styles.attentionCountPill}`}>{items.length}</span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          detail={emptyDetail}
        />
      ) : (
        <div className={styles.attentionDealList}>
          {items.map(({ group, attention }) => {
            const quote = group.stageQuote || currentQuoteForGroup(group);
            const drivers = Number(quote.driver_count || 0);
            const licensed = Number(quote.drivers_with_license || 0);
            const vehicles = Number(quote.vehicle_count || 0);
            const fullVins = Number(quote.vehicles_with_full_vin || 0);
            const yesStage = Math.max(0, Math.min(3, Number(group.yesStage || threeYesStage(quote) || 0)));
            const followUpAt = groupFollowUpAt(group);
            const latestNote = latestGroupNote(group);

            return (
              <article key={group.key} className={`${styles.attentionDealCard} ${styles[`attentionDealCard_${attention.level}`] || ''}`}>
                <div className={styles.attentionDealIdentity}>
                  <span className={styles.attentionPriorityLabel}>{attention.stage ? `${attention.stage}${attention.stage === 1 ? 'st' : attention.stage === 2 ? 'nd' : 'rd'} Yes` : 'Priority'}</span>
                  <h3>{group.customerName}</h3>
                  <p>{group.agentName} · {group.region} · {group.office}</p>
                  <small>Last activity {elapsedLabel(group.lastActivityAt, now)} ago</small>
                </div>

                <div className={styles.attentionReason}>
                  <strong>{attention.title}</strong>
                  <span>{attention.detail}</span>
                  <div className={styles.intentSignalsInline}>
                    <span className={licensed > 0 ? styles.signalPositive : styles.signalNeutral}>
                      {licensed > 0 ? '✓' : '—'} {drivers ? `${licensed}/${drivers}` : '0'} license{drivers === 1 ? '' : 's'}
                    </span>
                    <span className={fullVins > 0 ? styles.signalPositive : styles.signalNeutral}>
                      {fullVins > 0 ? '✓' : '—'} {vehicles ? `${fullVins}/${vehicles}` : '0'} full VIN{vehicles === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className={styles.intentSignalsInline}>
                    <span><strong>3 Yes:</strong> {yesStage}/3</span>
                    <span><strong>Follow-up:</strong> {followUpAt ? formatDateTime(followUpAt) : 'Not entered'}</span>
                  </div>
                  <span className={styles.subCell}>
                    <strong>Latest note:</strong> {latestNote?.text ? briefText(latestNote.text, 110) : 'No note entered'}
                  </span>
                </div>

                <div className={styles.attentionDealQuote}>
                  <span>{quote.carrier || 'No carrier recorded'}</span>
                  <strong>{formatMoney(quote.monthly_payment)} / mo</strong>
                  <small>{quote.bridge_policy_status || 'No closing reason listed'}</small>
                </div>

                <div className={styles.attentionActionBox}>
                  <strong>Recommended action</strong>
                  <span>Review the deal stage, closing reason, and customer follow-up.</span>
                  <button type="button" className={styles.primarySmallButton} onClick={() => onOpen(group)}>
                    Review Deal
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QuoteBucketView({
  title,
  description,
  groups,
  now,
  onOpen,
  emptyTitle,
  emptyDetail,
  mode,
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={`${styles.countPill} ${mode === 'closed' ? styles.closedCountPill : ''}`}>{groups.length}</span>
      </div>

      {groups.length === 0 ? (
        <EmptyState title={emptyTitle} detail={emptyDetail} />
      ) : (
        <div className={styles.bucketTableWrap}>
          <table className={styles.bucketTable}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Region / Office</th>
                <th>Agent</th>
                <th>{mode === 'closed' ? 'Carrier' : 'At a Glance'}</th>
                <th>{mode === 'closed' ? 'Monthly' : 'Status'}</th>
                <th>Last Activity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const quote = currentQuoteForGroup(group);
                const drivers = Number(quote.driver_count || 0);
                const licensed = Number(quote.drivers_with_license || 0);
                const vehicles = Number(quote.vehicle_count || 0);
                const fullVins = Number(quote.vehicles_with_full_vin || 0);
                const yesStage = Math.max(0, Math.min(3, Number(group.yesStage || threeYesStage(quote) || 0)));
                const followUpAt = groupFollowUpAt(group);
                const latestNote = latestGroupNote(group);

                return (
                  <tr key={group.key}>
                    <td>
                      <strong>{group.customerName}</strong>
                      <span className={styles.subCell}>Customer #{group.matrixCustomerId || 'N/A'}</span>
                    </td>
                    <td>
                      <strong>{group.office}</strong>
                      <span className={styles.subCell}>{group.region}</span>
                    </td>
                    <td>{group.agentName}</td>
                    <td>
                      {mode === 'closed' ? (
                        <>
                          <strong>{quote.carrier || '—'}</strong>
                          <span className={styles.subCell}>{formatMoney(quote.total_premium)} premium</span>
                        </>
                      ) : (
                        <>
                          <strong>3 Yes: {yesStage}/3</strong>
                          <span className={styles.subCell}>
                            ID / VIN: {licensed}/{drivers || 0} DL · {fullVins}/{vehicles || 0} VIN
                          </span>
                          <span className={styles.subCell}>
                            Follow-up: {followUpAt ? formatDateTime(followUpAt) : 'Not entered'}
                          </span>
                          <span className={styles.subCell} title={latestNote?.text || ''}>
                            Note: {latestNote?.text ? briefText(latestNote.text) : 'No note entered'}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {mode === 'closed' ? (
                        <strong>{formatMoney(quote.monthly_payment)}</strong>
                      ) : (
                        <span className={styles.lowIntentBadge}>
                          {isDidNotRewriteGroup(group)
                            ? 'Stayed With Current Carrier'
                            : quote.bridge_policy_status || (getDisplayStatus(quote, now) === 'stale' ? 'Incomplete / stale' : 'Quote')}
                        </span>
                      )}
                    </td>
                    <td>
                      {formatDateTime(group.lastActivityAt)}
                      <span className={styles.subCell}>{elapsedLabel(group.lastActivityAt, now)} ago</span>
                    </td>
                    <td>
                      <button type="button" className={styles.secondaryButton} onClick={() => onOpen(group)}>
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CustomerDrawer({
  group,
  now,
  onClose,
  agentEntry,
  setAgentEntry,
  saveCustomerOutcome,
  saving,
  saveMessage,
  quoteEventsByQuote,
  internalNotesByQuote,
}) {
  const latest = group.quotes[0] || {};
  const drivers = safeArray(latest.drivers_summary);
  const vehicles = safeArray(latest.vehicles_summary);
  const events = reconcileTimelineEvents(latest, quoteEventsByQuote?.[latest.id] || []);
  const internalNotes = group.quotes
    .flatMap((quote) => internalNotesByQuote?.[quote.id] || [])
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const stage = quoteStage(latest);
  const licensed = Number(latest.drivers_with_license || 0);
  const driverCount = Number(latest.driver_count || drivers.length || 0);
  const fullVins = Number(latest.vehicles_with_full_vin || 0);
  const vehicleCount = Number(latest.vehicle_count || vehicles.length || 0);
  const completedAt = latest.bridged_back_at || latest.updated_at || null;

  return (
    <div className={styles.drawerBackdrop} role="presentation" onMouseDown={onClose}>
      <aside className={`${styles.drawer} ${styles.drawerWide}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.drawerHeader}>
          <div>
            <p className={styles.eyebrow}>Customer Quote Details</p>
            <h2>{group.customerName}</h2>
            <p>{group.agentName} · {group.region} · {group.office}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close details">×</button>
        </div>

        <div className={styles.drawerBody}>
          <section className={styles.dealHero}>
            <div className={styles.dealHeroIdentity}>
              <div>
                <span>Customer</span>
                <strong>{group.customerName}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{group.phone || latest.phone || '—'}</strong>
              </div>
              <div>
                <span>Customer #</span>
                <strong>{latest.matrix_customer_id || '—'}</strong>
              </div>
              <div>
                <span>Quote #</span>
                <strong>{latest.matrix_quote_id || '—'}</strong>
              </div>
              <div>
                <span>Rater #</span>
                <strong>{latest.rater_id || '—'}</strong>
              </div>
              <div>
                <span>Lead Source</span>
                <strong>{latest.lead_source || '—'}</strong>
              </div>
            </div>

            <div className={`${styles.threeYesBanner} ${styles[`threeYesBanner_${stage.tone}`] || ''}`}>
              <div>
                <span>3 Yes Deal Stage</span>
                <strong>{stage.label}</strong>
                <small>{threeYesEvidenceLabel(latest)}</small>
                <small>{quoteBusinessTypeLabel(latest)}{inferQuoteBusinessType(latest) === 'existing_client' ? ` · ${existingClientReasonLabel(latest)}` : ''}</small>
              </div>
              <div className={styles.threeYesSteps}>
                <span className={firstYesConfirmed(latest) ? styles.yesStepOn : styles.yesStepOff}>1st Yes</span>
                <span className={secondYesConfirmed(latest) ? styles.yesStepOn : styles.yesStepOff}>2nd Yes</span>
                <span className={thirdYesConfirmed(latest) ? styles.yesStepOn : styles.yesStepOff}>3rd Yes</span>
              </div>
            </div>
          </section>

          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHeading}>
              <div>
                <h3>Drivers</h3>
                <p>{licensed}/{driverCount || 0} with license entered. License numbers are never displayed.</p>
              </div>
            </div>
            <div className={styles.driverGrid}>
              <div className={styles.driverGridHeader}>
                <span>Driver</span>
                <span>DOB</span>
                <span>Type</span>
                <span>License Entered</span>
              </div>

              {drivers.map((driver) => (
                <div className={styles.driverGridRow} key={driver.index || driver.name}>
                  <strong>{driver.name || `Driver ${driver.index || ''}`}</strong>
                  <span>{driver.dob || '—'}</span>
                  <span>{driver.driverType || '—'}</span>
                  <span>
                    {driver.licenseEntered ? (
                      <span className={styles.enteredBadge}>✓ Entered</span>
                    ) : (
                      <span className={styles.notEnteredBadge}>—</span>
                    )}
                  </span>
                </div>
              ))}

              {drivers.length === 0 && (
                <div className={styles.detailGridEmpty}>No driver snapshot captured for this quote.</div>
              )}
            </div>
          </section>

          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHeading}>
              <div>
                <h3>Vehicles</h3>
                <p>{fullVins}/{vehicleCount || 0} with a full 17-character VIN. Actual VINs are never displayed.</p>
              </div>
            </div>
            <div className={styles.vehicleGrid}>
              <div className={styles.vehicleGridHeader}>
                <span>Vehicle</span>
                <span>VIN Status</span>
              </div>

              {vehicles.map((vehicle) => (
                <div className={styles.vehicleGridRow} key={vehicle.index || `${vehicle.year}-${vehicle.make}-${vehicle.model}`}>
                  <strong>
                    {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || `Vehicle ${vehicle.index || ''}`}
                  </strong>
                  <span>
                    {vehicle.fullVinEntered ? (
                      <span className={styles.enteredBadge}>✓ Full VIN entered</span>
                    ) : vehicle.vinPresent ? (
                      <span className={styles.partialVinBadge}>Partial / ITC VIN</span>
                    ) : (
                      <span className={styles.notEnteredBadge}>—</span>
                    )}
                  </span>
                </div>
              ))}

              {vehicles.length === 0 && (
                <div className={styles.detailGridEmpty}>No vehicle snapshot captured for this quote.</div>
              )}
            </div>
          </section>

          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHeading}>
              <div>
                <h3>Quote & Pricing</h3>
                <p>Current carrier, pricing, lifecycle, and captured TurboRater status.</p>
              </div>
            </div>
            <div className={styles.quoteDetailGrid}>
              <BridgeField label="Agent" value={group.agentName} />
              <BridgeField label="Office" value={latest.office || group.office} />
              <BridgeField label="Quote Type" value={quoteBusinessTypeLabel(latest)} />
              <BridgeField label="3 Yes Stage" value={stage.label} />
              <BridgeField label="Carrier" value={latest.carrier} />
              <BridgeField label="Premium" value={formatMoney(latest.total_premium)} />
              <BridgeField label="Down Payment" value={formatMoney(latest.down_payment)} />
              <BridgeField label="Monthly Payment" value={formatMoney(latest.monthly_payment)} />
              <BridgeField label="Started" value={formatDateTime(latest.started_at)} />
              <BridgeField label="Completed" value={formatDateTime(completedAt)} />
              <BridgeField label="Quote Status" value={String(latest.status || '—').toUpperCase()} />
              <BridgeField label="TurboRater Policy Status" value={latest.bridge_policy_status || 'Reason not listed'} />
              <BridgeField label="Sync" value="SYNCED" />
              <BridgeField label="Supabase Quote" value={latest.id} mono />
            </div>
          </section>

          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHeading}>
              <div>
                <h3>Notes & Internal History</h3>
                <p>Quote notes plus the running agent / supervisor / admin note history.</p>
              </div>
            </div>

            {latest.captured_note && (
              <div className={styles.quoteNotesCard}>
                <span className={styles.noteSourceLabel}>TurboRater Quote Note</span>
                <strong>{latest.captured_note}</strong>
                <div>
                  <span>Entered: {latest.note_entered_at || '—'}</span>
                  <span>Entered By: {latest.note_entered_by || '—'}</span>
                </div>
              </div>
            )}

            <div className={styles.internalNoteHistory}>
              {internalNotes.map((note) => (
                <article key={note.id} className={styles.internalNoteItem}>
                  <div className={styles.internalNoteMeta}>
                    <strong>{note.author_name || note.author_email || 'Internal User'}</strong>
                    <span className={styles.internalRoleBadge}>
                      {note.note_source === 'supervisor_override'
                        ? 'Supervisor Override'
                        : note.note_source === 'admin_override'
                          ? 'Admin Override'
                          : cleanStr(note.author_role || note.note_source || 'internal').replaceAll('_', ' ')}
                    </span>
                    <time>{formatDateTime(note.created_at)}</time>
                  </div>
                  <p>{note.note_text}</p>
                </article>
              ))}

              {internalNotes.length === 0 && !latest.captured_note && (
                <div className={styles.emptyState}>
                  <strong>No notes yet</strong>
                  <span>New internal notes will appear here in chronological history.</span>
                </div>
              )}
            </div>
          </section>

          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHeading}>
              <div>
                <h3>Deal Timeline</h3>
                <p>Business milestones only. Temporary duplicated ITC vehicle/driver events are reconciled against the final snapshot.</p>
              </div>
            </div>
            <div className={styles.dealTimeline}>
              {events.map((event) => (
                <div key={event.id || `${event.event_type}-${event.event_at}`} className={styles.timelineRow}>
                  <span className={styles.timelineDot} />
                  <time>{formatDateTime(event.event_at)}</time>
                  <strong>{eventDisplay(event)}</strong>
                </div>
              ))}
              {events.length === 0 && <div className={styles.emptyState}><strong>No timeline events yet</strong><span>New v0.11 quotes will build a milestone timeline automatically.</span></div>}
            </div>
          </section>

          <details className={styles.supervisorTools}>
            <summary>Supervisor tools</summary>
            <div className={styles.supervisorToolsBody}>
              <p>Use only when an administrative override or follow-up note is needed. Agent-side disposition remains the preferred source.</p>
              <form className={styles.outcomeForm} onSubmit={saveCustomerOutcome}>
                <label>
                  <span>Quote Type</span>
                  <select
                    value={agentEntry.business_type}
                    onChange={(e) => setAgentEntry((current) => ({
                      ...current,
                      business_type: e.target.value,
                      existing_client_reason: e.target.value === 'existing_client' ? current.existing_client_reason : '',
                    }))}
                  >
                    {QUOTE_BUSINESS_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>

                {agentEntry.business_type === 'existing_client' && (
                  <label>
                    <span>Existing Client Type</span>
                    <select value={agentEntry.existing_client_reason} onChange={(e) => setAgentEntry((current) => ({ ...current, existing_client_reason: e.target.value }))}>
                      <option value="">Select type…</option>
                      {EXISTING_CLIENT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                )}

                <label>
                  <span>1st Yes - Ready to Start Now?</span>
                  <select value={agentEntry.first_yes} onChange={(e) => setAgentEntry((current) => ({ ...current, first_yes: e.target.value }))}>
                    <option value="">Not recorded</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                  <small>If we find a price they like, are they ready to start the policy right now?</small>
                </label>

                <label>
                  <span>2nd Yes - ID / License + VIN</span>
                  <select value={agentEntry.second_yes} onChange={(e) => setAgentEntry((current) => ({ ...current, second_yes: e.target.value }))}>
                    <option value="auto">Use system detection</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                  <small>System detection currently requires at least one license plus one full 17-character VIN.</small>
                </label>

                <label>
                  <span>3rd Yes - Payment Method</span>
                  <select value={agentEntry.payment_method} onChange={(e) => setAgentEntry((current) => ({ ...current, payment_method: e.target.value }))}>
                    <option value="">Not recorded</option>
                    {PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <small>Cash or Card = 3rd Yes. Neither keeps the customer at quote / follow-up stage.</small>
                </label>

                <label>
                  <span>Outcome</span>
                  <select
                    value={agentEntry.status}
                    onChange={(e) => setAgentEntry((current) => ({
                      ...current,
                      status: e.target.value,
                      reason: e.target.value === 'not_closed' ? current.reason : '',
                      follow_up_at: e.target.value === 'follow_up' ? current.follow_up_at : '',
                    }))}
                  >
                    <option value="">Select outcome…</option>
                    <option value="closed">Closed</option>
                    <option value="not_closed">Not Closed</option>
                    <option value="follow_up">Follow Up</option>
                  </select>
                </label>

                {agentEntry.status === 'not_closed' && (
                  <label>
                    <span>Why Not Closed</span>
                    <select value={agentEntry.reason} onChange={(e) => setAgentEntry((current) => ({ ...current, reason: e.target.value }))}>
                      <option value="">Select reason…</option>
                      {NOT_CLOSED_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      {agentEntry.business_type === 'existing_client' &&
                        EXISTING_CLIENT_NOT_CLOSED_REASONS.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                  </label>
                )}

                {agentEntry.status === 'follow_up' && (
                  <label>
                    <span>Follow-Up Date / Time</span>
                    <input type="datetime-local" value={agentEntry.follow_up_at} onChange={(e) => setAgentEntry((current) => ({ ...current, follow_up_at: e.target.value }))} />
                  </label>
                )}

                <label className={styles.fullWidthField}>
                  <span>Add Internal Note</span>
                  <textarea rows="3" value={agentEntry.notes} onChange={(e) => setAgentEntry((current) => ({ ...current, notes: e.target.value }))} placeholder="Add a new internal note. Previous notes are preserved in history..." />
                </label>

                <div className={styles.formActions}>
                  {saveMessage && <span className={saveMessage.startsWith('Save failed') ? styles.saveError : styles.saveSuccess}>{saveMessage}</span>}
                  <button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? 'Saving…' : 'Save Override'}</button>
                </div>
              </form>
            </div>
          </details>

          {group.quotes.length > 1 && (
            <section className={styles.drawerSection}>
              <div className={styles.drawerSectionHeading}>
                <div>
                  <h3>Other Quote Attempts</h3>
                  <p>{group.quotes.length - 1} additional quote record{group.quotes.length === 2 ? '' : 's'} for this customer.</p>
                </div>
              </div>
              <div className={styles.bridgeList}>
                {group.quotes.slice(1).map((quote) => (
                  <details key={quote.id} className={styles.bridgeItem}>
                    <summary>
                      <div><strong>{quote.carrier || 'Quote attempt'}</strong><span>{formatDateTime(quote.started_at)} · {formatMoney(quote.monthly_payment)}/mo</span></div>
                      <QuoteLifecycleBadge status={getDisplayStatus(quote, now)} />
                    </summary>
                    <div className={styles.bridgeGrid}>
                      <BridgeField label="Carrier" value={quote.carrier} />
                      <BridgeField label="Premium" value={formatMoney(quote.total_premium)} />
                      <BridgeField label="Monthly Payment" value={formatMoney(quote.monthly_payment)} />
                      <BridgeField label="TurboRater Status" value={quote.bridge_policy_status} />
                      <BridgeField label="Matrix Quote ID" value={quote.matrix_quote_id} mono />
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function DashboardStat({ label, value, note = '', tone = 'default' }) {
  return (
    <div className={`${styles.statCard} ${styles[`statCard_${tone}`] || ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function QuoteLifecycleBadge({ status }) {
  const labels = {
    completed: 'Completed',
    in_progress: 'In Progress',
    stale: 'Stale',
    unknown: 'Unknown',
  };

  return (
    <span className={`${styles.lifecycleBadge} ${styles[`lifecycle_${status}`] || styles.lifecycle_unknown}`}>
      {labels[status] || status}
    </span>
  );
}

function BridgeField({ label, value, mono = false }) {
  return (
    <div className={styles.bridgeField}>
      <span>{label}</span>
      <strong className={mono ? styles.mono : ''}>{value || '—'}</strong>
    </div>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className={styles.emptyState}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}
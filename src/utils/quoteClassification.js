// src/utils/quoteClassification.js
// Central quote classification rules shared by Admin, Regional, Supervisor, and Agent views.
//
// Modern capture (v0.11.7+) uses explicit telemetry:
//   carrier_bridge_started_at  -> actual carrier launch
//   carrier_bridge_carrier     -> carrier actually launched
//   matrix_bridge_back_at      -> explicit Agency Matrix return
//   bridge_policy_status_value -> Bound when policy was bound
//   system_outcome_signal      -> sold | not_sold | unknown
//
// Legacy records are still supported while older extension versions remain in use.

export const STALE_AFTER_MS = 60 * 60 * 1000;

export const QUOTE_PRIMARY_BUCKETS = Object.freeze({
  LIVE: 'live',
  ATTENTION: 'needs_attention',
  QUOTE: 'quote',
  FOLLOW_UP: 'follow_up',
  CLOSED: 'closed',
});

export const ATTENTION_CATEGORIES = Object.freeze({
  LOST_DEAL: 'lost_deal',
  WALK: 'walk',
  CARRIER_NO_RETURN: 'carrier_no_matrix_return',
  CARRIER_RETURN_NO_OUTCOME: 'carrier_return_no_outcome',
  CARRIER_NO_OUTCOME: 'carrier_no_outcome',
  STALE_YES: 'stale_yes',
  LEGACY_STALE: 'legacy_stale',
});

export const EXISTING_CLIENT_REASONS = Object.freeze([
  ['payment', 'Payment'],
  ['rewrite_endorsement', 'Endorsement Comparison'],
  ['renewal', 'Renewal'],
  ['reinstatement', 'Reinstatement'],
  ['rewrite_recent_policy', 'Re-Write - Policy Within Last 6 Months'],
]);

const FINAL_NOT_CLOSED_OUTCOMES = new Set([
  'lost_deal',
  'walk',
  'did_not_rw_stayed_current_carrier',
  'did_not_rewrite_current_carrier',
  'driving_record_price_increase',
  'underwriting_carrier_decline',
  'down_payment_over_budget',
  'cannot_beat_current_monthly',
  'overall_price_too_high',
  'price_changed_after_rating',
  'coverage_price_too_high',
  'no_competitive_market',
  'customer_shopping',
  'needs_time_decision_maker',
  'no_better_price',
  'customer_declined',
  'existing_policy_retained',
  'not_eligible',
  'other',
]);

export function cleanQuoteString(value) {
  return String(value ?? '').replace(/\r/g, '').trim();
}

export function normalizeQuoteOffice(officeRaw = '') {
  const match = String(officeRaw || '').match(/CA\d{3}/i);
  return match
    ? match[0].toUpperCase()
    : cleanQuoteString(officeRaw) || 'Unknown';
}

export function getQuoteDisplayStatus(
  quote,
  now = Date.now(),
  staleAfterMs = STALE_AFTER_MS
) {
  if (!quote) return 'unknown';

  if (
    quote.status === 'bridged_back' ||
    quote.bridged_back_at ||
    quote.matrix_bridge_back_at
  ) {
    return 'completed';
  }

  if (quote.status === 'in_progress') {
    const activityAt =
      quote.last_live_activity_at ||
      quote.updated_at ||
      quote.started_at ||
      quote.created_at;

    const activityMs = new Date(activityAt || 0).getTime();

    if (
      Number.isFinite(activityMs) &&
      now - activityMs >= staleAfterMs
    ) {
      return 'stale';
    }

    return 'in_progress';
  }

  return quote.status || 'unknown';
}

export function hasLicenseSignal(quote) {
  return Boolean(
    quote?.any_license_entered ||
      Number(quote?.drivers_with_license || 0) > 0
  );
}

export function hasFullVinSignal(quote) {
  return Boolean(
    quote?.any_full_vin_entered ||
      Number(quote?.vehicles_with_full_vin || 0) > 0
  );
}

export function firstYesConfirmed(quote) {
  return quote?.first_yes_ready_now === true;
}

export function secondYesConfirmed(quote) {
  if (quote?.second_yes_id_vin === true) return true;
  if (quote?.second_yes_id_vin === false) return false;

  return hasLicenseSignal(quote) && hasFullVinSignal(quote);
}

export function isModernCapture(quote) {
  if (!quote) return false;

  // Explicit telemetry is authoritative regardless of version text.
  if (
    quote.carrier_bridge_started_at ||
    quote.carrier_bridge_carrier ||
    quote.matrix_bridge_back_at
  ) {
    return true;
  }

  const version = cleanQuoteString(quote.extension_version).replace(
    /^v/i,
    ''
  );

  if (!version) return false;

  const parts = version.split('.').map((part) => Number(part));

  if (parts.some((part) => !Number.isFinite(part))) return false;

  const [major = 0, minor = 0, patch = 0] = parts;

  if (major > 0) return true;
  if (minor > 11) return true;

  return minor === 11 && patch >= 7;
}

export function hasCarrierBridge(quote) {
  if (!quote) return false;

  if (isModernCapture(quote)) {
    return Boolean(
      quote.carrier_bridge_started_at ||
        quote.carrier_bridge_carrier
    );
  }

  // Legacy fallback only.
  // Do not use carrier name by itself for modern captures.
  return Boolean(
    quote.carrier_bridge_started_at ||
      quote.carrier_bridge_carrier ||
      quote.policy_bound_detected ||
      quote.system_outcome_signal === 'sold' ||
      cleanQuoteString(
        quote.bridge_policy_status_value
      ).toLowerCase() === 'bound' ||
      cleanQuoteString(
        quote.bridge_policy_status
      ).toLowerCase() === 'policy bound'
  );
}

export function hasMatrixBridgeBack(quote) {
  return Boolean(
    quote?.matrix_bridge_back_at ||
      quote?.bridged_back_at ||
      quote?.status === 'bridged_back'
  );
}

export function isPolicyBound(quote) {
  if (!quote) return false;

  // Manual Supervisor/Admin Closed override.
  const workflowOutcome = cleanQuoteString(
    quote.outcome
  ).toLowerCase();

  // Extension/TurboRater system signal.
  const outcomeSignal = cleanQuoteString(
    quote.system_outcome_signal
  ).toLowerCase();

  const policyValue = cleanQuoteString(
    quote.bridge_policy_status_value
  ).toLowerCase();

  const policyLabel = cleanQuoteString(
    quote.bridge_policy_status
  ).toLowerCase();

  return Boolean(
    workflowOutcome === 'sold' ||
      quote.policy_bound_detected === true ||
      outcomeSignal === 'sold' ||
      policyValue === 'bound' ||
      policyLabel === 'policy bound'
  );
}

export function isFollowUpQuote(quote) {
  const outcome = cleanQuoteString(
    quote?.outcome
  ).toLowerCase();

  return Boolean(
    outcome === 'follow_up' ||
      quote?.follow_up_needed === true ||
      quote?.follow_up_at
  );
}

export function isExplicitNotClosedQuote(quote) {
  const outcome = cleanQuoteString(
    quote?.outcome
  ).toLowerCase();

  return FINAL_NOT_CLOSED_OUTCOMES.has(outcome);
}

export function thirdYesConfirmed(quote) {
  if (quote?.third_yes_payment_ready === true) return true;
  if (quote?.third_yes_payment_ready === false) return false;

  const payment = cleanQuoteString(
    quote?.payment_method
  ).toLowerCase();

  if (payment === 'cash' || payment === 'card') return true;

  // Modern records:
  // An actual carrier launch after 2nd Yes is the strongest
  // system fallback for 3rd-Yes progression.
  // Matrix return alone does NOT count.
  if (isModernCapture(quote)) {
    return (
      secondYesConfirmed(quote) &&
      hasCarrierBridge(quote)
    );
  }

  // Legacy fallback preserves historical behavior until
  // old extensions are retired.
  return (
    secondYesConfirmed(quote) &&
    Boolean(
      hasCarrierBridge(quote) ||
        quote?.bridged_back_at ||
        quote?.status === 'bridged_back' ||
        quote?.carrier
    )
  );
}

export function getThreeYesStage(quote) {
  if (thirdYesConfirmed(quote)) return 3;
  if (secondYesConfirmed(quote)) return 2;
  if (firstYesConfirmed(quote)) return 1;

  return 0;
}

export function inferQuoteBusinessType(quote) {
  const explicit = cleanQuoteString(
    quote?.quote_business_type
  ).toLowerCase();

  if (
    explicit === 'new_business' ||
    explicit === 'existing_client'
  ) {
    return explicit;
  }

  const source = cleanQuoteString(
    quote?.lead_source
  ).toLowerCase();

  if (
    /re[- ]?write|rewrite|renew|reinstat|endorsement|existing|payment/.test(
      source
    )
  ) {
    return 'existing_client';
  }

  return 'new_business';
}

export function inferExistingClientReason(quote) {
  const explicit = cleanQuoteString(
    quote?.existing_client_reason
  ).toLowerCase();

  if (
    EXISTING_CLIENT_REASONS.some(
      ([value]) => value === explicit
    )
  ) {
    return explicit;
  }

  const source = cleanQuoteString(
    quote?.lead_source
  ).toLowerCase();

  if (/payment/.test(source)) return 'payment';

  if (/endorsement/.test(source)) {
    return 'rewrite_endorsement';
  }

  if (/renewal/.test(source)) return 'renewal';

  if (/reinstat/.test(source)) {
    return 'reinstatement';
  }

  if (
    /re[- ]?write|rewrite|prior policy|previous policy/.test(
      source
    )
  ) {
    return 'rewrite_recent_policy';
  }

  return '';
}

export function getCaptureGeneration(quote) {
  return isModernCapture(quote)
    ? 'modern'
    : 'legacy';
}

function attentionResult({
  category,
  title,
  detail,
  level,
  sortValue,
  stage = 0,
  quote,
  helpRequested = false,
  dealSave = null,
}) {
  return {
    category,
    title,
    detail,
    level,
    sortValue,
    stage,
    quote,
    helpRequested,
    dealSave,
  };
}

export function getQuoteAttentionReason(
  quote,
  options = {}
) {
  if (!quote) return null;

  const {
    now = Date.now(),
    staleAfterMs = STALE_AFTER_MS,
    dealSave = quote.latest_deal_save_request || null,
  } = options;

  const outcome = cleanQuoteString(
    quote.outcome
  ).toLowerCase();

  const displayStatus = getQuoteDisplayStatus(
    quote,
    now,
    staleAfterMs
  );

  const stage = getThreeYesStage(quote);

  const helpRequested = Boolean(dealSave?.id);

  // Explicit final states always win over
  // inferred attention states.
  if (
    isPolicyBound(quote) ||
    isFollowUpQuote(quote)
  ) {
    return null;
  }

  if (
    outcome === 'lost_deal' ||
    (
      isExplicitNotClosedQuote(quote) &&
      helpRequested
    )
  ) {
    return attentionResult({
      category: ATTENTION_CATEGORIES.LOST_DEAL,
      title: 'Lost Deal',
      detail: helpRequested
        ? 'Deal Save help was requested, but the customer still did not close.'
        : 'The customer was recorded as a Lost Deal.',
      level: 'critical',
      sortValue: 0,
      stage,
      quote,
      helpRequested,
      dealSave,
    });
  }

  if (outcome === 'walk') {
    return attentionResult({
      category: ATTENTION_CATEGORIES.WALK,
      title: 'Walk',
      detail:
        'The customer did not close and no successful save outcome was recorded.',
      level: 'high',
      sortValue: 1,
      stage,
      quote,
      helpRequested,
      dealSave,
    });
  }

  const carrierBridged = hasCarrierBridge(quote);

  const matrixReturned =
    hasMatrixBridgeBack(quote);

  const unresolved =
    !isExplicitNotClosedQuote(quote) &&
    !isPolicyBound(quote) &&
    !isFollowUpQuote(quote);

  const staleOrCompleted =
    displayStatus === 'stale' ||
    displayStatus === 'completed';

  // Modern authoritative carrier telemetry gets
  // priority over generic 3-Yes rules.
  if (
    isModernCapture(quote) &&
    carrierBridged &&
    unresolved
  ) {
    if (
      !matrixReturned &&
      displayStatus === 'stale'
    ) {
      return attentionResult({
        category:
          ATTENTION_CATEGORIES.CARRIER_NO_RETURN,

        title:
          'Carrier Bridge - No Matrix Return',

        detail:
          'A carrier was launched, but the quote went stale without an Agency Matrix return or final outcome.',

        level: 'critical',
        sortValue: 2,
        stage,
        quote,
        helpRequested,
        dealSave,
      });
    }

    if (matrixReturned) {
      return attentionResult({
        category:
          ATTENTION_CATEGORIES
            .CARRIER_RETURN_NO_OUTCOME,

        title:
          'Carrier Bridge - Returned Without Outcome',

        detail:
          'The agent launched a carrier and returned to Agency Matrix, but no Closed, Follow Up, Lost Deal, or Walk outcome was recorded.',

        level: 'critical',
        sortValue: 3,
        stage,
        quote,
        helpRequested,
        dealSave,
      });
    }

    if (displayStatus !== 'in_progress') {
      return attentionResult({
        category:
          ATTENTION_CATEGORIES.CARRIER_NO_OUTCOME,

        title:
          'Carrier Bridge - No Outcome',

        detail:
          'A carrier was launched, but no final quote outcome was recorded.',

        level: 'high',
        sortValue: 4,
        stage,
        quote,
        helpRequested,
        dealSave,
      });
    }
  }

  if (
    unresolved &&
    stage > 0 &&
    staleOrCompleted
  ) {
    const ordinal =
      stage === 1
        ? '1st'
        : stage === 2
          ? '2nd'
          : '3rd';

    return attentionResult({
      category:
        ATTENTION_CATEGORIES.STALE_YES,

      title:
        `${ordinal} Yes - No Outcome`,

      detail:
        displayStatus === 'completed'
          ? `Customer reached the ${ordinal} Yes stage and returned to Matrix, but no final Closed, Follow Up, Lost Deal, or Walk outcome was recorded.`
          : `Customer reached the ${ordinal} Yes stage, but the quote went stale without a final outcome.`,

      level:
        stage >= 2
          ? 'high'
          : 'medium',

      sortValue:
        stage === 3
          ? 5
          : stage === 2
            ? 6
            : 7,

      stage,
      quote,
      helpRequested,
      dealSave,
    });
  }

  return null;
}

export function classifyQuote(
  quote,
  options = {}
) {
  if (!quote) {
    return {
      primary:
        QUOTE_PRIMARY_BUCKETS.QUOTE,

      live: false,
      attention: null,
      captureGeneration: 'legacy',
      reason: 'No quote data',
    };
  }

  const now =
    options.now ?? Date.now();

  const staleAfterMs =
    options.staleAfterMs ??
    STALE_AFTER_MS;

  const displayStatus =
    getQuoteDisplayStatus(
      quote,
      now,
      staleAfterMs
    );

  const live =
    displayStatus === 'in_progress';

  const captureGeneration =
    getCaptureGeneration(quote);

  // 1. Closed wins over every inferred state.
  // This includes:
  // - Supervisor/Admin workflow outcome = sold
  // - POLICY_BOUND event
  // - system_outcome_signal = sold
  // - TurboRater Bound status
  if (isPolicyBound(quote)) {
    return {
      primary:
        QUOTE_PRIMARY_BUCKETS.CLOSED,

      live: false,
      attention: null,
      captureGeneration,
      reason: 'Policy Bound',
    };
  }

  // 2. Intentional follow-up is a valid
  // disposition, not unresolved attention.
  if (isFollowUpQuote(quote)) {
    return {
      primary:
        QUOTE_PRIMARY_BUCKETS.FOLLOW_UP,

      live: false,
      attention: null,
      captureGeneration,
      reason: 'Follow Up',
    };
  }

  // 3. Explicit not-closed outcomes and
  // unresolved carrier / 3-Yes opportunities.
  const attention =
    getQuoteAttentionReason(
      quote,
      {
        ...options,
        now,
        staleAfterMs,
      }
    );

  if (attention) {
    return {
      primary:
        QUOTE_PRIMARY_BUCKETS.ATTENTION,

      live,
      attention,
      captureGeneration,
      reason: attention.title,
    };
  }

  // 4. A currently active quote remains visible
  // in Live Activity, while its primary business
  // bucket remains quote until a final state is known.
  return {
    primary:
      QUOTE_PRIMARY_BUCKETS.QUOTE,

    live,
    attention: null,
    captureGeneration,

    reason:
      live
        ? 'Active Quote'
        : 'Regular Quote',
  };
}

function latestQuoteTimestamp(quote) {
  return new Date(
    quote?.last_live_activity_at ||
      quote?.updated_at ||
      quote?.matrix_bridge_back_at ||
      quote?.bridged_back_at ||
      quote?.started_at ||
      quote?.created_at ||
      0
  ).getTime();
}

export function getGroupPrimaryQuote(group) {
  const rows =
    Array.isArray(group?.quotes)
      ? [...group.quotes]
      : [];

  rows.sort(
    (a, b) =>
      latestQuoteTimestamp(b) -
      latestQuoteTimestamp(a)
  );

  return rows[0] || group?.latest || null;
}

export function classifyQuoteGroup(
  group,
  options = {}
) {
  const rows =
    Array.isArray(group?.quotes)
      ? [...group.quotes]
      : [];

  rows.sort(
    (a, b) =>
      latestQuoteTimestamp(b) -
      latestQuoteTimestamp(a)
  );

  if (!rows.length) {
    return {
      primary:
        QUOTE_PRIMARY_BUCKETS.QUOTE,

      live: false,
      attention: null,
      captureGeneration: 'legacy',
      reason: 'No quote data',
      quote: null,
    };
  }

  const latest = rows[0];

  // A new active attempt supersedes an older
  // historical disposition for the current view.
  // Historical rows remain available in history.
  if (
    getQuoteDisplayStatus(
      latest,
      options.now ?? Date.now(),
      options.staleAfterMs ??
        STALE_AFTER_MS
    ) === 'in_progress'
  ) {
    const latestClassification =
      classifyQuote(
        latest,
        options
      );

    return {
      ...latestClassification,
      quote: latest,
    };
  }

  // Explicit workflow dispositions on the
  // latest attempt win.
  const latestClassification =
    classifyQuote(
      latest,
      options
    );

  if (
    latestClassification.primary !==
      QUOTE_PRIMARY_BUCKETS.QUOTE ||
    latestClassification.attention
  ) {
    return {
      ...latestClassification,
      quote: latest,
    };
  }

  // Otherwise use the newest meaningful
  // historical result.
  for (const quote of rows) {
    const classification =
      classifyQuote(
        quote,
        options
      );

    if (
      classification.primary ===
        QUOTE_PRIMARY_BUCKETS.CLOSED ||
      classification.primary ===
        QUOTE_PRIMARY_BUCKETS.FOLLOW_UP ||
      classification.primary ===
        QUOTE_PRIMARY_BUCKETS.ATTENTION
    ) {
      return {
        ...classification,
        quote,
      };
    }
  }

  return {
    ...latestClassification,
    quote: latest,
  };
}

export function isGroupClosed(
  group,
  options = {}
) {
  return (
    classifyQuoteGroup(
      group,
      options
    ).primary ===
    QUOTE_PRIMARY_BUCKETS.CLOSED
  );
}

export function isGroupFollowUp(
  group,
  options = {}
) {
  return (
    classifyQuoteGroup(
      group,
      options
    ).primary ===
    QUOTE_PRIMARY_BUCKETS.FOLLOW_UP
  );
}

export function isGroupNeedsAttention(
  group,
  options = {}
) {
  return (
    classifyQuoteGroup(
      group,
      options
    ).primary ===
    QUOTE_PRIMARY_BUCKETS.ATTENTION
  );
}

export function isGroupRegularQuote(
  group,
  options = {}
) {
  return (
    classifyQuoteGroup(
      group,
      options
    ).primary ===
    QUOTE_PRIMARY_BUCKETS.QUOTE
  );
}

export function isGroupLive(
  group,
  options = {}
) {
  return (
    classifyQuoteGroup(
      group,
      options
    ).live === true
  );
}

export function getGroupAttentionItem(
  group,
  options = {}
) {
  const classification =
    classifyQuoteGroup(
      group,
      options
    );

  if (!classification.attention) {
    return null;
  }

  return {
    group,
    attention:
      classification.attention,
    classification,
  };
}

export function getClosedVerification(quote) {
  return {
    carrierBridge:
      hasCarrierBridge(quote),

    carrier:
      quote?.carrier_bridge_carrier ||
      quote?.carrier ||
      null,

    policyBound:
      isPolicyBound(quote),

    matrixReturn:
      hasMatrixBridgeBack(quote),
  };
}

export function getQuoteClassificationDebug(
  quote,
  options = {}
) {
  const classification =
    classifyQuote(
      quote,
      options
    );

  return {
    ...classification,

    modern:
      isModernCapture(quote),

    carrierBridge:
      hasCarrierBridge(quote),

    matrixBridgeBack:
      hasMatrixBridgeBack(quote),

    policyBound:
      isPolicyBound(quote),

    followUp:
      isFollowUpQuote(quote),

    explicitNotClosed:
      isExplicitNotClosedQuote(quote),

    threeYesStage:
      getThreeYesStage(quote),

    displayStatus:
      getQuoteDisplayStatus(
        quote,
        options.now ?? Date.now(),
        options.staleAfterMs ??
          STALE_AFTER_MS
      ),
  };
}
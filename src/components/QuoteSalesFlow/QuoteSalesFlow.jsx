// src/components/QuoteSalesFlow/QuoteSalesFlow.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../AuthContext';
import styles from './QuoteSalesFlow.module.css';

const NOT_CLOSED_REASONS = [
  ['lost_deal', 'Lost Deal'],
  ['walk', 'Walk'],
  ['did_not_rewrite_current_carrier', 'Did Not RW - Stayed With Current Carrier'],
];

const EXISTING_CLIENT_REASONS = [
  ['rewrite_endorsement', 'Endorsement Comparison'],
  ['renewal', 'Renewal'],
  ['reinstatement', 'Reinstatement'],
  ['rewrite_recent_policy', 'Re-Write - Policy Within Last 6 Months'],
  ['rewrite_payment', 'Payment'],
];

function clean(value) {
  return String(value ?? '').trim();
}

function toDatetimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function inferBusinessType(quote) {
  const value = clean(quote?.quote_business_type).toLowerCase();
  return value === 'existing_client' ? 'existing_client' : 'new_business';
}

function systemSecondYes(quote) {
  const licensed = Number(quote?.drivers_with_license || 0);
  const fullVins = Number(quote?.vehicles_with_full_vin || 0);
  return licensed > 0 && fullVins > 0;
}

function stageFor({ firstYes, secondYes, paymentMethod }) {
  if (paymentMethod === 'cash' || paymentMethod === 'card') return 3;
  if (secondYes) return 2;
  if (firstYes === 'yes') return 1;
  return 0;
}

export default function QuoteSalesFlow({
  group,
  mode = 'agent',
  onSaved,
  onViewDetails,
}) {
  const { profile, supabaseClient } = useAuth();
  const quote = group?.quotes?.[0] || group?.latest || null;

  const detectedSecondYes = useMemo(() => systemSecondYes(quote), [quote]);
  const driverCount = Number(quote?.driver_count || 0);
  const licensedCount = Number(quote?.drivers_with_license || 0);
  const vehicleCount = Number(quote?.vehicle_count || 0);
  const fullVinCount = Number(quote?.vehicles_with_full_vin || 0);

  const [contactMethod, setContactMethod] = useState('');
  const [businessType, setBusinessType] = useState('new_business');
  const [existingReason, setExistingReason] = useState('');
  const [firstYes, setFirstYes] = useState('');
  const [secondYesDeferred, setSecondYesDeferred] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [outcomeStatus, setOutcomeStatus] = useState('');
  const [notClosedReason, setNotClosedReason] = useState('');
  const [notClosedExplanation, setNotClosedExplanation] = useState('');
  const [lostDealManagerName, setLostDealManagerName] = useState('');
  const [lostDealBrokerFee, setLostDealBrokerFee] = useState('');
  const [dealSaveOpen, setDealSaveOpen] = useState(false);
  const [currentBrokerFee, setCurrentBrokerFee] = useState('');
  const [dealSavePremium, setDealSavePremium] = useState('');
  const [dealSaveSaving, setDealSaveSaving] = useState(false);
  const [dealSaveMessage, setDealSaveMessage] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!quote) return;

    setContactMethod(clean(quote.contact_method).toLowerCase());
    setBusinessType(inferBusinessType(quote));
    setExistingReason(clean(quote.existing_client_reason));
    setFirstYes(
      quote.first_yes_ready_now === true
        ? 'yes'
        : quote.first_yes_ready_now === false
          ? 'no'
          : ''
    );
    setSecondYesDeferred(quote.second_yes_id_vin === false);
    setPaymentMethod(clean(quote.payment_method).toLowerCase());
    setFollowUpAt(toDatetimeLocal(quote.follow_up_at));
    setNotClosedExplanation(clean(quote.not_closed_explanation));
    setLostDealManagerName(clean(quote.lost_deal_manager_name));
    setLostDealBrokerFee(quote.lost_deal_broker_fee ?? '');
    setCurrentBrokerFee('');
    setDealSavePremium(quote.total_premium ?? '');
    setDealSaveOpen(false);
    setDealSaveMessage('');

    const rawOutcome = clean(quote.outcome).toLowerCase();
    if (rawOutcome === 'sold') {
      setOutcomeStatus('closed');
    } else if (rawOutcome === 'follow_up') {
      setOutcomeStatus('follow_up');
    } else if (NOT_CLOSED_REASONS.some(([value]) => value === rawOutcome)) {
      setOutcomeStatus('not_closed');
      setNotClosedReason(rawOutcome);
    } else {
      setOutcomeStatus('');
      setNotClosedReason('');
    }

    setNote('');
    setMessage('');
  }, [quote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!quote?.id) return null;

  const secondYes = detectedSecondYes;
  const stage = stageFor({ firstYes, secondYes, paymentMethod });
  const firstYesNo = firstYes === 'no';
  const thirdYesNo = paymentMethod === 'neither';
  const appointmentRequired = firstYesNo || secondYesDeferred || thirdYesNo;
  const canAskSecondYes = firstYes === 'yes' && !appointmentRequired;
  const canAskThirdYes = firstYes === 'yes' && secondYes && !secondYesDeferred;
  const canFinishSale = canAskThirdYes && (paymentMethod === 'cash' || paymentMethod === 'card');
  const effectiveOutcomeStatus = appointmentRequired ? 'follow_up' : outcomeStatus;

  const requestDealSave = async () => {
    setDealSaveMessage('');

    const bf = Number(currentBrokerFee);
    const premium = Number(dealSavePremium);

    if (!Number.isFinite(bf) || bf < 0) {
      setDealSaveMessage('Enter the current broker fee.');
      return;
    }

    if (!Number.isFinite(premium) || premium <= 0) {
      setDealSaveMessage('Enter the quoted premium.');
      return;
    }

    setDealSaveSaving(true);

    const requesterName =
      clean(profile?.csr_name) ||
      clean(profile?.turborater_agent_name) ||
      clean(profile?.full_name) ||
      clean(profile?.email) ||
      'Quote User';

    const customerName =
      group?.customerName ||
      quote.customer_name ||
      'Unknown Customer';

    const operationalOffice =
      quote.office ||
      group?.office ||
      profile?.office ||
      null;

    const quoteTypeLabel =
      businessType === 'existing_client'
        ? `Existing Client / Re-Write — ${
            EXISTING_CLIENT_REASONS.find(([value]) => value === existingReason)?.[1] ||
            'Needs Classification'
          }`
        : 'New Quote';

    const contactMethodLabel =
      contactMethod === 'in_person'
        ? 'In Person'
        : contactMethod === 'phone'
          ? 'Over the Phone'
          : 'Not recorded';

    const requestPayload = {
      quote_id: quote.id,
      customer_name: customerName,
      office: operationalOffice,
      requested_by_email: profile?.email || null,
      requested_by_name: requesterName,
      requested_by_role: clean(profile?.role) || mode,
      current_broker_fee: bf,
      premium,
      status: 'pending',
      updated_at: new Date().toISOString(),
    };

    // Save the request first. Supabase stays the source of truth even if
    // Connecteam is temporarily unavailable.
    const { data: existing, error: lookupError } = await supabaseClient
      .from('quote_deal_save_requests')
      .select('id')
      .eq('quote_id', quote.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (lookupError) {
      setDealSaveSaving(false);
      setDealSaveMessage(`Request failed: ${lookupError.message}`);
      return;
    }

    let requestError = null;
    let requestId = existing?.id || null;

    if (existing?.id) {
      const { data: updatedRequest, error } = await supabaseClient
        .from('quote_deal_save_requests')
        .update(requestPayload)
        .eq('id', existing.id)
        .select('id')
        .single();

      requestError = error;
      requestId = updatedRequest?.id || existing.id;
    } else {
      const { data: insertedRequest, error } = await supabaseClient
        .from('quote_deal_save_requests')
        .insert({
          ...requestPayload,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      requestError = error;
      requestId = insertedRequest?.id || null;
    }

    if (requestError) {
      setDealSaveSaving(false);
      setDealSaveMessage(`Request failed: ${requestError.message}`);
      return;
    }

    const { error: noteError } = await supabaseClient
      .from('quote_internal_notes')
      .insert({
        quote_id: quote.id,
        note_text:
          `Deal Save requested · Current BF: $${bf.toFixed(2)} · ` +
          `Premium: $${premium.toFixed(2)} · ` +
          'Manager approval requested for a lower BF',
        author_email: profile?.email || null,
        author_name: requesterName,
        author_role: clean(profile?.role) || mode,
        note_source:
          mode === 'supervisor'
            ? 'supervisor_deal_save_request'
            : 'agent_deal_save_request',
      });

    // Notify the Lost Deal Alerts Connecteam chat through the server-side Edge Function.
    let connecteamError = null;

    try {
      const { data: connecteamData, error: functionError } =
        await supabaseClient.functions.invoke('send-connecteam-deal-save', {
          body: {
            test: false,

            office: operationalOffice,
            agentName: requesterName,
            customerName,
            customerId: quote.matrix_customer_id || group?.matrixCustomerId || null,

            quoteType: quoteTypeLabel,
            contactMethod: contactMethodLabel,

            firstYes: firstYes === 'yes',
            secondYes: detectedSecondYes,
            paymentMethod,

            driverCount,
            driversWithLicense: licensedCount,

            vehicleCount,
            vehiclesWithFullVin: fullVinCount,

            premium,
            currentBrokerFee: bf,

            requestId,
          },
        });

      if (functionError) {
        connecteamError = functionError;
      } else if (connecteamData?.success === false) {
        connecteamError = new Error(
          connecteamData?.error || 'Connecteam rejected the Deal Save alert.'
        );
      }
    } catch (error) {
      connecteamError = error;
    }

    setDealSaveSaving(false);

    if (connecteamError && noteError) {
      console.error('[QuoteSalesFlow] Connecteam Deal Save alert failed:', connecteamError);
      setDealSaveMessage(
        `Manager request saved, but the Connecteam alert and history note had issues. ` +
        `Alert: ${connecteamError.message || 'Unknown error'} · ` +
        `History: ${noteError.message}`
      );
    } else if (connecteamError) {
      console.error('[QuoteSalesFlow] Connecteam Deal Save alert failed:', connecteamError);
      setDealSaveMessage(
        `Manager request saved, but the Connecteam alert failed: ${
          connecteamError.message || 'Unknown error'
        }`
      );
    } else if (noteError) {
      setDealSaveMessage(
        `Manager notified in Connecteam, but the history note failed: ${noteError.message}`
      );
    } else {
      setDealSaveMessage('Manager notified — Deal Save request sent.');
    }

    if (onSaved) await onSaved();
  };

  const save = async () => {
    setMessage('');

    if (businessType === 'existing_client' && !existingReason) {
      setMessage('Choose the existing-client / re-write reason.');
      return;
    }

    if (outcomeStatus === 'not_closed' && !notClosedReason) {
      setMessage(businessType === 'existing_client' && existingReason
        ? 'Choose Lost Deal, Walk, or Did Not RW - Stayed With Current Carrier.'
        : 'Choose Lost Deal or Walk.');
      return;
    }

    if (outcomeStatus === 'not_closed' && !notClosedExplanation.trim()) {
      setMessage('Explain what happened before saving a Not Closed quote.');
      return;
    }

    if (outcomeStatus === 'not_closed' && notClosedReason === 'lost_deal') {
      if (!lostDealManagerName.trim()) {
        setMessage('Enter the manager who approved the lower broker fee.');
        return;
      }
      const lostBf = Number(lostDealBrokerFee);
      if (!Number.isFinite(lostBf) || lostBf < 0) {
        setMessage('Enter the broker fee the deal was lost at.');
        return;
      }
    }

    if (appointmentRequired && !followUpAt) {
      setMessage('Choose the follow-up appointment date and time.');
      return;
    }

    if (!appointmentRequired && !outcomeStatus) {
      setMessage('Choose Closed or Not Closed before saving the final outcome.');
      return;
    }

    setSaving(true);
    const savedAt = new Date().toISOString();

    let outcome = null;
    let followUpNeeded = false;
    let followUpIso = null;

    if (effectiveOutcomeStatus === 'closed') outcome = 'sold';
    if (effectiveOutcomeStatus === 'not_closed') outcome = notClosedReason;
    if (effectiveOutcomeStatus === 'follow_up') {
      outcome = 'follow_up';
      followUpNeeded = true;
      followUpIso = new Date(followUpAt).toISOString();
    }

    const firstYesValue =
      firstYes === 'yes' ? true : firstYes === 'no' ? false : null;
    const thirdYesValue =
      paymentMethod === 'cash' || paymentMethod === 'card'
        ? true
        : paymentMethod === 'neither'
          ? false
          : null;

    const payload = {
      quote_id: quote.id,
      quote_reason: quote.quote_reason || null,
      outcome,
      agent_notes: note.trim() || null,
      follow_up_needed: followUpNeeded,
      follow_up_at: followUpIso,
      completed_by_email: profile?.email || null,
      contact_method: contactMethod || null,
      quote_business_type: businessType,
      existing_client_reason: businessType === 'existing_client' ? existingReason : null,
      not_closed_type: effectiveOutcomeStatus === 'not_closed' ? notClosedReason : null,
      not_closed_explanation: effectiveOutcomeStatus === 'not_closed' ? notClosedExplanation.trim() : null,
      lost_deal_manager_name: effectiveOutcomeStatus === 'not_closed' && notClosedReason === 'lost_deal' ? lostDealManagerName.trim() : null,
      lost_deal_broker_fee: effectiveOutcomeStatus === 'not_closed' && notClosedReason === 'lost_deal' ? Number(lostDealBrokerFee) : null,
      first_yes_ready_now: firstYesValue,
      // The 2nd Yes belongs to passive system detection, not manual entry.
      second_yes_id_vin: detectedSecondYes ? true : secondYesDeferred ? false : null,
      third_yes_payment_ready: thirdYesValue,
      payment_method: paymentMethod || null,
      first_yes_recorded_at:
        firstYesValue === true
          ? quote.first_yes_recorded_at || savedAt
          : null,
      second_yes_recorded_at:
        detectedSecondYes
          ? quote.second_yes_recorded_at || savedAt
          : null,
      third_yes_recorded_at:
        thirdYesValue === true
          ? quote.third_yes_recorded_at || savedAt
          : null,
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

    const businessLabel =
      businessType === 'existing_client'
        ? `Existing Client / Re-Write - ${
            EXISTING_CLIENT_REASONS.find(([value]) => value === existingReason)?.[1] || 'Needs Classification'
          }`
        : 'New Quote';

    const outcomeLabel =
      outcomeStatus === 'closed'
        ? 'Closed'
        : outcomeStatus === 'follow_up'
          ? `Follow Up${followUpIso ? ` - ${formatDateTime(followUpIso)}` : ''}`
          : outcomeStatus === 'not_closed'
            ? `Not Closed - ${
                NOT_CLOSED_REASONS.find(([value]) => value === notClosedReason)?.[1] || notClosedReason
              }`
            : 'In Progress';

    const paymentLabel =
      paymentMethod === 'cash'
        ? 'Cash'
        : paymentMethod === 'card'
          ? 'Card'
          : paymentMethod === 'neither'
            ? 'Not Ready to Pay'
            : 'Not recorded';

    const historyText = [
      mode === 'supervisor' ? 'Supervisor self-quote workflow saved' : 'Agent quote workflow saved',
      `Contact Method: ${contactMethod === 'in_person' ? 'In Person' : contactMethod === 'phone' ? 'Over the Phone' : 'Not recorded'}`,
      `Quote Type: ${businessLabel}`,
      `1st Yes: ${firstYes === 'yes' ? 'Yes' : firstYes === 'no' ? 'No' : 'Not recorded'}`,
      `2nd Yes: ${detectedSecondYes ? 'System detected' : 'Not detected'}`,
      `3rd Yes / Payment: ${paymentLabel}`,
      `Outcome: ${appointmentRequired ? `Follow Up - ${formatDateTime(followUpIso)}` : outcomeLabel}`,
      ...(secondYesDeferred ? ['2nd Yes: Customer could not provide ID/license + VIN now'] : []),
      ...(effectiveOutcomeStatus === 'not_closed' ? [`Not Closed Type: ${NOT_CLOSED_REASONS.find(([value]) => value === notClosedReason)?.[1] || notClosedReason}`, `Explanation: ${notClosedExplanation.trim()}`] : []),
      ...(effectiveOutcomeStatus === 'not_closed' && notClosedReason === 'lost_deal' ? [`Manager Approval: ${lostDealManagerName.trim()}`, `BF Lost At: $${Number(lostDealBrokerFee).toFixed(2)}`] : []),
    ].join(' · ');

    const authorName =
      clean(profile?.csr_name) ||
      clean(profile?.turborater_agent_name) ||
      clean(profile?.full_name) ||
      clean(profile?.email) ||
      'Quote User';

    const { error: historyError } = await supabaseClient
      .from('quote_internal_notes')
      .insert({
        quote_id: quote.id,
        note_text: historyText,
        author_email: profile?.email || null,
        author_name: authorName,
        author_role: clean(profile?.role) || mode,
        note_source: mode === 'supervisor' ? 'supervisor_self_quote' : 'agent_quote_entry',
      });

    if (historyError) {
      setSaving(false);
      setMessage(`Workflow saved, but history failed: ${historyError.message}`);
      if (onSaved) await onSaved();
      return;
    }

    if (note.trim()) {
      const { error: noteError } = await supabaseClient
        .from('quote_internal_notes')
        .insert({
          quote_id: quote.id,
          note_text: note.trim(),
          author_email: profile?.email || null,
          author_name: authorName,
          author_role: clean(profile?.role) || mode,
          note_source: mode === 'supervisor' ? 'supervisor_self_note' : 'agent_note',
        });

      if (noteError) {
        setSaving(false);
        setMessage(`Workflow saved, but note failed: ${noteError.message}`);
        if (onSaved) await onSaved();
        return;
      }
    }

    setNote('');
    setSaving(false);
    setMessage(
      appointmentRequired
        ? 'Follow-up appointment saved.'
        : 'Quote outcome saved.'
    );

    if (onSaved) await onSaved();
  };

  return (
    <section className={styles.flowCard}>
      <div className={styles.flowHeader}>
        <div>
          <span className={styles.kicker}>
            {mode === 'supervisor' ? 'My Active Quote' : 'My Quote'}
          </span>
          <h2>{group?.customerName || quote.customer_name || 'Active Customer'}</h2>
          <p>
            Quote #{quote.matrix_quote_id || '—'} · {group?.office || quote.office || '—'}
          </p>
        </div>
        <div className={styles.stageBadge}>{stage ? `${stage}${stage === 1 ? 'st' : stage === 2 ? 'nd' : 'rd'} Yes` : 'Quote'}</div>
      </div>

      {quote.office_source === 'trusted_device' && (
        <div className={quote.office_mismatch ? styles.officeWarning : styles.officeVerified}>
          <strong>
            {quote.office_mismatch ? 'Office mismatch detected' : 'Office verified by trusted device'}
          </strong>
          <span>
            Operational office: {quote.office || group?.office || '—'}
            {quote.turborater_office
              ? ` · TurboRater: ${quote.turborater_office}`
              : ''}
          </span>
        </div>
      )}

      <div className={styles.signalRow}>
        <div>
          <span>Drivers</span>
          <strong>{licensedCount}/{driverCount || 0}</strong>
          <small>license entered</small>
        </div>
        <div>
          <span>Vehicles</span>
          <strong>{fullVinCount}/{vehicleCount || 0}</strong>
          <small>full 17-character VIN</small>
        </div>
        <div className={secondYes ? styles.detected : styles.waiting}>
          <span>2nd Yes</span>
          <strong>{secondYes ? '✓ Detected' : 'Waiting'}</strong>
          <small>ID/license + full VIN</small>
        </div>
      </div>

      <div className={styles.workflow}>
        <div className={styles.progressStrip}>
          <span className={contactMethod ? styles.stepDone : styles.stepActive}>1 · Context</span>
          <span className={businessType ? styles.stepDone : ''}>2 · Quote Type</span>
          <span className={firstYes === 'yes' ? styles.stepDone : firstYes === 'no' ? styles.stepStop : styles.stepActive}>3 · 1st Yes</span>
          <span className={secondYes ? styles.stepDone : secondYesDeferred ? styles.stepStop : ''}>4 · 2nd Yes</span>
          <span className={stage >= 3 ? styles.stepDone : thirdYesNo ? styles.stepStop : ''}>5 · 3rd Yes</span>
          <span className={effectiveOutcomeStatus ? styles.stepDone : ''}>6 · Outcome</span>
        </div>

        <div className={styles.compactTopGrid}>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepBody}>
              <h3>How are you helping this customer?</h3>
              <div className={styles.choiceRow}>
                <button type="button" className={contactMethod === 'in_person' ? styles.choiceSelected : styles.choiceButton} onClick={() => setContactMethod('in_person')}>In Person</button>
                <button type="button" className={contactMethod === 'phone' ? styles.choiceSelected : styles.choiceButton} onClick={() => setContactMethod('phone')}>Over the Phone</button>
              </div>
            </div>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepBody}>
              <h3>What kind of quote is this?</h3>
              <div className={styles.formGrid}>
                <label>
                  <span>Quote Type</span>
                  <select value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
                    <option value="new_business">New Quote</option>
                    <option value="existing_client">Existing Client / Re-Write</option>
                  </select>
                </label>
                {businessType === 'existing_client' && (
                  <label>
                    <span>Re-Write Type</span>
                    <select value={existingReason} onChange={(e) => setExistingReason(e.target.value)}>
                      <option value="">Select type...</option>
                      {EXISTING_CLIENT_REASONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.stepCard}>
          <div className={styles.stepNumber}>3</div>
          <div className={styles.stepBody}>
            <span className={styles.yesLabel}>1ST YES · COMMITMENT</span>
            <h3>“If I find you a price you like, are you ready to start the policy right now?”</h3>
            <div className={styles.choiceRow}>
              <button
                type="button"
                className={firstYes === 'yes' ? styles.choiceSelected : styles.choiceButton}
                onClick={() => {
                  setFirstYes('yes');
                  setSecondYesDeferred(false);
                  setPaymentMethod('');
                  setOutcomeStatus('');
                  setFollowUpAt('');
                }}
              >
                Yes — Ready Now
              </button>
              <button
                type="button"
                className={firstYes === 'no' ? styles.choiceSelected : styles.choiceButton}
                onClick={() => {
                  setFirstYes('no');
                  setSecondYesDeferred(false);
                  setPaymentMethod('');
                  setOutcomeStatus('');
                  setNotClosedReason('');
                }}
              >
                No / Not Yet
              </button>
            </div>
          </div>
        </div>

        {firstYesNo && (
          <div className={styles.followUpPath}>
            <div className={styles.guidanceIcon}>↻</div>
            <div>
              <strong>This stays a quote — set the next appointment.</strong>
              <p>
                Ask the customer when they expect to be ready. Do not continue to the ID/VIN or payment questions yet.
                Lock in a specific follow-up appointment before ending the conversation.
              </p>
              <label>
                <span>Follow-Up Appointment</span>
                <input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
              </label>
            </div>
          </div>
        )}

        {canAskSecondYes && !secondYes && (
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>4</div>
            <div className={styles.stepBody}>
              <span className={styles.yesLabel}>2ND YES · ID / LICENSE + VIN</span>
              <h3>Ask the customer for their driver’s license / ID and the vehicle VIN.</h3>
              <p>
                Enter them into TurboRater. This step completes automatically when the extension detects at least one
                license and one full 17-character VIN.
              </p>
              <div className={styles.signalMiniRow}>
                <span>{licensedCount}/{driverCount || 0} licenses entered</span>
                <span>{fullVinCount}/{vehicleCount || 0} full VINs entered</span>
              </div>
              <button
                type="button"
                className={styles.secondaryChoice}
                onClick={() => {
                  setSecondYesDeferred(true);
                  setPaymentMethod('');
                  setOutcomeStatus('');
                  setNotClosedReason('');
                }}
              >
                Customer cannot provide ID / VIN right now
              </button>
            </div>
          </div>
        )}

        {secondYesDeferred && (
          <div className={styles.followUpPath}>
            <div className={styles.guidanceIcon}>↻</div>
            <div>
              <strong>Stop here and schedule the customer back.</strong>
              <p>
                They gave the 1st Yes but cannot complete the ID/license + VIN step today. Ask when they can have the
                documents ready and create the appointment now.
              </p>
              <label>
                <span>Follow-Up Appointment</span>
                <input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
              </label>
            </div>
          </div>
        )}

        {canAskThirdYes && (
          <div className={`${styles.stepCard} ${styles.systemComplete}`}>
            <div className={styles.stepNumber}>4</div>
            <div className={styles.stepBody}>
              <span className={styles.yesLabel}>2ND YES COMPLETE</span>
              <h3>✓ License / ID and full VIN detected</h3>
              <p>{licensedCount}/{driverCount || 0} licenses · {fullVinCount}/{vehicleCount || 0} full VINs</p>
            </div>
          </div>
        )}

        {canAskThirdYes && (
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>5</div>
            <div className={styles.stepBody}>
              <span className={styles.yesLabel}>3RD YES · PAYMENT COMMITMENT</span>
              <h3>“If you like the price I give you, will you be paying cash or card?”</h3>
              <div className={styles.choiceRow}>
                <button
                  type="button"
                  className={paymentMethod === 'cash' ? styles.choiceSelected : styles.choiceButton}
                  onClick={() => {
                    setPaymentMethod('cash');
                    setOutcomeStatus('');
                    setFollowUpAt('');
                  }}
                >
                  Cash
                </button>
                <button
                  type="button"
                  className={paymentMethod === 'card' ? styles.choiceSelected : styles.choiceButton}
                  onClick={() => {
                    setPaymentMethod('card');
                    setOutcomeStatus('');
                    setFollowUpAt('');
                  }}
                >
                  Card
                </button>
                <button
                  type="button"
                  className={paymentMethod === 'neither' ? styles.choiceSelected : styles.choiceButton}
                  onClick={() => {
                    setPaymentMethod('neither');
                    setOutcomeStatus('');
                    setNotClosedReason('');
                  }}
                >
                  Not Ready to Pay
                </button>
              </div>
            </div>
          </div>
        )}

        {thirdYesNo && (
          <div className={styles.followUpPath}>
            <div className={styles.guidanceIcon}>↻</div>
            <div>
              <strong>Customer is not ready to pay — set the appointment.</strong>
              <p>
                Do not bridge yet. Ask when they will be ready to make the payment and schedule a specific follow-up.
              </p>
              <label>
                <span>Follow-Up Appointment</span>
                <input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
              </label>
            </div>
          </div>
        )}

        {canFinishSale && (
          <div className={styles.dealSaveBox}>
            <div className={styles.dealSaveHeader}>
              <div>
                <span>NEED HELP WITH THE DOWN?</span>
                <strong>Request a lower Broker Fee before losing the deal.</strong>
                <p>
                  Enter the Broker Fee (BF) you are currently at and the premium. This sends a manager approval request
                  so management can decide whether a lower BF can help save the deal.
                </p>
              </div>
              <button
                type="button"
                className={dealSaveOpen ? styles.secondaryChoice : styles.dealSaveButton}
                onClick={() => setDealSaveOpen((open) => !open)}
              >
                {dealSaveOpen ? 'Hide Request' : 'Request Help With Down'}
              </button>
            </div>

            {dealSaveOpen && (
              <div className={styles.dealSaveForm}>
                <label>
                  <span>Current Broker Fee (BF)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={currentBrokerFee}
                    onChange={(e) => setCurrentBrokerFee(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  <span>Quoted Premium</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={dealSavePremium}
                    onChange={(e) => setDealSavePremium(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <button type="button" className={styles.dealSaveButton} onClick={requestDealSave} disabled={dealSaveSaving}>
                  {dealSaveSaving ? 'Sending…' : 'Send Manager Approval Request'}
                </button>
                {dealSaveMessage && (
                  <span className={dealSaveMessage.toLowerCase().includes('failed') ? styles.errorMessage : styles.saveMessage}>
                    {dealSaveMessage}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {canFinishSale && (
          <div className={styles.bridgeGuidance}>
            <div className={styles.guidanceIcon}>→</div>
            <div>
              <strong>3rd Yes confirmed — bridge and present the best option.</strong>
              <p>Bridge to the best company, then pitch these coverages first:</p>
              <div className={styles.coverageGrid}>
                <span><b>BI</b> 30/60</span>
                <span><b>PD</b> 15</span>
                <span><b>UMBI</b> 30/60</span>
                <span><b>UMPD</b> 3,500</span>
              </div>
              <div className={styles.coverageReminder}>
                If Comprehensive / Collision is applied, use Collision Deductible Waiver (CDW) where appropriate instead
                of the UMPD presentation. Present and explain the coverages to the client before asking for the close.
              </div>
            </div>
          </div>
        )}

        {canFinishSale && (
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>6</div>
            <div className={styles.stepBody}>
              <h3>What happened with the quote?</h3>
              <p>Only record the final result after the customer reached the 3rd Yes and you presented the quote.</p>
              <div className={styles.outcomeButtons}>
                <button
                  type="button"
                  className={outcomeStatus === 'closed' ? styles.outcomeClosedSelected : styles.outcomeButton}
                  onClick={() => {
                    setOutcomeStatus('closed');
                    setNotClosedReason('');
                    setNotClosedExplanation('');
                    setLostDealManagerName('');
                    setLostDealBrokerFee('');
                  }}
                >
                  Closed
                </button>
                <button
                  type="button"
                  className={outcomeStatus === 'not_closed' ? styles.outcomeNotClosedSelected : styles.outcomeButton}
                  onClick={() => setOutcomeStatus('not_closed')}
                >
                  Not Closed
                </button>
              </div>

              {outcomeStatus === 'not_closed' && (
                <div className={styles.notClosedFinal}>
                  <div className={styles.choiceRow}>
                    <button
                      type="button"
                      className={notClosedReason === 'lost_deal' ? styles.choiceSelected : styles.choiceButton}
                      onClick={() => setNotClosedReason('lost_deal')}
                    >
                      Lost Deal
                    </button>
                    <button
                      type="button"
                      className={notClosedReason === 'walk' ? styles.choiceSelected : styles.choiceButton}
                      onClick={() => {
                        setNotClosedReason('walk');
                        setLostDealManagerName('');
                        setLostDealBrokerFee('');
                      }}
                    >
                      Walk
                    </button>
                    {businessType === 'existing_client' && existingReason && (
                      <button
                        type="button"
                        className={notClosedReason === 'did_not_rewrite_current_carrier' ? styles.choiceSelected : styles.choiceButton}
                        onClick={() => {
                          setNotClosedReason('did_not_rewrite_current_carrier');
                          setLostDealManagerName('');
                          setLostDealBrokerFee('');
                        }}
                      >
                        Did Not RW - Stayed With Current Carrier
                      </button>
                    )}
                  </div>

                  <div className={styles.definitionBox}>
                    {notClosedReason === 'lost_deal'
                      ? 'Lost Deal = management approved a lower Broker Fee to save the deal, but the customer still did not close.'
                      : notClosedReason === 'walk'
                        ? 'Walk = the quote did not close and no lower-BF approval was used to try to save it.'
                        : notClosedReason === 'did_not_rewrite_current_carrier'
                          ? 'Did Not RW - Stayed With Current Carrier = this was an existing-customer re-write review, but the customer kept the current carrier/policy. An explanation is required.'
                          : businessType === 'existing_client' && existingReason
                            ? 'Choose Lost Deal, Walk, or Did Not RW - Stayed With Current Carrier, then explain what happened.'
                            : 'Choose Lost Deal or Walk, then explain what happened.'}
                  </div>

                  {notClosedReason === 'lost_deal' && (
                    <div className={styles.formGrid}>
                      <label>
                        <span>Manager Who Approved Lower BF</span>
                        <input
                          type="text"
                          value={lostDealManagerName}
                          onChange={(e) => setLostDealManagerName(e.target.value)}
                          placeholder="Manager name"
                        />
                      </label>
                      <label>
                        <span>Broker Fee Deal Was Lost At</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={lostDealBrokerFee}
                          onChange={(e) => setLostDealBrokerFee(e.target.value)}
                          placeholder="0.00"
                        />
                      </label>
                    </div>
                  )}

                  {notClosedReason && (
                    <label className={styles.explanationField}>
                      <span>Required Explanation — What Happened?</span>
                      <textarea
                        value={notClosedExplanation}
                        onChange={(e) => setNotClosedExplanation(e.target.value)}
                        rows={3}
                        placeholder={notClosedReason === 'lost_deal'
                          ? 'Explain what happened after the lower BF was approved and why the deal still did not close...'
                          : notClosedReason === 'did_not_rewrite_current_carrier'
                            ? 'Explain why the customer stayed with the current carrier/policy and what prevented the re-write...'
                            : 'Explain why the customer walked and what happened during the quote...'}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {(appointmentRequired || canFinishSale) && (
          <div className={styles.noteWrap}>
            <label className={styles.noteField}>
              <span>Internal Note</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional coaching or quote note..."
                rows={2}
              />
            </label>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {message && (
          <span className={message.toLowerCase().includes('failed') ? styles.errorMessage : styles.saveMessage}>
            {message}
          </span>
        )}
        <div className={styles.actionButtons}>
          {onViewDetails && (
            <button type="button" className={styles.secondaryButton} onClick={onViewDetails}>
              View Full Details
            </button>
          )}
          <button type="button" className={styles.primaryButton} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : appointmentRequired ? 'Save Follow-Up Appointment' : 'Save Quote Outcome'}
          </button>
        </div>
      </div>
    </section>
  );
}
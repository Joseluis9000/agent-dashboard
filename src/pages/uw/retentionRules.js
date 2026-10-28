// Pure rules shared by the review form and its tests. SQL enforces the same rules.
export const OPTIONS = {
  policy_status: ['Not verified', 'Active', 'Payment Due', 'Cancelled', 'Renewal Due', 'Unable to Verify'],
  payments_current: ['Yes', 'No', 'Unable to verify'],
  verification_source: ['Matrix receipts', 'Carrier website', 'Both', 'Unable to verify'],
  next_action: ['None needed', 'Courtesy call', 'Check reinstatement', 'Quote rewrite', 'Compare reinstatement and rewrite', 'Review renewal', 'Compare renewal quotes', 'Renewal completed', 'Other'],
  contact_result: ['Not contacted', 'No answer', 'Voicemail', 'Reached customer', 'Callback requested'],
  work_status: ['Not started', 'In progress', 'Follow-up needed', 'Completed'],
  verification_obstacle: ['No recent receipt', 'Carrier website unavailable', 'Account not found', 'Conflicting information', 'Other'],
};
export const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
export const policyIdentity = row => ({
  customer_id: String(row.customer_id || '').trim(),
  policy_number: normalize(row.policy_number),
  carrier_name: normalize(row.carrier_name),
});
export const policyKey = row => JSON.stringify(Object.values(policyIdentity(row)));
export const emptyReview = () => ({
  policy_status: 'Not verified', payments_current: '', verification_source: '',
  last_payment_date: '', last_payment_amount: '', next_action: '',
  contact_result: 'Not contacted', follow_up_date: '', work_status: 'Not started',
  verification_obstacle: '', notes: '',
});
export const reviewFrom = record => Object.fromEntries(
  Object.keys(emptyReview()).map(key => [key, record?.[key] ?? emptyReview()[key]])
);
export const needsNotes = form => ['Payment Due', 'Cancelled', 'Renewal Due', 'Unable to Verify'].includes(form.policy_status) || form.next_action === 'Other';
export const needsFollowUp = form => form.work_status === 'Follow-up needed' || form.contact_result === 'Callback requested' ||
  (['Payment Due', 'Cancelled', 'Renewal Due', 'Unable to Verify'].includes(form.policy_status) && form.work_status !== 'Completed');
export const actionsFor = status => ({
  Active: ['None needed', 'Courtesy call', 'Other'],
  'Payment Due': ['Courtesy call', 'Other'],
  Cancelled: ['Check reinstatement', 'Quote rewrite', 'Compare reinstatement and rewrite', 'None needed', 'Other'],
  'Renewal Due': ['Review renewal', 'Compare renewal quotes', 'Renewal completed', 'Other'],
  'Unable to Verify': OPTIONS.next_action.filter(x => !['None needed', 'Renewal completed'].includes(x)),
}[status] || OPTIONS.next_action);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
export function validateReview(form, { draft = false, today } = {}) {
  const errors = {};
  Object.entries(OPTIONS).forEach(([key, options]) => {
    if (form[key] && !options.includes(form[key])) errors[key] = 'Choose one of the available options.';
  });
  ['last_payment_date', 'follow_up_date'].forEach(key => {
    if (form[key] && !validDate(form[key])) errors[key] = 'Enter a valid date.';
  });
  if (form.last_payment_date && today && form.last_payment_date > today) errors.last_payment_date = 'A verified payment cannot be in the future.';
  if (form.last_payment_amount !== '' && (!Number.isFinite(Number(form.last_payment_amount)) || Number(form.last_payment_amount) < 0)) errors.last_payment_amount = 'Enter a valid amount of zero or more.';
  if ((form.notes || '').length > 10000) errors.notes = 'Keep notes under 10,000 characters.';
  if (draft) return errors;
  if (form.policy_status === 'Not verified') errors.policy_status = 'Verify the status before finishing the review.';
  if (!form.verification_source) errors.verification_source = 'Select how you verified the account.';
  if (form.policy_status !== 'Unable to Verify' && form.verification_source === 'Unable to verify') errors.verification_source = 'Choose a verification source or mark the policy Unable to Verify.';
  if (!form.next_action) errors.next_action = 'Select the next action.';
  if (form.next_action && !actionsFor(form.policy_status).includes(form.next_action)) errors.next_action = 'Choose an action for this policy status.';
  if (form.policy_status === 'Active' && form.payments_current !== 'Yes') errors.payments_current = 'Confirm payments are current, or choose a different policy status.';
  if (form.policy_status === 'Payment Due' && form.payments_current !== 'No') errors.payments_current = 'Select No while payment remains due.';
  if (form.policy_status === 'Unable to Verify' && !form.verification_obstacle) errors.verification_obstacle = 'Select what prevented verification.';
  if (form.policy_status === 'Unable to Verify' && form.work_status === 'Completed') errors.work_status = 'An unverified account needs follow-up.';
  if (needsNotes(form) && !(form.notes || '').trim()) errors.notes = 'Add findings, the decision, or what still needs to be done.';
  if (needsFollowUp(form) && !form.follow_up_date) errors.follow_up_date = 'Choose when to revisit this account.';
  if (form.follow_up_date && today && form.follow_up_date < today && needsFollowUp(form)) errors.follow_up_date = 'Choose today or a future follow-up date.';
  if (form.contact_result === 'Callback requested' && form.work_status === 'Completed') errors.work_status = 'A requested callback needs follow-up.';
  if (form.work_status !== 'Completed' && form.work_status !== 'Follow-up needed') errors.work_status = 'Choose Completed or Follow-up needed to finish the review.';
  return errors;
}

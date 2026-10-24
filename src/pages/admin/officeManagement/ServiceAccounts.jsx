
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ServiceDocuments from './ServiceDocuments';
import { listProviders } from './providerService';
import {
  createServiceAccount,
  deleteServiceAccount,
  listServiceAccounts,
  updateServiceAccount,
} from './officeService';
import styles from './OfficeManagement.module.css';

const types = [
  'electricity', 'internet', 'phone', 'water', 'gas',
  'trash', 'security', 'other', 'backup_internet',
];

const blank = {
  service_type: 'electricity',
  provider_name: '',
  provider_id: '',
  hotspot_device_model: '',
  hotspot_line_number: '',
  hotspot_sim_identifier: '',
  hotspot_data_plan: '',
  hotspot_last_tested: '',
  hotspot_test_status: '',
  account_number: '',
  account_holder: '',
  billing_responsibility: 'company',
  service_status: 'active',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  portal_url: '',
  billing_frequency: 'monthly',
  monthly_estimated_cost: '',
  due_day: '',
  contract_start_date: '',
  contract_end_date: '',
  renewal_date: '',
  cancellation_notice_date: '',
  auto_renewal: 'unknown',
  contract_term_months: '',
  post_contract_monthly_cost: '',
  contract_document_url: '',
  notes: '',
};

const clean = (form, officeId) => ({
  office_id: officeId,
  service_type: form.service_type,
  provider_name: form.provider_name.trim(),
  provider_id: form.provider_id || null,
  hotspot_device_model: form.hotspot_device_model.trim() || null,
  hotspot_line_number: form.hotspot_line_number.trim() || null,
  hotspot_sim_identifier: form.hotspot_sim_identifier.trim() || null,
  hotspot_data_plan: form.hotspot_data_plan.trim() || null,
  hotspot_last_tested: form.hotspot_last_tested || null,
  hotspot_test_status: form.hotspot_test_status.trim() || null,
  account_number: form.account_number.trim() || null,
  account_holder: form.account_holder.trim() || null,
  billing_responsibility: form.billing_responsibility,
  service_status: form.service_status,
  contact_name: form.contact_name.trim() || null,
  contact_phone: form.contact_phone.trim() || null,
  contact_email: form.contact_email.trim() || null,
  portal_url: form.portal_url.trim() || null,
  billing_frequency: form.billing_frequency,
  monthly_estimated_cost:
    form.monthly_estimated_cost === ''
      ? null : Number(form.monthly_estimated_cost),
  due_day:
    form.due_day === '' ? null : Number(form.due_day),
  contract_start_date: form.contract_start_date || null,
  contract_end_date: form.contract_end_date || null,
  renewal_date: form.renewal_date || null,
  cancellation_notice_date: form.cancellation_notice_date || null,
  auto_renewal: form.auto_renewal,
  contract_term_months:
    form.contract_term_months === ''
      ? null : Number(form.contract_term_months),
  post_contract_monthly_cost:
    form.post_contract_monthly_cost === ''
      ? null : Number(form.post_contract_monthly_cost),
  contract_document_url: form.contract_document_url.trim() || null,
  notes: form.notes.trim() || null,
});

const titleCase = value =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());

export default function ServiceAccounts({ officeId }) {
  const [items, setItems] = useState([]);
  const [providers, setProviders] = useState([]);
  const [params] = useSearchParams();
  const selectedAccount = params.get('account');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showNumbers, setShowNumbers] = useState({});

  useEffect(() => {
    listProviders()
      .then(setProviders)
      .catch(e => setError(e.message));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listServiceAccounts(officeId));
      setError('');
    } catch (e) {
      setError(e.message || 'Unable to load service accounts.');
    } finally {
      setLoading(false);
    }
  }, [officeId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!loading && selectedAccount && items.length) {
      const element = document.getElementById(
        `service-account-${selectedAccount}`
      );

      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [loading, selectedAccount, items]);

  const change = (name, value) =>
    setForm(previous => ({ ...previous, [name]: value }));

  const startNew = () => {
    setEditingId(null);
    setForm({ ...blank });
    setNotice('');
  };

  const startEdit = item => {
    setEditingId(item.id);
    setForm(
      Object.fromEntries(
        Object.keys(blank).map(key => [key, item[key] ?? ''])
      )
    );
    setNotice('');
  };

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const values = clean(form, officeId);

      if (!values.provider_name) {
        throw new Error('Provider name is required.');
      }

      if (editingId) {
        await updateServiceAccount(editingId, values);
      } else {
        await createServiceAccount(values);
      }

      setForm(null);
      setEditingId(null);
      setNotice('Service account saved.');
      await reload();
    } catch (e) {
      setError(e.message || 'Unable to save.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async item => {
    if (
      !window.confirm(
        `Delete the ${item.provider_name} service account? ` +
        'This cannot be undone.'
      )
    ) return;

    setError('');
    setNotice('');

    try {
      await deleteServiceAccount(item.id);
      setNotice('Service account deleted.');
      await reload();
    } catch (e) {
      setError(e.message || 'Unable to delete.');
    }
  };

  const field = (label, key, type = 'text', extra = {}) => (
    <label key={key}>
      {label}
      <input
        type={type}
        value={form[key]}
        onChange={e => change(key, e.target.value)}
        {...extra}
      />
    </label>
  );

  const select = (label, key, options) => (
    <label key={key}>
      {label}
      <select
        value={form[key]}
        onChange={e => change(key, e.target.value)}
      >
        {options.map(option => (
          <option key={option} value={option}>
            {titleCase(option)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div>
      <div className={styles.serviceHeading}>
        <div>
          <h2>Utility & Service Accounts</h2>
          <p>
            Keep each office's providers, billing responsibility,
            and contact details together.
          </p>
        </div>

        <button
          type="button"
          className={styles.primary}
          onClick={startNew}
        >
          + Add Service
        </button>
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {notice && <p role="status">{notice}</p>}

      {form && (
        <form onSubmit={save} className={styles.serviceForm}>
          <h3>
            {editingId ? 'Edit Service Account' : 'New Service Account'}
          </h3>

          <div className={styles.formGrid}>
            {select('Service type', 'service_type', types)}

            <label>
              Provider Directory
              <select
                value={form.provider_id || ''}
                onChange={e => {
                  const provider = providers.find(
                    item => item.id === e.target.value
                  );

                  setForm(previous => ({
                    ...previous,
                    provider_id: e.target.value,
                    provider_name: provider
                      ? provider.name : previous.provider_name,
                    service_type: provider
                      ? provider.category : previous.service_type,
                  }));
                }}
              >
                <option value="">
                  Unlinked / custom provider
                </option>

                {providers.map(provider => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({titleCase(provider.category)})
                  </option>
                ))}
              </select>
            </label>

            {field('Provider name *', 'provider_name', 'text', {
              required: true,
              maxLength: 200,
            })}

            {form.service_type === 'backup_internet' && (
              <>
                <h3 className={styles.wide}>
                  Emergency Hotspot Details
                </h3>

                {field('Device model', 'hotspot_device_model')}
                {field('Hotspot phone / line number', 'hotspot_line_number')}
                {field(
                  'SIM identifier (avoid full SIM if not needed)',
                  'hotspot_sim_identifier'
                )}
                {field('Data plan', 'hotspot_data_plan')}
                {field('Last tested', 'hotspot_last_tested', 'date')}

                {select('Test status', 'hotspot_test_status', [
                  '',
                  'working',
                  'needs_attention',
                  'not_tested',
                ])}
              </>
            )}

            {field('Account number', 'account_number')}
            {field('Account holder / name on bill', 'account_holder')}

            {select('Who pays the bill?', 'billing_responsibility', [
              'company', 'landlord', 'other', 'unknown',
            ])}

            {select('Service status', 'service_status', [
              'active', 'pending', 'disconnected', 'cancelled', 'unknown',
            ])}

            {field('Contact name', 'contact_name')}
            {field('Contact phone', 'contact_phone', 'tel')}
            {field('Contact email', 'contact_email', 'email')}

            {field('Provider website', 'portal_url', 'url', {
              placeholder: 'https://...',
            })}

            {select('Billing frequency', 'billing_frequency', [
              'monthly', 'quarterly', 'annually', 'other', 'unknown',
            ])}

            {field(
              'Estimated monthly cost ($)',
              'monthly_estimated_cost',
              'number',
              { min: 0, step: '0.01' }
            )}

            {field('Billing due day (1–31)', 'due_day', 'number', {
              min: 1, max: 31, step: 1,
            })}

            <h3 className={styles.wide}>
              Contract & Renewal Tracking
            </h3>

            {field('Contract start date', 'contract_start_date', 'date')}
            {field('Contract expiration date', 'contract_end_date', 'date')}
            {field('Renewal date', 'renewal_date', 'date')}
            {field(
              'Cancellation notice deadline',
              'cancellation_notice_date',
              'date'
            )}

            {select('Auto-renewal', 'auto_renewal', [
              'unknown', 'yes', 'no',
            ])}

            {field('Contract term (months)', 'contract_term_months', 'number', {
              min: 1, step: 1,
            })}

            {field(
              'Post-contract monthly rate ($)',
              'post_contract_monthly_cost',
              'number',
              { min: 0, step: '0.01' }
            )}

            {field(
              'Contract document link (HTTPS)',
              'contract_document_url',
              'url',
              { placeholder: 'https://...' }
            )}

            <label className={styles.wide}>
              Notes
              <textarea
                rows="3"
                value={form.notes}
                onChange={e => change('notes', e.target.value)}
                placeholder="Billing history, service issues, verification needed..."
              />
            </label>
          </div>

          <p className={styles.helper}>
            Do not enter account passwords, payment card numbers,
            or security answers.
          </p>

          <div className={styles.actions}>
            <button
              className={styles.primary}
              type="submit"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Service'}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setForm(null);
                setError('');
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p>Loading service accounts...</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>
          No service accounts yet. Select "Add Service"
          to create the first one.
        </p>
      ) : (
        <div className={styles.serviceCards}>
          {items.map(item => (
            <article
              className={styles.serviceCard}
              id={`service-account-${item.id}`}
              key={item.id}
              style={
                selectedAccount === item.id
                  ? { outline: '2px solid #2563eb' }
                  : undefined
              }
            >
              <div className={styles.serviceCardTop}>
                <div>
                  <span className={styles.serviceType}>
                    {titleCase(item.service_type)}
                  </span>
                  <h3>{item.provider_name}</h3>
                </div>

                <span className={styles.pill}>
                  {titleCase(item.service_status)}
                </span>
              </div>

              <div className={styles.serviceDetails}>
                <div>
                  <b>Account number</b>
                  <p>
                    {item.account_number
                      ? showNumbers[item.id]
                        ? item.account_number
                        : '••••' + item.account_number.slice(-4)
                      : 'Not entered'}

                    {' '}

                    {item.account_number && (
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={() =>
                          setShowNumbers(previous => ({
                            ...previous,
                            [item.id]: !previous[item.id],
                          }))
                        }
                      >
                        {showNumbers[item.id] ? 'Hide' : 'Show'}
                      </button>
                    )}
                  </p>
                </div>

                {item.service_type === 'backup_internet' && (
                  <div>
                    <b>Hotspot</b>
                    <p>
                      {[
                        item.hotspot_device_model,
                        item.hotspot_data_plan,
                        item.hotspot_test_status,
                        item.hotspot_last_tested &&
                          `Tested ${item.hotspot_last_tested}`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Not entered'}
                    </p>
                  </div>
                )}

                <div>
                  <b>Billing responsibility</b>
                  <p>{titleCase(item.billing_responsibility)}</p>
                </div>

                <div>
                  <b>Account holder</b>
                  <p>{item.account_holder || 'Not entered'}</p>
                </div>

                <div>
                  <b>Estimated monthly cost</b>
                  <p>
                    {item.monthly_estimated_cost == null
                      ? 'Not entered'
                      : `$${Number(item.monthly_estimated_cost).toFixed(2)}`}
                  </p>
                </div>

                <div>
                  <b>Contact</b>
                  <p>
                    {[
                      item.contact_name,
                      item.contact_phone,
                      item.contact_email,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Not entered'}
                  </p>
                </div>

                <div>
                  <b>Renewal date</b>
                  <p>{item.renewal_date || 'Not entered'}</p>
                </div>

                <div>
                  <b>Contract expires</b>
                  <p>{item.contract_end_date || 'Not entered'}</p>
                </div>

                <div>
                  <b>Cancel by</b>
                  <p>{item.cancellation_notice_date || 'Not entered'}</p>
                </div>

                <div>
                  <b>Auto-renewal</b>
                  <p>{titleCase(item.auto_renewal)}</p>
                </div>

                <div>
                  <b>Post-contract monthly rate</b>
                  <p>
                    {item.post_contract_monthly_cost == null
                      ? 'Not entered'
                      : `$${Number(item.post_contract_monthly_cost).toFixed(2)}`}
                  </p>
                </div>

                <div>
                  <b>Billing</b>
                  <p>
                    {titleCase(item.billing_frequency)}
                    {item.due_day
                      ? ` · Due day ${item.due_day}`
                      : ''}
                  </p>
                </div>
              </div>

              {item.contract_document_url && (
                <p>
                  <a
                    href={item.contract_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View contract document ↗
                  </a>
                </p>
              )}

              {item.portal_url && (
                <p>
                  <a
                    href={item.portal_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open provider website ↗
                  </a>
                </p>
              )}

              {item.notes && (
                <p className={styles.serviceNotes}>
                  {item.notes}
                </p>
              )}

              <ServiceDocuments
                kind="office"
                serviceId={item.id}
              />

              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                >
                  Edit
                </button>

                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => remove(item)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

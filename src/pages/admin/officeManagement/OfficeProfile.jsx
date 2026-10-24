import React, { useEffect, useState } from 'react';
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../AuthContext';
import { officeLevel } from '../../../utils/adminPermissions';
import { getOffice, updateOffice } from './officeService';

import ServiceAccounts from './ServiceAccounts';
import OfficeDocuments from './OfficeDocuments';
import OfficeCompliance from './OfficeCompliance';
import OfficeMaintenance from './OfficeMaintenance';
import OfficeOpeningTasks from './OfficeOpeningTasks';
import OfficeHistory from './OfficeHistory';
import OfficeContacts from './OfficeContacts';
import OfficeLandlordLease from './OfficeLandlordLease';
import OfficeOverview from './OfficeOverview';

import styles from './OfficeManagement.module.css';

const REGIONS = [
  'BAY AREA',
  'CEN-CAL',
  'KERN',
  'MERCED',
  'SAN DIEGO',
  'SOUTHERN CALIFORNIA',
  'STANISLAUS',
];

const STATUSES = [
  'planning',
  'opening',
  'active',
  'temporarily_closed',
  'closed',
  'sold',
];

const sections = [
  'Overview',
  'Contacts',
  'Service Accounts',
  'Landlord & Lease',
  'Documents',
  'Compliance',
  'Maintenance',
  'Opening Tasks',
  'History',
];

const editableFields = [
  'office_code',
  'office_name',
  'region',
  'status',
  'street_address',
  'city',
  'state',
  'zip_code',
  'phone',
  'email',
  'notes',
];

const labels = {
  office_code: 'Office Code',
  office_name: 'Office Name',
  street_address: 'Street Address',
  city: 'City',
  state: 'State',
  zip_code: 'ZIP Code',
  phone: 'Phone Number',
  email: 'Email',
};

function getEditValues(office) {
  return Object.fromEntries(
    editableFields.map(key => [key, office[key] ?? ''])
  );
}

export default function OfficeProfile() {
  const { officeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedTab = new URLSearchParams(location.search).get('tab');
  const validRequestedTab = sections.includes(requestedTab) ? requestedTab : 'Overview';
  const { profile } = useAuth();

  const fullAccess = officeLevel(profile?.permissions) === 'full';

  const [office, setOffice] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const tab = validRequestedTab;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!fullAccess) return;

    let cancelled = false;

    setOffice(null);
    setError('');
    setSuccess('');
    setEditing(false);
    getOffice(officeId)
      .then(data => {
        if (!cancelled) setOffice(data);
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [officeId, fullAccess]);

  const changeTab = (nextTab) => {
    const params = new URLSearchParams(location.search);
    if (nextTab === 'Overview') params.delete('tab');
    else params.set('tab', nextTab);
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '' }, { replace: true });
  };

  const startEditing = () => {
    setForm(getEditValues(office));
    setError('');
    setSuccess('');
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setForm({});
    setError('');
  };

  const changeField = (key, value) => {
    setForm(previous => ({
      ...previous,
      [key]: value,
    }));
  };

  const saveChanges = async e => {
    e.preventDefault();

    if (saving) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const values = {
        ...form,
        office_code: form.office_code.trim().toUpperCase(),
        office_name: form.office_name.trim(),
        street_address: form.street_address.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        zip_code: form.zip_code.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        notes: form.notes.trim(),
      };

      if (!values.office_code || !values.office_name) {
        throw new Error('Office code and office name are required.');
      }

      if (!REGIONS.includes(values.region)) {
        throw new Error('Please select a valid region.');
      }

      if (!STATUSES.includes(values.status)) {
        throw new Error('Please select a valid office status.');
      }

      if (
        values.zip_code &&
        !/^\d{5}(-\d{4})?$/.test(values.zip_code)
      ) {
        throw new Error('Enter a valid ZIP code.');
      }

      if (values.office_code !== office.office_code) {
        const confirmed = window.confirm(
          `Change office code from ${office.office_code} ` +
          `to ${values.office_code}?\n\n` +
          'Office codes are used in reports and other systems. ' +
          'Changing this code may require updating those references.'
        );

        if (!confirmed) return;
      }

      const updated = await updateOffice(officeId, values);

      setOffice(updated);
      setEditing(false);
      setForm({});
      setSuccess('Office information updated successfully.');
    } catch (e) {
      setError(e.message || 'Unable to save office changes.');
    } finally {
      setSaving(false);
    }
  };

  if (!fullAccess) {
    return (
      <main className={styles.page}>
        <p>Access denied.</p>
        <Link to="/admin/offices">
          Office Directory
        </Link>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Link to="/admin/offices">
        ← Office Directory
      </Link>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {success && (
        <p role="status" style={{ color: '#16803c' }}>
          {success}
        </p>
      )}

      {!office && !error && (
        <p>Loading office…</p>
      )}

      {office && (
        <>
          <header className={styles.header}>
            <div>
              <small>
                {office.office_code} · {office.region}
              </small>

              <h1>{office.office_name}</h1>

              <p>
                {[
                  office.street_address,
                  office.city,
                  office.state,
                  office.zip_code,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <span className={styles.pill}>
                {String(office.status || 'unknown')
                  .replaceAll('_', ' ')}
              </span>

              <button
                type="button"
                className={styles.primary}
                onClick={startEditing}
                disabled={editing}
              >
                Edit Office
              </button>
            </div>
          </header>

          {editing && (
            <form
              onSubmit={saveChanges}
              className={styles.panel}
              style={{ marginBottom: 20 }}
            >
              <h2>Edit Office Information</h2>

              <p>
                Update the information below and save your changes.
              </p>

              <div className={styles.formGrid}>
                {[
                  'office_code',
                  'office_name',
                  'street_address',
                  'city',
                  'state',
                  'zip_code',
                  'phone',
                  'email',
                ].map(key => (
                  <label key={key}>
                    {labels[key]}

                    <input
                      type={key === 'email' ? 'email' : 'text'}
                      required={
                        key === 'office_code' ||
                        key === 'office_name'
                      }
                      value={form[key] ?? ''}
                      onChange={e =>
                        changeField(key, e.target.value)
                      }
                    />
                  </label>
                ))}

                <label>
                  Region

                  <select
                    value={form.region || ''}
                    onChange={e =>
                      changeField('region', e.target.value)
                    }
                    required
                  >
                    {!REGIONS.includes(form.region) && (
                      <option value={form.region || ''}>
                        {form.region || 'Select region'}
                      </option>
                    )}

                    {REGIONS.map(region => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Status

                  <select
                    value={form.status || ''}
                    onChange={e =>
                      changeField('status', e.target.value)
                    }
                    required
                  >
                    {STATUSES.map(status => (
                      <option key={status} value={status}>
                        {status.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.wide}>
                  Notes

                  <textarea
                    rows={4}
                    value={form.notes ?? ''}
                    onChange={e =>
                      changeField('notes', e.target.value)
                    }
                  />
                </label>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  marginTop: 18,
                }}
              >
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>

                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <nav className={styles.tabs}>
            {sections.map(section => (
              <button
                key={section}
                type="button"
                className={
                  tab === section ? styles.selected : ''
                }
                onClick={() => changeTab(section)}
              >
                {section}
              </button>
            ))}
          </nav>

          <section className={styles.panel}>
            {tab === 'Contacts' ? (
              <OfficeContacts officeId={officeId} />
            ) : tab === 'Service Accounts' ? (
              <ServiceAccounts officeId={officeId} />
            ) : tab === 'Landlord & Lease' ? (
              <OfficeLandlordLease officeId={officeId} />
            ) : tab === 'Documents' ? (
              <OfficeDocuments officeId={officeId} />
            ) : tab === 'Compliance' ? (
              <OfficeCompliance officeId={officeId} />
            ) : tab === 'Maintenance' ? (
              <OfficeMaintenance
                officeId={officeId}
                officeCode={office.office_code}
              />
            ) : tab === 'Opening Tasks' ? (
              <OfficeOpeningTasks officeId={officeId} />
            ) : tab === 'History' ? (
              <OfficeHistory
                officeId={officeId}
                officeCode={office.office_code}
              />
            ) : tab === 'Overview' ? (
              <OfficeOverview office={office} officeId={officeId} onNavigate={changeTab} />
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
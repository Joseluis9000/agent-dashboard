import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { listOffices } from './officeService';
import {
  deleteContact,
  listContacts,
  saveContact,
  setContactOffices,
} from './contactsService';

import styles from './OfficeManagement.module.css';

const blank = {
  full_name: '',
  company: '',
  job_title: '',
  category: 'Other',
  phone: '',
  email: '',
  notes: '',
};

const categories = [
  'Landlord / Property Manager',
  'Utilities',
  'Internet / Phone Provider',
  'Maintenance / Repairs',
  'IT Support',
  'Security',
  'Licensing / Government',
  'Other',
];

export default function OfficeContacts({ officeId = null }) {
  const [contacts, setContacts] = useState([]);
  const [offices, setOffices] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [links, setLinks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [people, locations] = await Promise.all([
        listContacts(),
        listOffices(true),
      ]);

      setContacts(people);
      setOffices(locations);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visible = useMemo(
    () =>
      contacts.filter(
        c =>
          (!officeId ||
            (c.om_contact_offices || []).some(
              x => x.office_id === officeId
            )) &&
          [
            c.full_name,
            c.company,
            c.category,
            c.phone,
            c.email,
            c.job_title,
          ]
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase())
      ),
    [contacts, officeId, search]
  );

  const start = (contact = null) => {
    setEditing(contact?.id || 'new');

    setForm(
      contact
        ? Object.fromEntries(
            Object.keys(blank).map(k => [k, contact[k] || ''])
          )
        : { ...blank }
    );

    const assigned = contact
      ? (contact.om_contact_offices || []).map(x => x.office_id)
      : [];

    setLinks(
      officeId && !assigned.includes(officeId)
        ? [...assigned, officeId]
        : assigned
    );

    setError('');
  };

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const saved = await saveContact(
        {
          ...form,
          full_name: form.full_name.trim(),
        },
        editing === 'new' ? null : editing
      );

      await setContactOffices(saved.id, links);

      setEditing(null);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async c => {
    if (
      !window.confirm(
        `Delete ${c.full_name} from the company directory and all offices?`
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      await deleteContact(c.id);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const officeLabel = id => {
    const o = offices.find(x => x.id === id);

    return o
      ? `${o.office_code} ${o.office_name}`
      : 'Unknown office';
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div>
          <h2>
            {officeId ? 'Office Contacts' : 'Company Contacts'}
          </h2>

          <p>
            {officeId
              ? 'Contacts linked to this office also appear in the company directory.'
              : 'One shared directory for every office.'}
          </p>
        </div>

        <button
          type="button"
          className={styles.primary}
          onClick={() => start()}
        >
          + Add Contact
        </button>
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {editing && (
        <form
          onSubmit={submit}
          style={{
            border: '1px solid #ccc',
            borderRadius: 8,
            padding: 16,
            marginBottom: 18,
          }}
        >
          <h3>
            {editing === 'new'
              ? 'New contact'
              : 'Edit contact'}
          </h3>

          <div className={styles.formGrid}>
            {Object.keys(blank)
              .filter(k => !['category', 'notes'].includes(k))
              .map(k => (
                <label key={k}>
                  {({
                    full_name: 'Name',
                    company: 'Company / Vendor',
                    job_title: 'Job title',
                    phone: 'Phone',
                    email: 'Email',
                  })[k]}

                  <input
                    required={k === 'full_name'}
                    type={k === 'email' ? 'email' : 'text'}
                    value={form[k]}
                    onChange={e =>
                      setForm(v => ({
                        ...v,
                        [k]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}

            <label>
              Category

              <select
                value={form.category}
                onChange={e =>
                  setForm(v => ({
                    ...v,
                    category: e.target.value,
                  }))
                }
              >
                {categories.map(x => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>

            <label>
              Notes

              <textarea
                value={form.notes}
                onChange={e =>
                  setForm(v => ({
                    ...v,
                    notes: e.target.value,
                  }))
                }
              />
            </label>
          </div>

          <fieldset
            style={{
              margin: '16px 0',
              border: '1px solid #ccc',
              borderRadius: 8,
            }}
          >
            <legend>Linked offices</legend>

            <p>
              Only linked offices display this contact.
              Leave all unchecked for company-directory only.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(190px, 1fr))',
                gap: 8,
                maxHeight: 230,
                overflowY: 'auto',
              }}
            >
              {offices.map(o => (
                <label key={o.id}>
                  <input
                    type="checkbox"
                    checked={links.includes(o.id)}
                    onChange={e =>
                      setLinks(ids =>
                        e.target.checked
                          ? [...ids, o.id]
                          : ids.filter(id => id !== o.id)
                      )
                    }
                  />

                  {' '}
                  {o.office_code} {o.office_name}
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            className={styles.primary}
            disabled={busy || !form.full_name.trim()}
          >
            {busy ? 'Saving…' : 'Save contact'}
          </button>

          {' '}

          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(null)}
          >
            Cancel
          </button>
        </form>
      )}

      <input
        aria-label="Search contacts"
        placeholder="Search name, company, category, phone or email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%',
          padding: 10,
          marginBottom: 12,
          boxSizing: 'border-box',
        }}
      />

      {loading ? (
        <p>Loading contacts…</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.directoryTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company / Role</th>
                <th>Category</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Linked offices</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {visible.map(c => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.full_name}</strong>

                    {c.notes && (
                      <div
                        title={c.notes}
                        style={{ fontSize: 12 }}
                      >
                        Notes available
                      </div>
                    )}
                  </td>

                  <td>
                    {c.company || '—'}

                    {c.job_title && (
                      <div>{c.job_title}</div>
                    )}
                  </td>

                  <td>{c.category || '—'}</td>

                  <td>
                    {c.phone ? (
                      <a
                        href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}
                      >
                        {c.phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>

                  <td>
                    {c.email ? (
                      <a href={`mailto:${c.email}`}>
                        {c.email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>

                  <td>
                    {(c.om_contact_offices || []).length
                      ? c.om_contact_offices
                          .map(x => officeLabel(x.office_id))
                          .join(', ')
                      : 'Company only'}
                  </td>

                  <td>
                    <button
                      type="button"
                      onClick={() => start(c)}
                    >
                      Edit / Link
                    </button>

                    {' '}

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(c)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!visible.length && <p>No contacts found.</p>}
        </div>
      )}
    </div>
  );
}
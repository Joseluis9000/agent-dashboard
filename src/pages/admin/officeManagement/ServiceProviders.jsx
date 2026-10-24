
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import OfficeManagementNav from './OfficeManagementNav';
import {
  listProviders,
  listProviderAccounts,
  saveProvider,
} from './providerService';
import styles from './OfficeManagement.module.css';

const categories = [
  'electricity',
  'internet',
  'backup_internet',
  'water',
  'gas',
  'trash',
  'security',
  'phone',
  'other',
];

const pretty = value =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase());

const mask = value =>
  value ? `••••${String(value).slice(-4)}` : 'Not entered';

export default function ServiceProviders() {
  const [providers, setProviders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);

    try {
      const [providerRows, accountRows] = await Promise.all([
        listProviders(),
        listProviderAccounts(),
      ]);

      setProviders(providerRows);
      setAccounts(accountRows);
      setError('');
    } catch (e) {
      setError(e.message || 'Unable to load service providers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const matching = useMemo(
    () =>
      providers.filter(provider =>
        [provider.name, provider.category]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [providers, search]
  );

  const active = providers.find(provider => provider.id === selected);

  const linked = accounts.filter(
    account =>
      account.provider_id === selected &&
      (!region || account.om_offices?.region === region)
  );

  const regions = [
    ...new Set(
      accounts.map(account => account.om_offices?.region).filter(Boolean)
    ),
  ].sort();

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      if (!form.name.trim()) {
        throw new Error('Provider name is required.');
      }

      const saved = await saveProvider(
        {
          name: form.name.trim(),
          category: form.category,
          support_phone: form.support_phone.trim() || null,
          website: form.website.trim() || null,
          notes: form.notes.trim() || null,
        },
        form.id
      );

      setForm(null);
      setSelected(saved.id);
      setNotice('Provider saved.');
      await reload();
    } catch (e) {
      setError(e.message || 'Unable to save provider.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <OfficeManagementNav />

      <header className={styles.header}>
        <div>
          <small>OFFICE MANAGEMENT / COMPANY SERVICES</small>
          <h1>Service Providers</h1>
          <p>
            One provider directory for electricity, internet,
            emergency hotspots, and other office utilities.
          </p>
        </div>

        <button
          type="button"
          className={styles.primary}
          onClick={() =>
            setForm({
              name: '',
              category: 'electricity',
              support_phone: '',
              website: '',
              notes: '',
            })
          }
        >
          + Add Provider
        </button>
      </header>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {notice && <p role="status">{notice}</p>}

      {form && (
        <form className={styles.serviceForm} onSubmit={submit}>
          <h2>{form.id ? 'Edit Provider' : 'New Provider'}</h2>

          <div className={styles.formGrid}>
            <label>
              Company name *
              <input
                required
                value={form.name}
                onChange={e =>
                  setForm({ ...form, name: e.target.value })
                }
              />
            </label>

            <label>
              Service category
              <select
                value={form.category}
                onChange={e =>
                  setForm({ ...form, category: e.target.value })
                }
              >
                {categories.map(category => (
                  <option key={category} value={category}>
                    {pretty(category)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Support phone
              <input
                value={form.support_phone}
                onChange={e =>
                  setForm({ ...form, support_phone: e.target.value })
                }
              />
            </label>

            <label>
              Website
              <input
                type="url"
                value={form.website}
                onChange={e =>
                  setForm({ ...form, website: e.target.value })
                }
              />
            </label>

            <label className={styles.wide}>
              Notes
              <textarea
                value={form.notes}
                onChange={e =>
                  setForm({ ...form, notes: e.target.value })
                }
              />
            </label>
          </div>

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primary}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Provider'}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => setForm(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <section className={styles.panel}>
        <div className={styles.filters}>
          <input
            placeholder="Search providers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <p>Loading providers...</p>
        ) : (
          <div className={styles.serviceCards}>
            {matching.map(provider => {
              const rows = accounts.filter(
                account => account.provider_id === provider.id
              );

              return (
                <article
                  key={provider.id}
                  className={styles.serviceCard}
                >
                  <span className={styles.serviceType}>
                    {pretty(provider.category)}
                  </span>

                  <h3>{provider.name}</h3>

                  <p>
                    {new Set(rows.map(row => row.office_id)).size} offices
                    {' · '}
                    {rows.length} accounts
                  </p>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(provider.id);
                        setRegion('');
                      }}
                    >
                      View Offices
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...provider,
                          support_phone: provider.support_phone || '',
                          website: provider.website || '',
                          notes: provider.notes || '',
                        })
                      }
                    >
                      Edit Provider
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {active && (
        <section className={styles.panel}>
          <h2>{active.name} — Office Accounts</h2>

          <p>
            {pretty(active.category)} · {linked.length} linked accounts
          </p>

          <label>
            Filter by region
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
            >
              <option value="">All regions</option>
              {regions.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          {!linked.length ? (
            <p>
              No linked accounts in this selection. Open an office's
              Service Accounts tab and select this provider.
            </p>
          ) : (
            <div className={styles.serviceCards}>
              {linked.map(account => (
                <article
                  key={account.id}
                  className={styles.serviceCard}
                >
                  <h3>
                    {account.om_offices?.office_code || 'Unknown office'}
                    {' — '}
                    {account.om_offices?.office_name || ''}
                  </h3>

                  <p>
                    {account.om_offices?.region || 'Unassigned region'}
                    {' · '}
                    {pretty(account.service_type)}
                  </p>

                  <p>
                    Account: {mask(account.account_number)}
                    {' · '}
                    Status: {pretty(account.service_status)}
                  </p>

                  {account.hotspot_line_number && (
                    <p>
                      Hotspot line: {mask(account.hotspot_line_number)}
                    </p>
                  )}

                  {account.hotspot_last_tested && (
                    <p>
                      Last tested: {account.hotspot_last_tested}
                    </p>
                  )}

                  {account.renewal_date && (
                    <p>Renewal: {account.renewal_date}</p>
                  )}

                  <Link
                    to={
                      `/admin/offices/${account.office_id}` +
                      `?tab=Service%20Accounts&account=${account.id}`
                    }
                  >
                    View Office Service Account →
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

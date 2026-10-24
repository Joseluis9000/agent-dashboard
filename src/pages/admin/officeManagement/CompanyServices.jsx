import PendingServiceDocuments from './PendingServiceDocuments';
import { uploadPendingServiceFiles } from './pendingServiceUpload';
import ServiceDocuments from './ServiceDocuments';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteCompanyService, listCompanyServices, listOffices, saveCompanyService, setCompanyServiceOffices } from './officeService';
import styles from './OfficeManagement.module.css';
import OfficeManagementNav from './OfficeManagementNav';

const empty = { service_type: 'software', provider_name: '', service_name: '', account_number: '', account_holder: '', service_status: 'active', billing_frequency: 'monthly', current_cost: '', post_contract_monthly_cost: '', contract_start_date: '', contract_end_date: '', renewal_date: '', cancellation_notice_date: '', auto_renewal: 'unknown', contract_term_months: '', contact_name: '', contact_phone: '', contact_email: '', portal_url: '', contract_document_url: '', notes: '' };
const labels = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const money = value => value == null || value === '' ? 'Not entered' : `$${Number(value).toFixed(2)}`;
const dateFields = ['contract_start_date', 'contract_end_date', 'renewal_date', 'cancellation_notice_date'];
const nullableNumbers = ['current_cost', 'post_contract_monthly_cost', 'contract_term_months'];
const textKeys = ['account_number', 'account_holder', 'contact_name', 'contact_phone', 'contact_email', 'portal_url', 'contract_document_url', 'notes'];
const clean = form => {
  const data = { ...form, provider_name: form.provider_name.trim(), service_name: form.service_name.trim() };
  [...dateFields, ...textKeys].forEach(key => { data[key] = data[key]?.trim() || null; });
  nullableNumbers.forEach(key => { data[key] = form[key] === '' ? null : Number(form[key]); });
  return data;
};
const daysTo = date => date ? Math.ceil((new Date(`${date}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
const nextDeadline = item => [item.cancellation_notice_date, item.renewal_date, item.contract_end_date].filter(Boolean).sort()[0];
export default function CompanyServices({ renewalsOnly = false }) {
  const [services, setServices] = useState([]);
  const [offices, setOffices] = useState([]);
  const [form, setForm] = useState(null);
  const [selectedOffices, setSelectedOffices] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [servicesData, officesData] = await Promise.all([listCompanyServices(), listOffices()]);
      setServices(servicesData); setOffices(officesData); setError('');
    } catch (err) { setError(err.message || 'Unable to load company services.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const filtered = useMemo(() => services.filter(s => (!renewalsOnly || Boolean(nextDeadline(s))) && [s.service_name, s.provider_name, s.service_type].join(' ').toLowerCase().includes(search.toLowerCase())).sort((a, b) => renewalsOnly ? (nextDeadline(a) || '9999').localeCompare(nextDeadline(b) || '9999') : 0), [services, search, renewalsOnly]);
  const change = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const startNew = () => { setForm({ ...empty }); setEditingId(null); setSelectedOffices([]); setPendingFiles([]); setError(''); setNotice(''); };
  const startEdit = item => { setForm(Object.fromEntries(Object.keys(empty).map(k => [k, item[k] ?? '']))); setEditingId(item.id); setSelectedOffices((item.om_company_service_offices || []).map(x => x.office_id)); setPendingFiles([]); setError(''); setNotice(''); };
  const save = async e => {
    e.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      if (!form.service_name.trim() || !form.provider_name.trim()) throw new Error('Service and provider names are required.');
      const record = await saveCompanyService(clean(form), editingId);
      // Upload before updating assignments so failed files remain available for retry.
      if (pendingFiles.length) {
        const result = await uploadPendingServiceFiles({ kind: 'company', serviceId: record.id, files: pendingFiles });
        if (result.failed.length) {
          setEditingId(record.id);
          setPendingFiles(result.failed);
          setError(`Company service saved, but ${result.failed.length} document(s) failed to upload. Click Save Company Service to retry. ${result.errors.join(' | ')}`);
          await reload();
          return;
        }
        setPendingFiles([]);
      }
      try { await setCompanyServiceOffices(record.id, selectedOffices); }
      catch (linkError) { setEditingId(record.id); throw new Error(`Service saved, but office assignments failed: ${linkError.message}`); }
      setForm(null); setEditingId(null); setNotice('Company service and documents saved.'); await reload();
    } catch (err) { setError(err.message || 'Unable to save.'); }
    finally { setSaving(false); }
  };
  const remove = async item => {
    if (!window.confirm(`Delete ${item.service_name}? This also removes its office assignments.`)) return;
    try { await deleteCompanyService(item.id); setNotice('Company service deleted.'); await reload(); }
    catch (err) { setError(err.message || 'Unable to delete.'); }
  };
  const field = (label, key, type = 'text', props = {}) => <label key={key}>{label}<input type={type} value={form[key]} onChange={e => change(key, e.target.value)} {...props} /></label>;
  const select = (label, key, options) => <label key={key}>{label}<select value={form[key]} onChange={e => change(key, e.target.value)}>{options.map(o => <option key={o} value={o}>{labels(o)}</option>)}</select></label>;
  const deadlines = services.filter(s => nextDeadline(s) && daysTo(nextDeadline(s)) <= 90).length;
  return <main className={styles.page}>
    <OfficeManagementNav />
    {!renewalsOnly && (
      <p style={{ margin: '12px 0 18px' }}>
        <Link to="/admin/offices/service-providers">
          Browse Service Provider Directory →
        </Link>
      </p>
    )}
    <header className={styles.header}><div><small>OFFICE MANAGEMENT</small><h1>{renewalsOnly ? 'Contract Renewals' : 'Company Services'}</h1><p>{renewalsOnly ? 'Companywide contracts sorted by their next renewal, expiration or cancellation deadline. Office-specific renewals remain in each office profile.' : 'Track companywide subscriptions, vendor contracts, renewal deadlines and office coverage.'}</p></div><button type="button" className={styles.primary} onClick={startNew}>+ Add Company Service</button></header>
    <div className={styles.stats}><div><span>Company services</span><strong>{services.length}</strong></div><div><span>Deadlines within 90 days / overdue</span><strong>{deadlines}</strong></div><div><span>Office locations</span><strong>{offices.length}</strong></div></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.success} role="status">{notice}</p>}
    {!renewalsOnly && form && <form className={styles.serviceForm} onSubmit={save}>
      <h2>{editingId ? 'Edit Company Service' : 'New Company Service'}</h2>
      <div className={styles.formGrid}>
        {field('Service name *', 'service_name', 'text', { required: true })}
        {field('Provider name *', 'provider_name', 'text', { required: true })}
        {select('Service type', 'service_type', ['software','phone','internet','security','it_support','insurance','other'])}
        {select('Status', 'service_status', ['active','pending','cancelled','unknown'])}
        {field('Account number', 'account_number')}{field('Account holder', 'account_holder')}
        {select('Billing frequency', 'billing_frequency', ['monthly','quarterly','annually','other','unknown'])}
        {field('Current cost per billing period ($)', 'current_cost', 'number', { min: 0, step: '0.01' })}
        {field('Post-contract monthly rate ($)', 'post_contract_monthly_cost', 'number', { min: 0, step: '0.01' })}
        {field('Contract term (months)', 'contract_term_months', 'number', { min: 1, step: 1 })}
        {field('Contract start', 'contract_start_date', 'date')}{field('Contract expiration', 'contract_end_date', 'date')}
        {field('Renewal date', 'renewal_date', 'date')}{field('Cancellation notice deadline', 'cancellation_notice_date', 'date')}
        {select('Auto-renewal', 'auto_renewal', ['unknown','yes','no'])}
        {field('Contact name', 'contact_name')}{field('Contact phone', 'contact_phone', 'tel')}
        {field('Contact email', 'contact_email', 'email')}
        {field('Provider website', 'portal_url', 'url', { placeholder: 'https://...' })}
        <PendingServiceDocuments files={pendingFiles} onChange={setPendingFiles} disabled={saving} />
        <label className={styles.wide}>Offices using this service <span className={styles.helper}>(optional; leave blank for companywide only)</span><select multiple size={Math.min(8, Math.max(3, offices.length))} value={selectedOffices} onChange={e => setSelectedOffices(Array.from(e.target.selectedOptions, o => o.value))}>{offices.map(o => <option key={o.id} value={o.id}>{o.office_code} — {o.office_name}</option>)}</select><span className={styles.helper}>Hold Ctrl (Windows) or Command (Mac) to select multiple offices.</span></label>
        <label className={styles.wide}>Notes<textarea rows={3} value={form.notes} onChange={e => change('notes', e.target.value)} /></label>
      </div><p className={styles.helper}>Do not store passwords, payment card numbers, or security answers. Document links should point to access-controlled storage.</p>
      <div className={styles.actions}><button className={styles.primary} type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Company Service'}</button><button type="button" disabled={saving} onClick={() => { setForm(null); setPendingFiles([]); }}>Cancel</button></div>
    </form>}
    <section className={styles.panel}><div className={styles.filters}><input aria-label="Search company services" placeholder={renewalsOnly ? 'Search companywide renewals...' : 'Search company services or providers...'} value={search} onChange={e => setSearch(e.target.value)} /></div>
      {loading ? <p>Loading...</p> : !filtered.length ? <p className={styles.empty}>{renewalsOnly ? 'No companywide contract deadlines recorded yet.' : 'No matching company services. Add your first companywide subscription or contract.'}</p> : <div className={styles.serviceCards}>{filtered.map(item => {
        const deadline = nextDeadline(item); const days = daysTo(deadline); const linked = item.om_company_service_offices || [];
        return <article className={styles.serviceCard} key={item.id}>
          <div className={styles.serviceCardTop}><div><span className={styles.serviceType}>{labels(item.service_type)}</span><h3>{item.service_name}</h3><p>{item.provider_name}</p></div><span className={styles.pill}>{labels(item.service_status)}</span></div>
          <div className={styles.serviceDetails}><div><b>Current cost</b><p>{money(item.current_cost)} / {item.billing_frequency}</p></div><div><b>Post-contract monthly</b><p>{money(item.post_contract_monthly_cost)}</p></div><div><b>Renewal date</b><p>{item.renewal_date || 'Not entered'}</p></div><div><b>Contract expiration</b><p>{item.contract_end_date || 'Not entered'}</p></div><div><b>Cancel by</b><p>{item.cancellation_notice_date || 'Not entered'}</p></div><div><b>Auto-renewal</b><p>{labels(item.auto_renewal)}</p></div><div><b>Offices covered</b><p>{linked.length ? linked.map(x => offices.find(o => o.id === x.office_id)?.office_code || 'Unknown').join(', ') : 'Companywide / not assigned'}</p></div><div><b>Next deadline</b><p>{deadline ? `${deadline} (${days < 0 ? `${Math.abs(days)} days overdue` : `${days} days`})` : 'Not entered'}</p></div></div>
          {item.portal_url && <p><a href={item.portal_url} target="_blank" rel="noopener noreferrer">Provider website ↗</a></p>}
          {item.contract_document_url && <p><a href={item.contract_document_url} target="_blank" rel="noopener noreferrer">Contract document ↗</a></p>}
          {item.notes && <p className={styles.serviceNotes}>{item.notes}</p>}
          <ServiceDocuments kind="company" serviceId={item.id} />
          <div className={styles.actions}><button type="button" onClick={() => startEdit(item)}>Edit</button><button type="button" className={styles.dangerButton} onClick={() => remove(item)}>Delete</button></div>
        </article>;
      })}</div>}
    </section>
  </main>;
}

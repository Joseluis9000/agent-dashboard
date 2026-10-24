import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listServiceAccounts } from './officeService';
import { listLeases, listPropertyEvents, listLeaseDocuments } from './landlordService';
import styles from './OfficeManagement.module.css';

const card = { border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff', minWidth: 0 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 14 };
const small = { color: '#64748b', fontSize: 13, margin: '6px 0' };
const linkStyle = { background: 'none', border: 'none', color: '#1766ad', cursor: 'pointer', padding: 0, textAlign: 'left', fontWeight: 600 };
const display = value => String(value || 'Not entered').replaceAll('_', ' ');
const currency = value => value == null ? 'Not entered' : Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const daysUntil = date => date ? Math.round((new Date(`${date}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
const statusColor = days => days == null ? '#64748b' : days < 0 ? '#b91c1c' : days <= 90 ? '#b45309' : '#15803d';

export default function OfficeOverview({ office, officeId, onNavigate }) {
  const [data, setData] = useState({ accounts: [], leases: [], events: [], documents: [] });
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState([]);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([listServiceAccounts(officeId), listLeases(officeId), listPropertyEvents(officeId)]);
      const [accounts, leases, events] = results.map(r => r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
      const problems = results.flatMap((r, i) => r.status === 'rejected' ? [`${['Service accounts', 'Leases', 'Property history'][i]}: ${r.reason?.message || 'Unable to load'}`] : []);
      const lease = leases.find(x => x.status === 'active') || leases[0];
      let documents = [];
      if (lease) {
        try { documents = await listLeaseDocuments(lease.id); }
        catch (err) { problems.push(`Lease documents: ${err.message}`); }
      }
      setData({ accounts, leases, events, documents: Array.isArray(documents) ? documents : [] });
      setWarnings(problems);
    } finally { setLoading(false); }
  }, [officeId]);
  useEffect(() => { refresh(); }, [refresh]);
  const { accounts, leases, events, documents } = data;
  const activeLease = leases.find(x => x.status === 'active');
  const activeAccounts = accounts.filter(x => x.service_status === 'active');
  const openRepairs = events.filter(x => ['repair_request', 'vendor_visit'].includes(x.event_type) && !['completed', 'closed'].includes(x.status));
  const deadlines = useMemo(() => {
    const items = [];
    if (activeLease) {
      [['Lease expiration', activeLease.lease_end], ['Renewal notice', activeLease.renewal_notice_deadline], ['Termination notice', activeLease.termination_notice_deadline]].forEach(([title, date]) => { if (date) items.push({ title, date, tab: 'Landlord & Lease' }); });
    }
    accounts.forEach(x => {
      [['Service contract ends', x.contract_end_date], ['Service renewal', x.renewal_date], ['Cancellation notice', x.cancellation_notice_date]].forEach(([title, date]) => {
        if (date) items.push({ title: `${title}: ${x.provider_name || display(x.service_type)}`, date, tab: 'Service Accounts' });
      });
    });
    return items.filter(x => daysUntil(x.date) >= -30).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [activeLease, accounts]);
  const jump = tab => <button type="button" style={linkStyle} onClick={() => onNavigate(tab)}>Open {tab} →</button>;
  const section = (title, children, tab) => <section style={card}><h3 style={{ marginTop: 0 }}>{title}</h3>{children}{tab && jump(tab)}</section>;
  return <div style={{ display: 'grid', gap: 18 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div><h2 style={{ margin: 0 }}>Office Overview</h2><p style={small}>Operational snapshot of this location's records.</p></div>
      <button type="button" onClick={refresh} disabled={loading}>↻ Refresh overview</button>
    </div>
    {warnings.length > 0 && <p className={styles.error} role="alert">Some sections could not load: {warnings.join(' · ')}</p>}
    {loading ? <p>Loading office summary…</p> : <>
      <div style={grid}>
        <div style={card}><p style={small}>Office status</p><strong style={{ fontSize: 22 }}>{display(office.status)}</strong><p style={small}>{office.office_code} · {office.region}</p></div>
        <div style={card}><p style={small}>Active service accounts</p><strong style={{ fontSize: 24 }}>{activeAccounts.length}</strong><p style={small}>{accounts.length} total accounts</p>{jump('Service Accounts')}</div>
        <div style={card}><p style={small}>Lease status</p><strong style={{ fontSize: 20 }}>{activeLease ? 'Active lease' : 'No active lease'}</strong><p style={small}>{activeLease?.lease_end ? `Expires ${activeLease.lease_end}` : 'Expiration not recorded'}</p>{jump('Landlord & Lease')}</div>
        <div style={card}><p style={small}>Open repair items</p><strong style={{ fontSize: 24 }}>{openRepairs.length}</strong><p style={small}>Open property repair requests / visits</p>{jump('Landlord & Lease')}</div>
      </div>
      <div style={grid}>
        {section('Location & Contacts', <><p><b>Address:</b> {[office.street_address, office.city, office.state, office.zip_code].filter(Boolean).join(', ') || 'Not entered'}</p><p><b>Phone:</b> {office.phone || 'Not entered'}</p><p><b>Email:</b> {office.email || 'Not entered'}</p></>, 'Contacts')}
        {section('Landlord & Lease', activeLease ? <><p><b>Landlord:</b> {activeLease.om_landlords?.name || 'Not entered'}</p><p><b>Base rent:</b> {currency(activeLease.base_rent)} / month</p><p><b>CAM/NNN:</b> {currency(activeLease.cam_nnn)}</p><p><b>Expiration:</b> {activeLease.lease_end || 'Not entered'}</p><p><b>Renewal notice:</b> {activeLease.renewal_notice_deadline || 'Not entered'}</p><p><b>Lease documents:</b> {documents.length}</p></> : <p>No active lease recorded. Open the lease tab to add one.</p>, 'Landlord & Lease')}
        {section('Utilities & Connectivity', ['electricity', 'internet', 'backup_internet', 'water', 'gas', 'phone', 'security'].map(type => { const matching = activeAccounts.filter(x => x.service_type === type); return <p key={type}><b>{display(type)}:</b> {matching.length ? matching.map(x => x.provider_name || 'Provider not entered').join(', ') : 'Not recorded'}</p>; }), 'Service Accounts')}
      </div>
      <div style={grid}>
        {section('Upcoming Deadlines', deadlines.length ? deadlines.map((x, i) => { const days = daysUntil(x.date); return <div key={`${x.title}-${i}`} style={{ padding: '9px 0', borderBottom: '1px solid #eee' }}><b>{x.title}</b><p style={small}>{x.date} · <span style={{ color: statusColor(days), fontWeight: 600 }}>{days < 0 ? `${-days} days overdue` : days === 0 ? 'Due today' : `${days} days remaining`}</span></p><button type="button" style={linkStyle} onClick={() => onNavigate(x.tab)}>View details →</button></div>; }) : <p>No upcoming deadlines recorded.</p>)}
        {section('Recent Property Activity', events.length ? [...events].sort((a, b) => String(b.event_date || '').localeCompare(String(a.event_date || ''))).slice(0, 5).map(x => <div key={x.id} style={{ padding: '9px 0', borderBottom: '1px solid #eee' }}><b>{x.title}</b><p style={small}>{x.event_date} · {display(x.status)} · {display(x.event_type)}</p></div>) : <p>No property events recorded yet.</p>, 'Landlord & Lease')}
      </div>
      {section('Office Management Sections', <div style={grid}>{['Contacts', 'Service Accounts', 'Landlord & Lease', 'Documents', 'Compliance', 'Maintenance', 'Opening Tasks', 'History'].map(name => <button key={name} type="button" onClick={() => onNavigate(name)} style={{ padding: 13, textAlign: 'left', border: '1px solid #e2e8f0', borderRadius: 9, background: '#f8fafc', cursor: 'pointer', fontWeight: 600 }}>{name} →</button>)}</div>)}
      {office.notes && section('Office Notes', <p style={{ whiteSpace: 'pre-wrap' }}>{office.notes}</p>)}
    </>}
  </div>;
}

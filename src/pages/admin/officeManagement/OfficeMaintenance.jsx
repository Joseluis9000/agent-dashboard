import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getOffice } from './officeService';
import { isMaintenanceTicket, listOfficeTickets, listMaintenanceRecords, saveMaintenanceRecord, deleteMaintenanceRecord } from './officeMaintenanceService';
import styles from './OfficeManagement.module.css';
import {listSettings} from './officeSettingsService';

const initial = { title: '', ticket_id: '', category: 'general', status: 'completed', work_date: '', vendor: '', technician: '', invoice_number: '', estimated_cost: '', actual_cost: '', payment_amount: '', cost_notes: '', outcome: '', additional_notes: '', follow_up_date: '' };
const date = v => v ? new Date(v).toLocaleDateString() : 'Not recorded';
const money = n => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const completed = t => String(t.status || '').toLowerCase() === 'completed';
const label = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase());
const nullableText = ['vendor','technician','invoice_number','cost_notes','outcome','additional_notes'];
const clean = (form, officeId) => {
  const result = { office_id: officeId, title: form.title.trim(), category: form.category, status: form.status,
    ticket_id: form.ticket_id ? Number(form.ticket_id) : null,
    work_date: form.work_date || null, follow_up_date: form.follow_up_date || null,
    estimated_cost: form.estimated_cost === '' ? null : Number(form.estimated_cost),
    actual_cost: form.actual_cost === '' ? null : Number(form.actual_cost),
    payment_amount: form.payment_amount === '' ? null : Number(form.payment_amount) };
  nullableText.forEach(k => { result[k] = form[k].trim() || null; });
  return result;
};
export default function OfficeMaintenance({ officeId }) {
  const [tickets, setTickets] = useState([]);
  const [maintenanceCategories,setMaintenanceCategories]=useState([]);
  const [records, setRecords] = useState([]);
  const [officeCode, setOfficeCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [allCategories, setAllCategories] = useState(false);
  const [expanded, setExpanded] = useState({});
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const office = await getOffice(officeId);
      const [ticketRows, recordRows,cats] = await Promise.all([listOfficeTickets(office.office_code), listMaintenanceRecords(officeId),listSettings('maintenance')]);
       setMaintenanceCategories(cats);
      setOfficeCode(office.office_code); setTickets(ticketRows); setRecords(recordRows); setError('');
    } catch (e) { setError(e.message || 'Unable to load maintenance.'); }
    finally { setLoading(false); }
  }, [officeId]);
  useEffect(() => { reload(); }, [reload]);
  const relevant = useMemo(() => tickets.filter(t => allCategories || isMaintenanceTicket(t)), [tickets, allCategories]);
  const linked = useMemo(() => records.reduce((map, record) => {
    if (record.ticket_id != null) (map[String(record.ticket_id)] ||= []).push(record);
    return map;
  }, {}), [records]);
  const standalone = records.filter(r => r.ticket_id == null);
  const visibleTickets = relevant.filter(t => {
    if (status === 'completed' && !completed(t)) return false;
    if (status === 'open' && completed(t)) return false;
    return [t.id,t.category,t.description,t.status,t.vendor,t.admin_notes,t.action_log, ...(linked[String(t.id)] || []).flatMap(r => [r.title,r.outcome,r.additional_notes])].join(' ').toLowerCase().includes(search.toLowerCase());
  });
  const visibleStandalone = standalone.filter(r => (status === 'all' || (status === 'completed' ? r.status === 'completed' : r.status !== 'completed')) && [r.title,r.category,r.vendor,r.outcome,r.additional_notes].join(' ').toLowerCase().includes(search.toLowerCase()));
  const totalCost = records.reduce((sum,r) => sum + (Number(r.actual_cost) || 0), 0);
  const begin = (record = null, ticket = null) => {
    setEditingId(record?.id || null);
    setForm(record ? Object.fromEntries(Object.keys(initial).map(k => [k, record[k] ?? ''])) : {
      ...initial, ticket_id: ticket ? String(ticket.id) : '', title: ticket ? (ticket.description || '').split('\n').find(Boolean)?.slice(0, 180) || `Ticket #${ticket.id}` : '',
      category: ticket ? 'repair' : 'general', status: ticket && !completed(ticket) ? 'in_progress' : 'completed',
      work_date: ticket?.completed_at?.slice(0,10) || '' });
    setError(''); setNotice('');
  };
  const submit = async e => {
    e.preventDefault(); if (saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const values = clean(form, officeId);
      if (!values.title) throw new Error('A maintenance title is required.');
      if (['estimated_cost', 'actual_cost', 'payment_amount'].some(k => values[k] !== null && (!Number.isFinite(values[k]) || values[k] < 0 || !/^\d+(?:\.\d{1,2})?$/.test(String(form[k]))))) throw new Error('Cost and payment amounts must be nonnegative numbers with up to two decimal places.');
      await saveMaintenanceRecord(values, editingId);
      setForm(null); setEditingId(null);
      await reload(); setNotice('Maintenance record saved. Original ticket data was not changed.');
    } catch (e) { setError(e.message || 'Unable to save record.'); }
    finally { setSaving(false); }
  };
  const remove = async record => {
    if (!window.confirm(`Delete maintenance entry "${record.title}"? The original ticket will remain unchanged.`)) return;
    setError(''); setNotice('');
    try { await deleteMaintenanceRecord(record.id); await reload(); setNotice('Maintenance entry deleted.'); }
    catch (e) { setError(e.message || 'Unable to delete entry.'); }
  };
  const field = (title,key,type='text',props={}) => <label key={key}>{title}<input type={type} value={form[key]} onChange={e => setForm(f => ({...f,[key]:e.target.value}))} {...props} /></label>;
  const notes = (title,key) => <label className={styles.wide} key={key}>{title}<textarea rows={3} value={form[key]} onChange={e => setForm(f => ({...f,[key]:e.target.value}))} /></label>;
  const recordCard = record => <div key={record.id} style={{padding:12,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,marginTop:10}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><strong>{record.title}</strong><span>{label(record.status)}</span></div>
    <div className={styles.serviceDetails} style={{marginTop:10}}>
      <div><b>Work date</b><p>{record.work_date || 'Not recorded'}</p></div><div><b>Actual cost</b><p>{record.actual_cost == null ? 'Not entered' : money(record.actual_cost)}</p></div>
      <div><b>Estimated cost</b><p>{record.estimated_cost == null ? 'Not entered' : money(record.estimated_cost)}</p></div><div><b>Vendor / technician</b><p>{[record.vendor,record.technician].filter(Boolean).join(' · ') || 'Not entered'}</p></div>
      <div><b>Payment amount</b><p>{record.payment_amount == null ? 'Not entered' : money(record.payment_amount)}</p></div><div><b>Invoice</b><p>{record.invoice_number || 'Not entered'}</p></div><div><b>Follow-up</b><p>{record.follow_up_date || 'None'}</p></div>
    </div>
    {record.outcome && <p><b>Outcome:</b> {record.outcome}</p>}
    {record.additional_notes && <p style={{whiteSpace:'pre-wrap'}}><b>Additional notes:</b> {record.additional_notes}</p>}
    {record.cost_notes && <p style={{whiteSpace:'pre-wrap'}}><b>Cost notes:</b> {record.cost_notes}</p>}
    <div className={styles.actions}><button type="button" onClick={() => begin(record)}>Edit entry</button><button type="button" className={styles.dangerButton} onClick={() => remove(record)}>Delete entry</button></div>
  </div>;
  return <div>
    <div className={styles.serviceHeading}><div><h2>Maintenance History & Costs</h2><p>Original tickets are read-only. Add linked repair details or standalone maintenance for {officeCode || 'this office'}.</p></div><button type="button" className={styles.primary} onClick={() => begin()}>+ Add Maintenance</button></div>
    <div className={styles.stats}><div><span>Maintenance tickets</span><strong>{relevant.length}</strong></div><div><span>Supplemental entries</span><strong>{records.length}</strong></div><div><span>Recorded actual costs</span><strong>{money(totalCost)}</strong></div></div>
    <p className={styles.helper}>Cost totals include only amounts entered in supplemental maintenance records; tickets without a recorded cost are not assumed to be free. Linked entries remain separate from the original ticket system.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.success}>{notice}</p>}
    {form && <form className={styles.serviceForm} onSubmit={submit}><h3>{editingId ? 'Edit Maintenance Entry' : 'New Maintenance Entry'}</h3>
      <div className={styles.formGrid}>
        {field('Work / repair title *','title','text',{required:true,maxLength:250})}
        <label>Related ticket (optional)<select value={form.ticket_id} onChange={e => setForm(f => ({...f,ticket_id:e.target.value}))}><option value="">Standalone maintenance (no ticket)</option>{tickets.map(t => <option key={t.id} value={t.id}>#{t.id} — {(t.description || t.category || 'Ticket').slice(0,95)}</option>)}</select></label>
        <label>Category<select value={form.category} onChange={e => setForm(f => ({...f,category:e.target.value}))}>{[...new Set([...maintenanceCategories.map(x=>x.item_key),form.category])].map(x => <option key={x} value={x}>{maintenanceCategories.find(c=>c.item_key===x)?.label||label(x)}</option>)}</select></label>
        <label>Work status<select value={form.status} onChange={e => setForm(f => ({...f,status:e.target.value}))}>{['planned','in_progress','completed','cancelled'].map(x => <option key={x} value={x}>{label(x)}</option>)}</select></label>
        {field('Work date','work_date','date')}{field('Follow-up date','follow_up_date','date')}
        {field('Vendor / company','vendor')}{field('Technician / contact','technician')}
        {field('Estimated cost ($)','estimated_cost','number',{min:0,step:'0.01'})}{field('Actual cost ($)','actual_cost','number',{min:0,step:'0.01'})}
        {field('Payment amount ($)','payment_amount','number',{min:0,step:'0.01',inputMode:'decimal',placeholder:'0.00'})}
         {field('Invoice / receipt number','invoice_number')}
        {notes('Work performed / outcome','outcome')}{notes('Additional maintenance notes','additional_notes')}{notes('Cost / payment notes','cost_notes')}
      </div><p className={styles.helper}>Do not store card numbers, passwords, or security answers. Costs and notes save only to the Office Management maintenance table.</p>
      <div className={styles.actions}><button type="submit" className={styles.primary} disabled={saving}>{saving ? 'Saving...' : 'Save Maintenance Entry'}</button><button type="button" disabled={saving} onClick={() => setForm(null)}>Cancel</button></div>
    </form>}
    <div className={styles.filters}><input aria-label="Search maintenance history" placeholder="Search tickets, vendors, outcomes or notes" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="completed">Completed</option><option value="open">Not completed</option></select><label style={{display:'flex',alignItems:'center',gap:6,fontSize:13}}><input type="checkbox" checked={allCategories} onChange={e => setAllCategories(e.target.checked)} />All ticket categories</label></div>
    {loading ? <p>Loading maintenance...</p> : <>
      <h3>Standalone Maintenance ({visibleStandalone.length})</h3>
      {!visibleStandalone.length ? <p className={styles.empty}>No standalone maintenance matches your filters.</p> : visibleStandalone.map(recordCard)}
      <h3 style={{marginTop:24}}>Existing Tickets ({visibleTickets.length})</h3>
      {!visibleTickets.length ? <p className={styles.empty}>No matching tickets.</p> : <div className={styles.serviceCards}>{visibleTickets.map(ticket => <article className={styles.serviceCard} key={ticket.id}>
        <div className={styles.serviceCardTop}><div><span className={styles.serviceType}>Ticket #{ticket.id} · {label(ticket.category)}</span><h3>{ticket.description?.trim().split('\n').find(Boolean)?.slice(0,115) || 'No description'}</h3></div><span className={styles.pill}>{ticket.status || 'Unknown'}</span></div>
        <div className={styles.serviceDetails}><div><b>Created</b><p>{date(ticket.created_at)}</p></div><div><b>Completed</b><p>{date(ticket.completed_at)}</p></div><div><b>Urgency</b><p>{ticket.urgency || 'Not recorded'}</p></div><div><b>Assigned to</b><p>{ticket.assigned_to || 'Not recorded'}</p></div><div><b>Vendor</b><p>{ticket.vendor || 'Not recorded'}</p></div><div><b>Linked entries</b><p>{(linked[String(ticket.id)] || []).length}</p></div></div>
        <div className={styles.actions}><button type="button" onClick={() => setExpanded(s => ({...s,[ticket.id]:!s[ticket.id]}))}>{expanded[ticket.id] ? 'Hide ticket details' : 'View ticket details'}</button><button type="button" onClick={() => begin(null,ticket)}>+ Add cost / outcome</button></div>
        {expanded[ticket.id] && <div style={{marginTop:12,overflowWrap:'anywhere'}}>{[['Description',ticket.description],['Resolution notes',ticket.resolution_notes],['Administrator notes',ticket.admin_notes],['Action log',ticket.action_log],['Priority reason',ticket.priority_reason]].map(([k,v]) => <div key={k}><b>{k}</b><p style={{whiteSpace:'pre-wrap'}}>{v || 'Not recorded'}</p></div>)}</div>}
        {(linked[String(ticket.id)] || []).map(recordCard)}
      </article>)}</div>}
    </>}
  </div>;
}

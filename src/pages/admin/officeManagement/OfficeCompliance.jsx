import { useCallback, useEffect, useMemo, useState } from 'react';
import { listOfficeCompliance, saveOfficeCompliance, deleteOfficeCompliance } from './officeComplianceService';
import { listOfficeDocuments } from './officeDocumentsService';
import styles from './OfficeManagement.module.css';
import {listSettings,getOfficeSettings} from './officeSettingsService';

const fallbackCategories = ['business_license','fire_safety','permit','insurance','inspection','tax','lease','other'];
const statuses = ['pending','in_progress','complete','not_applicable'];
const initial = { title:'', category:'business_license', status:'pending', issue_date:'', expiration_date:'', reminder_days:30, assigned_to:'', issuing_authority:'', reference_number:'', office_document_id:'', notes:'' };
const label = s => String(s || '').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const deadline = item => {
  if (item.status === 'not_applicable') return 'Not applicable';
  if (item.status !== 'complete') return label(item.status);
  if (!item.expiration_date) return 'Current (no expiry recorded)';
  const today = new Date(); today.setHours(0,0,0,0);
  const days = Math.round((new Date(`${item.expiration_date}T00:00:00`) - today) / 86400000);
  if (days < 0) return `Expired ${-days} day(s) ago`;
  if (days <= item.reminder_days) return `Due in ${days} day(s)`;
  return 'Current';
};
const attention = item => item.status !== 'not_applicable' && (item.status !== 'complete' || (item.expiration_date && deadline(item).startsWith('Due')) || deadline(item).startsWith('Expired'));
export default function OfficeCompliance({ officeId }) {
  const [items,setItems] = useState([]);
  const [categories,setCategories] = useState(fallbackCategories);
  const [categoryLabels,setCategoryLabels] = useState({});
  const [requirements,setRequirements] = useState([]);
  const [documents,setDocuments] = useState([]);
  const [form,setForm] = useState(null);
  const [editingId,setEditingId] = useState(null);
  const [filter,setFilter] = useState('all');
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, docs, cats, reqs] = await Promise.all([listOfficeCompliance(officeId),listOfficeDocuments(officeId),listSettings('compliance'),getOfficeSettings('compliance',officeId)]);
      setItems(rows); setDocuments(docs);setRequirements(reqs);setCategories([...new Set([...cats.map(c=>c.item_key),...rows.map(r=>r.category)])]);setCategoryLabels(Object.fromEntries(cats.map(c=>[c.item_key,c.label]))); setError('');
    } catch(e) { setError(e.message || 'Unable to load compliance records.'); }
    finally { setLoading(false); }
  },[officeId]);
  useEffect(() => {
    // Defer loading so the effect does not synchronously trigger state updates.
    const task = Promise.resolve().then(() => refresh());
    void task;
  }, [refresh]);
  const visible = useMemo(() => items.filter(item => filter === 'all' || (filter === 'attention' ? attention(item) : item.category === filter)),[items,filter]);
  const change = (key,value) => setForm(f => ({...f,[key]:value}));
  const startNew = () => { setForm({...initial,category:categories[0]||'other'});setEditingId(null);setError('');setNotice(''); };
  const startTemplate = t => {setForm({...initial,title:t.label,category:t.item_key,reminder_days:t.reminder_days});setEditingId(null);setError('');setNotice('');};
  const applyTemplates = async () => {const missing=requirements.filter(t=>!items.some(i=>i.title.trim().toLowerCase()===t.label.trim().toLowerCase()));if(!missing.length)return; if(!window.confirm(`Create ${missing.length} missing compliance requirement(s) for this office?`))return;setSaving(true);setError('');try{for(const t of missing)await saveOfficeCompliance({...initial,office_id:officeId,title:t.label,category:t.item_key,reminder_days:t.reminder_days,issue_date:null,expiration_date:null,office_document_id:null},null);await refresh();setNotice(`${missing.length} requirement(s) added.`);}catch(e){setError(e.message||'Unable to apply all templates.');await refresh();}finally{setSaving(false);}};
  const startEdit = item => { setForm(Object.fromEntries(Object.keys(initial).map(k=>[k,item[k] ?? ''])));setEditingId(item.id);setError('');setNotice(''); };
  const save = async e => {
    e.preventDefault();setSaving(true);setError('');setNotice('');
    try {
      const values = {...form, office_id:officeId, title:form.title.trim(), reminder_days:Number(form.reminder_days), office_document_id:form.office_document_id || null};
      for(const k of ['issue_date','expiration_date','assigned_to','issuing_authority','reference_number','notes']) values[k] = values[k]?.trim() || null;
      if (!values.title) throw new Error('A compliance item title is required.');
      await saveOfficeCompliance(values,editingId);
      setForm(null);setEditingId(null);await refresh();setNotice('Compliance record saved.');
    } catch(e) { setError(e.message || 'Unable to save compliance record.'); }
    finally { setSaving(false); }
  };
  const remove = async item => {
    if(!window.confirm(`Delete compliance item "${item.title}"? Its linked office document will not be deleted.`)) return;
    try { await deleteOfficeCompliance(item.id);await refresh();setNotice('Compliance record deleted.'); }
    catch(e) { setError(e.message || 'Unable to delete compliance record.'); }
  };
  const field = (name,key,type='text',props={}) => <label key={key}>{name}<input type={type} value={form[key]} onChange={e=>change(key,e.target.value)} {...props}/></label>;
  const select = (name,key,values) => <label key={key}>{name}<select value={form[key]} onChange={e=>change(key,e.target.value)}>{values.map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>;
  return <div>
    <div className={styles.serviceHeading}><div><h2>Office Compliance</h2><p>Track permits, licenses, inspections and expiration deadlines for this location.</p></div><button type="button" className={styles.primary} onClick={startNew}>+ Add Compliance Item</button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.success} role="status">{notice}</p>}
    {requirements.length>0&&<div className={styles.panel}><button type="button" disabled={saving} onClick={applyTemplates}>Add all missing requirements for this office</button><label>Add requirement from template <select value="" onChange={e=>{const t=requirements.find(x=>x.id===e.target.value);if(t)startTemplate(t);}}><option value="">Select a template...</option>{requirements.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label></div>}
    <div className={styles.stats}><div><span>Tracked items</span><strong>{items.length}</strong></div><div><span>Needs attention</span><strong>{items.filter(attention).length}</strong></div><div><span>Completed</span><strong>{items.filter(x=>x.status==='complete').length}</strong></div></div>
    {form && <form className={styles.serviceForm} onSubmit={save}>
      <h3>{editingId ? 'Edit Compliance Item' : 'New Compliance Item'}</h3>
      <div className={styles.formGrid}>
        {field('Requirement / title *','title','text',{required:true,maxLength:200})}
        <label>Category<select value={form.category} onChange={e=>change('category',e.target.value)}>{[...new Set([...categories,form.category])].map(c=><option key={c} value={c}>{categoryLabels[c]||label(c)}</option>)}</select></label>{select('Status','status',statuses)}
        {field('Issuing authority','issuing_authority')}{field('Reference / license number','reference_number')}
        {field('Issued on','issue_date','date')}{field('Expires on','expiration_date','date')}
        {field('Reminder window (days)','reminder_days','number',{min:0,max:365,required:true})}
        {field('Responsible person','assigned_to')}
        <label>Linked office document<select value={form.office_document_id} onChange={e=>change('office_document_id',e.target.value)}><option value="">No document linked</option>{documents.map(d=><option key={d.id} value={d.id}>{d.original_filename}</option>)}</select></label>
        <label className={styles.wide}>Notes<textarea rows={3} value={form.notes} onChange={e=>change('notes',e.target.value)} /></label>
      </div>
      <p className={styles.helper}>Upload certificates in the Documents tab, then link them here. Expiration reminders are displayed in this tracker; automatic emails are not enabled.</p>
      <div className={styles.actions}><button className={styles.primary} type="submit" disabled={saving}>{saving?'Saving...':'Save Compliance Item'}</button><button type="button" disabled={saving} onClick={()=>setForm(null)}>Cancel</button></div>
    </form>}
    <div className={styles.filters}><select aria-label="Filter compliance records" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All requirements</option><option value="attention">Needs attention</option>{categories.map(c=><option key={c} value={c}>{categoryLabels[c]||label(c)}</option>)}</select></div>
    {loading ? <p>Loading compliance records...</p> : !visible.length ? <p className={styles.empty}>No matching compliance records yet.</p> : <div className={styles.serviceCards}>{visible.map(item=><article key={item.id} className={styles.serviceCard}>
      <div className={styles.serviceCardTop}><div><span className={styles.serviceType}>{categoryLabels[item.category]||label(item.category)}</span><h3>{item.title}</h3></div><span className={styles.pill}>{deadline(item)}</span></div>
      <div className={styles.serviceDetails}><div><b>Status</b><p>{label(item.status)}</p></div><div><b>Expiration</b><p>{item.expiration_date||'Not recorded'}</p></div><div><b>Issued</b><p>{item.issue_date||'Not recorded'}</p></div><div><b>Authority</b><p>{item.issuing_authority||'Not recorded'}</p></div><div><b>Reference</b><p>{item.reference_number||'Not recorded'}</p></div><div><b>Responsible</b><p>{item.assigned_to||'Not assigned'}</p></div><div><b>Linked document</b><p>{documents.find(d=>d.id===item.office_document_id)?.original_filename||'None'}</p></div><div><b>Reminder window</b><p>{item.reminder_days} days</p></div></div>
      {item.notes && <p className={styles.serviceNotes}>{item.notes}</p>}
      <div className={styles.actions}><button type="button" onClick={()=>startEdit(item)}>Edit</button><button type="button" className={styles.dangerButton} onClick={()=>remove(item)}>Delete</button></div>
    </article>)}</div>}
  </div>;
}

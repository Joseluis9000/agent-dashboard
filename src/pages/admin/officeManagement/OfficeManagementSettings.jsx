import React, {useCallback,useEffect,useMemo,useState} from 'react';
import OfficeManagementNav from './OfficeManagementNav';
import { Link } from 'react-router-dom';
import {SETTINGS_KINDS,listSettings,listSettingOffices,saveSetting,labelOf} from './officeSettingsService';
import styles from './OfficeManagement.module.css';
const newItem = kind => ({kind,item_key:'',label:'',section:'',default_quantity:'',reminder_days:30,scope:['setup','supplies','compliance'].includes(kind)?'opening':'all',office_ids:[],sort_order:1000,active:true});
const slug = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export default function OfficeManagementSettings({ embedded = false }) {
 const [kind,setKind]=useState('setup'),[items,setItems]=useState([]),[offices,setOffices]=useState([]);
 const [editing,setEditing]=useState(null),[search,setSearch]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{try {setItems(await listSettings(kind,true));setError('');}catch(e){setError(e.message);}},[kind]);
 useEffect(()=>{refresh();setEditing(null);},[refresh]);
 useEffect(()=>{listSettingOffices().then(setOffices).catch(e=>setError(e.message));},[]);
 const shown=useMemo(()=>items.filter(x=>`${x.label} ${x.section} ${x.item_key}`.toLowerCase().includes(search.toLowerCase())),[items,search]);
 const change=(k,v)=>setEditing(f=>({...f,[k]:v}));
 const start=()=>setEditing(newItem(kind));
 const edit=x=>setEditing({...x,default_quantity:x.default_quantity??'',office_ids:x.office_ids||[]});
 const save=async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');
  try {const values={...editing,label:editing.label.trim(),section:editing.section.trim(),item_key:editing.item_key||`custom-${slug(editing.label)}-${Math.random().toString(36).slice(2,8)}`,default_quantity:editing.default_quantity===''?null:Number(editing.default_quantity),reminder_days:Number(editing.reminder_days)||0,sort_order:Number(editing.sort_order)||0,office_ids:editing.scope==='selected'?editing.office_ids:[]};
   if(!values.label)throw new Error('Name is required.');if(values.scope==='selected'&&!values.office_ids.length)throw new Error('Select at least one office.');
   if(values.default_quantity!==null&&(!Number.isInteger(values.default_quantity)||values.default_quantity<0))throw new Error('Quantity must be a nonnegative whole number.');
   await saveSetting(values);setEditing(null);await refresh();setNotice('Setting saved. Existing office progress and records were not changed.');
  }catch(e){setError(e.message);}finally{setBusy(false);}
 };
 const archive=async x=>{if(!window.confirm(`${x.active?'Archive':'Restore'} ${x.label}? Historical records will remain.`))return;
  try{await saveSetting({...x,active:!x.active});await refresh();}catch(e){setError(e.message);}
 };
 return <main className={styles.page}><header className={styles.header}><div>
  <Link to="/admin/offices" style={{display:'inline-flex',alignItems:'center',gap:8,padding:'9px 13px',marginBottom:15,border:'1px solid #d5dce6',borderRadius:9,background:'#fff',color:'#172033',fontSize:13,fontWeight:700,textDecoration:'none'}} aria-label="Back to Office Directory">
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    Back to Office Directory
  </Link>
  <div><small>OPERATIONS / OFFICE MANAGEMENT</small><h1>Settings</h1><p>Manage templates and categories without editing application code.</p></div>
</div></header>{!embedded && <OfficeManagementNav />}
 <div className={styles.panel}><h2>Configuration</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:10}}>{SETTINGS_KINDS.map(([key,name])=><button key={key} type="button" onClick={()=>setKind(key)} style={{textAlign:'left',padding:16,borderRadius:10,border:key===kind?'2px solid #c21f26':'1px solid #ddd',background:key===kind?'#fff6f5':'white',cursor:'pointer'}}><strong>{name}</strong><div style={{fontSize:12,marginTop:5,color:'#666'}}>{key==='setup'?'Tasks and readiness':key==='supplies'?'Supply items and quantities':key==='compliance'?'Requirements and reminders':key==='maintenance'?'Maintenance classifications':key==='services'?'Utility and service types':'Document classifications'}</div></button>)}</div></div>
 <section className={styles.panel}><div className={styles.serviceHeading}><div><h2>{SETTINGS_KINDS.find(x=>x[0]===kind)?.[1]}</h2><p>Archive instead of deleting to preserve historical references.</p></div><button type="button" className={styles.primary} onClick={start}>+ Add Item</button></div>
 {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.success}>{notice}</p>}
 {editing&&<form onSubmit={save} className={styles.serviceForm}><h3>{editing.id?'Edit':'New'} Item</h3><div className={styles.formGrid}>
 <label>Name *<input required maxLength={250} value={editing.label} onChange={e=>change('label',e.target.value)}/></label>
 <label>Category / section<input maxLength={150} value={editing.section} onChange={e=>change('section',e.target.value)} placeholder="e.g. DMV, Cash & Operations"/></label>
 {kind==='supplies'&&<label>Default quantity<input type="number" min="0" step="1" value={editing.default_quantity} onChange={e=>change('default_quantity',e.target.value)}/></label>}
 {kind==='compliance'&&<label>Default reminder (days)<input type="number" min="0" max="365" value={editing.reminder_days} onChange={e=>change('reminder_days',e.target.value)}/></label>}
 <label>Display order<input type="number" value={editing.sort_order} onChange={e=>change('sort_order',e.target.value)}/></label>
 {['setup','supplies','compliance'].includes(kind)&&<label>Apply to<select value={editing.scope} onChange={e=>change('scope',e.target.value)}><option value="opening">Opening / Planning offices</option><option value="all">All offices</option><option value="selected">Specific offices</option><option value="future">Future offices only</option></select></label>}
 {editing.scope==='selected'&&<fieldset className={styles.wide} style={{maxHeight:230,overflowY:'auto',border:'1px solid #ddd',padding:12}}><legend>Choose offices</legend>{offices.map(o=><label key={o.id} style={{display:'flex',gap:8,alignItems:'center',marginBottom:5}}><input type="checkbox" checked={(editing.office_ids||[]).includes(o.id)} onChange={e=>change('office_ids',e.target.checked?[...(editing.office_ids||[]),o.id]:(editing.office_ids||[]).filter(id=>id!==o.id))}/>{o.office_code} — {o.office_name}</label>)}</fieldset>}
 <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={editing.active} onChange={e=>change('active',e.target.checked)}/>Active</label>
 </div><div className={styles.actions}><button type="submit" disabled={busy} className={styles.primary}>{busy?'Saving...':'Save Setting'}</button><button type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button></div></form>}
 <div className={styles.filters}><input aria-label="Search settings" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search items or categories..."/></div>
 <div className={styles.tableScroll}><table><thead><tr><th>Name</th><th>Category</th><th>Distribution</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead><tbody>{shown.map(x=><tr key={x.id}><td><b>{x.label}</b></td><td>{x.section||'—'}</td><td>{labelOf(x.scope)}</td><td>{x.sort_order}</td><td>{x.active?'Active':'Archived'}</td><td className={styles.settingsActionCell}><div className={styles.settingsRowActions}>
  <button type="button" className={styles.settingsEditButton} onClick={()=>edit(x)} aria-label={`Edit ${x.label}`} title={`Edit ${x.label}`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4L16.5 3.5Z"/></svg>
    Edit
  </button>
  <button type="button" className={x.active?styles.settingsArchiveButton:styles.settingsRestoreButton} onClick={()=>archive(x)} aria-label={`${x.active?'Archive':'Restore'} ${x.label}`} title={`${x.active?'Archive':'Restore'} ${x.label}`}>
    {x.active ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/></svg> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>}
    {x.active?'Archive':'Restore'}
  </button>
</div></td></tr>)}</tbody></table>{!shown.length&&<p className={styles.empty}>No settings match.</p>}</div>
 <p className={styles.helper}>Changes to templates do not overwrite previously saved office quantities, statuses, dates, or notes. Future-only distribution applies to offices created after the template is saved.</p></section></main>;
}

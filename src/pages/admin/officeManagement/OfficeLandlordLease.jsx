import React,{useCallback,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import styles from './OfficeManagement.module.css';
import {listLandlords,listLeases,saveLease,listResponsibilities,saveResponsibility,listRentHistory,addRentHistory,listPropertyEvents,savePropertyEvent,listLeaseDocuments,uploadLeaseDocument,openLeaseDocument,archiveLeaseDocument,listLeaseAudit} from './landlordService';
const emptyLease={landlord_id:'',status:'active',lease_start:'',lease_end:'',renewal_notice_deadline:'',termination_notice_deadline:'',renewal_options:'',auto_renewal:'unknown',base_rent:'',cam_nnn:'',deposit:'',rent_due_day:'',grace_days:'',late_fee_details:'',escalation_terms:'',insurance_requirements:'',permitted_use:'',signage_terms:'',assignment_terms:'',other_terms:'',notes:''};
const categories=['HVAC repair/replacement','HVAC preventive maintenance','Roof and leaks','Plumbing','Restrooms and fixtures','Electrical panels and wiring','Outlets and lighting','Structural repairs','Interior paint and flooring','Doors locks and windows','Storefront glass','Exterior signage','Parking lot and landscaping','Pest control','Fire alarms and sprinklers','ADA-related work','Water damage and mold','Trash and utilities','Other'];
const parties=['unknown','landlord','fiesta','shared'];
const docTypes=['original_lease','renewal','amendment','rent_notice','insurance','hvac_agreement','repair_invoice','correspondence','inspection','other'];
const label=s=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const nullify=v=>v===''?null:v;
const dateToDays=s=>s?Math.ceil((new Date(s+'T00:00:00')-new Date(new Date().toDateString()))/86400000):null;
export default function OfficeLandlordLease({officeId}){
 const [landlords,setLandlords]=useState([]),[leases,setLeases]=useState([]),[selected,setSelected]=useState(''),[leaseForm,setLeaseForm]=useState(null),[responsibilities,setResponsibilities]=useState([]),[rent,setRent]=useState([]),[events,setEvents]=useState([]),[docs,setDocs]=useState([]),[audit,setAudit]=useState([]),[rentForm,setRentForm]=useState(null),[eventForm,setEventForm]=useState(null),[docType,setDocType]=useState('original_lease'),[docDescription,setDocDescription]=useState(''),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=useCallback(async()=>{const [a,b,c]=await Promise.all([listLandlords(),listLeases(officeId),listPropertyEvents(officeId)]);setLandlords(a);setLeases(b);setEvents(c);setSelected(s=>b.some(x=>x.id===s)?s:(b.find(x=>x.status==='active')||b[0])?.id||'');},[officeId]);
 useEffect(()=>{reload().catch(e=>setError(e.message));},[reload]);
 const refreshDetail=useCallback(async()=>{if(!selected){setResponsibilities([]);setRent([]);setDocs([]);setAudit([]);return;}const [a,b,c,d]=await Promise.all([listResponsibilities(selected),listRentHistory(selected),listLeaseDocuments(selected),listLeaseAudit(selected)]);setResponsibilities(a);setRent(b);setDocs(c);setAudit(d);},[selected]);
 useEffect(()=>{refreshDetail().catch(e=>setError(e.message));},[refreshDetail]);
 const run=async(fn,message)=>{setBusy(true);setError('');setNotice('');try{await fn();setNotice(message);await reload();await refreshDetail();}catch(e){setError(e.message);}finally{setBusy(false);}};
 const current=leases.find(x=>x.id===selected);
 const change=(setter,key,value)=>setter(prev=>({...prev,[key]:value}));
 const fields=(form,setter,keys,required=[])=>keys.map(([key,type])=><label key={key}>{label(key)}{type==='textarea'?<textarea rows={2} value={form[key]??''} onChange={e=>change(setter,key,e.target.value)}/>:<input required={required.includes(key)} type={type||'text'} value={form[key]??''} onChange={e=>change(setter,key,e.target.value)}/>}</label>);
 const saveLeaseForm=e=>{e.preventDefault();const id=leaseForm.id;const payload={...leaseForm,office_id:officeId};delete payload.id;['base_rent','cam_nnn','deposit','rent_due_day','grace_days'].forEach(k=>payload[k]=nullify(payload[k]));Object.keys(payload).forEach(k=>{if(payload[k]==='')payload[k]=null;});run(async()=>{const saved=await saveLease(payload,id);setLeaseForm(null);setSelected(saved.id);},'Lease saved.');};
 const responsibilityFor=category=>responsibilities.find(x=>x.category===category)||{lease_id:selected,category,responsible_party:'unknown',lease_clause:'',cost_limit:'',approval_required:false,notes:''};
 const [respDrafts,setRespDrafts]=useState({});useEffect(()=>setRespDrafts({}),[selected]);
 const updateResp=(category,key,value)=>setRespDrafts(prev=>({...prev,[category]:{...responsibilityFor(category),...prev[category],[key]:value}}));
 return <div><div className={styles.serviceHeading}><div><h2>Landlord & Lease</h2><p>Contracts, responsibilities, repair requests and permanent history.</p></div><Link to="/admin/offices/landlords">Landlord Directory →</Link></div>
 {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p role="status" className={styles.success}>{notice}</p>}
 <div className={styles.actions}><button type="button" onClick={()=>setLeaseForm({...emptyLease})}>+ New Lease</button>{current&&<button type="button" onClick={()=>setLeaseForm({...emptyLease,...Object.fromEntries(Object.keys(emptyLease).map(k=>[k,current[k]??''])),id:current.id})}>Edit Lease</button>}{current&&<button type="button" onClick={()=>setLeaseForm({...emptyLease,landlord_id:current.landlord_id,predecessor_lease_id:current.id})}>Create Renewal / New Version</button>}</div>
 {leaseForm&&<form className={styles.panel} onSubmit={saveLeaseForm}><h3>{leaseForm.id?'Edit':'Create'} Lease</h3><div className={styles.formGrid}><label>Landlord *<select required value={leaseForm.landlord_id} onChange={e=>change(setLeaseForm,'landlord_id',e.target.value)}><option value="">Select landlord</option>{landlords.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Status<select value={leaseForm.status} onChange={e=>change(setLeaseForm,'status',e.target.value)}>{['draft','active','expired','terminated','superseded'].map(x=><option key={x}>{x}</option>)}</select></label><label>Auto renewal<select value={leaseForm.auto_renewal} onChange={e=>change(setLeaseForm,'auto_renewal',e.target.value)}>{['unknown','yes','no'].map(x=><option key={x}>{x}</option>)}</select></label>{fields(leaseForm,setLeaseForm,[['lease_start','date'],['lease_end','date'],['renewal_notice_deadline','date'],['termination_notice_deadline','date'],['base_rent','number'],['cam_nnn','number'],['deposit','number'],['rent_due_day','number'],['grace_days','number'],['renewal_options','textarea'],['late_fee_details','textarea'],['escalation_terms','textarea'],['insurance_requirements','textarea'],['permitted_use','textarea'],['signage_terms','textarea'],['assignment_terms','textarea'],['other_terms','textarea'],['notes','textarea']])}</div><div className={styles.actions}><button className={styles.primary} disabled={busy}>Save Lease</button><button type="button" onClick={()=>setLeaseForm(null)}>Cancel</button></div></form>}
 <p style={{padding:12,background:'#eff6ff',borderRadius:8,marginTop:14}}>Select an existing lease below to manage <strong>Landlord / Fiesta / Shared</strong> repair responsibilities, contract uploads, and history. If no lease exists, click <strong>+ New Lease</strong> first.</p>
  <label>Choose lease <select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">No lease selected</option>{leases.map(l=><option key={l.id} value={l.id}>{l.status} · {l.om_landlords?.name} · {l.lease_start||'?'} to {l.lease_end||'?'}</option>)}</select></label>
 {current&&<><section className={styles.panel}><h3>Current Lease Details</h3><p><b>Landlord:</b> {current.om_landlords?.name} · {current.om_landlords?.phone||'No phone'} · {current.om_landlords?.email||'No email'}</p><p><b>Emergency contact:</b> {current.om_landlords?.emergency_phone||'Not entered'}</p><p><b>Base rent:</b> {current.base_rent==null?'Not recorded':`$${Number(current.base_rent).toFixed(2)}`} · <b>CAM/NNN:</b> {current.cam_nnn==null?'Not recorded':`$${Number(current.cam_nnn).toFixed(2)}`}</p>{[['Lease expiration',current.lease_end],['Renewal notice deadline',current.renewal_notice_deadline],['Termination notice deadline',current.termination_notice_deadline]].map(([k,v])=><p key={k}><b>{k}:</b> {v||'Not entered'} {v&&`(${dateToDays(v)} days remaining; negative means overdue)`}</p>)}<p><b>Renewal options:</b> {current.renewal_options||'Not recorded'}</p><p><b>Insurance requirements:</b> {current.insurance_requirements||'Not recorded'}</p><p className={styles.helper}>Dates are recorded terms, not legal advice. Verify notice requirements against signed documents.</p></section>
   <section className={styles.panel}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
      <div>
        <h3 style={{marginBottom:6}}>Repair Responsibilities</h3>
        <p style={{marginTop:0}}>Know who handles each property issue. Responsibilities are based on the signed lease, not assumptions.</p>
      </div>
      <span style={{fontSize:13,color:'#64748b'}}>{categories.filter(category => ({...responsibilityFor(category), ...respDrafts[category]}).responsible_party !== 'unknown').length} of {categories.length} assigned</span>
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'12px 0 18px'}}>
      {[
        ['landlord','Landlord','#e0f2fe','#075985'],
        ['fiesta','Fiesta','#fef3c7','#92400e'],
        ['shared','Shared','#ede9fe','#5b21b6'],
        ['unknown','Not Determined','#f1f5f9','#475569']
      ].map(([key,name,bg,fg])=>(
        <span key={key} style={{padding:'7px 11px',borderRadius:20,background:bg,color:fg,fontSize:12,fontWeight:700}}>
          {name}: {categories.filter(category=>({...responsibilityFor(category),...respDrafts[category]}).responsible_party===key).length}
        </span>
      ))}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,320px),1fr))',gap:12}}>
      {categories.map(category=>{
        const saved=responsibilityFor(category);
        const r={...saved,...respDrafts[category]};
        const colors={landlord:['#e0f2fe','#075985'],fiesta:['#fef3c7','#92400e'],shared:['#ede9fe','#5b21b6'],unknown:['#f1f5f9','#475569']};
        const [bg,fg]=colors[r.responsible_party]||colors.unknown;
        const dirty=!!respDrafts[category];
        return <div key={category} style={{border:'1px solid #e2e8f0',borderRadius:12,padding:15,background:'#fff',minWidth:0}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'flex-start',flexWrap:'wrap',marginBottom:12}}>
            <strong style={{fontSize:14,flex:'1 1 160px'}}>{category}</strong>
            <span style={{background:bg,color:fg,borderRadius:20,padding:'5px 9px',fontSize:12,fontWeight:700}}>
              {r.responsible_party==='fiesta'?'Fiesta':r.responsible_party==='unknown'?'Not Determined':label(r.responsible_party)}
            </span>
          </div>
          <label style={{display:'block',fontSize:13,fontWeight:600,marginBottom:9}}>
            Who is responsible?
            <select style={{display:'block',width:'100%',marginTop:5}} value={r.responsible_party} onChange={e=>updateResp(category,'responsible_party',e.target.value)}>
              <option value="unknown">Not Determined</option>
              <option value="landlord">Landlord</option>
              <option value="fiesta">Fiesta Auto Insurance</option>
              <option value="shared">Shared Responsibility</option>
            </select>
          </label>
          {r.responsible_party==='shared'&&<p style={{fontSize:12,padding:9,borderRadius:7,background:'#f5f3ff',color:'#5b21b6'}}>
            Shared: use the notes below to specify what the landlord covers, what Fiesta covers, and any cost split.
          </p>}
          <label style={{display:'block',fontSize:13,marginBottom:9}}>
            Lease clause / section
            <input style={{display:'block',width:'100%',marginTop:5,boxSizing:'border-box'}} placeholder="e.g., Section 8.2" value={r.lease_clause||''} onChange={e=>updateResp(category,'lease_clause',e.target.value)}/>
          </label>
          <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',marginBottom:9}}>
            <label style={{flex:'1 1 130px',fontSize:13}}>
              Cost limit ($)
              <input style={{display:'block',width:'100%',marginTop:5,boxSizing:'border-box'}} type="number" min="0" step="0.01" placeholder="Optional" value={r.cost_limit??''} onChange={e=>updateResp(category,'cost_limit',e.target.value)}/>
            </label>
            <label style={{display:'flex',alignItems:'center',gap:7,fontSize:13,marginTop:16}}>
              <input type="checkbox" checked={!!r.approval_required} onChange={e=>updateResp(category,'approval_required',e.target.checked)}/>
              Approval required
            </label>
          </div>
          <label style={{display:'block',fontSize:13}}>
            Responsibility details / shared terms
            <textarea rows={3} style={{display:'block',width:'100%',marginTop:5,boxSizing:'border-box'}} placeholder="Who pays for repairs, replacement, routine maintenance, deductibles, approvals, etc." value={r.notes||''} onChange={e=>updateResp(category,'notes',e.target.value)}/>
          </label>
          <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:8,marginTop:12}}>
            {dirty&&<span style={{fontSize:12,color:'#92400e'}}>Unsaved changes</span>}
            <button type="button" disabled={busy} className={styles.primary} onClick={()=>run(async()=>{
              await saveResponsibility({...r,lease_id:selected,category,cost_limit:nullify(r.cost_limit),lease_clause:nullify(r.lease_clause),notes:nullify(r.notes)});
              setRespDrafts(previous=>{const next={...previous};delete next[category];return next;});
            },`${category} responsibility saved.`)}>Save</button>
          </div>
        </div>;
      })}
    </div>
    <p className={styles.helper} style={{marginTop:14}}>Not Determined is the default. Check the signed contract before assigning liability. Saved changes are associated with this lease.</p>
  </section>
<section className={styles.panel}><h3>Lease Documents & Contracts</h3><p>Upload signed leases, amendments, renewals, notices, invoices and correspondence. Files remain attached to this lease version.</p><form onSubmit={e=>{e.preventDefault();if(!file)return;run(async()=>{await uploadLeaseDocument(selected,file,docType,docDescription);setFile(null);setDocDescription('');e.target.reset();},'Document uploaded.');}}><div className={styles.formGrid}><label>Document type<select value={docType} onChange={e=>setDocType(e.target.value)}>{docTypes.map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label><label>Description<input value={docDescription} onChange={e=>setDocDescription(e.target.value)}/></label><label>File (15 MB max)<input required type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" onChange={e=>setFile(e.target.files?.[0]||null)}/></label></div><button className={styles.primary} disabled={busy||!file}>Upload Contract / Document</button></form>{docs.map(d=><div key={d.id} className={styles.actions}><span>{label(d.document_type)} — {d.original_filename} ({new Date(d.uploaded_at).toLocaleDateString()})</span><button onClick={async()=>{const tab=window.open('about:blank','_blank');try{const url=await openLeaseDocument(d);if(tab){tab.opener=null;tab.location.replace(url);}else window.location.assign(url);}catch(e){tab?.close();setError(e.message);}}}>View / Download</button><button disabled={busy} onClick={()=>{if(window.confirm('Archive this document? It will remain in audit history.'))run(()=>archiveLeaseDocument(d.id),'Document archived.');}}>Archive</button></div>)}</section>
 <section className={styles.panel}><h3>Rent Change History</h3><button onClick={()=>setRentForm({effective_date:'',base_rent:'',cam_nnn:'',reason:''})}>+ Record Rent Change</button>{rentForm&&<form onSubmit={e=>{e.preventDefault();run(async()=>{await addRentHistory({...rentForm,lease_id:selected,base_rent:nullify(rentForm.base_rent),cam_nnn:nullify(rentForm.cam_nnn)});setRentForm(null);},'Rent change recorded.');}}><div className={styles.formGrid}>{fields(rentForm,setRentForm,[['effective_date','date'],['base_rent','number'],['cam_nnn','number'],['reason','textarea']],['effective_date'])}</div><button disabled={busy}>Save Rent Record</button></form>}{rent.map(r=><p key={r.id}>{r.effective_date}: Base ${r.base_rent??'—'} · CAM ${r.cam_nnn??'—'} · {r.reason}</p>)}</section>
 <section className={styles.panel}><h3>Lease Change Audit</h3>{audit.length===0?<p>No changes recorded yet.</p>:audit.map(a=><details key={a.id}><summary>{new Date(a.changed_at).toLocaleString()} — {a.action}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({before:a.old_data,after:a.new_data},null,2)}</pre></details>)}</section></>}
 <section className={styles.panel}><h3>Property Repairs & Landlord Communications</h3><button onClick={()=>setEventForm({event_date:new Date().toISOString().slice(0,10),event_type:'repair_request',title:'',description:'',status:'open',responsible_party:'unknown',amount:''})}>+ Add History Entry / Repair Request</button>{eventForm&&<form onSubmit={e=>{e.preventDefault();run(async()=>{const {id,...values}=eventForm;await savePropertyEvent({...values,office_id:officeId,lease_id:selected||null,amount:nullify(eventForm.amount)},id);setEventForm(null);},'History entry saved.');}}><div className={styles.formGrid}>{fields(eventForm,setEventForm,[['event_date','date'],['title','text'],['description','textarea'],['amount','number']],['event_date','title'])}<label>Event type<select value={eventForm.event_type} onChange={e=>change(setEventForm,'event_type',e.target.value)}>{['repair_request','landlord_response','vendor_visit','repair_completed','inspection','communication','rent_issue','lease_notice','other'].map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label><label>Status<select value={eventForm.status} onChange={e=>change(setEventForm,'status',e.target.value)}>{['open','waiting','completed','closed'].map(x=><option key={x}>{x}</option>)}</select></label><label>Responsible<select value={eventForm.responsible_party} onChange={e=>change(setEventForm,'responsible_party',e.target.value)}>{parties.map(x=><option key={x}>{x}</option>)}</select></label></div><button disabled={busy}>Save History Entry</button><button type="button" onClick={()=>setEventForm(null)}>Cancel</button></form>}{[...events].sort((a,b)=>String(b.event_date||'').localeCompare(String(a.event_date||''))).map(e=><article className={styles.serviceCard} key={e.id}><b>{e.event_date} — {e.title}</b><p>{label(e.event_type)} · {e.status} · {e.responsible_party}</p><p>{e.description}</p><p>{e.amount==null?'':`Cost: $${e.amount}`}</p><button onClick={()=>setEventForm({id:e.id,event_date:e.event_date,event_type:e.event_type,title:e.title,description:e.description||'',status:e.status,responsible_party:e.responsible_party,amount:e.amount??''})}>Update</button></article>)}</section>
 </div>;
}
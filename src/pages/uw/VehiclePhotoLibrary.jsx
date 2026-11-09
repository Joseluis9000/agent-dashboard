import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthContext';
import VehiclePhotoGuide from './VehiclePhotoGuide';
import usePhotoDraft from './usePhotoDraft';
import usePhotoOffices, {photoOfficeLabel} from './usePhotoOffices';
import {stampPhotoCanvas,canvasJpeg} from './photoImageStamp';
import { makePhotoBackup,downloadPhotoBackup } from './photoBackup';
import { PHOTO_TYPES, CORNER_VIEWS, photoLabel, formatTime, getDeviceLocation, prepareImage, photoVehicle, newPhotoDetails } from './vehiclePhotoHelpers';
import styles from './VehiclePhotoLibrary.module.css';

const BUCKET = 'uw-vehicle-photos';
const PAGE_SIZE = 12;
const EMPTY = newPhotoDetails();
const REVIEWERS = ['admin', 'supervisor', 'underwriter', 'uw_manager'];

export function UploadPanel({ user, onClose, onSaved, mobile = false, initialOffice = '', onPendingChange }) {
  const [details, setDetails] = useState({ ...EMPTY, office: initialOffice });
  const officeDirectory=usePhotoOffices();
  const [legacyDraft,setLegacyDraft]=useState(null);
  const [groupId,setGroupId]=useState(()=>crypto.randomUUID());
  const [step, setStep] = useState(0);
  const [items, setItems] = useState([]);
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraType, setCameraType] = useState('other');
  const [language, setLanguage] = useState('en');
  const cornerFile = useRef(null);
  const pendingCorner = useRef('other');
  const cameraAnchor = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState('');
  const [backup, setBackup] = useState(null);
  const [backupError, setBackupError] = useState('');
  const [backupNotice, setBackupNotice] = useState('');
  const [sharing, setSharing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const video = useRef(null);
  const stream = useRef(null);
  const urls = useRef(new Set());
  const saving = useRef(false);
  const locked = items.some((item) => item.attempted);
  const allSaved = items.length > 0 && items.every((item) => item.saved);
  const draftSnapshot = useMemo(() => ({details,step,language,location,legacyDraft,groupId,
    items:items.map((item)=>({id:item.id,blob:item.blob,filename:item.filename,source:item.source,capturedAt:item.capturedAt,location:item.location,type:item.type,stampVersion:item.stampVersion || 0,addedAt:item.addedAt || null,saved:item.saved,attempted:item.attempted})),
  }),[details,step,language,location,legacyDraft,groupId,items]);
  const draft = usePhotoDraft({ownerId:user.id,scope:mobile ? 'mobile' : 'library',snapshot:draftSnapshot,
    onRestore:(saved)=> {
      setGroupId(saved.groupId || null);
      setDetails(newPhotoDetails(saved.details,initialOffice));
      setLegacyDraft(saved.legacyDraft || (saved.details?.form_version!==2 ? saved.details : null));setLanguage(saved.language==='es'?'es':'en');setLocation(saved.location || null);
      const restored=(saved.items || []).filter((item)=>item.blob && item.id).map((item)=> {
        const preview=URL.createObjectURL(item.blob);urls.current.add(preview);
        return {...item,preview,uploading:false,error:''};
      });
      setItems(restored);setStep(restored.some((item)=>item.attempted)?2:Math.min(2,Math.max(0,saved.step || 0)));
    }});
  useEffect(()=> {
    if(!items.length){setBackup(null);setBackupError('');return undefined;}
    let cancelled=false;setBackup(null);setBackupError('');setBackupNotice('');
    const timer=setTimeout(()=> {
      makePhotoBackup({details,items}).then((file)=>{if(!cancelled)setBackup(file);})
        .catch((failure)=>{if(!cancelled)setBackupError(failure.message || 'Could not prepare device backup.');});
    },350);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[details,items]);
  const resetEntry=async()=> {
    if(busy || preparing || clearing)return;
    if(items.length && !window.confirm('Start a new vehicle and clear this browser draft? Save a device backup first if you want to keep a separate copy. Uploaded photos remain in underwriting.'))return;
    setClearing(true);setError('');
    try{await draft.discard();onClose();}catch(failure){setError(failure.message);setClearing(false);}
  };
  const shareBackup=async()=> {
    if(!backup)return;
    setSharing(true);setBackupNotice('');
    try{await navigator.share({files:[backup],title:'Vehicle photo backup'});setBackupNotice('Save/share finished. Check the destination you selected for the ZIP file.');}
    catch(failure){if(failure.name!=='AbortError')setBackupNotice(failure.message || 'Sharing failed. Use Download backup ZIP instead.');}
    finally{setSharing(false);}
  };
  let canShareBackup=false;
  try{canShareBackup=Boolean(backup && navigator.canShare?.({files:[backup]}));}catch{canShareBackup=false;}
  const backupControls=<section className={styles.backupPanel} aria-label="Local draft and device backup">
    <strong>Device backup</strong><p role="status">{draft.status}</p>
    {draft.storageError && <p role="alert" className={styles.error}>{draft.storageError} <button type="button" onClick={draft.retrySave}>Retry local save</button></p>}
    {items.length>0 && <><div className={styles.actions}>
      <button type="button" disabled={!backup || busy || preparing || sharing} onClick={()=>{downloadPhotoBackup(backup);setBackupNotice('Download requested. Check Downloads or Files on this device for the ZIP.');}}>Download backup ZIP</button>
      {canShareBackup && <button type="button" disabled={busy || preparing || sharing} onClick={shareBackup}>{sharing?'Opening save menu…':'Share / Save to Files'}</button>}
      {!backup && !backupError && <span className={styles.small}>Preparing device backup…</span>}
    </div><p className={styles.small}>ZIP contains JPEG photos only. Existing time/location stamps stay on the images.</p></>}
    {backupError && <p role="alert" className={styles.error}>{backupError}</p>}
    {backupNotice && <p role="status" className={styles.small}>{backupNotice}</p>}
    <p className={styles.small}>Only this agent’s draft is restored after sign-in. Browser data can be cleared; download a ZIP for a separate copy.</p>
  </section>;
  useEffect(() => {
    onPendingChange?.(busy || preparing || items.some((item) => !item.saved));
  }, [busy, preparing, items, onPendingChange]);
  const validateDetails = () => {
    if (legacyDraft) { setError('This draft uses the earlier form. Download its backup, then start a new entry.'); return false; }
    if (officeDirectory.loading || officeDirectory.error) { setError('Load the Office Management office list before continuing.'); return false; }
    if (!officeDirectory.offices.some((office)=>office.office_code===details.office)) { setError('Choose an active office from Office Management.'); return false; }
    if (!details.customer_name.trim()) { setError('Customer name is required.'); return false; }
    if (!details.agency_matrix_customer_id.trim()) { setError('Agency Matrix Customer ID is required.'); return false; }
    if (!/^(19|20)\d{2}$/.test(details.vehicle_year)) { setError('Enter a four-digit vehicle year.'); return false; }
    if (!details.vehicle_make.trim() || !details.vehicle_model.trim()) { setError('Vehicle make and model are required.'); return false; }
    return true;
  };
  const moveStep = (next) => {
    if (busy || preparing || locating || locked) return;
    if (next > 0 && !validateDetails()) return;
    if (next === 2 && !items.length) { setError('Add at least one photo first.'); return; }
    setCameraOpen(false); setError(''); setStep(next);
    window.scrollTo?.({ top:0, behavior:'smooth' });
  };
  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
  }, []);
  useEffect(() => () => { stopCamera(); urls.current.forEach((url) => URL.revokeObjectURL(url)); }, [stopCamera]);
  useEffect(() => {
    if (!cameraOpen) return undefined;
    let cancelled = false;
    setCameraReady(false);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS and a supported browser. You can choose a photo file instead.');
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2400 }, height: { ideal: 1800 } }, audio: false });
        if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
        stream.current = media;
        if (video.current) { video.current.srcObject = media; await video.current.play(); setCameraReady(true); }
      } catch (e) { if (!cancelled) { setError(`Camera: ${e.message}`); setCameraOpen(false); stopCamera(); } }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [cameraOpen, stopCamera]);
  useEffect(() => {
    const handler = (event) => {
      if (items.some((item) => !item.saved)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [items]);
  const addBlob = (blob, filename, source, capturedAt = null, type = 'other', photoLocation = null, addedAt = null) => {
    const preview = URL.createObjectURL(blob); urls.current.add(preview);
    setItems((previous) => {
      const replaced = CORNER_VIEWS.some((view) => view.key === type) ? previous.filter((item) => item.type === type && !item.saved) : [];
      replaced.forEach((item) => { URL.revokeObjectURL(item.preview); urls.current.delete(item.preview); });
      return [...previous.filter((item) => !replaced.includes(item)), { id: crypto.randomUUID(), blob, preview, filename: filename.slice(0,255), source, capturedAt, location:photoLocation, type, stampVersion:1, addedAt, saved: false, attempted: false, error: '' }];
    });
  };
  const chooseFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    const type = event.target === cornerFile.current ? pendingCorner.current : 'other';
    event.target.value = '';
    if (files.length + items.length > 12) { setError('Add up to 12 photos per batch.'); return; }
    setPreparing(true); setError('');
    const failures = [];
    let freshLocation;
    try {freshLocation=await getDeviceLocation();setLocation(freshLocation);}
    catch(failure){setError(`Location is required for the photo stamp. ${failure.message}`);setPreparing(false);return;}
    for (const file of files) {
      try { const addedAt=new Date().toISOString();const blob=await prepareImage(file,{source:'file_upload',addedAt,location:freshLocation});addBlob(blob,file.name,'file_upload',null,type,freshLocation,addedAt); }
      catch (e) { failures.push(`${file.name}: ${e.message}`); }
    }
    setError(failures.join(' ')); setPreparing(false);
  };
  const capture = async () => {
    if (!video.current?.videoWidth || items.length >= 12) return;
    setPreparing(true); setError('');
    try {
      const freshLocation=await getDeviceLocation();setLocation(freshLocation);
      if (!video.current?.videoWidth) throw new Error('Camera closed before capture. Try again.');
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1,2400 / Math.max(video.current.videoWidth,video.current.videoHeight));
      canvas.width = Math.round(video.current.videoWidth * ratio); canvas.height = Math.round(video.current.videoHeight * ratio);
      const capturedAt = new Date().toISOString();
      canvas.getContext('2d').drawImage(video.current,0,0,canvas.width,canvas.height);
      const blob = await canvasJpeg(stampPhotoCanvas(canvas,{source:'live_camera',capturedAt,location:freshLocation}));
      if (!blob) throw new Error('Camera capture failed. Try again.');
      addBlob(blob,`vehicle-${Date.now()}.jpg`,'live_camera',capturedAt,cameraType,freshLocation,capturedAt);
      if (CORNER_VIEWS.some((view) => view.key === cameraType)) setCameraOpen(false);
    } catch (e) { setError(e.message); }
    setPreparing(false);
  };
  const openCorner = (type) => {
    setCameraType(type); setError(''); setCameraOpen(true);
    setTimeout(() => cameraAnchor.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }),100);
  };
  const locate = async () => {
    setLocating(true); setError('');
    try { setLocation(await getDeviceLocation()); } catch (e) { setError(e.message); }
    setLocating(false);
  };
  const save = async (event) => {
    event.preventDefault();
    if (saving.current || preparing || !draft.ready || !items.length || allSaved) return;
    if(!validateDetails())return;
    if(items.some((item)=>item.stampVersion!==1)){setError('This draft contains earlier unstamped images. Download the backup and start a new photo entry.');return;}
    saving.current = true; setBusy(true); setCameraOpen(false); setError('');
    let successes = 0;
    for (const item of items.filter((entry) => !entry.saved)) {
      setItems((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, attempted: true, error: '', uploading: true } : entry));
      try {
        const path = `${user.id}/${item.id}.jpg`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path,item.blob,{ contentType: 'image/jpeg', upsert: false });
        // A previous upload may have succeeded even if its response was interrupted.
        if (uploadError && String(uploadError.statusCode || uploadError.status) !== '409' && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
        const { data:savedPhoto,error: saveError } = await supabase.rpc('vpl_save_photo', { p_id: item.id, p_details: {
          ...details, group_id:groupId, group_anchor_photo_id:items[0]?.id, vehicle:photoVehicle(details), office: details.office.trim().toUpperCase(), photo_type: item.type, stamp_version:item.stampVersion,
          original_filename: item.filename, source: item.source, captured_at: item.capturedAt,
          ...(item.location || {}),
        } });
        if (saveError) throw saveError;
        const registeredPhoto=Array.isArray(savedPhoto)?savedPhoto[0]:savedPhoto;
        if(registeredPhoto?.group_id)setGroupId(registeredPhoto.group_id);
        setItems((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, attempted: true, saved: true, uploading: false, error: '' } : entry)); successes += 1;
      } catch (e) {
        setItems((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, attempted: true, uploading: false, error: e.message || 'Upload failed. Retry while this page is open.' } : entry));
      }
    }
    if (successes) onSaved();
    saving.current = false; setBusy(false);
  };
  const close = () => {
    if (busy || preparing || locating) return;
    if (items.some((item) => !item.saved) && !window.confirm('Close photo entry? Saved local drafts can be restored when you reopen it. If local saving failed, download a backup before leaving.')) return;
    onClose();
  };
  if (!draft.ready) return <section className={styles.panel}><p role="status">Restoring this agent’s local draft…</p></section>;
  if (mobile && allSaved) return <section className={`${styles.page} ${styles.panel} ${styles.mobileUpload} ${styles.mobileSuccess}`} aria-live="polite">
    <span className={styles.successMark} aria-hidden="true">✓</span><h2>Photos saved</h2>
    <p>{items.length} photo{items.length === 1 ? '' : 's'} for <strong>{details.customer_name}</strong> {items.length === 1 ? 'is' : 'are'} now in the underwriting library.</p>
    <div className={styles.reviewFacts}><span>{details.office}</span><span>{photoVehicle(details) || 'Vehicle photos'}</span><span>{details.agency_matrix_customer_id ? `Agency Matrix ID: ${details.agency_matrix_customer_id}` : 'Agency Matrix ID not provided'}</span>{details.policy_number && <span>Policy: {details.policy_number}</span>}</div>
    {backupControls}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p><a href="/agent/vehicle-photos">View my uploaded photos →</a></p>
    <button type="button" className={styles.primary} disabled={clearing} onClick={resetEntry}>{clearing ? 'Starting…' : 'Start another vehicle'}</button>
  </section>;
  return <section className={`${styles.panel} ${mobile ? `${styles.page} ${styles.mobileUpload}` : ''}`} aria-labelledby="upload-title">
    {mobile ? <>
      <div className={styles.mobileSteps} aria-label="Photo entry progress">{['Details','Photos','Review'].map((label,index) => <button type="button" key={label} aria-current={step === index ? 'step' : undefined} onClick={() => moveStep(index)} disabled={busy || preparing || locating || locked}><span>{index+1}</span>{label}</button>)}</div>
      <h2 id="upload-title">{['Which vehicle?','Take vehicle photos','Review and save'][step]}</h2>
      <p className={styles.mobileHint}>{['Your agent identity is attached automatically. Enter the customer and vehicle details.','Use the four corner examples below. You can add VIN, odometer, or damage photos too.','Check the details and pictures before sending them to underwriting.'][step]}</p>
    </> : <><div className={styles.heading}><div><span className={styles.eyebrow}>ADD TO LIBRARY</span><h2 id="upload-title">Vehicle photos</h2></div><button type="button" onClick={close} disabled={busy || preparing || locating}>Close</button></div><p>Details below attach to every photo in this batch. Saved photos are private and searchable.</p></>}
    {error && (!mobile || !cameraOpen) && <p role="alert" className={styles.error}>{error}</p>}
    {officeDirectory.error && <p role="alert" className={styles.error}>Office list: {officeDirectory.error}. Run the flow-update SQL and retry. <button type="button" onClick={officeDirectory.refresh}>Retry offices</button></p>}
    {legacyDraft && <section className={styles.error} role="alert">This recovered draft uses the earlier fields. Download its backup before starting a new entry; the old policy number will not become an Agency Matrix ID. <button type="button" disabled={busy || preparing || clearing} onClick={resetEntry}>Start a new entry</button></section>}
    {backupControls}
    <form onSubmit={(event) => { if (mobile && step < 2) { event.preventDefault(); moveStep(step+1); } else save(event); }}>
      <fieldset hidden={mobile && step !== 0} disabled={busy || locked || preparing || locating} className={styles.fields}>
        <label>Office *<select required value={details.office} onChange={(event)=>setDetails({...details,office:event.target.value})} disabled={officeDirectory.loading || Boolean(officeDirectory.error)}>
          <option value="">{officeDirectory.loading?'Loading offices…':'Choose office'}</option>
          {details.office && !officeDirectory.offices.some((office)=>office.office_code===details.office) && <option value={details.office} disabled>{details.office} — unavailable</option>}
          {officeDirectory.offices.map((office)=><option key={office.office_code} value={office.office_code}>{photoOfficeLabel(office)}</option>)}
        </select><button type="button" disabled={officeDirectory.loading} onClick={officeDirectory.refresh}>Refresh offices</button></label>
        <label>Customer name *<input required maxLength={150} autoComplete="off" value={details.customer_name} onChange={(event)=>setDetails({...details,customer_name:event.target.value})}/></label>
        <label>Agency Matrix Customer ID *<input required maxLength={100} autoComplete="off" value={details.agency_matrix_customer_id} onChange={(event)=>setDetails({...details,agency_matrix_customer_id:event.target.value})}/></label>
        <label>Policy Number<input maxLength={100} autoComplete="off" value={details.policy_number} onChange={(event)=>setDetails({...details,policy_number:event.target.value})}/></label>
        <div className={styles.vehicleFields}>
          <label>Year *<input required inputMode="numeric" pattern="(19|20)[0-9]{2}" maxLength={4} placeholder="2026" value={details.vehicle_year} onChange={(event)=>setDetails({...details,vehicle_year:event.target.value.replace(/\D/g,'').slice(0,4)})}/></label>
          <label>Make *<input required maxLength={80} placeholder="Toyota" value={details.vehicle_make} onChange={(event)=>setDetails({...details,vehicle_make:event.target.value})}/></label>
          <label>Model *<input required maxLength={80} placeholder="Camry" value={details.vehicle_model} onChange={(event)=>setDetails({...details,vehicle_model:event.target.value})}/></label>
        </div>
      </fieldset>
      {mobile && step === 2 && <section className={styles.mobileReview} aria-label="Vehicle details"><div><span>Customer</span><strong>{details.customer_name}</strong></div><div><span>Office</span><strong>{details.office}</strong></div><div><span>Agency Matrix Customer ID</span><strong>{details.agency_matrix_customer_id || 'Not provided'}</strong></div><div><span>Policy Number</span><strong>{details.policy_number || 'Not provided'}</strong></div><div><span>Vehicle</span><strong>{photoVehicle(details) || 'Not provided'}</strong></div></section>}
      {!locked && (!mobile || step === 1) && <>
        {mobile && <div className={styles.mobileLocation}><button type="button" disabled={locating || preparing} onClick={locate}>{locating ? 'Getting location…' : location ? 'Refresh device location' : 'Check device location'}</button><p>{location ? `Location ready · ±${Math.round(location.accuracy_m)} m` : 'Location permission is required. Each photo gets a fresh GPS reading and a visible time/location stamp.'}</p></div>}
        <VehiclePhotoGuide language={language} onLanguage={setLanguage} items={items} disabled={preparing || locating || busy || items.length >= 12}
          onCapture={openCorner} onChoose={(type) => { pendingCorner.current = type; cornerFile.current?.click(); }} />
        <input ref={cornerFile} type="file" accept="image/*" hidden aria-label="Choose a corner photo" onChange={chooseFiles} />
        {!mobile && <><div className={styles.actions}>
          <button type="button" disabled={locating || preparing} onClick={locate}>{locating ? 'Getting location…' : location ? 'Refresh device location' : 'Check device location'}</button>
          {location && <span className={styles.small}>Recorded {formatTime(location.location_at)} · ±{Math.round(location.accuracy_m)} m</span>}
        </div>
        <p className={styles.small}>Every new photo includes a visible time/location footer. For chosen files, the footer identifies when and where the file was added to this app.</p></>}
        <div className={styles.actions}>
          <button type="button" disabled={preparing || locating} onClick={() => { setError(''); setCameraType('other'); setCameraOpen((open) => !open); }}>{cameraOpen ? 'Close camera' : 'Open camera'}</button>
          <label className={styles.fileButton}>Choose photos<input aria-label="Choose photos" type="file" accept="image/*" multiple disabled={preparing || locating} onChange={chooseFiles} /></label>
          <span className={styles.small}>{preparing ? 'Preparing photo…' : 'Up to 12 photos · JPEG/PNG recommended'}</span>
        </div>
        {cameraOpen && <div ref={cameraAnchor} className={styles.camera}>
          {mobile && <button type="button" disabled={preparing} onClick={() => setCameraOpen(false)}>Cancel camera</button>}
          {mobile && error && <p role="alert" className={styles.error}>{error}</p>}
          {preparing && <p role="status">Recording location and stamping the photo. Keep the vehicle in frame…</p>}
          <label>{language === 'es' ? 'Vista de la foto' : 'Photo view'}<select value={cameraType} disabled={preparing} onChange={(event) => setCameraType(event.target.value)}>{PHOTO_TYPES.map(([value,label]) => <option key={value} value={value}>{language === 'es' ? CORNER_VIEWS.find((view) => view.key === value)?.es || label : label}</option>)}</select></label>
          <p className={styles.cameraPrompt}>{CORNER_VIEWS.find((view) => view.key === cameraType)?.[language === 'es' ? 'instructionEs' : 'instructionEn'] || (language === 'es' ? 'Encuadra el detalle y toma una foto clara.' : 'Frame the detail and take a clear photo.')}</p><video ref={video} playsInline muted autoPlay /><button type="button" className={styles.primary} disabled={!cameraReady || preparing || items.length >= 12} onClick={capture}>{language === 'es' ? 'Tomar foto' : 'Take photo'}</button></div>}
      </>}
      <div hidden={mobile && step === 0} className={styles.uploadGrid}>{items.map((item) => <div className={styles.uploadCard} key={item.id}>
        <img src={item.preview} alt={`Upload preview: ${item.filename}`} />
        <label>Photo type<select aria-label={`Photo type for ${item.filename}`} value={item.type} disabled={locked || busy} onChange={(e) => setItems((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, type: e.target.value } : entry))}>{PHOTO_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <span className={styles.small}>{item.source === 'live_camera' ? 'Camera capture' : 'Chosen file'}</span>
        {item.saved ? <strong className={styles.success}>Saved</strong> : item.uploading ? <span role="status">Saving…</span> : !locked && <button type="button" onClick={() => { URL.revokeObjectURL(item.preview); urls.current.delete(item.preview); setItems((previous) => previous.filter((entry) => entry.id !== item.id)); }}>Remove</button>}
        {item.error && <p role="alert" className={styles.error}>{item.error}</p>}
      </div>)}</div>
      {mobile ? <div className={styles.mobileBottom}>
        <span role="status">{step === 0 ? 'Step 1 of 3' : step === 1 ? `${items.length} photo${items.length === 1 ? '' : 's'} added` : `${items.filter((item) => item.saved).length} of ${items.length} saved`}</span>
        <div>{step > 0 && !locked && <button type="button" disabled={busy || preparing || locating} onClick={() => moveStep(step-1)}>Back</button>}
        {step < 2 ? <button type="button" className={styles.primary} disabled={busy || preparing || locating || (step === 1 && !items.length)} onClick={() => moveStep(step+1)}>{step === 0 ? 'Continue to photos' : 'Review photos'}</button> : <button type="submit" className={styles.primary} disabled={busy || preparing || locating || !items.length}>{busy ? 'Saving photos…' : locked ? 'Retry unsaved photos' : 'Save photos'}</button>}</div>
      </div> : <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy || preparing || locating || !items.length || allSaved}>{busy ? 'Saving photos…' : allSaved ? 'All photos saved' : locked ? 'Retry unsaved photos' : 'Save photos'}</button>
        <span role="status">{items.filter((item) => item.saved).length} of {items.length} saved</span>
      </div>}
      <p className={styles.small}>Keep this page open until every photo says Saved in underwriting. Local drafts support recovery after reopening this page, but uploading requires internet. Images are converted to JPEG, up to 2400 pixels on the longest side.</p>
    </form>
    {!mobile && items.length>0 && <button type="button" disabled={busy || preparing || clearing} onClick={resetEntry}>{allSaved ? 'Start another vehicle' : 'Discard draft and start over'}</button>}
  </section>;
}

export default function VehiclePhotoLibrary({personalOnly=false}) {
  const { user, profile } = useAuth();
  const reviewer = !personalOnly && REVIEWERS.includes(profile?.role);
  const [search, setSearch] = useState('');
  const [office, setOffice] = useState('');
  const [type, setType] = useState('');
  const [query, setQuery] = useState({ search: '', office: '', type: '', page: 0 });
  const [groups,setGroups]=useState([]);
  const [expandedGroups,setExpandedGroups]=useState(new Set());
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideLanguage, setGuideLanguage] = useState('en');
  const [selected, setSelected] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [batchDownloading,setBatchDownloading]=useState(false);
  const [activeDownloadGroup,setActiveDownloadGroup]=useState(null);
  const [batchNotice,setBatchNotice]=useState('');
  const exportEpoch=useRef(0);
  useEffect(()=>{exportEpoch.current+=1;return()=>{exportEpoch.current+=1;};},[user?.id]);
  const closeDetail = useRef(null);
  const photoTrigger = useRef(null);
  useEffect(() => {
    if (!selected) return undefined;
    closeDetail.current?.focus();
    const handle = (event) => {
      if (event.key === 'Escape') setSelected(null);
      if (event.key === 'Tab') {
        const controls = document.querySelectorAll('[data-photo-dialog] button:not(:disabled),[data-photo-dialog] a');
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown',handle);
    return () => { document.removeEventListener('keydown',handle); photoTrigger.current?.focus(); };
  }, [selected]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setGroups([]); setExpandedGroups(new Set());
    (async () => {
      try {
        const {data,error:listError}=await supabase.rpc('vpl_photo_groups',{
          p_search:query.search,p_office:query.office,p_type:query.type,p_offset:query.page*PAGE_SIZE,p_personal:personalOnly,
        });
        if(listError)throw listError;
        const records=(data || []).slice(0,PAGE_SIZE);
        const photos=records.flatMap(group=>group.photos || []);
        const signedByPath=new Map();
        // Keep signing requests bounded even when historical sets contain many photos.
        for(let start=0;start<photos.length;start+=100){
          const batch=photos.slice(start,start+100);
          const result=await supabase.storage.from(BUCKET).createSignedUrls(batch.map(photo=>photo.storage_path),3600);
          if(result.error)throw result.error;
          batch.forEach((photo,index)=>signedByPath.set(photo.storage_path,result.data?.[index]?.signedUrl));
        }
        if(!cancelled){setGroups(records.map(group=>({...group,photos:(group.photos || []).map(photo=>({...photo,url:signedByPath.get(photo.storage_path)}))})));setMore((data || []).length>PAGE_SIZE);}
      } catch (e) { if (!cancelled) setError(e.message || 'Could not load photos.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [query, personalOnly, user?.id]);
  const refresh = () => setQuery((previous) => ({ ...previous }));
  const openPhoto = async (row,event) => {
    photoTrigger.current = event.currentTarget; setNotice(''); setError('');
    const { data,error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path,300);
    if (urlError) { setError(urlError.message); return; }
    setSelected({ ...row,url: data.signedUrl });
  };
  const download = async () => {
    setDownloading(true); setNotice('');
    try {
      const { data,error: downloadError } = await supabase.storage.from(BUCKET).download(selected.storage_path);
      if (downloadError) throw downloadError;
      const url = URL.createObjectURL(data); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${selected.office}-${selected.photo_type}-${selected.id}.jpg`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url),10000);
    } catch (e) { setNotice(e.message || 'Download failed.'); }
    setDownloading(false);
  };
  const downloadGroup=async(group)=>{
    if(batchDownloading || !group.photos.length || !user)return;
    const epoch=exportEpoch.current;const downloadRows=[...group.photos];
    setBatchDownloading(true);setActiveDownloadGroup(group.group_id);setBatchNotice(`Preparing all ${downloadRows.length} photos for ${group.customer_name}…`);
    try{
      const files=[];
      for(const row of downloadRows){
        const {data,error:downloadError}=await supabase.storage.from(BUCKET).download(row.storage_path);
        if(downloadError)throw downloadError;
        if(exportEpoch.current!==epoch)return;
        files.push({id:row.id,type:row.photo_type,blob:data});
      }
      const sameOffice=downloadRows.every(row=>row.office===downloadRows[0].office);
      const backup=await makePhotoBackup({details:{office:sameOffice?downloadRows[0].office:''},items:files});
      if(exportEpoch.current!==epoch)return;
      downloadPhotoBackup(backup);setBatchNotice(`Download requested: ${files.length} JPEG photos. Check Downloads or Files.`);
    }catch(failure){if(exportEpoch.current===epoch)setBatchNotice(`Download failed: ${failure.message || 'Try again.'}`);}
    finally{if(exportEpoch.current===epoch){setBatchDownloading(false);setActiveDownloadGroup(null);}}
  };
  if (!user) return <main className={styles.page}><p>Sign in to access vehicle photos.</p></main>;
  return <main className={styles.page}>
    <header className={styles.heading}><div><span className={styles.eyebrow}>{personalOnly?'AGENT / VEHICLE PHOTOS':'UNDERWRITING / VEHICLE PHOTOS'}</span><h1>{personalOnly?'My Vehicle Photos':'Vehicle photo library'}</h1><p>{personalOnly?'View your submitted photo sets and download a complete group or individual photos.':reviewer ? 'Search and review photos across offices.' : 'Upload and search your vehicle photos.'}</p></div>{!personalOnly && <button className={styles.primary} type="button" onClick={() => setUploadOpen(true)}>+ Add photos</button>}</header>
    <div className={styles.actions}>{!personalOnly && <a href="/vehicle-photos" target="_blank" rel="noopener noreferrer">Open agent phone entry ↗</a>}<button type="button" aria-expanded={guideOpen} onClick={() => setGuideOpen((open) => !open)}>{guideOpen ? 'Hide Photo Guidelines' : 'View Photo Guidelines'}</button></div>
    {guideOpen && <div className={styles.panel}><VehiclePhotoGuide language={guideLanguage} onLanguage={setGuideLanguage} /></div>}
    {!personalOnly && uploadOpen && <UploadPanel key={user.id} user={user} onClose={() => setUploadOpen(false)} onSaved={refresh} />}
    <section className={styles.panel} aria-label="Search vehicle photos">
      <form className={styles.search} onSubmit={(event) => { event.preventDefault(); setQuery({ search: search.trim(),office: office.trim().toUpperCase(),type,page:0 }); }}>
        <label className={styles.searchInput}>Search<input value={search} maxLength={200} onChange={(e) => setSearch(e.target.value)} placeholder="Customer, Matrix ID, policy, vehicle, or agent email" /></label>
        <label>Office<input value={office} maxLength={5} placeholder="All offices" onChange={(e) => setOffice(e.target.value.toUpperCase())} /></label>
        <label>Photo type<select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{PHOTO_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="submit" className={styles.primary}>Search</button>
        <button type="button" onClick={() => { setSearch(''); setOffice(''); setType(''); setQuery({ search:'',office:'',type:'',page:0 }); }}>Clear</button>
        <button type="button" disabled={loading} onClick={refresh}>Refresh</button>
      </form>
    </section>
    <section className={styles.groupSummary} aria-label="Photo groups"><strong>{loading?'Loading photo groups…':`${groups.length} photo groups on this page`}</strong><p>Each group stays together. Open a picture to download it individually, or use Download group for a JPEG-only ZIP of the entire set.</p></section>
    {batchNotice && <p role="status" className={styles.downloadStatus}>{batchNotice}</p>}
    {error && <div className={styles.error} role="alert">{error}<br />If this is a new installation, confirm the Vehicle Photo Library SQL migration has been applied.</div>}
    {loading?<p role="status" className={styles.empty}>Loading photo groups…</p>:!error&&!groups.length?<div className={styles.empty}><h2>{query.search||query.office||query.type?'No matching photo groups':'No photos submitted yet'}</h2><p>{query.search||query.office||query.type?'Try another search or clear the filters.':'Your submitted photo sets will appear here.'}</p></div>:<div className={styles.groupList}>
      {groups.map(group=>{
        const expanded=expandedGroups.has(group.group_id);
        const visible=expanded?group.photos:group.photos.slice(0,4);
        return <section className={styles.photoGroup} key={group.group_id} aria-label={`Photo group for ${group.customer_name}`}>
          <header className={styles.groupHeader}><div><div className={styles.actions}><span className={styles.badge}>{group.office}</span><span className={styles.small}>{group.photos.length} photos · {formatTime(group.uploaded_at)}</span></div><h2>{group.customer_name}</h2><p>{group.vehicle || 'Vehicle not specified'}</p><p className={styles.small}>{group.agency_matrix_customer_id?`Agency Matrix ID: ${group.agency_matrix_customer_id}`:'Earlier photo set'}{group.policy_number?` · Policy: ${group.policy_number}`:''}</p></div>
          <button type="button" className={styles.primary} disabled={batchDownloading} onClick={()=>downloadGroup(group)}>{activeDownloadGroup===group.group_id?'Preparing group…':`Download group (${group.photos.length})`}</button></header>
          <div className={styles.gallery}>{visible.map(row=><button type="button" className={styles.photoCard} key={row.id} onClick={event=>openPhoto(row,event)}>
            {row.url?<img src={row.url} loading="lazy" alt={`${photoLabel(row.photo_type)} for ${row.customer_name}`} onError={event=>{event.currentTarget.alt='Preview unavailable. Open to retry.';}}/>:<div className={styles.missing}>Open photo</div>}
            <div className={styles.cardBody}><strong>{photoLabel(row.photo_type)}</strong><span className={styles.small}>View / download photo →</span></div>
          </button>)}</div>
          {group.photos.length>4&&<button type="button" className={styles.expandGroup} aria-expanded={expanded} onClick={()=>setExpandedGroups(previous=>{const next=new Set(previous);if(next.has(group.group_id))next.delete(group.group_id);else next.add(group.group_id);return next;})}>{expanded?'Show fewer photos':`Show all ${group.photos.length} photos`}</button>}
        </section>;
      })}
    </div>}
    <nav className={styles.pagination} aria-label="Photo result pages"><button type="button" disabled={loading || query.page===0} onClick={() => setQuery((previous) => ({ ...previous,page:previous.page-1 }))}>Previous</button><span>Page {query.page+1}</span><button type="button" disabled={loading || !more || Boolean(error)} onClick={() => setQuery((previous) => ({ ...previous,page:previous.page+1 }))}>Next</button></nav>
    {selected && <div className={styles.backdrop} onClick={(event) => { if (event.target===event.currentTarget) setSelected(null); }}><section data-photo-dialog className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="photo-title">
      <div className={styles.heading}><h2 id="photo-title">{photoLabel(selected.photo_type)} · {selected.customer_name}</h2><button ref={closeDetail} type="button" onClick={() => setSelected(null)}>Close</button></div>
      <img className={styles.fullPhoto} src={selected.url} alt={`${photoLabel(selected.photo_type)} for ${selected.customer_name}`} />
      <dl className={styles.metadata}>
        {[
          ['Office',selected.office],['Customer',selected.customer_name],['Agency Matrix Customer ID',selected.agency_matrix_customer_id],['Vehicle',selected.vehicle],...(selected.policy_number ? [['Policy Number',selected.policy_number]] : []),...(selected.vin ? [['Legacy VIN',selected.vin]] : []),
          ['Photo type',photoLabel(selected.photo_type)],['Uploaded by',selected.uploaded_by_email],['Uploaded at (server)',formatTime(selected.uploaded_at)],
          ['Source',selected.source==='live_camera' ? 'In-page camera' : 'Chosen file'],['Captured at (device-reported)',selected.captured_at ? formatTime(selected.captured_at) : 'Unknown for chosen files'],
          ['Original filename',selected.original_filename],['Visible image stamp',selected.stamp_version===1?'Time and device location footer':'Earlier photo'],...(selected.reported_address ? [['Legacy address',selected.reported_address]] : []),...(selected.notes ? [['Legacy notes',selected.notes]] : []),
          ['Device location',selected.latitude!=null ? `${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)} · accuracy ±${Math.round(selected.accuracy_m)} m` : 'Not recorded'],
          ['Location recorded at',selected.location_at ? formatTime(selected.location_at) : 'Not recorded'],
        ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}
      </dl>
      <p className={styles.small}>Times display in your device’s timezone. File-upload location describes the device when the file was added, not necessarily where the photo was taken.</p>
      <div className={styles.actions}><button type="button" className={styles.primary} disabled={downloading} onClick={download}>{downloading ? 'Downloading…' : 'Download photo'}</button>{selected.latitude!=null && <a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`}>View device location on map</a>}</div>
      {notice && <p role="status" className={styles.error}>{notice}</p>}
    </section></div>}
  </main>;
}

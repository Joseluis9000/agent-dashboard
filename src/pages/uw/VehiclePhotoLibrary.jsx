import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthContext';
import VehiclePhotoGuide from './VehiclePhotoGuide';
import { PHOTO_TYPES, CORNER_VIEWS, photoLabel, formatTime, getDeviceLocation, prepareImage } from './vehiclePhotoHelpers';
import styles from './VehiclePhotoLibrary.module.css';

const BUCKET = 'uw-vehicle-photos';
const PAGE_SIZE = 24;
const EMPTY = { office: '', customer_name: '', policy_number: '', vehicle: '', vin: '', notes: '', reported_address: '' };
const REVIEWERS = ['admin', 'supervisor', 'underwriter', 'uw_manager'];

function UploadPanel({ user, onClose, onSaved }) {
  const [details, setDetails] = useState(EMPTY);
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
  const video = useRef(null);
  const stream = useRef(null);
  const urls = useRef(new Set());
  const saving = useRef(false);
  const locked = items.some((item) => item.attempted);
  const allSaved = items.length > 0 && items.every((item) => item.saved);
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
  const addBlob = (blob, filename, source, capturedAt = null, type = 'other') => {
    const preview = URL.createObjectURL(blob); urls.current.add(preview);
    setItems((previous) => {
      const replaced = CORNER_VIEWS.some((view) => view.key === type) ? previous.filter((item) => item.type === type && !item.saved) : [];
      replaced.forEach((item) => { URL.revokeObjectURL(item.preview); urls.current.delete(item.preview); });
      return [...previous.filter((item) => !replaced.includes(item)), { id: crypto.randomUUID(), blob, preview, filename: filename.slice(0,255), source, capturedAt, location, type, saved: false, attempted: false, error: '' }];
    });
  };
  const chooseFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    const type = event.target === cornerFile.current ? pendingCorner.current : 'other';
    event.target.value = '';
    if (files.length + items.length > 12) { setError('Add up to 12 photos per batch.'); return; }
    setPreparing(true); setError('');
    const failures = [];
    for (const file of files) {
      try { addBlob(await prepareImage(file), file.name, 'file_upload', null, type); }
      catch (e) { failures.push(`${file.name}: ${e.message}`); }
    }
    setError(failures.join(' ')); setPreparing(false);
  };
  const capture = async () => {
    if (!video.current?.videoWidth || items.length >= 12) return;
    setPreparing(true); setError('');
    try {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1,2400 / Math.max(video.current.videoWidth,video.current.videoHeight));
      canvas.width = Math.round(video.current.videoWidth * ratio); canvas.height = Math.round(video.current.videoHeight * ratio);
      const capturedAt = new Date().toISOString();
      canvas.getContext('2d').drawImage(video.current,0,0,canvas.width,canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve,'image/jpeg',0.9));
      if (!blob) throw new Error('Camera capture failed. Try again.');
      addBlob(blob,`vehicle-${Date.now()}.jpg`,'live_camera',capturedAt,cameraType);
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
    if (saving.current || preparing || !items.length || allSaved) return;
    if (!/^CA\d{3}$/.test(details.office.trim().toUpperCase())) { setError('Enter an office code such as CA030.'); return; }
    if (!details.customer_name.trim()) { setError('Customer name is required.'); return; }
    saving.current = true; setBusy(true); setCameraOpen(false); setError('');
    let successes = 0;
    for (const item of items.filter((entry) => !entry.saved)) {
      setItems((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, attempted: true, error: '', uploading: true } : entry));
      try {
        const path = `${user.id}/${item.id}.jpg`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path,item.blob,{ contentType: 'image/jpeg', upsert: false });
        // A previous upload may have succeeded even if its response was interrupted.
        if (uploadError && String(uploadError.statusCode || uploadError.status) !== '409' && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
        const { error: saveError } = await supabase.rpc('vpl_save_photo', { p_id: item.id, p_details: {
          ...details, office: details.office.trim().toUpperCase(), photo_type: item.type,
          original_filename: item.filename, source: item.source, captured_at: item.capturedAt,
          ...(item.location || {}),
        } });
        if (saveError) throw saveError;
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
    if (items.some((item) => !item.saved) && !window.confirm('Discard photos that have not been saved?')) return;
    onClose();
  };
  return <section className={styles.panel} aria-labelledby="upload-title">
    <div className={styles.heading}><div><span className={styles.eyebrow}>ADD TO LIBRARY</span><h2 id="upload-title">Vehicle photos</h2></div><button type="button" onClick={close} disabled={busy || preparing || locating}>Close</button></div>
    <p>Details below attach to every photo in this batch. Saved photos are private and searchable.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <form onSubmit={save}>
      <fieldset disabled={busy || locked || preparing || locating} className={styles.fields}>
        <label>Office *<input required placeholder="CA030" maxLength={5} value={details.office} onChange={(e) => setDetails({ ...details, office: e.target.value.toUpperCase() })} /></label>
        <label>Customer name *<input required maxLength={150} value={details.customer_name} onChange={(e) => setDetails({ ...details, customer_name: e.target.value })} /></label>
        <label>Policy number<input maxLength={100} value={details.policy_number} onChange={(e) => setDetails({ ...details, policy_number: e.target.value })} /></label>
        <label>Vehicle<input placeholder="Year, make, model" maxLength={200} value={details.vehicle} onChange={(e) => setDetails({ ...details, vehicle: e.target.value })} /></label>
        <label>VIN<input maxLength={17} value={details.vin} onChange={(e) => setDetails({ ...details, vin: e.target.value.toUpperCase() })} /></label>
        <label>Address (agent-entered)<input maxLength={500} value={details.reported_address} onChange={(e) => setDetails({ ...details, reported_address: e.target.value })} /></label>
        <label className={styles.wide}>Notes<textarea maxLength={2000} value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} /></label>
      </fieldset>
      {!locked && <>
        <VehiclePhotoGuide language={language} onLanguage={setLanguage} items={items} disabled={preparing || locating || busy || items.length >= 12}
          onCapture={openCorner} onChoose={(type) => { pendingCorner.current = type; cornerFile.current?.click(); }} />
        <input ref={cornerFile} type="file" accept="image/*" hidden aria-label="Choose a corner photo" onChange={chooseFiles} />
        <div className={styles.actions}>
          <button type="button" disabled={locating || preparing} onClick={locate}>{locating ? 'Getting location…' : location ? 'Refresh device location' : 'Add device location (optional)'}</button>
          {location && <span className={styles.small}>Recorded {formatTime(location.location_at)} · ±{Math.round(location.accuracy_m)} m</span>}
        </div>
        <p className={styles.small}>Location attaches to photos added after you enable it. For chosen files, this is the device location when added—not the original photo location.</p>
        <div className={styles.actions}>
          <button type="button" disabled={preparing || locating} onClick={() => { setError(''); setCameraType('other'); setCameraOpen((open) => !open); }}>{cameraOpen ? 'Close camera' : 'Open camera'}</button>
          <label className={styles.fileButton}>Choose photos<input aria-label="Choose photos" type="file" accept="image/*" multiple disabled={preparing || locating} onChange={chooseFiles} /></label>
          <span className={styles.small}>{preparing ? 'Preparing photo…' : 'Up to 12 photos · JPEG/PNG recommended'}</span>
        </div>
        {cameraOpen && <div ref={cameraAnchor} className={styles.camera}>
          <label>{language === 'es' ? 'Vista de la foto' : 'Photo view'}<select value={cameraType} disabled={preparing} onChange={(event) => setCameraType(event.target.value)}>{PHOTO_TYPES.map(([value,label]) => <option key={value} value={value}>{language === 'es' ? CORNER_VIEWS.find((view) => view.key === value)?.es || label : label}</option>)}</select></label>
          <p className={styles.cameraPrompt}>{CORNER_VIEWS.find((view) => view.key === cameraType)?.[language === 'es' ? 'instructionEs' : 'instructionEn'] || (language === 'es' ? 'Encuadra el detalle y toma una foto clara.' : 'Frame the detail and take a clear photo.')}</p><video ref={video} playsInline muted autoPlay /><button type="button" className={styles.primary} disabled={!cameraReady || preparing || items.length >= 12} onClick={capture}>{language === 'es' ? 'Tomar foto' : 'Take photo'}</button></div>}
      </>}
      <div className={styles.uploadGrid}>{items.map((item) => <div className={styles.uploadCard} key={item.id}>
        <img src={item.preview} alt={`Upload preview: ${item.filename}`} />
        <label>Photo type<select aria-label={`Photo type for ${item.filename}`} value={item.type} disabled={locked || busy} onChange={(e) => setItems((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, type: e.target.value } : entry))}>{PHOTO_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <span className={styles.small}>{item.source === 'live_camera' ? 'Camera capture' : 'Chosen file'}</span>
        {item.saved ? <strong className={styles.success}>Saved</strong> : item.uploading ? <span role="status">Saving…</span> : !locked && <button type="button" onClick={() => { URL.revokeObjectURL(item.preview); urls.current.delete(item.preview); setItems((previous) => previous.filter((entry) => entry.id !== item.id)); }}>Remove</button>}
        {item.error && <p role="alert" className={styles.error}>{item.error}</p>}
      </div>)}</div>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy || preparing || locating || !items.length || allSaved}>{busy ? 'Saving photos…' : allSaved ? 'All photos saved' : locked ? 'Retry unsaved photos' : 'Save photos'}</button>
        <span role="status">{items.filter((item) => item.saved).length} of {items.length} saved</span>
      </div>
      <p className={styles.small}>Keep this page open until every photo says Saved. This version requires internet; unsaved photos do not survive closing the page. Images are converted to JPEG, up to 2400 pixels on the longest side.</p>
    </form>
  </section>;
}

export default function VehiclePhotoLibrary() {
  const { user, profile } = useAuth();
  const reviewer = REVIEWERS.includes(profile?.role);
  const [search, setSearch] = useState('');
  const [office, setOffice] = useState('');
  const [type, setType] = useState('');
  const [query, setQuery] = useState({ search: '', office: '', type: '', page: 0 });
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideLanguage, setGuideLanguage] = useState('en');
  const [selected, setSelected] = useState(null);
  const [downloading, setDownloading] = useState(false);
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
    setLoading(true); setError(''); setRows([]);
    (async () => {
      try {
        const { data, error: listError } = await supabase.rpc('vpl_search_photos', { p_search: query.search, p_office: query.office, p_type: query.type, p_offset: query.page * PAGE_SIZE });
        if (listError) throw listError;
        const records = (data || []).slice(0,PAGE_SIZE);
        let signed = [];
        if (records.length) {
          const result = await supabase.storage.from(BUCKET).createSignedUrls(records.map((row) => row.storage_path), 3600);
          if (result.error) throw result.error;
          signed = result.data || [];
        }
        if (!cancelled) { setRows(records.map((row,index) => ({ ...row, url: signed[index]?.signedUrl }))); setMore((data || []).length > PAGE_SIZE); }
      } catch (e) { if (!cancelled) setError(e.message || 'Could not load photos.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [query]);
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
  if (!user) return <main className={styles.page}><p>Sign in to access vehicle photos.</p></main>;
  return <main className={styles.page}>
    <header className={styles.heading}><div><span className={styles.eyebrow}>UNDERWRITING / VEHICLE PHOTOS</span><h1>Vehicle photo library</h1><p>{reviewer ? 'Search and review photos across offices.' : 'Upload and search your vehicle photos.'}</p></div><button className={styles.primary} type="button" onClick={() => setUploadOpen(true)}>+ Add photos</button></header>
    <div className={styles.actions}><button type="button" aria-expanded={guideOpen} onClick={() => setGuideOpen((open) => !open)}>{guideOpen ? 'Hide Photo Guidelines' : 'View Photo Guidelines'}</button></div>
    {guideOpen && <div className={styles.panel}><VehiclePhotoGuide language={guideLanguage} onLanguage={setGuideLanguage} /></div>}
    {uploadOpen && <UploadPanel user={user} onClose={() => setUploadOpen(false)} onSaved={refresh} />}
    <section className={styles.panel} aria-label="Search vehicle photos">
      <form className={styles.search} onSubmit={(event) => { event.preventDefault(); setQuery({ search: search.trim(),office: office.trim().toUpperCase(),type,page:0 }); }}>
        <label className={styles.searchInput}>Search<input value={search} maxLength={200} onChange={(e) => setSearch(e.target.value)} placeholder="Customer, policy, VIN, vehicle, notes, or agent email" /></label>
        <label>Office<input value={office} maxLength={5} placeholder="All offices" onChange={(e) => setOffice(e.target.value.toUpperCase())} /></label>
        <label>Photo type<select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{PHOTO_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="submit" className={styles.primary}>Search</button>
        <button type="button" onClick={() => { setSearch(''); setOffice(''); setType(''); setQuery({ search:'',office:'',type:'',page:0 }); }}>Clear</button>
        <button type="button" disabled={loading} onClick={refresh}>Refresh</button>
      </form>
    </section>
    {error && <div className={styles.error} role="alert">{error}<br />If this is a new installation, confirm the Vehicle Photo Library SQL migration has been applied.</div>}
    {loading ? <p role="status" className={styles.empty}>Loading photos…</p> : !error && !rows.length ? <div className={styles.empty}><h2>{query.search || query.office || query.type ? 'No matching photos' : 'No photos yet'}</h2><p>{query.search || query.office || query.type ? 'Try another search or clear the filters.' : 'Add the first vehicle photos to start your library.'}</p></div> : <div className={styles.gallery}>{rows.map((row) => <button type="button" className={styles.photoCard} key={row.id} onClick={(event) => openPhoto(row,event)}>
      {row.url ? <img src={row.url} loading="lazy" alt={`${photoLabel(row.photo_type)} — ${row.vehicle || 'vehicle'} for ${row.customer_name}`} onError={(event) => { event.currentTarget.alt='Preview unavailable. Open to retry.'; }} /> : <div className={styles.missing}>Open photo</div>}
      <div className={styles.cardBody}><div className={styles.heading}><span className={styles.badge}>{row.office}</span><span className={styles.small}>{photoLabel(row.photo_type)}</span></div><strong>{row.customer_name}</strong><span>{row.vehicle || 'Vehicle not specified'}</span><span className={styles.small}>Policy: {row.policy_number || 'Not specified'}</span><span className={styles.small}>{formatTime(row.uploaded_at)}</span></div>
    </button>)}</div>}
    <nav className={styles.pagination} aria-label="Photo result pages"><button type="button" disabled={loading || query.page===0} onClick={() => setQuery((previous) => ({ ...previous,page:previous.page-1 }))}>Previous</button><span>Page {query.page+1}</span><button type="button" disabled={loading || !more || Boolean(error)} onClick={() => setQuery((previous) => ({ ...previous,page:previous.page+1 }))}>Next</button></nav>
    {selected && <div className={styles.backdrop} onClick={(event) => { if (event.target===event.currentTarget) setSelected(null); }}><section data-photo-dialog className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="photo-title">
      <div className={styles.heading}><h2 id="photo-title">{photoLabel(selected.photo_type)} · {selected.customer_name}</h2><button ref={closeDetail} type="button" onClick={() => setSelected(null)}>Close</button></div>
      <img className={styles.fullPhoto} src={selected.url} alt={`${photoLabel(selected.photo_type)} for ${selected.customer_name}`} />
      <dl className={styles.metadata}>
        {[
          ['Office',selected.office],['Customer',selected.customer_name],['Policy',selected.policy_number],['Vehicle',selected.vehicle],['VIN',selected.vin],
          ['Photo type',photoLabel(selected.photo_type)],['Uploaded by',selected.uploaded_by_email],['Uploaded at (server)',formatTime(selected.uploaded_at)],
          ['Source',selected.source==='live_camera' ? 'In-page camera' : 'Chosen file'],['Captured at (device-reported)',selected.captured_at ? formatTime(selected.captured_at) : 'Unknown for chosen files'],
          ['Original filename',selected.original_filename],['Address (agent-entered)',selected.reported_address],['Notes',selected.notes],
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

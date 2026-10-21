import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../AuthContext';
import { officeLevel } from '../../../utils/adminPermissions';
import { Link, useSearchParams } from 'react-router-dom';
import OfficeManagementSettings from './OfficeManagementSettings';
import { createOffice, listOffices } from './officeService';
import styles from './OfficeManagement.module.css';
import OfficeManagementNav from './OfficeManagementNav';
const REGIONS = ['BAY AREA', 'VALLEY', 'CEN-CAL', 'KERN', 'SOUTHERN CALIFORNIA'];
const zipCache = new Map();
const ZIP_API = 'https://api.zippopotam.us/us/';
const zip5 = value => String(value || '').match(/\b\d{5}\b/)?.[0] || '';
const getZipLocation = async zip => {
  if (zipCache.has(zip)) return zipCache.get(zip);
  try {
    const response = await fetch(`${ZIP_API}${encodeURIComponent(zip)}`);
    if (!response.ok) return null;
    const data = await response.json();
    const place = data.places?.[0];
    const point = place ? { lat: Number(place.latitude), lon: Number(place.longitude) } : null;
    if (point && Number.isFinite(point.lat) && Number.isFinite(point.lon)) zipCache.set(zip, point);
    return point;
  } catch { return null; }
};
const milesBetween = (a, b) => {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
const addressOf = o => [o.street_address, [o.city, o.state, o.zip_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');
const mapsUrl = o => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressOf(o))}`;
const empty = { office_code: '', office_name: '', region: 'BAY AREA', status: 'planning', street_address: '', city: '', state: 'CA', zip_code: '', phone: '', email: '', notes: '' };
export default function OfficeManagement() {
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const fullAccess = officeLevel(profile?.permissions) === 'full';
  const showingSettings = searchParams.get('tab') === 'settings';
  const [offices, setOffices] = useState([]);
  const [query, setQuery] = useState('');
  const [finderZip, setFinderZip] = useState('');
  const [nearby, setNearby] = useState(null);
  const [finding, setFinding] = useState(false);
  const [finderError, setFinderError] = useState('');
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => { setError(''); try { setOffices(await listOffices(fullAccess)); } catch (e) { setError(e.message); } finally { setLoading(false); } }, [fullAccess]);
  useEffect(() => { refresh(); }, [refresh]);
  const visible = useMemo(() => offices.filter(o => (!region || o.region === region) && (!status || o.status === status) && `${o.office_code} ${o.office_name} ${o.city || ''} ${o.street_address || ''} ${o.zip_code || ''} ${o.phone || ''} ${o.email || ''}`.toLowerCase().includes(query.toLowerCase())), [offices, query, region, status]);
  const findNearest = async e => {
    e.preventDefault();
    const zip = finderZip.trim();
    setFinderError('');
    setNearby(null);
    if (!/^\d{5}$/.test(zip)) { setFinderError('Enter a valid five-digit US ZIP code.'); return; }
    setFinding(true);
    try {
      const origin = await getZipLocation(zip);
      if (!origin) throw new Error('Could not locate that ZIP code. Please check it and try again.');
      const candidates = offices.filter(o => o.status === 'active' && zip5(o.zip_code));
      const results = [];
      // Limit concurrent requests to be considerate of the public ZIP lookup service.
      for (let i = 0; i < candidates.length; i += 4) {
        const batch = candidates.slice(i, i + 4);
        const points = await Promise.all(batch.map(o => getZipLocation(zip5(o.zip_code))));
        batch.forEach((o, index) => {
          if (points[index]) results.push({ office: o, miles: milesBetween(origin, points[index]) });
        });
      }
      if (!results.length) throw new Error('No office ZIP codes could be located right now.');
      results.sort((a, b) => a.miles - b.miles);
      setNearby({ zip, results: results.slice(0, 5), skipped: candidates.length - results.length });
    } catch (err) { setFinderError(err.message || 'Unable to find nearby offices.'); }
    finally { setFinding(false); }
  };
  const save = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { await createOffice({ ...form, office_code: form.office_code.trim().toUpperCase(), office_name: form.office_name.trim() }); setForm(empty); setAdding(false); await refresh(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  if (showingSettings) return fullAccess ? <OfficeManagementSettings embedded /> : <p>Access denied.</p>;
  return <main className={styles.page}>
    <header className={styles.header}><div><small>OPERATIONS / OFFICE MANAGEMENT</small><h1>Office Directory</h1><p>One place for every location and its operational records.</p></div>{fullAccess && <button className={styles.primary} onClick={() => setAdding(v => !v)}>{adding ? 'Cancel' : '+ Add Office'}</button>}</header>
    {fullAccess && <OfficeManagementNav />}
    <section className={styles.stats}><div><span>Total offices</span><strong>{offices.length}</strong></div><div><span>Active</span><strong>{offices.filter(o => o.status === 'active').length}</strong></div><div><span>Opening / Planning</span><strong>{offices.filter(o => ['opening','planning'].includes(o.status)).length}</strong></div></section>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {fullAccess && adding && <form onSubmit={save} className={styles.panel}><h2>Add an office</h2><div className={styles.formGrid}>
      {[["Office code",'office_code'],['Office name','office_name'],['Street address','street_address'],['City','city'],['State','state'],['ZIP','zip_code'],['Phone','phone'],['Email','email']].map(([label,key]) => <label key={key}>{label}<input required={['office_code','office_name'].includes(key)} value={form[key]} onChange={e => setForm(f => ({...f,[key]:e.target.value}))} /></label>)}
      <label>Region<select value={form.region} onChange={e => setForm(f => ({...f,region:e.target.value}))}>{REGIONS.map(r => <option key={r}>{r}</option>)}</select></label>
      <label>Status<select value={form.status} onChange={e => setForm(f => ({...f,status:e.target.value}))}>{['planning','opening','active','temporarily_closed','closed','sold'].map(s => <option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label>
      <label className={styles.wide}>Notes<textarea value={form.notes} onChange={e => setForm(f => ({...f,notes:e.target.value}))} /></label>
    </div><button disabled={busy} className={styles.primary} type="submit">{busy ? 'Saving…' : 'Save office'}</button></form>}
    <section className={styles.panel}>
      <div className={styles.directoryHeading}><div><h2>Find a nearby office</h2><p>Enter a ZIP code to find the five closest active Fiesta locations.</p></div></div>
      <form className={styles.zipFinder} onSubmit={findNearest}>
        <input aria-label="ZIP code for nearest office" inputMode="numeric" maxLength={5} pattern="[0-9]{5}" placeholder="Enter ZIP code (e.g. 93292)" value={finderZip} onChange={e => setFinderZip(e.target.value.replace(/\D/g, '').slice(0, 5))} />
        <button className={styles.primary} disabled={finding || loading} type="submit">{finding ? 'Finding offices…' : 'Find nearest offices'}</button>
        {nearby && <button type="button" className={styles.secondaryButton} onClick={() => { setNearby(null); setFinderZip(''); setFinderError(''); }}>Clear</button>}
      </form>
      {finderError && <p className={styles.error} role="alert">{finderError}</p>}
      {nearby && <div className={styles.nearbyResults} aria-live="polite">
        <h3>Closest active offices to {nearby.zip}</h3>
        <p className={styles.helper}>Approximate straight-line distance between ZIP-code centers, not driving distance. {nearby.skipped > 0 ? `${nearby.skipped} office(s) could not be located.` : ''}</p>
        <div className={styles.nearbyGrid}>{nearby.results.map(({ office: o, miles }) => <article className={styles.nearbyCard} key={o.id || o.office_code}>
          <div className={styles.nearbyCardTop}><strong>{o.office_code} · {o.office_name}</strong><span>{miles.toFixed(1)} mi</span></div>
          <p>{addressOf(o) || 'Address unavailable'}</p>
          <div className={styles.directoryActions}>{o.phone && <a href={`tel:${String(o.phone).replace(/[^\d+]/g, '')}`}>Call</a>}{o.street_address && <a href={mapsUrl(o)} target="_blank" rel="noopener noreferrer">Directions ↗</a>}{fullAccess && o.id && <Link to={`/admin/offices/${o.id}`}>Manage office →</Link>}</div>
        </article>)}</div>
      </div>}
    </section>
    <section className={styles.panel}>
      <div className={styles.directoryHeading}><div><h2>All office locations</h2><p>Search by office code, name, city, address, ZIP code, phone, or email.</p></div><span className={styles.countLabel}>{visible.length} of {offices.length} offices</span></div>
      <div className={styles.filters}><input aria-label="Search offices" placeholder="Search code, office, city, ZIP, phone…" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Region" value={region} onChange={e => setRegion(e.target.value)}><option value="">All regions</option>{REGIONS.map(r => <option key={r}>{r}</option>)}</select><select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{['planning','opening','active','temporarily_closed','closed','sold'].map(s => <option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></div>
      {loading ? <p>Loading offices…</p> : <div className={styles.tableScroll}><table className={styles.directoryTable}><thead><tr><th>Code / Office</th><th>Region</th><th>Status</th><th>Street address</th><th>City / State / ZIP</th><th>Phone</th><th>Email</th><th>Actions</th></tr></thead><tbody>{visible.map(o => <tr key={o.id || o.office_code}>
        <td><strong>{o.office_code}</strong><div className={styles.officeSubtext}>{o.office_name}</div></td><td>{o.region || '—'}</td><td><span className={styles.pill}>{String(o.status || 'unknown').replaceAll('_',' ')}</span></td><td>{o.street_address || '—'}</td><td>{[o.city,o.state].filter(Boolean).join(', ') || '—'}{o.zip_code && <div className={styles.officeSubtext}>{o.zip_code}</div>}</td>
        <td>{o.phone ? <a href={`tel:${String(o.phone).replace(/[^\d+]/g, '')}`}>{o.phone}</a> : '—'}</td><td>{o.email ? <a href={`mailto:${o.email}`}>{o.email}</a> : '—'}</td>
        <td><div className={styles.directoryActions}>{o.street_address && <a href={mapsUrl(o)} target="_blank" rel="noopener noreferrer">Map ↗</a>}{fullAccess && o.id && <Link to={`/admin/offices/${o.id}`}>Open →</Link>}</div></td>
      </tr>)}</tbody></table>{!visible.length && <p className={styles.empty}>No offices match your filters.</p>}</div>}
    </section>
  </main>;
}

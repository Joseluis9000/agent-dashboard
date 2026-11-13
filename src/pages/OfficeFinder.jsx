import React, { useEffect, useMemo, useRef, useState } from 'react';
import { listOffices } from './admin/officeManagement/officeService';
import styles from './OfficeFinder.module.css';

const zipCache = new Map();
const zipOf = (value) => String(value || '').match(/\b\d{5}\b/)?.[0] || '';
const addressOf = (office) => [office.street_address, [office.city, office.state, office.zip_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');
const labelOf = (office) => {
  const code = String(office.office_code || '');
  const name = String(office.office_name || '');
  return name.startsWith(code) ? name : `${code} ${name}`.trim();
};
const statusOf = (office) => String(office.status || '').trim().toLowerCase();
const statusLabel = (status) => String(status || 'unknown').replace(/_/g, ' ');
const directionsTo = (office) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressOf(office))}`;

export function distanceInMiles(a, b) {
  const rad = (value) => value * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  const bounded = Math.min(1, Math.max(0, h));
  return 3958.8 * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}

async function locateZip(zip, signal) {
  if (zipCache.has(zip)) return zipCache.get(zip);
  const response = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, { signal });
  if (!response.ok) return null;
  const data = await response.json();
  const place = data.places?.[0];
  if (!place || place.latitude == null || place.longitude == null) return null;
  const point = { lat: Number(place.latitude), lon: Number(place.longitude) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
  zipCache.set(zip, point);
  return point;
}

function OfficeActions({ office }) {
  return <div className={styles.actions}>
    {office.street_address && <a href={directionsTo(office)} target="_blank" rel="noopener noreferrer">Directions ↗</a>}
    {office.email && <a href={`mailto:${office.email}`}>Email</a>}
  </div>;
}

export default function OfficeFinder() {
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState('');
  const [zip, setZip] = useState('');
  const [finding, setFinding] = useState(false);
  const [finderError, setFinderError] = useState('');
  const [nearby, setNearby] = useState(null);
  const searchController = useRef(null);
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    listOffices(false).then((rows) => {
      if (!active) return;
      const directory = (rows || []).filter((office) => office.office_code)
        .sort((a, b) => String(a.office_code).localeCompare(String(b.office_code)));
      setOffices(directory);
      if (!directory.length) setLoadError('No offices were returned for your account. Ask an administrator to check directory access.');
    }).catch(() => {
      if (active) setLoadError('The office directory could not be loaded. Please try again.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => () => {
    requestId.current += 1;
    searchController.current?.abort();
  }, []);

  const regions = useMemo(() => [...new Set(offices.map((office) => office.region).filter(Boolean))].sort(), [offices]);
  const statuses = useMemo(() => [...new Set(offices.map(statusOf).filter(Boolean))].sort(), [offices]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return offices.filter((office) => (!region || office.region === region)
      && (!status || statusOf(office) === status)
      && [office.office_code, office.office_name, office.city, office.street_address, office.zip_code, office.phone, office.email]
        .filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [offices, query, region, status]);

  const clearNearby = () => {
    requestId.current += 1;
    searchController.current?.abort();
    setFinding(false);
    setNearby(null);
    setFinderError('');
    setZip('');
  };

  const findNearest = async (event) => {
    event.preventDefault();
    const searchZip = zip.trim();
    if (!/^\d{5}$/.test(searchZip)) {
      setFinderError('Enter a valid five-digit ZIP code.');
      return;
    }
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const current = ++requestId.current;
    setFinding(true);
    setFinderError('');
    setNearby(null);
    try {
      const origin = await locateZip(searchZip, controller.signal);
      if (!origin) throw new Error('That ZIP code could not be located. Check it and try again.');
      const active = offices.filter((office) => statusOf(office) === 'active');
      if (!active.length) throw new Error('No active offices are listed in the directory.');
      const candidates = active.filter((office) => zipOf(office.zip_code));
      const results = [];
      // Request each office ZIP once, in small concurrent batches like the admin finder.
      const zips = [...new Set(candidates.map((office) => zipOf(office.zip_code)))];
      const points = new Map();
      for (let i = 0; i < zips.length; i += 4) {
        if (current !== requestId.current) return;
        const batch = zips.slice(i, i + 4);
        const located = await Promise.all(batch.map(async (value) => {
          try { return await locateZip(value, controller.signal); }
          catch (error) { if (error.name === 'AbortError') throw error; return null; }
        }));
        batch.forEach((value, index) => points.set(value, located[index]));
      }
      candidates.forEach((office) => {
        const point = points.get(zipOf(office.zip_code));
        if (point) results.push({ office, miles: distanceInMiles(origin, point) });
      });
      if (!results.length) throw new Error('No office ZIP codes could be located right now. Browse the directory below or try again.');
      results.sort((a, b) => a.miles - b.miles || String(a.office.office_code).localeCompare(String(b.office.office_code)));
      if (current === requestId.current) setNearby({ zip: searchZip, results: results.slice(0, 5), skipped: active.length - results.length });
    } catch (error) {
      if (current === requestId.current && error.name !== 'AbortError') setFinderError(error.message || 'Unable to find nearby offices. Please try again.');
    } finally {
      if (current === requestId.current) setFinding(false);
    }
  };

  return <main className={styles.page}>
    <header className={styles.header}>
      <p className={styles.eyebrow}>TEAM TOOLS / LOCATIONS</p>
      <h1>Office Finder</h1>
      <p>Find a nearby Fiesta location or look up office contact information.</p>
    </header>

    {loadError && <div className={styles.error} role="alert"><span>{loadError}</span><button type="button" onClick={() => setReload((value) => value + 1)}>Try again</button></div>}

    <section className={styles.panel} aria-labelledby="office-finder-heading">
      <div className={styles.panelHeading}><div><h2 id="office-finder-heading">Find a nearby office</h2><p>Search across all regions for the five closest active locations.</p></div><span className={styles.badge}>ZIP code search</span></div>
      <div className={styles.finderBody}>
        <form className={styles.zipForm} onSubmit={findNearest} noValidate>
          <label htmlFor="finder-zip">Customer ZIP code<input id="finder-zip" inputMode="numeric" autoComplete="postal-code" maxLength={5} placeholder="e.g. 93292" value={zip} onChange={(event) => {
            const next = event.target.value.replace(/\D/g, '').slice(0, 5);
            requestId.current += 1;
            searchController.current?.abort();
            setFinding(false);
            setNearby(null);
            setFinderError('');
            setZip(next);
          }} /></label>
          <button className={styles.primary} type="submit" disabled={finding || loading || !!loadError || !offices.length}>{finding ? 'Finding offices…' : 'Find nearest offices'}</button>
          {(nearby || finderError || finding) && <button className={styles.secondary} type="button" onClick={clearNearby}>Clear</button>}
        </form>
        {finding && <p className={styles.helper} role="status">Looking up office ZIP codes…</p>}
        {finderError && <p className={styles.inlineError} role="alert">{finderError}</p>}
        {nearby && <div className={styles.results} aria-live="polite">
          <div className={styles.resultsHeading}><h3>Closest offices to {nearby.zip}</h3><p>Approximate straight-line distances between ZIP-code centers, not driving distances.{nearby.skipped > 0 ? ` ${nearby.skipped} active office(s) could not be located.` : ''}</p></div>
          <div className={styles.resultGrid}>{nearby.results.map(({ office, miles }, index) => <article className={styles.officeCard} key={office.id || office.office_code}>
            <div className={styles.cardTop}><span className={styles.rank}>{index + 1}</span><span className={styles.distance}>{miles.toFixed(1)} mi</span></div>
            <h4>{labelOf(office)}</h4><span className={styles.regionLabel}>{office.region || 'Region unavailable'}</span>
            <p>{addressOf(office) || 'Address unavailable'}</p>
            {office.phone && <span className={styles.phone}>{office.phone}</span>}
            <OfficeActions office={office} />
          </article>)}</div>
        </div>}
      </div>
    </section>

    <section className={styles.panel} aria-labelledby="office-directory-heading" aria-busy={loading}>
      <div className={styles.panelHeading}><div><h2 id="office-directory-heading">Office directory</h2><p>Locations and contact details from Office Management.</p></div><span className={styles.count}>{loading ? 'Loading…' : `${visible.length} of ${offices.length} offices`}</span></div>
      <div className={styles.filters}>
        <label>Search offices<input type="search" placeholder="Office code, name, city, ZIP, or phone…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label>Region<select value={region} onChange={(event) => setRegion(event.target.value)}><option value="">All regions</option>{regions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
      </div>
      {loading ? <p className={styles.empty} role="status">Loading office directory…</p>
        : !visible.length ? <p className={styles.empty}>{offices.length ? 'No offices match your filters.' : 'No offices are available.'}</p>
          : <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Office</th><th>Region / Status</th><th>Address</th><th>Contact</th><th>Actions</th></tr></thead><tbody>{visible.map((office) => <tr key={office.id || office.office_code}>
            <td><strong>{labelOf(office)}</strong></td>
            <td><span>{office.region || '—'}</span><span className={`${styles.status} ${statusOf(office) === 'active' ? styles.statusActive : ''}`}>{statusLabel(office.status)}</span></td>
            <td>{addressOf(office) || '—'}</td>
            <td>{office.phone && <span className={styles.contact}>{office.phone}</span>}{office.email && <a className={styles.contact} href={`mailto:${office.email}`}>{office.email}</a>}{!office.phone && !office.email && '—'}</td>
            <td><OfficeActions office={office} /></td>
          </tr>)}</tbody></table></div>}
    </section>
  </main>;
}

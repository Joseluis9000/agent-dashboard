import { useAuth } from '../../../AuthContext';
import { officeLevel } from '../../../utils/adminPermissions';
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getOffice } from './officeService';
import ServiceAccounts from './ServiceAccounts';
import OfficeDocuments from './OfficeDocuments';
import OfficeCompliance from './OfficeCompliance';
import OfficeMaintenance from './OfficeMaintenance';
import OfficeOpeningTasks from './OfficeOpeningTasks';
import OfficeHistory from './OfficeHistory';
import styles from './OfficeManagement.module.css';
const sections = ['Overview', 'Service Accounts', 'Documents', 'Compliance', 'Maintenance', 'Opening Tasks', 'History'];
export default function OfficeProfile() {
  const { officeId } = useParams();
  const { profile } = useAuth();
  const fullAccess = officeLevel(profile?.permissions) === 'full';
  const [office, setOffice] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Overview');
  useEffect(() => { if (!fullAccess) return; getOffice(officeId).then(setOffice).catch(e => setError(e.message)); }, [officeId]);
  if (!fullAccess) return <main className={styles.page}><p>Access denied.</p><Link to="/admin/offices">Office Directory</Link></main>;
  return <main className={styles.page}><Link to="/admin/offices">← Office Directory</Link>{error && <p role="alert" className={styles.error}>{error}</p>}{!office && !error && <p>Loading office…</p>}{office && <><header className={styles.header}><div><small>{office.office_code} · {office.region}</small><h1>{office.office_name}</h1><p>{[office.street_address,office.city,office.state,office.zip_code].filter(Boolean).join(', ')}</p></div><span className={styles.pill}>{office.status.replaceAll('_',' ')}</span></header><nav className={styles.tabs}>{sections.map(s => <button key={s} className={tab === s ? styles.selected : ''} onClick={() => setTab(s)}>{s}</button>)}</nav><section className={styles.panel}>{tab === 'Service Accounts' ? <ServiceAccounts officeId={officeId} /> : tab === 'Documents' ? <OfficeDocuments officeId={officeId} /> : tab === 'Compliance' ? <OfficeCompliance officeId={officeId} /> : tab === 'Maintenance' ? <OfficeMaintenance officeId={officeId} officeCode={office.office_code} /> : tab === 'Opening Tasks' ? <OfficeOpeningTasks officeId={officeId} /> : tab === 'History' ? <OfficeHistory officeId={officeId} officeCode={office.office_code} /> : tab === 'Overview' ? <div className={styles.details}><div><b>Office code</b><p>{office.office_code}</p></div><div><b>Region</b><p>{office.region}</p></div><div><b>Phone</b><p>{office.phone || 'Not entered'}</p></div><div><b>Email</b><p>{office.email || 'Not entered'}</p></div><div><b>Notes</b><p>{office.notes || 'No notes yet'}</p></div></div> : <><h2>{tab}</h2><p>This section is reserved for the next implementation phase. No records have been created yet.</p></>}</section></>}</main>;
}

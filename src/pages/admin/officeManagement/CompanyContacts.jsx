import React from 'react';
import { Link } from 'react-router-dom';
import OfficeManagementNav from './OfficeManagementNav';
import OfficeContacts from './OfficeContacts';
import styles from './OfficeManagement.module.css';

export default function CompanyContacts() {
  return (
    <main className={styles.page}>
      <Link to="/admin/offices">← Office Directory</Link>

      <header className={styles.header}>
        <div>
          <small>OPERATIONS / OFFICE MANAGEMENT</small>
          <h1>Company Contacts</h1>
          <p>Shared contact directory linked to individual offices.</p>
        </div>
      </header>

      <OfficeManagementNav />

      <section className={styles.panel}>
        <OfficeContacts />
      </section>
    </main>
  );
}
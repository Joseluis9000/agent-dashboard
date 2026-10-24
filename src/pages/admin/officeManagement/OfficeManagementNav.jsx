

import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styles from './OfficeManagement.module.css';

const sections = [
  { to: '/admin/offices', label: 'Office Directory', end: true },
  { to: '/admin/offices/contacts', label: 'Company Contacts' },
  { to: '/admin/offices/company-services', label: 'Company Services' },
  { to: '/admin/offices/service-providers', label: 'Service Providers' },
  { to: '/admin/offices/landlords', label: 'Landlords & Leases' },
  { to: '/admin/offices/renewals', label: 'Contract Renewals' },
  { to: '/admin/offices?tab=settings', label: 'Settings' },
];

export default function OfficeManagementNav() {
  const location = useLocation();

  const settingsActive =
    location.pathname === '/admin/offices' &&
    new URLSearchParams(location.search).get('tab') === 'settings';

  return (
    <nav
      className={styles.moduleNav}
      aria-label="Office Management sections"
    >
      {sections.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `${styles.moduleNavLink} ${
              (
                label === 'Settings'
                  ? settingsActive
                  : label === 'Office Directory'
                    ? isActive && !settingsActive
                    : isActive
              )
                ? styles.moduleNavActive
                : ''
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

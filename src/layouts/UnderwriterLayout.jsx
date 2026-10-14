import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ChartNoAxesCombined,
  Gauge,
  HeartHandshake,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import styles from './UnderwriterLayout.module.css';

const navigation = [
  { to: '/uw', label: 'Underwriting Dashboard', icon: LayoutDashboard, end: true },
  { to: '/uw/scoreboard', label: 'Scoreboard', icon: ChartNoAxesCombined },
  { to: '/uw/office-pacing', label: 'Office Pacing', icon: Gauge },
  { to: '/uw/retention', label: 'Retention', icon: HeartHandshake },
];

const UnderwriterLayout = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const displayName =
    profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Underwriter';
  const roleLabel = String(
    profile?.role || profile?.user_role || user?.user_metadata?.role || 'Underwriting'
  )
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

  const handleLogout = async () => {
    if (typeof signOut === 'function') {
      await signOut();
    } else {
      await supabase.auth.signOut();
    }
    navigate('/login', { replace: true });
  };

  return (
    <div className={`${styles.layout} ${collapsed ? styles.layoutCollapsed : ''}`}>
      <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`} aria-label="Underwriting navigation">
        <div className={styles.sidebarTop}>
          <NavLink to="/uw" className={styles.logoLink} aria-label="Underwriting home" title="Underwriting Dashboard">
            <img src="/fiesta-logo.png" alt="Fiesta Insurance" className={styles.logo} />
          </NavLink>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {!collapsed && (
          <div className={styles.sidebarHeader}>
            <div className={styles.dashboardTitle}>Underwriting Dashboard</div>
            <div className={styles.userName}>{displayName}</div>
            <div className={styles.roleLabel}>{roleLabel}</div>
          </div>
        )}

        <nav className={styles.nav}>
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
            >
              <Icon size={18} strokeWidth={2.15} className={styles.navIcon} />
              {!collapsed && <span className={styles.navLabel}>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className={styles.footer}>
          <button type="button" className={styles.logout} onClick={handleLogout} title={collapsed ? 'Logout' : undefined} aria-label="Logout">
            <LogOut size={18} strokeWidth={2.2} className={styles.navIcon} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
};

export default UnderwriterLayout;

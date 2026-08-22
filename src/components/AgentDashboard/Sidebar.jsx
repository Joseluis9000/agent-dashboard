// src/components/AgentDashboard/Sidebar.jsx
import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  DollarSign,
  ShieldAlert,
  FileText,
  Ban,
  CalendarDays,
  ClipboardList,
  Building2,
  BarChart3,
  Ticket,
  Users,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../AuthContext';
import styles from './Dashboard.module.css';

const Sidebar = ({ onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email ||
    'Agent';

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const role = String(
    profile?.role ||
    profile?.user_role ||
    user?.user_metadata?.role ||
    'agent'
  )
    .trim()
    .toLowerCase();

  const isSupervisor = ['supervisor', 'admin'].includes(role);
  const isRegional = role === 'regional';

  const dashboardPath = isRegional ? '/regional/dashboard' : '/dashboard';

  const menuItems = useMemo(() => {
    // Regionals intentionally keep the same floor / agent tools.
    const items = [
      { path: dashboardPath, label: 'Dashboard', icon: Home },
      { path: '/agent/commission', label: 'Tax Commission Log', icon: DollarSign },
      { path: '/agent/violations', label: 'My Violations', icon: ShieldAlert },
      ...(!isRegional && !isSupervisor
        ? [{ path: '/agent/quotes', label: 'My Quotes', icon: ClipboardList }]
        : []),
      { path: '/uw/submit', label: 'Underwriting Submit', icon: FileText },
      { path: '/disqualified-policies', label: 'Disqualified Policies', icon: Ban },
      { path: '/ticketing-system', label: 'Appointment Calendar', icon: CalendarDays },
      { path: '/eod-report', label: 'EOD Report', icon: ClipboardList },
      { path: '/office-eods', label: 'Office & Agent EODs', icon: Building2 },
    ];

    if (isRegional) {
      items.push(
        { type: 'divider', label: 'Regional Tools' },
        { path: '/regional/quote-operations', label: 'Quote Operations', icon: ClipboardList },
        { path: '/regional/office-numbers', label: 'Office Performance', icon: BarChart3 },
        { path: '/regional/tickets', label: 'Manage Tickets', icon: Ticket }

        // Add once we build/verify a regional-scoped version:
        // { path: '/regional/tax-wip', label: 'Tax Wip', icon: Users }
      );
    }

    if (isSupervisor) {
      items.push(
        { type: 'divider', label: 'Supervisor Tools' },
        { path: '/supervisor/quote-operations', label: 'Quote Operations', icon: ClipboardList },
        { path: '/supervisor/office-numbers', label: 'Office Numbers', icon: BarChart3 },
        { path: '/supervisor/tickets', label: 'Manage Tickets', icon: Ticket },
        { path: '/supervisor/tax-wip', label: 'Tax Wip', icon: Users }
      );
    }

    return items;
  }, [dashboardPath, isRegional, isSupervisor]);

  const sidebarThemeClass = isSupervisor
    ? styles.supervisorSidebar
    : isRegional
      ? styles.regionalSidebar
      : '';

  const dashboardTitle = isSupervisor
    ? 'Supervisor Dashboard'
    : isRegional
      ? 'Regional Dashboard'
      : 'Agent Dashboard';

  return (
    <aside className={`${styles.sidebar} ${sidebarThemeClass}`}>
      <img
        src="/fiesta-logo.png"
        alt="Fiesta Insurance Logo"
        className={styles.logo}
      />

      <div className={styles.sidebarHeader}>
        <div className={styles.dashboardTitle}>{dashboardTitle}</div>
        <div className={styles.userName}>{displayName}</div>

        {isRegional && profile?.region && (
          <div className={styles.regionalRegionLabel}>{profile.region}</div>
        )}
      </div>

      <nav>
        {menuItems.map((item) => {
          if (item.type === 'divider') {
            return (
              <div key={item.label} className={styles.menuDivider}>
                {item.label}
              </div>
            );
          }

          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={active ? styles.active : ''}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={styles.navIcon} size={18} strokeWidth={2.2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <button
        onClick={onLogout}
        className={styles.logoutButton}
        type="button"
      >
        <LogOut className={styles.navIcon} size={18} strokeWidth={2.2} />
        <span>Logout</span>
      </button>
    </aside>
  );
};

export default Sidebar;
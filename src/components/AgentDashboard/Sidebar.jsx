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

  const role = profile?.role || user?.user_metadata?.role || 'agent';
  const isSupervisor = ['supervisor', 'admin'].includes(role);

  const menuItems = useMemo(() => {
    const items = [
      { path: '/dashboard', label: 'Dashboard', icon: Home },
      { path: '/agent/commission', label: 'Tax Commission Log', icon: DollarSign },
      { path: '/agent/violations', label: 'My Violations', icon: ShieldAlert },
      { path: '/uw/submit', label: 'Underwriting Submit', icon: FileText },
      { path: '/disqualified-policies', label: 'Disqualified Policies', icon: Ban },
      { path: '/ticketing-system', label: 'Appointment Calendar', icon: CalendarDays },
      { path: '/eod-report', label: 'EOD Report', icon: ClipboardList },
      { path: '/office-eods', label: 'Office & Agent EODs', icon: Building2 },
    ];

    if (isSupervisor) {
      items.push(
        { type: 'divider', label: 'Supervisor Tools' },
        { path: '/supervisor/office-numbers', label: 'Office Numbers', icon: BarChart3 },
        { path: '/supervisor/tickets', label: 'Manage Tickets', icon: Ticket },
        { path: '/supervisor/tax-wip', label: 'Tax Whip', icon: Users }
      );
    }

    return items;
  }, [isSupervisor]);

  return (
    <aside
      className={`${styles.sidebar} ${
        isSupervisor ? styles.supervisorSidebar : ''
      }`}
    >
      <img
        src="/fiesta-logo.png"
        alt="Fiesta Insurance Logo"
        className={styles.logo}
      />

      <div className={styles.sidebarHeader}>
        <div className={styles.dashboardTitle}>
          {isSupervisor ? 'Supervisor Dashboard' : 'Agent Dashboard'}
        </div>
        <div className={styles.userName}>{displayName}</div>
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

          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={isActive(item.path) ? styles.active : ''}
              aria-current={isActive(item.path) ? 'page' : undefined}
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
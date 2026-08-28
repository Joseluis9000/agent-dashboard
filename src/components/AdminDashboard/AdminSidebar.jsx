import React, { useEffect, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { Link, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Ticket,
  ClipboardList,
  ChartNoAxesCombined,
  Building2,
  Users,
  ShieldAlert,
  DollarSign,
  CalendarDays,
  Megaphone,
  BadgeDollarSign,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import styles from './AdminDashboard.module.css';

const menuItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/tickets', label: 'Manage Tickets', icon: Ticket, end: true },
  { to: '/admin/quote-log', label: 'Quote Operations', icon: ClipboardList },
  { to: '/admin/office-numbers', label: 'Office Numbers', icon: ChartNoAxesCombined },
  { to: '/admin/office-eods', label: 'Office EODs', icon: Building2 },
  { to: '/admin/manage-users', label: 'Manage Users', icon: Users },
  { to: '/admin/violations', label: 'Manage Violations', icon: ShieldAlert },
  { to: '/admin/commission', label: 'Tax Commission Log', icon: DollarSign },
  { to: '/admin/commission-upload', label: 'EOD Data Calendar', icon: CalendarDays },
  { to: '/admin/marketing', label: 'Marketing Operations', icon: Megaphone },
  { to: '/admin/tax-wip', label: 'Agent Commissions', icon: BadgeDollarSign },
];

const AdminSidebar = ({ onLogout, collapsed = false, onToggle }) => {
  const [isCollapsed, setIsCollapsed] = useState(Boolean(collapsed));
  const ToggleIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;
  const { user, profile } = useAuth();

  // Keep the sidebar open by default, but allow this component to collapse itself
  // even when the parent page does not manage collapse state.
  useEffect(() => {
    setIsCollapsed(Boolean(collapsed));
  }, [collapsed]);

  // The admin layout uses --sidebar-w for both the sidebar and the main-content
  // offset, so update the shared CSS variable whenever the sidebar changes size.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('--sidebar-w');
    root.style.setProperty('--sidebar-w', isCollapsed ? '72px' : '260px');

    return () => {
      if (previous) {
        root.style.setProperty('--sidebar-w', previous);
      } else {
        root.style.removeProperty('--sidebar-w');
      }
    };
  }, [isCollapsed]);

  const handleToggle = () => {
    setIsCollapsed((current) => {
      const next = !current;
      if (typeof onToggle === 'function') onToggle(next);
      return next;
    });
  };

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email ||
    'Admin';

  const roleLabel = String(
    profile?.role ||
    profile?.user_role ||
    user?.user_metadata?.role ||
    'admin'
  )
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <aside
      className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ''}`}
      aria-label="Admin navigation"
    >
      <div className={styles.sidebarTop}>
        <Link
          to="/admin"
          aria-label="Go to admin dashboard"
          title="Admin Dashboard"
          style={{ display: 'block', width: '100%' }}
        >
          <img
            src="/fiesta-logo.png"
            alt="Fiesta Insurance Logo"
            className={styles.logo}
          />
        </Link>

        <button
          type="button"
          className={styles.collapseBtn}
          onClick={handleToggle}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ToggleIcon size={18} strokeWidth={2.2} />
        </button>
      </div>

      {!isCollapsed && (
        <div className={styles.sidebarHeader}>
          <div className={styles.dashboardTitle}>Admin Dashboard</div>
          <div className={styles.userName}>{displayName}</div>
          <div className={styles.roleLabel}>{roleLabel}</div>
        </div>
      )}

      <nav className={styles.nav}>
        {menuItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.activeLink : ''}`
            }
            title={isCollapsed ? label : undefined}
          >
            <Icon className={styles.navIcon} size={18} strokeWidth={2.15} />
            {!isCollapsed && <span className={styles.navLabel}>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={styles.logoutSection}>
        <button
          type="button"
          onClick={onLogout}
          className={styles.logoutButton}
          title={isCollapsed ? 'Logout' : undefined}
        >
          <LogOut className={styles.navIcon} size={18} strokeWidth={2.2} />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;

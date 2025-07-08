import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './RegionalDashboard.module.css';

const Sidebar = ({ onLogout, mascotPath, menuItems = [], userTitle }) => {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <aside className={styles.sidebar}>
            <img 
                src="/fiesta-logo.png" 
                alt="Fiesta Logo" 
                className={styles.logo} 
            />
            
            {/* ✅ FIX: Conditionally render the mascot image only when the path is not the default */}
            {mascotPath && mascotPath !== '/default-mascot.png' && (
                <img
                    src={mascotPath}
                    alt="Regional Mascot"
                    className={styles.mascotSidebar}
                    onError={(e) => { e.target.onerror = null; e.target.src="/default-mascot.png"; }}
                />
            )}

            <h3>{userTitle || 'Dashboard'}</h3>
            <nav>
                {menuItems.map(item => (
                    <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className={location.pathname === item.path ? styles.active : ''}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>
            <button onClick={onLogout} className={styles.logoutButton}>
                Logout
            </button>
        </aside>
    );
};

export default Sidebar;
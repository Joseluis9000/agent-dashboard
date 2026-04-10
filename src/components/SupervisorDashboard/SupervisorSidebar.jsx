// src/components/SupervisorDashboard/SupervisorSidebar.jsx

import React, { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import styles from "./SupervisorDashboard.module.css";

const REGION_LOGOS = {
  "CEN-CAL": "/cen-cal.png",
  "KERN COUNTY": "/kern-county.png",
  "BAY AREA": "/bay.png",
  "THE VALLEY": "/the-valley.png",
  "SOUTHERN CALI": "/southern-cal.png",
};


// Derived from your uploaded “OFFICE NAMES AND EMAILS” sheet:
// (fiestaca###@... → CA### → region)
const OFFICE_CODE_TO_REGION = {
  "CA010": "CEN-CAL",
  "CA011": "CEN-CAL",
  "CA012": "CEN-CAL",
  "CA016": "KERN COUNTY",
  "CA022": "CEN-CAL",
  "CA025": "THE VALLEY",
  "CA030": "THE VALLEY",
  "CA045": "THE VALLEY",
  "CA046": "THE VALLEY",
  "CA047": "KERN COUNTY",
  "CA048": "KERN COUNTY",
  "CA049": "KERN COUNTY",
  "CA065": "THE VALLEY",
  "CA074": "THE VALLEY",
  "CA075": "THE VALLEY",
  "CA076": "BAY AREA",
  "CA095": "THE VALLEY",
  "CA103": "BAY AREA",
  "CA104": "BAY AREA",
  "CA114": "BAY AREA",
  "CA117": "BAY AREA",
  "CA118": "THE VALLEY",
  "CA119": "THE VALLEY",
  "CA131": "SOUTHERN CALI",
  "CA132": "SOUTHERN CALI",
  "CA133": "SOUTHERN CALI",
  "CA149": "BAY AREA",
  "CA150": "BAY AREA",
  "CA166": "SOUTHERN CALI",
  "CA172": "KERN COUNTY",
  "CA183": "CEN-CAL",
  "CA216": "BAY AREA",
  "CA229": "CEN-CAL",
  "CA230": "CEN-CAL",
  "CA231": "THE VALLEY",
  "CA236": "BAY AREA",
  "CA238": "THE VALLEY",
  "CA239": "CEN-CAL",
  "CA240": "KERN COUNTY",
  "CA248": "BAY AREA",
  "CA249": "SOUTHERN CALI",
  "CA250": "SOUTHERN CALI",
  "CA269": "SOUTHERN CALI",
  "CA270": "SOUTHERN CALI",
  "CA272": "SOUTHERN CALI",
};

function safeLower(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

function getOfficeCodeFromEmail(emailRaw) {
  const email = safeLower(emailRaw);
  // matches: fiestaca183@fiestainsurance.com
  const m = email.match(/fiestaca(\d{3})/);
  if (!m) return null;
  return `CA${m[1]}`;
}

const SupervisorSidebar = ({ onLogout }) => {
  const { user, profile } = useAuth();

  const { region, regionLogo } = useMemo(() => {
    const email =
      safeLower(user?.email) ||
      safeLower(profile?.email) ||
      safeLower(localStorage.getItem("userEmail"));

    // 1) If profile already has region, use it
    let resolvedRegion = profile?.region || null;

    // 2) Otherwise infer from login email (fiestaca### pattern)
    if (!resolvedRegion && email) {
      const officeCode = getOfficeCodeFromEmail(email);
      if (officeCode && OFFICE_CODE_TO_REGION[officeCode]) {
        resolvedRegion = OFFICE_CODE_TO_REGION[officeCode];
      }
    }

    // 3) If still missing, no logo
    const logo = resolvedRegion ? REGION_LOGOS[resolvedRegion] : null;

    return { region: resolvedRegion, regionLogo: logo };
  }, [user?.email, profile?.email, profile?.region]);

  return (
    <div className={styles.sidebar}>
      <img
        src="/fiesta-logo.png"
        alt="Fiesta Insurance Logo"
        className={styles.logo}
      />

      <h3>Supervisor Panel</h3>

      <nav className={styles.nav}>
        <NavLink
          to="/supervisor/office-numbers"
          className={({ isActive }) =>
            isActive ? styles.activeLink : styles.navLink
          }
        >
          Office Numbers
        </NavLink>

        <NavLink
          to="/supervisor/tickets"
          className={({ isActive }) =>
            isActive ? styles.activeLink : styles.navLink
          }
        >
          Manage Tickets
        </NavLink>

        <NavLink
          to="/supervisor/tax-wip"
          className={({ isActive }) =>
            isActive ? styles.activeLink : styles.navLink
          }
        >
          Tax WIP
        </NavLink>
      </nav>

      {/* ✅ Region Logo Section (above Logout) */}
      {regionLogo && (
        <div className={styles.regionLogoSection} title={region || ""}>
          <img
            src={regionLogo}
            alt={`${region} Logo`}
            className={styles.regionLogo}
          />
        </div>
      )}

      <div className={styles.logoutSection}>
        <button onClick={onLogout} className={styles.logoutButton}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default SupervisorSidebar;


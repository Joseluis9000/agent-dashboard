// src/pages/admin/MarketingOps.jsx

import React, { useMemo, useState } from 'react';
import styles from './MarketingOps.module.css';

import MarketingDashboard from './marketing/MarketingDashboard';
import MarketingLocations from './marketing/MarketingLocations';
import MarketingActivities from './marketing/MarketingActivities';
import MarketingInventory from './marketing/MarketingInventory';
import MarketingCampaigns from './marketing/MarketingCampaigns';
import MarketingAnalytics from './marketing/MarketingAnalytics';
import MarketingAssets from './marketing/MarketingAssets';
import MarketingSettings from './marketing/MarketingSettings';

const WORKSPACE_SECTIONS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: '📊',
    description: 'Marketing overview, KPIs, renewals, and recent work.',
    component: MarketingDashboard,
  },
  {
    key: 'locations',
    label: 'Locations',
    icon: '📍',
    description: 'Billboards, events, sponsorships, offices, photos, and coverage.',
    component: MarketingLocations,
  },
  {
    key: 'activities',
    label: 'Activities',
    icon: '🏃',
    description: 'Mailers, flyers, business cards, gorilla marketing, and proof photos.',
    component: MarketingActivities,
  },
{
  key: 'inventory',
  label: 'Inventory',
  icon: '📦',
  description:
    'Marketing stock, warehouse inventory, office assignments, transfers, and item history.',
  component: MarketingInventory,
},
  {
    key: 'campaigns',
    label: 'Campaigns',
    icon: '🎯',
    description: 'Campaign planning, budgets, goals, timelines, and rollups.',
    component: MarketingCampaigns,
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: '📈',
    description: 'Spend, reach, coverage, impressions, and ROI intelligence.',
    component: MarketingAnalytics,
  },
  {
    key: 'assets',
    label: 'Assets',
    icon: '🖼️',
    description: 'Artwork, photos, mailers, flyers, proofs, and brand files.',
    component: MarketingAssets,
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: '⚙️',
    description: 'Vendors, offices, activity types, defaults, and admin configuration.',
    component: MarketingSettings,
  },
];

const MarketingOps = () => {
  const [activeSection, setActiveSection] = useState('dashboard');

  const activeWorkspace = useMemo(() => {
    return WORKSPACE_SECTIONS.find((section) => section.key === activeSection) || WORKSPACE_SECTIONS[0];
  }, [activeSection]);

  const ActiveComponent = activeWorkspace.component;

  return (
    <main className={styles.mainContent}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px minmax(0, 1fr)',
          gap: 18,
          alignItems: 'start',
        }}
      >
        <aside
          style={{
            position: 'sticky',
            top: 16,
            border: '1px solid #e2e8f0',
            borderRadius: 18,
            background: '#ffffff',
            boxShadow: '0 18px 45px rgba(15,23,42,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: 18,
              borderBottom: '1px solid #e2e8f0',
              background: 'linear-gradient(180deg,#f8fafc,#ffffff)',
            }}
          >
            <h1 style={{ margin: 0, color: '#0f172a', fontSize: 22 }}>
              MarketingOps
            </h1>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 750, fontSize: 13 }}>
              Locations, activities, assets, and campaign intelligence.
            </p>
          </div>

          <nav style={{ display: 'grid', gap: 6, padding: 10 }}>
            {WORKSPACE_SECTIONS.map((section) => {
              const isActive = activeSection === section.key;

              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSection(section.key)}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: '34px minmax(0, 1fr)',
                    gap: 10,
                    alignItems: 'center',
                    textAlign: 'left',
                    border: isActive ? '1px solid #0ea5e9' : '1px solid transparent',
                    background: isActive ? '#eff6ff' : 'transparent',
                    color: isActive ? '#0369a1' : '#334155',
                    borderRadius: 14,
                    padding: 10,
                    cursor: 'pointer',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      display: 'grid',
                      placeItems: 'center',
                      background: isActive ? '#ffffff' : '#f8fafc',
                      border: '1px solid #e2e8f0',
                      fontSize: 16,
                    }}
                  >
                    {section.icon}
                  </span>

                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 13 }}>
                      {section.label}
                    </strong>
                    <small
                      style={{
                        display: 'block',
                        color: isActive ? '#0369a1' : '#64748b',
                        fontWeight: 750,
                        fontSize: 11,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {section.description}
                    </small>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section style={{ minWidth: 0 }}>
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 18,
              background: '#ffffff',
              boxShadow: '0 18px 45px rgba(15,23,42,0.08)',
              padding: 18,
              marginBottom: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, color: '#0f172a' }}>
                  {activeWorkspace.icon} {activeWorkspace.label}
                </h2>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 750 }}>
                  {activeWorkspace.description}
                </p>
              </div>
            </div>
          </div>

          <ActiveComponent onNavigate={setActiveSection} />
        </section>
      </div>
    </main>
  );
};

export default MarketingOps;

// src/pages/admin/marketing/components/MarketingDashboardPanel.jsx

import React, { useEffect, useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import { getMarketingDashboardData } from '../services/dashboardService';
import { formatCampaignBudget, formatCampaignDate, getCampaignStatusMeta } from '../utils/campaignHelpers';
import {
  formatActivityCost,
  formatActivityDate,
  formatActivityType,
  formatQuantity,
  getActivityTypeMeta,
} from '../utils/activityHelpers';

const MarketingDashboardPanel = ({ onNavigate }) => {
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setIsLoading(true);
    setError('');

    try {
      const nextData = await getMarketingDashboardData();
      setDashboardData(nextData);
    } catch (dashboardError) {
      console.error('Error loading marketing dashboard:', dashboardError);
      setError(dashboardError?.message || 'Could not load marketing dashboard.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const activityBreakdown = useMemo(() => {
    if (!dashboardData?.activityByType) return [];

    return Object.entries(dashboardData.activityByType)
      .map(([type, data]) => ({
        type,
        meta: getActivityTypeMeta(type),
        ...data,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [dashboardData]);

  if (isLoading) {
    return (
      <section className={styles.card}>
        <div className={styles.emptyState}>Loading Marketing Dashboard...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.card}>
        <div className={styles.errorBanner}>{error}</div>
      </section>
    );
  }

  if (!dashboardData) {
    return (
      <section className={styles.card}>
        <div className={styles.emptyState}>No dashboard data available.</div>
      </section>
    );
  }

  const { summary } = dashboardData;

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <div className={styles.card} style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0 }}>Marketing Command Center</h2>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 750 }}>
              Live overview of campaigns, locations, field activities, photos, spend, reach, and renewals.
            </p>
          </div>

          <button type="button" className={styles.secondaryBtn} onClick={loadDashboard}>
            Refresh
          </button>
        </div>

        <div className={styles.kpiGrid}>
          <DashboardKpi label="Active Campaigns" value={summary.activeCampaignCount} helper={`${summary.campaignCount} total campaigns`} />
          <DashboardKpi label="Locations" value={summary.locationCount} helper={`${summary.activeLocationCount} active / renewal`} />
          <DashboardKpi label="Field Activities" value={summary.activityCount} helper="Mailers, flyers, cards, events" />
          <DashboardKpi label="Photos" value={summary.photoCount} helper="Proof and location photos" />
        </div>

        <div className={styles.kpiGrid}>
          <DashboardKpi label="Known Spend" value={formatCampaignBudget(summary.totalKnownSpend)} helper="Monthly location cost + activities" />
          <DashboardKpi label="Activity Spend" value={formatActivityCost(summary.activitySpend)} helper="Logged field activity cost" />
          <DashboardKpi label="Estimated Reach" value={formatQuantity(summary.estimatedReach)} helper="From field activities" />
          <DashboardKpi label="Daily Impressions" value={formatQuantity(summary.dailyImpressions)} helper="From linked marketing locations" />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.65fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <DashboardSection
            title="Top Campaigns"
            actionLabel="Open Campaigns"
            onAction={() => onNavigate?.('campaigns')}
          >
            {dashboardData.topCampaigns.length === 0 ? (
              <EmptySmall text="No campaign activity yet." />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {dashboardData.topCampaigns.map((campaign) => (
                  <CampaignSummaryCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
            )}
          </DashboardSection>

          <DashboardSection
            title="Activity Breakdown"
            actionLabel="Open Activities"
            onAction={() => onNavigate?.('activities')}
          >
            {activityBreakdown.length === 0 ? (
              <EmptySmall text="No field activities logged yet." />
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {activityBreakdown.map((item) => (
                  <ActivityBreakdownRow key={item.type} item={item} />
                ))}
              </div>
            )}
          </DashboardSection>

          <DashboardSection
            title="Recent Field Activity"
            actionLabel="Open Activities"
            onAction={() => onNavigate?.('activities')}
          >
            {dashboardData.recentActivities.length === 0 ? (
              <EmptySmall text="No recent field activity." />
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {dashboardData.recentActivities.map((activity) => (
                  <RecentActivityRow key={activity.id} activity={activity} />
                ))}
              </div>
            )}
          </DashboardSection>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <DashboardSection
            title="Upcoming Renewals"
            actionLabel="Open Locations"
            onAction={() => onNavigate?.('locations')}
          >
            {dashboardData.upcomingRenewals.length === 0 ? (
              <EmptySmall text="No renewals due in the next 120 days." />
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {dashboardData.upcomingRenewals.map((location) => (
                  <RenewalRow key={location.id} location={location} />
                ))}
              </div>
            )}
          </DashboardSection>

          <DashboardSection
            title="Recent Photos"
            actionLabel="Open Assets"
            onAction={() => onNavigate?.('assets')}
          >
            {dashboardData.recentPhotos.length === 0 ? (
              <EmptySmall text="No recent photos uploaded." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {dashboardData.recentPhotos.slice(0, 9).map((photo) => (
                  <a
                    key={`${photo.source}-${photo.id}`}
                    href={photo.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'block',
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      overflow: 'hidden',
                      background: '#f8fafc',
                      aspectRatio: '1 / 1',
                    }}
                  >
                    <img
                      src={photo.photoUrl}
                      alt={photo.title || 'Marketing proof'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </a>
                ))}
              </div>
            )}
          </DashboardSection>
        </div>
      </div>
    </section>
  );
};

const DashboardKpi = ({ label, value, helper }) => (
  <div className={styles.kpiCard}>
    <span className={styles.kpiLabel}>{label}</span>
    <strong>{value}</strong>
    <small>{helper}</small>
  </div>
);

const DashboardSection = ({ title, children, actionLabel, onAction }) => (
  <section className={styles.card} style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>{title}</h3>
      {actionLabel && (
        <button type="button" className={styles.secondaryBtn} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
    {children}
  </section>
);

const EmptySmall = ({ text }) => (
  <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: 12, background: '#f8fafc', color: '#64748b', fontWeight: 850, fontSize: 12 }}>
    {text}
  </div>
);

const CampaignSummaryCard = ({ campaign }) => {
  const status = getCampaignStatusMeta(campaign.status);
  const budget = Number(campaign.budget || 0);
  const spendPercent = budget > 0 ? Math.min(100, Math.round((Number(campaign.spend || 0) / budget) * 100)) : null;

  return (
    <article
      style={{
        border: `1px solid ${status.border}`,
        borderRadius: 14,
        padding: 12,
        background: `linear-gradient(180deg,#ffffff,${status.background})`,
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <strong style={{ color: '#0f172a' }}>{campaign.name}</strong>
        <span style={{ color: status.color, fontWeight: 950, fontSize: 11 }}>{status.label}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        <MiniStat label="Loc." value={campaign.locationCount} />
        <MiniStat label="Act." value={campaign.activityCount} />
        <MiniStat label="Photos" value={campaign.photoCount} />
        <MiniStat label="Spend" value={formatCampaignBudget(campaign.spend)} />
      </div>

      {spendPercent !== null && (
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ height: 7, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${spendPercent}%`, height: '100%', background: campaign.primaryColor || '#0ea5e9' }} />
          </div>
          <small style={{ color: '#64748b', fontWeight: 800 }}>{spendPercent}% of budget used</small>
        </div>
      )}
    </article>
  );
};

const ActivityBreakdownRow = ({ item }) => (
  <div
    style={{
      border: `1px solid ${item.meta.border}`,
      borderRadius: 12,
      padding: 10,
      background: item.meta.background,
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      gap: 8,
      alignItems: 'center',
    }}
  >
    <span style={{ color: item.meta.color, fontWeight: 950, fontSize: 12 }}>
      {item.meta.icon} {item.meta.label}
    </span>
    <span style={{ color: '#0f172a', fontWeight: 900, fontSize: 12 }}>
      {item.count} • {formatQuantity(item.quantity)} • {formatActivityCost(item.cost)}
    </span>
  </div>
);

const RecentActivityRow = ({ activity }) => {
  const meta = getActivityTypeMeta(activity.activityType);

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 10,
        background: '#ffffff',
        display: 'grid',
        gap: 4,
      }}
    >
      <strong style={{ color: '#0f172a', fontSize: 12 }}>
        {meta.icon} {activity.campaignName || formatActivityType(activity.activityType)}
      </strong>
      <span style={{ color: '#64748b', fontWeight: 800, fontSize: 11 }}>
        {formatActivityDate(activity.activityDate)} • {activity.office || 'No office'} • Qty {formatQuantity(activity.quantity)}
      </span>
    </div>
  );
};

const RenewalRow = ({ location }) => (
  <div
    style={{
      border: location.daysRemaining <= 30 ? '1px solid #fecaca' : '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 10,
      background: location.daysRemaining <= 30 ? '#fef2f2' : '#ffffff',
      display: 'grid',
      gap: 4,
    }}
  >
    <strong style={{ color: '#0f172a', fontSize: 12 }}>
      📍 {location.name || location.office || 'Marketing Location'}
    </strong>
    <span style={{ color: '#64748b', fontWeight: 800, fontSize: 11 }}>
      {formatCampaignDate(location.renewalDate)} • {location.daysRemaining} day(s) remaining
    </span>
  </div>
);

const MiniStat = ({ label, value }) => (
  <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 7, background: '#ffffff' }}>
    <span style={{ display: 'block', color: '#64748b', fontSize: 9, fontWeight: 950, textTransform: 'uppercase' }}>{label}</span>
    <strong style={{ display: 'block', color: '#0f172a', fontSize: 11, marginTop: 2, overflowWrap: 'anywhere' }}>{value}</strong>
  </div>
);

export default MarketingDashboardPanel;

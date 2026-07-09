// src/pages/admin/marketing/components/CampaignRollupPanel.jsx

import React, { useEffect, useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import { getCampaignRollup } from '../services/campaignService';
import { formatCampaignBudget } from '../utils/campaignHelpers';
import {
  formatActivityCost,
  formatActivityType,
  formatQuantity,
  getActivityTypeMeta,
} from '../utils/activityHelpers';

const CampaignRollupPanel = ({ campaign }) => {
  const [rollup, setRollup] = useState({
    locations: [],
    activities: [],
    locationPhotos: [],
    activityPhotos: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadRollup = async () => {
      if (!campaign?.id) return;

      setIsLoading(true);
      setError('');

      try {
        const nextRollup = await getCampaignRollup(campaign.id);
        if (isMounted) setRollup(nextRollup);
      } catch (rollupError) {
        console.error('Error loading campaign rollup:', rollupError);
        if (isMounted) setError(rollupError?.message || 'Could not load campaign rollup.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadRollup();

    return () => {
      isMounted = false;
    };
  }, [campaign?.id]);

  const summary = useMemo(() => {
    const activitySpend = rollup.activities.reduce((sum, activity) => sum + Number(activity.cost || 0), 0);
    const activityReach = rollup.activities.reduce((sum, activity) => sum + Number(activity.estimated_reach || 0), 0);
    const monthlyLocationSpend = rollup.locations.reduce((sum, location) => sum + Number(location.monthly_cost || 0), 0);
    const dailyImpressions = rollup.locations.reduce((sum, location) => {
      return sum + Number(location.daily_impressions || location.estimated_impressions || 0);
    }, 0);

    const photosCount = rollup.locationPhotos.length + rollup.activityPhotos.length;
    const budget = Number(campaign?.budget || 0);
    const totalKnownSpend = activitySpend + monthlyLocationSpend;
    const remainingBudget = budget - totalKnownSpend;
    const spendPercent = budget > 0 ? Math.min(100, Math.round((totalKnownSpend / budget) * 100)) : null;

    const activitiesByType = rollup.activities.reduce((acc, activity) => {
      const key = activity.activity_type || 'other';
      if (!acc[key]) {
        acc[key] = {
          count: 0,
          quantity: 0,
          cost: 0,
        };
      }

      acc[key].count += 1;
      acc[key].quantity += Number(activity.quantity || 0);
      acc[key].cost += Number(activity.cost || 0);

      return acc;
    }, {});

    return {
      activitySpend,
      activityReach,
      monthlyLocationSpend,
      dailyImpressions,
      photosCount,
      totalKnownSpend,
      remainingBudget,
      spendPercent,
      activitiesByType,
    };
  }, [campaign?.budget, rollup]);

  if (!campaign) return null;

  if (isLoading) {
    return <div className={styles.emptyState}>Loading campaign rollup...</div>;
  }

  if (error) {
    return <div className={styles.errorBanner}>{error}</div>;
  }

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div className={styles.kpiGrid}>
        <RollupKpi label="Locations" value={rollup.locations.length} helper="Linked marketing locations" />
        <RollupKpi label="Activities" value={rollup.activities.length} helper="Linked field activities" />
        <RollupKpi label="Photos" value={summary.photosCount} helper="Linked proof/location photos" />
        <RollupKpi label="Known Spend" value={formatCampaignBudget(summary.totalKnownSpend)} helper="Activities + monthly location costs" />
      </div>

      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 14,
          padding: 12,
          background: '#ffffff',
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <strong style={{ color: '#0f172a' }}>Budget Snapshot</strong>
          <span style={{ color: '#64748b', fontWeight: 850, fontSize: 12 }}>
            Budget: {formatCampaignBudget(campaign.budget)}
          </span>
        </div>

        {summary.spendPercent !== null ? (
          <>
            <div style={{ height: 10, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${summary.spendPercent}%`,
                  background: campaign.primaryColor || '#0ea5e9',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontWeight: 800, fontSize: 12 }}>
              <span>{summary.spendPercent}% used</span>
              <span>
                {summary.remainingBudget >= 0 ? 'Remaining' : 'Over'}: {formatCampaignBudget(Math.abs(summary.remainingBudget))}
              </span>
            </div>
          </>
        ) : (
          <span style={{ color: '#64748b', fontWeight: 800, fontSize: 12 }}>
            Add a campaign budget to track usage.
          </span>
        )}
      </div>

      <div className={styles.detailGrid}>
        <div>
          <span>Activity Spend</span>
          <strong>{formatActivityCost(summary.activitySpend)}</strong>
        </div>

        <div>
          <span>Monthly Location Cost</span>
          <strong>{formatCampaignBudget(summary.monthlyLocationSpend)}</strong>
        </div>

        <div>
          <span>Estimated Reach</span>
          <strong>{formatQuantity(summary.activityReach)}</strong>
        </div>

        <div>
          <span>Daily Impressions</span>
          <strong>{formatQuantity(summary.dailyImpressions)}</strong>
        </div>
      </div>

      <RollupSection
        title="Linked Locations"
        emptyText="No marketing locations linked to this campaign yet."
        rows={rollup.locations}
        renderRow={(location) => (
          <CompactRow
            key={location.id}
            title={location.name || location.office || 'Marketing Location'}
            subtitle={[location.type, location.city, location.office].filter(Boolean).join(' • ')}
            value={location.monthly_cost ? formatCampaignBudget(location.monthly_cost) : ''}
          />
        )}
      />

      <RollupSection
        title="Linked Activities"
        emptyText="No field activities linked to this campaign yet."
        rows={rollup.activities}
        renderRow={(activity) => {
          const typeMeta = getActivityTypeMeta(activity.activity_type);
          return (
            <CompactRow
              key={activity.id}
              title={`${typeMeta.icon} ${activity.campaign_name || formatActivityType(activity.activity_type)}`}
              subtitle={[activity.office, activity.city, activity.activity_date].filter(Boolean).join(' • ')}
              value={activity.quantity ? formatQuantity(activity.quantity) : ''}
            />
          );
        }}
      />

      {Object.keys(summary.activitiesByType).length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <strong style={{ color: '#0f172a' }}>Activity Breakdown</strong>

          <div style={{ display: 'grid', gap: 8 }}>
            {Object.entries(summary.activitiesByType).map(([type, data]) => {
              const meta = getActivityTypeMeta(type);
              return (
                <div
                  key={type}
                  style={{
                    border: `1px solid ${meta.border}`,
                    borderRadius: 12,
                    background: meta.background,
                    padding: 10,
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) auto',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ color: meta.color, fontWeight: 950, fontSize: 12 }}>
                    {meta.icon} {meta.label}
                  </span>
                  <span style={{ color: '#0f172a', fontWeight: 900, fontSize: 12 }}>
                    {data.count} • {formatQuantity(data.quantity)} • {formatActivityCost(data.cost)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

const RollupKpi = ({ label, value, helper }) => (
  <div className={styles.kpiCard}>
    <span className={styles.kpiLabel}>{label}</span>
    <strong>{value}</strong>
    <small>{helper}</small>
  </div>
);

const RollupSection = ({ title, rows, renderRow, emptyText }) => (
  <div style={{ display: 'grid', gap: 8 }}>
    <strong style={{ color: '#0f172a' }}>{title}</strong>

    {rows.length === 0 ? (
      <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, background: '#f8fafc', padding: 12, color: '#64748b', fontWeight: 850, fontSize: 12 }}>
        {emptyText}
      </div>
    ) : (
      <div style={{ display: 'grid', gap: 7 }}>
        {rows.slice(0, 6).map(renderRow)}
        {rows.length > 6 && (
          <span style={{ color: '#64748b', fontWeight: 850, fontSize: 12 }}>
            +{rows.length - 6} more
          </span>
        )}
      </div>
    )}
  </div>
);

const CompactRow = ({ title, subtitle, value }) => (
  <div
    style={{
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 9,
      background: '#ffffff',
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) auto',
      gap: 8,
      alignItems: 'center',
    }}
  >
    <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
      <strong style={{ color: '#0f172a', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </strong>
      <small style={{ color: '#64748b', fontWeight: 800, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {subtitle || '—'}
      </small>
    </span>

    {value && <strong style={{ color: '#0369a1', fontSize: 12 }}>{value}</strong>}
  </div>
);

export default CampaignRollupPanel;

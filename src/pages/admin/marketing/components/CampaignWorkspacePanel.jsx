// src/pages/admin/marketing/components/CampaignWorkspacePanel.jsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import { getCampaignWorkspaceData } from '../services/campaignWorkspaceService';
import { formatCampaignBudget, formatCampaignDate, getCampaignStatusMeta } from '../utils/campaignHelpers';
import { formatActivityCost, formatActivityDate, formatActivityType, formatQuantity, getActivityTypeMeta } from '../utils/activityHelpers';
import CampaignTimelinePanel from './CampaignTimelinePanel';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'activities', label: 'Activities' },
  { key: 'locations', label: 'Offices & Locations' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'mailers', label: 'Mailers' },
  { key: 'photos', label: 'Photos' },
  { key: 'history', label: 'History' },
  { key: 'calls', label: 'Calls' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'settings', label: 'Settings' },
];

const CampaignWorkspacePanel = ({ campaignId, onBack, onEditCampaign, onNavigate }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [workspaceData, setWorkspaceData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadWorkspace = useCallback(async () => {
  if (!campaignId) return;

  setIsLoading(true);
  setError('');

  try {
    setWorkspaceData(await getCampaignWorkspaceData(campaignId));
  } catch (loadError) {
    console.error('Error loading campaign workspace:', loadError);
    setError(loadError?.message || 'Could not load campaign workspace.');
  } finally {
    setIsLoading(false);
  }
}, [campaignId]);

useEffect(() => {
  loadWorkspace();
}, [loadWorkspace]);

  const typeBreakdown = useMemo(() => {
    if (!workspaceData?.activitiesByType) return [];
    return Object.entries(workspaceData.activitiesByType)
      .map(([type, data]) => ({ type, meta: getActivityTypeMeta(type), ...data }))
      .sort((a, b) => b.count - a.count);
  }, [workspaceData]);

  if (isLoading) {
    return <section className={styles.card}><div className={styles.emptyState}>Loading campaign workspace...</div></section>;
  }

  if (error) {
    return (
      <section className={styles.card}>
        <div className={styles.errorBanner}>{error}</div>
        <button type="button" className={styles.secondaryBtn} onClick={onBack}>Back to Campaigns</button>
      </section>
    );
  }

  if (!workspaceData?.campaign) {
    return (
      <section className={styles.card}>
        <div className={styles.emptyState}>Campaign not found.</div>
        <button type="button" className={styles.secondaryBtn} onClick={onBack}>Back to Campaigns</button>
      </section>
    );
  }

  const { campaign, summary } = workspaceData;
  const status = getCampaignStatusMeta(campaign.status);

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <div className={styles.card} style={{ padding: 0, overflow: 'hidden', borderColor: status.border }}>
        <div style={{ padding: 18, display: 'grid', gap: 14, background: `linear-gradient(135deg, #ffffff, ${status.background})` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <button type="button" className={styles.secondaryBtn} onClick={onBack} style={{ marginBottom: 10 }}>← Back to Campaigns</button>
              <h2 style={{ margin: 0, color: '#0f172a', letterSpacing: '-0.04em' }}>{campaign.name}</h2>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 780 }}>
                {campaign.description || 'Campaign workspace and performance summary.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span style={{ color: status.color, background: status.background, border: `1px solid ${status.border}`, borderRadius: 999, padding: '7px 10px', fontWeight: 950, fontSize: 12 }}>
                {status.label}
              </span>
              <button type="button" className={styles.secondaryBtn} onClick={loadWorkspace}>Refresh</button>
              {onEditCampaign && <button type="button" className={styles.primaryBtn} onClick={() => onEditCampaign(campaign)}>Edit Campaign</button>}
            </div>
          </div>

          <div className={styles.kpiGrid}>
            <WorkspaceKpi label="Budget" value={formatCampaignBudget(summary.budget)} helper={`${summary.budgetUsedPercent}% used`} />
            <WorkspaceKpi label="Known Spend" value={formatCampaignBudget(summary.knownSpend)} helper={`${formatCampaignBudget(summary.budgetRemaining)} remaining`} />
            <WorkspaceKpi label="Activities" value={summary.activityCount} helper="Linked field activities" />
            <WorkspaceKpi label="Offices" value={summary.officeCount} helper="Participating offices" />
          </div>

          <div className={styles.kpiGrid}>
            <WorkspaceKpi label="Locations" value={summary.locationCount} helper="Billboards, events, sponsorships" />
            <WorkspaceKpi label="Mailer Routes" value={summary.mailerRouteCount} helper={`${formatQuantity(summary.mailerPieces)} pieces`} />
            <WorkspaceKpi label="Photos" value={summary.photoCount} helper="Proof and location photos" />
            <WorkspaceKpi label="Estimated Reach" value={formatQuantity(summary.estimatedReach)} helper="From field activities" />
          </div>

          {summary.budget > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', fontWeight: 850, fontSize: 12 }}>
                <span>Campaign budget usage</span><span>{summary.budgetUsedPercent}%</span>
              </div>
              <div style={{ height: 10, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${summary.budgetUsedPercent}%`, background: campaign.primaryColor || '#0ea5e9' }} />
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0 14px', overflowX: 'auto', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
          {TABS.map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} style={{
              border: 0,
              borderBottom: activeTab === tab.key ? '3px solid #0ea5e9' : '3px solid transparent',
              background: 'transparent',
              color: activeTab === tab.key ? '#0284c7' : '#64748b',
              padding: '12px 8px 10px',
              fontWeight: 950,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: 12,
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && <OverviewTab data={workspaceData} typeBreakdown={typeBreakdown} onNavigate={onNavigate} />}
      {activeTab === 'activities' && <ActivitiesTab activities={workspaceData.activities} onNavigate={onNavigate} />}
      {activeTab === 'locations' && <LocationsTab locations={workspaceData.locations} offices={workspaceData.offices} onNavigate={onNavigate} />}
      {activeTab === 'inventory' && <InventoryTab data={workspaceData} onNavigate={onNavigate} />}
      {activeTab === 'mailers' && <MailersTab mailerRoutes={workspaceData.mailerRoutes} activities={workspaceData.activities} onNavigate={onNavigate} />}
      {activeTab === 'photos' && <PhotosTab photos={workspaceData.photos} />}
      {activeTab === 'history' && <CampaignTimelinePanel campaign={campaign} data={workspaceData} />}
      {activeTab === 'calls' && <ComingSoonTab title="Calls" text="Twilio call tracking will plug into this tab after Phase 7. This campaign will show calls, missed calls, average duration, cost per call, and tracking numbers." />}
      {activeTab === 'analytics' && <AnalyticsTab data={workspaceData} typeBreakdown={typeBreakdown} />}
      {activeTab === 'settings' && <SettingsTab campaign={campaign} onEditCampaign={onEditCampaign} />}
    </section>
  );
};

const WorkspaceKpi = ({ label, value, helper }) => (
  <div className={styles.kpiCard}><span className={styles.kpiLabel}>{label}</span><strong>{value}</strong><small>{helper}</small></div>
);

const SectionCard = ({ title, actionLabel, onAction, children }) => (
  <section className={styles.card} style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>{title}</h3>
      {actionLabel && <button type="button" className={styles.secondaryBtn} onClick={onAction}>{actionLabel}</button>}
    </div>
    {children}
  </section>
);

const OverviewTab = ({ data, typeBreakdown, onNavigate }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 0.75fr)', gap: 16 }}>
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionCard title="Activity Summary" actionLabel="Open Activities" onAction={() => onNavigate?.('activities')}>
        {typeBreakdown.length === 0 ? <SmallEmpty text="No activities linked to this campaign yet." /> : (
          <div style={{ display: 'grid', gap: 8 }}>{typeBreakdown.map((item) => <ActivityTypeRow key={item.type} item={item} />)}</div>
        )}
      </SectionCard>
      <SectionCard title="Recent Activities" actionLabel="Open Activities" onAction={() => onNavigate?.('activities')}>
        {data.activities.length === 0 ? <SmallEmpty text="No recent activities." /> : (
          <div style={{ display: 'grid', gap: 8 }}>{data.activities.slice(0, 8).map((activity) => <ActivityRow key={activity.id} activity={activity} />)}</div>
        )}
      </SectionCard>
    </div>

    <div style={{ display: 'grid', gap: 16 }}>
      <SectionCard title="Participating Offices">
        {data.offices.length === 0 ? <SmallEmpty text="No offices linked yet." /> : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.offices.map((office) => <span key={office} style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', borderRadius: 999, padding: '7px 10px', fontWeight: 950, fontSize: 12 }}>🏢 {office}</span>)}
          </div>
        )}
      </SectionCard>
      <SectionCard title="Inventory Snapshot" actionLabel="Open Inventory" onAction={() => onNavigate?.('inventory')}>
        {data.inventoryByItem.length === 0 ? (
          <SmallEmpty text="No inventory purchases or usage linked to this campaign yet." />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {data.inventoryByItem.slice(0, 5).map((item) => (
              <InventoryItemRow key={item.itemId} item={item} />
            ))}
          </div>
        )}
      </SectionCard>
      <SectionCard title="Recent Photos">
        {data.photos.length === 0 ? <SmallEmpty text="No campaign photos yet." /> : <PhotoGrid photos={data.photos.slice(0, 9)} />}
      </SectionCard>
    </div>
  </div>
);

const ActivitiesTab = ({ activities, onNavigate }) => (
  <SectionCard title="Campaign Activities" actionLabel="Open Activities" onAction={() => onNavigate?.('activities')}>
    {activities.length === 0 ? <SmallEmpty text="No activities linked to this campaign yet." /> : (
      <div style={{ display: 'grid', gap: 8 }}>{activities.map((activity) => <ActivityRow key={activity.id} activity={activity} />)}</div>
    )}
  </SectionCard>
);

const LocationsTab = ({ locations, offices, onNavigate }) => (
  <div style={{ display: 'grid', gap: 16 }}>
    <SectionCard title="Participating Offices">
      {!offices || offices.length === 0 ? (
        <SmallEmpty text="No participating offices are linked to this campaign yet." />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
            gap: 8,
          }}
        >
          {offices.map((office) => (
            <div
              key={office}
              style={{
                border: '1px solid #bfdbfe',
                borderRadius: 12,
                padding: 10,
                background: '#eff6ff',
                color: '#1d4ed8',
                fontWeight: 950,
              }}
            >
              🏢 {office}
            </div>
          ))}
        </div>
      )}
    </SectionCard>

    <SectionCard
      title="Marketing Locations"
      actionLabel="Open Locations"
      onAction={() => onNavigate?.('locations')}
    >
      {locations.length === 0 ? (
        <SmallEmpty text="No billboards, events, sponsorships, DMV video locations, or other marketing locations are linked to this campaign yet." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {locations.map((location) => (
            <div
              key={location.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: 12,
                background: '#ffffff',
                display: 'grid',
                gap: 4,
              }}
            >
              <strong style={{ color: '#0f172a' }}>
                📍 {location.name || location.office || 'Marketing Location'}
              </strong>
              <small style={{ color: '#64748b', fontWeight: 850 }}>
                {location.type || 'location'} • {location.office || 'No office'} •{' '}
                {location.city || 'No city'}
              </small>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  </div>
);

const InventoryTab = ({ data, onNavigate }) => (
  <div style={{ display: 'grid', gap: 16 }}>
    <SectionCard title="Inventory Financials" actionLabel="Open Inventory" onAction={() => onNavigate?.('inventory')}>
      <div className={styles.kpiGrid}>
        <WorkspaceKpi label="Purchased for Campaign" value={formatCampaignBudget(data.summary.campaignInventoryPurchaseCost)} helper={`${formatQuantity(data.summary.inventoryQuantityPurchased)} units purchased`} />
        <WorkspaceKpi label="Inventory Value Used" value={formatCampaignBudget(data.summary.allocatedInventoryUsedCost)} helper={`${formatQuantity(data.summary.inventoryQuantityUsed)} units consumed`} />
        <WorkspaceKpi label="Purchase Records" value={data.summary.inventoryPurchaseCount} helper="Dedicated inventory purchases" />
        <WorkspaceKpi label="Inventory Items" value={data.summary.inventoryItemCount} helper="Purchased or consumed items" />
      </div>
    </SectionCard>

    <SectionCard title="Inventory by Item">
      {data.inventoryByItem.length === 0 ? (
        <SmallEmpty text="No inventory is linked to this campaign yet." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.inventoryByItem.map((item) => <InventoryItemRow key={item.itemId} item={item} detailed />)}
        </div>
      )}
    </SectionCard>

    <SectionCard title="Purchases Made for This Campaign">
      {data.inventoryPurchases.length === 0 ? (
        <SmallEmpty text="No inventory purchases were marked as purchased specifically for this campaign." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.inventoryPurchases.map((purchase) => (
            <article key={purchase.batchId} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#fff', display: 'grid', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ color: '#0f172a' }}>📦 {purchase.itemName} {purchase.sku ? `· ${purchase.sku}` : ''}</strong>
                <strong style={{ color: '#0369a1' }}>{formatCampaignBudget(purchase.totalPurchaseCost)}</strong>
              </div>
              <small style={{ color: '#64748b', fontWeight: 850 }}>
                {purchase.purchaseDate || 'No date'} • Qty {formatQuantity(purchase.quantityPurchased)} • {purchase.destinationName || 'No destination'}{purchase.vendorName ? ` • ${purchase.vendorName}` : ''}
              </small>
            </article>
          ))}
        </div>
      )}
    </SectionCard>

    <SectionCard title="Inventory Consumed by Campaign Activities">
      {data.inventoryUsage.length === 0 ? (
        <SmallEmpty text="No inventory consumption has been attributed to this campaign yet." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.inventoryUsage.map((usage) => (
            <article key={usage.movementId} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#fff', display: 'grid', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ color: '#0f172a' }}>📤 {usage.itemName} {usage.sku ? `· ${usage.sku}` : ''}</strong>
                <strong style={{ color: '#7e22ce' }}>{formatCampaignBudget(usage.allocatedInventoryCost)}</strong>
              </div>
              <small style={{ color: '#64748b', fontWeight: 850 }}>
                Qty {formatQuantity(usage.quantityUsed)} • Avg {formatCampaignBudget(usage.weightedUnitCost)}/unit • From {usage.fromLocationName || 'Unknown'}
              </small>
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  </div>
);

const MailersTab = ({ mailerRoutes, activities, onNavigate }) => {
  const mailerActivities = activities.filter((activity) => {
    const type = String(activity.activityType || '').toLowerCase();
    return type === 'mailers' || type === 'mailer' || type === 'direct_mail';
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionCard title="Mailer Activities" actionLabel="Open Activities" onAction={() => onNavigate?.('activities')}>
        {mailerActivities.length === 0 ? <SmallEmpty text="No mailer activities linked to this campaign yet." /> : (
          <div style={{ display: 'grid', gap: 8 }}>{mailerActivities.map((activity) => <ActivityRow key={activity.id} activity={activity} />)}</div>
        )}
      </SectionCard>
      <SectionCard title="Selected EDDM Routes">
        {mailerRoutes.length === 0 ? <SmallEmpty text="No selected mailer routes yet." /> : (
          <div style={{ display: 'grid', gap: 8 }}>{mailerRoutes.map((route) => <MailerRouteRow key={route.id} route={route} />)}</div>
        )}
      </SectionCard>
    </div>
  );
};

const PhotosTab = ({ photos }) => (
  <SectionCard title="Campaign Photos">
    {photos.length === 0 ? <SmallEmpty text="No photos linked to this campaign yet." /> : <PhotoGrid photos={photos} />}
  </SectionCard>
);

const AnalyticsTab = ({ data, typeBreakdown }) => {
  const spendByActivity = typeBreakdown.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionCard title="Campaign Analytics Foundation">
        <div className={styles.kpiGrid}>
          <WorkspaceKpi label="Known Spend" value={formatCampaignBudget(data.summary.knownSpend)} helper="Activities + locations + dedicated inventory purchases" />
          <WorkspaceKpi label="Inventory Purchased" value={formatCampaignBudget(data.summary.campaignInventoryPurchaseCost)} helper="Purchased specifically for campaign" />
          <WorkspaceKpi label="Inventory Value Used" value={formatCampaignBudget(data.summary.allocatedInventoryUsedCost)} helper="Allocated value consumed" />
          <WorkspaceKpi label="Activity Spend" value={formatActivityCost(spendByActivity)} helper="Field activity cost" />
        </div>
      </SectionCard>
      <SectionCard title="Coming Next"><SmallEmpty text="Interactive charts, call attribution, USPS live data, and cost-per-call metrics will plug into this workspace." /></SectionCard>
    </div>
  );
};

const SettingsTab = ({ campaign, onEditCampaign }) => (
  <SectionCard title="Campaign Settings">
    <div className={styles.detailGrid}>
      <div><span>Status</span><strong>{campaign.status || '—'}</strong></div>
      <div><span>Budget</span><strong>{formatCampaignBudget(campaign.budget)}</strong></div>
      <div><span>Start Date</span><strong>{formatCampaignDate(campaign.startDate)}</strong></div>
      <div><span>End Date</span><strong>{formatCampaignDate(campaign.endDate)}</strong></div>
    </div>
    {onEditCampaign && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button type="button" className={styles.primaryBtn} onClick={() => onEditCampaign(campaign)}>Edit Campaign</button></div>}
  </SectionCard>
);

const ComingSoonTab = ({ title, text }) => <SectionCard title={title}><SmallEmpty text={text} /></SectionCard>;

const ActivityTypeRow = ({ item }) => (
  <div style={{ border: `1px solid ${item.meta.border}`, background: item.meta.background, borderRadius: 14, padding: 11, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
    <div>
      <strong style={{ color: item.meta.color, fontSize: 12 }}>{item.meta.icon} {item.meta.label}</strong>
      <small style={{ display: 'block', color: '#64748b', fontWeight: 850, marginTop: 3 }}>{item.count} item(s) • Qty {formatQuantity(item.quantity)}</small>
    </div>
    <strong style={{ color: '#0f172a', fontSize: 12 }}>{formatActivityCost(item.cost)}</strong>
  </div>
);

const ActivityRow = ({ activity }) => {
  const meta = getActivityTypeMeta(activity.activityType);
  return (
    <article style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#ffffff', display: 'grid', gap: 5 }}>
      <strong style={{ color: '#0f172a' }}>{meta.icon} {activity.campaignName || formatActivityType(activity.activityType)}</strong>
      <small style={{ color: '#64748b', fontWeight: 850 }}>{formatActivityDate(activity.activityDate)} • {activity.office || 'No office'} • Qty {formatQuantity(activity.quantity)} • {formatActivityCost(activity.cost)}</small>
      {activity.notes && <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 750, fontSize: 12 }}>{activity.notes}</p>}
    </article>
  );
};

const InventoryItemRow = ({ item, detailed = false }) => (
  <article style={{ border: '1px solid #dbeafe', borderRadius: 14, padding: 11, background: '#f8fbff', display: 'grid', gap: 7 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <strong style={{ color: '#0f172a' }}>📦 {item.itemName} {item.sku ? `· ${item.sku}` : ''}</strong>
      <strong style={{ color: '#0369a1' }}>{formatCampaignBudget(item.purchaseCost)}</strong>
    </div>
    <small style={{ color: '#64748b', fontWeight: 850 }}>
      Purchased {formatQuantity(item.purchasedQuantity)} • Used {formatQuantity(item.usedQuantity)} • Used value {formatCampaignBudget(item.allocatedUsedCost)}
    </small>
    {detailed && item.purchasedQuantity > 0 && (
      <div style={{ height: 7, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, Math.round((item.usedQuantity / item.purchasedQuantity) * 100))}%`, background: '#0ea5e9' }} />
      </div>
    )}
  </article>
);

const ROUTE_TYPE_LABELS = {
  C: 'City Route',
  R: 'Rural Route',
  H: 'Highway Contract Route',
  B: 'PO Box',
  G: 'General Delivery',
};

const MailerRouteRow = ({ route }) => (
  <article
    style={{
      border: '1px solid #e2e8f0',
      borderRadius: 14,
      padding: 12,
      background: '#ffffff',
      display: 'grid',
      gap: 10,
    }}
  >
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <strong style={{ color: '#0f172a' }}>
          📬 {route.zipCode || 'No ZIP'} • {route.routeId || 'No Route'}
        </strong>
        <small
          style={{
            display: 'block',
            color: '#64748b',
            fontWeight: 850,
            marginTop: 3,
          }}
        >
          {ROUTE_TYPE_LABELS[route.routeType] || route.routeType || 'Carrier Route'}
          {' • '}
          {route.office || 'No office'}
        </small>
      </div>

      {route.averageHouseholdIncome > 0 && (
        <strong style={{ color: '#166534' }}>
          Avg Income {formatCampaignBudget(route.averageHouseholdIncome)}
        </strong>
      )}
    </div>

    <div className={styles.detailGrid}>
      <div>
        <span>Route Type</span>
        <strong>
          {route.routeType || '—'}
          {route.routeType
            ? ` — ${ROUTE_TYPE_LABELS[route.routeType] || ''}`
            : ''}
        </strong>
      </div>

      <div>
        <span>Route Number</span>
        <strong>{route.routeNumber || '—'}</strong>
      </div>

      <div>
        <span>Mail Pieces</span>
        <strong>
          {formatQuantity(route.mailPieces || route.totalCount)}
        </strong>
      </div>

      <div>
        <span>Avg Household Income</span>
        <strong>
          {route.averageHouseholdIncome > 0
            ? formatCampaignBudget(route.averageHouseholdIncome)
            : '—'}
        </strong>
      </div>
    </div>

    {route.routeNotes && (
      <p
        style={{
          margin: 0,
          color: '#64748b',
          fontWeight: 750,
          fontSize: 12,
        }}
      >
        {route.routeNotes}
      </p>
    )}
  </article>
);

const PhotoGrid = ({ photos }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
    {photos.map((photo) => (
      <a key={`${photo.source}-${photo.id}`} href={photo.photoUrl} target="_blank" rel="noreferrer" style={{ display: 'block', aspectRatio: '1 / 1', borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <img src={photo.photoUrl} alt={photo.title || 'Campaign photo'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </a>
    ))}
  </div>
);

const SmallEmpty = ({ text }) => (
  <div style={{ border: '1px dashed #cbd5e1', borderRadius: 14, padding: 14, background: '#f8fafc', color: '#64748b', fontWeight: 850, fontSize: 12 }}>{text}</div>
);

export default CampaignWorkspacePanel;
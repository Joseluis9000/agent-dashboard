// src/pages/admin/marketing/components/CampaignWorkspacePanel.jsx

import React, { useEffect, useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import { getCampaignWorkspaceData } from '../services/campaignWorkspaceService';
import { formatCampaignBudget, formatCampaignDate, getCampaignStatusMeta } from '../utils/campaignHelpers';
import { formatActivityCost, formatActivityDate, formatActivityType, formatQuantity, getActivityTypeMeta } from '../utils/activityHelpers';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'activities', label: 'Activities' },
  { key: 'locations', label: 'Locations' },
  { key: 'mailers', label: 'Mailers' },
  { key: 'photos', label: 'Photos' },
  { key: 'calls', label: 'Calls' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'settings', label: 'Settings' },
];

const CampaignWorkspacePanel = ({ campaignId, onBack, onEditCampaign, onNavigate }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [workspaceData, setWorkspaceData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadWorkspace = async () => {
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
  };

  useEffect(() => {
    loadWorkspace();
  }, [campaignId]);

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
      {activeTab === 'locations' && <LocationsTab locations={workspaceData.locations} onNavigate={onNavigate} />}
      {activeTab === 'mailers' && <MailersTab mailerRoutes={workspaceData.mailerRoutes} activities={workspaceData.activities} onNavigate={onNavigate} />}
      {activeTab === 'photos' && <PhotosTab photos={workspaceData.photos} />}
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
      <SectionCard title="Activity Mix" actionLabel="Open Activities" onAction={() => onNavigate?.('activities')}>
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

const LocationsTab = ({ locations, onNavigate }) => (
  <SectionCard title="Campaign Locations" actionLabel="Open Locations" onAction={() => onNavigate?.('locations')}>
    {locations.length === 0 ? <SmallEmpty text="No locations linked to this campaign yet." /> : (
      <div style={{ display: 'grid', gap: 8 }}>
        {locations.map((location) => (
          <div key={location.id} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#ffffff', display: 'grid', gap: 4 }}>
            <strong style={{ color: '#0f172a' }}>📍 {location.name || location.office || 'Marketing Location'}</strong>
            <small style={{ color: '#64748b', fontWeight: 850 }}>{location.type || 'location'} • {location.office || 'No office'} • {location.city || 'No city'}</small>
          </div>
        ))}
      </div>
    )}
  </SectionCard>
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
          <WorkspaceKpi label="Known Spend" value={formatCampaignBudget(data.summary.knownSpend)} helper="Activities + locations" />
          <WorkspaceKpi label="Activity Spend" value={formatActivityCost(spendByActivity)} helper="Field activity cost" />
          <WorkspaceKpi label="Mailer Cost" value={formatCampaignBudget(data.summary.mailerCost)} helper="Selected EDDM routes" />
          <WorkspaceKpi label="Pieces" value={formatQuantity(data.summary.mailerPieces)} helper="Selected mailer route pieces" />
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

const MailerRouteRow = ({ route }) => (
  <article style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#ffffff' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <strong style={{ color: '#0f172a' }}>📬 {route.zipCode} • {route.routeId}</strong>
        <small style={{ display: 'block', color: '#64748b', fontWeight: 850, marginTop: 3 }}>{route.office || 'No office'} • {route.facilityName || 'No facility'}</small>
      </div>
      <strong style={{ color: '#0f172a' }}>{formatCampaignBudget(route.estimatedTotalCost)}</strong>
    </div>
    <div className={styles.detailGrid} style={{ marginTop: 10 }}>
      <div><span>Residential</span><strong>{formatQuantity(route.residentialCount)}</strong></div>
      <div><span>Business</span><strong>{formatQuantity(route.businessCount)}</strong></div>
      <div><span>Total Pieces</span><strong>{formatQuantity(route.totalCount)}</strong></div>
      <div><span>Postage</span><strong>{formatCampaignBudget(route.estimatedPostage)}</strong></div>
    </div>
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

// src/pages/admin/marketing/components/CampaignTimelinePanel.jsx

import React, { useEffect, useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import { getCampaignRollup } from '../services/campaignService';
import {
  formatActivityCost,
  formatActivityType,
  formatQuantity,
  getActivityTypeMeta,
} from '../utils/activityHelpers';
import { formatCampaignBudget } from '../utils/campaignHelpers';

const TYPE_META = {
  campaign: { icon: '🎯', color: '#0369a1', background: '#eff6ff', border: '#bfdbfe' },
  location: { icon: '📍', color: '#166534', background: '#ecfdf5', border: '#bbf7d0' },
  activity: { icon: '🏃', color: '#7e22ce', background: '#faf5ff', border: '#e9d5ff' },
  photo: { icon: '📸', color: '#92400e', background: '#fffbeb', border: '#fde68a' },
  renewal: { icon: '🔁', color: '#be123c', background: '#fff1f2', border: '#fecdd3' },
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'location', label: 'Locations' },
  { value: 'activity', label: 'Activities' },
  { value: 'photo', label: 'Photos' },
  { value: 'renewal', label: 'Renewals' },
];

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return 'No date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getMonthKey = (value) => {
  const date = toDate(value);
  if (!date) return 'No Date';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const getSortDate = (item) => {
  const date = toDate(item.date);
  return date ? date.getTime() : 0;
};

const photoTypeLabel = (type = '') =>
  String(type || 'photo').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const buildTimelineItems = ({ campaign, rollup }) => {
  const items = [];

  if (campaign?.startDate) {
    items.push({
      id: `campaign-start-${campaign.id}`,
      type: 'campaign',
      date: campaign.startDate,
      title: 'Campaign Started',
      subtitle: campaign.name,
      details: campaign.goal || campaign.description || '',
    });
  }

  if (campaign?.endDate) {
    items.push({
      id: `campaign-end-${campaign.id}`,
      type: 'campaign',
      date: campaign.endDate,
      title: 'Campaign Ends',
      subtitle: campaign.name,
      details: campaign.budget ? `Budget: ${formatCampaignBudget(campaign.budget)}` : '',
    });
  }

  (rollup.locations || []).forEach((location) => {
    if (location.created_at) {
      items.push({
        id: `location-created-${location.id}`,
        type: 'location',
        date: location.created_at,
        title: location.name || location.office || 'Marketing Location Added',
        subtitle: [location.type, location.office, location.city].filter(Boolean).join(' • '),
        details: [
          location.vendor ? `Vendor: ${location.vendor}` : '',
          location.monthly_cost ? `Monthly: ${formatCampaignBudget(location.monthly_cost)}` : '',
        ].filter(Boolean).join(' • '),
      });
    }

    if (location.contract_start) {
      items.push({
        id: `location-contract-start-${location.id}`,
        type: 'location',
        date: location.contract_start,
        title: 'Location Contract Started',
        subtitle: location.name || location.office || 'Marketing Location',
        details: location.vendor || '',
      });
    }

    if (location.contract_end) {
      items.push({
        id: `location-contract-end-${location.id}`,
        type: 'renewal',
        date: location.contract_end,
        title: 'Location Contract Ends',
        subtitle: location.name || location.office || 'Marketing Location',
        details: 'Review renewal or replacement plan.',
      });
    }

    if (location.renewal_date) {
      items.push({
        id: `location-renewal-${location.id}`,
        type: 'renewal',
        date: location.renewal_date,
        title: 'Renewal Date',
        subtitle: location.name || location.office || 'Marketing Location',
        details: location.vendor || '',
      });
    }
  });

  (rollup.activities || []).forEach((activity) => {
    const typeMeta = getActivityTypeMeta(activity.activity_type);

    items.push({
      id: `activity-${activity.id}`,
      type: 'activity',
      date: activity.activity_date || activity.created_at,
      title: activity.campaign_name || formatActivityType(activity.activity_type),
      subtitle: [typeMeta.label, activity.office, activity.city].filter(Boolean).join(' • '),
      details: [
        activity.quantity ? `Qty: ${formatQuantity(activity.quantity)}` : '',
        activity.cost ? `Cost: ${formatActivityCost(activity.cost)}` : '',
        activity.estimated_reach ? `Reach: ${formatQuantity(activity.estimated_reach)}` : '',
      ].filter(Boolean).join(' • '),
    });
  });

  (rollup.locationPhotos || []).forEach((photo) => {
    items.push({
      id: `location-photo-${photo.id}`,
      type: 'photo',
      date: photo.created_at,
      title: photo.title || photoTypeLabel(photo.photo_type),
      subtitle: `Location Photo • ${photoTypeLabel(photo.photo_type)}`,
      details: photo.description || '',
      image: photo.photo_url,
      href: photo.photo_url,
    });
  });

  (rollup.activityPhotos || []).forEach((photo) => {
    items.push({
      id: `activity-photo-${photo.id}`,
      type: 'photo',
      date: photo.created_at,
      title: photo.title || photoTypeLabel(photo.photo_type),
      subtitle: `Activity Photo • ${photoTypeLabel(photo.photo_type)}`,
      details: photo.description || '',
      image: photo.photo_url,
      href: photo.photo_url,
    });
  });

  return items.sort((a, b) => getSortDate(b) - getSortDate(a));
};

const CampaignTimelinePanel = ({ campaign }) => {
  const [rollup, setRollup] = useState({ locations: [], activities: [], locationPhotos: [], activityPhotos: [] });
  const [filter, setFilter] = useState('all');
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
      } catch (timelineError) {
        console.error('Error loading campaign timeline:', timelineError);
        if (isMounted) setError(timelineError?.message || 'Could not load campaign timeline.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadRollup();

    return () => {
      isMounted = false;
    };
  }, [campaign?.id]);

  const allItems = useMemo(() => buildTimelineItems({ campaign, rollup }), [campaign, rollup]);

  const timelineItems = useMemo(() => {
    if (filter === 'all') return allItems;
    return allItems.filter((item) => item.type === filter);
  }, [allItems, filter]);

  const groupedItems = useMemo(() => {
    return timelineItems.reduce((acc, item) => {
      const key = getMonthKey(item.date);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [timelineItems]);

  const counts = useMemo(() => {
    return allItems.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    }, { all: 0 });
  }, [allItems]);

  if (!campaign) return null;

  if (isLoading) {
    return <div className={styles.emptyState}>Loading campaign timeline...</div>;
  }

  if (error) {
    return <div className={styles.errorBanner}>{error}</div>;
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0 }}>Campaign Timeline</h3>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 800, fontSize: 12 }}>
          Chronological history of campaign dates, linked locations, activities, renewals, and photos.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 3 }}>
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            style={{
              border: filter === option.value ? '1px solid #0ea5e9' : '1px solid #e2e8f0',
              background: filter === option.value ? '#eff6ff' : '#ffffff',
              color: filter === option.value ? '#0369a1' : '#475569',
              borderRadius: 999,
              padding: '6px 9px',
              fontWeight: 900,
              fontSize: 11,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {option.label} ({counts[option.value] || 0})
          </button>
        ))}
      </div>

      {timelineItems.length === 0 ? (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: 14, background: '#f8fafc', padding: 16, color: '#64748b', fontWeight: 850, textAlign: 'center' }}>
          No campaign timeline activity yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {Object.entries(groupedItems).map(([month, items]) => (
            <div key={month} style={{ display: 'grid', gap: 8 }}>
              <div style={{ color: '#0f172a', fontWeight: 950, fontSize: 13, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                {month}
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                {items.map((item) => (
                  <TimelineCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const TimelineCard = ({ item }) => {
  const meta = TYPE_META[item.type] || TYPE_META.campaign;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: item.image ? '58px 1fr' : '1fr',
        gap: 10,
        border: `1px solid ${meta.border}`,
        borderRadius: 14,
        background: meta.background,
        padding: 10,
      }}
    >
      {item.image && (
        <a href={item.href || item.image} target="_blank" rel="noreferrer">
          <img
            src={item.image}
            alt={item.title}
            style={{
              width: 58,
              height: 58,
              objectFit: 'cover',
              borderRadius: 10,
              border: '1px solid rgba(15,23,42,0.12)',
              background: '#ffffff',
              display: 'block',
            }}
          />
        </a>
      )}

      <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ color: '#0f172a', fontSize: 13, minWidth: 0 }}>
            {meta.icon} {item.title}
          </strong>
          <span style={{ color: meta.color, fontWeight: 950, fontSize: 11, whiteSpace: 'nowrap' }}>
            {formatDate(item.date)}
          </span>
        </div>

        {item.subtitle && (
          <span style={{ color: meta.color, fontWeight: 900, fontSize: 11 }}>
            {item.subtitle}
          </span>
        )}

        {item.details && (
          <p style={{ margin: 0, color: '#475569', fontWeight: 750, fontSize: 12, lineHeight: 1.35 }}>
            {item.details}
          </p>
        )}
      </div>
    </div>
  );
};

export default CampaignTimelinePanel;

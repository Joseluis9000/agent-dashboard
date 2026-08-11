// src/pages/admin/marketing/components/CampaignTimelinePanel.jsx

import React, { useMemo, useState } from 'react';
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
  inventory_purchase: { icon: '📦', color: '#0f766e', background: '#f0fdfa', border: '#99f6e4' },
  inventory_usage: { icon: '📤', color: '#7c3aed', background: '#f5f3ff', border: '#ddd6fe' },
  photo: { icon: '📸', color: '#92400e', background: '#fffbeb', border: '#fde68a' },
  renewal: { icon: '🔁', color: '#be123c', background: '#fff1f2', border: '#fecdd3' },
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'activity', label: 'Activities' },
  { value: 'inventory_purchase', label: 'Inventory Purchases' },
  { value: 'inventory_usage', label: 'Inventory Used' },
  { value: 'location', label: 'Locations' },
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

const buildTimelineItems = ({ campaign, data }) => {
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

  (data.locations || []).forEach((location) => {
    const createdDate =
      location.createdAt ||
      location.created_at ||
      '';

    const contractStart =
      location.contractStart ||
      location.contract_start ||
      '';

    const contractEnd =
      location.contractEnd ||
      location.contract_end ||
      '';

    const renewalDate =
      location.renewalDate ||
      location.renewal_date ||
      '';

    const monthlyCost =
      location.monthlyCost ??
      location.monthly_cost ??
      0;

    const vendorName =
      location.vendorName ||
      location.vendor ||
      '';

    if (createdDate) {
      items.push({
        id: `location-created-${location.id}`,
        type: 'location',
        date: createdDate,
        title:
          location.name ||
          location.office ||
          'Marketing Location Added',
        subtitle: [
          location.type,
          location.office,
          location.city,
        ]
          .filter(Boolean)
          .join(' • '),
        details: [
          vendorName ? `Vendor: ${vendorName}` : '',
          Number(monthlyCost || 0) > 0
            ? `Monthly: ${formatCampaignBudget(monthlyCost)}`
            : '',
        ]
          .filter(Boolean)
          .join(' • '),
      });
    }

    if (contractStart) {
      items.push({
        id: `location-contract-start-${location.id}`,
        type: 'location',
        date: contractStart,
        title: 'Location Contract Started',
        subtitle:
          location.name ||
          location.office ||
          'Marketing Location',
        details: vendorName,
      });
    }

    if (contractEnd) {
      items.push({
        id: `location-contract-end-${location.id}`,
        type: 'renewal',
        date: contractEnd,
        title: 'Location Contract Ends',
        subtitle:
          location.name ||
          location.office ||
          'Marketing Location',
        details: 'Review renewal or replacement plan.',
      });
    }

    if (renewalDate) {
      items.push({
        id: `location-renewal-${location.id}`,
        type: 'renewal',
        date: renewalDate,
        title: 'Renewal Date',
        subtitle:
          location.name ||
          location.office ||
          'Marketing Location',
        details: vendorName,
      });
    }
  });

  (data.activities || []).forEach((activity) => {
    const activityType =
      activity.activityType ||
      activity.activity_type ||
      'other';

    const activityDate =
      activity.activityDate ||
      activity.activity_date ||
      activity.createdAt ||
      activity.created_at ||
      '';

    const campaignName =
      activity.campaignName ||
      activity.campaign_name ||
      '';

    const estimatedReach =
      activity.estimatedReach ??
      activity.estimated_reach ??
      0;

    const typeMeta = getActivityTypeMeta(activityType);

    items.push({
      id: `activity-${activity.id}`,
      type: 'activity',
      date: activityDate,
      title:
        campaignName ||
        formatActivityType(activityType),
      subtitle: [
        typeMeta.label,
        activity.office,
        activity.city,
      ]
        .filter(Boolean)
        .join(' • '),
      details: [
        Number(activity.quantity || 0) > 0
          ? `Qty: ${formatQuantity(activity.quantity)}`
          : '',
        Number(activity.cost || 0) > 0
          ? `Cost: ${formatActivityCost(activity.cost)}`
          : '',
        Number(estimatedReach || 0) > 0
          ? `Reach: ${formatQuantity(estimatedReach)}`
          : '',
      ]
        .filter(Boolean)
        .join(' • '),
    });
  });

  (data.inventoryPurchases || []).forEach((purchase) => {
    items.push({
      id: `inventory-purchase-${purchase.batchId}`,
      type: 'inventory_purchase',
      date: purchase.purchaseDate,
      title: purchase.itemName || 'Inventory Purchase',
      subtitle: [
        purchase.sku,
        purchase.destinationName,
        purchase.vendorName,
      ].filter(Boolean).join(' • '),
      details: [
        purchase.quantityPurchased ? `Purchased: ${formatQuantity(purchase.quantityPurchased)}` : '',
        purchase.totalPurchaseCost ? `Cost: ${formatCampaignBudget(purchase.totalPurchaseCost)}` : '',
        purchase.invoiceNumber ? `Invoice: ${purchase.invoiceNumber}` : '',
      ].filter(Boolean).join(' • '),
    });
  });

  (data.inventoryUsage || []).forEach((usage) => {
    items.push({
      id: `inventory-usage-${usage.movementId}`,
      type: 'inventory_usage',
      date: usage.movementDate,
      title: usage.itemName || 'Inventory Used',
      subtitle: [
        usage.sku,
        usage.fromLocationName ? `From ${usage.fromLocationName}` : '',
      ].filter(Boolean).join(' • '),
      details: [
        usage.quantityUsed ? `Used: ${formatQuantity(usage.quantityUsed)}` : '',
        usage.allocatedInventoryCost
          ? `Allocated value: ${formatCampaignBudget(usage.allocatedInventoryCost)}`
          : '',
        usage.distributionCost
          ? `Distribution: ${formatCampaignBudget(usage.distributionCost)}`
          : '',
      ].filter(Boolean).join(' • '),
    });
  });

  const normalizedPhotos = Array.isArray(data.photos)
    ? data.photos
    : [
        ...(data.locationPhotos || []).map((photo) => ({
          ...photo,
          source: photo.source || 'location',
        })),
        ...(data.activityPhotos || []).map((photo) => ({
          ...photo,
          source: photo.source || 'activity',
        })),
      ];

  normalizedPhotos.forEach((photo) => {
    const photoType =
      photo.photoType ||
      photo.photo_type ||
      'photo';

    const photoDate =
      photo.createdAt ||
      photo.created_at ||
      '';

    const photoUrl =
      photo.photoUrl ||
      photo.photo_url ||
      '';

    const sourceLabel =
      photo.source === 'activity'
        ? 'Activity Photo'
        : photo.source === 'location'
          ? 'Location Photo'
          : 'Campaign Photo';

    items.push({
      id: `${photo.source || 'photo'}-photo-${photo.id}`,
      type: 'photo',
      date: photoDate,
      title: photo.title || photoTypeLabel(photoType),
      subtitle: `${sourceLabel} • ${photoTypeLabel(photoType)}`,
      details: photo.description || '',
      image: photoUrl,
      href: photoUrl,
    });
  });

  return items.sort((a, b) => getSortDate(b) - getSortDate(a));
};

const CampaignTimelinePanel = ({ campaign, data }) => {
  const [filter, setFilter] = useState('all');

  const allItems = useMemo(() => buildTimelineItems({ campaign, data: data || {} }), [campaign, data]);

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

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0 }}>Campaign History</h3>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 800, fontSize: 12 }}>
          Complete chronological history of campaign activity, inventory purchases and usage, locations, renewals, and photos.
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
          No campaign history yet.
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
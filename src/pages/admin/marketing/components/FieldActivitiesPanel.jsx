// src/pages/admin/marketing/components/FieldActivitiesPanel.jsx

import React, { useEffect, useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import ActivityModal from './ActivityModal';
import FieldActivityMap from './FieldActivityMap';
import {
  ACTIVITY_STATUS,
  ACTIVITY_TYPES,
  createMarketingActivity,
  deleteMarketingActivity,
  getMarketingActivities,
  getMarketingActivitySummary,
  updateMarketingActivity,
  createEmptyMarketingActivityForm,
} from '../services/activityService';
import {
  ACTIVITY_TYPE_META,
  activityMatchesSearch,
  formatActivityCost,
  formatActivityDate,
  formatActivityType,
  formatQuantity,
  getActivityCampaignOptions,
  getActivityOfficeOptions,
  getActivityStatusMeta,
  validateMarketingActivity,
} from '../utils/activityHelpers';

const ACTIVITY_TYPE_OPTIONS = [
  { value: ACTIVITY_TYPES.MAILER, label: 'Mailer' },
  { value: ACTIVITY_TYPES.GORILLA_STREET_FLYERS, label: 'Gorilla Street Flyers' },
  { value: ACTIVITY_TYPES.CAR_TO_CAR_FLYERS, label: 'Car-to-Car Flyers' },
  { value: ACTIVITY_TYPES.BUSINESS_TO_BUSINESS_FLYERS, label: 'Business-to-Business Flyers' },
  { value: ACTIVITY_TYPES.BUSINESS_CARDS, label: 'Business Cards' },
  { value: ACTIVITY_TYPES.DOOR_HANGERS, label: 'Door Hangers' },
  { value: ACTIVITY_TYPES.EVENT, label: 'Event' },
  { value: ACTIVITY_TYPES.SPONSORSHIP_DROP_OFF, label: 'Sponsorship Drop-Off' },
  { value: ACTIVITY_TYPES.OTHER, label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: ACTIVITY_STATUS.PLANNED, label: 'Planned' },
  { value: ACTIVITY_STATUS.IN_PROGRESS, label: 'In Progress' },
  { value: ACTIVITY_STATUS.COMPLETED, label: 'Completed' },
  { value: ACTIVITY_STATUS.CANCELLED, label: 'Cancelled' },
];

const FieldActivitiesPanel = ({
  initialOffice = '',
  initialRegion = '',
  onActivitySaved,
}) => {
  const [activities, setActivities] = useState([]);
  const [search, setSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [activityViewMode, setActivityViewMode] = useState('list');
  const [selectedMapActivity, setSelectedMapActivity] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [formData, setFormData] = useState(() => ({
    ...createEmptyMarketingActivityForm(),
    office: initialOffice || '',
    region: initialRegion || '',
  }));

  const loadActivities = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const rows = await getMarketingActivities({ limit: 500 });
      setActivities(rows);
    } catch (error) {
      console.error('Error loading field activities:', error);
      setLoadError(error?.message || 'Could not load field activities.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, []);

  const officeOptions = useMemo(() => getActivityOfficeOptions(activities), [activities]);
  const campaignOptions = useMemo(() => getActivityCampaignOptions(activities), [activities]);

  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      const matchesSearch = activityMatchesSearch(activity, search);
      const matchesOffice = officeFilter === 'all' || activity.office === officeFilter;
      const matchesType = typeFilter === 'all' || activity.activityType === typeFilter;
      const matchesStatus = statusFilter === 'all' || activity.status === statusFilter;
      const matchesCampaign = campaignFilter === 'all' || activity.campaignName === campaignFilter;

      return matchesSearch && matchesOffice && matchesType && matchesStatus && matchesCampaign;
    });
  }, [activities, search, officeFilter, typeFilter, statusFilter, campaignFilter]);

  const summary = useMemo(() => getMarketingActivitySummary(filteredActivities), [filteredActivities]);

  const openCreateForm = () => {
    setEditingActivity(null);
    setFormData({
      ...createEmptyMarketingActivityForm(),
      office: initialOffice || '',
      region: initialRegion || '',
    });
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (activity) => {
    setEditingActivity(activity);
    setFormData({
      office: activity.office || '',
      region: activity.region || '',
      supervisorName: activity.supervisorName || '',
      supervisorUserId: activity.supervisorUserId || '',
      activityType: activity.activityType || ACTIVITY_TYPES.OTHER,
      campaignName: activity.campaignName || '',
      campaignId: activity.campaignId || '',
      campaignColor: activity.campaignColor || '',
      activityDate: activity.activityDate || '',
      completedDate: activity.completedDate || '',
      status: activity.status || ACTIVITY_STATUS.COMPLETED,
      priority: activity.priority || 'Normal',
      quantity: activity.quantity || '',
      purchasedQuantity: activity.purchasedQuantity || '',
      inventoryItemId: activity.inventoryItemId || '',
      inventoryLocationId: activity.inventoryLocationId || '',
      distributedQuantity: activity.distributedQuantity || activity.quantity || '',
      productionCost: activity.productionCost || '',
      productionNotes: activity.productionNotes || '',
      distributionCost: activity.distributionCost || '',
      distributionNotes: activity.distributionNotes || '',
      otherCost: activity.otherCost || '',
      otherCostNotes: activity.otherCostNotes || '',
      cost: activity.cost || '',
      estimatedReach: activity.estimatedReach || '',
      city: activity.city || '',
      zipCodes: (activity.zipCodes || []).join(', '),
      areaDescription: activity.areaDescription || '',
      latitude: activity.latitude ?? '',
      longitude: activity.longitude ?? '',
      weather: activity.weather || '',
      completedBy: activity.completedBy || '',
      tags: (activity.tags || []).join(', '),
      notes: activity.notes || '',
    });
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    setShowForm(false);
    setEditingActivity(null);
    setFormError('');
  };

  const updateForm = (field, value) => {
    setFormData((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === 'distributedQuantity' && next.activityType === ACTIVITY_TYPES.MAILER) {
        next.quantity = value;
      }

      if (field === 'activityType' && value === ACTIVITY_TYPES.MAILER) {
        next.distributedQuantity = next.distributedQuantity || next.quantity || '';
        next.quantity = next.distributedQuantity || '';
      }

      if (['productionCost', 'distributionCost', 'otherCost', 'inventoryItemId'].includes(field)) {
        const production = next.inventoryItemId ? 0 : Number(next.productionCost || 0);
        const distribution = Number(next.distributionCost || 0);
        const other = Number(next.otherCost || 0);

        next.cost = (
          (Number.isFinite(production) ? production : 0) +
          (Number.isFinite(distribution) ? distribution : 0) +
          (Number.isFinite(other) ? other : 0)
        ).toFixed(2);
      }

      return next;
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();

    const inventoryTypes = [
      ACTIVITY_TYPES.MAILER,
      ACTIVITY_TYPES.GORILLA_STREET_FLYERS,
      ACTIVITY_TYPES.CAR_TO_CAR_FLYERS,
      ACTIVITY_TYPES.BUSINESS_TO_BUSINESS_FLYERS,
      ACTIVITY_TYPES.BUSINESS_CARDS,
      ACTIVITY_TYPES.DOOR_HANGERS,
    ];

    if (inventoryTypes.includes(formData.activityType)) {
      if (!formData.inventoryItemId) {
        setFormError('Select the Inventory Item used for this activity.');
        return;
      }
      if (!formData.inventoryLocationId) {
        setFormError('Select the inventory location the items are coming from.');
        return;
      }
      const usedQuantity = Number(
        formData.activityType === ACTIVITY_TYPES.MAILER
          ? formData.distributedQuantity
          : formData.quantity
      );
      if (!Number.isFinite(usedQuantity) || usedQuantity <= 0) {
        setFormError('Enter the quantity used for this activity.');
        return;
      }
    }

    const errors = validateMarketingActivity(formData);
    if (errors.length > 0) {
      setFormError(errors[0]);
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      let saved;

      if (editingActivity?.id) {
        saved = await updateMarketingActivity(editingActivity.id, formData);
        setActivities((prev) => prev.map((activity) => (activity.id === saved.id ? saved : activity)));
      } else {
        saved = await createMarketingActivity(formData);
        setActivities((prev) => [saved, ...prev]);
      }

      if (typeof onActivitySaved === 'function') {
        onActivitySaved(saved);
      }

      closeForm();
      await loadActivities();
    } catch (error) {
      console.error('Error saving field activity:', error);
      setFormError(error?.message || 'Could not save field activity.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (activity) => {
    const confirmed = window.confirm(`Delete this ${formatActivityType(activity.activityType)} activity?`);
    if (!confirmed) return;

    try {
      await deleteMarketingActivity(activity.id);
      setActivities((prev) => prev.filter((item) => item.id !== activity.id));
    } catch (error) {
      console.error('Error deleting field activity:', error);
      alert(error?.message || 'Could not delete field activity.');
    }
  };

  return (
    <section className={styles.card} style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0 }}>Field Activities</h2>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 750 }}>
            Track mailers, flyers, business cards, gorilla marketing, door hangers, and field activity by office.
          </p>
        </div>

        <button type="button" className={styles.primaryBtn} onClick={openCreateForm}>
          + New Activity
        </button>
      </div>

      <div className={styles.viewToggle} style={{ justifySelf: 'start' }}>
        <button
          type="button"
          onClick={() => setActivityViewMode('list')}
          className={activityViewMode === 'list' ? styles.activeToggle : ''}
        >
          List
        </button>
        <button
          type="button"
          onClick={() => setActivityViewMode('map')}
          className={activityViewMode === 'map' ? styles.activeToggle : ''}
        >
          Map
        </button>
      </div>

      {loadError && <div className={styles.errorBanner}>{loadError}</div>}

      <div className={styles.kpiGrid}>
        <ActivityKpi label="Activities" value={summary.totalActivities} helper="Filtered records" />
        <ActivityKpi label="Quantity" value={formatQuantity(summary.totalQuantity)} helper="Pieces / items distributed" />
        <ActivityKpi label="Spend" value={formatActivityCost(summary.totalCost)} helper={`Prod ${formatActivityCost(summary.totalProductionCost)} • Dist ${formatActivityCost(summary.totalDistributionCost)}`} />
        <ActivityKpi label="Estimated Reach" value={formatQuantity(summary.totalEstimatedReach)} helper="Optional reach estimate" />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search office, campaign, supervisor, ZIP..."
          />

          <select value={officeFilter} onChange={(event) => setOfficeFilter(event.target.value)}>
            <option value="all">All Offices</option>
            {officeOptions.map((office) => (
              <option key={office} value={office}>{office}</option>
            ))}
          </select>

          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All Activity Types</option>
            {ACTIVITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}>
            <option value="all">All Campaigns</option>
            {campaignOptions.map((campaign) => (
              <option key={campaign} value={campaign}>{campaign}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.emptyState}>Loading field activities...</div>
      ) : filteredActivities.length === 0 ? (
        <div className={styles.emptyState}>No field activities match the selected filters.</div>
      ) : activityViewMode === 'map' ? (
        <FieldActivityMap
          activities={filteredActivities}
          selectedActivity={selectedMapActivity}
          onActivitySelect={setSelectedMapActivity}
        />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredActivities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              onEdit={() => openEditForm(activity)}
              onDelete={() => handleDelete(activity)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <ActivityModal
          formData={formData}
          formError={formError}
          isSaving={isSaving}
          editingActivity={editingActivity}
          updateForm={updateForm}
          onClose={closeForm}
          onSubmit={handleSave}
          onSavedActivityChange={loadActivities}
        />
      )}

    </section>
  );
};

const ActivityKpi = ({ label, value, helper }) => (
  <div className={styles.kpiCard}>
    <span className={styles.kpiLabel}>{label}</span>
    <strong>{value}</strong>
    <small>{helper}</small>
  </div>
);

const ActivityCard = ({ activity, onEdit, onDelete }) => {
  const typeMeta = ACTIVITY_TYPE_META[activity.activityType] || ACTIVITY_TYPE_META.other;
  const statusMeta = getActivityStatusMeta(activity.status);

  return (
    <article
      style={{
        border: `1px solid ${typeMeta.border}`,
        borderRadius: 16,
        padding: 13,
        background: `linear-gradient(180deg, #ffffff, ${typeMeta.background})`,
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 5 }}>
          <strong style={{ color: '#0f172a', fontSize: 15 }}>
            {typeMeta.icon} {activity.campaignName || typeMeta.label}
          </strong>
          <span style={{ color: '#64748b', fontWeight: 850, fontSize: 12 }}>
            {formatActivityDate(activity.activityDate)} • {activity.office || 'No office'} • {activity.city || 'No city'}
          </span>
        </div>

        <span
          style={{
            background: statusMeta.background,
            color: statusMeta.color,
            border: `1px solid ${statusMeta.border}`,
            borderRadius: 999,
            padding: '5px 9px',
            fontWeight: 950,
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          {statusMeta.label}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <MiniStat label="Type" value={typeMeta.label} />
        <MiniStat
          label={activity.activityType === ACTIVITY_TYPES.MAILER ? 'Distributed' : 'Quantity'}
          value={formatQuantity(activity.activityType === ACTIVITY_TYPES.MAILER ? (activity.distributedQuantity || activity.quantity) : activity.quantity)}
        />
        <MiniStat label="Total Cost" value={formatActivityCost(activity.cost)} />
        <MiniStat label="Reach" value={formatQuantity(activity.estimatedReach)} />
      </div>

      <div style={{ color: '#475569', fontWeight: 750, fontSize: 12, lineHeight: 1.45 }}>
        {activity.inventoryItemId && (
          <div><strong>Inventory Used:</strong> {formatQuantity(activity.activityType === ACTIVITY_TYPES.MAILER ? (activity.distributedQuantity || activity.quantity) : activity.quantity)} items</div>
        )}
        {(Number(activity.productionCost || 0) > 0 || Number(activity.distributionCost || 0) > 0 || Number(activity.otherCost || 0) > 0) && (
          <div>
            <strong>Cost Breakdown:</strong>{' '}
            Production {formatActivityCost(activity.productionCost)} • Distribution {formatActivityCost(activity.distributionCost)} • Other {formatActivityCost(activity.otherCost)}
          </div>
        )}
        {activity.activityType === ACTIVITY_TYPES.MAILER ? (() => {
          const purchased = Number(activity.purchasedQuantity || 0);
          const distributed = Number(activity.distributedQuantity || activity.quantity || 0);
          const production = Number(activity.productionCost || 0);
          const distribution = Number(activity.distributionCost || 0);
          const other = Number(activity.otherCost || 0);
          const productionPerPiece = purchased > 0 ? production / purchased : 0;
          const runCost = (productionPerPiece * distributed) + distribution + other;
          return distributed > 0 ? (
            <div><strong>True Cost / Mailed Piece:</strong> {formatActivityCost(runCost / distributed)}</div>
          ) : null;
        })() : (activity.quantity > 0 && activity.cost > 0 && (
          <div><strong>Cost / Item:</strong> {formatActivityCost(Number(activity.cost) / Number(activity.quantity))}</div>
        ))}
        {activity.areaDescription && <div><strong>Area:</strong> {activity.areaDescription}</div>}
        {activity.zipCodes?.length > 0 && <div><strong>ZIPs:</strong> {activity.zipCodes.join(', ')}</div>}
        {activity.supervisorName && <div><strong>Supervisor:</strong> {activity.supervisorName}</div>}
        {activity.completedBy && <div><strong>Completed By:</strong> {activity.completedBy}</div>}
        {activity.notes && <div><strong>Notes:</strong> {activity.notes}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className={styles.secondaryBtn} onClick={onEdit}>
          Edit
        </button>
        <button type="button" className={styles.dangerBtn} onClick={onDelete}>
          Delete
        </button>
      </div>
    </article>
  );
};

const MiniStat = ({ label, value }) => (
  <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 8, background: '#ffffff' }}>
    <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>{label}</span>
    <strong style={{ display: 'block', color: '#0f172a', fontSize: 12, marginTop: 3 }}>{value || '—'}</strong>
  </div>
);

export default FieldActivitiesPanel;
// src/pages/admin/marketing/components/FieldActivityMap.jsx

import React, { useMemo } from 'react';
import styles from '../../MarketingOps.module.css';
import {
  formatActivityCost,
  formatActivityDate,
  formatActivityType,
  formatQuantity,
  getActivityStatusMeta,
  getActivityTypeMeta,
} from '../utils/activityHelpers';

const getValidActivities = (activities = []) =>
  activities.filter((activity) => {
    const lat = Number(activity.latitude);
    const lng = Number(activity.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });

const getBounds = (activities = []) => {
  const valid = getValidActivities(activities);
  if (valid.length === 0) return null;

  const lats = valid.map((activity) => Number(activity.latitude));
  const lngs = valid.map((activity) => Number(activity.longitude));

  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
};

const getPositionPercent = (activity, bounds) => {
  if (!bounds) return { left: '50%', top: '50%' };

  const lat = Number(activity.latitude);
  const lng = Number(activity.longitude);

  const latRange = bounds.maxLat - bounds.minLat || 0.01;
  const lngRange = bounds.maxLng - bounds.minLng || 0.01;

  const left = ((lng - bounds.minLng) / lngRange) * 84 + 8;
  const top = (1 - (lat - bounds.minLat) / latRange) * 76 + 12;

  return {
    left: `${Math.max(5, Math.min(95, left))}%`,
    top: `${Math.max(5, Math.min(95, top))}%`,
  };
};

const FieldActivityMap = ({
  activities = [],
  selectedActivity = null,
  onActivitySelect,
  height = 520,
}) => {
  const validActivities = useMemo(() => getValidActivities(activities), [activities]);
  const bounds = useMemo(() => getBounds(validActivities), [validActivities]);

  const totalQuantity = useMemo(() => {
    return validActivities.reduce((sum, activity) => sum + Number(activity.quantity || 0), 0);
  }, [validActivities]);

  const totalCost = useMemo(() => {
    return validActivities.reduce((sum, activity) => sum + Number(activity.cost || 0), 0);
  }, [validActivities]);

  if (validActivities.length === 0) {
    return (
      <section className={styles.card} style={{ display: 'grid', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Activity Map</h2>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 750 }}>
            Add latitude and longitude to field activities to show them on the activity map.
          </p>
        </div>

        <div className={styles.emptyState}>
          No field activities with coordinates yet.
        </div>
      </section>
    );
  }

  return (
    <section className={styles.card} style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0 }}>Activity Map</h2>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 750 }}>
            Visual view of logged field activity locations.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <MiniStat label="Mapped" value={validActivities.length} />
          <MiniStat label="Quantity" value={formatQuantity(totalQuantity)} />
          <MiniStat label="Spend" value={formatActivityCost(totalCost)} />
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          minHeight: height,
          border: '1px solid #e2e8f0',
          borderRadius: 18,
          overflow: 'hidden',
          background:
            'radial-gradient(circle at 25% 20%, #dbeafe 0, transparent 26%), radial-gradient(circle at 80% 70%, #dcfce7 0, transparent 26%), linear-gradient(135deg,#f8fafc,#e2e8f0)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 16,
            border: '1px dashed rgba(100,116,139,0.45)',
            borderRadius: 16,
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: 18,
            top: 18,
            zIndex: 3,
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: '8px 10px',
            color: '#475569',
            fontWeight: 850,
            fontSize: 12,
            boxShadow: '0 10px 24px rgba(15,23,42,0.12)',
          }}
        >
          Approximate activity map
        </div>

        {validActivities.map((activity) => {
          const typeMeta = getActivityTypeMeta(activity.activityType);
          const statusMeta = getActivityStatusMeta(activity.status);
          const position = getPositionPercent(activity, bounds);
          const isSelected = selectedActivity?.id === activity.id;

          return (
            <button
              key={activity.id}
              type="button"
              onClick={() => typeof onActivitySelect === 'function' && onActivitySelect(activity)}
              title={`${formatActivityType(activity.activityType)} - ${activity.office}`}
              style={{
                position: 'absolute',
                left: position.left,
                top: position.top,
                transform: 'translate(-50%, -50%)',
                zIndex: isSelected ? 5 : 4,
                width: isSelected ? 48 : 38,
                height: isSelected ? 48 : 38,
                borderRadius: 999,
                border: `2px solid ${isSelected ? '#0f172a' : typeMeta.border}`,
                background: typeMeta.background,
                color: typeMeta.color,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                fontSize: isSelected ? 23 : 18,
                boxShadow: isSelected
                  ? '0 18px 35px rgba(15,23,42,0.25)'
                  : '0 10px 22px rgba(15,23,42,0.16)',
              }}
            >
              {typeMeta.icon}
              <span
                style={{
                  position: 'absolute',
                  right: -2,
                  bottom: -2,
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: statusMeta.color,
                  border: '2px solid #ffffff',
                }}
              />
            </button>
          );
        })}
      </div>

      {selectedActivity && (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: 12,
            background: '#ffffff',
            display: 'grid',
            gap: 8,
          }}
        >
          <strong style={{ color: '#0f172a' }}>
            {getActivityTypeMeta(selectedActivity.activityType).icon} {selectedActivity.campaignName || formatActivityType(selectedActivity.activityType)}
          </strong>

          <div style={{ color: '#64748b', fontWeight: 850, fontSize: 12 }}>
            {formatActivityDate(selectedActivity.activityDate)} • {selectedActivity.office || 'No office'} • {selectedActivity.city || 'No city'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            <MiniStat label="Quantity" value={formatQuantity(selectedActivity.quantity)} />
            <MiniStat label="Cost" value={formatActivityCost(selectedActivity.cost)} />
            <MiniStat label="Reach" value={formatQuantity(selectedActivity.estimatedReach)} />
            <MiniStat label="Status" value={getActivityStatusMeta(selectedActivity.status).label} />
          </div>

          {selectedActivity.areaDescription && (
            <p style={{ margin: 0, color: '#475569', fontWeight: 750, fontSize: 12 }}>
              <strong>Area:</strong> {selectedActivity.areaDescription}
            </p>
          )}
        </div>
      )}
    </section>
  );
};

const MiniStat = ({ label, value }) => (
  <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '7px 9px', background: '#f8fafc', minWidth: 0 }}>
    <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>
      {label}
    </span>
    <strong style={{ display: 'block', color: '#0f172a', fontSize: 12, marginTop: 2, overflowWrap: 'anywhere' }}>
      {value || '—'}
    </strong>
  </div>
);

export default FieldActivityMap;

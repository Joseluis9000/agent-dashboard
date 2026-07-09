// src/pages/admin/marketing/components/ActivityModal.jsx

import React, { useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import ActivityPhotoGallery from './ActivityPhotoGallery';
import MailerRoutesPanel from './MailerRoutesPanel';
import CampaignSelector from './CampaignSelector';
import {
  ACTIVITY_STATUS,
  ACTIVITY_TYPES,
} from '../services/activityService';
import {
  ACTIVITY_TYPE_META,
  formatActivityCost,
  formatActivityDate,
  formatActivityType,
  formatQuantity,
  getActivityStatusMeta,
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

const PRIORITY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent'];

const ActivityModal = ({
  formData,
  formError,
  isSaving,
  editingActivity,
  updateForm,
  onClose,
  onSubmit,
  onSavedActivityChange,
}) => {
  const [activeTab, setActiveTab] = useState('general');

  const typeMeta = ACTIVITY_TYPE_META[formData.activityType] || ACTIVITY_TYPE_META.other;
  const statusMeta = getActivityStatusMeta(formData.status);
  const canUploadPhotos = !!editingActivity?.id;

  const previewStats = useMemo(() => ([
    ['Office', formData.office || '—'],
    ['Quantity', formatQuantity(formData.quantity)],
    ['Cost', formatActivityCost(formData.cost)],
    ['Reach', formatQuantity(formData.estimatedReach)],
  ]), [formData.office, formData.quantity, formData.cost, formData.estimatedReach]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <form
        className={styles.locationModal}
        onSubmit={onSubmit}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <h2>{editingActivity ? 'Edit Field Activity' : 'New Field Activity'}</h2>
            <p>
              {typeMeta.icon} {formData.campaignName || typeMeta.label} • {formData.office || 'No office selected'}
            </p>
          </div>

          <button type="button" onClick={onClose} className={styles.closeBtn}>
            ×
          </button>
        </div>

        {formError && <div className={styles.errorBanner}>{formError}</div>}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 12,
          }}
        >
          {previewStats.map(([label, value]) => (
            <div
              key={label}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: 9,
                background: '#f8fafc',
              }}
            >
              <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>
                {label}
              </span>
              <strong style={{ display: 'block', color: '#0f172a', fontSize: 13, marginTop: 3 }}>
                {value || '—'}
              </strong>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            borderBottom: '1px solid #e2e8f0',
            marginBottom: 14,
            overflowX: 'auto',
          }}
        >
          {[
            ['general', 'General'],
            ['distribution', 'Distribution'],
            ['photos', 'Photos'],
            ['map', 'Map'],
            ['history', 'History'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              style={{
                border: 0,
                borderBottom: activeTab === key ? '2px solid #0ea5e9' : '2px solid transparent',
                background: 'transparent',
                padding: '9px 7px',
                fontWeight: 950,
                color: activeTab === key ? '#0ea5e9' : '#64748b',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'general' && (
          <div className={styles.formGrid}>
            <label>
              Activity Type
              <select value={formData.activityType} onChange={(event) => updateForm('activityType', event.target.value)}>
                {ACTIVITY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              Status
              <select value={formData.status} onChange={(event) => updateForm('status', event.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              Office
              <input value={formData.office} onChange={(event) => updateForm('office', event.target.value)} placeholder="CA30" />
            </label>

            <label>
              Region
              <input value={formData.region} onChange={(event) => updateForm('region', event.target.value)} placeholder="Cen-Cal" />
            </label>

            <label>
              Campaign Name
              <input value={formData.campaignName} onChange={(event) => updateForm('campaignName', event.target.value)} placeholder="Summer DMV Promo" />
            </label>

            <label>
              Linked Campaign
              <CampaignSelector
                value={formData.campaignId || ''}
                onChange={(value) => updateForm('campaignId', value)}
                emptyLabel="No Linked Campaign"
              />
            </label>

            <label>
              Priority
              <select value={formData.priority} onChange={(event) => updateForm('priority', event.target.value)}>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </label>

            <label>
              Activity Date
              <input type="date" value={formData.activityDate} onChange={(event) => updateForm('activityDate', event.target.value)} />
            </label>

            <label>
              Completed Date
              <input type="date" value={formData.completedDate} onChange={(event) => updateForm('completedDate', event.target.value)} />
            </label>

            <label>
              Supervisor
              <input value={formData.supervisorName} onChange={(event) => updateForm('supervisorName', event.target.value)} placeholder="Supervisor name" />
            </label>

            <label>
              Completed By
              <input value={formData.completedBy} onChange={(event) => updateForm('completedBy', event.target.value)} placeholder="Employee or team" />
            </label>

            <label className={styles.fullWidth}>
              Notes
              <textarea value={formData.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={4} placeholder="What was completed? Any issues? Streets covered?" />
            </label>
          </div>
        )}

        {activeTab === 'distribution' && (
          <div className={styles.formGrid}>
            <label>
              Quantity
              <input type="number" value={formData.quantity} onChange={(event) => updateForm('quantity', event.target.value)} placeholder="500" />
            </label>

            <label>
              Cost
              <input type="number" step="0.01" value={formData.cost} onChange={(event) => updateForm('cost', event.target.value)} placeholder="125.00" />
            </label>

            <label>
              Estimated Reach
              <input type="number" value={formData.estimatedReach} onChange={(event) => updateForm('estimatedReach', event.target.value)} placeholder="1500" />
            </label>

            <label>
              City
              <input value={formData.city} onChange={(event) => updateForm('city', event.target.value)} placeholder="Merced" />
            </label>

            <label className={styles.fullWidth}>
              ZIP Codes
              <input value={formData.zipCodes} onChange={(event) => updateForm('zipCodes', event.target.value)} placeholder="95340, 95341, 95348" />
            </label>

            <label className={styles.fullWidth}>
              Area Description
              <input value={formData.areaDescription} onChange={(event) => updateForm('areaDescription', event.target.value)} placeholder="Downtown, Main St, Yosemite Ave..." />
            </label>

            <label>
              Weather
              <input value={formData.weather} onChange={(event) => updateForm('weather', event.target.value)} placeholder="Sunny, hot, rain..." />
            </label>

            <label>
              Tags
              <input value={formData.tags} onChange={(event) => updateForm('tags', event.target.value)} placeholder="DMV, auto, placas" />
            </label>
          </div>
        )}

        {activeTab === 'photos' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {!canUploadPhotos && (
              <div
                style={{
                  border: '1px dashed #93c5fd',
                  borderRadius: 14,
                  padding: 14,
                  background: '#f8fbff',
                  color: '#075985',
                  fontWeight: 850,
                }}
              >
                Save this activity first, then reopen it to upload proof photos.
              </div>
            )}

            {canUploadPhotos && (
              <ActivityPhotoGallery
                activity={editingActivity}
                onPhotosChange={onSavedActivityChange}
              />
            )}
          </div>
        )}

        {activeTab === 'map' && (
          <div className={styles.formGrid}>
            <label>
              Latitude
              <input type="number" step="any" value={formData.latitude} onChange={(event) => updateForm('latitude', event.target.value)} placeholder="Optional" />
            </label>

            <label>
              Longitude
              <input type="number" step="any" value={formData.longitude} onChange={(event) => updateForm('longitude', event.target.value)} placeholder="Optional" />
            </label>

            <div className={styles.fullWidth} style={{ border: '1px dashed #cbd5e1', borderRadius: 14, padding: 14, color: '#64748b', fontWeight: 850, background: '#f8fafc' }}>
              Map pin tools will go here later. For now, save latitude and longitude manually if you want this activity to appear on a future activity map.
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: statusMeta.background }}>
              <strong style={{ color: statusMeta.color }}>{statusMeta.label}</strong>
              <p style={{ margin: '6px 0 0', color: '#475569', fontWeight: 750 }}>
                {formatActivityType(formData.activityType)} logged for {formData.office || 'this office'}.
              </p>
            </div>

            <div style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 800, fontSize: 13 }}>
              <span>Activity Date: {formatActivityDate(formData.activityDate)}</span>
              <span>Completed Date: {formatActivityDate(formData.completedDate)}</span>
              <span>Quantity: {formatQuantity(formData.quantity)}</span>
              <span>Cost: {formatActivityCost(formData.cost)}</span>
            </div>
          </div>
        )}

        {activeTab === 'mailerRoutes' && (
          <MailerRoutesPanel
            activity={editingActivity}
            formData={formData}
            updateForm={updateForm}
          />
        )}

        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={isSaving}>
            {isSaving ? 'Saving...' : editingActivity ? 'Save Changes' : 'Save Activity'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ActivityModal;

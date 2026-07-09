// src/pages/admin/marketing/components/CampaignModal.jsx

import React from 'react';
import styles from '../../MarketingOps.module.css';
import { CAMPAIGN_STATUS } from '../services/campaignService';

const STATUS_OPTIONS = [
  { value: CAMPAIGN_STATUS.PLANNED, label: 'Planned' },
  { value: CAMPAIGN_STATUS.ACTIVE, label: 'Active' },
  { value: CAMPAIGN_STATUS.PAUSED, label: 'Paused' },
  { value: CAMPAIGN_STATUS.COMPLETED, label: 'Completed' },
  { value: CAMPAIGN_STATUS.CANCELLED, label: 'Cancelled' },
];

const CampaignModal = ({
  formData,
  formError,
  isSaving,
  editingCampaign,
  updateForm,
  onClose,
  onSubmit,
}) => {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <form
        className={styles.locationModal}
        onSubmit={onSubmit}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <h2>{editingCampaign ? 'Edit Campaign' : 'New Campaign'}</h2>
            <p>Organize locations, field activities, assets, budgets, and goals under one campaign.</p>
          </div>

          <button type="button" onClick={onClose} className={styles.closeBtn}>
            ×
          </button>
        </div>

        {formError && <div className={styles.errorBanner}>{formError}</div>}

        <div className={styles.formGrid}>
          <label className={styles.fullWidth}>
            Campaign Name
            <input
              value={formData.name}
              onChange={(event) => updateForm('name', event.target.value)}
              placeholder="Summer DMV 2026"
              required
            />
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
            Budget
            <input
              type="number"
              step="0.01"
              value={formData.budget}
              onChange={(event) => updateForm('budget', event.target.value)}
              placeholder="8000"
            />
          </label>

          <label>
            Start Date
            <input
              type="date"
              value={formData.startDate}
              onChange={(event) => updateForm('startDate', event.target.value)}
            />
          </label>

          <label>
            End Date
            <input
              type="date"
              value={formData.endDate}
              onChange={(event) => updateForm('endDate', event.target.value)}
            />
          </label>

          <label>
            Primary Color
            <input
              type="color"
              value={formData.primaryColor || '#0ea5e9'}
              onChange={(event) => updateForm('primaryColor', event.target.value)}
            />
          </label>

          <label>
            Secondary Color
            <input
              type="color"
              value={formData.secondaryColor || '#0369a1'}
              onChange={(event) => updateForm('secondaryColor', event.target.value)}
            />
          </label>

          <label className={styles.fullWidth}>
            Goal
            <input
              value={formData.goal}
              onChange={(event) => updateForm('goal', event.target.value)}
              placeholder="Increase DMV, auto, placas, or brand awareness in target offices."
            />
          </label>

          <label className={styles.fullWidth}>
            Description
            <textarea
              value={formData.description}
              onChange={(event) => updateForm('description', event.target.value)}
              rows={3}
              placeholder="What is this campaign about?"
            />
          </label>

          <label className={styles.fullWidth}>
            Notes
            <textarea
              value={formData.notes}
              onChange={(event) => updateForm('notes', event.target.value)}
              rows={4}
              placeholder="Internal notes, strategy, approvals, reminders..."
            />
          </label>
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={isSaving}>
            {isSaving ? 'Saving...' : editingCampaign ? 'Save Campaign' : 'Create Campaign'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CampaignModal;

// src/pages/admin/marketing/components/CampaignCard.jsx

import React from 'react';
import {
  formatCampaignBudget,
  formatCampaignDate,
  getCampaignProgress,
  getCampaignStatusMeta,
} from '../utils/campaignHelpers';

const CampaignCard = ({
  campaign,
  onClick,
  onEdit,
  onDelete,
}) => {
  if (!campaign) return null;

  const status = getCampaignStatusMeta(campaign.status);
  const progress = getCampaignProgress(campaign);

  return (
    <article
      onClick={() => typeof onClick === 'function' && onClick(campaign)}
      style={{
        border: `1px solid ${status.border}`,
        borderRadius: 16,
        padding: 14,
        background: `linear-gradient(180deg,#ffffff,${status.background})`,
        display: 'grid',
        gap: 10,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 5 }}>
          <strong style={{ color: '#0f172a', fontSize: 16 }}>
            {campaign.name}
          </strong>

          <span style={{ color: '#64748b', fontWeight: 800, fontSize: 12 }}>
            {formatCampaignDate(campaign.startDate)} → {formatCampaignDate(campaign.endDate)}
          </span>
        </div>

        <span
          style={{
            background: status.background,
            color: status.color,
            border: `1px solid ${status.border}`,
            borderRadius: 999,
            padding: '5px 9px',
            fontWeight: 950,
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          {status.label}
        </span>
      </div>

      {campaign.description && (
        <p style={{ margin: 0, color: '#475569', fontWeight: 750, fontSize: 12, lineHeight: 1.4 }}>
          {campaign.description}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <MiniStat label="Budget" value={formatCampaignBudget(campaign.budget)} />
        <MiniStat label="Goal" value={campaign.goal || '—'} />
      </div>

      {progress !== null && (
        <div style={{ display: 'grid', gap: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontWeight: 850, fontSize: 11 }}>
            <span>Timeline Progress</span>
            <span>{progress}%</span>
          </div>
          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: campaign.primaryColor || status.color,
              }}
            />
          </div>
        </div>
      )}

      {(onEdit || onDelete) && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {onEdit && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(campaign);
              }}
              style={{
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#334155',
                borderRadius: 10,
                padding: '7px 10px',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(campaign);
              }}
              style={{
                border: '1px solid #fecaca',
                background: '#fee2e2',
                color: '#991b1b',
                borderRadius: 10,
                padding: '7px 10px',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </article>
  );
};

const MiniStat = ({ label, value }) => (
  <div
    style={{
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 9,
      background: '#ffffff',
      minWidth: 0,
    }}
  >
    <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>
      {label}
    </span>
    <strong style={{ display: 'block', color: '#0f172a', fontSize: 12, marginTop: 3, overflowWrap: 'anywhere' }}>
      {value}
    </strong>
  </div>
);

export default CampaignCard;

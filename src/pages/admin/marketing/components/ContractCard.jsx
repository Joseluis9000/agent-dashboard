// src/pages/admin/marketing/components/ContractCard.jsx

import React, { useMemo } from 'react';
import styles from '../../MarketingOps.module.css';
import { getStatusMeta, formatCurrency } from '../utils/marketingHelpers';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const getDateValue = (dateKey) => {
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (dateKey) => {
  const date = getDateValue(dateKey);
  if (!date) return '—';
  return DATE_FORMATTER.format(date);
};

const getTodayAtNoon = () => {
  const todayKey = new Date().toISOString().split('T')[0];
  return new Date(`${todayKey}T12:00:00`);
};

const getDaysUntil = (dateKey) => {
  const target = getDateValue(dateKey);
  if (!target) return null;
  return Math.ceil((target - getTodayAtNoon()) / (1000 * 60 * 60 * 24));
};

const getProgressPercent = (startKey, endKey) => {
  const start = getDateValue(startKey);
  const end = getDateValue(endKey);
  const today = getTodayAtNoon();

  if (!start || !end || end <= start) return 0;
  if (today <= start) return 0;
  if (today >= end) return 100;

  const total = end - start;
  const elapsed = today - start;
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
};

const getContractTone = (daysRemaining, statusClassName) => {
  if (daysRemaining !== null && daysRemaining < 0) {
    return {
      label: `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'} expired`,
      color: '#ef4444',
      background: '#fef2f2',
      border: '#fecaca',
    };
  }

  if (daysRemaining !== null && daysRemaining <= 60) {
    return {
      label: `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`,
      color: '#d97706',
      background: '#fffbeb',
      border: '#fde68a',
    };
  }

  if (statusClassName === 'purple') {
    return {
      label: daysRemaining === null ? 'Planned' : `${daysRemaining} days remaining`,
      color: '#7c3aed',
      background: '#f5f3ff',
      border: '#ddd6fe',
    };
  }

  return {
    label: daysRemaining === null ? 'No end date' : `${daysRemaining} days remaining`,
    color: '#16a34a',
    background: '#f0fdf4',
    border: '#bbf7d0',
  };
};

const getActiveContract = (contracts = [], item = {}) => {
  const active = contracts.find((contract) => contract.status === 'active');
  return active || contracts[0] || {
    vendor: item.vendor,
    start_date: item.contractStart,
    end_date: item.contractEnd,
    renewal_date: item.renewalDate,
    monthly_cost: item.monthlyCost,
    contract_pdf: item.contractUrl,
    status: item.status,
  };
};

const ContractCard = ({ item, contracts = [], onOpenContracts }) => {
  const contract = useMemo(() => getActiveContract(contracts, item), [contracts, item]);

  if (!item) return null;

  const status = getStatusMeta(item.status);
  const startDate = contract.start_date || item.contractStart;
  const endDate = contract.end_date || item.contractEnd;
  const renewalDate = contract.renewal_date || item.renewalDate;
  const displayEndDate = endDate || renewalDate;
  const daysRemaining = getDaysUntil(displayEndDate);
  const progress = getProgressPercent(startDate, displayEndDate);
  const tone = getContractTone(daysRemaining, status.className);
  const contractUrl = contract.contract_pdf || item.contractUrl;
  const monthlyCost = Number(contract.monthly_cost ?? item.monthlyCost ?? 0);

  return (
    <section
      style={{
        border: `1px solid ${tone.border}`,
        borderRadius: 16,
        padding: 14,
        background: `linear-gradient(180deg, #ffffff, ${tone.background})`,
        display: 'grid',
        gap: 12,
        boxShadow: '0 10px 26px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ color: '#64748b', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Contract Status
          </span>
          <strong style={{ color: '#0f172a', fontSize: 17, lineHeight: 1.1 }}>
            {status.label}
          </strong>
        </div>

        <span className={`${styles.statusPill} ${styles[status.className]}`}>
          {status.label}
        </span>
      </div>

      <div style={{ display: 'grid', gap: 5 }}>
        <div style={{ color: '#334155', fontSize: 13, fontWeight: 900 }}>
          {formatDate(startDate)} <span style={{ color: '#94a3b8' }}>→</span> {formatDate(displayEndDate)}
        </div>
        <strong style={{ color: tone.color, fontSize: 15 }}>
          {tone.label}
        </strong>
      </div>

      <div style={{ display: 'grid', gap: 7 }}>
        <div style={{ height: 9, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: tone.color,
              borderRadius: 999,
              transition: 'width 200ms ease',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 11, fontWeight: 850 }}>
          <span>{progress}% used</span>
          <span>{100 - progress}% remaining</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 9, background: '#ffffff' }}>
          <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>Vendor</span>
          <strong style={{ display: 'block', color: '#0f172a', fontSize: 12, marginTop: 3 }}>{contract.vendor || item.vendor || '—'}</strong>
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 9, background: '#ffffff' }}>
          <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>Monthly Cost</span>
          <strong style={{ display: 'block', color: '#0f172a', fontSize: 12, marginTop: 3 }}>{formatCurrency(monthlyCost)}</strong>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {contractUrl && (
          <a
            href={contractUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.secondaryBtn}
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            Open Contract
          </a>
        )}

        {typeof onOpenContracts === 'function' && (
          <button type="button" className={styles.secondaryBtn} onClick={onOpenContracts}>
            View History ({contracts.length})
          </button>
        )}
      </div>
    </section>
  );
};

export default ContractCard;

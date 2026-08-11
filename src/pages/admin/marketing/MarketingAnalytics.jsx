// src/pages/admin/marketing/MarketingAnalytics.jsx

import React, { useEffect, useMemo, useState } from 'react';
import styles from '../MarketingOps.module.css';
import {
  buildMarketingAnalytics,
  getMarketingAnalyticsData,
} from './services/analyticsService';

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

const formatCurrencyDetailed = (value) =>
  Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });

const formatNumber = (value) =>
  Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  });

const formatPercent = (value) => `${Number(value || 0)}%`;

const routeTypeLabel = {
  C: 'City Route',
  R: 'Rural Route',
  H: 'Highway Contract Route',
  B: 'PO Box',
  G: 'General Delivery',
};

const cardStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  background: '#ffffff',
  boxShadow: '0 12px 30px rgba(15,23,42,0.06)',
};

const filterInputStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  padding: '9px 10px',
  background: '#ffffff',
  color: '#0f172a',
  fontWeight: 750,
  minWidth: 0,
};

const MarketingAnalytics = () => {
  const [rawData, setRawData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    campaignId: 'all',
    region: 'all',
    office: 'all',
    activityType: 'all',
  });

  const loadAnalytics = async () => {
    setIsLoading(true);
    setError('');

    try {
      setRawData(await getMarketingAnalyticsData());
    } catch (loadError) {
      console.error('Marketing analytics load error:', loadError);
      setError(
        loadError?.message || 'Could not load marketing analytics.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const analytics = useMemo(
    () =>
      rawData
        ? buildMarketingAnalytics(rawData, filters)
        : null,
    [rawData, filters]
  );

  const activityTypes = useMemo(() => {
    const values = new Set(
      (rawData?.activities || [])
        .map((row) => row.activityType)
        .filter(Boolean)
    );
    return [...values].sort();
  }, [rawData]);

  const regionOptions = useMemo(() => {
    const values = new Set(
      (rawData?.regions || []).map((row) => row.name).filter(Boolean)
    );
    return [...values].sort();
  }, [rawData]);

  const officeOptions = useMemo(() => {
    return (rawData?.offices || [])
      .map((row) => row.officeCode)
      .filter(Boolean)
      .sort();
  }, [rawData]);

  const updateFilter = (field, value) => {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      campaignId: 'all',
      region: 'all',
      office: 'all',
      activityType: 'all',
    });
  };

  if (isLoading) {
    return (
      <section className={styles.card}>
        <div className={styles.emptyState}>
          Loading marketing analytics...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.card}>
        <div className={styles.errorBanner}>{error}</div>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={loadAnalytics}
        >
          Retry
        </button>
      </section>
    );
  }

  if (!analytics) return null;

  const { summary } = analytics;

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          ...cardStyle,
          padding: 18,
          background:
            'linear-gradient(135deg,#ffffff 0%,#f8fbff 60%,#eff6ff 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 14,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                color: '#0f172a',
                letterSpacing: '-0.04em',
              }}
            >
              Marketing Analytics
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                color: '#64748b',
                fontWeight: 750,
              }}
            >
              Spend, campaigns, activity, inventory, offices, regions,
              and EDDM route intelligence from the MarketingOps data
              already in the system.
            </p>
          </div>

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={loadAnalytics}
          >
            Refresh
          </button>
        </div>
      </div>

      <div
        style={{
          ...cardStyle,
          padding: 14,
          display: 'grid',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <strong style={{ color: '#0f172a' }}>
            Analytics Filters
          </strong>

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={clearFilters}
          >
            Clear Filters
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit,minmax(160px,1fr))',
            gap: 8,
          }}
        >
          <label style={{ display: 'grid', gap: 4 }}>
            <small style={{ color: '#64748b', fontWeight: 900 }}>
              Start Date
            </small>
            <input
              type="date"
              style={filterInputStyle}
              value={filters.startDate}
              onChange={(event) =>
                updateFilter('startDate', event.target.value)
              }
            />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <small style={{ color: '#64748b', fontWeight: 900 }}>
              End Date
            </small>
            <input
              type="date"
              style={filterInputStyle}
              value={filters.endDate}
              onChange={(event) =>
                updateFilter('endDate', event.target.value)
              }
            />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <small style={{ color: '#64748b', fontWeight: 900 }}>
              Campaign
            </small>
            <select
              style={filterInputStyle}
              value={filters.campaignId}
              onChange={(event) =>
                updateFilter('campaignId', event.target.value)
              }
            >
              <option value="all">All Campaigns</option>
              {(rawData?.campaigns || []).map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <small style={{ color: '#64748b', fontWeight: 900 }}>
              Region
            </small>
            <select
              style={filterInputStyle}
              value={filters.region}
              onChange={(event) =>
                updateFilter('region', event.target.value)
              }
            >
              <option value="all">All Regions</option>
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <small style={{ color: '#64748b', fontWeight: 900 }}>
              Office
            </small>
            <select
              style={filterInputStyle}
              value={filters.office}
              onChange={(event) =>
                updateFilter('office', event.target.value)
              }
            >
              <option value="all">All Offices</option>
              {officeOptions.map((office) => (
                <option key={office} value={office}>
                  {office}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <small style={{ color: '#64748b', fontWeight: 900 }}>
              Activity Type
            </small>
            <select
              style={filterInputStyle}
              value={filters.activityType}
              onChange={(event) =>
                updateFilter('activityType', event.target.value)
              }
            >
              <option value="all">All Activity Types</option>
              {activityTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit,minmax(180px,1fr))',
          gap: 10,
        }}
      >
        <Kpi
          label="Known Spend"
          value={formatCurrency(summary.knownSpend)}
          helper={`${formatPercent(summary.budgetUsedPercent)} of tracked budget`}
        />
        <Kpi
          label="Tracked Budget"
          value={formatCurrency(summary.totalBudget)}
          helper={`${formatCurrency(summary.budgetRemaining)} remaining`}
        />
        <Kpi
          label="Activity Spend"
          value={formatCurrency(summary.activitySpend)}
          helper={`${formatNumber(summary.activityCount)} activities`}
        />
        <Kpi
          label="Inventory Purchased"
          value={formatCurrency(summary.inventoryPurchaseSpend)}
          helper="Dedicated campaign purchases"
        />
        <Kpi
          label="Inventory Value Used"
          value={formatCurrency(summary.inventoryUsedValue)}
          helper="Allocated consumed value"
        />
        <Kpi
          label="Location Spend"
          value={formatCurrency(summary.locationSpend)}
          helper="Billboards, events, locations"
        />
        <Kpi
          label="Mailer Pieces"
          value={formatNumber(summary.mailPieces)}
          helper={`${formatNumber(summary.routeCount)} EDDM routes`}
        />
        <Kpi
          label="Avg Route Income"
          value={
            summary.weightedAverageIncome > 0
              ? formatCurrency(summary.weightedAverageIncome)
              : '—'
          }
          helper="Weighted by mail pieces"
        />
        <Kpi
          label="Estimated Reach"
          value={formatNumber(summary.totalReach)}
          helper={`${formatNumber(summary.totalImpressions)} location impressions`}
        />
        <Kpi
          label="Campaigns"
          value={formatNumber(summary.campaignCount)}
          helper={`${formatNumber(summary.activeCampaignCount)} active`}
        />
      </div>

      {summary.totalBudget > 0 && (
        <div style={{ ...cardStyle, padding: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 7,
              color: '#475569',
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            <span>Overall tracked budget usage</span>
            <span>{formatPercent(summary.budgetUsedPercent)}</span>
          </div>

          <ProgressBar value={summary.budgetUsedPercent} />
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(0,1.25fr) minmax(320px,0.75fr)',
          gap: 16,
        }}
      >
        <SectionCard title="Campaign Performance">
          {analytics.campaignPerformance.length === 0 ? (
            <Empty text="No campaigns match the selected filters." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {analytics.campaignPerformance.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Spend Breakdown">
          <MetricRow
            label="Activity Spend"
            value={summary.activitySpend}
            total={summary.knownSpend}
          />
          <MetricRow
            label="Inventory Purchases"
            value={summary.inventoryPurchaseSpend}
            total={summary.knownSpend}
          />
          <MetricRow
            label="Location Spend"
            value={summary.locationSpend}
            total={summary.knownSpend}
          />

          <div
            style={{
              marginTop: 12,
              borderTop: '1px solid #e2e8f0',
              paddingTop: 12,
            }}
          >
            <small
              style={{
                color: '#64748b',
                fontWeight: 800,
                lineHeight: 1.45,
              }}
            >
              Inventory Value Used is displayed separately because it
              represents utilization of inventory already purchased and
              is not added again to Known Spend.
            </small>
          </div>
        </SectionCard>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(2,minmax(0,1fr))',
          gap: 16,
        }}
      >
        <SectionCard title="Activity & Channel Performance">
          {analytics.channelPerformance.length === 0 ? (
            <Empty text="No activity or location channel data yet." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {analytics.channelPerformance
                .slice(0, 12)
                .map((row) => (
                  <SimplePerformanceRow
                    key={row.key}
                    label={row.key.replaceAll('_', ' ')}
                    primary={formatCurrency(row.spend)}
                    secondary={`${formatNumber(row.activities)} activities · Qty ${formatNumber(row.quantity)} · Reach ${formatNumber(row.reach)}`}
                  />
                ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Region Performance">
          {analytics.regionPerformance.length === 0 ? (
            <Empty text="No region activity data yet." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {analytics.regionPerformance.map((row) => (
                <SimplePerformanceRow
                  key={row.key}
                  label={row.key}
                  primary={formatCurrency(row.spend)}
                  secondary={`${formatNumber(row.activities)} activities · ${formatNumber(row.mailPieces)} mail pieces`}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(0,1.1fr) minmax(320px,0.9fr)',
          gap: 16,
        }}
      >
        <SectionCard title="Office Performance">
          {analytics.officePerformance.length === 0 ? (
            <Empty text="No office activity data yet." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {analytics.officePerformance
                .slice(0, 20)
                .map((row) => (
                  <SimplePerformanceRow
                    key={row.key}
                    label={`${row.key} · ${row.region}`}
                    primary={formatCurrency(row.spend)}
                    secondary={`${formatNumber(row.activities)} activities · Qty ${formatNumber(row.quantity)} · ${formatNumber(row.mailPieces)} mail pieces`}
                  />
                ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="EDDM Route Intelligence">
          {analytics.routePerformance.length === 0 ? (
            <Empty text="No structured EDDM route data yet." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {analytics.routePerformance.map((row) => (
                <SimplePerformanceRow
                  key={row.routeType}
                  label={`${row.routeType} — ${
                    routeTypeLabel[row.routeType] || 'Unknown Route'
                  }`}
                  primary={`${formatNumber(row.mailPieces)} pieces`}
                  secondary={`${formatNumber(row.routeCount)} routes · Avg income ${
                    row.averageIncome > 0
                      ? formatCurrency(row.averageIncome)
                      : '—'
                  }`}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Inventory Utilization">
        {analytics.inventoryPerformance.length === 0 ? (
          <Empty text="No campaign-linked inventory purchases or usage yet." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit,minmax(280px,1fr))',
              gap: 10,
            }}
          >
            {analytics.inventoryPerformance
              .slice(0, 16)
              .map((item) => (
                <InventoryCard key={item.itemId || item.itemName} item={item} />
              ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Current Analytics Scope">
        <div
          style={{
            color: '#64748b',
            fontWeight: 750,
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          This version reports from the data currently built into
          MarketingOps: campaign budgets, field activities, marketing
          locations, campaign-dedicated inventory purchases, inventory
          consumption, office/region assignments, and structured EDDM
          route data. Calls, leads, policies, sales revenue, and true ROI
          will plug into the same analytics layer later.
        </div>
      </SectionCard>
    </section>
  );
};

const Kpi = ({ label, value, helper }) => (
  <div style={{ ...cardStyle, padding: 13 }}>
    <span
      style={{
        color: '#64748b',
        fontSize: 10,
        fontWeight: 950,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
    <strong
      style={{
        display: 'block',
        color: '#0f172a',
        marginTop: 5,
        fontSize: 21,
      }}
    >
      {value}
    </strong>
    <small
      style={{
        display: 'block',
        color: '#94a3b8',
        fontWeight: 800,
        marginTop: 3,
      }}
    >
      {helper}
    </small>
  </div>
);

const SectionCard = ({ title, children }) => (
  <section style={{ ...cardStyle, padding: 15 }}>
    <h3 style={{ margin: '0 0 12px', color: '#0f172a' }}>
      {title}
    </h3>
    {children}
  </section>
);

const ProgressBar = ({ value }) => (
  <div
    style={{
      height: 9,
      background: '#e2e8f0',
      borderRadius: 999,
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        height: '100%',
        width: `${Math.min(100, Math.max(0, Number(value || 0)))}%`,
        background: '#0ea5e9',
      }}
    />
  </div>
);

const CampaignRow = ({ campaign }) => (
  <article
    style={{
      border: '1px solid #e2e8f0',
      borderRadius: 14,
      padding: 12,
      background: '#ffffff',
      display: 'grid',
      gap: 8,
    }}
  >
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <strong style={{ color: '#0f172a' }}>
          🎯 {campaign.name}
        </strong>
        <small
          style={{
            display: 'block',
            color: '#64748b',
            fontWeight: 800,
            marginTop: 3,
          }}
        >
          {campaign.status || 'No status'} ·{' '}
          {formatNumber(campaign.activityCount)} activities ·{' '}
          {formatNumber(campaign.mailPieces)} mail pieces
        </small>
      </div>

      <div style={{ textAlign: 'right' }}>
        <strong style={{ color: '#0369a1' }}>
          {formatCurrency(campaign.spend)}
        </strong>
        <small
          style={{
            display: 'block',
            color: '#64748b',
            fontWeight: 800,
          }}
        >
          of {formatCurrency(campaign.budget)}
        </small>
      </div>
    </div>

    {campaign.budget > 0 && (
      <ProgressBar value={campaign.budgetUsedPercent} />
    )}

    <div
      style={{
        display: 'grid',
        gridTemplateColumns:
          'repeat(auto-fit,minmax(120px,1fr))',
        gap: 6,
      }}
    >
      <MiniMetric
        label="Activity"
        value={formatCurrency(campaign.activitySpend)}
      />
      <MiniMetric
        label="Inventory Purchased"
        value={formatCurrency(campaign.inventoryPurchaseSpend)}
      />
      <MiniMetric
        label="Inventory Used"
        value={formatCurrency(campaign.inventoryUsedValue)}
      />
      <MiniMetric
        label="Reach"
        value={formatNumber(campaign.reach)}
      />
    </div>
  </article>
);

const MiniMetric = ({ label, value }) => (
  <div
    style={{
      border: '1px solid #f1f5f9',
      borderRadius: 10,
      padding: 8,
      background: '#f8fafc',
    }}
  >
    <small
      style={{
        display: 'block',
        color: '#94a3b8',
        fontWeight: 900,
      }}
    >
      {label}
    </small>
    <strong
      style={{
        display: 'block',
        color: '#334155',
        marginTop: 2,
        fontSize: 12,
      }}
    >
      {value}
    </strong>
  </div>
);

const MetricRow = ({ label, value, total }) => {
  const percent =
    total > 0 ? Math.round((Number(value || 0) / total) * 100) : 0;

  return (
    <div style={{ display: 'grid', gap: 5, marginBottom: 11 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          color: '#475569',
          fontWeight: 850,
          fontSize: 12,
        }}
      >
        <span>{label}</span>
        <strong>{formatCurrency(value)}</strong>
      </div>
      <ProgressBar value={percent} />
    </div>
  );
};

const SimplePerformanceRow = ({
  label,
  primary,
  secondary,
}) => (
  <div
    style={{
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 10,
      background: '#ffffff',
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10,
      alignItems: 'center',
    }}
  >
    <div style={{ minWidth: 0 }}>
      <strong
        style={{
          color: '#334155',
          textTransform: 'capitalize',
        }}
      >
        {label}
      </strong>
      <small
        style={{
          display: 'block',
          color: '#64748b',
          fontWeight: 800,
          marginTop: 3,
        }}
      >
        {secondary}
      </small>
    </div>
    <strong
      style={{
        color: '#0f172a',
        whiteSpace: 'nowrap',
      }}
    >
      {primary}
    </strong>
  </div>
);

const InventoryCard = ({ item }) => (
  <article
    style={{
      border: '1px solid #dbeafe',
      borderRadius: 14,
      padding: 12,
      background: '#f8fbff',
      display: 'grid',
      gap: 8,
    }}
  >
    <div>
      <strong style={{ color: '#0f172a' }}>
        📦 {item.itemName}
      </strong>
      <small
        style={{
          display: 'block',
          color: '#64748b',
          fontWeight: 800,
          marginTop: 2,
        }}
      >
        {item.sku || 'No SKU'}
      </small>
    </div>

    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 7,
      }}
    >
      <MiniMetric
        label="Purchased"
        value={formatNumber(item.purchasedQuantity)}
      />
      <MiniMetric
        label="Used"
        value={formatNumber(item.usedQuantity)}
      />
      <MiniMetric
        label="Purchase Cost"
        value={formatCurrencyDetailed(item.purchaseCost)}
      />
      <MiniMetric
        label="Used Value"
        value={formatCurrencyDetailed(item.usedValue)}
      />
    </div>

    {item.purchasedQuantity > 0 && (
      <>
        <ProgressBar value={item.utilizationPercent} />
        <small
          style={{
            color: '#64748b',
            fontWeight: 800,
          }}
        >
          {formatPercent(item.utilizationPercent)} utilized ·{' '}
          {formatNumber(item.remainingQuantity)} remaining
        </small>
      </>
    )}
  </article>
);

const Empty = ({ text }) => (
  <div
    style={{
      border: '1px dashed #cbd5e1',
      borderRadius: 14,
      padding: 14,
      background: '#f8fafc',
      color: '#64748b',
      fontWeight: 850,
      fontSize: 12,
    }}
  >
    {text}
  </div>
);

export default MarketingAnalytics;
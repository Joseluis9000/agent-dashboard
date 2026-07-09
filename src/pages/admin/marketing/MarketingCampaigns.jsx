// src/pages/admin/marketing/MarketingCampaigns.jsx

import React, { useEffect, useMemo, useState } from 'react';
import styles from '../MarketingOps.module.css';
import CampaignWorkspacePanel from './components/CampaignWorkspacePanel';
import {
  createEmptyCampaignForm,
  createMarketingCampaign,
  deleteMarketingCampaign,
  getMarketingCampaigns,
  updateMarketingCampaign,
} from './services/campaignService';
import {
  formatCampaignBudget,
  formatCampaignDate,
  getCampaignStatusMeta,
} from './utils/campaignHelpers';

const MarketingCampaigns = ({ onNavigate }) => {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [formData, setFormData] = useState(createEmptyCampaignForm());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const loadCampaigns = async () => {
    setIsLoading(true);
    setError('');
    try {
      const nextCampaigns = await getMarketingCampaigns();
      setCampaigns(nextCampaigns);
      setSelectedCampaign((current) => {
        if (nextCampaigns.length === 0) return null;
        if (!current) return nextCampaigns[0];
        return nextCampaigns.find((campaign) => campaign.id === current.id) || nextCampaigns[0];
      });
    } catch (loadError) {
      console.error('Error loading campaigns:', loadError);
      setError(loadError?.message || 'Could not load campaigns.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const filteredCampaigns = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return campaigns.filter((campaign) => {
      const matchesSearch =
        !normalizedSearch ||
        campaign.name?.toLowerCase().includes(normalizedSearch) ||
        campaign.description?.toLowerCase().includes(normalizedSearch) ||
        campaign.goal?.toLowerCase().includes(normalizedSearch);

      const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [campaigns, search, statusFilter]);

  const stats = useMemo(() => {
    return filteredCampaigns.reduce(
      (acc, campaign) => {
        acc.campaignCount += 1;
        acc.totalBudget += Number(campaign.budget || 0);
        if (campaign.status === 'active') acc.active += 1;
        if (campaign.status === 'planned') acc.planned += 1;
        return acc;
      },
      { campaignCount: 0, totalBudget: 0, active: 0, planned: 0 }
    );
  }, [filteredCampaigns]);

  const openCreateForm = () => {
    setEditingCampaign(null);
    setFormData(createEmptyCampaignForm());
    setShowForm(true);
  };

  const openEditForm = (campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name || '',
      status: campaign.status || 'planned',
      startDate: campaign.startDate || '',
      endDate: campaign.endDate || '',
      budget: campaign.budget || '',
      goal: campaign.goal || '',
      description: campaign.description || '',
      primaryColor: campaign.primaryColor || '#0ea5e9',
      secondaryColor: campaign.secondaryColor || '#ef4444',
      notes: campaign.notes || '',
    });
    setShowForm(true);
  };

  const updateForm = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveCampaign = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      const savedCampaign = editingCampaign?.id
        ? await updateMarketingCampaign(editingCampaign.id, formData)
        : await createMarketingCampaign(formData);

      await loadCampaigns();
      setSelectedCampaign(savedCampaign);
      setShowForm(false);
      setEditingCampaign(null);
    } catch (saveError) {
      console.error('Error saving campaign:', saveError);
      setError(saveError?.message || 'Could not save campaign.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCampaign = async (campaign) => {
    const confirmed = window.confirm(`Delete campaign "${campaign.name}"?`);
    if (!confirmed) return;

    setIsSaving(true);
    setError('');

    try {
      await deleteMarketingCampaign(campaign.id);
      await loadCampaigns();
    } catch (deleteError) {
      console.error('Error deleting campaign:', deleteError);
      setError(deleteError?.message || 'Could not delete campaign.');
    } finally {
      setIsSaving(false);
    }
  };

  if (selectedCampaignId) {
    return (
      <CampaignWorkspacePanel
        campaignId={selectedCampaignId}
        onBack={() => setSelectedCampaignId(null)}
        onEditCampaign={(campaign) => {
          setSelectedCampaignId(null);
          openEditForm(campaign);
        }}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <div className={styles.card} style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0 }}>Campaign Manager</h2>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 750 }}>
              Create and manage campaigns that connect locations, field activities, photos, assets, budgets, and reports.
            </p>
          </div>

          <button type="button" className={styles.primaryBtn} onClick={openCreateForm}>
            + New Campaign
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.kpiGrid}>
          <CampaignKpi label="Campaigns" value={stats.campaignCount} helper="Filtered campaigns" />
          <CampaignKpi label="Total Budget" value={formatCampaignBudget(stats.totalBudget)} helper="Planned budget" />
          <CampaignKpi label="Active" value={stats.active} helper="Currently active" />
          <CampaignKpi label="Planned" value={stats.planned} helper="Upcoming" />
        </div>

        <div className={styles.toolbar}>
          <div className={styles.filters}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search campaigns..."
            />

            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All Campaigns</option>
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>Loading campaigns...</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 420px)', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredCampaigns.length === 0 ? (
              <div className={styles.card}>
                <div className={styles.emptyState}>No campaigns found.</div>
              </div>
            ) : (
              filteredCampaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  selected={selectedCampaign?.id === campaign.id}
                  onSelect={() => setSelectedCampaign(campaign)}
                  onOpenWorkspace={() => setSelectedCampaignId(campaign.id)}
                  onEdit={() => openEditForm(campaign)}
                  onDelete={() => handleDeleteCampaign(campaign)}
                />
              ))
            )}
          </div>

          <CampaignDetailsPanel
            campaign={selectedCampaign}
            onOpenWorkspace={() => selectedCampaign && setSelectedCampaignId(selectedCampaign.id)}
            onEdit={() => selectedCampaign && openEditForm(selectedCampaign)}
          />
        </div>
      )}

      {showForm && (
        <div className={styles.modalOverlay}>
          <div className={styles.locationModal}>
            <div className={styles.modalHeader}>
              <div>
                <h2>{editingCampaign ? 'Edit Campaign' : 'New Campaign'}</h2>
                <p>Campaign planning, budget, dates, and goal.</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setShowForm(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSaveCampaign} className={styles.formGrid}>
              <label>
                Campaign Name
                <input value={formData.name} onChange={(event) => updateForm('name', event.target.value)} required />
              </label>

              <label>
                Status
                <select value={formData.status} onChange={(event) => updateForm('status', event.target.value)}>
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </label>

              <label>
                Start Date
                <input type="date" value={formData.startDate} onChange={(event) => updateForm('startDate', event.target.value)} />
              </label>

              <label>
                End Date
                <input type="date" value={formData.endDate} onChange={(event) => updateForm('endDate', event.target.value)} />
              </label>

              <label>
                Budget
                <input type="number" step="0.01" value={formData.budget} onChange={(event) => updateForm('budget', event.target.value)} />
              </label>

              <label>
                Goal
                <input value={formData.goal} onChange={(event) => updateForm('goal', event.target.value)} />
              </label>

              <label>
                Primary Color
                <input type="color" value={formData.primaryColor || '#0ea5e9'} onChange={(event) => updateForm('primaryColor', event.target.value)} />
              </label>

              <label>
                Secondary Color
                <input type="color" value={formData.secondaryColor || '#ef4444'} onChange={(event) => updateForm('secondaryColor', event.target.value)} />
              </label>

              <label className={styles.fullWidth}>
                Description
                <textarea value={formData.description} onChange={(event) => updateForm('description', event.target.value)} rows={3} />
              </label>

              <label className={styles.fullWidth}>
                Notes
                <textarea value={formData.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={3} />
              </label>

              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

const CampaignKpi = ({ label, value, helper }) => (
  <div className={styles.kpiCard}>
    <span className={styles.kpiLabel}>{label}</span>
    <strong>{value}</strong>
    <small>{helper}</small>
  </div>
);

const CampaignCard = ({ campaign, selected, onSelect, onOpenWorkspace, onEdit, onDelete }) => {
  const status = getCampaignStatusMeta(campaign.status);
  const timelineProgress = campaign.timelineProgress || 0;

  return (
    <article
      onClick={onSelect}
      style={{
        border: selected ? `1px solid ${status.border}` : '1px solid #e2e8f0',
        borderRadius: 18,
        padding: 14,
        background: selected ? status.background : '#ffffff',
        boxShadow: selected ? '0 14px 30px rgba(15,23,42,0.08)' : 'none',
        cursor: 'pointer',
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f172a' }}>{campaign.name}</h3>
          <small style={{ color: '#64748b', fontWeight: 850 }}>
            {formatCampaignDate(campaign.startDate)} — {formatCampaignDate(campaign.endDate)}
          </small>
        </div>

        <span style={{ color: status.color, border: `1px solid ${status.border}`, background: '#ffffff', borderRadius: 999, padding: '6px 9px', fontWeight: 950, fontSize: 11 }}>
          {status.label}
        </span>
      </div>

      <p style={{ margin: 0, color: '#475569', fontWeight: 780, fontSize: 12 }}>
        {campaign.description || 'No description.'}
      </p>

      <div className={styles.detailGrid}>
        <div>
          <span>Budget</span>
          <strong>{formatCampaignBudget(campaign.budget)}</strong>
        </div>
        <div>
          <span>Goal</span>
          <strong>{campaign.goal || '—'}</strong>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 11, fontWeight: 850 }}>
          <span>Timeline Progress</span>
          <span>{timelineProgress}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
          <div style={{ width: `${timelineProgress}%`, height: '100%', background: campaign.primaryColor || '#0ea5e9' }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className={styles.primaryBtn} onClick={(event) => { event.stopPropagation(); onOpenWorkspace(); }}>
          Open Workspace
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={(event) => { event.stopPropagation(); onEdit(); }}>
          Edit
        </button>
        <button type="button" className={styles.dangerBtn} onClick={(event) => { event.stopPropagation(); onDelete(); }}>
          Delete
        </button>
      </div>
    </article>
  );
};

const CampaignDetailsPanel = ({ campaign, onOpenWorkspace, onEdit }) => {
  if (!campaign) {
    return (
      <aside className={styles.detailsCard}>
        <div className={styles.emptyState}>Select a campaign.</div>
      </aside>
    );
  }

  return (
    <aside className={styles.detailsCard}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div className={styles.detailsHeader}>
          <div>
            <h2>{campaign.name}</h2>
            <p>{campaign.description || 'Campaign details'}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={styles.primaryBtn} onClick={onOpenWorkspace}>
            Open Workspace
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={onEdit}>
            Edit
          </button>
        </div>

        <div className={styles.detailGrid}>
          <div>
            <span>Budget</span>
            <strong>{formatCampaignBudget(campaign.budget)}</strong>
          </div>
          <div>
            <span>Start Date</span>
            <strong>{formatCampaignDate(campaign.startDate)}</strong>
          </div>
          <div className={styles.fullWidth}>
            <span>Goal</span>
            <strong>{campaign.goal || '—'}</strong>
          </div>
          <div className={styles.fullWidth}>
            <span>Notes</span>
            <strong>{campaign.notes || '—'}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: 8, background: campaign.primaryColor || '#0ea5e9' }} />
          <span style={{ width: 22, height: 22, borderRadius: 8, background: campaign.secondaryColor || '#ef4444' }} />
        </div>
      </div>
    </aside>
  );
};

export default MarketingCampaigns;

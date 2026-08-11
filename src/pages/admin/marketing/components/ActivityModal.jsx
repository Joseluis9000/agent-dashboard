// src/pages/admin/marketing/components/ActivityModal.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import { supabase } from '../../../../supabaseClient';
import ActivityPhotoGallery from './ActivityPhotoGallery';
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

const USPS_ROUTE_TYPES = [
  { value: 'C', label: 'City Route', eddm: 'EDDM' },
  { value: 'R', label: 'Rural Route', eddm: 'EDDM' },
  { value: 'H', label: 'Highway Contract Route', eddm: 'Possible' },
  { value: 'B', label: 'PO Box', eddm: 'Usually not residential EDDM' },
  { value: 'G', label: 'General Delivery', eddm: 'Usually ignore' },
];

const emptyEddmRoute = () => ({
  id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  routeType: 'C',
  routeNumber: '',
  zipCode: '',
  mailPieces: '',
  averageHouseholdIncome: '',
  notes: '',
});

const normalizeRoutePreview = (routeType, routeNumber) => {
  const type = String(routeType || '').trim().toUpperCase();
  const digits = String(routeNumber || '').replace(/[^0-9]/g, '');
  if (!type || !digits) return '—';
  return `${type}${digits.padStart(3, '0')}`;
};

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
  const [settingsOffices, setSettingsOffices] = useState([]);
  const [settingsRegions, setSettingsRegions] = useState([]);
  const [settingsError, setSettingsError] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryLocations, setInventoryLocations] = useState([]);
  const [inventoryBalances, setInventoryBalances] = useState([]);
  const [inventoryBatches, setInventoryBatches] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
const [routeLoading, setRouteLoading] = useState(false);
const [routeError, setRouteError] = useState('');

const updateFormRef = useRef(updateForm);

useEffect(() => {
  updateFormRef.current = updateForm;
}, [updateForm]);

useEffect(() => {
  let isMounted = true;

    const loadSettingsOptions = async () => {
      setSettingsLoading(true);
      setSettingsError('');

      try {
        const [officesResult, regionsResult, itemsResult, locationsResult, balancesResult, batchesResult] = await Promise.all([
          supabase
            .from('marketing_offices_with_regions')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('office_code', { ascending: true }),

          supabase
            .from('marketing_regions')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true }),
          supabase.from('marketing_inventory_items').select('*, category:marketing_inventory_categories(*)').eq('is_active', true).order('item_name'),
          supabase.from('marketing_inventory_locations').select('*').eq('is_active', true).order('sort_order').order('name'),
          supabase.from('marketing_inventory_quantity_balances').select('*'),
          supabase.from('marketing_inventory_batches').select('*').order('purchase_date', { ascending: false }),
        ]);

        const firstError = officesResult.error || regionsResult.error || itemsResult.error || locationsResult.error || balancesResult.error || batchesResult.error;
        if (firstError) throw firstError;

        if (!isMounted) return;

        setSettingsOffices(officesResult.data || []);
        setSettingsRegions(regionsResult.data || []);
        setInventoryItems(itemsResult.data || []);
        setInventoryLocations(locationsResult.data || []);
        setInventoryBalances(balancesResult.data || []);
        setInventoryBatches(batchesResult.data || []);
      } catch (error) {
        console.error('Error loading Activity office/region settings:', error);

        if (isMounted) {
          setSettingsError(
            error?.message ||
              'Could not load offices and regions from Marketing Settings.'
          );
          setSettingsOffices([]);
          setSettingsRegions([]);
        }
      } finally {
        if (isMounted) { setSettingsLoading(false); setInventoryLoading(false); }
      }
    };

    loadSettingsOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadExistingRoutes = async () => {
     if (!editingActivity?.id || formData.activityType !== ACTIVITY_TYPES.MAILER) {
  return;
}

      setRouteLoading(true);
      setRouteError('');

      try {
        const { data, error } = await supabase
          .from('marketing_mailer_routes')
          .select('*')
          .eq('activity_id', editingActivity.id)
          .order('zip_code', { ascending: true })
          .order('route_id', { ascending: true });

        if (error) throw error;
        if (!isMounted) return;

        updateFormRef.current(
          'eddmRoutes',
          (data || []).map((row) => ({
            id: row.id,
            routeType: row.route_type || 'C',
            routeNumber: row.route_number || row.route_id || '',
            zipCode: row.zip_code || '',
            mailPieces: row.mail_pieces ?? row.total_count ?? '',
            averageHouseholdIncome: row.average_household_income ?? '',
            notes: row.route_notes || row.notes || '',
          }))
        );
      } catch (error) {
        console.error('Error loading EDDM routes:', error);
        if (isMounted) {
          setRouteError(error?.message || 'Could not load EDDM routes.');
        }
      } finally {
        if (isMounted) setRouteLoading(false);
      }
    };

    loadExistingRoutes();

    return () => {
      isMounted = false;
    };
  }, [editingActivity?.id, formData.activityType]);

  const eddmRoutes = Array.isArray(formData.eddmRoutes)
    ? formData.eddmRoutes
    : [];

  const addEddmRoute = () => {
    updateForm('eddmRoutes', [...eddmRoutes, emptyEddmRoute()]);
  };

  const updateEddmRoute = (routeId, field, value) => {
    updateForm(
      'eddmRoutes',
      eddmRoutes.map((route) =>
        route.id === routeId ? { ...route, [field]: value } : route
      )
    );
  };

  const removeEddmRoute = (routeId) => {
    updateForm(
      'eddmRoutes',
      eddmRoutes.filter((route) => route.id !== routeId)
    );
  };

  const handleOfficeChange = (officeCode) => {
    const selectedOffice = settingsOffices.find(
      (office) => office.office_code === officeCode
    );

    updateForm('office', officeCode);

    if (selectedOffice) {
      updateForm(
        'region',
        selectedOffice.region_name ||
          settingsRegions.find(
            (region) => region.id === selectedOffice.region_id
          )?.name ||
          ''
      );
    }
  };

  const selectedOfficeRecord = settingsOffices.find(
    (office) => office.office_code === formData.office
  );
  const selectedRegionRecord = settingsRegions.find(
    (region) => region.name === formData.region
  );

  const inventoryActivityTypes = [
    ACTIVITY_TYPES.MAILER,
    ACTIVITY_TYPES.GORILLA_STREET_FLYERS,
    ACTIVITY_TYPES.CAR_TO_CAR_FLYERS,
    ACTIVITY_TYPES.BUSINESS_TO_BUSINESS_FLYERS,
    ACTIVITY_TYPES.BUSINESS_CARDS,
    ACTIVITY_TYPES.DOOR_HANGERS,
  ];
  const usesInventory = inventoryActivityTypes.includes(formData.activityType);

  const expectedCategoryKey = {
    [ACTIVITY_TYPES.MAILER]: 'mailers',
    [ACTIVITY_TYPES.GORILLA_STREET_FLYERS]: 'flyers',
    [ACTIVITY_TYPES.CAR_TO_CAR_FLYERS]: 'flyers',
    [ACTIVITY_TYPES.BUSINESS_TO_BUSINESS_FLYERS]: 'flyers',
    [ACTIVITY_TYPES.BUSINESS_CARDS]: 'business_cards',
    [ACTIVITY_TYPES.DOOR_HANGERS]: 'door_hangers',
  }[formData.activityType];

  const scopedInventoryItems = inventoryItems.filter((item) => {
    if (item.category?.tracking_mode !== 'quantity') return false;
    if (expectedCategoryKey && inventoryItems.some((row) => row.category?.key === expectedCategoryKey) && item.category?.key !== expectedCategoryKey) return false;
    if (item.assignment_scope === 'office') return item.assigned_office_id === selectedOfficeRecord?.id;
    if (item.assignment_scope === 'region') return item.assigned_region_id === (selectedOfficeRecord?.region_id || selectedRegionRecord?.id);
    return item.assignment_scope === 'hq';
  });

  const selectedInventoryItem = inventoryItems.find((item) => item.id === formData.inventoryItemId);
  const locationBalances = inventoryBalances.filter(
    (row) => row.item_id === formData.inventoryItemId
  );
  const availableInventoryLocations = inventoryLocations.filter((location) => {
    const balance = Number(locationBalances.find((row) => row.location_id === location.id)?.quantity_on_hand || 0);
    const isEditingLocation = editingActivity?.inventoryLocationId === location.id && editingActivity?.inventoryItemId === formData.inventoryItemId;
    return balance > 0 || isEditingLocation;
  });
  const selectedBalance = Number(locationBalances.find((row) => row.location_id === formData.inventoryLocationId)?.quantity_on_hand || 0);
  const editingQuantityCredit = editingActivity?.inventoryItemId === formData.inventoryItemId && editingActivity?.inventoryLocationId === formData.inventoryLocationId
    ? Number(editingActivity.activityType === ACTIVITY_TYPES.MAILER ? (editingActivity.distributedQuantity || editingActivity.quantity || 0) : (editingActivity.quantity || 0))
    : 0;
  const availableBefore = selectedBalance + editingQuantityCredit;
  const quantityUsed = Number(formData.activityType === ACTIVITY_TYPES.MAILER ? (formData.distributedQuantity || 0) : (formData.quantity || 0));
  const remainingAfter = Math.max(0, availableBefore - quantityUsed);
  const itemBatches = inventoryBatches.filter((batch) => batch.item_id === formData.inventoryItemId);
  const purchasedTotal = itemBatches.reduce((sum, batch) => sum + Number(batch.quantity_purchased || 0), 0);
  const acquisitionTotal = itemBatches.reduce((sum, batch) => sum + Number(batch.purchase_cost || 0) + Number(batch.shipping_cost || 0) + Number(batch.other_cost || 0), 0);
  const inventoryUnitCost = purchasedTotal > 0 ? acquisitionTotal / purchasedTotal : 0;
  const inventoryValueUsed = inventoryUnitCost * quantityUsed;

  const typeMeta = ACTIVITY_TYPE_META[formData.activityType] || ACTIVITY_TYPE_META.other;
  const statusMeta = getActivityStatusMeta(formData.status);
  const canUploadPhotos = !!editingActivity?.id;

  const isMailer = formData.activityType === ACTIVITY_TYPES.MAILER;
  const totalCost = Number(formData.cost || 0);
  const quantity = Number(formData.quantity || 0);
  const purchasedQuantity = formData.inventoryItemId ? availableBefore : Number(formData.purchasedQuantity || 0);
  const distributedQuantity = Number(
    isMailer ? (formData.distributedQuantity || 0) : formData.quantity || 0
  );
  const remainingQuantity = isMailer
    ? Math.max(0, purchasedQuantity - distributedQuantity)
    : 0;
  const productionCost = formData.inventoryItemId ? 0 : Number(formData.productionCost || 0);
  const distributionCost = Number(formData.distributionCost || 0);
  const otherCost = Number(formData.otherCost || 0);
  const productionCostPerPiece = purchasedQuantity > 0
    ? productionCost / purchasedQuantity
    : 0;
  const distributionCostPerPiece = distributedQuantity > 0
    ? distributionCost / distributedQuantity
    : 0;
  const productionValueUsed = productionCostPerPiece * distributedQuantity;
  const runCost = formData.inventoryItemId ? inventoryValueUsed + distributionCost + otherCost : (isMailer ? productionValueUsed + distributionCost + otherCost : totalCost);
  const costPerDistributedItem = distributedQuantity > 0
    ? runCost / distributedQuantity
    : 0;
  const remainingInventoryValue = productionCostPerPiece * remainingQuantity;
  const costPerPiece = quantity > 0 ? totalCost / quantity : 0;

  const previewStats = useMemo(() => (
    isMailer
      ? [
          ['Office', formData.office || '—'],
          ['Purchased', formatQuantity(purchasedQuantity)],
          ['Distributed', formatQuantity(distributedQuantity)],
          ['Remaining', formatQuantity(remainingQuantity)],
        ]
      : [
          ['Office', formData.office || '—'],
          ['Quantity', formatQuantity(formData.quantity)],
          ['Total Cost', formatActivityCost(formData.cost)],
          ['Cost / Item', quantity > 0 ? formatActivityCost(costPerPiece) : '—'],
        ]
  ), [
    isMailer,
    formData.office,
    formData.quantity,
    formData.cost,
    purchasedQuantity,
    distributedQuantity,
    remainingQuantity,
    quantity,
    costPerPiece,
  ]);

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
        {settingsError && <div className={styles.errorBanner}>{settingsError}</div>}

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
              <select
                value={formData.office || ''}
                onChange={(event) => handleOfficeChange(event.target.value)}
                disabled={settingsLoading}
              >
                <option value="">
                  {settingsLoading ? 'Loading Offices...' : 'Select Office'}
                </option>

                {formData.office &&
                  !settingsOffices.some(
                    (office) => office.office_code === formData.office
                  ) && (
                    <option value={formData.office}>
                      {formData.office} (Existing)
                    </option>
                  )}

                {settingsOffices.map((office) => (
                  <option key={office.id} value={office.office_code}>
                    {office.office_code}
                    {office.office_name ? ` · ${office.office_name}` : ''}
                    {office.city ? ` · ${office.city}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Region
              <select
                value={formData.region || ''}
                onChange={(event) => updateForm('region', event.target.value)}
                disabled={settingsLoading}
              >
                <option value="">
                  {settingsLoading ? 'Loading Regions...' : 'Select Region'}
                </option>

                {formData.region &&
                  !settingsRegions.some(
                    (region) => region.name === formData.region
                  ) && (
                    <option value={formData.region}>
                      {formData.region} (Existing)
                    </option>
                  )}

                {settingsRegions.map((region) => (
                  <option key={region.id} value={region.name}>
                    {region.name}
                  </option>
                ))}
              </select>
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
            {usesInventory ? (
              <div className={styles.fullWidth} style={{ display: 'grid', gap: 10, border: '1px solid #bfdbfe', borderRadius: 14, padding: 12, background: '#eff6ff' }}>
                <div>
                  <strong style={{ color: '#0f172a' }}>Inventory Used</strong>
                  <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 750, fontSize: 12 }}>
                    Select the inventory item and the location it is physically coming from. Saving the activity deducts the quantity automatically.
                  </p>
                </div>
                <div className={styles.formGrid}>
                  <label className={styles.fullWidth}>
                    Inventory Item
                    <select value={formData.inventoryItemId || ''} onChange={(event) => { updateForm('inventoryItemId', event.target.value); updateForm('inventoryLocationId', ''); }} disabled={inventoryLoading}>
                      <option value="">{inventoryLoading ? 'Loading Inventory...' : 'Select Inventory Item'}</option>
                      {scopedInventoryItems.map((item) => (
                        <option key={item.id} value={item.id}>{item.sku ? `${item.sku} · ` : ''}{item.item_name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Use Inventory From
                    <select value={formData.inventoryLocationId || ''} onChange={(event) => updateForm('inventoryLocationId', event.target.value)} disabled={!formData.inventoryItemId}>
                      <option value="">Select Location</option>
                      {availableInventoryLocations.map((location) => (
                        <option key={location.id} value={location.id}>{location.location_type === 'hq' ? 'HQ Warehouse' : location.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Available Before
                    <input type="number" value={availableBefore} readOnly style={{ background: '#e2e8f0', fontWeight: 950 }} />
                  </label>
                  <label>
                    {isMailer ? 'Distributed This Activity' : 'Quantity Used'}
                    <input type="number" min="0" value={isMailer ? formData.distributedQuantity : formData.quantity} onChange={(event) => updateForm(isMailer ? 'distributedQuantity' : 'quantity', event.target.value)} />
                  </label>
                  <label>
                    Remaining After
                    <input type="number" value={remainingAfter} readOnly style={{ background: '#e2e8f0', fontWeight: 950 }} />
                  </label>
                </div>
                {selectedInventoryItem && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
                    <div style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 10, background: '#fff' }}><span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950 }}>SKU</span><strong>{selectedInventoryItem.sku || '—'}</strong></div>
                    <div style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 10, background: '#fff' }}><span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950 }}>INVENTORY COST / ITEM</span><strong>{formatActivityCost(inventoryUnitCost)}</strong></div>
                    <div style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 10, background: '#fff' }}><span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950 }}>VALUE USED</span><strong>{formatActivityCost(inventoryValueUsed)}</strong></div>
                  </div>
                )}
              </div>
            ) : (
              <label>
                Quantity
                <input type="number" value={formData.quantity} onChange={(event) => updateForm('quantity', event.target.value)} placeholder="500" />
              </label>
            )}

            <div className={styles.fullWidth} style={{ display: 'grid', gap: 10, border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#f8fafc' }}>
              <div>
                <strong style={{ color: '#0f172a' }}>Cost Breakdown</strong>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 750, fontSize: 12 }}>
                  Inventory production cost is already tracked in Inventory. Activity spend includes distribution + other costs only.
                </p>
              </div>

              <div className={styles.formGrid}>
                {!formData.inventoryItemId && (
                  <label>
                    Production Cost
                    <input type="number" min="0" step="0.01" value={formData.productionCost} onChange={(event) => updateForm('productionCost', event.target.value)} placeholder="0.00" />
                    <small style={{ color: '#64748b', fontWeight: 750 }}>Printing, design, materials, creative production.</small>
                  </label>
                )}

                <label>
                  Distribution Cost
                  <input type="number" min="0" step="0.01" value={formData.distributionCost} onChange={(event) => updateForm('distributionCost', event.target.value)} placeholder="0.00" />
                  <small style={{ color: '#64748b', fontWeight: 750 }}>Postage, delivery, distribution labor, setup.</small>
                </label>

                <label>
                  Other Cost
                  <input type="number" min="0" step="0.01" value={formData.otherCost} onChange={(event) => updateForm('otherCost', event.target.value)} placeholder="0.00" />
                  <small style={{ color: '#64748b', fontWeight: 750 }}>Permits or miscellaneous campaign expenses.</small>
                </label>

                <label>
                  Total Activity Cost
                  <input type="number" step="0.01" value={formData.cost} readOnly style={{ background: '#e2e8f0', fontWeight: 950 }} />
                  <small style={{ color: '#64748b', fontWeight: 750 }}>Calculated automatically.</small>
                </label>

                <label className={styles.fullWidth}>
                  Production Notes
                  <input value={formData.productionNotes} onChange={(event) => updateForm('productionNotes', event.target.value)} placeholder="Example: 10,000 postcards, design and printing" />
                </label>

                <label className={styles.fullWidth}>
                  Distribution Notes
                  <input value={formData.distributionNotes} onChange={(event) => updateForm('distributionNotes', event.target.value)} placeholder="Example: USPS EDDM postage / delivery labor" />
                </label>

                <label className={styles.fullWidth}>
                  Other Cost Notes
                  <input value={formData.otherCostNotes} onChange={(event) => updateForm('otherCostNotes', event.target.value)} placeholder="Optional miscellaneous cost details" />
                </label>
              </div>

              {isMailer ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                    <div style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 10, background: '#eff6ff' }}>
                      <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>Production / Piece</span>
                      <strong style={{ color: '#0369a1', fontSize: 16 }}>{purchasedQuantity > 0 ? formatActivityCost(productionCostPerPiece) : '—'}</strong>
                    </div>
                    <div style={{ border: '1px solid #fde68a', borderRadius: 12, padding: 10, background: '#fffbeb' }}>
                      <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>Distribution / Mailed</span>
                      <strong style={{ color: '#92400e', fontSize: 16 }}>{distributedQuantity > 0 ? formatActivityCost(distributionCostPerPiece) : '—'}</strong>
                    </div>
                    <div style={{ border: '1px solid #bbf7d0', borderRadius: 12, padding: 10, background: '#ecfdf5' }}>
                      <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>True Cost / Mailed</span>
                      <strong style={{ color: '#166534', fontSize: 16 }}>{distributedQuantity > 0 ? formatActivityCost(costPerDistributedItem) : '—'}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, background: '#ffffff' }}>
                      <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>Production Value Used</span>
                      <strong style={{ color: '#0f172a', fontSize: 14 }}>{formatActivityCost(productionValueUsed)}</strong>
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, background: '#ffffff' }}>
                      <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>This Run Cost</span>
                      <strong style={{ color: '#0f172a', fontSize: 14 }}>{formatActivityCost(runCost)}</strong>
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, background: '#ffffff' }}>
                      <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>Remaining Inventory Value</span>
                      <strong style={{ color: '#0f172a', fontSize: 14 }}>{formatActivityCost(remainingInventoryValue)}</strong>
                    </div>
                    <div style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 10, background: '#eff6ff' }}>
                      <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>Total Cash Spend</span>
                      <strong style={{ color: '#0369a1', fontSize: 14 }}>{formatActivityCost(totalCost)}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <div style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 10, background: '#eff6ff' }}>
                    <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>Total Cost</span>
                    <strong style={{ color: '#0369a1', fontSize: 16 }}>{formatActivityCost(totalCost)}</strong>
                  </div>
                  <div style={{ border: '1px solid #bbf7d0', borderRadius: 12, padding: 10, background: '#ecfdf5' }}>
                    <span style={{ display: 'block', color: '#64748b', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>Cost / Item</span>
                    <strong style={{ color: '#166534', fontSize: 16 }}>{quantity > 0 ? formatActivityCost(costPerPiece) : '—'}</strong>
                  </div>
                </div>
              )}
            </div>

            <label>
              Estimated Reach
              <input type="number" value={formData.estimatedReach} onChange={(event) => updateForm('estimatedReach', event.target.value)} placeholder="1500" />
            </label>

            <label>
              City
              <input value={formData.city} onChange={(event) => updateForm('city', event.target.value)} placeholder="Merced" />
            </label>

            {isMailer && (
              <div
                className={styles.fullWidth}
                style={{
                  border: '1px solid #bfdbfe',
                  borderRadius: 14,
                  padding: 13,
                  background: '#f8fbff',
                  display: 'grid',
                  gap: 11,
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
                  <div>
                    <strong style={{ color: '#075985' }}>Selected EDDM Routes</strong>
                    <small
                      style={{
                        display: 'block',
                        color: '#64748b',
                        fontWeight: 750,
                        marginTop: 3,
                      }}
                    >
                      Record the actual USPS carrier routes used for this mailer activity.
                    </small>
                  </div>

                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={addEddmRoute}
                  >
                    + Add Route
                  </button>
                </div>

                {routeError && (
                  <div className={styles.errorBanner}>{routeError}</div>
                )}

                {routeLoading ? (
                  <div style={{ color: '#64748b', fontWeight: 800 }}>
                    Loading routes...
                  </div>
                ) : eddmRoutes.length === 0 ? (
                  <div
                    style={{
                      border: '1px dashed #cbd5e1',
                      borderRadius: 12,
                      padding: 12,
                      color: '#64748b',
                      fontWeight: 800,
                      background: '#ffffff',
                    }}
                  >
                    No EDDM routes added yet. Click <strong>+ Add Route</strong>.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {eddmRoutes.map((route, index) => {
                      const normalizedRoute = normalizeRoutePreview(
                        route.routeType,
                        route.routeNumber
                      );

                      const routeTypeMeta =
                        USPS_ROUTE_TYPES.find(
                          (option) => option.value === route.routeType
                        ) || USPS_ROUTE_TYPES[0];

                      return (
                        <div
                          key={route.id}
                          style={{
                            border: '1px solid #dbe4ee',
                            borderRadius: 13,
                            padding: 12,
                            background: '#ffffff',
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
                            }}
                          >
                            <strong style={{ color: '#0f172a' }}>
                              Route {index + 1}
                            </strong>

                            <button
                              type="button"
                              onClick={() => removeEddmRoute(route.id)}
                              style={{
                                border: '1px solid #fecaca',
                                background: '#fff7f7',
                                color: '#b91c1c',
                                borderRadius: 9,
                                padding: '6px 9px',
                                fontWeight: 900,
                                cursor: 'pointer',
                              }}
                            >
                              Remove
                            </button>
                          </div>

                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns:
                                'repeat(2,minmax(0,1fr))',
                              gap: 10,
                            }}
                          >
                            <label>
                              Route Type
                              <select
                                value={route.routeType || 'C'}
                                onChange={(event) =>
                                  updateEddmRoute(
                                    route.id,
                                    'routeType',
                                    event.target.value
                                  )
                                }
                              >
                                {USPS_ROUTE_TYPES.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.value} — {option.label}
                                  </option>
                                ))}
                              </select>
                              <small
                                style={{
                                  display: 'block',
                                  color: '#64748b',
                                  marginTop: 3,
                                  fontWeight: 750,
                                }}
                              >
                                {routeTypeMeta.eddm}
                              </small>
                            </label>

                            <label>
                              Route Number
                              <input
                                value={route.routeNumber || ''}
                                onChange={(event) =>
                                  updateEddmRoute(
                                    route.id,
                                    'routeNumber',
                                    event.target.value
                                  )
                                }
                                placeholder="001"
                              />
                            </label>

                            <label>
                              Normalized Route
                              <input
                                value={normalizedRoute}
                                readOnly
                                style={{
                                  background: '#f1f5f9',
                                  fontWeight: 950,
                                }}
                              />
                            </label>

                            <label>
                              ZIP Code
                              <input
                                value={route.zipCode || ''}
                                onChange={(event) =>
                                  updateEddmRoute(
                                    route.id,
                                    'zipCode',
                                    event.target.value
                                      .replace(/[^0-9]/g, '')
                                      .slice(0, 5)
                                  )
                                }
                                placeholder="95023"
                                inputMode="numeric"
                                maxLength={5}
                              />
                            </label>

                            <label>
                              Mail Pieces
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={route.mailPieces ?? ''}
                                onChange={(event) =>
                                  updateEddmRoute(
                                    route.id,
                                    'mailPieces',
                                    event.target.value
                                  )
                                }
                                placeholder="742"
                              />
                            </label>

                            <label>
                              Avg Household Income
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={route.averageHouseholdIncome ?? ''}
                                onChange={(event) =>
                                  updateEddmRoute(
                                    route.id,
                                    'averageHouseholdIncome',
                                    event.target.value
                                  )
                                }
                                placeholder="78500"
                              />
                            </label>
                          </div>

                          <label>
                            Notes
                            <input
                              value={route.notes || ''}
                              onChange={(event) =>
                                updateEddmRoute(
                                  route.id,
                                  'notes',
                                  event.target.value
                                )
                              }
                              placeholder="Optional route notes"
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!isMailer && (
              <label className={styles.fullWidth}>
                ZIP Codes
                <input
                  value={formData.zipCodes}
                  onChange={(event) =>
                    updateForm('zipCodes', event.target.value)
                  }
                  placeholder="95340, 95341, 95348"
                />
              </label>
            )}

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
              {isMailer ? (
                <>
                  <span>Inventory Available Before: {formatQuantity(purchasedQuantity)}</span>
                  <span>Distributed: {formatQuantity(distributedQuantity)}</span>
                  <span>Remaining After: {formatQuantity(formData.inventoryItemId ? remainingAfter : remainingQuantity)}</span>
                </>
              ) : (
                <span>Quantity: {formatQuantity(formData.quantity)}</span>
              )}
              <span>Production Cost: {formatActivityCost(formData.productionCost)}</span>
              <span>Distribution Cost: {formatActivityCost(formData.distributionCost)}</span>
              <span>Other Cost: {formatActivityCost(formData.otherCost)}</span>
              <span>Total Cost: {formatActivityCost(formData.cost)}</span>
              {isMailer ? (
                <>
                  <span>Production / Piece: {purchasedQuantity > 0 ? formatActivityCost(productionCostPerPiece) : '—'}</span>
                  <span>Distribution / Mailed Piece: {distributedQuantity > 0 ? formatActivityCost(distributionCostPerPiece) : '—'}</span>
                  <span>This Run Cost: {formatActivityCost(runCost)}</span>
                  <span>True Cost / Mailed Piece: {distributedQuantity > 0 ? formatActivityCost(costPerDistributedItem) : '—'}</span>
                  <span>Remaining Inventory Value: {formatActivityCost(remainingInventoryValue)}</span>
                </>
              ) : (
                <span>Cost / Item: {quantity > 0 ? formatActivityCost(costPerPiece) : '—'}</span>
              )}
            </div>
          </div>
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
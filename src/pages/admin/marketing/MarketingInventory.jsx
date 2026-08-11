// src/pages/admin/marketing/MarketingInventory.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import styles from '../MarketingOps.module.css';

const MOVEMENT_TYPES = [
  { value: 'transfer', label: 'Transfer' },
  { value: 'assigned', label: 'Assign to Office / Region' },
  { value: 'consumed', label: 'Consumed / Used' },
  { value: 'returned', label: 'Returned' },
  { value: 'replacement', label: 'Replacement' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'lost', label: 'Lost' },
  { value: 'stolen', label: 'Stolen' },
  { value: 'repair', label: 'Sent for Repair' },
  { value: 'retired', label: 'Retired' },
  { value: 'adjustment', label: 'Adjustment' },
];

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatNumber = (value) =>
  Number(value || 0).toLocaleString('en-US');

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(String(value).slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const cardStyle = {
  border: '1px solid #dbe4ee',
  borderRadius: 16,
  background: '#ffffff',
  boxShadow: '0 10px 24px rgba(15,23,42,0.05)',
};

const fieldStyle = {
  display: 'grid',
  gap: 6,
  fontSize: 12,
  fontWeight: 900,
  color: '#334155',
};

const inputStyle = {
  width: '100%',
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  padding: '10px 11px',
  background: '#ffffff',
  color: '#0f172a',
  boxSizing: 'border-box',
  fontWeight: 750,
};

const primaryButtonStyle = {
  border: '1px solid #0ea5e9',
  borderRadius: 10,
  padding: '9px 12px',
  background: '#0ea5e9',
  color: '#ffffff',
  fontWeight: 950,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  padding: '9px 12px',
  background: '#ffffff',
  color: '#334155',
  fontWeight: 900,
  cursor: 'pointer',
};



const emptyItemForm = {
  item_name: '',
  category_id: '',
  sku: '',
  description: '',
  minimum_stock: '0',
  notes: '',

  assignment_scope: 'hq',
  assigned_region_id: '',
  assigned_office_id: '',

  create_initial_stock: true,
  initial_quantity: '',
  initial_purchase_cost: '',
  initial_shipping_cost: '',
  initial_other_cost: '',
  initial_vendor_id: '',
  initial_campaign_id: '',
  initial_invoice_number: '',
  initial_purchase_order: '',
  initial_purchase_date: todayKey(),
  initial_receive_location_id: '',
};

const emptyMovementForm = {
  item_id: '',
  unit_id: '',
  movement_type: 'transfer',
  quantity: '',
  from_location_id: '',
  to_location_id: '',
  distribution_cost: '',
  reason: '',
  notes: '',
};

const getStatusMeta = (status) => {
  const map = {
    available: { label: 'Available', bg: '#dcfce7', color: '#166534' },
    assigned: { label: 'Assigned', bg: '#dbeafe', color: '#1d4ed8' },
    in_use: { label: 'In Use', bg: '#e0f2fe', color: '#0369a1' },
    damaged: { label: 'Damaged', bg: '#fee2e2', color: '#b91c1c' },
    lost: { label: 'Lost', bg: '#fef3c7', color: '#92400e' },
    stolen: { label: 'Stolen', bg: '#fee2e2', color: '#991b1b' },
    repair: { label: 'Repair', bg: '#ede9fe', color: '#6d28d9' },
    retired: { label: 'Retired', bg: '#e5e7eb', color: '#4b5563' },
  };

  return map[status] || { label: status || 'Unknown', bg: '#f1f5f9', color: '#475569' };
};

const StatusBadge = ({ status }) => {
  const meta = getStatusMeta(status);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '4px 8px',
        background: meta.bg,
        color: meta.color,
        fontSize: 10,
        fontWeight: 950,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
};

const ModalShell = ({ title, subtitle, onClose, children }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 3000,
      background: 'rgba(15,23,42,0.55)',
      display: 'grid',
      placeItems: 'center',
      padding: 18,
      overflowY: 'auto',
    }}
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <div
      style={{
        width: 'min(980px, 100%)',
        maxHeight: '92vh',
        overflowY: 'auto',
        borderRadius: 18,
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        boxShadow: '0 24px 70px rgba(15,23,42,0.28)',
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 3,
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#0f172a' }}>{title}</h3>
          {subtitle && (
            <p style={{ margin: '5px 0 0', color: '#64748b', fontWeight: 750, fontSize: 12 }}>
              {subtitle}
            </p>
          )}
        </div>

        <button type="button" style={secondaryButtonStyle} onClick={onClose}>
          Close
        </button>
      </div>

      <div style={{ padding: 16 }}>{children}</div>
    </div>
  </div>
);

const MarketingInventory = () => {
  const [activeTab, setActiveTab] = useState('overview');

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [units, setUnits] = useState([]);
  const [movements, setMovements] = useState([]);
  const [batches, setBatches] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [settingsOffices, setSettingsOffices] = useState([]);
  const [settingsRegions, setSettingsRegions] = useState([]);
  const [selectedInventoryLocationId, setSelectedInventoryLocationId] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modal, setModal] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [movementForm, setMovementForm] = useState(emptyMovementForm);

  const showSuccess = (message) => {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(''), 3500);
  };

  const loadInventory = async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const [
        categoriesResult,
        itemsResult,
        locationsResult,
        balancesResult,
        unitsResult,
        movementsResult,
        batchesResult,
        vendorsResult,
        campaignsResult,
        officesResult,
        regionsResult,
      ] = await Promise.all([
        supabase
          .from('marketing_inventory_categories')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),

        supabase
          .from('marketing_inventory_items')
          .select('*, category:marketing_inventory_categories(*)')
          .eq('is_active', true)
          .order('item_name', { ascending: true }),

        supabase
          .from('marketing_inventory_locations')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),

        supabase
          .from('marketing_inventory_quantity_balances')
          .select('*'),

        supabase
          .from('marketing_inventory_units')
          .select(`
            *,
            item:marketing_inventory_items(
              id,
              item_name,
              category_id
            ),
            location:marketing_inventory_locations(
              id,
              name,
              location_type
            )
          `)
          .order('created_at', { ascending: false }),

        supabase
          .from('marketing_inventory_movements')
          .select(`
            *,
            item:marketing_inventory_items(id,item_name),
            unit:marketing_inventory_units!marketing_inventory_movements_unit_fkey(id,asset_tag),
            from_location:marketing_inventory_locations!marketing_inventory_movements_from_location_fkey(id,name,location_type),
            to_location:marketing_inventory_locations!marketing_inventory_movements_to_location_fkey(id,name,location_type)
          `)
          .order('movement_date', { ascending: false })
          .limit(300),

        supabase
          .from('marketing_inventory_batches')
          .select(`
            *,
            item:marketing_inventory_items(id,item_name),
            destination:marketing_inventory_locations(id,name,location_type),
            vendor:marketing_vendors(id,vendor_name),
            campaign:marketing_campaigns(id,name,status)
          `)
          .order('purchase_date', { ascending: false })
          .limit(200),

        supabase
          .from('marketing_vendors')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('vendor_name', { ascending: true }),

        supabase
          .from('marketing_campaigns')
          .select('id,name,status,start_date,end_date')
          .in('status', ['planned', 'active', 'paused'])
          .order('start_date', { ascending: false, nullsFirst: false })
          .order('name', { ascending: true }),

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
      ]);

      const firstError = [
        categoriesResult.error,
        itemsResult.error,
        locationsResult.error,
        balancesResult.error,
        unitsResult.error,
        movementsResult.error,
        batchesResult.error,
        vendorsResult.error,
        campaignsResult.error,
        officesResult.error,
        regionsResult.error,
      ].find(Boolean);

      if (firstError) throw firstError;

      setCategories(categoriesResult.data || []);
      setItems(itemsResult.data || []);
      setLocations(locationsResult.data || []);
      setBalances(balancesResult.data || []);
      setUnits(unitsResult.data || []);
      setMovements(movementsResult.data || []);
      setBatches(batchesResult.data || []);
      setVendors(vendorsResult.data || []);
      setCampaigns(campaignsResult.data || []);
      setSettingsOffices(officesResult.data || []);
      setSettingsRegions(regionsResult.data || []);
    } catch (error) {
      console.error('Error loading Marketing Inventory:', error);
      setErrorMessage(error?.message || 'Could not load Marketing Inventory.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const hqLocation = useMemo(
    () => locations.find((location) => location.location_type === 'hq'),
    [locations]
  );

  const itemMap = useMemo(
    () => Object.fromEntries(items.map((item) => [item.id, item])),
    [items]
  );

  const locationMap = useMemo(
    () => Object.fromEntries(locations.map((location) => [location.id, location])),
    [locations]
  );

  const getAssignmentLabel = (item) => {
    if (!item) return '—';

    if (item.assignment_scope === 'office') {
      const office = settingsOffices.find(
        (row) => row.id === item.assigned_office_id
      );

      return office
        ? `📍 ${office.office_code}${office.office_name ? ` · ${office.office_name}` : ''}`
        : '📍 Office';
    }

    if (item.assignment_scope === 'region') {
      const region = settingsRegions.find(
        (row) => row.id === item.assigned_region_id
      );

      return region ? `🗺️ ${region.name}` : '🗺️ Region';
    }

    return '🏢 HQ';
  };

  const getAllowedLocationsForItem = (item) => {
    if (!item) return locations;

    const hq = locations.find((location) => location.location_type === 'hq');
    const allowed = [];

    if (hq) allowed.push(hq);

    if (item.assignment_scope === 'office') {
      const officeLocation = locations.find(
        (location) =>
          location.location_type === 'office' &&
          location.office_id === item.assigned_office_id
      );

      if (officeLocation) allowed.push(officeLocation);

      return allowed.filter(
        (location, index, array) =>
          array.findIndex((row) => row.id === location.id) === index
      );
    }

    if (item.assignment_scope === 'region') {
      const regionLocation = locations.find(
        (location) =>
          location.location_type === 'region' &&
          location.region_id === item.assigned_region_id
      );

      if (regionLocation) allowed.push(regionLocation);

      const officeIdsInRegion = new Set(
        settingsOffices
          .filter((office) => office.region_id === item.assigned_region_id)
          .map((office) => office.id)
      );

      locations
        .filter(
          (location) =>
            location.location_type === 'office' &&
            officeIdsInRegion.has(location.office_id)
        )
        .forEach((location) => allowed.push(location));

      return allowed.filter(
        (location, index, array) =>
          array.findIndex((row) => row.id === location.id) === index
      );
    }

    return locations;
  };

  const getDraftAllowedLocations = (draft) => {
    return getAllowedLocationsForItem({
      assignment_scope: draft.assignment_scope,
      assigned_region_id: draft.assigned_region_id || null,
      assigned_office_id: draft.assigned_office_id || null,
    });
  };

  const metrics = useMemo(() => {
    const consumableOnHand = balances.reduce(
      (sum, row) => sum + Math.max(0, Number(row.quantity_on_hand || 0)),
      0
    );

    const reusableActive = units.filter(
      (unit) => !['retired', 'lost', 'stolen'].includes(unit.status)
    ).length;

    const hqConsumables = balances
      .filter((row) => row.location_id === hqLocation?.id)
      .reduce((sum, row) => sum + Math.max(0, Number(row.quantity_on_hand || 0)), 0);

    const hqReusable = units.filter(
      (unit) =>
        unit.current_location_id === hqLocation?.id &&
        !['retired', 'lost', 'stolen'].includes(unit.status)
    ).length;

    const assignedReusable = units.filter(
      (unit) => ['assigned', 'in_use'].includes(unit.status)
    ).length;

    const attention = units.filter(
      (unit) => ['damaged', 'lost', 'stolen', 'repair'].includes(unit.status)
    ).length;

    return {
      items: items.length,
      consumableOnHand,
      reusableActive,
      hqStock: hqConsumables + hqReusable,
      assignedReusable,
      attention,
    };
  }, [balances, hqLocation, items.length, units]);

  const inventoryAlerts = useMemo(() => {
    return items
      .map((item) => {
        const quantityOnHand = balances
          .filter((row) => row.item_id === item.id)
          .reduce(
            (sum, row) =>
              sum + Math.max(0, Number(row.quantity_on_hand || 0)),
            0
          );

        const reusableOnHand = units.filter(
          (unit) =>
            unit.item_id === item.id &&
            !['retired', 'lost', 'stolen'].includes(unit.status)
        ).length;

        const available =
          item.category?.tracking_mode === 'individual'
            ? reusableOnHand
            : quantityOnHand;

        const minimum = Number(item.minimum_stock || 0);

        if (available <= 0) {
          return {
            item,
            available,
            minimum,
            level: 'out',
            label: 'Out of Stock',
          };
        }

        if (minimum > 0 && available <= minimum) {
          return {
            item,
            available,
            minimum,
            level: 'low',
            label: 'Low Stock',
          };
        }

        return null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.level !== b.level) return a.level === 'out' ? -1 : 1;
        return a.available - b.available;
      });
  }, [balances, items, units]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      if (categoryFilter !== 'all' && item.category_id !== categoryFilter) return false;

      if (query) {
        const haystack = [
          item.item_name,
          item.sku,
          item.description,
          item.notes,
          item.category?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(query)) return false;
      }

      if (locationFilter !== 'all') {
        const quantityHere = balances.some(
          (row) =>
            row.item_id === item.id &&
            row.location_id === locationFilter &&
            Number(row.quantity_on_hand || 0) > 0
        );

        const reusableHere = units.some(
          (unit) =>
            unit.item_id === item.id &&
            unit.current_location_id === locationFilter &&
            !['retired', 'lost', 'stolen'].includes(unit.status)
        );

        if (!quantityHere && !reusableHere) return false;
      }

      return true;
    });
  }, [balances, categoryFilter, items, locationFilter, search, units]);

  const filteredUnits = useMemo(() => {
    const query = search.trim().toLowerCase();

    return units.filter((unit) => {
      if (statusFilter !== 'all' && unit.status !== statusFilter) return false;
      if (locationFilter !== 'all' && unit.current_location_id !== locationFilter) return false;

      const item = itemMap[unit.item_id];
      if (categoryFilter !== 'all' && item?.category_id !== categoryFilter) return false;

      if (!query) return true;

      return [
        unit.asset_tag,
        unit.serial_number,
        unit.status,
        unit.condition,
        unit.notes,
        item?.item_name,
        unit.location?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [categoryFilter, itemMap, locationFilter, search, statusFilter, units]);

  const filteredMovements = useMemo(() => {
    const query = search.trim().toLowerCase();

    return movements.filter((movement) => {
      if (locationFilter !== 'all') {
        const matches =
          movement.from_location_id === locationFilter ||
          movement.to_location_id === locationFilter;

        if (!matches) return false;
      }

      if (!query) return true;

      return [
        movement.item?.item_name,
        movement.unit?.asset_tag,
        movement.movement_type,
        movement.reason,
        movement.notes,
        movement.from_location?.name,
        movement.to_location?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [locationFilter, movements, search]);

  const closeModal = () => {
    if (isSaving) return;
    setModal(null);
    setEditingItemId(null);
    setItemForm(emptyItemForm);
  };

  const openEditItem = (item) => {
    setEditingItemId(item.id);
    setItemForm({
      ...emptyItemForm,
      item_name: item.item_name || '',
      category_id: item.category_id || '',
      sku: item.sku || '',
      description: item.description || '',
      minimum_stock: String(item.minimum_stock ?? 0),
      notes: item.notes || '',
      assignment_scope: item.assignment_scope || 'hq',
      assigned_region_id: item.assigned_region_id || '',
      assigned_office_id: item.assigned_office_id || '',
      create_initial_stock: false,
    });
    setModal('item');
  };

  const saveItem = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');

    try {
      if (!itemForm.item_name.trim()) {
        throw new Error('Item name is required.');
      }

      if (!itemForm.category_id) {
        throw new Error('Category is required.');
      }

      if (
        itemForm.assignment_scope === 'region' &&
        !itemForm.assigned_region_id
      ) {
        throw new Error('Select the region this item belongs to.');
      }

      if (
        itemForm.assignment_scope === 'office' &&
        !itemForm.assigned_office_id
      ) {
        throw new Error('Select the office this item belongs to.');
      }

      const payload = {
        item_name: itemForm.item_name.trim(),
        category_id: itemForm.category_id,
        description: itemForm.description.trim() || null,
        minimum_stock: Number(itemForm.minimum_stock || 0),
        notes: itemForm.notes.trim() || null,
        assignment_scope: itemForm.assignment_scope || 'hq',
        assigned_region_id:
          itemForm.assignment_scope === 'region'
            ? itemForm.assigned_region_id || null
            : itemForm.assignment_scope === 'office'
              ? itemForm.assigned_region_id || null
              : null,
        assigned_office_id:
          itemForm.assignment_scope === 'office'
            ? itemForm.assigned_office_id || null
            : null,
      };

      let savedItem = null;

      if (editingItemId) {
        const { data, error } = await supabase
          .from('marketing_inventory_items')
          .update(payload)
          .eq('id', editingItemId)
          .select('*, category:marketing_inventory_categories(*)')
          .single();

        if (error) throw error;
        savedItem = data;
      } else {
        // SKU is intentionally NOT sent. Supabase generates it from the
        // selected category prefix.
        const { data, error } = await supabase
          .from('marketing_inventory_items')
          .insert(payload)
          .select('*, category:marketing_inventory_categories(*)')
          .single();

        if (error) throw error;
        savedItem = data;
      }

      const wasEditing = Boolean(editingItemId);

      if (
        !wasEditing &&
        itemForm.create_initial_stock &&
        Number(itemForm.initial_quantity || 0) > 0
      ) {
        const quantity = Number(itemForm.initial_quantity || 0);

        const receiveLocationId =
          itemForm.initial_receive_location_id ||
          hqLocation?.id ||
          '';

        if (!receiveLocationId) {
          throw new Error(
            'The item was created, but no receiving inventory location is available.'
          );
        }

        const allowedReceiveLocations =
          getAllowedLocationsForItem(savedItem);

        if (
          !allowedReceiveLocations.some(
            (location) => location.id === receiveLocationId
          )
        ) {
          throw new Error(
            'The item was created, but the selected receiving location is not allowed for this item.'
          );
        }

        const { data: batch, error: batchError } = await supabase
          .from('marketing_inventory_batches')
          .insert({
            item_id: savedItem.id,
            vendor_id: itemForm.initial_vendor_id || null,
            campaign_id: itemForm.initial_campaign_id || null,
            purchase_date:
              itemForm.initial_purchase_date || todayKey(),
            quantity_purchased: quantity,
            purchase_cost: Number(
              itemForm.initial_purchase_cost || 0
            ),
            shipping_cost: Number(
              itemForm.initial_shipping_cost || 0
            ),
            other_cost: Number(
              itemForm.initial_other_cost || 0
            ),
            destination_location_id: receiveLocationId,
            invoice_number:
              itemForm.initial_invoice_number.trim() || null,
            purchase_order:
              itemForm.initial_purchase_order.trim() || null,
            notes: 'Initial inventory created with item.',
          })
          .select()
          .single();

        if (batchError) throw batchError;

        if (savedItem.category?.tracking_mode === 'individual') {
          const unitRows = Array.from(
            { length: Math.floor(quantity) },
            () => ({
              item_id: savedItem.id,
              batch_id: batch.id,
              current_location_id: receiveLocationId,
              status:
                receiveLocationId === hqLocation?.id
                  ? 'available'
                  : 'assigned',
              condition: 'new',
              acquired_date:
                itemForm.initial_purchase_date || todayKey(),
              assigned_date:
                receiveLocationId === hqLocation?.id
                  ? null
                  : itemForm.initial_purchase_date || todayKey(),
            })
          );

          if (unitRows.length > 0) {
            const {
              data: createdUnits,
              error: unitError,
            } = await supabase
              .from('marketing_inventory_units')
              .insert(unitRows)
              .select();

            if (unitError) throw unitError;

            const movementRows = (createdUnits || []).map(
              (unit) => ({
                item_id: savedItem.id,
                batch_id: batch.id,
                unit_id: unit.id,
                movement_type: 'purchase',
                quantity: 1,
                to_location_id: receiveLocationId,
                reason: 'Initial inventory purchase',
              })
            );

            if (movementRows.length > 0) {
              const { error: movementError } = await supabase
                .from('marketing_inventory_movements')
                .insert(movementRows);

              if (movementError) throw movementError;
            }
          }
        } else {
          const { error: movementError } = await supabase
            .from('marketing_inventory_movements')
            .insert({
              item_id: savedItem.id,
              batch_id: batch.id,
              movement_type: 'purchase',
              quantity,
              to_location_id: receiveLocationId,
              reason: 'Initial inventory purchase',
            });

          if (movementError) throw movementError;
        }
      }

      setItemForm(emptyItemForm);
      setEditingItemId(null);
      setModal(null);

      showSuccess(
        wasEditing
          ? 'Inventory item updated.'
          : itemForm.create_initial_stock &&
              Number(itemForm.initial_quantity || 0) > 0
            ? 'Inventory item and initial stock created.'
            : 'Inventory item created.'
      );

      await loadInventory();
    } catch (error) {
      console.error('Inventory item save error:', error);
      setErrorMessage(
        error?.message || 'Could not save inventory item.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const saveMovement = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');

    try {
      const item = itemMap[movementForm.item_id];
      if (!item) throw new Error('Select an inventory item.');

      const isIndividual = item.category?.tracking_mode === 'individual';
      const allowedMovementLocations = getAllowedLocationsForItem(item);

      if (
        movementForm.to_location_id &&
        !allowedMovementLocations.some(
          (location) => location.id === movementForm.to_location_id
        )
      ) {
        throw new Error(
          'That destination is not allowed for this item assignment.'
        );
      }

      if (isIndividual) {
        const unit = units.find((row) => row.id === movementForm.unit_id);
        if (!unit) throw new Error('Select an individual asset tag.');

        const fromLocationId =
          unit.current_location_id ||
          movementForm.from_location_id ||
          null;

        const movementPayload = {
          item_id: item.id,
          unit_id: unit.id,
          movement_type: movementForm.movement_type,
          quantity: 1,
          from_location_id: fromLocationId,
          to_location_id: movementForm.to_location_id || null,
          distribution_cost: Number(movementForm.distribution_cost || 0),
          reason: movementForm.reason.trim() || null,
          notes: movementForm.notes.trim() || null,
        };

        const { error: movementError } = await supabase
          .from('marketing_inventory_movements')
          .insert(movementPayload);

        if (movementError) throw movementError;

        let nextStatus = unit.status;
        const update = {};

        if (movementForm.movement_type === 'stolen') nextStatus = 'stolen';
        else if (movementForm.movement_type === 'lost') nextStatus = 'lost';
        else if (movementForm.movement_type === 'damaged') nextStatus = 'damaged';
        else if (movementForm.movement_type === 'repair') nextStatus = 'repair';
        else if (movementForm.movement_type === 'retired') nextStatus = 'retired';
        else if (movementForm.movement_type === 'returned') nextStatus = 'available';
        else if (movementForm.movement_type === 'replacement') nextStatus = 'assigned';
        else if (movementForm.movement_type === 'assigned') nextStatus = 'assigned';
        else if (movementForm.movement_type === 'transfer') {
          nextStatus =
            movementForm.to_location_id === hqLocation?.id
              ? 'available'
              : 'assigned';
        }

        update.status = nextStatus;

        if (movementForm.to_location_id) {
          update.current_location_id = movementForm.to_location_id;
        }

        if (
          ['assigned', 'replacement', 'transfer'].includes(
            movementForm.movement_type
          ) &&
          movementForm.to_location_id &&
          movementForm.to_location_id !== hqLocation?.id
        ) {
          update.assigned_date = todayKey();
        }

        if (movementForm.movement_type === 'replacement') {
          update.last_replacement_date = todayKey();
        }

        if (movementForm.movement_type === 'damaged') {
          update.condition = 'damaged';
        }

        const { error: unitError } = await supabase
          .from('marketing_inventory_units')
          .update(update)
          .eq('id', unit.id);

        if (unitError) throw unitError;
      } else {
        const quantity = Number(movementForm.quantity || 0);
        if (quantity <= 0) throw new Error('Quantity must be greater than zero.');

        if (
          ['transfer', 'assigned', 'consumed', 'returned', 'lost', 'stolen', 'retired'].includes(
            movementForm.movement_type
          ) &&
          !movementForm.from_location_id
        ) {
          throw new Error('Select the From location.');
        }

        if (
          ['transfer', 'assigned', 'returned'].includes(movementForm.movement_type) &&
          !movementForm.to_location_id
        ) {
          throw new Error('Select the To location.');
        }

        const fromBalance = balances.find(
          (row) =>
            row.item_id === item.id &&
            row.location_id === movementForm.from_location_id
        );

        const available = Number(fromBalance?.quantity_on_hand || 0);

        if (
          movementForm.from_location_id &&
          movementForm.movement_type !== 'adjustment' &&
          quantity > available
        ) {
          throw new Error(
            `Only ${formatNumber(available)} available at the selected location.`
          );
        }

        const { error: movementError } = await supabase
          .from('marketing_inventory_movements')
          .insert({
            item_id: item.id,
            movement_type: movementForm.movement_type,
            quantity,
            from_location_id: movementForm.from_location_id || null,
            to_location_id: movementForm.to_location_id || null,
            distribution_cost: Number(movementForm.distribution_cost || 0),
            reason: movementForm.reason.trim() || null,
            notes: movementForm.notes.trim() || null,
          });

        if (movementError) throw movementError;
      }

      setMovementForm(emptyMovementForm);
      setModal(null);
      showSuccess('Inventory movement saved.');
      await loadInventory();
    } catch (error) {
      console.error('Inventory movement error:', error);
      setErrorMessage(error?.message || 'Could not save inventory movement.');
    } finally {
      setIsSaving(false);
    }
  };

  const pricedPurchaseHistory = useMemo(
    () =>
      batches.filter(
        (batch) =>
          Number(batch.purchase_cost || 0) > 0 ||
          Number(batch.shipping_cost || 0) > 0 ||
          Number(batch.other_cost || 0) > 0
      ),
    [batches]
  );

  const selectedMovementItem = itemMap[movementForm.item_id];

const allowedMovementLocations =
  getAllowedLocationsForItem(selectedMovementItem);

const draftAllowedReceiveLocations =
  getDraftAllowedLocations(itemForm);

  const selectedInventoryLocation = selectedInventoryLocationId
    ? locationMap[selectedInventoryLocationId]
    : null;

  const selectedLocationInventory = useMemo(() => {
    if (!selectedInventoryLocationId) {
      return {
        quantities: [],
        reusable: [],
      };
    }

    return {
      quantities: balances
        .filter(
          (row) =>
            row.location_id === selectedInventoryLocationId &&
            Number(row.quantity_on_hand || 0) > 0
        )
        .map((row) => ({
          ...row,
          item: itemMap[row.item_id],
        })),
      reusable: units.filter(
        (unit) =>
          unit.current_location_id === selectedInventoryLocationId &&
          !['retired', 'lost', 'stolen'].includes(unit.status)
      ),
    };
  }, [
    selectedInventoryLocationId,
    balances,
    itemMap,
    units,
  ]);

  const availableUnitsForMovement = useMemo(() => {
    if (!movementForm.item_id) return [];

    return units.filter(
      (unit) =>
        unit.item_id === movementForm.item_id &&
        !['retired', 'lost', 'stolen'].includes(unit.status)
    );
  }, [movementForm.item_id, units]);

  const locationSummary = useMemo(() => {
    return locations.map((location) => {
      const quantity = balances
        .filter((row) => row.location_id === location.id)
        .reduce(
          (sum, row) => sum + Math.max(0, Number(row.quantity_on_hand || 0)),
          0
        );

      const reusable = units.filter(
        (unit) =>
          unit.current_location_id === location.id &&
          !['retired', 'lost', 'stolen'].includes(unit.status)
      ).length;

      return {
        ...location,
        quantity,
        reusable,
      };
    });
  }, [balances, locations, units]);

  const inventoryHierarchy = useMemo(() => {
    const summaryMap = Object.fromEntries(
      locationSummary.map((location) => [location.id, location])
    );

    const hq =
      locationSummary.find((location) => location.location_type === 'hq') ||
      null;

    const regionLocations = locationSummary.filter(
      (location) => location.location_type === 'region'
    );

    const officeLocations = locationSummary.filter(
      (location) => location.location_type === 'office'
    );

    const officeSettingsById = Object.fromEntries(
      settingsOffices.map((office) => [office.id, office])
    );

    const regions = regionLocations.map((regionLocation) => {
      const offices = officeLocations
        .filter((officeLocation) => {
          const office = officeSettingsById[officeLocation.office_id];
          return office?.region_id === regionLocation.region_id;
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        ...regionLocation,
        offices,
        officeQuantity: offices.reduce(
          (sum, office) => sum + Number(office.quantity || 0),
          0
        ),
        officeReusable: offices.reduce(
          (sum, office) => sum + Number(office.reusable || 0),
          0
        ),
      };
    });

    const assignedOfficeIds = new Set(
      regions.flatMap((region) => region.offices.map((office) => office.id))
    );

    const unassignedOffices = officeLocations
      .filter((office) => !assignedOfficeIds.has(office.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      hq,
      regions,
      unassignedOffices,
      summaryMap,
    };
  }, [locationSummary, settingsOffices]);

  const LocationStockCard = ({ location, compact = false }) => (
    <button
      type="button"
      onClick={() => setSelectedInventoryLocationId(location.id)}
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: compact ? 11 : 14,
        background: '#ffffff',
        padding: compact ? 10 : 13,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 10,
        alignItems: 'center',
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <strong
          style={{
            color: '#334155',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {location.location_type === 'hq'
            ? '🏢 HQ Warehouse'
            : location.location_type === 'region'
              ? `🗺️ ${location.name}`
              : `📍 ${location.name}`}
        </strong>
        {!compact && (
          <small style={{ color: '#94a3b8', fontWeight: 800 }}>
            {location.location_type === 'region'
              ? 'Regional inventory'
              : location.location_type === 'office'
                ? 'Office inventory'
                : 'Central storage'}
          </small>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto auto',
          gap: compact ? 10 : 14,
          textAlign: 'right',
        }}
      >
        <div>
          <strong style={{ color: '#0f172a' }}>
            {formatNumber(location.quantity)}
          </strong>
          <small
            style={{
              display: 'block',
              color: '#64748b',
              fontWeight: 800,
              fontSize: 10,
            }}
          >
            qty
          </small>
        </div>
        <div>
          <strong style={{ color: '#0f172a' }}>
            {formatNumber(location.reusable)}
          </strong>
          <small
            style={{
              display: 'block',
              color: '#64748b',
              fontWeight: 800,
              fontSize: 10,
            }}
          >
            reusable
          </small>
        </div>
      </div>
    </button>
  );

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          ...cardStyle,
          padding: 16,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: '#0f172a' }}>Inventory Control</h2>
          <p style={{ margin: '5px 0 0', color: '#64748b', fontWeight: 750 }}>
            HQ warehouse stock, office assignments, consumables, reusable items,
            transfers, replacements, and history.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={loadInventory}
            disabled={isLoading}
          >
            Refresh
          </button>

          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => {
              setEditingItemId(null);
              setItemForm({
                ...emptyItemForm,
                initial_receive_location_id: hqLocation?.id || '',
              });
              setModal('item');
            }}
          >
            + New Item
          </button>

          <button
            type="button"
            style={primaryButtonStyle}
            onClick={() => {
              setMovementForm(emptyMovementForm);
              setModal('movement');
            }}
          >
            + Move / Assign
          </button>
        </div>
      </div>

      {errorMessage && <div className={styles.errorBanner}>{errorMessage}</div>}

      {successMessage && (
        <div
          style={{
            border: '1px solid #bbf7d0',
            background: '#f0fdf4',
            color: '#166534',
            padding: 11,
            borderRadius: 12,
            fontWeight: 900,
          }}
        >
          {successMessage}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5,minmax(0,1fr))',
          gap: 10,
        }}
      >
        {[
          ['Inventory Items', metrics.items, 'Master item types'],
          ['Consumables On Hand', formatNumber(metrics.consumableOnHand), 'Quantity tracked'],
          ['Reusable Active', formatNumber(metrics.reusableActive), 'Individual assets'],
          ['HQ Warehouse', formatNumber(metrics.hqStock), 'Available at HQ'],
          ['Needs Attention', formatNumber(metrics.attention), 'Lost, stolen, damaged, repair'],
        ].map(([label, value, note]) => (
          <div key={label} style={{ ...cardStyle, padding: 13 }}>
            <div
              style={{
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '.04em',
                fontSize: 9,
                fontWeight: 950,
              }}
            >
              {label}
            </div>
            <strong
              style={{
                display: 'block',
                marginTop: 5,
                color: '#0f172a',
                fontSize: 24,
              }}
            >
              {value}
            </strong>
            <small style={{ color: '#64748b', fontWeight: 750 }}>{note}</small>
          </div>
        ))}
      </div>

      {inventoryAlerts.length > 0 && (
        <div
          style={{
            ...cardStyle,
            padding: 14,
            borderColor: '#fed7aa',
            background: '#fffaf5',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            <div>
              <strong style={{ color: '#9a3412' }}>
                ⚠ Inventory Alerts
              </strong>
              <small
                style={{
                  display: 'block',
                  marginTop: 3,
                  color: '#9a3412',
                  fontWeight: 750,
                }}
              >
                Items that are out of stock or at/below their minimum stock level.
              </small>
            </div>

            <span
              style={{
                borderRadius: 999,
                padding: '5px 9px',
                background: '#ffedd5',
                color: '#9a3412',
                fontWeight: 950,
                fontSize: 11,
              }}
            >
              {inventoryAlerts.length} alert
              {inventoryAlerts.length === 1 ? '' : 's'}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
              gap: 8,
            }}
          >
            {inventoryAlerts.map((alert) => (
              <div
                key={alert.item.id}
                style={{
                  border: `1px solid ${
                    alert.level === 'out' ? '#fecaca' : '#fde68a'
                  }`,
                  borderRadius: 12,
                  padding: 10,
                  background:
                    alert.level === 'out' ? '#fff7f7' : '#fffbeb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div>
                  <strong style={{ color: '#334155' }}>
                    {alert.item.item_name}
                  </strong>
                  <small
                    style={{
                      display: 'block',
                      marginTop: 3,
                      color: '#64748b',
                      fontWeight: 800,
                    }}
                  >
                    {alert.item.sku || 'No SKU'} · {getAssignmentLabel(alert.item)}
                  </small>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <strong
                    style={{
                      display: 'block',
                      color:
                        alert.level === 'out' ? '#b91c1c' : '#92400e',
                    }}
                  >
                    {alert.label}
                  </strong>
                  <small
                    style={{
                      color: '#64748b',
                      fontWeight: 800,
                    }}
                  >
                    {formatNumber(alert.available)} available
                    {alert.minimum > 0
                      ? ` · Min ${formatNumber(alert.minimum)}`
                      : ''}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          ...cardStyle,
          padding: 10,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {[
          ['overview', 'Overview'],
          ['items', 'Items'],
          ['reusable', 'Reusable Assets'],
          ['movements', 'Movements'],
          ['history', 'Purchase History'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            style={
              activeTab === key
                ? primaryButtonStyle
                : secondaryButtonStyle
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          ...cardStyle,
          padding: 12,
          display: 'grid',
          gridTemplateColumns: '1.4fr repeat(3,minmax(150px,.65fr))',
          gap: 8,
        }}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search inventory, asset tag, office, notes..."
          style={inputStyle}
        />

        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          style={inputStyle}
        >
          <option value="all">All Categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.icon || ''} {category.name}
            </option>
          ))}
        </select>

        <select
          value={locationFilter}
          onChange={(event) => setLocationFilter(event.target.value)}
          style={inputStyle}
        >
          <option value="all">All Locations</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.location_type === 'hq'
                ? 'HQ Warehouse'
                : location.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          style={inputStyle}
        >
          <option value="all">All Reusable Statuses</option>
          <option value="available">Available</option>
          <option value="assigned">Assigned</option>
          <option value="in_use">In Use</option>
          <option value="damaged">Damaged</option>
          <option value="lost">Lost</option>
          <option value="stolen">Stolen</option>
          <option value="repair">Repair</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      {isLoading ? (
        <div style={{ ...cardStyle, padding: 22, textAlign: 'center' }}>
          Loading inventory...
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.15fr .85fr',
                gap: 12,
              }}
            >
              <div style={{ ...cardStyle, padding: 15 }}>
                <h3 style={{ margin: '0 0 4px' }}>Inventory by Location</h3>
                <p
                  style={{
                    margin: '0 0 14px',
                    color: '#64748b',
                    fontSize: 12,
                    fontWeight: 750,
                  }}
                >
                  HQ first, then each region with its offices grouped underneath.
                </p>

                <div style={{ display: 'grid', gap: 14 }}>
                  {inventoryHierarchy.hq && (
                    <div
                      style={{
                        border: '1px solid #bae6fd',
                        borderRadius: 15,
                        background: '#f0f9ff',
                        padding: 10,
                      }}
                    >
                      <LocationStockCard location={inventoryHierarchy.hq} />
                    </div>
                  )}

                  {inventoryHierarchy.regions.map((region) => (
                    <div
                      key={region.id}
                      style={{
                        border: '1px solid #dbe4ee',
                        borderRadius: 15,
                        background: '#f8fafc',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          padding: 11,
                          borderBottom: '1px solid #e2e8f0',
                          background: '#f1f5f9',
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <strong style={{ color: '#0f172a' }}>
                            🗺️ {region.name}
                          </strong>
                          <small
                            style={{
                              display: 'block',
                              marginTop: 2,
                              color: '#64748b',
                              fontWeight: 800,
                            }}
                          >
                            {region.offices.length} office
                            {region.offices.length === 1 ? '' : 's'}
                          </small>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            gap: 12,
                            color: '#475569',
                            fontWeight: 900,
                            fontSize: 12,
                          }}
                        >
                          <span>
                            {formatNumber(
                              Number(region.quantity || 0) +
                                Number(region.officeQuantity || 0)
                            )}{' '}
                            qty
                          </span>
                          <span>
                            {formatNumber(
                              Number(region.reusable || 0) +
                                Number(region.officeReusable || 0)
                            )}{' '}
                            reusable
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: 10,
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit,minmax(240px,1fr))',
                          gap: 8,
                        }}
                      >
                        {(Number(region.quantity || 0) > 0 ||
                          Number(region.reusable || 0) > 0) && (
                          <LocationStockCard location={region} compact />
                        )}

                        {region.offices.map((office) => (
                          <LocationStockCard
                            key={office.id}
                            location={office}
                            compact
                          />
                        ))}

                        {region.offices.length === 0 &&
                          Number(region.quantity || 0) === 0 &&
                          Number(region.reusable || 0) === 0 && (
                            <div
                              style={{
                                color: '#94a3b8',
                                fontWeight: 800,
                                padding: 8,
                              }}
                            >
                              No offices or stock in this region yet.
                            </div>
                          )}
                      </div>
                    </div>
                  ))}

                  {inventoryHierarchy.unassignedOffices.length > 0 && (
                    <div
                      style={{
                        border: '1px solid #fde68a',
                        borderRadius: 15,
                        background: '#fffbeb',
                        padding: 10,
                      }}
                    >
                      <strong style={{ color: '#92400e' }}>
                        Offices Without a Region
                      </strong>
                      <div
                        style={{
                          marginTop: 8,
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit,minmax(240px,1fr))',
                          gap: 8,
                        }}
                      >
                        {inventoryHierarchy.unassignedOffices.map((office) => (
                          <LocationStockCard
                            key={office.id}
                            location={office}
                            compact
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ ...cardStyle, padding: 15 }}>
                <h3 style={{ margin: '0 0 12px' }}>Recent Inventory Activity</h3>

                {movements.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontWeight: 800 }}>
                    No inventory movements yet.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {movements.slice(0, 10).map((movement) => (
                      <div
                        key={movement.id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          paddingBottom: 8,
                        }}
                      >
                        <strong style={{ color: '#334155' }}>
                          {movement.item?.item_name || 'Inventory Item'}
                        </strong>
                        <div
                          style={{
                            color: '#64748b',
                            fontSize: 12,
                            fontWeight: 750,
                            marginTop: 3,
                          }}
                        >
                          {movement.movement_type} · {formatNumber(movement.quantity)}
                          {' · '}
                          {movement.from_location?.name || '—'} →{' '}
                          {movement.to_location?.name || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'items' && (
            <div style={{ display: 'grid', gap: 10 }}>
              {filteredItems.length === 0 ? (
                <div style={{ ...cardStyle, padding: 20 }}>
                  No inventory items match the filters.
                </div>
              ) : (
                filteredItems.map((item) => {
                  const totalQuantity = balances
                    .filter((row) => row.item_id === item.id)
                    .reduce(
                      (sum, row) =>
                        sum + Math.max(0, Number(row.quantity_on_hand || 0)),
                      0
                    );

                  const activeUnits = units.filter(
                    (unit) =>
                      unit.item_id === item.id &&
                      !['retired', 'lost', 'stolen'].includes(unit.status)
                  ).length;

                  const availableAmount =
                    item.category?.tracking_mode === 'individual'
                      ? activeUnits
                      : totalQuantity;

                  const lowStock =
                    Number(item.minimum_stock || 0) > 0 &&
                    availableAmount <= Number(item.minimum_stock || 0);

                  return (
                    <div
                      key={item.id}
                      style={{
                        ...cardStyle,
                        padding: 14,
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <strong style={{ color: '#0f172a', fontSize: 15 }}>
                            {item.item_name}
                          </strong>

                          {lowStock && (
                            <span
                              style={{
                                borderRadius: 999,
                                padding: '4px 8px',
                                background: '#fef3c7',
                                color: '#92400e',
                                fontSize: 10,
                                fontWeight: 950,
                              }}
                            >
                              Low Stock
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            marginTop: 4,
                            color: '#64748b',
                            fontSize: 12,
                            fontWeight: 750,
                          }}
                        >
                          {item.category?.icon || '📦'} {item.category?.name || 'Uncategorized'}
                          {' · '}
                          {item.category?.handling_type || '—'}
                          {' · '}
                          {item.category?.tracking_mode || '—'}
                          {item.sku ? ` · SKU ${item.sku}` : ''}
                        </div>

                        <div
                          style={{
                            marginTop: 7,
                            display: 'flex',
                            gap: 7,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                          }}
                        >
                          <span
                            style={{
                              borderRadius: 999,
                              padding: '5px 8px',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              fontSize: 10,
                              fontWeight: 950,
                            }}
                          >
                            Assigned: {getAssignmentLabel(item)}
                          </span>

                          {locations
                            .filter((location) => {
                              const qty = balances.find(
                                (row) =>
                                  row.item_id === item.id &&
                                  row.location_id === location.id &&
                                  Number(row.quantity_on_hand || 0) > 0
                              );

                              const reusableCount = units.filter(
                                (unit) =>
                                  unit.item_id === item.id &&
                                  unit.current_location_id === location.id &&
                                  !['retired', 'lost', 'stolen'].includes(
                                    unit.status
                                  )
                              ).length;

                              return qty || reusableCount > 0;
                            })
                            .map((location) => {
                              const qty =
                                balances.find(
                                  (row) =>
                                    row.item_id === item.id &&
                                    row.location_id === location.id
                                )?.quantity_on_hand || 0;

                              const reusableCount = units.filter(
                                (unit) =>
                                  unit.item_id === item.id &&
                                  unit.current_location_id === location.id &&
                                  !['retired', 'lost', 'stolen'].includes(
                                    unit.status
                                  )
                              ).length;

                              const amount =
                                item.category?.tracking_mode === 'individual'
                                  ? reusableCount
                                  : qty;

                              return (
                                <button
                                  key={location.id}
                                  type="button"
                                  onClick={() =>
                                    setSelectedInventoryLocationId(location.id)
                                  }
                                  style={{
                                    border: '1px solid #e2e8f0',
                                    background: '#ffffff',
                                    color: '#475569',
                                    borderRadius: 999,
                                    padding: '5px 8px',
                                    fontSize: 10,
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {location.location_type === 'hq'
                                    ? '🏢 HQ'
                                    : location.location_type === 'region'
                                      ? `🗺️ ${location.name}`
                                      : `📍 ${location.name}`}
                                  : {formatNumber(amount)}
                                </button>
                              );
                            })}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 12,
                        }}
                      >
                        <div style={{ textAlign: 'right' }}>
                          <strong
                            style={{
                              display: 'block',
                              color: '#0f172a',
                              fontSize: 22,
                            }}
                          >
                            {formatNumber(availableAmount)}
                          </strong>
                          <small style={{ color: '#64748b', fontWeight: 800 }}>
                            {item.category?.unit_label || 'items'} available
                          </small>
                        </div>

                        <button
                          type="button"
                          style={secondaryButtonStyle}
                          onClick={() => openEditItem(item)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'reusable' && (
            <div style={{ ...cardStyle, overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: 900,
                }}
              >
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {[
                      'Asset Tag',
                      'Item',
                      'Current Location',
                      'Status',
                      'Condition',
                      'Assigned',
                      'Last Replacement',
                    ].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          padding: 11,
                          textAlign: 'left',
                          borderBottom: '1px solid #e2e8f0',
                          color: '#64748b',
                          fontSize: 10,
                          textTransform: 'uppercase',
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredUnits.map((unit) => (
                    <tr key={unit.id}>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        <strong>{unit.asset_tag}</strong>
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {unit.item?.item_name || '—'}
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {unit.location?.name || '—'}
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        <StatusBadge status={unit.status} />
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {unit.condition || '—'}
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {formatDate(unit.assigned_date)}
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {formatDate(unit.last_replacement_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredUnits.length === 0 && (
                <div style={{ padding: 20, color: '#94a3b8', fontWeight: 800 }}>
                  No reusable items match the filters.
                </div>
              )}
            </div>
          )}

          {activeTab === 'movements' && (
            <div style={{ ...cardStyle, overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: 1000,
                }}
              >
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {[
                      'Date',
                      'Item',
                      'Asset Tag',
                      'Action',
                      'Quantity',
                      'From',
                      'To',
                      'Cost',
                      'Reason',
                    ].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          padding: 11,
                          textAlign: 'left',
                          borderBottom: '1px solid #e2e8f0',
                          color: '#64748b',
                          fontSize: 10,
                          textTransform: 'uppercase',
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {formatDate(movement.movement_date)}
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        <strong>{movement.item?.item_name || '—'}</strong>
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {movement.unit?.asset_tag || '—'}
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {movement.movement_type}
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {formatNumber(movement.quantity)}
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {movement.from_location?.name || '—'}
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {movement.to_location?.name || '—'}
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {formatCurrency(movement.distribution_cost)}
                      </td>
                      <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                        {movement.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'history' && (
            <div style={{ ...cardStyle, overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: 1040,
                }}
              >
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {[
                      'Purchase Date',
                      'Item',
                      'Quantity',
                      'Destination',
                      'Campaign',
                      'Purchase',
                      'Shipping',
                      'Other',
                      'Total',
                      'Invoice',
                    ].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          padding: 11,
                          textAlign: 'left',
                          borderBottom: '1px solid #e2e8f0',
                          color: '#64748b',
                          fontSize: 10,
                          textTransform: 'uppercase',
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {pricedPurchaseHistory.map((batch) => {
                    const total =
                      Number(batch.purchase_cost || 0) +
                      Number(batch.shipping_cost || 0) +
                      Number(batch.other_cost || 0);

                    return (
                      <tr key={batch.id}>
                        <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                          {formatDate(batch.purchase_date)}
                        </td>
                        <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                          <strong>{batch.item?.item_name || '—'}</strong>
                        </td>
                        <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                          {formatNumber(batch.quantity_purchased)}
                        </td>
                        <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                          {batch.destination?.name || '—'}
                        </td>
                        <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                          {batch.campaign?.name || '—'}
                        </td>
                        <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                          {formatCurrency(batch.purchase_cost)}
                        </td>
                        <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                          {formatCurrency(batch.shipping_cost)}
                        </td>
                        <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                          {formatCurrency(batch.other_cost)}
                        </td>
                        <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                          <strong>{formatCurrency(total)}</strong>
                        </td>
                        <td style={{ padding: 11, borderBottom: '1px solid #f1f5f9' }}>
                          {batch.invoice_number || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {pricedPurchaseHistory.length === 0 && (
                <div
                  style={{
                    padding: 20,
                    color: '#94a3b8',
                    fontWeight: 800,
                  }}
                >
                  No priced purchases yet. Purchase history is created when a New Item is entered with purchase / production cost.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {modal === 'item' && (
        <ModalShell
          title={
            editingItemId
              ? 'Edit Inventory Item'
              : 'Add Inventory Item'
          }
          subtitle={
            editingItemId
              ? 'Update item details and HQ / Region / Office assignment.'
              : 'Create the item, let the system generate the SKU, and optionally receive the first purchase immediately.'
          }
          onClose={closeModal}
        >
          <form
            onSubmit={saveItem}
            style={{ display: 'grid', gap: 14 }}
          >
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: 13,
                display: 'grid',
                gap: 11,
              }}
            >
              <strong style={{ color: '#0f172a' }}>
                Item Details
              </strong>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                }}
              >
                <label style={fieldStyle}>
                  Item Name
                  <input
                    style={inputStyle}
                    value={itemForm.item_name}
                    onChange={(event) =>
                      setItemForm((prev) => ({
                        ...prev,
                        item_name: event.target.value,
                      }))
                    }
                    placeholder="2026 Tax Mailer"
                  />
                </label>

                <label style={fieldStyle}>
                  Category
                  <select
                    style={inputStyle}
                    value={itemForm.category_id}
                    onChange={(event) =>
                      setItemForm((prev) => ({
                        ...prev,
                        category_id: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select Category</option>
                    {categories.map((category) => (
                      <option
                        key={category.id}
                        value={category.id}
                      >
                        {category.icon || ''} {category.name}
                        {category.sku_prefix
                          ? ` · ${category.sku_prefix}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={fieldStyle}>
                  SKU
                  <input
                    style={{
                      ...inputStyle,
                      background: '#f8fafc',
                      color: '#64748b',
                    }}
                    value={
                      editingItemId
                        ? itemForm.sku || ''
                        : itemForm.category_id
                          ? `${
                              categories.find(
                                (category) =>
                                  category.id === itemForm.category_id
                              )?.sku_prefix || 'AUTO'
                            }-####`
                          : 'Select a category'
                    }
                    readOnly
                  />
                  <small
                    style={{
                      color: '#94a3b8',
                      fontWeight: 750,
                    }}
                  >
                    Generated automatically from the category.
                  </small>
                </label>

                <label style={fieldStyle}>
                  Minimum Stock
                  <input
                    type="number"
                    min="0"
                    style={inputStyle}
                    value={itemForm.minimum_stock}
                    onChange={(event) =>
                      setItemForm((prev) => ({
                        ...prev,
                        minimum_stock: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <label style={fieldStyle}>
                Description
                <textarea
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  value={itemForm.description}
                  onChange={(event) =>
                    setItemForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldStyle}>
                Notes
                <textarea
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  value={itemForm.notes}
                  onChange={(event) =>
                    setItemForm((prev) => ({
                      ...prev,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div
              style={{
                border: '1px solid #bfdbfe',
                borderRadius: 14,
                padding: 13,
                display: 'grid',
                gap: 11,
                background: '#f8fbff',
              }}
            >
              <strong style={{ color: '#1d4ed8' }}>
                Item Assignment
              </strong>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
                  gap: 8,
                }}
              >
                {[
                  ['hq', '🏢 HQ'],
                  ['region', '🗺️ Region'],
                  ['office', '📍 Office'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setItemForm((prev) => ({
                        ...prev,
                        assignment_scope: value,
                        assigned_region_id:
                          value === 'region'
                            ? prev.assigned_region_id
                            : '',
                        assigned_office_id:
                          value === 'office'
                            ? prev.assigned_office_id
                            : '',
                        initial_receive_location_id:
                          hqLocation?.id ||
                          prev.initial_receive_location_id,
                      }))
                    }
                    style={
                      itemForm.assignment_scope === value
                        ? primaryButtonStyle
                        : secondaryButtonStyle
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              {itemForm.assignment_scope === 'region' && (
                <label style={fieldStyle}>
                  Assigned Region
                  <select
                    style={inputStyle}
                    value={itemForm.assigned_region_id}
                    onChange={(event) =>
                      setItemForm((prev) => ({
                        ...prev,
                        assigned_region_id: event.target.value,
                        assigned_office_id: '',
                      }))
                    }
                  >
                    <option value="">Select Region</option>
                    {settingsRegions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {itemForm.assignment_scope === 'office' && (
                <label style={fieldStyle}>
                  Assigned Office
                  <select
                    style={inputStyle}
                    value={itemForm.assigned_office_id}
                    onChange={(event) => {
                      const officeId = event.target.value;
                      const office = settingsOffices.find(
                        (row) => row.id === officeId
                      );

                      setItemForm((prev) => ({
                        ...prev,
                        assigned_office_id: officeId,
                        assigned_region_id:
                          office?.region_id || '',
                      }));
                    }}
                  >
                    <option value="">Select Office</option>
                    {settingsOffices.map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.office_code}
                        {office.office_name
                          ? ` · ${office.office_name}`
                          : ''}
                        {office.region_name
                          ? ` · ${office.region_name}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <small
                style={{
                  color: '#64748b',
                  fontWeight: 750,
                }}
              >
                This controls who the item belongs to. Physical
                inventory can still sit at HQ until it is moved.
              </small>
            </div>

            {!editingItemId && (
              <div
                style={{
                  border: '1px solid #bbf7d0',
                  borderRadius: 14,
                  padding: 13,
                  display: 'grid',
                  gap: 11,
                  background: '#f0fdf4',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: '#166534',
                    fontWeight: 950,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={itemForm.create_initial_stock}
                    onChange={(event) =>
                      setItemForm((prev) => ({
                        ...prev,
                        create_initial_stock:
                          event.target.checked,
                      }))
                    }
                  />
                  Add initial stock now
                </label>

                {itemForm.create_initial_stock && (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(2,minmax(0,1fr))',
                        gap: 10,
                      }}
                    >
                      <label style={fieldStyle}>
                        Quantity Purchased
                        <input
                          type="number"
                          min="0"
                          step="1"
                          style={inputStyle}
                          value={itemForm.initial_quantity}
                          onChange={(event) =>
                            setItemForm((prev) => ({
                              ...prev,
                              initial_quantity:
                                event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label style={fieldStyle}>
                        Purchase Date
                        <input
                          type="date"
                          style={inputStyle}
                          value={
                            itemForm.initial_purchase_date
                          }
                          onChange={(event) =>
                            setItemForm((prev) => ({
                              ...prev,
                              initial_purchase_date:
                                event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label style={fieldStyle}>
                        Production / Purchase Cost
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          style={inputStyle}
                          value={
                            itemForm.initial_purchase_cost
                          }
                          onChange={(event) =>
                            setItemForm((prev) => ({
                              ...prev,
                              initial_purchase_cost:
                                event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label style={fieldStyle}>
                        Shipping Cost
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          style={inputStyle}
                          value={
                            itemForm.initial_shipping_cost
                          }
                          onChange={(event) =>
                            setItemForm((prev) => ({
                              ...prev,
                              initial_shipping_cost:
                                event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label style={fieldStyle}>
                        Other Cost
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          style={inputStyle}
                          value={itemForm.initial_other_cost}
                          onChange={(event) =>
                            setItemForm((prev) => ({
                              ...prev,
                              initial_other_cost:
                                event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label style={fieldStyle}>
                        Vendor
                        <select
                          style={inputStyle}
                          value={itemForm.initial_vendor_id}
                          onChange={(event) =>
                            setItemForm((prev) => ({
                              ...prev,
                              initial_vendor_id:
                                event.target.value,
                            }))
                          }
                        >
                          <option value="">No Vendor</option>
                          {vendors.map((vendor) => (
                            <option
                              key={vendor.id}
                              value={vendor.id}
                            >
                              {vendor.vendor_name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label style={fieldStyle}>
                        Purchased For Campaign
                        <select
                          style={inputStyle}
                          value={itemForm.initial_campaign_id}
                          onChange={(event) =>
                            setItemForm((prev) => ({
                              ...prev,
                              initial_campaign_id:
                                event.target.value,
                            }))
                          }
                        >
                          <option value="">No Campaign / General Inventory</option>
                          {campaigns.map((campaign) => (
                            <option
                              key={campaign.id}
                              value={campaign.id}
                            >
                              {campaign.name}
                              {campaign.status ? ` · ${campaign.status}` : ''}
                            </option>
                          ))}
                        </select>
                        <small
                          style={{
                            color: '#64748b',
                            fontWeight: 750,
                          }}
                        >
                          Optional. Use this when the purchase was made specifically for a campaign.
                        </small>
                      </label>

                      <label style={fieldStyle}>
                        Invoice #
                        <input
                          style={inputStyle}
                          value={
                            itemForm.initial_invoice_number
                          }
                          onChange={(event) =>
                            setItemForm((prev) => ({
                              ...prev,
                              initial_invoice_number:
                                event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label style={fieldStyle}>
                        Purchase Order
                        <input
                          style={inputStyle}
                          value={
                            itemForm.initial_purchase_order
                          }
                          onChange={(event) =>
                            setItemForm((prev) => ({
                              ...prev,
                              initial_purchase_order:
                                event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>

                    <label style={fieldStyle}>
                      Receive Inventory At
                      <select
                        style={inputStyle}
                        value={
                          itemForm.initial_receive_location_id
                        }
                        onChange={(event) =>
                          setItemForm((prev) => ({
                            ...prev,
                            initial_receive_location_id:
                              event.target.value,
                          }))
                        }
                      >
                        <option value="">
                          Select Receiving Location
                        </option>
                        {draftAllowedReceiveLocations.map(
                          (location) => (
                            <option
                              key={location.id}
                              value={location.id}
                            >
                              {location.location_type === 'hq'
                                ? 'HQ Warehouse'
                                : location.name}
                            </option>
                          )
                        )}
                      </select>
                      <small
                        style={{
                          color: '#64748b',
                          fontWeight: 750,
                        }}
                      >
                        HQ is the default. If a purchase / production price is entered, this initial entry will appear in Purchase History. If you select a campaign, the full purchase will also be reported as inventory purchased specifically for that campaign.
                      </small>
                    </label>
                  </>
                )}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={closeModal}
                disabled={isSaving}
              >
                Cancel
              </button>

              <button
                type="submit"
                style={primaryButtonStyle}
                disabled={isSaving}
              >
                {isSaving
                  ? 'Saving...'
                  : editingItemId
                    ? 'Save Changes'
                    : 'Create Item'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {modal === 'movement' && (
        <ModalShell
          title="Move / Assign Inventory"
          subtitle="Transfer stock, assign reusable items, consume materials, or record stolen/damaged/replacement history."
          onClose={closeModal}
        >
          <form onSubmit={saveMovement} style={{ display: 'grid', gap: 12 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <label style={fieldStyle}>
                Inventory Item
                <select
                  style={inputStyle}
                  value={movementForm.item_id}
                  onChange={(event) =>
                    setMovementForm((prev) => ({
                      ...prev,
                      item_id: event.target.value,
                      unit_id: '',
                      quantity: '',
                    }))
                  }
                >
                  <option value="">Select Item</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.item_name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStyle}>
                Action
                <select
                  style={inputStyle}
                  value={movementForm.movement_type}
                  onChange={(event) =>
                    setMovementForm((prev) => ({
                      ...prev,
                      movement_type: event.target.value,
                    }))
                  }
                >
                  {MOVEMENT_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {selectedMovementItem?.category?.tracking_mode === 'individual' ? (
                <label style={fieldStyle}>
                  Individual Asset
                  <select
                    style={inputStyle}
                    value={movementForm.unit_id}
                    onChange={(event) =>
                      setMovementForm((prev) => ({
                        ...prev,
                        unit_id: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select Asset Tag</option>
                    {availableUnitsForMovement.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.asset_tag} · {unit.location?.name || 'Unknown'} ·{' '}
                        {unit.status}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label style={fieldStyle}>
                  Quantity
                  <input
                    type="number"
                    min="0"
                    step="1"
                    style={inputStyle}
                    value={movementForm.quantity}
                    onChange={(event) =>
                      setMovementForm((prev) => ({
                        ...prev,
                        quantity: event.target.value,
                      }))
                    }
                  />
                </label>
              )}

              {selectedMovementItem?.category?.tracking_mode !== 'individual' && (
                <label style={fieldStyle}>
                  From
                  <select
                    style={inputStyle}
                    value={movementForm.from_location_id}
                    onChange={(event) =>
                      setMovementForm((prev) => ({
                        ...prev,
                        from_location_id: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select From Location</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.location_type === 'hq'
                          ? 'HQ Warehouse'
                          : location.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label style={fieldStyle}>
                To
                <select
                  style={inputStyle}
                  value={movementForm.to_location_id}
                  onChange={(event) =>
                    setMovementForm((prev) => ({
                      ...prev,
                      to_location_id: event.target.value,
                    }))
                  }
                >
                  <option value="">None / Status Only</option>
                  {allowedMovementLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.location_type === 'hq'
                        ? 'HQ Warehouse'
                        : location.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStyle}>
                Delivery / Distribution Cost
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  style={inputStyle}
                  value={movementForm.distribution_cost}
                  onChange={(event) =>
                    setMovementForm((prev) => ({
                      ...prev,
                      distribution_cost: event.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldStyle}>
                Reason
                <input
                  style={inputStyle}
                  value={movementForm.reason}
                  onChange={(event) =>
                    setMovementForm((prev) => ({
                      ...prev,
                      reason: event.target.value,
                    }))
                  }
                  placeholder="Replenishment, stolen, replacement..."
                />
              </label>
            </div>

            <label style={fieldStyle}>
              Notes
              <textarea
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
                value={movementForm.notes}
                onChange={(event) =>
                  setMovementForm((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
              />
            </label>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={closeModal}
                disabled={isSaving}
              >
                Cancel
              </button>

              <button
                type="submit"
                style={primaryButtonStyle}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Movement'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {selectedInventoryLocation && (
        <ModalShell
          title={
            selectedInventoryLocation.location_type === 'hq'
              ? 'HQ Warehouse Inventory'
              : `${selectedInventoryLocation.name} Inventory`
          }
          subtitle="Everything physically recorded at this location."
          onClose={() => setSelectedInventoryLocationId(null)}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <div style={{ ...cardStyle, padding: 12 }}>
                <small
                  style={{
                    color: '#64748b',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                  }}
                >
                  Consumable Lines
                </small>
                <strong
                  style={{
                    display: 'block',
                    marginTop: 4,
                    fontSize: 24,
                  }}
                >
                  {selectedLocationInventory.quantities.length}
                </strong>
              </div>

              <div style={{ ...cardStyle, padding: 12 }}>
                <small
                  style={{
                    color: '#64748b',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                  }}
                >
                  Reusable Units
                </small>
                <strong
                  style={{
                    display: 'block',
                    marginTop: 4,
                    fontSize: 24,
                  }}
                >
                  {selectedLocationInventory.reusable.length}
                </strong>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 13 }}>
              <h4 style={{ margin: '0 0 10px' }}>
                Consumable Inventory
              </h4>

              {selectedLocationInventory.quantities.length ===
              0 ? (
                <div
                  style={{
                    color: '#94a3b8',
                    fontWeight: 800,
                  }}
                >
                  No consumable inventory at this location.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 7 }}>
                  {selectedLocationInventory.quantities.map(
                    (row) => (
                      <div
                        key={`${row.item_id}-${row.location_id}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '9px 0',
                          borderBottom:
                            '1px solid #f1f5f9',
                        }}
                      >
                        <div>
                          <strong>
                            {row.item?.item_name ||
                              row.item_name}
                          </strong>
                          <small
                            style={{
                              display: 'block',
                              color: '#64748b',
                              marginTop: 2,
                              fontWeight: 750,
                            }}
                          >
                            {row.item?.sku || 'No SKU'} ·{' '}
                            {getAssignmentLabel(row.item)}
                          </small>
                        </div>

                        <strong>
                          {formatNumber(
                            row.quantity_on_hand
                          )}
                        </strong>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <div style={{ ...cardStyle, padding: 13 }}>
              <h4 style={{ margin: '0 0 10px' }}>
                Reusable Inventory
              </h4>

              {selectedLocationInventory.reusable.length ===
              0 ? (
                <div
                  style={{
                    color: '#94a3b8',
                    fontWeight: 800,
                  }}
                >
                  No reusable assets at this location.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 7 }}>
                  {selectedLocationInventory.reusable.map(
                    (unit) => (
                      <div
                        key={unit.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            '1fr auto auto',
                          gap: 10,
                          alignItems: 'center',
                          padding: '9px 0',
                          borderBottom:
                            '1px solid #f1f5f9',
                        }}
                      >
                        <div>
                          <strong>
                            {unit.item?.item_name ||
                              'Reusable Item'}
                          </strong>
                          <small
                            style={{
                              display: 'block',
                              color: '#64748b',
                              marginTop: 2,
                              fontWeight: 750,
                            }}
                          >
                            {unit.asset_tag}
                          </small>
                        </div>

                        <StatusBadge status={unit.status} />

                        <span
                          style={{
                            color: '#64748b',
                            fontWeight: 800,
                          }}
                        >
                          {unit.condition}
                        </span>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </ModalShell>
      )}

    </section>
  );
};

export default MarketingInventory
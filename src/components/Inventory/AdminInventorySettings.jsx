import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import styles from './Inventory.module.css';
import AdminInventoryReports from './AdminInventoryReports';
import AdminInventoryItemApprovals from './AdminInventoryItemApprovals';

const CATEGORIES = [
  'Breakroom',
  'IT Equipment',
  'Marketing Materials',
  'Safety/PPE',
  'Office Supplies',
  'Other',
];

const UNITS = ['each', 'ream', 'roll', 'box', 'pack', 'case', 'bottle', 'bag'];

const emptyForm = {
  id: null,
  item_name: '',
  category: 'Office Supplies',
  description: '',
  unit: 'each',
  active: true,
};

const normalizeOffice = (value) => String(value || '').trim().toUpperCase();
const asNumber = (value) => Math.max(0, Number(value || 0));

const alertVisual = (status) => {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'out') {
    return {
      label: 'OUT',
      background: '#fef2f2',
      border: '#fecaca',
      text: '#b91c1c',
      rowBackground: '#fffafa',
    };
  }

  if (normalized === 'low') {
    return {
      label: 'LOW',
      background: '#fff7ed',
      border: '#fed7aa',
      text: '#c2410c',
      rowBackground: '#fffdf8',
    };
  }

  return {
    label: 'HEALTHY',
    background: '#f0fdf4',
    border: '#bbf7d0',
    text: '#15803d',
    rowBackground: '#fbfffc',
  };
};

const fetchAllRows = async (table, select = '*', orderColumns = []) => {
  const pageSize = 1000;
  let from = 0;
  let rows = [];

  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    orderColumns.forEach((column) => {
      query = query.order(column);
    });

    const { data, error } = await query;
    if (error) return { data: null, error };

    const page = data || [];
    rows = rows.concat(page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return { data: rows, error: null };
};

export default function AdminInventorySettings() {
  const [inventoryAdminTab, setInventoryAdminTab] = useState('catalog');

  // Master catalog
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Standard inventory
  const [packages, setPackages] = useState([]);
  const [packageItems, setPackageItems] = useState([]);
  const [packageOffices, setPackageOffices] = useState([]);
  const [activeOffices, setActiveOffices] = useState([]);
  const [packageLoading, setPackageLoading] = useState(false);
  const [packageMessage, setPackageMessage] = useState('');
  const [savingStandard, setSavingStandard] = useState(false);
  const [standardItemIds, setStandardItemIds] = useState([]);
  const [standardOfficeCodes, setStandardOfficeCodes] = useState([]);
  const [alertDrafts, setAlertDrafts] = useState({});
  const [itemToAdd, setItemToAdd] = useState('');
  const [manageOfficesOpen, setManageOfficesOpen] = useState(false);
  const [standardSearch, setStandardSearch] = useState('');

  // Alerts
  const [alerts, setAlerts] = useState([]);
  const [alertOffices, setAlertOffices] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertFilter, setAlertFilter] = useState('open');
  const [selectedAlertOfficeCode, setSelectedAlertOfficeCode] = useState(null);
  const [alertOfficeSearch, setAlertOfficeSearch] = useState('');

  // Mass distributions
  const [massOpen, setMassOpen] = useState(false);
  const [massName, setMassName] = useState('');
  const [massNotes, setMassNotes] = useState('');
  const [massItemToAdd, setMassItemToAdd] = useState('');
  const [massQtyToAdd, setMassQtyToAdd] = useState('');
  const [massLines, setMassLines] = useState([]);
  const [massOverrideLineIndex, setMassOverrideLineIndex] = useState(null);
  const [massSaving, setMassSaving] = useState(false);
  const [distributionHistory, setDistributionHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .order('category')
      .order('sort_order')
      .order('item_name');

    if (error) {
      setMessage(`Error: ${error.message}`);
      setItems([]);
    } else {
      setItems(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const loadStandardInventory = useCallback(async () => {
    setPackageLoading(true);
    setPackageMessage('');

    const [packageResult, itemResult, officeResult, directoryResult] = await Promise.all([
      supabase.from('inventory_package_summary').select('*').order('package_name'),
      supabase
        .from('inventory_package_items')
        .select('package_id,item_id,sort_order,alert_threshold')
        .order('sort_order'),
      supabase.from('inventory_package_office_details').select('*'),
      supabase
        .from('marketing_offices_with_regions')
        .select('office_code,office_name,region_name,city,state,is_active')
        .eq('is_active', true)
        .order('region_name')
        .order('office_code'),
    ]);

    const error =
      packageResult.error || itemResult.error || officeResult.error || directoryResult.error;

    if (error) {
      setPackageMessage(`Error: ${error.message}`);
      setPackageLoading(false);
      return;
    }

    const nextPackages = packageResult.data || [];
    const nextPackageItems = itemResult.data || [];
    const nextPackageOffices = officeResult.data || [];
    const nextOffices = directoryResult.data || [];

    setPackages(nextPackages);
    setPackageItems(nextPackageItems);
    setPackageOffices(nextPackageOffices);
    setActiveOffices(nextOffices);

    const standard =
      nextPackages.find(
        (pkg) => String(pkg.package_name || '').trim().toLowerCase() === 'standard office inventory'
      ) || nextPackages[0];

    if (standard) {
      const savedItems = nextPackageItems.filter((row) => row.package_id === standard.id);
      const savedOffices = nextPackageOffices.filter((row) => row.package_id === standard.id);

      setStandardItemIds(savedItems.map((row) => row.item_id));
      setStandardOfficeCodes(savedOffices.map((row) => normalizeOffice(row.office_code)));

      const nextAlerts = {};
      savedItems.forEach((row) => {
        nextAlerts[row.item_id] = Number(row.alert_threshold || 0);
      });
      setAlertDrafts(nextAlerts);
    }

    setPackageLoading(false);
  }, []);

  const loadDistributionHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from('inventory_mass_distribution_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) {
      setPackageMessage(`Could not load mass purchase history: ${error.message}`);
      setDistributionHistory([]);
    } else {
      setDistributionHistory(data || []);
    }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (inventoryAdminTab === 'standard') {
      loadStandardInventory();
      loadDistributionHistory();
    }
  }, [inventoryAdminTab, loadStandardInventory, loadDistributionHistory]);

  const standardPackage = useMemo(() => {
    return (
      packages.find(
        (pkg) => String(pkg.package_name || '').trim().toLowerCase() === 'standard office inventory'
      ) || packages[0] || null
    );
  }, [packages]);

  const standardSavedItemIds = useMemo(() => {
    if (!standardPackage) return new Set();
    return new Set(
      packageItems
        .filter((row) => row.package_id === standardPackage.id)
        .map((row) => row.item_id)
    );
  }, [packageItems, standardPackage]);

  const standardSavedOfficeCodes = useMemo(() => {
    if (!standardPackage) return new Set();
    return new Set(
      packageOffices
        .filter((row) => row.package_id === standardPackage.id)
        .map((row) => normalizeOffice(row.office_code))
    );
  }, [packageOffices, standardPackage]);

  const standardHasChanges = useMemo(() => {
    if (!standardPackage) return false;

    const draftItems = new Set(standardItemIds);
    const draftOffices = new Set(standardOfficeCodes.map(normalizeOffice));

    if (draftItems.size !== standardSavedItemIds.size) return true;
    if (draftOffices.size !== standardSavedOfficeCodes.size) return true;

    for (const id of standardSavedItemIds) {
      if (!draftItems.has(id)) return true;
    }

    for (const code of standardSavedOfficeCodes) {
      if (!draftOffices.has(code)) return true;
    }

    for (const itemId of draftItems) {
      const saved = packageItems.find(
        (row) => row.package_id === standardPackage.id && row.item_id === itemId
      );
      if (Number(saved?.alert_threshold || 0) !== Number(alertDrafts[itemId] || 0)) return true;
    }

    return false;
  }, [
    standardPackage,
    standardItemIds,
    standardOfficeCodes,
    standardSavedItemIds,
    standardSavedOfficeCodes,
    packageItems,
    alertDrafts,
  ]);

  const addStandardItem = () => {
    if (!itemToAdd) return;
    if (!standardItemIds.includes(itemToAdd)) {
      setStandardItemIds((current) => [...current, itemToAdd]);
      setAlertDrafts((current) => ({ ...current, [itemToAdd]: current[itemToAdd] ?? 0 }));
    }
    setItemToAdd('');
  };

  const removeStandardItem = (itemId) => {
    setStandardItemIds((current) => current.filter((id) => id !== itemId));
  };

  const toggleStandardOffice = (officeCode, checked) => {
    const code = normalizeOffice(officeCode);
    setStandardOfficeCodes((current) => {
      const set = new Set(current.map(normalizeOffice));
      if (checked) set.add(code);
      else set.delete(code);
      return Array.from(set);
    });
  };

  const resetStandardDraft = () => {
    if (!standardPackage) return;
    const savedItems = packageItems.filter((row) => row.package_id === standardPackage.id);
    const savedOffices = packageOffices.filter((row) => row.package_id === standardPackage.id);

    setStandardItemIds(savedItems.map((row) => row.item_id));
    setStandardOfficeCodes(savedOffices.map((row) => normalizeOffice(row.office_code)));

    const nextAlerts = {};
    savedItems.forEach((row) => {
      nextAlerts[row.item_id] = Number(row.alert_threshold || 0);
    });
    setAlertDrafts(nextAlerts);
    setPackageMessage('Unsaved Standard Inventory changes were discarded.');
  };

  const saveStandardInventory = async () => {
    if (!standardPackage) return;

    const packageId = standardPackage.id;
    setSavingStandard(true);
    setPackageMessage('');

    const desiredItemIds = new Set(standardItemIds);
    const desiredOfficeCodes = new Set(standardOfficeCodes.map(normalizeOffice));

    const itemIdsToAdd = [...desiredItemIds].filter((id) => !standardSavedItemIds.has(id));
    const itemIdsToRemove = [...standardSavedItemIds].filter((id) => !desiredItemIds.has(id));
    const officesToAssign = [...desiredOfficeCodes].filter(
      (code) => !standardSavedOfficeCodes.has(code)
    );
    const officesToUnassign = [...standardSavedOfficeCodes].filter(
      (code) => !desiredOfficeCodes.has(code)
    );

    try {
      if (itemIdsToAdd.length) {
        const rows = itemIdsToAdd.map((itemId) => ({
          package_id: packageId,
          item_id: itemId,
          sort_order: items.find((item) => item.id === itemId)?.sort_order || 0,
          default_quantity: 0,
          alert_threshold: asNumber(alertDrafts[itemId]),
        }));

        const { error } = await supabase
          .from('inventory_package_items')
          .upsert(rows, { onConflict: 'package_id,item_id' });
        if (error) throw error;
      }

      if (itemIdsToRemove.length) {
        const { error } = await supabase
          .from('inventory_package_items')
          .delete()
          .eq('package_id', packageId)
          .in('item_id', itemIdsToRemove);
        if (error) throw error;
      }

      for (const itemId of desiredItemIds) {
        const { error } = await supabase.rpc('set_inventory_package_item_defaults', {
          p_package_id: packageId,
          p_item_id: itemId,
          p_default_quantity: 0,
          p_alert_threshold: asNumber(alertDrafts[itemId]),
        });
        if (error) throw error;
      }

      for (const officeCode of officesToAssign) {
        const { error } = await supabase.rpc('assign_inventory_package_to_office', {
          p_package_id: packageId,
          p_office_code: officeCode,
        });
        if (error) throw error;
      }

      for (const officeCode of officesToUnassign) {
        const { error } = await supabase.rpc('unassign_inventory_package_from_office', {
          p_package_id: packageId,
          p_office_code: officeCode,
        });
        if (error) throw error;
      }

      // New standard items should become available to all currently assigned offices.
      // This only adds/reactivates tracking rows and never changes physical counts.
      if (itemIdsToAdd.length) {
        const { error } = await supabase.rpc('apply_inventory_package_to_assigned_offices', {
          p_package_id: packageId,
        });
        if (error) throw error;
      }

      setPackageMessage('Standard Inventory saved. Existing physical counts were not changed.');
      await loadStandardInventory();
    } catch (error) {
      setPackageMessage(`Error saving Standard Inventory: ${error.message}`);
    } finally {
      setSavingStandard(false);
    }
  };

  const visibleStandardItems = useMemo(() => {
    const q = standardSearch.trim().toLowerCase();
    return standardItemIds
      .map((id) => items.find((item) => item.id === id))
      .filter(Boolean)
      .filter((item) => {
        if (!q) return true;
        return [item.item_name, item.category, item.description, item.unit]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const categoryCompare = String(a.category || '').localeCompare(String(b.category || ''));
        if (categoryCompare !== 0) return categoryCompare;
        return String(a.item_name || '').localeCompare(String(b.item_name || ''));
      });
  }, [standardItemIds, items, standardSearch]);

  const availableStandardItems = useMemo(() => {
    const selected = new Set(standardItemIds);
    return items.filter((item) => item.active && !selected.has(item.id));
  }, [items, standardItemIds]);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setPackageMessage('');

    const [officeResult, alertResult] = await Promise.all([
      supabase
        .from('marketing_offices_with_regions')
        .select('office_code,office_name,region_name,address,city,state,zip_code,is_active,sort_order')
        .eq('is_active', true)
        .order('region_name')
        .order('sort_order')
        .order('office_code'),

      fetchAllRows(
        'inventory_alerts_current',
        '*',
        ['region_name', 'office_code', 'item_name']
      ),
    ]);

    const error = officeResult.error || alertResult.error;

    if (error) {
      setPackageMessage(`Error loading inventory alerts: ${error.message}`);
      setAlertOffices([]);
      setAlerts([]);
    } else {
      setAlertOffices(
        (officeResult.data || []).map((office) => ({
          ...office,
          office_code: normalizeOffice(office.office_code),
        }))
      );
      setAlerts(alertResult.data || []);
    }

    setAlertsLoading(false);
  }, []);

  useEffect(() => {
    if (inventoryAdminTab === 'alerts') loadAlerts();
  }, [inventoryAdminTab, loadAlerts]);

  const alertRowsByOffice = useMemo(() => {
    const map = {};

    alerts.forEach((row) => {
      const code = normalizeOffice(row.office_code);
      if (!code) return;
      if (!map[code]) map[code] = [];
      map[code].push(row);
    });

    return map;
  }, [alerts]);

  const alertOfficeSummaries = useMemo(() => {
    return alertOffices.map((office) => {
      const code = normalizeOffice(office.office_code);
      const rows = alertRowsByOffice[code] || [];

      const outCount = rows.filter((row) => row.alert_status === 'out').length;
      const lowCount = rows.filter((row) => row.alert_status === 'low').length;
      const healthyCount = rows.filter((row) => row.alert_status === 'healthy').length;

      const latestReport = rows.reduce((latest, row) => {
        if (!row.last_reported_at) return latest;
        if (!latest) return row.last_reported_at;
        return new Date(row.last_reported_at) > new Date(latest)
          ? row.last_reported_at
          : latest;
      }, null);

      return {
        ...office,
        rows,
        has_report: rows.length > 0,
        out_count: outCount,
        low_count: lowCount,
        healthy_count: healthyCount,
        alert_count: outCount + lowCount,
        latest_report: latestReport,
      };
    });
  }, [alertOffices, alertRowsByOffice]);

  const visibleAlertOffices = useMemo(() => {
    const q = alertOfficeSearch.trim().toLowerCase();

    return alertOfficeSummaries.filter((office) => {
      if (!q) return true;

      return [
        office.office_code,
        office.office_name,
        office.region_name,
        office.address,
        office.city,
        office.state,
        office.zip_code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [alertOfficeSummaries, alertOfficeSearch]);

  const selectedAlertOffice = useMemo(() => {
    if (!selectedAlertOfficeCode) return null;

    return (
      alertOfficeSummaries.find(
        (office) => normalizeOffice(office.office_code) === selectedAlertOfficeCode
      ) || null
    );
  }, [alertOfficeSummaries, selectedAlertOfficeCode]);

  const selectedAlertRows = useMemo(() => {
    if (!selectedAlertOffice) return [];

    const rows = selectedAlertOffice.rows || [];

    if (alertFilter === 'open') {
      return rows.filter(
        (row) => row.alert_status === 'out' || row.alert_status === 'low'
      );
    }

    return rows;
  }, [selectedAlertOffice, alertFilter]);

  const alertMetrics = useMemo(() => {
    const total = alertOfficeSummaries.length;
    const reported = alertOfficeSummaries.filter((office) => office.has_report).length;
    const needsAttention = alertOfficeSummaries.filter(
      (office) => office.alert_count > 0
    ).length;

    return {
      total,
      reported,
      needsAttention,
      noReport: Math.max(0, total - reported),
    };
  }, [alertOfficeSummaries]);

  const resetMassPurchase = () => {
    setMassName('');
    setMassNotes('');
    setMassItemToAdd('');
    setMassQtyToAdd('');
    setMassLines([]);
    setMassOverrideLineIndex(null);
  };

  const addMassLine = () => {
    if (!massItemToAdd || asNumber(massQtyToAdd) <= 0) return;
    if (massLines.some((line) => line.item_id === massItemToAdd)) {
      setPackageMessage('That item is already in this mass purchase.');
      return;
    }

    setMassLines((current) => [
      ...current,
      {
        item_id: massItemToAdd,
        default_quantity: asNumber(massQtyToAdd),
        overrides: {},
      },
    ]);
    setMassItemToAdd('');
    setMassQtyToAdd('');
  };

  const updateMassLineQty = (index, value) => {
    setMassLines((current) =>
      current.map((line, i) =>
        i === index ? { ...line, default_quantity: asNumber(value) } : line
      )
    );
  };

  const removeMassLine = (index) => {
    setMassLines((current) => current.filter((_, i) => i !== index));
    if (massOverrideLineIndex === index) setMassOverrideLineIndex(null);
  };

  const updateMassOfficeOverride = (lineIndex, officeCode, value) => {
    const code = normalizeOffice(officeCode);
    setMassLines((current) =>
      current.map((line, index) => {
        if (index !== lineIndex) return line;
        const overrides = { ...(line.overrides || {}) };
        if (value === '') delete overrides[code];
        else overrides[code] = asNumber(value);
        return { ...line, overrides };
      })
    );
  };

  const postMassPurchase = async () => {
    if (!standardPackage) return;
    if (!massName.trim()) {
      setPackageMessage('Enter a name for the mass purchase.');
      return;
    }
    if (!massLines.length) {
      setPackageMessage('Add at least one item to the mass purchase.');
      return;
    }
    if (!standardOfficeCodes.length) {
      setPackageMessage('No offices are assigned to Standard Inventory.');
      return;
    }

    setMassSaving(true);
    setPackageMessage('');

    let distributionId = null;

    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id || null;

      const { data: distribution, error: headerError } = await supabase
        .from('inventory_mass_distributions')
        .insert({
          distribution_name: massName.trim(),
          notes: massNotes.trim() || null,
          status: 'draft',
          created_by: userId,
        })
        .select('id')
        .single();

      if (headerError) throw headerError;
      distributionId = distribution.id;

      const { data: lineRows, error: lineError } = await supabase
        .from('inventory_mass_distribution_lines')
        .insert(
          massLines.map((line) => ({
            distribution_id: distributionId,
            item_id: line.item_id,
            default_quantity: asNumber(line.default_quantity),
          }))
        )
        .select('id,item_id');

      if (lineError) throw lineError;

      const lineIdByItem = new Map((lineRows || []).map((row) => [row.item_id, row.id]));
      const officeRows = [];

      massLines.forEach((line) => {
        const lineId = lineIdByItem.get(line.item_id);
        standardOfficeCodes.forEach((officeCode) => {
          const code = normalizeOffice(officeCode);
          const hasOverride = Object.prototype.hasOwnProperty.call(line.overrides || {}, code);
          const quantity = hasOverride
            ? asNumber(line.overrides[code])
            : asNumber(line.default_quantity);

          officeRows.push({
            distribution_id: distributionId,
            distribution_line_id: lineId,
            office_code: code,
            quantity_sent: quantity,
            is_override: hasOverride,
          });
        });
      });

      const { error: officeError } = await supabase
        .from('inventory_mass_distribution_offices')
        .insert(officeRows);
      if (officeError) throw officeError;

      const { data: postResult, error: postError } = await supabase.rpc(
        'post_inventory_mass_distribution',
        { p_distribution_id: distributionId }
      );
      if (postError) throw postError;

      setPackageMessage(
        `Mass purchase posted: ${postResult?.total_units_distributed ?? 'inventory'} units added across ${postResult?.offices_updated ?? standardOfficeCodes.length} offices.`
      );

      resetMassPurchase();
      setMassOpen(false);
      await loadDistributionHistory();
    } catch (error) {
      setPackageMessage(`Mass purchase failed: ${error.message}`);
    } finally {
      setMassSaving(false);
    }
  };

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (!showInactive && !item.active) return false;
      if (!q) return true;
      return [item.item_name, item.category, item.description, item.unit]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [items, search, showInactive]);

  const resetForm = () => {
    setForm(emptyForm);
    setMessage('');
  };

  const editItem = (item) => {
    setForm({
      id: item.id,
      item_name: item.item_name || '',
      category: item.category || 'Office Supplies',
      description: item.description || '',
      unit: item.unit || 'each',
      active: item.active !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveItem = async (event) => {
    event.preventDefault();
    if (!form.item_name.trim()) return;

    setSaving(true);
    setMessage('');

    const payload = {
      item_name: form.item_name.trim(),
      category: form.category,
      description: form.description.trim() || null,
      unit: form.unit,
      active: form.active,
      updated_by: (await supabase.auth.getUser()).data.user?.id || null,
    };

    let result;
    if (form.id) {
      result = await supabase.from('inventory_items').update(payload).eq('id', form.id);
    } else {
      result = await supabase.from('inventory_items').insert({
        ...payload,
        created_by: payload.updated_by,
      });
    }

    if (result.error) {
      setMessage(`Error: ${result.error.message}`);
    } else {
      setMessage(form.id ? 'Item updated.' : 'Inventory item added.');
      resetForm();
      await loadItems();
    }
    setSaving(false);
  };

  const toggleActive = async (item) => {
    const nextActive = !item.active;
    const { data: authData } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('inventory_items')
      .update({
        active: nextActive,
        updated_by: authData.user?.id || null,
      })
      .eq('id', item.id);

    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }

    await loadItems();
  };

  const assignedOfficeObjects = useMemo(() => {
    const assigned = new Set(standardOfficeCodes.map(normalizeOffice));
    return activeOffices.filter((office) => assigned.has(normalizeOffice(office.office_code)));
  }, [activeOffices, standardOfficeCodes]);

  const activeMassOverrideLine =
    massOverrideLineIndex === null ? null : massLines[massOverrideLineIndex];

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>OPERATIONS / INVENTORY SETTINGS</div>
          <h2>Inventory Management</h2>
          <p>
            Manage the master catalog, Standard Inventory, low-stock alerts, mass purchases, pending items, and physical inventory reports.
          </p>
        </div>
      </div>

      <div className={styles.inventorySubTabs}>
        <button
          type="button"
          className={inventoryAdminTab === 'catalog' ? styles.inventorySubTabActive : ''}
          onClick={() => setInventoryAdminTab('catalog')}
        >
          Item Catalog
        </button>
        <button
          type="button"
          className={inventoryAdminTab === 'standard' ? styles.inventorySubTabActive : ''}
          onClick={() => setInventoryAdminTab('standard')}
        >
          Standard Inventory
        </button>
        <button
          type="button"
          className={inventoryAdminTab === 'alerts' ? styles.inventorySubTabActive : ''}
          onClick={() => setInventoryAdminTab('alerts')}
        >
          Inventory Alerts
        </button>
        <button
          type="button"
          className={inventoryAdminTab === 'approvals' ? styles.inventorySubTabActive : ''}
          onClick={() => setInventoryAdminTab('approvals')}
        >
          Pending Items
        </button>
        <button
          type="button"
          className={inventoryAdminTab === 'reports' ? styles.inventorySubTabActive : ''}
          onClick={() => setInventoryAdminTab('reports')}
        >
          Inventory Reports
        </button>
      </div>

      {inventoryAdminTab === 'reports' ? (
        <AdminInventoryReports />
      ) : inventoryAdminTab === 'alerts' ? (
        <div style={{ padding: 18 }}>
          {!selectedAlertOffice ? (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  alignItems: 'flex-start',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <h3 style={{ margin: '0 0 6px' }}>Inventory Alerts</h3>
                  <p style={{ margin: 0 }}>
                    Select an office to review its inventory alert log. Item-level alerts stay hidden until you open that office.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={loadAlerts}
                >
                  Refresh
                </button>
              </div>

              {packageMessage && <div className={styles.message}>{packageMessage}</div>}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div className={styles.card} style={{ padding: 14 }}>
                  <small style={{ display: 'block' }}>Active Offices</small>
                  <strong style={{ fontSize: 22 }}>{alertMetrics.total}</strong>
                </div>

                <div className={styles.card} style={{ padding: 14 }}>
                  <small style={{ display: 'block' }}>Reports Submitted</small>
                  <strong style={{ fontSize: 22 }}>{alertMetrics.reported}</strong>
                </div>

                <div className={styles.card} style={{ padding: 14 }}>
                  <small style={{ display: 'block' }}>Needs Attention</small>
                  <strong style={{ fontSize: 22 }}>{alertMetrics.needsAttention}</strong>
                </div>

                <div className={styles.card} style={{ padding: 14 }}>
                  <small style={{ display: 'block' }}>No Report Yet</small>
                  <strong style={{ fontSize: 22 }}>{alertMetrics.noReport}</strong>
                </div>
              </div>

              <div className={styles.toolbar} style={{ marginBottom: 14 }}>
                <input
                  value={alertOfficeSearch}
                  onChange={(e) => setAlertOfficeSearch(e.target.value)}
                  placeholder="Search office, region, city..."
                />
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Office</th>
                      <th>Region</th>
                      <th>Last Inventory Report</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {alertsLoading ? (
                      <tr>
                        <td colSpan="5">Loading offices...</td>
                      </tr>
                    ) : visibleAlertOffices.length === 0 ? (
                      <tr>
                        <td colSpan="5">No active offices found.</td>
                      </tr>
                    ) : (
                      visibleAlertOffices.map((office) => (
                        <tr key={office.office_code}>
                          <td>
                            <strong>{office.office_code} {office.office_name || ''}</strong>
                            <small>
                              {office.address || ''}
                              {office.city ? ` · ${office.city}` : ''}
                              {office.state ? `, ${office.state}` : ''}
                            </small>
                          </td>

                          <td>{office.region_name || '—'}</td>

                          <td>
                            {office.latest_report
                              ? new Date(office.latest_report).toLocaleDateString()
                              : 'No report yet'}
                          </td>

                          <td>
                            {!office.has_report ? (
                              <span className={styles.inactivePill}>Waiting for Report</span>
                            ) : office.alert_count > 0 ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  borderRadius: 999,
                                  padding: '4px 9px',
                                  fontSize: 11,
                                  fontWeight: 800,
                                  background: '#fff7ed',
                                  color: '#c2410c',
                                }}
                              >
                                Needs Attention
                              </span>
                            ) : (
                              <span className={styles.activePill}>Current</span>
                            )}
                          </td>

                          <td className={styles.rowActions}>
                            <button
                              type="button"
                              onClick={() => {
                                setAlertFilter('open');
                                setSelectedAlertOfficeCode(
                                  normalizeOffice(office.office_code)
                                );
                              }}
                            >
                              View Alert Log
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  alignItems: 'flex-start',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setSelectedAlertOfficeCode(null)}
                    style={{ marginBottom: 12 }}
                  >
                    ← Back to Offices
                  </button>

                  <h3 style={{ margin: '0 0 4px' }}>
                    {selectedAlertOffice.office_code} {selectedAlertOffice.office_name || ''}
                  </h3>

                  <p style={{ margin: 0 }}>
                    {selectedAlertOffice.region_name || ''}
                    {selectedAlertOffice.city ? ` · ${selectedAlertOffice.city}` : ''}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={alertFilter === 'open' ? styles.primaryButton : styles.secondaryButton}
                    onClick={() => setAlertFilter('open')}
                    style={
                      alertFilter === 'open'
                        ? { background: '#b91c1c', borderColor: '#b91c1c', color: '#fff' }
                        : undefined
                    }
                  >
                    Low / Out
                  </button>

                  <button
                    type="button"
                    className={alertFilter === 'all' ? styles.primaryButton : styles.secondaryButton}
                    onClick={() => setAlertFilter('all')}
                  >
                    All Items
                  </button>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={loadAlerts}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {!selectedAlertOffice.has_report ? (
                <div className={styles.message}>
                  <strong>No inventory report yet.</strong> Alerts for this office will begin after its supervisor submits a physical inventory report.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, minmax(130px, 1fr))',
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    <div
                      className={styles.card}
                      style={{
                        padding: 14,
                        background: '#fef2f2',
                        borderColor: '#fecaca',
                      }}
                    >
                      <strong style={{ fontSize: 24, color: '#b91c1c' }}>
                        {selectedAlertOffice.out_count}
                      </strong>
                      <small style={{ display: 'block', color: '#991b1b', fontWeight: 800 }}>
                        Out of Stock
                      </small>
                    </div>

                    <div
                      className={styles.card}
                      style={{
                        padding: 14,
                        background: '#fff7ed',
                        borderColor: '#fed7aa',
                      }}
                    >
                      <strong style={{ fontSize: 24, color: '#c2410c' }}>
                        {selectedAlertOffice.low_count}
                      </strong>
                      <small style={{ display: 'block', color: '#9a3412', fontWeight: 800 }}>
                        Low Stock
                      </small>
                    </div>

                    <div
                      className={styles.card}
                      style={{
                        padding: 14,
                        background: '#f0fdf4',
                        borderColor: '#bbf7d0',
                      }}
                    >
                      <strong style={{ fontSize: 24, color: '#15803d' }}>
                        {selectedAlertOffice.healthy_count}
                      </strong>
                      <small style={{ display: 'block', color: '#166534', fontWeight: 800 }}>
                        Healthy
                      </small>
                    </div>

                    <div className={styles.card} style={{ padding: 14 }}>
                      <strong>
                        {selectedAlertOffice.latest_report
                          ? new Date(selectedAlertOffice.latest_report).toLocaleDateString()
                          : '—'}
                      </strong>
                      <small style={{ display: 'block' }}>Last Report</small>
                    </div>
                  </div>

                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>On Hand</th>
                          <th>Alert At</th>
                          <th>Suggested</th>
                          <th>Status</th>
                          <th>Last Report</th>
                        </tr>
                      </thead>

                      <tbody>
                        {selectedAlertRows.length === 0 ? (
                          <tr>
                            <td colSpan="6">
                              {alertFilter === 'open'
                                ? 'No low or out-of-stock items for this office.'
                                : 'No inventory alert data found for this office.'}
                            </td>
                          </tr>
                        ) : (
                          selectedAlertRows.map((row) => {
                            const visual = alertVisual(row.alert_status);

                            return (
                              <tr
                                key={`${row.office_code}-${row.item_id}`}
                                style={{
                                  background: visual.rowBackground,
                                  borderLeft: `4px solid ${visual.border}`,
                                }}
                              >
                                <td>
                                  <strong>{row.item_name}</strong>
                                  <small>{row.unit || ''}</small>
                                </td>

                                <td>
                                  <strong
                                    style={{
                                      color:
                                        row.alert_status === 'out'
                                          ? '#b91c1c'
                                          : row.alert_status === 'low'
                                            ? '#c2410c'
                                            : '#15803d',
                                      fontSize: 15,
                                    }}
                                  >
                                    {row.current_on_hand}
                                  </strong>
                                </td>

                                <td>{row.alert_threshold}</td>

                                <td>
                                  <strong>{row.suggested_replenishment_quantity}</strong>
                                </td>

                                <td>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      minWidth: 76,
                                      padding: '5px 10px',
                                      borderRadius: 999,
                                      background: visual.background,
                                      border: `1px solid ${visual.border}`,
                                      color: visual.text,
                                      fontSize: 11,
                                      fontWeight: 900,
                                      letterSpacing: '.04em',
                                    }}
                                  >
                                    {visual.label}
                                  </span>
                                </td>

                                <td>
                                  {row.last_reported_at
                                    ? new Date(row.last_reported_at).toLocaleDateString()
                                    : '—'}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : inventoryAdminTab === 'standard' ? (
        <div style={{ padding: 18 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'flex-start',
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div className={styles.eyebrow}>STANDARD OFFICE INVENTORY</div>
              <h3 style={{ margin: '4px 0 6px' }}>Standard Inventory</h3>
              <p style={{ margin: 0, maxWidth: 760 }}>
                Define the items a standard office tracks and the physical-count level that should trigger an alert. Quantities are added only when inventory is actually purchased and distributed.
              </p>
            </div>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                resetMassPurchase();
                setMassName(`Mass Purchase ${new Date().toLocaleDateString()}`);
                setMassOpen(true);
              }}
            >
              + Add Mass Purchase
            </button>
          </div>

          <div className={styles.message} style={{ marginBottom: 16 }}>
            <strong>New office?</strong> Add and activate it under Marketing Operations → Settings, then use Manage Offices here to assign Standard Inventory.
          </div>

          {packageMessage && <div className={styles.message}>{packageMessage}</div>}

          {packageLoading ? (
            <p>Loading Standard Inventory...</p>
          ) : !standardPackage ? (
            <div className={styles.message}>Standard Office Inventory package was not found.</div>
          ) : (
            <>
              <div
                className={styles.card}
                style={{ padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}
              >
                <div>
                  <strong>{standardItemIds.length} standard items</strong>
                  <small style={{ display: 'block', marginTop: 3 }}>
                    {standardOfficeCodes.length} of {activeOffices.length} active offices assigned
                  </small>
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setManageOfficesOpen((current) => !current)}
                >
                  {manageOfficesOpen ? 'Close Office Assignment' : 'Manage Offices'}
                </button>
              </div>

              {manageOfficesOpen && (
                <div className={styles.card} style={{ padding: 16, marginBottom: 16 }}>
                  <div style={{ marginBottom: 10 }}>
                    <strong>Assigned Offices</strong>
                    <p style={{ margin: '4px 0 0' }}>
                      Checking a new office initializes Standard Inventory for that office. Unchecking removes the package relationship but preserves existing inventory/history.
                    </p>
                  </div>
                  <div
                    style={{
                      maxHeight: 300,
                      overflowY: 'auto',
                      border: '1px solid #dbe3ef',
                      borderRadius: 10,
                      padding: 10,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: 4,
                    }}
                  >
                    {activeOffices.map((office) => {
                      const code = normalizeOffice(office.office_code);
                      return (
                        <label key={code} style={{ display: 'flex', gap: 8, padding: '7px 4px', alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={standardOfficeCodes.includes(code)}
                            onChange={(e) => toggleStandardOffice(code, e.target.checked)}
                          />
                          <span>
                            <strong>{code}</strong> {office.office_name}
                            <small> · {office.region_name || 'No region'} · {office.city || ''}</small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={styles.card} style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 14 }}>
                  <div>
                    <strong>Standard Items</strong>
                    <p style={{ margin: '4px 0 0' }}>
                      Alert Below is compared against the supervisor's latest physical inventory report.
                    </p>
                  </div>
                  <input
                    value={standardSearch}
                    onChange={(e) => setStandardSearch(e.target.value)}
                    placeholder="Search standard items..."
                    style={{ minWidth: 260 }}
                  />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr) auto',
                    gap: 8,
                    alignItems: 'end',
                    padding: 12,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    marginBottom: 12,
                  }}
                >
                  <label>
                    <span>Add Catalog Item</span>
                    <select value={itemToAdd} onChange={(e) => setItemToAdd(e.target.value)}>
                      <option value="">Choose an item...</option>
                      {availableStandardItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.item_name} · {item.unit} · {item.category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div />
                  <button type="button" className={styles.primaryButton} disabled={!itemToAdd} onClick={addStandardItem}>
                    + Add Item
                  </button>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Unit</th>
                        <th>Alert Below</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleStandardItems.length === 0 ? (
                        <tr><td colSpan="5">No standard inventory items found.</td></tr>
                      ) : (
                        visibleStandardItems.map((item) => (
                          <tr key={item.id}>
                            <td><strong>{item.item_name}</strong><small>{item.description || '—'}</small></td>
                            <td>{item.category}</td>
                            <td><span className={styles.unitPill}>{item.unit}</span></td>
                            <td style={{ width: 150 }}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={alertDrafts[item.id] ?? 0}
                                onChange={(e) =>
                                  setAlertDrafts((current) => ({
                                    ...current,
                                    [item.id]: asNumber(e.target.value),
                                  }))
                                }
                                style={{ width: 100 }}
                              />
                            </td>
                            <td className={styles.rowActions}>
                              <button type="button" onClick={() => removeStandardItem(item.id)}>Remove</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                  <small style={{ color: standardHasChanges ? '#b45309' : '#64748b', fontWeight: standardHasChanges ? 700 : 400 }}>
                    {standardHasChanges ? 'Unsaved Standard Inventory changes' : 'Standard Inventory is saved.'}
                  </small>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={!standardHasChanges || savingStandard}
                      onClick={resetStandardDraft}
                    >
                      Cancel Changes
                    </button>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={!standardHasChanges || savingStandard}
                      onClick={saveStandardInventory}
                    >
                      {savingStandard ? 'Saving...' : 'Save Standard Inventory'}
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.card} style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div>
                    <strong>Mass Purchase History</strong>
                    <p style={{ margin: '4px 0 0' }}>Corporate inventory added to office System Inventory.</p>
                  </div>
                  <button type="button" className={styles.secondaryButton} onClick={loadDistributionHistory}>Refresh</button>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Distribution</th>
                        <th>Status</th>
                        <th>Items</th>
                        <th>Offices</th>
                        <th>Total Units</th>
                        <th>Posted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyLoading ? (
                        <tr><td colSpan="6">Loading distribution history...</td></tr>
                      ) : distributionHistory.length === 0 ? (
                        <tr><td colSpan="6">No mass purchases have been posted yet.</td></tr>
                      ) : (
                        distributionHistory.map((row) => (
                          <tr key={row.distribution_id}>
                            <td><strong>{row.distribution_name}</strong><small>{row.notes || '—'}</small></td>
                            <td><strong>{String(row.status || '').toUpperCase()}</strong></td>
                            <td>{row.item_count}</td>
                            <td>{row.office_count}</td>
                            <td>{row.total_units}</td>
                            <td>{row.posted_at ? new Date(row.posted_at).toLocaleString() : '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : inventoryAdminTab === 'approvals' ? (
        <AdminInventoryItemApprovals />
      ) : (
        <>
          <form onSubmit={saveItem} className={styles.itemForm}>
            <label>
              <span>Item Name</span>
              <input
                value={form.item_name}
                onChange={(e) => setForm((current) => ({ ...current, item_name: e.target.value }))}
                placeholder="Printer Paper"
                required
              />
            </label>

            <label>
              <span>Category</span>
              <select
                value={form.category}
                onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))}
              >
                {CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Unit</span>
              <select
                value={form.unit}
                onChange={(e) => setForm((current) => ({ ...current, unit: e.target.value }))}
              >
                {UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>

            <label className={styles.formWide}>
              <span>Description</span>
              <input
                value={form.description}
                onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                placeholder="Internal description / model / type"
              />
            </label>

            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((current) => ({ ...current, active: e.target.checked }))}
              />
              <span>Active item</span>
            </label>

            <div className={styles.formActions}>
              {form.id && (
                <button type="button" className={styles.secondaryButton} onClick={resetForm}>
                  Cancel Edit
                </button>
              )}
              <button type="submit" className={styles.primaryButton} disabled={saving}>
                {saving ? 'Saving...' : form.id ? 'Save Changes' : '+ Add Inventory Item'}
              </button>
            </div>
          </form>

          {message && <div className={styles.message}>{message}</div>}

          <div className={styles.toolbar}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search inventory items..."
            />

            <label className={styles.inlineCheck}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive
            </label>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5">Loading inventory catalog...</td></tr>
                ) : visibleItems.length === 0 ? (
                  <tr><td colSpan="5">No inventory items found.</td></tr>
                ) : (
                  visibleItems.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.item_name}</strong><small>{item.description || '—'}</small></td>
                      <td>{item.category}</td>
                      <td><span className={styles.unitPill}>{item.unit}</span></td>
                      <td>
                        <span className={item.active ? styles.activePill : styles.inactivePill}>
                          {item.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className={styles.rowActions}>
                        <button type="button" onClick={() => editItem(item)}>Edit</button>
                        <button type="button" onClick={() => toggleActive(item)}>
                          {item.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {massOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,.45)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => !massSaving && setMassOpen(false)}
        >
          <div
            className={styles.card}
            style={{ width: 'min(980px, 96vw)', maxHeight: '90vh', overflow: 'auto', padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <div className={styles.eyebrow}>CORPORATE / MASS PURCHASE</div>
                <h3 style={{ margin: '4px 0' }}>Add Mass Purchased Inventory</h3>
                <p style={{ margin: 0 }}>
                  Enter the amount being sent to every Standard Inventory office. Adjust only the offices receiving a different amount.
                </p>
              </div>
              <button type="button" className={styles.secondaryButton} disabled={massSaving} onClick={() => setMassOpen(false)}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              <label>
                <span>Distribution Name</span>
                <input value={massName} onChange={(e) => setMassName(e.target.value)} placeholder="August Printer Paper Purchase" />
              </label>
              <label>
                <span>Notes</span>
                <input value={massNotes} onChange={(e) => setMassNotes(e.target.value)} placeholder="Vendor, PO, shipment notes..." />
              </label>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 170px auto',
                gap: 8,
                alignItems: 'end',
                padding: 12,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                marginTop: 16,
              }}
            >
              <label>
                <span>Inventory Item</span>
                <select value={massItemToAdd} onChange={(e) => setMassItemToAdd(e.target.value)}>
                  <option value="">Choose an item...</option>
                  {items.filter((item) => item.active).map((item) => (
                    <option key={item.id} value={item.id}>{item.item_name} · {item.unit}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Qty Per Office</span>
                <input type="number" min="0" step="1" value={massQtyToAdd} onChange={(e) => setMassQtyToAdd(e.target.value)} />
              </label>
              <button type="button" className={styles.primaryButton} disabled={!massItemToAdd || asNumber(massQtyToAdd) <= 0} onClick={addMassLine}>
                + Add
              </button>
            </div>

            <div className={styles.tableWrap} style={{ marginTop: 16 }}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Item</th><th>Qty / Office</th><th>Offices</th><th></th></tr>
                </thead>
                <tbody>
                  {massLines.length === 0 ? (
                    <tr><td colSpan="4">Add one or more items to this mass purchase.</td></tr>
                  ) : (
                    massLines.map((line, index) => {
                      const item = items.find((entry) => entry.id === line.item_id);
                      const overrideCount = Object.keys(line.overrides || {}).length;
                      return (
                        <tr key={line.item_id}>
                          <td><strong>{item?.item_name || 'Inventory Item'}</strong><small>{item?.category || ''} · {item?.unit || ''}</small></td>
                          <td style={{ width: 150 }}>
                            <input type="number" min="0" step="1" value={line.default_quantity} onChange={(e) => updateMassLineQty(index, e.target.value)} style={{ width: 100 }} />
                          </td>
                          <td>
                            <strong>{standardOfficeCodes.length} offices</strong>
                            <small>{overrideCount ? `${overrideCount} office override${overrideCount === 1 ? '' : 's'}` : 'Same quantity for all'}</small>
                          </td>
                          <td className={styles.rowActions}>
                            <button type="button" onClick={() => setMassOverrideLineIndex(index)}>Adjust Offices</button>
                            <button type="button" onClick={() => removeMassLine(index)}>Remove</button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.message} style={{ marginTop: 14 }}>
              Posting adds these quantities to each office's <strong>System Inventory</strong> as an ordered inventory transaction. The supervisor's last physical count is not changed.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" className={styles.secondaryButton} disabled={massSaving} onClick={() => setMassOpen(false)}>Cancel</button>
              <button type="button" className={styles.primaryButton} disabled={massSaving || !massLines.length || !massName.trim()} onClick={postMassPurchase}>
                {massSaving ? 'Posting...' : 'Post Mass Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeMassOverrideLine && massOverrideLineIndex !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,.5)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setMassOverrideLineIndex(null)}
        >
          <div
            className={styles.card}
            style={{ width: 'min(780px, 96vw)', maxHeight: '86vh', overflow: 'auto', padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: '0 0 4px' }}>
                  {items.find((item) => item.id === activeMassOverrideLine.item_id)?.item_name || 'Item'} — Office Quantities
                </h3>
                <p style={{ margin: 0 }}>
                  Default is {activeMassOverrideLine.default_quantity} per office. Only change offices that receive more or less.
                </p>
              </div>
              <button type="button" className={styles.secondaryButton} onClick={() => setMassOverrideLineIndex(null)}>×</button>
            </div>

            <div className={styles.tableWrap} style={{ marginTop: 16 }}>
              <table className={styles.table}>
                <thead><tr><th>Office</th><th>Region</th><th>Qty Sent</th><th></th></tr></thead>
                <tbody>
                  {assignedOfficeObjects.map((office) => {
                    const code = normalizeOffice(office.office_code);
                    const hasOverride = Object.prototype.hasOwnProperty.call(activeMassOverrideLine.overrides || {}, code);
                    const value = hasOverride ? activeMassOverrideLine.overrides[code] : activeMassOverrideLine.default_quantity;
                    return (
                      <tr key={code}>
                        <td><strong>{code}</strong><small>{office.office_name || ''} · {office.city || ''}</small></td>
                        <td>{office.region_name || '—'}</td>
                        <td style={{ width: 150 }}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={value}
                            onChange={(e) => updateMassOfficeOverride(massOverrideLineIndex, code, e.target.value)}
                            style={{ width: 100 }}
                          />
                        </td>
                        <td className={styles.rowActions}>
                          {hasOverride && (
                            <button type="button" onClick={() => updateMassOfficeOverride(massOverrideLineIndex, code, '')}>Use Default</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className={styles.primaryButton} onClick={() => setMassOverrideLineIndex(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
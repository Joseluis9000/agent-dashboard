import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import AdminInventorySettings from './AdminInventorySettings';

const fmt = (value) => {
  const n = Number(value || 0);
  return Number.isInteger(n)
    ? String(n)
    : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

const formatDate = (value) => {
  if (!value) return 'No report yet';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'No report yet';
  return d.toLocaleDateString();
};

const normalizeCode = (value) =>
  String(value || '').trim().toUpperCase();

const normalizeText = (value) =>
  String(value || '').trim();

// Supabase/PostgREST commonly caps a single SELECT response at 1,000 rows.
// Inventory can easily exceed that (50 offices x 28 items = 1,400 rows), so
// always page through large inventory datasets instead of trusting one SELECT.
const fetchAllRows = async (buildQuery, pageSize = 1000) => {
  const allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);

    if (error) {
      return { data: null, error };
    }

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return { data: allRows, error: null };
};

export default function AdminInventoryHub() {
  const [activeTab, setActiveTab] = useState('overview');

  const [offices, setOffices] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [selectedOfficeInventoryRows, setSelectedOfficeInventoryRows] = useState([]);
  const [selectedOfficeInventoryLoading, setSelectedOfficeInventoryLoading] = useState(false);
  const [reportRows, setReportRows] = useState([]);
  const [trackedRows, setTrackedRows] = useState([]);

  const [selectedOfficeCode, setSelectedOfficeCode] = useState(null);

  const [regionFilter, setRegionFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setMessage('');

    const [officeResult, inventoryResult, reportsResult, trackedResult] = await Promise.all([
      supabase
        .from('marketing_offices_with_regions')
        .select(
          'id, office_code, office_name, region_id, region_name, address, city, state, zip_code, phone, is_active, sort_order'
        )
        .eq('is_active', true)
        .order('region_name')
        .order('sort_order')
        .order('office_code'),

      fetchAllRows(() =>
        supabase
          .rpc('get_inventory_snapshot', {
            p_office_code: null,
            p_region: null,
          })
          .order('office_code')
          .order('category')
          .order('sort_order')
          .order('item_name')
      ),

      fetchAllRows(() =>
        supabase
          .from('inventory_reports')
          .select('id, office_code, submitted_at, submitted_by')
          .order('submitted_at', { ascending: false })
      ),

      // Authoritative office/item configuration. This dataset is larger than
      // 1,000 rows once many offices share a package, so it must be paginated.
      fetchAllRows(() =>
        supabase
          .from('office_inventory_items')
          .select('office_code, item_id, active')
          .eq('active', true)
          .order('office_code')
          .order('item_id')
      ),
    ]);

    const errors = [];

    if (officeResult.error) {
      errors.push(`Office directory: ${officeResult.error.message}`);
      setOffices([]);
    } else {
      setOffices(
        (officeResult.data || []).map((row) => ({
          ...row,
          office_code: normalizeCode(row.office_code),
          office_name: normalizeText(row.office_name),
          region_name: normalizeText(row.region_name) || 'Unassigned',
        }))
      );
    }

    if (inventoryResult.error) {
      errors.push(`Inventory: ${inventoryResult.error.message}`);
      setInventoryRows([]);
    } else {
      setInventoryRows(inventoryResult.data || []);
    }

    if (trackedResult.error) {
      errors.push(`Tracked inventory: ${trackedResult.error.message}`);
      setTrackedRows([]);
    } else {
      setTrackedRows(trackedResult.data || []);
    }

    if (reportsResult.error) {
      errors.push(`Reports: ${reportsResult.error.message}`);
      setReportRows([]);
    } else {
      setReportRows(reportsResult.data || []);
    }

    if (errors.length) setMessage(errors.join(' | '));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') loadOverview();
  }, [activeTab, loadOverview]);


  const loadSelectedOfficeInventory = useCallback(async (officeCode) => {
    const code = normalizeCode(officeCode);
    if (!code) {
      setSelectedOfficeInventoryRows([]);
      return;
    }

    setSelectedOfficeInventoryLoading(true);

    const { data, error } = await supabase.rpc('get_inventory_snapshot', {
      p_office_code: code,
      p_region: null,
    });

    if (error) {
      setSelectedOfficeInventoryRows([]);
      setMessage(`Could not load ${code} inventory: ${error.message}`);
    } else {
      setSelectedOfficeInventoryRows(data || []);
    }

    setSelectedOfficeInventoryLoading(false);
  }, []);

  useEffect(() => {
    if (selectedOfficeCode) {
      loadSelectedOfficeInventory(selectedOfficeCode);
    } else {
      setSelectedOfficeInventoryRows([]);
    }
  }, [selectedOfficeCode, loadSelectedOfficeInventory]);

  const latestReportByOffice = useMemo(() => {
    const map = {};

    reportRows.forEach((row) => {
      const code = normalizeCode(row.office_code);
      if (!code || map[code]) return;
      map[code] = row;
    });

    return map;
  }, [reportRows]);

  const trackedItemCountByOffice = useMemo(() => {
    const map = {};

    trackedRows.forEach((row) => {
      const code = normalizeCode(row.office_code);
      if (!code || !row.item_id) return;
      if (!map[code]) map[code] = new Set();
      map[code].add(row.item_id);
    });

    return Object.fromEntries(
      Object.entries(map).map(([code, ids]) => [code, ids.size])
    );
  }, [trackedRows]);

  const inventoryByOffice = useMemo(() => {
    const map = {};

    inventoryRows.forEach((row) => {
      const code = normalizeCode(row.office_code);
      if (!code) return;

      if (!map[code]) map[code] = [];
      map[code].push(row);
    });

    return map;
  }, [inventoryRows]);

  const officeSummaries = useMemo(() => {
    return offices.map((office) => {
      const code = office.office_code;
      const rows = inventoryByOffice[code] || [];
      const trackedItems = trackedItemCountByOffice[code] || 0;

      const requested = rows.reduce(
        (sum, row) => sum + Number(row.requested_qty || 0),
        0
      );

      const pending = rows.reduce(
        (sum, row) => sum + Number(row.pending_qty || 0),
        0
      );

      const systemInventory = rows.reduce(
        (sum, row) => sum + Number(row.system_inventory || 0),
        0
      );

      return {
        ...office,
        tracked_items: trackedItems,
        requested,
        pending,
        system_inventory_total: systemInventory,
        latest_report: latestReportByOffice[code] || null,
        inventory_configured: trackedItems > 0,
      };
    });
  }, [
    offices,
    inventoryByOffice,
    latestReportByOffice,
    trackedItemCountByOffice,
  ]);

  const regions = useMemo(() => {
    return [
      'All',
      ...Array.from(
        new Set(
          offices
            .map((office) => office.region_name)
            .filter(Boolean)
        )
      ).sort(),
    ];
  }, [offices]);

  const visibleOfficeSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();

    return officeSummaries.filter((office) => {
      if (
        regionFilter !== 'All' &&
        office.region_name !== regionFilter
      ) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        office.office_code,
        office.office_name,
        office.region_name,
        office.address,
        office.city,
        office.state,
        office.zip_code,
        office.phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [officeSummaries, regionFilter, search]);

  const groupedOffices = useMemo(() => {
    const groups = {};

    visibleOfficeSummaries.forEach((office) => {
      const region = office.region_name || 'Unassigned';
      if (!groups[region]) groups[region] = [];
      groups[region].push(office);
    });

    return Object.entries(groups).sort(([a], [b]) =>
      a.localeCompare(b)
    );
  }, [visibleOfficeSummaries]);

  const metrics = useMemo(() => {
    const totalActiveOffices = offices.length;

    const inventoryConfigured = officeSummaries.filter(
      (office) => office.inventory_configured
    ).length;

    const needsSetup = Math.max(
      0,
      totalActiveOffices - inventoryConfigured
    );

    const noReportYet = officeSummaries.filter(
      (office) => !office.latest_report
    ).length;

    return {
      totalActiveOffices,
      inventoryConfigured,
      needsSetup,
      noReportYet,
    };
  }, [offices, officeSummaries]);

  const selectedOffice = useMemo(() => {
    if (!selectedOfficeCode) return null;

    return officeSummaries.find(
      (office) => office.office_code === selectedOfficeCode
    ) || null;
  }, [officeSummaries, selectedOfficeCode]);

  const selectedOfficeInventory = useMemo(() => {
    if (!selectedOfficeCode) return [];

    const q = inventorySearch.trim().toLowerCase();

    return selectedOfficeInventoryRows.filter((row) => {
      if (!q) return true;

      const haystack = [
        row.item_name,
        row.category,
        row.description,
        row.unit,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [
    selectedOfficeInventoryRows,
    selectedOfficeCode,
    inventorySearch,
  ]);

  const renderOfficeDetail = () => {
    if (!selectedOffice) return null;

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => {
                setSelectedOfficeCode(null);
                setInventorySearch('');
              }}
              className="mb-3 text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              ← Back to Offices
            </button>

            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              {selectedOffice.region_name} / {selectedOffice.office_code}
            </div>

            <h2 className="mt-1 text-2xl font-semibold text-gray-900">
              {selectedOffice.office_code}
              {selectedOffice.office_name
                ? ` ${selectedOffice.office_name}`
                : ''}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {selectedOffice.address || 'No address listed'}
              {selectedOffice.city
                ? `, ${selectedOffice.city}`
                : ''}
              {selectedOffice.state
                ? `, ${selectedOffice.state}`
                : ''}
              {selectedOffice.zip_code
                ? ` ${selectedOffice.zip_code}`
                : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              await Promise.all([
                loadOverview(),
                loadSelectedOfficeInventory(selectedOffice.office_code),
              ]);
            }}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {message && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {message}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase text-gray-500">
              Tracked Items
            </div>
            <div className="mt-1 text-2xl font-bold text-gray-900">
              {selectedOffice.tracked_items}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs font-semibold uppercase text-amber-700">
              Requested
            </div>
            <div className="mt-1 text-2xl font-bold text-amber-900">
              {fmt(selectedOffice.requested)}
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="text-xs font-semibold uppercase text-blue-700">
              Pending
            </div>
            <div className="mt-1 text-2xl font-bold text-blue-900">
              {fmt(selectedOffice.pending)}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase text-gray-500">
              Last Report
            </div>
            <div className="mt-1 text-lg font-bold text-gray-900">
              {formatDate(
                selectedOffice.latest_report?.submitted_at
              )}
            </div>
          </div>
        </div>

        {!selectedOffice.inventory_configured && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="font-semibold text-amber-900">
              Inventory has not been configured for this office yet.
            </div>
            <div className="mt-1 text-sm text-amber-700">
              The office exists in the active office directory, but it
              does not currently have tracked inventory items.
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div>
              <h3 className="font-semibold text-gray-900">
                Current Inventory
              </h3>
              <p className="text-xs text-gray-500">
                Physical counts, requests, pending quantities, and
                system inventory for this office.
              </p>
            </div>

            <input
              value={inventorySearch}
              onChange={(e) =>
                setInventorySearch(e.target.value)
              }
              placeholder="Search inventory..."
              className="w-full sm:w-72 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3 text-right">
                    Current On Hand
                  </th>
                  <th className="px-4 py-3 text-right">
                    Requested
                  </th>
                  <th className="px-4 py-3 text-right">
                    Pending
                  </th>
                  <th className="px-4 py-3 text-right">
                    System Inventory
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {selectedOfficeInventoryLoading ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-4 py-10 text-center text-gray-500"
                    >
                      Loading office inventory...
                    </td>
                  </tr>
                ) : selectedOfficeInventory.length === 0 ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-4 py-10 text-center text-gray-500"
                    >
                      {inventorySearch.trim()
                        ? 'No inventory items match your search.'
                        : selectedOffice.inventory_configured
                          ? 'This office has tracked items, but no inventory snapshot rows were returned.'
                          : 'No inventory items are configured for this office yet.'}
                    </td>
                  </tr>
                ) : (
                  selectedOfficeInventory.map((row) => (
                    <tr
                      key={`${selectedOffice.office_code}-${row.item_id}`}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">
                          {row.item_name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {row.category || ''}
                          {row.description
                            ? ` · ${row.description}`
                            : ''}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-gray-600">
                        {row.unit}
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {fmt(row.current_on_hand)}
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-amber-700">
                        {fmt(row.requested_qty)}
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-blue-700">
                        {fmt(row.pending_qty)}
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-slate-900 bg-slate-50">
                        {fmt(row.system_inventory)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 pt-4">
          <button
            type="button"
            onClick={() => {
              setActiveTab('overview');
              setSelectedOfficeCode(null);
            }}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
              activeTab === 'overview'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Office Inventory
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('settings');
              setSelectedOfficeCode(null);
            }}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
              activeTab === 'settings'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Inventory Settings
          </button>
        </div>

        {activeTab === 'overview' && (
          <div className="p-4 md:p-5">
            {selectedOfficeCode ? (
              renderOfficeDetail()
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Operations / Inventory
                    </div>

                    <h2 className="mt-1 text-xl font-semibold text-gray-900">
                      Office Inventory Overview
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Active offices come from the office directory.
                      Open an office to review its actual inventory.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadOverview}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Refresh
                  </button>
                </div>

                {message && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {message}
                  </div>
                )}

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase text-gray-500">
                      Total Active Offices
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-900">
                      {metrics.totalActiveOffices}
                    </div>
                    <div className="text-xs text-gray-400">
                      from office directory
                    </div>
                  </div>

                  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <div className="text-xs font-semibold uppercase text-green-700">
                      Inventory Configured
                    </div>
                    <div className="mt-1 text-2xl font-bold text-green-900">
                      {metrics.inventoryConfigured}
                    </div>
                    <div className="text-xs text-green-700/70">
                      offices with tracked items
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="text-xs font-semibold uppercase text-amber-700">
                      Needs Setup
                    </div>
                    <div className="mt-1 text-2xl font-bold text-amber-900">
                      {metrics.needsSetup}
                    </div>
                    <div className="text-xs text-amber-700/70">
                      no tracked inventory yet
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="text-xs font-semibold uppercase text-blue-700">
                      No Report Yet
                    </div>
                    <div className="mt-1 text-2xl font-bold text-blue-900">
                      {metrics.noReportYet}
                    </div>
                    <div className="text-xs text-blue-700/70">
                      active offices without a report
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      Region
                    </label>

                    <select
                      value={regionFilter}
                      onChange={(e) =>
                        setRegionFilter(e.target.value)
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      {regions.map((region) => (
                        <option
                          key={region}
                          value={region}
                        >
                          {region}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      Search Offices
                    </label>

                    <input
                      value={search}
                      onChange={(e) =>
                        setSearch(e.target.value)
                      }
                      placeholder="Office code, name, city, address..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-gray-500">
                    Loading offices and inventory...
                  </div>
                ) : groupedOffices.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-gray-500">
                    No active offices match these filters.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupedOffices.map(
                      ([regionName, regionOffices]) => (
                        <section
                          key={regionName}
                          className="rounded-xl border border-gray-200 bg-white overflow-hidden"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
                            <div>
                              <h3 className="font-bold text-gray-900">
                                {regionName}
                              </h3>
                              <p className="text-xs text-gray-500">
                                {regionOffices.length} active office
                                {regionOffices.length === 1
                                  ? ''
                                  : 's'}
                              </p>
                            </div>
                          </div>

                          <div className="divide-y divide-gray-100">
                            {regionOffices.map((office) => (
                              <button
                                key={office.office_code}
                                type="button"
                                onClick={() =>
                                  setSelectedOfficeCode(
                                    office.office_code
                                  )
                                }
                                className="w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors"
                              >
                                <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,1.4fr)_repeat(4,minmax(100px,.55fr))_auto] gap-3 items-center">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-bold text-gray-900">
                                        {office.office_code}
                                      </span>

                                      <span className="font-semibold text-gray-700">
                                        {office.office_name}
                                      </span>

                                      {!office.inventory_configured && (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                          Needs Setup
                                        </span>
                                      )}
                                    </div>

                                    <div className="mt-1 text-xs text-gray-500">
                                      {office.address || 'No address listed'}
                                      {office.city
                                        ? ` · ${office.city}`
                                        : ''}
                                      {office.state
                                        ? `, ${office.state}`
                                        : ''}
                                      {office.zip_code
                                        ? ` ${office.zip_code}`
                                        : ''}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-[10px] font-semibold uppercase text-gray-400">
                                      Items
                                    </div>
                                    <div className="font-bold text-gray-900">
                                      {office.tracked_items}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-[10px] font-semibold uppercase text-gray-400">
                                      Requested
                                    </div>
                                    <div className="font-bold text-amber-700">
                                      {fmt(office.requested)}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-[10px] font-semibold uppercase text-gray-400">
                                      Pending
                                    </div>
                                    <div className="font-bold text-blue-700">
                                      {fmt(office.pending)}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-[10px] font-semibold uppercase text-gray-400">
                                      Last Report
                                    </div>
                                    <div className="text-sm font-semibold text-gray-700">
                                      {formatDate(
                                        office.latest_report
                                          ?.submitted_at
                                      )}
                                    </div>
                                  </div>

                                  <div className="text-sm font-bold text-slate-700">
                                    View Inventory →
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </section>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-4 md:p-5">
            <AdminInventorySettings />
          </div>
        )}
      </div>
    </div>
  );
}
// src/pages/admin/marketing/MarketingSettings.jsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import styles from '../MarketingOps.module.css';

const SETTINGS_TABS = [
  { id: 'offices', label: 'Offices & Regions', icon: '🏢' },
  { id: 'vendors', label: 'Vendors', icon: '🤝' },
  { id: 'activity-types', label: 'Activity Types', icon: '🧩' },
  { id: 'defaults', label: 'Defaults', icon: '⚙️' },
];

const EMPTY_REGION_FORM = {
  name: '',
  description: '',
  is_active: true,
  sort_order: 0,
};

const EMPTY_OFFICE_FORM = {
  office_code: '',
  office_name: '',
  region_id: '',
  address: '',
  city: '',
  state: 'CA',
  zip_code: '',
  latitude: '',
  longitude: '',
  phone: '',
  notes: '',
  is_active: true,
  sort_order: 0,
};

const EMPTY_VENDOR_FORM = {
  vendor_name: '',
  vendor_type: 'Billboard',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  website: '',
  account_number: '',
  address: '',
  city: '',
  state: 'CA',
  zip_code: '',
  notes: '',
  is_active: true,
  sort_order: 0,
};

const VENDOR_TYPES = [
  'Billboard',
  'DMV Video',
  'Television',
  'Digital / Geofencing',
  'Printing',
  'Events',
  'Sponsorship',
  'Other',
];

const EMPTY_ACTIVITY_TYPE_FORM = {
  key: '',
  label: '',
  description: '',
  category: '',
  map_behavior: 'none',
  icon_key: '',
  is_active: true,
  sort_order: 0,
};

const MAP_BEHAVIOR_OPTIONS = [
  { value: 'point', label: 'Point / Physical Map Marker' },
  { value: 'area', label: 'Area / Coverage Based' },
  { value: 'none', label: 'No Map Placement' },
];

const ACTIVITY_CATEGORY_OPTIONS = [
  'Outdoor',
  'Video',
  'Digital',
  'Events',
  'Sponsorship',
  'Print',
  'Internal',
  'Other',
];

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '9px 10px',
  background: '#ffffff',
  color: '#334155',
  font: 'inherit',
};

const labelStyle = {
  display: 'grid',
  gap: 5,
  color: '#334155',
  fontSize: 12,
  fontWeight: 850,
};

const twoColumnGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
};

const modalActionStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  flexWrap: 'wrap',
  paddingTop: 5,
};

const countPillStyle = {
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  color: '#475569',
  borderRadius: 999,
  padding: '4px 7px',
  fontSize: 10,
  fontWeight: 900,
};

const normalizeText = (value) => String(value ?? '').trim();

const normalizeNullableText = (value) => {
  const next = normalizeText(value);
  return next || null;
};

const normalizeNullableNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;

  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const sortRegions = (rows = []) =>
  [...rows].sort((a, b) => {
    const orderA = Number(a.sort_order || 0);
    const orderB = Number(b.sort_order || 0);

    if (orderA !== orderB) return orderA - orderB;

    return String(a.name || '').localeCompare(
      String(b.name || '')
    );
  });

const sortOffices = (rows = []) =>
  [...rows].sort((a, b) => {
    const orderA = Number(a.sort_order || 0);
    const orderB = Number(b.sort_order || 0);

    if (orderA !== orderB) return orderA - orderB;

    return String(a.office_code || '').localeCompare(
      String(b.office_code || '')
    );
  });

const MarketingSettings = () => {
  const [activeTab, setActiveTab] = useState('offices');

  const [regions, setRegions] = useState([]);
  const [offices, setOffices] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [activityTypes, setActivityTypes] = useState([]);
  const [marketingSettings, setMarketingSettings] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [regionSearch, setRegionSearch] = useState('');
  const [officeSearch, setOfficeSearch] = useState('');
  const [officeRegionFilter, setOfficeRegionFilter] = useState('all');
  const [officeStatusFilter, setOfficeStatusFilter] = useState('all');

  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorTypeFilter, setVendorTypeFilter] = useState('all');
  const [vendorStatusFilter, setVendorStatusFilter] = useState('all');

  const [activitySearch, setActivitySearch] = useState('');
  const [activityMapFilter, setActivityMapFilter] = useState('all');
  const [activityStatusFilter, setActivityStatusFilter] = useState('all');

  const [regionModal, setRegionModal] = useState({
    open: false,
    mode: 'create',
    region: null,
  });

  const [officeModal, setOfficeModal] = useState({
    open: false,
    mode: 'create',
    office: null,
  });

  const [vendorModal, setVendorModal] = useState({
    open: false,
    mode: 'create',
    vendor: null,
  });

  const [activityTypeModal, setActivityTypeModal] = useState({
    open: false,
    mode: 'create',
    activityType: null,
  });

  const [settingModal, setSettingModal] = useState({
    open: false,
    setting: null,
  });

  const [deleteRegionModal, setDeleteRegionModal] = useState({
    open: false,
    region: null,
  });

  const loadSettingsData = useCallback(async () => {
    setIsLoading(true);
    setPageError('');

    try {
      const [
        regionsResult,
        officesResult,
        vendorsResult,
        activityTypesResult,
        settingsResult,
      ] = await Promise.all([
        supabase
          .from('marketing_regions_with_counts')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),

        supabase
          .from('marketing_offices_with_regions')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('office_code', { ascending: true }),

        supabase
          .from('marketing_vendors_summary')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('vendor_name', { ascending: true }),

        supabase
          .from('marketing_activity_types_summary')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('label', { ascending: true }),

        supabase
          .from('marketing_settings_summary')
          .select('*')
          .order('category', { ascending: true })
          .order('setting_key', { ascending: true }),
      ]);

      if (regionsResult.error) throw regionsResult.error;
      if (officesResult.error) throw officesResult.error;
      if (vendorsResult.error) throw vendorsResult.error;
      if (activityTypesResult.error) throw activityTypesResult.error;
      if (settingsResult.error) throw settingsResult.error;

      setRegions(sortRegions(regionsResult.data || []));
      setOffices(sortOffices(officesResult.data || []));
      setVendors(vendorsResult.data || []);
      setActivityTypes(activityTypesResult.data || []);
      setMarketingSettings(settingsResult.data || []);
    } catch (error) {
      console.error('Error loading Marketing Settings:', error);

      setPageError(
        error?.message ||
          'Could not load Marketing Settings.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettingsData();
  }, [loadSettingsData]);

  const filteredRegions = useMemo(() => {
    const query = regionSearch.trim().toLowerCase();

    if (!query) return regions;

    return regions.filter((region) =>
      [region.name, region.description]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        )
    );
  }, [regionSearch, regions]);

  const filteredOffices = useMemo(() => {
    const query = officeSearch.trim().toLowerCase();

    return offices.filter((office) => {
      if (
        officeRegionFilter !== 'all' &&
        office.region_id !== officeRegionFilter
      ) {
        return false;
      }

      if (
        officeStatusFilter === 'active' &&
        office.is_active !== true
      ) {
        return false;
      }

      if (
        officeStatusFilter === 'inactive' &&
        office.is_active !== false
      ) {
        return false;
      }

      if (!query) return true;

      return [
        office.office_code,
        office.office_name,
        office.city,
        office.region_name,
        office.address,
        office.phone,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        );
    });
  }, [
    officeRegionFilter,
    officeSearch,
    officeStatusFilter,
    offices,
  ]);

  const filteredVendors = useMemo(() => {
    const query = vendorSearch.trim().toLowerCase();

    return vendors.filter((vendor) => {
      if (
        vendorTypeFilter !== 'all' &&
        vendor.vendor_type !== vendorTypeFilter
      ) {
        return false;
      }

      if (
        vendorStatusFilter === 'active' &&
        vendor.is_active !== true
      ) {
        return false;
      }

      if (
        vendorStatusFilter === 'inactive' &&
        vendor.is_active !== false
      ) {
        return false;
      }

      if (!query) return true;

      return [
        vendor.vendor_name,
        vendor.vendor_type,
        vendor.contact_name,
        vendor.contact_phone,
        vendor.contact_email,
        vendor.account_number,
        vendor.city,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        );
    });
  }, [
    vendorSearch,
    vendorStatusFilter,
    vendorTypeFilter,
    vendors,
  ]);

  const filteredActivityTypes = useMemo(() => {
    const query = activitySearch.trim().toLowerCase();

    return activityTypes.filter((activityType) => {
      if (
        activityMapFilter !== 'all' &&
        activityType.map_behavior !== activityMapFilter
      ) {
        return false;
      }

      if (
        activityStatusFilter === 'active' &&
        activityType.is_active !== true
      ) {
        return false;
      }

      if (
        activityStatusFilter === 'inactive' &&
        activityType.is_active !== false
      ) {
        return false;
      }

      if (!query) return true;

      return [
        activityType.key,
        activityType.label,
        activityType.description,
        activityType.category,
        activityType.icon_key,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        );
    });
  }, [
    activityMapFilter,
    activitySearch,
    activityStatusFilter,
    activityTypes,
  ]);

  const metrics = useMemo(() => {
    const activeRegions = regions.filter(
      (region) => region.is_active
    ).length;

    const activeOffices = offices.filter(
      (office) => office.is_active
    ).length;

    const unassignedOffices = offices.filter(
      (office) => !office.region_id
    ).length;

    return {
      regions: regions.length,
      activeRegions,
      offices: offices.length,
      activeOffices,
      unassignedOffices,
    };
  }, [offices, regions]);

  const showSuccess = (message) => {
    setSuccessMessage(message);

    window.setTimeout(() => {
      setSuccessMessage('');
    }, 2800);
  };

  const handleToggleRegionActive = async (region) => {
    setPageError('');

    try {
      const { error } = await supabase
        .from('marketing_regions')
        .update({
          is_active: !region.is_active,
        })
        .eq('id', region.id);

      if (error) throw error;

      showSuccess(
        `${region.name} ${
          region.is_active ? 'deactivated' : 'activated'
        }.`
      );

      await loadSettingsData();
    } catch (error) {
      console.error('Error updating region status:', error);

      setPageError(
        error?.message ||
          'Could not update region status.'
      );
    }
  };

  const handleToggleOfficeActive = async (office) => {
    setPageError('');

    try {
      const { error } = await supabase
        .from('marketing_offices')
        .update({
          is_active: !office.is_active,
        })
        .eq('id', office.id);

      if (error) throw error;

      showSuccess(
        `${office.office_code} ${
          office.is_active ? 'deactivated' : 'activated'
        }.`
      );

      await loadSettingsData();
    } catch (error) {
      console.error('Error updating office status:', error);

      setPageError(
        error?.message ||
          'Could not update office status.'
      );
    }
  };

  const handleDeleteOffice = async (office) => {
    const confirmed = window.confirm(
      `Delete office ${office.office_code}${
        office.office_name
          ? ` - ${office.office_name}`
          : ''
      }?`
    );

    if (!confirmed) return;

    setPageError('');

    try {
      const { error } = await supabase
        .from('marketing_offices')
        .delete()
        .eq('id', office.id);

      if (error) throw error;

      showSuccess(`${office.office_code} deleted.`);

      await loadSettingsData();
    } catch (error) {
      console.error('Error deleting office:', error);

      setPageError(
        error?.message ||
          'Could not delete office.'
      );
    }
  };

  const handleToggleVendorActive = async (vendor) => {
    setPageError('');

    try {
      const { error } = await supabase
        .from('marketing_vendors')
        .update({
          is_active: !vendor.is_active,
        })
        .eq('id', vendor.id);

      if (error) throw error;

      showSuccess(
        `${vendor.vendor_name} ${
          vendor.is_active ? 'deactivated' : 'activated'
        }.`
      );

      await loadSettingsData();
    } catch (error) {
      console.error('Error updating vendor status:', error);

      setPageError(
        error?.message ||
          'Could not update vendor status.'
      );
    }
  };

  const handleDeleteVendor = async (vendor) => {
    const confirmed = window.confirm(
      `Delete vendor ${vendor.vendor_name}?`
    );

    if (!confirmed) return;

    setPageError('');

    try {
      const { error } = await supabase
        .from('marketing_vendors')
        .delete()
        .eq('id', vendor.id);

      if (error) throw error;

      showSuccess(`${vendor.vendor_name} deleted.`);

      await loadSettingsData();
    } catch (error) {
      console.error('Error deleting vendor:', error);

      setPageError(
        error?.message ||
          'Could not delete vendor.'
      );
    }
  };

  const handleToggleActivityTypeActive = async (activityType) => {
    setPageError('');

    try {
      const { error } = await supabase
        .from('marketing_activity_types')
        .update({
          is_active: !activityType.is_active,
        })
        .eq('id', activityType.id);

      if (error) throw error;

      showSuccess(
        `${activityType.label} ${
          activityType.is_active ? 'deactivated' : 'activated'
        }.`
      );

      await loadSettingsData();
    } catch (error) {
      console.error('Error updating activity type status:', error);

      setPageError(
        error?.message ||
          'Could not update activity type status.'
      );
    }
  };

  const handleDeleteActivityType = async (activityType) => {
    const confirmed = window.confirm(
      `Delete activity type ${activityType.label}?`
    );

    if (!confirmed) return;

    setPageError('');

    try {
      const { error } = await supabase
        .from('marketing_activity_types')
        .delete()
        .eq('id', activityType.id);

      if (error) throw error;

      showSuccess(`${activityType.label} deleted.`);

      await loadSettingsData();
    } catch (error) {
      console.error('Error deleting activity type:', error);

      setPageError(
        error?.message ||
          'Could not delete activity type.'
      );
    }
  };

  return (
    <section style={{ display: 'grid', gap: 18 }}>
      <div className={styles.card} style={{ padding: 18 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Settings</h2>

            <p
              style={{
                margin: '5px 0 0',
                color: '#64748b',
                fontWeight: 750,
                lineHeight: 1.5,
              }}
            >
              Manage regions, offices, vendors, activity types, and MarketingOps defaults.
            </p>
          </div>

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={loadSettingsData}
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {pageError && (
        <div className={styles.errorBanner}>
          {pageError}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            background: '#dcfce7',
            color: '#166534',
            border: '1px solid #bbf7d0',
            borderRadius: 12,
            padding: '10px 12px',
            fontWeight: 850,
          }}
        >
          ✓ {successMessage}
        </div>
      )}

      <div
        className={styles.card}
        style={{
          padding: 7,
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              border:
                activeTab === tab.id
                  ? '1px solid #bae6fd'
                  : '1px solid transparent',

              background:
                activeTab === tab.id
                  ? '#f0f9ff'
                  : 'transparent',

              color:
                activeTab === tab.id
                  ? '#0369a1'
                  : '#475569',

              borderRadius: 10,
              padding: '9px 12px',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'offices' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(5, minmax(120px, 1fr))',
              gap: 10,
            }}
          >
            <MetricCard
              label="Regions"
              value={metrics.regions}
            />

            <MetricCard
              label="Active Regions"
              value={metrics.activeRegions}
            />

            <MetricCard
              label="Offices"
              value={metrics.offices}
            />

            <MetricCard
              label="Active Offices"
              value={metrics.activeOffices}
            />

            <MetricCard
              label="Unassigned"
              value={metrics.unassignedOffices}
              warning
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'minmax(300px, 0.8fr) minmax(520px, 1.2fr)',
              gap: 16,
              alignItems: 'start',
            }}
          >
            <div
              className={styles.card}
              style={{
                padding: 16,
                display: 'grid',
                gap: 12,
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
                <div>
                  <h3 style={{ margin: 0 }}>Regions</h3>

                  <small
                    style={{
                      color: '#64748b',
                      fontWeight: 750,
                    }}
                  >
                    Rename, activate, deactivate, or safely remove regions.
                  </small>
                </div>

                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() =>
                    setRegionModal({
                      open: true,
                      mode: 'create',
                      region: null,
                    })
                  }
                >
                  + Add Region
                </button>
              </div>

              <input
                value={regionSearch}
                onChange={(event) =>
                  setRegionSearch(event.target.value)
                }
                placeholder="Search regions..."
                style={inputStyle}
              />

              {isLoading ? (
                <div className={styles.emptyState}>
                  Loading regions...
                </div>
              ) : filteredRegions.length === 0 ? (
                <div className={styles.emptyState}>
                  No regions found.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {filteredRegions.map((region) => (
                    <RegionRow
                      key={region.id}
                      region={region}
                      onEdit={() =>
                        setRegionModal({
                          open: true,
                          mode: 'edit',
                          region,
                        })
                      }
                      onToggle={() =>
                        handleToggleRegionActive(region)
                      }
                      onDelete={() =>
                        setDeleteRegionModal({
                          open: true,
                          region,
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <div
              className={styles.card}
              style={{
                padding: 16,
                display: 'grid',
                gap: 12,
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
                <div>
                  <h3 style={{ margin: 0 }}>Offices</h3>

                  <small
                    style={{
                      color: '#64748b',
                      fontWeight: 750,
                    }}
                  >
                    Manage office names, codes, status, and region assignments.
                  </small>
                </div>

                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() =>
                    setOfficeModal({
                      open: true,
                      mode: 'create',
                      office: null,
                    })
                  }
                >
                  + Add Office
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'minmax(180px, 1fr) minmax(150px, 0.7fr) minmax(130px, 0.55fr)',
                  gap: 8,
                }}
              >
                <input
                  value={officeSearch}
                  onChange={(event) =>
                    setOfficeSearch(event.target.value)
                  }
                  placeholder="Search offices..."
                  style={inputStyle}
                />

                <select
                  value={officeRegionFilter}
                  onChange={(event) =>
                    setOfficeRegionFilter(event.target.value)
                  }
                  style={inputStyle}
                >
                  <option value="all">All Regions</option>
                  <option value="">Unassigned</option>

                  {regions.map((region) => (
                    <option
                      key={region.id}
                      value={region.id}
                    >
                      {region.name}
                    </option>
                  ))}
                </select>

                <select
                  value={officeStatusFilter}
                  onChange={(event) =>
                    setOfficeStatusFilter(event.target.value)
                  }
                  style={inputStyle}
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {isLoading ? (
                <div className={styles.emptyState}>
                  Loading offices...
                </div>
              ) : filteredOffices.length === 0 ? (
                <div className={styles.emptyState}>
                  No offices found.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>Office</th>
                        <th>Region</th>
                        <th>City</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredOffices.map((office) => (
                        <tr key={office.id}>
                          <td>
                            <strong>{office.office_code}</strong>
                            <small>
                              {office.office_name ||
                                'No office name'}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {office.region_name ||
                                'Unassigned'}
                            </strong>
                          </td>

                          <td>{office.city || '—'}</td>

                          <td>
                            <StatusPill
                              active={office.is_active}
                            />
                          </td>

                          <td>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                gap: 6,
                                flexWrap: 'wrap',
                              }}
                            >
                              <button
                                type="button"
                                className={styles.secondaryBtn}
                                onClick={() =>
                                  setOfficeModal({
                                    open: true,
                                    mode: 'edit',
                                    office,
                                  })
                                }
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                className={styles.secondaryBtn}
                                onClick={() =>
                                  handleToggleOfficeActive(
                                    office
                                  )
                                }
                              >
                                {office.is_active
                                  ? 'Deactivate'
                                  : 'Activate'}
                              </button>

                              <button
                                type="button"
                                className={styles.dangerBtn}
                                onClick={() =>
                                  handleDeleteOffice(office)
                                }
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'vendors' && (
        <VendorsSection
          vendors={vendors}
          filteredVendors={filteredVendors}
          isLoading={isLoading}
          vendorSearch={vendorSearch}
          setVendorSearch={setVendorSearch}
          vendorTypeFilter={vendorTypeFilter}
          setVendorTypeFilter={setVendorTypeFilter}
          vendorStatusFilter={vendorStatusFilter}
          setVendorStatusFilter={setVendorStatusFilter}
          onAddVendor={() =>
            setVendorModal({
              open: true,
              mode: 'create',
              vendor: null,
            })
          }
          onEditVendor={(vendor) =>
            setVendorModal({
              open: true,
              mode: 'edit',
              vendor,
            })
          }
          onToggleVendorActive={handleToggleVendorActive}
          onDeleteVendor={handleDeleteVendor}
        />
      )}

      {activeTab === 'activity-types' && (
        <ActivityTypesSection
          activityTypes={activityTypes}
          filteredActivityTypes={filteredActivityTypes}
          isLoading={isLoading}
          activitySearch={activitySearch}
          setActivitySearch={setActivitySearch}
          activityMapFilter={activityMapFilter}
          setActivityMapFilter={setActivityMapFilter}
          activityStatusFilter={activityStatusFilter}
          setActivityStatusFilter={setActivityStatusFilter}
          onAddActivityType={() =>
            setActivityTypeModal({
              open: true,
              mode: 'create',
              activityType: null,
            })
          }
          onEditActivityType={(activityType) =>
            setActivityTypeModal({
              open: true,
              mode: 'edit',
              activityType,
            })
          }
          onToggleActivityTypeActive={handleToggleActivityTypeActive}
          onDeleteActivityType={handleDeleteActivityType}
        />
      )}

      {activeTab === 'defaults' && (
        <DefaultsSection
          settings={marketingSettings}
          isLoading={isLoading}
          onEditSetting={(setting) =>
            setSettingModal({
              open: true,
              setting,
            })
          }
        />
      )}

      {regionModal.open && (
        <RegionModal
          mode={regionModal.mode}
          region={regionModal.region}
          onClose={() =>
            setRegionModal({
              open: false,
              mode: 'create',
              region: null,
            })
          }
          onSaved={async (message) => {
            setRegionModal({
              open: false,
              mode: 'create',
              region: null,
            });

            showSuccess(message);

            await loadSettingsData();
          }}
        />
      )}

      {officeModal.open && (
        <OfficeModal
          mode={officeModal.mode}
          office={officeModal.office}
          regions={regions}
          onClose={() =>
            setOfficeModal({
              open: false,
              mode: 'create',
              office: null,
            })
          }
          onSaved={async (message) => {
            setOfficeModal({
              open: false,
              mode: 'create',
              office: null,
            });

            showSuccess(message);

            await loadSettingsData();
          }}
        />
      )}

      {vendorModal.open && (
        <VendorModal
          mode={vendorModal.mode}
          vendor={vendorModal.vendor}
          onClose={() =>
            setVendorModal({
              open: false,
              mode: 'create',
              vendor: null,
            })
          }
          onSaved={async (message) => {
            setVendorModal({
              open: false,
              mode: 'create',
              vendor: null,
            });

            showSuccess(message);

            await loadSettingsData();
          }}
        />
      )}

      {activityTypeModal.open && (
        <ActivityTypeModal
          mode={activityTypeModal.mode}
          activityType={activityTypeModal.activityType}
          onClose={() =>
            setActivityTypeModal({
              open: false,
              mode: 'create',
              activityType: null,
            })
          }
          onSaved={async (message) => {
            setActivityTypeModal({
              open: false,
              mode: 'create',
              activityType: null,
            });

            showSuccess(message);

            await loadSettingsData();
          }}
        />
      )}

      {settingModal.open && settingModal.setting && (
        <SettingModal
          setting={settingModal.setting}
          onClose={() =>
            setSettingModal({
              open: false,
              setting: null,
            })
          }
          onSaved={async (message) => {
            setSettingModal({
              open: false,
              setting: null,
            });

            showSuccess(message);

            await loadSettingsData();
          }}
        />
      )}

      {deleteRegionModal.open &&
        deleteRegionModal.region && (
          <DeleteRegionModal
            region={deleteRegionModal.region}
            regions={regions}
            offices={offices}
            onClose={() =>
              setDeleteRegionModal({
                open: false,
                region: null,
              })
            }
            onDeleted={async (message) => {
              setDeleteRegionModal({
                open: false,
                region: null,
              });

              showSuccess(message);

              await loadSettingsData();
            }}
          />
        )}
    </section>
  );
};


const VendorsSection = ({
  vendors,
  filteredVendors,
  isLoading,
  vendorSearch,
  setVendorSearch,
  vendorTypeFilter,
  setVendorTypeFilter,
  vendorStatusFilter,
  setVendorStatusFilter,
  onAddVendor,
  onEditVendor,
  onToggleVendorActive,
  onDeleteVendor,
}) => {
  const activeVendorCount = vendors.filter(
    (vendor) => vendor.is_active
  ).length;

  const vendorTypeCount = new Set(
    vendors
      .map((vendor) => vendor.vendor_type)
      .filter(Boolean)
  ).size;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(3, minmax(150px, 1fr))',
          gap: 10,
        }}
      >
        <MetricCard
          label="Vendors"
          value={vendors.length}
        />

        <MetricCard
          label="Active Vendors"
          value={activeVendorCount}
        />

        <MetricCard
          label="Vendor Types"
          value={vendorTypeCount}
        />
      </div>

      <div
        className={styles.card}
        style={{
          padding: 16,
          display: 'grid',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Vendors</h3>

            <small
              style={{
                color: '#64748b',
                fontWeight: 750,
              }}
            >
              Store vendor contacts, account information, service type, and status.
            </small>
          </div>

          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onAddVendor}
          >
            + Add Vendor
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(220px, 1fr) minmax(170px, 0.65fr) minmax(140px, 0.5fr)',
            gap: 8,
          }}
        >
          <input
            value={vendorSearch}
            onChange={(event) =>
              setVendorSearch(event.target.value)
            }
            placeholder="Search vendors..."
            style={inputStyle}
          />

          <select
            value={vendorTypeFilter}
            onChange={(event) =>
              setVendorTypeFilter(event.target.value)
            }
            style={inputStyle}
          >
            <option value="all">
              All Vendor Types
            </option>

            {VENDOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <select
            value={vendorStatusFilter}
            onChange={(event) =>
              setVendorStatusFilter(event.target.value)
            }
            style={inputStyle}
          >
            <option value="all">
              All Statuses
            </option>

            <option value="active">
              Active
            </option>

            <option value="inactive">
              Inactive
            </option>
          </select>
        </div>

        {isLoading ? (
          <div className={styles.emptyState}>
            Loading vendors...
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className={styles.emptyState}>
            No vendors found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Type</th>
                  <th>Contact</th>
                  <th>Account #</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredVendors.map((vendor) => (
                  <tr key={vendor.id}>
                    <td>
                      <strong>
                        {vendor.vendor_name}
                      </strong>

                      {vendor.website && (
                        <small>
                          {vendor.website}
                        </small>
                      )}
                    </td>

                    <td>
                      {vendor.vendor_type || '—'}
                    </td>

                    <td>
                      <strong>
                        {vendor.contact_name || '—'}
                      </strong>

                      {vendor.contact_phone && (
                        <small>
                          {vendor.contact_phone}
                        </small>
                      )}

                      {vendor.contact_email && (
                        <small>
                          {vendor.contact_email}
                        </small>
                      )}
                    </td>

                    <td>
                      {vendor.account_number || '—'}
                    </td>

                    <td>
                      {[vendor.city, vendor.state]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>

                    <td>
                      <StatusPill
                        active={vendor.is_active}
                      />
                    </td>

                    <td>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: 6,
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={() =>
                            onEditVendor(vendor)
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={() =>
                            onToggleVendorActive(vendor)
                          }
                        >
                          {vendor.is_active
                            ? 'Deactivate'
                            : 'Activate'}
                        </button>

                        <button
                          type="button"
                          className={styles.dangerBtn}
                          onClick={() =>
                            onDeleteVendor(vendor)
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const VendorModal = ({
  mode,
  vendor,
  onClose,
  onSaved,
}) => {
  const [draft, setDraft] = useState(() =>
    mode === 'edit' && vendor
      ? {
          vendor_name: vendor.vendor_name || '',
          vendor_type:
            vendor.vendor_type || 'Billboard',
          contact_name:
            vendor.contact_name || '',
          contact_phone:
            vendor.contact_phone || '',
          contact_email:
            vendor.contact_email || '',
          website:
            vendor.website || '',
          account_number:
            vendor.account_number || '',
          address:
            vendor.address || '',
          city:
            vendor.city || '',
          state:
            vendor.state || 'CA',
          zip_code:
            vendor.zip_code || '',
          notes:
            vendor.notes || '',
          is_active:
            vendor.is_active !== false,
          sort_order:
            vendor.sort_order ?? 0,
        }
      : { ...EMPTY_VENDOR_FORM }
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const updateDraft = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const vendorName = normalizeText(
      draft.vendor_name
    );

    if (!vendorName) {
      setErrorMessage(
        'Vendor name is required.'
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const payload = {
        vendor_name: vendorName,
        vendor_type:
          normalizeNullableText(
            draft.vendor_type
          ),
        contact_name:
          normalizeNullableText(
            draft.contact_name
          ),
        contact_phone:
          normalizeNullableText(
            draft.contact_phone
          ),
        contact_email:
          normalizeNullableText(
            draft.contact_email
          ),
        website:
          normalizeNullableText(
            draft.website
          ),
        account_number:
          normalizeNullableText(
            draft.account_number
          ),
        address:
          normalizeNullableText(
            draft.address
          ),
        city:
          normalizeNullableText(
            draft.city
          ),
        state:
          normalizeNullableText(
            draft.state
          ) || 'CA',
        zip_code:
          normalizeNullableText(
            draft.zip_code
          ),
        notes:
          normalizeNullableText(
            draft.notes
          ),
        is_active:
          Boolean(draft.is_active),
        sort_order:
          Number(draft.sort_order || 0),
      };

      if (mode === 'edit' && vendor?.id) {
        const { error } = await supabase
          .from('marketing_vendors')
          .update(payload)
          .eq('id', vendor.id);

        if (error) throw error;

        onSaved(`${vendorName} updated.`);
      } else {
        const { error } = await supabase
          .from('marketing_vendors')
          .insert(payload);

        if (error) throw error;

        onSaved(`${vendorName} added.`);
      }
    } catch (error) {
      console.error(
        'Error saving vendor:',
        error
      );

      if (
        String(error?.message || '')
          .toLowerCase()
          .includes('duplicate')
      ) {
        setErrorMessage(
          'A vendor with that name already exists.'
        );
      } else {
        setErrorMessage(
          error?.message ||
            'Could not save vendor.'
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      title={
        mode === 'edit'
          ? 'Edit Vendor'
          : 'Add Vendor'
      }
      subtitle="Keep the vendor contact and account information used throughout MarketingOps."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'grid', gap: 12 }}
      >
        {errorMessage && (
          <div className={styles.errorBanner}>
            {errorMessage}
          </div>
        )}

        <div style={twoColumnGrid}>
          <label style={labelStyle}>
            Vendor Name
            <input
              value={draft.vendor_name}
              onChange={(event) =>
                updateDraft(
                  'vendor_name',
                  event.target.value
                )
              }
              placeholder="Lamar Advertising"
              autoFocus
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Vendor Type
            <select
              value={draft.vendor_type}
              onChange={(event) =>
                updateDraft(
                  'vendor_type',
                  event.target.value
                )
              }
              style={inputStyle}
            >
              {VENDOR_TYPES.map((type) => (
                <option
                  key={type}
                  value={type}
                >
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Contact Name
            <input
              value={draft.contact_name}
              onChange={(event) =>
                updateDraft(
                  'contact_name',
                  event.target.value
                )
              }
              placeholder="Vendor representative"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Contact Phone
            <input
              value={draft.contact_phone}
              onChange={(event) =>
                updateDraft(
                  'contact_phone',
                  event.target.value
                )
              }
              placeholder="555-555-5555"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Contact Email
            <input
              type="email"
              value={draft.contact_email}
              onChange={(event) =>
                updateDraft(
                  'contact_email',
                  event.target.value
                )
              }
              placeholder="rep@vendor.com"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Website
            <input
              value={draft.website}
              onChange={(event) =>
                updateDraft(
                  'website',
                  event.target.value
                )
              }
              placeholder="https://vendor.com"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Account / Customer #
            <input
              value={draft.account_number}
              onChange={(event) =>
                updateDraft(
                  'account_number',
                  event.target.value
                )
              }
              placeholder="Account number"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            City
            <input
              value={draft.city}
              onChange={(event) =>
                updateDraft(
                  'city',
                  event.target.value
                )
              }
              placeholder="Modesto"
              style={inputStyle}
            />
          </label>

          <label
            style={{
              ...labelStyle,
              gridColumn: '1 / -1',
            }}
          >
            Address
            <input
              value={draft.address}
              onChange={(event) =>
                updateDraft(
                  'address',
                  event.target.value
                )
              }
              placeholder="Vendor address"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            State
            <input
              value={draft.state}
              onChange={(event) =>
                updateDraft(
                  'state',
                  event.target.value
                )
              }
              placeholder="CA"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            ZIP Code
            <input
              value={draft.zip_code}
              onChange={(event) =>
                updateDraft(
                  'zip_code',
                  event.target.value
                )
              }
              placeholder="95350"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Sort Order
            <input
              type="number"
              value={draft.sort_order}
              onChange={(event) =>
                updateDraft(
                  'sort_order',
                  event.target.value
                )
              }
              style={inputStyle}
            />
          </label>

          <label
            style={{
              ...labelStyle,
              gridColumn: '1 / -1',
            }}
          >
            Notes
            <textarea
              value={draft.notes}
              onChange={(event) =>
                updateDraft(
                  'notes',
                  event.target.value
                )
              }
              placeholder="Contract contacts, billing notes, account details..."
              rows={5}
              style={{
                ...inputStyle,
                resize: 'vertical',
              }}
            />
          </label>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#334155',
            fontWeight: 850,
          }}
        >
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(event) =>
              updateDraft(
                'is_active',
                event.target.checked
              )
            }
          />
          Active vendor
        </label>

        <div style={modalActionStyle}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={isSaving}
          >
            {isSaving
              ? 'Saving...'
              : mode === 'edit'
                ? 'Save Vendor'
                : 'Add Vendor'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};


const ActivityTypesSection = ({
  activityTypes,
  filteredActivityTypes,
  isLoading,
  activitySearch,
  setActivitySearch,
  activityMapFilter,
  setActivityMapFilter,
  activityStatusFilter,
  setActivityStatusFilter,
  onAddActivityType,
  onEditActivityType,
  onToggleActivityTypeActive,
  onDeleteActivityType,
}) => {
  const activeCount = activityTypes.filter(
    (item) => item.is_active
  ).length;

  const pointCount = activityTypes.filter(
    (item) => item.map_behavior === 'point'
  ).length;

  const areaCount = activityTypes.filter(
    (item) => item.map_behavior === 'area'
  ).length;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(4, minmax(140px, 1fr))',
          gap: 10,
        }}
      >
        <MetricCard
          label="Activity Types"
          value={activityTypes.length}
        />

        <MetricCard
          label="Active"
          value={activeCount}
        />

        <MetricCard
          label="Map Points"
          value={pointCount}
        />

        <MetricCard
          label="Area Based"
          value={areaCount}
        />
      </div>

      <div
        className={styles.card}
        style={{
          padding: 16,
          display: 'grid',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>
              Activity Types
            </h3>

            <small
              style={{
                color: '#64748b',
                fontWeight: 750,
              }}
            >
              Control marketing categories, labels, ordering, and future map behavior.
            </small>
          </div>

          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onAddActivityType}
          >
            + Add Activity Type
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(220px, 1fr) minmax(180px, 0.65fr) minmax(140px, 0.5fr)',
            gap: 8,
          }}
        >
          <input
            value={activitySearch}
            onChange={(event) =>
              setActivitySearch(event.target.value)
            }
            placeholder="Search activity types..."
            style={inputStyle}
          />

          <select
            value={activityMapFilter}
            onChange={(event) =>
              setActivityMapFilter(event.target.value)
            }
            style={inputStyle}
          >
            <option value="all">
              All Map Behaviors
            </option>

            <option value="point">
              Point / Marker
            </option>

            <option value="area">
              Area / Coverage
            </option>

            <option value="none">
              No Map Placement
            </option>
          </select>

          <select
            value={activityStatusFilter}
            onChange={(event) =>
              setActivityStatusFilter(event.target.value)
            }
            style={inputStyle}
          >
            <option value="all">
              All Statuses
            </option>

            <option value="active">
              Active
            </option>

            <option value="inactive">
              Inactive
            </option>
          </select>
        </div>

        {isLoading ? (
          <div className={styles.emptyState}>
            Loading activity types...
          </div>
        ) : filteredActivityTypes.length === 0 ? (
          <div className={styles.emptyState}>
            No activity types found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Activity Type</th>
                  <th>Key</th>
                  <th>Category</th>
                  <th>Map Behavior</th>
                  <th>Icon</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredActivityTypes.map(
                  (activityType) => (
                    <tr key={activityType.id}>
                      <td>
                        <strong>
                          {activityType.label}
                        </strong>

                        {activityType.description && (
                          <small>
                            {activityType.description}
                          </small>
                        )}
                      </td>

                      <td>
                        <code
                          style={{
                            fontSize: 11,
                            background: '#f1f5f9',
                            padding: '3px 6px',
                            borderRadius: 6,
                          }}
                        >
                          {activityType.key}
                        </code>
                      </td>

                      <td>
                        {activityType.category || '—'}
                      </td>

                      <td>
                        <MapBehaviorPill
                          behavior={
                            activityType.map_behavior
                          }
                        />
                      </td>

                      <td>
                        {activityType.icon_key || '—'}
                      </td>

                      <td>
                        {activityType.sort_order ?? 0}
                      </td>

                      <td>
                        <StatusPill
                          active={activityType.is_active}
                        />
                      </td>

                      <td>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 6,
                            flexWrap: 'wrap',
                          }}
                        >
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            onClick={() =>
                              onEditActivityType(
                                activityType
                              )
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            onClick={() =>
                              onToggleActivityTypeActive(
                                activityType
                              )
                            }
                          >
                            {activityType.is_active
                              ? 'Deactivate'
                              : 'Activate'}
                          </button>

                          <button
                            type="button"
                            className={styles.dangerBtn}
                            onClick={() =>
                              onDeleteActivityType(
                                activityType
                              )
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const ActivityTypeModal = ({
  mode,
  activityType,
  onClose,
  onSaved,
}) => {
  const [draft, setDraft] = useState(() =>
    mode === 'edit' && activityType
      ? {
          key: activityType.key || '',
          label: activityType.label || '',
          description:
            activityType.description || '',
          category:
            activityType.category || '',
          map_behavior:
            activityType.map_behavior || 'none',
          icon_key:
            activityType.icon_key || '',
          is_active:
            activityType.is_active !== false,
          sort_order:
            activityType.sort_order ?? 0,
        }
      : { ...EMPTY_ACTIVITY_TYPE_FORM }
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const updateDraft = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const key = normalizeText(
      draft.key
    )
      .toLowerCase()
      .replace(/\s+/g, '_');

    const label = normalizeText(
      draft.label
    );

    if (!key) {
      setErrorMessage(
        'Activity key is required.'
      );
      return;
    }

    if (!label) {
      setErrorMessage(
        'Activity label is required.'
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const payload = {
        key,
        label,
        description:
          normalizeNullableText(
            draft.description
          ),
        category:
          normalizeNullableText(
            draft.category
          ),
        map_behavior:
          draft.map_behavior || 'none',
        icon_key:
          normalizeNullableText(
            draft.icon_key
          ),
        is_active:
          Boolean(draft.is_active),
        sort_order:
          Number(draft.sort_order || 0),
      };

      if (
        mode === 'edit' &&
        activityType?.id
      ) {
        const { error } = await supabase
          .from('marketing_activity_types')
          .update(payload)
          .eq('id', activityType.id);

        if (error) throw error;

        onSaved(`${label} updated.`);
      } else {
        const { error } = await supabase
          .from('marketing_activity_types')
          .insert(payload);

        if (error) throw error;

        onSaved(`${label} added.`);
      }
    } catch (error) {
      console.error(
        'Error saving activity type:',
        error
      );

      const message =
        String(error?.message || '')
          .toLowerCase();

      if (message.includes('duplicate')) {
        setErrorMessage(
          'That activity key or label already exists.'
        );
      } else {
        setErrorMessage(
          error?.message ||
            'Could not save activity type.'
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      title={
        mode === 'edit'
          ? 'Edit Activity Type'
          : 'Add Activity Type'
      }
      subtitle="Activity Types control how marketing categories are labeled and how they behave on the map."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'grid', gap: 12 }}
      >
        {errorMessage && (
          <div className={styles.errorBanner}>
            {errorMessage}
          </div>
        )}

        <div style={twoColumnGrid}>
          <label style={labelStyle}>
            Activity Label
            <input
              value={draft.label}
              onChange={(event) =>
                updateDraft(
                  'label',
                  event.target.value
                )
              }
              placeholder="Billboard"
              autoFocus
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Activity Key
            <input
              value={draft.key}
              onChange={(event) =>
                updateDraft(
                  'key',
                  event.target.value
                )
              }
              placeholder="billboard"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Category
            <select
              value={draft.category}
              onChange={(event) =>
                updateDraft(
                  'category',
                  event.target.value
                )
              }
              style={inputStyle}
            >
              <option value="">
                No Category
              </option>

              {ACTIVITY_CATEGORY_OPTIONS.map(
                (category) => (
                  <option
                    key={category}
                    value={category}
                  >
                    {category}
                  </option>
                )
              )}
            </select>
          </label>

          <label style={labelStyle}>
            Map Behavior
            <select
              value={draft.map_behavior}
              onChange={(event) =>
                updateDraft(
                  'map_behavior',
                  event.target.value
                )
              }
              style={inputStyle}
            >
              {MAP_BEHAVIOR_OPTIONS.map(
                (option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                )
              )}
            </select>
          </label>

          <label style={labelStyle}>
            Icon Key
            <input
              value={draft.icon_key}
              onChange={(event) =>
                updateDraft(
                  'icon_key',
                  event.target.value
                )
              }
              placeholder="billboard, office, dmv..."
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Sort Order
            <input
              type="number"
              value={draft.sort_order}
              onChange={(event) =>
                updateDraft(
                  'sort_order',
                  event.target.value
                )
              }
              style={inputStyle}
            />
          </label>

          <label
            style={{
              ...labelStyle,
              gridColumn: '1 / -1',
            }}
          >
            Description
            <textarea
              value={draft.description}
              onChange={(event) =>
                updateDraft(
                  'description',
                  event.target.value
                )
              }
              placeholder="Describe how this marketing activity is used..."
              rows={4}
              style={{
                ...inputStyle,
                resize: 'vertical',
              }}
            />
          </label>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#334155',
            fontWeight: 850,
          }}
        >
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(event) =>
              updateDraft(
                'is_active',
                event.target.checked
              )
            }
          />
          Active activity type
        </label>

        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 11,
            color: '#64748b',
            fontSize: 11,
            fontWeight: 750,
            lineHeight: 1.5,
          }}
        >
          <strong
            style={{
              display: 'block',
              color: '#334155',
              marginBottom: 3,
            }}
          >
            Map Behavior
          </strong>

          Point = physical map marker. Area = coverage/market based. None = list/campaign only.
        </div>

        <div style={modalActionStyle}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={isSaving}
          >
            {isSaving
              ? 'Saving...'
              : mode === 'edit'
                ? 'Save Activity Type'
                : 'Add Activity Type'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const MapBehaviorPill = ({ behavior }) => {
  const meta = {
    point: {
      label: 'Point',
      background: '#dbeafe',
      color: '#1d4ed8',
    },
    area: {
      label: 'Area',
      background: '#ede9fe',
      color: '#6d28d9',
    },
    none: {
      label: 'None',
      background: '#f1f5f9',
      color: '#64748b',
    },
  };

  const current =
    meta[behavior] || meta.none;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '4px 8px',
        fontSize: 10,
        fontWeight: 950,
        background: current.background,
        color: current.color,
      }}
    >
      {current.label}
    </span>
  );
};


const DefaultsSection = ({
  settings,
  isLoading,
  onEditSetting,
}) => {
  const groupedSettings = useMemo(() => {
    const groups = {};

    settings.forEach((setting) => {
      const category =
        setting.category || 'general';

      if (!groups[category]) {
        groups[category] = [];
      }

      groups[category].push(setting);
    });

    return groups;
  }, [settings]);

  const categoryMeta = {
    renewals: {
      title: 'Renewals',
      description:
        'Contract and campaign renewal warning timing.',
      icon: '⏰',
    },

    campaigns: {
      title: 'Campaigns',
      description:
        'Defaults used when creating new marketing campaigns.',
      icon: '📣',
    },

    map: {
      title: 'Map',
      description:
        'Default MarketingOps map zoom behavior.',
      icon: '🗺️',
    },

    general: {
      title: 'General',
      description:
        'General MarketingOps defaults.',
      icon: '⚙️',
    },
  };

  const orderedCategories = [
    'renewals',
    'campaigns',
    'map',
    'general',
    ...Object.keys(groupedSettings).filter(
      (category) =>
        ![
          'renewals',
          'campaigns',
          'map',
          'general',
        ].includes(category)
    ),
  ];

  const activeCount = settings.filter(
    (setting) => setting.is_active
  ).length;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(3, minmax(150px, 1fr))',
          gap: 10,
        }}
      >
        <MetricCard
          label="Settings"
          value={settings.length}
        />

        <MetricCard
          label="Active Defaults"
          value={activeCount}
        />

        <MetricCard
          label="Categories"
          value={
            new Set(
              settings
                .map((setting) => setting.category)
                .filter(Boolean)
            ).size
          }
        />
      </div>

      {isLoading ? (
        <div className={styles.emptyState}>
          Loading defaults...
        </div>
      ) : settings.length === 0 ? (
        <div className={styles.emptyState}>
          No MarketingOps defaults found.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(2, minmax(320px, 1fr))',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {orderedCategories.map((category) => {
            const categorySettings =
              groupedSettings[category];

            if (!categorySettings?.length) {
              return null;
            }

            const meta =
              categoryMeta[category] || {
                title:
                  category
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (char) =>
                      char.toUpperCase()
                    ),
                description:
                  'MarketingOps system defaults.',
                icon: '⚙️',
              };

            return (
              <div
                key={category}
                className={styles.card}
                style={{
                  padding: 16,
                  display: 'grid',
                  gap: 12,
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>
                    {meta.icon} {meta.title}
                  </h3>

                  <small
                    style={{
                      display: 'block',
                      marginTop: 4,
                      color: '#64748b',
                      fontWeight: 750,
                    }}
                  >
                    {meta.description}
                  </small>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {categorySettings.map((setting) => (
                    <SettingRow
                      key={setting.id}
                      setting={setting}
                      onEdit={() =>
                        onEditSetting(setting)
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SettingRow = ({
  setting,
  onEdit,
}) => {
  const value =
    setting?.setting_value?.value;

  const displayValue =
    typeof value === 'boolean'
      ? value
        ? 'On'
        : 'Off'
      : value === null ||
          value === undefined ||
          value === ''
        ? '—'
        : String(value);

  const unit =
    setting.setting_key.includes('days')
      ? ' days'
      : setting.setting_key.includes('zoom')
        ? 'x'
        : '';

  const friendlyLabel =
    setting.setting_key
      .replace(/^default_/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) =>
        char.toUpperCase()
      );

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 11,
        display: 'grid',
        gap: 8,
        background: setting.is_active
          ? '#ffffff'
          : '#f8fafc',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <strong
            style={{
              display: 'block',
              color: '#0f172a',
              fontSize: 13,
            }}
          >
            {friendlyLabel}
          </strong>

          {setting.description && (
            <small
              style={{
                display: 'block',
                marginTop: 3,
                color: '#64748b',
                fontWeight: 700,
                lineHeight: 1.4,
              }}
            >
              {setting.description}
            </small>
          )}
        </div>

        <StatusPill active={setting.is_active} />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <strong
          style={{
            color: '#0369a1',
            fontSize: 18,
          }}
        >
          {displayValue}
          {typeof value === 'number'
            ? unit
            : ''}
        </strong>

        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onEdit}
        >
          Edit
        </button>
      </div>
    </div>
  );
};

const SettingModal = ({
  setting,
  onClose,
  onSaved,
}) => {
  const currentValue =
    setting?.setting_value?.value;

  const [value, setValue] = useState(
    currentValue ?? ''
  );

  const [isActive, setIsActive] = useState(
    setting?.is_active !== false
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const friendlyLabel =
    setting.setting_key
      .replace(/^default_/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) =>
        char.toUpperCase()
      );

  const isBoolean =
    typeof currentValue === 'boolean';

  const isNumber =
    typeof currentValue === 'number';

  const handleSubmit = async (event) => {
    event.preventDefault();

    setIsSaving(true);
    setErrorMessage('');

    try {
      let normalizedValue = value;

      if (isBoolean) {
        normalizedValue = Boolean(value);
      } else if (isNumber) {
        const numeric = Number(value);

        if (!Number.isFinite(numeric)) {
          setErrorMessage(
            'Enter a valid number.'
          );
          setIsSaving(false);
          return;
        }

        normalizedValue = numeric;
      } else {
        normalizedValue =
          String(value ?? '').trim();
      }

      const { error } = await supabase
        .from('marketing_settings')
        .update({
          setting_value: {
            value: normalizedValue,
          },
          is_active: isActive,
        })
        .eq('id', setting.id);

      if (error) throw error;

      onSaved(`${friendlyLabel} updated.`);
    } catch (error) {
      console.error(
        'Error saving MarketingOps setting:',
        error
      );

      setErrorMessage(
        error?.message ||
          'Could not save setting.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      title={`Edit ${friendlyLabel}`}
      subtitle={
        setting.description ||
        'Update this MarketingOps default.'
      }
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'grid', gap: 12 }}
      >
        {errorMessage && (
          <div className={styles.errorBanner}>
            {errorMessage}
          </div>
        )}

        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 10,
            color: '#64748b',
            fontSize: 11,
            fontWeight: 750,
          }}
        >
          Setting Key:{' '}
          <code>{setting.setting_key}</code>
        </div>

        {isBoolean ? (
          <label style={labelStyle}>
            Default Value
            <select
              value={
                value ? 'true' : 'false'
              }
              onChange={(event) =>
                setValue(
                  event.target.value === 'true'
                )
              }
              style={inputStyle}
            >
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </label>
        ) : (
          <label style={labelStyle}>
            Default Value
            <input
              type={
                isNumber
                  ? 'number'
                  : 'text'
              }
              step={
                isNumber ? 'any' : undefined
              }
              value={value}
              onChange={(event) =>
                setValue(event.target.value)
              }
              autoFocus
              style={inputStyle}
            />
          </label>
        )}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#334155',
            fontWeight: 850,
          }}
        >
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) =>
              setIsActive(
                event.target.checked
              )
            }
          />
          Active setting
        </label>

        <div style={modalActionStyle}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={isSaving}
          >
            {isSaving
              ? 'Saving...'
              : 'Save Default'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const RegionRow = ({
  region,
  onEdit,
  onToggle,
  onDelete,
}) => (
  <div
    style={{
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 11,
      display: 'grid',
      gap: 8,
      background: region.is_active
        ? '#ffffff'
        : '#f8fafc',
    }}
  >
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <strong
          style={{
            display: 'block',
            color: '#0f172a',
            fontSize: 14,
          }}
        >
          {region.name}
        </strong>

        {region.description && (
          <span
            style={{
              display: 'block',
              marginTop: 3,
              color: '#64748b',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {region.description}
          </span>
        )}
      </div>

      <StatusPill active={region.is_active} />
    </div>

    <div
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <span style={countPillStyle}>
        {Number(region.office_count || 0)} offices
      </span>

      <span style={countPillStyle}>
        {Number(region.active_office_count || 0)} active
      </span>
    </div>

    <div
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        className={styles.secondaryBtn}
        onClick={onEdit}
      >
        Rename / Edit
      </button>

      <button
        type="button"
        className={styles.secondaryBtn}
        onClick={onToggle}
      >
        {region.is_active
          ? 'Deactivate'
          : 'Activate'}
      </button>

      <button
        type="button"
        className={styles.dangerBtn}
        onClick={onDelete}
      >
        Remove
      </button>
    </div>
  </div>
);

const RegionModal = ({
  mode,
  region,
  onClose,
  onSaved,
}) => {
  const [draft, setDraft] = useState(() =>
    mode === 'edit' && region
      ? {
          name: region.name || '',
          description: region.description || '',
          is_active: region.is_active !== false,
          sort_order: region.sort_order ?? 0,
        }
      : { ...EMPTY_REGION_FORM }
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const updateDraft = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const name = normalizeText(draft.name);

    if (!name) {
      setErrorMessage('Region name is required.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const payload = {
        name,
        description: normalizeNullableText(
          draft.description
        ),
        is_active: Boolean(draft.is_active),
        sort_order: Number(draft.sort_order || 0),
      };

      if (mode === 'edit' && region?.id) {
        const { error } = await supabase
          .from('marketing_regions')
          .update(payload)
          .eq('id', region.id);

        if (error) throw error;

        onSaved(`Region updated to ${name}.`);
      } else {
        const { error } = await supabase
          .from('marketing_regions')
          .insert(payload);

        if (error) throw error;

        onSaved(`${name} region added.`);
      }
    } catch (error) {
      console.error('Error saving region:', error);

      if (
        String(error?.message || '')
          .toLowerCase()
          .includes('duplicate')
      ) {
        setErrorMessage(
          'A region with that name already exists.'
        );
      } else {
        setErrorMessage(
          error?.message ||
            'Could not save region.'
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      title={
        mode === 'edit'
          ? 'Edit Region'
          : 'Add Region'
      }
      subtitle="Region names are used throughout MarketingOps for office assignment and filtering."
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'grid', gap: 12 }}
      >
        {errorMessage && (
          <div className={styles.errorBanner}>
            {errorMessage}
          </div>
        )}

        <label style={labelStyle}>
          Region Name
          <input
            value={draft.name}
            onChange={(event) =>
              updateDraft(
                'name',
                event.target.value
              )
            }
            placeholder="Central Valley"
            autoFocus
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Description
          <textarea
            value={draft.description}
            onChange={(event) =>
              updateDraft(
                'description',
                event.target.value
              )
            }
            placeholder="Optional description..."
            rows={3}
            style={{
              ...inputStyle,
              resize: 'vertical',
            }}
          />
        </label>

        <label style={labelStyle}>
          Sort Order
          <input
            type="number"
            value={draft.sort_order}
            onChange={(event) =>
              updateDraft(
                'sort_order',
                event.target.value
              )
            }
            style={inputStyle}
          />
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#334155',
            fontWeight: 850,
          }}
        >
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(event) =>
              updateDraft(
                'is_active',
                event.target.checked
              )
            }
          />
          Active region
        </label>

        <div style={modalActionStyle}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={isSaving}
          >
            {isSaving
              ? 'Saving...'
              : mode === 'edit'
                ? 'Save Region'
                : 'Add Region'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const OfficeModal = ({
  mode,
  office,
  regions,
  onClose,
  onSaved,
}) => {
  const [draft, setDraft] = useState(() =>
    mode === 'edit' && office
      ? {
          office_code: office.office_code || '',
          office_name: office.office_name || '',
          region_id: office.region_id || '',
          address: office.address || '',
          city: office.city || '',
          state: office.state || 'CA',
          zip_code: office.zip_code || '',
          latitude: office.latitude ?? '',
          longitude: office.longitude ?? '',
          phone: office.phone || '',
          notes: office.notes || '',
          is_active: office.is_active !== false,
          sort_order: office.sort_order ?? 0,
        }
      : { ...EMPTY_OFFICE_FORM }
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const updateDraft = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const officeCode = normalizeText(
      draft.office_code
    );

    if (!officeCode) {
      setErrorMessage(
        'Office code is required.'
      );
      return;
    }

    if (
      (draft.latitude && !draft.longitude) ||
      (!draft.latitude && draft.longitude)
    ) {
      setErrorMessage(
        'Latitude and longitude must both be filled in or both left blank.'
      );
      return;
    }

    if (
      draft.latitude ||
      draft.longitude
    ) {
      const latitude = Number(
        draft.latitude
      );

      const longitude = Number(
        draft.longitude
      );

      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90
      ) {
        setErrorMessage(
          'Latitude must be between -90 and 90.'
        );
        return;
      }

      if (
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        setErrorMessage(
          'Longitude must be between -180 and 180.'
        );
        return;
      }
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const payload = {
        office_code: officeCode,
        office_name: normalizeNullableText(
          draft.office_name
        ),
        region_id: draft.region_id || null,
        address: normalizeNullableText(
          draft.address
        ),
        city: normalizeNullableText(
          draft.city
        ),
        state:
          normalizeNullableText(
            draft.state
          ) || 'CA',
        zip_code: normalizeNullableText(
          draft.zip_code
        ),
        latitude: normalizeNullableNumber(
          draft.latitude
        ),
        longitude: normalizeNullableNumber(
          draft.longitude
        ),
        phone: normalizeNullableText(
          draft.phone
        ),
        notes: normalizeNullableText(
          draft.notes
        ),
        is_active: Boolean(draft.is_active),
        sort_order: Number(
          draft.sort_order || 0
        ),
      };

      if (mode === 'edit' && office?.id) {
        const { error } = await supabase
          .from('marketing_offices')
          .update(payload)
          .eq('id', office.id);

        if (error) throw error;

        onSaved(`${officeCode} updated.`);
      } else {
        const { error } = await supabase
          .from('marketing_offices')
          .insert(payload);

        if (error) throw error;

        onSaved(`${officeCode} added.`);
      }
    } catch (error) {
      console.error('Error saving office:', error);

      if (
        String(error?.message || '')
          .toLowerCase()
          .includes('duplicate')
      ) {
        setErrorMessage(
          'That office code already exists.'
        );
      } else {
        setErrorMessage(
          error?.message ||
            'Could not save office.'
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      title={
        mode === 'edit'
          ? 'Edit Office'
          : 'Add Office'
      }
      subtitle="Assign the office to a region and keep the office information used by MarketingOps."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'grid', gap: 12 }}
      >
        {errorMessage && (
          <div className={styles.errorBanner}>
            {errorMessage}
          </div>
        )}

        <div style={twoColumnGrid}>
          <label style={labelStyle}>
            Office Code
            <input
              value={draft.office_code}
              onChange={(event) =>
                updateDraft(
                  'office_code',
                  event.target.value
                )
              }
              placeholder="CA117"
              autoFocus
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Office Name
            <input
              value={draft.office_name}
              onChange={(event) =>
                updateDraft(
                  'office_name',
                  event.target.value
                )
              }
              placeholder="Turlock"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Region
            <select
              value={draft.region_id}
              onChange={(event) =>
                updateDraft(
                  'region_id',
                  event.target.value
                )
              }
              style={inputStyle}
            >
              <option value="">Unassigned</option>

              {regions.map((region) => (
                <option
                  key={region.id}
                  value={region.id}
                >
                  {region.name}
                  {!region.is_active
                    ? ' (Inactive)'
                    : ''}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            City
            <input
              value={draft.city}
              onChange={(event) =>
                updateDraft(
                  'city',
                  event.target.value
                )
              }
              placeholder="Turlock"
              style={inputStyle}
            />
          </label>

          <label
            style={{
              ...labelStyle,
              gridColumn: '1 / -1',
            }}
          >
            Address
            <input
              value={draft.address}
              onChange={(event) =>
                updateDraft(
                  'address',
                  event.target.value
                )
              }
              placeholder="1097 W Main St"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            State
            <input
              value={draft.state}
              onChange={(event) =>
                updateDraft(
                  'state',
                  event.target.value
                )
              }
              placeholder="CA"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            ZIP Code
            <input
              value={draft.zip_code}
              onChange={(event) =>
                updateDraft(
                  'zip_code',
                  event.target.value
                )
              }
              placeholder="95382"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Latitude
            <input
              type="text"
              inputMode="decimal"
              value={draft.latitude}
              onChange={(event) =>
                updateDraft(
                  'latitude',
                  event.target.value
                )
              }
              placeholder="37.4947"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Longitude
            <input
              type="text"
              inputMode="decimal"
              value={draft.longitude}
              onChange={(event) =>
                updateDraft(
                  'longitude',
                  event.target.value
                )
              }
              placeholder="-120.8466"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Phone
            <input
              value={draft.phone}
              onChange={(event) =>
                updateDraft(
                  'phone',
                  event.target.value
                )
              }
              placeholder="209-555-5555"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Sort Order
            <input
              type="number"
              value={draft.sort_order}
              onChange={(event) =>
                updateDraft(
                  'sort_order',
                  event.target.value
                )
              }
              style={inputStyle}
            />
          </label>

          <label
            style={{
              ...labelStyle,
              gridColumn: '1 / -1',
            }}
          >
            Notes
            <textarea
              value={draft.notes}
              onChange={(event) =>
                updateDraft(
                  'notes',
                  event.target.value
                )
              }
              placeholder="Office marketing notes..."
              rows={4}
              style={{
                ...inputStyle,
                resize: 'vertical',
              }}
            />
          </label>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#334155',
            fontWeight: 850,
          }}
        >
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(event) =>
              updateDraft(
                'is_active',
                event.target.checked
              )
            }
          />
          Active office
        </label>

        <div style={modalActionStyle}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={isSaving}
          >
            {isSaving
              ? 'Saving...'
              : mode === 'edit'
                ? 'Save Office'
                : 'Add Office'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

const DeleteRegionModal = ({
  region,
  regions,
  offices,
  onClose,
  onDeleted,
}) => {
  const assignedOffices = useMemo(
    () =>
      offices.filter(
        (office) =>
          office.region_id === region.id
      ),
    [offices, region.id]
  );

  const replacementRegions =
    regions.filter(
      (item) =>
        item.id !== region.id &&
        item.is_active
    );

  const [
    replacementRegionId,
    setReplacementRegionId,
  ] = useState(
    replacementRegions[0]?.id || ''
  );

  const [isDeleting, setIsDeleting] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const handleDelete = async () => {
    setErrorMessage('');

    if (
      assignedOffices.length > 0 &&
      !replacementRegionId
    ) {
      setErrorMessage(
        'Choose a replacement region before removing this region.'
      );
      return;
    }

    setIsDeleting(true);

    try {
      if (assignedOffices.length > 0) {
        const { error } = await supabase.rpc(
          'marketing_reassign_and_delete_region',
          {
            old_region_id: region.id,
            new_region_id:
              replacementRegionId,
          }
        );

        if (error) throw error;

        const replacement =
          replacementRegions.find(
            (item) =>
              item.id ===
              replacementRegionId
          );

        onDeleted(
          `${region.name} removed. ${
            assignedOffices.length
          } office${
            assignedOffices.length === 1
              ? ''
              : 's'
          } moved to ${
            replacement?.name ||
            'the replacement region'
          }.`
        );

        return;
      }

      const { error } = await supabase
        .from('marketing_regions')
        .delete()
        .eq('id', region.id);

      if (error) throw error;

      onDeleted(`${region.name} removed.`);
    } catch (error) {
      console.error(
        'Error deleting region:',
        error
      );

      setErrorMessage(
        error?.message ||
          'Could not remove region.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ModalShell
      title={`Remove ${region.name}?`}
      subtitle="Regions with assigned offices must be reassigned before the region can be deleted."
      onClose={onClose}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {errorMessage && (
          <div className={styles.errorBanner}>
            {errorMessage}
          </div>
        )}

        <div
          style={{
            background:
              assignedOffices.length > 0
                ? '#fff7ed'
                : '#f8fafc',

            border:
              assignedOffices.length > 0
                ? '1px solid #fed7aa'
                : '1px solid #e2e8f0',

            borderRadius: 12,
            padding: 12,
            color: '#475569',
            fontWeight: 750,
            lineHeight: 1.5,
          }}
        >
          {assignedOffices.length > 0 ? (
            <>
              <strong
                style={{
                  color: '#9a3412',
                }}
              >
                {assignedOffices.length} office
                {assignedOffices.length === 1
                  ? ''
                  : 's'}{' '}
                currently assigned.
              </strong>

              <div style={{ marginTop: 5 }}>
                {assignedOffices
                  .map(
                    (office) =>
                      office.office_code
                  )
                  .join(', ')}
              </div>
            </>
          ) : (
            'No offices are assigned to this region. It can be removed immediately.'
          )}
        </div>

        {assignedOffices.length > 0 && (
          <label style={labelStyle}>
            Move Offices To
            <select
              value={replacementRegionId}
              onChange={(event) =>
                setReplacementRegionId(
                  event.target.value
                )
              }
              style={inputStyle}
            >
              <option value="">
                Choose replacement region...
              </option>

              {replacementRegions.map(
                (replacement) => (
                  <option
                    key={replacement.id}
                    value={replacement.id}
                  >
                    {replacement.name}
                  </option>
                )
              )}
            </select>
          </label>
        )}

        <div style={modalActionStyle}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>

          <button
            type="button"
            className={styles.dangerBtn}
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting
              ? 'Removing...'
              : assignedOffices.length > 0
                ? 'Reassign & Remove Region'
                : 'Remove Region'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

const ModalShell = ({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}) => {
  const handleOverlayMouseDown = (
    event
  ) => {
    if (
      event.target ===
      event.currentTarget
    ) {
      onClose();
    }
  };

  return (
    <div
      className={styles.modalOverlay}
      onMouseDown={handleOverlayMouseDown}
      style={{ zIndex: 3000 }}
    >
      <div
        className={styles.locationModal}
        onMouseDown={(event) =>
          event.stopPropagation()
        }
        style={{
          maxWidth: wide ? 760 : 560,
          width: 'min(94vw, 100%)',
        }}
      >
        <div className={styles.modalHeader}>
          <div>
            <h2>{title}</h2>

            {subtitle && (
              <p>{subtitle}</p>
            )}
          </div>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
};

const MetricCard = ({
  label,
  value,
  warning = false,
}) => (
  <div
    className={styles.card}
    style={{
      padding: 13,
      minHeight: 82,
    }}
  >
    <span
      style={{
        display: 'block',
        color: '#64748b',
        fontSize: 10,
        fontWeight: 950,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {label}
    </span>

    <strong
      style={{
        display: 'block',
        marginTop: 7,
        fontSize: 22,
        color:
          warning && value > 0
            ? '#d97706'
            : '#0f172a',
      }}
    >
      {value}
    </strong>
  </div>
);

const StatusPill = ({ active }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 999,
      padding: '4px 8px',
      fontSize: 10,
      fontWeight: 950,
      background: active
        ? '#dcfce7'
        : '#f1f5f9',
      color: active
        ? '#166534'
        : '#64748b',
      border: active
        ? '1px solid #bbf7d0'
        : '1px solid #e2e8f0',
    }}
  >
    {active ? 'Active' : 'Inactive'}
  </span>
);



export default MarketingSettings;
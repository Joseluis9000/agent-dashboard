// src/pages/admin/marketing/services/eddmRouteService.js

import { supabase } from '../../../../supabaseClient';

export const EDDM_ROUTE_SOURCE = Object.freeze({
  MANUAL: 'manual',
  USPS_ZIP: 'usps_zip',
  USPS_MAP_POINT: 'usps_map_point',
  USPS_POLYGON: 'usps_polygon',
});

export const createEmptyMailerRouteForm = () => ({
  zipCode: '',
  routeId: '',
  zipCrid: '',
  residentialCount: '',
  businessCount: '',
  totalCount: '',
  estimatedPostage: '',
  estimatedPrintCost: '',
  estimatedTotalCost: '',
  facilityName: '',
  dropShipKey: '',
  lessThan200Indicator: '',
  notes: '',
});

export const dbToMailerRoute = (row = {}) => ({
  id: row.id,
  activityId: row.activity_id || null,
  campaignId: row.campaign_id || null,
  office: row.office || '',
  zipCode: row.zip_code || '',
  routeId: row.route_id || '',
  zipCrid: row.zip_crid || '',
  residentialCount: Number(row.residential_count || 0),
  businessCount: Number(row.business_count || 0),
  totalCount: Number(row.total_count || 0),
  estimatedPostage: Number(row.estimated_postage || 0),
  estimatedPrintCost: Number(row.estimated_print_cost || 0),
  estimatedTotalCost: Number(row.estimated_total_cost || 0),
  facilityName: row.facility_name || '',
  dropShipKey: row.drop_ship_key || '',
  lessThan200Indicator: row.less_than_200_indicator || '',
  selected: !!row.selected,
  source: row.source || EDDM_ROUTE_SOURCE.MANUAL,
  geometryJson: row.geometry_json || null,
  notes: row.notes || '',
  createdBy: row.created_by || null,
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const cleanNumber = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

const routeToDb = ({
  activityId,
  campaignId,
  office,
  route,
}) => {
  const residentialCount = cleanNumber(route.residentialCount);
  const businessCount = cleanNumber(route.businessCount);
  const totalCount = cleanNumber(route.totalCount) || residentialCount + businessCount;
  const estimatedPostage = cleanNumber(route.estimatedPostage);
  const estimatedPrintCost = cleanNumber(route.estimatedPrintCost);
  const estimatedTotalCost =
    cleanNumber(route.estimatedTotalCost) || estimatedPostage + estimatedPrintCost;

  return {
    activity_id: activityId || null,
    campaign_id: campaignId || null,
    office: office || null,
    zip_code: String(route.zipCode || '').trim(),
    route_id: String(route.routeId || '').trim(),
    zip_crid: route.zipCrid?.trim() || `${String(route.zipCode || '').trim()}_${String(route.routeId || '').trim()}`,
    residential_count: residentialCount,
    business_count: businessCount,
    total_count: totalCount,
    estimated_postage: estimatedPostage,
    estimated_print_cost: estimatedPrintCost,
    estimated_total_cost: estimatedTotalCost,
    facility_name: route.facilityName?.trim() || null,
    drop_ship_key: route.dropShipKey?.trim() || null,
    less_than_200_indicator: route.lessThan200Indicator?.trim() || null,
    selected: route.selected ?? true,
    source: route.source || EDDM_ROUTE_SOURCE.MANUAL,
    geometry_json: route.geometryJson || null,
    notes: route.notes?.trim() || null,
    created_by: route.createdBy || null,
  };
};

export const getMailerRoutesByActivity = async (activityId) => {
  if (!activityId) return [];

  const { data, error } = await supabase
    .from('marketing_mailer_routes')
    .select('*')
    .eq('activity_id', activityId)
    .order('zip_code', { ascending: true })
    .order('route_id', { ascending: true });

  if (error) throw error;

  return (data || []).map(dbToMailerRoute);
};

export const addMailerRoute = async ({
  activityId,
  campaignId,
  office,
  route,
}) => {
  if (!activityId) throw new Error('Save the mailer activity before adding routes.');
  if (!route?.zipCode?.trim()) throw new Error('ZIP code is required.');
  if (!route?.routeId?.trim()) throw new Error('Route ID is required.');

  const { data, error } = await supabase
    .from('marketing_mailer_routes')
    .insert(routeToDb({ activityId, campaignId, office, route }))
    .select()
    .single();

  if (error) throw error;

  return dbToMailerRoute(data);
};

export const updateMailerRoute = async (routeId, route = {}) => {
  if (!routeId) throw new Error('Missing route ID.');

  const residentialCount = cleanNumber(route.residentialCount);
  const businessCount = cleanNumber(route.businessCount);
  const totalCount = cleanNumber(route.totalCount) || residentialCount + businessCount;
  const estimatedPostage = cleanNumber(route.estimatedPostage);
  const estimatedPrintCost = cleanNumber(route.estimatedPrintCost);
  const estimatedTotalCost =
    cleanNumber(route.estimatedTotalCost) || estimatedPostage + estimatedPrintCost;

  const payload = {
    zip_code: String(route.zipCode || '').trim(),
    route_id: String(route.routeId || '').trim(),
    zip_crid: route.zipCrid?.trim() || `${String(route.zipCode || '').trim()}_${String(route.routeId || '').trim()}`,
    residential_count: residentialCount,
    business_count: businessCount,
    total_count: totalCount,
    estimated_postage: estimatedPostage,
    estimated_print_cost: estimatedPrintCost,
    estimated_total_cost: estimatedTotalCost,
    facility_name: route.facilityName?.trim() || null,
    drop_ship_key: route.dropShipKey?.trim() || null,
    less_than_200_indicator: route.lessThan200Indicator?.trim() || null,
    notes: route.notes?.trim() || null,
  };

  const { data, error } = await supabase
    .from('marketing_mailer_routes')
    .update(payload)
    .eq('id', routeId)
    .select()
    .single();

  if (error) throw error;

  return dbToMailerRoute(data);
};

export const deleteMailerRoute = async (routeId) => {
  if (!routeId) return false;

  const { error } = await supabase
    .from('marketing_mailer_routes')
    .delete()
    .eq('id', routeId);

  if (error) throw error;

  return true;
};

export const getMailerRouteSummary = (routes = []) => {
  return (routes || []).reduce(
    (acc, route) => {
      acc.routeCount += 1;
      acc.residentialCount += cleanNumber(route.residentialCount);
      acc.businessCount += cleanNumber(route.businessCount);
      acc.totalCount += cleanNumber(route.totalCount);
      acc.estimatedPostage += cleanNumber(route.estimatedPostage);
      acc.estimatedPrintCost += cleanNumber(route.estimatedPrintCost);
      acc.estimatedTotalCost += cleanNumber(route.estimatedTotalCost);
      return acc;
    },
    {
      routeCount: 0,
      residentialCount: 0,
      businessCount: 0,
      totalCount: 0,
      estimatedPostage: 0,
      estimatedPrintCost: 0,
      estimatedTotalCost: 0,
    }
  );
};

// Placeholder for USPS live integration.
// Once USPS enables EDDM API access, these functions can call your backend endpoint
// which securely attaches OAuth tokens and talks to USPS.
export const searchMockEddmRoutesByZip = async ({ zipCode }) => {
  const zip = String(zipCode || '').trim();

  if (!/^\d{5}$/.test(zip)) {
    throw new Error('Enter a valid 5-digit ZIP code.');
  }

  return [
    {
      zipCode: zip,
      routeId: 'C001',
      zipCrid: `${zip}_C001`,
      residentialCount: 612,
      businessCount: 38,
      totalCount: 650,
      estimatedPostage: 130.00,
      estimatedPrintCost: 195.00,
      estimatedTotalCost: 325.00,
      facilityName: 'USPS Facility',
      dropShipKey: '',
      lessThan200Indicator: 'N',
      source: EDDM_ROUTE_SOURCE.MANUAL,
      notes: 'Mock route. Replace with USPS API result after approval.',
    },
    {
      zipCode: zip,
      routeId: 'C002',
      zipCrid: `${zip}_C002`,
      residentialCount: 734,
      businessCount: 21,
      totalCount: 755,
      estimatedPostage: 151.00,
      estimatedPrintCost: 226.50,
      estimatedTotalCost: 377.50,
      facilityName: 'USPS Facility',
      dropShipKey: '',
      lessThan200Indicator: 'N',
      source: EDDM_ROUTE_SOURCE.MANUAL,
      notes: 'Mock route. Replace with USPS API result after approval.',
    },
  ];
};

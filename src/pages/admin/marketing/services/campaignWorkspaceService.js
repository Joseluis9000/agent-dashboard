// src/pages/admin/marketing/services/campaignWorkspaceService.js

import { supabase } from '../../../../supabaseClient';
import { dbToMarketingCampaign } from './campaignService';
import { dbToMarketingActivity } from './activityService';

const toNumber = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

const normalizeLocation = (row = {}) => ({
  id: row.id,
  type: row.type || 'billboard',
  name: row.name || '',
  office: row.office || '',
  city: row.city || '',
  region: row.region || '',
  status: row.status || '',
  campaignId: row.campaign_id || null,
  campaign: row.campaign || '',
  monthlyCost: toNumber(row.monthly_cost),
  eventCost: toNumber(row.event_cost),
  estimatedImpressions: toNumber(row.estimated_impressions || row.daily_impressions),
  createdAt: row.created_at || '',
});

const normalizePhoto = (row = {}, source = 'location') => ({
  id: row.id,
  source,
  campaignId: row.campaign_id || null,
  photoUrl: row.photo_url || '',
  photoType: row.photo_type || '',
  title: row.title || '',
  description: row.description || '',
  createdAt: row.created_at || '',
});

const normalizeMailerRoute = (row = {}) => ({
  id: row.id,
  activityId: row.activity_id || null,
  campaignId: row.campaign_id || null,
  office: row.office || '',
  zipCode: row.zip_code || '',
  routeType: row.route_type || '',
  routeNumber: row.route_number || '',
  routeId: row.route_id || '',
  zipCrid: row.zip_crid || '',
  mailPieces: toNumber(row.mail_pieces ?? row.total_count),
  averageHouseholdIncome: toNumber(row.average_household_income),
  routeNotes: row.route_notes || row.notes || '',
  residentialCount: toNumber(row.residential_count),
  businessCount: toNumber(row.business_count),
  totalCount: toNumber(row.total_count ?? row.mail_pieces),
  estimatedPostage: toNumber(row.estimated_postage),
  estimatedPrintCost: toNumber(row.estimated_print_cost),
  estimatedTotalCost: toNumber(row.estimated_total_cost),
  facilityName: row.facility_name || '',
  notes: row.notes || '',
  createdAt: row.created_at || '',
});

const normalizeInventoryPurchase = (row = {}) => ({
  batchId: row.batch_id,
  campaignId: row.campaign_id || null,
  itemId: row.item_id,
  itemName: row.item_name || '',
  sku: row.sku || '',
  purchaseDate: row.purchase_date || '',
  quantityPurchased: toNumber(row.quantity_purchased),
  purchaseCost: toNumber(row.purchase_cost),
  shippingCost: toNumber(row.shipping_cost),
  otherCost: toNumber(row.other_cost),
  totalPurchaseCost: toNumber(row.total_purchase_cost),
  unitPurchaseCost: toNumber(row.unit_purchase_cost),
  destinationName: row.destination_name || '',
  destinationType: row.destination_type || '',
  vendorName: row.vendor_name || '',
  invoiceNumber: row.invoice_number || '',
  purchaseOrder: row.purchase_order || '',
});

const normalizeInventoryUsage = (row = {}) => ({
  movementId: row.movement_id,
  campaignId: row.campaign_id || null,
  activityId: row.activity_id || null,
  movementDate: row.movement_date || '',
  itemId: row.item_id,
  itemName: row.item_name || '',
  sku: row.sku || '',
  fromLocationName: row.from_location_name || '',
  fromLocationType: row.from_location_type || '',
  quantityUsed: toNumber(row.quantity_used),
  weightedUnitCost: toNumber(row.weighted_unit_cost),
  allocatedInventoryCost: toNumber(row.allocated_inventory_cost),
  distributionCost: toNumber(row.distribution_cost),
  inventoryUsageTotalCost: toNumber(row.inventory_usage_total_cost),
  reason: row.reason || '',
  notes: row.notes || '',
});

export const getCampaignWorkspaceData = async (campaignId) => {
  if (!campaignId) throw new Error('Missing campaign ID.');

  const [
    campaignResult,
    locationsResult,
    activitiesResult,
    locationPhotosResult,
    activityPhotosResult,
    mailerRoutesResult,
    inventoryPurchasesResult,
    inventoryUsageResult,
  ] = await Promise.all([
    supabase.from('marketing_campaigns').select('*').eq('id', campaignId).single(),
    supabase.from('marketing_locations').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }),
    supabase.from('marketing_activities').select('*').eq('campaign_id', campaignId).order('activity_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('marketing_location_photos').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(250),
    supabase.from('marketing_activity_photos').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(250),
    supabase.from('marketing_mailer_routes').select('*').eq('campaign_id', campaignId).order('zip_code', { ascending: true }).order('route_id', { ascending: true }),
    supabase.from('marketing_campaign_inventory_purchases').select('*').eq('campaign_id', campaignId).order('purchase_date', { ascending: false }),
    supabase.from('marketing_campaign_inventory_usage').select('*').eq('campaign_id', campaignId).order('movement_date', { ascending: false }),
  ]);

  const error = [
    campaignResult.error,
    locationsResult.error,
    activitiesResult.error,
    locationPhotosResult.error,
    activityPhotosResult.error,
    mailerRoutesResult.error,
    inventoryPurchasesResult.error,
    inventoryUsageResult.error,
  ].find(Boolean);

  if (error) throw error;

  const campaign = dbToMarketingCampaign(campaignResult.data);
  const locations = (locationsResult.data || []).map(normalizeLocation);
  const activities = (activitiesResult.data || []).map(dbToMarketingActivity);
  const locationPhotos = (locationPhotosResult.data || []).map((row) => normalizePhoto(row, 'location'));
  const activityPhotos = (activityPhotosResult.data || []).map((row) => normalizePhoto(row, 'activity'));
  const photos = [...locationPhotos, ...activityPhotos].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const mailerRoutes = (mailerRoutesResult.data || []).map(normalizeMailerRoute);
  const inventoryPurchases = (inventoryPurchasesResult.data || []).map(normalizeInventoryPurchase);
  const inventoryUsage = (inventoryUsageResult.data || []).map(normalizeInventoryUsage);

  const activitySpend = activities.reduce((sum, activity) => sum + toNumber(activity.cost), 0);
  const locationSpend = locations.reduce((sum, location) => sum + toNumber(location.monthlyCost || location.eventCost), 0);
  const campaignInventoryPurchaseCost = inventoryPurchases.reduce((sum, row) => sum + row.totalPurchaseCost, 0);
  const inventoryQuantityPurchased = inventoryPurchases.reduce((sum, row) => sum + row.quantityPurchased, 0);
  const inventoryQuantityUsed = inventoryUsage.reduce((sum, row) => sum + row.quantityUsed, 0);
  const allocatedInventoryUsedCost = inventoryUsage.reduce((sum, row) => sum + row.allocatedInventoryCost, 0);
  const inventoryDistributionCost = inventoryUsage.reduce((sum, row) => sum + row.distributionCost, 0);
  const mailerPieces = mailerRoutes.reduce((sum, route) => sum + toNumber(route.mailPieces || route.totalCount), 0);
  const mailerCost = mailerRoutes.reduce((sum, route) => sum + toNumber(route.estimatedTotalCost), 0);
  const mailerIncomeWeight = mailerRoutes.reduce(
    (sum, route) =>
      sum +
      toNumber(route.averageHouseholdIncome) *
        toNumber(route.mailPieces || route.totalCount),
    0
  );
  const weightedAverageRouteIncome = mailerPieces
    ? mailerIncomeWeight / mailerPieces
    : 0;
  const estimatedReach = activities.reduce((sum, activity) => sum + toNumber(activity.estimatedReach), 0);
  const budget = toNumber(campaign.budget);

  // Dedicated inventory purchases are actual campaign cash spend.
  // Allocated inventory usage is reported separately so it is not double-counted.
  const knownSpend = activitySpend + locationSpend + campaignInventoryPurchaseCost;
  const budgetRemaining = budget ? budget - knownSpend : 0;
  const budgetUsedPercent = budget ? Math.min(100, Math.round((knownSpend / budget) * 100)) : 0;

  const activitiesByType = activities.reduce((acc, activity) => {
    const key = activity.activityType || 'other';
    if (!acc[key]) acc[key] = { count: 0, cost: 0, quantity: 0, reach: 0 };
    acc[key].count += 1;
    acc[key].cost += toNumber(activity.cost);
    acc[key].quantity += toNumber(activity.quantity);
    acc[key].reach += toNumber(activity.estimatedReach);
    return acc;
  }, {});

  const inventoryByItemMap = new Map();
  inventoryPurchases.forEach((row) => {
    const current = inventoryByItemMap.get(row.itemId) || {
      itemId: row.itemId,
      itemName: row.itemName,
      sku: row.sku,
      purchasedQuantity: 0,
      purchaseCost: 0,
      usedQuantity: 0,
      allocatedUsedCost: 0,
    };
    current.purchasedQuantity += row.quantityPurchased;
    current.purchaseCost += row.totalPurchaseCost;
    inventoryByItemMap.set(row.itemId, current);
  });
  inventoryUsage.forEach((row) => {
    const current = inventoryByItemMap.get(row.itemId) || {
      itemId: row.itemId,
      itemName: row.itemName,
      sku: row.sku,
      purchasedQuantity: 0,
      purchaseCost: 0,
      usedQuantity: 0,
      allocatedUsedCost: 0,
    };
    current.usedQuantity += row.quantityUsed;
    current.allocatedUsedCost += row.allocatedInventoryCost;
    inventoryByItemMap.set(row.itemId, current);
  });
  const inventoryByItem = [...inventoryByItemMap.values()].sort((a, b) => b.purchaseCost - a.purchaseCost || b.usedQuantity - a.usedQuantity);

  const offices = [...new Set([
    ...locations.map((location) => location.office).filter(Boolean),
    ...activities.map((activity) => activity.office).filter(Boolean),
    ...mailerRoutes.map((route) => route.office).filter(Boolean),
  ])].sort();

  return {
    campaign,
    locations,
    activities,
    photos,
    mailerRoutes,
    inventoryPurchases,
    inventoryUsage,
    inventoryByItem,
    activitiesByType,
    offices,
    summary: {
      budget,
      knownSpend,
      budgetRemaining,
      budgetUsedPercent,
      activitySpend,
      locationSpend,
      campaignInventoryPurchaseCost,
      inventoryQuantityPurchased,
      inventoryQuantityUsed,
      allocatedInventoryUsedCost,
      inventoryDistributionCost,
      inventoryPurchaseCount: inventoryPurchases.length,
      inventoryUsageCount: inventoryUsage.length,
      inventoryItemCount: inventoryByItem.length,
      mailerCost,
      activityCount: activities.length,
      locationCount: locations.length,
      photoCount: photos.length,
      mailerRouteCount: mailerRoutes.length,
      mailerPieces,
      weightedAverageRouteIncome,
      estimatedReach,
      officeCount: offices.length,
    },
  };
};
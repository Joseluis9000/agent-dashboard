// src/pages/admin/marketing/services/analyticsService.js

import { supabase } from '../../../../supabaseClient';

const toNumber = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

const normalizeText = (value) => String(value || '').trim();

const normalizeActivity = (row = {}) => ({
  id: row.id,
  campaignId: row.campaign_id || null,
  activityType: row.activity_type || 'other',
  office: row.office || '',
  region: row.region || '',
  activityDate: row.activity_date || row.created_at || '',
  quantity: toNumber(row.quantity),
  estimatedReach: toNumber(row.estimated_reach),
  cost: toNumber(row.cost),
  distributionCost: toNumber(row.distribution_cost),
  otherCost: toNumber(row.other_cost),
  status: row.status || '',
});

const normalizeLocation = (row = {}) => ({
  id: row.id,
  campaignId: row.campaign_id || null,
  type: row.type || 'location',
  office: row.office || '',
  region: row.region || '',
  monthlyCost: toNumber(row.monthly_cost),
  eventCost: toNumber(row.event_cost),
  estimatedImpressions: toNumber(
    row.estimated_impressions || row.daily_impressions
  ),
});

const normalizeCampaign = (row = {}) => ({
  id: row.id,
  name: row.name || 'Untitled Campaign',
  status: row.status || '',
  budget: toNumber(row.budget),
  startDate: row.start_date || '',
  endDate: row.end_date || '',
});

const normalizePurchase = (row = {}) => ({
  batchId: row.batch_id,
  campaignId: row.campaign_id || null,
  itemId: row.item_id || null,
  itemName: row.item_name || '',
  sku: row.sku || '',
  purchaseDate: row.purchase_date || '',
  quantityPurchased: toNumber(row.quantity_purchased),
  purchaseCost: toNumber(row.purchase_cost),
  shippingCost: toNumber(row.shipping_cost),
  otherCost: toNumber(row.other_cost),
  totalPurchaseCost: toNumber(row.total_purchase_cost),
  destinationName: row.destination_name || '',
});

const normalizeUsage = (row = {}) => ({
  movementId: row.movement_id,
  campaignId: row.campaign_id || null,
  activityId: row.activity_id || null,
  itemId: row.item_id || null,
  itemName: row.item_name || '',
  sku: row.sku || '',
  movementDate: row.movement_date || '',
  quantityUsed: toNumber(row.quantity_used),
  weightedUnitCost: toNumber(row.weighted_unit_cost),
  allocatedInventoryCost: toNumber(row.allocated_inventory_cost),
  distributionCost: toNumber(row.distribution_cost),
  fromLocationName: row.from_location_name || '',
});

const normalizeRoute = (row = {}) => ({
  id: row.id,
  campaignId: row.campaign_id || null,
  activityId: row.activity_id || null,
  office: row.office || '',
  zipCode: row.zip_code || '',
  routeType: row.route_type || '',
  routeNumber: row.route_number || '',
  routeId: row.route_id || '',
  mailPieces: toNumber(row.mail_pieces ?? row.total_count),
  averageHouseholdIncome: toNumber(row.average_household_income),
});

const normalizeOffice = (row = {}) => ({
  id: row.id,
  officeCode: row.office_code || '',
  officeName: row.office_name || '',
  regionId: row.region_id || null,
  regionName: row.region_name || '',
});

const normalizeRegion = (row = {}) => ({
  id: row.id,
  name: row.name || '',
});

const inDateRange = (value, startDate, endDate) => {
  if (!value) return true;
  const key = String(value).slice(0, 10);
  if (startDate && key < startDate) return false;
  if (endDate && key > endDate) return false;
  return true;
};

const matchesFilter = (value, filter) => {
  if (!filter || filter === 'all') return true;
  return normalizeText(value).toLowerCase() === normalizeText(filter).toLowerCase();
};

const addToGroup = (map, key, updater) => {
  const safeKey = key || 'Unassigned';
  const current = map.get(safeKey) || {
    key: safeKey,
    spend: 0,
    activitySpend: 0,
    locationSpend: 0,
    inventoryPurchaseSpend: 0,
    inventoryUsedValue: 0,
    quantity: 0,
    reach: 0,
    activities: 0,
    routes: 0,
    mailPieces: 0,
  };

  updater(current);
  map.set(safeKey, current);
};

export const getMarketingAnalyticsData = async () => {
  const [
    campaignsResult,
    activitiesResult,
    locationsResult,
    purchasesResult,
    usageResult,
    routesResult,
    officesResult,
    regionsResult,
  ] = await Promise.all([
    supabase
      .from('marketing_campaigns')
      .select('*')
      .order('start_date', { ascending: false, nullsFirst: false }),

    supabase
      .from('marketing_activities')
      .select('*')
      .order('activity_date', { ascending: false, nullsFirst: false }),

    supabase
      .from('marketing_locations')
      .select('*')
      .order('created_at', { ascending: false }),

    supabase
      .from('marketing_campaign_inventory_purchases')
      .select('*')
      .order('purchase_date', { ascending: false }),

    supabase
      .from('marketing_campaign_inventory_usage')
      .select('*')
      .order('movement_date', { ascending: false }),

    supabase
      .from('marketing_campaign_eddm_routes')
      .select('*')
      .order('created_at', { ascending: false }),

    supabase
      .from('marketing_offices_with_regions')
      .select('*')
      .eq('is_active', true)
      .order('office_code', { ascending: true }),

    supabase
      .from('marketing_regions')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ]);

  const firstError = [
    campaignsResult.error,
    activitiesResult.error,
    locationsResult.error,
    purchasesResult.error,
    usageResult.error,
    routesResult.error,
    officesResult.error,
    regionsResult.error,
  ].find(Boolean);

  if (firstError) throw firstError;

  return {
    campaigns: (campaignsResult.data || []).map(normalizeCampaign),
    activities: (activitiesResult.data || []).map(normalizeActivity),
    locations: (locationsResult.data || []).map(normalizeLocation),
    inventoryPurchases: (purchasesResult.data || []).map(normalizePurchase),
    inventoryUsage: (usageResult.data || []).map(normalizeUsage),
    mailerRoutes: (routesResult.data || []).map(normalizeRoute),
    offices: (officesResult.data || []).map(normalizeOffice),
    regions: (regionsResult.data || []).map(normalizeRegion),
  };
};

export const buildMarketingAnalytics = (
  data,
  {
    startDate = '',
    endDate = '',
    campaignId = 'all',
    region = 'all',
    office = 'all',
    activityType = 'all',
  } = {}
) => {
  const campaigns = data?.campaigns || [];
  

  const officeMap = Object.fromEntries(
    (data?.offices || []).map((row) => [row.officeCode, row])
  );

  const selectedCampaignIds = new Set(
    campaigns
      .filter((campaign) => matchesFilter(campaign.id, campaignId))
      .map((campaign) => campaign.id)
  );

  const campaignAllowed = (id) =>
    campaignId === 'all' || selectedCampaignIds.has(id);

  const filteredActivities = (data?.activities || []).filter((row) => {
    const officeSettings = officeMap[row.office];
    const resolvedRegion = row.region || officeSettings?.regionName || '';

    return (
      inDateRange(row.activityDate, startDate, endDate) &&
      campaignAllowed(row.campaignId) &&
      matchesFilter(resolvedRegion, region) &&
      matchesFilter(row.office, office) &&
      matchesFilter(row.activityType, activityType)
    );
  });

  

  const filteredLocations = (data?.locations || []).filter((row) => {
    const officeSettings = officeMap[row.office];
    const resolvedRegion = row.region || officeSettings?.regionName || '';

    return (
      campaignAllowed(row.campaignId) &&
      matchesFilter(resolvedRegion, region) &&
      matchesFilter(row.office, office)
    );
  });

  const filteredPurchases = (data?.inventoryPurchases || []).filter(
    (row) =>
      inDateRange(row.purchaseDate, startDate, endDate) &&
      campaignAllowed(row.campaignId)
  );

  const filteredUsage = (data?.inventoryUsage || []).filter(
    (row) =>
      inDateRange(row.movementDate, startDate, endDate) &&
      campaignAllowed(row.campaignId)
  );

  const filteredRoutes = (data?.mailerRoutes || []).filter((row) => {
    const officeSettings = officeMap[row.office];
    const resolvedRegion = officeSettings?.regionName || '';

    return (
      campaignAllowed(row.campaignId) &&
      matchesFilter(resolvedRegion, region) &&
      matchesFilter(row.office, office)
    );
  });

  const activitySpend = filteredActivities.reduce(
    (sum, row) => sum + row.cost,
    0
  );
  const locationSpend = filteredLocations.reduce(
    (sum, row) => sum + row.monthlyCost + row.eventCost,
    0
  );
  const inventoryPurchaseSpend = filteredPurchases.reduce(
    (sum, row) => sum + row.totalPurchaseCost,
    0
  );
  const inventoryUsedValue = filteredUsage.reduce(
    (sum, row) => sum + row.allocatedInventoryCost,
    0
  );

  const knownSpend =
    activitySpend + locationSpend + inventoryPurchaseSpend;

  const totalBudget = campaigns
    .filter((campaign) => campaignAllowed(campaign.id))
    .reduce((sum, campaign) => sum + campaign.budget, 0);

  const totalActivityQuantity = filteredActivities.reduce(
    (sum, row) => sum + row.quantity,
    0
  );

  const totalReach = filteredActivities.reduce(
    (sum, row) => sum + row.estimatedReach,
    0
  );

  const totalImpressions = filteredLocations.reduce(
    (sum, row) => sum + row.estimatedImpressions,
    0
  );

  const mailPieces = filteredRoutes.reduce(
    (sum, row) => sum + row.mailPieces,
    0
  );

  const incomeWeight = filteredRoutes.reduce(
    (sum, row) =>
      sum + row.averageHouseholdIncome * row.mailPieces,
    0
  );

  const weightedAverageIncome =
    mailPieces > 0 ? incomeWeight / mailPieces : 0;

  const campaignGroups = new Map();
  campaigns
    .filter((campaign) => campaignAllowed(campaign.id))
    .forEach((campaign) => {
      campaignGroups.set(campaign.id, {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        budget: campaign.budget,
        spend: 0,
        activitySpend: 0,
        locationSpend: 0,
        inventoryPurchaseSpend: 0,
        inventoryUsedValue: 0,
        activityCount: 0,
        quantity: 0,
        reach: 0,
        routeCount: 0,
        mailPieces: 0,
      });
    });

  filteredActivities.forEach((row) => {
    if (!row.campaignId || !campaignGroups.has(row.campaignId)) return;
    const item = campaignGroups.get(row.campaignId);
    item.activitySpend += row.cost;
    item.activityCount += 1;
    item.quantity += row.quantity;
    item.reach += row.estimatedReach;
  });

  filteredLocations.forEach((row) => {
    if (!row.campaignId || !campaignGroups.has(row.campaignId)) return;
    const item = campaignGroups.get(row.campaignId);
    item.locationSpend += row.monthlyCost + row.eventCost;
  });

  filteredPurchases.forEach((row) => {
    if (!row.campaignId || !campaignGroups.has(row.campaignId)) return;
    campaignGroups.get(row.campaignId).inventoryPurchaseSpend +=
      row.totalPurchaseCost;
  });

  filteredUsage.forEach((row) => {
    if (!row.campaignId || !campaignGroups.has(row.campaignId)) return;
    campaignGroups.get(row.campaignId).inventoryUsedValue +=
      row.allocatedInventoryCost;
  });

  filteredRoutes.forEach((row) => {
    if (!row.campaignId || !campaignGroups.has(row.campaignId)) return;
    const item = campaignGroups.get(row.campaignId);
    item.routeCount += 1;
    item.mailPieces += row.mailPieces;
  });

  const campaignPerformance = [...campaignGroups.values()]
    .map((row) => ({
      ...row,
      spend:
        row.activitySpend +
        row.locationSpend +
        row.inventoryPurchaseSpend,
      budgetRemaining:
        row.budget -
        (row.activitySpend +
          row.locationSpend +
          row.inventoryPurchaseSpend),
      budgetUsedPercent:
        row.budget > 0
          ? Math.round(
              ((row.activitySpend +
                row.locationSpend +
                row.inventoryPurchaseSpend) /
                row.budget) *
                100
            )
          : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  const channelMap = new Map();
  filteredActivities.forEach((row) => {
    addToGroup(channelMap, row.activityType, (group) => {
      group.activitySpend += row.cost;
      group.spend += row.cost;
      group.activities += 1;
      group.quantity += row.quantity;
      group.reach += row.estimatedReach;
    });
  });

  filteredLocations.forEach((row) => {
    addToGroup(channelMap, row.type, (group) => {
      const spend = row.monthlyCost + row.eventCost;
      group.locationSpend += spend;
      group.spend += spend;
      group.reach += row.estimatedImpressions;
    });
  });

  const channelPerformance = [...channelMap.values()].sort(
    (a, b) => b.spend - a.spend
  );

  const officeGroups = new Map();
  filteredActivities.forEach((row) => {
    addToGroup(officeGroups, row.office || 'Unassigned', (group) => {
      group.activitySpend += row.cost;
      group.spend += row.cost;
      group.activities += 1;
      group.quantity += row.quantity;
      group.reach += row.estimatedReach;
    });
  });
  filteredRoutes.forEach((row) => {
    addToGroup(officeGroups, row.office || 'Unassigned', (group) => {
      group.routes += 1;
      group.mailPieces += row.mailPieces;
    });
  });

  const officePerformance = [...officeGroups.values()]
    .map((row) => ({
      ...row,
      region: officeMap[row.key]?.regionName || 'Unassigned',
    }))
    .sort((a, b) => b.spend - a.spend);

  const regionGroups = new Map();
  officePerformance.forEach((row) => {
    addToGroup(regionGroups, row.region, (group) => {
      group.spend += row.spend;
      group.activitySpend += row.activitySpend;
      group.activities += row.activities;
      group.quantity += row.quantity;
      group.reach += row.reach;
      group.routes += row.routes;
      group.mailPieces += row.mailPieces;
    });
  });

  const regionPerformance = [...regionGroups.values()].sort(
    (a, b) => b.spend - a.spend
  );

  const routeTypeMap = new Map();
  filteredRoutes.forEach((row) => {
    const key = row.routeType || 'Unknown';
    if (!routeTypeMap.has(key)) {
      routeTypeMap.set(key, {
        routeType: key,
        routeCount: 0,
        mailPieces: 0,
        incomeWeight: 0,
      });
    }
    const item = routeTypeMap.get(key);
    item.routeCount += 1;
    item.mailPieces += row.mailPieces;
    item.incomeWeight +=
      row.averageHouseholdIncome * row.mailPieces;
  });

  const routePerformance = [...routeTypeMap.values()]
    .map((row) => ({
      ...row,
      averageIncome:
        row.mailPieces > 0
          ? row.incomeWeight / row.mailPieces
          : 0,
    }))
    .sort((a, b) => b.mailPieces - a.mailPieces);

  const inventoryItemMap = new Map();
  filteredPurchases.forEach((row) => {
    const key = row.itemId || row.itemName;
    const current = inventoryItemMap.get(key) || {
      itemId: row.itemId,
      itemName: row.itemName,
      sku: row.sku,
      purchasedQuantity: 0,
      purchaseCost: 0,
      usedQuantity: 0,
      usedValue: 0,
    };
    current.purchasedQuantity += row.quantityPurchased;
    current.purchaseCost += row.totalPurchaseCost;
    inventoryItemMap.set(key, current);
  });

  filteredUsage.forEach((row) => {
    const key = row.itemId || row.itemName;
    const current = inventoryItemMap.get(key) || {
      itemId: row.itemId,
      itemName: row.itemName,
      sku: row.sku,
      purchasedQuantity: 0,
      purchaseCost: 0,
      usedQuantity: 0,
      usedValue: 0,
    };
    current.usedQuantity += row.quantityUsed;
    current.usedValue += row.allocatedInventoryCost;
    inventoryItemMap.set(key, current);
  });

  const inventoryPerformance = [...inventoryItemMap.values()]
    .map((row) => ({
      ...row,
      remainingQuantity: row.purchasedQuantity - row.usedQuantity,
      utilizationPercent:
        row.purchasedQuantity > 0
          ? Math.round(
              (row.usedQuantity / row.purchasedQuantity) * 100
            )
          : 0,
    }))
    .sort((a, b) => b.purchaseCost - a.purchaseCost);

  return {
    summary: {
      totalBudget,
      knownSpend,
      budgetRemaining: totalBudget - knownSpend,
      budgetUsedPercent:
        totalBudget > 0
          ? Math.round((knownSpend / totalBudget) * 100)
          : 0,
      activitySpend,
      locationSpend,
      inventoryPurchaseSpend,
      inventoryUsedValue,
      activityCount: filteredActivities.length,
      totalActivityQuantity,
      totalReach,
      totalImpressions,
      routeCount: filteredRoutes.length,
      mailPieces,
      weightedAverageIncome,
      campaignCount: campaigns.filter((row) => campaignAllowed(row.id))
        .length,
      activeCampaignCount: campaigns.filter(
        (row) =>
          campaignAllowed(row.id) &&
          ['active', 'in_progress'].includes(
            String(row.status || '').toLowerCase()
          )
      ).length,
    },
    campaignPerformance,
    channelPerformance,
    officePerformance,
    regionPerformance,
    routePerformance,
    inventoryPerformance,
    filteredActivities,
    filteredLocations,
    filteredPurchases,
    filteredUsage,
    filteredRoutes,
  };
};
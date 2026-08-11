// src/pages/admin/marketing/services/activityService.js

import { supabase } from '../../../../supabaseClient';

export const ACTIVITY_TYPES = Object.freeze({
  MAILER: 'mailer',
  CAR_TO_CAR_FLYERS: 'car_to_car_flyers',
  BUSINESS_TO_BUSINESS_FLYERS: 'business_to_business_flyers',
  BUSINESS_CARDS: 'business_cards',
  GORILLA_STREET_FLYERS: 'gorilla_street_flyers',
  DOOR_HANGERS: 'door_hangers',
  EVENT: 'event',
  SPONSORSHIP_DROP_OFF: 'sponsorship_drop_off',
  OTHER: 'other',
});

export const ACTIVITY_STATUS = Object.freeze({
  PLANNED: 'planned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const ACTIVITY_PRIORITIES = Object.freeze({
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
});

export const dbToMarketingActivity = (row = {}) => ({
  id: row.id,
  office: row.office || '',
  region: row.region || '',
  supervisorName: row.supervisor_name || '',
  supervisorUserId: row.supervisor_user_id || null,
  activityType: row.activity_type || ACTIVITY_TYPES.OTHER,
  campaignName: row.campaign_name || '',
  campaignId: row.campaign_id || null,
  campaignColor: row.campaign_color || '',
  activityDate: row.activity_date || '',
  completedDate: row.completed_date || '',
  status: row.status || ACTIVITY_STATUS.COMPLETED,
  priority: row.priority || ACTIVITY_PRIORITIES.NORMAL,
  quantity: Number(row.quantity || 0),
  purchasedQuantity: Number(row.purchased_quantity || 0),
  inventoryItemId: row.inventory_item_id || '',
  inventoryLocationId: row.inventory_location_id || '',
  distributedQuantity: Number(row.distributed_quantity ?? row.quantity ?? 0),
  productionCost: Number(row.production_cost || 0),
  productionNotes: row.production_notes || '',
  distributionCost: Number(row.distribution_cost || 0),
  distributionNotes: row.distribution_notes || '',
  otherCost: Number(row.other_cost || 0),
  otherCostNotes: row.other_cost_notes || '',
  cost: Number(row.cost || 0),
  estimatedReach: Number(row.estimated_reach || 0),
  city: row.city || '',
  zipCodes: Array.isArray(row.zip_codes) ? row.zip_codes : [],
  eddmRoutes: [],
  areaDescription: row.area_description || '',
  latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
  longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
  weather: row.weather || '',
  completedBy: row.completed_by || '',
  tags: Array.isArray(row.tags) ? row.tags : [],
  notes: row.notes || '',
  createdBy: row.created_by || null,
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const toTextArray = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
};

const cleanNumberOrZero = (value) => {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const cleanNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

export const marketingActivityToDb = (activity = {}) => {
  const productionCost = cleanNumberOrZero(activity.productionCost);
  const distributionCost = cleanNumberOrZero(activity.distributionCost);
  const otherCost = cleanNumberOrZero(activity.otherCost);
  const inventoryBacked = Boolean(activity.inventoryItemId);
  const componentTotal = (inventoryBacked ? 0 : productionCost) + distributionCost + otherCost;
  const totalCost = componentTotal > 0 ? componentTotal : cleanNumberOrZero(activity.cost);

  return ({
  office: activity.office?.trim() || '',
  region: activity.region?.trim() || null,
  supervisor_name: activity.supervisorName?.trim() || null,
  supervisor_user_id: activity.supervisorUserId || null,
  activity_type: activity.activityType || ACTIVITY_TYPES.OTHER,
  campaign_name: activity.campaignName?.trim() || null,
  campaign_id: activity.campaignId || null,
  campaign_color: activity.campaignColor?.trim() || null,
  activity_date: activity.activityDate || new Date().toISOString().split('T')[0],
  completed_date: activity.completedDate || null,
  status: activity.status || ACTIVITY_STATUS.COMPLETED,
  priority: activity.priority || ACTIVITY_PRIORITIES.NORMAL,
  quantity: cleanNumberOrZero(
    activity.activityType === ACTIVITY_TYPES.MAILER
      ? activity.distributedQuantity
      : activity.quantity
  ),
  purchased_quantity: inventoryBacked ? 0 : (activity.activityType === ACTIVITY_TYPES.MAILER ? cleanNumberOrZero(activity.purchasedQuantity) : 0),
  inventory_item_id: activity.inventoryItemId || null,
  inventory_location_id: activity.inventoryLocationId || null,
  distributed_quantity:
    activity.activityType === ACTIVITY_TYPES.MAILER
      ? cleanNumberOrZero(activity.distributedQuantity)
      : cleanNumberOrZero(activity.quantity),
  production_cost: inventoryBacked ? 0 : productionCost,
  production_notes: activity.productionNotes?.trim() || null,
  distribution_cost: distributionCost,
  distribution_notes: activity.distributionNotes?.trim() || null,
  other_cost: otherCost,
  other_cost_notes: activity.otherCostNotes?.trim() || null,
  cost: totalCost,
  estimated_reach: cleanNumberOrZero(activity.estimatedReach),
  city: activity.city?.trim() || null,
  zip_codes: toTextArray(activity.zipCodes),
  area_description: activity.areaDescription?.trim() || null,
  latitude: cleanNumberOrNull(activity.latitude),
  longitude: cleanNumberOrNull(activity.longitude),
  weather: activity.weather?.trim() || null,
  completed_by: activity.completedBy?.trim() || null,
  tags: toTextArray(activity.tags),
  notes: activity.notes?.trim() || null,
  created_by: activity.createdBy || null,
  });
};

export const createEmptyMarketingActivityForm = () => ({
  office: '',
  region: '',
  supervisorName: '',
  supervisorUserId: '',
  activityType: ACTIVITY_TYPES.MAILER,
  campaignName: '',
  campaignId: '',
  campaignColor: '',
  activityDate: new Date().toISOString().split('T')[0],
  completedDate: '',
  status: ACTIVITY_STATUS.COMPLETED,
  priority: ACTIVITY_PRIORITIES.NORMAL,
  quantity: '',
  purchasedQuantity: '',
  inventoryItemId: '',
  inventoryLocationId: '',
  distributedQuantity: '',
  productionCost: '',
  productionNotes: '',
  distributionCost: '',
  distributionNotes: '',
  otherCost: '',
  otherCostNotes: '',
  cost: '',
  estimatedReach: '',
  city: '',
  zipCodes: '',
  eddmRoutes: [],
  areaDescription: '',
  latitude: '',
  longitude: '',
  weather: '',
  completedBy: '',
  tags: '',
  notes: '',
});

export const getMarketingActivities = async ({
  office = '',
  region = '',
  activityType = '',
  status = '',
  campaignName = '',
  dateFrom = '',
  dateTo = '',
  limit = 250,
} = {}) => {
  let query = supabase
    .from('marketing_activities')
    .select('*')
    .order('activity_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (office) query = query.eq('office', office);
  if (region) query = query.eq('region', region);
  if (activityType) query = query.eq('activity_type', activityType);
  if (status) query = query.eq('status', status);
  if (campaignName) query = query.ilike('campaign_name', `%${campaignName}%`);
  if (dateFrom) query = query.gte('activity_date', dateFrom);
  if (dateTo) query = query.lte('activity_date', dateTo);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(dbToMarketingActivity);
};

export const getMarketingActivityById = async (activityId) => {
  if (!activityId) return null;
  const { data, error } = await supabase
    .from('marketing_activities')
    .select('*')
    .eq('id', activityId)
    .single();
  if (error) throw error;
  return dbToMarketingActivity(data);
};

export const getMarketingActivitiesByOffice = async (office) => {
  if (!office) return [];
  return getMarketingActivities({ office });
};

export const getMarketingActivitiesByCampaign = async (campaignName) => {
  if (!campaignName) return [];
  return getMarketingActivities({ campaignName });
};

const syncActivityInventoryMovement = async (activityId, activity) => {
  const itemId = activity.inventoryItemId || null;
  const locationId = activity.inventoryLocationId || null;
  const quantity = cleanNumberOrZero(
    activity.activityType === ACTIVITY_TYPES.MAILER
      ? activity.distributedQuantity
      : activity.quantity
  );

  const { data: existingRows, error: existingError } = await supabase
    .from('marketing_inventory_movements')
    .select('*')
    .eq('activity_id', activityId)
    .eq('movement_type', 'consumed');
  if (existingError) throw existingError;
  const existing = (existingRows || [])[0] || null;

  if (!itemId || !locationId || quantity <= 0) {
    if (existing?.id) {
      const { error } = await supabase
        .from('marketing_inventory_movements')
        .delete()
        .eq('id', existing.id);
      if (error) throw error;
    }
    return;
  }

  const { data: balanceRows, error: balanceError } = await supabase
    .from('marketing_inventory_quantity_balances')
    .select('quantity_on_hand')
    .eq('item_id', itemId)
    .eq('location_id', locationId)
    .limit(1);
  if (balanceError) throw balanceError;

  let available = Number(balanceRows?.[0]?.quantity_on_hand || 0);
  if (
    existing &&
    existing.item_id === itemId &&
    existing.from_location_id === locationId
  ) {
    available += Number(existing.quantity || 0);
  }

  if (quantity > available) {
    throw new Error(`Only ${available.toLocaleString()} inventory items are available at the selected location.`);
  }

  const payload = {
    activity_id: activityId,
    campaign_id: activity.campaignId || null,
    item_id: itemId,
    movement_type: 'consumed',
    quantity,
    from_location_id: locationId,
    to_location_id: null,
    distribution_cost: cleanNumberOrZero(activity.distributionCost),
    reason: `${activity.activityType || 'marketing'} activity`,
    notes: activity.distributionNotes?.trim() || null,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from('marketing_inventory_movements')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('marketing_inventory_movements')
      .insert(payload);
    if (error) throw error;
  }
};

const normalizeMailerRouteNumber = (routeType, routeNumber) => {
  const type = String(routeType || '').trim().toUpperCase();
  const digits = String(routeNumber || '').replace(/[^0-9]/g, '');
  if (!type || !digits) return '';
  return `${type}${digits.padStart(3, '0')}`;
};

const syncActivityMailerRoutes = async (activityId, activity) => {
  if (!activityId) return;

  const isMailer = activity.activityType === ACTIVITY_TYPES.MAILER;
  const routeRows = Array.isArray(activity.eddmRoutes)
    ? activity.eddmRoutes
    : [];

  if (!isMailer) {
    const { error } = await supabase
      .from('marketing_mailer_routes')
      .delete()
      .eq('activity_id', activityId);

    if (error) throw error;
    return;
  }

  const cleanedRoutes = routeRows
    .map((route) => ({
      id:
        route.id && !String(route.id).startsWith('route-')
          ? route.id
          : null,
      routeType: String(route.routeType || 'C')
        .trim()
        .toUpperCase(),
      routeNumber: String(route.routeNumber || '').trim(),
      zipCode: String(route.zipCode || '').trim(),
      mailPieces: cleanNumberOrZero(route.mailPieces),
      averageHouseholdIncome: cleanNumberOrNull(
        route.averageHouseholdIncome
      ),
      notes: String(route.notes || '').trim(),
    }))
    .filter(
      (route) =>
        route.routeType &&
        route.routeNumber &&
        route.zipCode &&
        route.mailPieces > 0
    );

  cleanedRoutes.forEach((route) => {
    if (!['C', 'R', 'H', 'B', 'G'].includes(route.routeType)) {
      throw new Error(`Invalid USPS route type: ${route.routeType}`);
    }

    if (!/^[0-9]{5}$/.test(route.zipCode)) {
      throw new Error(
        `ZIP Code ${route.zipCode || '(blank)'} must be 5 digits.`
      );
    }

    if (!normalizeMailerRouteNumber(route.routeType, route.routeNumber)) {
      throw new Error('Each EDDM route needs a route number.');
    }
  });

  const { data: existingRows, error: existingError } = await supabase
    .from('marketing_mailer_routes')
    .select('id')
    .eq('activity_id', activityId);

  if (existingError) throw existingError;

  const existingIds = new Set(
    (existingRows || []).map((row) => row.id)
  );
  const incomingIds = new Set(
    cleanedRoutes.map((row) => row.id).filter(Boolean)
  );

  const deleteIds = [...existingIds].filter(
    (id) => !incomingIds.has(id)
  );

  if (deleteIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('marketing_mailer_routes')
      .delete()
      .in('id', deleteIds);

    if (deleteError) throw deleteError;
  }

  for (const route of cleanedRoutes) {
    const payload = {
      campaign_id: activity.campaignId || null,
      activity_id: activityId,
      office: activity.office?.trim() || null,
      zip_code: route.zipCode,
      route_type: route.routeType,
      route_number: route.routeNumber,
      // route_id is also generated/normalized by the DB trigger.
      route_id: normalizeMailerRouteNumber(
        route.routeType,
        route.routeNumber
      ),
      mail_pieces: route.mailPieces,
      total_count: route.mailPieces,
      average_household_income: route.averageHouseholdIncome,
      route_notes: route.notes || null,
      notes: route.notes || null,
    };

    if (route.id) {
      const { error: updateError } = await supabase
        .from('marketing_mailer_routes')
        .update(payload)
        .eq('id', route.id)
        .eq('activity_id', activityId);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('marketing_mailer_routes')
        .insert(payload);

      if (insertError) throw insertError;
    }
  }
};

export const createMarketingActivity = async (activity) => {
  const payload = marketingActivityToDb(activity);
  if (!payload.office) throw new Error('Office is required.');
  if (!payload.activity_type) throw new Error('Activity type is required.');
  if (!payload.activity_date) throw new Error('Activity date is required.');

  const { data, error } = await supabase
    .from('marketing_activities')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  await syncActivityInventoryMovement(data.id, activity);
  await syncActivityMailerRoutes(data.id, activity);
  return dbToMarketingActivity(data);
};

export const updateMarketingActivity = async (activityId, activity) => {
  if (!activityId) throw new Error('Missing activity ID.');
  const payload = marketingActivityToDb(activity);
  delete payload.created_by;

  const { data, error } = await supabase
    .from('marketing_activities')
    .update(payload)
    .eq('id', activityId)
    .select()
    .single();
  if (error) throw error;
  await syncActivityInventoryMovement(data.id, activity);
  await syncActivityMailerRoutes(data.id, activity);
  return dbToMarketingActivity(data);
};

export const deleteMarketingActivity = async (activityId) => {
  if (!activityId) throw new Error('Missing activity ID.');

  const { error: routeError } = await supabase
    .from('marketing_mailer_routes')
    .delete()
    .eq('activity_id', activityId);
  if (routeError) throw routeError;
  const { error: movementError } = await supabase
    .from('marketing_inventory_movements')
    .delete()
    .eq('activity_id', activityId);
  if (movementError) throw movementError;

  const { error } = await supabase
    .from('marketing_activities')
    .delete()
    .eq('id', activityId);
  if (error) throw error;
  return { deleted: true, id: activityId };
};

export const getMarketingActivitySummary = (activities = []) => {
  return activities.reduce((summary, activity) => {
    summary.totalActivities += 1;
    summary.totalQuantity += Number(activity.quantity || 0);
    if (activity.activityType === ACTIVITY_TYPES.MAILER) {
      summary.totalPurchasedQuantity += Number(activity.purchasedQuantity || 0);
      summary.totalDistributedQuantity += Number(activity.distributedQuantity || activity.quantity || 0);
    }
    summary.totalProductionCost += Number(activity.productionCost || 0);
    summary.totalDistributionCost += Number(activity.distributionCost || 0);
    summary.totalOtherCost += Number(activity.otherCost || 0);
    summary.totalCost += Number(activity.cost || 0);
    summary.totalEstimatedReach += Number(activity.estimatedReach || 0);

    if (!summary.byType[activity.activityType]) {
      summary.byType[activity.activityType] = { count: 0, quantity: 0, productionCost: 0, distributionCost: 0, otherCost: 0, cost: 0, estimatedReach: 0 };
    }

    summary.byType[activity.activityType].count += 1;
    summary.byType[activity.activityType].quantity += Number(activity.quantity || 0);
    summary.byType[activity.activityType].productionCost += Number(activity.productionCost || 0);
    summary.byType[activity.activityType].distributionCost += Number(activity.distributionCost || 0);
    summary.byType[activity.activityType].otherCost += Number(activity.otherCost || 0);
    summary.byType[activity.activityType].cost += Number(activity.cost || 0);
    summary.byType[activity.activityType].estimatedReach += Number(activity.estimatedReach || 0);

    if (activity.office) {
      if (!summary.byOffice[activity.office]) {
        summary.byOffice[activity.office] = { count: 0, quantity: 0, productionCost: 0, distributionCost: 0, otherCost: 0, cost: 0, estimatedReach: 0 };
      }

      summary.byOffice[activity.office].count += 1;
      summary.byOffice[activity.office].quantity += Number(activity.quantity || 0);
      summary.byOffice[activity.office].productionCost += Number(activity.productionCost || 0);
      summary.byOffice[activity.office].distributionCost += Number(activity.distributionCost || 0);
      summary.byOffice[activity.office].otherCost += Number(activity.otherCost || 0);
      summary.byOffice[activity.office].cost += Number(activity.cost || 0);
      summary.byOffice[activity.office].estimatedReach += Number(activity.estimatedReach || 0);
    }

    return summary;
  }, {
    totalActivities: 0,
    totalQuantity: 0,
    totalPurchasedQuantity: 0,
    totalDistributedQuantity: 0,
    totalProductionCost: 0,
    totalDistributionCost: 0,
    totalOtherCost: 0,
    totalCost: 0,
    totalEstimatedReach: 0,
    byType: {},
    byOffice: {},
  });
};
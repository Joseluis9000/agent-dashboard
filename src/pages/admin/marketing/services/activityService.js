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
  cost: Number(row.cost || 0),
  estimatedReach: Number(row.estimated_reach || 0),
  city: row.city || '',
  zipCodes: Array.isArray(row.zip_codes) ? row.zip_codes : [],
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

export const marketingActivityToDb = (activity = {}) => ({
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
  quantity: cleanNumberOrZero(activity.quantity),
  cost: cleanNumberOrZero(activity.cost),
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
  cost: '',
  estimatedReach: '',
  city: '',
  zipCodes: '',
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
  return dbToMarketingActivity(data);
};

export const deleteMarketingActivity = async (activityId) => {
  if (!activityId) throw new Error('Missing activity ID.');
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
    summary.totalCost += Number(activity.cost || 0);
    summary.totalEstimatedReach += Number(activity.estimatedReach || 0);

    if (!summary.byType[activity.activityType]) {
      summary.byType[activity.activityType] = { count: 0, quantity: 0, cost: 0, estimatedReach: 0 };
    }

    summary.byType[activity.activityType].count += 1;
    summary.byType[activity.activityType].quantity += Number(activity.quantity || 0);
    summary.byType[activity.activityType].cost += Number(activity.cost || 0);
    summary.byType[activity.activityType].estimatedReach += Number(activity.estimatedReach || 0);

    if (activity.office) {
      if (!summary.byOffice[activity.office]) {
        summary.byOffice[activity.office] = { count: 0, quantity: 0, cost: 0, estimatedReach: 0 };
      }

      summary.byOffice[activity.office].count += 1;
      summary.byOffice[activity.office].quantity += Number(activity.quantity || 0);
      summary.byOffice[activity.office].cost += Number(activity.cost || 0);
      summary.byOffice[activity.office].estimatedReach += Number(activity.estimatedReach || 0);
    }

    return summary;
  }, {
    totalActivities: 0,
    totalQuantity: 0,
    totalCost: 0,
    totalEstimatedReach: 0,
    byType: {},
    byOffice: {},
  });
};

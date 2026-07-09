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
  routeId: row.route_id || '',
  zipCrid: row.zip_crid || '',
  residentialCount: toNumber(row.residential_count),
  businessCount: toNumber(row.business_count),
  totalCount: toNumber(row.total_count),
  estimatedPostage: toNumber(row.estimated_postage),
  estimatedPrintCost: toNumber(row.estimated_print_cost),
  estimatedTotalCost: toNumber(row.estimated_total_cost),
  facilityName: row.facility_name || '',
  notes: row.notes || '',
  createdAt: row.created_at || '',
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
  ] = await Promise.all([
    supabase.from('marketing_campaigns').select('*').eq('id', campaignId).single(),
    supabase.from('marketing_locations').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }),
    supabase.from('marketing_activities').select('*').eq('campaign_id', campaignId).order('activity_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('marketing_location_photos').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(250),
    supabase.from('marketing_activity_photos').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(250),
    supabase.from('marketing_mailer_routes').select('*').eq('campaign_id', campaignId).order('zip_code', { ascending: true }).order('route_id', { ascending: true }),
  ]);

  const error = [
    campaignResult.error,
    locationsResult.error,
    activitiesResult.error,
    locationPhotosResult.error,
    activityPhotosResult.error,
    mailerRoutesResult.error,
  ].find(Boolean);

  if (error) throw error;

  const campaign = dbToMarketingCampaign(campaignResult.data);
  const locations = (locationsResult.data || []).map(normalizeLocation);
  const activities = (activitiesResult.data || []).map(dbToMarketingActivity);
  const locationPhotos = (locationPhotosResult.data || []).map((row) => normalizePhoto(row, 'location'));
  const activityPhotos = (activityPhotosResult.data || []).map((row) => normalizePhoto(row, 'activity'));
  const photos = [...locationPhotos, ...activityPhotos].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const mailerRoutes = (mailerRoutesResult.data || []).map(normalizeMailerRoute);

  const activitySpend = activities.reduce((sum, activity) => sum + toNumber(activity.cost), 0);
  const locationSpend = locations.reduce((sum, location) => sum + toNumber(location.monthlyCost || location.eventCost), 0);
  const mailerPieces = mailerRoutes.reduce((sum, route) => sum + toNumber(route.totalCount), 0);
  const mailerCost = mailerRoutes.reduce((sum, route) => sum + toNumber(route.estimatedTotalCost), 0);
  const estimatedReach = activities.reduce((sum, activity) => sum + toNumber(activity.estimatedReach), 0);
  const budget = toNumber(campaign.budget);
  const knownSpend = activitySpend + locationSpend;
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
    activitiesByType,
    offices,
    summary: {
      budget,
      knownSpend,
      budgetRemaining,
      budgetUsedPercent,
      activitySpend,
      locationSpend,
      mailerCost,
      activityCount: activities.length,
      locationCount: locations.length,
      photoCount: photos.length,
      mailerRouteCount: mailerRoutes.length,
      mailerPieces,
      estimatedReach,
      officeCount: offices.length,
    },
  };
};

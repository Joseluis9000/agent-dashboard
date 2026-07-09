// src/pages/admin/marketing/services/dashboardService.js

import { supabase } from '../../../../supabaseClient';
import { dbToMarketingCampaign } from './campaignService';
import { dbToMarketingActivity } from './activityService';

const toNumber = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

const dateKey = (value) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

const daysUntil = (value) => {
  if (!value) return null;

  const target = new Date(`${dateKey(value)}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);

  return Math.ceil((target.getTime() - todayNoon.getTime()) / 86400000);
};

const normalizeLocation = (row = {}) => ({
  id: row.id,
  type: row.type || 'billboard',
  name: row.name || '',
  city: row.city || '',
  region: row.region || '',
  office: row.office || '',
  status: row.status || 'active',
  vendor: row.vendor || '',
  campaignId: row.campaign_id || null,
  campaign: row.campaign || '',
  contractStart: row.contract_start || '',
  contractEnd: row.contract_end || '',
  renewalDate: row.renewal_date || '',
  eventDate: row.event_date || '',
  monthlyCost: toNumber(row.monthly_cost),
  dailyImpressions: toNumber(row.daily_impressions || row.estimated_impressions),
  createdAt: row.created_at || '',
});

const normalizePhoto = (row = {}, source = 'photo') => ({
  id: row.id,
  source,
  campaignId: row.campaign_id || null,
  photoUrl: row.photo_url || '',
  photoType: row.photo_type || '',
  title: row.title || '',
  description: row.description || '',
  createdAt: row.created_at || '',
});

export const getMarketingDashboardData = async () => {
  const [
    campaignsResult,
    locationsResult,
    activitiesResult,
    locationPhotosResult,
    activityPhotosResult,
  ] = await Promise.all([
    supabase
      .from('marketing_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250),
    supabase
      .from('marketing_locations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('marketing_activities')
      .select('*')
      .order('activity_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('marketing_location_photos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('marketing_activity_photos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const error = [
    campaignsResult.error,
    locationsResult.error,
    activitiesResult.error,
    locationPhotosResult.error,
    activityPhotosResult.error,
  ].find(Boolean);

  if (error) throw error;

  const campaigns = (campaignsResult.data || []).map(dbToMarketingCampaign);
  const locations = (locationsResult.data || []).map(normalizeLocation);
  const activities = (activitiesResult.data || []).map(dbToMarketingActivity);
  const locationPhotos = (locationPhotosResult.data || []).map((row) => normalizePhoto(row, 'location'));
  const activityPhotos = (activityPhotosResult.data || []).map((row) => normalizePhoto(row, 'activity'));
  const photos = [...locationPhotos, ...activityPhotos].sort((a, b) => {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'active');
  const activeLocations = locations.filter((location) => location.status === 'active' || location.status === 'renewal');

  const monthlyLocationSpend = locations.reduce((sum, location) => sum + toNumber(location.monthlyCost), 0);
  const activitySpend = activities.reduce((sum, activity) => sum + toNumber(activity.cost), 0);
  const estimatedReach = activities.reduce((sum, activity) => sum + toNumber(activity.estimatedReach), 0);
  const dailyImpressions = locations.reduce((sum, location) => sum + toNumber(location.dailyImpressions), 0);

  const upcomingRenewals = locations
    .map((location) => {
      const renewalDate = location.renewalDate || location.contractEnd;
      return {
        ...location,
        renewalDate,
        daysRemaining: daysUntil(renewalDate),
      };
    })
    .filter((location) => location.daysRemaining !== null && location.daysRemaining >= 0 && location.daysRemaining <= 120)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .slice(0, 8);

  const recentActivities = activities.slice(0, 8);
  const recentPhotos = photos.slice(0, 12);

  const campaignMap = campaigns.reduce((acc, campaign) => {
    acc[campaign.id] = {
      ...campaign,
      locationCount: 0,
      activityCount: 0,
      photoCount: 0,
      spend: 0,
      reach: 0,
      impressions: 0,
    };
    return acc;
  }, {});

  locations.forEach((location) => {
    if (!location.campaignId || !campaignMap[location.campaignId]) return;
    campaignMap[location.campaignId].locationCount += 1;
    campaignMap[location.campaignId].spend += toNumber(location.monthlyCost);
    campaignMap[location.campaignId].impressions += toNumber(location.dailyImpressions);
  });

  activities.forEach((activity) => {
    if (!activity.campaignId || !campaignMap[activity.campaignId]) return;
    campaignMap[activity.campaignId].activityCount += 1;
    campaignMap[activity.campaignId].spend += toNumber(activity.cost);
    campaignMap[activity.campaignId].reach += toNumber(activity.estimatedReach);
  });

  photos.forEach((photo) => {
    if (!photo.campaignId || !campaignMap[photo.campaignId]) return;
    campaignMap[photo.campaignId].photoCount += 1;
  });

  const topCampaigns = Object.values(campaignMap)
    .sort((a, b) => {
      const aScore = a.spend + a.reach / 100 + a.impressions / 100;
      const bScore = b.spend + b.reach / 100 + b.impressions / 100;
      return bScore - aScore;
    })
    .slice(0, 6);

  const activityByType = activities.reduce((acc, activity) => {
    const key = activity.activityType || 'other';

    if (!acc[key]) {
      acc[key] = {
        count: 0,
        quantity: 0,
        cost: 0,
        reach: 0,
      };
    }

    acc[key].count += 1;
    acc[key].quantity += toNumber(activity.quantity);
    acc[key].cost += toNumber(activity.cost);
    acc[key].reach += toNumber(activity.estimatedReach);

    return acc;
  }, {});

  return {
    campaigns,
    locations,
    activities,
    photos,
    activeCampaigns,
    activeLocations,
    upcomingRenewals,
    recentActivities,
    recentPhotos,
    topCampaigns,
    activityByType,
    summary: {
      campaignCount: campaigns.length,
      activeCampaignCount: activeCampaigns.length,
      locationCount: locations.length,
      activeLocationCount: activeLocations.length,
      activityCount: activities.length,
      photoCount: photos.length,
      monthlyLocationSpend,
      activitySpend,
      totalKnownSpend: monthlyLocationSpend + activitySpend,
      estimatedReach,
      dailyImpressions,
    },
  };
};

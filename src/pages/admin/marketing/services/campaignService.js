// src/pages/admin/marketing/services/campaignService.js

import { supabase } from '../../../../supabaseClient';

export const CAMPAIGN_STATUS = Object.freeze({
  PLANNED: 'planned',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const dbToMarketingCampaign = (row = {}) => ({
  id: row.id,
  name: row.name || '',
  description: row.description || '',
  status: row.status || CAMPAIGN_STATUS.PLANNED,
  startDate: row.start_date || '',
  endDate: row.end_date || '',
  budget: Number(row.budget || 0),
  goal: row.goal || '',
  primaryColor: row.primary_color || '#0ea5e9',
  secondaryColor: row.secondary_color || '#0369a1',
  notes: row.notes || '',
  createdBy: row.created_by || null,
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

export const marketingCampaignToDb = (campaign = {}) => ({
  name: campaign.name?.trim() || '',
  description: campaign.description?.trim() || null,
  status: campaign.status || CAMPAIGN_STATUS.PLANNED,
  start_date: campaign.startDate || null,
  end_date: campaign.endDate || null,
  budget: Number(campaign.budget || 0),
  goal: campaign.goal?.trim() || null,
  primary_color: campaign.primaryColor || '#0ea5e9',
  secondary_color: campaign.secondaryColor || '#0369a1',
  notes: campaign.notes?.trim() || null,
  created_by: campaign.createdBy || null,
});

export const createEmptyCampaignForm = () => ({
  name: '',
  description: '',
  status: CAMPAIGN_STATUS.PLANNED,
  startDate: '',
  endDate: '',
  budget: '',
  goal: '',
  primaryColor: '#0ea5e9',
  secondaryColor: '#0369a1',
  notes: '',
});

export const getMarketingCampaigns = async ({
  status = '',
  search = '',
  limit = 250,
} = {}) => {
  let query = supabase
    .from('marketing_campaigns')
    .select('*')
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(dbToMarketingCampaign);
};

export const getMarketingCampaignById = async (campaignId) => {
  if (!campaignId) return null;

  const { data, error } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (error) throw error;

  return dbToMarketingCampaign(data);
};

export const createMarketingCampaign = async (campaign) => {
  const payload = marketingCampaignToDb(campaign);

  if (!payload.name) throw new Error('Campaign name is required.');

  const { data, error } = await supabase
    .from('marketing_campaigns')
    .insert(payload)
    .select()
    .single();

  if (error) throw error;

  return dbToMarketingCampaign(data);
};

export const updateMarketingCampaign = async (campaignId, campaign) => {
  if (!campaignId) throw new Error('Missing campaign ID.');

  const payload = marketingCampaignToDb(campaign);
  delete payload.created_by;

  if (!payload.name) throw new Error('Campaign name is required.');

  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update(payload)
    .eq('id', campaignId)
    .select()
    .single();

  if (error) throw error;

  return dbToMarketingCampaign(data);
};

export const deleteMarketingCampaign = async (campaignId) => {
  if (!campaignId) throw new Error('Missing campaign ID.');

  const { error } = await supabase
    .from('marketing_campaigns')
    .delete()
    .eq('id', campaignId);

  if (error) throw error;

  return { deleted: true, id: campaignId };
};

export const attachLocationToCampaign = async (locationId, campaignId) => {
  if (!locationId) throw new Error('Missing location ID.');

  const { error } = await supabase
    .from('marketing_locations')
    .update({ campaign_id: campaignId || null })
    .eq('id', locationId);

  if (error) throw error;

  return { locationId, campaignId: campaignId || null };
};

export const attachActivityToCampaign = async (activityId, campaignId) => {
  if (!activityId) throw new Error('Missing activity ID.');

  const { error } = await supabase
    .from('marketing_activities')
    .update({ campaign_id: campaignId || null })
    .eq('id', activityId);

  if (error) throw error;

  return { activityId, campaignId: campaignId || null };
};

export const getCampaignRollup = async (campaignId) => {
  if (!campaignId) {
    return {
      locations: [],
      activities: [],
      locationPhotos: [],
      activityPhotos: [],
    };
  }

  const [
    locationsResult,
    activitiesResult,
    locationPhotosResult,
    activityPhotosResult,
  ] = await Promise.all([
    supabase.from('marketing_locations').select('*').eq('campaign_id', campaignId),
    supabase.from('marketing_activities').select('*').eq('campaign_id', campaignId),
    supabase.from('marketing_location_photos').select('*').eq('campaign_id', campaignId),
    supabase.from('marketing_activity_photos').select('*').eq('campaign_id', campaignId),
  ]);

  const error = [
    locationsResult.error,
    activitiesResult.error,
    locationPhotosResult.error,
    activityPhotosResult.error,
  ].find(Boolean);

  if (error) throw error;

  return {
    locations: locationsResult.data || [],
    activities: activitiesResult.data || [],
    locationPhotos: locationPhotosResult.data || [],
    activityPhotos: activityPhotosResult.data || [],
  };
};

// Adjust this relative path only if your existing supabaseClient.js is elsewhere.
import { supabase } from '../../../supabaseClient';
export async function listOffices(fullAccess = true) {
  if (!fullAccess) {
    const { data, error } = await supabase.rpc('om_list_directory');
    if (error) throw error;
    return data || [];
  }
  const { data, error } = await supabase.from('om_offices').select('*').order('office_code');
  if (error) throw error;
  return data || [];
}
export async function getOffice(id) {
  const { data, error } = await supabase.from('om_offices').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}
export async function createOffice(values) {
  const { data, error } = await supabase.from('om_offices').insert(values).select().single();
  if (error) throw error;
  return data;
}


export async function listServiceAccounts(officeId) {
  const { data, error } = await supabase.from('om_service_accounts')
    .select('*').eq('office_id', officeId).order('service_type').order('provider_name');
  if (error) throw error;
  return data || [];
}
export async function createServiceAccount(values) {
  const { data, error } = await supabase.from('om_service_accounts')
    .insert(values).select().single();
  if (error) throw error;
  return data;
}
export async function updateServiceAccount(id, values) {
  const { data, error } = await supabase.from('om_service_accounts')
    .update(values).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteServiceAccount(id) {
  const { error } = await supabase.from('om_service_accounts').delete().eq('id', id);
  if (error) throw error;
}

export async function listCompanyServices() {
  const { data, error } = await supabase.from('om_company_services').select('*, om_company_service_offices(office_id)').order('service_name');
  if (error) throw error;
  return data || [];
}
export async function saveCompanyService(values, id) {
  const request = id ? supabase.from('om_company_services').update(values).eq('id', id) : supabase.from('om_company_services').insert(values);
  const { data, error } = await request.select().single();
  if (error) throw error;
  return data;
}
export async function setCompanyServiceOffices(serviceId, officeIds) {
  const { error: deleteError } = await supabase.from('om_company_service_offices').delete().eq('company_service_id', serviceId);
  if (deleteError) throw deleteError;
  if (officeIds.length) {
    const { error } = await supabase.from('om_company_service_offices').insert(officeIds.map(office_id => ({ company_service_id: serviceId, office_id })));
    if (error) throw error;
  }
}
export async function deleteCompanyService(id) {
  const { error } = await supabase.from('om_company_services').delete().eq('id', id);
  if (error) throw error;
}

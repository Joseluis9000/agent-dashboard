
import { supabase } from '../../../supabaseClient';

export async function listProviders() {
  const { data, error } = await supabase
    .from('om_service_providers')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
}

export async function saveProvider(values, id) {
  const query = id
    ? supabase.from('om_service_providers').update(values).eq('id', id)
    : supabase.from('om_service_providers').insert(values);

  const { data, error } = await query.select().single();

  if (error) throw error;
  return data;
}

export async function listProviderAccounts() {
  const { data, error } = await supabase
    .from('om_service_accounts')
    .select(`
      id,
      office_id,
      provider_id,
      provider_name,
      service_type,
      account_number,
      service_status,
      renewal_date,
      hotspot_line_number,
      hotspot_last_tested,
      om_offices (
        office_code,
        office_name,
        region
      )
    `)
    .not('provider_id', 'is', null);

  if (error) throw error;
  return data || [];
}

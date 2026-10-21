import { supabase } from '../../../supabaseClient';

export async function listOfficeCompliance(officeId) {
  const { data, error } = await supabase.from('om_office_compliance').select('*').eq('office_id', officeId).order('expiration_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}
export async function saveOfficeCompliance(values, id) {
  const request = id ? supabase.from('om_office_compliance').update(values).eq('id', id) : supabase.from('om_office_compliance').insert(values);
  const { data, error } = await request.select().single();
  if (error) throw error;
  return data;
}
export async function deleteOfficeCompliance(id) {
  const { error } = await supabase.from('om_office_compliance').delete().eq('id', id);
  if (error) throw error;
}

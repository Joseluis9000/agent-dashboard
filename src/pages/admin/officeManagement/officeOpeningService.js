import { supabase } from '../../../supabaseClient';
export async function listOpeningItems(officeId) {
  const {data,error}=await supabase.from('om_opening_items').select('*').eq('office_id',officeId).order('created_at');
  if(error) throw error;
  return data || [];
}
export async function saveOpeningItem(values) {
  const {data,error}=await supabase.from('om_opening_items').upsert(values,{onConflict:'office_id,item_key'}).select().single();
  if(error) throw error;
  return data;
}
export async function deleteOpeningItem(id) {
  const {error}=await supabase.from('om_opening_items').delete().eq('id',id);
  if(error) throw error;
}

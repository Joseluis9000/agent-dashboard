import { supabase } from '../../../supabaseClient';

export async function listOfficeHistory(officeId, { offset = 0, limit = 100 } = {}) {
  const { data, error } = await supabase.from('om_activity_history')
    .select('*').eq('office_id', officeId)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data || [];
}

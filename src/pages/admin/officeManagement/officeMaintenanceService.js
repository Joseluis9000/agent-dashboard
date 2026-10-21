import { supabase } from '../../../supabaseClient';

// Read-only: this module never inserts, updates, or deletes existing tickets.
export const MAINTENANCE_CATEGORIES = [
  'equipment repair or replacement',
  'safety or maintenance concern',
  'internet or connectivity issue',
  'internet issue',
];

export const isMaintenanceTicket = ticket => {
  const category = String(ticket.category || '').trim().toLowerCase();
  return MAINTENANCE_CATEGORIES.some(value => category.includes(value));
};

export async function listOfficeTickets(officeCode) {
  const code = String(officeCode || '').trim().toUpperCase();
  if (!/^CA\d{3}$/.test(code)) throw new Error('Invalid office code.');
  const results = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    // Some records contain only CA010; others contain CA010 NOBLE.
    const { data, error } = await supabase
      .from('tickets')
      .select('id,created_at,office,urgency,category,description,status,assigned_to,resolution_notes,completed_at,completed_by,requester_name,department,ticket_type,admin_notes,action_log,vendor,priority_reason')
      .ilike('office', `${code}%`)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data || []).filter(row => String(row.office || '').trim().toUpperCase().match(/^CA\d{3}(?!\d)/)?.[0] === code);
    results.push(...rows);
    if (!data || data.length < pageSize) break;
  }
  return results;
}

// Supplemental records are the only writable data in this module.
export async function listMaintenanceRecords(officeId) {
  const { data, error } = await supabase.from('om_maintenance_records').select('*').eq('office_id', officeId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function saveMaintenanceRecord(values, id) {
  const query = id
    ? supabase.from('om_maintenance_records').update(values).eq('id', id)
    : supabase.from('om_maintenance_records').insert(values);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}
export async function deleteMaintenanceRecord(id) {
  const { error } = await supabase.from('om_maintenance_records').delete().eq('id', id);
  if (error) throw error;
}

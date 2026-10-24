import { supabase } from '../../../supabaseClient';

export async function listContacts() {
  const { data, error } = await supabase
    .from('om_contacts')
    .select('*, om_contact_offices(office_id)')
    .order('full_name');

  if (error) throw error;
  return data || [];
}

export async function saveContact(values, id) {
  const query = id
    ? supabase.from('om_contacts').update(values).eq('id', id)
    : supabase.from('om_contacts').insert(values);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function setContactOffices(contactId, officeIds) {
  const { error } = await supabase.rpc('om_set_contact_offices', {
    p_contact_id: contactId,
    p_office_ids: officeIds,
  });

  if (error) throw error;
}

export async function deleteContact(id) {
  const { error } = await supabase
    .from('om_contacts')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
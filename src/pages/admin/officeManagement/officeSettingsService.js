import { supabase } from '../../../supabaseClient';

export const SETTINGS_KINDS = [
 ['setup','Opening Task Templates'],['supplies','Supply Templates'],
 ['compliance','Compliance Templates'],['maintenance','Maintenance Categories'],
 ['services','Service Account Types'],['documents','Document Categories']
];
export const labelOf = s => String(s || '').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
export async function listSettings(kind, includeArchived = false) {
 let q = supabase.from('om_settings_items').select('*').eq('kind',kind).order('sort_order').order('created_at');
 if (!includeArchived) q = q.eq('active',true);
 const {data,error}=await q; if(error) throw error; return data || [];
}
export async function saveSetting(values) {
 const {data,error}=await supabase.from('om_settings_items').upsert(values,{onConflict:'kind,item_key'}).select().single();
 if(error) throw error; return data;
}
export async function listSettingOffices() {
 const {data,error}=await supabase.from('om_offices').select('id,office_code,office_name,status').order('office_code');
 if(error) throw error; return data || [];
}
export function appliesToOffice(item,office) {
 if (!item.active || !office) return false;
 if (item.scope === 'all') return true;
 if (item.scope === 'opening') return ['opening','planning'].includes(office.status);
 if (item.scope === 'selected') return (item.office_ids || []).includes(office.id);
 if (item.scope === 'future') return !!office.created_at && new Date(office.created_at) > new Date(item.created_at);
 return false;
}
export async function getOfficeSettings(kind, officeId) {
 const {data:office,error}=await supabase.from('om_offices').select('id,status,created_at').eq('id',officeId).single();
 if(error) throw error;
 const items=await listSettings(kind);
 return items.filter(item=>appliesToOffice(item,office));
}

import { supabase } from '../../../supabaseClient';
const query = async request => { const { data, error } = await request; if (error) throw error; return data; };
export const listLandlords = async () => (await query(supabase.from('om_landlords').select('*').order('name'))) || [];
export const saveLandlord = (values, id) => query((id ? supabase.from('om_landlords').update(values).eq('id',id) : supabase.from('om_landlords').insert(values)).select().single());
export const listLeases = async officeId => (await query(officeId ? supabase.from('om_leases').select('*,om_landlords(name,phone,email,emergency_phone)').eq('office_id',officeId).order('created_at',{ascending:false}) : supabase.from('om_leases').select('*,om_landlords(name,phone,email,emergency_phone),om_offices(office_code,office_name,region)').order('created_at',{ascending:false}))) || [];
export const saveLease = (values,id) => query((id ? supabase.from('om_leases').update(values).eq('id',id) : supabase.from('om_leases').insert(values)).select().single());
export const listResponsibilities = async leaseId => (await query(supabase.from('om_lease_responsibilities').select('*').eq('lease_id',leaseId).order('category'))) || [];
export const saveResponsibility = (values) => query(supabase.from('om_lease_responsibilities').upsert(values,{onConflict:'lease_id,category'}).select().single());
export const listRentHistory = async leaseId => (await query(supabase.from('om_lease_rent_history').select('*').eq('lease_id',leaseId).order('effective_date',{ascending:false}))) || [];
export const addRentHistory = values => query(supabase.from('om_lease_rent_history').insert(values).select().single());
export const listPropertyEvents = async officeId => (await query(supabase.from('om_property_events').select('*').eq('office_id',officeId).order('event_date',{ascending:false}).order('created_at',{ascending:false}))) || [];
export const savePropertyEvent = (values,id) => query((id ? supabase.from('om_property_events').update(values).eq('id',id) : supabase.from('om_property_events').insert(values)).select().single());
export const listLeaseDocuments = async leaseId => (await query(supabase.from('om_lease_documents').select('*').eq('lease_id',leaseId).is('archived_at',null).order('uploaded_at',{ascending:false}))) || [];
export const listLeaseAudit = async leaseId => (await query(supabase.from('om_lease_audit_log').select('*').eq('table_name','om_leases').eq('record_id',leaseId).order('changed_at',{ascending:false}))) || [];
const allowed = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp'];
export async function uploadLeaseDocument(leaseId,file,documentType,description) {
 if (!allowed.includes(file.type) || file.size > 15*1024*1024) throw new Error('Use PDF, Word, JPG, PNG, or WEBP up to 15 MB.');
 const safe = file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120);
 const path = `${leaseId}/${crypto.randomUUID()}/${safe}`;
 const { error: uploadError } = await supabase.storage.from('om-lease-documents').upload(path,file,{contentType:file.type,upsert:false});
 if (uploadError) throw uploadError;
 try { return await query(supabase.from('om_lease_documents').insert({lease_id:leaseId,document_type:documentType,description:description||null,original_filename:file.name,storage_path:path,mime_type:file.type,file_size:file.size}).select().single()); }
 catch(e) { throw new Error(`File uploaded but metadata failed. Storage path: ${path}. ${e.message}`); }
}
export async function openLeaseDocument(item) {
 const { data,error } = await supabase.storage.from('om-lease-documents').createSignedUrl(item.storage_path,120);
 if(error) throw error;
 return data.signedUrl;
}
export const archiveLeaseDocument = id => query(supabase.from('om_lease_documents').update({archived_at:new Date().toISOString()}).eq('id',id).select().single());

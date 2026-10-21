import { supabase } from '../../../supabaseClient';

const BUCKET = 'om-office-documents';
export const OFFICE_DOCUMENT_LIMIT = 15 * 1024 * 1024;
export const OFFICE_DOCUMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx';
const TYPES = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', txt: 'text/plain', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export function validateOfficeDocument(file) {
  const ext = file?.name?.split('.').pop()?.toLowerCase();
  if (!file || !TYPES[ext]) return 'Unsupported file type.';
  if (!file.size || file.size > OFFICE_DOCUMENT_LIMIT) return 'File must be between 1 byte and 15 MB.';
  if (file.type && file.type !== TYPES[ext] && !(ext === 'txt' && file.type === '')) return 'File extension and type do not match.';
  return null;
}
export async function listOfficeDocuments(officeId) {
  const { data, error } = await supabase.from('om_office_documents').select('*').eq('office_id', officeId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function uploadOfficeDocument({ officeId, file, documentType, description, expirationDate }) {
  const invalid = validateOfficeDocument(file);
  if (invalid) throw new Error(`${file.name}: ${invalid}`);
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `office/${officeId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: TYPES[ext], upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from('om_office_documents').insert({
    office_id: officeId, storage_path: path, original_filename: file.name,
    content_type: TYPES[ext], file_size: file.size, document_type: documentType,
    description: description.trim() || null, expiration_date: expirationDate || null,
  });
  if (error) {
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`${error.message}${cleanupError ? `; upload cleanup failed: ${cleanupError.message}` : ''}`);
  }
}
export async function openOfficeDocument(item) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(item.storage_path, 60);
  if (error) throw error;
  return data.signedUrl;
}
export async function deleteOfficeDocument(item) {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([item.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from('om_office_documents').delete().eq('id', item.id);
  if (error) throw new Error(`File deleted from storage, but database cleanup failed: ${error.message}`);
}

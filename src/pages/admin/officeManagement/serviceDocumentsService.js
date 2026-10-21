import { supabase } from '../../../supabaseClient';
const BUCKET='om-service-documents';
const LIMIT=15*1024*1024;
const MIME=new Set(['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const ownerKey=kind=>kind==='office'?'office_service_id':kind==='company'?'company_service_id':(()=>{throw new Error('Invalid service type');})();
export async function listServiceDocuments(kind,serviceId){
 const {data,error}=await supabase.from('om_service_documents').select('*').eq(ownerKey(kind),serviceId).order('created_at',{ascending:false});
 if(error)throw error;return data||[];
}
export async function uploadServiceDocument({kind,serviceId,file,documentType,notes}){
 if(!file||file.size<1||file.size>LIMIT)throw new Error('Choose a file smaller than 15 MB.');
 if(!MIME.has(file.type))throw new Error('Unsupported file type.');
 const path=`${kind}/${serviceId}/${crypto.randomUUID()}.${(file.name.split('.').pop()||'bin').toLowerCase()}`;
 const {error:uploadError}=await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});
 if(uploadError)throw uploadError;
 const row={[ownerKey(kind)]:serviceId,storage_path:path,original_filename:file.name,content_type:file.type,file_size:file.size,document_type:documentType,notes:notes.trim()||null};
 const {error}=await supabase.from('om_service_documents').insert(row);
 if(error){await supabase.storage.from(BUCKET).remove([path]);throw error;}
}
export async function getServiceDocumentUrl(path){
 const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,60);
 if(error)throw error;return data.signedUrl;
}
export async function removeServiceDocument(item){
 // Delete object first so a failed storage delete does not leave an untracked file.
 const {error:storageError}=await supabase.storage.from(BUCKET).remove([item.storage_path]);
 if(storageError)throw storageError;
 const {error}=await supabase.from('om_service_documents').delete().eq('id',item.id);
 if(error)throw new Error(`File removed, but document record cleanup failed: ${error.message}`);
}

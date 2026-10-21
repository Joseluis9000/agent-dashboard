import { uploadServiceDocument } from './serviceDocumentsService';

export async function uploadPendingServiceFiles({ kind, serviceId, files }) {
  const failed = [];
  const errors = [];
  for (const file of files) {
    try {
      await uploadServiceDocument({ kind, serviceId, file, documentType: 'contract', notes: '' });
    } catch (error) {
      failed.push(file);
      errors.push(`${file.name}: ${error.message || 'Upload failed'}`);
    }
  }
  return { failed, errors };
}

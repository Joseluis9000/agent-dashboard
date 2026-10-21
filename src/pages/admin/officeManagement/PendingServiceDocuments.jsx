import React, { useRef, useState } from 'react';
import styles from './OfficeManagement.module.css';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx';
const EXTENSIONS = new Set(ACCEPT.split(',').map(value => value.slice(1)));
const LIMIT = 15 * 1024 * 1024;

// Files stay in browser memory until the parent service form has saved successfully.
export default function PendingServiceDocuments({ files, onChange, disabled = false }) {
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const add = incoming => {
    if (disabled) return;
    const chosen = Array.from(incoming || []);
    const accepted = chosen.filter(file => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return file.size > 0 && file.size <= LIMIT && EXTENSIONS.has(extension);
    });
    const skipped = chosen.length - accepted.length;
    setError(skipped ? `${skipped} file(s) skipped. Allowed: PDF, Word, Excel, text and images up to 15 MB each.` : '');
    const seen = new Set(files.map(file => `${file.webkitRelativePath || file.name}|${file.size}|${file.lastModified}`));
    onChange([...files, ...accepted.filter(file => {
      const key = `${file.webkitRelativePath || file.name}|${file.size}|${file.lastModified}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })]);
  };

  return <section className={`${styles.pendingDocs} ${styles.wide}`} aria-label="Documents and attachments">
    <h3>Documents & Attachments</h3>
    <p className={styles.helper}>Choose contracts, invoices or renewal notices now. Files upload to private Supabase Storage when you save the service.</p>
    <div className={`${styles.pendingDrop} ${dragging ? styles.pendingDropActive : ''}`}
      onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={event => { event.preventDefault(); setDragging(false); }}
      onDrop={event => { event.preventDefault(); setDragging(false); add(event.dataTransfer.files); }}>
      <strong>Drag and drop files here</strong>
      <p className={styles.helper}>Or browse files or a folder on your computer</p>
      <div className={styles.pendingButtons}>
        <button type="button" disabled={disabled} onClick={() => fileInput.current?.click()}>Select Files</button>
        <button type="button" disabled={disabled} onClick={() => folderInput.current?.click()}>Select Folder</button>
      </div>
      <input ref={fileInput} type="file" multiple accept={ACCEPT} style={{display:'none'}} onChange={event => { add(event.target.files); event.target.value = ''; }} />
      <input ref={folderInput} type="file" multiple webkitdirectory="" directory="" style={{display:'none'}} onChange={event => { add(event.target.files); event.target.value = ''; }} />
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {files.length > 0 && <div className={styles.pendingFileList}>
      <strong>Ready to upload ({files.length})</strong>
      <button type="button" disabled={disabled} onClick={() => onChange([])}>Clear all</button>
      <ul>{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}>
        <span>{file.webkitRelativePath || file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
        <button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, i) => i !== index))}>Remove</button>
      </li>)}</ul>
    </div>}
    <p className={styles.helper}>Documents selected here are categorized as contracts by default. You can add or manage other document types on the saved service.</p>
  </section>;
}

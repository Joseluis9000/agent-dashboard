import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listServiceDocuments, uploadServiceDocument, removeServiceDocument, getServiceDocumentUrl } from './serviceDocumentsService';
import styles from './OfficeManagement.module.css';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx';
const MAX_SIZE = 15 * 1024 * 1024;
const EXTENSIONS = new Set(ACCEPT.split(',').map(s => s.slice(1)));

export default function ServiceDocuments({ serviceId, kind }) {
  const [items, setItems] = useState([]);
  const [files, setFiles] = useState([]);
  const [type, setType] = useState('contract');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const dragDepth = useRef(0);

  const reload = useCallback(async () => {
    try { setItems(await listServiceDocuments(kind, serviceId)); }
    catch (e) { setError(e.message); }
  }, [kind, serviceId]);

  useEffect(() => { setFiles([]); setError(''); reload(); }, [reload]);

  const addFiles = (incoming) => {
    const all = Array.from(incoming || []);
    const valid = all.filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      return file.size > 0 && file.size <= MAX_SIZE && EXTENSIONS.has(ext);
    });
    const skipped = all.length - valid.length;
    setError(skipped ? `${skipped} file(s) skipped. Only PDF, Word, Excel, text, or images up to 15 MB each are allowed.` : '');
    setFiles(previous => {
      const keys = new Set(previous.map(f => `${f.webkitRelativePath || f.name}|${f.size}|${f.lastModified}`));
      return [...previous, ...valid.filter(f => {
        const key = `${f.webkitRelativePath || f.name}|${f.size}|${f.lastModified}`;
        if (keys.has(key)) return false;
        keys.add(key);
        return true;
      })];
    });
  };

  const onDrop = (event) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (!busy) addFiles(event.dataTransfer.files);
  };

  const upload = async (event) => {
    event.preventDefault();
    if (!files.length || busy) return;
    setBusy(true); setError('');
    const failures = [];
    const remaining = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
      try { await uploadServiceDocument({ kind, serviceId, file, documentType: type, notes }); }
      catch (e) { failures.push(`${file.name}: ${e.message}`); remaining.push(file); }
    }
    setFiles(remaining);
    if (fileInput.current) fileInput.current.value = '';
    if (folderInput.current) folderInput.current.value = '';
    if (!failures.length) setNotes('');
    setProgress(''); setBusy(false);
    await reload();
    if (failures.length) setError(`${failures.length} upload(s) failed: ${failures.join(' | ')}`);
  };

  const open = async item => {
    try { const url = await getServiceDocumentUrl(item.storage_path); window.open(url, '_blank', 'noopener,noreferrer'); }
    catch (e) { setError(e.message); }
  };
  const remove = async item => {
    if (!window.confirm(`Delete attachment ${item.original_filename}?`)) return;
    setBusy(true); setError('');
    try { await removeServiceDocument(item); await reload(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <section className={styles.panel} style={{ marginTop: 16, padding: 16 }}>
    <h4>Documents & Attachments ({items.length})</h4>
    <p className={styles.helper}>Private service files, up to 15 MB each. Do not upload passwords or payment card information.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <form onSubmit={upload}>
      <div
        role="region"
        aria-label="File drop zone"
        onDragEnter={e => { e.preventDefault(); dragDepth.current += 1; setDragging(true); }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDragLeave={e => { e.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
        onDrop={onDrop}
        style={{ border: `2px dashed ${dragging ? '#2563eb' : '#9ca3af'}`, background: dragging ? '#eff6ff' : 'transparent', borderRadius: 12, padding: 22, textAlign: 'center', marginBottom: 14 }}
      >
        <strong>Drag and drop documents here</strong>
        <p className={styles.helper}>Or choose individual files or an entire folder from your computer.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>Select files</button>
          <button type="button" disabled={busy} onClick={() => folderInput.current?.click()}>Select folder</button>
        </div>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} aria-label="Select document files" />
        <input ref={folderInput} type="file" multiple webkitdirectory="" directory="" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} aria-label="Select document folder" />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
        <label>Document type <select value={type} disabled={busy} onChange={e => setType(e.target.value)}>{['contract', 'invoice', 'renewal_notice', 'installation', 'cancellation', 'other'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></label>
        <label>Notes (optional) <input value={notes} disabled={busy} onChange={e => setNotes(e.target.value)} maxLength={500} /></label>
        <button type="submit" disabled={!files.length || busy}>{busy ? 'Uploading...' : `Upload ${files.length} file${files.length === 1 ? '' : 's'}`}</button>
      </div>
      {files.length > 0 && <div style={{ marginTop: 12 }}>
        <strong>Ready to upload ({files.length})</strong>{' '}
        <button type="button" disabled={busy} onClick={() => setFiles([])}>Clear selection</button>
        <ul style={{ paddingLeft: 20, maxHeight: 170, overflowY: 'auto' }}>
          {files.map((f, i) => <li key={`${f.webkitRelativePath || f.name}-${f.size}-${f.lastModified}-${i}`}>
            {f.webkitRelativePath || f.name} ({(f.size / 1024 / 1024).toFixed(2)} MB){' '}
            <button type="button" disabled={busy} onClick={() => setFiles(prev => prev.filter((_, index) => index !== i))}>Remove</button>
          </li>)}
        </ul>
      </div>}
      {progress && <p role="status">{progress}</p>}
    </form>
    {items.length ? <ul style={{ paddingLeft: 20 }}>{items.map(item => <li key={item.id} style={{ marginTop: 10 }}>
      <button type="button" onClick={() => open(item)}>{item.original_filename}</button> — {item.document_type.replace(/_/g, ' ')} · {new Date(item.created_at).toLocaleDateString()}
      {item.notes && <span> · {item.notes}</span>}{' '}<button type="button" disabled={busy} onClick={() => remove(item)}>Delete</button>
    </li>)}</ul> : <p className={styles.helper}>No attachments yet.</p>}
  </section>;
}

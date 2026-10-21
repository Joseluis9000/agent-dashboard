import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './OfficeManagement.module.css';
import {listSettings} from './officeSettingsService';
import {
  OFFICE_DOCUMENT_ACCEPT, listOfficeDocuments, uploadOfficeDocument,
  openOfficeDocument, deleteOfficeDocument, validateOfficeDocument,
} from './officeDocumentsService';

const FALLBACK_CATEGORIES = [['other','Other']];
const fileKey = f => `${f.webkitRelativePath || f.name}|${f.size}|${f.lastModified}`;

export default function OfficeDocuments({ officeId }) {
  const [items, setItems] = useState([]);
  const [categories,setCategories]=useState(FALLBACK_CATEGORIES);
  const [files, setFiles] = useState([]);
  const [category, setCategory] = useState('other');
  const [description, setDescription] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const dragDepth = useRef(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try { const [rows,cats]=await Promise.all([listOfficeDocuments(officeId),listSettings('documents')]);setItems(rows);setCategories([...cats.map(c=>[c.item_key,c.label]),...rows.filter(r=>!cats.some(c=>c.item_key===r.document_type)).map(r=>[r.document_type,r.document_type])]); }
    catch (e) { setError(e.message || 'Unable to load office documents.'); }
    finally { setLoading(false); }
  }, [officeId]);
  useEffect(() => { setFiles([]); setError(''); setNotice(''); reload(); }, [reload]);

  const addFiles = incoming => {
    const chosen = Array.from(incoming || []);
    const valid = chosen.filter(file => !validateOfficeDocument(file));
    const rejected = chosen.length - valid.length;
    setError(rejected ? `${rejected} file(s) skipped. Allowed: PDF, Word, Excel, TXT, JPG, PNG, WEBP; maximum 15 MB per file.` : '');
    setFiles(previous => {
      const keys = new Set(previous.map(fileKey));
      return [...previous, ...valid.filter(file => {
        const key = fileKey(file);
        if (keys.has(key)) return false;
        keys.add(key);
        return true;
      })];
    });
  };

  const handleDrop = e => {
    e.preventDefault(); dragDepth.current = 0; setDragging(false);
    if (!busy) addFiles(e.dataTransfer.files);
  };

  const upload = async e => {
    e.preventDefault();
    if (busy || !files.length) return;
    setBusy(true); setError(''); setNotice('');
    const failed = []; let completed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
      try {
        await uploadOfficeDocument({ officeId, file, documentType: category, description, expirationDate });
        completed += 1;
      } catch (err) { failed.push({ file, message: `${file.name}: ${err.message}` }); }
    }
    setFiles(failed.map(x => x.file));
    setProgress(''); setBusy(false);
    if (fileInput.current) fileInput.current.value = '';
    if (folderInput.current) folderInput.current.value = '';
    await reload();
    if (completed) setNotice(`${completed} document${completed === 1 ? '' : 's'} uploaded successfully.`);
    if (failed.length) setError(`${failed.length} upload(s) failed: ${failed.map(x => x.message).join(' | ')}. Failed files remain selected for retry.`);
    else { setDescription(''); setExpirationDate(''); }
  };

  const view = async item => {
    // Open the tab immediately to avoid popup blockers after the async signed-URL request.
    const tab = window.open('about:blank', '_blank');
    try {
      const url = await openOfficeDocument(item);
      if (tab) { tab.opener = null; tab.location.replace(url); }
      else window.location.assign(url);
    } catch (err) { if (tab) tab.close(); setError(err.message); }
  };
  const remove = async item => {
    if (!window.confirm(`Permanently delete ${item.original_filename}?`)) return;
    setBusy(true); setError(''); setNotice('');
    try { await deleteOfficeDocument(item); await reload(); setNotice('Document deleted.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const visible = items.filter(item =>
    (!filter || item.document_type === filter) &&
    `${item.original_filename} ${item.description || ''}`.toLowerCase().includes(search.toLowerCase())
  );
  return <div>
    <div className={styles.serviceHeading}>
      <div><h2>Office Documents</h2><p>Store location records separately from utility and service contracts.</p></div>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.success} role="status">{notice}</p>}
    <form className={styles.serviceForm} onSubmit={upload}>
      <h3>Upload Office Documents</h3>
      <div role="region" aria-label="Office document drop zone"
        onDragEnter={e => { e.preventDefault(); dragDepth.current++; setDragging(true); }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDragLeave={e => { e.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
        onDrop={handleDrop}
        style={{ border: `2px dashed ${dragging ? '#d93632' : '#aeb9c9'}`, background: dragging ? '#fff3f2' : '#fff', borderRadius: 12, padding: 26, textAlign: 'center', marginTop: 12 }}>
        <strong>Drag and drop documents here</strong>
        <p className={styles.helper}>Or choose files or a folder from your computer. Up to 15 MB per file.</p>
        <div className={styles.actions} style={{ justifyContent: 'center' }}>
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>Select Files</button>
          <button type="button" disabled={busy} onClick={() => folderInput.current?.click()}>Select Folder</button>
        </div>
        <input ref={fileInput} type="file" multiple accept={OFFICE_DOCUMENT_ACCEPT} style={{ display: 'none' }}
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} aria-label="Select office documents" />
        <input ref={folderInput} type="file" multiple webkitdirectory="" directory="" style={{ display: 'none' }}
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} aria-label="Select office document folder" />
      </div>
      <div className={styles.formGrid}>
        <label>Document category<select value={category} disabled={busy} onChange={e => setCategory(e.target.value)}>
          {categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select></label>
        <label>Expiration date (optional)<input type="date" value={expirationDate} disabled={busy} onChange={e => setExpirationDate(e.target.value)} /></label>
        <label className={styles.wide}>Description (optional)<input value={description} disabled={busy} maxLength={500} onChange={e => setDescription(e.target.value)} placeholder="e.g., 2026 city business license" /></label>
      </div>
      {files.length > 0 && <div><strong>Ready to upload ({files.length})</strong>
        <button type="button" disabled={busy} onClick={() => setFiles([])} style={{ marginLeft: 12 }}>Clear</button>
        <ul style={{ maxHeight: 160, overflowY: 'auto' }}>{files.map((file, i) => <li key={`${fileKey(file)}-${i}`}>
          {file.webkitRelativePath || file.name} ({(file.size / 1048576).toFixed(2)} MB){' '}
          <button type="button" disabled={busy} onClick={() => setFiles(current => current.filter((_, index) => index !== i))}>Remove</button>
        </li>)}</ul>
      </div>}
      {progress && <p role="status">{progress}</p>}
      <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy || !files.length}>{busy ? 'Uploading…' : `Upload ${files.length} Document${files.length === 1 ? '' : 's'}`}</button></div>
      <p className={styles.helper}>Private admin-only storage. Do not upload passwords, payment card numbers, or sensitive client tax records.</p>
    </form>
    <div className={styles.panel}>
      <h3>Saved Documents ({items.length})</h3>
      <div className={styles.filters}>
        <input aria-label="Search office documents" placeholder="Search filename or description…" value={search} onChange={e => setSearch(e.target.value)} />
        <select aria-label="Filter document category" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All categories</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {loading ? <p>Loading documents…</p> : !visible.length ? <p className={styles.empty}>No documents match your search.</p> :
        <div className={styles.tableScroll}><table><thead><tr><th>Document</th><th>Category</th><th>Expiration</th><th>Uploaded</th><th>Actions</th></tr></thead>
          <tbody>{visible.map(item => <tr key={item.id}>
            <td><b>{item.original_filename}</b>{item.description && <div className={styles.helper}>{item.description}</div>}</td>
            <td>{(categories.find(([value])=>value===item.document_type)?.[1]||item.document_type)}</td><td>{item.expiration_date || '—'}</td>
            <td>{new Date(item.created_at).toLocaleDateString()}</td>
            <td><button type="button" disabled={busy} onClick={() => view(item)}>View</button>{' '}
              <button type="button" disabled={busy} onClick={() => remove(item)}>Delete</button></td>
          </tr>)}</tbody></table></div>}
    </div>
  </div>;
}

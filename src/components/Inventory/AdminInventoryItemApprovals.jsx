import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import styles from './Inventory.module.css';

export default function AdminInventoryItemApprovals() {
  const [pendingItems, setPendingItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [selected, setSelected] = useState(null);
  const [edit, setEdit] = useState({});
  const [mergeTarget, setMergeTarget] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [pendingResult, catalogResult] = await Promise.all([
      supabase.from('office_inventory_custom_items').select('*').eq('approval_status', 'pending').order('submitted_at', { ascending: false }),
      supabase.from('inventory_items').select('*').eq('active', true).order('category').order('item_name'),
    ]);

    if (pendingResult.error) setMessage(pendingResult.error.message);
    if (catalogResult.error) setMessage(catalogResult.error.message);

    const rows = pendingResult.data || [];
    setPendingItems(rows);
    setCatalog(catalogResult.data || []);

    const ids = [...new Set(rows.map((row) => row.submitted_by).filter(Boolean))];
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id, full_name, email, office, region').in('id', ids);
      const map = {};
      (data || []).forEach((profile) => { map[profile.id] = profile; });
      setProfiles(map);
    } else setProfiles({});

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pendingItems;
    return pendingItems.filter((row) =>
      [row.item_name,row.category,row.description,row.unit,row.office_code,row.location_stored,profiles[row.submitted_by]?.full_name,profiles[row.submitted_by]?.email]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [pendingItems, profiles, search]);

  const openReview = (row) => {
    setSelected(row);
    setEdit({
      item_name: row.item_name || '',
      category: row.category || '',
      description: row.description || '',
      unit: row.unit || '',
      review_notes: '',
    });

    const exact = catalog.find((item) => item.item_name.trim().toLowerCase() === row.item_name.trim().toLowerCase());
    setMergeTarget(exact?.id || '');
  };

  const review = async (action) => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase.rpc('review_custom_inventory_item', {
      p_custom_item_id: selected.id,
      p_action: action,
      p_item_name: edit.item_name?.trim() || null,
      p_category: edit.category?.trim() || null,
      p_description: edit.description?.trim() || null,
      p_unit: edit.unit?.trim() || null,
      p_existing_inventory_item_id: action === 'merge' ? mergeTarget || null : null,
      p_review_notes: edit.review_notes?.trim() || null,
    });
    setSaving(false);

    if (error) return setMessage(`Review failed: ${error.message}`);

    setMessage(action === 'create' ? 'Approved as a new catalog item.' : action === 'merge' ? 'Merged with existing catalog item.' : 'Rejected from main catalog.');
    setSelected(null);
    await load();
  };

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>OPERATIONS / CATALOG REVIEW</div>
          <h2>Pending Inventory Items</h2>
          <p>Review items supervisors added because they were not in the master catalog.</p>
        </div>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      <div className={styles.inventoryToolbar}>
        <div><strong>{pendingItems.length} pending submissions</strong><span>Approve new, merge with existing, edit, or reject.</span></div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item, office, supervisor..." />
      </div>

      <div className={styles.historyTableWrap}>
        <table className={styles.historyTable}>
          <thead><tr><th>Item</th><th>Office</th><th>Submitted By</th><th>Qty</th><th>Unit</th><th>Stored At</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="7" className={styles.emptyTableCell}>Loading...</td></tr> :
             visible.length === 0 ? <tr><td colSpan="7" className={styles.emptyTableCell}>No pending items.</td></tr> :
             visible.map((row) => {
              const submitter = profiles[row.submitted_by];
              return (
                <tr key={row.id}>
                  <td><strong>{row.item_name}</strong><small>{row.category} · {row.description || 'No description'}</small></td>
                  <td><strong>{row.office_code}</strong></td>
                  <td><strong>{submitter?.full_name || 'Unknown'}</strong><small>{submitter?.email || '—'}</small></td>
                  <td className={styles.numberCell}>{row.reported_on_hand}</td>
                  <td><span className={styles.unitPill}>{row.unit}</span></td>
                  <td>{row.location_stored || '—'}</td>
                  <td className={styles.rowActions}><button type="button" onClick={() => openReview(row)}>Review</button></td>
                </tr>
              );
             })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className={styles.reportModalBackdrop} onClick={() => setSelected(null)}>
          <div className={styles.reportModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.reportModalHeader}>
              <div><span>CATALOG REVIEW</span><h3>{selected.item_name}</h3></div>
              <button type="button" onClick={() => setSelected(null)}>×</button>
            </div>

            <div className={styles.approvalGrid}>
              <label><span>Item Name</span><input value={edit.item_name || ''} onChange={(e) => setEdit((c) => ({...c,item_name:e.target.value}))} /></label>
              <label><span>Category</span><input value={edit.category || ''} onChange={(e) => setEdit((c) => ({...c,category:e.target.value}))} /></label>
              <label className={styles.customWide}><span>Description</span><input value={edit.description || ''} onChange={(e) => setEdit((c) => ({...c,description:e.target.value}))} /></label>
              <label><span>Unit</span><input value={edit.unit || ''} onChange={(e) => setEdit((c) => ({...c,unit:e.target.value}))} /></label>
              <label><span>Quantity Reported</span><input value={selected.reported_on_hand} readOnly /></label>
              <label className={styles.customWide}><span>Location Stored</span><input value={selected.location_stored || ''} readOnly /></label>
              <label className={styles.customWide}><span>Review Notes</span><textarea value={edit.review_notes || ''} onChange={(e) => setEdit((c) => ({...c,review_notes:e.target.value}))} /></label>
            </div>

            <div className={styles.mergePanel}>
              <strong>Already in the catalog?</strong>
              <span>Merge instead of creating a duplicate.</span>
              <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                <option value="">Choose existing item...</option>
                {catalog.map((item) => <option key={item.id} value={item.id}>{item.item_name} · {item.unit} · {item.category}</option>)}
              </select>
            </div>

            <div className={styles.approvalActions}>
              <button className={styles.removeButton} type="button" disabled={saving} onClick={() => review('reject')}>Reject</button>
              <button className={styles.secondaryButton} type="button" disabled={saving || !mergeTarget} onClick={() => review('merge')}>Merge With Existing</button>
              <button className={styles.primaryButton} type="button" disabled={saving} onClick={() => review('create')}>Approve as New Item</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
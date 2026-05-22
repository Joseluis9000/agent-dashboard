import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import styles from './EnterViolation.module.css';

const ListManagerModal = ({ isOpen, onClose, title, items, onAddItem, onDeleteItem }) => {
  const [newItem, setNewItem] = useState('');
  if (!isOpen) return null;

  const handleAdd = () => {
    if (newItem.trim()) {
      onAddItem(newItem.trim().toUpperCase());
      setNewItem('');
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3>Manage {title}</h3>
          <button onClick={onClose} className={styles.closeButton}>&times;</button>
        </div>

        <div className={styles.itemList}>
          {items.map(item => (
            <div key={item.id} className={styles.item}>
              <span>{item.name}</span>
              <button onClick={() => onDeleteItem(item.id)} className={styles.deleteItemButton}>
                Delete
              </button>
            </div>
          ))}
        </div>

        <div className={styles.addItemForm}>
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder={`New ${title}...`}
          />
          <button onClick={handleAdd}>Add Item</button>
        </div>
      </div>
    </div>
  );
};

const getWeekRange = (date) => {
  const d = new Date(date);
  const todayUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayOfWeek = todayUTC.getUTCDay();
  const diff = todayUTC.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
  const sunday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff + 6));

  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
};

const todayKey = () => new Date().toISOString().split('T')[0];

const getOfficeCodeOnly = (officeValue) => {
  return String(officeValue || '').trim().split(/\s+/)[0];
};

const getUploadedDateOnly = (dateValue) => {
  return String(dateValue || '').slice(0, 10);
};

const normalizeText = (value) => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

const groupEodMatchesByReceipt = (records = []) => {
  const grouped = {};

  records.forEach((record) => {
    const groupKey = [
      record.receipt_id || '',
      getUploadedDateOnly(record.date_time),
      record.office || '',
      normalizeText(record.customer),
    ].join('|');

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        ...record,
        grouped_match: true,
        receipt_id: record.receipt_id,
        receipt_sync_keys: [],
        receipt_row_ids: [],
        receipt_rows: [],
        receipt_total: 0,
        receipt_companies: [],
        receipt_policies: [],
        receipt_types: [],
      };
    }

    grouped[groupKey].receipt_rows.push(record);
    grouped[groupKey].receipt_row_ids.push(record.id);
    grouped[groupKey].receipt_sync_keys.push(record.sync_key);

    grouped[groupKey].receipt_total += Number(record.total || 0);

    if (record.company && !grouped[groupKey].receipt_companies.includes(record.company)) {
      grouped[groupKey].receipt_companies.push(record.company);
    }

    if (record.policy && !grouped[groupKey].receipt_policies.includes(record.policy)) {
      grouped[groupKey].receipt_policies.push(record.policy);
    }

    if (record.type && !grouped[groupKey].receipt_types.includes(record.type)) {
      grouped[groupKey].receipt_types.push(record.type);
    }
  });

  return Object.values(grouped);
};

const VIOLATION_CATEGORIES = [
  'No receipt-AR',
  'RP-AR',
  'EFT-AR',
  'Voiding-AR',
  'Unmatched CC-AR',
  'Shortage-AR',
  'Chargeback-AR',
  'Other-AR',
  'Charged-SV',
  'Uncharged-SV',
  'Unposted-DP',
  'Missing App-DP',
  'Missing Signatures-DP',
  'Missing Docs-DP',
  'Photo Issues-DP',
  'ID / REG Issues-DP',
  'Incorrect Info-DP',
  'Other-DP',
];

const calcFee = (violation_type, violation_category) => {
  if (violation_type === 'AR Violation') return 10;

  if (violation_type === 'Scanning Violation') {
    if (violation_category === 'Charged-SV') return 25;
    if (violation_category === 'Uncharged-SV') return 0;
  }

  return 0;
};

const createInitialRow = (agentEmail = '') => ({
  id: Date.now() + Math.random(),
  agent_email: agentEmail,
  office_code: '',
  region: '',
  violation_type: 'AR Violation',
  violation_category: '',
  transaction_date: todayKey(),
  reported_date: todayKey(),

  client_name: '',
  customer_id: '',
  policy_number: '',
  reference_id: '',

  variance_amount: 0,
  fee_amount: 10,
  details: '',

  match_results: [],
  selected_match: null,
  linked_eod_transfer_id: null,
  linked_sync_key: null,
  linked_receipt_id: null,
  linked_receipt_sync_keys: null,
  linked_receipt_row_ids: null,
  match_status: 'unmatched',
  isSearching: false,
});

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: '#334155',
};

const inputStyle = {
  height: 38,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '0 10px',
  fontSize: 13,
  background: '#fff',
};

const EnterViolation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const violationToEdit = location.state?.violationToEdit;

  const [currentDate, setCurrentDate] = useState(new Date());
  const week = useMemo(() => getWeekRange(currentDate), [currentDate]);

  const [rows, setRows] = useState([createInitialRow()]);
  const [agentList, setAgentList] = useState([]);
  const [officeList, setOfficeList] = useState([]);
  const [regionList, setRegionList] = useState([]);

  const [isOfficeModalOpen, setIsOfficeModalOpen] = useState(false);
  const [isRegionModalOpen, setIsRegionModalOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLists = async () => {
      const { data: agents } = await supabase
        .from('profiles')
        .select('email, full_name')
        .order('full_name');

      setAgentList(agents || []);

      if (!violationToEdit && agents && agents.length > 0) {
        setRows([createInitialRow(agents[0].email)]);
      }

      fetchOffices();
      fetchRegions();
    };

    fetchLists();
  }, [violationToEdit]);

  useEffect(() => {
    if (!violationToEdit) return;

    setRows([{
      ...createInitialRow(violationToEdit.agent_email || ''),
      ...violationToEdit,
      id: violationToEdit.id,
      violation_type:
        violationToEdit.violation_type === 'AR Shortage'
          ? 'AR Violation'
          : violationToEdit.violation_type,
      violation_category: violationToEdit.violation_category || '',
      transaction_date: violationToEdit.transaction_date || todayKey(),
      reported_date: violationToEdit.reported_date || todayKey(),
      customer_id: violationToEdit.customer_id || '',
      policy_number: violationToEdit.policy_number || '',
      linked_eod_transfer_id: violationToEdit.linked_eod_transfer_id || null,
      linked_sync_key: violationToEdit.linked_sync_key || null,
      linked_receipt_id: violationToEdit.linked_receipt_id || null,
      linked_receipt_sync_keys: violationToEdit.linked_receipt_sync_keys || null,
      linked_receipt_row_ids: violationToEdit.linked_receipt_row_ids || null,
      match_status: violationToEdit.match_status || 'unmatched',
      selected_match: violationToEdit.linked_sync_key
        ? {
            id: violationToEdit.linked_eod_transfer_id,
            sync_key: violationToEdit.linked_sync_key,
            receipt_id: violationToEdit.linked_receipt_id,
            receipt_sync_keys: violationToEdit.linked_receipt_sync_keys || [],
            receipt_row_ids: violationToEdit.linked_receipt_row_ids || [],
          }
        : null,
    }]);

    setCurrentDate(new Date((violationToEdit.deduction_week_start || violationToEdit.week_start_date) + 'T12:00:00'));
  }, [violationToEdit]);

  const fetchOffices = async () => {
    const { data } = await supabase
      .from('offices')
      .select('id, office_name')
      .order('office_name');

    setOfficeList((data || []).map(o => ({ id: o.id, name: o.office_name })));
  };

  const fetchRegions = async () => {
    const { data } = await supabase
      .from('regions')
      .select('id, region_name')
      .order('region_name');

    setRegionList((data || []).map(r => ({ id: r.id, name: r.region_name })));
  };

  const addOffice = async (name) => {
    await supabase.from('offices').insert({ office_name: name });
    fetchOffices();
  };

  const deleteOffice = async (id) => {
    await supabase.from('offices').delete().eq('id', id);
    fetchOffices();
  };

  const addRegion = async (name) => {
    await supabase.from('regions').insert({ region_name: name });
    fetchRegions();
  };

  const deleteRegion = async (id) => {
    await supabase.from('regions').delete().eq('id', id);
    fetchRegions();
  };

  const getPrimarySearchValue = (row) => {
    if (row.violation_type === 'Scanning Violation') {
      return row.customer_id || row.client_name;
    }

    return row.policy_number || row.reference_id || row.client_name;
  };

  const handleRowChange = (index, field, value) => {
    const newRows = [...rows];
    newRows[index][field] = value;

    if (field === 'violation_type') {
      newRows[index].violation_category = '';
      newRows[index].variance_amount = value === 'AR Violation' ? newRows[index].variance_amount : 0;
      newRows[index].fee_amount = calcFee(value, '');
      newRows[index].match_results = [];
      newRows[index].selected_match = null;
      newRows[index].linked_eod_transfer_id = null;
      newRows[index].linked_sync_key = null;
      newRows[index].linked_receipt_id = null;
      newRows[index].linked_receipt_sync_keys = null;
      newRows[index].linked_receipt_row_ids = null;
      newRows[index].match_status = 'unmatched';
    }

    if (field === 'violation_category') {
      newRows[index].fee_amount = calcFee(newRows[index].violation_type, value);
    }

    if (
      [
        'transaction_date',
        'agent_email',
        'office_code',
        'client_name',
        'customer_id',
        'policy_number',
        'reference_id',
      ].includes(field)
    ) {
      newRows[index].selected_match = null;
      newRows[index].linked_eod_transfer_id = null;
      newRows[index].linked_sync_key = null;
      newRows[index].linked_receipt_id = null;
      newRows[index].linked_receipt_sync_keys = null;
      newRows[index].linked_receipt_row_ids = null;
      newRows[index].match_status = 'unmatched';
      newRows[index].match_results = [];
    }

    setRows(newRows);

    const updatedRow = newRows[index];
    const searchValue = getPrimarySearchValue(updatedRow);

    if (
      updatedRow.transaction_date &&
      updatedRow.agent_email &&
      updatedRow.office_code &&
      searchValue &&
      String(searchValue).trim().length >= 3
    ) {
      searchEodMatches(index, updatedRow, searchValue);
    }
  };

  const searchEodMatches = async (index, rowOverride, searchValueOverride) => {
    const row = rowOverride || rows[index];
    const rawQuery = String(searchValueOverride || getPrimarySearchValue(row) || '').trim();

    if (!row.agent_email || !row.transaction_date || !row.office_code || rawQuery.length < 3) {
      return;
    }

    const searchingRows = [...rows];
    searchingRows[index] = {
      ...searchingRows[index],
      isSearching: true,
      selected_match: null,
      linked_eod_transfer_id: null,
      linked_sync_key: null,
      linked_receipt_id: null,
      linked_receipt_sync_keys: null,
      linked_receipt_row_ids: null,
      match_status: 'unmatched',
    };
    setRows(searchingRows);

    const likeQuery = `%${rawQuery}%`;
    const cleanQuery = rawQuery.replace(/[^a-zA-Z0-9]/g, '');
    const cleanLikeQuery = `%${cleanQuery}%`;
    const officeCodeOnly = getOfficeCodeOnly(row.office_code);

    const orFilters =
      row.violation_type === 'Scanning Violation'
        ? [
            `customer_id.ilike.${likeQuery}`,
            `customer.ilike.${likeQuery}`,
            `csr.ilike.${likeQuery}`,
            `sync_key.ilike.${likeQuery}`,
            `customer_id.ilike.${cleanLikeQuery}`,
            `sync_key.ilike.${cleanLikeQuery}`,
          ]
        : [
            `policy.ilike.${likeQuery}`,
            `customer.ilike.${likeQuery}`,
            `reference.ilike.${likeQuery}`,
            `sync_key.ilike.${likeQuery}`,
            `policy.ilike.${cleanLikeQuery}`,
            `reference.ilike.${cleanLikeQuery}`,
            `sync_key.ilike.${cleanLikeQuery}`,
          ];

    let queryBuilder = supabase
      .from('daily_eod_transfers')
      .select(`
        id,
        sync_key,
        agent_email,
        receipt_id,
        customer_id,
        customer,
        date_time,
        csr,
        office,
        company,
        policy,
        reference,
        premium,
        fee,
        total,
        type
      `)
      .eq('agent_email', row.agent_email)
      .gte('date_time', row.transaction_date)
      .lte('date_time', `${row.transaction_date} 23:59:59`)
      .or(orFilters.join(','))
      .limit(30);

    if (officeCodeOnly) {
      queryBuilder = queryBuilder.ilike('office', `%${officeCodeOnly}%`);
    }

    const { data, error: searchError } = await queryBuilder;

    const updatedRows = [...rows];
    updatedRows[index] = {
      ...updatedRows[index],
      isSearching: false,
    };

    if (searchError) {
      updatedRows[index].match_results = [];
      setRows(updatedRows);
      setError(`Failed to search EOD matches: ${searchError.message}`);
      return;
    }

    updatedRows[index].match_results = groupEodMatchesByReceipt(data || []);
    setRows(updatedRows);
  };

  const selectMatch = (rowIndex, match) => {
    const newRows = [...rows];

    newRows[rowIndex].selected_match = match;
    newRows[rowIndex].linked_eod_transfer_id = match.id;
    newRows[rowIndex].linked_sync_key = match.sync_key;
    newRows[rowIndex].linked_receipt_id = match.receipt_id || null;
    newRows[rowIndex].linked_receipt_sync_keys = match.receipt_sync_keys || [match.sync_key];
    newRows[rowIndex].linked_receipt_row_ids = match.receipt_row_ids || [match.id];
    newRows[rowIndex].match_status = 'matched';
    newRows[rowIndex].match_results = [];

    newRows[rowIndex].client_name = newRows[rowIndex].client_name || match.customer || '';
    newRows[rowIndex].customer_id = newRows[rowIndex].customer_id || match.customer_id || '';
    newRows[rowIndex].policy_number =
      newRows[rowIndex].policy_number ||
      match.policy ||
      match.receipt_policies?.[0] ||
      '';

    newRows[rowIndex].reference_id =
      newRows[rowIndex].reference_id ||
      match.policy ||
      match.receipt_id ||
      match.customer_id ||
      match.reference ||
       '';

    newRows[rowIndex].office_code = newRows[rowIndex].office_code || match.office || '';

    setRows(newRows);
  };

  const clearMatch = (rowIndex) => {
    const newRows = [...rows];

    newRows[rowIndex].selected_match = null;
    newRows[rowIndex].linked_eod_transfer_id = null;
    newRows[rowIndex].linked_sync_key = null;
    newRows[rowIndex].linked_receipt_id = null;
    newRows[rowIndex].linked_receipt_sync_keys = null;
    newRows[rowIndex].linked_receipt_row_ids = null;
    newRows[rowIndex].match_status = 'unmatched';
    newRows[rowIndex].match_results = [];

    setRows(newRows);
  };

  const addRow = () => {
    setRows([
      ...rows,
      createInitialRow(agentList.length > 0 ? agentList[0].email : ''),
    ]);
  };

  const removeRow = (index) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const buildViolationPayload = (row, userEmail) => ({
    agent_email: row.agent_email,
    office_code: row.office_code,
    region: row.region,
    violation_type: row.violation_type,
    violation_category: row.violation_category,

    transaction_date: row.transaction_date || null,
    reported_date: row.reported_date || todayKey(),

    week_start_date: week.start,
    week_end_date: week.end,
    deduction_week_start: week.start,
    deduction_week_end: week.end,

    customer_id: row.customer_id || null,
    policy_number: row.policy_number || null,

    variance_amount: row.violation_type === 'AR Violation'
      ? Number(row.variance_amount || 0)
      : 0,
    fee_amount: calcFee(row.violation_type, row.violation_category),

    client_name: row.client_name,
    reference_id: row.reference_id || row.policy_number || row.customer_id,
    details: row.details,

    linked_eod_transfer_id: row.linked_eod_transfer_id,
    linked_sync_key: row.linked_sync_key,
    linked_receipt_id: row.linked_receipt_id,
    linked_receipt_sync_keys: row.linked_receipt_sync_keys,
    linked_receipt_row_ids: row.linked_receipt_row_ids,
    match_status: row.linked_sync_key ? 'matched' : 'unmatched',

    manager_email: userEmail,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    setIsSubmitting(true);
    setMessage('');
    setError('');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (violationToEdit) {
      const rowToUpdate = rows[0];
      const targetTable = rowToUpdate.violation_type === 'Disqualified Policy' ? 'disqualified_policies' : 'violations';

      const { error: updateError } = await supabase
        .from(targetTable)
        .update(buildViolationPayload(rowToUpdate, user?.email))
        .eq('id', violationToEdit.id);

      if (updateError) {
        setError(`Failed to update data: ${updateError.message}`);
      } else {
        setMessage('Successfully updated!');
        setTimeout(() => navigate('/admin/violations'), 1500);
      }

      setIsSubmitting(false);
      return;
    }

    // Split items into separate buckets depending on violation type
    const violationsToInsert = [];
    const disqualifiedToInsert = [];

    for (const row of rows) {
      if (!row.agent_email || !row.transaction_date || !row.client_name || !row.office_code) {
        setError('Please fill out all required fields: Agent, Transaction Date, Office, and Client Name.');
        setIsSubmitting(false);
        return;
      }

      if (row.violation_type === 'Scanning Violation' && !row.customer_id) {
        setError('Scanning Violations require Customer ID.');
        setIsSubmitting(false);
        return;
      }

      if ((row.violation_type === 'AR Violation' || row.violation_type === 'Disqualified Policy') && !row.policy_number) {
        setError(`${row.violation_type}s require a Policy Number.`);
        setIsSubmitting(false);
        return;
      }

      const payload = buildViolationPayload(row, user?.email);
      if (row.violation_type === 'Disqualified Policy') {
        disqualifiedToInsert.push(payload);
      } else {
        violationsToInsert.push(payload);
      }
    }

    // Fire insertions out contextually based on where they belong
    try {
      if (violationsToInsert.length > 0) {
        const { error: insertErr } = await supabase.from('violations').insert(violationsToInsert);
        if (insertErr) throw insertErr;
      }

      if (disqualifiedToInsert.length > 0) {
        const { error: disqErr } = await supabase.from('disqualified_policies').insert(disqualifiedToInsert);
        if (disqErr) throw disqErr;
      }

      setMessage('All records successfully saved!');
      setRows([createInitialRow(agentList.length > 0 ? agentList[0].email : '')]);
    } catch (err) {
      setError(`Failed to save entries: ${err.message}`);
    }

    setIsSubmitting(false);
  };

  const goToPreviousWeek = () => {
    setCurrentDate(d => new Date(d.setDate(d.getDate() - 7)));
  };

  const goToNextWeek = () => {
    setCurrentDate(d => new Date(d.setDate(d.getDate() + 7)));
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate('/admin/violations')} className={styles.backButton}>
          &larr; Back to Dashboard
        </button>

        <h2>{violationToEdit ? 'Edit Record' : 'Enter AR / SV / Disqualified Deductions'}</h2>
      </div>

      <form onSubmit={handleSubmit} className={styles.formCard}>
        <div className={styles.weekSelector}>
          <button type="button" onClick={goToPreviousWeek}>
            &larr; Previous Week
          </button>

          <h3>
            Deduction Week: {new Date(week.start + 'T12:00:00').toLocaleDateString()} -{' '}
            {new Date(week.end + 'T12:00:00').toLocaleDateString()}
          </h3>

          <button type="button" onClick={goToNextWeek}>
            Next Week &rarr;
          </button>
        </div>

        {message && <div className={styles.successMessage}>{message}</div>}
        {error && <div className={styles.errorMessage}>{error}</div>}

        {rows.map((row, index) => (
          <div
            key={row.id}
            style={{
              border: '1px solid #dbe3ef',
              borderRadius: 12,
              padding: 18,
              marginBottom: 18,
              background: '#ffffff',
              boxShadow: '0 2px 8px rgba(15,23,42,0.05)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))',
                gap: 14,
                alignItems: 'end',
              }}
            >
              <div style={fieldStyle}>
                <label style={labelStyle}>Agent / CSR</label>
                <select
                  style={inputStyle}
                  value={row.agent_email}
                  onChange={(e) => handleRowChange(index, 'agent_email', e.target.value)}
                >
                  {agentList.map(agent => (
                    <option key={agent.email} value={agent.email}>
                      {agent.full_name || agent.email}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Transaction Date</label>
                <input
                  style={inputStyle}
                  type="date"
                  value={row.transaction_date}
                  onChange={(e) => handleRowChange(index, 'transaction_date', e.target.value)}
                  required
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  Office{' '}
                  <button type="button" onClick={() => setIsOfficeModalOpen(true)} className={styles.editListButton}>
                    Edit
                  </button>
                </label>
                <select
                  style={inputStyle}
                  value={row.office_code}
                  onChange={(e) => handleRowChange(index, 'office_code', e.target.value)}
                  required
                >
                  <option value="">Select Office</option>
                  {officeList.map(office => (
                    <option key={office.id} value={office.name}>
                      {office.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  Region{' '}
                  <button type="button" onClick={() => setIsRegionModalOpen(true)} className={styles.editListButton}>
                    Edit
                  </button>
                </label>
                <select
                  style={inputStyle}
                  value={row.region}
                  onChange={(e) => handleRowChange(index, 'region', e.target.value)}
                >
                  <option value="">Select Region</option>
                  {regionList.map(region => (
                    <option key={region.id} value={region.name}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Violation Type</label>
                <select
                  style={inputStyle}
                  value={row.violation_type}
                  onChange={(e) => handleRowChange(index, 'violation_type', e.target.value)}
                >
                  <option value="AR Violation">AR Violation</option>
                  <option value="Scanning Violation">Scanning Violation</option>
                  <option value="Disqualified Policy">Disqualified Policy</option>
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Category</label>
                <select
                  style={inputStyle}
                  value={row.violation_category}
                  onChange={(e) => handleRowChange(index, 'violation_category', e.target.value)}
                >
                  <option value="">Select Category</option>
                  {VIOLATION_CATEGORIES.map(opt => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Customer</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Customer"
                  value={row.client_name}
                  onChange={(e) => handleRowChange(index, 'client_name', e.target.value)}
                  required
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  {row.violation_type === 'Scanning Violation' ? 'Customer ID' : 'Policy Number'}
                </label>

                {row.violation_type === 'Scanning Violation' ? (
                  <input
                    style={inputStyle}
                    type="text"
                    placeholder="Customer ID"
                    value={row.customer_id}
                    onChange={(e) => handleRowChange(index, 'customer_id', e.target.value)}
                    required
                  />
                ) : (
                  <input
                    style={inputStyle}
                    type="text"
                    placeholder="Policy Number"
                    value={row.policy_number}
                    onChange={(e) => {
                      handleRowChange(index, 'policy_number', e.target.value);
                      handleRowChange(index, 'reference_id', e.target.value);
                    }}
                    required
                  />
                )}
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Variance</label>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  value={row.variance_amount}
                  onChange={(e) => handleRowChange(index, 'variance_amount', e.target.value)}
                  disabled={row.violation_type !== 'AR Violation'}
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Fee</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={row.fee_amount}
                  readOnly
                  disabled
                />
              </div>

              <div style={{ ...fieldStyle, gridColumn: 'span 2' }}>
                <label style={labelStyle}>Details</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Details..."
                  value={row.details}
                  onChange={(e) => handleRowChange(index, 'details', e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className={styles.removeButton}
                  disabled={!!violationToEdit}
                  style={{ height: 38, width: '100%' }}
                >
                  Remove
                </button>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              {row.isSearching && (
                <div style={{ padding: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
                  Searching possible EOD matches...
                </div>
              )}

              {row.match_results.length > 0 && !row.selected_match && (
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: 10,
                    boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
                    padding: 10,
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}
                >
                  <strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                    Possible Receipt Matches
                  </strong>

                  {row.match_results.map(match => (
                    <button
                      key={`${match.receipt_id}-${match.date_time}-${match.customer}`}
                      type="button"
                      onClick={() => selectMatch(index, match)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 12,
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        background: '#f9fafb',
                        marginBottom: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <strong>{match.customer || 'Unknown Customer'}</strong>
                      <br />
                      Receipt: {match.receipt_id || 'N/A'} | Rows grouped: {match.receipt_rows?.length || 1}
                      <br />
                      Date: {match.date_time || 'N/A'} | CSR: {match.csr || 'N/A'} | Office: {match.office || 'N/A'}
                      <br />
                      Policy: {match.receipt_policies?.join(', ') || match.policy || 'N/A'} | Customer ID: {match.customer_id || 'N/A'}
                      <br />
                      Receipt Total: ${Number(match.receipt_total || match.total || 0).toFixed(2)}
                      <br />
                      Type: {match.receipt_types?.join(', ') || match.type || 'N/A'}
                      <br />
                      Companies: {match.receipt_companies?.join(', ') || match.company || 'N/A'}
                      <br />
                      <small>Primary Sync Key: {match.sync_key}</small>
                    </button>
                  ))}
                </div>
              )}

              {row.selected_match && (
                <div style={{ padding: 12, background: '#e8f5e9', border: '1px solid #86efac', borderRadius: 10, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <strong>Matched Receipt Group</strong>
                      <br />
                      {row.selected_match.customer || 'Unknown Customer'} | Receipt: {row.selected_match.receipt_id || 'N/A'}
                      <br />
                      Total: ${Number(row.selected_match.receipt_total || row.selected_match.total || 0).toFixed(2)} | Type: {row.selected_match.receipt_types?.join(', ') || row.selected_match.type || 'N/A'}
                    </div>
                    <button
                      type="button"
                      onClick={() => clearMatch(index)}
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      Clear Match
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
          <button
            type="button"
            onClick={addRow}
            style={{
              height: 38,
              padding: '0 16px',
              borderRadius: 6,
              background: '#22c55e',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            disabled={!!violationToEdit}
          >
            + Add Another Row
          </button>

          <button
            type="submit"
            style={{
              height: 38,
              padding: '0 24px',
              borderRadius: 6,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save All Entries'}
          </button>
        </div>
      </form>

      <ListManagerModal
        isOpen={isOfficeModalOpen}
        onClose={() => setIsOfficeModalOpen(false)}
        title="Offices"
        items={officeList}
        onAddItem={addOffice}
        onDeleteItem={deleteOffice}
      />

      <ListManagerModal
        isOpen={isRegionModalOpen}
        onClose={() => setIsRegionModalOpen(false)}
        title="Regions"
        items={regionList}
        onAddItem={addRegion}
        onDeleteItem={deleteRegion}
      />
    </div>
  );
};

export default EnterViolation;
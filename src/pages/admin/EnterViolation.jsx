import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import styles from './EnterViolation.module.css';

// Reusable Modal Component for managing lists
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
                            <button onClick={() => onDeleteItem(item.id)} className={styles.deleteItemButton}>Delete</button>
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

const EnterViolation = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const violationToEdit = location.state?.violationToEdit;

    const [currentDate, setCurrentDate] = useState(new Date());
    const week = useMemo(() => getWeekRange(currentDate), [currentDate]);

    const initialRow = {
        id: Date.now(), agent_email: '', office_code: '', region: '', violation_type: 'AR Shortage', 
        client_name: '', reference_id: '', variance_amount: 0, fee_amount: 10, details: ''
    };

    const [rows, setRows] = useState([initialRow]);
    
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
            const { data: agents } = await supabase.from('profiles').select('email, full_name').order('full_name');
            setAgentList(agents || []);
            
            if (!violationToEdit && agents && agents.length > 0) {
                setRows(currentRows => [{...currentRows[0], agent_email: agents[0].email }]);
            }

            fetchOffices();
            fetchRegions();
        };
        fetchLists();
    }, [violationToEdit]);

    useEffect(() => {
        if (violationToEdit) {
            setRows([{ ...violationToEdit, id: violationToEdit.id }]);
            setCurrentDate(new Date(violationToEdit.week_start_date + 'T12:00:00'));
        }
    }, [violationToEdit]);

    const fetchOffices = async () => {
        const { data } = await supabase.from('offices').select('id, office_name').order('office_name');
        setOfficeList((data || []).map(o => ({ id: o.id, name: o.office_name })));
    };

    const fetchRegions = async () => {
        const { data } = await supabase.from('regions').select('id, region_name').order('region_name');
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

    const handleRowChange = (index, field, value) => {
        const newRows = [...rows];
        newRows[index][field] = value;

        if (field === 'violation_type') {
            newRows[index]['fee_amount'] = (value === 'AR Shortage') ? 10 : 25;
        }
        setRows(newRows);
    };

    const addRow = () => {
        setRows([...rows, {
            ...initialRow,
            id: Date.now(),
            agent_email: agentList.length > 0 ? agentList[0].email : '',
        }]);
    };

    const removeRow = (index) => setRows(rows.filter((_, i) => i !== index));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage('');
        setError('');
        const { data: { user } } = await supabase.auth.getUser();

        // Handle UPDATE logic if editing
        if (violationToEdit) {
            const rowToUpdate = rows[0];
            const { error: updateError } = await supabase
                .from('violations')
                .update({
                    agent_email: rowToUpdate.agent_email,
                    office_code: rowToUpdate.office_code,
                    region: rowToUpdate.region,
                    violation_type: rowToUpdate.violation_type,
                    week_start_date: week.start,
                    week_end_date: week.end,
                    variance_amount: rowToUpdate.violation_type === 'AR Shortage' ? rowToUpdate.variance_amount : 0,
                    fee_amount: rowToUpdate.fee_amount,
                    client_name: rowToUpdate.client_name,
                    reference_id: rowToUpdate.reference_id,
                    details: rowToUpdate.details,
                })
                .eq('id', violationToEdit.id);
            
            if (updateError) {
                setError(`Failed to update violation: ${updateError.message}`);
            } else {
                setMessage('Violation successfully updated!');
                setTimeout(() => navigate('/admin/violations'), 1500);
            }
            setIsSubmitting(false);
            return;
        }
        
        // Handle CREATE logic for new violations
        const violationsToInsert = [];
        for (const row of rows) {
            if (!row.agent_email || !row.client_name || !row.reference_id || !row.office_code) {
                setError('Please fill out all required fields for every row (Agent, Office, Client Name, Ref ID).');
                setIsSubmitting(false);
                return;
            }
            violationsToInsert.push({
                agent_email: row.agent_email,
                office_code: row.office_code,
                region: row.region,
                violation_type: row.violation_type,
                week_start_date: week.start,
                week_end_date: week.end,
                variance_amount: row.violation_type === 'AR Shortage' ? row.variance_amount : 0,
                fee_amount: row.fee_amount,
                client_name: row.client_name,
                reference_id: row.reference_id,
                details: row.details,
                manager_email: user?.email,
            });
        }
        
        const { error: insertError } = await supabase.from('violations').insert(violationsToInsert);

        if (insertError) {
            setError(`Failed to save violations: ${insertError.message}`);
        } else {
            setMessage('All violations successfully saved!');
            setRows([{ ...initialRow, agent_email: agentList.length > 0 ? agentList[0].email : '' }]);
        }
        setIsSubmitting(false);
    };

    const goToPreviousWeek = () => setCurrentDate(d => new Date(d.setDate(d.getDate() - 7)));
    const goToNextWeek = () => setCurrentDate(d => new Date(d.setDate(d.getDate() + 7)));

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <button onClick={() => navigate('/admin/violations')} className={styles.backButton}>
                    &larr; Back to Dashboard
                </button>
                <h2>{violationToEdit ? 'Edit Violation' : 'Enter New Violations'}</h2>
            </div>

            <form onSubmit={handleSubmit} className={styles.formCard}>
                <div className={styles.weekSelector}>
                    <button type="button" onClick={goToPreviousWeek}>&larr; Previous Week</button>
                    <h3>
                        Week of {new Date(week.start + 'T12:00:00').toLocaleDateString()} - {new Date(week.end + 'T12:00:00').toLocaleDateString()}
                    </h3>
                    <button type="button" onClick={goToNextWeek}>Next Week &rarr;</button>
                </div>

                <div className={styles.entryGrid}>
                    <div className={styles.gridHeader}>Agent</div>
                    <div className={styles.gridHeader}>
                        Office <button type="button" onClick={() => setIsOfficeModalOpen(true)} className={styles.editListButton}>Edit</button>
                    </div>
                    <div className={styles.gridHeader}>
                        Region <button type="button" onClick={() => setIsRegionModalOpen(true)} className={styles.editListButton}>Edit</button>
                    </div>
                    <div className={styles.gridHeader}>Violation Type</div>
                    <div className={styles.gridHeader}>Client Name</div>
                    <div className={styles.gridHeader}>Policy # / Ref ID</div>
                    <div className={styles.gridHeader}>Variance</div>
                    <div className={styles.gridHeader}>Fee</div>
                    <div className={styles.gridHeader}>Details</div>
                    <div className={styles.gridHeader}></div>

                    {rows.map((row, index) => (
                        <React.Fragment key={row.id}>
                            <select value={row.agent_email} onChange={(e) => handleRowChange(index, 'agent_email', e.target.value)}>
                                {agentList.map(agent => (
                                    <option key={agent.email} value={agent.email}>{agent.full_name || agent.email}</option>
                                ))}
                            </select>
                            <select value={row.office_code} onChange={(e) => handleRowChange(index, 'office_code', e.target.value)} required>
                                <option value="">Select Office</option>
                                {officeList.map(office => <option key={office.id} value={office.name}>{office.name}</option>)}
                            </select>
                            <select value={row.region} onChange={(e) => handleRowChange(index, 'region', e.target.value)}>
                                <option value="">Select Region</option>
                                {regionList.map(region => <option key={region.id} value={region.name}>{region.name}</option>)}
                            </select>
                            <select value={row.violation_type} onChange={(e) => handleRowChange(index, 'violation_type', e.target.value)}>
                                <option value="AR Shortage">AR Shortage</option>
                                <option value="Scanning Violation">Scanning Violation</option>
                            </select>
                            <input type="text" placeholder="Client Name" value={row.client_name} onChange={(e) => handleRowChange(index, 'client_name', e.target.value)} required />
                            <input type="text" placeholder="Policy # / Ref ID" value={row.reference_id} onChange={(e) => handleRowChange(index, 'reference_id', e.target.value)} required />
                            <input type="number" step="0.01" value={row.variance_amount} onChange={(e) => handleRowChange(index, 'variance_amount', e.target.value)} disabled={row.violation_type !== 'AR Shortage'} />
                            <input type="number" value={row.fee_amount} readOnly disabled className={styles.feeInput} />
                            <input type="text" placeholder="Details..." value={row.details} onChange={(e) => handleRowChange(index, 'details', e.target.value)} />
                            <button type="button" onClick={() => removeRow(index)} className={styles.removeButton} disabled={!!violationToEdit}>-</button>
                        </React.Fragment>
                    ))}
                </div>

                <div className={styles.actions}>
                    {!violationToEdit && (
                        <button type="button" onClick={addRow} className={styles.addButton}>+ Add Another Violation</button>
                    )}
                    <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
                        {isSubmitting ? 'Saving...' : (violationToEdit ? 'Update Violation' : 'Save All Violations')}
                    </button>
                </div>
                {message && <p className={styles.successMessage}>{message}</p>}
                {error && <p className={styles.errorMessage}>{error}</p>}
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
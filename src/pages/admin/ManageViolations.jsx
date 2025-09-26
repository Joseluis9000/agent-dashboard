import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import styles from './ManageViolations.module.css';

// Helper to get the start (Monday) and end (Sunday) of a given date's week
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

// **MODIFIED**: Added Actions column and passed down handlers
const ViolationTable = ({ title, violations, onStatusChange, agentNameMap, onEdit, onDelete }) => (
    <div className={styles.tableCard}>
        <h3>{title}</h3>
        <div className={styles.tableContainer}>
            <table>
                <thead>
                    <tr>
                        <th>Date Entered</th>
                        <th>Agent</th>
                        <th>Office</th>
                        <th>Region</th>
                        <th>Client / Policy</th>
                        <th>Details</th>
                        <th>Variance</th>
                        <th>Fee</th>
                        <th>Entered By</th>
                        <th>Status</th>
                        <th>Actions</th> {/* ✅ New Header */}
                    </tr>
                </thead>
                <tbody>
                    {violations.length > 0 ? violations.map(v => (
                        <tr key={v.id}>
                            <td>{new Date(v.created_at).toLocaleDateString()}</td>
                            <td>{agentNameMap[v.agent_email] || v.agent_email.split('@')[0]}</td>
                            <td>{v.office_code}</td>
                            <td>{v.region || 'N/A'}</td>
                            <td>
                                {v.client_name}
                                <span className={styles.refId}>{v.reference_id}</span>
                            </td>
                            <td>{v.details}</td>
                            <td>${(v.variance_amount || 0).toFixed(2)}</td>
                            <td>${(v.fee_amount || 0).toFixed(2)}</td>
                            <td>{v.manager_email ? v.manager_email.split('@')[0] : 'N/A'}</td>
                            <td>
                                <select 
                                    value={v.status} 
                                    onChange={(e) => onStatusChange(v.id, e.target.value)}
                                    className={`${styles.statusSelect} ${styles[v.status.toLowerCase()]}`}
                                >
                                    <option value="Pending">Pending</option>
                                    <option value="Charged">Charged</option>
                                    <option value="Voided">Voided</option>
                                </select>
                            </td>
                            {/* ✅ New Cell with Edit and Delete buttons */}
                            <td>
                                <div className={styles.actionButtons}>
                                    <button onClick={() => onEdit(v)} className={styles.editButton}>Edit</button>
                                    <button onClick={() => onDelete(v.id)} className={styles.deleteButton}>Delete</button>
                                </div>
                            </td>
                        </tr>
                    )) : (
                        <tr>
                            <td colSpan="11">No violations for this period.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

const ManageViolations = () => {
    const navigate = useNavigate();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [violations, setViolations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [agentNameMap, setAgentNameMap] = useState({});

    const week = useMemo(() => getWeekRange(currentDate), [currentDate]);

    useEffect(() => {
        const fetchAgentNames = async () => {
            const { data, error } = await supabase.from('profiles').select('email, full_name');
            if (error) { console.error("Error fetching agent names:", error); return; }
            const nameMap = data.reduce((acc, profile) => {
                acc[profile.email] = profile.full_name || profile.email;
                return acc;
            }, {});
            setAgentNameMap(nameMap);
        };
        fetchAgentNames();
    }, []);

    const fetchViolations = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('violations')
            .select('*')
            .eq('week_start_date', week.start)
            .order('created_at', { ascending: false });
        if (error) console.error('Error fetching violations:', error);
        else setViolations(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchViolations();
    }, [week]);

    const handleStatusChange = async (id, newStatus) => {
        const { error } = await supabase.from('violations').update({ status: newStatus }).eq('id', id);
        if (error) alert(`Error updating status: ${error.message}`);
        else fetchViolations(); 
    };

    // ✅ New handler for editing
    const handleEdit = (violationToEdit) => {
        navigate('/admin/enter-violation', { state: { violationToEdit } });
    };

    // ✅ New handler for deleting
    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this violation? This cannot be undone.')) {
            const { error } = await supabase.from('violations').delete().eq('id', id);
            if (error) {
                alert(`Error deleting violation: ${error.message}`);
            } else {
                fetchViolations(); // Refresh the list
            }
        }
    };

    const goToPreviousWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() - 7);
        setCurrentDate(newDate);
    };

    const goToNextWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 7);
        setCurrentDate(newDate);
    };

    const arViolations = violations.filter(v => v.violation_type === 'AR Shortage');
    const scanningViolations = violations.filter(v => v.violation_type === 'Scanning Violation');

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.dateNavigator}>
                    <button onClick={goToPreviousWeek}>&larr; Previous Week</button>
                    <h2>
                        Violations for {new Date(week.start + 'T12:00:00').toLocaleDateString()} - {new Date(week.end + 'T12:00:00').toLocaleDateString()}
                    </h2>
                    <button onClick={goToNextWeek}>Next Week &rarr;</button>
                </div>
                <button className={styles.newButton} onClick={() => navigate('/admin/enter-violation')}>
                    + Enter New Violation
                </button>
            </div>

            {loading ? <p>Loading...</p> : (
                <div className={styles.tablesGrid}>
                    <ViolationTable 
                        title="AR Shortages" 
                        violations={arViolations} 
                        onStatusChange={handleStatusChange} 
                        agentNameMap={agentNameMap} 
                        onEdit={handleEdit} 
                        onDelete={handleDelete} 
                    />
                    <ViolationTable 
                        title="Scanning Violations" 
                        violations={scanningViolations} 
                        onStatusChange={handleStatusChange} 
                        agentNameMap={agentNameMap} 
                        onEdit={handleEdit} 
                        onDelete={handleDelete}
                    />
                </div>
            )}
        </div>
    );
};

export default ManageViolations;
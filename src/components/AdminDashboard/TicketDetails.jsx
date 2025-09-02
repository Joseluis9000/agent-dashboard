// src/components/AdminDashboard/TicketDetails.jsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import styles from './AdminDashboard.module.css';

const TicketDetails = ({ ticket, onClose, onUpdate }) => {
    const [status, setStatus] = useState(ticket.status);
    const [assignedTo, setAssignedTo] = useState(ticket.assigned_to || '');
    const [note, setNote] = useState('');
    const [users, setUsers] = useState([]); // For Admins and Supervisors
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchUsers = async () => {
            const { data, error } = await supabase
                .from('WEBSITE LOGINS')
                .select('Email, Title')
                .in('Title', ['Admin', 'Supervisor']);

            if (!error) {
                setUsers(data.map(user => user.Email));
            }
        };
        fetchUsers();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        const updates = {
            status: status,
            assigned_to: assignedTo,
        };

        if (note.trim() !== '') {
            const user = localStorage.getItem('userName') || 'Admin';
            const timestamp = new Date().toLocaleString();
            updates.description = `${ticket.description}\n\n--- Note added by ${user} on ${timestamp} ---\n${note}`;
        }
        
        // --- KEY UPDATE ---
        // If the status is being changed TO 'Completed', set the timestamp AND who completed it.
        if (status === 'Completed' && ticket.status !== 'Completed') {
            updates.completed_at = new Date().toISOString();
            updates.completed_by = localStorage.getItem('userEmail'); // ✅ Records the completer's email
        }

        const { error } = await supabase
            .from('tickets')
            .update(updates)
            .eq('id', ticket.id);

        setIsSaving(false);
        if (error) {
            alert('Error updating ticket: ' + error.message);
        } else {
            onUpdate();
            onClose();
        }
    };

    return (
        <div>
            <div className={styles.detailGroup}>
                <label>Set Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option>New</option>
                    <option>In Progress</option>
                    <option>Pending (Needs Info)</option>
                    <option>On Hold</option>
                    <option>Completed</option>
                    <option>Cancelled</option>
                </select>
            </div>
            <div className={styles.detailGroup}>
                <label>Assign To...</label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                    <option value="">Unassigned</option>
                    {users.map(email => (
                        <option key={email} value={email}>{email}</option>
                    ))}
                </select>
            </div>
            <div className={styles.detailGroup}>
                <label>Add Note</label>
                <textarea 
                    rows="4" 
                    value={note} 
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a new note to the ticket history..."
                />
            </div>
            <div className={styles.modalActions}>
                <button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
};

export default TicketDetails;
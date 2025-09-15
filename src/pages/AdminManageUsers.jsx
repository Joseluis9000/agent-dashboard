import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
// REMOVED: AdminSidebar import is no longer needed in this file
import styles from './AdminManageUsers.module.css'; 
import CreateUserModal from '../components/Modals/CreateUserModal';

const AdminManageUsers = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        setError('');
        try {
            const { data, error } = await supabase.functions.invoke('manage-users', {
                body: { action: 'list_users' },
            });
            if (error) throw error;
            setUsers(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSendReset = async (email) => {
        if (!window.confirm(`Are you sure you want to send a password reset to ${email}?`)) return;
        setFeedback('');
        setError('');
        try {
            const { data, error } = await supabase.functions.invoke('manage-users', {
                body: { action: 'send_password_reset', payload: { email } },
            });
            if (error) throw error;
            setFeedback(data.message);
            setTimeout(() => setFeedback(''), 4000);
        } catch (err) {
            setError(err.message);
        }
    };
    
    const handleCreateUser = async (newUserData) => {
        setIsSaving(true);
        setError('');
        setFeedback('');
        try {
            const { data, error } = await supabase.functions.invoke('manage-users', {
                body: { action: 'create_user', payload: newUserData },
            });
            if (error) throw error;
            setFeedback(data.message);
            setIsModalOpen(false);
            fetchUsers();
            setTimeout(() => setFeedback(''), 4000);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteUser = async (userId, userEmail) => {
        if (!window.confirm(`Are you sure you want to permanently delete the user: ${userEmail}? This cannot be undone.`)) return;
        
        setError('');
        setFeedback('');
        try {
            const { data, error } = await supabase.functions.invoke('manage-users', {
                body: { action: 'delete_user', payload: { userId, userEmail } },
            });
            if (error) throw error;
            setFeedback(data.message);
            fetchUsers();
            setTimeout(() => setFeedback(''), 4000);
        } catch (err) {
            setError(err.message);
        }
    };

    // REMOVED: handleLogout is managed by the main layout, not this page

    return (
        <>
            {/* REMOVED: The outer div and the <AdminSidebar /> component */}
            <main className={styles.mainContent}>
                <div className={styles.pageHeader}>
                    <h1>Manage Users</h1>
                    <button onClick={() => setIsModalOpen(true)} className={styles.primaryButton}>
                        + Add User
                    </button>
                </div>

                {feedback && <div className={styles.feedback}>{feedback}</div>}
                {error && <div className={styles.error}>{error}</div>}

                <div className={styles.card}>
                    {loading ? <p>Loading users...</p> : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Email</th>
                                    <th>Name</th>
                                    <th>Role</th>
                                    <th>Region</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.id}>
                                        <td>{user.email}</td>
                                        <td>{user.user_metadata?.full_name || 'N/A'}</td>
                                        <td>{user.user_metadata?.role || 'N/A'}</td>
                                        <td>{user.user_metadata?.region || 'N/A'}</td>
                                        <td>
                                            <button 
                                                onClick={() => handleSendReset(user.email)}
                                                className={styles.actionButton}
                                            >
                                                Send Password Reset
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteUser(user.id, user.email)}
                                                className={styles.deleteButton}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>
            
            {isModalOpen && (
                <CreateUserModal
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleCreateUser}
                    loading={isSaving}
                />
            )}
        </>
    );
};

export default AdminManageUsers;
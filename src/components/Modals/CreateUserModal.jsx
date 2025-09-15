import React, { useState } from 'react';
import styles from './CreateUserModal.module.css';

const CreateUserModal = ({ onClose, onSave, loading }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState('agent');
    const [region, setRegion] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ email, password, name, role, region });
    };

    return (
        <div className={styles.modalBackdrop}>
            <div className={styles.modalContent}>
                <h2>Add New User</h2>
                <form onSubmit={handleSubmit}>
                    <div className={styles.inputGroup}>
                        <label>Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Full Name</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Role</label>
                        <select value={role} onChange={(e) => setRole(e.target.value)}>
                            <option value="agent">Agent</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="admin">Admin</option>
                            <option value="regional">Regional</option>
                        </select>
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Region (if applicable)</label>
                        <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} />
                    </div>
                    <div className={styles.buttonGroup}>
                        <button type="button" onClick={onClose} className={styles.cancelButton}>Cancel</button>
                        <button type="submit" className={styles.saveButton} disabled={loading}>
                            {loading ? 'Saving...' : 'Save User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateUserModal;
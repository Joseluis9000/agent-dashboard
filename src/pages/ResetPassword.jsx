// src/pages/ResetPassword.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import styles from './Login.module.css'; // Reusing the updated login styles

const ResetPassword = () => {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                if (!session) {
                    setError('Invalid or expired password recovery link.');
                }
            }
        });
        return () => subscription.unsubscribe();
    }, []);

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        const { error } = await supabase.auth.updateUser({
            password: password,
        });

        if (error) {
            setError(error.message);
        } else {
            setMessage('Your password has been reset successfully! Redirecting to login...');
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        }
        setLoading(false);
    };

    return (
        <div className={styles.loginContainer}>
            <img src="/G&P-.png" alt="Fiesta Logo" className={styles.logo} />
            <div className={styles.loginBox}>
                <h1>Reset Your Password</h1>
                <p>Enter your new password below.</p>
                <form onSubmit={handlePasswordUpdate}>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter new password"
                        required
                    />
                    
                    {message && <p className={styles.successText}>{message}</p>}
                    {error && <p className={styles.errorText}>{error}</p>}
                    
                    <button type="submit" className={styles.loginButton} disabled={loading || !!message}>
                        {loading ? 'Updating...' : 'Update Password'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ResetPassword;
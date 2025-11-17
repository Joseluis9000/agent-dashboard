// src/pages/ForgotPassword.jsx

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import styles from './Login.module.css'; // Reusing the updated login styles

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handlePasswordReset = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${window.location.origin}/reset-password?type=recovery`,
        });

        if (error) {
            setError(error.message);
        } else {
            setMessage('Password reset link has been sent. Please check your email.');
        }
        setLoading(false);
    };

    return (
        <div className={styles.loginContainer}>
            <img src="/G&P-.png" alt="Fiesta Logo" className={styles.logo} />
            <div className={styles.loginBox}>
                <h1>Forgot Password</h1>
                <p>Enter your email and we'll send you a link to reset your password.</p>
                <form onSubmit={handlePasswordReset}>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Your email address"
                        required
                    />
                    
                    {message && <p className={styles.successText}>{message}</p>}
                    {error && <p className={styles.errorText}>{error}</p>}
                    
                    <button type="submit" className={styles.loginButton} disabled={loading || !!message}>
                        {loading ? 'Sending...' : 'Send Reset Link'}
                    </button>
                    <Link to="/login" className={styles.backLink}>Back to Login</Link>
                </form>
            </div>
        </div>
    );
};

export default ForgotPassword;
// src/pages/ResetPassword.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import styles from './Login.module.css';

export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // 1) On mount, exchange the token in the URL for a session
  useEffect(() => {
    const init = async () => {
      try {
        const url = new URL(window.location.href);

        // Case A: new-style links use ?code=...
        const code = url.searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          setReady(true);
          return;
        }

        // Case B: older/hash style links: #...&type=recovery&access_token=...&refresh_token=...
        const hash = new URLSearchParams(window.location.hash.slice(1));
        if (hash.get('type') === 'recovery') {
          const access_token = hash.get('access_token');
          const refresh_token = hash.get('refresh_token');
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) throw error;
            setReady(true);
            return;
          }
        }

        // Fallback: if there’s already a session, allow reset
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          setReady(true);
          return;
        }

        throw new Error('Invalid or expired password recovery link.');
      } catch (e) {
        setError(e.message || 'Could not verify your reset link.');
      }
    };

    init();
  }, []);

  // 2) After we have a valid session, allow updating the password
  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (password.length < 8) {
      setLoading(false);
      return setError('Use at least 8 characters.');
    }
    if (password !== confirm) {
      setLoading(false);
      return setError('Passwords do not match.');
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMessage('Your password has been reset successfully! Redirecting to login…');
    setLoading(false);

    // Optional: ensure a clean login with new password
    // await supabase.auth.signOut();

    setTimeout(() => navigate('/login', { replace: true }), 2000);
  };

  if (error) {
    return (
      <div className={styles.loginContainer}>
        <img src="/G&P-.png" alt="Fiesta Logo" className={styles.logo} />
        <div className={styles.loginBox}>
          <h1>Reset Your Password</h1>
          <p className={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className={styles.loginContainer}>
        <img src="/G&P-.png" alt="Fiesta Logo" className={styles.logo} />
        <div className={styles.loginBox}>
          <h1>Reset Your Password</h1>
          <p>Verifying your reset link…</p>
        </div>
      </div>
    );
  }

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
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            required
          />

          {message && <p className={styles.successText}>{message}</p>}
          {error && <p className={styles.errorText}>{error}</p>}

          <button
            type="submit"
            className={styles.loginButton}
            disabled={loading || !!message}
          >
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

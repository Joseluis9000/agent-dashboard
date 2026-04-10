// src/pages/ResetPassword.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import styles from './Login.module.css';

export default function ResetPassword() {
  const navigate = useNavigate();

  const [verifying, setVerifying] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Only handle the "new style" recovery link (?code=...)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');

        if (code) {
          // 1) Exchange the one-time code for a short-lived recovery session
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          // 2) Remove the code from the address bar (avoid re-exchange on refresh)
          url.searchParams.delete('code');
          // Keep ?type=recovery if you passed it in redirectTo; not required though
          if (!url.searchParams.has('type')) {
            url.searchParams.set('type', 'recovery');
          }
          window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
        } else {
          // No code in URL — if a session already exists, allow reset; otherwise error
          const { data } = await supabase.auth.getSession();
          if (!data?.session) {
            throw new Error('This reset link is invalid or has expired. Please request a new one.');
          }
        }

        if (!cancelled) {
          setReady(true);
          setErr('');
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e.message || 'Could not verify your reset link.');
          setReady(false);
        }
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');

    if (password.length < 8) {
      setErr('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setErr(error.message ?? 'Failed to update password.');
      return;
    }

    setMsg('Password updated. Redirecting to sign in…');

    // Ensure a clean login with the new password
    await supabase.auth.signOut();
    setTimeout(() => navigate('/login', { replace: true }), 1200);
  };

  // UI states
  if (verifying) {
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

  if (err && !ready) {
    return (
      <div className={styles.loginContainer}>
        <img src="/G&P-.png" alt="Fiesta Logo" className={styles.logo} />
        <div className={styles.loginBox}>
          <h1>Reset Your Password</h1>
          <p className={styles.errorText}>{err}</p>
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

        <form onSubmit={onSubmit}>
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

          {msg && <p className={styles.successText}>{msg}</p>}
          {err && <p className={styles.errorText}>{err}</p>}

          <button
            type="submit"
            className={styles.loginButton}
            disabled={submitting || !!msg}
          >
            {submitting ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

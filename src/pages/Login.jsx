// src/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import styles from './Login.module.css';

const Login = () => {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper to detect if current visit is a password recovery flow
  const isRecoveryVisit = () => {
    try {
      const url = new URL(window.location.href);
      const hasCode = url.searchParams.has('code'); // new-style links add ?code=...
      const qsTypeRecovery = url.searchParams.get('type') === 'recovery';
      const hashTypeRecovery =
        new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';
      return hasCode || qsTypeRecovery || hashTypeRecovery;
    } catch {
      return false;
    }
  };

  // Redirect logic
  useEffect(() => {
    if (authLoading) return;

    // 🔒 If this visit is part of the recovery flow, always go to /reset-password
    if (isRecoveryVisit()) {
      const url = new URL(window.location.href);
      // Keep ?type=recovery for your reset page logic; keep any existing search/hash (esp. ?code= or legacy hash tokens)
      const search = url.search || '?type=recovery';
      const hash = url.hash || '';
      navigate(`/reset-password${search}${hash}`, { replace: true });
      return; // stop role-based redirects
    }

    // Normal signed-in redirect behavior
    if (!user) return;

    const role =
      profile?.role ||
      user?.user_metadata?.role ||
      'agent';

    switch (role) {
      case 'admin':
        navigate('/admin', { replace: true });
        break;
      case 'supervisor':
        navigate('/supervisor', { replace: true });
        break;
      case 'underwriter':
      case 'uw_manager':
        navigate('/uw', { replace: true });
        break;
      default:
        navigate('/dashboard', { replace: true });
    }
  }, [authLoading, user, profile?.role, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      // Redirect happens via the effect above once user/profile are set
    } catch (err) {
      setError(err.message || 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  // While AuthContext is determining the session/profile
  if (authLoading) {
    return (
      <div
        style={{
          padding: 12,
          fontFamily: 'monospace',
          background: '#fff',
          color: '#333',
        }}
      >
        Auth loading …
      </div>
    );
  }

  // If already signed in, our effect will redirect—BUT don't short-circuit during recovery visits
  if (user && !isRecoveryVisit()) return null;

  return (
    <div className={styles.loginContainer}>
      <img src="/G&P-.png" alt="Fiesta Logo" className={styles.logo} />
      <div className={styles.loginBox}>
        <h2>Login</h2>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
          />
          {error && <p className={styles.errorText}>{error}</p>}
          <button type="submit" className={styles.loginButton} disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
          <Link to="/forgot-password" className={styles.forgotLink}>
            Forgot your password?
          </Link>
        </form>
      </div>
    </div>
  );
};

export default Login;

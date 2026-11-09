import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { rememberPhotoEntry, clearPhotoEntry, isPhotoRecoveryVisit } from './photoEntryAuth';
import styles from './PhotoEntryLogin.module.css';

export default function PhotoEntryLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const requestInFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    if (isPhotoRecoveryVisit()) {
      clearPhotoEntry();
      navigate(`/reset-password${window.location.search || '?type=recovery'}${window.location.hash || ''}`, { replace: true });
    } else rememberPhotoEntry();
    return () => { active.current = false; };
  }, [navigate]);

  const handleSignIn = async (event) => {
    event.preventDefault();
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setError(''); setSubmitting(true);
    rememberPhotoEntry();
    try {
      // Same shared client, credentials and AuthProvider as the dashboard.
      // AppRoutes and PhotoEntryGate handle the signed-in destination/profile.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
    } catch (failure) {
      if (active.current) setError(failure.message || 'Sign-in failed. Check your email and password.');
    } finally {
      requestInFlight.current = false;
      if (active.current) setSubmitting(false);
    }
  };

  return <main className={styles.page}>
    <div className={styles.layout}>
      <section className={styles.intro} aria-labelledby="photo-login-title">
        <img className={styles.logo} src="/G&P-.png" alt="Fiesta Auto Insurance — Gaytan & Pineda" />
        <div className={styles.badge}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h4l2-3h4l2 3h4a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/></svg>AGENT PHOTO PORTAL</div>
        <h1 id="photo-login-title">Vehicle Photos</h1>
        <p className={styles.subtitle}>Sign in. Capture the vehicle.<br />Send the photos to underwriting.</p>
        <div className={styles.steps} aria-label="Photo entry steps"><span><b>1</b>Details</span><span><b>2</b>Photos</span><span><b>3</b>Review</span></div>
      </section>
      <section className={styles.card} aria-labelledby="sign-in-title">
        <span className={styles.eyebrow}>VEHICLE PHOTOS LOGIN</span>
        <h2 id="sign-in-title">Agent sign in</h2>
        <p className={styles.description}>Use your existing dashboard email and password. Your agent identity attaches to your photo uploads automatically.</p>
        <form onSubmit={handleSignIn}>
          <label htmlFor="photo-login-email">Email address</label>
          <input id="photo-login-email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} />
          <label htmlFor="photo-login-password">Password</label>
          <div className={styles.passwordField}>
            <input id="photo-login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} />
            <button type="button" className={styles.showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.submit} type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in to Vehicle Photos'}<span aria-hidden="true">→</span></button>
          <div className={styles.formLinks}><Link to="/forgot-password">Forgot your password?</Link></div>
        </form>
        <div className={styles.note}>Opens directly to the phone-friendly vehicle photo form.</div>
        <Link className={styles.dashboardLink} to="/login" onClick={clearPhotoEntry}>Looking for the regular dashboard? Sign in here</Link>
      </section>
    </div>
    <footer className={styles.footer}>Gaytan &amp; Pineda · Fiesta Auto Insurance &amp; Tax Services</footer>
  </main>;
}

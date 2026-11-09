import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../supabaseClient';
import { UploadPanel } from '../uw/VehiclePhotoLibrary';
import { getPhotoOffice } from './photoEntryAuth';
import styles from './AgentVehiclePhotos.module.css';

export default function AgentVehiclePhotos() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [entry, setEntry] = useState(0);
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const name = profile?.full_name || profile?.first_name || user?.user_metadata?.full_name || user?.email || 'Agent';
  useEffect(() => {
    let viewport = document.querySelector('meta[name="viewport"]');
    const existing = Boolean(viewport); const before = viewport?.getAttribute('content');
    if (!viewport) { viewport = document.createElement('meta'); viewport.name='viewport'; document.head.appendChild(viewport); }
    viewport.setAttribute('content','width=device-width, initial-scale=1, viewport-fit=cover');
    return () => { if (!existing) viewport.remove(); else if (before !== null) viewport.setAttribute('content',before); else viewport.removeAttribute('content'); };
  }, []);
  const logout = async () => {
    if (pending && !window.confirm('Some photos are not uploaded. A saved local draft stays on this device for your account; download a backup first if local saving failed. Sign out?')) return;
    setLeaving(true); setError('');
    try {
      if (typeof signOut === 'function') await signOut();
      else { const result = await supabase.auth.signOut(); if (result.error) throw result.error; }
      navigate('/photo-login',{replace:true});
    } catch (e) { setError(e.message || 'Could not sign out. Try again.'); setLeaving(false); }
  };
  if (!user) return null;
  return <div className={styles.shell}>
    <div className={styles.phone}>
      <header className={styles.header}>
        <img src="/fiesta-logo.png" alt="Fiesta Insurance" />
        <div><span className={styles.eyebrow}>AGENT PHOTO ENTRY</span><h1>Vehicle Photos</h1></div>
        <button type="button" disabled={leaving} onClick={logout}>{leaving ? 'Signing out…' : 'Sign out'}</button>
      </header>
      <section className={styles.identity} aria-label="Signed-in agent">
        <span className={styles.avatar} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
        <div><span>Signed in as</span><strong>{name}</strong><small>{user.email}</small></div>
        <span className={styles.office}>{getPhotoOffice(profile) || 'Agent'}</span>
      </section>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <main className={styles.content}>
        <UploadPanel key={`${user.id}-${entry}`} user={user} mobile initialOffice={getPhotoOffice(profile)}
          onPendingChange={setPending} onClose={() => { setPending(false); setEntry((value) => value+1); window.scrollTo?.({top:0,behavior:'smooth'}); }} onSaved={() => {}} />
      </main>
      <footer className={styles.footer}>G&amp;P · Fiesta Auto Insurance &amp; Tax Services</footer>
    </div>
  </div>;
}

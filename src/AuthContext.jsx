// src/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext({
  user: null,
  profile: null,
  role: 'agent',
  loading: true,
  hasRole: () => false,
  supabaseClient: supabase,
});

/** tiny helper to keep us from hanging forever */
function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`[AuthContext] ${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // toggle verbose logs in dev
  const debug = process.env.NODE_ENV !== 'production';

  // ---- initial session load ----
  useEffect(() => {
    let isMounted = true;

    const setSafe = (fn) => {
      if (isMounted) fn();
    };

    const fetchOrCreateProfile = async (sessUser) => {
      if (!sessUser?.id) {
        setSafe(() => setProfile(null));
        return;
      }

      try {
        let { data } = await withTimeout(
          supabase.from('profiles').select('id,email,full_name,role').eq('id', sessUser.id).maybeSingle(),
          1500, 'fetch profile by id'
        );

        if (!data) {
          const legacy = await withTimeout(
            supabase.from('profiles').select('id,email,full_name,role').eq('email', sessUser.email).maybeSingle(),
            1500, 'fetch profile by email'
          );
          if (!legacy.error && legacy.data) data = legacy.data;
        }

        if (!data) {
          if (debug) console.log('[AuthContext] no profile found; inserting default row');
          const insert = await withTimeout(
            supabase.from('profiles').insert({
              id: sessUser.id,
              email: sessUser.email,
              full_name: sessUser.user_metadata?.full_name ?? '',
              role: 'agent',
            }).select('id,email,full_name,role').single(),
            2000, 'insert profile'
          );
          if (!insert.error) data = insert.data;
        }

        setSafe(() => setProfile(data ?? null));
      } catch (e) {
        if (debug) console.warn('[AuthContext] profile fetch/insert failed or timed out (ignored):', e.message);
        setSafe(() => setProfile(null));
      }
    };

    const init = async () => {
      try {
        if (debug) console.log('[AuthContext] init… env present?', {
          url: !!process.env.REACT_APP_SUPABASE_URL,
          key: !!process.env.REACT_APP_SUPABASE_KEY,
        });

        const { data: { session } } = await withTimeout(supabase.auth.getSession(), 2000, 'getSession()');
        const sessUser = session?.user ?? null;
        if (debug) console.log('[AuthContext] getSession() → user:', sessUser?.email || null);

        setSafe(() => setUser(sessUser));
        if (sessUser?.email) localStorage.setItem('userEmail', sessUser.email);
        else localStorage.removeItem('userEmail');

        await fetchOrCreateProfile(sessUser);
      } catch (e) {
        if (debug) console.error('[AuthContext] init failed:', e.message);
        setSafe(() => { setUser(null); setProfile(null); });
      } finally {
        setSafe(() => {
          setLoading(false);
          if (debug) console.log('[AuthContext] init done, loading=false');
        });
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      const sessUser = session?.user ?? null;
      setUser(sessUser);
      if (debug) console.log('[AuthContext] onAuthStateChange:', _event, sessUser?.email || null);

      // 🔒 Force any recovery-created session to the reset page immediately
      if (_event === 'PASSWORD_RECOVERY') {
        const url = new URL(window.location.href);
        // Keep ?type=recovery in case your UI relies on it
        const search = url.search || '?type=recovery';
        // Preserve hash tokens if Supabase used the legacy hash format
        const hash = url.hash || '';
        if (window.location.pathname !== '/reset-password') {
          if (debug) console.log('[AuthContext] redirecting to /reset-password due to PASSWORD_RECOVERY');
          window.location.replace(`/reset-password${search}${hash}`);
          return; // prevent any subsequent redirects from other logic
        }
      }

      if (sessUser?.email) localStorage.setItem('userEmail', sessUser.email);
      else localStorage.removeItem('userEmail');

      fetchOrCreateProfile(sessUser);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe?.();
    };
  }, [debug]);

  const role = profile?.role || user?.user_metadata?.role || 'agent';

  const hasRole = useCallback((need) => (
    Array.isArray(need) ? need.includes(role) : role === need
  ), [role]);

  // ✅ include the client in context
  const value = useMemo(
    () => ({ user, profile, role, loading, hasRole, supabaseClient: supabase }),
    [user, profile, role, loading, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

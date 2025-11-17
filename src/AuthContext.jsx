// src/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext({
  user: null,
  profile: null,
  role: 'agent',
  loading: true,
  hasRole: () => false,
  supabaseClient: supabase,
  // new: expose signOut so the app / LockScreen can call it
  signOut: async () => {},
});

/** tiny helper to keep us from hanging forever */
function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`[AuthContext] ${label} timed out after ${ms}ms`)
          ),
        ms
      )
    ),
  ]);
}

/** 🔐 LocalStorage keys & timeout settings */
const LS_LAST_ACTIVITY = 'auth_last_activity';
const LS_SESSION_START = 'auth_session_start';
const LS_FORCE_LOGOUT = 'auth_force_logout';
const LS_SOFT_LOCK = 'auth_soft_lock'; // 👈 NEW

const IDLE_TIMEOUT_MS = 25 * 60 * 1000;        // 25 minutes of no activity → soft lock
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours max session

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // toggle verbose logs in dev
  const debug = process.env.NODE_ENV !== 'production';

  /** ✅ Centralized logout helper (used by timers & UI) */
  const signOut = useCallback(async () => {
    if (debug) console.log('[AuthContext] signOut called');

    try {
      await supabase.auth.signOut();
    } catch (e) {
      if (debug) console.warn('[AuthContext] supabase.signOut error:', e.message);
    } finally {
      setUser(null);
      setProfile(null);

      try {
        localStorage.removeItem('userEmail');
        localStorage.removeItem(LS_LAST_ACTIVITY);
        localStorage.removeItem(LS_SESSION_START);
        localStorage.removeItem(LS_SOFT_LOCK);
        // broadcast to other tabs
        localStorage.setItem(LS_FORCE_LOGOUT, String(Date.now()));
      } catch (e) {
        if (debug) console.warn('[AuthContext] localStorage cleanup failed:', e.message);
      }
    }
  }, [debug]);

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
          supabase
            .from('profiles')
            .select('id,email,full_name,role')
            .eq('id', sessUser.id)
            .maybeSingle(),
          1500,
          'fetch profile by id'
        );

        if (!data) {
          const legacy = await withTimeout(
            supabase
              .from('profiles')
              .select('id,email,full_name,role')
              .eq('email', sessUser.email)
              .maybeSingle(),
            1500,
            'fetch profile by email'
          );
          if (!legacy.error && legacy.data) data = legacy.data;
        }

        if (!data) {
          if (debug) console.log('[AuthContext] no profile found; inserting default row');
          const insert = await withTimeout(
            supabase
              .from('profiles')
              .insert({
                id: sessUser.id,
                email: sessUser.email,
                full_name: sessUser.user_metadata?.full_name ?? '',
                role: 'agent',
              })
              .select('id,email,full_name,role')
              .single(),
            2000,
            'insert profile'
          );
          if (!insert.error) data = insert.data;
        }

        setSafe(() => setProfile(data ?? null));
      } catch (e) {
        if (debug)
          console.warn(
            '[AuthContext] profile fetch/insert failed or timed out (ignored):',
            e.message
          );
        setSafe(() => setProfile(null));
      }
    };

    const init = async () => {
      try {
        if (debug)
          console.log('[AuthContext] init… env present?', {
            url: !!process.env.REACT_APP_SUPABASE_URL,
            key: !!process.env.REACT_APP_SUPABASE_KEY,
          });

        const {
          data: { session },
        } = await withTimeout(
          supabase.auth.getSession(),
          2000,
          'getSession()'
        );
        const sessUser = session?.user ?? null;
        if (debug)
          console.log(
            '[AuthContext] getSession() → user:',
            sessUser?.email || null
          );

        setSafe(() => setUser(sessUser));

        // track who was last logged in (optional but handy)
        if (sessUser?.email) localStorage.setItem('userEmail', sessUser.email);
        else localStorage.removeItem('userEmail');

        // initialize session timing on first load for existing sessions
        if (sessUser) {
          const now = Date.now();
          try {
            if (!localStorage.getItem(LS_SESSION_START)) {
              localStorage.setItem(LS_SESSION_START, String(now));
            }
            // ❌ don't reset LS_LAST_ACTIVITY here so stale sessions stay stale
          } catch (e) {
            if (debug) console.warn('[AuthContext] init timing storage failed:', e.message);
          }
        } else {
          // clear timing if no session
          try {
            localStorage.removeItem(LS_LAST_ACTIVITY);
            localStorage.removeItem(LS_SESSION_START);
            localStorage.removeItem(LS_SOFT_LOCK);
          } catch {}
        }

        await fetchOrCreateProfile(sessUser);
      } catch (e) {
        if (debug) console.error('[AuthContext] init failed:', e.message);
        setSafe(() => {
          setUser(null);
          setProfile(null);
        });
      } finally {
        setSafe(() => {
          setLoading(false);
          if (debug) console.log('[AuthContext] init done, loading=false');
        });
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      const sessUser = session?.user ?? null;
      setUser(sessUser);
      if (debug)
        console.log(
          '[AuthContext] onAuthStateChange:',
          _event,
          sessUser?.email || null
        );

      // 🔒 Force any recovery-created session to the reset page immediately
      if (_event === 'PASSWORD_RECOVERY') {
        const url = new URL(window.location.href);
        const search = url.search || '?type=recovery';
        const hash = url.hash || '';
        if (window.location.pathname !== '/reset-password') {
          if (debug)
            console.log(
              '[AuthContext] redirecting to /reset-password due to PASSWORD_RECOVERY'
            );
          window.location.replace(`/reset-password${search}${hash}`);
          return;
        }
      }

      // update last user email
      if (sessUser?.email) localStorage.setItem('userEmail', sessUser.email);
      else localStorage.removeItem('userEmail');

      // reset timing when auth state changes
      try {
        if (sessUser) {
          const now = Date.now();
          localStorage.setItem(LS_SESSION_START, String(now));
          localStorage.setItem(LS_LAST_ACTIVITY, String(now));
          localStorage.removeItem(LS_SOFT_LOCK);
        } else {
          localStorage.removeItem(LS_LAST_ACTIVITY);
          localStorage.removeItem(LS_SESSION_START);
          localStorage.removeItem(LS_SOFT_LOCK);
        }
      } catch (e) {
        if (debug) console.warn('[AuthContext] timing storage onAuthStateChange failed:', e.message);
      }

      fetchOrCreateProfile(sessUser);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe?.();
    };
  }, [debug, signOut]);

  /** 🕒 Auto-logout: idle → SOFT LOCK, absolute → HARD LOGOUT + cross-tab sync */
  useEffect(() => {
    // Always listen for forced logout from other tabs
    const handleStorage = (e) => {
      if (e.key === LS_FORCE_LOGOUT && e.newValue) {
        if (debug) console.log('[AuthContext] forced logout from other tab');
        signOut();
      }
    };
    window.addEventListener('storage', handleStorage);

    if (!user) {
      // no user => no idle timers
      return () => {
        window.removeEventListener('storage', handleStorage);
      };
    }

    if (debug) console.log('[AuthContext] setting up auto-logout timers');

    const markActive = () => {
  try {
    const now = Date.now();
    // Just update last activity – do NOT clear soft lock here
    localStorage.setItem(LS_LAST_ACTIVITY, String(now));
    // localStorage.removeItem(LS_SOFT_LOCK);  ❌ remove this line
  } catch (e) {
    if (debug) console.warn('[AuthContext] markActive storage failed:', e.message);
  }
};


    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach((evt) =>
      window.addEventListener(evt, markActive, { passive: true })
    );
    document.addEventListener('visibilitychange', markActive);

    let idleTimer = null;
    let absoluteTimer = null;
    let resyncInterval = null;

    const scheduleTimers = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (absoluteTimer) clearTimeout(absoluteTimer);

      const now = Date.now();
      let last = now;
      let start = now;

      try {
        const storedLast = Number(localStorage.getItem(LS_LAST_ACTIVITY) || now);
        const storedStart = Number(localStorage.getItem(LS_SESSION_START) || now);
        last = isNaN(storedLast) ? now : storedLast;
        start = isNaN(storedStart) ? now : storedStart;
      } catch {}

      const idleRemaining = IDLE_TIMEOUT_MS - (now - last);
      const absoluteRemaining = ABSOLUTE_TIMEOUT_MS - (now - start);

      if (debug) {
        console.log('[AuthContext] idleRemaining ms:', idleRemaining);
        console.log('[AuthContext] absoluteRemaining ms:', absoluteRemaining);
      }

      // 🕒 IDLE → set soft lock (no logout yet)
      if (idleRemaining <= 0) {
        if (debug) console.log('[AuthContext] idle timeout → soft lock flag');
        try {
          localStorage.setItem(LS_SOFT_LOCK, String(Date.now()));
        } catch {}
      } else {
        idleTimer = setTimeout(() => {
          if (debug) console.log('[AuthContext] idle timeout → soft lock flag');
          try {
            localStorage.setItem(LS_SOFT_LOCK, String(Date.now()));
          } catch {}
        }, idleRemaining);
      }

      // 🔒 ABSOLUTE → hard logout
      if (absoluteRemaining <= 0) {
        if (debug) console.log('[AuthContext] absolute timeout reached → signOut');
        signOut();
      } else {
        absoluteTimer = setTimeout(() => {
          if (debug) console.log('[AuthContext] absolute timeout reached → signOut');
          signOut();
        }, absoluteRemaining);
      }
    };

    // Initial schedule
    scheduleTimers();
    // Resync every 30s in case activity happened in another tab
    resyncInterval = setInterval(scheduleTimers, 30 * 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, markActive));
      document.removeEventListener('visibilitychange', markActive);
      if (idleTimer) clearTimeout(idleTimer);
      if (absoluteTimer) clearTimeout(absoluteTimer);
      if (resyncInterval) clearInterval(resyncInterval);
      window.removeEventListener('storage', handleStorage);
    };
  }, [user, signOut, debug]);

  const role = profile?.role || user?.user_metadata?.role || 'agent';

  const hasRole = useCallback(
    (need) => (Array.isArray(need) ? need.includes(role) : role === need),
    [role]
  );

  // ✅ include the client + signOut in context
  const value = useMemo(
    () => ({
      user,
      profile,
      role,
      loading,
      hasRole,
      supabaseClient: supabase,
      signOut, // <-- used by LockScreen + logout buttons
    }),
    [user, profile, role, loading, hasRole, signOut]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

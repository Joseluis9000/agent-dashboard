// src/App.jsx
import React, { useEffect, useState } from 'react';
// ⛔️ REMOVED 'BrowserRouter as Router' FROM THIS IMPORT
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { APP_VERSION } from './version'; // 🔁 version for auto-update

// Components
import ProtectedRoute from './components/ProtectedRoute';

// Layouts
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';
import SupervisorLayout from './layouts/SupervisorLayout';
import UnderwriterLayout from './layouts/UnderwriterLayout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SVARPage from './pages/SVARPage';
import DisqualifiedPolicies from './pages/DisqualifiedPolicies';
import TicketingSystem from './pages/TicketingSystem';
import AdminDashboard from './pages/AdminDashboard';
import AdminTickets from './pages/AdminTickets';
import SupervisorDashboard from './pages/SupervisorDashboard';
import OfficeNumbers from './pages/OfficeNumbers';
import SupervisorTickets from './pages/SupervisorTickets';
import EODReport from './pages/EODReport';
import EODHistory from './pages/EODHistory';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminManageUsers from './pages/AdminManageUsers';
import EnterViolation from './pages/admin/EnterViolation';
import ManageViolations from './pages/admin/ManageViolations';
import AgentViolations from './pages/AgentViolations';

// Underwriting pages
import UnderwritingSubmit from './pages/agent/UnderwritingSubmit';
import UnderwritingDashboard from './pages/uw/UnderwritingDashboard';
import UnderwritingLog from './pages/uw/UnderwritingLog';
import PendingUnderwriting from './pages/uw/PendingUnderwriting';

// Admin EODs
import OfficeEODs from './components/OfficeEODs';

/** 🔐 Lock / idle settings – keep in sync with AuthContext */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes idle → soft lock
const LS_LAST_ACTIVITY = 'auth_last_activity';
const LS_SOFT_LOCK = 'auth_soft_lock';

// ⏳ How long the lock screen waits before auto-logout
const LOCKSCREEN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes on lock screen before auto-logout

/**
 * Simple lock screen that shows when:
 * - There *is* a user/session
 * - And either:
 *    - The idle timer set a soft lock flag, or
 *    - Their last activity is older than IDLE_TIMEOUT_MS (stale cookies / next day)
 *
 * This protects you from the “new agent opens browser and sees previous
 * agent’s dashboard immediately” problem, and gives a “still using this?”
 * prompt before full logout.
 */
function LockScreen({ onContinue }) {
  const { user, signOut, supabaseClient } = useAuth();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [remainingMs, setRemainingMs] = useState(LOCKSCREEN_TIMEOUT_MS);

  // ⏳ Start a countdown when the lock screen appears
  useEffect(() => {
    const startedAt = Date.now();

    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const left = LOCKSCREEN_TIMEOUT_MS - elapsed;

      if (left <= 0) {
        clearInterval(intervalId);
        // Time's up → hard logout
        signOut();
      } else {
        setRemainingMs(left);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [signOut]);

  const handleSwitchUser = async () => {
    await signOut(); // will redirect them back to login via your existing logic
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const email = user?.email || user?.user_metadata?.email;

    if (!email) {
      setError('Cannot determine user email. Please switch user and log in again.');
      return;
    }

    try {
      setSubmitting(true);

      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.error('[LockScreen] re-auth error:', signInError);
        setError('Incorrect password. Please try again.');
        return;
      }

      // ✅ Password is correct → refresh activity + clear soft lock + unlock UI
      const now = Date.now();
      try {
        localStorage.setItem(LS_LAST_ACTIVITY, String(now));
        localStorage.removeItem(LS_SOFT_LOCK);
      } catch {
        // ignore
      }

      setPassword('');
      onContinue(); // just sets showLock(false) in AppRoutes
    } catch (err) {
      console.error('[LockScreen] unexpected re-auth error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const label =
    user?.email ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.email ||
    'agent';

  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6 space-y-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Screen Locked</h1>
          <p className="text-gray-600">
            Signed in as <strong>{label}</strong>
          </p>
          <p className="text-sm text-gray-500">
            For shared desks, please confirm it&apos;s you by entering your password,
            or switch user.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="space-y-2">
            <button
              type="submit"
              disabled={!password || submitting}
              className="w-full rounded-xl bg-black text-white py-2 disabled:opacity-60"
            >
              {submitting ? 'Checking…' : 'Continue as this user'}
            </button>
            <button
              type="button"
              onClick={handleSwitchUser}
              disabled={submitting}
              className="w-full rounded-xl border py-2"
            >
              Switch User
            </button>
          </div>
        </form>

        <p className="text-xs text-gray-500 text-center">
          You will be logged out automatically in <strong>{minutes}:{seconds}</strong>{' '}
          if you don&apos;t unlock this session.
        </p>

        <p className="text-[11px] text-gray-400 text-center mt-1">
          If someone closes the browser without logging out, the next person
          will see this lock screen first before accessing the dashboard.
        </p>
      </div>
    </div>
  );
}

// This component contains all your original routing logic.
function AppRoutes() {
  const { user, profile, loading } = useAuth();
  const [showLock, setShowLock] = useState(false);

  // 🔁 Version check: reload tab if a new deploy is available
  const checkVersion = async () => {
    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (!res.ok) return;

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return;

      const data = await res.json();
      const serverVersion = data?.version;

      if (serverVersion && serverVersion !== APP_VERSION) {
        // 🛡️ Safety Breaker: Check if we already tried to reload for this specific version
        const lastAttempt = localStorage.getItem('update_attempt_version');

        if (lastAttempt !== serverVersion) {
          // First time detecting this mismatch? Try reloading to sync.
          console.log(`Version mismatch detected (Server: ${serverVersion} vs App: ${APP_VERSION}). Reloading...`);
          localStorage.setItem('update_attempt_version', serverVersion);
          window.location.reload();
        } else {
          // We already reloaded and they STILL don't match? Stop the loop.
          console.warn(`Auto-update loop detected. Staying on App version ${APP_VERSION} despite Server saying ${serverVersion}.`);
        }
      } else {
        // Versions match! Clear the safety flag so future updates work normally.
        localStorage.removeItem('update_attempt_version');
      }
    } catch (e) {
      // quiet in dev
    }
  };

  // 🆕 Auto-update version check (runs immediately + every 5 min)
  useEffect(() => {
    checkVersion(); // run immediately

    const interval = setInterval(checkVersion, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);


  // 🔐 Decide if we should show the lock screen when a session exists
  //    Poll localStorage every second while a user is logged in.
  useEffect(() => {
    if (!user) {
      setShowLock(false);
      return;
    }

    const checkLockState = () => {
      try {
        const now = Date.now();

        const rawLast = localStorage.getItem(LS_LAST_ACTIVITY);
        const last = Number(rawLast || 0);

        const rawSoft = localStorage.getItem(LS_SOFT_LOCK);
        const hasSoftLock = !!rawSoft;

        let shouldLock = false;

        // 1) If soft lock flag is set (idle triggered), always lock
        if (hasSoftLock) {
          shouldLock = true;
        }

        // 2) If last activity is stale, auto-soft-lock & show lock screen
        if (!shouldLock && last) {
          const diff = now - last;
          const isStale = diff > IDLE_TIMEOUT_MS;
          if (isStale) {
            shouldLock = true;
            // ensure soft lock flag is set for consistency
            localStorage.setItem(LS_SOFT_LOCK, String(now));
          }
        }

        setShowLock(shouldLock);
      } catch (e) {
        console.warn('[App] lock screen check failed:', e?.message || e);
      }
    };

    // Run immediately once
    checkLockState();
    // Then poll every second
    const intervalId = setInterval(checkLockState, 1000);

    return () => clearInterval(intervalId);
  }, [user]);

  if (loading) return <div>Loading session...</div>;

  const getHomeRoute = () => {
    if (!user || !profile) return '/login';
    const role = profile.role || 'agent';
    switch (role) {
      case 'admin':
        return '/admin';
      case 'supervisor':
        return '/supervisor';
      case 'underwriter':
      case 'uw_manager':
        return '/uw';
      case 'agent':
      default:
        return '/dashboard';
    }
  };

  // 🔐 Gate: if the session is locked, show LockScreen instead of routes
  if (user && showLock) {
    return <LockScreen onContinue={() => setShowLock(false)} />;
  }

  // ⛔️ REMOVED THE <Router> WRAPPER FROM AROUND <Routes>
  return (
    <Routes>
      {/* PUBLIC */}
      <Route
        path="/login"
        element={!user ? <Login /> : <Navigate to={getHomeRoute()} replace />}
      />
      <Route
        path="/forgot-password"
        element={!user ? <ForgotPassword /> : <Navigate to={getHomeRoute()} replace />}
      />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* 🔐 Explicit route for the lock screen (optional but handy) */}
      <Route
        path="/locked"
        element={
          user ? (
            <LockScreen onContinue={() => setShowLock(false)} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route path="/" element={<Navigate to={getHomeRoute()} replace />} />

      {/* PROTECTED: Agent area */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/sv-ar" element={<SVARPage />} />
          <Route path="/disqualified-policies" element={<DisqualifiedPolicies />} />
          <Route path="/ticketing-system" element={<TicketingSystem />} />
          <Route path="/eod-report" element={<EODReport />} />
          <Route path="/office-eods" element={<EODHistory />} />
          <Route path="/agent/violations" element={<AgentViolations />} />
          <Route path="/uw/submit" element={<UnderwritingSubmit />} />
        </Route>
      </Route>

      {/* PROTECTED: Underwriter area */}
      <Route
        element={
          <ProtectedRoute
            allowedRoles={['underwriter', 'uw_manager', 'supervisor', 'admin']}
          />
        }
      >
        <Route path="/uw" element={<UnderwriterLayout />}>
          <Route index element={<UnderwritingDashboard />} />
          <Route path="dashboard" element={<UnderwritingDashboard />} />
          <Route path="pending" element={<PendingUnderwriting />} />
          <Route path="log" element={<UnderwritingLog />} />
        </Route>
      </Route>

      {/* PROTECTED: Supervisor area */}
      <Route element={<ProtectedRoute allowedRoles={['supervisor', 'admin']} />}>
        <Route path="/supervisor" element={<SupervisorLayout />}>
          <Route index element={<SupervisorDashboard />} />
          <Route path="office-numbers" element={<OfficeNumbers />} />
          <Route path="tickets" element={<SupervisorTickets />} />
        </Route>
      </Route>

      {/* PROTECTED: Admin area */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="tickets" element={<AdminTickets />} />
          <Route path="office-numbers" element={<OfficeNumbers />} />
          <Route path="manage-users" element={<AdminManageUsers />} />
          <Route path="violations" element={<ManageViolations />} />
          <Route path="enter-violation" element={<EnterViolation />} />
          <Route path="office-eods" element={<OfficeEODs />} />
          <Route path="office-eods/:reportId" element={<OfficeEODs />} />
        </Route>
      </Route>

      {/* 404 */}
      <Route path="*" element={<div>404 - Page Not Found</div>} />
    </Routes>
  );
}

// The main App component now correctly wraps everything in the AuthProvider.
function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;

// src/components/LockScreen.jsx
import React, { useState } from 'react';
import { useAuth } from '../AuthContext';

// ⚠️ Keep these in sync with App.jsx & AuthContext
const LS_LAST_ACTIVITY = 'auth_last_activity';
const LS_SOFT_LOCK = 'auth_soft_lock';

const LockScreen = ({ onContinue }) => {
  const { user, signOut, supabaseClient } = useAuth();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSwitchUser = async () => {
    await signOut(); // AuthContext signOut will clear Supabase + localStorage
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const email =
      user?.email ||
      user?.user_metadata?.email;

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

      const now = Date.now();
      try {
        localStorage.setItem(LS_LAST_ACTIVITY, String(now));
        localStorage.removeItem(LS_SOFT_LOCK);
      } catch {
        // ignore storage errors
      }

      setPassword('');
      onContinue?.();
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
          If someone closes the browser without logging out, the next person
          will see this lock screen first before accessing the dashboard.
        </p>
      </div>
    </div>
  );
};

export default LockScreen;

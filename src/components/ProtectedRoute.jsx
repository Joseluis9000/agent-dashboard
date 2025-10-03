// src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function ProtectedRoute({ allowedRoles }) {
  const { user, profile, loading } = useAuth();

  // While Auth is loading, render nothing (or a small spinner)
  if (loading) return null;

  // Not signed in? -> Login
  if (!user) return <Navigate to="/login" replace />;

  // If specific roles are required, enforce them
  if (allowedRoles && !allowedRoles.includes(profile?.role)) {
    return <Navigate to="/" replace />;
  }

  // All good — render nested routes
  return <Outlet />;
}

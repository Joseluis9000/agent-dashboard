// src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { canAccess, featureForPath, officeLevel } from '../utils/adminPermissions';

export default function ProtectedRoute({ allowedRoles }) {
  const { user, profile, loading } = useAuth();
  const { pathname } = useLocation();

  // Preserve the original authentication and role checks.
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(profile?.role)) {
    return <Navigate to="/" replace />;
  }

  // Apply feature permissions to admin pages even when a route allows
  // multiple roles. Do not apply admin permissions to non-admin routes.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (profile?.role === 'admin') {
      const feature = featureForPath(pathname);
      if (feature && !canAccess(profile?.permissions, feature)) {
        return <Navigate to="/admin" replace />;
      }

      // Directory-only office users may visit the office directory,
      // but cannot open individual office management pages.
      if (
        pathname.startsWith('/admin/offices/') &&
        officeLevel(profile?.permissions) !== 'full'
      ) {
        return <Navigate to="/admin/offices" replace />;
      }
    }
  }

  return <Outlet />;
}

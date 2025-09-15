import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext'; // ✅ 1. Import our new hook

const ProtectedRoute = ({ children, allowedRoles }) => {
    // 2. Get the user and loading state from the global context
    const { user, loading } = useAuth();

    // While the context is loading the session, show a loading message
    if (loading) {
        return <div>Loading...</div>;
    }

    // If loading is done and there is no user, redirect to login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // If roles are required, check them against the user's metadata
    if (allowedRoles) {
        const userRole = user.user_metadata?.role; 
        if (!userRole || !allowedRoles.includes(userRole)) {
            return <Navigate to="/dashboard" replace />; 
        }
    }

    // If all checks pass, render the page
    return children;
};

export default ProtectedRoute;
// src/components/ProtectedRoute.jsx

import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../supabaseClient'; // Make sure this path is correct

const ProtectedRoute = ({ children, allowedRoles }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            // This fetches the current user session from Supabase's secure storage
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            setLoading(false);
        };
        fetchUser();
    }, []);

    // 1. While we're checking for a user, show a loading message
    if (loading) {
        return <div>Loading...</div>; // Or a loading spinner component
    }

    // 2. If no user is logged in, redirect to the login page
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // 3. If roles are specified, check if the user has one of the allowed roles
    if (allowedRoles) {
        // This assumes your role is stored in user_metadata.role
        const userRole = user.user_metadata?.role; 
        if (!userRole || !allowedRoles.includes(userRole)) {
            // If the user's role is not allowed, redirect them to a safe page
            return <Navigate to="/dashboard" replace />; 
        }
    }

    // 4. If all checks pass, render the component
    return children;
};

export default ProtectedRoute;
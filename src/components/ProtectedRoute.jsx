// src/components/ProtectedRoute.jsx

import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children, allowedRoles }) => {
    const userRole = localStorage.getItem('userRole');

    // Check if the user's role is in the list of allowed roles
    if (userRole && allowedRoles.includes(userRole)) {
        return children; // If yes, render the component they are trying to access
    }

    // If no, redirect them to the login page
    return <Navigate to="/login" replace />;
};

export default ProtectedRoute;
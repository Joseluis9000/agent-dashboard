// src/pages/TicketingSystem.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom'; // 1. Import useNavigate

const TicketingSystem = () => {
    const navigate = useNavigate(); // 2. Initialize the navigate function

    // 3. Create a function to handle the back navigation
    const handleBack = () => {
        navigate(-1); // -1 tells the router to go back one page in history
    };

    return (
        <div style={{ 
            padding: '2rem', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '80vh',
            flexDirection: 'column'
        }}>
            <h1 style={{ color: '#2c3e50' }}>Feature Coming Soon</h1>
            <p style={{ color: '#34495e', fontSize: '1.2rem', textAlign: 'center', maxWidth: '500px' }}>
                The agent ticketing system is currently under development and will be available at a later date.
            </p>
            
            {/* 4. Add the button to the page */}
            <button 
                onClick={handleBack}
                style={{
                    marginTop: '2rem',
                    padding: '12px 25px',
                    fontSize: '1rem',
                    color: 'white',
                    backgroundColor: '#34495e',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer'
                }}
            >
                Back
            </button>
        </div>
    );
};

export default TicketingSystem;
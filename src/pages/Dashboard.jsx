// src/pages/Dashboard.jsx

import React from 'react';
import { useAuth } from '../AuthContext'; // Import the useAuth hook
import styles from './DashboardPlaceholder.module.css'; // We'll create this new CSS file

function Dashboard() {
    const { user } = useAuth(); // Get the user from our global context

    // Get the agent's first name from the secure user metadata
    const agentFirstName = user?.user_metadata?.full_name?.split(" ")[0] || 'Agent';

    return (
        <main className={styles.mainContent}>
            <div className={styles.placeholderCard}>
                <div className={styles.icon}>🚧</div>
                <h1>Welcome, {agentFirstName}!</h1>
                <h2>Dashboard Under Construction</h2>
                <p>
                    This page is currently being upgraded to our new, faster Supabase data system. 
                    Please check back soon for updated commission and violation data.
                </p>
                <p>
                    In the meantime, other features like the EOD Report and Ticketing System are fully functional.
                </p>
            </div>
        </main>
    );
}

export default Dashboard;
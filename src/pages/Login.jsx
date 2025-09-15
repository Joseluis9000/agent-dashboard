// src/pages/Login.jsx

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom'; // ✅ 1. Import Link
import { supabase } from '../supabaseClient';
import styles from './Login.module.css';

const Login = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                throw error;
            }

            if (data.user) {
                const role = data.user.user_metadata?.role;

                if (role === "admin") {
                    navigate('/admin');
                } else if (role === "supervisor") {
                    navigate('/supervisor');
                } else if (role === "regional") {
                    navigate('/regional-dashboard');
                } else {
                    navigate('/dashboard');
                }
            }
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.loginContainer}>
            <img src="/G&P-.png" alt="Fiesta Logo" className={styles.logo} />
            <div className={styles.loginBox}>
                <h2>Login</h2>
                <form onSubmit={handleLogin}>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        required
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                    />
                    
                    {error && <p className={styles.errorText}>{error}</p>}
                    
                    <button type="submit" className={styles.loginButton} disabled={loading}>
                        {loading ? "Logging in..." : "Login"}
                    </button>

                    {/* ✅ 2. ADD THIS LINK */}
                    <Link to="/forgot-password" className={styles.forgotLink}>
                        Forgot your password?
                    </Link>

                </form>
            </div>
        </div>
    );
};

export default Login;
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext'; // Get user and loading state from context
import styles from './Login.module.css';

const Login = () => {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth(); // Use the global loading state

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // This effect now safely handles redirects
    useEffect(() => {
        // Only redirect if the initial auth check is done AND there is a user
        if (!authLoading && user) {
            const role = user.user_metadata?.role;
            if (role === "admin") {
                navigate('/admin/manage-users');
            } else if (role === "supervisor") {
                navigate('/supervisor');
            } else {
                navigate('/dashboard');
            }
        }
    }, [user, authLoading, navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });
            if (error) throw error;
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };
    
    // While the AuthProvider is checking for a session, show a loading screen
    if (authLoading) {
        return <div>Loading...</div>;
    }

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
                    <Link to="/forgot-password" className={styles.forgotLink}>
                        Forgot your password?
                    </Link>
                </form>
            </div>
        </div>
    );
};

export default Login;
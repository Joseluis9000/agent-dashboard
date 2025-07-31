// src/pages/Login.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // ✅ YOUR LOGIN HANDLER SCRIPT URL
  const loginScriptUrl = 'https://script.google.com/macros/s/AKfycbyTJiYTFun9DOC3O0yOr_NeCVIKs3EHlyymdyjATbb775PsYENxxphNVy-IANVYHsjU/exec';

  const handleLogin = async () => {
    if (!email.includes('@')) {
      alert('Please enter a valid email');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(loginScriptUrl, {
        method: 'POST',
        // ✅ USE TEXT/PLAIN CONTENT TYPE FOR RELIABILITY
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.status === 'success') {
        localStorage.setItem('userEmail', email);
        localStorage.setItem('role', data.role || '');
        localStorage.setItem('userName', data.name || '');
        localStorage.setItem('region', data.region || '');
        
        if (data.role === "regional") {
          navigate('/regional-dashboard');
        } else {
          navigate('/dashboard');
        }

      } else {
        alert(data.message || 'Invalid email or password');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('There was an error logging in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "#d71920", flexDirection: "column" }}>
      <img
        src="/G&P-.png"
        alt="Fiesta Logo"
        style={{
          width: "550px",
          maxWidth: "90%",
          marginBottom: "20px"
        }}
      />

      <div style={{ backgroundColor: "#fff", padding: "30px", borderRadius: "8px", boxShadow: "0 2px 8px rgba(0,0,0,0.2)", width: "300px" }}>
        <h2 style={{ textAlign: "center", color: "#d71920", marginBottom: "20px" }}>Agent Login</h2>

        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          style={{ width: "100%", padding: "10px", marginBottom: "10px", borderRadius: "4px", border: "1px solid #ccc" }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={{ width: "100%", padding: "10px", marginBottom: "20px", borderRadius: "4px", border: "1px solid #ccc" }}
        />
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{ width: "100%", padding: "10px", backgroundColor: loading ? "#999" : "#d71920", color: "#fff", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </div>
    </div>
  );
}

export default Login;
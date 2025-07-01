import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const response = await fetch('https://us-central1-optimal-comfort-464220-t1.cloudfunctions.net/loginHandler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('userEmail', email);
        localStorage.setItem('role', data.role || '');
        localStorage.setItem('managerName', data.managerName || '');
        localStorage.setItem('region', data.region || '');
        localStorage.setItem('region2', data.region2 || '');
        navigate('/dashboard');
      } else {
        alert('Invalid email or password');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('There was an error logging in');
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
          style={{ width: "100%", padding: "10px", backgroundColor: "#d71920", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
        >
          Login
        </button>
      </div>
    </div>
  );
}

export default Login;


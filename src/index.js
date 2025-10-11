// src/index.js

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// ✅ Import BrowserRouter here
import { BrowserRouter } from 'react-router-dom';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/* ✅ BrowserRouter must wrap your entire App */}
    <BrowserRouter>
      {/* ⛔️ Do not put <AuthProvider> here. It lives inside App.jsx */}
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // ✅ keep your main app CSS
import App from './App';

// ✅ Import BrowserRouter here
import { BrowserRouter } from 'react-router-dom';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/* ✅ BrowserRouter wraps the entire App */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);


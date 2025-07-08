// src/components/RegionalDashboard/BarChart.jsx

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import styles from './RegionalDashboard.module.css';

// ✅ UPDATED: Made the component more generic with props
const MonthlyBarChart = ({ title, data, dataKey, fillColor, yAxisFormatter }) => {

  return (
    <div className={styles.card}>
      <h2>{title}</h2>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={yAxisFormatter} />
            <Tooltip formatter={yAxisFormatter} />
            <Legend />
            <Bar dataKey={dataKey} fill={fillColor} name={dataKey} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MonthlyBarChart;
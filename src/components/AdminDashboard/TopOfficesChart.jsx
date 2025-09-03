// src/components/AdminDashboard/TopOfficesChart.jsx

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
// ✅ Corrected path to use the AdminDashboard stylesheet
import styles from './AdminDashboard.module.css'; 

const TopOfficesChart = ({ data }) => {
    return (
        <div className={styles.chartContainer}>
            <h3>Top 5 Offices by Premium</h3>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#34495e" />
                    <XAxis dataKey="office" stroke="#ecf0f1" />
                    <YAxis stroke="#ecf0f1" />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#2c3e50', border: '1px solid #34495e' }} 
                        itemStyle={{ color: '#ecf0f1' }}
                    />
                    <Bar dataKey="total_premium" fill="#3498db" name="Total Premium" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default TopOfficesChart;
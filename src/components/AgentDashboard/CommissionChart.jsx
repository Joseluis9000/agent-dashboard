// src/components/AgentDashboard/CommissionChart.jsx

import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import styles from './Dashboard.module.css';

Chart.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const formatCurrency = (value) => `$${Number(value || 0).toLocaleString()}`;

const CommissionChart = ({ historyData }) => {
  if (!historyData || historyData.length === 0) {
    return (
      <div className={styles.card}>
        <h3>📈 Commission History</h3>
        <p>No commission history found.</p>
      </div>
    );
  }

  const chartLabels = historyData.map(item =>
    `${item.week_start_date.split('T')[0]}`
  );
  const chartValues = historyData.map(item =>
    Number(item.commissionafterarfeescanningviolations) || 0
  );
  const totalYTD = chartValues.reduce((a, b) => a + b, 0);

  const chartData = {
    labels: chartLabels,
    datasets: [{
      label: 'Commission ($)',
      data: chartValues,
      backgroundColor: 'rgba(211, 47, 47, 0.7)',
      borderColor: '#d32f2f',
      borderWidth: 1,
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `Commission: ${formatCurrency(context.raw)}`
        }
      }
    },
    scales: {
        y: {
            ticks: {
                callback: (value) => formatCurrency(value)
            }
        }
    }
  };

  return (
    <div className={styles.card}>
      <h3>📈 Commission History</h3>
      <div className={styles.chartContainer}>
        <Bar data={chartData} options={chartOptions} />
      </div>
      <p className={styles.ytdTotal}>
        Total YTD: {formatCurrency(totalYTD)}
      </p>
    </div>
  );
};

export default CommissionChart;
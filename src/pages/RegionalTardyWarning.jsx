import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/RegionalDashboard/Sidebar';
import DataTable from '../components/RegionalDashboard/DataTable';
import styles from '../components/RegionalDashboard/RegionalDashboard.module.css';

function RegionalTardyWarning() {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().slice(0, 10),
    agentName: "", agentEmail: "", region: "", pointType: "Attendance",
    subType: "", points: "", notes: "", issuedBy: ""
  });

  const [historyData, setHistoryData] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
  const [mascotPath, setMascotPath] = useState('');
  
  const navigate = useNavigate();

  const regionalMenuItems = [
    { path: '/regional-dashboard', label: 'Dashboard' },
    { path: '/regional-svar', label: 'Agent Commissions' },
    { path: '/regional-tardy-warning', label: 'Agent Tardy/Warnings' }
  ];

  const fetchPageData = async () => {
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      navigate('/');
      return;
    }
    
    setIsLoading(true);
    try {
      const res = await fetch(`https://script.google.com/macros/s/AKfycbxkpstmhru_KB0VfDd5yGLl9XxYKu4IUUNvAvWP6RDxfkPzIi5piws0SNxmNC-eH894/exec?email=${userEmail}`);
      const data = await res.json();
      
      if (data.success) {
        setHistoryData(data.tardyWarningHistory || []);
        
        const userRegion = data.region || '';
        const mascotMap = {
          'THE VALLEY': 'the-valley', 'CEN-CAL': 'cen-cal', 'KERN COUNTY': 'kern-county',
          'BAY': 'bay', 'SOUTHERN CALI': 'southern-cali'
        };
        if (userRegion && mascotMap[userRegion]) {
          setMascotPath(`/${mascotMap[userRegion]}.png`);
        } else {
          setMascotPath('/default-mascot.png');
        }

        // ✅ FIX: Only pre-fill the region
        setFormData(prev => ({ ...prev, region: userRegion }));

      } else {
        throw new Error(data.message || "Could not fetch page data.");
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // This now just runs once to pre-fill the region
    const userRegion = localStorage.getItem('userRegion');
    setFormData(prev => ({ ...prev, region: userRegion || '' }));
    fetchPageData();
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage({ type: '', text: '' });

    try {
      const res = await fetch("https://script.google.com/macros/s/AKfycbxkpstmhru_KB0VfDd5yGLl9XxYKu4IUUNvAvWP6RDxfkPzIi5piws0SNxmNC-eH894/exec", {
        method: "POST",
        body: JSON.stringify({ tardyWarningData: formData })
      });
      const result = await res.json();
      
      if (result.success) {
        setStatusMessage({ type: 'success', text: 'Record saved successfully!' });
        setFormData(prev => ({ ...prev, agentName: "", agentEmail: "", subType: "", points: "", notes: "", issuedBy: "" }));
        fetchPageData(); 
      } else {
        setStatusMessage({ type: 'error', text: `Error: ${result.message}` });
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'A network error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  return (
    <div className={styles.dashboardContainer}>
      <Sidebar 
        onLogout={handleLogout}
        mascotPath={mascotPath}
        menuItems={regionalMenuItems}
        userTitle="Regional"
      />
      <main className={styles.mainContent}>
        {isLoading ? (
            <div className={styles.centered}>Loading...</div>
        ) : error ? (
            <div className={`${styles.centered} ${styles.error}`}>
              <h3>Something went wrong</h3>
              <p>{error.message}</p>
            </div>
        ) : (
          <>
            <div className={styles.card}>
              <h2>Enter Agent Tardy / Warning</h2>
              <form onSubmit={handleSubmit} className={styles.formGrid}>
                {/* Form fields */}
                <div className={styles.formGroup}><label>Date</label><input type="date" name="date" value={formData.date} onChange={handleChange} required /></div>
                <div className={styles.formGroup}><label>Point Type</label><select name="pointType" value={formData.pointType} onChange={handleChange}><option value="Attendance">Attendance</option><option value="Warning">Warning</option></select></div>
                <div className={styles.formGroup}><label>Agent Name</label><input type="text" name="agentName" value={formData.agentName} onChange={handleChange} required /></div>
                <div className={styles.formGroup}><label>Agent Email</label><input type="email" name="agentEmail" value={formData.agentEmail} onChange={handleChange} required /></div>
                <div className={styles.formGroup}><label>Sub-Type</label><input type="text" name="subType" value={formData.subType} onChange={handleChange} required placeholder="e.g., Late, No Call No Show" /></div>
                <div className={styles.formGroup}><label>Points</label><input type="number" step="0.5" name="points" value={formData.points} onChange={handleChange} required /></div>
                <div className={styles.formGroup}><label>Region</label><input type="text" name="region" value={formData.region} readOnly /></div>
                
                {/* ✅ FIX: "Issued By" is now editable */}
                <div className={styles.formGroup}><label>Issued By</label><input type="text" name="issuedBy" value={formData.issuedBy} onChange={handleChange} required /></div>
                
                <div className={styles.formGroupFull}><label>Notes</label><textarea name="notes" value={formData.notes} onChange={handleChange}></textarea></div>
                <div className={styles.formGroupFull}>
                  <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Submit Record'}
                  </button>
                  {statusMessage.text && (<div className={statusMessage.type === 'error' ? styles.statusError : styles.statusSuccess}>{statusMessage.text}</div>)}
                </div>
              </form>
            </div>
            
            <DataTable
              title="Recent Tardy/Warning History"
              data={historyData}
              dataType="arrayArray"
            />
          </>
        )}
      </main>
    </div>
  );
}

export default RegionalTardyWarning;
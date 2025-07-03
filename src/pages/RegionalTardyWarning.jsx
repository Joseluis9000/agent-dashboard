import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function RegionalTardyWarning() {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().slice(0,10),
    agentName: "",
    agentEmail: "",
    region: "",
    pointType: "Attendance",
    subType: "",
    points: "",
    notes: "",
    issuedBy: ""
  });

  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("https://script.google.com/macros/s/AKfycbxkpstmhru_KB0VfDd5yGLl9XxYKu4IUUNvAvWP6RDxfkPzIi5piws0SNxmNC-eH894/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const result = await res.json();
      if (result.success) {
        alert("Record saved successfully!");
        setFormData({ ...formData, agentName:"", agentEmail:"", subType:"", points:"", notes:"" });
      } else {
        alert("Error: " + result.message);
      }
    } catch (error) {
      console.error(error);
      alert("Network error.");
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h2>Enter Agent Tardy / Warning</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Date: </label>
          <input type="date" name="date" value={formData.date} onChange={handleChange} required />
        </div>
        <div>
          <label>Agent Name: </label>
          <input type="text" name="agentName" value={formData.agentName} onChange={handleChange} required />
        </div>
        <div>
          <label>Agent Email: </label>
          <input type="email" name="agentEmail" value={formData.agentEmail} onChange={handleChange} required />
        </div>
        <div>
          <label>Region: </label>
          <input type="text" name="region" value={formData.region} onChange={handleChange} required />
        </div>
        <div>
          <label>Point Type: </label>
          <select name="pointType" value={formData.pointType} onChange={handleChange}>
            <option value="Attendance">Attendance</option>
            <option value="Warning">Warning</option>
          </select>
        </div>
        <div>
          <label>Sub-Type: </label>
          <input type="text" name="subType" value={formData.subType} onChange={handleChange} required />
        </div>
        <div>
          <label>Points: </label>
          <input type="number" step="0.5" name="points" value={formData.points} onChange={handleChange} required />
        </div>
        <div>
          <label>Notes: </label>
          <textarea name="notes" value={formData.notes} onChange={handleChange}></textarea>
        </div>
        <div>
          <label>Issued By: </label>
          <input type="text" name="issuedBy" value={formData.issuedBy} onChange={handleChange} required />
        </div>
        <button type="submit">Submit Record</button>
      </form>
      <button onClick={() => navigate('/regional-dashboard')} style={{ marginTop: "20px" }}>Back to Dashboard</button>
    </div>
  );
}

export default RegionalTardyWarning;

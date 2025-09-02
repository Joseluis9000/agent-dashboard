// src/pages/SupervisorTickets.jsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import styles from '../components/SupervisorDashboard/SupervisorDashboard.module.css';

const SupervisorTickets = () => {
    // --- Data for the dynamic dropdowns ---
    const ticketCategories = {
        "AR & Scanning Violations": ["AR Dispute or Question", "Scanning Violation Dispute", "AR/Violation Follow-Up Needed", "Report a System or Posting Error", "Other"],
        "HR (Human Resources)": ["Attendance or Behavior Concern", "Hiring Reccomendation", "Employee Documentation Update", "General HR Inquiry", "Other"],
        "Training & Development": ["Training Request for Agent", "Coaching Follow-Up Needed", "Request for Training Material", "Feedback or Suggestion for Training", "Other"],
        "Operations Management": ["Office Supply Request", "Equipment Repair or Replacement", "Internet or Connectivity Issue", "Safety or Maintenance Concern", "Other"],
        "Payroll": ["Timecard Correction", "Payroll Discrepancy Inquiry", "Commission or Bonus Question", "Other"],
        "DMV": ["Title or Tag Issue", "Registration Assistance Request", "DMV System Error or Support Needed", "Other"],
        "Tax": ["Tax Software Support Needed", "Client Return Assistance", "Tax Documentation Update", "General Tax Inquiry", "Other"],
        "Marketing": ["New Flyer or Banner Request", "Billboard or Digital Ad Support", "Social Media Content Request", "Marketing Material Restock", "Event Marketing Assistance", "New Campaign Suggestion", "Other"],
        "Other / Miscellaneous": ["General Inquiry", "Not Listed — Describe in Notes", "Other"]
    };
    const urgencyOptions = ['Low', 'Medium', 'High', 'Critical'];

    // --- Component State ---
    const [view, setView] = useState('list');
    const [myTickets, setMyTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const supervisorEmail = localStorage.getItem('userEmail');

    // --- Form State ---
    const [office, setOffice] = useState('');
    const [csrName, setCsrName] = useState('');
    const [department, setDepartment] = useState(Object.keys(ticketCategories)[0]);
    const [category, setCategory] = useState(ticketCategories[Object.keys(ticketCategories)[0]][0]);
    const [urgency, setUrgency] = useState('Medium');
    const [description, setDescription] = useState('');
    const [formMessage, setFormMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchMyTickets = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('tickets')
            .select('*')
            .eq('agent_email', supervisorEmail)
            .order('created_at', { ascending: false });

        if (error) setError(error.message);
        else setMyTickets(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchMyTickets();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setFormMessage('');
        
        const finalDescription = `${csrName} - ${description}`;
        const finalCategory = `${department}: ${category}`;

        const { error } = await supabase
            .from('tickets')
            .insert([{
                agent_email: supervisorEmail,
                office: office,
                urgency: urgency,
                category: finalCategory,
                description: finalDescription,
            }]);
        
        setIsSubmitting(false);
        if (error) { 
            setFormMessage('Error: ' + error.message);
        } else {
            setFormMessage('Ticket submitted successfully!');
            setOffice(''); 
            setCsrName(''); 
            setDepartment(Object.keys(ticketCategories)[0]);
            setCategory(ticketCategories[Object.keys(ticketCategories)[0]][0]);
            setUrgency('Medium');
            setDescription('');
            fetchMyTickets();
            setView('list');
        }
    };

    const UrgencyBadge = ({ urgency }) => {
        const urgencyClass = urgency ? urgency.toLowerCase() : '';
        return <span className={`${styles.badge} ${styles[urgencyClass]}`}>{urgency}</span>;
    };

    const activeTickets = myTickets.filter(ticket => ticket.status !== 'Completed' && ticket.status !== 'Cancelled');
    const completedTickets = myTickets.filter(ticket => ticket.status === 'Completed' || ticket.status === 'Cancelled');
    
    const notStarted = activeTickets.filter(t => !t.assigned_to).length;
    const inProgress = activeTickets.filter(t => t.assigned_to).length;
    const completedCount = completedTickets.length;
    const totalTickets = myTickets.length;
    
    if (loading) return <h2>Loading...</h2>;
    if (error) return <h2 style={{ color: 'red' }}>Error: {error}</h2>;

    // --- ADD TICKET FORM VIEW ---
    if (view === 'form') {
        return (
            <div>
                <div className={styles.pageHeader}>
                    <h1>Add Ticket</h1>
                    <button onClick={() => setView('list')} className={styles.backButton}>Back</button>
                </div>
                
                <form onSubmit={handleSubmit} className={styles.addTicketForm}>
                    <div className={styles.formField}>
                        <label htmlFor="department">Department</label>
                        <select id="department" value={department} onChange={e => {
                            setDepartment(e.target.value);
                            setCategory(ticketCategories[e.target.value][0]);
                        }}>
                            {Object.keys(ticketCategories).map(dept => (<option key={dept} value={dept}>{dept}</option>))}
                        </select>
                    </div>
                    <div className={styles.formField}>
                        <label htmlFor="category">Ticket Type Request</label>
                        <select id="category" value={category} onChange={e => setCategory(e.target.value)}>
                            {ticketCategories[department].map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                        </select>
                    </div>
                    <div className={styles.formField}>
                        <label htmlFor="office">Office</label>
                        <input id="office" type="text" value={office} onChange={e => setOffice(e.target.value)} required />
                    </div>
                    <div className={styles.formField}>
                        <label htmlFor="csrName">Supervisor Name</label>
                        <input id="csrName" type="text" value={csrName} onChange={e => setCsrName(e.target.value)} />
                    </div>
                    <div className={styles.formField}>
                        <label htmlFor="urgency">Urgency</label>
                        <select id="urgency" value={urgency} onChange={e => setUrgency(e.target.value)}>
                            {urgencyOptions.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
                        </select>
                    </div>
                    <div className={`${styles.formField} ${styles.fullWidth}`}>
                        <label htmlFor="description">Description / Notes</label>
                        <textarea id="description" rows="5" value={description} onChange={e => setDescription(e.target.value)} required />
                    </div>
                    <div className={styles.formActions}>
                        <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Submitting...' : 'Submit'}</button>
                    </div>
                    {formMessage && <p style={{ marginTop: '1rem', textAlign: 'center' }} className={styles.fullWidth}>{formMessage}</p>}
                </form>
            </div>
        );
    }

    // --- MAIN LIST VIEW ---
    return (
        <div>
            {/* Summary Cards */}
            <div className={styles.summaryCards}>
                <div className={styles.summaryCard} style={{borderLeftColor: '#e74c3c'}}><h4>Not Started</h4><p>{notStarted}</p></div>
                <div className={styles.summaryCard} style={{borderLeftColor: '#f39c12'}}><h4>In Progress</h4><p>{inProgress}</p></div>
                <div className={styles.summaryCard} style={{borderLeftColor: '#2ecc71'}}><h4>Completed</h4><p>{completedCount}</p></div>
                <div className={styles.summaryCard}><h4>Total</h4><p>{totalTickets}</p></div>
            </div>

            {/* Header and Add Ticket Button */}
            <div className={styles.pageHeader}>
                <h1>Manage Your Submitted Tickets</h1>
                <button onClick={() => setView('form')} className={styles.primaryActionButton}>Add Ticket</button>
            </div>

            {/* Active Tickets Table */}
            <h2 style={{marginTop: '2rem', borderBottom: '1px solid #2c3e50', paddingBottom: '0.5rem'}}>Your Active Tickets</h2>
            <table className={styles.ticketsTable}>
                <thead>
                    <tr>
                        <th>Req. Type</th>
                        <th>Description</th>
                        <th>Date Submitted</th>
                        <th>Status</th>
                        <th>Assigned To</th>
                    </tr>
                </thead>
                <tbody>
                    {activeTickets.length > 0 ? (
                        activeTickets.map(ticket => (
                            <tr key={ticket.id}>
                                <td>{ticket.category}</td>
                                <td>{ticket.description}</td>
                                <td>{new Date(ticket.created_at).toLocaleDateString()}</td>
                                <td><span className={`${styles.badge} ${styles[ticket.status?.toLowerCase()]}`}>{ticket.status}</span></td>
                                <td>{ticket.assigned_to || 'Unassigned'}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="5" style={{textAlign: 'center', padding: '20px'}}>
                                You have no active tickets.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Completed Tickets Table */}
            <h2 style={{marginTop: '2rem', borderBottom: '1px solid #2c3e50', paddingBottom: '0.5rem'}}>Your Completed Tickets</h2>
            <table className={styles.ticketsTable}>
                <thead>
                    <tr>
                        <th>Req. Type</th>
                        <th>Description</th>
                        <th>Date Submitted</th>
                        <th>Date Completed</th>
                        <th>Completed By</th>
                    </tr>
                </thead>
                <tbody>
                    {completedTickets.length > 0 ? (
                        completedTickets.map(ticket => (
                            <tr key={ticket.id}>
                                <td>{ticket.category}</td>
                                <td>{ticket.description}</td>
                                <td>{new Date(ticket.created_at).toLocaleDateString()}</td>
                                <td>{ticket.completed_at ? new Date(ticket.completed_at).toLocaleDateString() : 'N/A'}</td>
                                <td>{ticket.completed_by}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="5" style={{textAlign: 'center', padding: '20px'}}>
                                No tickets have been completed yet.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default SupervisorTickets;
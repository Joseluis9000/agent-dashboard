// src/pages/AdminTickets.jsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import styles from '../components/AdminDashboard/AdminDashboard.module.css';
import ActionMenu from '../components/AdminDashboard/ActionMenu';
import Modal from '../components/AdminDashboard/Modal';
import TicketDetails from '../components/AdminDashboard/TicketDetails';

const AdminTickets = () => {
    // --- Data for the new dynamic dropdowns ---
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

    // --- State for View Toggling & Form ---
    const [view, setView] = useState('list');
    const [office, setOffice] = useState('');
    const [csrName, setCsrName] = useState('');
    const [department, setDepartment] = useState(Object.keys(ticketCategories)[0]);
    const [category, setCategory] = useState(ticketCategories[Object.keys(ticketCategories)[0]][0]);
    const [urgency, setUrgency] = useState('Medium');
    const [description, setDescription] = useState('');
    const [formMessage, setFormMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Existing State ---
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const adminEmail = localStorage.getItem('userEmail');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);

    const handleOpenModal = (ticket) => { setSelectedTicket(ticket); setIsModalOpen(true); };
    const handleCloseModal = () => { setIsModalOpen(false); setSelectedTicket(null); };

    const fetchTickets = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('tickets').select('*').order('created_at', { ascending: false });
        if (error) setError(error.message);
        else setTickets(data);
        setLoading(false);
    };

    useEffect(() => { fetchTickets(); }, []);

    const handleClaimTicket = async (ticketId) => {
        const { error } = await supabase.from('tickets').update({ status: 'In Progress', assigned_to: adminEmail }).eq('id', ticketId);
        if (error) alert('Error: ' + error.message);
        else fetchTickets();
    };

    // --- Function to Handle Form Submission ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setFormMessage('');
        const finalDescription = `${csrName} - ${description}`;
        const finalCategory = `${department}: ${category}`;
        const { error } = await supabase.from('tickets').insert([{
            agent_email: adminEmail,
            office: office,
            urgency: urgency,
            category: finalCategory,
            description: finalDescription,
        }]);
        setIsSubmitting(false);
        if (error) { setFormMessage('Error: ' + error.message); }
        else {
            setFormMessage('Ticket submitted successfully!');
            setOffice(''); setCsrName(''); setDepartment(Object.keys(ticketCategories)[0]);
            setCategory(ticketCategories[Object.keys(ticketCategories)[0]][0]); setUrgency('Medium'); setDescription('');
            fetchTickets();
            setView('list');
        }
    };

    const UrgencyBadge = ({ urgency }) => {
        const urgencyClass = urgency ? urgency.toLowerCase() : '';
        return <span className={`${styles.badge} ${styles[urgencyClass]}`}>{urgency}</span>;
    };

    // ✅ --- UPDATED SUMMARY LOGIC ---
    const allActiveTickets = tickets.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled');
    const assignedToMeTickets = allActiveTickets.filter(t => t.assigned_to === adminEmail);
    const completedTickets = tickets.filter(t => t.status === 'Completed' || t.status === 'Cancelled');
    const notStarted = allActiveTickets.filter(t => !t.assigned_to).length;
    const inProgress = allActiveTickets.filter(t => t.assigned_to).length;
    const completedCount = completedTickets.length;
    const totalTickets = tickets.length;

    if (loading) return <h2>Loading...</h2>;
    if (error) return <h2 style={{ color: 'red' }}>Error: {error}</h2>;

    // --- ADD TICKET FORM VIEW ---
    if (view === 'form') {
        return (
            <div>
                <div className={styles.pageHeader} style={{ justifyContent: 'space-between', marginBottom: '20px' }}>
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
                        <label htmlFor="csrName">Admin Name</label>
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

            {/* Header with styled "Add Ticket" button */}
            <div className={styles.pageHeader}>
                <h1>Manage All Tickets</h1>
                <button onClick={() => setView('form')} className={styles.primaryActionButton}>Add Ticket</button>
            </div>

            {/* TABLE 1: Manage All Tickets */}
            <table className={styles.ticketsTable}>
                <thead>
                    <tr>
                        <th>Ticket ID</th><th>Req. By</th><th>Office</th><th>Category</th>
                        <th>Description</th><th>Urgency</th><th>Status</th><th>Assigned To</th><th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {allActiveTickets.length > 0 ? (
                        allActiveTickets.map(ticket => (
                            <tr key={ticket.id}>
                                <td>{ticket.id}</td>
                                <td>{ticket.agent_email}</td>
                                <td>{ticket.office}</td>
                                <td>{ticket.category}</td>
                                <td>{ticket.description}</td>
                                <td><UrgencyBadge urgency={ticket.urgency} /></td>
                                <td><span className={`${styles.badge} ${styles[ticket.status?.toLowerCase()]}`}>{ticket.status}</span></td>
                                <td>
                                    {ticket.assigned_to ? ticket.assigned_to : (
                                        <button onClick={() => handleClaimTicket(ticket.id)} className={styles.claimButton}>Claim</button>
                                    )}
                                </td>
                                <td><ActionMenu><button onClick={() => handleOpenModal(ticket)}>View / Edit</button></ActionMenu></td>
                            </tr>
                        ))
                    ) : ( <tr><td colSpan="9" style={{ textAlign: 'center', padding: '20px' }}>No Active Tickets</td></tr> )}
                </tbody>
            </table>

            {/* TABLE 2: Assigned Tickets */}
            <div className={styles.pageHeader} style={{marginTop: '2rem'}}><h1>Assigned Tickets</h1></div>
            <table className={styles.ticketsTable}>
                <thead>
                    <tr>
                        <th>Ticket ID</th><th>Req. By</th><th>Office</th><th>Description</th>
                        <th>Urgency</th><th>Status</th><th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {assignedToMeTickets.length > 0 ? (
                        assignedToMeTickets.map(ticket => (
                            <tr key={ticket.id}>
                                <td>{ticket.id}</td>
                                <td>{ticket.agent_email}</td>
                                <td>{ticket.office}</td>
                                <td>{ticket.description}</td>
                                <td><UrgencyBadge urgency={ticket.urgency} /></td>
                                <td><span className={`${styles.badge} ${styles[ticket.status?.toLowerCase()]}`}>{ticket.status}</span></td>
                                <td><ActionMenu><button onClick={() => handleOpenModal(ticket)}>View / Edit</button></ActionMenu></td>
                            </tr>
                        ))
                    ) : ( <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>No Tickets Assigned to You</td></tr> )}
                </tbody>
            </table>

            {/* TABLE 3: Completed Tickets */}
            <div className={styles.pageHeader} style={{marginTop: '2rem'}}><h1>Completed Tickets</h1></div>
            <table className={styles.ticketsTable}>
                <thead>
                    <tr>
                        <th>Ticket ID</th><th>Req. By</th><th>Office</th><th>Description</th>
                        <th>Date Completed</th><th>Completed By</th><th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {completedTickets.length > 0 ? (
                        completedTickets.map(ticket => (
                            <tr key={ticket.id}>
                                <td>{ticket.id}</td>
                                <td>{ticket.agent_email}</td>
                                <td>{ticket.office}</td>
                                <td>{ticket.description}</td>
                                <td>{ticket.completed_at ? new Date(ticket.completed_at).toLocaleDateString() : 'N/A'}</td>
                                <td>{ticket.completed_by}</td>
                                <td><ActionMenu><button onClick={() => handleOpenModal(ticket)}>View Details</button></ActionMenu></td>
                            </tr>
                        ))
                    ) : ( <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>No Completed Tickets</td></tr> )}
                </tbody>
            </table>

            {/* Modal */}
            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={`Edit Ticket #${selectedTicket?.id}`}>
                {selectedTicket && (
                    <TicketDetails ticket={selectedTicket} onClose={handleCloseModal} onUpdate={fetchTickets} />
                )}
            </Modal>
        </div>
    );
};

export default AdminTickets;
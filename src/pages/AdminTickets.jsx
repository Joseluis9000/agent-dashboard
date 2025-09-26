// src/pages/AdminTickets.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { supabase } from '../supabaseClient';
import ActionMenu from '../components/AdminDashboard/ActionMenu';
import Modal from '../components/AdminDashboard/Modal';
import TicketDetails from '../components/AdminDashboard/TicketDetails';

// --- Reusable Helper Components using Tailwind CSS ---

const StatisticsCard = ({ title, value, color, icon }) => (
  <div className="bg-white shadow-lg rounded-lg p-5 flex items-center justify-between border-l-4" style={{ borderColor: color }}>
    <div>
      <p className="text-sm font-medium text-gray-500 uppercase">{title}</p>
      <p className="text-3xl font-bold text-gray-800">{value}</p>
    </div>
    <div className="text-4xl text-gray-300">{icon}</div>
  </div>
);

const StatusBadge = ({ text, color }) => {
  const colorClasses = {
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    cyan: 'bg-cyan-100 text-cyan-800',
    gray: 'bg-gray-100 text-gray-800',
  };
  return (
    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${colorClasses[color] || colorClasses.gray}`}>
      {text}
    </span>
  );
};

const TicketsTable = ({ title, tickets, columns }) => (
  <div className="bg-white shadow-lg rounded-lg overflow-hidden">
    <div className="p-5 border-b border-gray-200">
      <h2 className="text-xl font-semibold text-gray-700">{title}</h2>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-600">
        <thead className="text-xs text-gray-700 uppercase bg-gray-100">
          <tr>
            {columns.map((col) => <th key={col.header} scope="col" className="px-6 py-3">{col.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {tickets.length > 0 ? (
            tickets.map((ticket) => (
              <tr key={ticket.id} className="bg-white border-b hover:bg-gray-50">
                {columns.map((col) => (
                  <td key={`${ticket.id}-${col.header}`} className="px-6 py-4">
                    {col.cell(ticket)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr><td colSpan={columns.length} className="text-center py-10 text-gray-500">No tickets to display.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

// --- Main Admin Tickets Component ---

const AdminTickets = () => {
  // All your existing state and logic remains unchanged
  const { user } = useAuth();
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
  const [view, setView] = useState('list');
  const [office, setOffice] = useState('');
  const [csrName, setCsrName] = useState('');
  const [department, setDepartment] = useState(Object.keys(ticketCategories)[0]);
  const [category, setCategory] = useState(ticketCategories[Object.keys(ticketCategories)[0]][0]);
  const [urgency, setUrgency] = useState('Medium');
  const [description, setDescription] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const handleOpenModal = (ticket) => { setSelectedTicket(ticket); setIsModalOpen(true); };
  const handleCloseModal = () => { setIsModalOpen(false); setSelectedTicket(null); };

  const fetchTickets = useCallback(async () => {
      setLoading(true);
      const { data, error } = await supabase.from('tickets').select('*').order('created_at', { ascending: false });
      if (error) setError(error.message);
      else setTickets(data);
      setLoading(false);
  }, []);

  useEffect(() => {
      fetchTickets();
  }, [fetchTickets]);

  const handleClaimTicket = async (ticketId) => {
      if (!user) return alert("Cannot perform action: user not found.");
      const adminEmail = user.email;

      const { error } = await supabase.from('tickets').update({ status: 'In Progress', assigned_to: adminEmail }).eq('id', ticketId);
      if (error) alert('Error: ' + error.message);
      else fetchTickets();
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      if (!user) return alert("Cannot perform action: user not found.");
      const adminEmail = user.email;

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
  
  // Data filtering logic remains the same
  const allActiveTickets = tickets.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled');
  const assignedToMeTickets = allActiveTickets.filter(t => t.assigned_to === user?.email);
  const completedTickets = tickets.filter(t => t.status === 'Completed' || t.status === 'Cancelled');

  // --- Column Definitions for Reusable Table ---
  const activeTicketColumns = [
    { header: 'Ticket ID', cell: (ticket) => <span className="font-medium text-gray-900">{ticket.id}</span> },
    { header: 'Req. By', cell: (ticket) => ticket.agent_email },
    { header: 'Office', cell: (ticket) => ticket.office },
    { header: 'Description', cell: (ticket) => <span className="max-w-xs truncate block">{ticket.description}</span> },
    { header: 'Urgency', cell: (ticket) => <StatusBadge text={ticket.urgency} color={ticket.urgency === 'Critical' ? 'red' : ticket.urgency === 'High' ? 'yellow' : 'blue'} /> },
    { header: 'Status', cell: (ticket) => <StatusBadge text={ticket.status} color={ticket.status === 'Completed' ? 'green' : 'cyan'} /> },
    { header: 'Assigned To', cell: (ticket) => ticket.assigned_to ? ticket.assigned_to : (
      <button onClick={() => handleClaimTicket(ticket.id)} className="font-medium text-white bg-green-600 hover:bg-green-700 py-2 px-3 rounded-lg text-xs transition-all duration-200">Claim</button>
    )},
    { header: 'Action', cell: (ticket) => <ActionMenu><button onClick={() => handleOpenModal(ticket)} className="text-blue-600 hover:underline">View / Edit</button></ActionMenu> },
  ];
  
  const assignedTicketColumns = activeTicketColumns.filter(c => c.header !== 'Assigned To'); // Remove 'Assigned To' as it's redundant here

  const completedTicketColumns = [
    { header: 'Ticket ID', cell: (ticket) => <span className="font-medium text-gray-900">{ticket.id}</span> },
    { header: 'Req. By', cell: (ticket) => ticket.agent_email },
    { header: 'Description', cell: (ticket) => <span className="max-w-xs truncate block">{ticket.description}</span> },
    { header: 'Date Completed', cell: (ticket) => ticket.completed_at ? new Date(ticket.completed_at).toLocaleDateString() : 'N/A' },
    { header: 'Completed By', cell: (ticket) => ticket.completed_by },
    { header: 'Action', cell: (ticket) => <ActionMenu><button onClick={() => handleOpenModal(ticket)} className="text-blue-600 hover:underline">View Details</button></ActionMenu> },
  ];


  if (loading) return <div className="flex justify-center items-center h-screen"><h2 className="text-2xl font-semibold">Loading...</h2></div>;
  if (error) return <div className="p-8 text-center"><h2 className="text-2xl font-semibold text-red-600">Error: {error}</h2></div>;

  if (view === 'form') {
    return (
      <div className="p-6 md:p-8 bg-gray-50 min-h-screen font-sans">
        <div className="bg-white shadow-lg rounded-lg max-w-4xl mx-auto">
          <div className="p-5 border-b border-gray-200 flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-700">Add New Ticket</h1>
            <button onClick={() => setView('list')} className="text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors">
              Back to List
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Form fields with Tailwind classes */}
              <div>
                <label htmlFor="department" className="block mb-2 text-sm font-medium text-gray-700">Department</label>
                <select id="department" value={department} onChange={e => {setDepartment(e.target.value); setCategory(ticketCategories[e.target.value][0]);}} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">
                  {Object.keys(ticketCategories).map(dept => (<option key={dept} value={dept}>{dept}</option>))}
                </select>
              </div>
              <div>
                <label htmlFor="category" className="block mb-2 text-sm font-medium text-gray-700">Ticket Type Request</label>
                <select id="category" value={category} onChange={e => setCategory(e.target.value)} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">
                  {ticketCategories[department].map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                </select>
              </div>
              <div>
                <label htmlFor="office" className="block mb-2 text-sm font-medium text-gray-700">Office</label>
                <input id="office" type="text" value={office} onChange={e => setOffice(e.target.value)} required className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5" />
              </div>
              <div>
                <label htmlFor="csrName" className="block mb-2 text-sm font-medium text-gray-700">Admin Name</label>
                <input id="csrName" type="text" value={csrName} onChange={e => setCsrName(e.target.value)} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5" />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="urgency" className="block mb-2 text-sm font-medium text-gray-700">Urgency</label>
                <select id="urgency" value={urgency} onChange={e => setUrgency(e.target.value)} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">
                  {urgencyOptions.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="description" className="block mb-2 text-sm font-medium text-gray-700">Description / Notes</label>
                <textarea id="description" rows="5" value={description} onChange={e => setDescription(e.target.value)} required className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"></textarea>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 transition-all duration-200 shadow-md hover:shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed">
                {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </div>
            {formMessage && <p className="mt-4 text-center text-sm">{formMessage}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 bg-gray-50 min-h-screen font-sans space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Tickets Dashboard</h1>
        <button onClick={() => setView('form')} className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 transition-all duration-200 shadow-md hover:shadow-lg">
          Add Ticket
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatisticsCard title="Not Started" value={allActiveTickets.filter(t => !t.assigned_to).length} color="#ef4444" icon="❗" />
        <StatisticsCard title="In Progress" value={allActiveTickets.filter(t => t.assigned_to).length} color="#f59e0b" icon="⏳" />
        <StatisticsCard title="Completed" value={completedTickets.length} color="#22c55e" icon="✅" />
        <StatisticsCard title="Total" value={tickets.length} color="#6b7280" icon="📊" />
      </div>

      <TicketsTable title="All Active Tickets" tickets={allActiveTickets} columns={activeTicketColumns} />
      <TicketsTable title="Assigned To Me" tickets={assignedToMeTickets} columns={assignedTicketColumns} />
      <TicketsTable title="Completed & Cancelled" tickets={completedTickets} columns={completedTicketColumns} />
      
      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={`Edit Ticket #${selectedTicket?.id}`}>
          {selectedTicket && (
              <TicketDetails ticket={selectedTicket} onClose={handleCloseModal} onUpdate={fetchTickets} />
          )}
      </Modal>
    </div>
  );
};

export default AdminTickets;
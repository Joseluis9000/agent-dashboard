import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

// We no longer need the CSS module import
// import styles from './AdminDashboard.module.css'; 

const TicketDetails = ({ ticket, onClose, onUpdate }) => {
  const [status, setStatus] = useState(ticket.status);
  const [assignedTo, setAssignedTo] = useState(ticket.assigned_to || '');
  const [note, setNote] = useState('');
  const [users, setUsers] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // ... (Your useEffect and handleSave logic remains exactly the same) ...
  useEffect(() => {
        const fetchUsers = async () => {
            const { data, error } = await supabase
                .from('WEBSITE LOGINS')
                .select('Email, Title')
                .in('Title', ['Admin', 'Supervisor']);

            if (!error) {
                setUsers(data.map(user => user.Email));
            }
        };
        fetchUsers();
  }, []);

  const handleSave = async () => {
        setIsSaving(true);
        const updates = {
            status: status,
            assigned_to: assignedTo,
        };

        if (note.trim() !== '') {
            const user = localStorage.getItem('userName') || 'Admin';
            const timestamp = new Date().toLocaleString();
            updates.description = `${ticket.description}\n\n--- Note added by ${user} on ${timestamp} ---\n${note}`;
        }
        
        if (status === 'Completed' && ticket.status !== 'Completed') {
            updates.completed_at = new Date().toISOString();
            updates.completed_by = localStorage.getItem('userEmail');
        }

        const { error } = await supabase
            .from('tickets')
            .update(updates)
            .eq('id', ticket.id);

        setIsSaving(false);
        if (error) {
            alert('Error updating ticket: ' + error.message);
        } else {
            onUpdate();
            onClose();
        }
  };


  // This is the part that has been converted to Tailwind CSS
  return (
    <div>
      <div className="mb-4">
        <label className="block mb-1 text-sm font-medium text-gray-700">Set Status</label>
        <select 
          value={status} 
          onChange={(e) => setStatus(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option>New</option>
          <option>In Progress</option>
          <option>Pending (Needs Info)</option>
          <option>On Hold</option>
          <option>Completed</option>
          <option>Cancelled</option>
        </select>
      </div>
      
      <div className="mb-4">
        <label className="block mb-1 text-sm font-medium text-gray-700">Assign To...</label>
        <select 
          value={assignedTo} 
          onChange={(e) => setAssignedTo(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Unassigned</option>
          {users.map(email => (
            <option key={email} value={email}>{email}</option>
          ))}
        </select>
      </div>
      
      <div className="mb-4">
        <label className="block mb-1 text-sm font-medium text-gray-700">Add Note</label>
        <textarea 
          rows="4" 
          value={note} 
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a new note to the ticket history..."
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      
      {/* Modal Actions Footer */}
      <div className="flex justify-end pt-4 border-t mt-6">
        <button 
          onClick={handleSave} 
          disabled={isSaving}
          className="px-5 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default TicketDetails;
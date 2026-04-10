// src/pages/AdminTickets.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { supabase } from '../supabaseClient';
import ActionMenu from '../components/AdminDashboard/ActionMenu';
import Modal from '../components/AdminDashboard/Modal';
import TicketDetails from '../components/AdminDashboard/TicketDetails';

// --- Small helper components --- //

const StatisticsCard = ({ title, value, color, icon }) => (
  <div
    className="bg-white shadow-lg rounded-lg p-5 flex items-center justify-between border-l-4"
    style={{ borderColor: color }}
  >
    <div>
      <p className="text-sm font-medium text-gray-500 uppercase">{title}</p>
      <p className="text-3xl font-bold text-gray-800">{value}</p>
    </div>
    <div className="text-4xl text-gray-300">{icon}</div>
  </div>
);

const StatusBadge = ({ text }) => {
  const map = {
    New: 'bg-blue-100 text-blue-800',
    'In Progress': 'bg-yellow-100 text-yellow-800',
    'On Hold': 'bg-gray-100 text-gray-800',
    Completed: 'bg-green-100 text-green-800',
    Cancelled: 'bg-red-100 text-red-800',
  };
  const classes = map[text] || 'bg-gray-100 text-gray-800';
  return (
    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${classes}`}>
      {text}
    </span>
  );
};

const UrgencyBadge = ({ urgency }) => {
  const map = {
    Critical: 'bg-red-100 text-red-800',
    High: 'bg-yellow-100 text-yellow-800',
    Medium: 'bg-blue-100 text-blue-800',
    Low: 'bg-gray-100 text-gray-800',
  };
  const classes = map[urgency] || map.Medium;
  return (
    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${classes}`}>
      {urgency}
    </span>
  );
};

const TicketsTable = ({ tickets, columns }) => (
  <div className="bg-white shadow-lg rounded-lg overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-600">
        <thead className="text-xs text-gray-700 uppercase bg-gray-100">
          <tr>
            {columns.map((col) => (
              <th
                key={col.header}
                scope="col"
                className="px-4 py-3 whitespace-nowrap"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickets.length > 0 ? (
            tickets.map((ticket) => (
              <tr
                key={ticket.id}
                className="bg-white border-b hover:bg-gray-50"
              >
                {columns.map((col) => (
                  <td
                    key={`${ticket.id}-${col.header}`}
                    className="px-4 py-3 align-top"
                  >
                    {col.cell(ticket)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="text-center py-10 text-gray-500"
              >
                No tickets to display.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

// --- Utility helpers --- //

const formatEmailAsName = (email) => {
  if (!email) return 'N/A';
  const [namePart] = email.split('@');
  if (!namePart) return email;
  return namePart
    .split('.')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
};

const formatRelativeTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
};

// For legacy rows where department/ticket_type are null
const deriveDeptAndTypeFromCategory = (category) => {
  if (!category) return { department: null, ticketType: null };
  const parts = category.split(': ');
  return {
    department: parts[0] || null,
    ticketType: parts[1] || null,
  };
};

const getDeptAndType = (ticket) => {
  const dept = ticket.department || deriveDeptAndTypeFromCategory(ticket.category).department;
  const type = ticket.ticket_type || deriveDeptAndTypeFromCategory(ticket.category).ticketType;
  return { department: dept, ticketType: type };
};

const getDescriptionPreview = (ticket, max = 80) => {
  const text = ticket.description || '';
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
};

const isCompletedStatus = (status) =>
  status === 'Completed' || status === 'Cancelled';

// --- Main Component --- //

const AdminTickets = () => {
  const { user } = useAuth();

  const ticketCategories = {
    'AR & Scanning Violations': [
      'AR Dispute or Question',
      'Scanning Violation Dispute',
      'AR/Violation Follow-Up Needed',
      'Report a System or Posting Error',
      'Other',
    ],
    'HR (Human Resources)': [
      'Attendance or Behavior Concern',
      'Hiring Reccomendation',
      'Employee Documentation Update',
      'General HR Inquiry',
      'Other',
    ],
    'Training & Development': [
      'Training Request for Agent',
      'Coaching Follow-Up Needed',
      'Request for Training Material',
      'Feedback or Suggestion for Training',
      'Other',
    ],
    'Operations Management': [
      'Office Supply Request',
      'Equipment Repair or Replacement',
      'Internet or Connectivity Issue',
      'Safety or Maintenance Concern',
      'Other',
    ],
    Payroll: [
      'Timecard Correction',
      'Payroll Discrepancy Inquiry',
      'Commission or Bonus Question',
      'Other',
    ],
    DMV: [
      'Title or Tag Issue',
      'Registration Assistance Request',
      'DMV System Error or Support Needed',
      'Other',
    ],
    Tax: [
      'Tax Software Support Needed',
      'Client Return Assistance',
      'Tax Documentation Update',
      'General Tax Inquiry',
      'Other',
    ],
    Marketing: [
      'New Flyer or Banner Request',
      'Billboard or Digital Ad Support',
      'Social Media Content Request',
      'Marketing Material Restock',
      'Event Marketing Assistance',
      'New Campaign Suggestion',
      'Other',
    ],
    'Other / Miscellaneous': [
      'General Inquiry',
      'Not Listed — Describe in Notes',
      'Other',
    ],
  };

  const urgencyOptions = ['Low', 'Medium', 'High', 'Critical'];

  // Form state for manually adding a ticket as admin
  const [view, setView] = useState('list');
  const [office, setOffice] = useState('');
  const [csrName, setCsrName] = useState('');
  const [department, setDepartment] = useState(
    Object.keys(ticketCategories)[0]
  );
  const [category, setCategory] = useState(
    ticketCategories[Object.keys(ticketCategories)[0]][0]
  );
  const [urgency, setUrgency] = useState('Medium');
  const [description, setDescription] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ticket data + modal
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  // Tabs & filters
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'mine' | 'completed'
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [filterTicketType, setFilterTicketType] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  const handleOpenModal = (ticket) => {
    setSelectedTicket(ticket);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTicket(null);
  };

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) setError(error.message);
    else setTickets(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleClaimTicket = async (ticketId) => {
    if (!user) return alert('Cannot perform action: user not found.');
    const adminEmail = user.email;

    const { error } = await supabase
      .from('tickets')
      .update({ status: 'In Progress', assigned_to: adminEmail })
      .eq('id', ticketId);

    if (error) alert('Error: ' + error.message);
    else fetchTickets();
  };

  // Admin creating a ticket from this screen
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return alert('Cannot perform action: user not found.');
    const adminEmail = user.email;

    setIsSubmitting(true);
    setFormMessage('');

    const isOfficeSupplyRequest =
      department === 'Operations Management' &&
      category === 'Office Supply Request';

    const cleanDescription = description.trim() || null;

    const { error } = await supabase.from('tickets').insert([
      {
        agent_email: adminEmail,
        office,
        urgency,
        requester_name: csrName || null,
        department,
        ticket_type: category,
        category: `${department}: ${category}`, // keep legacy combined field
        description: cleanDescription,
        // Admin-created tickets from here won’t usually set supply_* fields
        supply_item: isOfficeSupplyRequest ? null : null,
        supply_stock_on_hand: null,
        supply_extra_notes: null,
      },
    ]);

    setIsSubmitting(false);
    if (error) {
      setFormMessage('Error: ' + error.message);
    } else {
      setFormMessage('Ticket submitted successfully!');
      setOffice('');
      setCsrName('');
      const firstDept = Object.keys(ticketCategories)[0];
      setDepartment(firstDept);
      setCategory(ticketCategories[firstDept][0]);
      setUrgency('Medium');
      setDescription('');
      fetchTickets();
      setView('list');
    }
  };

  // --- Filtered data set for main table --- //

  const filteredTickets = useMemo(() => {
    if (!user) return [];

    // 1) Start from correct tab subset
    let base = tickets;

    if (activeTab === 'all') {
      base = tickets.filter((t) => !isCompletedStatus(t.status));
    } else if (activeTab === 'mine') {
      base = tickets.filter(
        (t) => !isCompletedStatus(t.status) && t.assigned_to === user.email
      );
    } else if (activeTab === 'completed') {
      base = tickets.filter((t) => isCompletedStatus(t.status));
    }

    // 2) Apply department & ticket_type filters
    base = base.filter((t) => {
      const { department: dept, ticketType } = getDeptAndType(t);

      if (filterDepartment !== 'All' && dept !== filterDepartment) return false;
      if (filterTicketType !== 'All' && ticketType !== filterTicketType)
        return false;

      if (
        filterStatus !== 'All' &&
        (t.status || 'New') !== filterStatus
      )
        return false;

      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase();
        const requester = (t.requester_name || '').toLowerCase();
        const email = (t.agent_email || '').toLowerCase();
        const office = (t.office || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const supply = (t.supply_item || '').toLowerCase();

        if (
          !(
            requester.includes(s) ||
            email.includes(s) ||
            office.includes(s) ||
            desc.includes(s) ||
            supply.includes(s)
          )
        ) {
          return false;
        }
      }

      return true;
    });

    return base;
  }, [
    tickets,
    activeTab,
    filterDepartment,
    filterTicketType,
    filterStatus,
    searchTerm,
    user,
  ]);

  // --- Options for Department & Ticket Type filters (derived from data) --- //

  const departmentOptions = useMemo(() => {
    const set = new Set();
    tickets.forEach((t) => {
      const { department: dept } = getDeptAndType(t);
      if (dept) set.add(dept);
    });
    return ['All', ...Array.from(set).sort()];
  }, [tickets]);

  const ticketTypeOptions = useMemo(() => {
    const set = new Set();
    tickets.forEach((t) => {
      const { department: dept, ticketType } = getDeptAndType(t);
      if (!ticketType) return;
      if (filterDepartment !== 'All' && dept !== filterDepartment) return;
      set.add(ticketType);
    });
    return ['All', ...Array.from(set).sort()];
  }, [tickets, filterDepartment]);

  // --- Summary cards counts --- //

  const allActiveTickets = tickets.filter((t) => !isCompletedStatus(t.status));
  const completedTickets = tickets.filter((t) => isCompletedStatus(t.status));

  const notStartedCount = allActiveTickets.filter((t) => !t.assigned_to).length;
  const inProgressCount = allActiveTickets.filter((t) => t.assigned_to).length;
  const completedCount = completedTickets.length;
  const totalTickets = tickets.length;

  // --- Column definitions for compact main table --- //

  const commonColumns = [
    {
      header: 'Ticket',
      cell: (ticket) => (
        <div className="whitespace-nowrap">
          <div className="font-semibold text-gray-900">#{ticket.id}</div>
          <div className="text-xs text-gray-500">
            {formatRelativeTime(ticket.created_at)}
          </div>
        </div>
      ),
    },
    {
      header: 'Summary',
      cell: (ticket) => {
        const { department: dept, ticketType } = getDeptAndType(ticket);
        const preview = getDescriptionPreview(ticket, 80);
        const isSupply =
          ticket.ticket_type === 'Office Supply Request' ||
          getDeptAndType(ticket).ticketType === 'Office Supply Request' ||
          !!ticket.supply_item;

        return (
          <div className="min-w-[260px]">
            <div className="flex flex-wrap items-center gap-1 mb-1">
              {dept && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-700">
                  {dept}
                </span>
              )}
              {ticketType && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-100 text-blue-700">
                  {ticketType}
                </span>
              )}
              {isSupply && (
                <span className="px-1.5 py-0.5 text-[10px]" title="Supply ticket">
                  📦
                </span>
              )}
            </div>
            <div className="text-xs text-gray-700 break-words">
              {preview || <span className="text-gray-400">No description</span>}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Office',
      cell: (ticket) => (
        <span className="whitespace-nowrap text-xs text-gray-800">
          {ticket.office || 'N/A'}
        </span>
      ),
    },
    {
      header: 'Urgency',
      cell: (ticket) => (
        <span className="whitespace-nowrap">
          <UrgencyBadge urgency={ticket.urgency || 'Medium'} />
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (ticket) => (
        <span className="whitespace-nowrap">
          <StatusBadge text={ticket.status || 'New'} />
        </span>
      ),
    },
  ];

  const columnsWithAssignedAndAction = [
    ...commonColumns,
    {
      header: 'Assigned To',
      cell: (ticket) => (
        <div className="whitespace-nowrap">
          {ticket.assigned_to ? (
            <span className="text-xs text-gray-800">
              {formatEmailAsName(ticket.assigned_to)}
            </span>
          ) : isCompletedStatus(ticket.status) ? (
            <span className="text-xs text-gray-400">N/A</span>
          ) : (
            <button
              onClick={() => handleClaimTicket(ticket.id)}
              className="font-medium text-white bg-green-600 hover:bg-green-700 py-1.5 px-3 rounded-lg text-xs transition-all duration-200"
            >
              Claim
            </button>
          )}
        </div>
      ),
    },
    {
      header: 'Action',
      cell: (ticket) => (
        <div className="whitespace-nowrap">
          <ActionMenu>
            <button
              onClick={() => handleOpenModal(ticket)}
              className="text-blue-600 hover:underline text-xs"
            >
              View / Edit
            </button>
          </ActionMenu>
        </div>
      ),
    },
  ];

  const columnsForAssignedToMe = [
    ...commonColumns,
    {
      header: 'Action',
      cell: (ticket) => (
        <div className="whitespace-nowrap">
          <ActionMenu>
            <button
              onClick={() => handleOpenModal(ticket)}
              className="text-blue-600 hover:underline text-xs"
            >
              View / Edit
            </button>
          </ActionMenu>
        </div>
      ),
    },
  ];

  const columnsForCompleted = [
    ...commonColumns,
    {
      header: 'Completed At',
      cell: (ticket) => (
        <span className="whitespace-nowrap text-xs text-gray-700">
          {ticket.completed_at
            ? new Date(ticket.completed_at).toLocaleString()
            : 'N/A'}
        </span>
      ),
    },
    {
      header: 'Completed By',
      cell: (ticket) => (
        <span className="whitespace-nowrap text-xs text-gray-700">
          {ticket.completed_by || ''}
        </span>
      ),
    },
    {
      header: 'Action',
      cell: (ticket) => (
        <div className="whitespace-nowrap">
          <ActionMenu>
            <button
              onClick={() => handleOpenModal(ticket)}
              className="text-blue-600 hover:underline text-xs"
            >
              View Details
            </button>
          </ActionMenu>
        </div>
      ),
    },
  ];

  // choose columns based on tab
  const tableColumns =
    activeTab === 'mine'
      ? columnsForAssignedToMe
      : activeTab === 'completed'
      ? columnsForCompleted
      : columnsWithAssignedAndAction;

  // --- Render --- //

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <h2 className="text-2xl font-semibold">Loading...</h2>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-semibold text-red-600">
          Error: {error}
        </h2>
      </div>
    );
  }

  if (view === 'form') {
    return (
      <div className="p-6 md:p-8 bg-gray-50 min-h-screen font-sans">
        <div className="bg-white shadow-lg rounded-lg max-w-4xl mx-auto">
          <div className="p-5 border-b border-gray-200 flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-700">
              Add New Ticket
            </h1>
            <button
              onClick={() => setView('list')}
              className="text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors"
            >
              Back to List
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label
                  htmlFor="department"
                  className="block mb-2 text-sm font-medium text-gray-700"
                >
                  Department
                </label>
                <select
                  id="department"
                  value={department}
                  onChange={(e) => {
                    const newDept = e.target.value;
                    setDepartment(newDept);
                    setCategory(ticketCategories[newDept][0]);
                  }}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                >
                  {Object.keys(ticketCategories).map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="category"
                  className="block mb-2 text-sm font-medium text-gray-700"
                >
                  Ticket Type Request
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                >
                  {ticketCategories[department].map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="office"
                  className="block mb-2 text-sm font-medium text-gray-700"
                >
                  Office
                </label>
                <input
                  id="office"
                  type="text"
                  value={office}
                  onChange={(e) => setOffice(e.target.value)}
                  required
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                />
              </div>
              <div>
                <label
                  htmlFor="csrName"
                  className="block mb-2 text-sm font-medium text-gray-700"
                >
                  Admin Name
                </label>
                <input
                  id="csrName"
                  type="text"
                  value={csrName}
                  onChange={(e) => setCsrName(e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                />
              </div>
              <div className="md:col-span-2">
                <label
                  htmlFor="urgency"
                  className="block mb-2 text-sm font-medium text-gray-700"
                >
                  Urgency
                </label>
                <select
                  id="urgency"
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                >
                  {urgencyOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label
                  htmlFor="description"
                  className="block mb-2 text-sm font-medium text-gray-700"
                >
                  Description / Notes
                </label>
                <textarea
                  id="description"
                  rows="5"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                ></textarea>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 transition-all duration-200 shadow-md hover:shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </div>
            {formMessage && (
              <p className="mt-4 text-center text-sm">{formMessage}</p>
            )}
          </form>
        </div>
      </div>
    );
  }

  // --- Main list view --- //

  return (
    <div className="p-6 md:p-8 bg-gray-50 min-h-screen font-sans space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Tickets Dashboard</h1>
        <button
          onClick={() => setView('form')}
          className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 transition-all duration-200 shadow-md hover:shadow-lg"
        >
          Add Ticket
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatisticsCard
          title="Not Started"
          value={notStartedCount}
          color="#ef4444"
          icon="❗"
        />
        <StatisticsCard
          title="In Progress"
          value={inProgressCount}
          color="#f59e0b"
          icon="⏳"
        />
        <StatisticsCard
          title="Completed"
          value={completedCount}
          color="#22c55e"
          icon="✅"
        />
        <StatisticsCard
          title="Total"
          value={totalTickets}
          color="#6b7280"
          icon="📊"
        />
      </div>

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg px-4 pt-4 pb-2">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
          {[
            { key: 'all', label: 'All Active' },
            { key: 'mine', label: 'Assigned To Me' },
            { key: 'completed', label: 'Completed' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-t-md ${
                activeTab === tab.key
                  ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Department
            </label>
            <select
              value={filterDepartment}
              onChange={(e) => {
                setFilterDepartment(e.target.value);
                setFilterTicketType('All');
              }}
              className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
            >
              {departmentOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Ticket Type
            </label>
            <select
              value={filterTicketType}
              onChange={(e) => setFilterTicketType(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
            >
              {ticketTypeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
            >
              {['All', 'New', 'In Progress', 'On Hold', 'Completed', 'Cancelled'].map(
                (opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by office, requester, description…"
              className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
            />
          </div>
        </div>
      </div>

      {/* Main table */}
      <TicketsTable tickets={filteredTickets} columns={tableColumns} />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={`Edit Ticket #${selectedTicket?.id}`}
        maxWidth="max-w-6xl"
      >
        {selectedTicket && (
          <TicketDetails
            ticket={selectedTicket}
            onClose={handleCloseModal}
            onUpdate={fetchTickets}
          />
        )}
      </Modal>
    </div>
  );
};

export default AdminTickets;
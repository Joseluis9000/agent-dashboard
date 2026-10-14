// src/pages/AdminTickets.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { supabase } from '../supabaseClient';
import ActionMenu from '../components/AdminDashboard/ActionMenu';
import Modal from '../components/AdminDashboard/Modal';
import TicketDetails from '../components/AdminDashboard/TicketDetails';
import AdminInventoryHub from '../components/Inventory/AdminInventoryHub';

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
  text = normalizeTicketStatus(text);
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

const TicketsTable = ({
  tickets,
  columns,
  selectedTicketIds,
  onToggleTicket,
  onToggleAll,
}) => {
  const allSelected =
    tickets.length > 0 && tickets.every((ticket) => selectedTicketIds.has(ticket.id));
  const someSelected =
    tickets.some((ticket) => selectedTicketIds.has(ticket.id)) && !allSelected;

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-600">
          <thead className="text-xs text-gray-700 uppercase bg-gray-100">
            <tr>
              <th scope="col" className="px-4 py-3 w-12 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  aria-label="Select all visible tickets"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
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
              tickets.map((ticket) => {
                const isSelected = selectedTicketIds.has(ticket.id);
                return (
                  <tr
                    key={ticket.id}
                    className={`${
                      isSelected ? 'bg-blue-50' : 'bg-white'
                    } border-b hover:bg-gray-50`}
                  >
                    <td className="px-4 py-3 align-top text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleTicket(ticket.id)}
                        aria-label={`Select ticket ${ticket.id}`}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    {columns.map((col) => (
                      <td
                        key={`${ticket.id}-${col.header}`}
                        className="px-4 py-3 align-top"
                      >
                        {col.cell(ticket)}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={columns.length + 1}
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
};

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

// Some legacy records store statuses surrounded by literal quotes.
// Normalize only for display, filtering and counting; do not rewrite database values.
const normalizeTicketStatus = (status) => {
  const cleaned = String(status ?? '').trim().replace(/^[\s'"`]+|[\s'"`]+$/g, '').trim();
  return cleaned || 'New';
};

const isCompletedStatus = (status) =>
  ['Completed', 'Cancelled'].includes(normalizeTicketStatus(status));

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const formatPrintDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const getPrintableInventoryItems = (ticket) => {
  // Support structured inventory data if it exists on the ticket row.
  const possibleLists = [
    ticket.requested_inventory,
    ticket.inventory_items,
    ticket.supply_items,
    ticket.requested_items,
  ];

  for (const value of possibleLists) {
    if (!value) continue;

    let list = value;
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list);
      } catch {
        list = null;
      }
    }

    if (Array.isArray(list) && list.length) {
      return list.map((item, index) => ({
        name:
          item?.name ||
          item?.item ||
          item?.item_name ||
          item?.supply_item ||
          `Item ${index + 1}`,
        actual:
          item?.actual ??
          item?.actual_on_hand ??
          item?.stock_on_hand ??
          item?.on_hand ??
          '',
        actualUnit:
          item?.actual_unit ||
          item?.unit ||
          item?.uom ||
          '',
        requested:
          item?.requested ??
          item?.request ??
          item?.requested_quantity ??
          item?.quantity_requested ??
          item?.quantity ??
          '',
        requestedUnit:
          item?.requested_unit ||
          item?.unit ||
          item?.uom ||
          '',
        custom:
          Boolean(item?.custom || item?.is_custom || item?.custom_item) ||
          String(item?.name || item?.item || item?.item_name || '').toLowerCase().includes('item not in catalog'),
      }));
    }
  }

  // Current office-supply tickets also contain the full inventory request in the
  // description, so use that as a reliable fallback for printing.
  const description = String(ticket.description || '');
  const items = [];

  description.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line.startsWith('-')) return;

    const match = line.match(
      /^-\s*(.+?)(\s*\(item not in catalog\))?\s*:\s*Actual\s+([^·|]+?)\s*(?:·|\|)\s*Request\s+(.+)$/i
    );

    if (!match) return;

    const parseQuantity = (text) => {
      const cleaned = String(text || '').trim();
      const qtyMatch = cleaned.match(/^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/);
      if (!qtyMatch) return { quantity: cleaned, unit: '' };
      return { quantity: qtyMatch[1], unit: qtyMatch[2].trim() };
    };

    const actual = parseQuantity(match[3]);
    const requested = parseQuantity(match[4]);

    items.push({
      name: match[1].trim(),
      actual: actual.quantity,
      actualUnit: actual.unit,
      requested: requested.quantity,
      requestedUnit: requested.unit,
      custom: Boolean(match[2]),
    });
  });

  return items;
};

const buildTicketPrintHtml = (ticket) => {
  const { department: dept, ticketType } = getDeptAndType(ticket);
  const requester = ticket.requester_name || formatEmailAsName(ticket.agent_email);
  const supplyDetails = [
    ticket.supply_item && ['Supply item', ticket.supply_item],
    ticket.supply_stock_on_hand !== null &&
      ticket.supply_stock_on_hand !== undefined &&
      ['Stock on hand', ticket.supply_stock_on_hand],
    ticket.supply_extra_notes && ['Supply notes', ticket.supply_extra_notes],
  ].filter(Boolean);

  const extraRows = supplyDetails
    .map(
      ([label, value]) => `
        <div class="field">
          <div class="label">${escapeHtml(label)}</div>
          <div class="value">${escapeHtml(value)}</div>
        </div>`
    )
    .join('');

  const inventoryItems = getPrintableInventoryItems(ticket);
  const inventorySection = inventoryItems.length
    ? `
      <div class="inventory-block">
        <div class="inventory-heading">
          <div>
            <div class="label inventory-title">Requested Inventory</div>
            <div class="inventory-subtitle">Physical count reported by the office and quantity requested.</div>
          </div>
          <div class="inventory-count">${inventoryItems.length} item${inventoryItems.length === 1 ? '' : 's'}</div>
        </div>
        <table class="inventory-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Actual on hand</th>
              <th>Requested</th>
            </tr>
          </thead>
          <tbody>
            ${inventoryItems
              .map(
                (item) => `
                  <tr>
                    <td>
                      <div class="inventory-item-name">${escapeHtml(item.name)}</div>
                      ${item.custom ? '<div class="custom-item">Custom item</div>' : ''}
                    </td>
                    <td>${escapeHtml(`${item.actual ?? ''}${item.actualUnit ? ` ${item.actualUnit}` : ''}` || 'N/A')}</td>
                    <td>${escapeHtml(`${item.requested ?? ''}${item.requestedUnit ? ` ${item.requestedUnit}` : ''}` || 'N/A')}</td>
                  </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`
    : '';

  return `
    <section class="ticket-sheet">
      <div class="ticket-header">
        <div>
          <div class="eyebrow">Operations Support Ticket</div>
          <h1>Ticket #${escapeHtml(ticket.id)}</h1>
        </div>
        <div class="ticket-meta">
          <span>${escapeHtml(ticket.status || 'New')}</span>
          <span>${escapeHtml(ticket.urgency || 'Medium')} priority</span>
        </div>
      </div>

      <div class="grid">
        <div class="field"><div class="label">Office</div><div class="value">${escapeHtml(ticket.office || 'N/A')}</div></div>
        <div class="field"><div class="label">Department</div><div class="value">${escapeHtml(dept || 'N/A')}</div></div>
        <div class="field"><div class="label">Ticket Type</div><div class="value">${escapeHtml(ticketType || 'N/A')}</div></div>
        <div class="field"><div class="label">Submitted</div><div class="value">${escapeHtml(formatPrintDate(ticket.created_at))}</div></div>
        <div class="field"><div class="label">Requester</div><div class="value">${escapeHtml(requester || 'N/A')}</div></div>
        <div class="field"><div class="label">Requester Email</div><div class="value">${escapeHtml(ticket.agent_email || 'N/A')}</div></div>
        <div class="field"><div class="label">Assigned To</div><div class="value">${escapeHtml(ticket.assigned_to ? formatEmailAsName(ticket.assigned_to) : 'Unassigned')}</div></div>
        <div class="field"><div class="label">Completed</div><div class="value">${escapeHtml(formatPrintDate(ticket.completed_at))}</div></div>
        ${extraRows}
      </div>

      ${inventoryItems.length ? inventorySection : `
        <div class="description-block">
          <div class="label">Request Details</div>
          <div class="description">${escapeHtml(ticket.description || 'No description provided.').replaceAll('\n', '<br />')}</div>
        </div>
      `}

      ${ticket.priority_reason ? `
        <div class="description-block">
          <div class="label">Priority Reason</div>
          <div class="description">${escapeHtml(ticket.priority_reason)}</div>
        </div>` : ''}

      <div class="print-footer">Printed ${escapeHtml(new Date().toLocaleString())}</div>
    </section>`;
};

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
  const [pageSection, setPageSection] = useState('tickets');
  const [officeOptions, setOfficeOptions] = useState([]);
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
  const [selectedTicketIds, setSelectedTicketIds] = useState(() => new Set());

  const handleOpenModal = (ticket) => {
    setSelectedTicket(ticket);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTicket(null);
  };

  const handleToggleTicket = (ticketId) => {
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const openPrintWindow = (ticketsToPrint) => {
    if (!ticketsToPrint.length) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Your browser blocked the print window. Please allow pop-ups for this site and try again.');
      return;
    }

    const sheets = ticketsToPrint.map(buildTicketPrintHtml).join('');
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${ticketsToPrint.length === 1 ? `Ticket #${escapeHtml(ticketsToPrint[0].id)}` : `${ticketsToPrint.length} Tickets`}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; }
            .ticket-sheet { padding: 28px 32px; min-height: 100vh; page-break-after: always; }
            .ticket-sheet:last-child { page-break-after: auto; }
            .ticket-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; padding-bottom: 16px; border-bottom: 2px solid #111827; }
            .eyebrow { text-transform: uppercase; font-size: 11px; letter-spacing: .09em; color: #6b7280; font-weight: 700; }
            h1 { font-size: 25px; margin: 4px 0 0; }
            .ticket-meta { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
            .ticket-meta span { border: 1px solid #d1d5db; border-radius: 999px; padding: 6px 10px; font-size: 11px; font-weight: 700; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }
            .field { border: 1px solid #e5e7eb; border-radius: 8px; padding: 11px 12px; break-inside: avoid; }
            .label { text-transform: uppercase; color: #6b7280; font-size: 10px; font-weight: 700; letter-spacing: .06em; margin-bottom: 4px; }
            .value { font-size: 13px; overflow-wrap: anywhere; }
            .description-block { margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 13px; break-inside: avoid; }
            .description { font-size: 13px; line-height: 1.55; white-space: normal; }
            .inventory-block { margin-top: 14px; border: 1px solid #f0c36a; border-radius: 8px; padding: 12px; break-inside: avoid; }
            .inventory-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
            .inventory-title { color: #92400e; margin-bottom: 3px; }
            .inventory-subtitle { color: #b45309; font-size: 10px; }
            .inventory-count { border: 1px solid #f0c36a; border-radius: 999px; padding: 4px 8px; color: #92400e; font-size: 10px; white-space: nowrap; }
            .inventory-table { width: 100%; border-collapse: collapse; font-size: 11px; }
            .inventory-table th { background: #f9fafb; color: #374151; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; text-align: left; padding: 7px 8px; border: 1px solid #e5e7eb; }
            .inventory-table td { padding: 8px; border: 1px solid #e5e7eb; vertical-align: top; }
            .inventory-table th:nth-child(2), .inventory-table th:nth-child(3), .inventory-table td:nth-child(2), .inventory-table td:nth-child(3) { width: 22%; text-align: right; }
            .inventory-item-name { font-weight: 700; color: #111827; }
            .custom-item { color: #b45309; font-size: 9px; margin-top: 2px; }
            .print-footer { margin-top: 20px; text-align: right; color: #9ca3af; font-size: 9px; }
            @page { size: letter; margin: 0.35in; }
            @media print {
              .ticket-sheet { min-height: auto; padding: 0; }
            }
          </style>
        </head>
        <body>${sheets}</body>
      </html>`);
    printWindow.document.close();

    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  const handlePrintTicket = (ticket) => openPrintWindow([ticket]);

  const fetchOfficeOptions = useCallback(async () => {
    const { data, error } = await supabase
      .from('office_dashboard_settings')
      .select('office_code, region')
      .order('office_code');

    if (error) {
      console.error('Unable to load office_dashboard_settings:', error);
      return;
    }

    const options = (data || [])
      .map((row) => ({
        code: String(row.office_code || '').trim().toUpperCase(),
        region: String(row.region || '').trim(),
      }))
      .filter((row) => row.code);

    setOfficeOptions(options);

    setOffice((current) => {
      if (current) return current;
      return options[0]?.code || '';
    });
  }, []);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const allTickets = [];
      const batchSize = 500;
      let from = 0;

      while (true) {
        const { data, error: fetchError } = await supabase
          .from('tickets')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + batchSize - 1);

        if (fetchError) throw fetchError;

        const batch = data || [];
        allTickets.push(...batch);

        if (batch.length < batchSize) break;
        from += batchSize;
      }

      setTickets(allTickets);
    } catch (fetchError) {
      console.error('Error loading tickets:', fetchError);
      setError(fetchError.message || 'Unable to load tickets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOfficeOptions();
    fetchTickets();
  }, [fetchOfficeOptions, fetchTickets]);

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
      setOffice(officeOptions[0]?.code || '');
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
        normalizeTicketStatus(t.status) !== filterStatus
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

  const selectedVisibleTickets = useMemo(
    () => filteredTickets.filter((ticket) => selectedTicketIds.has(ticket.id)),
    [filteredTickets, selectedTicketIds]
  );

  const handleToggleAllVisible = (checked) => {
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      filteredTickets.forEach((ticket) => {
        if (checked) next.add(ticket.id);
        else next.delete(ticket.id);
      });
      return next;
    });
  };

  const handlePrintSelected = () => {
    if (!selectedVisibleTickets.length) {
      alert('Select at least one visible ticket to print.');
      return;
    }
    openPrintWindow(selectedVisibleTickets);
  };

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

  const notStartedCount = allActiveTickets.filter((t) => normalizeTicketStatus(t.status) === 'New').length;
  const inProgressCount = allActiveTickets.filter((t) => normalizeTicketStatus(t.status) === 'In Progress').length;
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
            <div className="flex flex-col items-start gap-2">
              <button
                onClick={() => handleOpenModal(ticket)}
                className="text-blue-600 hover:underline text-xs"
              >
                View / Edit
              </button>
              <button
                onClick={() => handlePrintTicket(ticket)}
                className="text-gray-700 hover:text-gray-900 hover:underline text-xs"
              >
                Print Ticket
              </button>
            </div>
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
            <div className="flex flex-col items-start gap-2">
              <button
                onClick={() => handleOpenModal(ticket)}
                className="text-blue-600 hover:underline text-xs"
              >
                View / Edit
              </button>
              <button
                onClick={() => handlePrintTicket(ticket)}
                className="text-gray-700 hover:text-gray-900 hover:underline text-xs"
              >
                Print Ticket
              </button>
            </div>
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
            <div className="flex flex-col items-start gap-2">
              <button
                onClick={() => handleOpenModal(ticket)}
                className="text-blue-600 hover:underline text-xs"
              >
                View Details
              </button>
              <button
                onClick={() => handlePrintTicket(ticket)}
                className="text-gray-700 hover:text-gray-900 hover:underline text-xs"
              >
                Print Ticket
              </button>
            </div>
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

  if (pageSection === 'inventory') {
    return (
      <div className="p-6 md:p-8 bg-gray-50 min-h-screen font-sans space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Operations</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage support tickets and office inventory from one workspace.
            </p>

            <div className="mt-4 inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setPageSection('tickets')}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Tickets
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white shadow-sm"
              >
                Inventory
              </button>
            </div>
          </div>
        </div>

        <AdminInventoryHub />
      </div>
    );
  }


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
                <select
                  id="office"
                  value={office}
                  onChange={(e) => setOffice(e.target.value)}
                  required
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                >
                  <option value="">Select office</option>
                  {officeOptions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code}{item.region ? ` - ${item.region}` : ''}
                    </option>
                  ))}
                </select>
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
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Operations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage support tickets and office inventory from one workspace.
          </p>

          <div className="mt-4 inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white shadow-sm"
            >
              Tickets
            </button>
            <button
              type="button"
              onClick={() => setPageSection('inventory')}
              className="px-4 py-2 text-sm font-semibold rounded-lg text-gray-600 hover:bg-gray-50"
            >
              Inventory
            </button>
          </div>
        </div>

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
              {['All', 'New', 'In Progress', 'Pending (Needs Info)', 'On Hold', 'Completed', 'Cancelled'].map(
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

      {/* Bulk print controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 -mt-4">
        <div className="text-sm text-gray-600">
          {selectedVisibleTickets.length > 0 ? (
            <span className="font-medium text-gray-800">
              {selectedVisibleTickets.length} ticket{selectedVisibleTickets.length === 1 ? '' : 's'} selected
            </span>
          ) : (
            <span>Select tickets below to print them together.</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedVisibleTickets.length > 0 && (
            <button
              type="button"
              onClick={() => handleToggleAllVisible(false)}
              className="px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Clear Selection
            </button>
          )}
          <button
            type="button"
            onClick={handlePrintSelected}
            disabled={selectedVisibleTickets.length === 0}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Print Selected ({selectedVisibleTickets.length})
          </button>
        </div>
      </div>

      {/* Main table */}
      <TicketsTable
        tickets={filteredTickets}
        columns={tableColumns}
        selectedTicketIds={selectedTicketIds}
        onToggleTicket={handleToggleTicket}
        onToggleAll={handleToggleAllVisible}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={`Edit Ticket #${selectedTicket?.id}`}
        maxWidth="max-w-6xl"
      >
        {selectedTicket && (
          <>
            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={() => handlePrintTicket(selectedTicket)}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900"
              >
                Print Ticket
              </button>
            </div>
            <TicketDetails
              ticket={selectedTicket}
              onClose={handleCloseModal}
              onUpdate={fetchTickets}
            />
          </>
        )}
      </Modal>
    </div>
  );
};

export default AdminTickets;
// src/components/Tickets/TicketDetails.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { notifyTicketEvent } from '../../utils/ticketNotifications'; // ✅ NEW

const ENTRY_SEPARATOR = '\n\n-----\n\n';

const TicketDetails = ({ ticket, onClose, onUpdate, mode = 'admin' }) => {
  // NEW: view-only flag for supervisors
  const isViewOnly = mode === 'supervisor';

  const [status, setStatus] = useState(ticket.status || 'New');
  const [assignedTo, setAssignedTo] = useState(ticket.assigned_to || '');
  const [users, setUsers] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // separate notes
  const [adminNote, setAdminNote] = useState('');
  const [actionNote, setActionNote] = useState('');

  // order management fields (for supply tickets)
  const [orderStatus, setOrderStatus] = useState(ticket.order_status || 'Pending Approval');
  const [qtyApproved, setQtyApproved] = useState(ticket.qty_approved || '');
  const [qtyOrdered, setQtyOrdered] = useState(ticket.qty_ordered || '');
  const [vendor, setVendor] = useState(ticket.vendor || '');
  const [trackingNumber, setTrackingNumber] = useState(ticket.tracking_number || '');
  const [expectedDelivery, setExpectedDelivery] = useState(ticket.expected_delivery || '');
  const [delivered, setDelivered] = useState(!!ticket.delivered);
  const [deliveredDate, setDeliveredDate] = useState(ticket.delivered_date || '');
  const [deliveredBy, setDeliveredBy] = useState(ticket.delivered_by || '');

  // priority reason
  const [priorityReason, setPriorityReason] = useState(ticket.priority_reason || '');

  // tabs
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'order' | 'actions'

  // print wrapper
  const printableRef = useRef(null);

  useEffect(() => {
    setStatus(ticket.status || 'New');
    setAssignedTo(ticket.assigned_to || '');
    setAdminNote('');
    setActionNote('');

    setOrderStatus(ticket.order_status || 'Pending Approval');
    setQtyApproved(ticket.qty_approved || '');
    setQtyOrdered(ticket.qty_ordered || '');
    setVendor(ticket.vendor || '');
    setTrackingNumber(ticket.tracking_number || '');
    setExpectedDelivery(ticket.expected_delivery || '');
    setDelivered(!!ticket.delivered);
    setDeliveredDate(ticket.delivered_date || '');
    setDeliveredBy(ticket.delivered_by || '');
    setPriorityReason(ticket.priority_reason || '');
    setActiveTab('details');
  }, [ticket]);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from('WEBSITE LOGINS')
        .select('Email, Title')
        .in('Title', ['Admin', 'Supervisor']);

      if (!error && data) {
        setUsers(data.map((u) => u.Email));
      }
    };
    fetchUsers();
  }, []);

  const getDeptAndType = () => {
    const dept = ticket.department;
    const type = ticket.ticket_type;

    if (dept || type) return { department: dept, ticketType: type };

    if (ticket.category) {
      const parts = ticket.category.split(': ');
      return {
        department: parts[0] || null,
        ticketType: parts[1] || null,
      };
    }
    return { department: null, ticketType: null };
  };

  const { department, ticketType } = getDeptAndType();
  const isSupplyTicket =
    ticketType === 'Office Supply Request' || !!ticket.supply_item;

  const urgency = ticket.urgency || 'Medium';
  const showPriorityReason = urgency === 'High' || urgency === 'Critical';

  const parseLog = (logText) => {
    if (!logText) return [];
    return logText
      .split(ENTRY_SEPARATOR)
      .map((entry) => entry.trim())
      .filter(Boolean);
  };

  const adminLogEntries = parseLog(ticket.admin_notes);
  const actionLogEntries = parseLog(ticket.action_log);

  const handleTrackPackage = () => {
    if (!trackingNumber) return;
    const tn = encodeURIComponent(trackingNumber.trim());
    let url = '';

    switch ((ticket.carrier || '').toLowerCase()) {
      case 'ups':
        url = `https://www.ups.com/track?tracknum=${tn}`;
        break;
      case 'usps':
        url = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`;
        break;
      case 'fedex':
        url = `https://www.fedex.com/fedextrack/?trknbr=${tn}`;
        break;
      case 'dhl':
        url = `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`;
        break;
      default:
        // fallback: Google it
        url = `https://www.google.com/search?q=${tn}`;
    }

    window.open(url, '_blank', 'noopener');
  };

  const handleSave = async () => {
    if (isViewOnly) return; // safety guard – supervisors can't save

    setIsSaving(true);
    const userName = localStorage.getItem('userName') || 'Admin';
    const userEmail = localStorage.getItem('userEmail') || null;
    const timestamp = new Date().toLocaleString();

    const updates = {
      status,
      assigned_to: assignedTo || null,
    };

    // track if this save will newly complete the ticket
    const willCompleteNow = status === 'Completed' && ticket.status !== 'Completed';

    // PRIORITY REASON
    if (showPriorityReason && priorityReason.trim()) {
      updates.priority_reason = priorityReason.trim();
    }

    // ADMIN NOTE
    if (adminNote.trim() !== '') {
      const existing = ticket.admin_notes || '';
      const newEntry = `[${userName}] ${timestamp}\n${adminNote.trim()}`;
      updates.admin_notes = existing
        ? `${existing}${ENTRY_SEPARATOR}${newEntry}`
        : newEntry;
    }

    // ACTION NOTE (manual)
    let combinedActionLog = ticket.action_log || '';
    if (actionNote.trim() !== '') {
      const newEntry = `[${userName}] ${timestamp}\n${actionNote.trim()}`;
      combinedActionLog = combinedActionLog
        ? `${combinedActionLog}${ENTRY_SEPARATOR}${newEntry}`
        : newEntry;
    }

    // ORDER MANAGEMENT (supply tickets only)
    if (isSupplyTicket) {
      updates.order_status = orderStatus;
      updates.qty_approved = qtyApproved || null;
      updates.qty_ordered = qtyOrdered || null;
      updates.vendor = vendor || null;
      updates.tracking_number = trackingNumber || null;
      updates.expected_delivery = expectedDelivery || null;
      updates.delivered = delivered;
      updates.delivered_date = deliveredDate || null;
      updates.delivered_by = deliveredBy || null;

      // auto-log order changes vs original values
      const orderChanges = [];

      if ((ticket.qty_approved || '') !== qtyApproved)
        orderChanges.push(`Qty Approved: ${qtyApproved || 'N/A'}`);
      if ((ticket.qty_ordered || '') !== qtyOrdered)
        orderChanges.push(`Qty Ordered: ${qtyOrdered || 'N/A'}`);
      if ((ticket.vendor || '') !== vendor)
        orderChanges.push(`Vendor: ${vendor || 'N/A'}`);
      if ((ticket.tracking_number || '') !== trackingNumber)
        orderChanges.push(`Tracking #: ${trackingNumber || 'N/A'}`);
      if ((ticket.expected_delivery || '') !== expectedDelivery)
        orderChanges.push(`Expected Delivery: ${expectedDelivery || 'N/A'}`);
      if (!!ticket.delivered !== delivered)
        orderChanges.push(`Delivered: ${delivered ? 'Yes' : 'No'}`);
      if ((ticket.delivered_date || '') !== deliveredDate)
        orderChanges.push(`Delivered Date: ${deliveredDate || 'N/A'}`);
      if ((ticket.delivered_by || '') !== deliveredBy)
        orderChanges.push(`Delivered By: ${deliveredBy || 'N/A'}`);

      if (orderChanges.length) {
        const changeText = orderChanges.join(' | ');
        const autoEntry = `[${userName}] ${timestamp}\n${changeText}`;
        combinedActionLog = combinedActionLog
          ? `${combinedActionLog}${ENTRY_SEPARATOR}${autoEntry}`
          : autoEntry;
      }
    }

    if (combinedActionLog !== (ticket.action_log || '')) {
      updates.action_log = combinedActionLog;
    }

    // completed meta
    if (willCompleteNow) {
      updates.completed_at = new Date().toISOString();
      updates.completed_by = userEmail;
    }

    const { error } = await supabase
      .from('tickets')
      .update(updates)
      .eq('id', ticket.id);

    setIsSaving(false);

    if (error) {
      alert('Error updating ticket: ' + error.message);
    } else {
      // ✅ If this save just completed the ticket, send completion email
      if (willCompleteNow) {
        notifyTicketEvent('completed', {
          ticketId: ticket.id,
          office: ticket.office,
          urgency: ticket.urgency,
          category: ticket.category,
          description: ticket.description,
          createdAt: ticket.created_at,
          completedAt: updates.completed_at,
          submitterEmail: ticket.agent_email,
          completedBy: updates.completed_by,
        });
      }

      onUpdate();
      onClose();
    }
  };

  const handlePrint = () => {
    if (!printableRef.current) return;

    const printContents = printableRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=900,height=650');
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Ticket #${ticket.id}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              padding: 1.5rem;
              color: #111827;
              font-size: 13px;
            }
            h1, h2, h3 { margin: 0 0 0.5rem; }
            .section {
              margin-bottom: 1rem;
              padding-bottom: 0.75rem;
              border-bottom: 1px solid #e5e7eb;
            }
            pre {
              white-space: pre-wrap;
              font-family: inherit;
            }
          </style>
        </head>
        <body>
          ${printContents}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  // Tabs: supervisors don't get "Update Ticket"
  const tabs = isViewOnly
    ? [
        { id: 'details', label: 'Details' },
        { id: 'order', label: isSupplyTicket ? 'Order & Notes' : 'Notes & Logs' },
      ]
    : [
        { id: 'details', label: 'Details' },
        { id: 'order', label: isSupplyTicket ? 'Order & Logs' : 'Notes & Logs' },
        { id: 'actions', label: 'Update Ticket' },
      ];

  return (
    <div className="space-y-4 text-sm">
      {/* TAB HEADER */}
      <div className="border-b border-gray-200">
        <nav className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs sm:text-sm border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* PRINTABLE CONTENT (all tabs, inactive ones hidden on screen but shown when printing) */}
      <div ref={printableRef} className="space-y-5">
        {/* TAB 1: DETAILS */}
        <section
          className={`${activeTab === 'details' ? 'block' : 'hidden'} print:block space-y-5`}
        >
          {/* HEADER */}
          <div className="border-b pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-800">
                Ticket #{ticket.id} {ticketType ? `– ${ticketType}` : ''}
              </h2>
              <div className="flex flex-wrap gap-2 text-xs">
                {department && (
                  <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-semibold">
                    {department}
                  </span>
                )}
                {ticket.office && (
                  <span className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                    {ticket.office}
                  </span>
                )}
                {ticket.urgency && (
                  <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 font-semibold">
                    {ticket.urgency}
                  </span>
                )}
                <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold">
                  {status || 'New'}
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Submitted{' '}
              {ticket.created_at
                ? new Date(ticket.created_at).toLocaleString()
                : 'N/A'}
            </p>
            {showPriorityReason && (
              <p className="mt-1 text-xs text-gray-600">
                Priority reason:{' '}
                <span className="font-medium">
                  {priorityReason || 'Not provided'}
                </span>
              </p>
            )}
          </div>

          {/* REQUESTER & ASSIGNMENT */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">
                Requester
              </h3>
              <p>
                <span className="font-medium text-gray-800">
                  {ticket.requester_name || 'Unknown'}
                </span>
              </p>
              <p className="text-gray-700 text-xs break-all">
                {ticket.agent_email}
              </p>
              <p className="text-gray-600 text-xs">
                Office:{' '}
                <span className="font-medium">
                  {ticket.office || 'N/A'}
                </span>
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">
                Assignment
              </h3>
              <p className="text-xs text-gray-700">
                Current status:{' '}
                <span className="font-semibold">{status || 'New'}</span>
              </p>
              <p className="text-xs text-gray-700">
                Assigned to:{' '}
                <span className="font-semibold">
                  {ticket.assigned_to || 'Unassigned'}
                </span>
              </p>
              {ticket.completed_at && (
                <p className="text-xs text-gray-500">
                  Completed{' '}
                  {new Date(ticket.completed_at).toLocaleString()}
                  {ticket.completed_by && (
                    <>
                      {' '}by{' '}
                      <span className="font-medium">
                        {ticket.completed_by}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* DESCRIPTION */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">
              Ticket Details
            </h3>
            <div className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-md p-3 max-h-56 overflow-y-auto">
              {ticket.description || (
                <span className="text-gray-400">No description</span>
              )}
            </div>
          </div>

          {/* SUPPLY DETAILS (Context) */}
          {isSupplyTicket && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-md p-3 space-y-2">
              <h3 className="text-xs font-semibold text-yellow-700 uppercase flex items-center gap-2">
                Requested Item <span>📦</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <p className="text-gray-500 text-xs">Supply Item</p>
                  <p className="font-medium text-gray-800">
                    {ticket.supply_item || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">
                    Stock on Hand
                  </p>
                  <p className="font-medium text-gray-800">
                    {ticket.supply_stock_on_hand || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Notes</p>
                  <p className="font-medium text-gray-800 whitespace-pre-wrap">
                    {ticket.supply_extra_notes || 'None'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* TAB 2: ORDER & LOGS */}
        <section
          className={`${activeTab === 'order' ? 'block' : 'hidden'} print:block space-y-5`}
        >
          {/* ORDER MANAGEMENT */}
          {isSupplyTicket && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4 space-y-4">
              <h3 className="text-xs font-bold text-gray-700 uppercase border-b border-gray-200 pb-2">
                Order Management
              </h3>

              {/* Row 1: Status & Vendor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-600">
                    Order Status
                  </label>
                  <select
                    value={orderStatus}
                    onChange={(e) => setOrderStatus(e.target.value)}
                    disabled={isViewOnly}
                    className="w-full p-2 border border-gray-300 rounded-md text-xs bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option>Pending Approval</option>
                    <option>Approved</option>
                    <option>Ordered</option>
                    <option>Shipped</option>
                    <option>Delivered</option>
                    <option>Closed</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-600">
                    Vendor
                  </label>
                  <input
                    type="text"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    disabled={isViewOnly}
                    className="w-full p-2 border border-gray-300 rounded-md text-xs disabled:bg-gray-100 disabled:text-gray-500"
                    placeholder="Amazon, Staples, etc."
                  />
                </div>
              </div>

              {/* Row 2: Quantities */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-600">
                    Qty Approved
                  </label>
                  <input
                    type="text"
                    value={qtyApproved}
                    onChange={(e) => setQtyApproved(e.target.value)}
                    disabled={isViewOnly}
                    className="w-full p-2 border border-gray-300 rounded-md text-xs disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-600">
                    Qty Ordered
                  </label>
                  <input
                    type="text"
                    value={qtyOrdered}
                    onChange={(e) => setQtyOrdered(e.target.value)}
                    disabled={isViewOnly}
                    className="w-full p-2 border border-gray-300 rounded-md text-xs disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
              </div>

              {/* Row 3: Tracking */}
              <div className="p-3 bg-white border border-gray-200 rounded-md">
                <label className="block mb-1 text-xs font-medium text-gray-600">
                  Tracking Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    disabled={isViewOnly}
                    className="flex-1 p-2 border border-gray-300 rounded-md text-xs disabled:bg-gray-100 disabled:text-gray-500"
                    placeholder="e.g. 1Z..., 9400..."
                  />
                  <button
                    type="button"
                    onClick={handleTrackPackage}
                    disabled={!trackingNumber}
                    className="px-3 py-2 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
                  >
                    Track
                  </button>
                </div>
              </div>

              {/* Row 4: Delivery Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-600">
                    Expected Delivery
                  </label>
                  <input
                    type="date"
                    value={expectedDelivery || ''}
                    onChange={(e) => setExpectedDelivery(e.target.value)}
                    disabled={isViewOnly}
                    className="w-full p-2 border border-gray-300 rounded-md text-xs disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <input
                    id="delivered"
                    type="checkbox"
                    checked={delivered}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setDelivered(checked);
                      if (checked && !deliveredDate) {
                        setDeliveredDate(new Date().toISOString().slice(0, 10));
                      }
                    }}
                    disabled={isViewOnly}
                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded disabled:text-gray-400"
                  />
                  <label
                    htmlFor="delivered"
                    className="text-xs font-medium text-gray-700"
                  >
                    Mark as Delivered
                  </label>
                </div>

                {delivered && (
                  <>
                    <div>
                      <label className="block mb-1 text-xs font-medium text-gray-600">
                        Delivered Date
                      </label>
                      <input
                        type="date"
                        value={deliveredDate || ''}
                        onChange={(e) => setDeliveredDate(e.target.value)}
                        disabled={isViewOnly}
                        className="w-full p-2 border border-gray-300 rounded-md text-xs disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-xs font-medium text-gray-600">
                        Delivered By
                      </label>
                      <input
                        type="text"
                        value={deliveredBy}
                        onChange={(e) => setDeliveredBy(e.target.value)}
                        disabled={isViewOnly}
                        className="w-full p-2 border border-gray-300 rounded-md text-xs disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* LOGS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Admin Notes log */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">
                Admin Notes
              </h3>
              {adminLogEntries.length ? (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs max-h-40 overflow-y-auto space-y-3">
                  {adminLogEntries.map((entry, idx) => (
                    <div
                      key={idx}
                      className="border-b border-gray-200 pb-2 last:border-b-0 last:pb-0"
                    >
                      <pre className="whitespace-pre-wrap text-gray-800 font-sans">
                        {entry}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs text-gray-400 italic">
                  No admin notes yet.
                </div>
              )}
            </div>

            {/* Action log */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">
                Action Log
              </h3>
              {actionLogEntries.length ? (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs max-h-40 overflow-y-auto space-y-3">
                  {actionLogEntries.map((entry, idx) => (
                    <div
                      key={idx}
                      className="border-b border-gray-200 pb-2 last:border-b-0 last:pb-0"
                    >
                      <pre className="whitespace-pre-wrap text-gray-800 font-sans">
                        {entry}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs text-gray-400 italic">
                  No actions logged yet.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* TAB 3: UPDATE TICKET – only for admin mode */}
        {!isViewOnly && (
          <section
            className={`${activeTab === 'actions' ? 'block' : 'hidden'} print:block space-y-5 pt-5 border-t`}
          >
            {/* status + assign + priority reason */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">
                  Set Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option>New</option>
                  <option>In Progress</option>
                  <option>Pending (Needs Info)</option>
                  <option>On Hold</option>
                  <option>Completed</option>
                  <option>Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">
                  Assign To...
                </label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="">Unassigned</option>
                  {users.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </select>
              </div>

              {showPriorityReason && (
                <div>
                  <label className="block mb-1 text-sm font-medium text-gray-700">
                    Priority Reason
                  </label>
                  <input
                    type="text"
                    value={priorityReason}
                    onChange={(e) => setPriorityReason(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="e.g. Internet down..."
                  />
                </div>
              )}
            </div>

            {/* New notes inputs - STACKED VERTICALLY */}
            <div className="space-y-4">
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">
                  Add Admin Note (Internal)
                </label>
                <textarea
                  rows="2"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Write a note here..."
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">
                  Add Action / Work Log Entry
                </label>
                <textarea
                  rows="2"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="Log what action you took..."
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handlePrint}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                🖨️ Print
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* For supervisors, give them a print button at the bottom */}
        {isViewOnly && (
          <div className="flex justify-between gap-3 pt-2 border-t mt-4">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              🖨️ Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketDetails;

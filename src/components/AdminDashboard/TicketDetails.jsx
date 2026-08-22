// src/components/Tickets/TicketDetails.jsx
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { notifyTicketEvent } from '../../utils/ticketNotifications';

const ENTRY_SEPARATOR = '\n\n-----\n\n';
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const TicketDetails = ({ ticket, onClose, onUpdate, mode = 'admin' }) => {
  const isViewOnly = mode === 'supervisor';

  const [status, setStatus] = useState(ticket.status || 'New');
  const [isSaving, setIsSaving] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [priorityReason, setPriorityReason] = useState(ticket.priority_reason || '');
  const [activeTab, setActiveTab] = useState('details');

  // Legacy single-item supply quantity. Kept only so older tickets still work.
  const [legacyQtyOrdered, setLegacyQtyOrdered] = useState(ticket.qty_ordered || '');

  // Multi-item inventory order lines
  const [orderLines, setOrderLines] = useState([]);
  const [orderLinesLoading, setOrderLinesLoading] = useState(false);
  const [orderLinesError, setOrderLinesError] = useState('');
  const [customItemReviews, setCustomItemReviews] = useState({});
  const [reviewingCustomId, setReviewingCustomId] = useState(null);
  const [customReviewForm, setCustomReviewForm] = useState({
    item_name: '',
    category: '',
    description: '',
    unit: '',
    review_notes: '',
    merge_target: '',
  });
  const [catalogItems, setCatalogItems] = useState([]);

  // Attachments
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [newPhotos, setNewPhotos] = useState([]);
  const [photoMessage, setPhotoMessage] = useState('');

  const printableRef = useRef(null);

  useEffect(() => {
    setStatus(ticket.status || 'New');
    setAdminNote('');
    setActionNote('');
    setPriorityReason(ticket.priority_reason || '');
    setLegacyQtyOrdered(ticket.qty_ordered || '');
    setActiveTab('details');
    setNewPhotos([]);
    setPhotoMessage('');
    setPreviewAttachment(null);
  }, [ticket]);

  useEffect(() => {
    const loadOrderLines = async () => {
      if (!ticket?.id) return;

      setOrderLinesLoading(true);
      setOrderLinesError('');

      const { data: lines, error: linesError } = await supabase
        .from('ticket_inventory_order_details')
        .select('*')
        .eq('ticket_id', ticket.id)
        .order('line_id', { ascending: true });

      if (linesError) {
        setOrderLinesError(linesError.message);
        setOrderLines([]);
        setOrderLinesLoading(false);
        return;
      }

      const nextLines = (lines || []).map((line) => ({
        ...line,
        ordered_qty_edit:
          Number(line.ordered_qty ?? 0) > 0 ? String(line.ordered_qty) : '',
      }));

      setOrderLines(nextLines);

      const customIds = nextLines.map((line) => line.custom_item_id).filter(Boolean);
      if (customIds.length) {
        const { data: customRows } = await supabase
          .from('office_inventory_custom_items')
          .select('id, approval_status, item_name, category, description, unit, location_stored, review_notes')
          .in('id', customIds);

        const map = {};
        (customRows || []).forEach((row) => {
          map[row.id] = row;
        });
        setCustomItemReviews(map);
      } else {
        setCustomItemReviews({});
      }

      setOrderLinesLoading(false);
    };

    loadOrderLines();
  }, [ticket?.id]);

  useEffect(() => {
    const loadCatalog = async () => {
      const { data } = await supabase
        .from('inventory_items')
        .select('id, item_name, category, unit')
        .eq('active', true)
        .order('category')
        .order('item_name');

      setCatalogItems(data || []);
    };

    loadCatalog();
  }, []);

  const loadAttachments = async () => {
    if (!ticket?.id) return;

    setAttachmentsLoading(true);
    setAttachmentError('');

    const { data, error } = await supabase
      .from('ticket_attachments')
      .select('id, ticket_id, storage_bucket, storage_path, file_name, mime_type, file_size, uploaded_by, created_at')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });

    if (error) {
      setAttachmentError(error.message);
      setAttachments([]);
      setAttachmentsLoading(false);
      return;
    }

    const rows = await Promise.all(
      (data || []).map(async (row) => {
        const bucket = row.storage_bucket || 'ticket-photos';
        const { data: signed, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(row.storage_path, 60 * 60);

        return {
          ...row,
          signed_url: signedError ? null : signed?.signedUrl || null,
        };
      })
    );

    setAttachments(rows);
    setAttachmentsLoading(false);
  };

  useEffect(() => {
    loadAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

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
  const isSupplyTicket = ticketType === 'Office Supply Request' || !!ticket.supply_item;
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

  const activityEntries = [
    ...actionLogEntries.map((entry, index) => ({
      id: `action-${index}`,
      type: 'action',
      label: 'Action',
      entry,
    })),
    ...adminLogEntries.map((entry, index) => ({
      id: `note-${index}`,
      type: 'note',
      label: 'Internal Note',
      entry,
    })),
  ];

  const updateOrderLineEdit = (lineId, value) => {
    setOrderLines((current) =>
      current.map((line) =>
        line.line_id === lineId ? { ...line, ordered_qty_edit: value } : line
      )
    );
  };

  const openCustomReview = (line) => {
    const custom = customItemReviews[line.custom_item_id] || {};
    setReviewingCustomId(line.custom_item_id);
    setCustomReviewForm({
      item_name: custom.item_name || line.item_name || '',
      category: custom.category || line.category || '',
      description: custom.description || line.description || '',
      unit: custom.unit || line.unit || '',
      review_notes: custom.review_notes || '',
      merge_target: '',
    });
  };

  const handleCustomItemReview = async (action) => {
    if (!reviewingCustomId || isViewOnly) return;

    setIsSaving(true);
    const { error } = await supabase.rpc('review_custom_inventory_item', {
      p_custom_item_id: reviewingCustomId,
      p_action: action,
      p_item_name: customReviewForm.item_name.trim() || null,
      p_category: customReviewForm.category.trim() || null,
      p_description: customReviewForm.description.trim() || null,
      p_unit: customReviewForm.unit.trim() || null,
      p_existing_inventory_item_id:
        action === 'merge' ? customReviewForm.merge_target || null : null,
      p_review_notes: customReviewForm.review_notes.trim() || null,
    });
    setIsSaving(false);

    if (error) {
      alert('Custom item review failed: ' + error.message);
      return;
    }

    setCustomItemReviews((current) => ({
      ...current,
      [reviewingCustomId]: {
        ...(current[reviewingCustomId] || {}),
        item_name: customReviewForm.item_name,
        category: customReviewForm.category,
        description: customReviewForm.description,
        unit: customReviewForm.unit,
        approval_status:
          action === 'create' ? 'approved' : action === 'merge' ? 'merged' : 'rejected',
      },
    }));
    setReviewingCustomId(null);
  };

  const handlePhotoSelection = (event) => {
    const files = Array.from(event.target.files || []);
    const images = files.filter((file) => file.type.startsWith('image/'));
    const oversized = images.filter((file) => file.size > MAX_PHOTO_BYTES);

    if (oversized.length) {
      setPhotoMessage('Each photo must be 8 MB or smaller.');
    } else {
      setPhotoMessage('');
    }

    const valid = images
      .filter((file) => file.size <= MAX_PHOTO_BYTES)
      .slice(0, MAX_PHOTOS);

    setNewPhotos(valid);
  };

  const removeNewPhoto = (indexToRemove) => {
    setNewPhotos((current) => current.filter((_, index) => index !== indexToRemove));
  };

  const uploadNewPhotos = async () => {
    if (!newPhotos.length || !ticket?.id) return { uploaded: 0, failed: 0 };

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;
    if (!userId) return { uploaded: 0, failed: newPhotos.length };

    let uploaded = 0;
    let failed = 0;

    for (const file of newPhotos) {
      const safeName = file.name
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-');
      const storagePath = `${userId}/${ticket.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('ticket-photos')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        console.error('Ticket photo upload failed:', uploadError);
        failed += 1;
        continue;
      }

      const { error: rowError } = await supabase.from('ticket_attachments').insert({
        ticket_id: ticket.id,
        storage_bucket: 'ticket-photos',
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        uploaded_by: userId,
      });

      if (rowError) {
        console.error('Ticket attachment row failed:', rowError);
        await supabase.storage.from('ticket-photos').remove([storagePath]);
        failed += 1;
        continue;
      }

      uploaded += 1;
    }

    return { uploaded, failed };
  };

  const handleSave = async () => {
    if (isViewOnly) return;

    setIsSaving(true);
    setPhotoMessage('');

    const userName = localStorage.getItem('userName') || 'Admin';
    const userEmail = localStorage.getItem('userEmail') || null;
    const timestamp = new Date().toLocaleString();

    const updates = {
      status,
    };

    const willCompleteNow = status === 'Completed' && ticket.status !== 'Completed';

    // Inventory tickets cannot be completed until Operations records what was
    // actually sent/ordered. This is what drives the inventory transaction.
    if (isSupplyTicket && status === 'Completed') {
      if (orderLines.length > 0) {
        const missingFulfillment = orderLines.find((line) => {
          const value = Number(line.ordered_qty_edit);
          return line.ordered_qty_edit === '' || !Number.isFinite(value) || value <= 0;
        });

        if (missingFulfillment) {
          setIsSaving(false);
          alert(
            `Enter Qty Sent / Ordered for ${missingFulfillment.item_name} before completing this ticket.`
          );
          return;
        }
      } else {
        const legacyValue = Number(legacyQtyOrdered);
        if (
          legacyQtyOrdered === '' ||
          !Number.isFinite(legacyValue) ||
          legacyValue <= 0
        ) {
          setIsSaving(false);
          alert('Enter Qty Sent / Ordered before completing this inventory ticket.');
          return;
        }
      }
    }

    if (showPriorityReason && priorityReason.trim()) {
      updates.priority_reason = priorityReason.trim();
    }

    if (adminNote.trim()) {
      const existing = ticket.admin_notes || '';
      const newEntry = `[${userName}] ${timestamp}\n${adminNote.trim()}`;
      updates.admin_notes = existing
        ? `${existing}${ENTRY_SEPARATOR}${newEntry}`
        : newEntry;
    }

    let combinedActionLog = ticket.action_log || '';
    if (actionNote.trim()) {
      const newEntry = `[${userName}] ${timestamp}\n${actionNote.trim()}`;
      combinedActionLog = combinedActionLog
        ? `${combinedActionLog}${ENTRY_SEPARATOR}${newEntry}`
        : newEntry;
    }

    if (isSupplyTicket) {
      const orderChanges = [];

      if (orderLines.length > 0) {
        const changedLines = orderLines.filter(
          (line) => Number(line.ordered_qty_edit || 0) !== Number(line.ordered_qty || 0)
        );

        changedLines.forEach((line) => {
          orderChanges.push(
            `${line.item_name}: Qty Sent ${line.ordered_qty || 0} → ${line.ordered_qty_edit || 0}`
          );
        });
      } else if ((ticket.qty_ordered || '') !== legacyQtyOrdered) {
        updates.qty_ordered = legacyQtyOrdered || null;
        orderChanges.push(`Qty Sent: ${legacyQtyOrdered || 'N/A'}`);
      }

      if (orderChanges.length) {
        const autoEntry = `[${userName}] ${timestamp}\n${orderChanges.join(' | ')}`;
        combinedActionLog = combinedActionLog
          ? `${combinedActionLog}${ENTRY_SEPARATOR}${autoEntry}`
          : autoEntry;
      }
    }

    if (combinedActionLog !== (ticket.action_log || '')) {
      updates.action_log = combinedActionLog;
    }

    if (willCompleteNow) {
      updates.completed_at = new Date().toISOString();
      updates.completed_by = userEmail;
    }

    if (isSupplyTicket && orderLines.length > 0) {
      for (const line of orderLines) {
        const nextOrdered = Math.max(0, Math.round(Number(line.ordered_qty_edit || 0)));
        const currentOrdered = Math.max(0, Math.round(Number(line.ordered_qty || 0)));

        if (nextOrdered !== currentOrdered) {
          const { error: lineError } = await supabase
            .from('ticket_inventory_items')
            .update({ ordered_qty: nextOrdered })
            .eq('id', line.line_id);

          if (lineError) {
            setIsSaving(false);
            alert(`Error updating ${line.item_name}: ${lineError.message}`);
            return;
          }
        }
      }
    }

    const { error } = await supabase
      .from('tickets')
      .update(updates)
      .eq('id', ticket.id);

    if (error) {
      setIsSaving(false);
      alert('Error updating ticket: ' + error.message);
      return;
    }

    let photoResult = { uploaded: 0, failed: 0 };
    if (newPhotos.length) {
      photoResult = await uploadNewPhotos();
    }

    if (photoResult.failed > 0) {
      setPhotoMessage(
        `${photoResult.uploaded} photo(s) uploaded and ${photoResult.failed} failed.`
      );
    }

    if (willCompleteNow) {
      const finalAdminNotes =
        typeof updates.admin_notes !== 'undefined'
          ? updates.admin_notes
          : ticket.admin_notes || null;

      try {
        await notifyTicketEvent('completed', {
          ticketId: ticket.id,
          office: ticket.office,
          urgency: ticket.urgency,
          category: ticket.category,
          description: ticket.description,
          createdAt: ticket.created_at,
          completedAt: updates.completed_at,
          submitterEmail: ticket.agent_email,
          completedBy: updates.completed_by,
          isSupplyTicket,
          supplyItem: ticket.supply_item || null,
          supplyStockOnHand: ticket.supply_stock_on_hand || null,
          supplyExtraNotes: ticket.supply_extra_notes || null,
          qtyOrdered: orderLines.length === 0 ? legacyQtyOrdered || null : null,
          adminNotes: finalAdminNotes,
        });
      } catch (notifyError) {
        console.error('Completion notification failed:', notifyError);
      }
    }

    setNewPhotos([]);
    await loadAttachments();
    setIsSaving(false);

    if (onUpdate) onUpdate();
    if (onClose) onClose();
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
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 1.5rem; color: #111827; font-size: 13px; }
            h1, h2, h3 { margin: 0 0 0.5rem; }
            pre { white-space: pre-wrap; font-family: inherit; }
            .hidden { display: block !important; }
            button, input, select, textarea { display: none !important; }
          </style>
        </head>
        <body>${printContents}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const tabs = isViewOnly
    ? [
        { id: 'details', label: 'Details' },
        { id: 'activity', label: 'Activity' },
      ]
    : [
        { id: 'details', label: 'Details' },
        { id: 'activity', label: 'Activity' },
        { id: 'update', label: 'Update' },
      ];

  const formatBytes = (value) => {
    const bytes = Number(value || 0);
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="w-full min-w-0 space-y-4 text-sm">
      <div className="border-b border-gray-200">
        <nav className="flex flex-wrap gap-5 px-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-xs sm:text-sm border-b-2 -mb-px transition-colors ${
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

      <div ref={printableRef}>
        {/* DETAILS */}
        <section className={`${activeTab === 'details' ? 'block' : 'hidden'} print:block space-y-5`}>
          <div className="border-b border-gray-200 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Ticket #{ticket.id}{ticketType ? ` – ${ticketType}` : ''}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Submitted {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : 'N/A'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px]">
                {department && (
                  <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-semibold">{department}</span>
                )}
                {ticket.office && (
                  <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 font-semibold">{ticket.office}</span>
                )}
                <span className={`px-2.5 py-1 rounded-full font-semibold ${
                  urgency === 'Critical'
                    ? 'bg-red-100 text-red-700'
                    : urgency === 'High'
                    ? 'bg-orange-100 text-orange-700'
                    : urgency === 'Medium'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>{urgency}</span>
                <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold">{status || 'New'}</span>
              </div>
            </div>

            {showPriorityReason && (
              <div className="mt-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                <span className="font-semibold">Priority reason:</span> {priorityReason || 'Not provided'}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Requester</h3>
              <div className="mt-2 font-semibold text-gray-900">{ticket.requester_name || 'Unknown'}</div>
              <div className="mt-1 text-xs text-gray-600 break-all">{ticket.agent_email || 'No email'}</div>
              <div className="mt-1 text-xs text-gray-500">Office: <span className="font-medium text-gray-700">{ticket.office || 'N/A'}</span></div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Status</h3>
              <div className="mt-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  status === 'Completed'
                    ? 'bg-green-100 text-green-700'
                    : status === 'Cancelled'
                    ? 'bg-red-100 text-red-700'
                    : status === 'In Progress'
                    ? 'bg-blue-100 text-blue-700'
                    : status === 'Pending (Needs Info)'
                    ? 'bg-amber-100 text-amber-700'
                    : status === 'On Hold'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {status || 'New'}
                </span>
              </div>
              {ticket.completed_at && (
                <div className="mt-2 text-xs leading-5 text-gray-500">
                  Completed {new Date(ticket.completed_at).toLocaleString()}
                  {ticket.completed_by ? ` by ${ticket.completed_by}` : ''}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Request Details</h3>
            <div className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-800 max-h-52 overflow-y-auto">
              {ticket.description || <span className="text-gray-400">No description provided.</span>}
            </div>
          </div>

          {isSupplyTicket && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Requested Inventory</h3>
                  <p className="mt-1 text-xs text-amber-700">Physical count reported by the office and quantity requested.</p>
                </div>
                {orderLines.length > 0 && (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 border border-amber-200">
                    {orderLines.length} item{orderLines.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {orderLinesLoading ? (
                <div className="text-xs text-gray-500">Loading requested items...</div>
              ) : orderLines.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
                  <table className="w-full table-fixed text-[11px] sm:text-xs">
                    <thead className="bg-amber-50 text-gray-600 uppercase">
                      <tr>
                        <th className="w-[58%] text-left px-3 py-2">Item</th>
                        <th className="w-[21%] text-right px-3 py-2">Actual On Hand</th>
                        <th className="w-[21%] text-right px-3 py-2">Requested</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderLines.map((line) => (
                        <tr key={line.line_id} className="border-t border-amber-100">
                          <td className="px-3 py-3">
                            <div className="font-semibold text-gray-900">{line.item_name}</div>
                            <div className="mt-0.5 text-[11px] text-gray-500">{line.category || 'Uncategorized'} · {line.unit || 'each'}</div>
                            {line.custom_item_id && (
                              <div className="mt-1 text-[10px] font-semibold text-amber-700">Custom item</div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-gray-800">{line.reported_on_hand}</td>
                          <td className="px-3 py-3 text-right font-semibold text-gray-900">{line.requested_qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border border-amber-200 bg-white p-3">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-gray-400">Item</div>
                    <div className="mt-1 font-semibold text-gray-800">{ticket.supply_item || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-gray-400">On Hand</div>
                    <div className="mt-1 font-semibold text-gray-800">{ticket.supply_stock_on_hand || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-gray-400">Notes</div>
                    <div className="mt-1 whitespace-pre-wrap text-gray-800">{ticket.supply_extra_notes || 'None'}</div>
                  </div>
                </div>
              )}

              {orderLinesError && <div className="text-xs text-red-600">{orderLinesError}</div>}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Photos & Attachments</h3>
                <p className="mt-1 text-xs text-gray-500">Photos submitted with the ticket or added by Operations.</p>
              </div>
              {attachments.length > 0 && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                  {attachments.length}
                </span>
              )}
            </div>

            {attachmentsLoading ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">Loading attachments...</div>
            ) : attachmentError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700">{attachmentError}</div>
            ) : attachments.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {attachments.map((attachment) => (
                  <button
                    key={attachment.id}
                    type="button"
                    onClick={() => attachment.signed_url && setPreviewAttachment(attachment)}
                    disabled={!attachment.signed_url}
                    className="group overflow-hidden rounded-lg border border-gray-200 bg-white text-left hover:border-blue-300 hover:shadow-sm transition disabled:cursor-default"
                  >
                    <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
                      {attachment.signed_url ? (
                        <img
                          src={attachment.signed_url}
                          alt={attachment.file_name || 'Ticket attachment'}
                          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="h-full w-full grid place-items-center text-xs text-gray-400">Preview unavailable</div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="truncate text-xs font-semibold text-gray-800">{attachment.file_name || 'Photo'}</div>
                      <div className="mt-0.5 text-[10px] text-gray-400">{formatBytes(attachment.file_size)}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-xs text-gray-400">No photos attached to this ticket.</div>
            )}
          </div>
        </section>

        {/* ACTIVITY */}
        <section className={`${activeTab === 'activity' ? 'block' : 'hidden'} print:block space-y-5`}>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Ticket Activity</h3>
            <p className="mt-1 text-xs text-gray-500">Actions and internal notes recorded while the ticket was worked.</p>
          </div>

          {activityEntries.length > 0 ? (
            <div className="relative pl-6 space-y-4 before:absolute before:left-[8px] before:top-2 before:bottom-2 before:w-px before:bg-gray-200">
              {activityEntries.map((item) => (
                <div key={item.id} className="relative rounded-lg border border-gray-200 bg-white p-4">
                  <span className={`absolute -left-[22px] top-4 h-3 w-3 rounded-full ring-4 ring-white ${item.type === 'action' ? 'bg-blue-500' : 'bg-gray-400'}`} />
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${item.type === 'action' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{item.label}</span>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5 text-gray-800">{item.entry}</pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
              <div className="text-sm font-semibold text-gray-600">No activity yet</div>
              <div className="mt-1 text-xs text-gray-400">Actions and notes will appear here as Operations works the ticket.</div>
            </div>
          )}
        </section>

        {/* UPDATE */}
        {!isViewOnly && (
          <section className={`${activeTab === 'update' ? 'block' : 'hidden'} print:block space-y-5`}>
            <div>
              <label className="block mb-1 text-xs font-semibold text-gray-700">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option>New</option>
                <option>In Progress</option>
                <option>Pending (Needs Info)</option>
                <option>On Hold</option>
                <option>Completed</option>
                <option>Cancelled</option>
              </select>
            </div>

            {showPriorityReason && (
              <div>
                <label className="block mb-1 text-xs font-semibold text-gray-700">Priority Reason</label>
                <input
                  type="text"
                  value={priorityReason}
                  onChange={(e) => setPriorityReason(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Why is this urgent?"
                />
              </div>
            )}

            {isSupplyTicket && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-blue-800">Inventory Fulfillment</h3>
                  <p className="mt-1 text-xs text-blue-700">
                    Enter what Operations actually sent or ordered. This updates system inventory automatically.
                    <span className="font-semibold"> Required before the ticket can be completed.</span>
                  </p>
                </div>

                {orderLines.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-blue-200 bg-white">
                    <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.7fr)_90px_90px_150px] gap-3 bg-blue-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                      <div>Item</div>
                      <div className="text-center">On Hand</div>
                      <div className="text-center">Requested</div>
                      <div className="text-center">Qty Sent / Ordered</div>
                    </div>

                    <div className="divide-y divide-blue-100">
                      {orderLines.map((line) => {
                        const custom = line.custom_item_id
                          ? customItemReviews[line.custom_item_id]
                          : null;
                        const customPending =
                          line.custom_item_id &&
                          (!custom || custom.approval_status === 'pending');

                        return (
                          <div
                            key={line.line_id}
                            className="grid grid-cols-2 gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1.7fr)_90px_90px_150px] sm:items-center"
                          >
                            <div className="col-span-2 min-w-0 sm:col-span-1">
                              <div className="font-semibold text-gray-900">
                                {line.item_name}
                              </div>
                              <div className="mt-0.5 text-[11px] text-gray-500">
                                {line.unit || 'each'} · {line.category || 'Uncategorized'}
                              </div>

                              {customPending && (
                                <button
                                  type="button"
                                  onClick={() => openCustomReview(line)}
                                  className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
                                >
                                  Review custom item
                                </button>
                              )}
                            </div>

                            <div className="rounded-md bg-gray-50 px-2 py-2 text-center sm:bg-transparent sm:px-0 sm:py-0">
                              <div className="text-[9px] font-bold uppercase text-gray-400 sm:hidden">
                                On Hand
                              </div>
                              <div className="mt-0.5 font-semibold text-gray-800 sm:mt-0">
                                {line.reported_on_hand}
                              </div>
                            </div>

                            <div className="rounded-md bg-gray-50 px-2 py-2 text-center sm:bg-transparent sm:px-0 sm:py-0">
                              <div className="text-[9px] font-bold uppercase text-gray-400 sm:hidden">
                                Requested
                              </div>
                              <div className="mt-0.5 font-semibold text-gray-800 sm:mt-0">
                                {line.requested_qty}
                              </div>
                            </div>

                            <div className="col-span-2 sm:col-span-1">
                              <label className="mb-1 block text-[10px] font-bold uppercase text-blue-700 sm:hidden">
                                Qty Sent / Ordered *
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={line.ordered_qty_edit}
                                onChange={(e) =>
                                  updateOrderLineEdit(line.line_id, e.target.value)
                                }
                                placeholder="Enter qty"
                                className="w-full rounded-md border border-blue-300 bg-white p-2.5 text-right text-sm font-bold text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block mb-1 text-xs font-semibold text-gray-700">Qty Sent / Ordered</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={legacyQtyOrdered}
                      onChange={(e) => setLegacyQtyOrdered(e.target.value)}
                      className="w-full max-w-xs rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                )}

                {reviewingCustomId && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                    <div>
                      <h4 className="text-xs font-bold uppercase text-amber-900">Review Custom Inventory Item</h4>
                      <p className="mt-1 text-[11px] text-amber-800">Approve as a new catalog item, merge into an existing item, or deny it.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="text-xs text-gray-700">Item Name
                        <input className="mt-1 w-full rounded-md border border-gray-300 p-2" value={customReviewForm.item_name} onChange={(e) => setCustomReviewForm((c) => ({ ...c, item_name: e.target.value }))} />
                      </label>
                      <label className="text-xs text-gray-700">Category
                        <input className="mt-1 w-full rounded-md border border-gray-300 p-2" value={customReviewForm.category} onChange={(e) => setCustomReviewForm((c) => ({ ...c, category: e.target.value }))} />
                      </label>
                      <label className="sm:col-span-2 text-xs text-gray-700">Description
                        <input className="mt-1 w-full rounded-md border border-gray-300 p-2" value={customReviewForm.description} onChange={(e) => setCustomReviewForm((c) => ({ ...c, description: e.target.value }))} />
                      </label>
                      <label className="text-xs text-gray-700">Unit
                        <input className="mt-1 w-full rounded-md border border-gray-300 p-2" value={customReviewForm.unit} onChange={(e) => setCustomReviewForm((c) => ({ ...c, unit: e.target.value }))} />
                      </label>
                      <label className="text-xs text-gray-700">Merge With Existing
                        <select className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2" value={customReviewForm.merge_target} onChange={(e) => setCustomReviewForm((c) => ({ ...c, merge_target: e.target.value }))}>
                          <option value="">Choose catalog item...</option>
                          {catalogItems.map((item) => (
                            <option key={item.id} value={item.id}>{item.item_name} · {item.unit} · {item.category}</option>
                          ))}
                        </select>
                      </label>
                      <label className="sm:col-span-2 text-xs text-gray-700">Review Notes
                        <textarea rows="2" className="mt-1 w-full rounded-md border border-gray-300 p-2" value={customReviewForm.review_notes} onChange={(e) => setCustomReviewForm((c) => ({ ...c, review_notes: e.target.value }))} />
                      </label>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => setReviewingCustomId(null)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold">Cancel</button>
                      <button type="button" onClick={() => handleCustomItemReview('reject')} disabled={isSaving} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Deny</button>
                      <button type="button" onClick={() => handleCustomItemReview('merge')} disabled={isSaving || !customReviewForm.merge_target} className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50">Merge</button>
                      <button type="button" onClick={() => handleCustomItemReview('create')} disabled={isSaving} className="rounded-md bg-green-600 px-3 py-2 text-xs font-semibold text-white">Approve & Add</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block mb-1 text-xs font-semibold text-gray-700">Action / Work Performed</label>
              <textarea
                rows="3"
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder="Example: Ordered requested supplies, replaced printer, reset connection, contacted office..."
                className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="mt-1 text-[11px] text-gray-400">This appears in the Activity timeline.</p>
            </div>

            <div>
              <label className="block mb-1 text-xs font-semibold text-gray-700">Internal Note <span className="font-normal text-gray-400">(optional)</span></label>
              <textarea
                rows="2"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Add an internal note for Operations/Admin..."
                className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label htmlFor="ticketDetailPhotos" className="text-xs font-semibold text-gray-700">Add Photos</label>
                  <p className="mt-1 text-[11px] text-gray-500">Optional · up to 5 photos · 8 MB each</p>
                </div>
                <span className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[10px] font-bold uppercase text-gray-400">Optional</span>
              </div>

              <label htmlFor="ticketDetailPhotos" className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-5 text-sm font-semibold text-gray-600 hover:border-blue-300 hover:text-blue-600">
                <span className="text-lg">＋</span> Choose Photos
                <input id="ticketDetailPhotos" type="file" accept="image/*" multiple onChange={handlePhotoSelection} className="hidden" />
              </label>

              {newPhotos.length > 0 && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {newPhotos.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-gray-700">{file.name}</div>
                        <div className="text-[10px] text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                      </div>
                      <button type="button" onClick={() => removeNewPhoto(index)} className="text-lg leading-none text-gray-400 hover:text-red-500" aria-label={`Remove ${file.name}`}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {photoMessage && <div className="mt-2 text-xs text-amber-700">{photoMessage}</div>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
              <button type="button" onClick={handlePrint} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">🖨️ Print</button>
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200">Cancel</button>
                <button type="button" onClick={handleSave} disabled={isSaving} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400">
                  {isSaving ? 'Saving...' : 'Save Update'}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      {isViewOnly && (
        <div className="flex justify-between gap-3 border-t border-gray-200 pt-3">
          <button type="button" onClick={handlePrint} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">🖨️ Print</button>
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200">Close</button>
        </div>
      )}

      {previewAttachment && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewAttachment(null)}>
          <div className="relative max-h-[92vh] max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setPreviewAttachment(null)} className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-xl text-gray-600 shadow">×</button>
            <img src={previewAttachment.signed_url} alt={previewAttachment.file_name || 'Ticket attachment'} className="max-h-[86vh] max-w-full rounded-lg object-contain shadow-2xl" />
            <div className="mt-2 text-center text-xs text-white/80">{previewAttachment.file_name}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketDetails;
// src/pages/regional/RegionalTickets.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../supabaseClient';
import ActionMenu from '../../components/AdminDashboard/ActionMenu';
import TicketDetails from '../../components/AdminDashboard/TicketDetails';
import SupervisorInventoryPanel from '../../components/Inventory/SupervisorInventoryPanel';
import { notifyTicketEvent } from '../../utils/ticketNotifications';

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

const normalizeOffice = (officeRaw = '') => {
  const match = String(officeRaw || '').match(/CA\d{3}/i);
  return match ? match[0].toUpperCase() : String(officeRaw || '').trim();
};

const normalizeRegion = (value = '') =>
  String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();

// --- Main Component --- //

const RegionalTickets = () => {
  const { user, profile } = useAuth();

  const ticketCategories = {
    'Operations Management': [
      'Office Supply Request',
      'Equipment Repair or Replacement',
      'Safety or Maintenance Concern',
      'Internet or Connectivity Issue',
      'Login or Account Reset Request',
      'Other (Operations)',
    ],
    Tax: [
      'Tax Software / SBTPG Support Needed',
      'General Tax Inquiry',
      'Other (Tax)',
    ],
    Marketing: [
      'Marketing Material Restock',
      'New Flyer or Banner Request',
      'Mascot / Max Suit Request',
      'Other (Marketing)',
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

  // Regional inventory request state. Regionals use the same inventory request
  // flow as supervisors, but may choose any office in their assigned region.
  const [workspaceTab, setWorkspaceTab] = useState('tickets');
  const [inventoryOffice, setInventoryOffice] = useState('');
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryCart, setInventoryCart] = useState([]);
  const [cartItemToAdd, setCartItemToAdd] = useState('');
  const [supplyNotes, setSupplyNotes] = useState('');
  const [customCartItemOpen, setCustomCartItemOpen] = useState(false);
  const [customCartItemForm, setCustomCartItemForm] = useState({
    item_name: '',
    category: '',
    description: '',
    unit: '',
    reported_on_hand: '',
    location_stored: '',
  });

  // Optional ticket photos.
  const [ticketPhotos, setTicketPhotos] = useState([]);
  const [photoUploadMessage, setPhotoUploadMessage] = useState('');
  const MAX_PHOTOS = 5;
  const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

  const isOfficeSupplyRequest =
    department === 'Operations Management' && category === 'Office Supply Request';

  // Ticket data + full-page detail view
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);

  // Regional access scope
  const [allowedOffices, setAllowedOffices] = useState([]);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState('');

  const currentRole = String(profile?.role || '').trim().toLowerCase();
  const assignedRegion = normalizeRegion(profile?.region);
  const isRegional = currentRole === 'regional';

  // Tabs & filters
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'mine' | 'completed'
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [filterTicketType, setFilterTicketType] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handleOpenTicketDetails = (ticket) => {
    setSelectedTicket(ticket);
    setView('details');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCloseTicketDetails = () => {
    setSelectedTicket(null);
    setView('list');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchRegionalOffices = useCallback(async () => {
    setAccessLoading(true);
    setAccessError('');

    if (!isRegional) {
      setAllowedOffices([]);
      setAccessError('Regional Tickets requires role = regional.');
      setAccessLoading(false);
      return;
    }

    if (!assignedRegion) {
      setAllowedOffices([]);
      setAccessError('No region is assigned to this Regional profile.');
      setAccessLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('office_dashboard_settings')
      .select('office_code, region')
      .order('office_code');

    if (error) {
      setAllowedOffices([]);
      setAccessError(error.message);
      setAccessLoading(false);
      return;
    }

    const offices = (data || [])
      .filter((row) => normalizeRegion(row.region) === assignedRegion)
      .map((row) => normalizeOffice(row.office_code))
      .filter(Boolean);

    setAllowedOffices(offices);

    // Default the new-ticket office to the regional's own office when possible,
    // otherwise use the first office in the region.
    setOffice((current) => {
      if (current && offices.includes(normalizeOffice(current))) return normalizeOffice(current);
      const profileOffice = normalizeOffice(profile?.office);
      if (profileOffice && offices.includes(profileOffice)) return profileOffice;
      return offices[0] || '';
    });

    setInventoryOffice((current) => {
      if (current && offices.includes(normalizeOffice(current))) return normalizeOffice(current);
      const profileOffice = normalizeOffice(profile?.office);
      if (profileOffice && offices.includes(profileOffice)) return profileOffice;
      return offices[0] || '';
    });

    setAccessLoading(false);
  }, [isRegional, assignedRegion, profile?.office]);

  const fetchTickets = useCallback(async () => {
    if (accessLoading) return;

    setLoading(true);
    setError(null);

    if (!allowedOffices.length) {
      setTickets([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .in('office', allowedOffices)
      .order('created_at', { ascending: false });

    if (error) setError(error.message);
    else setTickets(data || []);
    setLoading(false);
  }, [allowedOffices, accessLoading]);

  useEffect(() => {
    fetchRegionalOffices();
  }, [fetchRegionalOffices]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const loadInventoryItemsForOffice = useCallback(async (officeCode) => {
    const normalizedOffice = normalizeOffice(officeCode);
    if (!normalizedOffice || !allowedOffices.includes(normalizedOffice)) {
      setInventoryItems([]);
      setCartItemToAdd('');
      return;
    }

    const [catalogResult, snapshotResult] = await Promise.all([
      supabase
        .from('inventory_items')
        .select('*')
        .eq('active', true)
        .order('category')
        .order('sort_order')
        .order('item_name'),
      supabase.rpc('get_inventory_snapshot', {
        p_office_code: normalizedOffice,
        p_region: assignedRegion || null,
      }),
    ]);

    if (catalogResult.error) {
      setFormMessage(`Could not load inventory catalog: ${catalogResult.error.message}`);
      return;
    }
    if (snapshotResult.error) {
      setFormMessage(`Could not load office inventory: ${snapshotResult.error.message}`);
      return;
    }

    const snapshotByItem = new Map(
      (snapshotResult.data || []).map((row) => [row.item_id, row])
    );

    const rows = (catalogResult.data || []).map((item) => {
      const officeRow = snapshotByItem.get(item.id);
      return {
        ...item,
        current_on_hand: Number(officeRow?.current_on_hand ?? 0),
        system_inventory: Number(
          officeRow?.system_inventory ?? officeRow?.current_on_hand ?? 0
        ),
        last_reported_at: officeRow?.last_reported_at || null,
      };
    });

    setInventoryItems(rows);
    setCartItemToAdd((current) => {
      if (current && rows.some((item) => item.id === current)) return current;
      return rows[0]?.id || '';
    });
  }, [allowedOffices, assignedRegion]);

  useEffect(() => {
    if (!office) return;
    loadInventoryItemsForOffice(office);
  }, [office, loadInventoryItemsForOffice]);

  const getInventoryRowDefaults = (item) => {
    const itemId = item.item_id || item.id;
    const recordedOnHand = Number(
      item.system_inventory ?? item.current_on_hand ?? 0
    );

    return {
      cart_key: itemId,
      item_id: itemId,
      custom_item_id: null,
      is_custom: false,
      item_name: item.item_name,
      category: item.category || '',
      description: item.description || '',
      unit: item.unit || 'each',
      recorded_on_hand: Number.isFinite(recordedOnHand) ? recordedOnHand : 0,
      recorded_at: item.last_reported_at || null,
      reported_on_hand: '',
      requested_qty: '',
      location_stored: item.location_stored || '',
      notes: '',
    };
  };

  const addInventoryItemToCart = (item) => {
    if (!item) return;
    setInventoryCart((current) => {
      const id = item.item_id || item.id;
      if (current.some((row) => !row.is_custom && row.item_id === id)) return current;
      return [...current, getInventoryRowDefaults(item)];
    });
  };

  const addSelectedCatalogItemToCart = () => {
    const item = inventoryItems.find((row) => row.id === cartItemToAdd);
    if (!item) return;
    addInventoryItemToCart(item);

    const next = inventoryItems.find(
      (row) =>
        row.id !== item.id &&
        !inventoryCart.some((cartRow) => cartRow.item_id === row.id)
    );
    setCartItemToAdd(next?.id || '');
  };

  const updateInventoryCartItem = (cartKey, field, value) => {
    setInventoryCart((current) =>
      current.map((row) =>
        row.cart_key === cartKey ? { ...row, [field]: value } : row
      )
    );
  };

  const removeInventoryCartItem = (cartKey) => {
    setInventoryCart((current) =>
      current.filter((row) => row.cart_key !== cartKey)
    );
  };

  const addCustomItemToCart = () => {
    const required = [
      customCartItemForm.item_name,
      customCartItemForm.category,
      customCartItemForm.unit,
      customCartItemForm.reported_on_hand,
      customCartItemForm.location_stored,
    ];

    if (required.some((value) => String(value).trim() === '')) {
      setFormMessage(
        'For an item not listed, complete Item Name, Category, Unit, Quantity On Hand, and Location Stored.'
      );
      return;
    }

    const cartKey = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setInventoryCart((current) => [
      ...current,
      {
        cart_key: cartKey,
        item_id: null,
        custom_item_id: null,
        is_custom: true,
        item_name: customCartItemForm.item_name.trim(),
        category: customCartItemForm.category.trim(),
        description: customCartItemForm.description.trim(),
        unit: customCartItemForm.unit.trim(),
        recorded_on_hand: null,
        recorded_at: null,
        reported_on_hand: Math.max(
          0,
          Math.round(Number(customCartItemForm.reported_on_hand || 0))
        ),
        requested_qty: '',
        location_stored: customCartItemForm.location_stored.trim(),
        notes: '',
      },
    ]);

    setCustomCartItemForm({
      item_name: '',
      category: '',
      description: '',
      unit: '',
      reported_on_hand: '',
      location_stored: '',
    });
    setCustomCartItemOpen(false);
    setFormMessage('');
  };

  const buildOfficeSupplySummary = () => {
    if (!inventoryCart.length) return '';

    const lines = inventoryCart.map((row) => {
      const actualOnHand = Number(row.reported_on_hand || 0);
      const requested = Number(row.requested_qty || 0);

      if (row.is_custom) {
        return `- ${row.item_name} (item not in catalog): Actual ${actualOnHand} ${row.unit} · Request ${requested} ${row.unit}`;
      }

      const recordedOnHand = Number(row.recorded_on_hand || 0);
      const difference = actualOnHand - recordedOnHand;
      const differenceText =
        difference === 0
          ? 'matches system'
          : `${difference > 0 ? '+' : ''}${difference} vs system`;

      return `- ${row.item_name}: System ${recordedOnHand} ${row.unit} · Actual ${actualOnHand} ${row.unit} · Request ${requested} ${row.unit} · ${differenceText}`;
    });

    let summary = `Inventory order request (${inventoryCart.length} item${inventoryCart.length === 1 ? '' : 's'}):\n${lines.join('\n')}`;
    if (supplyNotes.trim()) summary += `\n\nOther details:\n${supplyNotes.trim()}`;
    return summary;
  };

  const handlePhotoSelection = (event) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const oversized = imageFiles.filter((file) => file.size > MAX_PHOTO_BYTES);

    setPhotoUploadMessage(
      oversized.length > 0 ? 'Each photo must be 8 MB or smaller.' : ''
    );

    setTicketPhotos(
      imageFiles
        .filter((file) => file.size <= MAX_PHOTO_BYTES)
        .slice(0, MAX_PHOTOS)
    );
  };

  const removePhoto = (indexToRemove) => {
    setTicketPhotos((current) =>
      current.filter((_, index) => index !== indexToRemove)
    );
  };

  const uploadTicketPhotos = async (ticketId) => {
    if (!ticketPhotos.length || !user?.id) return { uploaded: 0, failed: 0 };

    let uploaded = 0;
    let failed = 0;

    for (const file of ticketPhotos) {
      const safeName = file.name
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-');
      const storagePath = `${user.id}/${ticketId}/${Date.now()}-${safeName}`;

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

      const { error: attachmentError } = await supabase
        .from('ticket_attachments')
        .insert({
          ticket_id: ticketId,
          storage_bucket: 'ticket-photos',
          storage_path: storagePath,
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
          uploaded_by: user.id,
        });

      if (attachmentError) {
        console.error('Ticket attachment row failed:', attachmentError);
        await supabase.storage.from('ticket-photos').remove([storagePath]);
        failed += 1;
        continue;
      }

      uploaded += 1;
    }

    return { uploaded, failed };
  };

  const resetTicketForm = () => {
    const firstDept = Object.keys(ticketCategories)[0];
    const defaultOffice = inventoryOffice || allowedOffices[0] || '';
    setOffice(defaultOffice);
    setCsrName('');
    setDepartment(firstDept);
    setCategory(ticketCategories[firstDept][0]);
    setUrgency('Medium');
    setDescription('');
    setSupplyNotes('');
    setInventoryCart([]);
    setCartItemToAdd('');
    setCustomCartItemOpen(false);
    setCustomCartItemForm({
      item_name: '',
      category: '',
      description: '',
      unit: '',
      reported_on_hand: '',
      location_stored: '',
    });
    setTicketPhotos([]);
    setPhotoUploadMessage('');
  };

  // Regional creating a ticket from this screen
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return alert('Cannot perform action: user not found.');

    const regionalEmail = user.email;
    const normalizedOffice = normalizeOffice(office);
    if (!allowedOffices.includes(normalizedOffice)) {
      return alert('Choose an office in your assigned region.');
    }

    setIsSubmitting(true);
    setFormMessage('');

    let detailsSection = description.trim();

    if (isOfficeSupplyRequest) {
      if (!inventoryCart.length) {
        setIsSubmitting(false);
        setFormMessage('Add at least one inventory item to the order.');
        return;
      }

      const missingActual = inventoryCart.find(
        (row) =>
          !row.is_custom &&
          (row.reported_on_hand === '' ||
            row.reported_on_hand === null ||
            row.reported_on_hand === undefined)
      );
      if (missingActual) {
        setIsSubmitting(false);
        setFormMessage(`Enter the actual on-hand count for ${missingActual.item_name}.`);
        return;
      }

      const invalidActual = inventoryCart.find((row) => {
        const value = Number(row.reported_on_hand);
        return !Number.isFinite(value) || value < 0;
      });
      if (invalidActual) {
        setIsSubmitting(false);
        setFormMessage(`Enter a valid actual on-hand count for ${invalidActual.item_name}.`);
        return;
      }

      const invalidRequested = inventoryCart.find(
        (row) => Number(row.requested_qty || 0) <= 0
      );
      if (invalidRequested) {
        setIsSubmitting(false);
        setFormMessage(`Enter a requested quantity for ${invalidRequested.item_name}.`);
        return;
      }

      const supplySummary = buildOfficeSupplySummary();
      if (supplySummary && detailsSection) {
        detailsSection = `${supplySummary}\n\nAdditional Notes:\n${detailsSection}`;
      } else if (supplySummary) {
        detailsSection = supplySummary;
      }
    }

    const finalDescription = csrName
      ? `${csrName} - ${detailsSection || 'No additional description provided.'}`
      : detailsSection || 'No additional description provided.';

    const { data, error } = await supabase
      .from('tickets')
      .insert([
        {
          agent_email: regionalEmail,
          office: normalizedOffice,
          urgency,
          requester_name: csrName || null,
          department,
          ticket_type: category,
          category: `${department}: ${category}`,
          description: finalDescription,
          inventory_item_id: null,
          inventory_reported_on_hand: null,
          inventory_requested_qty: null,
          supply_item: isOfficeSupplyRequest
            ? `${inventoryCart.length} inventory item${inventoryCart.length === 1 ? '' : 's'}`
            : null,
          supply_stock_on_hand: null,
          supply_extra_notes: isOfficeSupplyRequest ? supplyNotes : null,
        },
      ])
      .select()
      .single();

    if (error) {
      setIsSubmitting(false);
      setFormMessage('Error: ' + error.message);
      return;
    }

    if (isOfficeSupplyRequest && data?.id) {
      const preparedOrderLines = [];

      for (const row of inventoryCart) {
        let customItemId = null;

        if (row.is_custom) {
          const { data: customItemData, error: customItemError } = await supabase
            .from('office_inventory_custom_items')
            .insert({
              office_code: normalizedOffice,
              item_name: row.item_name,
              category: row.category,
              description: row.description || null,
              unit: row.unit,
              reported_on_hand: Math.max(
                0,
                Math.round(Number(row.reported_on_hand || 0))
              ),
              location_stored: row.location_stored,
              submitted_by: user?.id,
              approval_status: 'pending',
              active: true,
            })
            .select('id')
            .single();

          if (customItemError) {
            console.error('Custom inventory item insert failed:', customItemError);
            await supabase.from('tickets').delete().eq('id', data.id);
            setIsSubmitting(false);
            setFormMessage(
              `Inventory order failed while adding ${row.item_name}: ${customItemError.message}`
            );
            return;
          }

          customItemId = customItemData.id;
        }

        preparedOrderLines.push({
          ticket_id: data.id,
          inventory_item_id: row.is_custom ? null : row.item_id,
          custom_item_id: row.is_custom ? customItemId : null,
          reported_on_hand: Math.max(
            0,
            Math.round(Number(row.reported_on_hand || 0))
          ),
          requested_qty: Math.max(
            0,
            Math.round(Number(row.requested_qty || 0))
          ),
          notes: row.notes?.trim() || null,
          created_by: user?.id || null,
        });
      }

      const { error: lineItemError } = await supabase
        .from('ticket_inventory_items')
        .insert(preparedOrderLines);

      if (lineItemError) {
        console.error('Inventory order line insert failed:', lineItemError);
        await supabase.from('tickets').delete().eq('id', data.id);
        setIsSubmitting(false);
        setFormMessage(`Inventory order failed: ${lineItemError.message}`);
        return;
      }
    }

    let photoResult = { uploaded: 0, failed: 0 };
    if (data?.id && ticketPhotos.length) {
      setPhotoUploadMessage('Uploading photos...');
      photoResult = await uploadTicketPhotos(data.id);
    }

    if (photoResult.failed > 0) {
      setFormMessage(
        `Ticket submitted. ${photoResult.uploaded} photo(s) uploaded and ${photoResult.failed} failed.`
      );
    } else if (photoResult.uploaded > 0) {
      setFormMessage(
        `Ticket submitted successfully with ${photoResult.uploaded} photo(s)!`
      );
    } else {
      setFormMessage('Ticket submitted successfully!');
    }

    try {
      await notifyTicketEvent('created', {
        ticketId: data.id,
        office: data.office,
        urgency: data.urgency,
        category: data.category,
        description: data.description,
        createdAt: data.created_at,
        submitterEmail: data.agent_email,
        submitterName: csrName || 'Regional Manager',
      });
    } catch (notifyError) {
      console.error('Failed to send ticket notification', notifyError);
    }

    resetTicketForm();
    await fetchTickets();
    setIsSubmitting(false);
    setView('list');
  };

  useEffect(() => {
    if (csrName) return;
    const name =
      profile?.full_name ||
      profile?.csr_name ||
      profile?.turborater_agent_name ||
      '';
    if (name) setCsrName(name);
  }, [profile, csrName]);

  // --- Filtered data set for main table --- //

  const filteredTickets = useMemo(() => {
    if (!user) return [];

    // 1) Start from correct tab subset
    let base = tickets;

    if (activeTab === 'all') {
      base = tickets.filter((t) => !isCompletedStatus(t.status));
    } else if (activeTab === 'mine') {
      base = tickets.filter(
        (t) => !isCompletedStatus(t.status) && t.agent_email === user.email
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

  // --- Pagination --- //

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedTickets = filteredTickets.slice(pageStartIndex, pageStartIndex + pageSize);
  const showingStart = filteredTickets.length === 0 ? 0 : pageStartIndex + 1;
  const showingEnd = Math.min(pageStartIndex + pageSize, filteredTickets.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filterDepartment, filterTicketType, filterStatus, searchTerm, pageSize]);

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

  const columnsWithAction = [
    ...commonColumns,
    {
      header: 'Action',
      cell: (ticket) => (
        <div className="whitespace-nowrap">
          <ActionMenu>
            <button
              onClick={() => handleOpenTicketDetails(ticket)}
              className="text-blue-600 hover:underline text-xs"
            >
              View Details
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
              onClick={() => handleOpenTicketDetails(ticket)}
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
    activeTab === 'completed' ? columnsForCompleted : columnsWithAction;

  // --- Render --- //

  if (loading || accessLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <h2 className="text-2xl font-semibold">Loading...</h2>
      </div>
    );
  }
  if (error || accessError) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-semibold text-red-600">
          Error: {error || accessError}
        </h2>
      </div>
    );
  }

  if (view === 'details' && selectedTicket) {
    const { department: detailDepartment, ticketType: detailTicketType } =
      getDeptAndType(selectedTicket);

    return (
      <div className="p-6 md:p-8 bg-gray-50 min-h-screen font-sans">
        <div className="max-w-7xl mx-auto space-y-5">
          <section className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
            <div className="p-5 md:p-6 border-b border-gray-200 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs font-bold tracking-wide text-blue-600 uppercase">
                  Regional Support / {assignedRegion || 'Region'}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900">
                    Ticket #{selectedTicket.id}
                  </h1>
                  <StatusBadge text={selectedTicket.status || 'New'} />
                  <UrgencyBadge urgency={selectedTicket.urgency || 'Medium'} />
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Full ticket details, activity, attachments, notes, and inventory information.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseTicketDetails}
                className="self-start rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                ← Back to Tickets
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-gray-200 border-b border-gray-200">
              <div className="bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Office</div>
                <div className="mt-1 font-bold text-gray-900">{selectedTicket.office || 'N/A'}</div>
              </div>
              <div className="bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Department</div>
                <div className="mt-1 font-bold text-gray-900">{detailDepartment || 'N/A'}</div>
              </div>
              <div className="bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Ticket Type</div>
                <div className="mt-1 font-bold text-gray-900">{detailTicketType || 'N/A'}</div>
              </div>
              <div className="bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Submitted</div>
                <div className="mt-1 font-bold text-gray-900">
                  {selectedTicket.created_at
                    ? new Date(selectedTicket.created_at).toLocaleString()
                    : 'N/A'}
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 md:p-6">
            <TicketDetails
              ticket={selectedTicket}
              onClose={handleCloseTicketDetails}
              onUpdate={async () => {
                await fetchTickets();
              }}
              mode="supervisor"
            />
          </section>
        </div>
      </div>
    );
  }

  if (view === 'form') {
    return (
      <div className="p-6 md:p-8 bg-gray-50 min-h-screen font-sans">
        <div className="bg-white shadow-lg rounded-xl max-w-6xl mx-auto overflow-hidden">
          <div className="p-5 border-b border-gray-200 flex justify-between items-center">
            <div>
              <div className="text-xs font-bold tracking-wide text-blue-600 uppercase">
                Regional Support / {assignedRegion || 'Region'}
              </div>
              <h1 className="text-xl font-semibold text-gray-800">Submit Regional Ticket</h1>
              <p className="text-sm text-gray-500 mt-1">
                Submit on behalf of any office inside your assigned region.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setView('list')}
              className="text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg"
            >
              Back to Tickets
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">Department</label>
                <select
                  value={department}
                  onChange={(e) => {
                    const newDept = e.target.value;
                    const nextCategory = ticketCategories[newDept][0];
                    setDepartment(newDept);
                    setCategory(nextCategory);
                    if (
                      newDept === 'Operations Management' &&
                      nextCategory === 'Office Supply Request' &&
                      inventoryCart.length === 0 &&
                      inventoryItems.length > 0
                    ) {
                      addInventoryItemToCart(inventoryItems[0]);
                      setCartItemToAdd(inventoryItems[1]?.id || '');
                    }
                  }}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5"
                >
                  {Object.keys(ticketCategories).map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">Ticket Type Request</label>
                <select
                  value={category}
                  onChange={(e) => {
                    const nextCategory = e.target.value;
                    setCategory(nextCategory);
                    if (
                      department === 'Operations Management' &&
                      nextCategory === 'Office Supply Request' &&
                      inventoryCart.length === 0 &&
                      inventoryItems.length > 0
                    ) {
                      addInventoryItemToCart(inventoryItems[0]);
                      setCartItemToAdd(inventoryItems[1]?.id || '');
                    }
                  }}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5"
                >
                  {ticketCategories[department].map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">Office</label>
                <select
                  value={office}
                  onChange={async (e) => {
                    const nextOffice = normalizeOffice(e.target.value);
                    setOffice(nextOffice);
                    setInventoryCart([]);
                    setSupplyNotes('');
                    await loadInventoryItemsForOffice(nextOffice);
                  }}
                  required
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5"
                >
                  <option value="">Select office</option>
                  {allowedOffices.map((officeCode) => (
                    <option key={officeCode} value={officeCode}>{officeCode}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Only offices in {assignedRegion || 'your region'} are available.</p>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">Regional Manager Name</label>
                <input
                  value={csrName}
                  onChange={(e) => setCsrName(e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block mb-2 text-sm font-medium text-gray-700">Urgency</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5"
                >
                  {urgencyOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>

            {isOfficeSupplyRequest && (
              <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-bold text-gray-900">Inventory Order</h2>
                    <p className="text-xs text-gray-600 mt-1">
                      Verify system inventory, enter a fresh physical count, then enter what the office needs.
                    </p>
                  </div>
                  <span className="rounded-full bg-white border border-blue-200 px-3 py-1 text-xs font-bold text-blue-700">
                    {inventoryCart.length} item{inventoryCart.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="space-y-3">
                  {inventoryCart.map((row) => (
                    <div key={row.cart_key} className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1.5fr)_150px_150px_150px_auto] gap-3 items-end rounded-lg border border-gray-200 bg-white p-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900">{row.item_name}</div>
                        {row.is_custom && (
                          <span className="inline-flex mt-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            Pending Catalog Review
                          </span>
                        )}
                        <div className="text-xs text-gray-500 mt-1">
                          {row.category ? `${row.category} · ` : ''}{row.unit}
                        </div>
                      </div>

                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5">
                        <div className="text-[10px] uppercase font-bold text-gray-500">System On Hand</div>
                        <div className="font-bold text-gray-900 mt-1">
                          {row.is_custom ? 'New item' : `${row.recorded_on_hand ?? 0} ${row.unit}`}
                        </div>
                      </div>

                      <label>
                        <span className="block mb-1 text-xs font-semibold text-gray-700">Actual On Hand *</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.reported_on_hand}
                          onChange={(e) => updateInventoryCartItem(row.cart_key, 'reported_on_hand', e.target.value)}
                          placeholder="Count now"
                          className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm"
                          required
                        />
                        {!row.is_custom && row.reported_on_hand !== '' && (
                          <span className={`block mt-1 text-[10px] font-semibold ${Number(row.reported_on_hand) === Number(row.recorded_on_hand || 0) ? 'text-green-600' : 'text-amber-700'}`}>
                            {Number(row.reported_on_hand) === Number(row.recorded_on_hand || 0)
                              ? 'Matches system'
                              : `${Number(row.reported_on_hand) - Number(row.recorded_on_hand || 0) > 0 ? '+' : ''}${Number(row.reported_on_hand) - Number(row.recorded_on_hand || 0)} vs system`}
                          </span>
                        )}
                      </label>

                      <label>
                        <span className="block mb-1 text-xs font-semibold text-gray-700">Request Qty *</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={row.requested_qty}
                          onChange={(e) => updateInventoryCartItem(row.cart_key, 'requested_qty', e.target.value)}
                          placeholder="0"
                          className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm"
                          required
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => removeInventoryCartItem(row.cart_key)}
                        className="min-h-[42px] rounded-lg border border-red-200 bg-white px-3 text-xs font-bold text-red-700 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end mt-4">
                  <label>
                    <span className="block mb-1 text-xs font-semibold text-gray-700">Add Another Item</span>
                    <select
                      value={cartItemToAdd}
                      onChange={(e) => setCartItemToAdd(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm"
                    >
                      <option value="">Select inventory item...</option>
                      {inventoryItems
                        .filter((item) => !inventoryCart.some((cartRow) => !cartRow.is_custom && cartRow.item_id === item.id))
                        .map((item) => (
                          <option key={item.id} value={item.id}>{item.item_name} · {item.unit}</option>
                        ))}
                    </select>
                  </label>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!cartItemToAdd}
                      onClick={addSelectedCatalogItemToCart}
                      className="min-h-[42px] rounded-lg border border-gray-300 bg-white px-4 text-xs font-bold text-gray-700 disabled:opacity-50"
                    >
                      + Add Item
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomCartItemOpen((current) => !current)}
                      className="min-h-[42px] rounded-lg border border-gray-300 bg-white px-4 text-xs font-bold text-gray-700"
                    >
                      Item Not Listed
                    </button>
                  </div>
                </div>

                {customCartItemOpen && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="font-bold text-gray-900">Add an Item Not Listed</div>
                    <p className="text-xs text-gray-600 mt-1 mb-3">
                      It will be included in this request and sent to Admin/Operations for catalog review.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        ['item_name', 'Item Name *', 'Example: Hand Soap'],
                        ['category', 'Category *', 'Breakroom, Office Supplies...'],
                        ['unit', 'Unit *', 'each, box, roll...'],
                        ['reported_on_hand', 'Quantity On Hand *', '0'],
                        ['location_stored', 'Location Stored *', 'Storage Room...'],
                      ].map(([field, label, placeholder]) => (
                        <label key={field} className={field === 'location_stored' ? 'md:col-span-2' : ''}>
                          <span className="block mb-1 text-xs font-semibold text-gray-700">{label}</span>
                          <input
                            type={field === 'reported_on_hand' ? 'number' : 'text'}
                            min={field === 'reported_on_hand' ? '0' : undefined}
                            value={customCartItemForm[field]}
                            onChange={(e) => setCustomCartItemForm((current) => ({ ...current, [field]: e.target.value }))}
                            placeholder={placeholder}
                            className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm"
                          />
                        </label>
                      ))}
                      <label className="md:col-span-2">
                        <span className="block mb-1 text-xs font-semibold text-gray-700">Description</span>
                        <input
                          value={customCartItemForm.description}
                          onChange={(e) => setCustomCartItemForm((current) => ({ ...current, description: e.target.value }))}
                          placeholder="Brand, model, size, color, or identifying details"
                          className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm"
                        />
                      </label>
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <button type="button" onClick={() => setCustomCartItemOpen(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold">Cancel</button>
                      <button type="button" onClick={addCustomItemToCart} className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-bold text-white">Add to Order</button>
                    </div>
                  </div>
                )}

                <textarea
                  rows="3"
                  value={supplyNotes}
                  onChange={(e) => setSupplyNotes(e.target.value)}
                  placeholder="Order notes (optional)..."
                  className="mt-4 w-full rounded-lg border border-gray-300 bg-white p-3 text-sm"
                />
              </section>
            )}

            <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-bold text-gray-900">Add Photos</h2>
                  <p className="text-xs text-gray-500 mt-1">Optional · up to 5 photos · 8 MB each</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-gray-500 border border-gray-200">Optional</span>
              </div>
              <label className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white p-5 text-center hover:border-blue-400">
                <span className="text-sm font-semibold text-gray-700">+ Choose photos</span>
                <input type="file" accept="image/*" multiple onChange={handlePhotoSelection} className="hidden" />
              </label>
              {photoUploadMessage && <div className="mt-2 text-xs text-amber-700">{photoUploadMessage}</div>}
              {ticketPhotos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {ticketPhotos.map((file, index) => (
                    <span key={`${file.name}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700">
                      {file.name}
                      <button type="button" onClick={() => removePhoto(index)} className="font-bold text-red-600">×</button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">Description / Notes</label>
              <textarea
                rows="5"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required={!isOfficeSupplyRequest}
                placeholder={isOfficeSupplyRequest ? 'Optional: add any extra context.' : 'Describe what you need help with.'}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-3"
              />
            </div>

            {formMessage && <p className="text-center text-sm text-gray-700">{formMessage}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- Main list view --- //

  return (
    <div className="p-6 md:p-8 bg-gray-50 min-h-screen font-sans space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Regional Tickets</h1>
        <button
          onClick={() => setView('form')}
          className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 transition-all duration-200 shadow-md hover:shadow-lg"
        >
          Submit Ticket
        </button>
      </div>

      <div className="bg-white shadow rounded-xl p-1.5 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setWorkspaceTab('tickets')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${workspaceTab === 'tickets' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Tickets
        </button>
        <button
          type="button"
          onClick={() => setWorkspaceTab('inventory')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${workspaceTab === 'inventory' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Inventory
        </button>
      </div>

      {workspaceTab === 'inventory' ? (
        <div className="space-y-4">
          <section className="bg-white shadow rounded-xl p-4 flex flex-col md:flex-row md:items-end gap-4 justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-blue-600">Regional Inventory</div>
              <h2 className="text-xl font-bold text-gray-800 mt-1">Office Inventory</h2>
              <p className="text-sm text-gray-500 mt-1">
                Select any office in {assignedRegion || 'your region'} to manage its inventory the same way a supervisor can.
              </p>
            </div>
            <label className="min-w-[240px]">
              <span className="block mb-1 text-xs font-semibold text-gray-600">Office</span>
              <select
                value={inventoryOffice}
                onChange={(e) => setInventoryOffice(normalizeOffice(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm"
              >
                {allowedOffices.map((officeCode) => (
                  <option key={officeCode} value={officeCode}>{officeCode}</option>
                ))}
              </select>
            </label>
          </section>

          {inventoryOffice && (
            <SupervisorInventoryPanel
              officeCode={inventoryOffice}
              onRequestItem={(item, row) => {
                const preloadItem = {
                  id: item.item_id || item.id,
                  item_id: item.item_id || item.id,
                  item_name: item.item_name,
                  category: item.category || '',
                  description: item.description || '',
                  unit: item.unit || 'each',
                  current_on_hand: row?.current_on_hand ?? 0,
                  system_inventory: row?.system_inventory ?? row?.current_on_hand ?? 0,
                  last_reported_at: row?.last_reported_at || null,
                  location_stored: row?.location_stored || '',
                };

                setOffice(inventoryOffice);
                loadInventoryItemsForOffice(inventoryOffice).then(() => {
                  setInventoryCart([
                    {
                      ...getInventoryRowDefaults(preloadItem),
                      requested_qty: '',
                    },
                  ]);
                });
                setDepartment('Operations Management');
                setCategory('Office Supply Request');
                setView('form');
              }}
            />
          )}
        </div>
      ) : (
        <>

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
            { key: 'mine', label: 'My Submissions' },
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
      <TicketsTable tickets={paginatedTickets} columns={tableColumns} />

      <div className="bg-white shadow rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-xs text-gray-500">
          Showing {showingStart} to {showingEnd} of {filteredTickets.length} results
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safeCurrentPage <= 1}
              className="min-w-8 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              ‹
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1)
              .slice(
                Math.max(0, Math.min(safeCurrentPage - 3, totalPages - 5)),
                Math.max(0, Math.min(safeCurrentPage - 3, totalPages - 5)) + 5
              )
              .map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setCurrentPage(pageNumber)}
                  className={`min-w-8 rounded-md border px-2 py-1.5 text-xs font-medium ${
                    pageNumber === safeCurrentPage
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {pageNumber}
                </button>
              ))}

            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={safeCurrentPage >= totalPages}
              className="min-w-8 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </div>
      </div>

        </>
      )}

    </div>
  );
};

export default RegionalTickets;
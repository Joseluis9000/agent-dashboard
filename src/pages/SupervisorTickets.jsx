// src/pages/SupervisorTickets.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import styles from '../components/SupervisorDashboard/SupervisorDashboard.module.css';
import ticketStyles from './SupervisorTickets.module.css';
import TicketDetails from '../components/AdminDashboard/TicketDetails';
import { notifyTicketEvent } from '../utils/ticketNotifications';
import SupervisorInventoryPanel from '../components/Inventory/SupervisorInventoryPanel'; // ✅ NEW

const SupervisorTickets = () => {
    const { user, profile } = useAuth();

    // Supervisors can only submit/view tickets for their own office.
    const supervisorOffice = String(profile?.office || '').trim().toUpperCase();

    // --- Data for the dynamic dropdowns (departments & ticket types) ---
    const ticketCategories = {
        "Operations Management": [
            "Office Supply Request",
            "Equipment Repair or Replacement",
            "Safety or Maintenance Concern",
            "Internet or Connectivity Issue",
            "Login or Account Reset Request",
            "Other (Operations)"
        ],
        "Tax": [
            "Tax Software / SBTPG Support Needed",
            "General Tax Inquiry",
            "Other (Tax)"
        ],
        "Marketing": [
            "Marketing Material Restock",
            "New Flyer or Banner Request",
            "Mascot / Max Suit Request",
            "Other (Marketing)"
        ],
    };

    const urgencyOptions = ['Low', 'Medium', 'High'];

    // --- Component State ---
    const [view, setView] = useState('list');
    const [myTickets, setMyTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const supervisorEmail = user?.email || localStorage.getItem('userEmail');

    // which ticket is open in the modal
    const [selectedTicket, setSelectedTicket] = useState(null);

    // Completed history controls
    const [completedSearch, setCompletedSearch] = useState('');
    const [completedRange, setCompletedRange] = useState('all');
    const [completedPage, setCompletedPage] = useState(1);
    const [completedPageSize, setCompletedPageSize] = useState(10);
    const [workspaceTab, setWorkspaceTab] = useState('tickets');

    // --- Form State ---
    const [office, setOffice] = useState('');
    const [csrName, setCsrName] = useState('');
    const [department, setDepartment] = useState(Object.keys(ticketCategories)[0]);
    const [category, setCategory] = useState(ticketCategories[Object.keys(ticketCategories)[0]][0]);
    const [urgency, setUrgency] = useState('Medium');
    const [description, setDescription] = useState('');
       const [formMessage, setFormMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Smart Office Supply Request state - multi-item inventory cart
    const [supplyNotes, setSupplyNotes] = useState('');
    const [inventoryItems, setInventoryItems] = useState([]);
    const [inventoryCart, setInventoryCart] = useState([]);
    const [cartItemToAdd, setCartItemToAdd] = useState('');
    const [customCartItemOpen, setCustomCartItemOpen] = useState(false);
    const [customCartItemForm, setCustomCartItemForm] = useState({
        item_name: '',
        category: '',
        description: '',
        unit: '',
        reported_on_hand: '',
        location_stored: '',
    });


    // Optional ticket photos
    const [ticketPhotos, setTicketPhotos] = useState([]);
    const [photoUploadMessage, setPhotoUploadMessage] = useState('');

    const MAX_PHOTOS = 5;
    const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

    const isOfficeSupplyRequest =
        department === 'Operations Management' && category === 'Office Supply Request';

    useEffect(() => {
        if (!csrName) {
            const displayName =
                profile?.full_name ||
                profile?.csr_name ||
                profile?.turborater_agent_name ||
                '';
            if (displayName) setCsrName(displayName);
        }
    }, [profile, csrName]);

    const loadInventoryItems = async () => {
        const [catalogResult, officeInventoryResult] = await Promise.all([
            supabase
                .from('inventory_items')
                .select('*')
                .eq('active', true)
                .order('category')
                .order('sort_order')
                .order('item_name'),
            supervisorOffice
                ? supabase.rpc('get_inventory_snapshot', {
                    p_office_code: supervisorOffice,
                    p_region: null,
                })
                : Promise.resolve({ data: [], error: null }),
        ]);

        if (catalogResult.error) {
            setError(catalogResult.error.message);
            return;
        }

        if (officeInventoryResult.error) {
            setError(officeInventoryResult.error.message);
            return;
        }

        const officeInventoryByItem = new Map(
            (officeInventoryResult.data || []).map((row) => [row.item_id, row])
        );

        const rows = (catalogResult.data || []).map((item) => {
            const officeRow = officeInventoryByItem.get(item.id);
            return {
                ...item,
                current_on_hand: Number(officeRow?.current_on_hand ?? 0),
                system_inventory: Number(officeRow?.system_inventory ?? officeRow?.current_on_hand ?? 0),
                last_reported_at: officeRow?.last_reported_at || null,
            };
        });

        setInventoryItems(rows);

        setCartItemToAdd((current) => {
            if (current && rows.some((item) => item.id === current)) return current;
            return rows[0]?.id || '';
        });
    };

    const validateSupervisorOffice = async () => {
        if (!supervisorOffice) {
            setError('Your supervisor profile does not have an office assigned.');
            return;
        }

        const { data, error } = await supabase
            .from('office_dashboard_settings')
            .select('office_code')
            .eq('office_code', supervisorOffice)
            .maybeSingle();

        if (error) {
            setError(error.message);
            return;
        }

        if (!data?.office_code) {
            setError(`${supervisorOffice} is not configured in office_dashboard_settings.`);
            return;
        }

        setOffice(supervisorOffice);
    };

    const fetchMyTickets = async () => {
        setLoading(true);
        if (!supervisorEmail || !supervisorOffice) {
            setMyTickets([]);
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('tickets')
            .select('*')
            .eq('agent_email', supervisorEmail)
            .eq('office', supervisorOffice)
            .order('created_at', { ascending: false });

        if (error) setError(error.message);
        else setMyTickets(data);
        setLoading(false);
    };

    useEffect(() => {
        validateSupervisorOffice();
        loadInventoryItems();
        fetchMyTickets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supervisorEmail, supervisorOffice]);

    const resetForm = () => {
        const firstDept = Object.keys(ticketCategories)[0];
        setOffice(supervisorOffice);
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
    };


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
            // Actual On Hand must be freshly entered by the supervisor.
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

    // Build a readable summary for the multi-item inventory order cart.
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
            const differenceText = difference === 0
                ? 'matches system'
                : `${difference > 0 ? '+' : ''}${difference} vs system`;

            return `- ${row.item_name}: System ${recordedOnHand} ${row.unit} · Actual ${actualOnHand} ${row.unit} · Request ${requested} ${row.unit} · ${differenceText}`;
        });

        let summary = `Inventory order request (${inventoryCart.length} item${inventoryCart.length === 1 ? '' : 's'}):\n${lines.join('\n')}`;

        if (supplyNotes.trim()) {
            summary += `\n\nOther details:\n${supplyNotes.trim()}`;
        }

        return summary;
    };

    const handlePhotoSelection = (event) => {
        const files = Array.from(event.target.files || []);

        const imageFiles = files.filter((file) => file.type.startsWith('image/'));
        const oversized = imageFiles.filter((file) => file.size > MAX_PHOTO_BYTES);

        if (oversized.length > 0) {
            setPhotoUploadMessage('Each photo must be 8 MB or smaller.');
        } else {
            setPhotoUploadMessage('');
        }

        const validFiles = imageFiles
            .filter((file) => file.size <= MAX_PHOTO_BYTES)
            .slice(0, MAX_PHOTOS);

        setTicketPhotos(validFiles);
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setFormMessage('');

        let detailsSection = description.trim();

        if (isOfficeSupplyRequest) {
            if (!inventoryCart.length) {
                setIsSubmitting(false);
                setFormMessage('Add at least one inventory item to the order.');
                return;
            }

            const missingActualOnHand = inventoryCart.find((row) => {
                if (row.is_custom) return false;
                return row.reported_on_hand === '' || row.reported_on_hand === null || row.reported_on_hand === undefined;
            });

            if (missingActualOnHand) {
                setIsSubmitting(false);
                setFormMessage(`Enter the actual on-hand count for ${missingActualOnHand.item_name}.`);
                return;
            }

            const invalidActualOnHand = inventoryCart.find((row) => {
                const value = Number(row.reported_on_hand);
                return !Number.isFinite(value) || value < 0;
            });

            if (invalidActualOnHand) {
                setIsSubmitting(false);
                setFormMessage(`Enter a valid actual on-hand count for ${invalidActualOnHand.item_name}.`);
                return;
            }

            const invalidCartItem = inventoryCart.find(
                (row) => Number(row.requested_qty || 0) <= 0
            );

            if (invalidCartItem) {
                setIsSubmitting(false);
                setFormMessage(`Enter a requested quantity for ${invalidCartItem.item_name}.`);
                return;
            }


            const supplySummary = buildOfficeSupplySummary();
            if (supplySummary && detailsSection) {
                detailsSection = `${supplySummary}\n\nAdditional Notes:\n${detailsSection}`;
            } else if (supplySummary) {
                detailsSection = supplySummary;
            }
        }

        const finalDescription = `${csrName} - ${detailsSection}`;
        const finalCategory = `${department}: ${category}`;

        // ✅ request the inserted row back so we can use it for email payload
        const { data, error } = await supabase
            .from('tickets')
            .insert([{
                agent_email: supervisorEmail,
                office: supervisorOffice, // supervisors submit only for their own office,
                // New inventory requests use ticket_inventory_items.
                // Keep legacy single-item columns null to prevent double-counting.
                inventory_item_id: null,
                inventory_reported_on_hand: null,
                inventory_requested_qty: null,
                urgency: urgency,
                category: finalCategory,
                description: finalDescription,

                // save supply details into their own columns
                supply_item: isOfficeSupplyRequest
                    ? `${inventoryCart.length} inventory item${inventoryCart.length === 1 ? '' : 's'}`
                    : null,
                supply_stock_on_hand: null,
                supply_extra_notes: isOfficeSupplyRequest ? supplyNotes : null,
            }])
            .select()
            .single();

        setIsSubmitting(false);

        if (error) {
            setFormMessage('Error: ' + error.message);
        } else {
            if (isOfficeSupplyRequest && data?.id) {
                const preparedOrderLines = [];

                for (const row of inventoryCart) {
                    let customItemId = null;

                    if (row.is_custom) {
                        const { data: customItemData, error: customItemError } = await supabase
                            .from('office_inventory_custom_items')
                            .insert({
                                office_code: supervisorOffice,
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

                    // Avoid leaving a supply ticket with no order lines.
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

            setTicketPhotos([]);
            setPhotoUploadMessage('');
            resetForm();
            fetchMyTickets();
            setView('list');

            // ✅ fire email notifications
            if (data) {
                try {
                    await notifyTicketEvent('created', {
                        ticketId: data.id,
                        office: data.office,
                        urgency: data.urgency,
                        category: data.category,
                        description: data.description,
                        createdAt: data.created_at,
                        submitterEmail: data.agent_email,
                        submitterName: csrName || 'Supervisor',
                    });
                    console.log('Ticket notification sent');
                } catch (err) {
                    console.error('Failed to send ticket notification', err);
                }
            }
        }
    };

    const activeTickets = myTickets.filter(
        (ticket) => ticket.status !== 'Completed' && ticket.status !== 'Cancelled'
    );
    const completedTickets = myTickets.filter(
        (ticket) => ticket.status === 'Completed' || ticket.status === 'Cancelled'
    );

    const filteredCompletedTickets = useMemo(() => {
        const search = completedSearch.trim().toLowerCase();
        const now = new Date();

        return completedTickets.filter((ticket) => {
            if (search) {
                const haystack = [
                    ticket.category,
                    ticket.description,
                    ticket.office,
                    ticket.completed_by,
                    ticket.assigned_to,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                if (!haystack.includes(search)) return false;
            }

            if (completedRange !== 'all') {
                const completedAt = ticket.completed_at ? new Date(ticket.completed_at) : null;
                if (!completedAt || Number.isNaN(completedAt.getTime())) return false;

                if (completedRange === '30') {
                    const cutoff = new Date(now);
                    cutoff.setDate(cutoff.getDate() - 30);
                    if (completedAt < cutoff) return false;
                }

                if (completedRange === '90') {
                    const cutoff = new Date(now);
                    cutoff.setDate(cutoff.getDate() - 90);
                    if (completedAt < cutoff) return false;
                }

                if (completedRange === 'year' && completedAt.getFullYear() !== now.getFullYear()) {
                    return false;
                }
            }

            return true;
        });
    }, [completedTickets, completedSearch, completedRange]);

    const completedTotalPages = Math.max(
        1,
        Math.ceil(filteredCompletedTickets.length / completedPageSize)
    );

    const safeCompletedPage = Math.min(completedPage, completedTotalPages);

    const pagedCompletedTickets = useMemo(() => {
        const start = (safeCompletedPage - 1) * completedPageSize;
        return filteredCompletedTickets.slice(start, start + completedPageSize);
    }, [filteredCompletedTickets, safeCompletedPage, completedPageSize]);

    useEffect(() => {
        setCompletedPage(1);
    }, [completedSearch, completedRange, completedPageSize]);

    const completedStart =
        filteredCompletedTickets.length === 0
            ? 0
            : (safeCompletedPage - 1) * completedPageSize + 1;

    const completedEnd = Math.min(
        safeCompletedPage * completedPageSize,
        filteredCompletedTickets.length
    );

    const notStarted = activeTickets.filter((t) => !t.assigned_to).length;
    const inProgress = activeTickets.filter((t) => t.assigned_to).length;
    const completedCount = completedTickets.length;
    const totalTickets = myTickets.length;

    // handlers for modal
    const handleRowClick = (ticket) => {
        setSelectedTicket(ticket);
    };

    const handleCloseDetails = () => {
        setSelectedTicket(null);
    };

    const handleTicketUpdated = () => {
        // In supervisor mode we don't expect updates, but if something changes,
        // refresh the list so status / dates stay in sync.
        fetchMyTickets();
    };

    if (loading) return <h2>Loading...</h2>;
    if (error) return <h2 style={{ color: 'red' }}>Error: {error}</h2>;

    // --- ADD TICKET FORM VIEW ---
    if (view === 'form') {
        return (
            <div className={ticketStyles.page}>
                <section className={ticketStyles.formHero}>
                    <div>
                        <div className={ticketStyles.eyebrow}>SUPERVISOR TOOLS / SUPPORT</div>
                        <h1>Submit a Ticket</h1>
                        <p>Send a support request to the appropriate department and track it from your ticket dashboard.</p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setView('list')}
                        className={ticketStyles.secondaryButton}
                    >
                        Back to Tickets
                    </button>
                </section>

                <form onSubmit={handleSubmit} className={`${styles.addTicketForm} ${ticketStyles.modernForm}`}>
                    <div className={`${styles.formField} ${ticketStyles.formField}`}>
                        <label htmlFor="department">Department</label>
                        <select
                            id="department"
                            value={department}
                            onChange={e => {
                                const newDept = e.target.value;
                                setDepartment(newDept);
                                const nextCategory = ticketCategories[newDept][0];
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
                        >
                            {Object.keys(ticketCategories).map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>
                        <small className={`${styles.helperText} ${ticketStyles.helperText}`}>
                            Operations = supplies, equipment, internet, maintenance. Tax = SBTPG / tax software. Marketing = flags, flyers, mascot.
                        </small>
                    </div>

                    <div className={`${styles.formField} ${ticketStyles.formField}`}>
                        <label htmlFor="category">Ticket Type Request</label>
                        <select
                            id="category"
                            value={category}
                            onChange={e => {
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
                        >
                            {ticketCategories[department].map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        {isOfficeSupplyRequest && (
                            <small className={`${styles.helperText} ${ticketStyles.helperText}`}>
                                Select the item and enter how much you currently have. Operations will decide what to send.
                            </small>
                        )}
                    </div>

                    <div className={`${styles.formField} ${ticketStyles.formField}`}>
                        <label htmlFor="office">Office</label>
                        <input
                            id="office"
                            type="text"
                            value={supervisorOffice || office}
                            readOnly
                            className={ticketStyles.readOnlyOffice}
                        />
                        <small className={`${styles.helperText} ${ticketStyles.helperText}`}>
                            Tickets can only be submitted for your assigned office.
                        </small>
                    </div>

                    <div className={`${styles.formField} ${ticketStyles.formField}`}>
                        <label htmlFor="csrName">Supervisor Name</label>
                        <input
                            id="csrName"
                            type="text"
                            value={csrName}
                            onChange={e => setCsrName(e.target.value)}
                        />
                    </div>

                    <div className={`${styles.formField} ${ticketStyles.formField}`}>
                        <label htmlFor="urgency">Urgency</label>
                        <select
                            id="urgency"
                            value={urgency}
                            onChange={e => setUrgency(e.target.value)}
                        >
                            {urgencyOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>

                    {/* INVENTORY ORDER CART */}
                    {isOfficeSupplyRequest && (
                        <div className={`${styles.formField} ${styles.fullWidth} ${ticketStyles.formField} ${ticketStyles.fullWidth} ${ticketStyles.supplyPanel}`}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                                <div>
                                    <label style={{ marginBottom: 0 }}>Inventory Order</label>
                                    <small className={`${styles.helperText} ${ticketStyles.helperText}`}>
                                        Add everything this office needs to one request. For every item, verify the system count, enter a fresh physical count, then enter the quantity needed.
                                    </small>
                                </div>
                                <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                                    {inventoryCart.length} item{inventoryCart.length === 1 ? '' : 's'}
                                </span>
                            </div>

                            {inventoryCart.length > 0 && (
                                <div style={{ display: 'grid', gap: '0.65rem', marginBottom: '0.9rem' }}>
                                    {inventoryCart.map((row) => (
                                        <div
                                            key={row.cart_key}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'minmax(180px, 1.4fr) minmax(120px, .65fr) minmax(130px, .7fr) minmax(130px, .7fr) auto',
                                                gap: '0.65rem',
                                                alignItems: 'end',
                                                padding: '0.75rem',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '10px',
                                                background: '#fff',
                                            }}
                                        >
                                            <div>
                                                <strong style={{ display: 'block', marginBottom: '0.2rem' }}>
                                                    {row.item_name}
                                                </strong>

                                                {row.is_custom && (
                                                    <span
                                                        style={{
                                                            display: 'inline-block',
                                                            marginBottom: '0.25rem',
                                                            padding: '0.2rem 0.45rem',
                                                            borderRadius: '999px',
                                                            background: '#fff4e5',
                                                            color: '#a96609',
                                                            fontSize: '0.68rem',
                                                            fontWeight: 800,
                                                        }}
                                                    >
                                                        Pending Catalog Review
                                                    </span>
                                                )}

                                                <small style={{ display: 'block', color: '#64748b' }}>
                                                    {row.category ? `${row.category} · ` : ''}Unit: {row.unit}
                                                </small>

                                                {row.location_stored && (
                                                    <small style={{ display: 'block', marginTop: '0.15rem', color: '#94a3b8' }}>
                                                        Stored: {row.location_stored}
                                                    </small>
                                                )}
                                            </div>

                                            <div className={ticketStyles.recordedCountBox}>
                                                <span>System On Hand</span>
                                                <strong>
                                                    {row.is_custom ? 'New item' : `${row.recorded_on_hand ?? 0} ${row.unit}`}
                                                </strong>
                                                {!row.is_custom && row.recorded_at && (
                                                    <small>
                                                        Last physical report {new Date(row.recorded_at).toLocaleDateString()}
                                                    </small>
                                                )}
                                            </div>

                                            <label style={{ margin: 0 }}>
                                                <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
                                                    Actual On Hand *
                                                </span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={row.reported_on_hand}
                                                    onChange={(e) =>
                                                        updateInventoryCartItem(row.cart_key, 'reported_on_hand', e.target.value)
                                                    }
                                                    placeholder="Count now"
                                                    style={{ width: '100%' }}
                                                    required
                                                />
                                                {!row.is_custom && row.reported_on_hand !== '' && (
                                                    <small
                                                        className={
                                                            Number(row.reported_on_hand) === Number(row.recorded_on_hand || 0)
                                                                ? ticketStyles.inventoryMatch
                                                                : ticketStyles.inventoryDifference
                                                        }
                                                    >
                                                        {Number(row.reported_on_hand) === Number(row.recorded_on_hand || 0)
                                                            ? 'Matches system count'
                                                            : `${Number(row.reported_on_hand) - Number(row.recorded_on_hand || 0) > 0 ? '+' : ''}${Number(row.reported_on_hand) - Number(row.recorded_on_hand || 0)} vs system`}
                                                    </small>
                                                )}
                                            </label>

                                            <label style={{ margin: 0 }}>
                                                <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem' }}>Request Qty</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    step="1"
                                                    value={row.requested_qty}
                                                    onChange={(e) =>
                                                        updateInventoryCartItem(row.cart_key, 'requested_qty', e.target.value)
                                                    }
                                                    placeholder="0"
                                                    style={{ width: '100%' }}
                                                    required
                                                />
                                            </label>

                                            <button
                                                type="button"
                                                onClick={() => removeInventoryCartItem(row.cart_key)}
                                                style={{
                                                    minHeight: '38px',
                                                    padding: '0 0.75rem',
                                                    border: '1px solid #fecaca',
                                                    borderRadius: '8px',
                                                    background: '#fff',
                                                    color: '#b91c1c',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(220px, 1fr) auto',
                                    gap: '0.65rem',
                                    alignItems: 'end',
                                    marginTop: '0.75rem',
                                }}
                            >
                                <label style={{ margin: 0 }}>
                                    <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
                                        Add Another Item
                                    </span>
                                    <select
                                        value={cartItemToAdd}
                                        onChange={(e) => setCartItemToAdd(e.target.value)}
                                        style={{ width: '100%' }}
                                    >
                                        <option value="">Select inventory item...</option>
                                        {inventoryItems
                                            .filter(
                                                (item) =>
                                                    !inventoryCart.some(
                                                        (cartRow) =>
                                                            !cartRow.is_custom &&
                                                            cartRow.item_id === item.id
                                                    )
                                            )
                                            .map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.item_name} · {item.unit}
                                                </option>
                                            ))}
                                    </select>
                                </label>

                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        type="button"
                                        onClick={addSelectedCatalogItemToCart}
                                        disabled={!cartItemToAdd}
                                        style={{
                                            minHeight: '40px',
                                            padding: '0 1rem',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '8px',
                                            background: '#fff',
                                            color: '#334155',
                                            fontWeight: 800,
                                            cursor: cartItemToAdd ? 'pointer' : 'not-allowed',
                                        }}
                                    >
                                        + Add Item
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setCustomCartItemOpen((current) => !current)}
                                        style={{
                                            minHeight: '40px',
                                            padding: '0 1rem',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '8px',
                                            background: customCartItemOpen ? '#f8fafc' : '#fff',
                                            color: '#334155',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Item Not Listed
                                    </button>
                                </div>
                            </div>

                            {customCartItemOpen && (
                                <div
                                    style={{
                                        marginTop: '0.85rem',
                                        padding: '0.9rem',
                                        border: '1px solid #dbe5f0',
                                        borderRadius: '10px',
                                        background: '#f8fbff',
                                    }}
                                >
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <strong style={{ display: 'block', marginBottom: '0.15rem' }}>
                                            Add an Item Not Listed
                                        </strong>
                                        <small style={{ color: '#64748b' }}>
                                            The item will be included in this order and added to your office inventory immediately.
                                            Operations/Admin will review it before adding it to the official catalog.
                                        </small>
                                    </div>

                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                            gap: '0.65rem',
                                        }}
                                    >
                                        <label style={{ margin: 0 }}>
                                            <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
                                                Item Name *
                                            </span>
                                            <input
                                                value={customCartItemForm.item_name}
                                                onChange={(e) =>
                                                    setCustomCartItemForm((current) => ({
                                                        ...current,
                                                        item_name: e.target.value,
                                                    }))
                                                }
                                                placeholder="Example: Hand Soap"
                                                style={{ width: '100%' }}
                                            />
                                        </label>

                                        <label style={{ margin: 0 }}>
                                            <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
                                                Category *
                                            </span>
                                            <input
                                                value={customCartItemForm.category}
                                                onChange={(e) =>
                                                    setCustomCartItemForm((current) => ({
                                                        ...current,
                                                        category: e.target.value,
                                                    }))
                                                }
                                                placeholder="Office Supplies, Breakroom..."
                                                style={{ width: '100%' }}
                                            />
                                        </label>

                                        <label style={{ margin: 0, gridColumn: '1 / -1' }}>
                                            <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
                                                Description
                                            </span>
                                            <input
                                                value={customCartItemForm.description}
                                                onChange={(e) =>
                                                    setCustomCartItemForm((current) => ({
                                                        ...current,
                                                        description: e.target.value,
                                                    }))
                                                }
                                                placeholder="Brand, model, size, color, or identifying details"
                                                style={{ width: '100%' }}
                                            />
                                        </label>

                                        <label style={{ margin: 0 }}>
                                            <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
                                                Unit *
                                            </span>
                                            <input
                                                value={customCartItemForm.unit}
                                                onChange={(e) =>
                                                    setCustomCartItemForm((current) => ({
                                                        ...current,
                                                        unit: e.target.value,
                                                    }))
                                                }
                                                placeholder="each, box, roll, ream..."
                                                style={{ width: '100%' }}
                                            />
                                        </label>

                                        <label style={{ margin: 0 }}>
                                            <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
                                                Quantity On Hand *
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={customCartItemForm.reported_on_hand}
                                                onChange={(e) =>
                                                    setCustomCartItemForm((current) => ({
                                                        ...current,
                                                        reported_on_hand: e.target.value,
                                                    }))
                                                }
                                                style={{ width: '100%' }}
                                            />
                                        </label>

                                        <label style={{ margin: 0, gridColumn: '1 / -1' }}>
                                            <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
                                                Location Stored *
                                            </span>
                                            <input
                                                value={customCartItemForm.location_stored}
                                                onChange={(e) =>
                                                    setCustomCartItemForm((current) => ({
                                                        ...current,
                                                        location_stored: e.target.value,
                                                    }))
                                                }
                                                placeholder="Storage Room, Break Room, Main Office..."
                                                style={{ width: '100%' }}
                                            />
                                        </label>
                                    </div>

                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'flex-end',
                                            gap: '0.5rem',
                                            marginTop: '0.75rem',
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setCustomCartItemOpen(false)}
                                            style={{
                                                minHeight: '38px',
                                                padding: '0 0.9rem',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '8px',
                                                background: '#fff',
                                                color: '#475569',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Cancel
                                        </button>

                                        <button
                                            type="button"
                                            onClick={addCustomItemToCart}
                                            style={{
                                                minHeight: '38px',
                                                padding: '0 1rem',
                                                border: '1px solid #17233b',
                                                borderRadius: '8px',
                                                background: '#17233b',
                                                color: '#fff',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Add to Order
                                        </button>
                                    </div>
                                </div>
                            )}

                            <textarea
                                rows="3"
                                placeholder="Order notes (optional)..."
                                value={supplyNotes}
                                onChange={e => setSupplyNotes(e.target.value)}
                                style={{ marginTop: '0.75rem' }}
                            />
                        </div>
                    )}

                    <div className={`${styles.formField} ${styles.fullWidth} ${ticketStyles.formField} ${ticketStyles.fullWidth} ${ticketStyles.photoPanel}`}>
                        <div className={ticketStyles.photoHeader}>
                            <div>
                                <label htmlFor="ticketPhotos">Add Photos (Optional)</label>
                                <small className={`${styles.helperText} ${ticketStyles.helperText}`}>
                                    You can attach up to 5 photos to help explain the request. Photos are especially useful for damaged equipment, office maintenance, supply issues, signs, printers, internet equipment, or anything Operations should see before responding.
                                </small>
                            </div>
                            <span className={ticketStyles.optionalBadge}>Optional</span>
                        </div>

                        <label htmlFor="ticketPhotos" className={ticketStyles.photoDropZone}>
                            <span className={ticketStyles.photoIcon}>＋</span>
                            <strong>Choose photos</strong>
                            <span>JPG, PNG, WEBP, HEIC and other image formats · max 8 MB each</span>
                            <input
                                id="ticketPhotos"
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handlePhotoSelection}
                                className={ticketStyles.photoInput}
                            />
                        </label>

                        {photoUploadMessage && (
                            <div className={ticketStyles.photoMessage}>{photoUploadMessage}</div>
                        )}

                        {ticketPhotos.length > 0 && (
                            <div className={ticketStyles.photoList}>
                                {ticketPhotos.map((file, index) => (
                                    <div key={`${file.name}-${index}`} className={ticketStyles.photoChip}>
                                        <span>
                                            {file.name}
                                            <small>{(file.size / 1024 / 1024).toFixed(1)} MB</small>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => removePhoto(index)}
                                            aria-label={`Remove ${file.name}`}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Generic description is still available for ALL tickets */}
                    <div className={`${styles.formField} ${styles.fullWidth} ${ticketStyles.formField} ${ticketStyles.fullWidth}`}>
                        <label htmlFor="description">Description / Notes</label>
                        <textarea
                            id="description"
                            rows="5"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            required={!isOfficeSupplyRequest}
                            placeholder={
                                isOfficeSupplyRequest
                                    ? 'Optional: add any extra context (deadlines, shipment issues, etc.).'
                                    : 'Describe what you need help with.'
                            }
                        />
                    </div>

                    <div className={`${styles.formActions} ${ticketStyles.formActions}`}>
                        <button type="submit" disabled={isSubmitting} className={ticketStyles.submitButton}>
                            {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
                        </button>
                    </div>

                    {formMessage && (
                        <p style={{ marginTop: '1rem', textAlign: 'center' }} className={styles.fullWidth}>
                            {formMessage}
                        </p>
                    )}
                </form>
            </div>
        );
    }

    // --- MAIN LIST VIEW ---
    const formatDate = (value) => {
        if (!value) return '—';
        return new Date(value).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const getStatusLabel = (ticket) => {
        if (ticket.status === 'Completed') return 'Completed';
        if (ticket.status === 'Cancelled') return 'Cancelled';
        return ticket.assigned_to ? 'In Progress' : 'Not Started';
    };

    const getStatusClass = (ticket) => {
        const label = getStatusLabel(ticket);
        if (label === 'Completed') return ticketStyles.statusCompleted;
        if (label === 'Cancelled') return ticketStyles.statusCancelled;
        if (label === 'In Progress') return ticketStyles.statusProgress;
        return ticketStyles.statusNew;
    };

    const cleanDescription = (ticket) => {
        const value = String(ticket.description || '').trim();
        return value || 'No description provided';
    };

    return (
        <div className={ticketStyles.page}>
            <section className={ticketStyles.hero}>
                <div>
                    <div className={ticketStyles.eyebrow}>SUPERVISOR TOOLS / SUPPORT</div>
                    <h1>Manage Tickets</h1>
                    <p>
                        Submit support requests and track updates from the operations team.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setView('form')}
                    className={ticketStyles.addButton}
                >
                    <span className={ticketStyles.addIcon}>+</span>
                    Add Ticket
                </button>
            </section>

            <div className={ticketStyles.workspaceTabs}>
                <button
                    type="button"
                    className={workspaceTab === 'tickets' ? ticketStyles.workspaceTabActive : ''}
                    onClick={() => setWorkspaceTab('tickets')}
                >
                    Manage Tickets
                </button>
                <button
                    type="button"
                    className={workspaceTab === 'inventory' ? ticketStyles.workspaceTabActive : ''}
                    onClick={() => setWorkspaceTab('inventory')}
                >
                    Inventory
                </button>
            </div>

            {workspaceTab === 'inventory' ? (
                <SupervisorInventoryPanel
                    officeCode={supervisorOffice}
                    onRequestItem={(item, row) => {
                        const preloadItem = {
                            id: item.item_id || item.id,
                            item_id: item.item_id || item.id,
                            item_name: item.item_name,
                            unit: item.unit || 'each',
                            current_on_hand: row?.current_on_hand ?? 0,
                            system_inventory: row?.system_inventory ?? row?.current_on_hand ?? 0,
                            last_reported_at: row?.last_reported_at || null,
                        };

                        setInventoryCart([
                            {
                                ...getInventoryRowDefaults(preloadItem),
                                requested_qty: '',
                            },
                        ]);

                        setCartItemToAdd(
                            inventoryItems.find(
                                (catalogItem) => catalogItem.id !== preloadItem.item_id
                            )?.id || ''
                        );

                        setDepartment('Operations Management');
                        setCategory('Office Supply Request');
                        setView('form');
                    }}
                />
            ) : (
                <>

            <section className={ticketStyles.summaryGrid}>
                <div className={`${ticketStyles.metricCard} ${ticketStyles.metricNew}`}>
                    <span>Not Started</span>
                    <strong>{notStarted}</strong>
                    <small>Waiting to be assigned</small>
                </div>
                <div className={`${ticketStyles.metricCard} ${ticketStyles.metricProgress}`}>
                    <span>In Progress</span>
                    <strong>{inProgress}</strong>
                    <small>Currently being worked</small>
                </div>
                <div className={`${ticketStyles.metricCard} ${ticketStyles.metricComplete}`}>
                    <span>Completed</span>
                    <strong>{completedCount}</strong>
                    <small>Resolved requests</small>
                </div>
                <div className={`${ticketStyles.metricCard} ${ticketStyles.metricTotal}`}>
                    <span>Total Tickets</span>
                    <strong>{totalTickets}</strong>
                    <small>All submitted requests</small>
                </div>
            </section>

            <section className={ticketStyles.sectionCard}>
                <div className={ticketStyles.sectionHeader}>
                    <div>
                        <div className={ticketStyles.sectionTitleRow}>
                            <h2>Active Tickets</h2>
                            <span className={ticketStyles.countPill}>{activeTickets.length}</span>
                        </div>
                        <p>Requests that are waiting for action or currently in progress.</p>
                    </div>
                </div>

                {activeTickets.length > 0 ? (
                    <div className={ticketStyles.tableWrap}>
                        <table className={ticketStyles.table}>
                            <thead>
                                <tr>
                                    <th>Request</th>
                                    <th>Office</th>
                                    <th>Submitted</th>
                                    <th>Status</th>
                                    <th>Assigned To</th>
                                    <th aria-label="Actions"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeTickets.map((ticket) => (
                                    <tr key={ticket.id} onClick={() => handleRowClick(ticket)}>
                                        <td>
                                            <div className={ticketStyles.requestCell}>
                                                <strong>{ticket.category || 'General Request'}</strong>
                                                <span>{cleanDescription(ticket)}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={ticketStyles.officePill}>
                                                {ticket.office || '—'}
                                            </span>
                                        </td>
                                        <td className={ticketStyles.dateCell}>
                                            {formatDate(ticket.created_at)}
                                        </td>
                                        <td>
                                            <span className={`${ticketStyles.statusPill} ${getStatusClass(ticket)}`}>
                                                <span className={ticketStyles.statusDot}></span>
                                                {getStatusLabel(ticket)}
                                            </span>
                                        </td>
                                        <td className={ticketStyles.assigneeCell}>
                                            {ticket.assigned_to || 'Unassigned'}
                                        </td>
                                        <td className={ticketStyles.actionCell}>
                                            <button
                                                type="button"
                                                className={ticketStyles.viewButton}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRowClick(ticket);
                                                }}
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={ticketStyles.emptyState}>
                        <div className={ticketStyles.emptyIcon}>✓</div>
                        <strong>No active tickets</strong>
                        <span>You’re all caught up. New requests will appear here.</span>
                    </div>
                )}
            </section>

            <section className={ticketStyles.sectionCard}>
                <div className={`${ticketStyles.sectionHeader} ${ticketStyles.completedHeader}`}>
                    <div>
                        <div className={ticketStyles.sectionTitleRow}>
                            <h2>Completed Tickets</h2>
                            <span className={ticketStyles.countPill}>{filteredCompletedTickets.length}</span>
                        </div>
                        <p>Your resolved and cancelled ticket history for {supervisorOffice || 'your office'}.</p>
                    </div>

                    <div className={ticketStyles.historyTools}>
                        <div className={ticketStyles.searchWrap}>
                            <span className={ticketStyles.searchIcon}>⌕</span>
                            <input
                                type="text"
                                value={completedSearch}
                                onChange={(e) => setCompletedSearch(e.target.value)}
                                placeholder="Search request, completed by..."
                                aria-label="Search completed tickets"
                            />
                        </div>

                        <select
                            value={completedRange}
                            onChange={(e) => setCompletedRange(e.target.value)}
                            className={ticketStyles.compactSelect}
                            aria-label="Completed ticket date range"
                        >
                            <option value="all">All Time</option>
                            <option value="30">Last 30 Days</option>
                            <option value="90">Last 90 Days</option>
                            <option value="year">This Year</option>
                        </select>

                        <select
                            value={completedPageSize}
                            onChange={(e) => setCompletedPageSize(Number(e.target.value))}
                            className={ticketStyles.compactSelect}
                            aria-label="Completed tickets per page"
                        >
                            <option value={5}>5 per page</option>
                            <option value={10}>10 per page</option>
                            <option value={25}>25 per page</option>
                        </select>
                    </div>
                </div>

                {filteredCompletedTickets.length > 0 ? (
                    <div className={ticketStyles.tableWrap}>
                        <table className={ticketStyles.table}>
                            <thead>
                                <tr>
                                    <th>Request</th>
                                    <th>Office</th>
                                    <th>Submitted</th>
                                    <th>Completed</th>
                                    <th>Completed By</th>
                                    <th aria-label="Actions"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedCompletedTickets.map((ticket) => (
                                    <tr key={ticket.id} onClick={() => handleRowClick(ticket)}>
                                        <td>
                                            <div className={ticketStyles.requestCell}>
                                                <strong>{ticket.category || 'General Request'}</strong>
                                                <span>{cleanDescription(ticket)}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={ticketStyles.officePill}>
                                                {ticket.office || '—'}
                                            </span>
                                        </td>
                                        <td className={ticketStyles.dateCell}>
                                            {formatDate(ticket.created_at)}
                                        </td>
                                        <td className={ticketStyles.dateCell}>
                                            {formatDate(ticket.completed_at)}
                                        </td>
                                        <td className={ticketStyles.assigneeCell}>
                                            {ticket.completed_by || '—'}
                                        </td>
                                        <td className={ticketStyles.actionCell}>
                                            <button
                                                type="button"
                                                className={ticketStyles.viewButton}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRowClick(ticket);
                                                }}
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={ticketStyles.emptyState}>
                        <strong>No completed tickets found</strong>
                        <span>Try changing your search or date filter.</span>
                    </div>
                )}

                <div className={ticketStyles.paginationBar}>
                    <span>
                        Showing {completedStart} to {completedEnd} of {filteredCompletedTickets.length} results
                    </span>

                    <div className={ticketStyles.paginationControls}>
                        <button
                            type="button"
                            onClick={() => setCompletedPage((page) => Math.max(1, page - 1))}
                            disabled={safeCompletedPage <= 1}
                            aria-label="Previous page"
                        >
                            ‹
                        </button>

                        {Array.from({ length: completedTotalPages }, (_, index) => index + 1)
                            .slice(
                                Math.max(0, safeCompletedPage - 3),
                                Math.max(0, safeCompletedPage - 3) + 5
                            )
                            .map((pageNumber) => (
                                <button
                                    key={pageNumber}
                                    type="button"
                                    onClick={() => setCompletedPage(pageNumber)}
                                    className={
                                        pageNumber === safeCompletedPage
                                            ? ticketStyles.pageActive
                                            : ''
                                    }
                                >
                                    {pageNumber}
                                </button>
                            ))}

                        <button
                            type="button"
                            onClick={() =>
                                setCompletedPage((page) =>
                                    Math.min(completedTotalPages, page + 1)
                                )
                            }
                            disabled={safeCompletedPage >= completedTotalPages}
                            aria-label="Next page"
                        >
                            ›
                        </button>
                    </div>
                </div>
            </section>

                </>
            )}

            {selectedTicket && (
                <div className={ticketStyles.modalBackdrop}>
                    <div className={ticketStyles.modalCard}>
                        <div className={ticketStyles.modalHeader}>
                            <div>
                                <span>Ticket Details</span>
                                <h2>Ticket #{selectedTicket.id}</h2>
                            </div>
                            <button
                                type="button"
                                onClick={handleCloseDetails}
                                className={ticketStyles.closeButton}
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>

                        <TicketDetails
                            ticket={selectedTicket}
                            onClose={handleCloseDetails}
                            onUpdate={handleTicketUpdated}
                            mode="supervisor"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupervisorTickets;
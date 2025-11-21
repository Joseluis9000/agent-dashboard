// src/pages/SupervisorTickets.jsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import styles from '../components/SupervisorDashboard/SupervisorDashboard.module.css';
import TicketDetails from '../components/AdminDashboard/TicketDetails';

const SupervisorTickets = () => {
    // --- Offices dropdown data ---
    const offices = [
        { code: 'CA010 NOBLE',      label: 'CA010 NOBLE - 1661 E NOBLE AVE VISALIA CA 93292' },
        { code: 'CA011 VISALIA',    label: 'CA011 VISALIA - 3000 NORTH DINUBA BLVD #E VISALIA CA 93291' },
        { code: 'CA012 PORTERVILLE',label: 'CA012 PORTERVILLE - 621 W OLIVE AVE PORTERVILLE CA 93257' },
        { code: 'CA016 NILES',    label: 'CA016 - NILES - 6007-3 NILES ST BAKERSFIELD CA 93306' },
        { code: 'CA022 TULARE',     label: 'CA022 TULARE - 1231 N CHERRY ST TULARE CA 93274' },
        { code: 'CA025 RIVERBANK',  label: 'CA025 RIVERBANK - 2778 PATTERSON RD RIVERBANK CA 95367' },
        { code: 'CA030 MERCED',     label: 'CA030 MERCED - 1102 W 16TH ST MERCED CA 95340' },
        { code: 'CA045 ATWATER',    label: 'CA045 ATWATER - 508 E BELLEVUE ROAD ATWATER CA 95301' },
        { code: 'CA046 TURLOCK',    label: 'CA046 TURLOCK - 1097 W MAIN ST TURLOCK CA 95382' },
        { code: 'CA047 MING',     label: 'CA047 - MING - 4437 MING AVE BAKERSFIELD CA 93309' },
        { code: 'CA048 NORRIS',   label: 'CA048 - NORRIS - 826 NORRIS RD BAKERSFIELD CA 93308' },
        { code: 'CA049 WHITE LN.',label: 'CA049 - WHITE LN. - 2090 WHITE LN BAKERSFIELD CA 93304' },
        { code: 'CA065 CROWS',      label: 'CA065 CROWS - 1940 CROWS LANDING ROAD #12 MODESTO CA 95358' },
        { code: 'CA074 CERES',      label: 'CA074 CERES - 1460 MITCHELL ROAD B MODESTO CA 95351' },
        { code: 'CA075 MODESTO',    label: 'CA075 MODESTO - 1421 E COFFEE ROAD MODESTO CA 95355' },
        { code: 'CA076 PITTSBURG',  label: 'CA076 PITTSBURG - 2110 RAILROAD AVE SUITE #120 PITTSBURG CA 94565' },
        { code: 'CA095 PATTERSON',  label: 'CA095 PATTERSON - 106 EAST LAS PALMAS AVE #F PATTERSON CA 95363' },
        { code: 'CA103 ANTIOCH',    label: 'CA103 ANTIOCH - 1894 A ST ANTIOCH CA 94509' },
        { code: 'CA104 RICHMOND',   label: 'CA104 RICHMOND - 12816 SAN PABLO AVE RICHMOND CA 94805' },
        { code: 'CA114 SAN LORENZO',label: 'CA114 SAN LORENZO - 21192 HESPERIAN BLVD SAN LORENZO CA 94580' },
        { code: 'CA117 VALLEJO',    label: 'CA117 VALLEJO - 347 PENNSYLVANIA ST VALLEJO CA 94590' },
        { code: 'CA118 HOLLISTER',  label: 'CA118 HOLLISTER - 219 SAN BENITO ST HOLLISTER CA 95023' },
        { code: 'CA119 YOSEMITE',   label: 'CA119 YOSEMITE - 1580 YOSEMITE PARKWAY MERCED CA 95340' },
        { code: 'CA131 CHULA VISTA',label: 'CA131 CHULA VISTA - 1099 3RD AVE SUITE #2 SAN DIEGO CA 91911' },
        { code: 'CA132 NATIONAL CITY', label: 'CA132 NATIONAL CITY - 640 HIGHLAND SUITE #A NATIONAL CITY CA 91950' },
        { code: 'CA133 LOGAN',      label: 'CA133 LOGAN - 508 LOGAN AVE SUITE #100 SAN DIEGO CA 92113' },
        { code: 'CA149 REDWOOD CITY', label: 'CA149 REDWOOD CITY - 3050 MIDDLEFIELD RD REDWOOD CITY CA 94063' },
        { code: 'CA150 MENLO PARK', label: 'CA150 MENLO PARK - 828 NEWBRIDGE ST MENLO PARK CA 94025' },
        { code: 'CA166 EL CAJON',   label: 'CA166 EL CAJON - 5439 EL CAJON BLVD SAN DIEGO CA 92115' },
        { code: 'CA172 BRUNDAGE', label: 'CA172 - BRUNDAGE - 102 BRUNDAGE LN BAKERSFIELD CA 93304' },
        { code: 'CA183 HENDERSON',  label: 'CA183 HENDERSON - 1140 W. HENDERSON AVE PORTERVILLE CA 93257' },
        { code: 'CA216 NAPA',       label: 'CA216 NAPA - 2560 JEFFERSON ST NAPA CA 94558' },
        { code: 'CA229 CORCORAN',   label: 'CA229 CORCORAN - 1001-C WHITLEY AVE CORCORAN CA 93212' },
        { code: 'CA230 AVENAL',     label: 'CA230 AVENAL - 745 SKYLINE BLVD AVENAL CA 93204' },
        { code: 'CA231 LIVINGSTON', label: 'CA231 LIVINGSTON - 424 MAIN ST LIVINGSTON CA 95334' },
        { code: 'CA236 SAN RAFAEL', label: 'CA236 SAN RAFAEL - 330 BELLAM BLVD UNIT #2 SAN RAFAEL CA 94901' },
        { code: 'CA238 CHOWCHILLA', label: 'CA238 CHOWCHILLA - 506 ROBERTSON BLVD CHOWCHILLA CA 93610' },
        { code: 'CA239 COALINGA',   label: 'CA239 COALINGA - 139 W. POLK ST COALINGA CA 93210' },
        { code: 'CA240 ARVIN',      label: 'CA240 - ARVIN - 773 BEAR MOUNTAIN BLVD ARVIN CA 93203' },
        { code: 'CA248 SPRINGS',    label: 'CA248 SPRINGS - 1833 SPRINGS RD UNIT #F VALLEJO CA 94591' },
        { code: 'CA249 BRAWLEY',    label: 'CA249 BRAWLEY - 182 W MAIN ST BRAWLEY CA 92227' },
        { code: 'CA250 BARRIO LOGAN', label: 'CA250 BARRIO LOGAN - 1879 LOGAN AVE SUITE #J SAN DIEGO CA 92113' },
        { code: 'CA269 EL CENTRO',  label: 'CA269 EL CENTRO - 444 S 4TH STREET EL CENTRO CA 92243' },
        { code: 'CA270 LA PUENTE',  label: 'CA270 LA PUENTE - 1269 N HACIENDA BLVD LA PUENTE CA 91744' },
    ];

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

    // Office supply items – dropdown list, no brands
    const officeSupplyItems = [
        'Printer Paper',
        'Pens',
        'Policy Jackets',
        'Toner / Drums',
        'Toilet Paper',
        'Hand Towels',
        'Air Freshener',
        'Desk Cleaner',
        'Disinfectant Wipes',
        'Hand Sanitizer',
        'Other (type in notes)',
    ];

    // --- Component State ---
    const [view, setView] = useState('list');
    const [myTickets, setMyTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const supervisorEmail = localStorage.getItem('userEmail');

    // which ticket is open in the modal
    const [selectedTicket, setSelectedTicket] = useState(null);

    // --- Form State ---
    const [office, setOffice] = useState(offices[0].code);
    const [csrName, setCsrName] = useState('');
    const [department, setDepartment] = useState(Object.keys(ticketCategories)[0]);
    const [category, setCategory] = useState(ticketCategories[Object.keys(ticketCategories)[0]][0]);
    const [urgency, setUrgency] = useState('Medium');
    const [description, setDescription] = useState('');
    const [formMessage, setFormMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Smart “Office Supply Request” state – single item + current stock
    const [supplyItem, setSupplyItem] = useState(officeSupplyItems[0]);
    const [supplyCurrentStock, setSupplyCurrentStock] = useState('');
    const [supplyNotes, setSupplyNotes] = useState('');

    const isOfficeSupplyRequest =
        department === 'Operations Management' && category === 'Office Supply Request';

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resetForm = () => {
        const firstDept = Object.keys(ticketCategories)[0];
        setOffice(offices[0].code);
        setCsrName('');
        setDepartment(firstDept);
        setCategory(ticketCategories[firstDept][0]);
        setUrgency('Medium');
        setDescription('');
        setSupplyItem(officeSupplyItems[0]);
        setSupplyCurrentStock('');
        setSupplyNotes('');
    };

    // Build summary using CURRENT STOCK ON HAND for the selected item
    const buildOfficeSupplySummary = () => {
        let summary = `Current supply stock:\n- Item: ${supplyItem}\n- Current stock: ${supplyCurrentStock || 'Not provided'}`;

        if (supplyNotes.trim()) {
            summary += `\n\nOther details:\n${supplyNotes.trim()}`;
        }

        return summary;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setFormMessage('');

        let detailsSection = description.trim();

        if (isOfficeSupplyRequest) {
            const supplySummary = buildOfficeSupplySummary();
            if (supplySummary && detailsSection) {
                detailsSection = `${supplySummary}\n\nAdditional Notes:\n${detailsSection}`;
            } else if (supplySummary) {
                detailsSection = supplySummary;
            }
        }

        const finalDescription = `${csrName} - ${detailsSection}`;
        const finalCategory = `${department}: ${category}`;

        const { error } = await supabase
            .from('tickets')
            .insert([{
                agent_email: supervisorEmail,
                office: office, // saves e.g. "CA046 TURLOCK"
                urgency: urgency,
                category: finalCategory,
                description: finalDescription,

                // ✅ NEW: save supply details into their own columns
                supply_item: isOfficeSupplyRequest ? supplyItem : null,
                supply_stock_on_hand: isOfficeSupplyRequest ? supplyCurrentStock : null,
                supply_extra_notes: isOfficeSupplyRequest ? supplyNotes : null,
            }]);

        setIsSubmitting(false);
        if (error) {
            setFormMessage('Error: ' + error.message);
        } else {
            setFormMessage('Ticket submitted successfully!');
            resetForm();
            fetchMyTickets();
            setView('list');
        }
    };

   

    const activeTickets = myTickets.filter(ticket => ticket.status !== 'Completed' && ticket.status !== 'Cancelled');
    const completedTickets = myTickets.filter(ticket => ticket.status === 'Completed' || ticket.status === 'Cancelled');

    const notStarted = activeTickets.filter(t => !t.assigned_to).length;
    const inProgress = activeTickets.filter(t => t.assigned_to).length;
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
            <div>
                <div className={styles.pageHeader}>
                    <h1>Add Ticket</h1>
                    <button onClick={() => setView('list')} className={styles.backButton}>Back</button>
                </div>

                <form onSubmit={handleSubmit} className={styles.addTicketForm}>
                    <div className={styles.formField}>
                        <label htmlFor="department">Department</label>
                        <select
                            id="department"
                            value={department}
                            onChange={e => {
                                const newDept = e.target.value;
                                setDepartment(newDept);
                                setCategory(ticketCategories[newDept][0]);
                            }}
                        >
                            {Object.keys(ticketCategories).map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>
                        <small className={styles.helperText}>
                            Operations = supplies, equipment, internet, maintenance. Tax = SBTPG / tax software. Marketing = flags, flyers, mascot.
                        </small>
                    </div>

                    <div className={styles.formField}>
                        <label htmlFor="category">Ticket Type Request</label>
                        <select
                            id="category"
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                        >
                            {ticketCategories[department].map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        {isOfficeSupplyRequest && (
                            <small className={styles.helperText}>
                                Select the item and enter how much you currently have. Operations will decide what to send.
                            </small>
                        )}
                    </div>

                    <div className={styles.formField}>
                        <label htmlFor="office">Office</label>
                        <select
                            id="office"
                            value={office}
                            onChange={e => setOffice(e.target.value)}
                            required
                        >
                            {offices.map(o => (
                                <option key={o.code} value={o.code}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.formField}>
                        <label htmlFor="csrName">Supervisor Name</label>
                        <input
                            id="csrName"
                            type="text"
                            value={csrName}
                            onChange={e => setCsrName(e.target.value)}
                        />
                    </div>

                    <div className={styles.formField}>
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

                    {/* SMART SECTION: Office Supply Request (Dropdown + current stock) */}
                    {isOfficeSupplyRequest && (
                        <div className={`${styles.formField} ${styles.fullWidth}`}>
                            <label>Office Supply – Current Stock</label>

                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '1rem',
                                    marginTop: '0.5rem',
                                }}
                            >
                                <div style={{ minWidth: '220px', flex: '1 1 220px' }}>
                                    <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                                        Supply Item
                                    </span>
                                    <select
                                        value={supplyItem}
                                        onChange={e => setSupplyItem(e.target.value)}
                                        style={{ width: '100%' }}
                                    >
                                        {officeSupplyItems.map(item => (
                                            <option key={item} value={item}>{item}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ minWidth: '220px', flex: '1 1 220px' }}>
                                    <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                                        Current Stock on Hand
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="e.g. 2 boxes, 10 rolls, 5 bottles"
                                        value={supplyCurrentStock}
                                        onChange={e => setSupplyCurrentStock(e.target.value)}
                                        style={{ width: '100%' }}
                                        required
                                    />
                                </div>
                            </div>

                            <textarea
                                rows="3"
                                placeholder="Any extra notes about this item (how fast it’s being used, special situations, etc.)..."
                                value={supplyNotes}
                                onChange={e => setSupplyNotes(e.target.value)}
                                style={{ marginTop: '0.75rem' }}
                            />
                        </div>
                    )}

                    {/* Generic description is still available for ALL tickets */}
                    <div className={`${styles.formField} ${styles.fullWidth}`}>
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

                    <div className={styles.formActions}>
                        <button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Submitting...' : 'Submit'}
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
    return (
        <div>
            {/* Summary Cards */}
            <div className={styles.summaryCards}>
                <div className={styles.summaryCard} style={{borderLeftColor: '#e74c3c'}}>
                    <h4>Not Started</h4>
                    <p>{notStarted}</p>
                </div>
                <div className={styles.summaryCard} style={{borderLeftColor: '#f39c12'}}>
                    <h4>In Progress</h4>
                    <p>{inProgress}</p>
                </div>
                <div className={styles.summaryCard} style={{borderLeftColor: '#2ecc71'}}>
                    <h4>Completed</h4>
                    <p>{completedCount}</p>
                </div>
                <div className={styles.summaryCard}>
                    <h4>Total</h4>
                    <p>{totalTickets}</p>
                </div>
            </div>

            {/* Header and Add Ticket Button */}
            <div className={styles.pageHeader}>
                <h1>Manage Your Submitted Tickets</h1>
                <button onClick={() => setView('form')} className={styles.primaryActionButton}>
                    Add Ticket
                </button>
            </div>

            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#7f8c8d' }}>
                Click <strong>View</strong> on any ticket to see full details, order status, and notes.
            </p>

            {/* Active Tickets Table */}
            <h2 style={{marginTop: '2rem', borderBottom: '1px solid #2c3e50', paddingBottom: '0.5rem'}}>
                Your Active Tickets
            </h2>
            <table className={styles.ticketsTable}>
                <thead>
                    <tr>
                        <th>Req. Type</th>
                        <th>Description</th>
                        <th>Date Submitted</th>
                        <th>Status</th>
                        <th>Assigned To</th>
                        <th>Details</th> {/* NEW */}
                    </tr>
                </thead>
                <tbody>
                    {activeTickets.length > 0 ? (
                        activeTickets.map(ticket => (
                            <tr
                                key={ticket.id}
                                onClick={() => handleRowClick(ticket)}
                                style={{ cursor: 'pointer' }}
                            >
                                <td>{ticket.category}</td>
                                <td>{ticket.description}</td>
                                <td>{new Date(ticket.created_at).toLocaleDateString()}</td>
                                <td>
                                    <span className={`${styles.badge} ${styles[ticket.status?.toLowerCase()]}`}>
                                        {ticket.status}
                                    </span>
                                </td>
                                <td>{ticket.assigned_to || 'Unassigned'}</td>
                                <td
                                    onClick={e => {
                                        e.stopPropagation(); // don't trigger row click twice
                                        handleRowClick(ticket);
                                    }}
                                >
                                    <button
                                        type="button"
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '0.8rem',
                                            borderRadius: '999px',
                                            border: '1px solid #3498db',
                                            background: '#fff',
                                            color: '#3498db',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        View
                                    </button>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="6" style={{textAlign: 'center', padding: '20px'}}>
                                You have no active tickets.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Completed Tickets Table */}
            <h2 style={{marginTop: '2rem', borderBottom: '1px solid #2c3e50', paddingBottom: '0.5rem'}}>
                Your Completed Tickets
            </h2>
            <table className={styles.ticketsTable}>
                <thead>
                    <tr>
                        <th>Req. Type</th>
                        <th>Description</th>
                        <th>Date Submitted</th>
                        <th>Date Completed</th>
                        <th>Completed By</th>
                        <th>Details</th> {/* NEW */}
                    </tr>
                </thead>
                <tbody>
                    {completedTickets.length > 0 ? (
                        completedTickets.map(ticket => (
                            <tr
                                key={ticket.id}
                                onClick={() => handleRowClick(ticket)}
                                style={{ cursor: 'pointer' }}
                            >
                                <td>{ticket.category}</td>
                                <td>{ticket.description}</td>
                                <td>{new Date(ticket.created_at).toLocaleDateString()}</td>
                                <td>{ticket.completed_at ? new Date(ticket.completed_at).toLocaleDateString() : 'N/A'}</td>
                                <td>{ticket.completed_by}</td>
                                <td
                                    onClick={e => {
                                        e.stopPropagation();
                                        handleRowClick(ticket);
                                    }}
                                >
                                    <button
                                        type="button"
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '0.8rem',
                                            borderRadius: '999px',
                                            border: '1px solid #3498db',
                                            background: '#fff',
                                            color: '#3498db',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        View
                                    </button>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="6" style={{textAlign: 'center', padding: '20px'}}>
                                No tickets have been completed yet.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* DETAILS MODAL */}
            {selectedTicket && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                    }}
                >
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: '8px',
                            maxWidth: '900px',
                            width: '95%',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            padding: '1.5rem',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                                Ticket #{selectedTicket.id}
                            </h2>
                            <button
                                onClick={handleCloseDetails}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer',
                                    lineHeight: 1,
                                }}
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

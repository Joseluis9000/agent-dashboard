import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { supabase } from '../supabaseClient'; // <-- path from /src/pages
import './TicketingSystem.css';
import { listOffices } from './admin/officeManagement/officeService';

/* ---------- Small datetime helper ---------- */
// Add minutes to a `datetime-local` string and return the same format (YYYY-MM-DDTHH:mm)
const addMinutesLocal = (startStr, mins) => {
  if (!startStr) return '';
  const d = new Date(startStr); // parsed in local time
  if (Number.isNaN(d.getTime())) return '';
  d.setMinutes(d.getMinutes() + mins);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* Use the same read-only directory service as Admin Office Management. */
const TRANSACTION_TYPES = [
  'New Business', 'Rewrite', 'Renewal', 'Reinstatement',
  'Endorsement / Policy Change', 'Payment', 'Cancellation',
  'Insurance Quote', 'Tax', 'DMV', 'Other',
];
const officeLabel = (office) => {
  const name = String(office.office_name || '').trim();
  return name.startsWith(office.office_code) ? name : `${office.office_code} ${name}`.trim();
};
const directoryRegions = (offices) => [...new Set(offices.map((office) => office.region).filter(Boolean))].sort();

const typeColor = () => '#fffaeb';

/* --------- Appointment Modal --------- */
function AppointmentModal({ open, mode, original, initial, onClose, onCreate, onUpdate, onDelete, readOnly = false, offices, officesLoading, officesError }) {
  const [form, setForm] = useState(
    initial || {
      type: 'New Business',
      clientName: '',
      clientPhone: '',
      region: '',
      office: '',
      start: '',
      end: '',
      notes: '',
      allDay: false,
    }
  );

  useEffect(() => {
    if (open && mode === 'create' && initial) setForm(initial);
  }, [open, mode, initial]);

  useEffect(() => {
    if (open && mode === 'edit' && original) {
      const p = original.extendedProps || {};
      setForm({
        type: p.type || 'New Business',
        clientName: p.clientName || '',
        clientPhone: p.clientPhone || '',
        region: offices.find((office) => office.office_code === p.office)?.region || p.region || '',
        office: p.office || '',
        start: original.start ? addMinutesLocal(original.start, 0) : '',
        end: original.end ? addMinutesLocal(original.end, 0) : '',
        notes: p.notes || '',
        allDay: false,
      });
    }
  }, [open, mode, original, offices]);

  // Retain historical values when viewing/editing an old appointment. New
  // selections come from the current Office Management directory.
  const availableOffices = offices;
  const regionOptions = directoryRegions(availableOffices);
  if (form.region && !regionOptions.includes(form.region)) regionOptions.push(form.region);
  const officeOptions = availableOffices.filter((office) => office.region === form.region);
  const originalOffice = original?.extendedProps?.office;
  if (mode === 'edit' && form.office === originalOffice && !officeOptions.some((office) => office.office_code === form.office)) {
    const historical = offices.find((office) => office.office_code === form.office);
    officeOptions.push({ office_code: form.office, office_name: historical?.office_name || '(historical office)' });
  }
  const validOffice = availableOffices.some((office) => office.office_code === form.office && office.region === form.region)
    || (mode === 'edit' && form.office === originalOffice && !!form.office);

  if (!open) return null;

  const changedFromOriginal = () => {
    if (mode !== 'edit' || !original) return true;
    const p = original.extendedProps || {};
    return (
      (p.type || '') !== form.type ||
      (p.clientName || '') !== form.clientName ||
      (p.clientPhone || '') !== form.clientPhone ||
      (p.region || '') !== form.region ||
      (p.office || '') !== form.office ||
      (p.notes || '') !== form.notes ||
      (original.start ? addMinutesLocal(original.start, 0) : '') !== form.start ||
      (original.end ? addMinutesLocal(original.end, 0) : '') !== form.end
    );
  };

  const handleSave = () => {
    if (readOnly || officesLoading || officesError || !validOffice || !form.region) return;
    if (new Date(form.end) <= new Date(form.start)) {
      alert('End time must be after start time.');
      return;
    }
    if (!form.clientName || !form.clientPhone || !form.start || !form.end) return;
    const payload = {
      ...form,
      startISO: new Date(form.start).toISOString(),
      endISO: new Date(form.end).toISOString(),
    };
    if (mode === 'create') onCreate(payload);
    else {
      if (changedFromOriginal() && !form.notes.trim()) {
        alert('Please enter a reason/notes for this change.');
        return;
      }
      onUpdate(payload);
    }
  };

  const handleDelete = () => {
    if (readOnly) return;
    if (!form.notes.trim()) {
      alert('Please enter a reason/notes before deleting.');
      return;
    }
    if (window.confirm('Delete this appointment?')) onDelete(form.notes.trim());
  };

  return (
    <div className="ts-modalBackdrop" onClick={onClose}>
      <div className="ts-modal" role="dialog" aria-modal="true" aria-labelledby="ts-modal-title" onClick={(e) => e.stopPropagation()}>
        <div className="ts-modalHeader">
          <h3 id="ts-modal-title">{mode === 'create' ? 'New Appointment' : 'Appointment Details'}</h3>
          <button className="ts-iconBtn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="ts-modalBody">
          {readOnly && <p className="ts-readOnly">View only · Only the agent who created this appointment can edit or delete it.</p>}
          {officesError && <p className="ts-error" role="alert">{officesError}</p>}
          <fieldset className="ts-grid" disabled={readOnly}>
            <label>Transaction Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {!TRANSACTION_TYPES.includes(form.type) && <option value={form.type}>{form.type}</option>}
              {TRANSACTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>

            <label>Client Name</label>
            <input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Jane Doe" />

            <label>Client Phone</label>
            <input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} placeholder="(555) 555-5555" />

            <label>Region</label>
            <select value={form.region} disabled={officesLoading || !!officesError} onChange={(e) => {
              const region = e.target.value;
              const first = availableOffices.find((office) => office.region === region);
              setForm({ ...form, region, office: first?.office_code || '' });
            }}>
              <option value="" disabled>{officesLoading ? 'Loading regions…' : 'Select region'}</option>
              {regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>

            <label>Office</label>
            <select value={form.office} disabled={officesLoading || !!officesError || !form.region} onChange={(e) => setForm({ ...form, office: e.target.value })}>
              <option value="" disabled>{officesLoading ? 'Loading offices…' : 'Select office'}</option>
              {officeOptions.map((office) => <option key={office.office_code} value={office.office_code}>{officeLabel(office)}</option>)}
            </select>

            <label>Start</label>
            <input
              type="datetime-local"
              value={form.start}
              onChange={(e) => {
                const newStart = e.target.value;
                const shouldAutoFill =
                  !form.end || (new Date(form.end).getTime() <= new Date(newStart).getTime());
                setForm((f) => ({
                  ...f,
                  start: newStart,
                  end: shouldAutoFill ? addMinutesLocal(newStart, 45) : f.end,
                }));
              }}
            />

            <label>End</label>
            <input
              type="datetime-local"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />

            <label className="ts-notesLabel">
              {mode === 'create' ? 'Notes (optional)' : 'Reason / Notes (required when saving or deleting)'}
            </label>
            <textarea
              className="ts-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={mode === 'create'
                ? 'Any context or special instructions...'
                : 'Why is this being changed or deleted?'}
            />
          </fieldset>
        </div>

        <div className="ts-modalFooter">
          {mode === 'edit' && !readOnly && (
            <button className="ts-btnDanger" onClick={handleDelete}>Delete</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="ts-btnSecondary" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
          {!readOnly && <button
            className="ts-btnPrimary"
            onClick={handleSave}
            disabled={officesLoading || !!officesError || !validOffice || !form.region || !form.clientName || !form.clientPhone || !form.start || !form.end}
          >
            {mode === 'create' ? 'Create Appointment' : 'Save Changes'}
          </button>}
        </div>
      </div>
    </div>
  );
}

/* --------- Helpers to map DB <-> Calendar --------- */
const rowToEvent = (row) => ({
  id: row.id, // uuid from supabase
  title: row.title || `${row.type}: ${row.client_name}`,
  start: row.start_at,
  end: row.end_at,
  allDay: !!row.all_day,
  backgroundColor: typeColor(row.type),
  extendedProps: {
    createdBy: row.created_by || null,
    type: row.type,
    clientName: row.client_name,
    clientPhone: row.client_phone || '',
    region: row.region,
    office: row.office,
    notes: row.notes || '',
  },
});

const buildInsertPayload = (form) => ({
  title: `${form.type}: ${form.clientName}`,
  type: form.type,
  client_name: form.clientName,
  client_phone: form.clientPhone,
  region: form.region,
  office: form.office,
  start_at: form.startISO,
  end_at: form.endISO,
  all_day: false,
  notes: form.notes || '',
});

const buildUpdatePayload = (form) => ({
  title: `${form.type}: ${form.clientName}`,
  type: form.type,
  client_name: form.clientName,
  client_phone: form.clientPhone,
  region: form.region,
  office: form.office,
  start_at: form.startISO,
  end_at: form.endISO,
  notes: form.notes || '',
});

/* --------- Main Page --------- */
export default function TicketingSystem() {
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [visibleRange, setVisibleRange] = useState(null);
  const [offices, setOffices] = useState([]);
  const [officesLoading, setOfficesLoading] = useState(true);
  const [officesError, setOfficesError] = useState('');

  useEffect(() => {
    let active = true;
    listOffices(false).then((rows) => {
      const directory = (rows || []).map((office) => ({
        ...office,
        office_code: String(office.office_code || '').trim(),
        office_name: String(office.office_name || '').trim(),
        region: String(office.region || '').trim(),
      })).filter((office) => office.office_code && office.region)
        .sort((a, b) => a.office_code.localeCompare(b.office_code));
      if (!active) return;
      setOffices(directory);
      if (!directory.length) {
        setOfficesError('The office directory returned no usable offices for your account. Appointment creation needs an office code and region. Check the om_list_directory result for this login.');

      }
    }).catch((error) => {
      console.error('Appointment office directory:', error);
      if (active) setOfficesError('The office directory could not be loaded. Please refresh before creating or changing appointments.');
    }).finally(() => { if (active) setOfficesLoading(false); });
    return () => { active = false; };
  }, []);

  const availableOffices = offices;
  const officeByCode = useMemo(() => new Map(offices.map((office) => [office.office_code, office])), [offices]);
  // Resolve older region labels by office code without rewriting stored records.
  const allRegions = useMemo(() => ['ALL REGIONS', ...new Set([
    ...directoryRegions(availableOffices),
    ...events.map((event) => officeByCode.get(event.extendedProps.office)?.region || event.extendedProps.region).filter(Boolean),
  ])], [availableOffices, events, officeByCode]);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (active) {
        setCurrentUserId(data?.user?.id || null);
        if (error) setLoadError('Please sign in again to manage your appointments.');
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setCurrentUserId(session?.user?.id || null);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const canEdit = (event) => !!currentUserId && event?.extendedProps?.createdBy === currentUserId;

  // Filters
  const [regionFilter, setRegionFilter] = useState('ALL REGIONS');
  const [officeFilter, setOfficeFilter] = useState('ALL');

  const officesForFilter = useMemo(() => {
    const options = offices.filter((office) => regionFilter === 'ALL REGIONS' || office.region === regionFilter);
    const known = new Set(options.map((office) => office.office_code));
    events.forEach((event) => {
      const { office, region } = event.extendedProps;
      if (office && !known.has(office) && !officeByCode.has(office) && (regionFilter === 'ALL REGIONS' || region === regionFilter)) {
        options.push({ office_code: office, office_name: '(historical office)' });
        known.add(office);
      }
    });
    return options.sort((a, b) => a.office_code.localeCompare(b.office_code));
  }, [offices, events, officeByCode, regionFilter]);

  const filteredEvents = useMemo(() => events.filter((event) => {
    const { region, office } = event.extendedProps || {};
    const currentRegion = officeByCode.get(office)?.region || region;
    return (regionFilter === 'ALL REGIONS' || currentRegion === regionFilter)
      && (officeFilter === 'ALL' || office === officeFilter);
  }), [events, regionFilter, officeFilter, officeByCode]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [draft, setDraft] = useState(null);
  const [currentId, setCurrentId] = useState(null);

  const handleBack = () => navigate(-1);

  /* ------- Supabase: load appointments (future & recent past) ------- */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 30); // last 30 days buffer
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .is('deleted_at', null)
        .gte('end_at', since.toISOString())
        .order('start_at', { ascending: true });

      if (error) {
        console.error('Load appointments error:', error.message);
        setLoadError('Appointments could not be loaded. Please refresh to try again.');
        setEvents([]);
      } else {
        setEvents((data || []).map(rowToEvent));
      }
      setLoading(false);
    };
    load();
  }, []);

  /* Create selection -> open modal (defaults to 45 min duration) */
  const handleDateSelect = (info) => {
    info.view.calendar.unselect();

    if (!currentUserId || officesLoading || officesError) return;
    const defaultOffice = availableOffices.find((office) => office.office_code === officeFilter)
      || availableOffices.find((office) => regionFilter === 'ALL REGIONS' || office.region === regionFilter);
    if (!defaultOffice) {
      alert('There are no offices available for this region. Check Admin Office Management.');
      return;
    }
    const selectedStart = new Date(info.start);
    if (info.allDay) selectedStart.setHours(9, 0, 0, 0);
    const startLocal = addMinutesLocal(selectedStart, 0);
    const endLocal = addMinutesLocal(startLocal, 45);

    setModalMode('create');
    setDraft({
      start: startLocal,
      end: endLocal,
      region: defaultOffice.region,
      office: defaultOffice.office_code,
      type: 'New Business',
      clientName: '',
      clientPhone: '',
      notes: '',
      allDay: false,
    });
    setModalOpen(true);
  };

  /* Click -> view/edit modal */
  const handleEventClick = (clickInfo) => {
    setModalMode('edit');
    setCurrentId(clickInfo.event.id);
    setModalOpen(true);
  };

  /* ------- Supabase: CREATE ------- */
  const handleCreate = async (form) => {
    if (!currentUserId) return;
    const payload = { ...buildInsertPayload(form), created_by: currentUserId };
    const { data, error } = await supabase
      .from('appointments')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      alert(`Create failed: ${error.message}`);
      return;
    }
    setEvents((prev) => [...prev, rowToEvent(data)]);
    setModalOpen(false);
    setDraft(null);
  };

  /* ------- Supabase: UPDATE ------- */
  const handleUpdate = async (form) => {
    if (!canEdit(events.find((event) => event.id === currentId))) return;
    const payload = buildUpdatePayload(form);
    const { data, error } = await supabase
      .from('appointments')
      .update(payload)
      .eq('id', currentId)
      .eq('created_by', currentUserId)
      .select('*')
      .single();

    if (error) {
      alert(`Update failed: ${error.message}`);
      return;
    }
    setEvents((prev) =>
      prev.map((e) => (e.id === currentId ? rowToEvent(data) : e))
    );
    setModalOpen(false);
    setCurrentId(null);
  };

  /* ------- Supabase: SOFT DELETE (keeps reason) ------- */
  const handleDelete = async (reason) => {
    if (!canEdit(events.find((event) => event.id === currentId))) return;
    const { data, error } = await supabase
      .from('appointments')
      .update({ deleted_at: new Date().toISOString(), delete_reason: reason })
      .eq('id', currentId)
      .eq('created_by', currentUserId)
      .select('id')
      .single();

    if (error || !data) {
      alert(`Delete failed: ${error?.message || 'Appointment could not be deleted.'}`);
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== currentId));
    setModalOpen(false);
    setCurrentId(null);
  };

  const visibleEvents = filteredEvents.filter((event) => !visibleRange || (
    new Date(event.start) < visibleRange.end && new Date(event.end || event.start) >= visibleRange.start
  ));

  const renderEventContent = (arg) => {
    const p = arg.event.extendedProps || {};
    return (
      <div className="ts-event" title={`${p.clientName || arg.event.title} · ${p.office || ''} · ${p.createdBy === currentUserId ? 'Your appointment' : 'View only'}`}>
        <time>{arg.timeText}</time>
        <strong className="ts-eventTitle">{p.clientName || arg.event.title}</strong>
        <span className="ts-eventMeta">{p.type} · {p.office}</span>
        {p.clientPhone && <span className="ts-eventMeta">{p.clientPhone}</span>}
      </div>
    );
  };

  return (
    <div className="ts-wrap">
      <div className="ts-header">
        <div>
          <p className="ts-eyebrow">AGENT OPERATIONS</p>
          <h1>Appointment Calendar</h1>
          <p className="ts-subtitle">Plan your day, view team appointments, and manage your own bookings.</p>
        </div>
        <div className="ts-headerActions">
          <button className="ts-btnSecondary" onClick={handleBack}>← Back</button>
          <button className="ts-btnPrimary" disabled={!currentUserId || officesLoading || !!officesError || !availableOffices.length} onClick={() => {
            const start = new Date();
            start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
            handleDateSelect({ start, allDay: false, view: { calendar: { unselect: () => {} } } });
          }}>+ New Appointment</button>
        </div>
      </div>

      {/* Filters */}
      <div className="ts-filters">
        <div className="ts-filterGroup">
          <label htmlFor="ts-region">Region</label>
          <select id="ts-region"
            value={regionFilter}
            onChange={(e) => {
              setRegionFilter(e.target.value);
              setOfficeFilter('ALL');
            }}
          >
            {allRegions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="ts-filterGroup">
          <label htmlFor="ts-office">Office</label>
          <select id="ts-office"
            value={officeFilter}
            onChange={(e) => setOfficeFilter(e.target.value)}
            disabled={officesLoading}
          >
            <option value="ALL">ALL</option>
            {officesForFilter.map((o) => (
              <option key={o.office_code} value={o.office_code}>
                {officeLabel(o)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {officesError && <p className="ts-error" role="alert">{officesError}</p>}
      {loadError && <p className="ts-error" role="alert">{loadError}</p>}
      <div className="ts-calendarCard" aria-busy={loading}>
        <div className="ts-sectionHeading">
          <div><h2>Team appointments</h2><p>Click an appointment for details. Select a time or use New Appointment to book.</p></div>
          <span className="ts-countPill" aria-live="polite">{loading ? 'Loading…' : `${visibleEvents.length} appointments`}</span>
        </div>
        <div className="ts-calendarScroll">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
          datesSet={(info) => setVisibleRange({ start: info.start, end: info.end })}
          dayMaxEvents={3}
          fixedWeekCount={false}
          navLinks={true}
          eventDisplay="block"
          displayEventTime={true}
          eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
          dayHeaderFormat={{ weekday: 'short' }}
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          slotDuration="00:15:00"
          allDaySlot={false}
          selectable={!!currentUserId && !officesLoading && !officesError && availableOffices.length > 0}
          selectMirror={true}
          nowIndicator={true}
          editable={false}
          events={filteredEvents}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventContent={renderEventContent}
          height="auto"
        />
        </div>
        <p className="ts-calendarHint">Team appointments are visible to everyone. Only their creator can edit or delete them.</p>
      </div>

      {/* Create Modal */}
      <AppointmentModal
        offices={offices}
        officesLoading={officesLoading}
        officesError={officesError}
        open={modalOpen && modalMode === 'create'}
        mode="create"
        original={null}
        initial={draft}
        onClose={() => { setModalOpen(false); setDraft(null); }}
        onCreate={handleCreate}
        onUpdate={() => {}}
        onDelete={() => {}}
      />

      {/* Edit Modal */}
      <AppointmentModal
        offices={offices}
        officesLoading={officesLoading}
        officesError={officesError}
        open={modalOpen && modalMode === 'edit'}
        mode="edit"
        readOnly={!canEdit(events.find((event) => event.id === currentId))}
        original={events.find((e) => e.id === currentId) || null}
        initial={null}
        onClose={() => { setModalOpen(false); setCurrentId(null); }}
        onCreate={() => {}}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />

      {loading && <div style={{ marginTop: 12, color: '#64748b' }}>Loading appointments…</div>}
    </div>
  );
}

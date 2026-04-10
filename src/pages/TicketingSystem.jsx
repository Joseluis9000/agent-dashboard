import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { supabase } from '../supabaseClient'; // <-- path from /src/pages
import './TicketingSystem.css';

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

/* --------- Regions & Offices --------- */
const REGIONS = {
  'CEN-CAL': [
    { code: 'CA010', name: 'NOBLE' },
    { code: 'CA011', name: 'VISALIA' },
    { code: 'CA012', name: 'PORTERVILLE' },
    { code: 'CA022', name: 'TULARE' },
    { code: 'CA183', name: 'HENDERSON' },
    { code: 'CA229', name: 'CORCORAN' },
    { code: 'CA230', name: 'AVENAL' },
    { code: 'CA239', name: 'COALINGA' },
  ],
  'KERN COUNTY': [
    { code: 'CA016', name: 'NILES' },
    { code: 'CA047', name: 'MING' },
    { code: 'CA048', name: 'NORRIS' },
    { code: 'CA049', name: 'WHITE' },
    { code: 'CA172', name: 'BRUNDAGE' },
    { code: 'CA240', name: 'ARVIN' },
  ],
  'THE VALLEY': [
    { code: 'CA025', name: 'RIVERBANK' },
    { code: 'CA030', name: 'MERCED' },
    { code: 'CA045', name: 'ATWATER' },
    { code: 'CA046', name: 'TURLOCK' },
    { code: 'CA065', name: 'CROWS' },
    { code: 'CA074', name: 'CERES' },
    { code: 'CA075', name: 'MODESTO' },
    { code: 'CA095', name: 'PATTERSON' },
    { code: 'CA118', name: 'HOLLISTER' },
    { code: 'CA119', name: 'YOSEMITE' },
    { code: 'CA231', name: 'LIVINGSTON' },
    { code: 'CA238', name: 'CHOWCHILLA' },
  ],
  'BAY AREA': [
    { code: 'CA076', name: 'PITTSBURG' },
    { code: 'CA103', name: 'ANTIOCH' },
    { code: 'CA104', name: 'RICHMOND' },
    { code: 'CA114', name: 'SAN LORENZO' },
    { code: 'CA117', name: 'VALLEJO' },
    { code: 'CA149', name: 'REDWOOD CITY' },
    { code: 'CA150', name: 'MENLO PARK' },
    { code: 'CA216', name: 'NAPA' },
    { code: 'CA236', name: 'SAN RAFAEL' },
    { code: 'CA248', name: 'SPRINGS' },
  ],
  'SOUTHERN CALI': [
    { code: 'CA131', name: 'CHULA VISTA' },
    { code: 'CA132', name: 'NATIONAL CITY' },
    { code: 'CA133', name: 'LOGAN' },
    { code: 'CA166', name: 'EL CAJON' },
    { code: 'CA249', name: 'BRAWLEY' },
    { code: 'CA250', name: 'BARRIO LOGAN' },
    { code: 'CA251', name: 'LA PUENTE' },
    { code: 'CA252', name: 'EL CENTRO' },
  ],
};

const ALL_REGIONS = ['ALL REGIONS', ...Object.keys(REGIONS)];
const typeColor = (t) => ((t || '').toLowerCase().startsWith('new') ? '#2563eb' : '#16a34a');

/* --------- Appointment Modal --------- */
function AppointmentModal({ open, mode, original, initial, onClose, onCreate, onUpdate, onDelete }) {
  const [form, setForm] = useState(
    initial || {
      type: 'New Business',
      clientName: '',
      clientPhone: '',
      region: 'CEN-CAL',
      office: REGIONS['CEN-CAL'][0]?.code || '',
      start: '',
      end: '',
      notes: '',
      allDay: false,
    }
  );

  useEffect(() => {
    if (mode === 'edit' && original) {
      const p = original.extendedProps || {};
      setForm({
        type: p.type || 'New Business',
        clientName: p.clientName || '',
        clientPhone: p.clientPhone || '',
        region: p.region || 'CEN-CAL',
        office: p.office || (REGIONS['CEN-CAL'][0]?.code || ''),
        start: original.start ? new Date(original.start).toISOString().slice(0, 16) : '',
        end: original.end ? new Date(original.end).toISOString().slice(0, 16) : '',
        notes: p.notes || '',
        allDay: false,
      });
    }
  }, [mode, original]);

  useEffect(() => {
  const offices = REGIONS[form.region] || [];
  setForm((prev) => {
    // if current office isn't valid for the new region, default to the first office
    if (!offices.find((o) => o.code === prev.office)) {
      return { ...prev, office: offices[0]?.code || '' };
    }
    return prev; // no change needed
  });
}, [form.region]);

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
      (original.start ? new Date(original.start).toISOString().slice(0, 16) : '') !== form.start ||
      (original.end ? new Date(original.end).toISOString().slice(0, 16) : '') !== form.end
    );
  };

  const handleSave = () => {
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
    if (!form.notes.trim()) {
      alert('Please enter a reason/notes before deleting.');
      return;
    }
    if (window.confirm('Delete this appointment?')) onDelete(form.notes.trim());
  };

  return (
    <div className="ts-modalBackdrop" onClick={onClose}>
      <div className="ts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-modalHeader">
          <h3>{mode === 'create' ? 'New Appointment' : 'Appointment Details'}</h3>
          <button className="ts-iconBtn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="ts-modalBody">
          <div className="ts-grid">
            <label>Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>New Business</option>
              <option>Tax</option>
            </select>

            <label>Client Name</label>
            <input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Jane Doe" />

            <label>Client Phone</label>
            <input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} placeholder="(555) 555-5555" />

            <label>Region</label>
            <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
              {Object.keys(REGIONS).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <label>Office</label>
            <select value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })}>
              {(REGIONS[form.region] || []).map((o) => (
                <option key={o.code} value={o.code}>{o.code} {o.name}</option>
              ))}
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
          </div>
        </div>

        <div className="ts-modalFooter">
          {mode === 'edit' && (
            <button className="ts-btnDanger" onClick={handleDelete}>Delete</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="ts-btnSecondary" onClick={onClose}>Cancel</button>
          <button
            className="ts-btnPrimary"
            onClick={handleSave}
            disabled={!form.clientName || !form.clientPhone || !form.start || !form.end}
          >
            {mode === 'create' ? 'Create Appointment' : 'Save Changes'}
          </button>
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

  // Filters
  const [regionFilter, setRegionFilter] = useState('ALL REGIONS');
  const [officeFilter, setOfficeFilter] = useState('ALL');

  const officesForFilter = useMemo(() => {
    if (!regionFilter || regionFilter === 'ALL REGIONS') return [];
    return REGIONS[regionFilter] || [];
  }, [regionFilter]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const { region, office } = e.extendedProps || {};
      if (regionFilter !== 'ALL REGIONS' && region !== regionFilter) return false;
      if (officeFilter !== 'ALL' && office !== officeFilter) return false;
      return true;
    });
  }, [events, regionFilter, officeFilter]);

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
        setEvents([]); // fall back empty
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

    const startLocal = info.startStr.replace('Z', '');
    const endLocal = addMinutesLocal(startLocal, 45);

    setModalMode('create');
    setDraft({
      start: startLocal,
      end: endLocal,
      region: regionFilter === 'ALL REGIONS' ? 'CEN-CAL' : regionFilter,
      office:
        regionFilter === 'ALL REGIONS'
          ? REGIONS['CEN-CAL'][0]?.code || ''
          : (REGIONS[regionFilter]?.[0]?.code || ''),
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
    const payload = buildInsertPayload(form);
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
    const payload = buildUpdatePayload(form);
    const { data, error } = await supabase
      .from('appointments')
      .update(payload)
      .eq('id', currentId)
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
    const { error } = await supabase
      .from('appointments')
      .update({ deleted_at: new Date().toISOString(), delete_reason: reason })
      .eq('id', currentId);

    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== currentId));
    setModalOpen(false);
    setCurrentId(null);
  };

  const renderEventContent = (arg) => {
    const p = arg.event.extendedProps || {};
    return (
      <div className="ts-event">
        <div className="ts-eventTitle">{arg.event.title}</div>
        <div className="ts-eventMeta">
          <span>{p.region}{p.office ? ` • ${p.office}` : ''}</span>
          {p.clientPhone ? <span> • {p.clientPhone}</span> : null}
          {p.notes ? <span> • {p.notes}</span> : null}
        </div>
      </div>
    );
  };

  return (
    <div className="ts-wrap">
      <div className="ts-header">
        <h1>Agent Appointment Calendar</h1>
        <div className="ts-headerActions">
          <button className="ts-btnSecondary" onClick={handleBack}>Back</button>
        </div>
      </div>

      {/* Filters */}
      <div className="ts-filters">
        <div className="ts-filterGroup">
          <label>Region</label>
          <select
            value={regionFilter}
            onChange={(e) => {
              setRegionFilter(e.target.value);
              setOfficeFilter('ALL');
            }}
          >
            {ALL_REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="ts-filterGroup">
          <label>Office</label>
          <select
            value={officeFilter}
            onChange={(e) => setOfficeFilter(e.target.value)}
            disabled={regionFilter === 'ALL REGIONS'}
          >
            <option value="ALL">ALL</option>
            {officesForFilter.map((o) => (
              <option key={o.code} value={o.code}>
                {o.code} {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="ts-calendarCard">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          slotDuration="00:15:00"
          allDaySlot={false}
          selectable={true}
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

      {/* Create Modal */}
      <AppointmentModal
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
        open={modalOpen && modalMode === 'edit'}
        mode="edit"
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

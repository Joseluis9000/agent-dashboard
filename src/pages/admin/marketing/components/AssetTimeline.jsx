// src/pages/admin/marketing/components/AssetTimeline.jsx

import React, { useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import { formatCurrency } from '../utils/marketingHelpers';

const TYPE_META = {
  contract: { label: 'Contract', icon: '📄', color: '#0369a1', bg: '#eff6ff', border: '#bfdbfe' },
  photo: { label: 'Photo / Asset', icon: '📸', color: '#166534', bg: '#ecfdf5', border: '#bbf7d0' },
  event: { label: 'Event', icon: '🎪', color: '#7e22ce', bg: '#faf5ff', border: '#e9d5ff' },
  task: { label: 'Task', icon: '✅', color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  note: { label: 'Note', icon: '📝', color: '#475569', bg: '#f8fafc', border: '#e2e8f0' },
  renewal: { label: 'Renewal', icon: '🔁', color: '#be123c', bg: '#fff1f2', border: '#fecdd3' },
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'contract', label: 'Contracts' },
  { value: 'photo', label: 'Photos' },
  { value: 'event', label: 'Events' },
  { value: 'task', label: 'Tasks' },
  { value: 'note', label: 'Notes' },
  { value: 'renewal', label: 'Renewals' },
];

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return 'No date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getMonthKey = (value) => {
  const date = toDate(value);
  if (!date) return 'No Date';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const getSortDate = (item) => {
  const date = toDate(item.date);
  return date ? date.getTime() : 0;
};

const photoTypeLabel = (type = '') =>
  String(type || 'photo').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const buildTimelineItems = ({ location, related }) => {
  const items = [];

  if (location?.contractStart) {
    items.push({
      id: `location-contract-start-${location.id}`,
      type: 'contract',
      date: location.contractStart,
      title: 'Contract Started',
      subtitle: location.vendor || location.name,
      details: location.monthlyCost ? `${formatCurrency(location.monthlyCost)} monthly` : '',
    });
  }

  if (location?.contractEnd) {
    items.push({
      id: `location-contract-end-${location.id}`,
      type: 'renewal',
      date: location.contractEnd,
      title: 'Contract Ends',
      subtitle: location.vendor || location.name,
      details: 'Review renewal or replacement plan.',
    });
  }

  if (location?.renewalDate) {
    items.push({
      id: `location-renewal-${location.id}`,
      type: 'renewal',
      date: location.renewalDate,
      title: 'Renewal Date',
      subtitle: location.vendor || location.name,
      details: 'Renewal follow-up needed.',
    });
  }

  (related.contracts || []).forEach((contract) => {
    if (contract.start_date) {
      items.push({
        id: `contract-start-${contract.id}`,
        type: 'contract',
        date: contract.start_date,
        title: 'Contract Record Started',
        subtitle: contract.vendor || location?.vendor || 'Contract',
        details: contract.monthly_cost ? `${formatCurrency(contract.monthly_cost)} monthly` : '',
        href: contract.contract_pdf || '',
      });
    }

    if (contract.end_date) {
      items.push({
        id: `contract-end-${contract.id}`,
        type: 'renewal',
        date: contract.end_date,
        title: 'Contract Record Ends',
        subtitle: contract.vendor || location?.vendor || 'Contract',
        details: contract.notes || '',
        href: contract.contract_pdf || '',
      });
    }
  });

  (related.photos || []).forEach((photo) => {
    items.push({
      id: `photo-${photo.id}`,
      type: 'photo',
      date: photo.createdAt || photo.updatedAt,
      title: photo.title || photoTypeLabel(photo.photoType),
      subtitle: photoTypeLabel(photo.photoType),
      details: photo.description || (photo.isPrimary ? 'Primary photo' : ''),
      image: photo.photoUrl,
      href: photo.photoUrl,
    });
  });

  (related.events || []).forEach((event) => {
    items.push({
      id: `event-${event.id}`,
      type: 'event',
      date: event.event_date || event.created_at,
      title: event.title || 'Marketing Event',
      subtitle: event.organizer || location?.office || '',
      details: [
        event.estimated_cost ? formatCurrency(event.estimated_cost) : '',
        event.completed ? 'Completed' : 'Open',
        event.description || '',
      ].filter(Boolean).join(' • '),
    });
  });

  (related.tasks || []).forEach((task) => {
    items.push({
      id: `task-${task.id}`,
      type: 'task',
      date: task.completed_at || task.due_date || task.created_at,
      title: task.title || 'Marketing Task',
      subtitle: task.assigned_to || task.priority || '',
      details: [
        task.completed ? 'Completed' : 'Open',
        task.due_date ? `Due ${formatDate(task.due_date)}` : '',
        task.description || '',
      ].filter(Boolean).join(' • '),
    });
  });

  (related.notes || []).forEach((note) => {
    items.push({
      id: `note-${note.id}`,
      type: 'note',
      date: note.created_at,
      title: 'Note Added',
      subtitle: note.author || 'Admin',
      details: note.note || '',
    });
  });

  return items.sort((a, b) => getSortDate(b) - getSortDate(a));
};

const AssetTimeline = ({ location, related = {} }) => {
  const [filter, setFilter] = useState('all');

  const allItems = useMemo(() => buildTimelineItems({ location, related }), [location, related]);

  const timelineItems = useMemo(() => {
    if (filter === 'all') return allItems;
    return allItems.filter((item) => item.type === filter);
  }, [allItems, filter]);

  const groupedItems = useMemo(() => {
    return timelineItems.reduce((acc, item) => {
      const key = getMonthKey(item.date);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [timelineItems]);

  const counts = useMemo(() => {
    return allItems.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    }, { all: 0 });
  }, [allItems]);

  if (!location) {
    return (
      <section className={styles.infoSection}>
        <h3>Asset Timeline</h3>
        <p>Select a marketing location to see its full asset history.</p>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0 }}>Asset Timeline</h3>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 800, fontSize: 12 }}>
          Photos, contracts, notes, tasks, events, and renewals for this location.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 3 }}>
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            style={{
              border: filter === option.value ? '1px solid #0ea5e9' : '1px solid #e2e8f0',
              background: filter === option.value ? '#eff6ff' : '#ffffff',
              color: filter === option.value ? '#0369a1' : '#475569',
              borderRadius: 999,
              padding: '6px 9px',
              fontWeight: 900,
              fontSize: 11,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {option.label} ({counts[option.value] || 0})
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <SummaryCard label="Photos" value={counts.photo || 0} icon="📸" />
        <SummaryCard label="Contracts" value={counts.contract || 0} icon="📄" />
        <SummaryCard label="Open Tasks" value={(related.tasks || []).filter((task) => !task.completed).length} icon="✅" />
      </div>

      {timelineItems.length === 0 ? (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: 14, background: '#f8fafc', padding: 16, color: '#64748b', fontWeight: 850, textAlign: 'center' }}>
          No timeline activity yet for this filter.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {Object.entries(groupedItems).map(([month, items]) => (
            <div key={month} style={{ display: 'grid', gap: 8 }}>
              <div style={{ color: '#0f172a', fontWeight: 950, fontSize: 13, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                {month}
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                {items.map((item) => (
                  <TimelineCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const SummaryCard = ({ label, value, icon }) => (
  <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc', padding: 10, textAlign: 'center', display: 'grid', gap: 3 }}>
    <span style={{ fontSize: 17 }}>{icon}</span>
    <strong style={{ color: '#0f172a', fontSize: 16 }}>{value}</strong>
    <small style={{ color: '#64748b', fontWeight: 900, fontSize: 10 }}>{label}</small>
  </div>
);

const TimelineCard = ({ item }) => {
  const meta = TYPE_META[item.type] || TYPE_META.note;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: item.image ? '58px 1fr' : '1fr', gap: 10, border: `1px solid ${meta.border}`, borderRadius: 14, background: meta.bg, padding: 10 }}>
      {item.image && (
        <a href={item.href || item.image} target="_blank" rel="noreferrer">
          <img src={item.image} alt={item.title} style={{ width: 58, height: 58, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)', background: '#ffffff', display: 'block' }} />
        </a>
      )}

      <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ color: '#0f172a', fontSize: 13, minWidth: 0 }}>
            {meta.icon} {item.title}
          </strong>
          <span style={{ color: meta.color, fontWeight: 950, fontSize: 11, whiteSpace: 'nowrap' }}>
            {formatDate(item.date)}
          </span>
        </div>

        {item.subtitle && <span style={{ color: meta.color, fontWeight: 900, fontSize: 11 }}>{item.subtitle}</span>}

        {item.details && <p style={{ margin: 0, color: '#475569', fontWeight: 750, fontSize: 12, lineHeight: 1.35 }}>{item.details}</p>}

        {item.href && !item.image && (
          <a href={item.href} target="_blank" rel="noreferrer" style={{ fontWeight: 900, fontSize: 12 }}>
            Open File
          </a>
        )}
      </div>
    </div>
  );
};

export default AssetTimeline;

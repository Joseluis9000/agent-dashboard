import React, { useMemo, useState } from 'react';
import styles from './TeamUnderwritingDashboard.module.css';

/** ------- SAMPLE DATA (mock) ------- */
const SAMPLE_ROWS = [
  {
    id: 'GPSV-00774042-00',
    priority: 'High',
    policy: 'GPSV-00774042-00',
    customer: 'Isabel Alvarado',
    assignee: 'Unassigned',
    status: 'Pending DM',
    queuedAt: '2025-10-02T14:10:00Z',
    updatedAt: '2025-10-02T14:15:00Z',
  },
  {
    id: 'SCAC-109051-00',
    priority: 'Medium',
    policy: 'SCAC-109051-00',
    customer: 'Gabriela Iniguez',
    assignee: 'Ara De La Cruz',
    status: 'Needs Info',
    queuedAt: '2025-10-01T20:40:00Z',
    updatedAt: '2025-10-02T17:00:00Z',
  },
  {
    id: 'GPSV-00693209-00',
    priority: 'Low',
    policy: 'GPSV-00693209-00',
    customer: 'Rafael Gomez',
    assignee: 'Yazmin Valdivia',
    status: 'Approved',
    queuedAt: '2025-09-30T18:00:00Z',
    updatedAt: '2025-10-02T12:25:00Z',
  },
  {
    id: 'GPCP-00569850-00',
    priority: 'High',
    policy: 'GPCP-00569850-00',
    customer: 'Christian Barragan',
    assignee: 'Kevin Panduro',
    status: 'Pending',
    queuedAt: '2025-10-02T15:40:00Z',
    updatedAt: '2025-10-02T15:45:00Z',
  },
  {
    id: 'GPSV-00693588-00',
    priority: 'Low',
    policy: 'GPSV-00693588-00',
    customer: 'Diego Cossio',
    assignee: 'Ara De La Cruz',
    status: 'Needs Info',
    queuedAt: '2025-09-29T19:00:00Z',
    updatedAt: '2025-10-01T23:20:00Z',
  },
  {
    id: 'GO1-6644569-00',
    priority: 'Medium',
    policy: 'GO1-6644569-00',
    customer: 'Abdulmalek Alsanyan',
    assignee: 'Justine S.',
    status: 'Pending',
    queuedAt: '2025-10-01T16:00:00Z',
    updatedAt: '2025-10-02T03:10:00Z',
  },
  {
    id: 'GPCP-203012250',
    priority: 'Low',
    policy: 'GPCP-203012250',
    customer: 'Jose Gutiérrez',
    assignee: 'Siam',
    status: 'Approved',
    queuedAt: '2025-09-28T15:00:00Z',
    updatedAt: '2025-10-02T13:30:00Z',
  },
  {
    id: 'GPSV-203010676',
    priority: 'High',
    policy: 'GPSV-203010676',
    customer: 'Luis Zamudio',
    assignee: 'Justine S.',
    status: 'Rejected',
    queuedAt: '2025-09-27T15:00:00Z',
    updatedAt: '2025-10-02T10:02:00Z',
  },
  {
    id: 'GPCP-203029962',
    priority: 'Medium',
    policy: 'GPCP-203029962',
    customer: 'Jesus Machuca',
    assignee: 'Yazmin Valdivia',
    status: 'Pending DM',
    queuedAt: '2025-10-02T13:00:00Z',
    updatedAt: '2025-10-02T14:20:00Z',
  },
];

const STATUS_OPTIONS = ['All', 'Pending', 'Pending DM', 'Needs Info', 'Approved', 'Rejected'];
const MANAGER_VIEW = true; // show bulk checkboxes + assignee filter prominence

/** ------- Helpers ------- */
const toAgo = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs} hr${hrs === 1 ? '' : 's'}`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
};

const isAging = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  return ms > 48 * 3600 * 1000; // > 48h
};

const pillClass = (status) => {
  switch (status) {
    case 'Approved': return styles.pillGreen;
    case 'Rejected': return styles.pillRed;
    case 'Needs Info': return styles.pillAmber;
    case 'Pending DM': return styles.pillBlue;
    case 'Pending':
    default: return styles.pillGray;
  }
};

const priorityDot = (p) => {
  if (p === 'High') return <span className={`${styles.dot} ${styles.dotRed}`} />;
  if (p === 'Medium') return <span className={`${styles.dot} ${styles.dotYellow}`} />;
  return <span className={`${styles.dot} ${styles.dotBlue}`} />;
};

const unique = (arr) => Array.from(new Set(arr));

/** ------- Component ------- */
export default function TeamUnderwritingDashboard() {
  const [rows] = useState(SAMPLE_ROWS);
  const allAssignees = useMemo(
    () => ['All', 'Unassigned', ...unique(rows.map(r => r.assignee).filter(a => a !== 'Unassigned'))],
    [rows]
  );

  // Controls
  const [search, setSearch] = useState('');
  const [assignee, setAssignee] = useState('All');
  const [status, setStatus] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sorting
  const [sortKey, setSortKey] = useState('queuedAt');
  const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Filters + sorting
  const filtered = useMemo(() => {
    let out = [...rows];

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      out = out.filter(
        r =>
          r.policy.toLowerCase().includes(s) ||
          r.customer.toLowerCase().includes(s)
      );
    }
    if (assignee !== 'All') {
      if (assignee === 'Unassigned') out = out.filter(r => r.assignee === 'Unassigned');
      else out = out.filter(r => r.assignee === assignee);
    }
    if (status !== 'All') {
      out = out.filter(r => r.status === status);
    }
    if (startDate) out = out.filter(r => new Date(r.queuedAt) >= new Date(startDate));
    if (endDate) out = out.filter(r => new Date(r.queuedAt) <= new Date(endDate + 'T23:59:59'));

    out.sort((a, b) => {
      const A = a[sortKey];
      const B = b[sortKey];
      if (sortKey === 'priority') {
        const order = { High: 3, Medium: 2, Low: 1 };
        return sortDir === 'asc' ? order[A] - order[B] : order[B] - order[A];
      }
      if (['queuedAt', 'updatedAt'].includes(sortKey)) {
        const aT = new Date(A).getTime();
        const bT = new Date(B).getTime();
        return sortDir === 'asc' ? aT - bT : bT - aT;
      }
      const cmp = String(A).localeCompare(String(B));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [rows, search, assignee, status, startDate, endDate, sortKey, sortDir]);

  /** KPI Metrics */
  const totalInQueue = rows.length;
  const processedToday = rows.filter(
    r =>
      ['Approved', 'Rejected'].includes(r.status) &&
      new Date(r.updatedAt).toDateString() === new Date().toDateString()
  ).length;
  const processedRows = rows.filter(r => ['Approved', 'Rejected'].includes(r.status));
  const avgTurnHours = processedRows.length
    ? Math.round(
        processedRows.reduce((sum, r) => {
          const hours = (new Date(r.updatedAt) - new Date(r.queuedAt)) / 36e5;
          return sum + hours;
        }, 0) / processedRows.length
      )
    : 0;

  const statusCounts = STATUS_OPTIONS
    .filter(s => s !== 'All')
    .map(s => ({ label: s, value: rows.filter(r => r.status === s).length }));

  /** Actions (mock) */
  const claim = (id) => window.alert(`Claiming policy ${id} …`);
  const approve = (id) => window.alert(`Approved ${id}`);
  const reject = (id) => window.alert(`Rejected ${id}`);
  const details = (id) => window.alert(`Open details for ${id}`);

  return (
    <div className={styles.shell}>
      {/* Left nav */}
      <aside className={styles.sidebar}>
        <div className={styles.logoBox}>
          <img src="/fiesta-logo.png" alt="Fiesta Auto Insurance" />
          <div className={styles.brandLabel}>Underwriting</div>
        </div>
        <nav className={styles.nav}>
          <button className={`${styles.navItem} ${styles.active}`}>Underwriting Queue</button>
        </nav>
        <div className={styles.logoutBox}>
          <button className={styles.logout}>Logout</button>
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        {/* KPI Summary */}
        <section className={styles.kpis}>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>Total Policies in Queue</div>
            <div className={styles.kpiValue}>{totalInQueue}</div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>Average Turnaround Time</div>
            <div className={styles.kpiValue}>{avgTurnHours} Hours</div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>Policies Processed (Today)</div>
            <div className={styles.kpiValue}>{processedToday}</div>
          </div>
          <div className={`${styles.kpiCard} ${styles.kpiChart}`}>
            <div className={styles.kpiLabel}>Policies by Status</div>
            <div className={styles.chartRows}>
              {statusCounts.map(({ label, value }) => {
                const max = Math.max(1, ...statusCounts.map(s => s.value));
                const pct = Math.round((value / max) * 100);
                return (
                  <div key={label} className={styles.chartRow}>
                    <span className={styles.chartLabel}>{label}</span>
                    <div className={styles.chartBarWrap}>
                      <div className={styles.chartBar} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={styles.chartValue}>{value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Header + Controls */}
        <header className={styles.header}>
          <h1>Underwriting Queue</h1>
          <div className={styles.controls}>
            <input
              className={styles.search}
              placeholder="Search policy #, customer name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className={styles.select}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              aria-label="Assignee filter"
            >
              {allAssignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>

            <select
              className={styles.select}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Status filter"
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <div className={styles.dates}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Start date"
              />
              <span>–</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="End date"
              />
            </div>
          </div>
        </header>

        {/* Table */}
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                {MANAGER_VIEW && <th className={styles.thCheck}><input type="checkbox" aria-label="Select all" /></th>}
                <th onClick={() => toggleSort('priority')} className={styles.sortable}>
                  Priority {sortKey === 'priority' && <span className={styles.sortCaret}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => toggleSort('policy')} className={styles.sortable}>
                  Policy # {sortKey === 'policy' && <span className={styles.sortCaret}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => toggleSort('customer')} className={styles.sortable}>
                  Customer {sortKey === 'customer' && <span className={styles.sortCaret}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => toggleSort('assignee')} className={styles.sortable}>
                  Assignee {sortKey === 'assignee' && <span className={styles.sortCaret}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => toggleSort('status')} className={styles.sortable}>
                  Status {sortKey === 'status' && <span className={styles.sortCaret}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => toggleSort('queuedAt')} className={styles.sortable}>
                  Queue Age {sortKey === 'queuedAt' && <span className={styles.sortCaret}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => toggleSort('updatedAt')} className={styles.sortable}>
                  Last Updated {sortKey === 'updatedAt' && <span className={styles.sortCaret}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  {MANAGER_VIEW && (
                    <td className={styles.tdCheck}>
                      <input type="checkbox" aria-label={`Select ${r.policy}`} />
                    </td>
                  )}
                  <td>
                    <div className={styles.priorityCell}>
                      {priorityDot(r.priority)}
                      <span className={styles.priorityText}>{r.priority}</span>
                    </div>
                  </td>
                  <td className={styles.code}>{r.policy}</td>
                  <td>{r.customer}</td>
                  <td>
                    {r.assignee === 'Unassigned' ? (
                      <button className={styles.claim} onClick={() => claim(r.id)}>Claim</button>
                    ) : (
                      r.assignee
                    )}
                  </td>
                  <td>
                    <span className={`${styles.pill} ${pillClass(r.status)}`}>{r.status}</span>
                  </td>
                  <td className={isAging(r.queuedAt) ? styles.ageHot : styles.ageOk}>{toAgo(r.queuedAt)}</td>
                  <td>{new Date(r.updatedAt).toLocaleString()}</td>
                  <td className={styles.actions}>
                    <button className={styles.actionPrimary} onClick={() => approve(r.id)}>Approve</button>
                    <button className={styles.actionDanger} onClick={() => reject(r.id)}>Reject</button>
                    <button className={styles.actionGhost} onClick={() => details(r.id)}>Details</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={MANAGER_VIEW ? 9 : 8} className={styles.empty}>No results match your filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

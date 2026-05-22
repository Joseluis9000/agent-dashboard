// CommissionUploader.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';

const PAGE_SIZE = 1000;

const makeDateKey = (year, month, day) => {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const getUploadedDateKey = (dateValue) => {
  if (!dateValue) return null;

  const clean = String(dateValue).trim();
  const match = clean.match(/^(\d{4}-\d{2}-\d{2})/);

  if (match) return match[1];

  return null;
};

const getNextDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  date.setDate(date.getDate() + 1);

  return makeDateKey(date.getFullYear(), date.getMonth(), date.getDate());
};

const getMonthDays = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const days = [];
  const mondayStartIndex = first.getDay() === 0 ? 6 : first.getDay() - 1;

  for (let i = 0; i < mondayStartIndex; i++) days.push(null);

  for (let day = 1; day <= last.getDate(); day++) {
    days.push({
      day,
      dateKey: makeDateKey(year, month, day),
      date: new Date(year, month, day),
    });
  }

  return days;
};

const getStatusLabel = (status) => {
  if (status === 'uploaded') return 'Uploaded';
  if (status === 'duplicate') return 'Duplicate';
  return 'No data';
};

const CommissionUploader = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarData, setCalendarData] = useState({});
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);

  const isInitialLoadRef = useRef(true);

  const days = useMemo(() => getMonthDays(currentMonth), [currentMonth]);
  const selectedRecord = selectedDate ? calendarData[selectedDate] : null;

  const monthName = currentMonth.toLocaleString('default', { month: 'long' });

  useEffect(() => {
    initializeLatestDate();
  }, []);

  useEffect(() => {
    if (isInitialLoadRef.current) return;

    fetchMonthCalendarSummary(currentMonth);
  }, [currentMonth]);

  useEffect(() => {
    if (!selectedDate) return;

    fetchSelectedDayData(selectedDate);
  }, [selectedDate]);

  const initializeLatestDate = async () => {
    setLoadingCalendar(true);

    try {
      const latestDateKey = await fetchMostRecentDataDate();

      if (!latestDateKey) {
        setLoadingCalendar(false);
        isInitialLoadRef.current = false;
        return;
      }

      const [year, month] = latestDateKey.split('-').map(Number);
      const latestMonth = new Date(year, month - 1, 1);

      setCurrentMonth(latestMonth);

      await fetchMonthCalendarSummary(latestMonth);

      setSelectedDate(latestDateKey);
    } catch (error) {
      console.error('Error initializing EOD calendar:', error.message);
    }

    isInitialLoadRef.current = false;
    setLoadingCalendar(false);
  };

  const fetchMostRecentDataDate = async () => {
    const { data, error } = await supabase
      .from('daily_eod_transfers')
      .select('date_time')
      .order('date_time', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Error finding latest EOD date:', error.message);
      return null;
    }

    return getUploadedDateKey(data?.date_time);
  };

  const fetchAllRowsForRange = async ({
    startDateKey,
    endDateKey,
    columns,
    orderAscending = true,
  }) => {
    let from = 0;
    let allRows = [];
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('daily_eod_transfers')
        .select(columns)
        .gte('date_time', `${startDateKey} 00:00:00`)
        .lt('date_time', `${endDateKey} 00:00:00`)
        .order('date_time', { ascending: orderAscending })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      const rows = data || [];
      allRows = [...allRows, ...rows];

      if (rows.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        from += PAGE_SIZE;
      }
    }

    return allRows;
  };

  const fetchMonthCalendarSummary = async (monthDate = currentMonth) => {
    setLoadingCalendar(true);

    try {
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();

      const startDateKey = makeDateKey(year, month, 1);
      const nextMonthDate = new Date(year, month + 1, 1);
      const nextMonthDateKey = makeDateKey(
        nextMonthDate.getFullYear(),
        nextMonthDate.getMonth(),
        nextMonthDate.getDate()
      );

      const rows = await fetchAllRowsForRange({
        startDateKey,
        endDateKey: nextMonthDateKey,
        columns: 'id, date_time, source_sheet, synced_at, sync_key',
      });

      const grouped = {};

      rows.forEach((row) => {
        const dateKey = getUploadedDateKey(row.date_time);

        if (!dateKey) return;

        if (!grouped[dateKey]) {
          grouped[dateKey] = {
            status: 'uploaded',
            rows: 0,
            uploads: 1,
            fileName: row.source_sheet || 'Google Sheet Upload',
            uploadedBy: 'Google Apps Script',
            lastUploaded: row.synced_at || null,
            warning: null,
            records: [],
            summaryOnly: true,
          };
        }

        grouped[dateKey].rows += 1;
        grouped[dateKey].records.push(row);

        if (
          row.synced_at &&
          (!grouped[dateKey].lastUploaded ||
            row.synced_at > grouped[dateKey].lastUploaded)
        ) {
          grouped[dateKey].lastUploaded = row.synced_at;
        }
      });

      Object.keys(grouped).forEach((dateKey) => {
        const syncKeys = grouped[dateKey].records
          .map((r) => r.sync_key)
          .filter(Boolean);

        const uniqueSyncKeys = new Set(syncKeys);

        if (syncKeys.length !== uniqueSyncKeys.size) {
          grouped[dateKey].status = 'duplicate';
          grouped[dateKey].warning = 'Duplicate sync keys detected for this date.';
        }

        grouped[dateKey].records = [];
      });

      setCalendarData((prev) => ({
        ...prev,
        ...grouped,
      }));
    } catch (error) {
      console.error('Error loading EOD calendar summary:', error.message);
      setCalendarData({});
    }

    setLoadingCalendar(false);
  };

  const fetchSelectedDayData = async (dateKey) => {
    setLoadingDay(true);

    try {
      const nextDateKey = getNextDateKey(dateKey);

      const rows = await fetchAllRowsForRange({
        startDateKey: dateKey,
        endDateKey: nextDateKey,
        columns:
          'id, date_time, source_sheet, synced_at, source_row, sync_key, total, premium, fee, csr, office, method',
      });

      const syncKeys = rows.map((r) => r.sync_key).filter(Boolean);
      const uniqueSyncKeys = new Set(syncKeys);
      const hasDuplicates = syncKeys.length !== uniqueSyncKeys.size;

      setCalendarData((prev) => ({
        ...prev,
        [dateKey]: {
          status: hasDuplicates ? 'duplicate' : rows.length > 0 ? 'uploaded' : 'none',
          rows: rows.length,
          uploads: rows.length > 0 ? 1 : 0,
          fileName: rows[0]?.source_sheet || 'Google Sheet Upload',
          uploadedBy: 'Google Apps Script',
          lastUploaded: rows.reduce((latest, row) => {
            if (!row.synced_at) return latest;
            return !latest || row.synced_at > latest ? row.synced_at : latest;
          }, null),
          warning: hasDuplicates
            ? 'Duplicate sync keys detected for this date.'
            : null,
          records: rows,
          summaryOnly: false,
        },
      }));
    } catch (error) {
      console.error('Error loading selected EOD day:', error.message);
    }

    setLoadingDay(false);
  };

  const changeMonth = (amount) => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + amount, 1)
    );
    setSelectedDate(null);
  };

  const goToCurrentMonth = () => {
    setCurrentMonth(new Date());
    setSelectedDate(null);
  };

  const metrics = useMemo(() => {
    if (!selectedRecord || !selectedRecord.records || selectedRecord.summaryOnly) {
      return {
        totalCollected: 0,
        totalPremium: 0,
        totalFees: 0,
        topMethod: 'None',
        topCsr: 'None',
        topOffice: 'None',
      };
    }

    let totalCollected = 0;
    let totalPremium = 0;
    let totalFees = 0;

    const methods = {};
    const csrs = {};
    const offices = {};

    selectedRecord.records.forEach((row) => {
      const rTotal = Number(row.total) || 0;
      const rPremium = Number(row.premium) || 0;
      const rFee = Number(row.fee) || 0;

      totalCollected += rTotal;
      totalPremium += rPremium;
      totalFees += rFee;

      if (row.method) methods[row.method] = (methods[row.method] || 0) + rTotal;
      if (row.csr) csrs[row.csr] = (csrs[row.csr] || 0) + rTotal;
      if (row.office) offices[row.office] = (offices[row.office] || 0) + rTotal;
    });

    const getTopKey = (obj) => {
      const entries = Object.entries(obj);
      if (entries.length === 0) return 'None';
      return entries.sort((a, b) => b[1] - a[1])[0][0];
    };

    return {
      totalCollected,
      totalPremium,
      totalFees,
      topMethod: getTopKey(methods),
      topCsr: getTopKey(csrs),
      topOffice: getTopKey(offices),
    };
  }, [selectedRecord]);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(val);
  };

  const formattedDateString = useMemo(() => {
    if (!selectedDate) return '';
    const parts = selectedDate.split('-');
    const d = new Date(parts[0], parts[1] - 1, parts[2]);

    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [selectedDate]);

  return (
    <div className="eod-page">
      <style>{`
        .eod-page {
          --bg: #f4f7fb;
          --surface: #ffffff;
          --surface-soft: #f8fafc;
          --surface-glass: rgba(255, 255, 255, 0.82);
          --text: #0f172a;
          --muted: #64748b;
          --muted-light: #94a3b8;
          --border: #e2e8f0;
          --border-soft: rgba(15, 23, 42, 0.08);
          --blue: #3b82f6;
          --blue-soft: #eff6ff;
          --green: #10b981;
          --green-dark: #047857;
          --green-soft: #ecfdf5;
          --red: #f43f5e;
          --red-dark: #be123c;
          --red-soft: #fff1f2;

          display: flex;
          min-height: 100vh;
          width: 100%;
          background:
            radial-gradient(circle at top left, rgba(59, 130, 246, 0.10), transparent 34%),
            radial-gradient(circle at top right, rgba(16, 185, 129, 0.08), transparent 30%),
            var(--bg);
          color: var(--text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .eod-content {
          flex: 1;
          width: 100%;
          max-width: 1520px;
          margin: 0 auto;
          padding: 40px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .eod-header {
          background:
            linear-gradient(135deg, rgba(59, 130, 246, 0.10), rgba(16, 185, 129, 0.06)),
            rgba(255,255,255,0.65);
          border: 1px solid rgba(255,255,255,0.75);
          box-shadow: 0 12px 36px rgba(15, 23, 42, 0.06);
          backdrop-filter: blur(14px);
          border-radius: 24px;
          padding: 28px 32px;
        }

        .eod-header h1 {
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.04em;
          margin: 0 0 8px 0;
          color: var(--text);
        }

        .eod-header p {
          color: var(--muted);
          margin: 0;
          font-size: 14px;
          line-height: 1.5;
        }

        .eod-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 430px;
          gap: 32px;
          align-items: start;
        }

        .eod-calendar-panel,
        .summary-sidebar,
        .placeholder-sidebar {
          background: var(--surface-glass);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.76);
          border-radius: 24px;
          box-shadow:
            0 20px 48px rgba(15, 23, 42, 0.08),
            inset 0 1px 0 rgba(255,255,255,0.8);
        }

        .eod-calendar-panel {
          padding: 28px;
        }

        .eod-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 24px;
        }

        .eod-panel-header h2 {
          font-size: 19px;
          font-weight: 800;
          letter-spacing: -0.025em;
          margin: 0;
          color: var(--text);
        }

        .eod-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          font-size: 12px;
          font-weight: 600;
          color: var(--muted);
        }

        .eod-legend span {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .eod-legend b {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          display: inline-block;
        }

        .dot-uploaded { background-color: var(--green); }
        .dot-duplicate { background-color: var(--red); }
        .dot-none { background-color: #cbd5e1; }

        .eod-month-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          background: rgba(248,250,252,0.9);
          padding: 14px;
          border-radius: 18px;
          margin-bottom: 22px;
          border: 1px solid var(--border-soft);
        }

        .eod-control-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .eod-month-controls button {
          background: #ffffff;
          color: var(--text);
          border: 1px solid var(--border);
          padding: 8px 14px;
          border-radius: 12px;
          font-size: 13px;
          cursor: pointer;
          font-weight: 700;
          transition:
            transform 0.15s ease,
            box-shadow 0.15s ease,
            background 0.15s ease,
            border-color 0.15s ease;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        }

        .eod-month-controls button:hover {
          background: #f9fafb;
          border-color: #cbd5e1;
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
        }

        .eod-month-title {
          text-align: right;
          display: flex;
          flex-direction: column;
          min-width: max-content;
        }

        .eod-month-title span {
          font-size: 11px;
          text-transform: uppercase;
          color: var(--muted);
          letter-spacing: 0.08em;
          font-weight: 800;
        }

        .eod-month-title strong {
          font-size: 18px;
          color: var(--text);
          letter-spacing: -0.025em;
        }

        .eod-loading {
          color: var(--blue);
          background: var(--blue-soft);
          border: 1px solid #bfdbfe;
          padding: 10px 12px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          margin: 0 0 16px 0;
        }

        .eod-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          text-align: center;
          font-weight: 800;
          color: var(--muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 12px;
        }

        .eod-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 12px;
        }

        .eod-empty-cell {
          aspect-ratio: 1.2;
        }

        .eod-day-cell {
          aspect-ratio: 1.2;
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: flex-start;
          cursor: pointer;
          transition:
            transform 0.16s ease,
            box-shadow 0.16s ease,
            border-color 0.16s ease,
            background 0.16s ease;
          text-align: left;
          font-family: inherit;
        }

        .eod-day-cell:hover {
          transform: translateY(-3px);
          box-shadow: 0 14px 28px rgba(15, 23, 42, 0.10);
          border-color: #cbd5e1;
        }

        .eod-day-cell.selected {
          border-color: #60a5fa;
          box-shadow:
            0 0 0 4px rgba(59,130,246,0.15),
            0 16px 32px rgba(59,130,246,0.14);
        }

        .eod-day-num {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .eod-day-status {
          font-size: 11px;
          font-weight: 800;
          border-radius: 999px;
          padding: 4px 8px;
          line-height: 1;
        }

        .eod-day-cell.uploaded {
          background: var(--green-soft);
          border-color: #bbf7d0;
          color: #065f46;
        }

        .eod-day-cell.uploaded .eod-day-status {
          background: #d1fae5;
          color: #047857;
        }

        .eod-day-cell.duplicate {
          background: var(--red-soft);
          border-color: #fecdd3;
          color: var(--red-dark);
        }

        .eod-day-cell.duplicate .eod-day-status {
          background: #ffe4e6;
          color: var(--red-dark);
        }

        .eod-day-cell.none {
          background: #ffffff;
          border-color: #e5e7eb;
          color: #94a3b8;
        }

        .eod-day-cell.none .eod-day-status {
          background: #f1f5f9;
          color: #94a3b8;
        }

        .summary-sidebar {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          position: sticky;
          top: 24px;
        }

        .summary-sidebar-header {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 4px 2px 0;
        }

        .summary-tag {
          font-size: 11px;
          font-weight: 900;
          color: var(--green-dark);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .summary-title {
          font-size: 22px;
          font-weight: 850;
          color: var(--text);
          margin: 0;
          letter-spacing: -0.04em;
        }

        .summary-subtitle {
          font-size: 12px;
          color: var(--muted);
          font-weight: 600;
        }

        .divider {
          border: 0;
          height: 1px;
          background: var(--border);
          margin: 2px 0;
        }

        .main-financial-card {
          background:
            linear-gradient(135deg, rgba(59,130,246,0.10), rgba(16,185,129,0.10)),
            #ffffff;
          border: 1px solid rgba(59,130,246,0.14);
          border-radius: 22px;
          padding: 22px;
          position: relative;
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
          overflow: hidden;
        }

        .main-financial-card::after {
          content: "";
          position: absolute;
          right: -48px;
          top: -48px;
          width: 140px;
          height: 140px;
          background: radial-gradient(circle, rgba(59,130,246,0.18), transparent 70%);
          pointer-events: none;
        }

        .card-label {
          font-size: 11px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 900;
        }

        .big-deposit-metric {
          font-size: 36px;
          font-weight: 900;
          color: var(--text);
          letter-spacing: -0.055em;
          margin-top: 6px;
          line-height: 1.05;
        }

        .sub-financial-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 18px;
          padding-top: 18px;
          border-top: 1px solid rgba(15,23,42,0.08);
        }

        .sub-metric-val {
          font-size: 15px;
          font-weight: 850;
          color: var(--text);
          margin-top: 4px;
          letter-spacing: -0.02em;
        }

        .sub-metric-val.fee-color {
          color: var(--green-dark);
        }

        .operational-insight-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .insight-mini-card,
        .leaderboard-row {
          background: #ffffff;
          border: 1px solid var(--border-soft);
          border-radius: 18px;
          box-shadow: 0 10px 24px rgba(15,23,42,0.05);
        }

        .insight-mini-card {
          padding: 16px;
        }

        .insight-val {
          font-size: 16px;
          font-weight: 850;
          color: var(--text);
          margin-top: 5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: -0.025em;
        }

        .leaderboard-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .section-subtitle {
          font-size: 11px;
          font-weight: 900;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding-left: 2px;
        }

        .leaderboard-row {
          padding: 15px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .leaderboard-info-box {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .leaderboard-title {
          font-size: 11px;
          color: var(--muted);
          font-weight: 800;
        }

        .leaderboard-name {
          font-size: 14px;
          font-weight: 800;
          color: var(--text);
          margin-top: 3px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .leaderboard-badge {
          font-size: 11px;
          font-weight: 900;
          background: var(--green-soft);
          color: var(--green-dark);
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid #bbf7d0;
          flex-shrink: 0;
        }

        .status-pill-warning {
          color: var(--red-dark);
          background: var(--red-soft);
          border: 1px solid #fecdd3;
          padding: 10px 12px;
          border-radius: 14px;
          font-size: 12px;
          font-weight: 800;
        }

        .audit-footer {
          margin-top: auto;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--muted);
          padding-top: 16px;
          border-top: 1px solid var(--border);
          font-weight: 650;
        }

        .pulse-dot {
          width: 7px;
          height: 7px;
          background-color: var(--green);
          border-radius: 50%;
          box-shadow: 0 0 0 5px rgba(16,185,129,0.12);
        }

        .placeholder-sidebar {
          min-height: 360px;
          padding: 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--muted);
          text-align: center;
          font-size: 14px;
          line-height: 1.6;
          border-style: dashed;
        }

        .placeholder-sidebar p {
          margin: 0;
          max-width: 320px;
          font-weight: 650;
        }

        @media (max-width: 1180px) {
          .eod-layout {
            grid-template-columns: 1fr;
          }

          .summary-sidebar {
            position: static;
          }
        }

        @media (max-width: 760px) {
          .eod-content {
            padding: 20px;
          }

          .eod-header,
          .eod-calendar-panel,
          .summary-sidebar,
          .placeholder-sidebar {
            border-radius: 20px;
          }

          .eod-panel-header,
          .eod-month-controls {
            align-items: flex-start;
            flex-direction: column;
          }

          .eod-month-title {
            text-align: left;
          }

          .eod-calendar-grid {
            gap: 8px;
          }

          .eod-day-cell {
            border-radius: 14px;
            padding: 9px;
          }

          .eod-day-num {
            font-size: 15px;
          }

          .eod-day-status {
            font-size: 9px;
            padding: 3px 6px;
          }

          .big-deposit-metric {
            font-size: 30px;
          }
        }
      `}</style>

      <main className="eod-content">
        <header className="eod-header">
          <h1>EOD Data Calendar</h1>
          <p>
            Verify raw End-of-Day data uploads from the daily_eod_transfers table.
          </p>
        </header>

        <div className="eod-layout">
          <section className="eod-calendar-panel">
            <div className="eod-panel-header">
              <h2>Month View Calendar</h2>

              <div className="eod-legend">
                <span>
                  <b className="dot-uploaded"></b> Uploaded
                </span>
                <span>
                  <b className="dot-duplicate"></b> Duplicate Detected
                </span>
                <span>
                  <b className="dot-none"></b> No data
                </span>
              </div>
            </div>

            <div className="eod-month-controls">
              <div className="eod-control-buttons">
                <button onClick={() => changeMonth(-1)}>‹ Previous Month</button>
                <button onClick={() => changeMonth(1)}>Next Month ›</button>
                <button onClick={goToCurrentMonth}>Current Month</button>
              </div>

              <div className="eod-month-title">
                <span>Month</span>
                <strong>
                  {monthName.toUpperCase()} {currentMonth.getFullYear()}
                </strong>
              </div>
            </div>

            {(loadingCalendar || loadingDay) && (
              <p className="eod-loading">
                {loadingDay
                  ? 'Loading all rows for selected day...'
                  : 'Loading EOD calendar summary...'}
              </p>
            )}

            <div className="eod-weekdays">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>

            <div className="eod-calendar-grid">
              {days.map((day, index) => {
                if (!day) return <div key={index} className="eod-empty-cell" />;

                const record = calendarData[day.dateKey];
                const status = record?.status || 'none';

                return (
                  <button
                    key={day.dateKey}
                    className={`eod-day-cell ${status} ${
                      selectedDate === day.dateKey ? 'selected' : ''
                    }`}
                    onClick={() => setSelectedDate(day.dateKey)}
                  >
                    <span className="eod-day-num">{day.day}</span>
                    <span className="eod-day-status">
                      {getStatusLabel(status)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside>
            {selectedDate ? (
              <div className="summary-sidebar">
                <div className="summary-sidebar-header">
                  <span className="summary-tag">End of Day Overview</span>
                  <h2 className="summary-title">{formattedDateString}</h2>
                  <span className="summary-subtitle">
                    Raw Key Target: {selectedDate}
                  </span>
                </div>

                <hr className="divider" />

                <div className="main-financial-card">
                  <span className="card-label">Total Deposits Captured</span>

                  <div className="big-deposit-metric">
                    {loadingDay
                      ? 'Loading...'
                      : formatCurrency(metrics.totalCollected)}
                  </div>

                  <div className="sub-financial-grid">
                    <div>
                      <span className="card-label">Net Premiums</span>
                      <div className="sub-metric-val">
                        {loadingDay
                          ? 'Loading...'
                          : formatCurrency(metrics.totalPremium)}
                      </div>
                    </div>

                    <div>
                      <span className="card-label">Agency Fees</span>
                      <div className="sub-metric-val fee-color">
                        {loadingDay
                          ? 'Loading...'
                          : formatCurrency(metrics.totalFees)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="operational-insight-grid">
                  <div className="insight-mini-card">
                    <span className="card-label">Row Count</span>
                    <div className="insight-val">
                      {loadingDay
                        ? 'Loading...'
                        : `${selectedRecord?.rows || 0} Entries`}
                    </div>
                  </div>

                  <div className="insight-mini-card">
                    <span className="card-label">Top Method</span>
                    <div className="insight-val" title={metrics.topMethod}>
                      {loadingDay ? 'Loading...' : metrics.topMethod}
                    </div>
                  </div>
                </div>

                <div className="leaderboard-container">
                  <span className="section-subtitle">Activity Spotlights</span>

                  <div className="leaderboard-row">
                    <div className="leaderboard-info-box">
                      <span className="leaderboard-title">Top Writing CSR</span>
                      <span className="leaderboard-name" title={metrics.topCsr}>
                        {loadingDay ? 'Loading...' : metrics.topCsr}
                      </span>
                    </div>

                    <span className="leaderboard-badge">Active</span>
                  </div>

                  <div className="leaderboard-row">
                    <div className="leaderboard-info-box">
                      <span className="leaderboard-title">Top Branch Office</span>
                      <span className="leaderboard-name">
                        {loadingDay ? 'Loading...' : metrics.topOffice}
                      </span>
                    </div>

                    <span className="leaderboard-badge">Active</span>
                  </div>
                </div>

                {selectedRecord?.warning && (
                  <div className="status-pill-warning">
                    ⚠️ {selectedRecord.warning}
                  </div>
                )}

                <div className="audit-footer">
                  <div className="pulse-dot"></div>
                  <span>Live background sync tracking is active.</span>
                </div>
              </div>
            ) : (
              <div className="placeholder-sidebar">
                <p>
                  Select an active calendar day to display the full EOD
                  analytical summary.
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};

export default CommissionUploader;
import React, { useEffect, useMemo, useState } from "react";
import styles from "./AdminTaxWip.module.css";
import { supabase } from "../../supabaseClient";

const TABLE_WIP = "tax_returns_match_status";

const OFFICE_REGIONS = {
  "CEN-CAL": [
    { code: "CA010", name: "NOBLE" },
    { code: "CA011", name: "VISALIA" },
    { code: "CA012", name: "PORTERVILLE" },
    { code: "CA022", name: "TULARE" },
    { code: "CA183", name: "HENDERSON" },
    { code: "CA229", name: "CORCORAN" },
    { code: "CA230", name: "AVENAL" },
    { code: "CA239", name: "COALINGA" },
  ],
  "KERN COUNTY": [
    { code: "CA016", name: "NILES" },
    { code: "CA047", name: "MING" },
    { code: "CA048", name: "NORRIS" },
    { code: "CA049", name: "WHITE" },
    { code: "CA172", name: "BRUNDAGE" },
    { code: "CA240", name: "ARVIN" },
  ],
  "BAY AREA": [
    { code: "CA076", name: "PITSBURG" },
    { code: "CA103", name: "ANTIOCH" },
    { code: "CA104", name: "RICHMOND" },
    { code: "CA114", name: "SAN LORENZO" },
    { code: "CA117", name: "VALLEJO" },
    { code: "CA149", name: "REDWOOD CITY" },
    { code: "CA150", name: "MENLO PARK" },
    { code: "CA216", name: "NAPA" },
    { code: "CA236", name: "SAN RAFAEL" },
    { code: "CA248", name: "SPRINGS" },
  ],
  "THE VALLEY": [
    { code: "CA025", name: "RIVERBANK" },
    { code: "CA030", name: "MERCED" },
    { code: "CA045", name: "ATWATER" },
    { code: "CA046", name: "TURLOCK" },
    { code: "CA065", name: "CROWS" },
    { code: "CA074", name: "CERES" },
    { code: "CA075", name: "MODESTO" },
    { code: "CA095", name: "PATTERSON" },
    { code: "CA118", name: "HOLLISTER" },
    { code: "CA119", name: "YOSEMITE" },
    { code: "CA231", name: "LIVINGSTON" },
    { code: "CA238", name: "CHOWCHILLA" },
  ],
  "SOUTHERN CALI": [
    { code: "CA131", name: "CHULA VISTA" },
    { code: "CA132", name: "NATIONAL CITY" },
    { code: "CA133", name: "SAN DIEGO" },
    { code: "CA166", name: "EL CAJON" },
    { code: "CA249", name: "BRAWLEY" },
    { code: "CA250", name: "BARRIO LOGAN" },
    { code: "CA269", name: "EL CENTRO" },
    { code: "CA270", name: "MONTCLAIR" },
    { code: "CA272", name: "LA PUENTE" },
  ],
};

const TABS = [
  { key: "calls", label: "Calls (Fresh In Progress)" },
  { key: "urgent", label: "Urgent Fixes (Rejected)" },
  { key: "verify", label: "Verify Receipts (Need Transmission)" },
  { key: "review", label: "Under Review" }, // NEW
  { key: "transmission", label: "Needs Transmission (Other Status)" }, // NEW
  { key: "contradiction", label: "Receipt Missing (Not In Progress)" },
  { key: "hygiene", label: "Data Hygiene" },
  { key: "all", label: "All (Work Queue)" },
  { key: "good", label: "✅ Good (Accepted/Paper + Receipt Good)" },
];

// --- UI Helper Components ---

const StatusBadge = ({ status }) => {
  const s = (status || "").toLowerCase();
  let badgeStyle = styles.badgeDefault;

  if (s === "accepted" || s === "paper") badgeStyle = styles.badgeSuccess;
  if (s === "rejected") badgeStyle = styles.badgeDanger;
  if (s === "review" || s === "transmitted") badgeStyle = styles.badgeWarning;
  if (s === "in progress") badgeStyle = styles.badgeInfo;
  if (s === "approved" || s === "complete") badgeStyle = styles.badgePrimary;

  return <span className={`${styles.badge} ${badgeStyle}`}>{status}</span>;
};

const ReceiptStatus = ({ receipt, accepted }) => {
  const r = (receipt ?? "").toString().trim();
  const a = (accepted ?? "").toString().trim().toLowerCase();

  const isMissing = !r || r.toLowerCase() === "null";
  const isGood = r.toLowerCase() === "good";
  const isFound = r.toLowerCase().includes("receipt found");

  const isContradiction =
    ["complete", "approved", "transmitted", "rejected"].includes(a) && isMissing;

  const isTimingIssue = a === "in progress" && isFound;

  if (isContradiction) {
    return (
      <div className={styles.receiptError}>
        <span className={styles.statusIcon}>🚨</span>
        <small>NO RECEIPT MADE</small>
      </div>
    );
  }

  if (isTimingIssue) {
    return (
      <div className={styles.receiptWarning}>
        <span className={styles.statusIcon}>⚠️</span>
        <small>NEED TRANSMISSION</small>
      </div>
    );
  }

  if (isGood) return <span className={styles.receiptGood}>✅ Good</span>;
  return <span className={styles.receiptNeutral}>📞 Needs Call</span>;
};

// --- Main Component ---

export default function AdminTaxWip() {
  const [activeTab, setActiveTab] = useState("calls");
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  // region/office filters
  const [selectedRegion, setSelectedRegion] = useState("ALL");
  const [selectedOffice, setSelectedOffice] = useState("ALL"); // office code (ex CA117) or ALL

  const [allRows, setAllRows] = useState([]); // server-filtered by open/closed + search only
  const [rows, setRows] = useState([]); // final displayed (office/region + tab)

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [assignEmail, setAssignEmail] = useState("");

  // ---------- Firm classification helpers ----------
  function normStatus(v) {
    return (v ?? "").toString().trim().toLowerCase();
  }

  function normReceipt(v) {
    return (v ?? "").toString().trim();
  }

  function isMissingReceiptFlag(r) {
    const rf = normReceipt(r?.receipt_flag);
    if (!rf) return true;
    return rf.toLowerCase() === "null";
  }

  function isReceiptGood(r) {
    return normReceipt(r?.receipt_flag).toLowerCase() === "good";
  }

  function isReceiptFound(r) {
    return normReceipt(r?.receipt_flag).toLowerCase().includes("receipt found");
  }

  // "Accepted Status other than Accepted, Rejected, Transmitted, Review or Paper"
  // (exclude In Progress so it stays in Calls/Verify)
  function isTransmissionOtherStatus(r) {
    const a = normStatus(r?.accepted);
    if (!a || a === "null") return false;

    const excluded = new Set(["accepted", "rejected", "transmitted", "review", "paper"]);
    if (excluded.has(a)) return false;

    if (a === "in progress") return false;
    return true;
  }

  // Mutually-exclusive classifier
  function classifyRow(r) {
    const a = normStatus(r?.accepted);

    // Good Done: Accepted OR Paper + Receipt Good
    if ((a === "accepted" || a === "paper") && isReceiptGood(r)) return "GOOD_DONE";

    // Under review
    if (a === "review") return "UNDER_REVIEW";

    // No receipt made: finished/rejected but missing receipt
    if (["complete", "approved", "transmitted", "rejected"].includes(a) && isMissingReceiptFlag(r)) {
      return "NO_RECEIPT_MADE";
    }

    // Need transmission: In Progress + receipt found
    if (a === "in progress" && isReceiptFound(r)) return "NEED_TRANSMISSION";

    // Calls: In Progress (everything else)
    if (a === "in progress") return "CALLS";

    // Urgent rejected bucket
    if (a === "rejected") return "URGENT_REJECTED";

    // Other status => needs transmission bucket
    if (isTransmissionOtherStatus(r)) return "TRANSMISSION_OTHER";

    return "OTHER";
  }

  function isGoodAcceptedRow(r) {
    return classifyRow(r) === "GOOD_DONE";
  }

  // ---------- Region/Office helpers ----------
  const officeMeta = useMemo(() => {
    const map = new Map();
    for (const [region, list] of Object.entries(OFFICE_REGIONS)) {
      for (const o of list) map.set(o.code, { region, name: o.name });
    }
    return map;
  }, []);

  const allOfficeOptions = useMemo(() => {
    const out = [];
    for (const [region, list] of Object.entries(OFFICE_REGIONS)) {
      for (const o of list) out.push({ ...o, region });
    }
    return out.sort((a, b) => {
      const r = a.region.localeCompare(b.region);
      if (r !== 0) return r;
      return a.code.localeCompare(b.code);
    });
  }, []);

  const officeOptionsForRegion = useMemo(() => {
    if (selectedRegion === "ALL") return allOfficeOptions;
    return allOfficeOptions.filter((o) => o.region === selectedRegion);
  }, [allOfficeOptions, selectedRegion]);

  function getOfficeCodeFromRow(r) {
    const v = r?.office_full ?? "";
    const base = v.split("-")[0]?.trim();
    return base || "Unknown";
  }

  function getOfficeLabel(code) {
    const meta = officeMeta.get(code);
    if (!meta) return code;
    return `${code} — ${meta.name}`;
  }

  useEffect(() => {
    if (selectedOffice === "ALL") return;
    const meta = officeMeta.get(selectedOffice);
    if (!meta) return;
    if (selectedRegion !== "ALL" && selectedRegion !== meta.region) {
      setSelectedRegion(meta.region);
    }
  }, [selectedOffice, selectedRegion, officeMeta]);

  useEffect(() => {
    if (selectedRegion === "ALL") return;
    if (selectedOffice === "ALL") return;
    const meta = officeMeta.get(selectedOffice);
    if (!meta || meta.region !== selectedRegion) setSelectedOffice("ALL");
  }, [selectedRegion]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyOfficeRegionFilter(raw) {
    let out = Array.isArray(raw) ? raw : [];

    if (selectedRegion !== "ALL") {
      const regionOfficeCodes = new Set((OFFICE_REGIONS[selectedRegion] || []).map((o) => o.code));
      out = out.filter((r) => regionOfficeCodes.has(getOfficeCodeFromRow(r)));
    }

    if (selectedOffice !== "ALL") {
      out = out.filter((r) => getOfficeCodeFromRow(r) === selectedOffice);
    }

    return out;
  }

  function applyViewFilter(raw) {
    const list = Array.isArray(raw) ? raw : [];

    if (activeTab === "good") return list.filter((r) => classifyRow(r) === "GOOD_DONE");

    // Work Queue excludes Good Done
    const work = list.filter((r) => classifyRow(r) !== "GOOD_DONE");

    if (activeTab === "calls") return work.filter((r) => classifyRow(r) === "CALLS");
    if (activeTab === "urgent") return work.filter((r) => classifyRow(r) === "URGENT_REJECTED");
    if (activeTab === "verify") return work.filter((r) => classifyRow(r) === "NEED_TRANSMISSION");
    if (activeTab === "review") return work.filter((r) => classifyRow(r) === "UNDER_REVIEW");
    if (activeTab === "transmission")
      return work.filter((r) => classifyRow(r) === "TRANSMISSION_OTHER");
    if (activeTab === "contradiction") return work.filter((r) => classifyRow(r) === "NO_RECEIPT_MADE");
    if (activeTab === "hygiene") {
      return work.filter((r) => {
        const a = normStatus(r?.accepted);
        return a === "" || a === "null";
      });
    }

    return work; // all
  }

  async function loadWips() {
    setLoading(true);
    setLoadError("");

    try {
      const pageSize = 1000;
      let from = 0;
      let all = [];

      while (true) {
        let q = supabase
          .from(TABLE_WIP)
          .select("*")
          .order("wip_priority", { ascending: true })
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);

        // Good tab can include closed; others default to open unless showClosed checked
        if (!showClosed && activeTab !== "good") {
          q = q.eq("wip_is_open", true);
        }

        const s = safeStr(search);
        if (s) {
          q = q.or(
            `sync_key.ilike.%${s}%,first.ilike.%${s}%,last.ilike.%${s}%,phone.ilike.%${s}%,office_full.ilike.%${s}%,preparer.ilike.%${s}%,last4.ilike.%${s}%`
          );
        }

        const { data, error } = await q;
        if (error) throw error;

        const chunk = data ?? [];
        all = all.concat(chunk);

        if (chunk.length < pageSize) break;
        from += pageSize;
        if (from > 50000) break; // safety
      }

      setAllRows(all);

      const scoped = applyOfficeRegionFilter(all);
      setRows(applyViewFilter(scoped));
    } catch (e) {
      setLoadError(e?.message || "Failed to load records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const scoped = applyOfficeRegionFilter(allRows);
    setRows(applyViewFilter(scoped));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegion, selectedOffice, activeTab, allRows]);

  useEffect(() => {
    loadWips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search, showClosed]);

  useEffect(() => {
    const channel = supabase
      .channel("tax_live")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE_WIP }, () => loadWips())
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search, showClosed, selectedOffice, selectedRegion]);

  // ---------- KPI ----------
  const kpi = useMemo(() => {
    const scoped = applyOfficeRegionFilter(allRows);
    const totalTaxes = scoped.length;

    const buckets = {
      GOOD: 0,
      "NEEDS CALL": 0,
      "NEED TRANSMISSION": 0,
      "NO RECEIPT MADE": 0,
    };

    for (const r of scoped) {
      if (isReceiptGood(r)) buckets.GOOD += 1;

      const cls = classifyRow(r);
      if (cls === "CALLS") buckets["NEEDS CALL"] += 1;
      if (cls === "NEED_TRANSMISSION") buckets["NEED TRANSMISSION"] += 1;
      if (cls === "NO_RECEIPT_MADE") buckets["NO RECEIPT MADE"] += 1;
    }

    const goodAccepted = scoped.filter(isGoodAcceptedRow).length;
    const workQueue = totalTaxes - goodAccepted;

    return { totalTaxes, workQueue, goodAccepted, buckets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, selectedRegion, selectedOffice]);

  function kpiTitle() {
    if (selectedOffice !== "ALL") {
      const meta = officeMeta.get(selectedOffice);
      const region = meta?.region ? ` • ${meta.region}` : "";
      const name = meta?.name ? ` — ${meta.name}` : "";
      return `KPI: ${selectedOffice}${name}${region}`;
    }
    if (selectedRegion !== "ALL") return `KPI: ${selectedRegion}`;
    return "KPI: G&P Overall";
  }

  function openDrawer(row) {
    setSelected(row);
    setAssignEmail(row?.assigned_to_email ?? "");
    setNoteText("");
  }

  function closeDrawer() {
    setSelected(null);
    setAssignEmail("");
    setNoteText("");
  }

  async function saveAssignment() {
    if (!selected) return;
    const email = safeStr(assignEmail) || null;

    const { error } = await supabase
      .from(TABLE_WIP)
      .update({ assigned_to_email: email })
      .eq("id", selected.id);

    if (error) {
      alert(error.message);
      return;
    }

    setSelected((prev) => (prev ? { ...prev, assigned_to_email: email } : prev));
    loadWips();
  }

  async function addNote(type = "manual", customBody = null) {
    if (!selected) return;
    const body = customBody || safeStr(noteText);
    if (!body) return;

    const { data: userData } = await supabase.auth.getUser();
    const byEmail = userData?.user?.email ?? "unknown";

    const existing = Array.isArray(selected.notes) ? selected.notes : [];
    const nextNotes = [...existing, { at: new Date().toISOString(), by: byEmail, type, body }];

    const { error } = await supabase
      .from(TABLE_WIP)
      .update({ notes: nextNotes, synced_at: new Date().toISOString() })
      .eq("id", selected.id);

    if (error) {
      alert(error.message);
      return;
    }

    setSelected((prev) => (prev ? { ...prev, notes: nextNotes } : prev));
    setNoteText("");
    loadWips();
  }

  async function markResolved({ override = false } = {}) {
    if (!selected) return;

    const patch = {
      wip_is_open: false,
      ...(override ? { closed_override: true } : {}),
    };

    const { error } = await supabase.from(TABLE_WIP).update(patch).eq("id", selected.id);
    if (error) {
      alert(error.message);
      return;
    }

    await addNote("system", override ? "Marked resolved (override)." : "Marked resolved.");
    closeDrawer();
  }

  async function reopenCase() {
    if (!selected) return;

    const { error } = await supabase
      .from(TABLE_WIP)
      .update({ wip_is_open: true, closed_override: false })
      .eq("id", selected.id);

    if (error) {
      alert(error.message);
      return;
    }

    await addNote("system", "Reopened case.");
    loadWips();
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Tax WIP Queue</h1>
          <div className={styles.subTitle}>Smart Filtering Active • {rows.length} records in this view</div>
        </div>

        <div className={styles.controls}>
          <select
            className={styles.input}
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            title="Filter by Region"
            style={{ minWidth: 180 }}
          >
            <option value="ALL">All Regions</option>
            {Object.keys(OFFICE_REGIONS).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <select
            className={styles.input}
            value={selectedOffice}
            onChange={(e) => setSelectedOffice(e.target.value)}
            title="Filter by Office"
            style={{ minWidth: 220 }}
          >
            <option value="ALL">
              {selectedRegion === "ALL" ? "All Offices (G&P)" : `All Offices (${selectedRegion})`}
            </option>
            {officeOptionsForRegion.map((o) => (
              <option key={o.code} value={o.code}>
                {o.code} — {o.name}
              </option>
            ))}
          </select>

          <input
            className={styles.search}
            placeholder="Search name / last4 / phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <label className={styles.checkbox}>
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            Show closed
          </label>

          <button className={styles.btn} onClick={loadWips} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

      {/* KPI BAR */}
      <section style={{ margin: "12px 0" }}>
        <div className={styles.tableCard} style={{ padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>{kpiTitle()}</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div>
                Total Taxes: <b>{kpi.totalTaxes}</b>
              </div>
              <div>
                Work Queue: <b>{kpi.workQueue}</b>
              </div>
              <div>
                Good Done (Accepted/Paper + Good): <b>{kpi.goodAccepted}</b>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <KpiChip label="📞 Needs Call" value={kpi.buckets["NEEDS CALL"] || 0} />
            <KpiChip label="⚠️ Need Transmission" value={kpi.buckets["NEED TRANSMISSION"] || 0} />
            <KpiChip label="🚨 No Receipt Made" value={kpi.buckets["NO RECEIPT MADE"] || 0} />
            <KpiChip label="✅ Receipt Good" value={kpi.buckets["GOOD"] || 0} />
          </div>
        </div>
      </section>

      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loadError && <div className={styles.error}>{loadError}</div>}

      <div className={styles.content}>
        <div className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Last 4</th>
                  <th>Office</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Tax Status</th>
                  <th>Receipt Status</th>
                  <th>Assigned</th>
                  <th>Created</th>
                  <th>Tax Year</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const officeCode = getOfficeCodeFromRow(r);
                  return (
                    <tr key={r.id} onClick={() => openDrawer(r)} className={styles.row}>
                      <td>
                        <span className={styles.priorityBox}>{r.wip_priority ?? 3}</span>
                      </td>
                      <td className={styles.boldText}>{r.last4 || "----"}</td>

                      <td className={styles.dimText} title={getOfficeLabel(officeCode)}>
                        {officeCode}
                      </td>

                      <td className={styles.boldText}>{`${safeStr(r.first)} ${safeStr(r.last)}`.trim()}</td>

                      <td>{r.phone ?? ""}</td>
                      <td>
                        <StatusBadge status={r.accepted} />
                      </td>
                      <td>
                        <ReceiptStatus receipt={r.receipt_flag} accepted={r.accepted} />
                      </td>

                      <td>
                        <span className={styles.assignee}>{r.assigned_to_email?.split("@")[0] ?? "—"}</span>
                      </td>

                      <td className={styles.dimText}>{formatDate(r.created_at).split(",")[0]}</td>
                      <td className={styles.dimText}>{r.tax_year ?? "—"}</td>
                    </tr>
                  );
                })}

                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={10} className={styles.empty}>
                      No cases meet this criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className={`${styles.drawer} ${selected ? styles.drawerOpen : ""}`}>
          {selected && (
            <div className={styles.drawerBody}>
              <div className={styles.drawerHeader}>
                <div>
                  <div className={styles.drawerTitle}>
                    {`${selected.first} ${selected.last}`} ({selected.last4 || "N/A"})
                  </div>
                  <div className={styles.drawerMeta}>
                    <StatusBadge status={selected.accepted} />
                    <ReceiptStatus receipt={selected.receipt_flag} accepted={selected.accepted} />
                  </div>
                </div>
                <button className={styles.iconBtn} onClick={closeDrawer}>
                  ✕
                </button>
              </div>

              {/* ✅ FIXED: only ONE Agent Instruction section */}
              <section className={styles.section}>
                <div className={styles.sectionTitle}>Agent Instruction</div>
                <div className={styles.instructionBox}>
                  {/* NEW: Show raw receipt_flag from Supabase */}
                  <div style={{ marginBottom: 8, opacity: 0.85 }}>
                    <b>Receipt Flag (raw):</b>{" "}
                    <span style={{ fontFamily: "monospace" }}>{selected.receipt_flag ?? "NULL"}</span>
                  </div>

                  {normStatus(selected.accepted) === "in progress" && isReceiptFound(selected) && (
                    <div className={styles.warningText}>
                      ⚠️ RECEIPT FOUND: Transmit the tax return as soon as possible.
                    </div>
                  )}

                  {["complete", "approved", "transmitted", "rejected"].includes(normStatus(selected.accepted)) &&
                    isMissingReceiptFlag(selected) && (
                      <div className={styles.dangerText}>
                        🚨 NO RECEIPT WAS MADE FOR THIS COMPLETED TAX: Stop and fix immediately. Create missing
                        receipt or notify supervisor.
                      </div>
                    )}

                  {normStatus(selected.accepted) === "in progress" &&
                    (() => {
                      const missing = isMissingReceiptFlag(selected);
                      const found = isReceiptFound(selected);
                      return missing || !found ? (
                        <div>👉 Agent needs to call this client to get them back in to close the Tax.</div>
                      ) : null;
                    })()}

                  {normStatus(selected.accepted) === "rejected" && (
                    <div className={styles.dangerText}>🚨 REJECTED: Correct error ASAP and re-transmit!</div>
                  )}

                  {isTransmissionOtherStatus(selected) && (
                    <div className={styles.warningText}>
                      ⚠️ STATUS NEEDS REVIEW FOR TRANSMISSION: This return is not in Accepted/Rejected/Transmitted/Review/Paper.
                      Confirm status + transmit workflow.
                    </div>
                  )}

                  {normStatus(selected.accepted) === "review" && (
                    <div className={styles.warningText}>🕵️ UNDER REVIEW: Check notes/errors and move forward.</div>
                  )}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionTitle}>Assignment</div>
                <div className={styles.inline}>
                  <input
                    className={styles.input}
                    placeholder="Email"
                    value={assignEmail}
                    onChange={(e) => setAssignEmail(e.target.value)}
                  />
                  <button className={styles.btn} onClick={saveAssignment}>
                    Save
                  </button>
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionTitle}>Actions</div>
                <div className={styles.actions}>
                  {selected.wip_is_open ? (
                    <>
                      <button className={styles.btnPrimary} onClick={() => markResolved()}>
                        Resolve
                      </button>
                      <button className={styles.btnWarn} onClick={() => markResolved({ override: true })}>
                        Override
                      </button>
                    </>
                  ) : (
                    <button className={styles.btnPrimary} onClick={reopenCase}>
                      Reopen
                    </button>
                  )}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionTitle}>Notes History</div>
                <div className={styles.notesList}>
                  {(selected.notes || [])
                    .slice()
                    .reverse()
                    .map((n, i) => (
                      <div key={i} className={styles.note}>
                        <div className={styles.noteTop}>
                          <b>{n.by}</b> • {formatDate(n.at)}
                        </div>
                        <div className={styles.noteBody}>{n.body}</div>
                      </div>
                    ))}
                </div>

                <textarea
                  className={styles.textarea}
                  placeholder="New note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <button className={styles.btnPrimary} onClick={() => addNote("manual")}>
                  Add Note
                </button>
              </section>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// Small KPI pill
function KpiChip({ label, value }) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12,
        padding: "8px 10px",
        background: "rgba(255,255,255,0.9)",
        minWidth: 160,
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <span style={{ opacity: 0.85 }}>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function safeStr(v) {
  return (v ?? "").toString().trim();
}

function formatDate(v) {
  try {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  } catch {
    return "";
  }
}

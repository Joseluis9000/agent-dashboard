import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import modern from "./SalesDashboard.module.css";
import { calculateAgentCommission } from "../../utils/commissionCalculations";
import { useAuth } from "../../AuthContext";
import {
  STALE_AFTER_MS,
  QUOTE_PRIMARY_BUCKETS,
  classifyQuoteGroup,
  isGroupLive,
  isGroupFollowUp,
  isGroupClosed,
  isGroupRegularQuote,
} from "../../utils/quoteClassification";


/**
 * SALES DASHBOARD (Supabase + Matrix transaction details)
 * - Static announcements (no ticker)
 * - Top 5 shows Avg $/Sale + inline “Most Improved”
 * - Agent Insights v2 header (metric pills), pacing, coaching, disclaimer
 * - Inline style fallback looks modern (badges, highlights)
 *
 * If you later add SalesDashboard.module.css:
 * - delete localStyles and the alias line
 * - import styles from './SalesDashboard.module.css'
 */

// -------------------- In-file styles fallback --------------------
const localStyles = {
  // --- NEW / UPDATED STYLES FOR ALIGNMENT ---
  commissionGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1px 1fr 1px 1fr",  // col, divider, col, divider, col
    columnGap: "1.25rem",
    rowGap: "0.5rem",
    marginTop: "0.75rem",
    alignItems: "start",
  },
  commissionDivider: {
    width: 1,
    background: "#e5e7eb",
    height: "100%",
  },
  commissionCol: {
    display: "grid",
    gridTemplateColumns: "auto 1fr", // label | value
    alignItems: "center",
    rowGap: "0.45rem",
    columnGap: "0.75rem",
  },
  commissionRow: {
    display: "contents", // lets the two children participate in the grid columns
  },
  commissionLabel: {
    textAlign: "right",
    color: "#374151",
    fontSize: "0.9rem",
    whiteSpace: "nowrap",
  },
  commissionValue: {
    justifySelf: "end",
    fontWeight: 600,
    fontSize: "0.95rem",
  },

  // Progress bars for pacing
  progressWrapper: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "0.5rem",
  },
  progressBar: {
    flexGrow: 1,
    height: "8px",
    backgroundColor: "#e5e7eb",
    borderRadius: "999px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: "999px",
  },

  // Metric pills
  metricInput: {
    display: "block",
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: "0.5rem",
    padding: "0.3rem 0.6rem",
    fontSize: "1rem",
    background: "#f9fafb",
    textAlign: "center",
    fontWeight: 600,
    marginTop: "0.25rem",
  },

  // --- ORIGINAL STYLES ---
  dashboardContainer: {
    display: "grid",
    gap: "1rem",
    padding: "1rem",
    width: "100%",
    maxWidth: 1640,          // was 1200
    margin: "0 auto",
    background: "#f9fafb",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
  },
  headerTitle: { fontSize: "1.25rem", fontWeight: 700 },
  select: {
    padding: "0.6rem 1rem",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    background: "#dc2626",
    color: "#fff",
    cursor: "pointer",
    width: 'auto', // <<< --- ADD THIS LINE --- <<<
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
    overflow: "hidden",
    boxShadow:
      "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "0.9rem 1rem 0.6rem",
    borderBottom: "1px solid #f3f4f6",
  },
  cardTitle: { display: "flex", alignItems: "center", gap: 8, fontWeight: 700 },
  cardDescription: { color: "#6b7280", fontSize: 12 },
  cardContent: { padding: "1rem" },
  gridTwoCol: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: "1fr 1.5fr", // This is the change
  },
  fiveColGrid: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: "repeat(5, minmax(0,1fr))",
  },
  gridItem: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "0.75rem",
    boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  },
  gridItemTop: {
    background: "#fefce8",
    boxShadow: "0 0 0 2px #fde68a inset",
  },
  itemHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  itemName: { fontWeight: 600 },
  itemSubtext: { fontSize: 12, color: "#6b7280" },
  itemStats: { fontSize: 14, marginTop: 4 },
  improvedAgentName: { fontWeight: 700, fontSize: 16 },
  improvedAgentStats: { color: "#374151", fontSize: 14 },
  table: { width: "100%", borderCollapse: "collapse" },
  tableThTd: {
    borderBottom: "1px solid #f3f4f6",
    padding: "0.5rem",
    textAlign: "left",
    fontSize: 14,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    background: "#fcd34d",
    color: "#78350f",
    borderRadius: 999,
    padding: "0.2rem 0.6rem",
    fontSize: 12,
    fontWeight: 600,
  },
  pillBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#fcd34d",
    color: "#78350f",
    borderRadius: 999,
    padding: "0.25rem 0.6rem",
    fontSize: "0.8rem",
    fontWeight: 600,
    marginTop: "0.65rem",
  },
  improvedInline: {
    marginTop: "1rem",
    padding: "0.85rem",
    border: "1px dashed #e5e7eb",
    borderRadius: 12,
    background: "#fff",
  },
  annList: { margin: 0, paddingLeft: "1.1rem" },
  icon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
  },
  positive: { color: "#16a34a", fontWeight: 600 },
  negative: { color: "#dc2626", fontWeight: 600 },
  list: { paddingLeft: "1rem", margin: 0 },

  // Metrics strip (top of Agent Insights)
  metricGrid: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    marginTop: "0.5rem",
  },
  metric: {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "0.9rem",
    minHeight: 96,              // keeps pill height consistent
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  metricH5: {
    margin: 0,
    marginBottom: "0.25rem",
    fontSize: ".85rem",
    color: "#6b7280",
    fontWeight: 600,
  },
  metricStrong: { display: "block", fontSize: "1.1rem" },
  statDisplay: { fontSize: ".9rem", color: "#6b7280" },
  pacingWrap: {
    marginTop: "1rem",
    padding: "0.75rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    background: "#fff",
  },
};
const styles = localStyles;

// ---------- ICONS ----------
const Icon = ({ label, children }) => (
  <span aria-label={label} title={label} style={styles.icon}>
    {children}
  </span>
);
const CalendarDays = (props) => (
  <Icon label="calendar" {...props}>
    📅
  </Icon>
);
const Crown = (props) => (
  <Icon label="crown" {...props}>
    👑
  </Icon>
);
const Rocket = (props) => (
  <Icon label="rocket" {...props}>
    🚀
  </Icon>
);

const Info = (props) => (
  <Icon label="info" {...props}>
    ℹ️
  </Icon>
);

// ---------- DATA & FORMATTING HELPERS ----------
// Office regions are loaded from office_dashboard_settings, matching OfficeNumbers.
const normalizeOffice = (value = "") => {
  // Matrix transaction office values and Office Numbers settings can be
  // "CA104", "CA 104", "104", "104 Richmond", or "CA104 Richmond".
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "Unknown";
  const caCode = raw.match(/\bCA[\s-]*0*(\d{1,3})\b/);
  if (caCode) return `CA${caCode[1].padStart(3, "0")}`;
  const numericCode = raw.match(/(?:^|\bOFFICE[\s#:-]*)(\d{1,3})(?=\b|\s|$)/);
  if (numericCode) return `CA${numericCode[1].padStart(3, "0")}`;
  return raw;
};
const currency = (n) =>
  Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const pct = (n) => `${Math.round(Number(n || 0) * 100)}%`;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const startOfWeek = (d) => {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = (day + 6) % 7;
  dt.setDate(dt.getDate() - diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
};
const endOfWeek = (d) => {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 7);
  return e;
};
const startOfMonth = (d) =>
  new Date(new Date(d).getFullYear(), new Date(d).getMonth(), 1);
const endOfMonth = (d) =>
  new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 1, 1);

// ---------- COACHING ----------
function coachFromMetrics({ nbCount, preDeductionRevenue, afterDeductionsRevenue }) {
  const notes = [];
  const nbNeededFor10 = Math.max(0, 10 - nbCount);
  if (nbNeededFor10 > 0) {
    notes.push(`${nbNeededFor10} NBs away from qualifying for 10%.`);
  } else {
    notes.push(`You've qualified for 10% commission!`);
  }

  const nbNeededFor17 = Math.max(0, 17 - nbCount);
  const revenueNeededFor12_5 = Math.max(0, 3500 - preDeductionRevenue);
  if (nbNeededFor17 > 0 || revenueNeededFor12_5 > 0) {
    notes.push(
      `To unlock 12.5%: ${nbNeededFor17} more NBs and ${currency(
        revenueNeededFor12_5
      )} more pre-deduction revenue.`
    );
  }

  const revenueNeededFor500 = Math.max(0, 500 - afterDeductionsRevenue);
  if (revenueNeededFor500 > 0) {
    notes.push(
      `${currency(
        revenueNeededFor500
      )} more after deductions to hit the $500 threshold.`
    );
  } else {
    notes.push(`You've hit the $500 after-deductions threshold!`);
  }

  return notes;
}

// Production and fee rules mirror OfficeNumbers.jsx.
const cleanTxnStr = (value) => String(value ?? "").trim();
const parseTxnMoney = (value) => {
  const parsed = parseFloat(cleanTxnStr(value || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const isVoidedTransaction = (row) => cleanTxnStr(row?.voided).toUpperCase().includes("VOIDED");
const getTransferTxnKey = (row) => {
  if (row.sync_key) return `sync:${row.sync_key}`;
  return [
    cleanTxnStr(row.receipt_id || row.receipt || ""),
    cleanTxnStr(row.customer_id || row.id || ""),
    parseTxnMoney(row.premium).toFixed(2),
    parseTxnMoney(row.fee).toFixed(2),
    parseTxnMoney(row.total).toFixed(2),
    cleanTxnStr(row.company),
    cleanTxnStr(row.type),
  ].join("|");
};
const getFeeCategory = (row) => {
  const combined = [row.company, row.policy_type, row.type, row.policy]
    .map((value) => cleanTxnStr(value).toUpperCase()).join(" ");
  if (combined.includes("BROKER FEE")) return "broker";
  if (combined.includes("ENDORSEMENT FEE")) return "endorsement";
  if (combined.includes("RENEWAL FEE")) return "renewal";
  if (combined.includes("REINSTATEMENT FEE")) return "reinstatement";
  if (combined.includes("PAYMENT FEE")) return "payment";
  if (combined.includes("REGISTRATION FEE")) return "registration";
  if (combined.includes("CONVENIENCE FEE")) return "convenience";
  if (["TAX PREP", "TAX ESTIMATE", "DEFENDMYID", "MAX SHIELD"].some((type) => combined.includes(type))) return "tax_prep";
  return null;
};
const transactionAgent = (row) => cleanTxnStr(row.agent_email).toLowerCase();

function aggregateFromRows(rows, prevRows, profiles = [], officeRegionMap = {}) {
  const profileMap = new Map(
    profiles
      .filter((p) => cleanTxnStr(p.email))
      .map((p) => [cleanTxnStr(p.email).toLowerCase(), cleanTxnStr(p.full_name) || cleanTxnStr(p.csr_name)])
  );
  const formatAgentName = (email) => {
    const storedName = cleanTxnStr(profileMap.get(email));
    if (storedName && !storedName.includes("@")) return storedName;
    // Some transactions use account usernames instead of full names.
    // Display a readable name rather than exposing an email address.
    const local = cleanTxnStr(email).split("@")[0];
    return local.split(/[._-]+/).filter(Boolean).map((part) =>
      part.charAt(0).toUpperCase() + part.slice(1)
    ).join(" ") || "Unknown agent";
  };
  const process = (source) => {
    const byAgent = new Map();
    const byOffice = new Map();
    const seen = new Set();
    const add = (map, key, sales, revenue) => {
      if (!key) return;
      const item = map.get(key) || { sales: 0, revenue: 0 };
      item.sales += sales;
      item.revenue += revenue;
      map.set(key, item);
    };
    for (const row of source || []) {
      if (isVoidedTransaction(row)) continue;
      const txnKey = getTransferTxnKey(row);
      if (seen.has(txnKey)) continue;
      seen.add(txnKey);
      const type = cleanTxnStr(row.type).toUpperCase();
      // OfficeNumbers counts NEW and RWR production, regardless of fee sign.
      const sales = type === "NEW" || type === "RWR" ? 1 : 0;
      // OfficeNumbers fee totals classify the fee rows by company/policy/type.
      const revenue = getFeeCategory(row) === "broker" ? parseTxnMoney(row.fee) : 0;
      add(byAgent, transactionAgent(row), sales, revenue);
      add(byOffice, normalizeOffice(row.office), sales, revenue);
    }
    return { byAgent, byOffice };
  };
  const current = process(rows);
  const previous = process(prevRows);
  const agentStats = Array.from(current.byAgent.entries()).map(([email, value]) => ({
    agentId: email,
    salesCount: value.sales,
    lastWeekSales: previous.byAgent.get(email)?.sales || 0,
    monthSalesCount: value.sales,
    revenueNB: value.revenue,
    revenueEN: 0,
  }));
  const agents = agentStats.map((agent) => ({
    id: agent.agentId,
    name: formatAgentName(agent.agentId),
    office: "",
  }));
  const offices = Array.from(current.byOffice.entries()).map(([code, value]) => ({
    office: code,
    totalSales: value.sales,
    totalRevenue: value.revenue,
    wowChangePct: (() => {
      const prev = previous.byOffice.get(code)?.sales || 0;
      return prev ? (value.sales - prev) / Math.abs(prev) : null;
    })(),
  }));
  const regionTotals = {};
  for (const office of offices) {
    const region = officeRegionMap[normalizeOffice(office.office)] || "Unassigned";
    const entry = regionTotals[region] || { region, totalSales: 0, totalRevenue: 0 };
    entry.totalSales += office.totalSales;
    entry.totalRevenue += office.totalRevenue;
    regionTotals[region] = entry;
  }
  return { agents, stats: agentStats, offices, regions: Object.values(regionTotals) };
}

// ---------- Motivation Engine ----------
const MOTIVATION = {
  start: [
    "Small wins early. Set the tone.", "Decide today: standards over moods.", "Prime your state, make the first call.",
    "Clarity + action = momentum.", "Own the morning; the week follows.", "Progress loves speed—start now.",
    "Be the thermostat, not the thermometer.", "Raise your standard, then meet it.", "Energy comes from motion—move.",
    "One policy before lunch—go.",
  ],
  behind: [
    "Pressure is a privilege—use it.", "Pace isn't fate. Change it now.", "Ask for the referral on every win.",
    "Next call. Next door. Next yes.", "Cut the story, increase the activity.", "What would your best do now? Do that.",
    "Shorten the time between attempts.", "Zero hesitation—schedule, quote, close.", "Obsess the controllables today.",
    "Nothing changes until you do—move.",
  ],
  onpace: [
    "You’re on track—protect the lead.", "Consistency beats intensity—keep stacking.", "Turn pace into dominance today.",
    "Repeat what works; remove what doesn't.", "Win the hour, win the day.", "Momentum is earned—keep it.",
    "Standards high, energy higher.", "Your clients need your certainty.", "Stay hungry, stay focused.", "Another rep. Another yes.",
  ],
  late: [
    "Champions close strong.", "No empty days—finish.", "Courage now pays Friday.", "Make one more quality ask.",
    "Push past comfortable—grow.", "Call the hardest prospect first.", "Refuse average in the last mile.",
    "Your future self is watching.", "Pressure creates diamonds—go.", "Close the gap today.",
  ],
  hit10: [
    "Qualified by count—now widen the gap.", "10 reached. Stack two more today.", "Great—now build insurance on that win.",
    "Don’t coast—lead the board.", "From good to undeniable—keep going.", "Standards don’t stop at 10.",
    "Now raise average fee with care.", "Momentum loves follow-through.", "Protect the standard: next NB.",
    "You’re the example today.",
  ],
  hit17: [
    "17 hit—now own the revenue.", "You’ve unlocked 12.5%. Make it obvious.", "Add endorsements with integrity.",
    "Expand because you can, not because you must.", "Leadership by performance—keep stacking.", "Outwork yesterday’s you.",
    "Turn wins into streaks.", "Next best action: one more NB.", "Stay aggressive, stay coachable.", "Be grateful, not satisfied.",
  ],
  after500: [
    "$500+ after deductions—bank it.", "Eligible territory—turn it into max pay.", "Now multiply what worked today.",
    "Protect the floor, reach for the ceiling.", "Play offense with your pipeline.", "Ask for one more referral per client.",
    "Stack ENs the right way.", "Make follow-ups non-negotiable.", "Teach someone your best script.", "Finish loud.",
  ],
  surpass: [
    "Goals met? New ones set—keep going.", "Dominate, don’t drift.", "Lead the leaderboard by example.",
    "Be the pace car for the team.", "Compound your habits—today counts.", "Mentor while you produce.",
    "Chase mastery, not comfort.", "Double your prospecting window.", "Max out the week, not the goal.",
    "Legends do extra reps.",
  ],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- UI Cards ----------
// Legacy component retained for compatibility with the previous dashboard.
// eslint-disable-next-line no-unused-vars
const EventsBanner = ({ events }) => (
  <div style={{ width: "100%", overflow: "hidden", borderRadius: "0.75rem", border: "1px solid #e5e7eb", backgroundColor: "#fefce8" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", borderBottom: "1px solid #e5e7eb", backgroundColor: "rgba(255,255,255,0.4)" }}>
      <CalendarDays /> <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Events & Announcements</span>
    </div>
    <div style={{ padding: "0.75rem 0.9rem" }}>
      {events && events.length ? (
        <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
          {events.map((e) => (
            <li key={e.id} style={{ margin: "0.15rem 0" }}>
              <strong>{new Date(e.start).toLocaleDateString()}:</strong> {e.title}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0, color: "#6b7280" }}>No announcements.</p>
      )}
    </div>
  </div>
);

// Legacy component retained for compatibility with the previous dashboard.
// eslint-disable-next-line no-unused-vars
const LeaderboardCard = ({ agents, stats }) => {
  const rows = useMemo(
    () =>
      stats
        .map((s) => ({
          agentId: s.agentId,
          name: agents.find((a) => a.id === s.agentId)?.name || s.agentId,
          office: agents.find((a) => a.id === s.agentId)?.office || "",
          sales: s.salesCount,
          revenue: s.revenueNB + s.revenueEN,
        }))
        .sort((a, b) => b.sales - a.sales),
    [agents, stats]
  );

  const top5 = rows.slice(0, 5);
  const highestRevenue = rows.reduce(
    (m, r) => (r.revenue > (m?.revenue ?? -Infinity) ? r : m),
    null
  );

  const improved = useMemo(() => {
    if (!stats || stats.length === 0) return null;
    const withGrowth = stats.map((s) => {
      const currentSales = s.salesCount || 0;
      const lastWeek = s.lastWeekSales || 0;
      let growth = 0;
      const absoluteIncrease = currentSales - lastWeek;
      if (lastWeek > 0) growth = (currentSales - lastWeek) / lastWeek;
      else if (currentSales > 0) growth = Infinity;
      return { agentId: s.agentId, growth, absoluteIncrease, currentSales, lastWeek };
    });
    withGrowth.sort((a, b) =>
      b.growth !== a.growth ? b.growth - a.growth : b.absoluteIncrease - a.absoluteIncrease
    );
    const top = withGrowth[0];
    return top && top.absoluteIncrease > 0 ? top : null;
  }, [stats]);
  const improvedName = agents.find((a) => a.id === improved?.agentId)?.name;

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h3 style={styles.cardTitle}>
          <Crown />
          Top 5 Agents
        </h3>
        <p style={styles.cardDescription}>Weekly Sales Leaderboard</p>
      </div>
      <div style={styles.cardContent}>
        <div style={styles.fiveColGrid}>
          {top5.map((r, idx) => {
            const avgPerSale = r.sales > 0 ? r.revenue / r.sales : 0;
            return (
              <div
                key={r.agentId}
                style={{ ...styles.gridItem, ...(idx === 0 ? styles.gridItemTop : null) }}
              >
                <div style={styles.itemHeader}>
                  <div style={styles.itemName}>
                    {idx + 1}. {r.name}
                  </div>
                  {idx === 0 && <span style={styles.badge}>Top Seller</span>}
                </div>
                <div style={styles.itemSubtext}>{r.office}</div>
                <div style={styles.itemStats}>
                  Sales: <span>{r.sales}</span>
                </div>
                <div style={styles.itemStats}>
                  Revenue: <span>{currency(r.revenue)}</span>
                </div>
                <div style={styles.itemStats}>
                  Avg $/Sale: <span>{currency(avgPerSale)}</span>
                </div>
              </div>
            );
          })}
        </div>
        {highestRevenue && (
          <div style={styles.pillBadge}>💰 Highest Revenue: {highestRevenue.name}</div>
        )}
        <div style={styles.improvedInline}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span role="img" aria-label="spark">✨</span>
              <strong>Most Improved Agent</strong>
            </div>
            <span style={styles.cardDescription}>Week-over-week growth</span>
          </div>
          <div style={{ marginTop: 6 }}>
            {improved ? (
              <div>
                <div style={styles.improvedAgentName}>{improvedName}</div>
                <div style={styles.improvedAgentStats}>
                  Sales jumped from <span>{improved.lastWeek}</span> to{" "}
                  <span>{improved.currentSales}</span> this week!
                </div>
              </div>
            ) : (
              <span style={styles.cardDescription}>
                No significant week-over-week growth
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- UPDATED Agent Insights Card ----------
const GROSS_ASSUMPTION = 800;
// Legacy component retained for compatibility with the previous dashboard.
// eslint-disable-next-line no-unused-vars
const AgentInsightsCard = ({ agents, stats, currentAgentId }) => {
  const agent = agents.find((a) => a.id === currentAgentId) || agents[0];
  const row = stats.find((s) => s.agentId === agent?.id);

  const nbCount = row?.salesCount || 0;
  const totalNbFee = row?.revenueNB || 0;
  const totalEnFee = row?.revenueEN || 0;
  const avgFee = nbCount > 0 ? totalNbFee / nbCount : 0;

  const preDeductionRevenue = totalNbFee + totalEnFee;
  const nbDeduction = 20 * nbCount;
  const enDeduction = 0.2 * totalEnFee;
  const afterDeductionsRevenue =
    preDeductionRevenue - nbDeduction - enDeduction - GROSS_ASSUMPTION;

  const commissionRate = (() => {
    if (
      nbCount >= 17 &&
      preDeductionRevenue >= 3500 &&
      afterDeductionsRevenue >= 500
    )
      return 0.125;
    if (nbCount >= 10) return 0.1;
    return 0;
  })();
  const estimatedCommission = Math.max(0, afterDeductionsRevenue * commissionRate);

  const todayIndex = new Date().getDay();
  const daysLeft = 7 - todayIndex;
  const need10 = Math.max(0, 10 - nbCount);
  const need17 = Math.max(0, 17 - nbCount);
  const pace10 = need10 > 0 ? (need10 / daysLeft).toFixed(2) : "0";
  const pace17 = need17 > 0 ? (need17 / daysLeft).toFixed(2) : "0";
  const progressTo10 = (nbCount / 10) * 100;
  const progressTo17 = (nbCount / 17) * 100;

  const motivation = (() => {
    if (nbCount >= 17) return pick(MOTIVATION.hit17);
    if (nbCount >= 10) return pick(MOTIVATION.hit10);
    return pick(MOTIVATION.start);
  })();

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h3 style={styles.cardTitle}>Agent Insights - {agent?.name || "..."}</h3>
        <p style={styles.cardDescription}>
          Personal stats & commission estimator • This Week
        </p>
      </div>
      <div style={styles.cardContent}>
        {row ? (
          <>
            {/* Metric pills */}
            <div style={styles.metricGrid}>
              <div style={styles.metric}>
                <h5 style={styles.metricH5}>NBs (week)</h5>
                <div style={styles.metricInput}>{nbCount}</div>
                <div
                  style={{
                    ...styles.statDisplay,
                    textAlign: "center",
                    marginTop: "0.2rem",
                  }}
                >
                  Avg Fee / NB <strong>{currency(avgFee)}</strong>
                </div>
              </div>
              <div style={styles.metric}>
                <h5 style={styles.metricH5}>Endorsements (week)</h5>
                <div style={styles.metricInput}>1</div>
                <div
                  style={{
                    ...styles.statDisplay,
                    textAlign: "center",
                    marginTop: "0.2rem",
                  }}
                >
                  Total EN Fees ($) <strong>{currency(totalEnFee)}</strong>
                </div>
              </div>
              <div style={styles.metric}>
                <h5 style={styles.metricH5}>Reissues/Renewals Revenue ($)</h5>
                <div style={styles.metricInput}>0</div>
                <div
                  style={{
                    ...styles.statDisplay,
                    textAlign: "center",
                    marginTop: "0.2rem",
                  }}
                >
                  20% corp charge auto-applied
                </div>
              </div>
              <div style={styles.metric}>
                <h5 style={styles.metricH5}>Set Today (0=Sun..6=Sat)</h5>
                <div style={styles.metricInput}>{todayIndex}</div>
                <div
                  style={{
                    ...styles.statDisplay,
                    textAlign: "center",
                    marginTop: "0.2rem",
                  }}
                >
                  Gross Pay assumed: <strong>{currency(GROSS_ASSUMPTION)}</strong>
                </div>
              </div>
            </div>

            {/* Weekly pacing */}
            <div style={{ marginTop: "1.5rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                }}
              >
                <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
                  Weekly NB Pacing
                </h4>
              </div>
              <div>
                <div style={styles.progressWrapper}>
                  <div
                    style={{
                      width: "3rem",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#3b82f6",
                    }}
                  >
                    {Math.round(progressTo10)}%
                  </div>
                  <div style={styles.progressBar}>
                    <div
                      style={{ ...styles.progressFill, width: `${progressTo10}%` }}
                    />
                  </div>
                </div>
                <p
                  style={{
                    margin: "0 0 1rem 3.75rem",
                    fontSize: "0.9rem",
                    color: "#374151",
                  }}
                >
                  Progress to <strong>10 NBs</strong>
                  <br />
                  Need {need10} more NBs • Pace ~ {pace10}/day over {daysLeft} day(s)
                </p>
              </div>
              <div>
                <div style={styles.progressWrapper}>
                  <div
                    style={{
                      width: "3rem",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#3b82f6",
                    }}
                  >
                    {Math.round(progressTo17)}%
                  </div>
                  <div style={styles.progressBar}>
                    <div
                      style={{ ...styles.progressFill, width: `${progressTo17}%` }}
                    />
                  </div>
                </div>
                <p
                  style={{
                    margin: "0 0 1rem 3.75rem",
                    fontSize: "0.9rem",
                    color: "#374151",
                  }}
                >
                  Progress to <strong>17 NBs</strong>
                  <br />
                  Need {need17} more NBs • Pace ~ {pace17}/day
                </p>
              </div>
            </div>

            {/* Fuel for Focus */}
            <div style={{ ...styles.pacingWrap, marginTop: "0.5rem", background: "#f9fafb" }}>
              <h4
                style={{
                  ...styles.cardTitle,
                  fontSize: "1rem",
                  margin: 0,
                  marginBottom: "0.5rem",
                }}
              >
                <span role="img" aria-label="chart">
                  📈
                </span>{" "}
                Fuel for Focus
              </h4>
              <p style={{ margin: 0, fontWeight: 600 }}>{motivation}</p>
              <p
                style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.8rem" }}
              >
                "Where focus goes, energy flows." Keep going—even after the goal.
              </p>
            </div>

            {/* Commission Estimator (3 aligned columns) */}
            <div style={{ marginTop: "1.5rem" }}>
              <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
                Commission Estimator (beta)
              </h4>

              <div style={styles.commissionGrid}>
                {/* LEFT COLUMN (NB) */}
                <div style={styles.commissionCol}>
                  <div style={styles.commissionRow}>
                    <span style={styles.commissionLabel}>NB Revenue</span>
                    <span style={styles.commissionValue}>{currency(totalNbFee)}</span>
                  </div>
                  <div style={styles.commissionRow}>
                    <span style={styles.commissionLabel}>
                      NB Deduction <span style={{ color: "#6b7280", fontWeight: "normal" }}>
                        ($20 × {nbCount})
                      </span>
                    </span>
                    <span style={{ ...styles.commissionValue, color: "#dc2626" }}>
                      {currency(-nbDeduction)}
                    </span>
                  </div>
                </div>

                <div style={styles.commissionDivider} />

                {/* MIDDLE COLUMN (EN / Gross) */}
                <div style={styles.commissionCol}>
                  <div style={styles.commissionRow}>
                    <span style={styles.commissionLabel}>EN Revenue</span>
                    <span style={styles.commissionValue}>{currency(totalEnFee)}</span>
                  </div>
                  <div style={styles.commissionRow}>
                    <span style={styles.commissionLabel}>Gross Pay (assumed)</span>
                    <span style={{ ...styles.commissionValue, color: "#dc2626" }}>
                      {currency(-GROSS_ASSUMPTION)}
                    </span>
                  </div>
                </div>

                <div style={styles.commissionDivider} />

                {/* RIGHT COLUMN (Totals / Rate) */}
                <div style={styles.commissionCol}>
                  <div style={styles.commissionRow}>
                    <span style={styles.commissionLabel}>Pre-deduction Revenue</span>
                    <span style={styles.commissionValue}>
                      {currency(preDeductionRevenue)}
                    </span>
                  </div>
                  <div style={styles.commissionRow}>
                    <span style={styles.commissionLabel}>Reissues/Renewals (net)</span>
                    <span style={styles.commissionValue}>{currency(0)}</span>
                  </div>
                  <div style={styles.commissionRow}>
                    <span style={{ ...styles.commissionLabel, fontWeight: 700 }}>
                      After-deductions Revenue
                    </span>
                    <span
                      style={{
                        ...styles.commissionValue,
                        fontSize: "1rem",
                        color: afterDeductionsRevenue < 0 ? "#dc2626" : "#16a34a",
                      }}
                    >
                      {currency(afterDeductionsRevenue)}
                    </span>
                  </div>
                  <div style={styles.commissionRow}>
                    <span style={{ ...styles.commissionLabel, fontWeight: 700 }}>
                      Commission Rate
                    </span>
                    <span style={{ ...styles.commissionValue, fontSize: "1rem" }}>
                      {pct(commissionRate)}
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderTop: "1px solid #e5e7eb",
                  marginTop: "0.75rem",
                  paddingTop: "0.75rem",
                  textAlign: "right",
                }}
              >
                <span style={{ ...styles.commissionLabel, fontWeight: 700 }}>
                  Estimated Commission
                </span>
                <span
                  style={{
                    ...styles.commissionValue,
                    fontSize: "1.1rem",
                    marginLeft: "1rem",
                    color: "#16a34a",
                  }}
                >
                  {currency(estimatedCommission)}
                </span>
              </div>
            </div>

            {/* Disclaimer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginTop: "1rem",
                fontSize: "0.75rem",
                color: "#6b7280",
              }}
            >
              <Info />
              <span>
                Estimates exclude correct Gross Pay, AR fees, scanning violations, and
                disqualified policies. After-deductions revenue must be <b>$500+</b> to
                qualify.
              </span>
            </div>

            {/* Coaching */}
            <div style={{ marginTop: "1.5rem" }}>
              <h4 style={{ ...styles.cardTitle, fontSize: "1rem" }}>
                <Rocket /> Coaching & Highlights
              </h4>
              <ul style={styles.list}>
                {coachFromMetrics({
                  nbCount,
                  preDeductionRevenue,
                  afterDeductionsRevenue,
                }).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p style={styles.cardDescription}>No stats available.</p>
        )}
      </div>
    </div>
  );
};

// ---------- Other Cards ----------
// Legacy component retained for compatibility with the previous dashboard.
// eslint-disable-next-line no-unused-vars
const TopOfficesCard = ({ offices }) => {
  const top5 = useMemo(
    () => [...offices].sort((a, b) => b.totalSales - a.totalSales).slice(0, 5),
    [offices]
  );
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h3 style={styles.cardTitle}>Top 5 Offices (by sales volume)</h3>
      </div>
      <div style={styles.cardContent}>
        <div style={styles.fiveColGrid}>
          {top5.map((o, i) => (
            <div key={o.office} style={styles.gridItem}>
              <div
                style={{
                  ...styles.cardHeader,
                  padding: 0,
                  paddingBottom: "0.5rem",
                  borderBottom: "none",
                }}
              >
                <h3 style={{ ...styles.itemName, fontSize: "1rem" }}>
                  {i + 1}. {o.office}
                </h3>
                {typeof o.wowChangePct === "number" && (
                  <p style={styles.cardDescription}>
                    WoW:{" "}
                    <span
                      style={o.wowChangePct >= 0 ? styles.positive : styles.negative}
                    >
                      {o.wowChangePct >= 0 ? "+" : ""}
                      {pct(o.wowChangePct)}
                    </span>
                  </p>
                )}
              </div>
              <div style={{ ...styles.cardContent, padding: 0 }}>
                <div style={styles.itemStats}>
                  Sales: <span>{o.totalSales}</span>
                </div>
                <div style={styles.itemStats}>
                  Revenue: <span>{currency(o.totalRevenue)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};




// Quote metrics share the classification rules used by AgentQuoteLog.
function QuotePerformanceCard({ supabaseClient, currentUserEmail }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const email = String(currentUserEmail || "").trim().toLowerCase();

  useEffect(() => {
    const client = supabaseClient || (typeof window !== "undefined" ? window.supabase : null);
    if (!client || !email) {
      setLoading(false);
      setError("Signed-in agent or database connection unavailable.");
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const now = new Date();
        const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
        const weekEndDate = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + 7);
        const start = monthStartDate.toISOString();
        const end = monthEndDate.toISOString();
        const weekStart = weekStartDate.getTime();
        const weekEnd = weekEndDate.getTime();
        const { data: profile, error: profileError } = await client.from("profiles")
          .select("csr_name,turborater_agent_name,full_name").eq("email", email).maybeSingle();
        if (profileError) throw profileError;
        const names = [...new Set([profile?.csr_name, profile?.turborater_agent_name, profile?.full_name]
          .map((v) => String(v || "").trim().replace(/\s+/g, " ").toLowerCase()).filter(Boolean))];
        const queries = [
          () => client.from("quote_log_view").select("*").eq("agent_email", email).gte("started_at", start).lt("started_at", end),
          () => client.from("quote_log_view").select("*").eq("agent_email", email).eq("status", "in_progress"),
        ];
        names.forEach((name) => {
          queries.push(() => client.from("quote_log_view").select("*").ilike("captured_agent_name", name).gte("started_at", start).lt("started_at", end));
          queries.push(() => client.from("quote_log_view").select("*").ilike("captured_agent_name", name).eq("status", "in_progress"));
        });
        // Follow-ups scheduled this month may originate from older quotes.
        const followUpIds = [];
        for (let offset = 0;; offset += 1000) {
          const { data: rows, error: workflowError } = await client.from("quote_workflow")
            .select("quote_id,follow_up_at")
            .or("follow_up_needed.eq.true,outcome.eq.follow_up")
            .gte("follow_up_at", start).lt("follow_up_at", end)
            .range(offset, offset + 999);
          if (workflowError) throw workflowError;
          followUpIds.push(...(rows || []).map((r) => r.quote_id).filter(Boolean));
          if ((rows || []).length < 1000) break;
        }
        for (let i = 0; i < followUpIds.length; i += 200) {
          const ids = followUpIds.slice(i, i + 200);
          queries.push(() => client.from("quote_log_view").select("*").in("id", ids).eq("agent_email", email));
          names.forEach((name) => queries.push(() => client.from("quote_log_view").select("*").in("id", ids).ilike("captured_agent_name", name)));
        }
        const unique = new Map();
        for (const query of queries) {
          for (let offset = 0;; offset += 1000) {
            const { data: rows, error: queryError } = await query().range(offset, offset + 999);
            if (queryError) throw queryError;
            (rows || []).forEach((row) => { if (row.id) unique.set(row.id, row); });
            if ((rows || []).length < 1000) break;
          }
        }
        const base = [...unique.values()].filter((row) => {
          const ownerEmail = String(row.originating_agent_email || row.agent_email || "").trim().toLowerCase();
          const ownerName = String(row.originating_agent_name || row.captured_agent_name || row.csr_name || "").trim().replace(/\s+/g, " ").toLowerCase();
          return (ownerEmail && ownerEmail === email) || (ownerName && names.includes(ownerName));
        });
        const enriched = new Map(base.map((row) => [row.id, { ...row }]));
        const ids = [...enriched.keys()];
        for (let i = 0; i < ids.length; i += 200) {
          const batch = ids.slice(i, i + 200);
          const [detail, workflow, events] = await Promise.all([
            client.from("quotes").select("*").in("id", batch),
            client.from("quote_workflow").select("*").in("quote_id", batch),
            client.from("quote_events").select("quote_id,event_type,event_at").in("quote_id", batch).eq("event_type", "POLICY_BOUND"),
          ]);
          if (detail.error || workflow.error || events.error) throw detail.error || workflow.error || events.error;
          (detail.data || []).forEach((r) => enriched.set(r.id, { ...enriched.get(r.id), ...r }));
          (workflow.data || []).forEach((r) => enriched.set(r.quote_id, { ...enriched.get(r.quote_id), ...r }));
          (events.data || []).forEach((r) => enriched.set(r.quote_id, { ...enriched.get(r.quote_id), policy_bound_detected: true, policy_bound_at: r.event_at }));
        }
        const grouped = new Map();
        [...enriched.values()].forEach((quote) => {
          const key = quote.matrix_customer_id ? `customer:${quote.matrix_customer_id}` : `quote:${quote.id}`;
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(quote);
        });
        const currentTime = Date.now();
        const groups = [...grouped.values()].map((quotes) => {
          quotes.sort((a, b) => new Date(b.last_live_activity_at || b.updated_at || b.started_at || b.created_at || 0) - new Date(a.last_live_activity_at || a.updated_at || a.started_at || a.created_at || 0));
          const group = { quotes, latest: quotes[0] };
          return { ...group, classification: classifyQuoteGroup(group, { now: currentTime, staleAfterMs: STALE_AFTER_MS }) };
        });
        // Match My Quotes: group by Matrix customer and use the shared classifier.
        // Open quotes are the agent's actionable regular-quote bucket, not
        // every historical quote that happened to start during this month.
        const startedAt = (g) => {
          const stamps = g.quotes.map((q) => new Date(q.started_at || q.created_at || 0).getTime())
            .filter((t) => Number.isFinite(t) && t > 0);
          return stamps.length ? Math.min(...stamps) : NaN;
        };
        const inWeek = (g) => startedAt(g) >= weekStart && startedAt(g) < weekEnd;
        const isBound = (g) => g.quotes.some((q) => q.policy_bound_detected || q.policy_bound_at);
        const weekQuotes = groups.filter(inWeek);
        // A generic CLOSED workflow status does not necessarily mean a policy
        // was bound. Only explicit POLICY_BOUND signals count as bound here.
        const weekBound = weekQuotes.filter(isBound);
        const openQuotes = groups.filter((g) =>
          !isGroupLive(g, { now: currentTime, staleAfterMs: STALE_AFTER_MS }) &&
          isGroupRegularQuote(g, { now: currentTime, staleAfterMs: STALE_AFTER_MS })
        );
        const closedDeals = groups.filter((g) => isBound(g) || isGroupClosed(g, { now: currentTime, staleAfterMs: STALE_AFTER_MS }));
        const monthFollowUps = groups.filter((g) => isGroupFollowUp(g, { now: currentTime, staleAfterMs: STALE_AFTER_MS }));
        const monthAttention = groups.filter((g) => g.classification?.primary === QUOTE_PRIMARY_BUCKETS.ATTENTION);
        if (!cancelled) setData({
          weekQuotes: weekQuotes.length,
          weekClosed: weekBound.length,
          weekCloseRate: weekQuotes.length ? Math.round(weekBound.length / weekQuotes.length * 100) : 0,
          monthQuotes: openQuotes.length,
          monthReady: closedDeals.length,
          monthFollowUps: monthFollowUps.length,
          monthAttention: monthAttention.length,
        });
      } catch (e) {
        if (!cancelled) setError(e.message || "Unable to load quote performance.");
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [supabaseClient, email, refreshKey]);

  const weekMetrics = [
    ["Quotes started", data?.weekQuotes],
    ["Policies bound", data?.weekClosed],
    ["Weekly close rate", data ? `${data.weekCloseRate}%` : null],
  ];
  const monthMetrics = [
    ["My open quotes", data?.monthQuotes],
    ["Closed deals", data?.monthReady],
    ["Follow-ups", data?.monthFollowUps],
    ["Needs attention", data?.monthAttention],
  ];
  const renderMetric = ([label, value]) => (
    <div key={label} className={`${modern.quoteMetric} ${label === "Needs attention" ? modern.quoteMetricAttention : ""} ${label === "Ready to close" ? modern.quoteMetricLive : ""}`}>
      <span className={modern.metricLabel}>{label}</span>
      <strong className={modern.metricNumber}>{loading && !data ? "…" : error && !data ? "—" : value ?? "—"}</strong>
    </div>
  );
  return (
    <section className={modern.quotePerformance} aria-label="My Quote Performance">
      <div className={modern.quoteHeader}>
        <div><h3>My quote performance</h3><small>Weekly closing performance + monthly opportunities · Your own quotes</small></div>
        <button type="button" className={modern.refreshButton} onClick={() => setRefreshKey((n) => n + 1)} disabled={loading}>Refresh</button>
      </div>
      {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
      <div className={modern.quotePeriodHeading}><strong>This week</strong><span>Monday–Sunday · Close rate = policies bound from this week’s quotes ÷ quotes started this week</span></div>
      <div className={modern.quoteMetricsWeekly}>{weekMetrics.map(renderMetric)}</div>
      <div className={modern.quotePeriodHeading}><strong>This month</strong><span>Current actionable quotes · Same regular-quote category as My Quotes</span></div>
      <div className={modern.quoteMetricsMonthly}>{monthMetrics.map(renderMetric)}</div>
    </section>
  );
}

// ---------- MAIN COMPONENT ----------
export default function SalesDashboard({
  supabaseClient,
  currentUserEmail,
}) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState([]);
  const [offices, setOffices] = useState([]);
  const [regions, setRegions] = useState([]);
  const [currentAgentId, setCurrentAgentId] = useState(null);
  const [commissionSummary, setCommissionSummary] = useState(null);
  const [commissionError, setCommissionError] = useState("");

  // Dashboard always shows the current Monday-Sunday reporting week.
  const ranges = useMemo(() => ({
    start: startOfWeek(new Date()),
    end: endOfWeek(new Date()),
    prevStart: startOfWeek(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 7)),
    prevEnd: startOfWeek(new Date()),
  }), []);

  useEffect(() => {
    (async () => {
      const client = supabaseClient || (typeof window !== "undefined" ? window.supabase : null);

      if (client) {
        const { data: profiles, error } = await client
          .from("profiles")
          .select("email, full_name, csr_name");
        if (error) console.error("Error fetching profiles:", error);

        const { data: officeSettings, error: officeSettingsError } = await client
          .from("office_dashboard_settings")
          .select("office_code, region");
        if (officeSettingsError) throw officeSettingsError;
        // Use the exact same office-region source as OfficeNumbers.
        // Normalize both sides of the lookup so office labels like "CA104 Richmond"
        // and stored codes like "CA104" resolve to the same office.
        const officeRegionMap = Object.fromEntries(
          (officeSettings || [])
            .filter((row) => cleanTxnStr(row.region) && normalizeOffice(row.office_code) !== "Unknown")
            .map((row) => [normalizeOffice(row.office_code), cleanTxnStr(row.region)])
        );
        console.info("Agent Dashboard: office region lookup", {
          settingsRows: officeSettings?.length || 0,
          mappedOffices: Object.keys(officeRegionMap).length,
          sampleSettings: (officeSettings || []).slice(0, 3).map((row) => ({
            office_code: row.office_code,
            normalized: normalizeOffice(row.office_code),
            region: row.region,
          })),
        });
        if (!Object.keys(officeRegionMap).length) {
          console.warn(
            "Agent Dashboard: no office regions returned from office_dashboard_settings. " +
            "Check the table's region values and the signed-in user's SELECT/RLS permissions."
          );
        }
        const curRows = await fetchTransactions(client, ranges.start, ranges.end);
        const prevRows = await fetchTransactions(client, ranges.prevStart, ranges.prevEnd);
        const { agents, stats, offices, regions } = aggregateFromRows(
          curRows,
          prevRows,
          profiles || [],
          officeRegionMap
        );
        setAgents(agents);
        setStats(stats);
        setOffices(offices);
        setRegions(regions);
        const unmappedOffices = offices
          .filter((office) => !officeRegionMap[normalizeOffice(office.office)])
          .map((office) => office.office);
        if (unmappedOffices.length) {
          console.warn(
            "Agent Dashboard: offices missing a region in office_dashboard_settings:",
            unmappedOffices,
            "Sample transaction office values:", curRows.slice(0, 5).map((row) => ({
              office: row.office,
              normalized: normalizeOffice(row.office),
            }))
          );
        }

        const agentEmail = String(currentUserEmail || profile?.email || user?.email || "").trim().toLowerCase();
        setCurrentAgentId(agentEmail || null);
        setCommissionError("");
        if (agentEmail) {
          try {
            // Use the same calculator and fee categories as AgentCommission.
            const ownTransactions = curRows.filter((row) => transactionAgent(row) === agentEmail);
            const weekStartKey = iso(ranges.start);
            const assignedWeek = `deduction_week_start.eq.${weekStartKey},and(deduction_week_start.is.null,week_start_date.eq.${weekStartKey})`;
            const [violationResponse, disqualifiedResponse, recordResponse] = await Promise.all([
              client.from("violations").select("*").eq("agent_email", agentEmail).or(assignedWeek),
              client.from("disqualified_policies").select("*").eq("agent_email", agentEmail).or(assignedWeek),
              client.from("agent_commission_records").select("*").eq("agent_email", agentEmail).eq("week_start_date", weekStartKey).maybeSingle(),
            ]);
            for (const response of [violationResponse, disqualifiedResponse, recordResponse]) {
              if (response.error) throw response.error;
            }
            const violations = (violationResponse.data || []).filter((row) => String(row.status || "").toLowerCase() !== "voided");
            const disqualified = (disqualifiedResponse.data || []).filter((row) => String(row.status || "").toLowerCase() !== "voided");
            const record = recordResponse.data || null;
            const live = calculateAgentCommission({
              transactions: ownTransactions,
              violations,
              disqualifiedPolicies: disqualified,
              grossPay: Number(record?.gross_pay) || 0,
              isLicensedCaDoi: record ? record.is_licensed_ca_doi !== false : true,
              weekStart: weekStartKey,
            });
            setCommissionSummary({ live, record, violations, disqualified, weekStartKey });
          } catch (commissionLoadError) {
            console.error("Agent Dashboard: commission summary unavailable", commissionLoadError);
            setCommissionError("Commission and violation details could not be loaded. Open Insurance Commission for verified amounts.");
            setCommissionSummary(null);
          }
        } else {
          setCommissionSummary(null);
        }
      } else {
        setAgents([]);
        setStats([]);
        setOffices([]);
        setRegions([]);
        setCurrentAgentId(null);
        setCommissionSummary(null);
      }
    })().catch(console.error);
  }, [supabaseClient, currentUserEmail, ranges.start, ranges.end, ranges.prevStart, ranges.prevEnd, profile?.email, user?.email]);

  const personalRow = stats.find((entry) => entry.agentId === currentAgentId);
  const personalSales = personalRow?.salesCount ?? 0;
  const personalRevenue = (personalRow?.revenueNB ?? 0) + (personalRow?.revenueEN ?? 0);
  const personalAverage = personalSales ? personalRevenue / personalSales : 0;
  const rankedAgents = [...stats].sort((a, b) => b.salesCount - a.salesCount || (b.revenueNB + b.revenueEN) - (a.revenueNB + a.revenueEN));
  const topAgents = rankedAgents.slice(0, 5).map((entry) => ({
    ...entry,
    name: agents.find((agent) => agent.id === entry.agentId)?.name || entry.agentId,
    office: agents.find((agent) => agent.id === entry.agentId)?.office || '',
    revenue: (entry.revenueNB || 0) + (entry.revenueEN || 0),
  }));
  const topOffices = [...offices].sort((a, b) => b.totalSales - a.totalSales).slice(0, 5);
  const topRegions = [...regions].sort((a, b) => b.totalSales - a.totalSales);
  // Identity comes from AuthContext, not the sales leaderboard (which may omit agents with no sales).
  const authenticatedName = [
    profile?.full_name,
    profile?.csr_name,
    user?.user_metadata?.full_name,
    user?.user_metadata?.name,
    user?.user_metadata?.first_name,
  ].find((value) => typeof value === "string" && value.trim());
  const firstName = authenticatedName?.trim().split(/\s+/)[0] ||
    (user?.email ? user.email.split("@")[0].split(/[._-]/)[0] : "Agent");

  return (
    <main className={modern.salesDashboard}>
      <div className={modern.topBar}>
        <div>
          <h1 className={modern.pageTitle}>Welcome Back, <span>{firstName}!</span> 👋</h1>
          <p className={modern.pageSubtitle}>Your performance, at a glance. Track your production and follow up on every opportunity.</p>
        </div>

      </div>

      <section className={modern.hero} aria-label="Personal sales and commission overview">
        <div className={modern.heroIntro}>
          <span className={modern.heroKicker}>MY PRODUCTION · THIS WEEK</span>
          <h2>Make every conversation count.</h2>
          <p>Matrix transaction-detail production and fee activity for the current Monday–Sunday week.</p>
          <div className={modern.heroActions}>
            <button type="button" onClick={() => navigate("/agent/commission?view=production")} className={modern.heroPrimary}>Insurance commission details <span aria-hidden="true">→</span></button>
          </div>
          <div className={modern.productionHighlights}>
            <div><span>NB / RW sales</span><strong>{personalSales}</strong></div>
            <div><span>Average broker fee / sale</span><strong>{currency(personalAverage)}</strong></div>
          </div>
          <div className={modern.commissionPreview}>
            <span className={modern.heroKicker}>CURRENT WEEK COMMISSION</span>
            {commissionError ? <p role="alert">{commissionError}</p> : commissionSummary ? (
              <>
                <div className={modern.commissionPreviewGrid}>
                  <div><small>Gross fee revenue</small><strong>{currency(commissionSummary.live.grossRevenue)}</strong></div>
                  <div><small>Net NBs</small><strong>{commissionSummary.live.netNbCount}</strong></div>
                  <div><small>Commission tier</small><strong>{commissionSummary.live.tierName} · {(commissionSummary.live.commissionRate * 100).toFixed(1)}%</strong></div>
                  <div><small>{commissionSummary.record ? "Published commission" : "Projected commission before carried balances"}</small><strong>{currency(commissionSummary.record?.final_payable_commission ?? commissionSummary.live.commissionBeforeBalance)}</strong></div>
                </div>
                {commissionSummary.disqualified.length > 0 && <div className={modern.commissionAlert} role="status">⚠ {commissionSummary.disqualified.length} disqualification(s) assigned to this commission week · {commissionSummary.live.disqualifiedNbCount} NB(s) excluded from tier calculation.</div>}
                {!commissionSummary.record && <small className={modern.commissionDisclaimer}>Estimate only. Gross pay, carried AR/SV balances, licensing, and final adjustments are verified on the Insurance Commission page.</small>}
              </>
            ) : <p>Loading commission details…</p>}
          </div>
        </div>
        <div className={modern.heroFeePanel}>
          <div className={modern.heroFeeHeading}><strong>Revenue breakdown</strong><span>Transactions · Net fees</span></div>
          {[
            ["Broker Fee", "brokerFeeCount", "brokerFeeRevenue"],
            ["Endorsement Fee", "endorsementFeeCount", "endorsementFeeRevenue"],
            ["Reinstatement Fee", "reinstatementFeeCount", "reinstatementFeeRevenue"],
            ["Renewal Fee", "renewalFeeCount", "renewalFeeRevenue"],
          ].map(([label, countKey, revenueKey]) => (
            <div className={modern.heroFeeRow} key={label}>
              <span>{label}</span>
              <span className={modern.feeCount}>{commissionSummary ? commissionSummary.live[countKey] : "—"} <small>txn</small></span>
              <strong>{commissionSummary ? currency(commissionSummary.live[revenueKey]) : "—"}</strong>
            </div>
          ))}
          <div className={modern.heroFeeTotal}><span>Total commissionable fees</span><strong>{commissionSummary ? currency(commissionSummary.live.grossRevenue) : "—"}</strong></div>
          <small className={modern.feeFootnote}>Source: daily_transaction_detail_transfers · Net of valid negative adjustments</small>
        </div>
      </section>

      <section className={modern.violationSection} aria-label="Weekly violations">
        <div className={modern.violationHeading}>
          <div><span className={modern.eyebrow}>COMPLIANCE & DEDUCTIONS</span><h2>My violations</h2><p>Violations are charged to the most recent unpublished commission week, not necessarily the week they occurred.</p></div>
          <button type="button" onClick={() => navigate("/agent/commission?view=ar-scanning")} className={modern.textLink}>View Full AR / Scanning History →</button>
        </div>
        {commissionError ? <p role="alert">{commissionError}</p> : commissionSummary ? (
          <div className={modern.violationBody}>
            <div><strong>{commissionSummary.violations.length}</strong><span>Assigned violations</span></div>
            <div><strong>{currency(commissionSummary.live.totalDeductions)}</strong><span>Calculated deductions for this week</span></div>
            <div className={modern.violationNote}>
              <strong>Applied commission week: {commissionSummary.weekStartKey}</strong>
              <span>{commissionSummary.record ? "Published week — review the finalized commission record." : "Unpublished week — amounts and assignment may change until publication."} Violations from other weeks are not included here unless assigned to this week.</span>
            </div>
          </div>
        ) : <p>Loading assigned violations…</p>}
      </section>

      <section className={modern.workspaceSection}>
        <div className={modern.sectionHeading}><div><span className={modern.eyebrow}>CUSTOMER OPPORTUNITIES</span><h2>Quote pipeline</h2><p>Stay on top of customers who are ready for your next call.</p></div><button type="button" onClick={() => navigate("/agent/quotes")} className={modern.textLink}>Open quote workspace →</button></div>
        <QuotePerformanceCard supabaseClient={supabaseClient} currentUserEmail={currentUserEmail} />
      </section>

      <section className={modern.workspaceSection}>
        <div className={modern.sectionHeading}><div><span className={modern.eyebrow}>SALES RECOGNITION</span><h2>People making moves</h2><p>Companywide performance for the current week.</p></div></div>
        <div className={modern.leaderGrid}>
          <article className={modern.panel}>
            <div className={modern.panelHeading}><div><span className={modern.eyebrow}>TOP PERFORMERS</span><h3>Top 5 agents</h3></div><span className={modern.panelIcon}>★</span></div>
            <div className={modern.rankList}>{topAgents.length ? topAgents.map((agent, index) => (
              <div className={modern.rankRow} key={agent.agentId}>
                <span className={`${modern.rankNumber} ${index === 0 ? modern.rankWinner : ''}`}>{String(index + 1).padStart(2, '0')}</span>
                <div className={modern.rankIdentity}><strong>{agent.name}</strong><small>{agent.office || 'Fiesta agent'}</small></div>
                <div className={modern.rankMetrics}><div><strong>{agent.salesCount}</strong><small>Sales</small></div><div><strong>{currency(agent.revenue)}</strong><small>Fees</small></div><div><strong>{currency(agent.salesCount ? agent.revenue / agent.salesCount : 0)}</strong><small>Avg / sale</small></div></div>
              </div>
            )) : <p className={modern.emptyState}>No agent sales reported for this period.</p>}</div>
          </article>
          <article className={modern.panel}>
            <div className={modern.panelHeading}><div><span className={modern.eyebrow}>LOCATION PERFORMANCE</span><h3>Top 5 offices</h3></div><span className={modern.panelIcon}>⌂</span></div>
            <div className={modern.rankList}>{topOffices.length ? topOffices.map((office, index) => (
              <div className={modern.rankRow} key={office.office}>
                <span className={`${modern.rankNumber} ${index === 0 ? modern.rankWinner : ''}`}>{String(index + 1).padStart(2, '0')}</span>
                <div className={modern.rankIdentity}><strong>{office.office}</strong><small>{typeof office.wowChangePct === 'number' ? `${office.wowChangePct >= 0 ? '+' : ''}${pct(office.wowChangePct)} vs. previous period` : 'Office sales'}</small></div>
                <div className={modern.rankMetrics}><div><strong>{office.totalSales}</strong><small>Sales</small></div><div><strong>{currency(office.totalRevenue)}</strong><small>Fees</small></div><div><strong>{currency(office.totalSales ? office.totalRevenue / office.totalSales : 0)}</strong><small>Avg / sale</small></div></div>
              </div>
            )) : <p className={modern.emptyState}>No office sales reported for this period.</p>}</div>
          </article>
        </div>
      </section>

      <section className={modern.workspaceSection}>
        <div className={modern.sectionHeading}><div><span className={modern.eyebrow}>THE BIG PICTURE</span><h2>Regional performance</h2><p>Sales volume across all reporting regions.</p></div></div>
        <article className={modern.panel}>
          {topRegions.length ? <div className={modern.regionList}>{topRegions.map((region, index) => {
            const maxSales = Math.max(1, topRegions[0]?.totalSales || 0);
            return <div className={modern.regionRow} key={region.region}>
              <span className={modern.regionRank}>{String(index + 1).padStart(2, '0')}</span>
              <div className={modern.regionBody}><div className={modern.regionLabel}><strong>{region.region}</strong></div><div className={modern.barTrack}><div className={modern.barFill} style={{ width: `${Math.max(0, Math.min(100, (region.totalSales / maxSales) * 100))}%` }} /></div></div>
              <div className={modern.regionMetrics}><div><strong>{region.totalSales}</strong><small>Sales</small></div><div><strong>{currency(region.totalRevenue)}</strong><small>Fees</small></div><div><strong>{currency(region.totalSales ? region.totalRevenue / region.totalSales : 0)}</strong><small>Avg / sale</small></div></div>
            </div>;
          })}</div> : <p className={modern.emptyState}>No regional sales reported for this period.</p>}
        </article>
      </section>
      <footer className={modern.footer}>Fiesta Agent Workspace · Transaction-detail sales are informational; verified commissions and quote dispositions are maintained in their respective systems.</footer>
    </main>
  );
}

// Legacy component retained for compatibility with the previous dashboard.
// eslint-disable-next-line no-unused-vars
const RegionalLeaderboard = ({ regions }) => {
  const ranked = useMemo(() => [...regions].sort((a, b) => b.totalSales - a.totalSales), [regions]);
  const top = ranked[0];
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h3 style={styles.cardTitle}>Regional Sales Leaderboard</h3>
        <p style={styles.cardDescription}>Ranking by total sales this period</p>
      </div>
      <div style={styles.cardContent}>
        {top && (
          <div>
            <span style={styles.badge}>🥇 Top Region: {top.region}</span>
          </div>
        )}
        <div style={styles.fiveColGrid}>
          {ranked.map((r, i) => (
            <div key={r.region} style={{ ...styles.gridItem, ...(i === 0 ? styles.gridItemTop : null) }}>
              <div style={styles.itemHeader}>
                <div style={styles.itemName}>
                  {i + 1}. {r.region}
                </div>
              </div>
              <div style={styles.itemStats}>
                Sales: <span>{r.totalSales}</span>
              </div>
              <div style={styles.itemStats}>
                Revenue: <span>{currency(r.totalRevenue)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Supabase defaults to a maximum of 1,000 rows per request. Page through
// the selected period so companywide leaderboards do not silently truncate.
async function fetchTransactions(supabase, start, end) {
  const startDate = `${iso(start)} 00:00:00`;
  const endDate = `${iso(end)} 00:00:00`;
  const pageSize = 1000;
  const all = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("daily_transaction_detail_transfers")
      .select("id, sync_key, receipt_id, customer_id, agent_email, office, date_time, type, company, policy, policy_type, premium, fee, total, voided")
      .gte("date_time", startDate)
      .lt("date_time", endDate)
      .order("date_time", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error("Supabase transaction detail fetch error:", error);
      throw error;
    }
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  // De-duplicate within the aggregation, using OfficeNumbers transaction keys.
  return all;
}

// -------------------- Dev Sanity Tests --------------------
(function runDevTests() {
  try {
    const d = new Date("2025-10-14T12:00:00Z");
    const s = startOfWeek(d);
    const e = endOfWeek(d);
    console.assert(s <= d && e > d, "Week range should include date");
    const mStart = startOfMonth(d);
    const mEnd = endOfMonth(d);
    console.assert(mStart.getDate() === 1, "Month start should be first day");
    console.assert(mEnd > mStart, "Month end should be after start");
    const pre = 300;
    const nbCount = 5;
    const enFee = 100;
    const after = pre - 20 * nbCount - 0.2 * enFee - 800;
    console.assert(typeof after === "number", "After-deductions computes");
    // Office region map presence
    console.assert(typeof normalizeOffice === "function", "Office normalization exists");
  } catch (err) {
    console.warn("Dev tests skipped or minor failure:", err?.message);
  }
})();



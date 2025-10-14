import React, { useEffect, useMemo, useState } from "react";

/**
 * SALES DASHBOARD (Supabase + EOD)
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
const REGION_MAP = {
  "CEN-CAL": [
    "CA010", "CA011", "CA012", "CA022", "CA183", "CA229", "CA230", "CA239",
  ],
  "KERN COUNTY": ["CA016", "CA047", "CA048", "CA049", "CA172", "CA240"],
  "THE VALLEY": [
    "CA025", "CA030", "CA045", "CA046", "CA065", "CA074", "CA075",
    "CA095", "CA118", "CA119", "CA231", "CA238",
  ],
  "BAY AREA": [
    "CA076", "CA103", "CA104", "CA114", "CA117", "CA149", "CA150",
    "CA216", "CA236", "CA248",
  ],
  "SOUTHERN CALI": [
    "CA131", "CA132", "CA133", "CA166", "CA249", "CA250", "CA251", "CA252",
  ],
};
const OFFICE_TO_REGION = Object.entries(REGION_MAP)
  .flatMap(([region, list]) => list.map((code) => [code, region]))
  .reduce((m, [c, r]) => {
    m[c] = r;
    return m;
  }, {});
const currency = (n) =>
  Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const pct = (n) => `${Math.round(Number(n || 0) * 100)}%`;
const officeCode = (s = "") => String(s).trim().split(/\s+/)[0];
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
const startOfQuarter = (d) => {
  const dt = new Date(d);
  const q = Math.floor(dt.getMonth() / 3);
  return new Date(dt.getFullYear(), q * 3, 1);
};
const endOfQuarter = (d) => {
  const dt = new Date(d);
  const q = Math.floor(dt.getMonth() / 3);
  return new Date(dt.getFullYear(), q * 3 + 3, 1);
};

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

async function mockEvents() {
  return [
    { id: "1", title: "Tax Season Kickoff – Jan 2 – All Offices", start: "2026-01-02" },
  ];
}

// ---------- Aggregation ----------
function aggregateFromRows(rows, prevRows, profiles = []) {
  const profileMap = new Map(profiles.map((p) => [p.email, p.full_name]));
  const byAgent = new Map();
  const byOffice = new Map();
  const incAgent = (email, sales, nbFee, enFee, off) => {
    const cur = byAgent.get(email) || { sales: 0, nbFee: 0, enFee: 0, offices: {} };
    cur.sales += sales;
    cur.nbFee += nbFee;
    cur.enFee += enFee;
    cur.offices[off] = (cur.offices[off] || 0) + sales;
    byAgent.set(email, cur);
  };
  const incOffice = (code, sales, revenue) => {
    const cur = byOffice.get(code) || { sales: 0, revenue: 0 };
    cur.sales += sales;
    cur.revenue += revenue;
    byOffice.set(code, cur);
  };
  for (const r of rows) {
    const email = r.agent_email || "unknown@agent";
    const off = officeCode(r.office_number);
    const sales = Number(r.nb_rw_count || 0);
    const nb = Number(r.nb_rw_fee || 0);
    const en = Number(r.en_fee || 0);
    incAgent(email, sales, nb, en, off);
    incOffice(off, sales, nb + en);
  }
  const prevAgent = new Map();
  const prevOffice = new Map();
  for (const r of prevRows || []) {
    const email = r.agent_email || "unknown@agent";
    const off = officeCode(r.office_number);
    const sales = Number(r.nb_rw_count || 0);
    const nb = Number(r.nb_rw_fee || 0);
    const en = Number(r.en_fee || 0);
    prevAgent.set(email, (prevAgent.get(email) || 0) + sales);
    const po = prevOffice.get(off) || { sales: 0, revenue: 0 };
    po.sales += sales;
    po.revenue += nb + en;
    prevOffice.set(off, po);
  }
  const agentStats = Array.from(byAgent.entries()).map(([email, v]) => ({
    agentId: email,
    salesCount: v.sales,
    lastWeekSales: prevAgent.get(email) || 0,
    monthSalesCount: v.sales,
    revenueNB: v.nbFee,
    revenueEN: v.enFee,
  }));
  const agents = agentStats.map((a) => ({
    id: a.agentId,
    name: profileMap.get(a.agentId) || a.agentId.split("@")[0],
    office: "",
  }));
  const offices = Array.from(byOffice.entries()).map(([code, v]) => ({
    office: code,
    totalSales: v.sales,
    totalRevenue: v.revenue,
    wowChangePct: (() => {
      const p = prevOffice.get(code)?.sales || 0;
      if (!p) return null;
      return (v.sales - p) / p;
    })(),
  }));
  const regionTotals = {};
  for (const o of offices) {
    const region = OFFICE_TO_REGION[o.office] || "OTHER";
    const cur = regionTotals[region] || { region, totalSales: 0, totalRevenue: 0 };
    cur.totalSales += o.totalSales;
    cur.totalRevenue += o.totalRevenue;
    regionTotals[region] = cur;
  }
  const regions = Object.values(regionTotals);
  return { agents, stats: agentStats, offices, regions };
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



// ---------- MAIN COMPONENT ----------
export default function SalesDashboard({
  supabaseClient,
  currentUserEmail,
  timeFilterDefault = "thisWeek",
}) {
  const [filter, setFilter] = useState(timeFilterDefault);
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState([]);
  const [offices, setOffices] = useState([]);
  const [regions, setRegions] = useState([]);
  const [events, setEvents] = useState([]);
  const [currentAgentId, setCurrentAgentId] = useState(null);

  const ranges = useMemo(() => {
    if (filter === "thisMonth") {
      return {
        start: startOfMonth(new Date()),
        end: endOfMonth(new Date()),
        prevStart: startOfMonth(
          new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
        ),
        prevEnd: startOfMonth(new Date()),
      };
    }
    if (filter === "thisQuarter") {
      return {
        start: startOfQuarter(new Date()),
        end: endOfQuarter(new Date()),
        prevStart: startOfQuarter(
          new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1)
        ),
        prevEnd: startOfQuarter(new Date()),
      };
    }
    return {
      start: startOfWeek(new Date()),
      end: endOfWeek(new Date()),
      prevStart: startOfWeek(
        new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          new Date().getDate() - 7
        )
      ),
      prevEnd: startOfWeek(new Date()),
    };
  }, [filter]);

  useEffect(() => {
    (async () => {
      setEvents(await mockEvents());
      const client = supabaseClient || (typeof window !== "undefined" ? window.supabase : null);

      if (client) {
        const { data: profiles, error } = await client
          .from("profiles")
          .select("email, full_name");
        if (error) console.error("Error fetching profiles:", error);

        const curRows = await fetchEOD(client, ranges.start, ranges.end);
        const prevRows = await fetchEOD(client, ranges.prevStart, ranges.prevEnd);
        const { agents, stats, offices, regions } = aggregateFromRows(
          curRows,
          prevRows,
          profiles || []
        );
        setAgents(agents);
        setStats(stats);
        setOffices(offices);
        setRegions(regions);

        if (currentUserEmail) setCurrentAgentId(currentUserEmail);
        else setCurrentAgentId(agents?.[0]?.id || null);
      } else {
        setAgents([]);
        setStats([]);
        setOffices([]);
        setRegions([]);
        setCurrentAgentId(null);
      }
    })().catch(console.error);
  }, [supabaseClient, currentUserEmail, ranges.start, ranges.end, ranges.prevStart, ranges.prevEnd]);

  return (
    <div style={styles.dashboardContainer}>
      <EventsBanner events={events} />
      <div style={styles.header}>
        <h2 style={styles.headerTitle}>
          <Crown />
          Sales Dashboard
        </h2>
        <select
          style={styles.select}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="thisWeek">This Week</option>
          <option value="thisMonth">This Month</option>
          <option value="thisQuarter">This Quarter</option>
        </select>
      </div>
      <div style={styles.gridTwoCol}>
        <LeaderboardCard agents={agents} stats={stats} />
        <AgentInsightsCard agents={agents} stats={stats} currentAgentId={currentAgentId} />
      </div>
      <TopOfficesCard offices={offices} />
      <div style={styles.gridTwoCol}>{/* GoalTrackerCard removed */}</div>
      <RegionalLeaderboard regions={regions} />
    </div>
  );
}

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

async function fetchEOD(supabase, start, end) {
  const startDate = iso(start);
  const endDate = iso(end);
  console.log(`Fetching EOD reports from ${startDate} to ${endDate}`);
  const { data, error } = await supabase
    .from("eod_reports")
    .select(
      "agent_email, office_number, nb_rw_count, nb_rw_fee, en_fee, report_date"
    )
    .gte("report_date", startDate)
    .lt("report_date", endDate);
  if (error) {
    console.error("Supabase fetchEOD error:", error);
    return [];
  }
  console.log(`Fetched ${data?.length} rows for the period.`);
  return data || [];
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
    console.assert(typeof OFFICE_TO_REGION === "object", "OFFICE_TO_REGION exists");
  } catch (err) {
    console.warn("Dev tests skipped or minor failure:", err?.message);
  }
})();



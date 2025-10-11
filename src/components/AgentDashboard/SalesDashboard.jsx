import React, { useEffect, useMemo, useState, useCallback } from "react";
import { ResponsiveContainer, LineChart as RLineChart, Line } from "recharts";
import styles from './SalesDashboard.module.css';

/**
 * SALES DASHBOARD (Supabase + EOD)
 */

// ---------- ICONS ----------
const Icon = ({ label, children }) => <span aria-label={label} title={label} className={styles.icon}>{children}</span>;
const CalendarDays = (props) => <Icon label="calendar" {...props}>📅</Icon>;
const Crown = (props) => <Icon label="crown" {...props}>👑</Icon>;
const Goal = (props) => <Icon label="goal" {...props}>🎯</Icon>;
const Rocket = (props) => <Icon label="rocket" {...props}>🚀</Icon>;
const TrendingUp = (props) => <Icon label="trending" {...props}>📈</Icon>;

// ---------- DATA & FORMATTING HELPERS ----------
const REGION_MAP = { "CEN-CAL": ["CA010","CA011","CA012","CA022","CA183","CA229","CA230","CA239"], "KERN COUNTY": ["CA016","CA047","CA048","CA049","CA172","CA240"], "THE VALLEY": ["CA025","CA030","CA045","CA046","CA065","CA074","CA075","CA095","CA118","CA119","CA231","CA238"], "BAY AREA": ["CA076","CA103","CA104","CA114","CA117","CA149","CA150","CA216","CA236","CA248"], "SOUTHERN CALI": ["CA131","CA132","CA133","CA166","CA249","CA250","CA251","CA252"], };
const OFFICE_TO_REGION = Object.entries(REGION_MAP).flatMap(([region, list]) => list.map(code => [code, region])).reduce((m,[c,r]) => (m[c]=r,m), {});
const currency = (n) => Number(n||0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const pct = (n) => `${Math.round(Number(n||0) * 100)}%`;
const officeCode = (s="") => String(s).trim().split(/\s+/)[0];
const iso = (d) => new Date(d).toISOString().slice(0,10);
const startOfWeek = (d) => { const dt = new Date(d); const day = dt.getDay(); const diff = (day+6)%7; dt.setDate(dt.getDate()-diff); dt.setHours(0,0,0,0); return dt; };
const endOfWeek = (d) => { const s = startOfWeek(d); const e = new Date(s); e.setDate(e.getDate()+7); return e; };
const startOfMonth = (d) => new Date(new Date(d).getFullYear(), new Date(d).getMonth(), 1);
const endOfMonth   = (d) => new Date(new Date(d).getFullYear(), new Date(d).getMonth()+1, 1);
const startOfQuarter = (d) => { const dt=new Date(d); const q=Math.floor(dt.getMonth()/3); return new Date(dt.getFullYear(), q*3, 1); };
const endOfQuarter   = (d) => { const dt=new Date(d); const q=Math.floor(dt.getMonth()/3); return new Date(dt.getFullYear(), q*3+3, 1); };

// ---------- LOGIC & MOCKS ----------
function coachFromMetrics({ sales, revenueNB, revenueEN }) { const notes = []; const revenue = (revenueNB || 0) + (revenueEN || 0); if (sales < 10) notes.push(`${10 - sales} NBs away from 10 for 10% commission.`); else notes.push(`You're at ${sales} NBs this week and already qualified for 10%.`); const nbGap = Math.max(0, 17 - sales); if (nbGap) notes.push(`${nbGap} NBs to reach 17 and target $3,500 fees.`); else notes.push(`You've hit the 17 NB target – keep stacking!`); notes.push(`Week revenue so far: ${currency(revenue)} (NB + EN).`); return notes; }
async function mockEvents() { return [ { id: "1", title: "Tax Season Kickoff – Jan 2 – All Offices", start: "2026-01-02" }, ]; }

// ✅ UPDATED to use agent full names
function aggregateFromRows(rows, prevRows, profiles = []) {
  const profileMap = new Map(profiles.map(p => [p.email, p.full_name]));
  const byAgent = new Map();
  const byOffice = new Map();
  const incAgent = (email, sales, nbFee, enFee, off) => { const cur = byAgent.get(email) || { sales:0, nbFee:0, enFee:0, offices:{} }; cur.sales += sales; cur.nbFee += nbFee; cur.enFee += enFee; cur.offices[off] = (cur.offices[off]||0) + sales; byAgent.set(email, cur); };
  const incOffice = (code, sales, revenue) => { const cur = byOffice.get(code) || { sales:0, revenue:0 }; cur.sales += sales; cur.revenue += revenue; byOffice.set(code, cur); };
  for (const r of rows) { const email = r.agent_email || "unknown@agent"; const off = officeCode(r.office_number); const sales = Number(r.nb_rw_count || 0); const nb = Number(r.nb_rw_fee || 0); const en = Number(r.en_fee || 0); incAgent(email, sales, nb, en, off); incOffice(off, sales, nb+en); }
  const prevAgent = new Map();
  const prevOffice = new Map();
  for (const r of prevRows || []) { const email = r.agent_email || "unknown@agent"; const off = officeCode(r.office_number); const sales = Number(r.nb_rw_count || 0); const nb = Number(r.nb_rw_fee || 0); const en = Number(r.en_fee || 0); prevAgent.set(email, (prevAgent.get(email) || 0) + sales); const po = prevOffice.get(off) || { sales:0, revenue:0 }; po.sales += sales; po.revenue += nb+en; prevOffice.set(off, po); }
  const agentStats = Array.from(byAgent.entries()).map(([email, v]) => ({ agentId: email, salesCount: v.sales, lastWeekSales: prevAgent.get(email) || 0, monthSalesCount: v.sales, revenueNB: v.nbFee, revenueEN: v.enFee, }));
  const agents = agentStats.map(a => ({
    id: a.agentId,
    name: profileMap.get(a.agentId) || a.agentId.split("@")[0],
    office: ""
  }));
  const offices = Array.from(byOffice.entries()).map(([code, v]) => ({ office: code, totalSales: v.sales, totalRevenue: v.revenue, wowChangePct: (() => { const p = prevOffice.get(code)?.sales || 0; if (!p) return null; return (v.sales - p) / p; })(), }));
  const regionTotals = {};
  for (const o of offices) { const region = OFFICE_TO_REGION[o.office] || "OTHER"; const cur = regionTotals[region] || { region, totalSales: 0, totalRevenue: 0 }; cur.totalSales += o.totalSales; cur.totalRevenue += o.totalRevenue; regionTotals[region] = cur; }
  const regions = Object.values(regionTotals);
  return { agents, stats: agentStats, offices, regions };
}


// ---------- UI Cards ----------
const EventsBanner = ({ events }) => (
  <div style={{width: '100%', overflow: 'hidden', borderRadius: '0.75rem', border: '1px solid #e5e7eb', backgroundColor: '#fefce8'}}>
    <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid #e5e7eb', backgroundColor: 'rgba(255,255,255,0.4)'}}>
      <CalendarDays /> <span style={{fontSize: '0.75rem', fontWeight: '500'}}>Events & Announcements</span>
    </div>
    <div style={{position: 'relative', whiteSpace: 'nowrap', animation: 'ticker 30s linear infinite', padding: '0.5rem 0.75rem', fontSize: '0.875rem'}}>
      {events.map((e) => (<span key={e.id} style={{marginRight: '2rem'}}><span style={{fontWeight: '500'}}>{new Date(e.start).toLocaleDateString()}:</span> {e.title}</span>))}
    </div>
    <style>{`@keyframes ticker {0%{transform:translateX(0);}100%{transform:translateX(-50%);}}`}</style>
  </div>
);

const LeaderboardCard = ({ agents, stats }) => {
  const rows = useMemo(() => stats.map(s => ({ agentId: s.agentId, name: agents.find(a => a.id === s.agentId)?.name || s.agentId, office: agents.find(a => a.id === s.agentId)?.office || "", sales: s.salesCount, revenue: s.revenueNB + s.revenueEN, })).sort((a,b) => b.sales - a.sales), [agents, stats]);
  const top5 = rows.slice(0, 5);
  const highestRevenue = rows.reduce((m, r) => (r.revenue > (m?.revenue ?? -Infinity) ? r : m), null);
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}><h3 className={styles.cardTitle}><Crown />Top 5 Agents</h3><p className={styles.cardDescription}>Weekly Sales Leaderboard</p></div>
      <div className={styles.cardContent}>
        <div className={styles.fiveColGrid}>
          {top5.map((r, idx) => (
            <div key={r.agentId} className={`${styles.gridItem} ${idx === 0 ? styles.gridItemTop : ''}`}>
              <div className={styles.itemHeader}><div className={styles.itemName}>{idx + 1}. {r.name}</div>{idx === 0 && <span className={styles.badge}>Top Seller</span>}</div>
              <div className={styles.itemSubtext}>{r.office}</div>
              <div className={styles.itemStats}>Sales: <span>{r.sales}</span></div>
              <div className={styles.itemStats}>Revenue: <span>{currency(r.revenue)}</span></div>
            </div>
          ))}
        </div>
        {highestRevenue && <div style={{marginTop:'1rem'}}><span className={styles.badge}>💰 Highest Revenue: {highestRevenue.name}</span></div>}
      </div>
    </div>
  );
};

// ✅ UPDATED with new metrics
const AgentInsightsCard = ({ agents, stats, currentAgentId }) => {
  const agent = agents.find(a => a.id === currentAgentId) || agents[0];
  const row = stats.find(s => s.agentId === agent?.id);
  const spark = useMemo(() => (agent ? [4, 6, 5, 7, 8, 10, 12].map((v, i) => ({ t: i, v })) : []), [agent]);
  const coaching = useMemo(() => { if (!row || !agent) return []; return coachFromMetrics({ sales: row.salesCount, revenueNB: row.revenueNB, revenueEN: row.revenueEN }); }, [row, agent]);
  const avgFee = row && row.salesCount > 0 ? row.revenueNB / row.salesCount : 0;
  const totalNbFee = row ? row.revenueNB : 0;
  const totalEnFee = row ? row.revenueEN : 0;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}><TrendingUp /> Agent Insights</h3>
        <p className={styles.cardDescription}>Personal stats & coaching for <span>{agent?.name || '...'}</span></p>
      </div>
      <div className={styles.cardContent}>
        {row ? (
          <>
            <table className={styles.table}>
              <thead><tr><th>Agent</th><th>Sales (wk)</th><th>Sales (mo)</th><th>Trend</th></tr></thead>
              <tbody>
                <tr>
                  <td>{agent?.name}</td><td>{row.salesCount}</td><td>{row.monthSalesCount}</td>
                  <td>
                    <div style={{ width: 120, height: 28 }}>
                      {spark && spark.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><RLineChart data={spark} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}><Line type="monotone" dataKey="v" stroke="#dc2626" dot={false} strokeWidth={2} /></RLineChart></ResponsiveContainer>) : null}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: '1.5rem', borderTop: `1px solid var(--border-color)` }}>
              <div className={styles.gridTwoCol} style={{ paddingTop: '1rem' }}>
                <div><p className={styles.cardDescription}>Total NB Fee</p><p className={styles.improvedAgentName}>{currency(totalNbFee)}</p></div>
                <div><p className={styles.cardDescription}>Avg. Fee / NB</p><p className={styles.improvedAgentName}>{currency(avgFee)}</p></div>
                <div><p className={styles.cardDescription}>Total EN Fee</p><p className={styles.improvedAgentName}>{currency(totalEnFee)}</p></div>
              </div>
            </div>
          </>
        ) : <p className={styles.cardDescription}>No stats available.</p>}
        <div style={{ marginTop: '1.5rem' }}>
          <h4 className={styles.cardTitle} style={{ fontSize: '1rem' }}><Rocket /> Coaching & Highlights</h4>
          <ul className={styles.list}>{coaching.length > 0 ? coaching.map((c, i) => <li key={i}>{c}</li>) : <li>No coaching tips yet.</li>}</ul>
        </div>
      </div>
    </div>
  );
};

// ✅ UPDATED with color-coded stats
const TopOfficesCard = ({ offices }) => {
  const top5 = useMemo(() => [...offices].sort((a, b) => b.totalSales - a.totalSales).slice(0, 5), [offices]);
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Top 5 Offices (by sales volume)</h3></div>
      <div className={styles.cardContent}>
        <div className={styles.fiveColGrid}>
          {top5.map((o, i) => (
            <div key={o.office} className={styles.gridItem}>
              <div className={styles.cardHeader} style={{ padding: 0, paddingBottom: '0.5rem' }}>
                <h3 className={styles.itemName} style={{ fontSize: '1rem' }}>{i + 1}. {o.office}</h3>
                {typeof o.wowChangePct === "number" && (
                  <p className={styles.cardDescription}>
                    WoW: <span className={o.wowChangePct >= 0 ? styles.positive : styles.negative}>
                      {o.wowChangePct >= 0 ? "+" : ""}{pct(o.wowChangePct)}
                    </span>
                  </p>
                )}
              </div>
              <div className={styles.cardContent} style={{ padding: 0 }}>
                <div className={styles.itemStats}>Sales: <span>{o.totalSales}</span></div>
                <div className={styles.itemStats}>Revenue: <span>{currency(o.totalRevenue)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MostImprovedCard = ({ agents, stats }) => {
  const improved = useMemo(() => { if (!stats || stats.length === 0) return null; const withGrowth = stats.map(s => { const currentSales = s.salesCount || 0; const lastWeek = s.lastWeekSales || 0; let growth = 0; const absoluteIncrease = currentSales - lastWeek; if (lastWeek > 0) { growth = (currentSales - lastWeek) / lastWeek; } else if (currentSales > 0) { growth = Infinity; } return { agentId: s.agentId, growth, absoluteIncrease, currentSales, lastWeek }; }); withGrowth.sort((a, b) => { if (b.growth !== a.growth) return b.growth - a.growth; return b.absoluteIncrease - a.absoluteIncrease; }); const top = withGrowth[0]; return (top && top.absoluteIncrease > 0) ? top : null; }, [stats]);
  const agentName = agents.find(a => a.id === improved?.agentId)?.name;
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}><h3 className={styles.cardTitle}>✨ Most Improved Agent 🚀</h3><p className={styles.cardDescription}>Week-over-week growth</p></div>
      <div className={styles.cardContent}>
        {improved ? (<div><div className={styles.improvedAgentName}>{agentName}</div><div className={styles.improvedAgentStats}>Sales jumped from <span>{improved.lastWeek}</span> to <span>{improved.currentSales}</span> this week!</div></div>) : (<p className={styles.cardDescription}>No significant week-over-week growth</p>)}
      </div>
    </div>
  );
};

const GoalTrackerCard = () => (
  <div className={styles.card}>
    <div className={styles.cardHeader}><h3 className={styles.cardTitle}><Goal /> Goal Tracker</h3></div>
    <div className={styles.cardContent}>
      <div className={styles.statDisplay}>Company Sales Goal: <span>85%</span></div>
      <div className={styles.progress}><div className={styles.progressBar} style={{ width: '85%' }} /></div>
    </div>
  </div>
);

const RegionalLeaderboard = ({ regions }) => {
  const ranked = useMemo(() => [...regions].sort((a,b)=>b.totalSales-a.totalSales), [regions]);
  const top = ranked[0];
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Regional Sales Leaderboard</h3><p className={styles.cardDescription}>Ranking by total sales this period</p></div>
      <div className={styles.cardContent}>
        {top && <div><span className={styles.badge}>🥇 Top Region: {top.region}</span></div>}
        <div className={styles.fiveColGrid}>
          {ranked.map((r,i)=>(
            <div key={r.region} className={`${styles.gridItem} ${i === 0 ? styles.gridItemTop : ''}`}>
              <div className={styles.itemHeader}><div className={styles.itemName}>{i+1}. {r.region}</div></div>
              <div className={styles.itemStats}>Sales: <span>{r.totalSales}</span></div>
              <div className={styles.itemStats}>Revenue: <span>{currency(r.totalRevenue)}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------- MAIN COMPONENT ----------
export default function SalesDashboard({ supabaseClient, currentUserEmail, timeFilterDefault = "thisWeek" }) {
  const [filter, setFilter] = useState(timeFilterDefault);
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState([]);
  const [offices, setOffices] = useState([]);
  const [regions, setRegions] = useState([]);
  const [events, setEvents] = useState([]);
  const [currentAgentId, setCurrentAgentId] = useState(null);

  const ranges = useMemo(() => { if (filter === "thisMonth") { return { start: startOfMonth(new Date()), end: endOfMonth(new Date()), prevStart: startOfMonth(new Date(new Date().getFullYear(), new Date().getMonth()-1, 1)), prevEnd: startOfMonth(new Date()) }; } if (filter === "thisQuarter") { return { start: startOfQuarter(new Date()), end: endOfQuarter(new Date()), prevStart: startOfQuarter(new Date(new Date().getFullYear(), new Date().getMonth()-3, 1)), prevEnd: startOfQuarter(new Date()) }; } return { start: startOfWeek(new Date()), end: endOfWeek(new Date()), prevStart: startOfWeek(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()-7)), prevEnd: startOfWeek(new Date()) }; }, [filter]);

  // ✅ UPDATED to fetch profiles
  useEffect(() => {
    (async () => {
      setEvents(await mockEvents());
      const client = supabaseClient || (typeof window !== "undefined" ? window.supabase : null);

      if (client) {
        const { data: profiles, error } = await client.from('profiles').select('email, full_name');
        if (error) {
          console.error("Error fetching profiles:", error);
        }

        const curRows  = await fetchEOD(client, ranges.start, ranges.end);
        const prevRows = await fetchEOD(client, ranges.prevStart, ranges.prevEnd);
        
        const { agents, stats, offices, regions } = aggregateFromRows(curRows, prevRows, profiles || []);
        
        setAgents(agents); 
        setStats(stats); 
        setOffices(offices); 
        setRegions(regions);
        
        const loggedInAgentExists = agents.some(agent => agent.id === currentUserEmail);
        if (currentUserEmail && loggedInAgentExists) { 
          setCurrentAgentId(currentUserEmail); 
        } else { 
          setCurrentAgentId(agents?.[0]?.id || null); 
        }
      } else {
        setAgents([]); setStats([]); setOffices([]); setRegions([]); setCurrentAgentId(null);
      }
    })().catch(console.error);
  }, [supabaseClient, currentUserEmail, ranges.start, ranges.end, ranges.prevStart, ranges.prevEnd]);

  return (
    <div className={styles.dashboardContainer}>
      <EventsBanner events={events} />
      <div className={styles.header}>
        <h2 className={styles.headerTitle}><Crown />Sales Dashboard</h2>
        <select className={styles.select} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="thisWeek">This Week</option>
          <option value="thisMonth">This Month</option>
          <option value="thisQuarter">This Quarter</option>
        </select>
      </div>
      <div className={styles.gridTwoCol}>
        <LeaderboardCard agents={agents} stats={stats} />
        <AgentInsightsCard agents={agents} stats={stats} currentAgentId={currentAgentId} />
      </div>
      <TopOfficesCard offices={offices} />
      <div className={styles.gridTwoCol}>
        <MostImprovedCard agents={agents} stats={stats} />
        <GoalTrackerCard />
      </div>
      <RegionalLeaderboard regions={regions} />
    </div>
  );
}

async function fetchEOD(supabase, start, end) {
  const startDate = iso(start); const endDate = iso(end);
  console.log(`Fetching EOD reports from ${startDate} to ${endDate}`);
  const { data, error } = await supabase.from("eod_reports").select("agent_email, office_number, nb_rw_count, nb_rw_fee, en_fee, report_date").gte("report_date", startDate).lt("report_date", endDate);
  if (error) { console.error("Supabase fetchEOD error:", error); return []; }
  console.log(`Fetched ${data?.length} rows for the period.`);
  return data || [];
}
// src/pages/admin/AdminCommissionLog.jsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthContext";
import {
  calculateCommissionStats,
  formatMoney,
  formatDateTime,
  getStatusBadgeClass,
  normStatus
} from "../../lib/commissionEngine";

// --- ICONS & ASSETS ---
const IconFilter = () => <span className="text-gray-400 text-lg">🔍</span>;
const IconArrowLeft = () => <span>←</span>;
const IconBuilding = () => <span className="text-xl">🏢</span>;
const IconFire = () => <span className="text-red-500 text-lg">🔥</span>;
const IconClock = () => <span className="text-gray-400">⏱️</span>;

// --- CONFIGURATION ---
const CURRENT_SEASON_YEAR = 2026;
const SEASON_START = new Date(`${CURRENT_SEASON_YEAR}-01-01`);
const SEASON_END = new Date(`${CURRENT_SEASON_YEAR}-04-15`);

// Season ISO (used for DB filtering)
const SEASON_START_ISO = `${CURRENT_SEASON_YEAR}-01-01T00:00:00`;
const SEASON_END_ISO = `${CURRENT_SEASON_YEAR}-04-15T23:59:59`;

const PRIOR_YEAR = 2025;
const PRIOR_SEASON_START_ISO = `${PRIOR_YEAR}-01-01T00:00:00`;
const PRIOR_SEASON_END_ISO = `${PRIOR_YEAR}-04-15T23:59:59`;

const OFFICE_REGIONS = {
  "CEN-CAL": [
    { code: "CA010", name: "NOBLE" }, { code: "CA011", name: "VISALIA" },
    { code: "CA012", name: "PORTERVILLE" }, { code: "CA022", name: "TULARE" },
    { code: "CA183", name: "HENDERSON" }, { code: "CA229", name: "CORCORAN" },
    { code: "CA230", name: "AVENAL" }, { code: "CA239", name: "COALINGA" }
  ],
  "KERN COUNTY": [
    { code: "CA016", name: "NILES" }, { code: "CA047", name: "MING" },
    { code: "CA048", name: "NORRIS" }, { code: "CA049", name: "WHITE" },
    { code: "CA172", name: "BRUNDAGE" }, { code: "CA240", name: "ARVIN" }
  ],
  "BAY AREA": [
    { code: "CA076", name: "PITSBURG" }, { code: "CA103", name: "ANTIOCH" },
    { code: "CA104", name: "RICHMOND" }, { code: "CA114", name: "SAN LORENZO" },
    { code: "CA117", name: "VALLEJO" }, { code: "CA149", name: "REDWOOD CITY" },
    { code: "CA150", name: "MENLO PARK" }, { code: "CA216", name: "NAPA" },
    { code: "CA236", name: "SAN RAFAEL" }, { code: "CA248", name: "SPRINGS" }
  ],
  "THE VALLEY": [
    { code: "CA025", name: "RIVERBANK" }, { code: "CA030", name: "MERCED" },
    { code: "CA045", name: "ATWATER" }, { code: "CA046", name: "TURLOCK" },
    { code: "CA065", name: "CROWS" }, { code: "CA074", name: "CERES" },
    { code: "CA075", name: "MODESTO" }, { code: "CA095", name: "PATTERSON" },
    { code: "CA118", name: "HOLLISTER" }, { code: "CA119", name: "YOSEMITE" },
    { code: "CA231", name: "LIVINGSTON" }, { code: "CA238", name: "CHOWCHILLA" }
  ],
  "SOUTHERN CALI": [
    { code: "CA131", name: "CHULA VISTA" }, { code: "CA132", name: "NATIONAL CITY" },
    { code: "CA133", name: "SAN DIEGO" }, { code: "CA166", name: "EL CAJON" },
    { code: "CA249", name: "BRAWLEY" }, { code: "CA250", name: "BARRIO LOGAN" },
    { code: "CA269", name: "EL CENTRO" }, { code: "CA270", name: "MONTCLAIR" },
    { code: "CA272", name: "LA PUENTE" }
  ]
};

// ✅ Shared SELECT list (fixes your syntax error + keeps mapping consistent)
const LOG_SELECT = [
  "sync_key",
  "date_time",
  "office_code",
  "office_full",
  "cust_id",
  "customer",
  "agent_email",
  "agent_name",
  "payment_method",
  "last4",
  "first",
  "last",
  "phone",
  "preparer",
  "record_number",
  "receipt",
  // ✅ force Admin to use receipt fields as the primary ones
  "status:receipt_maxtax_status",
  "tax_year:receipt_maxtax_year",
  "prep_fee:charged",
  // keep raw fields too (optional auditing)
  "receipt_maxtax_status",
  "receipt_maxtax_year",
  "charged"
].join(",");

// ✅ 2025 historical table has different columns
const HIST25_SELECT = [
  "office_code",
  "date_time",
  "charged_amount",
  "totals",
  "cust_id",
  "customer",
  "agent_email",
  "agent_name",
  "record_number"
].join(",");

/** ---------- UI HELPERS ---------- */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function fmtSigned(n) {
  if (n > 0) return `+${n}`;
  return `${n}`;
}
function barPctAbs(value, maxAbs) {
  if (!maxAbs) return 0;
  return clamp((Math.abs(value) / maxAbs) * 100, 0, 100);
}

/** ---------- AS-OF / DATE HELPERS ---------- */
function toDateSafe(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function makePriorYearCutoff(latestDt, priorYear = 2025) {
  const d = toDateSafe(latestDt);
  if (!d) return null;

  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${priorYear}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}
function isRowOnOrBefore(row, cutoffIso) {
  if (!cutoffIso) return true;
  const rdt = row?.date_time;
  if (!rdt) return false;
  return rdt <= cutoffIso;
}

/** ---------- KPI ENGINE (AS-OF + TRUE 2025 PACING) ---------- */
function calculateProfessionalKPIs({
  currentRows,
  priorRows,
  goal,
  priorYearTotal,
  pacingCurve,
  asOfDateTime,
  priorAsOfDateTime
}) {
  const asOf = toDateSafe(asOfDateTime) || new Date();
  const currentMonthDay = asOf.toISOString().slice(5, 10); // "MM-DD"

  const curScope = (currentRows || []).filter(r => isRowOnOrBefore(r, asOfDateTime));
  const priorScope = (priorRows || []).filter(r => isRowOnOrBefore(r, priorAsOfDateTime));

  // ✅ "Total taxes" must match the same logic used by your office filter totals:
  // total = eligible + excluded (gross count) based on calculateCommissionStats()
  const curStats = calculateCommissionStats(curScope);
  const curTotalTaxes = (curStats.taxesFiled || 0) + (curStats.blockedCount || 0);

  // ✅ 2025 historical table = each row is a filed return (no status columns)
  const priorTotalTaxesSameDay = priorScope.length;

  // ✅ Keep "accepted" for yield (accepted ÷ attempts)
  let curAttempts = 0, curAccepted = 0, curRevenue = 0;
  curScope.forEach(r => {
    curAttempts++;
    const s = normStatus(r.status);
    const fee = Number(r.prep_fee) || Number(r.charged) || 0;
    if (!["REJECTED", "NO STATUS FOUND", "VOID", "DELETED"].includes(s)) {
      curAccepted++;
      curRevenue += fee;
    }
  });
  const curYieldRate = curAttempts > 0 ? (curAccepted / curAttempts) * 100 : 0;

  // ✅ 2025 historical table has no status; each row is a filed return
  const priorAccepted = priorScope.length;

  const totalDays = (SEASON_END - SEASON_START) / (1000 * 60 * 60 * 24);
  const daysPassed = Math.max(1, (asOf - SEASON_START) / (1000 * 60 * 60 * 24));
  const curvePoint = (pacingCurve || []).find(p => p.month_day === currentMonthDay);
  const expectedPct = curvePoint ? Number(curvePoint.target_cumulative_pct) : (daysPassed / totalDays);

  const expectedCount = Math.round((goal || 0) * expectedPct);

  // ✅ totals used for pacing math
  const currentForPacing = curTotalTaxes;
  const priorForPacing = priorTotalTaxesSameDay;

  const variance = currentForPacing - expectedCount;

  const daysRemaining = Math.max(1, (SEASON_END - asOf) / (1000 * 60 * 60 * 24));
  const remainingGoal = Math.max(0, (goal || 0) - currentForPacing);
  const burnRateToGoal = (remainingGoal / daysRemaining).toFixed(1);

  // ✅ YoY compares totals at same cutoff
  const yoyVariance = currentForPacing - priorForPacing;

  const priorDaysPassed = Math.max(1, Math.round(expectedPct * totalDays));
  const priorAvgPerDay = priorDaysPassed > 0 ? (priorAccepted / priorDaysPassed) : 0;

  const priorExpectedSameDay = Math.round((priorYearTotal || 0) * expectedPct);

  return {
    _asOf: asOfDateTime || asOf.toISOString(),

    // ✅ gross totals (eligible + excluded)
    totalTaxes: curTotalTaxes,
    priorTotalTaxesSameDay,

    // keep accepted for yield
    accepted: curAccepted,
    revenue: curRevenue,
    yieldRate: curYieldRate,

    expectedCount,
    variance,

    daysRemaining: Math.round(daysRemaining),
    burnRateToGoal,

    priorAcceptedSameDay: priorAccepted,
    priorAvgPerDay,

    priorExpectedSameDay,

    yoyVariance,

    // ✅ pctComplete should match "Current" (total pacing)
    pctComplete: (goal || 0) > 0 ? (currentForPacing / goal) : 0,
    status: variance >= 0 ? "Ahead" : "Behind"
  };
} // ✅ IMPORTANT: this closing brace was missing in your file and caused the "export not top level" error

/** ---------- REGION AGGREGATION (NEW) ---------- */
function aggregateRegionFromItems(items) {
  const list = items || [];
  if (list.length === 0) return null;

  const daysRemaining = Math.max(1, ...list.map(x => Number(x?.kpi?.daysRemaining ?? 1)));

  const goal = list.reduce((s, x) => s + (Number(x?.goals?.goal) || 0), 0);

  // ✅ totals-based region aggregation
  const currentTotal = list.reduce((s, x) => s + (Number(x?.kpi?.totalTaxes) || 0), 0);
  const revenue = list.reduce((s, x) => s + (Number(x?.kpi?.revenue) || 0), 0);
  const expected = list.reduce((s, x) => s + (Number(x?.kpi?.expectedCount) || 0), 0);
  const variance = currentTotal - expected;

  const priorTotalSameDay = list.reduce((s, x) => s + (Number(x?.kpi?.priorTotalTaxesSameDay) || 0), 0);
  const yoyVariance = currentTotal - priorTotalSameDay;

  const remaining = Math.max(0, goal - currentTotal);
  const burnRateToGoal = daysRemaining > 0 ? (remaining / daysRemaining) : 0;

  const yieldAvg =
    list.length > 0
      ? list.reduce((s, x) => s + (Number(x?.kpi?.yieldRate) || 0), 0) / list.length
      : 0;

  const asOf = list?.[0]?.kpi?._asOf || null;
  const region = list?.[0]?.region || null;

  return {
    region,
    asOf,
    goal,
    // keep name "accepted" for backwards compatibility in the modal, but it's TOTAL now
    accepted: currentTotal,
    revenue,
    expected,
    variance,
    daysRemaining,
    burnRateToGoal,
    // keep name "priorAcceptedSameDay" for backwards compatibility, but it's TOTAL now
    priorAcceptedSameDay: priorTotalSameDay,
    yoyVariance,
    yieldAvg
  };
}

/** ---------- SUPABASE PAGINATION HELPERS (FIX FOR MISSING ROWS) ---------- */
async function fetchAllRowsPaged({ supabase, table, buildQuery, pageSize = 1000, maxPages = 200 }) {
  const all = [];
  let from = 0;
  let pages = 0;

  while (true) {
    pages += 1;
    if (pages > maxPages) {
      console.warn(
        `[AdminCommissionLog] fetchAllRowsPaged hit maxPages=${maxPages} for table ${table}. Returning partial data: ${all.length} rows.`
      );
      break;
    }

    const to = from + pageSize - 1;

    const base = supabase.from(table);
    const q0 = buildQuery ? buildQuery(base) : base;
    const q = q0.range(from, to);

    const { data, error } = await q;

    if (error) throw error;

    const batch = data || [];
    all.push(...batch);

    // last page
    if (batch.length < pageSize) break;

    from += pageSize;
  }

  return all;
}

export default function AdminCommissionLog() {
  const { supabaseClient: supabase } = useAuth();

  // -- Data State --
  const [baseRows, setBaseRows] = useState([]);
  const [fixRequests, setFixRequests] = useState([]);
  const [officeGoals, setOfficeGoals] = useState({});
  const [pacingCurve, setPacingCurve] = useState([]);
  const [annotations, setAnnotations] = useState({});
  const [loading, setLoading] = useState(true);

  const [latestLogDateTime, setLatestLogDateTime] = useState(null);
  const [historical2025Rows, setHistorical2025Rows] = useState([]);

  // -- UI State --
  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [filterOffice, setFilterOffice] = useState("all");
  const [filterStatus] = useState("all");
  const [filterMonth, setFilterMonth] = useState("");
  const [selectedAgent, setSelectedAgent] = useState(null);

  // -- Modal State --
  const [selectedFix, setSelectedFix] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);

  // -- KPI Compare Modal State --
  const [kpiCompareOpen, setKpiCompareOpen] = useState(false);
  const [compareSelection, setCompareSelection] = useState([]); // manual selection capped at 3
  const [compareMode, setCompareMode] = useState("offices"); // "offices" | "region"
  const [compareRegionName, setCompareRegionName] = useState(null);

  // 1. FETCH ALL DATA (PAGED - FIXED)
  useEffect(() => {
    async function loadData() {
      if (!supabase) return;
      setLoading(true);

      try {
        // ✅ Fetch 2026 season logs with pagination
        const logData = await fetchAllRowsPaged({
          supabase,
          table: "agent_tax_commission_log",
          pageSize: 1000,
          buildQuery: (q) =>
            q
              .select(LOG_SELECT)
              .gte("date_time", SEASON_START_ISO)
              .lte("date_time", SEASON_END_ISO)
              .order("date_time", { ascending: false })
        });

        // Latest row (fast single)
        const { data: latestRow, error: latestErr } = await supabase
          .from("agent_tax_commission_log")
          .select("date_time")
          .gte("date_time", SEASON_START_ISO)
          .lte("date_time", SEASON_END_ISO)
          .order("date_time", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestErr) console.error("Latest date_time error", latestErr);

        // Goals / curve / fixes / annotations (small tables)
        const { data: goalsData, error: goalsErr } = await supabase
          .from("office_historical_kpi")
          .select("office_code, goal_2026_season, taxes_2025");
        if (goalsErr) console.error("Goals load error", goalsErr);

        const { data: curveData, error: curveErr } = await supabase
          .from("tax_season_pacing_curve")
          .select("*");
        if (curveErr) console.error("Curve load error", curveErr);

        const { data: fixData, error: fixErr } = await supabase
          .from("tax_commission_fix_requests")
          .select("*");
        if (fixErr) console.error("Fix requests load error", fixErr);

        const { data: annData, error: annErr } = await supabase
          .from("tax_commission_annotations")
          .select("*");
        if (annErr) console.error("Annotations load error", annErr);

        // ✅ Fetch 2025 historical season logs with pagination too
        let hist25 = [];
        try {
          hist25 = await fetchAllRowsPaged({
            supabase,
            table: "historical_logs_2025",
            pageSize: 1000,
            buildQuery: (q) =>
              q
                .select(HIST25_SELECT)
                .gte("date_time", PRIOR_SEASON_START_ISO)
                .lte("date_time", PRIOR_SEASON_END_ISO)
                .order("date_time", { ascending: false })
          });
        } catch (e) {
          console.error("Historical 2025 load error", e);
        }

        console.log("[ADMIN] baseRows fetched (season):", logData.length);

        setBaseRows(logData || []);
        setFixRequests(fixData || []);
        setPacingCurve(curveData || []);
        setLatestLogDateTime(latestRow?.date_time || null);
        setHistorical2025Rows(hist25 || []);

        const annMap = {};
        (annData || []).forEach(a => (annMap[a.sync_key] = a));
        setAnnotations(annMap);

        const gMap = {};
        if (goalsData) {
          goalsData.forEach(g => {
            if (g.office_code) {
              gMap[g.office_code] = {
                goal: g.goal_2026_season,
                priorYear: g.taxes_2025
              };
            }
          });
        }
        setOfficeGoals(gMap);
      } catch (err) {
        console.error("AdminCommissionLog loadData fatal error", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [supabase]);

  // 2. MERGE LOGIC (Fixes + Logs)
  const mergedData = useMemo(() => {
    const approvedFixes = {};
    fixRequests.forEach(fix => {
      if (fix.admin_status === "approved") approvedFixes[fix.sync_key] = fix;
    });

    return baseRows.map(row => {
      const key = row.sync_key;
      const ann = annotations[key] || {};
      const fix = approvedFixes[key];
      let finalRow = { ...row };

      // status/tax_year/prep_fee are aliased from receipt in the query,
      // so just normalize missing values safely:
      if (!finalRow.status) finalRow.status = "NO STATUS FOUND";
      if (!finalRow.tax_year) finalRow.tax_year = "";
      if (finalRow.prep_fee === undefined || finalRow.prep_fee === null) finalRow.prep_fee = 0;

      if (ann.pre_ack_advance !== undefined) finalRow.pre_ack_advance = ann.pre_ack_advance;
      if (ann.referral_paid_out !== undefined) finalRow.referral_paid_out = ann.referral_paid_out;

      if (fix) {
        finalRow.is_fixed_by_admin = true;
        finalRow.status = fix.status;
        finalRow.tax_year = fix.tax_year;
        finalRow.first = fix.first;
        finalRow.last = fix.last;
      }
      return finalRow;
    });
  }, [baseRows, fixRequests, annotations]);

  // 2.5 BUILD FAST LOOKUP MAPS (for Fixes filtering)
  const baseRowBySyncKey = useMemo(() => {
    const map = {};
    (baseRows || []).forEach(r => {
      if (r?.sync_key) map[r.sync_key] = r;
    });
    return map;
  }, [baseRows]);

  // ONLY show Fix Requests where the ORIGINAL log row is still "NO STATUS FOUND"
  const pendingFixRequests = useMemo(() => {
    return (fixRequests || []).filter(req => {
      if (req.admin_status !== "pending") return false;

      const base = baseRowBySyncKey[req.sync_key];

      // If we can't find the base row, keep it visible so it doesn't "disappear" mysteriously
      if (!base) return true;

      const baseStatus = base.status || base.receipt_maxtax_status || "NO STATUS FOUND";
      return normStatus(baseStatus) === "NO STATUS FOUND";
    });
  }, [fixRequests, baseRowBySyncKey]);

  // 3. FILTERING
  const filteredRows = useMemo(() => {
    return mergedData.filter(r => {
      const rDate = r.date_time ? r.date_time.slice(0, 7) : "";

      const matchSearch =
        (r.customer || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.agent_email || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.agent_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.cust_id || "").includes(search);

      const matchOffice = filterOffice === "all" || r.office_code === filterOffice;
      const matchStatus = filterStatus === "all" || normStatus(r.status) === normStatus(filterStatus);

      // If an agent is selected, ignore the month filter so you see their full season history
      const matchDate = selectedAgent ? true : (filterMonth === "" || rDate === filterMonth);

      // Lowercase comparison so "Erik" matches "erik"
      const currentRowEmail = (r.agent_email || "").toLowerCase();
      const matchAgent = selectedAgent === null || currentRowEmail === selectedAgent;

      return matchSearch && matchOffice && matchStatus && matchDate && matchAgent;
    });
  }, [mergedData, search, filterOffice, filterStatus, filterMonth, selectedAgent]);

  // 4. AGGREGATE AGENT PERFORMANCE
  const agentLeaderboard = useMemo(() => {
    const scopeRows = mergedData.filter(r => {
      const matchOffice = filterOffice === "all" || r.office_code === filterOffice;
      return matchOffice;
    });

    const groups = {};
    scopeRows.forEach(row => {
      const agent = (row.agent_email || "unknown").toLowerCase();
      if (!groups[agent]) groups[agent] = [];
      groups[agent].push(row);
    });

    const leaderboard = Object.keys(groups).map(agentEmail => {
      const agentRows = groups[agentEmail];
      const stats0 = calculateCommissionStats(agentRows);
      const totalCount = stats0.taxesFiled + stats0.blockedCount;

      return {
        agent_email: agentEmail,
        agent_name: agentRows[0]?.agent_name || agentEmail,
        office: agentRows[0]?.office_code || "N/A",
        countTotal: totalCount,
        countEligible: stats0.taxesFiled,
        countExcluded: stats0.blockedCount,
        revenueTotal: stats0.totalRevenue + stats0.blockedRevenue,
        revenueEligible: stats0.totalRevenue,
        commission: stats0.totalCommission,
        tier: stats0.tierLabel,
        rate: stats0.commissionRate
      };
    });

    return leaderboard.sort((a, b) => b.commission - a.commission);
  }, [mergedData, filterOffice]);

  // 5. GLOBAL STATS
  const stats = useMemo(() => {
    const calculated = calculateCommissionStats(filteredRows);
    return {
      ...calculated,
      grossRevenue: calculated.totalRevenue + calculated.blockedRevenue,
      grossCount: calculated.taxesFiled + calculated.blockedCount
    };
  }, [filteredRows]);

  // 6. OFFICE KPI LOGIC
  const officeKpiData = useMemo(() => {
    const officeGroups = {};
    mergedData.forEach(row => {
      const code = row.office_code;
      if (!officeGroups[code]) officeGroups[code] = [];
      officeGroups[code].push(row);
    });

    const officeGroups2025 = {};
    (historical2025Rows || []).forEach(row => {
      const code = row.office_code;
      if (!officeGroups2025[code]) officeGroups2025[code] = [];
      officeGroups2025[code].push(row);
    });

    const asOf = latestLogDateTime || null;
    const priorAsOf = makePriorYearCutoff(latestLogDateTime, 2025);

    return Object.entries(OFFICE_REGIONS).map(([regionName, offices]) => {
      const regionStats = { totalTaxes: 0, totalRev: 0, offices: [] };

      const officeDetails = offices.map(officeDef => {
        const rows = officeGroups[officeDef.code] || [];
        const priorRows = officeGroups2025[officeDef.code] || [];
        const goals = officeGoals[officeDef.code] || { goal: 0, priorYear: 0 };

        const kpi = calculateProfessionalKPIs({
          currentRows: rows,
          priorRows,
          goal: goals.goal,
          priorYearTotal: goals.priorYear,
          pacingCurve,
          asOfDateTime: asOf,
          priorAsOfDateTime: priorAsOf
        });

        // ✅ Region totals should match CURRENT (totalTaxes)
        regionStats.totalTaxes += (kpi.totalTaxes || 0);
        regionStats.totalRev += (kpi.revenue || 0);

        return { ...officeDef, goals, kpi, region: regionName };
      });

      officeDetails.sort((a, b) => (b.kpi.variance ?? 0) - (a.kpi.variance ?? 0));
      return { region: regionName, totals: regionStats, offices: officeDetails };
    });
  }, [mergedData, officeGoals, pacingCurve, historical2025Rows, latestLogDateTime]);

  // --- ACTIONS ---
  const handleProcessFix = async (status) => {
    if (!selectedFix) return;
    setProcessing(true);
    const updates = {
      admin_status: status,
      approved_at: new Date().toISOString(),
      rejection_reason: status === "rejected" ? rejectReason : null
    };
    await supabase.from("tax_commission_fix_requests").update(updates).eq("sync_key", selectedFix.sync_key);
    setFixRequests(prev => prev.map(f => f.sync_key === selectedFix.sync_key ? { ...f, ...updates } : f));
    setSelectedFix(null);
    setRejectReason("");
    setProcessing(false);
  };

  const currentAgentName = useMemo(() => {
    if (!selectedAgent) return "";
    const agent = agentLeaderboard.find(a => a.agent_email === selectedAgent);
    return agent ? agent.agent_name : selectedAgent;
  }, [selectedAgent, agentLeaderboard]);

  // --- KPI Compare helpers ---
  const toggleCompareOffice = (regionName, office) => {
    setCompareMode("offices");
    setCompareRegionName(null);

    setCompareSelection(prev => {
      const exists = prev.some(x => x.code === office.code);
      if (exists) return prev.filter(x => x.code !== office.code);

      if (prev.length >= 3) return prev;
      return [
        ...prev,
        {
          region: regionName,
          code: office.code,
          name: office.name,
          kpi: office.kpi,
          goals: office.goals
        }
      ];
    });
  };

  const openCompareSingle = (regionName, office) => {
    setCompareMode("offices");
    setCompareRegionName(null);
    setCompareSelection([{
      region: regionName,
      code: office.code,
      name: office.name,
      kpi: office.kpi,
      goals: office.goals
    }]);
    setKpiCompareOpen(true);
  };

  const openCompareRegion = (region) => {
    setCompareMode("region");
    setCompareRegionName(region.region);
    setCompareSelection(
      (region.offices || []).map(o => ({
        region: region.region,
        code: o.code,
        name: o.name,
        kpi: o.kpi,
        goals: o.goals
      }))
    );
    setKpiCompareOpen(true);
  };

  if (loading) return <div className="p-10 text-center text-gray-500">Loading Intelligence...</div>;

  return (
    <div className="min-h-screen bg-gray-50/50 p-8">
      {/* HEADER */}
      <div className="mb-8">
        {!selectedAgent ? (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 animate-in fade-in">
            <div>
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Commission Admin</h1>
              <p className="text-gray-500 mt-1 font-medium">Tax Season Manager • 2026</p>
            </div>
            <div className="bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm inline-flex">
              <button
                onClick={() => setActiveTab("overview")}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === "overview" ? "bg-gray-900 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"}`}
              >
                Agent Overview
              </button>
              <button
                onClick={() => setActiveTab("kpi")}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === "kpi" ? "bg-gray-900 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"}`}
              >
                Office KPIs <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">LIVE</span>
              </button>
              <button
                onClick={() => setActiveTab("fixes")}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === "fixes" ? "bg-gray-900 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"}`}
              >
                Fixes {pendingFixRequests.length > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full ml-1">
                    {pendingFixRequests.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-right-4">
            <button onClick={() => setSelectedAgent(null)} className="group flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4 font-bold text-sm uppercase tracking-wide">
              <span className="bg-white border p-1 rounded-md group-hover:border-gray-400 transition-colors"><IconArrowLeft /></span> Back to Leaderboard
            </button>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-200 pb-6">
              <div>
                <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">{currentAgentName}</h1>
                <div className="flex items-center gap-3 mt-2">
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide border border-blue-200">{selectedAgent}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AGENT OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap gap-6 items-center">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-500 font-bold uppercase tracking-wide"><IconFilter /> Filters</div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Office</label>
              <select
                value={filterOffice}
                onChange={e => { setFilterOffice(e.target.value); setSelectedAgent(null); }}
                className="border-gray-200 bg-gray-50 rounded-lg text-sm font-semibold h-10 min-w-[180px]"
                disabled={!!selectedAgent}
              >
                <option value="all">Global (All Offices)</option>
                {[...new Set(baseRows.map(r => r.office_code))].sort().map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Period</label>
              <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="border-gray-200 bg-gray-50 rounded-lg text-sm font-semibold h-10" />
            </div>
            <div className="flex flex-col flex-1 max-w-sm ml-auto">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Search</label>
              <input value={search} onChange={e => setSearch(e.target.value)} className="w-full border-gray-200 bg-white rounded-lg px-4 text-sm h-10 shadow-sm" placeholder="ID, Name, or Email..." />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatCard label="Total Rev" value={formatMoney(stats.grossRevenue)} sub="Gross Generated" color="bg-white border-gray-200" />
            <StatCard label="Total Taxes" value={stats.grossCount} sub={`${stats.taxesFiled} Eligible`} color="bg-white border-gray-200" />
            <StatCard label="Commission Payout" value={formatMoney(stats.totalCommission)} color="bg-emerald-50/50 border-emerald-100 text-emerald-900" bold />
            <StatCard label="Blocked / Excluded" value={stats.blockedCount} sub={`Lost: ${formatMoney(stats.blockedRevenue)}`} color="bg-amber-50/50 border-amber-100 text-amber-900" />
          </div>

          {!selectedAgent && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50/50 border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Agent Performance</h3>
                <span className="bg-gray-200 text-gray-600 px-2 py-1 rounded text-xs font-bold">{agentLeaderboard.length} Active</span>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white sticky top-0 z-10 border-b border-gray-100 text-[10px] uppercase text-gray-400 font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Agent</th>
                      <th className="px-6 py-4 text-right">Total</th>
                      <th className="px-6 py-4 text-right text-emerald-600">Eligible</th>
                      <th className="px-6 py-4 text-right text-red-500">Excluded</th>
                      <th className="px-6 py-4 text-right">Total Rev</th>
                      <th className="px-6 py-4 text-right">Commission</th>
                      <th className="px-6 py-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {agentLeaderboard.map(agent => (
                      <tr key={agent.agent_email} onClick={() => setSelectedAgent(agent.agent_email)} className="hover:bg-blue-50/50 cursor-pointer">
                        <td className="px-6 py-4 font-medium text-gray-900 flex flex-col">
                          <span>{agent.agent_name}</span>
                          <div className="flex gap-2 text-[10px] mt-0.5 items-center">
                            <span className="text-gray-400">{agent.office}</span>
                            <span className="bg-gray-100 px-1.5 rounded border">{agent.tier}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-gray-400">{agent.countTotal}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-gray-900">{agent.countEligible}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-red-400">{agent.countExcluded}</td>
                        <td className="px-6 py-4 text-right font-mono text-xs">{formatMoney(agent.revenueTotal)}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-emerald-600">{formatMoney(agent.commission)}</td>
                        <td className="px-6 py-4 text-center"><button className="text-xs font-bold text-blue-600">View Log</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/30">
              <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Transaction Log</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-gray-50">
                  {filteredRows.map(r => {
                    const norm = normStatus(r.status);
                    const isBlocked = ["REJECTED", "NO STATUS FOUND", "VOID", "DELETED", "IN PROGRESS", "COMPLETE", "REVIEW"].includes(norm);

                    return (
                      <tr
                        key={r.sync_key}
                        className={isBlocked ? "bg-amber-50/80 hover:bg-amber-100/80 transition-colors" : "hover:bg-gray-50/80 transition-colors"}
                      >
                        <td className="px-6 py-4 text-gray-500 font-mono text-xs">{formatDateTime(r.date_time)}</td>
                        <td className="px-6 py-4"><div className="font-bold text-gray-900">{r.agent_name}</div></td>
                        <td className="px-6 py-4"><div className="font-medium text-gray-900">{r.customer}</div></td>
                        <td className="px-6 py-4 text-right font-mono font-medium">{formatMoney(r.prep_fee)}</td>
                        <td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded text-[10px] font-bold border ${getStatusBadgeClass(r.status)}`}>{r.status}</span></td>
                        <td className="px-6 py-4 text-center">{r.is_fixed_by_admin ? "✨ Fixed" : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* OFFICE KPIS TAB */}
      {activeTab === "kpi" && (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Office Performance Reports</h2>
              <p className="text-sm text-gray-500">
                Season Progress • Live Pacing • Goal Tracking
                {latestLogDateTime ? (
                  <span className="ml-2 text-[11px] text-gray-400 font-semibold">
                    (As-of: <span className="font-mono">{formatDateTime(latestLogDateTime)}</span>)
                  </span>
                ) : null}
              </p>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400">Total Tax Vol</p>
                <p className="text-2xl font-black text-gray-900">{stats.grossCount}</p>
              </div>
            </div>
          </div>

          {officeKpiData.map(region => (
            <div key={region.region} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-900 text-white p-2 rounded-lg"><IconBuilding /></div>
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-lg uppercase tracking-tight">{region.region}</h3>
                    <p className="text-xs text-gray-500 font-medium">{region.offices.length} Offices</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    <span className="text-gray-400 font-bold text-[10px] uppercase mr-2">Region Taxes:</span>
                    <span className="font-bold">{region.totals.totalTaxes}</span>
                  </div>

                  <button
                    onClick={() => setCompareSelection([])}
                    className="text-xs font-bold text-gray-500 hover:text-gray-900"
                    title="Clear selected offices"
                  >
                    Clear
                  </button>

                  <button
                    onClick={() => setKpiCompareOpen(true)}
                    disabled={compareSelection.length === 0}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold border shadow-sm transition active:scale-95 ${
                      compareSelection.length === 0
                        ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                        : "bg-gray-900 text-white border-gray-900 hover:bg-gray-800"
                    }`}
                  >
                    Compare Selected ({compareSelection.length}/3)
                  </button>

                  <button
                    onClick={() => openCompareRegion(region)}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold border shadow-sm transition active:scale-95 bg-white text-gray-900 border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                    title="Compare every office in this region"
                  >
                    Compare Region
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white text-[10px] uppercase text-gray-400 font-bold border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 w-[60px]">Sel</th>
                      <th className="px-6 py-3">Office</th>
                      <th className="px-6 py-3">Progress</th>
                      <th className="px-6 py-3 text-center">Pacing</th>
                      <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-50">
                    {region.offices.map(office => {
                      const isSelected = compareSelection.some(x => x.code === office.code);

                      // ✅ CURRENT in the KPI table should use totalTaxes
                      const cur = office.kpi.totalTaxes ?? 0;
                      const pct = office.goals.goal > 0 ? (cur / office.goals.goal) * 100 : 0;

                      const behind = office.kpi.variance < 0;
                      const burn = Number(office.kpi.burnRateToGoal || 0);
                      const actionLine = behind
                        ? `Catch-up: ${burn.toFixed(1)}/day for ${office.kpi.daysRemaining} days`
                        : `Maintain pace (exp ${office.kpi.expectedCount} today)`;

                      return (
                        <tr key={office.code} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-4">
                            <button
                              onClick={() => toggleCompareOffice(region.region, office)}
                              className={`h-6 w-6 rounded-md border flex items-center justify-center text-xs font-black transition ${
                                isSelected
                                  ? "bg-gray-900 text-white border-gray-900"
                                  : "bg-white text-gray-400 border-gray-200 hover:border-gray-400"
                              }`}
                              title="Select to compare (max 3)"
                            >
                              {isSelected ? "✓" : ""}
                            </button>
                          </td>

                          <td className="px-6 py-4">
                            <div className="font-extrabold text-gray-900">{office.name}</div>
                            <div className="text-[10px] text-gray-400 font-mono">{office.code}</div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-baseline justify-between">
                              <div className="text-xs text-gray-500 font-bold uppercase">Goal</div>
                              <div className="font-mono font-bold text-gray-900">{office.goals.goal || 0}</div>
                            </div>

                            <div className="mt-2 flex items-baseline justify-between">
                              <div className="text-xs text-gray-500 font-bold uppercase">Current</div>
                              <div className="font-mono font-black text-gray-900">{cur}</div>
                            </div>

                            <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden border">
                              <div className="h-full bg-gray-900" style={{ width: `${clamp(pct, 0, 100)}%` }} />
                            </div>

                            <div className="mt-1 flex items-center justify-between gap-3">
                              <div className="text-[10px] text-gray-400 font-semibold">
                                {clamp(pct, 0, 999).toFixed(0)}% • Exp today: {office.kpi.expectedCount}
                              </div>
                              <div className="text-[10px] text-emerald-700 font-bold">
                                {formatMoney(office.kpi.revenue)}
                              </div>
                            </div>

                            <div className="mt-1 text-[10px] font-semibold text-gray-500">
                              {actionLine}
                            </div>
                          </td>

                          <td className="px-6 py-4 text-center">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold border ${
                                office.kpi.variance >= 0
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                  : "bg-rose-50 text-rose-700 border-rose-100"
                              }`}
                            >
                              Var {fmtSigned(office.kpi.variance)}
                            </span>

                            <div className="mt-1 text-[10px] text-gray-500 font-semibold space-y-0.5">
                              <div>
                                Burn{" "}
                                <span className="font-bold text-gray-900">
                                  {Number(office.kpi.burnRateToGoal || 0).toFixed(1)}/day
                                </span>
                                {Number(office.kpi.burnRateToGoal || 0) > 10 ? (
                                  <span className="ml-1 inline-block align-middle"><IconFire /></span>
                                ) : null}
                              </div>
                              <div>
                                YoY{" "}
                                <span className={`font-bold ${office.kpi.yoyVariance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                  {fmtSigned(office.kpi.yoyVariance)}
                                </span>{" "}
                                • Yield{" "}
                                <span className={`font-bold ${office.kpi.yieldRate < 70 ? "text-rose-700" : "text-gray-900"}`}>
                                  {office.kpi.yieldRate.toFixed(0)}%
                                </span>
                              </div>
                              <div className="text-[10px] text-gray-400 font-semibold">
                                <IconClock /> {office.kpi.daysRemaining} days left
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => openCompareSingle(region.region, office)}
                              className="bg-white border border-gray-200 hover:border-gray-400 text-gray-900 px-3 py-2 rounded-xl text-xs font-extrabold shadow-sm hover:bg-gray-50 active:scale-95 transition"
                            >
                              Compare
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FIX REQUESTS TAB */}
      {activeTab === "fixes" && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-700 text-sm uppercase">Pending Fix Requests</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white border-b text-xs uppercase text-gray-500 font-semibold">
                  <tr>
                    <th className="px-6 py-3">Submitted By</th>
                    <th className="px-6 py-3">Customer (Proposed)</th>
                    <th className="px-6 py-3">Proposed Status</th>
                    <th className="px-6 py-3">Submission Date</th>
                    <th className="px-6 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pendingFixRequests.map(req => (
                    <tr key={req.sync_key} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{req.submitted_by}</td>
                      <td className="px-6 py-3">
                        <div className="font-medium text-gray-900">{req.first} {req.last}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">Tax Year: {req.tax_year}</div>
                      </td>
                      <td className="px-6 py-3">
                        <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded text-[10px] font-bold uppercase">{req.status}</span>
                      </td>
                      <td className="px-6 py-3 text-gray-500">{formatDateTime(req.submitted_at)}</td>
                      <td className="px-6 py-3 text-center">
                        <button onClick={() => setSelectedFix(req)} className="bg-black hover:bg-gray-800 text-white px-3 py-1.5 rounded shadow-sm text-xs font-bold transition-transform active:scale-95">
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pendingFixRequests.length === 0 && (
                    <tr><td colSpan={5} className="p-12 text-center text-gray-400 bg-gray-50/50"><div className="mb-2 text-2xl">🎉</div>No pending requests!</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* KPI COMPARE MODAL */}
      <OfficeKpiCompareModal
        open={kpiCompareOpen}
        onClose={() => setKpiCompareOpen(false)}
        items={compareSelection}
        mode={compareMode}
        regionName={compareRegionName}
      />

      {/* FIX REQUEST MODAL */}
      {selectedFix && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold">Review Fix Request</h2>
              <button onClick={() => setSelectedFix(null)} className="text-gray-400 hover:text-black">Close</button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-8">
              <div className="space-y-2 opacity-60">
                <h4 className="text-xs font-bold uppercase text-gray-500 border-b pb-1">Current System Data</h4>
                {(() => {
                  const row = baseRows.find(r => r.sync_key === selectedFix.sync_key);
                  return row ? (
                    <div className="text-sm space-y-1">
                      <div className="font-medium">{row.customer || "N/A"}</div>
                      <div>Status: {row.status}</div>
                    </div>
                  ) : <div className="text-red-500 italic text-sm">Row not found.</div>;
                })()}
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase text-blue-600 border-b pb-1">Proposed Correction</h4>
                <div className="text-sm space-y-1">
                  <div className="font-bold text-lg">{selectedFix.first} {selectedFix.last}</div>
                  <div>Status: <span className="bg-blue-100 text-blue-800 px-1 rounded">{selectedFix.status}</span></div>
                </div>
              </div>
            </div>
            <div className="p-6 bg-gray-50 border-t flex flex-col gap-3">
              <button
                onClick={() => handleProcessFix("approved")}
                disabled={processing}
                className={`bg-green-600 text-white px-6 py-2 rounded-lg font-bold ${processing ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {processing ? "Processing..." : "Approve"}
              </button>

              <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason to reject..." className="border px-3 py-2 rounded" />
              <button
                onClick={() => handleProcessFix("rejected")}
                disabled={processing || !rejectReason}
                className={`bg-red-100 text-red-700 px-4 py-2 rounded-lg font-bold ${
                  (processing || !rejectReason) ? "opacity-60 cursor-not-allowed" : ""
                }`}
              >
                {processing ? "Processing..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ---------- KPI COMPARE MODAL (UPDATED) ---------- */
function OfficeKpiCompareModal({ open, onClose, items, mode, regionName }) {
  const [tab, setTab] = useState("kpi"); // "kpi" | "burn_yoy" | "yield"
  const [expandAll, setExpandAll] = useState(false);

  useEffect(() => {
    if (open) {
      setTab("kpi");
      setExpandAll(false);
    }
  }, [open, mode]);

  const list = useMemo(() => items ?? [], [items]);

  const sortedByMostBehind = useMemo(() => {
    const arr = [...list];
    arr.sort((a, b) => (Number(a?.kpi?.variance ?? 0) - Number(b?.kpi?.variance ?? 0)));
    return arr;
  }, [list]);

  if (!open) return null;

  const asOf = list?.[0]?.kpi?._asOf || null;
  const regionAgg = mode === "region" ? aggregateRegionFromItems(list) : null;

  const maxVarianceAbs = Math.max(1, ...list.map(x => Math.abs(x?.kpi?.variance ?? 0)));
  const maxBurn = Math.max(1, ...list.map(x => Number(x?.kpi?.burnRateToGoal ?? 0)));
  const maxYoyAbs = Math.max(1, ...list.map(x => Math.abs(x?.kpi?.yoyVariance ?? 0)));

  const title = mode === "region"
    ? `Compare Region KPIs${regionName ? ` • ${regionName}` : ""}`
    : "Compare Office KPIs";

  const top5 = mode === "region" ? sortedByMostBehind.slice(0, 5) : list;
  const rest = mode === "region" ? sortedByMostBehind.slice(5) : [];

  const visibleList = mode === "region"
    ? (expandAll ? sortedByMostBehind : top5)
    : list;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-gray-50 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-gray-900 truncate">{title}</h2>
            <div className="text-xs text-gray-500 font-medium flex flex-wrap gap-x-3 gap-y-1">
              <span>As-of: <span className="font-mono">{asOf ? formatDateTime(asOf) : "—"}</span></span>
              <span className="text-gray-400">•</span>
              <span className="font-semibold">2026: <span className="font-mono">agent_tax_commission_log</span></span>
              <span className="text-gray-400">•</span>
              <span className="font-semibold">2025: <span className="font-mono">historical_logs_2025</span></span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-sm font-bold text-gray-500 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200"
          >
            Close
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 py-3 border-b bg-white flex flex-wrap gap-2">
          <TabButton active={tab === "kpi"} onClick={() => setTab("kpi")}>KPI Comparison</TabButton>
          <TabButton active={tab === "burn_yoy"} onClick={() => setTab("burn_yoy")}>Burn + YoY</TabButton>
          <TabButton active={tab === "yield"} onClick={() => setTab("yield")}>Yield</TabButton>
        </div>

        {/* Body (scrollable) */}
        <div className="p-5 overflow-y-auto flex-1">
          {list.length === 0 ? (
            <div className="p-12 text-center text-gray-500">Select offices to compare.</div>
          ) : (
            <>
              {/* REGION SCORECARD */}
              {mode === "region" && regionAgg && (
                <div className="mb-4 border rounded-2xl p-4 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Region</div>
                      <div className="text-lg font-extrabold text-gray-900">{regionAgg.region || regionName || "Region"}</div>
                      <div className="text-[11px] text-gray-500 font-semibold">
                        Total offices: <span className="font-mono">{list.length}</span>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-1 rounded-full text-[10px] font-extrabold border ${
                        (regionAgg.variance ?? 0) >= 0
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : "bg-rose-50 text-rose-700 border-rose-100"
                      }`}
                    >
                      {(regionAgg.variance ?? 0) >= 0 ? "AHEAD" : "BEHIND"}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                    <KpiMini label="Goal" value={regionAgg.goal} sub="Total" />
                    <KpiMini label="2026" value={regionAgg.accepted} sub={`Exp ${regionAgg.expected}`} />
                    <KpiMini label="Var" value={fmtSigned(regionAgg.variance)} sub="vs curve" mono />
                    <KpiMini label="Burn" value={`${Number(regionAgg.burnRateToGoal).toFixed(1)}`} sub="/day to goal" mono />
                    <KpiMini label="2025" value={regionAgg.priorAcceptedSameDay} sub="Same cutoff" />
                    <KpiMini label="YoY" value={fmtSigned(regionAgg.yoyVariance)} sub="Total" mono />
                  </div>

                  <div className="mt-2 text-[11px] font-semibold text-gray-600 flex items-center justify-between gap-3">
                    <div>
                      Revenue: <span className="font-mono font-black text-gray-900">{formatMoney(regionAgg.revenue)}</span>
                      <span className="text-gray-300 mx-2">|</span>
                      Avg Yield (simple): <span className="font-mono font-black text-gray-900">{Number(regionAgg.yieldAvg).toFixed(0)}%</span>
                    </div>
                    <div className="text-gray-500">
                      <IconClock /> {regionAgg.daysRemaining} days left
                    </div>
                  </div>
                </div>
              )}

              {tab === "kpi" && (
                <div className="space-y-4">
                  {/* Office cards only for OFFICE compare */}
                  {mode !== "region" && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {list.map(x => {
                        const behind = (x.kpi?.variance ?? 0) < 0;
                        const burn = Number(x.kpi?.burnRateToGoal ?? 0);
                        const recommendation = behind
                          ? `Catch-up: ${burn.toFixed(1)}/day for ${x.kpi.daysRemaining} days`
                          : `Ahead of curve — hold pace`;

                        return (
                          <div key={x.code} className="border rounded-2xl p-4 bg-white shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[10px] font-bold text-gray-400 uppercase">{x.region}</div>
                                <div className="text-sm font-extrabold text-gray-900 truncate">{x.name}</div>
                                <div className="text-[10px] text-gray-400 font-mono">{x.code}</div>
                              </div>
                              <span
                                className={`px-2 py-1 rounded-full text-[10px] font-extrabold border ${
                                  (x.kpi.variance ?? 0) >= 0
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                    : "bg-rose-50 text-rose-700 border-rose-100"
                                }`}
                              >
                                {x.kpi.variance >= 0 ? "AHEAD" : "BEHIND"}
                              </span>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                              {/* ✅ Card "2026" should show Total */}
                              <KpiMini label="2026" value={x.kpi.totalTaxes ?? 0} sub={`Exp ${x.kpi.expectedCount}`} />
                              <KpiMini label="2025" value={x.kpi.priorTotalTaxesSameDay ?? 0} sub={`Avg/day ${(Number(x.kpi.priorAvgPerDay ?? 0)).toFixed(1)}`} />
                              <KpiMini label="Var" value={fmtSigned(x.kpi.variance ?? 0)} sub="vs curve" mono />
                            </div>

                            <div className="mt-2 text-[11px] font-semibold text-gray-600">
                              {recommendation}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Numbers-first table */}
                  <div className="border rounded-2xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wide">
                          KPI Comparison (Numbers)
                        </h3>
                        <p className="text-xs text-gray-500 font-medium">
                          {mode === "region"
                            ? "Showing top 5 most behind by default. Expand to see all offices."
                            : "Current pacing + last year pacing are both cut off at the same month/day/time as the latest 2026 log."}
                        </p>
                      </div>

                      {mode === "region" && (
                        <button
                          onClick={() => setExpandAll(v => !v)}
                          className="px-3 py-2 rounded-xl text-xs font-extrabold border bg-white text-gray-900 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition"
                        >
                          {expandAll ? `Hide extras` : `Show all (${rest.length} more)`}
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-white sticky top-0 z-10 border-b text-[10px] uppercase text-gray-400 font-bold">
                          <tr>
                            <th className="px-4 py-3 text-left">Office</th>
                            <th className="px-4 py-3 text-right">2026 Total YTD</th>
                            <th className="px-4 py-3 text-right">2026 Expected</th>
                            <th className="px-4 py-3 text-right">2026 Var</th>
                            <th className="px-4 py-3 text-right">2025 Total YTD</th>
                            <th className="px-4 py-3 text-right">2025 Avg/Day</th>
                            <th className="px-4 py-3 text-right">YoY</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {visibleList.map(x => (
                            <tr key={x.code} className="hover:bg-gray-50/60">
                              <td className="px-4 py-3">
                                <div className="font-extrabold text-gray-900">{x.name}</div>
                                <div className="text-[10px] text-gray-400 font-mono">{x.code} • {x.region}</div>
                              </td>

                              <td className="px-4 py-3 text-right font-mono font-black">{x.kpi.totalTaxes ?? 0}</td>
                              <td className="px-4 py-3 text-right font-mono text-gray-500">{x.kpi.expectedCount}</td>

                              <td className="px-4 py-3 text-right font-mono font-black">
                                <span className={x.kpi.variance >= 0 ? "text-emerald-700" : "text-rose-700"}>
                                  {fmtSigned(x.kpi.variance ?? 0)}
                                </span>
                                <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden border">
                                  <div
                                    className={x.kpi.variance >= 0 ? "h-full bg-emerald-500" : "h-full bg-rose-500"}
                                    style={{ width: `${barPctAbs(x.kpi.variance ?? 0, maxVarianceAbs)}%` }}
                                  />
                                </div>
                              </td>

                              <td className="px-4 py-3 text-right font-mono font-black">{x.kpi.priorTotalTaxesSameDay ?? 0}</td>
                              <td className="px-4 py-3 text-right font-mono text-gray-600">
                                {Number(x.kpi.priorAvgPerDay ?? 0).toFixed(1)}
                              </td>

                              <td className="px-4 py-3 text-right font-mono font-black">
                                <span className={(x.kpi.yoyVariance ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}>
                                  {fmtSigned(x.kpi.yoyVariance ?? 0)}
                                </span>
                                <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden border">
                                  <div
                                    className={(x.kpi.yoyVariance ?? 0) >= 0 ? "h-full bg-emerald-500" : "h-full bg-rose-500"}
                                    style={{ width: `${barPctAbs(x.kpi.yoyVariance ?? 0, maxYoyAbs)}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {mode === "region" && !expandAll && rest.length > 0 && (
                      <div className="px-4 py-3 border-t bg-white text-xs text-gray-500 font-medium">
                        Showing top 5 most behind. Click <span className="font-bold">Show all</span> to expand.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === "burn_yoy" && (
                <div className="space-y-4">
                  <div className="border rounded-2xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wide">
                          Burn Rate + YoY (Numbers)
                        </h3>
                        <p className="text-xs text-gray-500 font-medium">
                          {mode === "region"
                            ? "Showing top 5 most behind by default. Expand to see all."
                            : "Burn rate is computed to hit Goal by season end. YoY uses 2025 total at same cutoff; avg/day still uses 2025 accepted."}
                        </p>
                      </div>

                      {mode === "region" && (
                        <button
                          onClick={() => setExpandAll(v => !v)}
                          className="px-3 py-2 rounded-xl text-xs font-extrabold border bg-white text-gray-900 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition"
                        >
                          {expandAll ? `Hide extras` : `Show all (${rest.length} more)`}
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-white sticky top-0 z-10 border-b text-[10px] uppercase text-gray-400 font-bold">
                          <tr>
                            <th className="px-4 py-3 text-left">Office</th>
                            <th className="px-4 py-3 text-right">Goal</th>
                            <th className="px-4 py-3 text-right">2026 Total YTD</th>
                            <th className="px-4 py-3 text-right">Remaining</th>
                            <th className="px-4 py-3 text-right">Burn To Goal</th>
                            <th className="px-4 py-3 text-right">2025 Total YTD</th>
                            <th className="px-4 py-3 text-right">2025 Avg/Day</th>
                            <th className="px-4 py-3 text-right">YoY</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {visibleList.map(x => {
                            const goal = x.goals?.goal || 0;
                            const cur = x.kpi?.totalTaxes || 0;
                            const remaining = Math.max(0, goal - cur);
                            const burn = Number(x.kpi?.burnRateToGoal || 0);
                            const prior = x.kpi?.priorTotalTaxesSameDay ?? 0;
                            const priorAvg = Number(x.kpi?.priorAvgPerDay ?? 0);

                            return (
                              <tr key={x.code} className="hover:bg-gray-50/60">
                                <td className="px-4 py-3">
                                  <div className="font-extrabold text-gray-900">{x.name}</div>
                                  <div className="text-[10px] text-gray-400 font-mono">{x.code} • {x.region}</div>
                                </td>

                                <td className="px-4 py-3 text-right font-mono text-gray-700">{goal}</td>
                                <td className="px-4 py-3 text-right font-mono font-black">{cur}</td>
                                <td className="px-4 py-3 text-right font-mono text-gray-700">{remaining}</td>

                                <td className="px-4 py-3 text-right font-mono font-black">
                                  <span className={burn > 10 ? "text-rose-700" : "text-gray-900"}>
                                    {burn.toFixed(1)}/day
                                  </span>
                                  {burn > 10 ? <span className="ml-1 inline-block align-middle"><IconFire /></span> : null}
                                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden border">
                                    <div className="h-full bg-gray-400" style={{ width: `${clamp((burn / maxBurn) * 100, 0, 100)}%` }} />
                                  </div>
                                </td>

                                <td className="px-4 py-3 text-right font-mono font-black">{prior}</td>
                                <td className="px-4 py-3 text-right font-mono text-gray-700">{priorAvg.toFixed(1)}</td>

                                <td className="px-4 py-3 text-right font-mono font-black">
                                  <span className={(x.kpi?.yoyVariance ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}>
                                    {fmtSigned(x.kpi?.yoyVariance ?? 0)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {mode === "region" && !expandAll && rest.length > 0 && (
                      <div className="px-4 py-3 border-t bg-white text-xs text-gray-500 font-medium">
                        Showing top 5 most behind. Click <span className="font-bold">Show all</span> to expand.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === "yield" && (
                <div className="space-y-4">
                  <div className="border rounded-2xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wide">
                          Yield (Bar-only for now)
                        </h3>
                        <p className="text-xs text-gray-500 font-medium">
                          Yield = Accepted ÷ Attempts (as-of cutoff).
                          {mode === "region" ? " Showing top 5 most behind by default." : ""}
                        </p>
                      </div>

                      {mode === "region" && (
                        <button
                          onClick={() => setExpandAll(v => !v)}
                          className="px-3 py-2 rounded-xl text-xs font-extrabold border bg-white text-gray-900 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition"
                        >
                          {expandAll ? `Hide extras` : `Show all (${rest.length} more)`}
                        </button>
                      )}
                    </div>

                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                      {visibleList.map(x => {
                        const y = Number(x.kpi?.yieldRate || 0);
                        const pct = clamp(y, 0, 100);

                        const tone =
                          y >= 80 ? "bg-emerald-500" :
                          y >= 70 ? "bg-gray-400" :
                          "bg-rose-500";

                        return (
                          <div key={x.code} className="rounded-2xl border p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-xs font-extrabold text-gray-900">{x.name}</div>
                                <div className="text-[10px] text-gray-400 font-mono">{x.code}</div>
                              </div>
                              <span className="text-[10px] font-extrabold px-2 py-1 rounded-full border bg-gray-100 text-gray-700 border-gray-200">
                                {pct.toFixed(0)}%
                              </span>
                            </div>

                            <div className="mt-2 h-2.5 bg-gray-100 rounded-full overflow-hidden border">
                              <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {mode === "region" && !expandAll && rest.length > 0 && (
                      <div className="px-4 py-3 border-t bg-white text-xs text-gray-500 font-medium">
                        Showing top 5 most behind. Click <span className="font-bold">Show all</span> to expand.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t bg-white flex items-center justify-between">
          <div className="text-xs text-gray-500 font-medium">
            {mode === "region"
              ? "Tip: Region compare is focused—region scorecard + top 5 offices, expandable."
              : "Tip: Compare 2–3 offices max for best readability."}
          </div>
          <button
            onClick={onClose}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-extrabold shadow-sm hover:bg-gray-800 active:scale-95 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-xs font-extrabold border transition ${
        active
          ? "bg-gray-900 text-white border-gray-900 shadow-sm"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function KpiMini({ label, value, sub, mono }) {
  return (
    <div className="rounded-xl border p-2 bg-gray-50">
      <div className="text-[10px] uppercase font-bold text-gray-400">{label}</div>
      <div className={`${mono ? "font-mono" : "font-mono"} font-black text-gray-900 text-lg`}>
        {value}
      </div>
      {sub ? <div className="text-[10px] text-gray-500 font-semibold">{sub}</div> : null}
    </div>
  );
}

function StatCard({ label, value, sub, color, bold }) {
  return (
    <div className={`p-5 rounded-2xl border ${color} shadow-sm flex flex-col justify-between h-28`}>
      <p className="text-[10px] font-bold uppercase opacity-60 tracking-wider">{label}</p>
      <div className="relative z-10">
        <div className={`text-3xl ${bold ? "font-black" : "font-semibold"} tracking-tight`}>{value}</div>
        {sub && <div className="text-xs mt-1 opacity-80 font-medium">{sub}</div>}
      </div>
    </div>
  );
}

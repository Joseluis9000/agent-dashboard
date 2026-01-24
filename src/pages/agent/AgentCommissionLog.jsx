// src/pages/agent/AgentCommissionLog.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAuth } from "../../AuthContext";

/**
 * ==========================================
 * FIESTA TAX COMMISSION CONFIGURATION
 * ==========================================
 */

const PRE_ACK_FEE = 79.90; // Deduction per Pre-Ack return

// ✅ UPDATED TIERS (Matches your Screenshot)
const COMMISSION_TIERS = [
  // Tier A: 0-49 returns | 30% Corp Fee | 7.5% or 10% payout
  { min: 0, max: 49, label: "Tier A (0-49)", corpRate: 0.30, baseRate: 0.075, highRate: 0.10 },

  // Tier B: 50-99 returns | 30% Corp Fee | 7.5% or 10% payout
  { min: 50, max: 99, label: "Tier B (50-99)", corpRate: 0.30, baseRate: 0.075, highRate: 0.10 },

  // Tier C: 100-199 returns | 25% Corp Fee | 10% or 12.5% payout
  { min: 100, max: 199, label: "Tier C (100-199)", corpRate: 0.25, baseRate: 0.10, highRate: 0.125 },

  // Tier D: 200-349 returns | 20% Corp Fee | 12.5% or 15% payout
  { min: 200, max: 349, label: "Tier D (200-349)", corpRate: 0.20, baseRate: 0.125, highRate: 0.15 },

  // Tier E: 350+ returns | 20% Corp Fee | 20% payout (Flat)
  { min: 350, max: 9999, label: "Tier E (350+)", corpRate: 0.20, baseRate: 0.20, highRate: 0.20 },
];

const MODAL_STATUS_OPTIONS = [
  "Accepted",
  "Complete",
  "In Progress",
  "NO STATUS FOUND",
  "Paper",
  "Rejected",
  "Review",
  "Transmitted",
];

const TAX_YEAR_OPTIONS_MODAL = ["2025", "2024", "2023", "2022", "2021", "2020"];

const REFERRAL_OPTIONS = ["20", "25", "50"];

// Statuses that are COMPLETELY EXCLUDED from the commission calculation
const BLOCKED_STATUSES = new Set([
  "NO STATUS FOUND",
  "REJECTED",
  "COMPLETE",
  "REVIEW",
  "IN PROGRESS",
]);

// ==========================================
// HELPERS
// ==========================================

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(n)
  );
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function normalizeBoolSelect(v) {
  if (v === "") return null;
  if (v === "yes") return true;
  if (v === "no") return false;
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function normStatus(s) {
  return String(s ?? "").trim().toUpperCase();
}

function getDisplayStatus(r) {
  return r.status ?? "";
}

function isCountsTowardCommission(r) {
  const s = normStatus(getDisplayStatus(r));
  return !BLOCKED_STATUSES.has(s);
}

// ✅ HELPER FOR STATUS COLORS
function getStatusBadgeClass(status) {
  const s = normStatus(status);
  switch (s) {
    case "ACCEPTED":
    case "TRANSMITTED":
      return "bg-green-100 text-green-800";
    case "COMPLETE":
      return "bg-teal-100 text-teal-800";
    case "IN PROGRESS":
      return "bg-blue-100 text-blue-800";
    case "PAPER":
      return "bg-stone-100 text-stone-700";
    case "REJECTED":
      return "bg-red-100 text-red-800";
    case "REVIEW":
      return "bg-purple-100 text-purple-800";
    case "NO STATUS FOUND":
      return "bg-red-50 text-red-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function Field({ label, value, onChange, placeholder, type = "text", options = [] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      {type === "select" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
        >
          <option value="" disabled>Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
        />
      )}
    </div>
  );
}

export default function AgentCommissionLog() {
  const { supabaseClient: supabase, user } = useAuth();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [taxYear, setTaxYear] = useState("all");
  const [status, setStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [search, setSearch] = useState("");

  // Draft edits & Fix Status
  const [draft, setDraft] = useState({});
  const [fixStatusByKey, setFixStatusByKey] = useState({});
  const saveTimers = useMemo(() => new Map(), []);

  // Modal State
  const [fixOpen, setFixOpen] = useState(false);
  const [fixForRow, setFixForRow] = useState(null);
  const [fixSubmitting, setFixSubmitting] = useState(false);
  const [fixError, setFixError] = useState("");
  const [fixForm, setFixForm] = useState({
    tax_year: "",
    last4: "",
    first: "",
    last: "",
    phone: "",
    preparer: "",
    status: "",
    office: "",
  });

  const didInitDefaultFilters = useRef(false);

  const userEmail =
    user?.email ||
    user?.user_metadata?.email ||
    (() => {
      try {
        return localStorage.getItem("userEmail") || "";
      } catch {
        return "";
      }
    })();

  // ==========================================
  // DATA ACCESSORS
  // ==========================================

  // ✅ Wrapped in useCallback to stabilize reference for useMemo
  const getRowValue = useCallback((r, key) => {
    const d = draft[r.sync_key];
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    return r[key];
  }, [draft]);

  function setRowDraft(sync_key, patch) {
    setDraft((prev) => ({
      ...prev,
      [sync_key]: { ...(prev[sync_key] ?? {}), ...patch },
    }));
  }

  function getIsWire(r) {
    const pm = String(getRowValue(r, "payment_method") ?? "").toLowerCase();
    return pm.includes("wire");
  }

  function getWireRequired(r) {
    const isWire = getIsWire(r);
    if (!isWire) return false;
    const wireFunded = getRowValue(r, "wire_rac_funded");
    return wireFunded === null || wireFunded === undefined;
  }

  // ==========================================
  // API CALLS
  // ==========================================

  async function fetchFixStatuses(syncKeys) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("tax_commission_fix_requests")
        .select("sync_key, admin_status")
        .in("sync_key", syncKeys);

      if (error) return;

      const map = {};
      for (const r of data ?? []) {
        map[r.sync_key] = r.admin_status;
      }
      setFixStatusByKey(map);
    } catch {
      // ignore
    }
  }

  async function fetchRows() {
    if (!supabase) return;
    if (!userEmail) {
      console.warn("[commission] No user email available; cannot filter.");
      return;
    }

    setLoading(true);
    setFixError("");

    let q = supabase
      .from("agent_tax_commission_log")
      .select(
        [
          "sync_key",
          "agent_email",
          "date_time",
          "office_code",
          "cust_id",
          "customer",
          "payment_method",
          "tax_year:receipt_maxtax_year",
          "status:receipt_maxtax_status",
          "prep_fee:charged",
          "last4",
          "first",
          "last",
          "phone",
          "preparer",
          "office_full",
          "record_number",
          "receipt",
        ].join(",")
      )
      .eq("agent_email", userEmail)
      .order("date_time", { ascending: false })
      .limit(750);

    if (taxYear !== "all") q = q.eq("receipt_maxtax_year", taxYear);
    if (status !== "all") q = q.eq("receipt_maxtax_status", status);
    if (paymentMethod !== "all") q = q.ilike("payment_method", `%${paymentMethod}%`);

    const { data: baseRows, error: baseErr } = await q;

    if (baseErr) {
      console.error("[commission] base fetch error:", baseErr);
      setRows([]);
      setDraft({});
      setLoading(false);
      return;
    }

    const list = baseRows ?? [];
    const keys = list.map((r) => r.sync_key).filter(Boolean);

    // Pull annotations
    let annMap = {};
    if (keys.length) {
      const { data: anns, error: annErr } = await supabase
        .from("tax_commission_annotations")
        .select("sync_key, pre_ack_advance, referral_paid_out, wire_rac_funded, notes, updated_at")
        .in("sync_key", keys);

      if (!annErr) {
        annMap = Object.fromEntries((anns ?? []).map((a) => [a.sync_key, a]));
      }
    }

    const merged = list.map((r) => ({
      ...r,
      ...(annMap[r.sync_key] ?? {}),
    }));

    setRows(merged);
    setDraft({});

    if (keys.length) fetchFixStatuses(keys);

    if (!didInitDefaultFilters.current) {
      didInitDefaultFilters.current = true;
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userEmail, taxYear, status, paymentMethod]);

  // ==========================================
  // FILTERING & CALCULATION LOGIC
  // ==========================================

  const visibleRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      return (
        String(r.customer ?? "").toLowerCase().includes(s) ||
        String(r.office_code ?? "").toLowerCase().includes(s) ||
        String(r.cust_id ?? "").toLowerCase().includes(s) ||
        String(r.sync_key ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, search]);

  const taxYearOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.tax_year).filter(Boolean));
    return ["all", ...Array.from(set).sort().reverse()];
  }, [rows]);

  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.status).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  const paymentOptions = ["all", "Wire", "Credit Card", "Cash", "RAC"];

  // ✅ FIESTA TAX CALCULATION ENGINE
  const stats = useMemo(() => {
    const eligible = [];
    let blockedCount = 0;
    let blockedRevenue = 0;
    const blockedReasonCounts = {};

    // 1. Filter and separate blocked rows
    for (const r of visibleRows) {
      const fee = Number(r.prep_fee) || 0;
      
      if (isCountsTowardCommission(r)) {
        eligible.push(r);
      } else {
        blockedCount++;
        blockedRevenue += fee;
        const s = normStatus(getDisplayStatus(r));
        blockedReasonCounts[s] = (blockedReasonCounts[s] || 0) + 1;
      }
    }

    // 2. Aggregate ELIGIBLE Data Only
    let totalRevenue = 0; // "Eligible Gross"
    let preAckCount = 0;
    let totalReferralFees = 0;

    eligible.forEach(r => {
      const fee = Number(r.prep_fee) || 0;
      totalRevenue += fee;

      const isPreAck = normalizeBoolSelect(getRowValue(r, "pre_ack_advance"));
      if (isPreAck) preAckCount++;

      const refVal = getRowValue(r, "referral_paid_out");
      const refAmount = Number(refVal);
      if (!Number.isNaN(refAmount) && refAmount > 0) {
        totalReferralFees += refAmount;
      }
    });

    const taxesFiled = eligible.length;
    const avgFee = taxesFiled > 0 ? totalRevenue / taxesFiled : 0;

    // 3. Deductions
    const totalPreAckFees = preAckCount * PRE_ACK_FEE;
    
    // 4. Revenue After Deductions (Adjusted Gross)
    const revenueAfterDeductions = totalRevenue - totalPreAckFees - totalReferralFees;

    // 5. Determine Tier based on COUNT
    const activeTier = COMMISSION_TIERS.find(t => taxesFiled >= t.min && taxesFiled <= t.max) || COMMISSION_TIERS[0];
    const corpFeeRate = activeTier.corpRate;

    // 6. Corporate Fee
    const corporateFee = revenueAfterDeductions * corpFeeRate;

    // 7. Net Commission Base
    const commissionBase = revenueAfterDeductions - corporateFee;

    // 8. Determine Rate
    const commissionRate = avgFee >= 250 ? activeTier.highRate : activeTier.baseRate;

    // 9. Initial Earned Commission
    const earnedCommission = commissionBase * commissionRate;

    // 10. ✅ BONUS & GUARANTEE LOGIC
    let volumeBonus = 0;
    if (taxesFiled >= 300) {
        volumeBonus = 1000.00;
    }

    let guaranteeAdjustment = 0;
    const isRookieEligible = taxesFiled >= 150 && avgFee >= 225.00;
    
    if (isRookieEligible) {
        const avgCommissionPerReturn = taxesFiled > 0 ? earnedCommission / taxesFiled : 0;
        const valueOfFirst150 = avgCommissionPerReturn * 150;

        if (valueOfFirst150 < 5000) {
            guaranteeAdjustment = 5000.00 - valueOfFirst150;
        }
    }

    const totalCommission = earnedCommission + volumeBonus + guaranteeAdjustment;

    // ✅ DETECT IF IN TIER A (0-49) TO SHOW WARNING
    const isTierA = taxesFiled < 50;

    return {
      taxesFiled,
      blockedCount,
      blockedRevenue,
      blockedReasons: Object.entries(blockedReasonCounts)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", "),
      totalRevenue,
      avgFee,
      preAckCount,
      totalPreAckFees,
      totalReferralFees,
      revenueAfterDeductions,
      tierLabel: activeTier.label,
      corpFeeRate,
      corporateFee,
      commissionBase,
      commissionRate,
      earnedCommission,
      volumeBonus,
      guaranteeAdjustment,
      isRookieEligible,
      totalCommission,
      isTierA // Export this for UI logic
    };
  }, [visibleRows, getRowValue]); // ✅ Fixed dependency: draft is implied by getRowValue


  // ==========================================
  // ACTIONS
  // ==========================================

  async function upsertAnnotation(sync_key) {
    if (!supabase) return;

    const base = rows.find((x) => x.sync_key === sync_key);
    const d = draft[sync_key] ?? {};

    const payment_method = String(d.payment_method ?? base?.payment_method ?? "");
    const isWire = payment_method.toLowerCase().includes("wire");
    const wire_rac_funded = d.wire_rac_funded ?? base?.wire_rac_funded ?? null;

    if (isWire && (wire_rac_funded === null || wire_rac_funded === undefined)) {
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData?.session?.user?.email ?? userEmail ?? null;

    const payload = {
      sync_key,
      pre_ack_advance: d.pre_ack_advance ?? base?.pre_ack_advance ?? null,
      referral_paid_out: d.referral_paid_out ?? base?.referral_paid_out ?? null,
      wire_rac_funded,
      notes: d.notes ?? base?.notes ?? null,
      updated_by: email,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("tax_commission_annotations")
      .upsert(payload, { onConflict: "sync_key" });

    if (error) {
      console.error("[commission] save failed:", error);
      return;
    }

    setRows((prev) => prev.map((r) => (r.sync_key === sync_key ? { ...r, ...payload } : r)));
  }

  function queueSave(sync_key) {
    const existing = saveTimers.get(sync_key);
    if (existing) clearTimeout(existing);

    const t = setTimeout(() => {
      upsertAnnotation(sync_key);
      saveTimers.delete(sync_key);
    }, 650);

    saveTimers.set(sync_key, t);
  }

  function openFixModal(row) {
    setFixError("");
    setFixForRow(row);
    setFixOpen(true);

    setFixForm({
      tax_year: row?.tax_year ?? "",
      last4: row?.last4 ?? "",
      first: row?.first ?? "",
      last: row?.last ?? "",
      phone: row?.phone ?? "",
      preparer: row?.preparer ?? "",
      status: row?.status ?? "",
      office: row?.office_full ?? row?.office_code ?? "",
    });
  }

  function closeFixModal() {
    setFixOpen(false);
    setFixForRow(null);
    setFixSubmitting(false);
    setFixError("");
  }

  async function submitFixRequest() {
    if (!supabase || !fixForRow?.sync_key) return;

    const clean = {
      tax_year: String(fixForm.tax_year ?? "").trim(),
      last4: String(fixForm.last4 ?? "").trim(),
      first: String(fixForm.first ?? "").trim(),
      last: String(fixForm.last ?? "").trim(),
      phone: String(fixForm.phone ?? "").trim(),
      preparer: String(fixForm.preparer ?? "").trim(),
      status: String(fixForm.status ?? "").trim(),
      office: String(fixForm.office ?? "").trim(),
    };

    if (!clean.tax_year || !clean.last4 || !clean.first || !clean.last) {
      setFixError("Please fill at least: TAX YEAR, LAST4, FIRST, LAST.");
      return;
    }

    setFixSubmitting(true);
    setFixError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData?.session?.user?.email ?? userEmail ?? null;

      const payload = {
        sync_key: fixForRow.sync_key,
        submitted_by: email,
        tax_year: clean.tax_year,
        last4: clean.last4,
        first: clean.first,
        last: clean.last,
        phone: clean.phone || null,
        preparer: clean.preparer || null,
        status: clean.status || "NO STATUS FOUND",
        office: clean.office || null,
        admin_status: "pending",
        submitted_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("tax_commission_fix_requests")
        .upsert(payload, { onConflict: "sync_key" });

      if (error) throw error;

      setFixStatusByKey((prev) => ({ ...prev, [fixForRow.sync_key]: "pending" }));
      closeFixModal();
    } catch (e) {
      console.error(e);
      setFixError(e.message || "Unexpected error submitting fix request.");
      setFixSubmitting(false);
    }
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Commission Log</h1>
          <p className="text-sm text-gray-600">
            Filtered by: <b>{userEmail}</b>
          </p>
        </div>

        <button
          onClick={fetchRows}
          className="rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
        >
          Refresh Data
        </button>
      </div>

      {/* ✅ DETAILED CALCULATION SUMMARY CARD */}
      <div className="mb-4 rounded-2xl border bg-gray-900 text-white shadow-md overflow-hidden">
        <div className="bg-gray-800 px-6 py-4 border-b border-gray-700 flex justify-between items-center">
            <h2 className="text-sm font-medium uppercase tracking-wider text-gray-300">
              Estimated Commission Breakdown
            </h2>
            <div className="flex items-center gap-3">
               {stats.volumeBonus > 0 && (
                   <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wide animate-pulse">
                       +$1k Bonus Active!
                   </span>
               )}
               {stats.guaranteeAdjustment > 0 && (
                   <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wide animate-pulse">
                       Rookie Guarantee Active
                   </span>
               )}
               <div className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">
                   Tier: <span className="text-white font-bold">{stats.tierLabel}</span>
               </div>
            </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            
            {/* COLUMN 1: GROSS */}
            <div>
                <p className="text-xs text-gray-400 uppercase">1. Eligible Revenue</p>
                <p className="text-2xl font-bold">{formatMoney(stats.totalRevenue)}</p>
                <div className="mt-2 text-xs text-gray-500">
                    {stats.taxesFiled} Taxes Filed <br/>
                    Avg Fee: {formatMoney(stats.avgFee)}
                </div>
            </div>

            {/* COLUMN 2: DEDUCTIONS */}
            <div>
                <p className="text-xs text-gray-400 uppercase">2. Deductions</p>
                <div className="mt-1 space-y-1 text-xs text-gray-300">
                    <div className="flex justify-between">
                        <span>Pre-Ack ({stats.preAckCount} x {PRE_ACK_FEE}):</span>
                        <span className="text-red-400">-{formatMoney(stats.totalPreAckFees)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Referrals (Var):</span>
                        <span className="text-red-400">-{formatMoney(stats.totalReferralFees)}</span>
                    </div>
                    <div className="pt-1 border-t border-gray-700 flex justify-between font-semibold">
                        <span>Adj. Rev:</span>
                        <span>{formatMoney(stats.revenueAfterDeductions)}</span>
                    </div>
                </div>
            </div>

            {/* COLUMN 3: CORP & BASE */}
            <div>
                <p className="text-xs text-gray-400 uppercase">3. Commission Base</p>
                <div className="mt-1 space-y-1 text-xs text-gray-300">
                    <div className="flex justify-between">
                        <span>Corp Fee ({(stats.corpFeeRate * 100).toFixed(0)}%):</span>
                        <span className="text-red-400">-{formatMoney(stats.corporateFee)}</span>
                    </div>
                    <div className="pt-1 border-t border-gray-700 flex justify-between font-semibold text-white text-sm">
                        <span>Net Base:</span>
                        <span>{formatMoney(stats.commissionBase)}</span>
                    </div>
                </div>
            </div>

             {/* COLUMN 4: FINAL */}
             <div className="bg-emerald-900/20 -m-2 p-4 rounded-xl border border-emerald-900/50 flex flex-col justify-between">
                <div>
                    <p className="text-xs text-emerald-400 uppercase font-semibold">4. Commission Payout</p>
                    <p className="text-3xl font-bold text-emerald-400 mt-1">{formatMoney(stats.totalCommission)}</p>
                    <div className="mt-2 text-xs text-emerald-200/70">
                        Rate: <b>{(stats.commissionRate * 100).toFixed(2)}%</b> applied to Base
                    </div>
                </div>

                {/* ✅ TIER A WARNING */}
                {stats.isTierA && (
                  <div className="mt-3 bg-red-500/20 border border-red-500/50 p-2 rounded text-[10px] text-red-200">
                    <strong>⚠️ No Payout</strong>
                    <p>Returns 0-49 do not qualify for commission. Amount shown is potential only.</p>
                  </div>
                )}

                {/* BONUS DETAILS */}
                {(stats.volumeBonus > 0 || stats.guaranteeAdjustment > 0) && (
                    <div className="mt-3 pt-3 border-t border-emerald-800/30 text-[10px] space-y-1 text-emerald-100">
                        {stats.volumeBonus > 0 && (
                            <div className="flex justify-between">
                                <span>Performance Bonus (300+):</span>
                                <span>+{formatMoney(stats.volumeBonus)}</span>
                            </div>
                        )}
                        {stats.guaranteeAdjustment > 0 && (
                            <div className="flex justify-between">
                                <span>Rookie Guarantee Top-Up:</span>
                                <span>+{formatMoney(stats.guaranteeAdjustment)}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* ✅ ALERT: EXCLUDED ROWS WITH REVENUE SUM */}
      {stats.blockedCount > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-lg">⚠️</div>
            <div>
              <p className="font-semibold text-sm">
                {stats.blockedCount} tax returns are NOT counted toward commission.
              </p>
              <p className="text-xs mt-1 opacity-90">
                These rows are excluded from the totals above. <br/>
                <b>Excluded Revenue: {formatMoney(stats.blockedRevenue)}</b> <br/>
                Reason: Status is {stats.blockedReasons}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, office, cust id..."
            className="h-10 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Tax Year</label>
          <select
            value={taxYear}
            onChange={(e) => setTaxYear(e.target.value)}
            className="h-10 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          >
            {taxYearOptions.map((y) => (
              <option key={y} value={y}>
                {y === "all" ? "All" : y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All" : s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Payment</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="h-10 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          >
            {paymentOptions.map((p) => (
              <option key={p} value={p}>
                {p === "all" ? "All" : p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1500px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr className="border-b text-xs text-gray-600">
                <th className="px-4 py-3 font-semibold">Date/Time</th>
                <th className="px-4 py-3 font-semibold">Office</th>
                <th className="px-4 py-3 font-semibold">Cust ID</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Prep Fee</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold">Return Year</th>
                <th className="px-4 py-3 font-semibold">Counts?</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Fix</th>
                <th className="px-4 py-3 font-semibold">Pre-Ack Advance?</th>
                <th className="px-4 py-3 font-semibold">Referral Paid Out?</th>
                <th className="px-4 py-3 font-semibold">Wire/RAC Funded?</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-gray-500">
                    Loading commission data…
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-gray-500">
                    No rows match your filters.
                  </td>
                </tr>
              ) : (
                visibleRows.map((r) => {
                  const displayStatus = getDisplayStatus(r);
                  const blocked = !isCountsTowardCommission(r);

                  const isWire = getIsWire(r);
                  const wireRequired = getWireRequired(r);

                  const preAck = getRowValue(r, "pre_ack_advance");
                  const referral = getRowValue(r, "referral_paid_out");
                  const wireFunded = getRowValue(r, "wire_rac_funded");
                  const notes = getRowValue(r, "notes") ?? "";

                  const noStatusFound = normStatus(displayStatus) === "NO STATUS FOUND";
                  const fixState = fixStatusByKey[r.sync_key];

                  // Visual indicator if fee is reduced
                  const isPreAckTrue = normalizeBoolSelect(preAck) === true;
                  const referralAmount = Number(referral);
                  const hasReferral = !Number.isNaN(referralAmount) && referralAmount > 0;
                  
                  // Calculate net fee for display
                  const rawFee = Number(r.prep_fee) || 0;
                  let deduction = 0;
                  if (isPreAckTrue) deduction += PRE_ACK_FEE;
                  if (hasReferral) deduction += referralAmount;
                  const netFee = Math.max(0, rawFee - deduction);

                  return (
                    <tr
                      key={r.sync_key}
                      className={cx(
                        "border-b last:border-b-0",
                        // ✅ UPDATED ROW BACKGROUND FOR BLOCKED ROWS
                        blocked ? "bg-amber-50" : "hover:bg-gray-50/60"
                      )}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(r.date_time)}</td>
                      <td className="px-4 py-3">{r.office_code ?? ""}</td>
                      <td className="px-4 py-3">{r.cust_id ?? ""}</td>
                      <td className="px-4 py-3">{r.customer ?? ""}</td>
                      
                      {/* ✅ EMPHASIZED EXCLUDED FEES */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                           {blocked ? (
                             <>
                               {/* Strikethrough Original */}
                               <span className="text-gray-400 line-through text-[11px] decoration-red-300">
                                 {formatMoney(rawFee)}
                               </span>
                               {/* Bold Zero */}
                               <span className="font-bold text-red-600 text-sm">$0.00</span>
                               {/* Excluded Badge */}
                               <span className="text-[9px] bg-red-100 text-red-700 px-1 rounded w-fit font-bold mt-0.5">
                                 EXCLUDED
                               </span>
                             </>
                           ) : (
                             /* ... Normal valid row logic ... */
                             <>
                               {(deduction > 0) ? (
                                   <>
                                    <span className="text-gray-400 line-through text-[11px]">{formatMoney(rawFee)}</span>
                                    <span className="font-medium text-emerald-700">{formatMoney(netFee)}</span>
                                   </>
                               ) : (
                                   <span>{formatMoney(rawFee)}</span>
                               )}

                               {(deduction > 0) && (
                                 <span className="text-[10px] text-red-500 font-medium">
                                   -{formatMoney(deduction)}
                                 </span>
                               )}
                             </>
                           )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{r.payment_method ?? ""}</span>
                          {wireRequired && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                              Wire Req
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">{r.tax_year ?? ""}</td>

                      <td className="px-4 py-3">
                        {blocked ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            No
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                            Yes
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* ✅ COLORED STATUS BADGES */}
                          <span className={cx(
                            "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                            getStatusBadgeClass(displayStatus)
                          )}>
                            {displayStatus || "—"}
                          </span>
                          
                          {noStatusFound && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                              !
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {noStatusFound ? (
                          <div className="flex items-center gap-2">
                            {/* ✅ UPDATED FIX BUTTON STYLE */}
                            <button
                              type="button"
                              onClick={() => openFixModal(r)}
                              className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-rose-700"
                            >
                              Fix
                            </button>
                            {fixState && (
                               <span className={cx(
                                 "text-[10px] uppercase font-bold",
                                 fixState === "approved" ? "text-green-600" :
                                 fixState === "rejected" ? "text-red-600" : "text-blue-600"
                               )}>
                                 {fixState}
                               </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <select
                          value={preAck == null ? "" : preAck ? "yes" : "no"}
                          onChange={(e) => {
                            const v = normalizeBoolSelect(e.target.value);
                            setRowDraft(r.sync_key, { pre_ack_advance: v });
                            queueSave(r.sync_key);
                          }}
                          className={cx(
                            "h-8 w-20 rounded-lg border px-1 text-xs outline-none focus:ring-2 focus:ring-black/10",
                            isPreAckTrue && "bg-blue-50 border-blue-200 text-blue-700 font-semibold"
                          )}
                        >
                          <option value="">—</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </td>

                      <td className="px-4 py-3">
                        <select
                          value={referral || ""}
                          onChange={(e) => {
                            setRowDraft(r.sync_key, { referral_paid_out: e.target.value });
                            queueSave(r.sync_key);
                          }}
                          className={cx(
                            "h-8 w-24 rounded-lg border px-1 text-xs outline-none focus:ring-2 focus:ring-black/10",
                            hasReferral && "bg-blue-50 border-blue-200 text-blue-700 font-semibold"
                          )}
                        >
                          <option value="">—</option>
                          {REFERRAL_OPTIONS.map(amt => (
                             <option key={amt} value={amt}>${amt}</option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-3">
                        <select
                          value={wireFunded == null ? "" : wireFunded ? "yes" : "no"}
                          onChange={(e) => {
                            const v = normalizeBoolSelect(e.target.value);
                            setRowDraft(r.sync_key, { wire_rac_funded: v });
                            queueSave(r.sync_key);
                          }}
                          className={cx(
                            "h-8 w-20 rounded-lg border px-1 text-xs outline-none focus:ring-2 focus:ring-black/10",
                            isWire && wireRequired && "border-red-400"
                          )}
                        >
                          <option value="">—</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </td>

                      <td className="px-4 py-3">
                        <input
                          value={notes}
                          onChange={(e) => {
                            setRowDraft(r.sync_key, { notes: e.target.value });
                            queueSave(r.sync_key);
                          }}
                          placeholder="..."
                          className="h-8 w-40 rounded-lg border px-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* ... Footer ... */}
        <div className="flex items-center justify-between border-t bg-white px-4 py-3 text-xs text-gray-600">
           <div>Showing {visibleRows.length} rows</div>
           <div className="text-gray-400 italic">
             * Calculation applies Pre-Ack & Referral deductions before Corp Fee. Blocked rows are excluded.
           </div>
        </div>
      </div>

      {/* Fix Modal (Same as before) */}
      {fixOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
             <div className="flex items-start justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-semibold">Fix “NO STATUS FOUND”</h2>
                <p className="mt-1 text-sm text-gray-600">Missing details required for commission.</p>
              </div>
              <button onClick={closeFixModal} className="rounded-lg border px-3 py-1 text-sm">Close</button>
             </div>
             <div className="p-5">
               <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field 
                  label="TAX YEAR" 
                  value={fixForm.tax_year} 
                  onChange={(v)=>setFixForm(p=>({...p,tax_year:v}))} 
                  type="select"
                  options={TAX_YEAR_OPTIONS_MODAL}
                />
                <Field label="LAST4" value={fixForm.last4} onChange={(v)=>setFixForm(p=>({...p,last4:v}))} placeholder="1234"/>
                <Field label="FIRST" value={fixForm.first} onChange={(v)=>setFixForm(p=>({...p,first:v}))} placeholder="John"/>
                <Field label="LAST" value={fixForm.last} onChange={(v)=>setFixForm(p=>({...p,last:v}))} placeholder="Doe"/>
                <Field label="PHONE" value={fixForm.phone} onChange={(v)=>setFixForm(p=>({...p,phone:v}))} placeholder="(555) 123-4567"/>
                <Field label="PREPARER" value={fixForm.preparer} onChange={(v)=>setFixForm(p=>({...p,preparer:v}))} placeholder="Name"/>
                <Field 
                  label="STATUS" 
                  value={fixForm.status} 
                  onChange={(v)=>setFixForm(p=>({...p,status:v}))} 
                  type="select"
                  options={MODAL_STATUS_OPTIONS}
                />
                <Field label="OFFICE" value={fixForm.office} onChange={(v)=>setFixForm(p=>({...p,office:v}))} placeholder="Code"/>
               </div>
               {fixError && <p className="mt-3 text-sm text-red-600">{fixError}</p>}
               <div className="mt-5 flex justify-end gap-2">
                 <button onClick={closeFixModal} className="px-4 py-2 border rounded-xl">Cancel</button>
                 <button onClick={submitFixRequest} disabled={fixSubmitting} className="px-4 py-2 bg-black text-white rounded-xl">
                   {fixSubmitting ? "Submitting..." : "Submit Fix Request"}
                 </button>
               </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
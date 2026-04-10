// src/pages/agent/AgentCommissionLog.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAuth } from "../../AuthContext";

/**
 * ==========================================
 * FIESTA TAX COMMISSION CONFIGURATION
 * ==========================================
 */

const PRE_ACK_FEE = 79.9; // Deduction per Pre-Ack return

const COMMISSION_TIERS = [
  { min: 0, max: 49, label: "Tier A (0-49)", corpRate: 0.3, baseRate: 0.075, highRate: 0.1 },
  { min: 50, max: 99, label: "Tier B (50-99)", corpRate: 0.3, baseRate: 0.075, highRate: 0.1 },
  { min: 100, max: 199, label: "Tier C (100-199)", corpRate: 0.25, baseRate: 0.1, highRate: 0.125 },
  { min: 200, max: 349, label: "Tier D (200-349)", corpRate: 0.2, baseRate: 0.125, highRate: 0.15 },
  { min: 350, max: 9999, label: "Tier E (350+)", corpRate: 0.2, baseRate: 0.2, highRate: 0.2 },
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

const BLOCKED_STATUSES = new Set([
  "NO STATUS FOUND",
  "REJECTED",
  "COMPLETE",
  "REVIEW",
  "IN PROGRESS",
]);

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
          <option value="" disabled>
            Select...
          </option>
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

  const [taxYear, setTaxYear] = useState("all");
  const [status, setStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [search, setSearch] = useState("");

  const [isTaxVet, setIsTaxVet] = useState(false);
  const [showCommissionBreakdown, setShowCommissionBreakdown] = useState(false);

  const [draft, setDraft] = useState({});
  const [saveState, setSaveState] = useState({
    type: "idle", // idle | unsaved | saving | saved | error
    message: "",
  });

  const [fixStatusByKey, setFixStatusByKey] = useState({});

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

  const draftCount = useMemo(() => Object.keys(draft).length, [draft]);

  const getRowValue = useCallback(
    (r, key) => {
      const d = draft[r.sync_key];
      if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
      return r[key];
    },
    [draft]
  );

  function setRowDraft(sync_key, patch) {
    setDraft((prev) => ({
      ...prev,
      [sync_key]: { ...(prev[sync_key] ?? {}), ...patch },
    }));
    setSaveState({
      type: "unsaved",
      message: "You have unsaved changes.",
    });
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

  async function fetchProfileStatus() {
    if (!supabase || !userEmail) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("tax_vet")
        .eq("email", userEmail) // change this if your profiles table uses a different key
        .maybeSingle();

      if (error) {
        console.error("[commission] profile fetch error:", error);
        setIsTaxVet(false);
        return;
      }

      const taxVetValue = String(data?.tax_vet ?? "").trim().toLowerCase();
      setIsTaxVet(taxVetValue === "vet");
    } catch (err) {
      console.error("[commission] profile fetch exception:", err);
      setIsTaxVet(false);
    }
  }

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
    setSaveState({ type: "idle", message: "" });

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

  useEffect(() => {
    fetchProfileStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userEmail]);

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

  const stats = useMemo(() => {
    const eligible = [];
    let blockedCount = 0;
    let blockedRevenue = 0;
    const blockedReasonCounts = {};

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

    let totalRevenue = 0;
    let preAckCount = 0;
    let totalReferralFees = 0;

    eligible.forEach((r) => {
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

    // ==========================================
    // ROOKIE MILESTONE (LOCK AT 150 RETURNS)
    // ==========================================

    const eligibleSortedAsc = [...eligible].sort((a, b) => {
      const aTime = new Date(a.date_time).getTime();
      const bTime = new Date(b.date_time).getTime();
      return aTime - bTime;
    });

    const first150Eligible = eligibleSortedAsc.slice(0, 150);
    const reached150 = first150Eligible.length === 150;

    let totalRevenueAt150 = 0;

    first150Eligible.forEach((r) => {
      const fee = Number(r.prep_fee) || 0;
      totalRevenueAt150 += fee;
    });

    const avgFeeAt150 = reached150 ? totalRevenueAt150 / 150 : 0;

    const qualifiedAt150 = !isTaxVet && reached150 && avgFeeAt150 >= 225;

    const milestone150Date = reached150 ? first150Eligible[149]?.date_time ?? null : null;

    const totalPreAckFees = preAckCount * PRE_ACK_FEE;
    const revenueAfterDeductions = totalRevenue - totalPreAckFees - totalReferralFees;

    const activeTier =
      COMMISSION_TIERS.find((t) => taxesFiled >= t.min && taxesFiled <= t.max) || COMMISSION_TIERS[0];
    const nextTier = COMMISSION_TIERS.find((t) => taxesFiled < t.min) || null;
    const corpFeeRate = activeTier.corpRate;

    const corporateFee = revenueAfterDeductions * corpFeeRate;
    const commissionBase = revenueAfterDeductions - corporateFee;
    const commissionRate = avgFee >= 250 ? activeTier.highRate : activeTier.baseRate;

    const earnedCommission = commissionBase * commissionRate;

    let volumeBonus = 0;
    if (taxesFiled >= 300) {
      volumeBonus = 1000.0;
    }

    const isRookieEligible = qualifiedAt150;

    let avgCommissionPerReturn = 0;
    let valueOfFirst150 = 0;
    let guaranteeAdjustment = 0;

    if (isRookieEligible) {
      avgCommissionPerReturn = taxesFiled > 0 ? earnedCommission / taxesFiled : 0;
      valueOfFirst150 = avgCommissionPerReturn * 150;

      if (valueOfFirst150 < 5000) {
        guaranteeAdjustment = 5000.0 - valueOfFirst150;
      }
    }

    const totalCommission = earnedCommission + volumeBonus + guaranteeAdjustment;
    const isTierA = taxesFiled < 50;

    const tierReason =
      taxesFiled < 50
        ? "Agent is in Tier A because 0-49 filed returns fall in this range. Tier A does not qualify for payout."
        : `Agent is in ${activeTier.label} because ${taxesFiled} filed returns falls within the ${activeTier.min}-${activeTier.max} return range.`;

    const nextTierReason = nextTier
      ? `${Math.max(0, nextTier.min - taxesFiled)} more return(s) needed to reach ${nextTier.label}.`
      : "Agent is already in the highest volume tier.";

    const commissionRateReason =
      avgFee >= 250
        ? `Higher commission rate applied because average prep fee is ${formatMoney(avgFee)}, which meets or exceeds the ${formatMoney(250)} threshold.`
        : `Base commission rate applied because average prep fee is ${formatMoney(avgFee)}, which is below the ${formatMoney(250)} threshold.`;

    const rookieReasonParts = [];

    if (isTaxVet) {
      rookieReasonParts.push("Agent is marked as a tax vet, so the rookie guarantee does not apply.");
    }

    if (!reached150) {
      rookieReasonParts.push(`Agent has ${taxesFiled} filed returns and needs 150 to qualify.`);
    }

    if (reached150 && avgFeeAt150 < 225) {
      rookieReasonParts.push(
        `At the time the agent reached 150 returns, their average fee was ${formatMoney(avgFeeAt150)}, which is below the ${formatMoney(225)} rookie threshold.`
      );
    }

    if (qualifiedAt150) {
      rookieReasonParts.push(
        `Agent qualified at 150 returns with an average fee of ${formatMoney(avgFeeAt150)}.`
      );
    }

    const rookieReason = rookieReasonParts.join(" ");

    const volumeBonusReason =
      taxesFiled >= 300
        ? `300+ bonus applied because agent filed ${taxesFiled} returns.`
        : `300+ bonus not applied because agent has ${taxesFiled} filed returns and needs ${300 - taxesFiled} more to qualify.`;

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
      nextTierLabel: nextTier?.label ?? null,
      nextTierMin: nextTier?.min ?? null,
      tierReason,
      nextTierReason,
      commissionRateReason,
      rookieReason,
      volumeBonusReason,
      corpFeeRate,
      corporateFee,
      commissionBase,
      commissionRate,
      earnedCommission,
      volumeBonus,
      guaranteeAdjustment,
      isRookieEligible,
      totalCommission,
      isTierA,
      isTaxVet,
      avgCommissionPerReturn,
      valueOfFirst150,
      reached150,
      avgFeeAt150,
      qualifiedAt150,
      milestone150Date,
    };
  }, [visibleRows, getRowValue, isTaxVet]);

  async function upsertAnnotation(sync_key) {
    if (!supabase) return { ok: false, reason: "No Supabase client." };

    const base = rows.find((x) => x.sync_key === sync_key);
    const d = draft[sync_key] ?? {};

    const payment_method = String(d.payment_method ?? base?.payment_method ?? "");
    const isWire = payment_method.toLowerCase().includes("wire");
    const wire_rac_funded = d.wire_rac_funded ?? base?.wire_rac_funded ?? null;

    if (isWire && (wire_rac_funded === null || wire_rac_funded === undefined)) {
      return {
        ok: false,
        reason: "Wire/RAC Funded? is required for wire payments before saving.",
      };
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
      return { ok: false, reason: error.message || "Save failed." };
    }

    setRows((prev) => prev.map((r) => (r.sync_key === sync_key ? { ...r, ...payload } : r)));
    return { ok: true };
  }

  async function saveAllChanges() {
    const keys = Object.keys(draft);
    if (!keys.length) {
      setSaveState({
        type: "saved",
        message: "There are no new changes to save.",
      });
      return;
    }

    setSaveState({
      type: "saving",
      message: `Saving ${keys.length} change${keys.length === 1 ? "" : "s"}...`,
    });

    let successCount = 0;
    const failed = [];

    for (const sync_key of keys) {
      const result = await upsertAnnotation(sync_key);
      if (result?.ok) {
        successCount += 1;
      } else {
        failed.push({ sync_key, reason: result?.reason || "Save failed." });
      }
    }

    if (!failed.length) {
      setDraft({});
      setSaveState({
        type: "saved",
        message: `Saved ${successCount} row${successCount === 1 ? "" : "s"} successfully.`,
      });
      return;
    }

    const failedKeys = new Set(failed.map((f) => f.sync_key));
    setDraft((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([key]) => failedKeys.has(key)))
    );

    setSaveState({
      type: "error",
      message:
        failed.length === 1
          ? `1 row could not be saved: ${failed[0].reason}`
          : `${failed.length} rows could not be saved. Please review required fields and try again.`,
    });
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

      <div className="mb-4 overflow-hidden rounded-2xl border bg-gray-900 text-white shadow-md">
        <button
          type="button"
          onClick={() => setShowCommissionBreakdown((prev) => !prev)}
          className="flex w-full items-center justify-between gap-4 border-b border-gray-700 bg-gray-800 px-6 py-4 text-left hover:bg-gray-800/90"
        >
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wider text-gray-300">
              Estimated Commission Breakdown
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              Click to {showCommissionBreakdown ? "collapse" : "expand"} full calculation
            </p>
          </div>

          <div className="flex items-center gap-3">
            {stats.volumeBonus > 0 && (
              <span className="animate-pulse rounded bg-purple-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                +$1k Bonus Active!
              </span>
            )}

            {stats.guaranteeAdjustment > 0 && (
              <span className="animate-pulse rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Rookie Guarantee Active
              </span>
            )}

            {stats.isTaxVet && (
              <span className="rounded bg-gray-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Tax Vet
              </span>
            )}

            {!stats.isRookieEligible &&
              stats.reached150 &&
              !stats.isTaxVet &&
              stats.avgFeeAt150 < 225 && (
                <span className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Rookie Blocked by Avg Fee
                </span>
              )}

            <div className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300">
              Tier: <span className="font-bold text-white">{stats.tierLabel}</span>
            </div>

            <div className="text-lg text-white">{showCommissionBreakdown ? "−" : "+"}</div>
          </div>
        </button>

        <div className="grid grid-cols-1 gap-8 p-6 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-gray-400">1. Eligible Revenue</p>
            <p className="text-2xl font-bold">{formatMoney(stats.totalRevenue)}</p>
            <div className="mt-2 text-xs text-gray-500">
              {stats.taxesFiled} Taxes Filed <br />
              Avg Fee: {formatMoney(stats.avgFee)}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase text-gray-400">2. Deductions</p>
            <div className="mt-1 space-y-1 text-xs text-gray-300">
              <div className="flex justify-between">
                <span>Pre-Ack ({stats.preAckCount} x {PRE_ACK_FEE}):</span>
                <span className="text-red-400">-{formatMoney(stats.totalPreAckFees)}</span>
              </div>
              <div className="flex justify-between">
                <span>Referrals (Var):</span>
                <span className="text-red-400">-{formatMoney(stats.totalReferralFees)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-700 pt-1 font-semibold">
                <span>Adj. Rev:</span>
                <span>{formatMoney(stats.revenueAfterDeductions)}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase text-gray-400">3. Commission Base</p>
            <div className="mt-1 space-y-1 text-xs text-gray-300">
              <div className="flex justify-between">
                <span>Corp Fee ({(stats.corpFeeRate * 100).toFixed(0)}%):</span>
                <span className="text-red-400">-{formatMoney(stats.corporateFee)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-700 pt-1 text-sm font-semibold text-white">
                <span>Net Base:</span>
                <span>{formatMoney(stats.commissionBase)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-emerald-900/50 bg-emerald-900/20 p-4">
            <div>
              <p className="text-xs font-semibold uppercase text-emerald-400">4. Commission Payout</p>
              <p className="mt-1 text-3xl font-bold text-emerald-400">{formatMoney(stats.totalCommission)}</p>
              <div className="mt-2 text-xs text-emerald-200/70">
                Rate: <b>{(stats.commissionRate * 100).toFixed(2)}%</b> applied to Base
              </div>
            </div>

            {stats.isTierA && (
              <div className="mt-3 rounded border border-red-500/50 bg-red-500/20 p-2 text-[10px] text-red-200">
                <strong>⚠️ No Payout</strong>
                <p>Returns 0-49 do not qualify for commission. Amount shown is potential only.</p>
              </div>
            )}

            {(stats.volumeBonus > 0 || stats.guaranteeAdjustment > 0) && (
              <div className="mt-3 space-y-1 border-t border-emerald-800/30 pt-3 text-[10px] text-emerald-100">
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

        {showCommissionBreakdown && (
          <div className="border-t border-gray-700 bg-gray-950 px-6 py-5">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">Step-by-Step Formula</h3>
                <div className="space-y-2 text-sm text-gray-300">
                  <div className="flex justify-between">
                    <span>Eligible Gross Revenue</span>
                    <span>{formatMoney(stats.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Less Pre-Ack Fees</span>
                    <span className="text-red-400">-{formatMoney(stats.totalPreAckFees)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Less Referral Payouts</span>
                    <span className="text-red-400">-{formatMoney(stats.totalReferralFees)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-800 pt-2 font-medium">
                    <span>Adjusted Revenue</span>
                    <span>{formatMoney(stats.revenueAfterDeductions)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span>Less Corporate Fee ({(stats.corpFeeRate * 100).toFixed(0)}%)</span>
                    <span className="text-red-400">-{formatMoney(stats.corporateFee)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-800 pt-2 font-medium">
                    <span>Commission Base</span>
                    <span>{formatMoney(stats.commissionBase)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span>Commission Rate</span>
                    <span>{(stats.commissionRate * 100).toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-800 pt-2 font-semibold text-emerald-400">
                    <span>Earned Commission</span>
                    <span>{formatMoney(stats.earnedCommission)}</span>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-black/30 p-4 font-mono text-xs text-gray-300">
                  {formatMoney(stats.totalRevenue)}
                  {" - "}
                  {formatMoney(stats.totalPreAckFees)}
                  {" - "}
                  {formatMoney(stats.totalReferralFees)}
                  {" = "}
                  {formatMoney(stats.revenueAfterDeductions)}
                  {"; then - "}
                  {formatMoney(stats.corporateFee)}
                  {" = "}
                  {formatMoney(stats.commissionBase)}
                  {"; × "}
                  {(stats.commissionRate * 100).toFixed(2)}
                  {"% = "}
                  {formatMoney(stats.earnedCommission)}
                  {"; + "}
                  {formatMoney(stats.volumeBonus)}
                  {" + "}
                  {formatMoney(stats.guaranteeAdjustment)}
                  {" = "}
                  {formatMoney(stats.totalCommission)}
                </div>
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">Eligibility / Why</h3>

                <div className="space-y-3 text-sm text-gray-300">
                  <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                    <div className="flex justify-between">
                      <span className="font-medium text-white">Current Tier</span>
                      <span>{stats.tierLabel}</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">{stats.tierReason}</p>
                    <p className="mt-1 text-xs text-amber-300">{stats.nextTierReason}</p>
                  </div>

                  <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                    <div className="flex justify-between">
                      <span className="font-medium text-white">Commission Rate</span>
                      <span>{(stats.commissionRate * 100).toFixed(2)}%</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">{stats.commissionRateReason}</p>
                  </div>

                  <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                    <div className="flex justify-between">
                      <span className="font-medium text-white">Rookie Guarantee</span>
                      <span>{stats.isRookieEligible ? "Eligible" : "Not Eligible"}</span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between rounded bg-black/20 px-2 py-1">
                        <span>Tax Vet</span>
                        <span>{stats.isTaxVet ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex justify-between rounded bg-black/20 px-2 py-1">
                        <span>150 Reached</span>
                        <span>{stats.reached150 ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex justify-between rounded bg-black/20 px-2 py-1">
                        <span>Milestone Avg ≥ $225</span>
                        <span>{stats.avgFeeAt150 >= 225 ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex justify-between rounded bg-black/20 px-2 py-1">
                        <span>Milestone Avg</span>
                        <span>{formatMoney(stats.avgFeeAt150)}</span>
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-gray-400">{stats.rookieReason}</p>

                    <div className="mt-3 space-y-1 border-t border-gray-800 pt-3 text-xs">
                      <div className="flex justify-between">
                        <span>150-Return Milestone Avg</span>
                        <span>{formatMoney(stats.avgFeeAt150)}</span>
                      </div>

                      <div className="flex justify-between">
                        <span>Qualified at 150</span>
                        <span>{stats.qualifiedAt150 ? "Yes" : "No"}</span>
                      </div>

                      {stats.milestone150Date && (
                        <div className="flex justify-between">
                          <span>150th Return Date</span>
                          <span>{formatDateTime(stats.milestone150Date)}</span>
                        </div>
                      )}
                    </div>

                    {stats.isRookieEligible && (
                      <div className="mt-3 space-y-1 border-t border-gray-800 pt-3 text-xs">
                        <div className="flex justify-between">
                          <span>Avg Commission Per Return</span>
                          <span>{formatMoney(stats.avgCommissionPerReturn)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Value of First 150 Returns</span>
                          <span>{formatMoney(stats.valueOfFirst150)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rookie Guarantee Top-Up</span>
                          <span>
                            {stats.guaranteeAdjustment > 0
                              ? `+${formatMoney(stats.guaranteeAdjustment)}`
                              : "$0.00"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                    <div className="flex justify-between">
                      <span className="font-medium text-white">300+ Bonus</span>
                      <span>{stats.volumeBonus > 0 ? `+${formatMoney(stats.volumeBonus)}` : "$0.00"}</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">{stats.volumeBonusReason}</p>
                  </div>

                  <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                    <div className="flex justify-between">
                      <span className="font-medium text-white">Total Estimated Commission</span>
                      <span className="font-bold text-emerald-400">
                        {formatMoney(stats.totalCommission)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {stats.blockedCount > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-lg">⚠️</div>
            <div>
              <p className="text-sm font-semibold">
                {stats.blockedCount} tax returns are NOT counted toward commission.
              </p>
              <p className="mt-1 text-xs opacity-90">
                These rows are excluded from the totals above. <br />
                <b>Excluded Revenue: {formatMoney(stats.blockedRevenue)}</b> <br />
                Reason: Status is {stats.blockedReasons}.
              </p>
            </div>
          </div>
        </div>
      )}

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

      <div className="mb-3 flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-gray-700">Changes</span>

          {saveState.type === "idle" && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              No pending changes
            </span>
          )}

          {saveState.type === "unsaved" && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              Unsaved changes: {draftCount}
            </span>
          )}

          {saveState.type === "saving" && (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
              Saving...
            </span>
          )}

          {saveState.type === "saved" && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              Saved
            </span>
          )}

          {saveState.type === "error" && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
              Save issue
            </span>
          )}

          {saveState.message && <span className="text-xs text-gray-600">{saveState.message}</span>}
        </div>

        <button
          type="button"
          onClick={saveAllChanges}
          disabled={draftCount === 0 || saveState.type === "saving"}
          className={cx(
            "rounded-xl px-4 py-2 text-sm font-medium shadow-sm",
            draftCount === 0 || saveState.type === "saving"
              ? "cursor-not-allowed border bg-gray-100 text-gray-400"
              : "bg-black text-white hover:bg-gray-800"
          )}
        >
          {saveState.type === "saving" ? "Saving Changes..." : "Save Changes"}
        </button>
      </div>

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

                  const isPreAckTrue = normalizeBoolSelect(preAck) === true;
                  const referralAmount = Number(referral);
                  const hasReferral = !Number.isNaN(referralAmount) && referralAmount > 0;

                  const rawFee = Number(r.prep_fee) || 0;
                  let deduction = 0;
                  if (isPreAckTrue) deduction += PRE_ACK_FEE;
                  if (hasReferral) deduction += referralAmount;
                  const netFee = Math.max(0, rawFee - deduction);

                  const rowHasDraft = Boolean(draft[r.sync_key]);

                  return (
                    <tr
                      key={r.sync_key}
                      className={cx(
                        "border-b last:border-b-0",
                        blocked ? "bg-amber-50" : "hover:bg-gray-50/60",
                        rowHasDraft && "bg-blue-50/40"
                      )}
                    >
                      <td className="whitespace-nowrap px-4 py-3">{formatDateTime(r.date_time)}</td>
                      <td className="px-4 py-3">{r.office_code ?? ""}</td>
                      <td className="px-4 py-3">{r.cust_id ?? ""}</td>
                      <td className="px-4 py-3">{r.customer ?? ""}</td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex flex-col">
                          {blocked ? (
                            <>
                              <span className="text-[11px] text-gray-400 line-through decoration-red-300">
                                {formatMoney(rawFee)}
                              </span>
                              <span className="text-sm font-bold text-red-600">$0.00</span>
                              <span className="mt-0.5 w-fit rounded bg-red-100 px-1 text-[9px] font-bold text-red-700">
                                EXCLUDED
                              </span>
                            </>
                          ) : (
                            <>
                              {deduction > 0 ? (
                                <>
                                  <span className="text-[11px] text-gray-400 line-through">
                                    {formatMoney(rawFee)}
                                  </span>
                                  <span className="font-medium text-emerald-700">
                                    {formatMoney(netFee)}
                                  </span>
                                </>
                              ) : (
                                <span>{formatMoney(rawFee)}</span>
                              )}

                              {deduction > 0 && (
                                <span className="text-[10px] font-medium text-red-500">
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
                          <span
                            className={cx(
                              "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                              getStatusBadgeClass(displayStatus)
                            )}
                          >
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
                            <button
                              type="button"
                              onClick={() => openFixModal(r)}
                              className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-rose-700"
                            >
                              Fix
                            </button>
                            {fixState && (
                              <span
                                className={cx(
                                  "text-[10px] font-bold uppercase",
                                  fixState === "approved"
                                    ? "text-green-600"
                                    : fixState === "rejected"
                                      ? "text-red-600"
                                      : "text-blue-600"
                                )}
                              >
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
                          }}
                          className={cx(
                            "h-8 w-20 rounded-lg border px-1 text-xs outline-none focus:ring-2 focus:ring-black/10",
                            isPreAckTrue && "border-blue-200 bg-blue-50 font-semibold text-blue-700"
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
                          }}
                          className={cx(
                            "h-8 w-24 rounded-lg border px-1 text-xs outline-none focus:ring-2 focus:ring-black/10",
                            hasReferral && "border-blue-200 bg-blue-50 font-semibold text-blue-700"
                          )}
                        >
                          <option value="">—</option>
                          {REFERRAL_OPTIONS.map((amt) => (
                            <option key={amt} value={amt}>
                              ${amt}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-3">
                        <select
                          value={wireFunded == null ? "" : wireFunded ? "yes" : "no"}
                          onChange={(e) => {
                            const v = normalizeBoolSelect(e.target.value);
                            setRowDraft(r.sync_key, { wire_rac_funded: v });
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

        <div className="flex items-center justify-between border-t bg-white px-4 py-3 text-xs text-gray-600">
          <div>Showing {visibleRows.length} rows</div>
          <div className="italic text-gray-400">
            * Calculation applies Pre-Ack & Referral deductions before Corp Fee. Blocked rows are excluded.
          </div>
        </div>
      </div>

      {fixOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-semibold">Fix “NO STATUS FOUND”</h2>
                <p className="mt-1 text-sm text-gray-600">Missing details required for commission.</p>
              </div>
              <button onClick={closeFixModal} className="rounded-lg border px-3 py-1 text-sm">
                Close
              </button>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field
                  label="TAX YEAR"
                  value={fixForm.tax_year}
                  onChange={(v) => setFixForm((p) => ({ ...p, tax_year: v }))}
                  type="select"
                  options={TAX_YEAR_OPTIONS_MODAL}
                />
                <Field
                  label="LAST4"
                  value={fixForm.last4}
                  onChange={(v) => setFixForm((p) => ({ ...p, last4: v }))}
                  placeholder="1234"
                />
                <Field
                  label="FIRST"
                  value={fixForm.first}
                  onChange={(v) => setFixForm((p) => ({ ...p, first: v }))}
                  placeholder="John"
                />
                <Field
                  label="LAST"
                  value={fixForm.last}
                  onChange={(v) => setFixForm((p) => ({ ...p, last: v }))}
                  placeholder="Doe"
                />
                <Field
                  label="PHONE"
                  value={fixForm.phone}
                  onChange={(v) => setFixForm((p) => ({ ...p, phone: v }))}
                  placeholder="(555) 123-4567"
                />
                <Field
                  label="PREPARER"
                  value={fixForm.preparer}
                  onChange={(v) => setFixForm((p) => ({ ...p, preparer: v }))}
                  placeholder="Name"
                />
                <Field
                  label="STATUS"
                  value={fixForm.status}
                  onChange={(v) => setFixForm((p) => ({ ...p, status: v }))}
                  type="select"
                  options={MODAL_STATUS_OPTIONS}
                />
                <Field
                  label="OFFICE"
                  value={fixForm.office}
                  onChange={(v) => setFixForm((p) => ({ ...p, office: v }))}
                  placeholder="Code"
                />
              </div>
              {fixError && <p className="mt-3 text-sm text-red-600">{fixError}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={closeFixModal} className="rounded-xl border px-4 py-2">
                  Cancel
                </button>
                <button
                  onClick={submitFixRequest}
                  disabled={fixSubmitting}
                  className="rounded-xl bg-black px-4 py-2 text-white"
                >
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
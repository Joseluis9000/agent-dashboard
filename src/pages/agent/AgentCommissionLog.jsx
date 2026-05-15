// src/pages/agent/AgentCommissionLog.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAuth } from "../../AuthContext";

/**
 * ==========================================
 * FIESTA TAX COMMISSION CONFIGURATION
 * ==========================================
 */

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
const SHADOW_LIMIT_PER_ORIGINAL_PREPARER = 10;

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
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function moneyNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function negativeDeductionOnly(v) {
  const n = moneyNumber(v);
  return n < 0 ? Math.abs(n) : 0;
}

function getImportedReceiptAdjustments(r) {
  return (
    negativeDeductionOnly(r.prep_fee_difference) +
    negativeDeductionOnly(r.unfunded) +
    negativeDeductionOnly(r.refunded)
  );
}

function importedDeductionAmount(v) {
  const n = moneyNumber(v);
  return n !== 0 ? Math.abs(n) : 0;
}

function getImportedPreAckDeduction(r) {
  return importedDeductionAmount(r.pre_ack_fee);
}

function getImportedArViolationDeduction(r) {
  return importedDeductionAmount(r.ar_violation);
}

function getTotalImportedDeductions(r) {
  return (
    getImportedReceiptAdjustments(r) +
    getImportedPreAckDeduction(r) +
    getImportedArViolationDeduction(r)
  );
}

function getCommissionableFee(r, getRowValue) {
  const rawFee = moneyNumber(r.prep_fee);
  const importedDeductions = getTotalImportedDeductions(r);
  const referralAmount = moneyNumber(getRowValue(r, "referral_paid_out"));

  return Math.max(0, rawFee - importedDeductions - referralAmount);
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
    type: "idle",
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

  const [arDisputeOpen, setArDisputeOpen] = useState(false);
  const [arDisputeRow, setArDisputeRow] = useState(null);
  const [arDisputeText, setArDisputeText] = useState("");
  const [arDisputeError, setArDisputeError] = useState("");
  const [arDisputeSubmitting, setArDisputeSubmitting] = useState(false);

  const [shadowOpen, setShadowOpen] = useState(false);
  const [shadowSubmitting, setShadowSubmitting] = useState(false);
  const [shadowError, setShadowError] = useState("");
  const [shadowSuccess, setShadowSuccess] = useState("");
  const [shadowForm, setShadowForm] = useState({
    policy_number: "",
    cust_id: "",
    payment_method: "",
    receipt: "",
    charged: "",
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

  async function fetchProfileStatus() {
    if (!supabase || !userEmail) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("tax_vet")
        .eq("email", userEmail)
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

    const receiptSelect = [
      "sync_key",
      "agent_email",
      "agent_name",
      "date_time",
      "office_code",
      "cust_id",
      "customer",
      "payment_method",
      "tax_year:receipt_maxtax_year",
      "status:receipt_maxtax_status",
      "prep_fee:charged",
      "prep_fee_difference",
      "unfunded",
      "refunded",
      "policy_number",
      "pre_ack_fee",
      "ar_violation",
      "last4",
      "first",
      "last",
      "phone",
      "preparer",
      "office_full",
      "record_number",
      "receipt",
    ].join(",");

    let q = supabase
      .from("agent_tax_commission_log")
      .select(receiptSelect)
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

    const ownRows = (baseRows ?? []).map((r) => ({
      ...r,
      is_shadow_credit: false,
      display_key: `own-${r.sync_key}`,
    }));

    let shadowRows = [];
    const { data: shadowCredits, error: shadowErr } = await supabase
      .from("tax_shadow_credits")
      .select("original_sync_key, created_at")
      .eq("shadow_agent_email", userEmail);

    if (!shadowErr && shadowCredits?.length) {
      const shadowKeys = [...new Set(shadowCredits.map((s) => s.original_sync_key).filter(Boolean))];

      if (shadowKeys.length) {
        const { data: matchedShadowRows, error: shadowRowsErr } = await supabase
          .from("agent_tax_commission_log")
          .select(receiptSelect)
          .in("sync_key", shadowKeys);

        if (!shadowRowsErr) {
          const creditMap = Object.fromEntries(
            shadowCredits.map((s) => [s.original_sync_key, s])
          );

          shadowRows = (matchedShadowRows ?? []).map((r) => ({
            ...r,
            original_agent_email: r.agent_email,
            original_agent_name: r.agent_name,
            agent_email: userEmail,
            is_shadow_credit: true,
            shadow_credit_created_at: creditMap[r.sync_key]?.created_at ?? null,
            display_key: `shadow-${r.sync_key}`,
          }));
        }
      }
    }

    const list = [...ownRows, ...shadowRows];
    const keys = [...new Set(list.map((r) => r.sync_key).filter(Boolean))];

    let annMap = {};
    if (keys.length) {
      const { data: anns, error: annErr } = await supabase
        .from("tax_commission_annotations")
        .select(
          [
            "sync_key",
            "referral_paid_out",
            "notes",
            "ar_violation_disputed",
            "ar_violation_dispute_explanation",
            "ar_violation_disputed_at",
            "updated_at",
          ].join(",")
        )
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
        String(r.policy_number ?? "").toLowerCase().includes(s) ||
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

  const shadowPaymentOptions = useMemo(() => {
    const set = new Set(
      rows
        .map((r) => String(r.payment_method ?? "").trim())
        .filter(Boolean)
    );

    ["Cash", "Credit Card", "Wire", "RAC"].forEach((p) => set.add(p));

    return Array.from(set).sort();
  }, [rows]);

  const stats = useMemo(() => {
    const eligible = [];
    let blockedCount = 0;
    let blockedRevenue = 0;
    const blockedReasonCounts = {};

    for (const r of visibleRows) {
      const fee = getCommissionableFee(r, getRowValue);

      if (isCountsTowardCommission(r)) {
        eligible.push(r);
      } else {
        blockedCount++;
        blockedRevenue += fee;
        const s = normStatus(getDisplayStatus(r));
        blockedReasonCounts[s] = (blockedReasonCounts[s] || 0) + 1;
      }
    }

    let grossPrepFees = 0;
    let totalRevenue = 0;
    let totalReceiptAdjustments = 0;
    let totalPrepFeeDifferenceAdjustments = 0;
    let totalUnfundedAdjustments = 0;
    let totalRefundedAdjustments = 0;
    let totalPreAckFees = 0;
    let totalArViolationFees = 0;
    let totalReferralFees = 0;
    let shadowCreditCount = 0;
    let shadowCreditRevenue = 0;

    eligible.forEach((r) => {
      const rawFee = moneyNumber(r.prep_fee);
      const prepFeeDifferenceAdjustment = negativeDeductionOnly(r.prep_fee_difference);
      const unfundedAdjustment = negativeDeductionOnly(r.unfunded);
      const refundedAdjustment = negativeDeductionOnly(r.refunded);
      const receiptAdjustments =
        prepFeeDifferenceAdjustment + unfundedAdjustment + refundedAdjustment;
      const preAckAmount = getImportedPreAckDeduction(r);
      const arViolationAmount = getImportedArViolationDeduction(r);
      const referralAmount = moneyNumber(getRowValue(r, "referral_paid_out"));

      const commissionableFee = Math.max(
        0,
        rawFee - receiptAdjustments - preAckAmount - arViolationAmount - referralAmount
      );

      grossPrepFees += rawFee;
      totalRevenue += commissionableFee;
      totalReceiptAdjustments += receiptAdjustments;
      totalPrepFeeDifferenceAdjustments += prepFeeDifferenceAdjustment;
      totalUnfundedAdjustments += unfundedAdjustment;
      totalRefundedAdjustments += refundedAdjustment;
      totalPreAckFees += preAckAmount;
      totalArViolationFees += arViolationAmount;
      totalReferralFees += referralAmount;

      if (r.is_shadow_credit) {
        shadowCreditCount++;
        shadowCreditRevenue += commissionableFee;
      }
    });

    const taxesFiled = eligible.length;
    const avgFee = taxesFiled > 0 ? totalRevenue / taxesFiled : 0;

    const eligibleSortedAsc = [...eligible].sort((a, b) => {
      const aTime = new Date(a.date_time).getTime();
      const bTime = new Date(b.date_time).getTime();
      return aTime - bTime;
    });

    const first150Eligible = eligibleSortedAsc.slice(0, 150);
    const reached150 = first150Eligible.length === 150;

    let totalRevenueAt150 = 0;

    first150Eligible.forEach((r) => {
      totalRevenueAt150 += getCommissionableFee(r, getRowValue);
    });

    const avgFeeAt150 = reached150 ? totalRevenueAt150 / 150 : 0;
    const qualifiedAt150 = !isTaxVet && reached150 && avgFeeAt150 >= 225;
    const milestone150Date = reached150 ? first150Eligible[149]?.date_time ?? null : null;

    const revenueAfterDeductions = totalRevenue;

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
        ? `Higher commission rate applied because average net prep fee is ${formatMoney(avgFee)}, which meets or exceeds the ${formatMoney(250)} threshold.`
        : `Base commission rate applied because average net prep fee is ${formatMoney(avgFee)}, which is below the ${formatMoney(250)} threshold.`;

    const rookieReasonParts = [];

    if (isTaxVet) {
      rookieReasonParts.push("Agent is marked as a tax vet, so the rookie guarantee does not apply.");
    }

    if (!reached150) {
      rookieReasonParts.push(`Agent has ${taxesFiled} filed returns and needs 150 to qualify.`);
    }

    if (reached150 && avgFeeAt150 < 225) {
      rookieReasonParts.push(
        `At the time the agent reached 150 returns, their average net fee was ${formatMoney(avgFeeAt150)}, which is below the ${formatMoney(225)} rookie threshold.`
      );
    }

    if (qualifiedAt150) {
      rookieReasonParts.push(
        `Agent qualified at 150 returns with an average net fee of ${formatMoney(avgFeeAt150)}.`
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
      grossPrepFees,
      totalRevenue,
      avgFee,
      totalReceiptAdjustments,
      totalPrepFeeDifferenceAdjustments,
      totalUnfundedAdjustments,
      totalRefundedAdjustments,
      totalPreAckFees,
      totalArViolationFees,
      totalReferralFees,
      shadowCreditCount,
      shadowCreditRevenue,
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

    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData?.session?.user?.email ?? userEmail ?? null;

    const payload = {
      sync_key,
      referral_paid_out: d.referral_paid_out ?? base?.referral_paid_out ?? null,
      notes: d.notes ?? base?.notes ?? null,
      ar_violation_disputed: d.ar_violation_disputed ?? base?.ar_violation_disputed ?? false,
      ar_violation_dispute_explanation:
        d.ar_violation_dispute_explanation ?? base?.ar_violation_dispute_explanation ?? null,
      ar_violation_disputed_at:
        d.ar_violation_disputed_at ?? base?.ar_violation_disputed_at ?? null,
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
      setSaveState({ type: "saved", message: "There are no new changes to save." });
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

  function openArDisputeModal(row) {
    setArDisputeError("");
    setArDisputeRow(row);
    setArDisputeText(
      row?.ar_violation_dispute_explanation ||
        "My Return ID for the tax is...."
    );
    setArDisputeOpen(true);
  }

  function closeArDisputeModal() {
    setArDisputeOpen(false);
    setArDisputeRow(null);
    setArDisputeText("");
    setArDisputeError("");
    setArDisputeSubmitting(false);
  }

  async function submitArDispute() {
    if (!arDisputeRow?.sync_key) return;

    const explanation = String(arDisputeText ?? "").trim();

    if (explanation.length < 20) {
      setArDisputeError("Please enter a short explanation along with your Return ID before submitting the dispute.");
      return;
    }

    setArDisputeSubmitting(true);
    setArDisputeError("");

    const patch = {
      ar_violation_disputed: true,
      ar_violation_dispute_explanation: explanation,
      ar_violation_disputed_at: new Date().toISOString(),
    };

    setRowDraft(arDisputeRow.sync_key, patch);
    setArDisputeSubmitting(false);
    closeArDisputeModal();
  }

  function openShadowModal() {
    setShadowError("");
    setShadowSuccess("");
    setShadowForm({
      policy_number: "",
      cust_id: "",
      payment_method: "",
      receipt: "",
      charged: "",
    });
    setShadowOpen(true);
  }

  function closeShadowModal() {
    setShadowOpen(false);
    setShadowSubmitting(false);
    setShadowError("");
    setShadowSuccess("");
  }

  async function submitShadowCredit() {
    if (!supabase || !userEmail) return;

    const clean = {
      policy_number: String(shadowForm.policy_number ?? "").trim(),
      cust_id: String(shadowForm.cust_id ?? "").trim(),
      payment_method: String(shadowForm.payment_method ?? "").trim(),
      receipt: String(shadowForm.receipt ?? "").trim(),
      charged: moneyNumber(shadowForm.charged),
    };

    if (
      !clean.policy_number ||
      !clean.cust_id ||
      !clean.payment_method ||
      !clean.receipt ||
      clean.charged <= 0
    ) {
      setShadowError("Please enter Policy #, Cust ID, Payment Method, Receipt, and Charged amount.");
      return;
    }

    setShadowSubmitting(true);
    setShadowError("");
    setShadowSuccess("");

    try {
      const { data: matches, error: matchErr } = await supabase
        .from("agent_tax_commission_log")
        .select(
          "sync_key, policy_number, cust_id, payment_method, receipt, charged, agent_email, agent_name, customer"
        )
        .eq("policy_number", clean.policy_number)
        .eq("cust_id", clean.cust_id)
        .eq("receipt", clean.receipt)
        .limit(10);

      if (matchErr) throw matchErr;

      const filteredMatches = (matches ?? []).filter((row) => {
        const rowCharged = moneyNumber(row.charged);
        const enteredCharged = moneyNumber(clean.charged);
        const chargedMatches = Math.abs(rowCharged - enteredCharged) < 0.01;

        const rowPayment = String(row.payment_method ?? "").trim().toLowerCase();
        const enteredPayment = String(clean.payment_method ?? "").trim().toLowerCase();

        const paymentMatches =
          rowPayment === enteredPayment ||
          rowPayment.includes(enteredPayment) ||
          enteredPayment.includes(rowPayment);

        return chargedMatches && paymentMatches;
      });

      if (!filteredMatches.length) {
        const closePolicyMatch = matches?.length
          ? "A tax matched the Policy #, Cust ID, and Receipt, but the payment method or charged amount did not match."
          : "No tax matched the Policy #, Cust ID, and Receipt.";

        setShadowError(
          `${closePolicyMatch} Please verify Payment Method and Charged amount.`
        );
        setShadowSubmitting(false);
        return;
      }

      if (filteredMatches.length > 1) {
        setShadowError("More than one matching tax was found. Please ask a manager to review this shadow credit.");
        setShadowSubmitting(false);
        return;
      }

      const matched = filteredMatches[0];

      if (matched.agent_email === userEmail) {
        setShadowError("This tax is already under your own email, so it cannot be added as a shadow credit.");
        setShadowSubmitting(false);
        return;
      }

      const originalPreparerName = String(matched.agent_name ?? "").trim();

      if (!originalPreparerName) {
        setShadowError("The matched tax is missing the original preparer name, so this shadow credit cannot be verified.");
        setShadowSubmitting(false);
        return;
      }

      const { data: existingCredits, error: existingCreditsErr } = await supabase
        .from("tax_shadow_credits")
        .select("original_sync_key")
        .eq("shadow_agent_email", userEmail);

      if (existingCreditsErr) throw existingCreditsErr;

      const existingShadowKeys = [
        ...new Set((existingCredits ?? []).map((c) => c.original_sync_key).filter(Boolean)),
      ];

      let claimedForThisOriginalPreparer = 0;

      if (existingShadowKeys.length) {
        const { data: existingOriginalRows, error: existingOriginalRowsErr } = await supabase
          .from("agent_tax_commission_log")
          .select("sync_key, agent_name")
          .in("sync_key", existingShadowKeys);

        if (existingOriginalRowsErr) throw existingOriginalRowsErr;

        claimedForThisOriginalPreparer = (existingOriginalRows ?? []).filter((row) => {
          return (
            String(row.agent_name ?? "").trim().toLowerCase() ===
            originalPreparerName.toLowerCase()
          );
        }).length;
      }

      if (claimedForThisOriginalPreparer >= SHADOW_LIMIT_PER_ORIGINAL_PREPARER) {
        setShadowError(
          `Shadow credit limit reached for ${originalPreparerName}. You can only claim the first ${SHADOW_LIMIT_PER_ORIGINAL_PREPARER} shadowed taxes for the same original preparer.`
        );
        setShadowSubmitting(false);
        return;
      }

      const payload = {
        shadow_agent_email: userEmail,
        original_sync_key: matched.sync_key,
        policy_number: clean.policy_number,
        cust_id: clean.cust_id,
        payment_method: clean.payment_method,
        receipt: clean.receipt,
        charged: clean.charged,
      };

      const { error: insertErr } = await supabase
        .from("tax_shadow_credits")
        .insert(payload);

      if (insertErr) {
        if (String(insertErr.message || "").toLowerCase().includes("duplicate")) {
          setShadowError("This shadow credit has already been added to your commission log.");
        } else {
          setShadowError(insertErr.message || "Could not add shadow credit.");
        }
        setShadowSubmitting(false);
        return;
      }

      setShadowSuccess(
        `Shadow credit added successfully for ${originalPreparerName}. Claimed ${claimedForThisOriginalPreparer + 1}/${SHADOW_LIMIT_PER_ORIGINAL_PREPARER} for this original preparer.`
      );
      setShadowSubmitting(false);
      await fetchRows();

      setTimeout(() => {
        closeShadowModal();
      }, 800);
    } catch (e) {
      console.error(e);
      setShadowError(e.message || "Unexpected error adding shadow credit.");
      setShadowSubmitting(false);
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

        <div className="flex gap-2">
          <button
            onClick={openShadowModal}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            Add Shadowed Tax
          </button>

          <button
            onClick={fetchRows}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
          >
            Refresh Data
          </button>
        </div>
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

            <div className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300">
              Tier: <span className="font-bold text-white">{stats.tierLabel}</span>
            </div>

            <div className="text-lg text-white">{showCommissionBreakdown ? "−" : "+"}</div>
          </div>
        </button>

        <div className="grid grid-cols-1 gap-8 p-6 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-gray-400">1. Net Revenue After Deductions</p>
            <p className="text-2xl font-bold">{formatMoney(stats.totalRevenue)}</p>
            <div className="mt-2 text-xs text-gray-500">
              Gross Prep Fees: {formatMoney(stats.grossPrepFees)} <br />
              {stats.taxesFiled} Taxes Filed <br />
              Avg Net Fee: {formatMoney(stats.avgFee)}
              {stats.shadowCreditCount > 0 && (
                <>
                  <br />
                  Shadow Credits: {stats.shadowCreditCount} / {formatMoney(stats.shadowCreditRevenue)}
                </>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase text-gray-400">2. Deductions Included</p>
            <div className="mt-1 space-y-1 text-xs text-gray-300">
              <div className="flex justify-between">
                <span>Receipt Adj:</span>
                <span className="text-red-400">-{formatMoney(stats.totalReceiptAdjustments)}</span>
              </div>

              {stats.totalReceiptAdjustments > 0 && (
                <div className="ml-3 space-y-0.5 rounded border border-gray-700 bg-gray-950/40 p-2 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Prep Fee Difference:</span>
                    <span className="text-red-300">
                      -{formatMoney(stats.totalPrepFeeDifferenceAdjustments || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Unfunded:</span>
                    <span className="text-red-300">
                      -{formatMoney(stats.totalUnfundedAdjustments || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Refunded:</span>
                    <span className="text-red-300">
                      -{formatMoney(stats.totalRefundedAdjustments || 0)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <span>Pre-Ack Fees:</span>
                <span className="text-red-400">-{formatMoney(stats.totalPreAckFees)}</span>
              </div>
              <div className="flex justify-between">
                <span>AR Violations:</span>
                <span className="text-red-400">-{formatMoney(stats.totalArViolationFees)}</span>
              </div>
              <div className="flex justify-between">
                <span>Referrals:</span>
                <span className="text-red-400">-{formatMoney(stats.totalReferralFees)}</span>
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
          </div>
        </div>

        {showCommissionBreakdown && (
          <div className="border-t border-gray-700 bg-gray-950 px-6 py-5">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">Step-by-Step Formula</h3>
                <div className="space-y-2 text-sm text-gray-300">
                  <div className="flex justify-between">
                    <span>Gross Prep Fees</span>
                    <span>{formatMoney(stats.grossPrepFees)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Less Receipt Adjustments</span>
                    <span className="text-red-400">-{formatMoney(stats.totalReceiptAdjustments)}</span>
                  </div>

                  {stats.totalReceiptAdjustments > 0 && (
                    <div className="ml-4 space-y-1 rounded-lg border border-gray-800 bg-gray-950/60 p-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Prep Fee Difference</span>
                        <span className="text-red-300">
                          -{formatMoney(stats.totalPrepFeeDifferenceAdjustments || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Unfunded</span>
                        <span className="text-red-300">
                          -{formatMoney(stats.totalUnfundedAdjustments || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Refunded</span>
                        <span className="text-red-300">
                          -{formatMoney(stats.totalRefundedAdjustments || 0)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span>Less Pre-Ack Fees</span>
                    <span className="text-red-400">-{formatMoney(stats.totalPreAckFees)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Less AR Violations</span>
                    <span className="text-red-400">-{formatMoney(stats.totalArViolationFees)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Less Referral Payouts</span>
                    <span className="text-red-400">-{formatMoney(stats.totalReferralFees)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-800 pt-2 font-medium">
                    <span>Net Revenue After Deductions</span>
                    <span>{formatMoney(stats.totalRevenue)}</span>
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
                    <p className="mt-2 text-xs text-gray-400">{stats.rookieReason}</p>
                  </div>

                  <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                    <div className="flex justify-between">
                      <span className="font-medium text-white">300+ Bonus</span>
                      <span>{stats.volumeBonus > 0 ? `+${formatMoney(stats.volumeBonus)}` : "$0.00"}</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">{stats.volumeBonusReason}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {stats.blockedCount > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="text-sm font-semibold">
            {stats.blockedCount} tax returns are NOT counted toward commission.
          </p>
          <p className="mt-1 text-xs opacity-90">
            <b>Excluded Net Revenue: {formatMoney(stats.blockedRevenue)}</b> <br />
            Reason: Status is {stats.blockedReasons}.
          </p>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, office, cust id, policy #..."
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
          <table className="min-w-[1800px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr className="border-b text-xs text-gray-600">
                <th className="px-4 py-3 font-semibold">Date/Time</th>
                <th className="px-4 py-3 font-semibold">Office</th>
                <th className="px-4 py-3 font-semibold">Cust ID</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Policy #</th>
                <th className="px-4 py-3 font-semibold">Prep Fee</th>
                <th className="px-4 py-3 font-semibold">Receipt Adj.</th>
                <th className="px-4 py-3 font-semibold">Pre-Ack Fee</th>
                <th className="px-4 py-3 font-semibold">AR Violation</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold">Return Year</th>
                <th className="px-4 py-3 font-semibold">Counts?</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Fix</th>
                <th className="px-4 py-3 font-semibold">Referral Paid Out?</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={16} className="px-4 py-10 text-center text-gray-500">
                    Loading commission data…
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-4 py-10 text-center text-gray-500">
                    No rows match your filters.
                  </td>
                </tr>
              ) : (
                visibleRows.map((r) => {
                  const displayStatus = getDisplayStatus(r);
                  const blocked = !isCountsTowardCommission(r);

                  const referral = getRowValue(r, "referral_paid_out");
                  const notes = getRowValue(r, "notes") ?? "";

                  const noStatusFound = normStatus(displayStatus) === "NO STATUS FOUND";
                  const fixState = fixStatusByKey[r.sync_key];

                  const referralAmount = moneyNumber(referral);
                  const hasReferral = referralAmount > 0;

                  const rawFee = moneyNumber(r.prep_fee);
                  const receiptAdjustment = getImportedReceiptAdjustments(r);
                  const preAckDeduction = getImportedPreAckDeduction(r);
                  const arViolationDeduction = getImportedArViolationDeduction(r);
                  const totalDeductions =
                    receiptAdjustment + preAckDeduction + arViolationDeduction + referralAmount;
                  const netFee = Math.max(0, rawFee - totalDeductions);

                  const rowHasDraft = Boolean(draft[r.sync_key]);
                  const arDisputed = Boolean(getRowValue(r, "ar_violation_disputed"));

return (
                    <tr
                      key={r.display_key || r.sync_key}
                      className={cx(
                        "border-b last:border-b-0",
                        r.is_shadow_credit
                          ? "bg-indigo-50 hover:bg-indigo-100/60"
                          : blocked
                            ? "bg-amber-50"
                            : "hover:bg-gray-50/60",
                        rowHasDraft && "bg-blue-50/40"
                      )}
                    >
                      <td className="whitespace-nowrap px-4 py-3">{formatDateTime(r.date_time)}</td>
                      <td className="px-4 py-3">{r.office_code ?? ""}</td>
                      <td className="px-4 py-3">{r.cust_id ?? ""}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span>{r.customer ?? ""}</span>
                          {r.is_shadow_credit && (
                            <>
                              <span className="w-fit rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                                Shadow Credit
                              </span>
                              {r.original_agent_name && (
                                <span className="text-[10px] font-semibold text-indigo-700">
                                  Original preparer: {r.original_agent_name}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{r.policy_number || "—"}</td>

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
                              {totalDeductions > 0 ? (
                                <>
                                  <span className="text-[11px] text-gray-400 line-through">
                                    {formatMoney(rawFee)}
                                  </span>
                                  <span className="font-medium text-emerald-700">
                                    {formatMoney(netFee)}
                                  </span>
                                  <span className="text-[10px] font-medium text-red-500">
                                    -{formatMoney(totalDeductions)}
                                  </span>
                                </>
                              ) : (
                                <span>{formatMoney(rawFee)}</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-xs">
                          {receiptAdjustment > 0 ? (
                            <div className="space-y-0.5">
                              <div className="font-bold text-red-600">
                                -{formatMoney(receiptAdjustment)}
                              </div>
                              {negativeDeductionOnly(r.prep_fee_difference) > 0 && (
                                <div className="text-gray-500">
                                  Prep Fee Difference: -{formatMoney(negativeDeductionOnly(r.prep_fee_difference))}
                                </div>
                              )}
                              {negativeDeductionOnly(r.unfunded) > 0 && (
                                <div className="text-gray-500">
                                  Unfunded: -{formatMoney(negativeDeductionOnly(r.unfunded))}
                                </div>
                              )}
                              {negativeDeductionOnly(r.refunded) > 0 && (
                                <div className="text-gray-500">
                                  Refunded: -{formatMoney(negativeDeductionOnly(r.refunded))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {preAckDeduction > 0 ? (
                          <span className="font-bold text-red-600">
                            -{formatMoney(preAckDeduction)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {arViolationDeduction > 0 ? (
                            <span className="font-bold text-red-600">
                              -{formatMoney(arViolationDeduction)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}

                          {arViolationDeduction > 0 && (
                            <button
                              type="button"
                              onClick={() => openArDisputeModal(r)}
                              className={cx(
                                "w-fit rounded-lg px-2 py-1 text-[10px] font-bold",
                                arDisputed
                                  ? "bg-green-100 text-green-700"
                                  : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                              )}
                            >
                              {arDisputed ? "Disputed" : "Dispute"}
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">{r.payment_method ?? ""}</td>

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
                        <span
                          className={cx(
                            "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                            getStatusBadgeClass(displayStatus)
                          )}
                        >
                          {displayStatus || "—"}
                        </span>
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
                          value={referral || ""}
                          onChange={(e) => setRowDraft(r.sync_key, { referral_paid_out: e.target.value })}
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
                        <input
                          value={notes}
                          onChange={(e) => setRowDraft(r.sync_key, { notes: e.target.value })}
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
            * Negative receipt adjustments, Pre-Ack fees, AR violations, and referrals reduce commissionable revenue. Shadow credits are limited to 10 per original preparer.
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

      {shadowOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-semibold">Add Shadowed Tax Credit</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Enter the exact receipt details. The tax will only be added if it matches an existing Supabase record.
                </p>
              </div>
              <button onClick={closeShadowModal} className="rounded-lg border px-3 py-1 text-sm">
                Close
              </button>
            </div>

            <div className="p-5">
              <div className="rounded-xl border bg-indigo-50 p-3 text-sm text-indigo-900">
                Shadow credits use the original tax status. Policy #, Cust ID, and Receipt must match exactly.
                Payment method and charged amount are verified with flexible matching, like Wire vs Wire Transfer or 387 vs 387.00.
                You may only claim the first {SHADOW_LIMIT_PER_ORIGINAL_PREPARER} shadowed taxes for the same original preparer.
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field
                  label="POLICY #"
                  value={shadowForm.policy_number}
                  onChange={(v) => setShadowForm((p) => ({ ...p, policy_number: v }))}
                  placeholder="Policy / Return ID"
                />

                <Field
                  label="CUST ID"
                  value={shadowForm.cust_id}
                  onChange={(v) => setShadowForm((p) => ({ ...p, cust_id: v }))}
                  placeholder="Customer ID"
                />

                <Field
                  label="PAYMENT METHOD"
                  value={shadowForm.payment_method}
                  onChange={(v) => setShadowForm((p) => ({ ...p, payment_method: v }))}
                  type="select"
                  options={shadowPaymentOptions}
                />

                <Field
                  label="RECEIPT"
                  value={shadowForm.receipt}
                  onChange={(v) => setShadowForm((p) => ({ ...p, receipt: v }))}
                  placeholder="Receipt #"
                />

                <Field
                  label="CHARGED"
                  value={shadowForm.charged}
                  onChange={(v) => setShadowForm((p) => ({ ...p, charged: v }))}
                  placeholder="Example: 250 or 250.00"
                />
              </div>

              {shadowError && <p className="mt-3 text-sm text-red-600">{shadowError}</p>}
              {shadowSuccess && <p className="mt-3 text-sm text-green-700">{shadowSuccess}</p>}

              <div className="mt-5 flex justify-end gap-2">
                <button onClick={closeShadowModal} className="rounded-xl border px-4 py-2">
                  Cancel
                </button>
                <button
                  onClick={submitShadowCredit}
                  disabled={shadowSubmitting}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {shadowSubmitting ? "Checking..." : "Add Shadow Credit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {arDisputeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-semibold">Dispute AR Violation</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Use this only if the Return ID was entered as the Policy # before April 30th.
                </p>
              </div>
              <button onClick={closeArDisputeModal} className="rounded-lg border px-3 py-1 text-sm">
                Close
              </button>
            </div>

            <div className="p-5">
              <div className="rounded-xl border bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">Dispute statement:</p>
                <p className="mt-1">
                  I had the Return ID entered as the Policy # prior to April 30th.
                </p>
              </div>

              <div className="mt-4">
                <label className="text-xs font-semibold text-gray-600">Explanation</label>
                <textarea
                  value={arDisputeText}
                  onChange={(e) => setArDisputeText(e.target.value)}
                  rows={5}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Explain why this AR violation should be reviewed..."
                />
              </div>

              {arDisputeRow && (
                <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
                  <div>
                    <b>Customer:</b> {arDisputeRow.customer || "—"}
                  </div>
                  <div>
                    <b>Policy #:</b> {arDisputeRow.policy_number || "—"}
                  </div>
                  <div>
                    <b>Receipt:</b> {arDisputeRow.receipt || "—"}
                  </div>
                </div>
              )}

              {arDisputeError && <p className="mt-3 text-sm text-red-600">{arDisputeError}</p>}

              <div className="mt-5 flex justify-end gap-2">
                <button onClick={closeArDisputeModal} className="rounded-xl border px-4 py-2">
                  Cancel
                </button>
                <button
                  onClick={submitArDispute}
                  disabled={arDisputeSubmitting}
                  className="rounded-xl bg-black px-4 py-2 text-white"
                >
                  {arDisputeSubmitting ? "Submitting..." : "Submit Dispute"}
                </button>
              </div>

              <p className="mt-3 text-xs text-gray-500">
                After submitting, click <b>Save Changes</b> to store the dispute.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
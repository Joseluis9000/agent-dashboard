// src/lib/commissionEngine.js

// CONFIGURATION
export const PRE_ACK_FEE = 79.90;
export const COMMISSION_TIERS = [
  { min: 0, max: 49, label: "Tier A (0-49)", corpRate: 0.30, baseRate: 0.075, highRate: 0.10 },
  { min: 50, max: 99, label: "Tier B (50-99)", corpRate: 0.30, baseRate: 0.075, highRate: 0.10 },
  { min: 100, max: 199, label: "Tier C (100-199)", corpRate: 0.25, baseRate: 0.10, highRate: 0.125 },
  { min: 200, max: 349, label: "Tier D (200-349)", corpRate: 0.20, baseRate: 0.125, highRate: 0.15 },
  { min: 350, max: 9999, label: "Tier E (350+)", corpRate: 0.20, baseRate: 0.20, highRate: 0.20 },
];

const BLOCKED_STATUSES = new Set(["NO STATUS FOUND", "REJECTED", "COMPLETE", "REVIEW", "IN PROGRESS"]);

// HELPERS

// ✅ ADDED THIS MISSING EXPORT
export function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

export function normalizeBoolSelect(v) {
  if (v === "" || v === null || v === undefined) return null;
  if (v === "yes" || v === true) return true;
  if (v === "no" || v === false) return false;
  return null;
}

export function normStatus(s) {
  return String(s ?? "").trim().toUpperCase();
}

export function formatMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

export function getStatusBadgeClass(status) {
  const s = normStatus(status);
  switch (s) {
    case "ACCEPTED": case "TRANSMITTED": return "bg-green-100 text-green-800";
    case "COMPLETE": return "bg-teal-100 text-teal-800";
    case "IN PROGRESS": return "bg-blue-100 text-blue-800";
    case "PAPER": return "bg-stone-100 text-stone-700";
    case "REJECTED": return "bg-red-100 text-red-800";
    case "REVIEW": return "bg-purple-100 text-purple-800";
    case "NO STATUS FOUND": return "bg-red-50 text-red-600";
    default: return "bg-gray-100 text-gray-600";
  }
}

// CORE CALCULATION ENGINE
export function calculateCommissionStats(rows) {
  const eligible = [];
  let blockedCount = 0;
  let blockedRevenue = 0;
  
  // 1. Filter
  for (const r of rows) {
    const fee = Number(r.prep_fee) || 0;
    const s = normStatus(r.status);
    
    if (!BLOCKED_STATUSES.has(s)) {
      eligible.push(r);
    } else {
      blockedCount++;
      blockedRevenue += fee;
    }
  }

  // 2. Aggregate Eligible
  let totalRevenue = 0;
  let preAckCount = 0;
  let totalReferralFees = 0;

  eligible.forEach(r => {
    totalRevenue += (Number(r.prep_fee) || 0);
    if (normalizeBoolSelect(r.pre_ack_advance)) preAckCount++;
    const ref = Number(r.referral_paid_out);
    if (!Number.isNaN(ref) && ref > 0) totalReferralFees += ref;
  });

  const taxesFiled = eligible.length;
  const avgFee = taxesFiled > 0 ? totalRevenue / taxesFiled : 0;

  // 3. Deductions & Base
  const totalPreAckFees = preAckCount * PRE_ACK_FEE;
  const revenueAfterDeductions = totalRevenue - totalPreAckFees - totalReferralFees;

  // 4. Tiers
  const activeTier = COMMISSION_TIERS.find(t => taxesFiled >= t.min && taxesFiled <= t.max) || COMMISSION_TIERS[0];
  const corporateFee = revenueAfterDeductions * activeTier.corpRate;
  const commissionBase = revenueAfterDeductions - corporateFee;
  const commissionRate = avgFee >= 250 ? activeTier.highRate : activeTier.baseRate;
  
  const earnedCommission = commissionBase * commissionRate;

  // 5. Bonuses
  let volumeBonus = taxesFiled >= 300 ? 1000.00 : 0;
  
  let guaranteeAdjustment = 0;
  const isRookieEligible = taxesFiled >= 150 && avgFee >= 225.00;
  if (isRookieEligible) {
    const avgComm = taxesFiled > 0 ? earnedCommission / taxesFiled : 0;
    const valFirst150 = avgComm * 150;
    if (valFirst150 < 5000) guaranteeAdjustment = 5000.00 - valFirst150;
  }

  return {
    taxesFiled, blockedCount, blockedRevenue, totalRevenue, avgFee,
    preAckCount, totalPreAckFees, totalReferralFees, revenueAfterDeductions,
    tierLabel: activeTier.label, corpFeeRate: activeTier.corpRate, corporateFee,
    commissionBase, commissionRate, earnedCommission, volumeBonus,
    guaranteeAdjustment, isRookieEligible,
    totalCommission: earnedCommission + volumeBonus + guaranteeAdjustment
  };
}
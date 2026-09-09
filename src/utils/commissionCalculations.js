export const COMMISSION_CONFIG = {
  royaltyRate: 0.2,
  minimumNetRevenue: 500,

  tiers: {
    tier1: {
      name: "Tier 1",
      rate: 0.1,
      nbRequired: 8,
      revenueRequired: 2500,
    },

    tier2: {
      name: "Tier 2",
      rate: 0.125,
      nbRequired: 17,
      revenueRequired: 3500,
      revenueOnlyRequired: 5000,
    },

    tier3: {
      name: "Tier 3",
      rate: 0.15,
      nbRequired: 24,
      revenueRequired: 5000,
    },
  },
};

export const COMMISSION_FEE_TYPES = [
  "BROKER FEE",
  "ENDORSEMENT FEE",
  "REINSTATEMENT FEE",
  "RENEWAL FEE",
];

export function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function roundMoney(value) {
  return Math.round(
    (toNumber(value) + Number.EPSILON) * 100
  ) / 100;
}

export function formatDateKey(date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function addDaysKey(
  dateKey,
  days
) {
  if (!dateKey) return "";

  const [
    year,
    month,
    day,
  ] = dateKey
    .split("-")
    .map(Number);

  const date = new Date(
    year,
    month - 1,
    day
  );

  date.setDate(
    date.getDate() + days
  );

  return formatDateKey(date);
}

export function getWeekRange(
  inputDate = new Date()
) {
  const date =
    inputDate instanceof Date
      ? new Date(inputDate)
      : new Date(
          `${inputDate}T12:00:00`
        );

  const day =
    date.getDay();

  const differenceToMonday =
    day === 0
      ? -6
      : 1 - day;

  const monday =
    new Date(date);

  monday.setDate(
    date.getDate() +
      differenceToMonday
  );

  const sunday =
    new Date(monday);

  sunday.setDate(
    monday.getDate() + 6
  );

  return {
    weekStart:
      formatDateKey(monday),

    weekEnd:
      formatDateKey(sunday),
  };
}

export function getCommissionFeeType(
  row
) {
  const company =
    normalizeText(
      row?.company
    );

  if (
    company.includes(
      "BROKER FEE"
    )
  ) {
    return "BROKER FEE";
  }

  if (
    company.includes(
      "ENDORSEMENT FEE"
    )
  ) {
    return "ENDORSEMENT FEE";
  }

  if (
    company.includes(
      "REINSTATEMENT FEE"
    )
  ) {
    return "REINSTATEMENT FEE";
  }

  if (
    company.includes(
      "RENEWAL FEE"
    )
  ) {
    return "RENEWAL FEE";
  }

  return null;
}

export function isVoidedTransaction(
  row
) {
  return normalizeText(
    row?.voided
  ).includes(
    "VOIDED"
  );
}

export function getTransactionKey(
  row
) {
  if (row?.sync_key) {
    return String(
      row.sync_key
    );
  }

  return [
    row?.receipt_id,
    row?.customer_id,
    row?.company,
    row?.type,
    row?.premium,
    row?.fee,
    row?.total,
  ]
    .map(
      (value) =>
        String(
          value ?? ""
        ).trim()
    )
    .join("|");
}

export function getValidTransactions(
  rows = []
) {
  const seen =
    new Set();

  const validRows =
    [];

  for (const row of rows) {
    if (!row) continue;

    if (
      isVoidedTransaction(
        row
      )
    ) {
      continue;
    }

    const key =
      getTransactionKey(
        row
      );

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    validRows.push(
      row
    );
  }

  return validRows;
}

export function getActiveFeeRows(
  rows = []
) {
  const validRows =
    getValidTransactions(
      rows
    );

  const feeRows =
    validRows.filter(
      (row) =>
        getCommissionFeeType(
          row
        )
    );

  // Reversals/negative fee rows are matched inside the same receipt
  // and fee category.
  //
  // This prevents a $100 reversal on receipt A from accidentally
  // cancelling a different $100 Broker Fee on receipt B.

  const grouped = {};

  for (const row of feeRows) {
    const category =
      getCommissionFeeType(row);

    const receiptId =
      String(
        row?.receipt_id ?? ""
      ).trim();

    const fallback =
      getTransactionKey(row);

    const groupKey =
      `${category}|${receiptId || fallback}`;

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        category,
        positive: [],
        negative: [],
      };
    }

    const amount =
      toNumber(row.fee);

    if (amount > 0) {
      grouped[groupKey]
        .positive
        .push(row);
    } else if (amount < 0) {
      grouped[groupKey]
        .negative
        .push(row);
    }
  }

  const activeRows = [];

  Object.values(
    grouped
  ).forEach(
    (group) => {
      const negatives = [
        ...group.negative,
      ];

      for (
        const positiveRow
        of group.positive
      ) {
        const positiveAmount =
          roundMoney(
            Math.abs(
              toNumber(
                positiveRow.fee
              )
            )
          );

        const matchingNegativeIndex =
          negatives.findIndex(
            (negativeRow) =>
              roundMoney(
                Math.abs(
                  toNumber(
                    negativeRow.fee
                  )
                )
              ) ===
              positiveAmount
          );

        if (
          matchingNegativeIndex >=
          0
        ) {
          negatives.splice(
            matchingNegativeIndex,
            1
          );

          continue;
        }

        activeRows.push({
          ...positiveRow,

          commission_fee_type:
            group.category,
        });
      }
    }
  );

  return activeRows;
}

export function calculateFeeBreakdown(
  rows = []
) {
  const validRows =
    getValidTransactions(
      rows
    );

  const activeFeeRows =
    getActiveFeeRows(
      validRows
    );

  const breakdown = {
    brokerFee: {
      revenue: 0,
      count: 0,
    },

    endorsementFee: {
      revenue: 0,
      count: 0,
    },

    reinstatementFee: {
      revenue: 0,
      count: 0,
    },

    renewalFee: {
      revenue: 0,
      count: 0,
    },
  };

  for (
    const row of validRows
  ) {
    const category =
      getCommissionFeeType(
        row
      );

    const amount =
      toNumber(
        row.fee
      );

    if (
      category ===
      "BROKER FEE"
    ) {
      breakdown
        .brokerFee
        .revenue +=
        amount;
    }

    if (
      category ===
      "ENDORSEMENT FEE"
    ) {
      breakdown
        .endorsementFee
        .revenue +=
        amount;
    }

    if (
      category ===
      "REINSTATEMENT FEE"
    ) {
      breakdown
        .reinstatementFee
        .revenue +=
        amount;
    }

    if (
      category ===
      "RENEWAL FEE"
    ) {
      breakdown
        .renewalFee
        .revenue +=
        amount;
    }
  }

  for (
    const row of activeFeeRows
  ) {
    const category =
      row.commission_fee_type;

    if (
      category ===
      "BROKER FEE"
    ) {
      breakdown
        .brokerFee
        .count += 1;
    }

    if (
      category ===
      "ENDORSEMENT FEE"
    ) {
      breakdown
        .endorsementFee
        .count += 1;
    }

    if (
      category ===
      "REINSTATEMENT FEE"
    ) {
      breakdown
        .reinstatementFee
        .count += 1;
    }

    if (
      category ===
      "RENEWAL FEE"
    ) {
      breakdown
        .renewalFee
        .count += 1;
    }
  }

  Object.values(
    breakdown
  ).forEach(
    (item) => {
      item.revenue =
        roundMoney(
          item.revenue
        );
    }
  );

  return {
    breakdown,
    activeFeeRows,
  };
}

export function groupTransactionsByReceipt(
  rows = []
) {
  const groups =
    new Map();

  for (
    const row of rows
  ) {
    const receiptId =
      String(
        row?.receipt_id ??
          ""
      ).trim();

    if (!receiptId) {
      continue;
    }

    if (
      !groups.has(
        receiptId
      )
    ) {
      groups.set(
        receiptId,
        []
      );
    }

    groups
      .get(
        receiptId
      )
      .push(
        row
      );
  }

  return groups;
}

export function getGrossNbReceipts(
  rows = []
) {
  const validRows =
    getValidTransactions(
      rows
    );

  const activeFeeRows =
    getActiveFeeRows(
      validRows
    );

  const activeBrokerReceipts =
    new Set(
      activeFeeRows
        .filter(
          (row) =>
            row.commission_fee_type ===
            "BROKER FEE"
        )
        .map(
          (row) =>
            String(
              row.receipt_id ??
                ""
            ).trim()
        )
        .filter(
          Boolean
        )
    );

  const grouped =
    groupTransactionsByReceipt(
      validRows
    );

  const qualifyingReceipts =
    new Set();

  grouped.forEach(
    (
      receiptRows,
      receiptId
    ) => {
      const hasNewBusiness =
        receiptRows.some(
          (row) => {
            const type =
              normalizeText(
                row.type
              );

            return (
              type ===
                "NEW" ||
              type ===
                "RWR"
            );
          }
        );

      const hasActiveBrokerFee =
        activeBrokerReceipts.has(
          receiptId
        );

      if (
        hasNewBusiness &&
        hasActiveBrokerFee
      ) {
        qualifyingReceipts.add(
          receiptId
        );
      }
    }
  );

  return qualifyingReceipts;
}

export function getActiveDisqualifications(
  disqualifiedPolicies = []
) {
  const inactiveStatuses =
    new Set([
      "VOIDED",
      "RESOLVED",
      "CLEARED",
      "REMOVED",
      "REINSTATED",
      "CLOSED",
    ]);

  return disqualifiedPolicies.filter(
    (row) =>
      !inactiveStatuses.has(
        normalizeText(
          row?.status
        )
      )
  );
}

export function getDisqualifiedNbReceipts({
  transactions = [],
  disqualifiedPolicies = [],
  grossNbReceipts = new Set(),
}) {
  const validTransactions =
    getValidTransactions(
      transactions
    );

  const activeDisqualified =
    getActiveDisqualifications(
      disqualifiedPolicies
    );

  const transactionsBySyncKey =
    new Map();

  for (
    const row
    of validTransactions
  ) {
    if (
      !row?.sync_key
    ) {
      continue;
    }

    transactionsBySyncKey.set(
      String(
        row.sync_key
      ),
      row
    );
  }

  const disqualifiedReceipts =
    new Set();

  for (
    const disqualified
    of activeDisqualified
  ) {
    const linkedSyncKey =
      String(
        disqualified
          ?.linked_sync_key ??
          ""
      ).trim();

    if (
      !linkedSyncKey
    ) {
      continue;
    }

    const linkedTransaction =
      transactionsBySyncKey.get(
        linkedSyncKey
      );

    if (
      !linkedTransaction
    ) {
      continue;
    }

    const receiptId =
      String(
        linkedTransaction
          .receipt_id ??
          ""
      ).trim();

    if (
      !receiptId
    ) {
      continue;
    }

    if (
      grossNbReceipts.has(
        receiptId
      )
    ) {
      disqualifiedReceipts.add(
        receiptId
      );
    }
  }

  return disqualifiedReceipts;
}

export function getActiveViolations(
  violations = []
) {
  return violations.filter(
    (row) =>
      normalizeText(
        row?.status
      ) !==
      "VOIDED"
  );
}

export function calculateViolationDeductions(
  violations = []
) {
  const activeViolations =
    getActiveViolations(
      violations
    );

  const total =
    activeViolations.reduce(
      (
        sum,
        violation
      ) =>
        sum +
        toNumber(
          violation
            ?.fee_amount ??
            violation?.fee ??
            violation?.amount
        ),
      0
    );

  return {
    activeViolations,

    violationCount:
      activeViolations.length,

    totalDeductions:
      roundMoney(
        total
      ),
  };
}

export function determineCommissionTier({
  netNbCount = 0,
  grossRevenue = 0,
  netRevenue = 0,
}) {
  const {
    minimumNetRevenue,
    tiers,
  } =
    COMMISSION_CONFIG;

  if (
    netRevenue <
    minimumNetRevenue
  ) {
    return {
      tier: 0,
      tierName:
        "No Tier",
      commissionRate: 0,
    };
  }

  if (
    netNbCount >=
      tiers
        .tier3
        .nbRequired &&
    grossRevenue >=
      tiers
        .tier3
        .revenueRequired
  ) {
    return {
      tier: 3,

      tierName:
        tiers
          .tier3
          .name,

      commissionRate:
        tiers
          .tier3
          .rate,
    };
  }

  if (
    (
      netNbCount >=
        tiers
          .tier2
          .nbRequired &&
      grossRevenue >=
        tiers
          .tier2
          .revenueRequired
    ) ||
    grossRevenue >=
      tiers
        .tier2
        .revenueOnlyRequired
  ) {
    return {
      tier: 2,

      tierName:
        tiers
          .tier2
          .name,

      commissionRate:
        tiers
          .tier2
          .rate,
    };
  }

  if (
    netNbCount >=
      tiers
        .tier1
        .nbRequired ||
    grossRevenue >=
      tiers
        .tier1
        .revenueRequired
  ) {
    return {
      tier: 1,

      tierName:
        tiers
          .tier1
          .name,

      commissionRate:
        tiers
          .tier1
          .rate,
    };
  }

  return {
    tier: 0,
    tierName:
      "No Tier",
    commissionRate: 0,
  };
}

export function calculateNextTierProgress({
  tier = 0,
  netNbCount = 0,
  grossRevenue = 0,
}) {
  const {
    tiers,
  } =
    COMMISSION_CONFIG;

  if (
    tier >= 3
  ) {
    return {
      nextTier: null,

      message:
        "You reached the highest commission tier.",

      nbNeeded: 0,
      revenueNeeded: 0,
    };
  }

  if (
    tier === 0
  ) {
    const nbNeeded =
      Math.max(
        tiers
          .tier1
          .nbRequired -
          netNbCount,
        0
      );

    const revenueNeeded =
      Math.max(
        tiers
          .tier1
          .revenueRequired -
          grossRevenue,
        0
      );

    return {
      nextTier: 1,

      nextTierName:
        tiers
          .tier1
          .name,

      nextRate:
        tiers
          .tier1
          .rate,

      nbNeeded,
      revenueNeeded,

      message:
        `Tier 1 requires ` +
        `${tiers.tier1.nbRequired} Net NB ` +
        `OR $${tiers.tier1.revenueRequired.toLocaleString()} Gross Revenue.`,
    };
  }

  if (
    tier === 1
  ) {
    const nbNeeded =
      Math.max(
        tiers
          .tier2
          .nbRequired -
          netNbCount,
        0
      );

    const revenueNeeded =
      Math.max(
        tiers
          .tier2
          .revenueRequired -
          grossRevenue,
        0
      );

    const revenueOnlyNeeded =
      Math.max(
        tiers
          .tier2
          .revenueOnlyRequired -
          grossRevenue,
        0
      );

    return {
      nextTier: 2,

      nextTierName:
        tiers
          .tier2
          .name,

      nextRate:
        tiers
          .tier2
          .rate,

      nbNeeded,
      revenueNeeded,
      revenueOnlyNeeded,

      message:
        `Tier 2 requires ` +
        `${tiers.tier2.nbRequired} Net NB AND ` +
        `$${tiers.tier2.revenueRequired.toLocaleString()} Gross Revenue, ` +
        `OR $${tiers.tier2.revenueOnlyRequired.toLocaleString()} Gross Revenue.`,
    };
  }

  const nbNeeded =
    Math.max(
      tiers
        .tier3
        .nbRequired -
        netNbCount,
      0
    );

  const revenueNeeded =
    Math.max(
      tiers
        .tier3
        .revenueRequired -
        grossRevenue,
      0
    );

  return {
    nextTier: 3,

    nextTierName:
      tiers
        .tier3
        .name,

    nextRate:
      tiers
        .tier3
        .rate,

    nbNeeded,
    revenueNeeded,

    message:
      `Tier 3 requires ` +
      `${tiers.tier3.nbRequired} Net NB AND ` +
      `$${tiers.tier3.revenueRequired.toLocaleString()} Gross Revenue.`,
  };
}

export function calculateAgentCommission({
  transactions = [],
  violations = [],
  disqualifiedPolicies = [],

  grossPay = 0,

  isLicensedCaDoi = true,

  weekStart = null,
} = {}) {
  const validTransactions =
    getValidTransactions(
      transactions
    );

  const {
    breakdown,
    activeFeeRows,
  } =
    calculateFeeBreakdown(
      validTransactions
    );

  const brokerFeeRevenue =
    breakdown
      .brokerFee
      .revenue;

  const endorsementFeeRevenue =
    breakdown
      .endorsementFee
      .revenue;

  const reinstatementFeeRevenue =
    breakdown
      .reinstatementFee
      .revenue;

  const renewalFeeRevenue =
    breakdown
      .renewalFee
      .revenue;

  const brokerFeeCount =
    breakdown
      .brokerFee
      .count;

  const endorsementFeeCount =
    breakdown
      .endorsementFee
      .count;

  const reinstatementFeeCount =
    breakdown
      .reinstatementFee
      .count;

  const renewalFeeCount =
    breakdown
      .renewalFee
      .count;

  const grossRevenue =
    roundMoney(
      brokerFeeRevenue +
        endorsementFeeRevenue +
        reinstatementFeeRevenue +
        renewalFeeRevenue
    );

  const netFeeItemCount =
    brokerFeeCount +
    endorsementFeeCount +
    reinstatementFeeCount +
    renewalFeeCount;

  const grossNbReceipts =
    getGrossNbReceipts(
      validTransactions
    );

  const grossNbCount =
    grossNbReceipts.size;

  const activeDisqualifiedPolicies =
    getActiveDisqualifications(
      disqualifiedPolicies
    );

  const disqualifiedNbReceipts =
    getDisqualifiedNbReceipts({
      transactions:
        validTransactions,

      disqualifiedPolicies:
        activeDisqualifiedPolicies,

      grossNbReceipts,
    });

  const disqualifiedNbCount =
    disqualifiedNbReceipts.size;

  const netNbCount =
    Math.max(
      grossNbCount -
        disqualifiedNbCount,
      0
    );

  const grossPayAmount =
    roundMoney(
      grossPay
    );

  const royaltyDeduction =
    roundMoney(
      grossRevenue *
        COMMISSION_CONFIG
          .royaltyRate
    );

  const netRevenue =
    roundMoney(
      grossRevenue -
        royaltyDeduction -
        grossPayAmount
    );

  const {
    tier,
    tierName,
    commissionRate,
  } =
    determineCommissionTier({
      netNbCount,
      grossRevenue,
      netRevenue,
    });

  const basePayout =
    netRevenue >=
    COMMISSION_CONFIG
      .minimumNetRevenue
      ? roundMoney(
          netRevenue *
            commissionRate
        )
      : 0;

  const {
    activeViolations,
    violationCount,
    totalDeductions,
  } =
    calculateViolationDeductions(
      violations
    );

  // Current-week violations are taken from the commission first.
  //
  // Commission never goes negative. Any amount that cannot be covered
  // remains in the AR / Scanning ledger for future repayment.

  const calculatedWeeklyCommission =
    roundMoney(
      Math.max(
        0,
        basePayout -
          totalDeductions
      )
    );

  // This is the amount available AFTER the current commission week's
  // violations have been deducted but BEFORE carried AR / Scanning
  // balances are applied FIFO.
  //
  // The actual carried-balance payment is handled by the publish RPC.

  const commissionBeforeBalance =
    isLicensedCaDoi
      ? calculatedWeeklyCommission
      : 0;

  // Until the week is published, carried balances have not actually
  // been applied yet.
  //
  // Admin can preview the projected FIFO deduction separately.

  const finalPayableCommission =
    commissionBeforeBalance;

  let status =
    "Payable";

  if (
    netRevenue <
    COMMISSION_CONFIG
      .minimumNetRevenue
  ) {
    status =
      "No Commission - Below $500 Net Revenue Threshold";
  } else if (
    commissionRate === 0
  ) {
    status =
      "No Commission - Did Not Meet Tier Requirements";
  } else if (
    !isLicensedCaDoi
  ) {
    status =
      "Withheld - Unlicensed";
  } else if (
    basePayout > 0 &&
    calculatedWeeklyCommission <= 0 &&
    totalDeductions > 0
  ) {
    status =
      "No Cash Commission - Violations Applied";
  }

  let weekEnd =
    null;

  let payoutDate =
    null;

  if (
    weekStart
  ) {
    weekEnd =
      addDaysKey(
        weekStart,
        6
      );

    // Production runs Monday through Sunday.
    //
    // The commission is paid on Friday two weeks later.
    //
    // Example:
    //
    // Production:
    // 8/24/2026 - 8/30/2026
    //
    // Payday:
    // 9/11/2026

    payoutDate =
      addDaysKey(
        weekStart,
        18
      );
  }

  const nextTierProgress =
    calculateNextTierProgress({
      tier,
      netNbCount,
      grossRevenue,
    });

  return {
    grossRevenue,

    grossPay:
      grossPayAmount,

    royaltyDeduction,

    royaltyRate:
      COMMISSION_CONFIG
        .royaltyRate,

    netRevenue,

    brokerFeeRevenue,
    endorsementFeeRevenue,
    reinstatementFeeRevenue,
    renewalFeeRevenue,

    brokerFeeCount,
    endorsementFeeCount,
    reinstatementFeeCount,
    renewalFeeCount,

    netFeeItemCount,

    grossNbCount,
    disqualifiedNbCount,
    netNbCount,

    grossNbReceipts:
      Array.from(
        grossNbReceipts
      ),

    disqualifiedNbReceipts:
      Array.from(
        disqualifiedNbReceipts
      ),

    tier,
    tierName,

    commissionRate,

    commissionPercent:
      commissionRate * 100,

    nextTierProgress,

    basePayout,

    totalDeductions,

    calculatedWeeklyCommission,

    // Commission after CURRENT-WEEK violations
    // but before older AR / Scanning balances.

    commissionBeforeBalance,

    // These remain zero/draft values inside the pure calculator.
    //
    // The publish workflow applies actual carried AR / SV FIFO and
    // stores balance_applied + final_payable_commission.

    balanceApplied: 0,

    cashCommissionPayable:
      finalPayableCommission,

    finalPayableCommission,

    violationCount,
    activeViolations,

    disqualifiedCount:
      activeDisqualifiedPolicies.length,

    activeDisqualifiedPolicies,

    validTransactionCount:
      validTransactions.length,

    activeFeeRows,

    isLicensedCaDoi,

    weekStart,
    weekEnd,
    payoutDate,

    status,
  };
}

export default calculateAgentCommission;
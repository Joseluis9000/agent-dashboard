import React, { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./AdminTaxWip.module.css";
import { supabase } from "../../supabaseClient";

const TABLE_TRANSFERS = "daily_eod_transfers";
const TABLE_VIOLATIONS = "violations";
const TABLE_DISQUALIFIED = "disqualified_policies";
const TABLE_COMMISSION_RECORDS = "agent_commission_records";

const debugTh = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #cbd5e1",
  fontWeight: 900,
  color: "#334155",
  whiteSpace: "nowrap",
};

const debugTd = {
  padding: "9px 8px",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

async function fetchAllSupabaseRows(buildQuery, pageSize = 1000, maxRows = 200000) {
  let from = 0;
  let allRows = [];

  while (from < maxRows) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;

    const chunk = data || [];
    allRows = allRows.concat(chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCompany(value) {
  return normalizeText(value).replace(/\s+/g, " ").toLowerCase();
}

function toNumber(value) {
  const num = parseFloat(value);
  return Number.isNaN(num) ? 0 : num;
}

function toDateKey(dateInput) {
  const d = new Date(dateInput);
  return d.toISOString().split("T")[0];
}

function addDays(dateInput, days) {
  const d = new Date(`${String(dateInput).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d;
}

function addDaysKey(dateInput, days) {
  return toDateKey(addDays(dateInput, days));
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString();
}

function formatWeekday(value) {
  if (!value) return "—";
  return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(
    undefined,
    { weekday: "long" }
  );
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function formatDateTime(value) {
  if (!value || value === "—") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }
  return "—";
}

function getWeekRange(date) {
  const d = new Date(date);
  const todayUTC = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  const dayOfWeek = todayUTC.getUTCDay();
  const diff = todayUTC.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
  const sunday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff + 6));

  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
}

function buildMissedBy(result) {
  if (!result) return "—";
  if (result.Net_Revenue < 500) return `${money(500 - result.Net_Revenue)} short of $500 net revenue`;
  if (result.Commission_Rate > 0) return "Qualified";

  const nbShort = Math.max(10 - result.Net_NB_Count, 0);
  const revenueShort = Math.max(2500 - result.Gross_Revenue, 0);
  const parts = [];

  if (nbShort > 0) parts.push(`${nbShort} NB short`);
  if (revenueShort > 0) parts.push(`${money(revenueShort)} revenue short`);

  return parts.length ? parts.join(" / ") : "Did not meet tier rules";
}

function calculateAgentCommission({
  transfersData = [],
  violationsData = [],
  disqualifiedData = [],
  grossPayInput = 0,
  isLicensedCaDoi = false,
  weekStartDateInput,
}) {
  const TARGET_FEE_HEADERS = [
    "Broker Fee",
    "Endorsement Fee",
    "Reinstatement Fee",
    "Renewal Fee",
  ];

  const TARGET_FEE_LOOKUP = TARGET_FEE_HEADERS.reduce((acc, header) => {
    acc[normalizeCompany(header)] = header;
    return acc;
  }, {});

  const getFeeHeader = (row) => TARGET_FEE_LOOKUP[normalizeCompany(row.company)] || "";

  const weekStartDate = toDateKey(weekStartDateInput);
  const weekEndDate = toDateKey(addDays(weekStartDateInput, 6));
  const payoutDate = toDateKey(addDays(weekEndDate, 14));

  const rowsByReceipt = transfersData.reduce((acc, row, index) => {
    const receiptId = row.receipt_id || `NO_RECEIPT_${row.sync_key || index}`;
    if (!acc[receiptId]) acc[receiptId] = [];
    acc[receiptId].push(row);
    return acc;
  }, {});

  const targetFeeRows = transfersData.filter((row) => Boolean(getFeeHeader(row)));

  const countUncancelledPositiveFees = (rows) => {
    const rowsByCompany = rows.reduce((acc, row) => {
      const company = getFeeHeader(row) || normalizeText(row.company);
      if (!acc[company]) acc[company] = [];
      acc[company].push(row);
      return acc;
    }, {});

    let count = 0;

    Object.values(rowsByCompany).forEach((companyRows) => {
      const positives = companyRows
        .filter((row) => toNumber(row.fee) > 0)
        .map((row) => toNumber(row.fee));

      const negatives = companyRows
        .filter((row) => toNumber(row.fee) < 0)
        .map((row) => Math.abs(toNumber(row.fee)));

      const usedPositiveIndexes = new Set();

      negatives.forEach((negativeAmount) => {
        const matchIndex = positives.findIndex(
          (positiveAmount, index) =>
            positiveAmount === negativeAmount &&
            !usedPositiveIndexes.has(index)
        );
        if (matchIndex !== -1) usedPositiveIndexes.add(matchIndex);
      });

      positives.forEach((_, index) => {
        if (!usedPositiveIndexes.has(index)) count += 1;
      });
    });

    return count;
  };

  const buildFeeBreakdown = () => {
    const breakdown = {};

    TARGET_FEE_HEADERS.forEach((header) => {
      const rows = targetFeeRows.filter((row) => getFeeHeader(row) === header);
      const revenue = rows.reduce((sum, row) => sum + toNumber(row.fee), 0);
      const count = countUncancelledPositiveFees(rows);

      breakdown[header] = {
        revenue: Number(revenue.toFixed(2)),
        count,
      };
    });

    return breakdown;
  };

  const feeBreakdown = buildFeeBreakdown();

  const grossRevenue = TARGET_FEE_HEADERS.reduce(
    (sum, header) => sum + feeBreakdown[header].revenue,
    0
  );

  const netFeeItemCount = TARGET_FEE_HEADERS.reduce(
    (sum, header) => sum + feeBreakdown[header].count,
    0
  );

  const syncKeyToTransferRow = transfersData.reduce((acc, row) => {
    if (row.sync_key) acc[row.sync_key] = row;
    return acc;
  }, {});

  const grossNewBusinessReceiptIds = new Set();

  Object.entries(rowsByReceipt).forEach(([receiptId, receiptRows]) => {
    const hasNewBusiness = receiptRows.some((row) =>
      ["NEW", "RWR"].includes(normalizeText(row.type).toUpperCase())
    );

    if (!hasNewBusiness) return;

    const brokerFeeRows = receiptRows.filter((row) => getFeeHeader(row) === "Broker Fee");
    const activeBrokerFeeCount = countUncancelledPositiveFees(brokerFeeRows);

    if (activeBrokerFeeCount > 0) grossNewBusinessReceiptIds.add(receiptId);
  });

  const grossNbCount = grossNewBusinessReceiptIds.size;

  const validDisqualifiedRows = disqualifiedData.filter(
    (row) => normalizeText(row.status).toLowerCase() !== "voided"
  );

  const disqualifiedNewBusinessReceiptIds = new Set();

  validDisqualifiedRows.forEach((disqualifiedRow) => {
    const linkedTransfer = syncKeyToTransferRow[disqualifiedRow.linked_sync_key];
    if (!linkedTransfer?.receipt_id) return;

    const receiptRows = rowsByReceipt[linkedTransfer.receipt_id] || [];
    const isNewBusinessReceipt = receiptRows.some((row) =>
      ["NEW", "RWR"].includes(normalizeText(row.type).toUpperCase())
    );

    if (isNewBusinessReceipt) disqualifiedNewBusinessReceiptIds.add(linkedTransfer.receipt_id);
  });

  const disqualifiedNbCount = disqualifiedNewBusinessReceiptIds.size;
  const netNbCount = Math.max(grossNbCount - disqualifiedNbCount, 0);

  const grossPay = toNumber(grossPayInput);
  const royaltyDeduction = grossRevenue * 0.2;
  const netRevenue = grossRevenue - royaltyDeduction - grossPay;

  let commissionRate = 0;
  let tier = "Tier 0";

  if (netRevenue >= 500) {
    if (netNbCount >= 24 && grossRevenue >= 5000) {
      commissionRate = 0.15;
      tier = "Tier 3";
    } else if ((netNbCount >= 17 && grossRevenue >= 3500) || grossRevenue >= 5000) {
      commissionRate = 0.125;
      tier = "Tier 2";
    } else if (netNbCount >= 10 || grossRevenue >= 2500) {
      commissionRate = 0.1;
      tier = "Tier 1";
    }
  }

  const basePayout = netRevenue >= 500 ? netRevenue * commissionRate : 0;

  const validViolations = violationsData.filter(
    (row) => normalizeText(row.status).toLowerCase() !== "voided"
  );

  const totalDeductions = validViolations.reduce(
    (sum, row) => sum + toNumber(row.fee_amount),
    0
  );

  const calculatedWeeklyCommission = basePayout - totalDeductions;
  const finalPayableCommission = isLicensedCaDoi ? calculatedWeeklyCommission : 0;

  let status = "Payable";

  if (netRevenue < 500) {
    status = "No Commission - Below $500 Net Revenue Threshold";
  } else if (commissionRate === 0) {
    status = "No Commission - Did Not Meet Tier Requirements";
  } else if (!isLicensedCaDoi) {
    status = "Withheld - Unlicensed";
  }

  const result = {
    Gross_Revenue: Number(grossRevenue.toFixed(2)),
    Gross_Pay: Number(grossPay.toFixed(2)),
    Royalty_Deduction: Number(royaltyDeduction.toFixed(2)),

    Broker_Fee_Revenue: feeBreakdown["Broker Fee"].revenue,
    Broker_Fee_Count: feeBreakdown["Broker Fee"].count,
    Endorsement_Fee_Revenue: feeBreakdown["Endorsement Fee"].revenue,
    Endorsement_Fee_Count: feeBreakdown["Endorsement Fee"].count,
    Reinstatement_Fee_Revenue: feeBreakdown["Reinstatement Fee"].revenue,
    Reinstatement_Fee_Count: feeBreakdown["Reinstatement Fee"].count,
    Renewal_Fee_Revenue: feeBreakdown["Renewal Fee"].revenue,
    Renewal_Fee_Count: feeBreakdown["Renewal Fee"].count,
    Fee_Breakdown: feeBreakdown,

    Gross_NB_Count: grossNbCount,
    Disqualified_NB_Count: disqualifiedNbCount,
    Net_NB_Count: netNbCount,
    Net_Fee_Item_Count: netFeeItemCount,

    Net_Revenue: Number(netRevenue.toFixed(2)),
    Tier: tier,
    Commission_Rate: commissionRate,
    Base_Payout: Number(basePayout.toFixed(2)),
    Total_Deductions: Number(totalDeductions.toFixed(2)),
    Calculated_Weekly_Commission: Number(calculatedWeeklyCommission.toFixed(2)),
    Final_Payable_Commission: Number(finalPayableCommission.toFixed(2)),

    week_start_date: weekStartDate,
    week_end_date: weekEndDate,
    payout_date: payoutDate,
    is_licensed_ca_doi: isLicensedCaDoi,
    status,
    Violation_Count: validViolations.length,
    Disqualified_Count: validDisqualifiedRows.length,
  };

  return {
    ...result,
    Missed_By: buildMissedBy(result),
  };
}

export default function AdminTaxWip() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const week = useMemo(() => getWeekRange(currentDate), [currentDate]);

  const [agents, setAgents] = useState([]);
  const [selectedAgentEmail, setSelectedAgentEmail] = useState("");

  const [grossPayByAgent, setGrossPayByAgent] = useState({});
  const [licenseByAgent, setLicenseByAgent] = useState({});

  const [weeklyTransfersData, setWeeklyTransfersData] = useState([]);
  const [weeklyViolationsData, setWeeklyViolationsData] = useState([]);
  const [weeklyDisqualifiedData, setWeeklyDisqualifiedData] = useState([]);
  const [publishedRecords, setPublishedRecords] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [publishStatus, setPublishStatus] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);

  const loadWeeklyData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setPublishStatus("");
    setIsPublished(false);

    const weekStart = week.start;
    const nextWeekStart = addDaysKey(week.start, 7);

    try {
      const [
        transfersResult,
        violationsResult,
        disqualifiedResult,
        publishedRecordsResult,
      ] = await Promise.all([
        fetchAllSupabaseRows(
          () =>
            supabase
              .from(TABLE_TRANSFERS)
              .select("*")
              .gte("date_time", weekStart)
              .lt("date_time", nextWeekStart)
              .not("agent_email", "is", null)
              .order("agent_email", { ascending: true })
              .order("date_time", { ascending: true })
              .order("sync_key", { ascending: true }),
          1000,
          200000
        ),

        fetchAllSupabaseRows(
          () =>
            supabase
              .from(TABLE_VIOLATIONS)
              .select("*")
              .eq("week_start_date", week.start)
              .order("created_at", { ascending: true }),
          1000,
          200000
        ),

        fetchAllSupabaseRows(
          () =>
            supabase
              .from(TABLE_DISQUALIFIED)
              .select("*")
              .eq("week_start_date", week.start)
              .order("created_at", { ascending: true }),
          1000,
          200000
        ),

        fetchAllSupabaseRows(
          () =>
            supabase
              .from(TABLE_COMMISSION_RECORDS)
              .select("*")
              .eq("week_start_date", week.start)
              .order("final_payable_commission", { ascending: false }),
          1000,
          200000
        ),
      ]);

      const uniqueEmails = [
        ...new Set(
          transfersResult
            .map((row) => normalizeText(row.agent_email))
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b));

      const profiles =
        uniqueEmails.length > 0
          ? await fetchAllSupabaseRows(
              () =>
                supabase
                  .from("profiles")
                  .select("email, full_name")
                  .in("email", uniqueEmails)
                  .order("full_name", { ascending: true }),
              1000,
              200000
            )
          : [];

      const profileMap = profiles.reduce((acc, profile) => {
        acc[normalizeText(profile.email).toLowerCase()] =
          profile.full_name || profile.email;
        return acc;
      }, {});

      const activeAgents = uniqueEmails.map((email) => ({
        email,
        full_name: profileMap[email.toLowerCase()] || email,
      }));

      const savedPublishedRecords = publishedRecordsResult || [];
      const hasPublishedRecords = savedPublishedRecords.length > 0;

      setWeeklyTransfersData(transfersResult || []);
      setWeeklyViolationsData(violationsResult || []);
      setWeeklyDisqualifiedData(disqualifiedResult || []);
      setPublishedRecords(savedPublishedRecords);
      setIsPublished(hasPublishedRecords);

      if (hasPublishedRecords) {
        setPublishStatus(
          `Loaded published commission week with ${savedPublishedRecords.length} saved records.`
        );
      }

      setAgents(activeAgents);

      setSelectedAgentEmail((current) =>
        activeAgents.some((agent) => agent.email === current)
          ? current
          : activeAgents[0]?.email || ""
      );

      setGrossPayByAgent((prev) => {
        const next = { ...prev };

        activeAgents.forEach((agent) => {
          const savedRecord = savedPublishedRecords.find(
            (record) =>
              normalizeText(record.agent_email).toLowerCase() ===
              agent.email.toLowerCase()
          );

          if (savedRecord) {
            next[agent.email] = String(toNumber(savedRecord.gross_pay));
          } else if (next[agent.email] === undefined) {
            next[agent.email] = "";
          }
        });

        return next;
      });

      setLicenseByAgent((prev) => {
        const next = { ...prev };

        activeAgents.forEach((agent) => {
          const savedRecord = savedPublishedRecords.find(
            (record) =>
              normalizeText(record.agent_email).toLowerCase() ===
              agent.email.toLowerCase()
          );

          if (savedRecord) {
            next[agent.email] = savedRecord.is_licensed_ca_doi !== false;
          } else if (next[agent.email] === undefined) {
            next[agent.email] = true;
          }
        });

        return next;
      });
    } catch (error) {
      setLoadError(error?.message || "Failed to load commission week data.");
      setWeeklyTransfersData([]);
      setWeeklyViolationsData([]);
      setWeeklyDisqualifiedData([]);
      setPublishedRecords([]);
      setIsPublished(false);
      setAgents([]);
      setSelectedAgentEmail("");
    } finally {
      setLoading(false);
    }
  }, [week.start]);

  useEffect(() => {
    loadWeeklyData();
  }, [loadWeeklyData]);

  const transfersByAgent = useMemo(() => {
    return weeklyTransfersData.reduce((acc, row) => {
      const email = normalizeText(row.agent_email);
      if (!email) return acc;
      if (!acc[email]) acc[email] = [];
      acc[email].push(row);
      return acc;
    }, {});
  }, [weeklyTransfersData]);

  const violationsByAgent = useMemo(() => {
    return weeklyViolationsData.reduce((acc, row) => {
      const email = normalizeText(row.agent_email);
      if (!email) return acc;
      if (!acc[email]) acc[email] = [];
      acc[email].push(row);
      return acc;
    }, {});
  }, [weeklyViolationsData]);

  const disqualifiedByAgent = useMemo(() => {
    return weeklyDisqualifiedData.reduce((acc, row) => {
      const email = normalizeText(row.agent_email);
      if (!email) return acc;
      if (!acc[email]) acc[email] = [];
      acc[email].push(row);
      return acc;
    }, {});
  }, [weeklyDisqualifiedData]);

  const commissionRows = useMemo(() => {
    const rows = agents.map((agent) => {
      const result = calculateAgentCommission({
        transfersData: transfersByAgent[agent.email] || [],
        violationsData: violationsByAgent[agent.email] || [],
        disqualifiedData: disqualifiedByAgent[agent.email] || [],
        grossPayInput: grossPayByAgent[agent.email] || 0,
        isLicensedCaDoi: licenseByAgent[agent.email] !== false,
        weekStartDateInput: week.start,
      });

      return {
        agent,
        result,
        transfers: transfersByAgent[agent.email] || [],
        violations: violationsByAgent[agent.email] || [],
        disqualified: disqualifiedByAgent[agent.email] || [],
      };
    });

    return rows.sort((a, b) => {
      if (!isPublished) {
        return (a.agent.full_name || a.agent.email).localeCompare(
          b.agent.full_name || b.agent.email
        );
      }

      if (a.result.Final_Payable_Commission !== b.result.Final_Payable_Commission) {
        return b.result.Final_Payable_Commission - a.result.Final_Payable_Commission;
      }

      return (a.agent.full_name || a.agent.email).localeCompare(
        b.agent.full_name || b.agent.email
      );
    });
  }, [
    agents,
    transfersByAgent,
    violationsByAgent,
    disqualifiedByAgent,
    grossPayByAgent,
    licenseByAgent,
    week.start,
    isPublished,
  ]);

  const selectedAgentBundle = useMemo(() => {
    return (
      commissionRows.find((row) => row.agent.email === selectedAgentEmail) ||
      commissionRows[0] ||
      null
    );
  }, [commissionRows, selectedAgentEmail]);

  const selectedResult = selectedAgentBundle?.result || null;
  const selectedTransfersData = selectedAgentBundle?.transfers || [];
  const selectedViolationsData = selectedAgentBundle?.violations || [];
  const selectedDisqualifiedData = selectedAgentBundle?.disqualified || [];

  const weekUploadStatus = useMemo(() => {
    return Array.from({ length: 7 }).map((_, index) => {
      const dateKey = addDaysKey(week.start, index);
      const rows = weeklyTransfersData.filter(
        (row) => String(row.date_time || "").slice(0, 10) === dateKey
      );

      return {
        date: dateKey,
        rows: rows.length,
        status: rows.length > 0 ? "Uploaded" : "Missing Data - Upload Needed",
      };
    });
  }, [week.start, weeklyTransfersData]);

  const weekHasMissingData = weekUploadStatus.some((day) => day.rows === 0);

  const weeklyTotals = useMemo(() => {
    return commissionRows.reduce(
      (acc, row) => {
        acc.grossRevenue += row.result.Gross_Revenue;
        acc.grossPay += row.result.Gross_Pay;
        acc.netRevenue += row.result.Net_Revenue;
        acc.finalPayable += row.result.Final_Payable_Commission;
        acc.violations += row.result.Violation_Count;
        acc.disqualified += row.result.Disqualified_Count;
        if (row.result.Final_Payable_Commission > 0) acc.payableAgents += 1;
        else acc.nonPayableAgents += 1;
        return acc;
      },
      {
        grossRevenue: 0,
        grossPay: 0,
        netRevenue: 0,
        finalPayable: 0,
        violations: 0,
        disqualified: 0,
        payableAgents: 0,
        nonPayableAgents: 0,
      }
    );
  }, [commissionRows]);

  const feeBreakdownRows = useMemo(() => {
    if (!selectedResult?.Fee_Breakdown) return [];
    return Object.entries(selectedResult.Fee_Breakdown).map(([category, data]) => ({
      category,
      revenue: data.revenue,
      count: data.count,
    }));
  }, [selectedResult]);

  const debugTransferRows = useMemo(() => {
    return [...selectedTransfersData].sort((a, b) => {
      const dateA = new Date(a.date_time || 0).getTime();
      const dateB = new Date(b.date_time || 0).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return String(a.sync_key || "").localeCompare(String(b.sync_key || ""));
    });
  }, [selectedTransfersData]);

  const debugCompanySummary = useMemo(() => {
    const summary = {};
    selectedTransfersData.forEach((row) => {
      const company = normalizeText(row.company) || "Blank Company";
      if (!summary[company]) summary[company] = { rows: 0, revenue: 0 };
      summary[company].rows += 1;
      summary[company].revenue += toNumber(row.fee);
    });
    return Object.entries(summary)
      .map(([company, data]) => ({
        company,
        rows: data.rows,
        revenue: Number(data.revenue.toFixed(2)),
      }))
      .sort((a, b) => a.company.localeCompare(b.company));
  }, [selectedTransfersData]);

  const goToPreviousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const handlePublish = async () => {
    if (commissionRows.length === 0) {
      setPublishStatus("No commission rows to publish.");
      return;
    }

    const confirmMessage = weekHasMissingData
      ? "Some days show missing EOD data. Publish anyway?"
      : "Publish commission records for this week?";

    if (!window.confirm(confirmMessage)) return;

    setPublishing(true);
    setPublishStatus("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const publishedBy = user?.email || "admin";

      const payload = commissionRows.map(({ agent, result }) => ({
        agent_email: agent.email,
        agent_name: agent.full_name,
        week_start_date: result.week_start_date,
        week_end_date: result.week_end_date,
        payout_date: result.payout_date,
        gross_revenue: result.Gross_Revenue,
        gross_pay: result.Gross_Pay,
        royalty_deduction: result.Royalty_Deduction,
        net_revenue: result.Net_Revenue,
        gross_nb_count: result.Gross_NB_Count,
        disqualified_nb_count: result.Disqualified_NB_Count,
        net_nb_count: result.Net_NB_Count,
        broker_fee_revenue: result.Broker_Fee_Revenue,
        endorsement_fee_revenue: result.Endorsement_Fee_Revenue,
        reinstatement_fee_revenue: result.Reinstatement_Fee_Revenue,
        renewal_fee_revenue: result.Renewal_Fee_Revenue,
        commission_rate: result.Commission_Rate,
        tier: result.Tier,
        base_payout: result.Base_Payout,
        total_deductions: result.Total_Deductions,
        calculated_weekly_commission: result.Calculated_Weekly_Commission,
        final_payable_commission: result.Final_Payable_Commission,
        violation_count: result.Violation_Count,
        disqualified_count: result.Disqualified_Count,
        is_licensed_ca_doi: result.is_licensed_ca_doi,
        status: result.status,
        published_at: new Date().toISOString(),
        published_by: publishedBy,
      }));

      const { error } = await supabase
        .from(TABLE_COMMISSION_RECORDS)
        .upsert(payload, { onConflict: "agent_email,week_start_date" });

      if (error) throw error;
      setIsPublished(true);
      setPublishedRecords(payload);
      setPublishStatus(`Published ${payload.length} commission records successfully.`);
    } catch (error) {
      setPublishStatus(error?.message || "Failed to publish commission records.");
    } finally {
      setPublishing(false);
    }
  };

  const handleExportCsv = () => {
    if (!isPublished) {
      setPublishStatus("Publish the commission week before exporting the final CSV.");
      return;
    }

    if (commissionRows.length === 0) {
      setPublishStatus("No commission rows to export.");
      return;
    }

    const headers = [
      "Agent Name",
      "Agent Email",
      "Week Start",
      "Week End",
      "Payout Date",
      "Gross Revenue",
      "Gross Pay",
      "Royalty Deduction",
      "Net Revenue",
      "Gross NB",
      "Disqualified NB",
      "Net NB",
      "Tier",
      "Commission Rate",
      "Base Payout",
      "Total Deductions",
      "Calculated Commission",
      "Final Payable Commission",
      "Violation Count",
      "Disqualified Count",
      "License Status",
      "Status",
      "Missed By",
    ];

    const rows = commissionRows.map(({ agent, result }) => [
      agent.full_name || agent.email,
      agent.email,
      result.week_start_date,
      result.week_end_date,
      result.payout_date,
      result.Gross_Revenue,
      result.Gross_Pay,
      result.Royalty_Deduction,
      result.Net_Revenue,
      result.Gross_NB_Count,
      result.Disqualified_NB_Count,
      result.Net_NB_Count,
      result.Tier,
      result.Commission_Rate,
      result.Base_Payout,
      result.Total_Deductions,
      result.Calculated_Weekly_Commission,
      result.Final_Payable_Commission,
      result.Violation_Count,
      result.Disqualified_Count,
      result.is_licensed_ca_doi ? "Licensed" : "Unlicensed",
      result.status,
      result.Missed_By,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.setAttribute(
      "download",
      `commission-week-${week.start}-to-${week.end}.csv`
    );

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Commission Manager</h1>
          <div className={styles.subTitle}>
            Commission week • {formatDate(week.start)} - {formatDate(week.end)}
            {isPublished ? " • Published" : " • Draft"}
          </div>
        </div>

        <div className={styles.controls}>
          <button className={styles.btn} onClick={goToPreviousWeek}>
            ← Previous Week
          </button>
          <button className={styles.btn} onClick={goToNextWeek}>
            Next Week →
          </button>
          <button className={styles.btn} onClick={loadWeeklyData}>
            Refresh
          </button>
          <button
            className={styles.btn}
            onClick={handlePublish}
            disabled={publishing || commissionRows.length === 0 || isPublished}
            style={{
              background: isPublished ? "#94a3b8" : "#16a34a",
              color: "white",
              borderColor: isPublished ? "#94a3b8" : "#16a34a",
            }}
          >
            {isPublished ? "Published" : publishing ? "Publishing..." : "Publish Week"}
          </button>

          <button
            className={styles.btn}
            onClick={handleExportCsv}
            disabled={!isPublished || commissionRows.length === 0}
            style={{
              background: isPublished ? "#2563eb" : "#cbd5e1",
              color: isPublished ? "white" : "#475569",
              borderColor: isPublished ? "#2563eb" : "#cbd5e1",
            }}
          >
            Export CSV
          </button>
        </div>
      </header>

      {loadError && <div className={styles.error}>{loadError}</div>}

      {publishStatus && (
        <div
          className={styles.tableCard}
          style={{
            padding: 14,
            marginBottom: 16,
            borderLeft: publishStatus.toLowerCase().includes("failed")
              ? "5px solid #dc2626"
              : "5px solid #16a34a",
          }}
        >
          <strong>{publishStatus}</strong>
        </div>
      )}

      {loading ? (
        <div className={styles.tableCard} style={{ padding: 40, textAlign: "center" }}>
          Loading commission week...
        </div>
      ) : (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 14, marginBottom: 16 }}>
            <MetricCard label="Total Payable" value={money(weeklyTotals.finalPayable)} strong />
            <MetricCard label="Payable Agents" value={weeklyTotals.payableAgents} />
            <MetricCard label="Non-Payable Agents" value={weeklyTotals.nonPayableAgents} />
            <MetricCard label="Week EOD Rows" value={weeklyTransfersData.length} />
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 14, marginBottom: 16 }}>
            <MetricCard label="Gross Revenue" value={money(weeklyTotals.grossRevenue)} />
            <MetricCard label="Gross Pay Entered" value={money(weeklyTotals.grossPay)} />
            <MetricCard label="Violations" value={weeklyTotals.violations} />
            <MetricCard label="Disqualified" value={weeklyTotals.disqualified} />
          </section>

          <section className={styles.tableCard} style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Commission Tier Rules / How Agents Qualify</h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <InfoRow
                label="Minimum Requirement"
                value="Agent must have at least $500 net revenue after deductions to qualify for any commission."
              />

              <InfoRow
                label="Tier 1 - 10%"
                value="10+ Net NBs OR $2,500+ gross revenue."
              />

              <InfoRow
                label="Tier 2 - 12.5%"
                value="17+ Net NBs and $3,500+ gross revenue OR $5,000+ gross revenue."
              />

              <InfoRow
                label="Tier 3 - 15%"
                value="24+ Net NBs and $5,000+ gross revenue."
              />
            </div>

            <div
              style={{
                marginTop: 12,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 12,
                fontSize: 13,
                lineHeight: 1.5,
                color: "#334155",
                fontWeight: 700,
              }}
            >
              <strong>How the system calculates it:</strong> Gross revenue includes Broker Fee,
              Endorsement Fee, Renewal Fee, and Reinstatement Fee from the company column.
              Negative fee rows subtract from revenue. NB count is based on NEW/RWR receipts
              with an active Broker Fee. Disqualified NBs are removed from the final Net NB count.
              Violations are deducted from the calculated commission. Unlicensed agents are
              withheld even if they otherwise qualify.
            </div>
          </section>

          <section className={styles.tableCard} style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Commission Week Upload Checklist</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(140px, 1fr))", gap: 10 }}>
              {weekUploadStatus.map((day) => {
                const missing = day.rows === 0;
                return (
                  <div
                    key={day.date}
                    style={{
                      background: missing ? "#fef2f2" : "#ecfdf5",
                      border: `1px solid ${missing ? "#fecaca" : "#bbf7d0"}`,
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{formatWeekday(day.date)}</div>
                    <div style={{ marginTop: 4, fontWeight: 900 }}>{formatDate(day.date)}</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{day.rows} rows</div>
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900, color: missing ? "#dc2626" : "#15803d" }}>
                      {day.status}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.tableCard} style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>
              All Agents Commission Review / Gross Pay Entry
            </h3>

            <div
              style={{
                marginBottom: 12,
                color: isPublished ? "#15803d" : "#64748b",
                fontWeight: 800,
              }}
            >
              {isPublished
                ? "Published view: gross pays are locked and agents are sorted by top earners."
                : "Draft view: agents stay alphabetical while gross pays are being entered."}
            </div>

            <div style={{ overflowX: "auto", maxHeight: 620, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                    <th style={debugTh}>Agent</th>
                    <th style={debugTh}>Gross Pay</th>
                    <th style={debugTh}>Licensed</th>
                    <th style={debugTh}>Gross Revenue</th>
                    <th style={debugTh}>Net Revenue</th>
                    <th style={debugTh}>NB</th>
                    <th style={debugTh}>Tier</th>
                    <th style={debugTh}>Rate</th>
                    <th style={debugTh}>Viol.</th>
                    <th style={debugTh}>Disq.</th>
                    <th style={debugTh}>Final Payable</th>
                    <th style={debugTh}>Status / Missed By</th>
                  </tr>
                </thead>

                <tbody>
                  {commissionRows.length === 0 ? (
                    <tr>
                      <td style={debugTd} colSpan={12}>No agents with EOD transfer data found for this week.</td>
                    </tr>
                  ) : (
                    commissionRows.map(({ agent, result }) => {
                      const isSelected = selectedAgentEmail === agent.email;
                      const payable = result.Final_Payable_Commission > 0;
                      const negativeCommission = result.Final_Payable_Commission < 0;
                      const missedByNb = String(result.Missed_By || "").includes("NB short");
                      const hasWarning =
                        result.Violation_Count > 0 ||
                        result.Disqualified_Count > 0 ||
                        !result.is_licensed_ca_doi ||
                        missedByNb ||
                        negativeCommission;

                      return (
                        <tr
                          key={agent.email}
                          onClick={() => setSelectedAgentEmail(agent.email)}
                          style={{
                            cursor: "pointer",
                            background: isSelected
                              ? "#dbeafe"
                              : missedByNb
                                ? "#fef9c3"
                                : negativeCommission
                                  ? "#fef2f2"
                                  : payable
                                    ? "#ecfdf5"
                                    : hasWarning
                                      ? "#fff7ed"
                                      : "white",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          <td style={debugTd}>
                            <strong>{agent.full_name || agent.email}</strong>
                            <div style={{ color: "#64748b", fontSize: 12 }}>{agent.email}</div>
                          </td>
                          <td style={debugTd} onClick={(e) => e.stopPropagation()}>
                            <input
                              className={styles.input}
                              type="number"
                              step="0.01"
                              value={grossPayByAgent[agent.email] || ""}
                              disabled={isPublished}
                              onChange={(e) =>
                                setGrossPayByAgent((prev) => ({
                                  ...prev,
                                  [agent.email]: e.target.value,
                                }))
                              }
                              placeholder="0.00"
                              style={{
                                width: 110,
                                background: isPublished ? "#f1f5f9" : "white",
                                cursor: isPublished ? "not-allowed" : "text",
                              }}
                            />
                          </td>
                          <td style={debugTd} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={licenseByAgent[agent.email] !== false}
                              disabled={isPublished}
                              onChange={(e) =>
                                setLicenseByAgent((prev) => ({
                                  ...prev,
                                  [agent.email]: e.target.checked,
                                }))
                              }
                            />
                          </td>
                          <td style={debugTd}>{money(result.Gross_Revenue)}</td>
                          <td style={debugTd}>{money(result.Net_Revenue)}</td>
                          <td style={debugTd}>{result.Net_NB_Count} / gross {result.Gross_NB_Count}</td>
                          <td style={debugTd}>{result.Tier}</td>
                          <td style={debugTd}>{percent(result.Commission_Rate)}</td>
                          <td style={debugTd}>{result.Violation_Count}</td>
                          <td style={debugTd}>{result.Disqualified_Count}</td>
                          <td
                            style={{
                              ...debugTd,
                              fontSize: 15,
                              fontWeight: 950,
                              color: negativeCommission ? "#dc2626" : payable ? "#15803d" : "#0f172a",
                              background: negativeCommission ? "#fee2e2" : payable ? "#dcfce7" : undefined,
                            }}
                          >
                            {money(result.Final_Payable_Commission)}
                          </td>
                          <td
                            style={{
                              ...debugTd,
                              whiteSpace: "normal",
                              minWidth: 260,
                              background: missedByNb ? "#fef08a" : undefined,
                            }}
                          >
                            <strong>{result.status}</strong>
                            <div
                              style={{
                                color: missedByNb ? "#854d0e" : "#64748b",
                                fontSize: 12,
                                fontWeight: missedByNb ? 900 : 500,
                                marginTop: 4,
                              }}
                            >
                              {result.Missed_By}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {selectedAgentBundle && selectedResult ? (
            <>
              <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 14, marginBottom: 16 }}>
                <MetricCard label={`Selected: ${selectedAgentBundle.agent.full_name}`} value={money(selectedResult.Final_Payable_Commission)} strong />
                <MetricCard label="Calculated Commission" value={money(selectedResult.Calculated_Weekly_Commission)} />
                <MetricCard label="Tier" value={selectedResult.Tier} />
                <MetricCard label="Commission Rate" value={percent(selectedResult.Commission_Rate)} />
              </section>

              <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 14, marginBottom: 16 }}>
                <MetricCard label="Gross Revenue" value={money(selectedResult.Gross_Revenue)} />
                <MetricCard label="Royalty Deduction" value={money(selectedResult.Royalty_Deduction)} />
                <MetricCard label="Gross Pay" value={money(selectedResult.Gross_Pay)} />
                <MetricCard label="Net Revenue" value={money(selectedResult.Net_Revenue)} />
              </section>

              <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 14, marginBottom: 16 }}>
                <MetricCard label="Gross NB Count" value={selectedResult.Gross_NB_Count} />
                <MetricCard label="Disqualified NB" value={selectedResult.Disqualified_NB_Count} />
                <MetricCard label="Net NB Count" value={selectedResult.Net_NB_Count} />
                <MetricCard label="Total Deductions" value={money(selectedResult.Total_Deductions)} />
              </section>

              <section className={styles.tableCard} style={{ padding: 16, marginBottom: 16 }}>
                <h3 style={{ marginTop: 0 }}>Selected Agent Fee Category Breakdown</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 14 }}>
                  {feeBreakdownRows.map((row) => (
                    <MetricCard key={row.category} label={`${row.category} (${row.count})`} value={money(row.revenue)} />
                  ))}
                </div>
              </section>

              <section className={styles.tableCard} style={{ padding: 16, marginBottom: 16 }}>
                <h3 style={{ marginTop: 0 }}>Selected Agent Commission Summary</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  <InfoRow label="Agent" value={selectedAgentBundle.agent.full_name || selectedAgentBundle.agent.email} />
                  <InfoRow label="Week Start" value={formatDate(selectedResult.week_start_date)} />
                  <InfoRow label="Week End" value={formatDate(selectedResult.week_end_date)} />
                  <InfoRow label="Expected Payout Date" value={formatDate(selectedResult.payout_date)} />
                  <InfoRow label="License Status" value={selectedResult.is_licensed_ca_doi ? "Licensed" : "Unlicensed"} />
                  <InfoRow label="Status" value={selectedResult.status} />
                </div>
              </section>

              <section className={styles.content}>
                <div className={styles.tableCard}>
                  <h3 style={{ padding: "14px 14px 0" }}>Selected Agent Source Records</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: 14 }}>
                    <SourceBox title="EOD Transfer Rows" value={selectedTransfersData.length} />
                    <SourceBox title="Violations" value={selectedViolationsData.length} />
                    <SourceBox title="Disqualified Policies" value={selectedDisqualifiedData.length} />
                  </div>
                </div>
              </section>

              <section className={styles.tableCard} style={{ padding: 16, marginTop: 16, marginBottom: 16 }}>
                <h3 style={{ marginTop: 0 }}>Debug: Violations / Disqualified Details</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
                  <div>
                    <h4 style={{ margin: "0 0 10px" }}>Violations</h4>
                    <div style={{ overflowX: "auto", maxHeight: 280, overflowY: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            <th style={debugTh}>Date</th>
                            <th style={debugTh}>Violation</th>
                            <th style={debugTh}>Fee</th>
                            <th style={debugTh}>Status</th>
                            <th style={debugTh}>Reason / Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedViolationsData.length === 0 ? (
                            <tr><td style={debugTd} colSpan={5}>No violations loaded for this agent/week.</td></tr>
                          ) : (
                            selectedViolationsData.map((row, index) => {
                              const status = firstValue(row, ["status"]);
                              const isVoided = String(status).toLowerCase() === "voided";
                              return (
                                <tr key={row.id || row.sync_key || index} style={{ background: isVoided ? "#f8fafc" : "#fff7ed", borderBottom: "1px solid #e2e8f0" }}>
                                  <td style={debugTd}>{formatDateTime(firstValue(row, ["created_at", "date_time", "date"]))}</td>
                                  <td style={debugTd}><strong>{firstValue(row, ["violation_type", "violation", "type", "category", "reason_type"])}</strong></td>
                                  <td style={debugTd}>{money(firstValue(row, ["fee_amount", "fee", "amount"]))}</td>
                                  <td style={debugTd}>{status}</td>
                                  <td style={{ ...debugTd, whiteSpace: "normal", minWidth: 260 }}>{firstValue(row, ["note", "notes", "reason", "description", "comment", "comments"])}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h4 style={{ margin: "0 0 10px" }}>Disqualified Policies</h4>
                    <div style={{ overflowX: "auto", maxHeight: 280, overflowY: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            <th style={debugTh}>Date</th>
                            <th style={debugTh}>Policy / Receipt</th>
                            <th style={debugTh}>Status</th>
                            <th style={debugTh}>Linked Sync Key</th>
                            <th style={debugTh}>Reason / Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDisqualifiedData.length === 0 ? (
                            <tr><td style={debugTd} colSpan={5}>No disqualified policies loaded for this agent/week.</td></tr>
                          ) : (
                            selectedDisqualifiedData.map((row, index) => {
                              const status = firstValue(row, ["status"]);
                              const isVoided = String(status).toLowerCase() === "voided";
                              return (
                                <tr key={row.id || row.linked_sync_key || index} style={{ background: isVoided ? "#f8fafc" : "#fef2f2", borderBottom: "1px solid #e2e8f0" }}>
                                  <td style={debugTd}>{formatDateTime(firstValue(row, ["created_at", "date_time", "date"]))}</td>
                                  <td style={debugTd}><strong>{firstValue(row, ["policy_number", "policy", "receipt_id", "customer_name", "named_insured"])}</strong></td>
                                  <td style={debugTd}>{status}</td>
                                  <td style={debugTd}>{firstValue(row, ["linked_sync_key", "sync_key"])}</td>
                                  <td style={{ ...debugTd, whiteSpace: "normal", minWidth: 260 }}>{firstValue(row, ["note", "notes", "reason", "disqualification_reason", "description", "comment", "comments"])}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.tableCard} style={{ padding: 16, marginTop: 16, marginBottom: 16 }}>
                <h3 style={{ marginTop: 0 }}>Debug: Company Summary</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={debugTh}>Company</th>
                        <th style={debugTh}>Rows</th>
                        <th style={debugTh}>Fee Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debugCompanySummary.length === 0 ? (
                        <tr><td style={debugTd} colSpan={3}>No transfer rows loaded for this agent/week.</td></tr>
                      ) : (
                        debugCompanySummary.map((row) => {
                          const isTargetFee = ["Broker Fee", "Endorsement Fee", "Reinstatement Fee", "Renewal Fee"].includes(row.company);
                          return (
                            <tr key={row.company} style={{ background: isTargetFee ? "#ecfdf5" : "white" }}>
                              <td style={debugTd}><strong>{row.company}</strong></td>
                              <td style={debugTd}>{row.rows}</td>
                              <td style={debugTd}>{money(row.revenue)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={styles.tableCard} style={{ padding: 16, marginBottom: 16 }}>
                <h3 style={{ marginTop: 0 }}>Debug: EOD Transfer Rows</h3>
                <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={debugTh}>Date</th>
                        <th style={debugTh}>Company</th>
                        <th style={debugTh}>Fee</th>
                        <th style={debugTh}>Type</th>
                        <th style={debugTh}>Receipt ID</th>
                        <th style={debugTh}>Sync Key</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debugTransferRows.length === 0 ? (
                        <tr><td style={debugTd} colSpan={6}>No transfer rows loaded for this agent/week.</td></tr>
                      ) : (
                        debugTransferRows.map((row, index) => {
                          const company = normalizeText(row.company);
                          const normalizedCompany = company.replace(/\s+/g, " ").toLowerCase();
                          const isTargetFee = ["broker fee", "endorsement fee", "reinstatement fee", "renewal fee"].includes(normalizedCompany);
                          return (
                            <tr key={row.sync_key || `${row.receipt_id || "row"}-${index}`} style={{ background: isTargetFee ? "#ecfdf5" : "white", borderBottom: "1px solid #e2e8f0" }}>
                              <td style={debugTd}>{formatDate(row.date_time)}</td>
                              <td style={debugTd}><strong>{company || "—"}</strong></td>
                              <td style={debugTd}>{money(row.fee)}</td>
                              <td style={debugTd}>{row.type || "—"}</td>
                              <td style={debugTd}>{row.receipt_id || "—"}</td>
                              <td style={debugTd}>{row.sync_key || "—"}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, strong = false }) {
  return (
    <div className={styles.tableCard} style={{ padding: 18, borderLeft: strong ? "5px solid #2563eb" : undefined }}>
      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: strong ? 30 : 24, fontWeight: 900, color: strong ? "#2563eb" : "#0f172a" }}>
        {value}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 800 }}>{value || "—"}</div>
    </div>
  );
}

function SourceBox({ title, value }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 6 }}>{value}</div>
    </div>
  );
}

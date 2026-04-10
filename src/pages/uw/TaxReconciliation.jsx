import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import styles from "./TaxReconciliation.module.css";

/**
 * Daily Tax Reconciliation (One Page)
 * Ownership (credit) = EOD CSR
 * MaxTax Preparer = reference only (code-sharing safe)
 *
 * Updates added:
 * ✅ Carry Matrix fields: Date / Time, Method, Fee (Tax Prep Fee sum)
 * ✅ Show customer name twice:
 *    - Customer (Matrix)
 *    - Customer (MaxTax)
 */

// --------------------------- Helpers ---------------------------

const normalizeOffice = (officeRaw = "") => {
  const m = String(officeRaw).match(/CA\d{3}/i);
  return m ? m[0].toUpperCase() : "";
};

const normalizeName = (s = "") =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, "");

const splitCustomerNameFromMatrix = (customer = "") => {
  const raw = String(customer).trim();
  if (!raw) return { first: "", last: "", full: "" };

  if (raw.includes(",")) {
    const [last, first] = raw.split(",").map((x) => x.trim());
    return {
      first: normalizeName(first || ""),
      last: normalizeName(last || ""),
      full: normalizeName(`${first || ""} ${last || ""}`),
    };
  }

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1)
    return { first: "", last: normalizeName(parts[0]), full: normalizeName(parts[0]) };

  const first = parts[0];
  const last = parts.slice(1).join(" ");
  return {
    first: normalizeName(first),
    last: normalizeName(last),
    full: normalizeName(`${first} ${last}`),
  };
};

const parseISODate = (dt = "") => {
  const d = new Date(String(dt).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
};

const dayKey = (d) => {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const fmtMoney = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
};

const fmtDateTime = (raw, dtObj) => {
  if (raw && String(raw).trim()) return String(raw).trim();
  if (!dtObj) return "—";
  const d = dtObj instanceof Date ? dtObj : new Date(dtObj);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

const parseMaxTaxTSV = (tsvText) => {
  const lines = String(tsvText || "")
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? "").trim();
    });

    const office = normalizeOffice(obj["OFFICE"] || "");
    const taxYr = String(obj["TAX YR"] || "").trim();
    const first = normalizeName(obj["FIRST"] || "");
    const last = normalizeName(obj["LAST"] || "");
    const preparer = normalizeName(obj["PREPARER"] || "");
    const status = (obj["STATUS"] || "").trim();

    rows.push({
      raw: obj,
      office,
      taxYr,
      first,
      last,
      preparer,
      status,
      key: `${office}|${taxYr}|${last}|${first}|${preparer}|${i}`,
    });
  }

  return rows;
};

const scoreCandidate = ({ receipt, candidate }) => {
  let score = 0;

  if (receipt.office && receipt.office === candidate.office) score += 50;

  if (receipt.last && candidate.last && receipt.last === candidate.last) score += 40;
  else if (receipt.last && candidate.last && candidate.last.includes(receipt.last)) score += 25;
  else if (receipt.last && candidate.last && receipt.last.includes(candidate.last)) score += 20;

  if (receipt.first && candidate.first) {
    if (receipt.first === candidate.first) score += 20;
    else if (candidate.first.startsWith(receipt.first[0])) score += 10;
  }

  if (receipt.ownerNorm && candidate.preparer && receipt.ownerNorm === candidate.preparer) score += 10;

  return score;
};

const statusCategory = (s = "") => {
  const t = String(s).toLowerCase();
  if (t.includes("rejected")) return "rejected";
  if (t.includes("accepted")) return "accepted";
  if (t.includes("transmitted")) return "transmitted";
  if (t.includes("review")) return "review";
  if (t.includes("complete")) return "complete";
  if (t.includes("in progress")) return "in_progress";
  return "other";
};

const issueFromMatch = (match) => {
  if (!match) return "No Return Found";
  const cat = statusCategory(match.status);
  if (cat === "rejected") return "Needs Correction";
  if (cat === "in_progress" || cat === "complete") return "Not Transmitted";
  return "";
};

// --------------------------- Component ---------------------------

function TaxReconciliation() {
  const [eodRows, setEodRows] = useState([]);
  const [maxTaxText, setMaxTaxText] = useState("");
  const [maxTaxRows, setMaxTaxRows] = useState([]);

  const [runDate, setRunDate] = useState("");
  const [ran, setRan] = useState(false);

  const [showMatched, setShowMatched] = useState(false);
  const [showCodeMismatches, setShowCodeMismatches] = useState(false);

  const [filterOffice, setFilterOffice] = useState("ALL");
  const [filterOwner, setFilterOwner] = useState("ALL");
  const [filterTaxYear, setFilterTaxYear] = useState("ALL");
  const [filterIssue, setFilterIssue] = useState("ALL");
  const [search, setSearch] = useState("");

  const [expandedReceipt, setExpandedReceipt] = useState(null);

  const handleUploadEOD = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data || []).map((r) => ({
          ...r,
          Receipt: String(r.Receipt || "").trim(),
          Office: String(r.Office || "").trim(),
          CSR: String(r.CSR || "").trim(),
          Customer: String(r.Customer || "").trim(), // ✅ keep
          Company: String(r.Company || "").trim(),
          Method: String(r.Method || "").trim(), // ✅ add
          Fee: String(r.Fee || "").replace(/,/g, ""),
          Total: String(r.Total || "").replace(/,/g, ""),
          "Date / Time": String(r["Date / Time"] || "").trim(),
        }));

        setEodRows(rows);

        const firstValid = rows.find((x) => parseISODate(x["Date / Time"]));
        const d = firstValid ? parseISODate(firstValid["Date / Time"]) : null;
        setRunDate(d ? dayKey(d) : "");
        setRan(false);
        setExpandedReceipt(null);
      },
      error: (err) => {
        console.error(err);
        alert("Failed to parse EOD CSV. Make sure it's the Matrix EOD Detail export.");
      },
    });
  };

  const handleParseMaxTax = () => {
    const parsed = parseMaxTaxTSV(maxTaxText);
    setMaxTaxRows(parsed);
    setRan(false);
    setExpandedReceipt(null);
  };

  const taxReceipts = useMemo(() => {
    if (!eodRows.length) return [];

    const taxRows = eodRows.filter((r) =>
      String(r.Company || "").toLowerCase().includes("tax prep fee")
    );

    const byReceipt = new Map();
    for (const r of taxRows) {
      const receipt = String(r.Receipt || "").trim();
      if (!receipt) continue;
      if (!byReceipt.has(receipt)) byReceipt.set(receipt, []);
      byReceipt.get(receipt).push(r);
    }

    const receipts = [];
    for (const [receipt, rows] of byReceipt.entries()) {
      const first = rows[0];
      const office = normalizeOffice(first.Office || "");
      const ownerRaw = (first.CSR || "").replace(/,+\s*$/, "").trim();
      const ownerNorm = normalizeName(ownerRaw);

      const customer = splitCustomerNameFromMatrix(first.Customer || "");

      const dtRaw = String(first["Date / Time"] || "").trim();
      const dt = parseISODate(dtRaw);

      const methodRaw = String(first.Method || "").trim();

      const taxFee = rows.reduce((sum, x) => sum + (parseFloat(x.Fee) || 0), 0);

      receipts.push({
        receipt,
        office,
        ownerRaw,
        ownerNorm,

        // ✅ Matrix customer (raw) + parsed parts
        customerRaw: String(first.Customer || "").trim(),
        first: customer.first,
        last: customer.last,

        // ✅ Matrix fields you requested
        dateTimeRaw: dtRaw,
        method: methodRaw,

        dateTime: dt,
        dateKey: dayKey(dt),

        // ✅ Fee from the CSV (sum of Tax Prep Fee line items for the receipt)
        taxFee,

        sourceRows: rows,
      });
    }

    receipts.sort((a, b) =>
      `${a.office}|${a.ownerRaw}|${a.receipt}`.localeCompare(
        `${b.office}|${b.ownerRaw}|${b.receipt}`
      )
    );
    return receipts;
  }, [eodRows]);

  const offices = useMemo(() => {
    const s = new Set(taxReceipts.map((r) => r.office).filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [taxReceipts]);

  const owners = useMemo(() => {
    const s = new Set(taxReceipts.map((r) => r.ownerRaw).filter(Boolean));
    return ["ALL", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [taxReceipts]);

  const taxYears = useMemo(() => {
    const s = new Set(maxTaxRows.map((r) => r.taxYr).filter(Boolean));
    return ["ALL", ...Array.from(s).sort((a, b) => b.localeCompare(a))];
  }, [maxTaxRows]);

  const reconciliation = useMemo(() => {
    if (!taxReceipts.length || !maxTaxRows.length) return null;

    const usedReturns = new Set();
    const matches = [];
    const exceptions = [];

    for (const receipt of taxReceipts) {
      if (runDate && receipt.dateKey && receipt.dateKey !== runDate) {
        exceptions.push({
          type: "Wrong Date",
          receipt,
          match: null,
          issue: `Receipt date ${receipt.dateKey} does not match run date ${runDate}`,
        });
        continue;
      }

      const pool = maxTaxRows.filter((m) => m.office && m.office === receipt.office);

      const scored = pool
        .filter((m) => !usedReturns.has(m.key))
        .map((m) => ({ m, score: scoreCandidate({ receipt, candidate: m }) }))
        .sort((a, b) => b.score - a.score);

      const best = scored[0];
      const second = scored[1];

      if (!best || best.score < 70) {
        exceptions.push({
          type: "No Return Found",
          receipt,
          match: null,
          issue: "No Return Found",
          candidates: scored.slice(0, 8),
        });
        continue;
      }

      const ambiguous = second && second.score >= best.score - 5 && second.score >= 70;
      if (ambiguous) {
        exceptions.push({
          type: "Ambiguous Match",
          receipt,
          match: null,
          issue: "Multiple possible returns (pick the correct Tax Year)",
          candidates: scored.slice(0, 10),
        });
        continue;
      }

      usedReturns.add(best.m.key);

      const issue = issueFromMatch(best.m);

      const row = {
        receipt,
        match: best.m,
        confidence: best.score >= 95 ? "High" : best.score >= 80 ? "Medium" : "Low",
        issue,
        codeMismatch:
          receipt.ownerNorm && best.m.preparer && receipt.ownerNorm !== best.m.preparer,
      };

      matches.push(row);

      if (issue) {
        exceptions.push({
          type: issue,
          receipt,
          match: best.m,
          issue,
          confidence: row.confidence,
          codeMismatch: row.codeMismatch,
        });
      }
    }

    return { matches, exceptions };
  }, [taxReceipts, maxTaxRows, runDate]);

  const kpis = useMemo(() => {
    const expected = taxReceipts.length;
    const returns = maxTaxRows.length;

    const matched = reconciliation ? reconciliation.matches.length : 0;
    const exceptions = reconciliation
      ? reconciliation.exceptions.filter((e) => e.type !== "Wrong Date").length
      : 0;

    const notTransmitted = reconciliation
      ? reconciliation.exceptions.filter((e) => e.type === "Not Transmitted").length
      : 0;

    const rejected = reconciliation
      ? reconciliation.exceptions.filter((e) => e.type === "Needs Correction").length
      : 0;

    return { expected, returns, matched, exceptions, notTransmitted, rejected };
  }, [taxReceipts.length, maxTaxRows.length, reconciliation]);

  const issueOptions = useMemo(() => {
    return [
      "ALL",
      "Not Transmitted",
      "Needs Correction",
      "No Return Found",
      "Multiple possible returns (pick the correct Tax Year)",
    ];
  }, []);

  const filteredRows = useMemo(() => {
    if (!reconciliation) return [];

    let rows = [];
    if (showMatched) {
      rows = reconciliation.matches.map((m) => ({
        receipt: m.receipt,
        match: m.match,
        issue: m.issue,
        confidence: m.confidence,
        codeMismatch: m.codeMismatch,
      }));
    } else {
      rows = reconciliation.exceptions
        .filter((e) => e.type !== "Wrong Date")
        .map((e) => ({
          receipt: e.receipt,
          match: e.match,
          issue: e.issue,
          confidence: e.confidence || "",
          codeMismatch: !!e.codeMismatch,
          candidates: e.candidates || [],
          type: e.type,
        }));
    }

    const q = normalizeName(search);

    return rows.filter((r) => {
      const officeOk = filterOffice === "ALL" || r.receipt.office === filterOffice;
      const ownerOk = filterOwner === "ALL" || r.receipt.ownerRaw === filterOwner;
      const yearOk =
        filterTaxYear === "ALL" ||
        (r.match && String(r.match.taxYr || "") === String(filterTaxYear));
      const issueOk = filterIssue === "ALL" || (r.issue || "") === filterIssue;

      const maxTaxName = r.match
        ? normalizeName(`${r.match.raw?.FIRST || ""} ${r.match.raw?.LAST || ""}`)
        : "";

      const searchOk =
        !q ||
        normalizeName(r.receipt.customerRaw).includes(q) ||
        maxTaxName.includes(q) ||
        String(r.receipt.receipt).includes(q) ||
        normalizeName(r.receipt.ownerRaw).includes(q);

      const codeOk = !showCodeMismatches || r.codeMismatch;

      return officeOk && ownerOk && yearOk && issueOk && searchOk && codeOk;
    });
  }, [
    reconciliation,
    showMatched,
    filterOffice,
    filterOwner,
    filterTaxYear,
    filterIssue,
    search,
    showCodeMismatches,
  ]);

  const handleRun = () => {
    if (!taxReceipts.length) return alert("Upload Matrix EOD CSV first.");
    if (!maxTaxRows.length) return alert("Paste MaxTax data and click 'Parse MaxTax'.");
    setRan(true);
  };

  const linkCandidate = () => {
    alert("Manual linking UI is in place. Next step is persisting overrides to Supabase.");
  };

  return (
    <main className={styles.container}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>
            Daily Tax Reconciliation — {runDate || "Detect Date"}
          </h1>
          <div className={styles.welcomeMessage}>
            Ownership = <b>EOD CSR</b> &nbsp;|&nbsp; Preparer = Reference Only (code sharing safe)
          </div>
        </div>

        <div className={styles.rightActions}>
          <label className={`${styles.secondaryBtn} ${styles.uploadBtn}`}>
            Upload Matrix CSV
            <input
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && handleUploadEOD(e.target.files[0])}
            />
          </label>

          <button className={styles.secondaryBtn} onClick={handleParseMaxTax}>
            Parse MaxTax
          </button>

          <button className={styles.primaryBtn} onClick={handleRun}>
            Run Reconciliation
          </button>
        </div>
      </div>

      {/* MaxTax paste */}
      <div className={styles.card}>
        <h2 className={styles.subTitle}>MaxTax (Paste from Google Sheets)</h2>
        <textarea
          className={styles.textarea}
          value={maxTaxText}
          onChange={(e) => setMaxTaxText(e.target.value)}
          placeholder="Paste MaxTax export here (include headers, tab-separated)..."
          rows={7}
        />
      </div>

      {/* KPIs */}
      <div className={styles.kpis}>
        <Kpi title="Expected Tax Receipts" value={kpis.expected} />
        <Kpi title="MaxTax Returns" value={kpis.returns} />
        <Kpi title="Matched" value={ran ? kpis.matched : "—"} tone="success" />
        <Kpi title="Exceptions" value={ran ? kpis.exceptions : "—"} tone="danger" />
        <Kpi title="Not Transmitted" value={ran ? kpis.notTransmitted : "—"} tone="warning" />
        <Kpi title="Rejected" value={ran ? kpis.rejected : "—"} tone="danger" />
      </div>

      {/* Filters */}
      <div className={styles.card}>
        <h2 className={styles.subTitle}>
          {showMatched ? "Results" : "Exceptions"} {ran ? `(${filteredRows.length})` : ""}
        </h2>

        <div className={styles.filterBar}>
          <FilterSelect
            label="Office"
            value={filterOffice}
            setValue={setFilterOffice}
            options={offices}
          />
          <FilterSelect
            label="Owner"
            value={filterOwner}
            setValue={setFilterOwner}
            options={owners}
          />
          <FilterSelect
            label="Tax Year"
            value={filterTaxYear}
            setValue={setFilterTaxYear}
            options={taxYears}
          />
          <FilterSelect
            label="Issue"
            value={filterIssue}
            setValue={setFilterIssue}
            options={issueOptions}
          />

          <input
            className={`${styles.input} ${styles.searchGrow}`}
            type="search"
            placeholder="Search name / receipt / owner"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <label className={styles.filterGroup}>
            <span className={styles.filterLabel}>Show Matched</span>
            <input
              type="checkbox"
              checked={showMatched}
              onChange={() => setShowMatched(!showMatched)}
            />
          </label>

          <label className={styles.filterGroup}>
            <span className={styles.filterLabel}>Code Mismatch</span>
            <input
              type="checkbox"
              checked={showCodeMismatches}
              onChange={() => setShowCodeMismatches(!showCodeMismatches)}
            />
          </label>
        </div>

        {!ran ? (
          <div className={styles.muted}>
            Upload Matrix CSV → paste MaxTax → click <b>Parse MaxTax</b> → click{" "}
            <b>Run Reconciliation</b>.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th>Priority</th>
                  <th>Office</th>
                  <th>Date / Time</th>
                  <th>Method</th>
                  <th>Owner (EOD CSR)</th>
                  <th>Receipt #</th>
                  <th>Customer (Matrix)</th>
                  <th>Customer (MaxTax)</th>
                  <th style={{ textAlign: "right" }}>Matrix Tax Fee</th>
                  <th>Tax Yr</th>
                  <th>MaxTax Status</th>
                  <th>MaxTax Preparer</th>
                  <th>Issue</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>

              <tbody className={styles.tbody}>
                {filteredRows.map((r) => {
                  const issue = r.issue || "";
                  const priority =
                    issue === "Needs Correction"
                      ? "🔴"
                      : issue === "Not Transmitted"
                      ? "🟠"
                      : issue
                      ? "🟡"
                      : "🟢";

                  const isExpanded = expandedReceipt === r.receipt.receipt;

                  const rowClass =
                    issue === "Needs Correction"
                      ? styles.rowDanger
                      : issue === "Not Transmitted"
                      ? styles.rowWarning
                      : issue
                      ? styles.rowWarning
                      : styles.rowNeutral;

                  const yr = r.match?.taxYr || "";
                  const status = r.match?.status || "";
                  const preparer = r.match?.raw?.PREPARER || "";
                  const mismatch = r.codeMismatch ? "Code mismatch" : "";

                  const matrixCustomer = r.receipt.customerRaw || "—";
                  const maxTaxCustomer = r.match
                    ? `${r.match.raw?.FIRST || ""} ${r.match.raw?.LAST || ""}`.trim() || "—"
                    : "—";

                  return (
                    <React.Fragment key={r.receipt.receipt}>
                      <tr className={rowClass}>
                        <td className={styles.td}>{priority}</td>
                        <td className={`${styles.td} ${styles.bold}`}>{r.receipt.office}</td>

                        <td className={styles.td}>
                          {fmtDateTime(r.receipt.dateTimeRaw, r.receipt.dateTime)}
                        </td>

                        <td className={styles.td}>{r.receipt.method || "—"}</td>

                        <td className={`${styles.td} ${styles.bold}`}>{r.receipt.ownerRaw}</td>
                        <td className={styles.td}>{r.receipt.receipt}</td>

                        <td className={styles.td}>{matrixCustomer}</td>
                        <td className={styles.td}>{maxTaxCustomer}</td>

                        <td className={styles.td} style={{ textAlign: "right" }}>
                          {fmtMoney(r.receipt.taxFee)}
                        </td>

                        <td className={styles.td}>{yr || "—"}</td>
                        <td className={styles.td}>{status || "—"}</td>

                        <td className={styles.td}>
                          {preparer || "—"}
                          {mismatch && <span className={styles.badge}>{mismatch}</span>}
                        </td>

                        <td className={styles.td}>
                          <span className={issue ? styles.issueBad : styles.issueOk}>
                            <b>{issue || "OK"}</b>
                          </span>
                        </td>

                        <td className={styles.td} style={{ textAlign: "right" }}>
                          {issue === "No Return Found" || issue?.includes("Multiple possible") ? (
                            <button
                              className={styles.smallBtn}
                              onClick={() =>
                                setExpandedReceipt(isExpanded ? null : r.receipt.receipt)
                              }
                            >
                              {isExpanded ? "Hide" : "Match Helper"}
                            </button>
                          ) : issue === "Needs Correction" ? (
                            <button className={styles.dangerBtn}>Fix</button>
                          ) : issue === "Not Transmitted" ? (
                            <button className={styles.smallBtn}>Assign</button>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          {/* ✅ colSpan updated to match new column count (14) */}
                          <td className={styles.expandCell} colSpan={14}>
                            <div className={styles.helperHeader}>
                              <div>
                                <div className={styles.helperTitle}>
                                  Match Helper — Receipt #{r.receipt.receipt}
                                </div>
                                <div className={styles.muted}>
                                  Office <b>{r.receipt.office}</b> · Owner{" "}
                                  <b>{r.receipt.ownerRaw}</b> · Customer{" "}
                                  <b>{r.receipt.customerRaw}</b>
                                </div>
                              </div>
                              <div className={styles.helperHint}>
                                Tip: choose the row with the correct <b>Tax Yr</b>.
                              </div>
                            </div>

                            <div className={styles.tableWrap} style={{ marginTop: 10 }}>
                              {(r.candidates || []).length === 0 ? (
                                <div className={styles.muted} style={{ padding: 12 }}>
                                  No candidates found in MaxTax for this office/name.
                                </div>
                              ) : (
                                <table className={styles.table} style={{ minWidth: 900 }}>
                                  <thead className={styles.thead}>
                                    <tr>
                                      <th>Tax Yr</th>
                                      <th>Name</th>
                                      <th>Status</th>
                                      <th>Preparer</th>
                                      <th>Confidence</th>
                                      <th style={{ textAlign: "right" }}>Link</th>
                                    </tr>
                                  </thead>
                                  <tbody className={styles.tbody}>
                                    {r.candidates.map(({ m, score }) => (
                                      <tr key={m.key}>
                                        <td className={styles.td}>{m.taxYr || "—"}</td>
                                        <td className={styles.td}>
                                          {`${m.raw.FIRST || ""} ${m.raw.LAST || ""}`.trim() || "—"}
                                        </td>
                                        <td className={styles.td}>{m.status || "—"}</td>
                                        <td className={styles.td}>{m.raw.PREPARER || "—"}</td>
                                        <td className={styles.td}>
                                          {score >= 95 ? "High" : score >= 80 ? "Medium" : "Low"}
                                        </td>
                                        <td className={styles.td} style={{ textAlign: "right" }}>
                                          <button className={styles.smallBtn} onClick={linkCandidate}>
                                            Link
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

/* --------------------------- UI components --------------------------- */

function Kpi({ title, value, tone }) {
  const topBarClass =
    tone === "success"
      ? styles.kpiTopBarSuccess
      : tone === "danger"
      ? styles.kpiTopBarDanger
      : tone === "warning"
      ? styles.kpiTopBarWarning
      : "";

  return (
    <div className={styles.kpiCard}>
      <div className={`${styles.kpiTopBar} ${topBarClass}`} />
      <div className={styles.kpiLabel}>{title}</div>
      <div className={styles.kpiValue}>{value}</div>
    </div>
  );
}

function FilterSelect({ label, value, setValue, options }) {
  return (
    <label className={styles.filterGroup}>
      <span className={styles.filterLabel}>{label}</span>
      <select className={styles.select} value={value} onChange={(e) => setValue(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * ✅ Export BOTH ways to prevent the "got: object" router crash
 * - default import: import TaxReconciliation from "./TaxReconciliation"
 * - named import:   import { TaxReconciliation } from "./TaxReconciliation"
 */
export { TaxReconciliation };
export default TaxReconciliation;

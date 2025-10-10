import React, { useMemo } from 'react';
import styles from './CorpSummaryView.module.css';

const formatCurrency = (value, showParentheses = false) => {
    const num = parseFloat(value);
    if (!Number.isFinite(num)) {
        return '$0.00';
    }
    if (showParentheses && num !== 0) {
         return `($${Math.abs(num).toFixed(2)})`;
    }
    return `$${num.toFixed(2)}`;
};


const CorpSummaryView = ({ reports, startDate }) => {

  const summaryData = useMemo(() => {
    const officeMap = {};
    // First, group all reports by office number
    reports.forEach(r => {
      if (!officeMap[r.office_number]) {
        officeMap[r.office_number] = [];
      }
      officeMap[r.office_number].push(r);
    });

    // Now, process each office's collection of reports
    return Object.keys(officeMap).map(officeNumber => {
        const officeReports = officeMap[officeNumber];
        const combinedTransactions = officeReports.flatMap(r => r.raw_transactions || []);

        // --- Filter out "wash" transactions (e.g., a same-day void) ---
        const totalsByReceipt = combinedTransactions.reduce((acc, t) => {
            const receipt = t.Receipt;
            const total = parseFloat(t.Total) || 0;
            acc[receipt] = (acc[receipt] || 0) + total;
            return acc;
        }, {});
        const receiptsToExclude = new Set(Object.keys(totalsByReceipt).filter(r => Math.abs(totalsByReceipt[r]) < 0.01));
        const filteredTransactions = combinedTransactions.filter(t => !receiptsToExclude.has(t.Receipt));

        // --- Calculate final summary from filtered transactions ---
        const summary = {
            office_number: officeNumber,
            total_transactions: 0, // Initialize to 0
            new_total_count: 0, end_total_count: 0, rei_total_count: 0, ren_total_count: 0,
            ins_total_count: 0, nsd_total_count: 0, tax_total_count: 0, dmv_total_count: 0,
            other_total_count: 0, fee_from_new: 0, fee_from_end: 0, fee_from_rei: 0,
            fee_from_ren: 0, fee_from_ins: 0, fee_from_nsd: 0, fee_from_tax: 0,
            fee_from_dmv: 0, fee_from_other: 0, total_fee: 0, total_premium: 0,
            less_credit_card_fees: 0, less_nb_rwr_fees: 0, less_royalty: 0,
            credit_card_funds: 0, trust_deposit: 0, dmv_premium: 0,
        };

        filteredTransactions.forEach(t => {
            const company = t.Company || '';
            const total = parseFloat(t.Total) || 0;
            const premium = parseFloat(t.Premium) || 0;
            const fee = parseFloat(t.Fee) || 0;

            // Aggregate financial data
            summary.total_fee += fee;
            summary.total_premium += premium;
            if ((t.Method || '').includes('Credit Card')) {
                summary.credit_card_funds += total;
            }

            // Get fee amounts and other counts
            if (total > 0) {
                if (company.includes('Broker Fee')) { summary.fee_from_new += fee; }
                if (company.includes('Endorsement Fee')) { summary.end_total_count++; summary.fee_from_end += fee; }
                if (company.includes('Reinstatement Fee')) { summary.rei_total_count++; summary.fee_from_rei += fee; }
                if (company.includes('Renewal Fee')) { summary.ren_total_count++; summary.fee_from_ren += fee; }
                if (company.includes('Payment Fee')) { summary.ins_total_count++; summary.fee_from_ins += fee; }
                if (company.includes('Tax Prep Fee')) { summary.tax_total_count++; summary.fee_from_tax += fee; }
                if (company.includes('Registration Fee')) { summary.dmv_total_count++; summary.fee_from_dmv += fee; }
            }
        });
        
        // Sum up the pre-calculated values from the original reports
        officeReports.forEach(r => {
            summary.new_total_count += r.nb_rw_count || 0; // Correct way to get NEW count
            summary.less_credit_card_fees += r.convenience_fee || 0;
            summary.less_nb_rwr_fees += (r.nb_rw_count || 0) * 20;
            const royalty = ((r.pys_fee || 0) + (r.reissue_fee || 0) + (r.renewal_fee || 0) + (r.en_fee || 0)) * 0.20;
            summary.less_royalty += royalty;
            summary.trust_deposit += r.trust_deposit || 0;
            summary.dmv_premium += r.dmv_premium || 0;
        });

        // Correctly calculate total transactions by summing the individual counts
        summary.total_transactions = summary.new_total_count + summary.end_total_count + 
                                     summary.rei_total_count + summary.ren_total_count +
                                     summary.ins_total_count + summary.nsd_total_count +
                                     summary.tax_total_count + summary.dmv_total_count +
                                     summary.other_total_count;
        
        // ** FIX: Recalculate operating deposit from scratch to match corporate report **
        const due_from_franchisor = summary.trust_deposit < 0 ? summary.trust_deposit : 0;
        summary.operating_deposit = summary.total_fee - summary.less_credit_card_fees - summary.less_nb_rwr_fees - summary.less_royalty - Math.abs(due_from_franchisor);


        return summary;
    });

  }, [reports]);

  const formattedStartDate = useMemo(() => {
    // Prioritize the date from the actual report data, falling back to the selected start date
    const dateSource = reports.length > 0 ? reports[0].report_date : startDate;

    if (!dateSource || !/^\d{4}-\d{2}-\d{2}$/.test(dateSource)) {
        return 'Selected Date';
    }
    const [year, month, day] = dateSource.split('-');
    return `${month}/${day}/${year}`;
  }, [reports, startDate]);

  return (
    <div className={styles.corpSummaryContainer}>
      {summaryData.map(office => {
        const due_from_franchisor = office.trust_deposit < 0 ? office.trust_deposit : 0;
        
        return (
          <div key={office.office_number} className={styles.summaryCard}>
            <h3 className={styles.cardHeader}>Franchisee Deposit Summary Report For {formattedStartDate}</h3>
            <h4 className={styles.storeHeader}>Store : {office.office_number}</h4>
            
            <div className={styles.summaryGrid}>
                {/* --- Row 1 --- */}
                <div className={styles.cell}><span className={styles.label}>NEW TOTAL</span><span className={styles.count}>{office.new_total_count}</span></div>
                <div className={styles.cell}><span className={styles.label}>FEE from NEW</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.fee_from_new)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}><span className={styles.label}>TOTAL FEES</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.total_fee)}</div>
                <div className={styles.cell}><span className={styles.label}>TOTAL PREMIUM</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.total_premium)}</div>
                
                {/* --- Row 2 --- */}
                <div className={styles.cell}><span className={styles.label}>END TOTAL</span><span className={styles.count}>{office.end_total_count}</span></div>
                <div className={styles.cell}><span className={styles.label}>FEE from END</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.fee_from_end)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}><span className={styles.label}>LESS CREDIT CARD FEES</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.less_credit_card_fees, true)}</div>
                <div className={styles.cell}><span className={styles.label}>E-Payment</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(0)}</div>

                {/* --- Row 3 --- */}
                <div className={styles.cell}><span className={styles.label}>REI TOTAL</span><span className={styles.count}>{office.rei_total_count}</span></div>
                <div className={styles.cell}><span className={styles.label}>FEE from REI</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.fee_from_rei)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}><span className={styles.label}>LESS NB/RWR FEES</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.less_nb_rwr_fees, true)}</div>
                <div className={styles.cell}><span className={styles.label}>Premium Collected</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.total_premium)}</div>
                
                {/* --- Row 4 --- */}
                <div className={styles.cell}><span className={styles.label}>REN TOTAL</span><span className={styles.count}>{office.ren_total_count}</span></div>
                <div className={styles.cell}><span className={styles.label}>FEE from REN</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.fee_from_ren)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}><span className={styles.label}>LESS ROYALTY</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.less_royalty, true)}</div>
                <div className={styles.cell}><span className={styles.label}>DMV - REGISTRATION SERVICES</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.dmv_premium)}</div>

                {/* --- Row 5 --- */}
                <div className={styles.cell}><span className={styles.label}>INS TOTAL</span><span className={styles.count}>{office.ins_total_count}</span></div>
                <div className={styles.cell}><span className={styles.label}>FEE from INS</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.fee_from_ins)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}><span className={styles.label}>VOIDED FEE REFUND</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(0)}</div>
                <div className={styles.cell}><span className={styles.label}>MISC SERVICES</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(0, true)}</div>

                {/* --- Row 6 --- */}
                <div className={styles.cell}><span className={styles.label}>NSD TOTAL</span><span className={styles.count}>{office.nsd_total_count}</span></div>
                <div className={styles.cell}><span className={styles.label}>FEE from NSD</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.fee_from_nsd)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}><span className={styles.label}>LESS DUE FROM FRANCHISOR</span></div>
                <div className={`${styles.cell} ${styles.value}`} style={{color: '#e53e3e'}}>{formatCurrency(Math.abs(due_from_franchisor), true)}</div>
                <div className={styles.cell}><span className={styles.label}>CREDIT CARD FUNDS</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.credit_card_funds, true)}</div>
                
                {/* --- Row 7 --- */}
                <div className={styles.cell}><span className={styles.label}>TAX TOTAL</span><span className={styles.count}>{office.tax_total_count}</span></div>
                <div className={styles.cell}><span className={styles.label}>FEE from TAX</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.fee_from_tax)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}><span className={styles.label}>MISC SERVICES</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(0, true)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                
                {/* --- Row 8 --- */}
                <div className={styles.cell}><span className={styles.label}>DMV TOTAL</span><span className={styles.count}>{office.dmv_total_count}</span></div>
                <div className={styles.cell}><span className={styles.label}>FEE from DMV</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.fee_from_dmv)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}><span className={styles.label}>CREDIT CARD FEE</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.less_credit_card_fees)}</div>

                {/* --- Row 9 --- */}
                <div className={styles.cell}><span className={styles.label}>OTHER TOTAL</span><span className={styles.count}>{office.other_total_count}</span></div>
                <div className={styles.cell}><span className={styles.label}>FEE from OTHER</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.fee_from_other)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}><span className={styles.label}>VOIDED FEE REFUND</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(0)}</div>

                {/* --- Row 10 --- */}
                <div className={styles.cell}><span className={styles.label}>Convenience Fee (CC)</span></div>
                <div className={styles.cell}></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.less_credit_card_fees)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}><span className={styles.label}>NB/RWR FEE</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.less_nb_rwr_fees)}</div>
                
                {/* --- Row 11 --- */}
                <div className={styles.cell}><span className={styles.label}>MVR/PIP Fee</span></div>
                <div className={styles.cell}></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(0)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}><span className={styles.label}>Fee Royalty</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.less_royalty)}</div>
                
                {/* --- Row 12 --- */}
                <div className={styles.cell}><span className={styles.label}>TOTAL TRANSACTIONS</span><span className={styles.count}>{office.total_transactions}</span></div>
                <div className={styles.cell}><span className={styles.label}>TOTAL FEE</span></div>
                <div className={`${styles.cell} ${styles.value}`}>{formatCurrency(office.total_fee)}</div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>

                {/* --- Row 13 --- */}
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}><span className={styles.label}>OPERATING DEPOSIT</span></div>
                <div className={`${styles.cell} ${styles.value} ${styles.boldValue}`}>{formatCurrency(office.operating_deposit)}</div>
                <div className={styles.cell}><span className={styles.label}>TRUST DEPOSIT</span></div>
                <div className={`${styles.cell} ${styles.value} ${styles.boldValue}`}>{formatCurrency(Math.max(0, office.trust_deposit))}</div>

                {/* --- Row 14 --- */}
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                <div className={styles.cell}></div>
                {due_from_franchisor < 0 && (
                    <>
                        <div className={styles.cell}><span className={styles.label}>DUE FROM FRANCHISOR</span></div>
                        <div className={`${styles.cell} ${styles.value} ${styles.boldValue}`} style={{color: '#e53e3e'}}>{formatCurrency(due_from_franchisor)}</div>
                    </>
                )}
            </div>
          </div>
        )
      })}
    </div>
  );
};

export default CorpSummaryView;



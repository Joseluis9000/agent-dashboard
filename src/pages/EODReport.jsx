import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './EODReport.module.css';
import BetaWarningModal from '../components/BetaWarningModal';
import { supabase } from '../supabaseClient';
import SuccessModal from '../components/Modals/SuccessModal';

const HEADERS = ['Receipt', 'ID', 'Customer', 'Customer Type', 'Date / Time', 'CSR', 'Office', 'Type', 'Company', 'Policy', 'Financed', 'Reference #', 'Method', 'Premium', 'Fee', 'Total'];

const EODReport = () => {
    const navigate = useNavigate();
    const location = useLocation();
    
    const reportToEdit = location.state?.reportToEdit;

    const [editingReportId, setEditingReportId] = useState(null);
    const [logText, setLogText] = useState('');
    const [transactions, setTransactions] = useState([]);
    const [error, setError] = useState('');
    const [cashInHand, setCashInHand] = useState('');
    const [expensesAmount, setExpensesAmount] = useState('');
    const [expensesExplanation, setExpensesExplanation] = useState('');
    const [referrals, setReferrals] = useState([{ clientName: '', amount: '', policyNumber: '', id: 1 }]);
    const [agentInitials, setAgentInitials] = useState('');
    const [verifiedReceipts, setVerifiedReceipts] = useState(false);
    const [verifiedDocs, setVerifiedDocs] = useState(false);
    const [notes, setNotes] = useState('');
    const [formErrors, setFormErrors] = useState({});
    const [isModalOpen, setIsModalOpen] = useState(!reportToEdit);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);
    const [user, setUser] = useState(null);
    const [receiptFiles, setReceiptFiles] = useState([]);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        fetchUser();
    }, []);

    useEffect(() => {
        if (reportToEdit) {
            setEditingReportId(reportToEdit.id);
            const rawText = (reportToEdit.raw_transactions || []).map(t => 
                HEADERS.map(h => t[h] || '').join('\t')
            ).join('\n');
            
            setLogText(rawText);
            setTransactions(reportToEdit.raw_transactions || []);
            setCashInHand(reportToEdit.total_cash_in_hand || '');
            setExpensesAmount(reportToEdit.expenses_amount || '');
            setExpensesExplanation(reportToEdit.expenses_explanation || '');
            setReferrals(reportToEdit.referrals && reportToEdit.referrals.length > 0 ? reportToEdit.referrals : [{ clientName: '', amount: '', policyNumber: '', id: 1 }]);
            setAgentInitials(reportToEdit.agent_initials || '');
            setVerifiedReceipts(reportToEdit.verified_receipts_match || false);
            setVerifiedDocs(reportToEdit.verified_docs_uploaded || false);
            setNotes(reportToEdit.notes || '');
        }
    }, [reportToEdit]);

    useEffect(() => {
        const checkForExistingReport = async (currentUser) => {
            if (!currentUser || reportToEdit) return;
            const today = new Date().toISOString().split('T')[0];
            const dateStart = `${today}T00:00:00.000Z`;
            const dateEnd = `${today}T23:59:59.999Z`;

            const { data } = await supabase
                .from('eod_reports')
                .select('id')
                .eq('agent_email', currentUser.email)
                .gte('created_at', dateStart)
                .lte('created_at', dateEnd)
                .limit(1)
                .single();

            if (data) {
                alert("You have already submitted a report for today. You can edit it from the 'Office & Agent EODs' page.");
                navigate('/office-eods');
            }
        };

        if (user) {
            checkForExistingReport(user);
        }
    }, [user, reportToEdit, navigate]);

    const handleFileChange = (event) => {
        setReceiptFiles([...event.target.files]);
    };

    const parsePastedText = (text) => {
        const lines = text.trim().split('\n');
        return lines.map(line => {
            const columns = line.split('\t');
            const transaction = {};
            HEADERS.forEach((header, index) => {
                transaction[header] = columns[index] || '';
            });
            return transaction;
        });
    };
    
    const calculateSummary = (trans, expenses, referralList) => {
        const summary = {
            nb_rw_count: 0, dmv_count: 0, cash_premium: 0, cash_fee: 0,
            credit_premium: 0, credit_fee: 0, nb_rw_fee: 0, en_fee: 0,
            reissue_fee: 0, renewal_fee: 0, pys_fee: 0, tax_prep_fee: 0,
            registration_fee: 0, convenience_fee: 0, dmv_premium: 0,
        };
        for (const t of trans) {
            const total = parseFloat(t.Total) || 0;
            const premium = parseFloat(t.Premium) || 0;
            const fee = parseFloat(t.Fee) || 0;
            const type = t.Type || '';
            const company = t.Company || '';
            const method = t.Method || '';
            if (type.includes('NEW') || type.includes('RWR')) summary.nb_rw_count += Math.sign(total);
            if (company.includes('Registration Fee')) summary.dmv_count += Math.sign(total);
            if (method.includes('Cash')) {
                summary.cash_premium += premium;
                summary.cash_fee += fee;
            } else if (method.includes('Credit Card')) {
                summary.credit_premium += premium;
                summary.credit_fee += fee;
            }
            if (company.includes('Broker Fee')) summary.nb_rw_fee += fee;
            if (company.includes('Endorsement Fee')) summary.en_fee += fee;
            if (company.includes('Reinstatement Fee')) summary.reissue_fee += fee;
            if (company.includes('Renewal Fee')) summary.renewal_fee += fee;
            if (company.includes('Payment Fee')) summary.pys_fee += fee;
            if (company.includes('Registration Fee')) summary.registration_fee += fee;
            if (company.includes('Convenience Fee (c')) summary.convenience_fee += fee;
            if (company.includes('Dmv - Registration S')) summary.dmv_premium += premium;
            if (company.includes('Tax Prep Fee') && !method.includes('Wire')) summary.tax_prep_fee += fee;
        }
        const totalPremium = summary.cash_premium + summary.credit_premium;
        const totalFee = summary.cash_fee + summary.credit_fee;
        const totalCreditPayment = summary.credit_premium + summary.credit_fee;
        const nbRwCorpFee = summary.nb_rw_count * 20;
        const feeRoyalty = (summary.pys_fee + summary.reissue_fee + summary.renewal_fee + summary.en_fee) * 0.20;
        const totalReferralsPaid = referralList.reduce((sum, ref) => sum + (parseFloat(ref.amount) || 0), 0);
        summary.trust_deposit = (totalPremium + summary.convenience_fee + nbRwCorpFee + feeRoyalty) - (summary.dmv_premium + totalCreditPayment);
        summary.dmv_deposit = summary.dmv_premium;
        summary.revenue_deposit = totalFee - (summary.convenience_fee + nbRwCorpFee + feeRoyalty + (parseFloat(expensesAmount) || 0) + totalReferralsPaid);
        return summary;
    };
    
    const eodDataMemo = useMemo(() => {
        if (transactions.length === 0) return null;
        return calculateSummary(transactions, expensesAmount, referrals);
    }, [transactions, expensesAmount, referrals]);

    const handlePaste = (e) => {
        e.preventDefault();
        const pastedText = e.clipboardData.getData('text');
        setLogText(pastedText);
        setError('');
        try {
            const parsedTransactions = parsePastedText(pastedText);
            setTransactions(parsedTransactions);
        } catch (err) {
            setError("Failed to parse the data. Please ensure it is tab-separated.");
            setTransactions([]);
        }
    };
    
    const handleReferralChange = (index, event) => {
        const newReferrals = [...referrals];
        newReferrals[index][event.target.name] = event.target.value;
        setReferrals(newReferrals);
    };

    const addReferral = () => {
        setReferrals([...referrals, { clientName: '', amount: '', policyNumber: '', id: Date.now() }]);
    };

    const removeReferral = (index) => {
        const newReferrals = referrals.filter((_, i) => i !== index);
        setReferrals(newReferrals);
    };

    const validateForm = () => {
        const errors = {};
        if (parseFloat(expensesAmount) > 0 && !expensesExplanation.trim()) {
            errors.expensesExplanation = "An explanation is required for expenses.";
        }
        referrals.forEach((ref, index) => {
            if (parseFloat(ref.amount) > 0) {
                if (!ref.clientName.trim()) errors[`ref_clientName_${index}`] = "Client name is required.";
                if (!ref.policyNumber.trim()) errors[`ref_policyNumber_${index}`] = "Policy number is required.";
            }
        });
        if (!agentInitials.trim()) {
            errors.agentInitials = "Agent initials are required.";
        }
        if (transactions.length === 0) {
            alert("Cannot submit an empty report. Please paste transaction data.");
            return false;
        }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };
    
    const handleSubmit = async () => {
        if (!validateForm()) {
            alert("Please fix the errors before submitting.");
            return;
        }
        if (!user) {
            alert("Could not find user information. Please make sure you are logged in.");
            return;
        }
        setIsSubmitting(true);
        setSubmitError(null);
        
        try {
            const uploadedUrls = [];
            if (receiptFiles.length > 0) {
                const uploadPromises = receiptFiles.map(file => {
                    const filePath = `public/${user.id}/${Date.now()}_${file.name}`;
                    return supabase.storage.from('receipts').upload(filePath, file);
                });
                const uploadResults = await Promise.all(uploadPromises);
                for (const result of uploadResults) {
                    if (result.error) throw result.error;
                    const { data } = supabase.storage.from('receipts').getPublicUrl(result.data.path);
                    uploadedUrls.push(data.publicUrl);
                }
            }

            const currentOffice = transactions[0]?.Office || 'N/A';
            const reportData = {
                agent_email: user.email, 
                office_number: currentOffice,
                ...eodDataMemo,
                total_cash_in_hand: parseFloat(cashInHand) || 0,
                cash_difference: cashDifference,
                expenses_amount: parseFloat(expensesAmount) || 0,
                expenses_explanation: expensesExplanation,
                referrals: referrals.filter(r => r.clientName && r.amount),
                agent_initials: agentInitials,
                notes: notes,
                verified_receipts_match: verifiedReceipts,
                verified_docs_uploaded: verifiedDocs,
                raw_transactions: transactions,
                receipt_urls: uploadedUrls.length > 0 ? uploadedUrls : (reportToEdit?.receipt_urls || []),
            };

            if (editingReportId) {
                const { error } = await supabase
                    .from('eod_reports')
                    .update(reportData)
                    .eq('id', editingReportId);
                if (error) throw error;
            } else {
                const { data: newReport, error } = await supabase
                    .from('eod_reports')
                    .insert([reportData])
                    .select()
                    .single();

                if (error) throw error;
                setEditingReportId(newReport.id);
            }

            setShowSuccessModal(true);
        } catch (error) {
            console.error('Error submitting EOD report:', error.message);
            setSubmitError(`Submission failed: ${error.message}`);
            alert(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalCashCollected = eodDataMemo ? eodDataMemo.cash_premium + eodDataMemo.cash_fee : 0;
    const totalReferralsPaid = referrals.reduce((sum, ref) => sum + (parseFloat(ref.amount) || 0), 0);
    const totalCashPayouts = (parseFloat(expensesAmount) || 0) + totalReferralsPaid;
    const cashForDMV = eodDataMemo ? eodDataMemo.dmv_deposit : 0;
    const cashForTrust = eodDataMemo ? Math.max(0, eodDataMemo.trust_deposit) : 0;
    const netCashCollected = totalCashCollected - totalCashPayouts;
    const cashForRevenue = netCashCollected - cashForDMV - cashForTrust;
    const expectedCashInHand = cashForDMV + cashForTrust + cashForRevenue;
    const cashDifference = cashInHand ? parseFloat(cashInHand) - expectedCashInHand : 0;

    return (
        <>
            {isModalOpen && <BetaWarningModal onClose={() => setIsModalOpen(false)} />}
            
            <main className={styles.mainContent}>
                <div className={styles.pageHeader}>
                    <h1>{editingReportId ? 'Edit EOD Report' : 'Agent End of Day Report'}</h1>
                </div>

                <div className={styles.card}>
                    <h2>Step 1: Paste Transaction Log</h2>
                    <p>Copy the transaction data from your source and paste it below (data only, no headers).</p>
                    <textarea
                        className={styles.logTextarea}
                        onPaste={handlePaste}
                        onChange={(e) => setLogText(e.target.value)}
                        value={logText}
                        placeholder="Right-click and paste your copied transaction data here..."
                    />
                    {error && <p className={styles.errorText}>{error}</p>}
                </div>
                
                {transactions.length > 0 && (
                    <div className={`${styles.card} ${styles.tableCard}`}>
                        <h2>Step 2: Verify Pasted Data</h2>
                        <div className={styles.tableContainer}>
                            <table className={styles.dataTable}>
                                <thead>
                                    <tr>{HEADERS.map(h => <th key={h}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {transactions.map((t, index) => (
                                        <tr key={`${t.Receipt}-${t.ID}-${index}`}>
                                            {HEADERS.map(h => <td key={`${h}-${index}`}>{t[h]}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                
                {transactions.length > 0 && eodDataMemo && (
                    <div className={styles.bottomGrid}>
                        <div className={styles.summaryColumn}>
                             <div className={styles.card}>
                                <h2>Step 3: Auto-Calculated Summary</h2>
                                <div className={styles.resultsGrid}>
                                    {Object.entries(eodDataMemo).filter(([key]) => !key.includes('_deposit')).map(([key, value]) => (
                                        <div key={key} className={styles.resultItem}>
                                            <span className={styles.resultKey}>{key.replace(/_/g, ' ')}:</span>
                                            <span className={styles.resultValue}>
                                                {key.includes('count') ? value : value.toFixed(2)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.card}>
                                <h2>Step 4: Deposit Calculation</h2>
                                <div className={styles.depositsGrid}>
                                    <div className={styles.depositItem}>
                                        <span className={styles.depositKey}>Trust Deposit</span>
                                        <span className={styles.depositValue}>${eodDataMemo.trust_deposit.toFixed(2)}</span>
                                    </div>
                                    <div className={styles.depositItem}>
                                        <span className={styles.depositKey}>DMV Deposit</span>
                                        <span className={styles.depositValue}>${eodDataMemo.dmv_deposit.toFixed(2)}</span>
                                    </div>
                                    <div className={styles.depositItem}>
                                        <span className={styles.depositKey}>Revenue Deposit</span>
                                        <span className={styles.depositValue}>${eodDataMemo.revenue_deposit.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.entryColumn}>
                            <div className={styles.card}>
                                <h2>Step 5: Payouts, Balancing & Verification</h2>
                                
                                <div className={styles.inputGroup}>
                                    <label>Expenses Amount</label>
                                    <input type="number" value={expensesAmount} onChange={e => setExpensesAmount(e.target.value)} placeholder="0.00" />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label>Expenses Explanation</label>
                                    <input type="text" value={expensesExplanation} onChange={e => setExpensesExplanation(e.target.value)} placeholder="Reason for expense..." />
                                    {formErrors.expensesExplanation && <span className={styles.errorText}>{formErrors.expensesExplanation}</span>}
                                </div>
                                
                                <div className={styles.referralSection}>
                                    <label>Referral Payments</label>
                                    <div className={styles.referralGrid}>
                                        <div className={styles.referralHeader}>Client Name</div>
                                        <div className={styles.referralHeader}>Amount</div>
                                        <div className={styles.referralHeader}>Policy Number</div>
                                        <div /> 
                                        {referrals.map((ref, index) => (
                                            <React.Fragment key={ref.id}>
                                                <div>
                                                    <input type="text" name="clientName" value={ref.clientName} onChange={e => handleReferralChange(index, e)} placeholder="Client Name" />
                                                    {formErrors[`ref_clientName_${index}`] && <span className={styles.errorText}>{formErrors[`ref_clientName_${index}`]}</span>}
                                                </div>
                                                <div>
                                                    <input type="number" name="amount" value={ref.amount} onChange={e => handleReferralChange(index, e)} placeholder="Amount" />
                                                </div>
                                                <div>
                                                    <input type="text" name="policyNumber" value={ref.policyNumber} onChange={e => handleReferralChange(index, e)} placeholder="Policy Number" />
                                                    {formErrors[`ref_policyNumber_${index}`] && <span className={styles.errorText}>{formErrors[`ref_policyNumber_${index}`]}</span>}
                                                </div>
                                                <div>
                                                    {referrals.length > 1 && (
                                                        <button type="button" onClick={() => removeReferral(index)} className={styles.removeButton}>-</button>
                                                    )}
                                                </div>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    <button type="button" onClick={addReferral} className={styles.addButton}>+ Add Referral</button>
                                </div>

                                <div className={styles.balancingSection}>
                                    <h3>Cash Balancing</h3>
                                    <div className={styles.balanceItem}>
                                        <span>Cash Needed for DMV Deposit:</span>
                                        <strong>${cashForDMV.toFixed(2)}</strong>
                                    </div>
                                    <div className={styles.balanceItem}>
                                        <span>Cash Needed for Trust Deposit:</span>
                                        <strong>${cashForTrust.toFixed(2)}</strong>
                                    </div>
                                    <div className={styles.balanceItem}>
                                        <span>Cash Needed for Revenue Deposit:</span>
                                        <strong>${cashForRevenue.toFixed(2)}</strong>
                                    </div>
                                    <hr className={styles.divider} />
                                    <div className={styles.balanceItem}>
                                        <span>(=) Total Expected Cash in Hand:</span>
                                        <strong>${expectedCashInHand.toFixed(2)}</strong>
                                    </div>
                                    <hr className={styles.divider} />
                                    <div className={styles.balanceItem}>
                                        <label htmlFor="cashInHand">Your Actual Cash in Hand:</label>
                                        <input id="cashInHand" type="number" value={cashInHand} onChange={e => setCashInHand(e.target.value)} placeholder="Cash Amount" />
                                    </div>
                                    <div className={styles.balanceItem}>
                                        <span>Difference (Over / Short):</span>
                                        <strong className={cashDifference === 0 ? '' : (cashDifference > 0 ? styles.over : styles.short)}>
                                            ${cashDifference.toFixed(2)}
                                        </strong>
                                    </div>
                                </div>

                                <div className={styles.verificationSection}>
                                    <h3>Final Verification</h3>
                                    <div className={styles.inputGroup}>
                                        <label>Your Initials</label>
                                        <input type="text" value={agentInitials} onChange={e => setAgentInitials(e.target.value)} placeholder="A.S." />
                                        {formErrors.agentInitials && <span className={styles.errorText}>{formErrors.agentInitials}</span>}
                                    </div>
                                    <div className={styles.checkboxGroup}>
                                        <input type="checkbox" id="verifyReceipts" checked={verifiedReceipts} onChange={() => setVerifiedReceipts(!verifiedReceipts)} />
                                        <label htmlFor="verifyReceipts">I verified all names, accounting types, and amounts match MATRIX receipts.</label>
                                    </div>
                                    <div className={styles.checkboxGroup}>
                                        <input type="checkbox" id="verifyDocs" checked={verifiedDocs} onChange={() => setVerifiedDocs(!verifiedDocs)} />
                                        <label htmlFor="verifyDocs">I checked all transactions and ensured all supporting documents are uploaded.</label>
                                    </div>
                                    <div className={styles.inputGroup}>
                                        <label>Notes</label>
                                        <textarea
                                            className={styles.notesTextarea}
                                            value={notes}
                                            onChange={e => setNotes(e.target.value)}
                                            placeholder="Add any relevant notes for the day here..."
                                            rows="4"
                                        />
                                    </div>
                                    
                                    <div className={styles.inputGroup}>
                                        <label>Upload Receipts / Deposit Slips</label>
                                        <input 
                                            type="file" 
                                            multiple 
                                            onChange={handleFileChange} 
                                        />
                                        {receiptFiles.length > 0 && (
                                            <ul style={{ listStyleType: 'none', padding: 0, marginTop: '10px', textAlign: 'left' }}>
                                                {receiptFiles.map((file, index) => (
                                                    <li key={index} style={{ fontSize: '0.9rem' }}>📄 {file.name}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                                
                                {submitError && <p className={styles.errorText} style={{textAlign: "center"}}>{submitError}</p>}
                                <button
                                    onClick={handleSubmit}
                                    className={styles.submitButton}
                                    disabled={isSubmitting || transactions.length === 0}
                                >
                                    {isSubmitting ? 'Submitting...' : (editingReportId ? 'Update Report' : 'Submit EOD Report')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {showSuccessModal && (
                <SuccessModal 
                    message={`Your EOD report has been ${editingReportId ? 'updated' : 'saved'} correctly.`}
                    onClose={() => setShowSuccessModal(false)}
                    onGoToDashboard={() => navigate('/office-eods')}
                />
            )}
        </>
    );
};

export default EODReport;
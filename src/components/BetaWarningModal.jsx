import React from 'react';
import styles from './BetaWarningModal.module.css';

const BetaWarningModal = ({ onClose }) => {
    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <h2>📢 Beta Version Notice</h2>
                <p>
                    This is a BETA version of the EOD report tool. The calculations and features are still under review.
                </p>
                <p className={styles.warningText}>
                    Please do not use this for official End of Day reporting at this moment.
                </p>
                <button onClick={onClose} className={styles.closeButton}>
                    I Understand
                </button>
            </div>
        </div>
    );
};

export default BetaWarningModal;
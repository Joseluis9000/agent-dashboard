import React from 'react';
import styles from './SuccessModal.module.css';

const SuccessModal = ({ message, onClose, onGoToDashboard }) => {
    return (
        <div className={styles.modalBackdrop}>
            <div className={styles.modalContent}>
                <div className={styles.checkmark}>✅</div>
                <h2>Submission Successful!</h2>
                <p>{message}</p>
                <div className={styles.buttonGroup}>
                    <button 
                        onClick={onClose}
                        className={styles.primaryButton}
                    >
                        Edit Report {/* <-- Text changed here */}
                    </button>
                    <button 
                        onClick={onGoToDashboard}
                        className={styles.secondaryButton}
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SuccessModal;
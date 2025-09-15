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

                {/* Video Player */}
                <div className={styles.videoContainer}>
                    <iframe 
                        src="https://www.youtube.com/embed/PUft5j9K7Zw?si=Er7jNF1LXQiI5WI4" 
                        title="YouTube video player" 
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                        allowFullScreen>
                    </iframe>
                </div>

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
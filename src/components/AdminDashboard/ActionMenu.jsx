import React, { useState, useEffect, useRef } from 'react';
import styles from './AdminDashboard.module.css';

const ActionMenu = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [menuRef]);

    return (
        <div className={styles.actionMenuContainer} ref={menuRef}>
            <button className={styles.actionButton} onClick={() => setIsOpen(!isOpen)}>
                ...
            </button>
            {isOpen && (
                <div className={styles.dropdownMenu}>
                    {children}
                </div>
            )}
        </div>
    );
};

export default ActionMenu;
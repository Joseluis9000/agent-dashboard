import React from 'react';

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) {
    return null;
  }

  return (
    // Backdrop: fixed, full-screen, on-top, dark & transparent
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose} 
    >
      {/* Content Box: white, rounded, shadow, max-width */}
      <div 
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()} 
      >
        {/* Header: padding, border-bottom, flex layout */}
        <div className="flex justify-between items-center p-5 border-b">
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          <button 
            type="button" 
            className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ml-auto inline-flex justify-center items-center"
            onClick={onClose}
          >
            {/* "X" Icon */}
            <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
            </svg>
            <span className="sr-only">Close modal</span>
          </button>
        </div>

        {/* Body: padding */}
        <div className="p-6 space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
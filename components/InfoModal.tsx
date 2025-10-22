import React from 'react';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, title, icon, children }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-modal-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white rounded-t-xl z-10">
           <div className="flex items-center gap-3">
             {icon && <div className="flex-shrink-0 bg-blue-100 text-blue-600 p-2 rounded-full">{icon}</div>}
             <div>
                <h2 id="info-modal-title" className="text-xl font-bold text-gray-800">
                  {title}
                </h2>
             </div>
           </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        
        <main className="p-6 overflow-y-auto prose prose-blue max-w-none">
          {children}
        </main>
      </div>
    </div>
  );
};
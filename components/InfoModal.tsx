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
      className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-modal-title"
    >
      <div
        className="bg-card rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all border"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-6 border-b border-border flex justify-between items-center sticky top-0 bg-card rounded-t-lg z-10">
           <div className="flex flex-col gap-1.5">
              <h2 id="info-modal-title" className="text-lg font-semibold text-foreground">
                {title}
              </h2>
           </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:bg-accent rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        
        <main className="p-6 overflow-y-auto prose prose-slate max-w-none prose-p:text-muted-foreground prose-h3:text-foreground prose-li:text-muted-foreground">
          {children}
        </main>
      </div>
    </div>
  );
};
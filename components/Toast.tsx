
import React, { useEffect, useState } from 'react';
import { CheckIcon } from './icons/CheckIcon';

interface ToastProps {
  message: string | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        // Delay the actual state clearing to allow for fade out
        setTimeout(onClose, 300);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [message, onClose]);

  const containerClasses = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 ease-in-out ${
    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
  }`;

  if (!message && !isVisible) {
      return null;
  }

  return (
    <div className={containerClasses} role="alert">
      <div className="flex items-center gap-3 bg-slate-900 text-white px-5 py-3 rounded-full shadow-2xl border border-slate-800">
        <div className="flex-shrink-0 bg-green-500 rounded-full p-1">
            <CheckIcon className="w-3.5 h-3.5 text-white" />
        </div>
        <p className="text-sm font-bold tracking-tight">{message}</p>
        <button
          onClick={() => {
              setIsVisible(false);
              setTimeout(onClose, 300);
          }}
          className="p-1 -mr-1 text-white/50 hover:text-white rounded-full focus:outline-none transition-colors"
          aria-label="Dismiss"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

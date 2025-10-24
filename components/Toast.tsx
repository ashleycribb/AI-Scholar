
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
    } else {
      setIsVisible(false);
    }
  }, [message]);

  const containerClasses = `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-in-out ${
    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
  }`;

  if (!message) {
      return null;
  }

  return (
    <div className={containerClasses} role="alert">
      <div className="flex items-center gap-3 bg-foreground text-background px-4 py-2.5 rounded-full shadow-lg">
        <div className="flex-shrink-0 bg-green-500 rounded-full p-0.5">
            <CheckIcon className="w-4 h-4 text-white" />
        </div>
        <p className="text-sm font-medium">{message}</p>
        <button
          onClick={onClose}
          className="p-1 -mr-2 text-background/70 hover:text-background rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
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

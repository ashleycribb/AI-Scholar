import React from 'react';
import { AnalyticsIcon } from './icons/AnalyticsIcon';

interface AnalyticsButtonProps {
  onClick: () => void;
}

export const AnalyticsButton: React.FC<AnalyticsButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="w-14 h-14 flex items-center justify-center bg-secondary text-secondary-foreground rounded-full shadow-lg hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-transform hover:scale-110"
      aria-label="Open analytics dashboard"
    >
      <AnalyticsIcon className="w-6 h-6" />
    </button>
  );
};
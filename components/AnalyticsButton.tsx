import React from 'react';
import { AnalyticsIcon } from './icons/AnalyticsIcon';

interface AnalyticsButtonProps {
  onClick: () => void;
}

export const AnalyticsButton: React.FC<AnalyticsButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="p-4 bg-gray-700 text-white rounded-full shadow-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-transform hover:scale-110"
      aria-label="Open analytics dashboard"
    >
      <AnalyticsIcon className="w-6 h-6" />
    </button>
  );
};
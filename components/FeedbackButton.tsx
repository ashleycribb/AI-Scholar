import React from 'react';
import { FeedbackIcon } from './icons/FeedbackIcon';

interface FeedbackButtonProps {
  onClick: () => void;
}

export const FeedbackButton: React.FC<FeedbackButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-20 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform hover:scale-110"
      aria-label="Provide feedback or suggest a feature"
    >
      <FeedbackIcon className="w-6 h-6" />
    </button>
  );
};

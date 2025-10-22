import React from 'react';
import { FeedbackIcon } from './icons/FeedbackIcon';

interface FeedbackButtonProps {
  onClick: () => void;
}

export const FeedbackButton: React.FC<FeedbackButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="w-14 h-14 flex items-center justify-center bg-secondary text-secondary-foreground rounded-full shadow-lg hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-transform hover:scale-110"
      aria-label="Provide feedback or suggest a feature"
    >
      <FeedbackIcon className="w-6 h-6" />
    </button>
  );
};
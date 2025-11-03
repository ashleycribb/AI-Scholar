
import React from 'react';
import { QuestionMarkCircleIcon } from './icons/QuestionMarkCircleIcon';

interface HelpButtonProps {
  onClick: () => void;
}

export const HelpButton: React.FC<HelpButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="p-2 text-muted-foreground hover:bg-accent rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label="Help & Onboarding"
      title="Help & Onboarding"
    >
      <QuestionMarkCircleIcon className="w-5 h-5" />
    </button>
  );
};

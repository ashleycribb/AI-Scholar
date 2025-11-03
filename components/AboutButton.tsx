
import React from 'react';
import { AboutIcon } from './icons/AboutIcon';

interface AboutButtonProps {
  onClick: () => void;
}

export const AboutButton: React.FC<AboutButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="p-2 text-muted-foreground hover:bg-accent rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label="About this application"
      title="About"
    >
      <AboutIcon className="w-5 h-5" />
    </button>
  );
};

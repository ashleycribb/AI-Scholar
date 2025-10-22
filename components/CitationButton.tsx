import React from 'react';
import { CitationIcon } from './icons/CitationIcon';

interface CitationButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export const CitationButton: React.FC<CitationButtonProps> = ({ onClick, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-14 h-14 flex items-center justify-center bg-secondary text-secondary-foreground rounded-full shadow-lg hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-transform hover:scale-110 disabled:bg-muted"
      aria-label="Generate Citations"
    >
      <CitationIcon className="w-6 h-6" />
    </button>
  );
};
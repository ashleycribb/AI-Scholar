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
      className="p-4 bg-teal-600 text-white rounded-full shadow-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-transform hover:scale-110 disabled:bg-gray-400"
      aria-label="Generate Citations"
    >
      <CitationIcon className="w-6 h-6" />
    </button>
  );
};

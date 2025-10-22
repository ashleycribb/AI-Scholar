import React from 'react';
import { ChatIcon } from './icons/ChatIcon';

interface ChatButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export const ChatButton: React.FC<ChatButtonProps> = ({ onClick, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-4 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-transform hover:scale-110 disabled:bg-gray-400 disabled:cursor-not-allowed"
      aria-label="Refine research with AI chat"
    >
      <ChatIcon className="w-6 h-6" />
    </button>
  );
};

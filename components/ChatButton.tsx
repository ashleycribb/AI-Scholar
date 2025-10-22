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
      className="w-16 h-16 flex items-center justify-center bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-transform hover:scale-110 disabled:bg-primary/50 disabled:cursor-not-allowed"
      aria-label="Refine research with AI chat"
    >
      <ChatIcon className="w-7 h-7" />
    </button>
  );
};
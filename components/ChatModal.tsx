import React from 'react';
import type { ChatMessage } from '../types';
import { ChatPanel } from './ChatPanel';
import { ChatIcon } from './icons/ChatIcon';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  onSendMessage: (message: string) => void;
}

export const ChatModal: React.FC<ChatModalProps> = ({ isOpen, onClose, ...chatPanelProps }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-modal-title"
    >
      <div
        className="bg-card rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col transform transition-all border"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-border flex justify-between items-center flex-shrink-0">
          <div className="flex flex-col gap-1.5">
             <h2 id="chat-modal-title" className="text-lg font-semibold text-foreground">
              Refine with AI
            </h2>
            <p className="text-sm text-muted-foreground">Ask follow-up questions about the results.</p>
           </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:bg-accent rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Close chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        
        <main className="flex-grow overflow-hidden">
            <ChatPanel {...chatPanelProps} />
        </main>

      </div>
    </div>
  );
};
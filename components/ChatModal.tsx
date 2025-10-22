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
      className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-modal-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
             <div className="flex-shrink-0 bg-indigo-100 text-indigo-600 p-2 rounded-full">
                <ChatIcon className="w-6 h-6" />
             </div>
             <div>
                <h2 id="chat-modal-title" className="text-xl font-bold text-gray-800">
                  Refine with AI
                </h2>
                <p className="text-sm text-gray-500">Ask follow-up questions about the results.</p>
             </div>
           </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

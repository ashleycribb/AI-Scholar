import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { SendIcon } from './icons/SendIcon';

interface ChatPanelProps {
    history: ChatMessage[];
    isLoading: boolean;
    error: string | null;
    onSendMessage: (message: string) => void;
}

const ChatBlinkingCursor: React.FC = () => (
    <span className="inline-block w-2 h-5 bg-blue-700 animate-pulse ml-1" />
);

const FormattedMessage: React.FC<{ text: string }> = ({ text }) => {
    // A simple formatter for bold text and lists
    const parts = text.split(/(\*\*.*?\*\*|\n)/).filter(part => part);
    return (
        <>
            {parts.map((part, index) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={index}>{part.slice(2, -2)}</strong>;
                }
                if (part === '\n') {
                    return <br key={index} />;
                }
                return <span key={index}>{part}</span>;
            })}
        </>
    );
};

export const ChatPanel: React.FC<ChatPanelProps> = ({ history, isLoading, error, onSendMessage }) => {
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [history, isLoading]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputValue.trim() && !isLoading) {
            onSendMessage(inputValue);
            setInputValue('');
        }
    };

    return (
        <div className="mt-10 pt-6 border-t border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Chat with Results</h3>
            <div className="bg-white border border-gray-200 rounded-lg shadow-md p-4 flex flex-col h-[500px]">
                <div className="flex-grow overflow-y-auto pr-2 space-y-4">
                    {history.map((msg, index) => (
                        <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-prose px-4 py-2 rounded-xl ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}>
                                <p className="text-base whitespace-pre-wrap">
                                    <FormattedMessage text={msg.parts[0].text} />
                                    {isLoading && msg.role === 'model' && index === history.length - 1 && <ChatBlinkingCursor />}
                                </p>
                            </div>
                        </div>
                    ))}
                    {/* Invisible element to scroll to */}
                    <div ref={messagesEndRef} />
                </div>
                {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
                <div className="mt-4 pt-4 border-t border-gray-200">
                    <form onSubmit={handleSubmit} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Ask a follow-up question..."
                            className="w-full pl-4 pr-4 py-2 bg-gray-100 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200"
                            disabled={isLoading}
                            aria-label="Chat input"
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !inputValue.trim()}
                            className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
                            aria-label="Send message"
                        >
                            <SendIcon className="w-5 h-5" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

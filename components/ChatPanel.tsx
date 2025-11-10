
import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { SendIcon } from './icons/SendIcon';
import { GroundingSources } from './GroundingSources';
import { ToolCallDisplay } from './ToolCallDisplay';

interface ChatPanelProps {
    history: ChatMessage[];
    isLoading: boolean;
    error: string | null;
    onSendMessage: (message: string) => void;
}

const ChatBlinkingCursor: React.FC = () => (
    <span className="inline-block w-2 h-5 bg-primary animate-pulse ml-1" />
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
        <div className="h-full bg-card p-4 flex flex-col">
            <div className="flex-grow overflow-y-auto pr-2 space-y-4">
                {history.map((msg, index) => {
                    if (msg.role === 'tool') {
                        const toolCall = msg.parts[0]?.toolCall;
                        const toolResponse = msg.parts[0]?.toolResponse;
                        return (
                            <ToolCallDisplay
                                key={index}
                                toolName={toolCall?.name || 'unknown_tool'}
                                toolArgs={toolCall?.args || {}}
                                result={toolResponse?.result}
                                isExecuting={!toolResponse}
                            />
                        );
                    }

                    return (
                        <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-prose px-4 py-2 rounded-xl ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                                <div className="text-base whitespace-pre-wrap">
                                    {msg.parts[0]?.text && <FormattedMessage text={msg.parts[0].text} />}
                                    {isLoading && msg.role === 'model' && index === history.length - 1 && <ChatBlinkingCursor />}
                                </div>
                                {msg.sources && msg.sources.length > 0 && (
                                    <GroundingSources sources={msg.sources} />
                                )}
                            </div>
                        </div>
                    );
                })}
                {/* Invisible element to scroll to */}
                <div ref={messagesEndRef} />
            </div>
            {error && <div className="text-destructive text-sm mt-2 flex-shrink-0">{error}</div>}
            <div className="mt-4 pt-4 border-t border-border flex-shrink-0">
                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Ask a follow-up question..."
                        className="w-full h-10 pl-4 pr-4 bg-background border border-input rounded-md focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-shadow duration-200"
                        disabled={isLoading}
                        aria-label="Chat input"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !inputValue.trim()}
                        className="h-10 w-10 flex items-center justify-center p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 transition-colors duration-200"
                        aria-label="Send message"
                    >
                        <SendIcon className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
};

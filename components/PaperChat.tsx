
import React, { useState, useEffect, useRef } from 'react';
import type { ResearchPaper, ChatMessage } from '../types';
import { ChatPanel } from './ChatPanel';
import { GoogleGenAI, Chat } from "@google/genai";
import * as geminiService from '../services/geminiService';

interface PaperChatProps {
    paper: ResearchPaper;
}

export const PaperChat: React.FC<PaperChatProps> = ({ paper }) => {
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const chatSessionRef = useRef<Chat | null>(null);

    // Initialize chat session when paper changes
    useEffect(() => {
        try {
            // FIX: Added 'createPaperChatSession' implementation to geminiService.
            chatSessionRef.current = geminiService.createPaperChatSession(paper, 'gemini-3-flash-preview');
            setChatHistory([]); 
            setError(null);
            
            // Add initial welcome message
            setChatHistory([{
                role: 'model',
                parts: [{ text: `Hello! I've read "${paper.title}". Ask me anything about its methodology, findings, or implications.` }]
            }]);
        } catch (e) {
            setError("Failed to initialize chat session.");
        }
    }, [paper]);

    const handleSendMessage = async (message: string) => {
        if (!chatSessionRef.current) return;

        const userMsg: ChatMessage = { role: 'user', parts: [{ text: message }] };
        setChatHistory(prev => [...prev, userMsg]);
        setIsLoading(true);
        setError(null);

        try {
            const result = await chatSessionRef.current.sendMessage({ message });
            const modelMsg: ChatMessage = { role: 'model', parts: [{ text: result.text }] };
            setChatHistory(prev => [...prev, modelMsg]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send message.");
            // Remove user message on failure or show error state? 
            // Better to keep it but show error.
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-[500px] border rounded-lg overflow-hidden flex flex-col">
            <ChatPanel 
                history={chatHistory} 
                isLoading={isLoading} 
                error={error} 
                onSendMessage={handleSendMessage} 
            />
        </div>
    );
};

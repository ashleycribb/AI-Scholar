import React, { useState } from 'react';
import type { Project, ChatMessage } from '../types';
import { colorClassMap } from './ProjectConfig';
import { ChatPanel } from './ChatPanel';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

export const CollapsibleSection: React.FC<{
    title: string;
    icon: React.ReactNode;
    count: number;
    children: React.ReactNode;
    actions?: React.ReactNode;
    defaultExpanded?: boolean;
    color?: string;
    project?: Project;
    chatHistory?: ChatMessage[];
    isChatLoading?: boolean;
    onChat?: (message: string) => void;
}> = ({ title, icon, count, children, actions, defaultExpanded = true, color, project, chatHistory, isChatLoading, onChat }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const borderColorClass = color ? (colorClassMap[color]?.border || 'border-border') : 'border-border';

    const indexedCount = project?.paperIds.filter(id => project.paperStatuses?.[id] === 'indexed').length || 0;

    return (
        <div className={`bg-muted/50 border rounded-lg border-l-4 ${borderColorClass}`}>
            <header
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    {icon}
                    <h4 className="font-bold text-foreground">{title}</h4>
                    <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full">{count}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div onClick={e => e.stopPropagation()}>{actions}</div>
                    <ChevronDownIcon className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
            </header>
            {isExpanded && (
                <>
                    <div className="border-t border-border p-2 space-y-1">
                        {children}
                    </div>
                    {project && onChat && (
                        <div className="border-t border-border p-3">
                            <h4 className="text-sm font-semibold text-foreground mb-2">Chat with this Project</h4>
                            {indexedCount < 1 ? (
                                <p className="text-xs text-muted-foreground text-center p-4 bg-background rounded-md">Index at least one paper to start chatting with this project.</p>
                            ) : (
                                <div className="h-96">
                                    <ChatPanel history={chatHistory || []} isLoading={isChatLoading || false} error={null} onSendMessage={onChat} />
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

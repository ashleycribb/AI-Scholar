
import React from 'react';
import { FolderIcon } from './icons/FolderIcon';
import { AnalyzeIcon } from './icons/AnalyzeIcon';
import { NetworkIcon } from './icons/NetworkIcon';
import { CheckIcon } from './icons/CheckIcon';

const toolIcons: { [key: string]: React.ReactNode } = {
    'get_papers_in_project': <FolderIcon className="w-5 h-5 text-indigo-500" />,
    'get_paper_details': <AnalyzeIcon className="w-5 h-5 text-teal-500" />,
    'find_connected_papers': <NetworkIcon className="w-5 h-5 text-sky-500" />,
};

interface ToolCallDisplayProps {
    toolName: string;
    toolArgs: any;
    result?: any;
    isExecuting: boolean;
}

const formatResult = (result: any): string => {
    if (!result) return 'No result';
    if (result.error) return `Error: ${result.error}`;
    if (Array.isArray(result)) {
        if (result.length === 0) return 'Found 0 items.';
        if (result.length > 3) return `Found ${result.length} items.`;
        return JSON.stringify(result.slice(0, 3).map(r => r.title || r), null, 2);
    }
    if (typeof result === 'object') {
        const { id, title, ...rest } = result;
        if (title) return `Success: Retrieved details for "${title}".`;
        return JSON.stringify(result, null, 2);
    }
    return String(result);
};

export const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({ toolName, toolArgs, result, isExecuting }) => {
    const icon = toolIcons[toolName] || <CheckIcon className="w-5 h-5" />;
    
    return (
        <div className="my-2">
            <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    {isExecuting ? (
                        <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        icon
                    )}
                </div>
                <p>
                    Using tool: <span className="text-foreground font-bold">{toolName}</span>
                    {Object.keys(toolArgs).length > 0 && (
                        <span className="font-mono text-xs ml-2 bg-background p-1 rounded">
                            ({Object.entries(toolArgs).map(([k, v]) => `${k}="${v}"`).join(', ')})
                        </span>
                    )}
                </p>
            </div>
            {!isExecuting && (
                <div className="pl-11 mt-1">
                    <div className="border-l-2 border-border pl-4 py-2 text-xs text-muted-foreground bg-background/50 rounded-b-lg">
                        <span className="font-semibold">Result: </span>
                        <pre className="whitespace-pre-wrap break-all inline">{formatResult(result)}</pre>
                    </div>
                </div>
            )}
        </div>
    );
};

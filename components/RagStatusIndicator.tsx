import React from 'react';
import type { RagStatus } from '../types';
import { SparklesIcon } from './icons/SparklesIcon';
import { CheckIcon } from './icons/CheckIcon';

export const RagStatusIndicator = ({ status }: { status: RagStatus }) => {
    const statusMap = {
        unindexed: { text: 'Index for RAG', icon: <SparklesIcon className="w-3 h-3" />, color: 'text-primary', hover: 'hover:bg-primary/20' },
        indexing: { text: 'Indexing...', icon: <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>, color: 'text-muted-foreground', hover: '' },
        indexed: { text: 'Indexed', icon: <CheckIcon className="w-3 h-3" />, color: 'text-green-600', hover: '' },
        error: { text: 'Error', icon: null, color: 'text-destructive', hover: '' },
    };
    const current = statusMap[status];
    return {
        button: (onClick: () => void) => (
            <button
                onClick={onClick}
                disabled={status !== 'unindexed'}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded-md bg-primary/10 ${current.color} ${current.hover} disabled:opacity-70 disabled:cursor-not-allowed transition-colors`}
            >
                {current.icon}
                {current.text}
            </button>
        )
    };
};

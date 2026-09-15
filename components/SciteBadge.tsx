
import React from 'react';
import type { SciteTally } from '../types';
import { ThumbsUp, MessageSquare, ThumbsDown, BarChart2 } from 'lucide-react';

interface SciteBadgeProps {
    tally: SciteTally;
    size?: 'sm' | 'md';
}

export const SciteBadge: React.FC<SciteBadgeProps> = ({ tally, size = 'sm' }) => {
    const isSm = size === 'sm';
    
    return (
        <div className={`inline-flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-1.5 shadow-sm ${isSm ? 'text-[10px]' : 'text-xs'}`}>
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold" title="Supporting Citations">
                <ThumbsUp className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                <span>{tally.supporting}</span>
            </div>
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 font-bold" title="Mentioning Citations">
                <MessageSquare className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                <span>{tally.mentioning}</span>
            </div>
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold" title="Contrasting Citations">
                <ThumbsDown className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                <span>{tally.contrasting}</span>
            </div>
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-100" title="Total Smart Citations">
                <BarChart2 className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                <span>{tally.total}</span>
            </div>
        </div>
    );
};

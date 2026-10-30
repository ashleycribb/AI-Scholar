import React, { useState } from 'react';
import { 
    Cpu, 
    Loader2, 
    CheckCircle2, 
    Layers, 
    Sparkles, 
    Database, 
    Search, 
    ChevronDown, 
    ChevronUp, 
    X, 
    Activity, 
    BookOpen,
    ShieldCheck
} from 'lucide-react';

export type PipelineStageId = 
    | 'fast_index' 
    | 'federated_sources' 
    | 'semantic_scoring' 
    | 'scite_citations' 
    | 'literature_analysis';

export type StageStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StageState {
    id: PipelineStageId;
    label: string;
    sublabel: string;
    status: StageStatus;
    detail?: string;
    metric?: string;
}

export interface SystemExecutionState {
    isRunning: boolean;
    activeMessage: string;
    currentStageId?: PipelineStageId;
    initialPaperCount: number;
    totalPaperCount: number;
    sourcesCount: number;
    stages: Record<PipelineStageId, StageState>;
    startedAt?: number;
    completedAt?: number;
}

interface SystemExecutionIndicatorProps {
    executionState: SystemExecutionState;
    isInitialLoading?: boolean;
    query?: string;
    onDismiss?: () => void;
}

export const SystemExecutionIndicator: React.FC<SystemExecutionIndicatorProps> = ({
    executionState,
    isInitialLoading = false,
    query = '',
    onDismiss
}) => {
    const [isDismissed, setIsDismissed] = useState(false);

    if (isDismissed) return null;

    const { isRunning, activeMessage, totalPaperCount } = executionState;

    // When the pipeline is idle and not loading, render nothing to keep the interface calm and uncluttered
    if (!isRunning && !isInitialLoading) {
        return null;
    }

    return (
        <div className="flex items-center justify-between px-4 py-2.5 mb-5 bg-white border border-slate-200/90 rounded-xl text-xs text-slate-700 shadow-2xs">
            <div className="flex items-center gap-2.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-700 shrink-0" />
                <span className="font-medium text-slate-900">
                    {activeMessage || (query ? `Searching academic literature for "${query}"...` : 'Querying open scholarly databases...')}
                </span>
                {totalPaperCount > 0 && (
                    <span className="text-slate-400 font-normal">
                        · {totalPaperCount} works retrieved
                    </span>
                )}
            </div>
            <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                    OpenAlex · Crossref · Semantic Scholar
                </span>
                {onDismiss && (
                    <button
                        onClick={() => {
                            setIsDismissed(true);
                            onDismiss();
                        }}
                        className="text-slate-400 hover:text-slate-600 p-0.5"
                        title="Dismiss"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
};

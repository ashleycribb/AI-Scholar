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
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    if (isDismissed) return null;

    const { isRunning, activeMessage, stages, totalPaperCount, initialPaperCount } = executionState;

    // Count completed stages
    const stageList = Object.values(stages);
    const completedCount = stageList.filter(s => s.status === 'completed').length;
    const progressPercent = Math.round((completedCount / stageList.length) * 100);

    // Initial Loading State: System is launching and retrieving first papers (<1s)
    if (isInitialLoading && totalPaperCount === 0) {
        return (
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-xl border border-slate-700/50 mb-8 overflow-hidden relative">
                {/* Ambient glow accent */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
                
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-12 h-12 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                                <Cpu className="w-6 h-6 animate-pulse" />
                            </div>
                            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-900"></span>
                            </span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    System is Running
                                </span>
                                <span className="text-xs text-slate-400 font-mono">Stage 1: Fast Retrieval</span>
                            </div>
                            <h3 className="text-lg font-bold text-white mt-1">
                                {activeMessage || `Querying OpenAlex & global academic indices...`}
                            </h3>
                            <p className="text-xs text-slate-300 mt-0.5">
                                Initial papers will appear on screen immediately. Federated repositories and AI capabilities will attach as they complete.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-slate-300">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                            <span>Connecting 15+ Repositories</span>
                        </div>
                    </div>
                </div>

                {/* Animated progress track */}
                <div className="mt-5 pt-4 border-t border-slate-800/80">
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div 
                            className="bg-gradient-to-r from-indigo-500 via-emerald-400 to-teal-300 h-1.5 rounded-full transition-all duration-500 animate-pulse"
                            style={{ width: `${Math.max(progressPercent, 25)}%` }}
                        />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-[11px]">
                        {stageList.map(st => (
                            <div key={st.id} className="flex items-center gap-1.5 text-slate-300">
                                {st.status === 'completed' ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                ) : st.status === 'running' ? (
                                    <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
                                ) : (
                                    <div className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                                )}
                                <span className={`truncate ${st.status === 'running' ? 'text-white font-semibold' : 'text-slate-400'}`}>
                                    {st.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Active Banner: Papers are visible, background capabilities are completing
    return (
        <div className={`rounded-2xl transition-all duration-300 mb-6 border ${
            isRunning 
                ? 'bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 text-white border-indigo-500/30 shadow-md' 
                : 'bg-emerald-50/70 border-emerald-200 text-slate-900'
        }`}>
            <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                        {isRunning ? (
                            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
                                <Activity className="w-5 h-5 text-indigo-400 animate-pulse" />
                            </div>
                        ) : (
                            <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            </div>
                        )}
                        {isRunning && (
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                            </span>
                        )}
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                                isRunning 
                                    ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-400/30' 
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            }`}>
                                {isRunning ? 'System is Running' : 'System Ready'}
                            </span>
                            <span className={`text-xs font-semibold truncate ${isRunning ? 'text-slate-200' : 'text-slate-800'}`}>
                                {activeMessage}
                            </span>
                        </div>
                        <div className={`text-xs flex items-center gap-2 mt-0.5 ${isRunning ? 'text-slate-400' : 'text-slate-600'}`}>
                            <span>{totalPaperCount} articles indexed</span>
                            <span>•</span>
                            <span>{completedCount} of {stageList.length} capabilities loaded</span>
                            {initialPaperCount > 0 && isRunning && (
                                <>
                                    <span>•</span>
                                    <span className="text-emerald-400 font-medium">Initial papers displayed below</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                            isRunning 
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700' 
                                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                        title="Toggle capability details"
                    >
                        <span>{isExpanded ? 'Hide Details' : 'Capabilities'}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {!isRunning && (
                        <button
                            onClick={() => {
                                setIsDismissed(true);
                                onDismiss?.();
                            }}
                            className="p-1 rounded-lg hover:bg-slate-200/50 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Dismiss notification"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Expandable Details Drawer */}
            {isExpanded && (
                <div className={`px-4 pb-4 pt-2 border-t text-xs ${
                    isRunning ? 'border-slate-800 bg-slate-950/40' : 'border-emerald-100 bg-white/50'
                }`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mt-2">
                        {stageList.map(stage => {
                            const isStageDone = stage.status === 'completed';
                            const isStageActive = stage.status === 'running';

                            return (
                                <div 
                                    key={stage.id} 
                                    className={`p-2.5 rounded-xl border transition-all ${
                                        isRunning 
                                            ? isStageActive 
                                                ? 'bg-indigo-950/50 border-indigo-500/50 text-white' 
                                                : isStageDone 
                                                    ? 'bg-slate-900/80 border-slate-800 text-slate-200' 
                                                    : 'bg-slate-900/30 border-slate-800/40 text-slate-500'
                                            : isStageDone
                                                ? 'bg-white border-slate-200 text-slate-800 shadow-xs'
                                                : 'bg-slate-50 border-slate-200 text-slate-400'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="font-bold text-[11px] truncate">{stage.label}</div>
                                        {isStageDone ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                        ) : isStageActive ? (
                                            <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
                                        ) : (
                                            <div className="w-2 h-2 rounded-full bg-slate-400/40 shrink-0" />
                                        )}
                                    </div>
                                    <div className="text-[10px] opacity-80 leading-tight">
                                        {stage.detail || stage.sublabel}
                                    </div>
                                    {stage.metric && (
                                        <div className="mt-1 font-mono text-[9px] font-semibold text-emerald-400">
                                            {stage.metric}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

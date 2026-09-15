
import React from 'react';
import type { AnalysisResult, ResearchPaper } from '../types';
import { PublicationYearChart } from './PublicationYearChart';
import { TopAuthorsChart } from './TopAuthorsChart';
import { FormattedSummary } from './FormattedSummary';
import { SparklesIcon, ThumbsUp, MessageSquare, ThumbsDown, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';

interface SearchResultsAnalysisProps {
  analysis: AnalysisResult | null;
  summary: string;
  isSummaryLoading: boolean;
  isAnalysisLoading: boolean;
  papers: ResearchPaper[];
}

export const SearchResultsAnalysis: React.FC<SearchResultsAnalysisProps> = ({ analysis, summary, isSummaryLoading, isAnalysisLoading, papers }) => {
    const [isSummaryExpanded, setIsSummaryExpanded] = React.useState(true);
    const [isSciteExpanded, setIsSciteExpanded] = React.useState(false);
    const [isThematicExpanded, setIsThematicExpanded] = React.useState(false);
    const [isBibliometricExpanded, setIsBibliometricExpanded] = React.useState(false);

    const sciteAggregate = React.useMemo(() => {
        const tallies = papers.map(p => p.sciteTally).filter(Boolean);
        if (tallies.length === 0) return null;
        
        return tallies.reduce((acc, curr) => ({
            supporting: acc.supporting + (curr?.supporting || 0),
            mentioning: acc.mentioning + (curr?.mentioning || 0),
            contrasting: acc.contrasting + (curr?.contrasting || 0),
            total: acc.total + (curr?.total || 0)
        }), { supporting: 0, mentioning: 0, contrasting: 0, total: 0 });
    }, [papers]);

  return (
    <div className="space-y-6">
        {/* AI Summary Section */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all">
            <button 
                onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                className="flex items-center justify-between w-full text-left font-semibold focus:outline-none"
            >
                <div className="flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-900">Search Intelligence</h3>
                    {analysis?.domain && analysis.domain !== 'all' && (
                        <span className="ml-2 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest rounded-md border border-indigo-100 italic">
                            {analysis.domain.replace('_', ' ')}
                        </span>
                    )}
                </div>
                {isSummaryExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>
            
            {isSummaryExpanded && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                    {isSummaryLoading ? (
                        <div className="bg-slate-50 border border-slate-100 p-6 rounded-xl animate-pulse">
                             <div className="space-y-3">
                                 <div className="h-4 bg-slate-200/60 rounded w-full"></div>
                                 <div className="h-4 bg-slate-200/60 rounded w-5/6"></div>
                                 <div className="h-4 bg-slate-200/60 rounded w-4/6"></div>
                             </div>
                        </div>
                    ) : summary && (
                        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-slate-900"></div>
                            <div className="prose prose-slate prose-sm max-w-none">
                                <FormattedSummary text={summary} />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </section>
        
        {/* Scite Verification Section */}
        {sciteAggregate && (
            <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all">
                <button
                    onClick={() => setIsSciteExpanded(!isSciteExpanded)}
                    className="flex items-center justify-between w-full text-left font-semibold focus:outline-none"
                >
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-600" />
                        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-900">Scite Verification</h3>
                    </div>
                    {isSciteExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                
                {isSciteExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                            <p className="text-xs text-slate-400 mb-4 uppercase tracking-widest font-bold">Aggregate Smart Citations</p>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-emerald-400">
                                        <ThumbsUp className="w-4 h-4" />
                                        <span className="text-2xl font-extrabold tracking-tight font-bold leading-none">{sciteAggregate.supporting}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Supporting</p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-slate-300">
                                        <MessageSquare className="w-4 h-4" />
                                        <span className="text-2xl font-extrabold tracking-tight font-bold leading-none">{sciteAggregate.mentioning}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Mentioning</p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-rose-400">
                                        <ThumbsDown className="w-4 h-4" />
                                        <span className="text-2xl font-extrabold tracking-tight font-bold leading-none">{sciteAggregate.contrasting}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Contrasting</p>
                                </div>
                            </div>
                            <div className="mt-6 pt-6 border-t border-white/10 flex items-center justify-between">
                                <div className="text-[10px] text-slate-400">
                                    Verified via <span className="text-white font-bold">scite.ai</span> Smart Citations
                                </div>
                                <div className="text-xs font-bold text-slate-300">
                                    {((sciteAggregate.supporting / (sciteAggregate.supporting + sciteAggregate.contrasting || 1)) * 100).toFixed(1)}% Support Ratio
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        )}

        {/* Thematic Clusters Section */}
        {(isAnalysisLoading || (analysis && analysis.clusters?.length > 0)) && (
            <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all">
                <button
                    onClick={() => setIsThematicExpanded(!isThematicExpanded)}
                    className="flex items-center justify-between w-full text-left font-semibold focus:outline-none"
                >
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 flex items-center justify-center">
                            <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>
                        </div>
                        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-900">Thematic Landscape</h3>
                    </div>
                    {isThematicExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                
                {isThematicExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        {isAnalysisLoading ? (
                            <div className="grid grid-cols-1 gap-4">
                                {[1, 2].map(i => (
                                    <div key={i} className="bg-white border border-slate-200 p-5 rounded-2xl animate-pulse space-y-3">
                                        <div className="h-5 bg-slate-100 rounded w-1/3"></div>
                                        <div className="h-3 bg-slate-100 rounded w-full"></div>
                                        <div className="h-3 bg-slate-100 rounded w-5/6"></div>
                                        <div className="flex gap-2 mt-2">
                                            <div className="h-4 bg-slate-50 rounded w-16"></div>
                                            <div className="h-4 bg-slate-50 rounded w-20"></div>
                                        </div>
                                    </div>
                                ))}
                                <div className="text-center py-4">
                                    <p className="text-xs text-slate-400 animate-bounce">AI is clustering research themes...</p>
                                </div>
                            </div>
                        ) : analysis && (
                            <div className="grid grid-cols-1 gap-4">
                                {analysis.clusters.map(cluster => (
                                    <div key={cluster.clusterName} className="group bg-slate-50 border border-slate-100 p-5 rounded-2xl transition-all hover:border-slate-200 hover:bg-white hover:shadow-sm">
                                        <h4 className="font-extrabold tracking-tight font-bold text-lg text-slate-900 mb-1">{cluster.clusterName}</h4>
                                        <p className="text-sm text-slate-500 mb-4 leading-relaxed">{cluster.description}</p>
                                        
                                        {cluster.keywords && cluster.keywords.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {cluster.keywords.map(keyword => (
                                                    <span key={keyword} className="px-2.5 py-1 bg-white text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded-md border border-slate-100 group-hover:bg-slate-50 group-hover:border-slate-200 transition-colors">
                                                        {keyword}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </section>
        )}
        
        {/* Bibliometric Insights Section */}
        {(isAnalysisLoading || (analysis && ((analysis.publicationYears?.length > 0) || (analysis.topAuthors?.length > 0)))) && (
            <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all">
                <button
                    onClick={() => setIsBibliometricExpanded(!isBibliometricExpanded)}
                    className="flex items-center justify-between w-full text-left font-semibold focus:outline-none"
                >
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 flex items-center justify-center">
                            <div className="w-2 h-2 border-2 border-indigo-600 rounded-full"></div>
                        </div>
                        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-900">Bibliometric Data</h3>
                    </div>
                    {isBibliometricExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                
                {isBibliometricExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        {isAnalysisLoading ? (
                            <div className="bg-white border border-slate-200 p-6 rounded-2xl animate-pulse space-y-8">
                                <div className="h-32 bg-slate-50 rounded-xl"></div>
                                <div className="h-32 bg-slate-50 rounded-xl"></div>
                            </div>
                        ) : analysis && (
                            <div className="space-y-8 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-slate-900 font-bold">Publication Velocity</h4>
                                    <PublicationYearChart data={analysis.publicationYears} />
                                </div>
                                
                                <div className="pt-6 border-t border-slate-100 space-y-4">
                                    <h4 className="text-sm font-bold text-slate-900 font-bold">Prominent Contributors</h4>
                                    <TopAuthorsChart data={analysis.topAuthors} />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </section>
        )}
    </div>
  );
};

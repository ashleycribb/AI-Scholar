
import React, { useState, useEffect } from 'react';
import type { ResearchPaper, AnalysisResult, SynthesisResult, ChatMessage, LiteratureReviewDraft } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { SynthesisIcon } from './icons/SynthesisIcon';
import { ReportIcon } from './icons/ReportIcon';
import { AnalyzeIcon } from './icons/AnalyzeIcon';
import { ChatIcon } from './icons/ChatIcon';
import { ChatPanel } from './ChatPanel';
import { FormattedReport } from './FormattedReport';
import { SparklesIcon } from './icons/SparklesIcon';
import { ExportIcon } from './icons/ExportIcon';
import { DatabaseIcon } from './icons/DatabaseIcon';
import * as apiService from '../services/apiService';
import * as storageService from '../services/storageService';

interface WorkspaceAnalysisDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    workspacePapers: ResearchPaper[];
    analysisResult: AnalysisResult | null;
    synthesisResult: SynthesisResult | null;
    gapAnalysisReport: string | null;
    isAnalysisLoading: boolean;
    isSynthesisLoading: boolean;
    isGapAnalysisLoading: boolean;
    chatHistory: ChatMessage[];
    isChatLoading: boolean;
    onChat: (message: string) => void;
    onSynthesizeWorkspace: () => void;
    onAnalyzeGaps: () => void;
}

export const WorkspaceAnalysisDashboard: React.FC<WorkspaceAnalysisDashboardProps> = (props) => {
    const { isOpen, onClose, workspacePapers, analysisResult, synthesisResult, gapAnalysisReport, isAnalysisLoading, isSynthesisLoading, isGapAnalysisLoading, chatHistory, isChatLoading, onChat, onSynthesizeWorkspace, onAnalyzeGaps } = props;
    const [activeTab, setActiveTab] = useState<'reports' | 'drafting' | 'insights' | 'assistant'>('reports');
    const [draftTopic, setDraftTopic] = useState('');
    const [isDrafting, setIsDrafting] = useState(false);
    const [currentDraft, setCurrentDraft] = useState<LiteratureReviewDraft | null>(null);
    
    const [isFromCache, setIsFromCache] = useState(false);

    // Token-Saving Logic: When matrix is requested, check storage first
    useEffect(() => {
        if (isOpen && workspacePapers.length > 0 && activeTab === 'reports' && !synthesisResult && !isSynthesisLoading) {
            onSynthesizeWorkspace();
        }
    }, [isOpen, activeTab, workspacePapers, synthesisResult, isSynthesisLoading, onSynthesizeWorkspace]);

    useEffect(() => {
        if (isOpen && workspacePapers.length > 0 && activeTab === 'insights' && !gapAnalysisReport && !isGapAnalysisLoading) {
            onAnalyzeGaps();
        }
    }, [isOpen, activeTab, workspacePapers, gapAnalysisReport, isGapAnalysisLoading, onAnalyzeGaps]);

    const handleDraftReview = async () => {
        if (!draftTopic.trim()) return;
        setIsDrafting(true);
        try {
            const draft = await apiService.draftLiteratureReview(workspacePapers, draftTopic);
            setCurrentDraft(draft);
        } catch (error) {
            alert("Drafting failed.");
        } finally {
            setIsDrafting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-hidden flex" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative ml-auto w-full lg:w-[85%] xl:w-[90%] bg-card shadow-2xl flex flex-col h-full border-l animate-fade-in transition-all duration-500 ease-in-out">
                <header className="p-4 border-b flex justify-between items-center bg-card sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary text-primary-foreground p-2 rounded-lg">
                            <AnalyzeIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Workspace Analysis Hub</h2>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Active Corpus: {workspacePapers.length} Papers</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-100 text-[10px] font-black uppercase tracking-widest shadow-sm">
                            <DatabaseIcon className="w-3 h-3" />
                            Cloud Synced
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-accent rounded-full text-muted-foreground transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                </header>

                <nav className="flex border-b bg-muted/20 px-2">
                    {[
                        { id: 'reports', label: 'Synthesis Matrix', icon: <SynthesisIcon className="w-4 h-4"/> },
                        { id: 'drafting', label: 'Literature Review Drafter', icon: <SparklesIcon className="w-4 h-4"/> },
                        { id: 'insights', label: 'Thematic Gaps', icon: <ReportIcon className="w-4 h-4"/> },
                        { id: 'assistant', label: 'Project Assistant (RAG)', icon: <ChatIcon className="w-4 h-4"/> }
                    ].map(tab => (
                        <button 
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-8 py-4 text-sm font-bold border-b-2 transition-all ${activeTab === tab.id ? 'border-primary text-primary bg-background shadow-[0_-2px_0_inset_var(--primary)]' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </nav>

                <main className="flex-grow overflow-y-auto bg-background">
                    <div className="max-w-[1400px] mx-auto p-8 space-y-12 h-full">
                        {activeTab === 'reports' && (
                            <div className="space-y-10 animate-fade-in">
                                <section>
                                    <div className="flex justify-between items-end mb-6">
                                        <div>
                                            <h3 className="text-2xl font-black text-foreground flex items-center gap-3">
                                                <SynthesisIcon className="w-8 h-8 text-primary"/> 
                                                Comparative Matrix
                                            </h3>
                                            <p className="text-sm text-muted-foreground mt-1">Cross-referencing methodologies and core findings across your workspace.</p>
                                        </div>
                                        {isFromCache && (
                                            <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-100 animate-pulse">
                                                <SparklesIcon className="w-4 h-4" />
                                                Serving from Cloud Storage (Token-Saving Mode)
                                            </div>
                                        )}
                                    </div>
                                    {isSynthesisLoading ? <LoadingSpinner message="Synthesizing findings..." /> : (
                                        <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                                            <table className="min-w-full divide-y divide-border">
                                                <thead className="bg-muted/50">
                                                    <tr>
                                                        <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-muted-foreground w-1/4">Research Paper</th>
                                                        <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-muted-foreground w-1/4">Methodological Approach</th>
                                                        <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-muted-foreground">Primary Contribution / Finding</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y bg-white">
                                                    {synthesisResult?.map((r, i) => (
                                                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                                                            <td className="px-6 py-5 text-sm font-bold text-foreground leading-tight">{r.title}</td>
                                                            <td className="px-6 py-5 text-sm text-muted-foreground italic">{r.methodology}</td>
                                                            <td className="px-6 py-5 text-sm text-foreground leading-relaxed">{r.mainFinding}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}

                        {activeTab === 'drafting' && (
                            <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
                                <div className="bg-purple-600 rounded-2xl p-8 text-white shadow-xl">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-white/20 rounded-lg">
                                            <SparklesIcon className="w-6 h-6"/>
                                        </div>
                                        <h3 className="text-2xl font-black">Intelligent Review Drafter</h3>
                                    </div>
                                    <p className="text-purple-100 mb-8 max-w-2xl">Using your current workspace of {workspacePapers.length} papers, the AI will construct a thematic literature review draft. The engine optimizes context using TOON format to handle more sources.</p>
                                    
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <input 
                                            type="text" 
                                            value={draftTopic} 
                                            onChange={e => setDraftTopic(e.target.value)} 
                                            placeholder="Enter your research focus (e.g. 'Ethical considerations of RLHF in LLMs')..." 
                                            className="flex-grow h-12 px-5 rounded-xl border-none text-gray-900 shadow-inner focus:ring-4 focus:ring-purple-400 text-lg font-medium"
                                        />
                                        <button 
                                            onClick={handleDraftReview}
                                            disabled={isDrafting || !draftTopic.trim() || workspacePapers.length === 0}
                                            className="h-12 px-8 bg-white text-purple-700 font-black rounded-xl hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-95"
                                        >
                                            {isDrafting ? 'Generating...' : 'Draft Review'}
                                        </button>
                                    </div>
                                    {workspacePapers.length === 0 && (
                                        <p className="text-xs mt-3 text-purple-200">Please add papers to your workspace first.</p>
                                    )}
                                </div>

                                {currentDraft && (
                                    <div className="bg-card p-10 rounded-2xl border shadow-lg animate-fade-in space-y-10">
                                        <div className="flex justify-between items-start border-b border-border pb-6">
                                            <div>
                                                <h1 className="text-4xl font-black text-foreground leading-tight">{currentDraft.title}</h1>
                                                <p className="text-sm text-muted-foreground mt-2 font-medium uppercase tracking-widest">Workspace Synthesis Report • {new Date().toLocaleDateString()}</p>
                                            </div>
                                            <button className="flex items-center gap-2 px-5 h-10 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-all">
                                                <ExportIcon className="w-5 h-5"/> Export .md
                                            </button>
                                        </div>
                                        <div className="space-y-12">
                                            {currentDraft.sections.map((s, i) => (
                                                <section key={i} className="prose prose-slate max-w-none">
                                                    <h2 className="text-2xl font-bold text-foreground mb-4 border-l-8 border-primary pl-4">{s.heading}</h2>
                                                    <div className="text-lg text-muted-foreground leading-relaxed whitespace-pre-wrap">{s.content}</div>
                                                </section>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'insights' && (
                            <div className="max-w-4xl mx-auto animate-fade-in">
                                <h3 className="text-2xl font-black text-foreground mb-6 flex items-center gap-3">
                                    <ReportIcon className="w-8 h-8 text-primary"/> 
                                    Theoretical & Empirical Gaps
                                </h3>
                                {isGapAnalysisLoading ? <LoadingSpinner message="Identifying research voids..." /> : (
                                    <div className="bg-muted/20 p-8 rounded-2xl border border-dashed border-border">
                                        <div className="prose prose-lg max-w-none">
                                            <FormattedReport text={gapAnalysisReport || "Insufficient data for gap analysis. Add more papers to the workspace."}/>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'assistant' && (
                            <div className="h-full flex flex-col animate-fade-in">
                                <div className="mb-4">
                                    <h3 className="text-2xl font-black text-foreground flex items-center gap-3">
                                        <ChatIcon className="w-8 h-8 text-primary"/> 
                                        Workspace Assistant
                                    </h3>
                                    <p className="text-muted-foreground">Ask questions across your entire collection of {workspacePapers.length} papers.</p>
                                </div>
                                <div className="flex-grow border-4 border-muted rounded-3xl overflow-hidden shadow-2xl">
                                    <ChatPanel history={chatHistory} isLoading={isChatLoading} error={null} onSendMessage={onChat} />
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

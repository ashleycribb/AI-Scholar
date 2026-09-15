
import React, { useState, useEffect, useRef } from 'react';
import type { ModelDefinition, DeepResearchStep, DeepResearchReport, ResearchPaper, UserSettings } from '../types';
import * as deepResearchService from '../services/deepResearchService';
import { recordAgentStatement, recordUserStatement, generateSessionUuid } from '../services/lrsService';
import { AnalyzeIcon } from './icons/AnalyzeIcon';
import { LoadingSpinner } from './LoadingSpinner';
import { CheckIcon } from './icons/CheckIcon';
import { SearchIcon } from './icons/SearchIcon';
import { ScholarIcon } from './icons/ScholarIcon';
import { AddIcon } from './icons/AddIcon';
import { ExportIcon } from './icons/ExportIcon';
import { RobotIcon } from './icons/RobotIcon';
import { FormattedReport } from './FormattedReport';

interface DeepResearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTopic: string;
    model: ModelDefinition;
    onAddPapersToWorkspace: (papers: ResearchPaper[]) => void;
    userSettings: UserSettings;
}

export const DeepResearchModal: React.FC<DeepResearchModalProps> = ({ isOpen, onClose, initialTopic, model, onAddPapersToWorkspace, userSettings }) => {
    const [topic, setTopic] = useState(initialTopic);
    const [status, setStatus] = useState<'idle' | 'planning' | 'researching' | 'reflecting' | 'synthesizing' | 'completed'>('idle');
    const [steps, setSteps] = useState<DeepResearchStep[]>([]);
    const [report, setReport] = useState<DeepResearchReport | null>(null);
    const [progress, setProgress] = useState(0);
    const [isSaved, setIsSaved] = useState(false);
    const [currentReflection, setCurrentReflection] = useState<string>("");
    
    // Stop signal
    const abortRef = useRef<boolean>(false);

    useEffect(() => {
        if (isOpen) {
            setTopic(initialTopic);
            setStatus('idle');
            setSteps([]);
            setReport(null);
            setProgress(0);
            setIsSaved(false);
            abortRef.current = false;
            setCurrentReflection("");
        }
    }, [isOpen, initialTopic]);

    const startDeepResearch = async () => {
        if (!topic.trim()) return;
        
        const sessionUuid = generateSessionUuid('deep-research');
        setStatus('planning');
        setProgress(5);
        abortRef.current = false;

        // Record User Execution in Yet SQL LRS
        recordUserStatement(
            'Human Researcher',
            '/ontologies/agent_traceability.owl#executed',
            'Initiated Deep Research Synthesis',
            `urn:deep-research:${encodeURIComponent(topic)}`,
            `Deep Research Topic: ${topic}`,
            { sessionUuid, topic, model: model.name }
        );

        try {
            // 1. Initial Plan
            const initialStep = await deepResearchService.generateInitialPlan(topic, model);
            setSteps([initialStep]);
            setStatus('researching');
            setProgress(10);

            // Record Agent Planning in DuckDB Vertical LRS
            recordAgentStatement(
                'Deep Research Assistant',
                sessionUuid,
                'http://adlnet.gov/expapi/verbs/planned',
                'Synthesized Autonomous Research Plan',
                `urn:deep-research:plan:${sessionUuid}`,
                `Research Plan for "${topic}"`,
                { initialQuery: initialStep.query, rationale: initialStep.rationale, model: model.name }
            );

            const allPapers: ResearchPaper[] = [];
            const executedQueries: string[] = [];
            let stepCount = 0;
            const MAX_STEPS = 4; // Prevent infinite loops

            // 2. Reflexion Loop
            while (stepCount < MAX_STEPS && !abortRef.current) {
                const currentStepIndex = steps.length - 1;
                const currentStep = steps[currentStepIndex];
                
                // Execute Search
                setSteps(prev => prev.map((s, i) => i === currentStepIndex ? { ...s, status: 'searching' } : s));
                const newPapers = await deepResearchService.executeSearchStep(currentStep, userSettings);
                
                allPapers.push(...newPapers);
                executedQueries.push(currentStep.query);
                
                setSteps(prev => prev.map((s, i) => i === currentStepIndex ? { ...s, status: 'completed', papersFound: newPapers.length } : s));
                
                // Record Agent Search in DuckDB Vertical LRS
                recordAgentStatement(
                    'Deep Research Assistant',
                    sessionUuid,
                    '/ontologies/agent_traceability.owl#searched',
                    'Searched Open Academic Repositories',
                    `urn:search-query:${encodeURIComponent(currentStep.query)}`,
                    `Exploratory Query: "${currentStep.query}"`,
                    { papersFound: newPapers.length, stepIndex: stepCount, query: currentStep.query }
                );

                stepCount++;
                setProgress(Math.min(75, 10 + (stepCount / MAX_STEPS) * 65));

                // Reflect
                setStatus('reflecting');
                const reflection = await deepResearchService.reflectOnState(topic, allPapers, executedQueries);
                setCurrentReflection(reflection.reasoning);

                // Record Agent Epistemic Reflection in DuckDB Vertical LRS
                recordAgentStatement(
                    'Deep Research Assistant',
                    sessionUuid,
                    '/ontologies/agent_traceability.owl#classified',
                    'Classified Epistemic Sufficiency & Research Gaps',
                    `urn:deep-research:reflection:${sessionUuid}:${stepCount}`,
                    `Epistemic Assessment: Step ${stepCount}`,
                    { isSufficient: reflection.isSufficient, gap: reflection.missingInformation, reasoning: reflection.reasoning }
                );

                if (reflection.isSufficient || !reflection.nextQuery) {
                    console.log("Research sufficient, proceeding to synthesis.");
                    break; 
                } else {
                    // Add next step
                    const nextStep: DeepResearchStep = {
                        id: `step_${stepCount}`,
                        query: reflection.nextQuery,
                        status: 'pending',
                        papersFound: 0,
                        rationale: `Gap Identified: ${reflection.missingInformation}`
                    };
                    setSteps(prev => [...prev, nextStep]);
                    setStatus('researching');
                }
            }

            // 3. Synthesis
            setStatus('synthesizing');
            setProgress(80);
            
            const finalReport = await deepResearchService.synthesizeReport(topic, allPapers, model);
            setReport(finalReport);
            
            // Record Agent Report Synthesis in DuckDB Vertical LRS
            recordAgentStatement(
                'Deep Research Assistant',
                sessionUuid,
                'http://adlnet.gov/expapi/verbs/synthesized',
                'Synthesized Multi-Paper Literature Synthesis Report',
                `urn:deep-research:report:${sessionUuid}`,
                finalReport.title || `Deep Research Report: ${topic}`,
                { 
                    totalReferences: allPapers.length, 
                    sectionCount: finalReport.sections?.length,
                    topic 
                }
            );

            setStatus('completed');
            setProgress(100);

        } catch (error) {
            console.error("Deep Research Failed:", error);
            setStatus('idle');
        }
    };

    const handleSaveToWorkspace = () => {
        if (report?.references) {
            onAddPapersToWorkspace(report.references);
            setIsSaved(true);
            recordUserStatement(
                'Human Researcher',
                'http://activitystrea.ms/schema/1.0/save',
                'Saved Deep Research Dossier to Workspace',
                `urn:deep-research:references:${encodeURIComponent(topic)}`,
                `Deep Research References: ${topic}`,
                { count: report.references.length, topic }
            );
        }
    };

    const handleExportMarkdown = () => {
        if (!report) return;

        recordUserStatement(
            'Human Researcher',
            'http://id.tincanapi.com/verb/exported',
            'Exported Deep Research Markdown Report',
            `urn:export:deep-research:${encodeURIComponent(report.title)}`,
            `Report: ${report.title}`,
            { format: 'markdown', topic }
        );

        let md = `# ${report.title}\n\n`;
        md += `## Executive Summary\n\n${report.summary}\n\n`;
        
        report.sections.forEach(s => {
            md += `## ${s.heading}\n\n`;
            if (s.claims) {
                s.claims.forEach(claim => {
                    const citations = claim.citationIds.map(id => {
                        const idx = parseInt(id.replace('#', ''));
                        return `[${idx}]`;
                    }).join('');
                    md += `${claim.text} ${citations}\n`;
                });
                md += '\n';
            } else {
                md += `${s.content}\n\n`;
            }
        });

        md += `## References\n\n`;
        report.references.forEach((p, i) => {
            md += `[${i + 1}] ${p.authors} (${p.year}). **${p.title}**. ${p.journal || ''} [Link](${p.sourceURL})\n\n`;
        });

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.title.replace(/\s+/g, '_')}_Report.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-[95vw] h-[95vh] flex flex-col border border-border overflow-hidden animate-fade-in transition-all duration-300">
                <header className="p-6 border-b border-border bg-muted/30 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="bg-purple-600 text-white p-3 rounded-xl shadow-lg">
                            <RobotIcon className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-foreground tracking-tight">Deep Research Assistant</h2>
                            <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest opacity-70">Multi-Paper Synthesis, Claims Extraction & Report Generation</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-accent rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>

                <div className="flex flex-grow overflow-hidden">
                    <aside className="w-96 border-r border-border bg-muted/5 flex flex-col shrink-0">
                        <div className="p-6 border-b border-border">
                            {status === 'idle' ? (
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Define Research Objective</label>
                                        <textarea 
                                            value={topic}
                                            onChange={(e) => setTopic(e.target.value)}
                                            className="w-full p-4 rounded-xl border bg-background text-base min-h-[150px] focus:ring-4 focus:ring-primary/10 transition-all font-medium"
                                            placeholder="e.g., Comparative analysis of Transformer-based vs State-Space models..."
                                        />
                                    </div>
                                    <button 
                                        onClick={startDeepResearch}
                                        disabled={!topic.trim()}
                                        className="w-full py-4 bg-primary text-primary-foreground font-black text-lg rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all shadow-xl hover:-translate-y-1 active:translate-y-0"
                                    >
                                        Initiate Deep Research
                                    </button>
                                </div>
                            ) : (
                                <div className="py-2">
                                    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
                                        <span>Agentic Loop</span>
                                        <span className="text-primary">{Math.round(progress)}%</span>
                                    </div>
                                    <div className="w-full bg-muted rounded-full h-3 mb-6 overflow-hidden">
                                        <div className="bg-purple-600 h-full rounded-full transition-all duration-700 shadow-[0_0_15px_rgba(147,51,234,0.5)]" style={{ width: `${progress}%` }}></div>
                                    </div>
                                    <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl border border-purple-100">
                                        <div className="w-3 h-3 bg-purple-600 rounded-full animate-ping" />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-purple-900">
                                                {status === 'planning' && "Devising Strategy..."}
                                                {status === 'researching' && "Executing Retrieval Step..."}
                                                {status === 'reflecting' && "Critiquing Results & Gaps..."}
                                                {status === 'synthesizing' && "Verifying Claims & Synthesizing..."}
                                                {status === 'completed' && "Mission Complete"}
                                            </span>
                                            {status === 'reflecting' && (
                                                <span className="text-xs text-purple-700 mt-1 italic">Thinking...</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex-grow overflow-y-auto p-6 space-y-4">
                            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 px-1">Execution Log</h3>
                            {steps.map((step, idx) => (
                                <div key={step.id} className={`p-4 rounded-xl border-2 transition-all ${
                                    step.status === 'completed' ? 'bg-green-50/50 border-green-200' :
                                    step.status === 'searching' ? 'bg-blue-50 border-blue-400 ring-4 ring-blue-50' :
                                    'bg-card border-border'
                                }`}>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-mono font-bold text-muted-foreground/50">0{idx + 1}</span>
                                                <span className="font-bold text-foreground text-sm truncate max-w-[180px]">{step.query}</span>
                                            </div>
                                            {step.papersFound > 0 && (
                                                <span className="bg-white px-2 py-0.5 rounded-lg border-2 text-[10px] font-black text-primary">
                                                    {step.papersFound}
                                                </span>
                                            )}
                                        </div>
                                        {step.rationale && (
                                            <p className="text-xs text-muted-foreground italic border-l-2 border-primary/20 pl-2 mt-1">{step.rationale}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                            
                            {status === 'reflecting' && (
                                <div className="p-4 rounded-xl border-2 border-purple-200 bg-purple-50 animate-pulse">
                                    <p className="text-xs font-bold text-purple-800 uppercase tracking-widest mb-2">Agent Reflection</p>
                                    <p className="text-sm text-purple-900 italic">Analyzing gathered context to determine sufficiency...</p>
                                </div>
                            )}
                            
                            {currentReflection && status !== 'idle' && (
                                <div className="p-4 rounded-xl border border-muted bg-muted/20">
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Latest Critique</p>
                                    <p className="text-xs text-foreground">{currentReflection}</p>
                                </div>
                            )}
                        </div>
                    </aside>

                    <main className="flex-grow bg-background flex flex-col overflow-hidden">
                        {status === 'completed' && report ? (
                            <>
                                <div className="flex-grow overflow-y-auto p-12 lg:p-20">
                                    <div className="max-w-5xl mx-auto">
                                        <div className="space-y-4 mb-12">
                                            <span className="px-4 py-1.5 bg-green-100 text-green-700 rounded-full text-xs font-black uppercase tracking-widest border border-green-200">Verified Synthesis</span>
                                            <h1 className="text-5xl font-black text-foreground leading-[1.1]">{report.title}</h1>
                                        </div>
                                        
                                        <div className="p-10 bg-purple-50 rounded-3xl border-2 border-purple-100 mb-16 shadow-inner">
                                            <h3 className="text-xs font-black text-purple-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <SparklesIcon className="w-4 h-4" /> Executive Research Summary
                                            </h3>
                                            <p className="text-purple-900 leading-relaxed text-xl font-medium italic opacity-90">{report.summary}</p>
                                        </div>
                                        
                                        <div className="space-y-16">
                                            {report.sections.map((section, idx) => (
                                                <section key={idx} className="animate-fade-in group" style={{ animationDelay: `${idx * 200}ms` }}>
                                                    <div className="flex items-center gap-6 mb-8">
                                                        <span className="text-5xl font-black text-muted-foreground/10 group-hover:text-primary/20 transition-colors font-mono">0{idx + 1}</span>
                                                        <h2 className="text-3xl font-black text-foreground tracking-tight">{section.heading}</h2>
                                                    </div>
                                                    
                                                    {section.claims ? (
                                                        <div className="space-y-4">
                                                            {section.claims.map((claim, cIdx) => (
                                                                <div key={cIdx} className="flex gap-4 p-4 rounded-xl hover:bg-muted/30 transition-colors">
                                                                    <div className={`w-1.5 rounded-full shrink-0 ${
                                                                        claim.confidence > 0.8 ? 'bg-green-500' : 
                                                                        claim.confidence > 0.5 ? 'bg-yellow-500' : 'bg-red-400'
                                                                    }`} title={`Confidence: ${Math.round(claim.confidence * 100)}%`} />
                                                                    <div>
                                                                        <p className="text-lg text-foreground leading-relaxed">
                                                                            {claim.text}
                                                                            {claim.citationIds.map(id => {
                                                                                // Extract index from ID #1 -> 1
                                                                                const paperIdx = parseInt(id.replace('#', '')) - 1;
                                                                                // Only show if valid
                                                                                if(paperIdx >= 0 && paperIdx < report.references.length) {
                                                                                    return (
                                                                                        <sup key={id} className="ml-1 text-xs font-bold text-primary cursor-help" title={report.references[paperIdx].title}>
                                                                                            [{paperIdx + 1}]
                                                                                        </sup>
                                                                                    )
                                                                                }
                                                                                return null;
                                                                            })}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="text-foreground leading-relaxed text-lg prose prose-slate max-w-none">
                                                            <FormattedReport text={section.content} />
                                                        </div>
                                                    )}
                                                </section>
                                            ))}
                                        </div>

                                        <div className="mt-24 pt-16 border-t-2 border-border">
                                            <h2 className="text-3xl font-black text-foreground mb-10 flex items-center gap-4">
                                                <ScholarIcon className="w-8 h-8 text-primary" />
                                                Synthetic Bibliography
                                            </h2>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                                {report.references.map((p, i) => (
                                                    <div key={i} className="group relative pl-12">
                                                        <span className="absolute left-0 top-0 font-mono text-xl font-black text-muted-foreground/20">{(i+1).toString().padStart(2, '0')}</span>
                                                        <p className="text-lg font-bold text-foreground group-hover:text-primary transition-colors leading-tight">{p.title}</p>
                                                        <p className="text-sm text-muted-foreground mt-2">{p.authors} ({p.year})</p>
                                                        <a href={p.sourceURL} target="_blank" rel="noopener noreferrer" className="text-xs uppercase font-black text-primary tracking-widest mt-4 inline-flex items-center gap-1 hover:gap-3 transition-all">
                                                            Source <ExternalLinkIcon className="w-3 h-3" />
                                                        </a>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <footer className="p-6 border-t border-border bg-card flex justify-between items-center px-12 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-green-100 text-green-700 rounded-lg">
                                            <CheckIcon className="w-5 h-5" />
                                        </div>
                                        <span className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Verified Report • {report.references.length} Sources</span>
                                    </div>
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={handleExportMarkdown}
                                            className="px-6 h-12 rounded-xl font-black text-sm flex items-center gap-3 bg-secondary text-secondary-foreground hover:bg-accent border-2 border-border transition-all hover:scale-105 active:scale-95"
                                        >
                                            <ExportIcon className="w-5 h-5" /> EXPORT
                                        </button>
                                        <button 
                                            onClick={handleSaveToWorkspace}
                                            disabled={isSaved}
                                            className={`px-8 h-12 rounded-xl font-black text-sm flex items-center gap-3 transition-all shadow-xl hover:scale-105 active:scale-95 ${
                                                isSaved 
                                                ? 'bg-green-600 text-white cursor-default border-2 border-green-700' 
                                                : 'bg-primary text-primary-foreground hover:bg-primary/90'
                                            }`}
                                        >
                                            {isSaved ? <CheckIcon className="w-5 h-5" /> : <AddIcon className="w-5 h-5" />}
                                            {isSaved ? "SAVED" : "IMPORT SOURCES"}
                                        </button>
                                    </div>
                                </footer>
                            </>
                        ) : (
                            <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
                                {status === 'idle' ? (
                                    <div className="max-w-2xl">
                                        <div className="w-32 h-32 bg-primary/5 rounded-[2.5rem] flex items-center justify-center mb-10 mx-auto transform rotate-12 hover:rotate-0 transition-transform duration-500 shadow-inner">
                                            <RobotIcon className="w-16 h-16 text-primary" />
                                        </div>
                                        <h3 className="text-4xl font-black text-foreground mb-4 tracking-tight">Agentic Knowledge Extraction</h3>
                                        <p className="text-xl leading-relaxed text-muted-foreground font-medium">The Deep Research Agent autonomously navigates distributed academic indices, parallelizes source retrieval, and employs Pro-tier reasoning to synthesize a master report for your implementation needs.</p>
                                    </div>
                                ) : (
                                    <div className="max-w-md">
                                        <div className="relative">
                                            <LoadingSpinner />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-16 h-16 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
                                            </div>
                                        </div>
                                        <div className="mt-12 space-y-3">
                                            <p className="font-black text-foreground animate-pulse text-3xl tracking-tight">
                                                {status === 'synthesizing' ? 'Synthesizing Knowledge...' : 'Scanning Academic Graph...'}
                                            </p>
                                            <p className="text-lg text-muted-foreground font-medium italic opacity-70">
                                                {status === 'reflecting' ? "Critiquing findings..." : `Processing Step ${steps.filter(s=>s.status==='completed').length + 1}`}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
};

const ExternalLinkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5 4.5L18 6m0 0v6m0-6h-6" />
    </svg>
);

const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.5 21.75l-.398-1.178a3.375 3.375 0 00-2.456-2.456L12.5 17.25l1.178-.398a3.375 3.375 0 002.456-2.456L16.5 13.5l.398 1.178a3.375 3.375 0 002.456 2.456l1.178.398-1.178.398a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
);

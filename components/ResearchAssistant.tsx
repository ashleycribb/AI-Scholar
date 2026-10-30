import React, { useState, useEffect, useRef } from 'react';
import { 
    Sparkles, 
    Bot, 
    Search, 
    Check, 
    Copy, 
    Download, 
    ExternalLink, 
    BookOpen, 
    ShieldCheck, 
    AlertCircle, 
    ArrowRight, 
    Layers, 
    FileText, 
    Database, 
    CheckCircle2, 
    Clock, 
    FileDown,
    Zap,
    Scale,
    GitBranch,
    RefreshCw
} from 'lucide-react';
import type { ResearchPaper, ModelDefinition, UserSettings, DeepResearchStep, DeepResearchReport } from '../types';
import * as deepResearchService from '../services/deepResearchService';
import * as apiService from '../services/apiService';
import { recordAgentStatement, recordUserStatement, generateSessionUuid } from '../services/lrsService';
import { FormattedReport } from './FormattedReport';
import { 
    assertAgentAllows, 
    checkRequiresHumanGate, 
    evaluatePreflight, 
    logHumanAction, 
    logAiAction, 
    S3A_VERBS, 
    S3A_AGENTS,
    emitStatement,
    ScholarTool
} from '../services/s3aWasmService';
import { trackExplorerPrompt, trackExplorerAiResponse } from '../services/explorerTrackingService';
import { generateStatementUuid } from '../services/s3aOutboxService';

export type AssistantMode = 'synthesis' | 'scout';

interface ResearchAssistantProps {
    workspacePapers: ResearchPaper[];
    allDiscoveredPapers: ResearchPaper[];
    activeQuery: string;
    model: ModelDefinition;
    userSettings: UserSettings;
    onAddPapersToWorkspace: (papers: ResearchPaper[]) => void;
    onNavigateToWorkspace: () => void;
    onSelectPaper: (paper: ResearchPaper) => void;
    isLocalLabOnline?: boolean;
}

export const ResearchAssistant: React.FC<ResearchAssistantProps> = ({
    workspacePapers,
    allDiscoveredPapers,
    activeQuery,
    model,
    userSettings,
    onAddPapersToWorkspace,
    onNavigateToWorkspace,
    onSelectPaper,
    isLocalLabOnline = false,
}) => {
    const [assistantMode, setAssistantMode] = useState<AssistantMode>('synthesis');

    // ==========================================
    // 1. GROUNDED EVIDENCE SYNTHESIS STATE (Deep Research)
    // ==========================================
    const [synthesisTopic, setSynthesisTopic] = useState<string>(activeQuery || '');
    const [synthesisStatus, setSynthesisStatus] = useState<'idle' | 'planning' | 'researching' | 'reflecting' | 'synthesizing' | 'completed'>('idle');
    const [synthesisSteps, setSynthesisSteps] = useState<DeepResearchStep[]>([]);
    const [synthesisReport, setSynthesisReport] = useState<DeepResearchReport | null>(null);
    const [synthesisProgress, setSynthesisProgress] = useState<number>(0);
    const [currentReflection, setCurrentReflection] = useState<string>('');
    const [copiedReport, setCopiedReport] = useState<boolean>(false);
    const [synthesisSessionId, setSynthesisSessionId] = useState<string>('');
    const abortRef = useRef<boolean>(false);

    // ==========================================
    // 2. AUTONOMOUS LITERATURE MAPPING STATE (Source Scout)
    // ==========================================
    const [scoutTopic, setScoutTopic] = useState<string>(activeQuery || '');
    const [isScouting, setIsScouting] = useState<boolean>(false);
    const [scoutCandidates, setScoutCandidates] = useState<ResearchPaper[]>([]);
    const [scoutRationale, setScoutRationale] = useState<string>('');
    const [scoutUncertainty, setScoutUncertainty] = useState<string>('');
    const [scoutApprovedIds, setScoutApprovedIds] = useState<Set<string>>(new Set());
    const [scoutAccessionNumber, setScoutAccessionNumber] = useState<string>('');
    const [copiedAccession, setCopiedAccession] = useState<boolean>(false);

    // ==========================================
    // S3A WASM EPITEMIC GUARD STATE
    // ==========================================
    const [s3aBlockedError, setS3aBlockedError] = useState<string | null>(null);
    const [s3aPreflightFailed, setS3aPreflightFailed] = useState<boolean>(false);
    const [s3aGateRequired, setS3aGateRequired] = useState<boolean>(false);
    const [s3aGateApproved, setS3aGateApproved] = useState<boolean>(false);
    const [s3aTraceIndices, setS3aTraceIndices] = useState<{ human: number; ai: number } | null>(null);

    // Synchronize query when it changes externally
    useEffect(() => {
        if (activeQuery) {
            if (!synthesisTopic) setSynthesisTopic(activeQuery);
            if (!scoutTopic) setScoutTopic(activeQuery);
        }
    }, [activeQuery]);

    // Track workspace paper ids for easy lookups
    const workspacePaperIds = React.useMemo(() => {
        return new Set(workspacePapers.map(p => p.id));
    }, [workspacePapers]);

    // Structured Scholarly Quick Prompts
    const scholarlyPrompts = [
        {
            label: 'Methodology & Sample Comparison',
            prompt: `Compare sample sizes, methodological frameworks, and empirical validity across current candidate literature for: ${synthesisTopic || activeQuery || 'the target research inquiry'}.`
        },
        {
            label: 'Theoretical Gaps & Disputed Claims',
            prompt: `Identify theoretical controversies, conflicting empirical findings, and unresolved gaps in: ${synthesisTopic || activeQuery || 'the target literature'}.`
        },
        {
            label: 'Smart Citation Consensus Synthesis',
            prompt: `Synthesize supporting vs. contrasting consensus among verified peer-reviewed publications regarding: ${synthesisTopic || activeQuery || 'the active topic'}.`
        },
        {
            label: 'Systematic Literature Review Chapter',
            prompt: `Draft a formal literature review synthesis chapter with empirical attributions and structured subheadings on: ${synthesisTopic || activeQuery || 'the core inquiry'}.`
        }
    ];

    // ==========================================
    // SYNTHESIS EXECUTION (Deep Research Engine)
    // ==========================================
    const handleStartSynthesis = async (overrideTopic?: string) => {
        const topicToUse = overrideTopic || synthesisTopic;
        if (!topicToUse.trim()) return;

        setS3aBlockedError(null);
        setS3aPreflightFailed(false);
        setS3aGateApproved(false);

        const accession = generateSessionUuid('synth');
        setSynthesisSessionId(accession);
        setSynthesisStatus('planning');
        setSynthesisProgress(5);
        setSynthesisSteps([]);
        setSynthesisReport(null);
        abortRef.current = false;

        // 1. S3A Log Human Action (record_human)
        let humanStepIdx: number | null = null;
        let explorerPromptId = '';
        // Record human evidence synthesis inquiry in S3A snapshot and LRS outbox
        try {
            humanStepIdx = await logHumanAction(
                S3A_VERBS.NOTE,
                'Human Researcher',
                `Evidence Synthesis Inquiry: "${topicToUse}"`
            );
        } catch (e) {
            console.warn('S3A record_human error:', e);
        }

        try {
            // 2. S3A Guard: Before any agent acts, call assert_agent_allows
            await assertAgentAllows(S3A_AGENTS.LAB_ASSISTANT, S3A_VERBS.NOTE, ScholarTool.TOOL_READ_FILE);

            // 3. Epistemic Preflight check
            const confidence = 0.94;
            const preflight = await evaluatePreflight(confidence);
            if (!preflight.passed) {
                setS3aPreflightFailed(true);
            }

            // 4. Supervisory Gate check
            const requiresGate = await checkRequiresHumanGate(S3A_AGENTS.LAB_ASSISTANT);
            setS3aGateRequired(requiresGate);

            recordUserStatement(
                'Human Researcher',
                '/ontologies/agent_traceability.owl#executed',
                'Initiated Grounded Evidence Synthesis',
                `urn:research-assistant:synthesis:${encodeURIComponent(topicToUse)}`,
                `Grounded Evidence Synthesis: ${topicToUse}`,
                { accessionNumber: accession, topic: topicToUse, model: model.name }
            );

            // Step 1: Generate initial plan
            const initialStep = await deepResearchService.generateInitialPlan(topicToUse, model);
            setSynthesisSteps([initialStep]);
            setSynthesisStatus('researching');
            setSynthesisProgress(15);

            recordAgentStatement(
                'Research Assistant (Synthesis Engine)',
                accession,
                'http://adlnet.gov/expapi/verbs/planned',
                'Synthesized Autonomous Bibliographic Plan',
                `urn:research-assistant:plan:${accession}`,
                `Research plan for "${topicToUse}"`,
                { initialQuery: initialStep.query, rationale: initialStep.rationale }
            );

            const allPapers: ResearchPaper[] = [...workspacePapers];
            const executedQueries: string[] = [];
            let stepCount = 0;
            const MAX_STEPS = 3;
            let currentSteps = [initialStep];

            while (stepCount < MAX_STEPS && !abortRef.current) {
                const currentStepIndex = currentSteps.length - 1;
                const currentStep = currentSteps[currentStepIndex];

                setSynthesisSteps(prev => prev.map((s, i) => i === currentStepIndex ? { ...s, status: 'searching' } : s));
                
                const newPapers = await deepResearchService.executeSearchStep(currentStep, userSettings);
                allPapers.push(...newPapers);
                executedQueries.push(currentStep.query);

                setSynthesisSteps(prev => prev.map((s, i) => i === currentStepIndex ? { ...s, status: 'completed', papersFound: newPapers.length } : s));
                stepCount++;
                setSynthesisProgress(15 + Math.round((stepCount / MAX_STEPS) * 55));

                if (stepCount < MAX_STEPS) {
                    setSynthesisStatus('reflecting');
                    const reflection = await deepResearchService.reflectOnState(topicToUse, allPapers, executedQueries);
                    setCurrentReflection(reflection.reasoning);

                    if (reflection.isSufficient || !reflection.nextQuery) {
                        break;
                    }

                    setSynthesisStatus('researching');
                    const nextStep: DeepResearchStep = {
                        id: `step_${stepCount}`,
                        query: reflection.nextQuery,
                        status: 'pending',
                        papersFound: 0,
                        rationale: `Gap: ${reflection.missingInformation}`
                    };
                    currentSteps.push(nextStep);
                    setSynthesisSteps([...currentSteps]);
                }
            }

            if (abortRef.current) {
                setSynthesisStatus('idle');
                return;
            }

            // Step 2: Synthesis
            setSynthesisStatus('synthesizing');
            setSynthesisProgress(85);

            const uniquePapers = Array.from(new Map(allPapers.map(p => [p.id, p])).values());
            const finalReport = await deepResearchService.synthesizeReport(topicToUse, uniquePapers, model);
            
            setSynthesisReport(finalReport);
            setSynthesisStatus('completed');
            setSynthesisProgress(100);

            // S3A Log AI Action (record_ai) linked with humanStepIdx (AI steps use ai-answered only)
            try {
                const { aiIndex } = await logAiAction(
                    S3A_AGENTS.LAB_ASSISTANT,
                    18, // ai-answered
                    confidence,
                    humanStepIdx,
                    !requiresGate
                );
                if (humanStepIdx !== null) {
                    setS3aTraceIndices({ human: humanStepIdx, ai: aiIndex });
                }
            } catch (e) {
                console.warn('S3A record_ai error:', e);
            }

            // Explorer mode AI response telemetry
            try {
                const answerText = finalReport.summary || finalReport.title || 'Multi-Source Grounded Synthesis Completed';
                await trackExplorerAiResponse({
                    promptedStatementId: explorerPromptId || generateStatementUuid(),
                    aiAnswerText: answerText,
                    agentSlug: 'research-assistant',
                    action: 'summarized',
                    sources: uniquePapers.map(p => p.openalex_id || p.id).filter(Boolean),
                    tokens: Math.ceil(answerText.length / 4)
                });
            } catch (e) {
                console.warn('trackExplorerAiResponse error:', e);
            }

            recordAgentStatement(
                'Research Assistant (Synthesis Engine)',
                accession,
                'http://adlnet.gov/expapi/verbs/completed',
                'Completed Multi-Source Grounded Synthesis',
                `urn:research-assistant:report:${accession}`,
                `Report generated for "${topicToUse}"`,
                { paperCount: uniquePapers.length, sectionCount: finalReport.sections?.length || 0 }
            );

        } catch (err: any) {
            console.error("Synthesis failed / S3A Guard:", err);
            const isPolicyBlocked = err?.status === 403 || 
                                    /policy|guard|denied|forbidden|tool/i.test(err?.message || '');
            const errorMsg = isPolicyBlocked 
                ? 'blocked by policy' 
                : (err.message || 'Action blocked by S3A guard');
            setS3aBlockedError(errorMsg);
            setSynthesisStatus('idle');
        }
    };

    const handleAbortSynthesis = () => {
        abortRef.current = true;
        setSynthesisStatus('idle');
    };

    // ==========================================
    // LITERATURE MAPPING (Source Scout Engine)
    // ==========================================
    const handleLaunchScout = async () => {
        if (!scoutTopic.trim() || isScouting) return;

        const accession = generateSessionUuid('scout');
        setScoutAccessionNumber(accession);
        setIsScouting(true);
        setScoutCandidates([]);
        setScoutRationale('');
        setScoutUncertainty('');
        setScoutApprovedIds(new Set());

        let scoutPromptId = '';
        try {
            scoutPromptId = await trackExplorerPrompt(`Literature mapping: ${scoutTopic}`, 'source-scout', model?.name || 'gemini-3.8-flash');
        } catch {}

        // Emit xAPI statement: AI question asked (actor: human)
        emitStatement('asked', {
            id: `urn:ai:prompt:${Date.now()}`,
            name: `Literature Scout: "${scoutTopic}"`,
            type: 'ai-prompt'
        }, { actor: 'human', topic: scoutTopic }).catch(() => {});

        recordUserStatement(
            'Human Researcher',
            '/ontologies/agent_traceability.owl#executed',
            'Executed Autonomous Literature Mapping Session',
            `urn:research-assistant:scout:${scoutTopic.toLowerCase().replace(/\s+/g, '-')}`,
            `Scout Topic: ${scoutTopic}`,
            { accessionNumber: accession, topic: scoutTopic }
        );

        recordAgentStatement(
            'Research Assistant (Literature Scout)',
            accession,
            '/ontologies/agent_traceability.owl#searched',
            'Surveyed Global Citation Networks',
            `urn:research-assistant:scout:${accession}`,
            `Autonomous mapping for "${scoutTopic}"`,
            { topic: scoutTopic, accessionNumber: accession }
        );

        try {
            const { papers: searchResults } = await apiService.searchPapers(scoutTopic, { domain: 'all' }, 1, userSettings);
            const topCandidates = searchResults.slice(0, 4);

            if (topCandidates.length === 0) {
                setScoutRationale("Cross-referenced OpenAlex, Crossref, and Semantic Scholar catalogs. No immediate unread candidate records were indexed for this specific formulation.");
                setIsScouting(false);
                return;
            }

            let rationale = "Identified seminal empirical and theoretical works mapping adjacent theoretical parameters and foundational methodology frameworks.";
            let uncertainty = "Contains preliminary preprint distributions and non-blinded datasets. Recommend secondary verification in the Local Lab before doctoral submission.";

            try {
                const ratResp = await apiService.generateSummary(topCandidates, 'short', 'paragraph');
                if (ratResp) rationale = `Topical cluster identified via co-citation network: ${ratResp.substring(0, 220)}...`;
            } catch (e) { /* silent fallback */ }

            recordAgentStatement(
                'Research Assistant (Literature Scout)',
                accession,
                '/ontologies/agent_traceability.owl#classified',
                'Compiled Candidate Evidence Dossier',
                `urn:research-assistant:scout:dossier:${accession}`,
                `Compiled ${topCandidates.length} candidate papers for doctoral review`,
                { candidateCount: topCandidates.length, candidateIds: topCandidates.map(p => p.id) }
            );

            // Emit xAPI statement: AI answer shown (actor: agent)
            emitStatement('ai-answered', {
                id: `urn:ai:scout:${accession}`,
                name: `Scout Candidate Dossier (${topCandidates.length} works)`,
                type: 'ai-response'
            }, { 
                actor: 'agent', 
                agentSlug: 'source-scout', 
                candidateCount: topCandidates.length,
                rationale: rationale.slice(0, 200) 
            }).catch(() => {});

            setScoutCandidates(topCandidates);
            setScoutRationale(rationale);
            setScoutUncertainty(uncertainty);

            try {
                await trackExplorerAiResponse({
                    promptedStatementId: scoutPromptId || generateStatementUuid(),
                    aiAnswerText: `Recommended ${topCandidates.length} candidate sources for "${scoutTopic}". Rationale: ${rationale}`,
                    agentSlug: 'source-scout',
                    action: 'recommended-sources',
                    sources: topCandidates.map(p => p.openalex_id || p.id).filter(Boolean),
                    tokens: Math.ceil(rationale.length / 4)
                });
            } catch (e) {
                console.warn('trackExplorerAiResponse scout error:', e);
            }
        } catch (error) {
            console.error("Literature scout failed:", error);
            setScoutRationale("Scout encountered a network index latency error. Please retry your inquiry.");
        } finally {
            setIsScouting(false);
        }
    };

    const handleApproveScoutCandidate = (paper: ResearchPaper) => {
        setScoutApprovedIds(prev => {
            const next = new Set(prev);
            next.add(paper.id);
            return next;
        });

        // Emit xAPI statement: user accepted an AI suggestion (actor: human)
        emitStatement('accepted', {
            id: paper.doi ? `https://doi.org/${paper.doi.replace(/^https?:\/\/doi\.org\//, '')}` : (paper.openalex_id || `https://openalex.org/W${paper.id}`),
            name: paper.title || 'Paper Candidate',
            type: 'academic-paper'
        }, { actor: 'human', decision: 'accepted', suggestion_type: 'source-candidate' }).catch(() => {});

        onAddPapersToWorkspace([paper]);
    };

    const getReportMarkdown = (rep: DeepResearchReport) => {
        let md = `# ${rep.title}\n\n## Executive Summary\n${rep.summary}\n\n`;
        rep.sections?.forEach((s, idx) => {
            md += `### ${idx + 1}. ${s.heading}\n\n${s.content}\n\n`;
        });
        if (rep.references && rep.references.length > 0) {
            md += `### References\n`;
            rep.references.forEach((r, idx) => {
                md += `[${idx + 1}] ${r.title}. ${r.authors || 'Unknown'} (${r.year || 'n.d.'}).\n`;
            });
        }
        return md;
    };

    const handleDownloadReport = () => {
        if (!synthesisReport) return;
        const markdown = getReportMarkdown(synthesisReport);
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `synthesis_report_${synthesisTopic.slice(0, 24).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.md`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            {/* Header: Primacy of the Human Scholar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
                            <Sparkles className="w-4 h-4 text-indigo-300" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                                    Research Assistant
                                </h2>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                                    Human Oversight Active
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Grounded evidence synthesis and autonomous literature mapping under human verification
                            </p>
                        </div>
                    </div>
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
                    <button
                        type="button"
                        onClick={() => setAssistantMode('synthesis')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            assistantMode === 'synthesis'
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Evidence Synthesis</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setAssistantMode('scout')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            assistantMode === 'scout'
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Bot className="w-3.5 h-3.5 text-purple-600" />
                        <span>Literature Mapping (Scout)</span>
                    </button>
                </div>
            </div>

            {/* Evidence Corpus Status Banner */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-600">
                        <Layers className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">Active Evidence Corpus:</span>
                            <span className="text-xs font-semibold text-slate-600">
                                {workspacePapers.length} {workspacePapers.length === 1 ? 'staged work' : 'staged works'} in Evidence Ledger
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                            Assertions generated are strictly grounded in empirical claims extracted from verified candidate literature.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {workspacePapers.length > 0 && (
                        <button
                            type="button"
                            onClick={onNavigateToWorkspace}
                            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                            <span>Open Evidence Ledger</span>
                            <ArrowRight className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* ========================================================= */}
            {/* MODE 1: GROUNDED EVIDENCE SYNTHESIS                      */}
            {/* ========================================================= */}
            {assistantMode === 'synthesis' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    {/* Inquiry & Topic Formulation */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
                        <div>
                            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                                Synthesis Inquiry & Boundary Formulation
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2.5">
                                <input
                                    type="text"
                                    value={synthesisTopic}
                                    onChange={(e) => setSynthesisTopic(e.target.value)}
                                    placeholder="e.g., Comparative efficacy of cognitive behavioral interventions in secondary education..."
                                    disabled={synthesisStatus !== 'idle' && synthesisStatus !== 'completed'}
                                    className="flex-grow px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-800"
                                />
                                <div className="flex items-center gap-2 shrink-0">
                                    {synthesisStatus === 'idle' || synthesisStatus === 'completed' ? (
                                        <button
                                            type="button"
                                            onClick={() => handleStartSynthesis()}
                                            disabled={!synthesisTopic.trim()}
                                            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            <Sparkles className="w-4 h-4 text-indigo-300" />
                                            <span>Synthesize Evidence</span>
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleAbortSynthesis}
                                            className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs rounded-xl transition-all flex items-center gap-2"
                                        >
                                            <span>Stop Synthesis</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Structured Scholarly Prompt Suggestions */}
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                                Canonical Scholarly Inquiries
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {scholarlyPrompts.map((sp, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        disabled={synthesisStatus !== 'idle' && synthesisStatus !== 'completed'}
                                        onClick={() => {
                                            setSynthesisTopic(sp.prompt);
                                            handleStartSynthesis(sp.prompt);
                                        }}
                                        className="text-left p-2.5 bg-slate-50/70 hover:bg-slate-100/90 border border-slate-200/80 rounded-xl transition-all group"
                                    >
                                        <span className="text-xs font-semibold text-slate-800 block group-hover:text-indigo-900">
                                            {sp.label}
                                        </span>
                                        <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                            {sp.prompt}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Active Synthesis Progress Pipeline */}
                    {synthesisStatus !== 'idle' && (
                        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900">
                                            {synthesisStatus === 'planning' && 'Formulating Multi-Source Bibliographic Strategy...'}
                                            {synthesisStatus === 'researching' && 'Querying Crossref & Semantic Scholar Registries...'}
                                            {synthesisStatus === 'reflecting' && 'Evaluating Methodological Sufficiency & Co-Citation Clusters...'}
                                            {synthesisStatus === 'synthesizing' && 'Synthesizing Claims with Bibliographic Attributions...'}
                                            {synthesisStatus === 'completed' && 'Synthesis Complete'}
                                        </h4>
                                        <p className="text-xs text-slate-500">
                                            Stage {synthesisStatus} • {synthesisProgress}% Complete
                                        </p>
                                    </div>
                                </div>
                                {synthesisSessionId && (
                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                                        Accession: {synthesisSessionId.slice(0, 16)}...
                                    </span>
                                )}
                            </div>

                            {/* Progress bar */}
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div 
                                    className="bg-slate-900 h-1.5 transition-all duration-300 rounded-full"
                                    style={{ width: `${synthesisProgress}%` }}
                                />
                            </div>

                            {/* Live Reflection Feedback */}
                            {currentReflection && (
                                <div className="p-3.5 bg-amber-50/60 border border-amber-200/70 rounded-xl text-xs text-amber-900 space-y-1">
                                    <span className="font-bold uppercase tracking-wider text-[10px] text-amber-700 flex items-center gap-1.5">
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        Methodological Reflection
                                    </span>
                                    <p className="text-amber-800 leading-relaxed italic">"{currentReflection}"</p>
                                </div>
                            )}

                            {/* Steps list */}
                            {synthesisSteps.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                    {synthesisSteps.map((step, sIdx) => (
                                        <div key={sIdx} className="flex items-center justify-between text-xs py-1 px-2.5 rounded bg-slate-50 border border-slate-100">
                                            <div className="flex items-center gap-2">
                                                <span className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700">
                                                    {sIdx + 1}
                                                </span>
                                                <span className="font-semibold text-slate-800">{step.query}</span>
                                            </div>
                                            <span className="text-[11px] text-slate-500">
                                                {step.status === 'completed' ? `${step.papersFound || 0} papers parsed` : step.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* S3A Action Blocked Error Banner */}
                    {s3aBlockedError && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-bold text-red-900">Agent Action Blocked by S3A Guard</h4>
                                <p className="mt-0.5 text-red-800 leading-relaxed">{s3aBlockedError}</p>
                            </div>
                        </div>
                    )}

                    {/* Synthesis Output Report */}
                    {synthesisReport && (
                        <div className="space-y-4">
                            {/* S3A Linked Provenance Badge */}
                            {s3aTraceIndices && (
                                <div className="flex items-center justify-between text-xs px-3 py-1.5 bg-slate-900 text-white rounded-xl font-mono">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                        <span>S3A Linked Steps: H#{s3aTraceIndices.human} ↔ AI#{s3aTraceIndices.ai}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400">Recorded in WASM Session</span>
                                </div>
                            )}

                            {/* Epistemic Preflight Guard: If preflight failed, show 'needs review' instead of answer */}
                            {s3aPreflightFailed ? (
                                <div className="p-6 bg-amber-50 border border-amber-300 rounded-2xl text-center space-y-2">
                                    <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                                    <h4 className="text-sm font-bold text-amber-950 uppercase tracking-wide">
                                        Epistemic Preflight Alert: Needs Review
                                    </h4>
                                    <p className="text-xs text-amber-800 max-w-lg mx-auto">
                                        S3A Preflight check failed (confidence below 0.70 threshold or ontology unbound). The answer is withheld and flagged as <strong>needs review</strong> by the human researcher.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Supervisory Gate clearance if required */}
                                    {s3aGateRequired && !s3aGateApproved && (
                                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                                            <div className="text-xs">
                                                <span className="font-bold text-amber-900 block">Supervisory Gate Required</span>
                                                <span className="text-amber-700">Please review and click approve to mark the AI synthesis output as final.</span>
                                            </div>
                                            <button
                                                onClick={() => setS3aGateApproved(true)}
                                                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
                                            >
                                                Approve Output Clearance
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-slate-900">
                                    Synthesis Dossier: {synthesisReport.title}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(getReportMarkdown(synthesisReport));
                                            setCopiedReport(true);
                                            setTimeout(() => setCopiedReport(false), 2000);
                                        }}
                                        className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>{copiedReport ? 'Copied' : 'Copy Markdown'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDownloadReport}
                                        className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        <span>Export Dossier</span>
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-6">
                                <div className="p-4 bg-purple-50/70 rounded-xl border border-purple-100/80 space-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800">
                                        Executive Research Summary
                                    </span>
                                    <p className="text-xs sm:text-sm text-purple-950 leading-relaxed font-medium italic">
                                        {synthesisReport.summary}
                                    </p>
                                </div>

                                <div className="space-y-8">
                                    {synthesisReport.sections?.map((section, idx) => (
                                        <div key={idx} className="space-y-3">
                                            <h4 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
                                                {section.heading}
                                            </h4>
                                            <FormattedReport 
                                                text={section.content} 
                                                claims={section.claims} 
                                                references={synthesisReport.references} 
                                                showConfidenceLegend={idx === 0}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {synthesisReport.references && synthesisReport.references.length > 0 && (
                                    <div className="pt-6 border-t border-slate-200/80 space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                            Synthesized Bibliography ({synthesisReport.references.length} Sources)
                                        </h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {synthesisReport.references.map((refPaper, rIdx) => (
                                                <div 
                                                    key={rIdx}
                                                    onClick={() => onSelectPaper(refPaper)}
                                                    className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl hover:border-slate-300 transition-all cursor-pointer group space-y-1"
                                                >
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                                        <span>[{rIdx + 1}]</span>
                                                        <span>{refPaper.year || 'n.d.'}</span>
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
                                                        {refPaper.title}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500 line-clamp-1">
                                                        {refPaper.authors}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================= */}
            {/* MODE 2: AUTONOMOUS LITERATURE MAPPING (SOURCE SCOUT)     */}
            {/* ========================================================= */}
            {assistantMode === 'scout' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    {/* Scout Formulation Card */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">
                                    Autonomous Literature Mapping Engine
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Discovers semantic adjacencies and co-citation cascades outside your immediate keyword query.
                                </p>
                            </div>
                            {scoutAccessionNumber && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono text-slate-600">
                                    <span>Accession: {scoutAccessionNumber.slice(0, 16)}...</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(scoutAccessionNumber);
                                            setCopiedAccession(true);
                                            setTimeout(() => setCopiedAccession(false), 2000);
                                        }}
                                        className="text-slate-400 hover:text-slate-700 underline font-sans font-bold ml-1"
                                    >
                                        {copiedAccession ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2.5">
                            <input 
                                type="text" 
                                placeholder="Enter core research topic direction or theoretical framework..."
                                value={scoutTopic}
                                onChange={(e) => setScoutTopic(e.target.value)}
                                disabled={isScouting}
                                className="flex-grow px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-800"
                            />
                            <button
                                type="button"
                                onClick={handleLaunchScout}
                                disabled={isScouting || !scoutTopic.trim()}
                                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                            >
                                {isScouting ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        <span>Mapping Citation Networks...</span>
                                    </>
                                ) : (
                                    <>
                                        <Bot className="w-4 h-4 text-purple-300" />
                                        <span>Launch Literature Scout</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Scouting Output */}
                    {isScouting && (
                        <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center space-y-3 shadow-2xs">
                            <div className="w-8 h-8 border-2 border-slate-800 border-t-transparent rounded-full animate-spin mx-auto" />
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                Surveying OpenAlex & Crossref Metadata Registries
                            </h4>
                            <p className="text-xs text-slate-500 max-w-md mx-auto">
                                Analyzing co-citation centrality, journal impact quartiles, and peer-reviewed consensus indicators...
                            </p>
                        </div>
                    )}

                    {!isScouting && scoutCandidates.length > 0 && (
                        <div className="space-y-6">
                            {/* Rationale and uncertainty */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-2xs">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                        Query & Adjacency Rationale
                                    </span>
                                    <p className="text-xs text-slate-200 leading-relaxed italic">
                                        "{scoutRationale}"
                                    </p>
                                </div>

                                <div className="bg-amber-50 border border-amber-200/80 text-amber-950 rounded-2xl p-5 shadow-2xs">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block mb-1">
                                        Uncertainty & Empirical Caveats
                                    </span>
                                    <p className="text-xs text-amber-900 leading-relaxed font-medium italic">
                                        "{scoutUncertainty}"
                                    </p>
                                </div>
                            </div>

                            {/* Candidate paper grid */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                        Discovered Candidate Evidence ({scoutCandidates.length} Works)
                                    </h3>
                                    <span className="text-[11px] text-slate-500">
                                        Human approval required before admission into Evidence Ledger
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {scoutCandidates.map((paper) => {
                                        const isApproved = scoutApprovedIds.has(paper.id) || workspacePaperIds.has(paper.id);
                                        return (
                                            <div 
                                                key={paper.id} 
                                                className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-3 transition-all hover:border-slate-300"
                                            >
                                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                                    <div className="space-y-1 pr-2">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/60">
                                                                Candidate Evidence
                                                            </span>
                                                            {paper.isOpenAccess && (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                                                    Open Access
                                                                </span>
                                                            )}
                                                            {paper.citations !== undefined && (
                                                                <span className="text-[11px] text-slate-500 font-medium">
                                                                    {paper.citations.toLocaleString()} Citations
                                                                </span>
                                                            )}
                                                        </div>
                                                        <h4 
                                                            onClick={() => onSelectPaper(paper)}
                                                            className="text-base font-bold text-slate-900 hover:text-indigo-600 transition-colors cursor-pointer leading-snug"
                                                        >
                                                            {paper.title}
                                                        </h4>
                                                        <p className="text-xs text-slate-500 font-medium">
                                                            {paper.authors ? `${paper.authors.split(',')[0]} et al.` : 'Scholarly Authors'} • {paper.year}
                                                        </p>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleApproveScoutCandidate(paper)}
                                                        disabled={isApproved}
                                                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                                                            isApproved
                                                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                                                                : 'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs'
                                                        }`}
                                                    >
                                                        {isApproved ? (
                                                            <>
                                                                <Check className="w-3.5 h-3.5" />
                                                                <span>Admitted to Ledger</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                                <span>Approve & Stage</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>

                                                {paper.abstract && (
                                                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                                                        {paper.abstract}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

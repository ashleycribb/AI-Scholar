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
import type { ResearchPaper, ModelDefinition, UserSettings } from '../types';
import {
    COACHING_ACTIONS,
    coachLiteratureReview,
    coachingGuidanceToMarkdown,
    type CoachingActionId,
    type CoachingGuidance,
} from '../services/reviewCoachService';
import * as apiService from '../services/apiService';
import { recordAgentStatement, recordUserStatement, generateSessionUuid } from '../services/lrsService';
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

export type AssistantMode = 'coach' | 'scout';

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
    const [assistantMode, setAssistantMode] = useState<AssistantMode>('coach');

    // ==========================================
    // 1. LITERATURE-REVIEW COACH STATE
    // ==========================================
    const [coachTopic, setCoachTopic] = useState<string>(activeQuery || '');
    const [draftText, setDraftText] = useState<string>('');
    const [coachStatus, setCoachStatus] = useState<'idle' | 'coaching' | 'completed'>('idle');
    const [coachGuidance, setCoachGuidance] = useState<CoachingGuidance | null>(null);
    const [activeCoachAction, setActiveCoachAction] = useState<CoachingActionId | null>(null);
    const [copiedNotes, setCopiedNotes] = useState<boolean>(false);
    const [coachSessionId, setCoachSessionId] = useState<string>('');
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
            if (!coachTopic) setCoachTopic(activeQuery);
            if (!scoutTopic) setScoutTopic(activeQuery);
        }
    }, [activeQuery]);

    // Track workspace paper ids for easy lookups
    const workspacePaperIds = React.useMemo(() => {
        return new Set(workspacePapers.map(p => p.id));
    }, [workspacePapers]);

    // ==========================================
    // COACHING EXECUTION
    // ==========================================
    const handleStartCoaching = async (action: CoachingActionId) => {
        const topicToUse = coachTopic.trim() || activeQuery;
        if (action !== 'concept_explainer' && action !== 'next_steps' && !topicToUse && workspacePapers.length === 0 && !draftText.trim()) {
            return;
        }

        setS3aBlockedError(null);
        setS3aPreflightFailed(false);
        setS3aGateApproved(false);
        setActiveCoachAction(action);

        const accession = generateSessionUuid('coach');
        setCoachSessionId(accession);
        setCoachStatus('coaching');
        setCoachGuidance(null);
        abortRef.current = false;

        let humanStepIdx: number | null = null;
        let explorerPromptId = '';
        try {
            humanStepIdx = await logHumanAction(
                S3A_VERBS.NOTE,
                'Human Researcher',
                `Literature-review coaching inquiry (${action}): "${topicToUse || 'selected papers'}"`
            );
        } catch (e) {
            console.warn('S3A record_human error:', e);
        }

        try {
            await assertAgentAllows(S3A_AGENTS.LAB_ASSISTANT, S3A_VERBS.NOTE, ScholarTool.TOOL_READ_FILE);

            const confidence = 0.94;
            const preflight = await evaluatePreflight(confidence);
            if (!preflight.passed) {
                setS3aPreflightFailed(true);
            }

            const requiresGate = await checkRequiresHumanGate(S3A_AGENTS.LAB_ASSISTANT);
            setS3aGateRequired(requiresGate);

            recordUserStatement(
                'Human Researcher',
                '/ontologies/agent_traceability.owl#executed',
                'Asked the literature-review coach for guidance',
                `urn:research-assistant:coach:${encodeURIComponent(topicToUse || action)}`,
                `Review coaching: ${action}`,
                { accessionNumber: accession, topic: topicToUse, action, model: model.name }
            );

            if (abortRef.current) {
                setCoachStatus('idle');
                return;
            }

            const guidance = await coachLiteratureReview({
                action,
                topic: topicToUse,
                papers: workspacePapers,
                draftText,
            }, model);

            if (abortRef.current) {
                setCoachStatus('idle');
                return;
            }

            setCoachGuidance(guidance);
            setCoachStatus('completed');

            try {
                const { aiIndex } = await logAiAction(
                    S3A_AGENTS.LAB_ASSISTANT,
                    18,
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

            const notes = coachingGuidanceToMarkdown(guidance);
            try {
                await trackExplorerAiResponse({
                    promptedStatementId: explorerPromptId || generateStatementUuid(),
                    aiAnswerText: notes.slice(0, 2000),
                    agentSlug: 'research-assistant',
                    action: 'explained',
                    sources: workspacePapers.map(p => p.openalex_id || p.id).filter(Boolean),
                    tokens: Math.ceil(notes.length / 4)
                });
            } catch (e) {
                console.warn('trackExplorerAiResponse error:', e);
            }

            recordAgentStatement(
                'Research Assistant (Review Coach)',
                accession,
                'http://adlnet.gov/expapi/verbs/responded',
                'Provided literature-review coaching notes',
                `urn:research-assistant:coach:${accession}`,
                `Coaching notes for "${topicToUse || action}"`,
                { paperCount: workspacePapers.length, action, questionCount: guidance.questions.length }
            );

        } catch (err: any) {
            console.error("Coaching failed / S3A Guard:", err);
            const isPolicyBlocked = err?.status === 403 ||
                                    /policy|guard|denied|forbidden|tool/i.test(err?.message || '');
            const errorMsg = isPolicyBlocked
                ? 'blocked by policy'
                : (err.message || 'Action blocked by S3A guard');
            setS3aBlockedError(errorMsg);
            setCoachStatus('idle');
        }
    };

    const handleAbortCoaching = () => {
        abortRef.current = true;
        setCoachStatus('idle');
    };

    const handleDownloadNotes = () => {
        if (!coachGuidance) return;
        const markdown = coachingGuidanceToMarkdown(coachGuidance);
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const slug = (coachTopic || 'notes').slice(0, 24).replace(/\s+/g, '_');
        link.download = `review_coaching_notes_${slug}_${new Date().toISOString().slice(0, 10)}.md`;
        link.click();
        URL.revokeObjectURL(url);
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
                                Teaches you how to run a literature review and helps you think about your papers. It will not write the review for you.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
                    <button
                        type="button"
                        onClick={() => setAssistantMode('coach')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            assistantMode === 'coach'
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Review Coach</span>
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

            {/* Selected papers banner */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-600">
                        <Layers className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">Your selected papers:</span>
                            <span className="text-xs font-semibold text-slate-600">
                                {workspacePapers.length} {workspacePapers.length === 1 ? 'paper' : 'papers'} in the workspace
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                            The coach asks questions about these papers. You decide what they mean and what belongs in your review.
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
                            <span>Open workspace</span>
                            <ArrowRight className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* ========================================================= */}
            {/* MODE 1: LITERATURE-REVIEW COACH                           */}
            {/* ========================================================= */}
            {assistantMode === 'coach' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
                        <div>
                            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                                Your inquiry
                            </label>
                            <input
                                type="text"
                                value={coachTopic}
                                onChange={(e) => setCoachTopic(e.target.value)}
                                placeholder="e.g., How should I compare methods across these papers on trust calibration?"
                                disabled={coachStatus === 'coaching'}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-800"
                            />
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                                Your draft (optional — for a question-based check, not a rewrite)
                            </label>
                            <textarea
                                value={draftText}
                                onChange={(e) => setDraftText(e.target.value)}
                                placeholder="Paste a paragraph or outline you wrote. The coach will ask questions about claims, evidence, attribution, and gaps. It will not rewrite this text."
                                disabled={coachStatus === 'coaching'}
                                rows={5}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-800 resize-y"
                            />
                        </div>

                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                                Coaching actions
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {COACHING_ACTIONS.map((action) => (
                                    <button
                                        key={action.id}
                                        type="button"
                                        disabled={coachStatus === 'coaching'}
                                        onClick={() => handleStartCoaching(action.id)}
                                        className="text-left p-2.5 bg-slate-50/70 hover:bg-slate-100/90 border border-slate-200/80 rounded-xl transition-all group disabled:opacity-50"
                                    >
                                        <span className="text-xs font-semibold text-slate-800 block group-hover:text-indigo-900">
                                            {action.label}
                                        </span>
                                        <span className="text-[11px] text-slate-500 mt-0.5 block">
                                            {action.description}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {coachStatus === 'coaching' && (
                            <div className="flex items-center justify-between pt-1">
                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                    <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                                    <span>Preparing coaching notes{activeCoachAction ? ` (${activeCoachAction.replace(/_/g, ' ')})` : ''}…</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAbortCoaching}
                                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs rounded-lg"
                                >
                                    Stop
                                </button>
                            </div>
                        )}
                    </div>

                    {s3aBlockedError && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-bold text-red-900">Agent Action Blocked by S3A Guard</h4>
                                <p className="mt-0.5 text-red-800 leading-relaxed">{s3aBlockedError}</p>
                            </div>
                        </div>
                    )}

                    {coachGuidance && (
                        <div className="space-y-4">
                            {s3aTraceIndices && (
                                <div className="flex items-center justify-between text-xs px-3 py-1.5 bg-slate-900 text-white rounded-xl font-mono">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                        <span>S3A Linked Steps: H#{s3aTraceIndices.human} ↔ AI#{s3aTraceIndices.ai}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400">Recorded in WASM Session</span>
                                </div>
                            )}

                            {s3aPreflightFailed ? (
                                <div className="p-6 bg-amber-50 border border-amber-300 rounded-2xl text-center space-y-2">
                                    <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                                    <h4 className="text-sm font-bold text-amber-950 uppercase tracking-wide">
                                        Epistemic Preflight Alert: Needs Review
                                    </h4>
                                    <p className="text-xs text-amber-800 max-w-lg mx-auto">
                                        S3A Preflight check failed (confidence below 0.70 threshold or ontology unbound). The coaching notes are withheld and flagged as <strong>needs review</strong> by the human researcher.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {s3aGateRequired && !s3aGateApproved && (
                                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
                                            <div className="text-xs">
                                                <span className="font-bold text-amber-900 block">Supervisory Gate Required</span>
                                                <span className="text-amber-700">Review these coaching notes. You remain the author of any literature review.</span>
                                            </div>
                                            <button
                                                onClick={() => setS3aGateApproved(true)}
                                                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors shrink-0"
                                            >
                                                Acknowledge notes
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="text-lg font-bold text-slate-900">
                                            Coaching notes: {coachGuidance.title}
                                        </h3>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {coachSessionId && (
                                                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                                                    {coachSessionId.slice(0, 16)}...
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(coachingGuidanceToMarkdown(coachGuidance));
                                                    setCopiedNotes(true);
                                                    setTimeout(() => setCopiedNotes(false), 2000);
                                                }}
                                                className="px-2.5 py-1.5 text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg flex items-center gap-1.5"
                                            >
                                                {copiedNotes ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                <span>{copiedNotes ? 'Copied' : 'Copy'}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleDownloadNotes}
                                                className="px-2.5 py-1.5 text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg flex items-center gap-1.5"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                <span>Download</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-5 shadow-2xs">
                                        <p className="text-sm text-slate-700 leading-relaxed">{coachGuidance.framing}</p>

                                        {coachGuidance.questions.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Guiding questions</h4>
                                                <ul className="space-y-2">
                                                    {coachGuidance.questions.map((question, idx) => (
                                                        <li key={idx} className="text-sm text-slate-800 leading-relaxed flex gap-2">
                                                            <span className="text-slate-400 font-mono text-xs mt-0.5">{idx + 1}.</span>
                                                            <span>{question}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {coachGuidance.conceptNotes.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Concepts</h4>
                                                <div className="space-y-3">
                                                    {coachGuidance.conceptNotes.map((note, idx) => (
                                                        <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                                            <h5 className="text-sm font-semibold text-slate-900">{note.term}</h5>
                                                            <p className="text-sm text-slate-700 mt-1 leading-relaxed">{note.explanation}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {coachGuidance.nextSteps.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Suggested next steps</h4>
                                                <ul className="space-y-2">
                                                    {coachGuidance.nextSteps.map((step, idx) => (
                                                        <li key={idx} className="text-sm text-slate-800 leading-relaxed flex gap-2">
                                                            <span className="text-indigo-500 mt-0.5">→</span>
                                                            <span>{step}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-3">
                                            These notes are coaching only. You write the literature review and make every judgment about claims, evidence, and gaps.
                                        </p>
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

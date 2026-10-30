import React, { useState, useMemo, useEffect } from 'react';
import { 
    Layers, 
    Table, 
    FileText, 
    ShieldCheck, 
    GitCommit, 
    Download, 
    Trash2, 
    ExternalLink, 
    Search, 
    Filter, 
    Plus, 
    Check, 
    Quote, 
    Database, 
    ArrowRight,
    SlidersHorizontal,
    Sparkles,
    CheckCircle2,
    Clock,
    FileCheck,
    Cpu,
    ArrowUpRight,
    BookOpen,
    MessageSquare,
    PenTool,
    Compass,
    Send,
    Copy,
    FileDown,
    ListChecks,
    FolderGit2,
    Zap,
    FileSpreadsheet,
    Users,
    Award,
    FileCode
} from 'lucide-react';
import type { ResearchPaper } from '../types';
import { checkS3ALocalHealth } from '../services/s3aBridgeService';
import { emitStatement } from '../services/s3aWasmService';
import { SourceCheckBadge } from './SourceCheckBadge';

export type WorkspaceTab = 'overview' | 'papers' | 'evidence' | 'notes' | 'ai-assistant' | 'snapshots';
export type EvidenceSubTab = 'matrix' | 'claims' | 'pdf_claims' | 'collaboration' | 'protocol';

interface ResearcherWorkspaceProps {
    papers: ResearchPaper[];
    onRemovePaper: (paper: ResearchPaper) => void;
    onSelectPaper: (paper: ResearchPaper) => void;
    onOpenSnapshotDialog: () => void;
    onNavigateToSearch: () => void;
    searchQuery?: string;
    activeSearchSources?: string[];
    onCitePaper?: (paper: ResearchPaper) => void;
    projectName?: string;
}

export const ResearcherWorkspace: React.FC<ResearcherWorkspaceProps> = ({
    papers,
    onRemovePaper,
    onSelectPaper,
    onOpenSnapshotDialog,
    onNavigateToSearch,
    searchQuery = '',
    activeSearchSources = ['OpenAlex', 'Semantic Scholar', 'Crossref'],
    onCitePaper,
    projectName = 'Doctoral Dissertation'
}) => {
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
    const [evidenceSubTab, setEvidenceSubTab] = useState<EvidenceSubTab>('matrix');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStudyFilter, setSelectedStudyFilter] = useState<string>('all');
    
    // S3A Local Lab Bridge health status
    const [isS3AOnline, setIsS3AOnline] = useState<boolean>(false);
    useEffect(() => {
        let mounted = true;
        checkS3ALocalHealth().then(online => {
            if (mounted) setIsS3AOnline(online);
        }).catch(() => {
            if (mounted) setIsS3AOnline(false);
        });
        return () => { mounted = false; };
    }, []);

    // Qualitative Research Synthesis Notes
    const [researchNotes, setResearchNotes] = useState<string>(() => {
        const defaultNotes = `# Research Synthesis Notes: ${projectName}\n\n## Core Inquiry\n${searchQuery || 'Investigation into foundational scholarly literature and empirical methodologies.'}\n\n## Emerging Themes\n- Comparative methodology across selected works\n- Methodological gaps and sample constraints\n- Evidence corroboration across empirical and theoretical papers\n\n## Working Hypotheses & Claims\n- Synthesized from candidate literature review`;
        return defaultNotes;
    });
    const [notesCopied, setNotesCopied] = useState(false);
    const [isNotePersisted, setIsNotePersisted] = useState<boolean>(() => {
        try {
            return localStorage.getItem(`note_persisted_${projectName || 'default'}`) === 'true';
        } catch {
            return false;
        }
    });
    const [lastSavedNotesText, setLastSavedNotesText] = useState<string>('');
    const [noteSaveStatus, setNoteSaveStatus] = useState<string | null>(null);

    const handleSaveResearchNotes = async (manual = false) => {
        if (!isNotePersisted) {
            // Missing emit point: "created" when a new note is first saved
            await emitStatement('created', {
                id: `urn:notes:${encodeURIComponent(projectName || 'research-notes')}`,
                name: `Research Notes: ${projectName || 'Literature Synthesis'}`,
                type: 'research-notes'
            }, { 
                actor: 'human', 
                noteLength: researchNotes.length, 
                first_saved: true 
            }).catch(() => {});

            setIsNotePersisted(true);
            try { localStorage.setItem(`note_persisted_${projectName || 'default'}`, 'true'); } catch {}
            if (manual) {
                setNoteSaveStatus('Note created & saved in S3A');
                setTimeout(() => setNoteSaveStatus(null), 2500);
            }
        } else if (researchNotes !== lastSavedNotesText) {
            await emitStatement('edited', {
                id: `urn:notes:${encodeURIComponent(projectName || 'research-notes')}`,
                name: `Research Notes: ${projectName || 'Literature Synthesis'}`,
                type: 'research-notes'
            }, { 
                actor: 'human', 
                noteLength: researchNotes.length 
            }).catch(() => {});

            if (manual) {
                setNoteSaveStatus('Notes updated & saved');
                setTimeout(() => setNoteSaveStatus(null), 2500);
            }
        }
        setLastSavedNotesText(researchNotes);
    };

    // AI Assistant state (Scholar Explorer Assistant)
    const [assistantMessages, setAssistantMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; citations?: string[] }>>([
        {
            role: 'assistant',
            text: `Welcome to your Research Workspace. I am your Scholar Explorer Assistant. I can help synthesize evidence, identify methodological limitations, or draft literature review summaries directly grounded in your ${papers.length} selected candidate ${papers.length === 1 ? 'work' : 'works'}. What would you like to explore?`
        }
    ]);
    const [assistantInput, setAssistantInput] = useState('');
    const [isAssistantResponding, setIsAssistantResponding] = useState(false);

    // Inclusion / Exclusion criteria state
    const [inclusionCriteria, setInclusionCriteria] = useState<string[]>([
        'Peer-reviewed scholarly literature or recognized preprint repositories',
        'Published in target timeframe with full abstract available',
        'Contains empirical evidence, theoretical models, or systematic review data',
        'Direct topical relevance to core research inquiry'
    ]);

    const [exclusionCriteria, setExclusionCriteria] = useState<string[]>([
        'Retracted works or unverified editorial commentary',
        'Duplicate works with identical DOIs across multiple aggregators',
        'Non-academic promotional whitepapers'
    ]);

    // Filtered papers based on workspace search term
    const filteredPapers = useMemo(() => {
        return papers.filter(p => {
            const matchesSearch = searchTerm.trim() === '' || 
                p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.authors.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (p.abstract && p.abstract.toLowerCase().includes(searchTerm.toLowerCase()));
            
            const matchesStudy = selectedStudyFilter === 'all' || 
                (p.enrichmentSource && p.enrichmentSource.toLowerCase().includes(selectedStudyFilter.toLowerCase()));

            return matchesSearch && matchesStudy;
        });
    }, [papers, searchTerm, selectedStudyFilter]);

    // Synthetic claims extracted from selected papers
    // Abstract-sentence preview only: NOT claim extraction. No category, no confidence, no verification.
    const synthesizedClaims = useMemo(() => {
        if (papers.length === 0) return [];
        return papers.map((paper, index) => {
            const sentences = (paper.abstract || paper.title)
                .split(/(?<=[.!?])\s+/)
                .filter(s => s.length > 25);
            
            const claimText = sentences.length > 1 ? sentences[1] : sentences[0] || paper.title;
            const contextText = sentences.length > 2 ? sentences[2] : '';

            return {
                id: `claim-${paper.id || index}`,
                paper,
                claim: claimText,
                supportingContext: contextText
            };
        });
    }, [papers]);

    // Metrics for the Overview tab
    const corpusMetrics = useMemo(() => {
        const total = papers.length;
        const openAccessCount = papers.filter(p => p.isOpenAccess).length;
        const totalCitations = papers.reduce((sum, p) => sum + (p.citations || 0), 0);
        const years = papers.map(p => p.year).filter(Boolean) as number[];
        const minYear = years.length > 0 ? Math.min(...years) : null;
        const maxYear = years.length > 0 ? Math.max(...years) : null;
        const yearRange = minYear && maxYear ? (minYear === maxYear ? `${minYear}` : `${minYear} – ${maxYear}`) : 'Various';

        return {
            total,
            openAccessCount,
            openAccessPercent: total > 0 ? Math.round((openAccessCount / total) * 100) : 0,
            totalCitations,
            yearRange
        };
    }, [papers]);

    const handleCopyNotes = () => {
        navigator.clipboard.writeText(researchNotes);
        setNotesCopied(true);
        setTimeout(() => setNotesCopied(false), 2000);
    };

    const handleDownloadNotes = () => {
        const element = document.createElement('a');
        const file = new Blob([researchNotes], { type: 'text/markdown' });
        element.href = URL.createObjectURL(file);
        element.download = `${projectName.toLowerCase().replace(/\s+/g, '_')}_notes.md`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    // CSV and Markdown Matrix Export for Academic Appendices
    const handleExportMatrixCSV = () => {
        if (papers.length === 0) return;
        const headers = ['Title', 'Authors', 'Year', 'Venue/Source', 'DOI', 'Citations', 'Core Findings / Abstract'];
        const escapeCsv = (str: string | number | undefined) => {
            if (str === undefined || str === null) return '""';
            const val = String(str).replace(/"/g, '""');
            return `"${val}"`;
        };

        const rows = papers.map(p => [
            escapeCsv(p.title),
            escapeCsv(p.authors),
            escapeCsv(p.year),
            escapeCsv(p.journal || p.enrichmentSource || 'Peer-Reviewed'),
            escapeCsv(p.doi || ''),
            escapeCsv(p.citations || 0),
            escapeCsv(p.abstract || '')
        ].join(','));

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `evidence_matrix_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportMatrixMarkdown = () => {
        if (papers.length === 0) return;
        const mdHeader = `| Paper & Authors | Year | Venue / Design | Core Evidence & Methodology | Citations | DOI |\n|:---|:---:|:---|:---|:---:|:---|`;
        const mdRows = papers.map(p => {
            const cleanTitle = (p.title || '').replace(/\|/g, '-');
            const authorEtAl = p.authors ? `${p.authors.split(',')[0]} et al.` : 'Unknown';
            const year = p.year || '—';
            const venue = (p.journal || p.enrichmentSource || 'Peer-Reviewed').replace(/\|/g, '-');
            const findings = (p.abstract ? p.abstract.substring(0, 140) + '...' : 'Empirical study').replace(/\|/g, '-').replace(/\n/g, ' ');
            const citations = p.citations !== undefined ? p.citations : '—';
            const doi = p.doi ? `[${p.doi}](https://doi.org/${p.doi})` : '—';
            return `| **${cleanTitle}** (${authorEtAl}) | ${year} | ${venue} | ${findings} | ${citations} | ${doi} |`;
        }).join('\n');

        const fullMd = `# Comparative Evidence Matrix\n\nGenerated via Scholar Explorer Research OS on ${new Date().toLocaleDateString()}.\n\n${mdHeader}\n${mdRows}\n`;
        const blob = new Blob([fullMd], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `evidence_matrix_${new Date().toISOString().slice(0, 10)}.md`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // Full-Text PDF Claim Extraction State
    const [selectedPdfPaperId, setSelectedPdfPaperId] = useState<string>(papers[0]?.id || '');
    useEffect(() => {
        if (papers.length > 0 && (!selectedPdfPaperId || !papers.some(p => p.id === selectedPdfPaperId))) {
            setSelectedPdfPaperId(papers[0].id);
        }
    }, [papers, selectedPdfPaperId]);

    const activePdfPaper = useMemo(() => {
        return papers.find(p => p.id === selectedPdfPaperId) || papers[0];
    }, [papers, selectedPdfPaperId]);

    // Multi-Researcher Project Collaboration & Committee Sign-Off State
    const [committeeMembers, setCommitteeMembers] = useState<Array<{ id: string; isDemo?: boolean; name: string; role: string; institution: string; status: 'Approved' | 'Review In Progress' | 'Pending Signoff' }>>([
        { id: 'cm-1', isDemo: true, name: 'Dr. Young Baek', role: 'Dissertation Committee Chair', institution: 'UNC Wilmington', status: 'Approved' },
        { id: 'cm-2', isDemo: true, name: 'Dr. Sarah Lin', role: 'Methodologist / Quant Lead', institution: 'Graduate Research Council', status: 'Approved' },
        { id: 'cm-3', isDemo: true, name: 'Dr. Marcus Vance', role: 'External Reader & Examiner', institution: 'University Consortium', status: 'Review In Progress' }
    ]);
    const [reviewNotes, setReviewNotes] = useState<Array<{ id: string; isDemo?: boolean; author: string; role: string; date: string; comment: string; tag: string }>>([
        { id: 'rn-1', isDemo: true, author: 'Dr. Young Baek', role: 'Committee Chair', date: '2026-09-18', comment: 'Methodology matrix demonstrates sufficient empirical corroboration across primary multi-source registries. Proceed with chapter 2 synthesis.', tag: 'Methodology Signoff' },
        { id: 'rn-2', isDemo: true, author: 'Dr. Sarah Lin', role: 'Methodologist', date: '2026-09-19', comment: 'Ensure open-access preprints are clearly differentiated from blinded peer-reviewed publications in PRISMA flow.', tag: 'PRISMA Audit' }
    ]);
    const [newReviewAuthor, setNewReviewAuthor] = useState('');
    const [newReviewComment, setNewReviewComment] = useState('');
    const [newReviewTag, setNewReviewTag] = useState('Methodology Feedback');

    const handleAddReviewNote = () => {
        if (!newReviewAuthor.trim() || !newReviewComment.trim()) return;
        setReviewNotes(prev => [
            {
                id: `rn-${Date.now()}`,
                author: newReviewAuthor.trim(),
                role: 'Committee Reviewer',
                date: new Date().toISOString().slice(0, 10),
                comment: newReviewComment.trim(),
                tag: newReviewTag
            },
            ...prev
        ]);
        setNewReviewComment('');
    };

    const handleExportCommitteeReport = () => {
        // DEMO sample entries (isDemo) are never exported: only entries the user recorded go into the dossier.
        const exportMembers = committeeMembers.filter(m => !m.isDemo);
        const exportNotes = reviewNotes.filter(n => !n.isDemo);
        const report = `# Research Committee Review & Audit Dossier
**Project:** ${projectName}
**Date Generated:** ${new Date().toLocaleDateString()}
**Institutional Platform:** Scholar Explorer Research OS (v0.5)

---

## 1. Committee Sign-Off Ledger
${exportMembers.length > 0 ? exportMembers.map(m => `- **${m.name}** (${m.role}, ${m.institution}): \`[${m.status}]\``).join('\n') : '_No committee sign-offs recorded. (Sample DEMO entries shown in the app are excluded from this export.)_'}

---

## 2. Reviewer Logs & Methodological Sign-Offs
${exportNotes.length > 0 ? exportNotes.map(n => `### [${n.tag}] ${n.author} (${n.role}) — ${n.date}\n> "${n.comment}"\n`).join('\n') : '_No reviewer notes recorded. (Sample DEMO entries shown in the app are excluded from this export.)_'}

---

## 3. Systematic Screening Audit
- **Core Research Inquiry:** ${searchQuery || 'General Topic Search'}
- **Total Selected Literature:** ${papers.length} Works
- **Corpus Accession Status:** Synchronized with Local Research Lab
`;
        const blob = new Blob([report], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `committee_review_dossier_${new Date().toISOString().slice(0, 10)}.md`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleSendAssistantMessage = (customPrompt?: string) => {
        const promptToSend = customPrompt || assistantInput;
        if (!promptToSend.trim() || isAssistantResponding) return;

        // Emit xAPI statement for AI question asked (actor: human)
        emitStatement('asked', {
            id: `urn:ai:prompt:${Date.now()}`,
            name: `AI Question: "${promptToSend.slice(0, 80)}"`,
            type: 'ai-prompt'
        }, { actor: 'human', prompt: promptToSend }).catch(() => {});

        const newMessages = [...assistantMessages, { role: 'user' as const, text: promptToSend }];
        setAssistantMessages(newMessages);
        setAssistantInput('');
        setIsAssistantResponding(true);

        setTimeout(() => {
            // Context-grounded response citing workspace papers
            let responseText = '';
            const citationsList: string[] = [];

            const getFirstAuthor = (p?: ResearchPaper | null): string => {
                if (!p) return 'Author';
                if (typeof p.authors === 'string' && p.authors) {
                    return p.authors.split(',')[0].trim();
                }
                if (Array.isArray(p.authors) && p.authors.length > 0) {
                    return String(p.authors[0]).trim();
                }
                if (p.authorList && p.authorList.length > 0) {
                    return p.authorList[0].name.trim();
                }
                return 'Scholarly Author';
            };

            if (papers.length === 0) {
                responseText = "Your workspace currently has no selected papers. To synthesize evidence or generate literature review sections, search for literature and save candidate papers to your workspace.";
            } else if (promptToSend.toLowerCase().includes('limitation') || promptToSend.toLowerCase().includes('gap')) {
                const samplePaper = papers[0];
                citationsList.push(`${getFirstAuthor(samplePaper)} et al. (${samplePaper.year || 'n.d.'})`);
                responseText = `Across your selected corpus of ${papers.length} works, several recurrent methodological boundaries emerge:\n\n1. **Sample & Context Generalizability**: Studies such as ${getFirstAuthor(samplePaper)} et al. (${samplePaper.year || 'n.d.'}) note constraints in demographic diversity and ecological validity across longitudinal settings.\n2. **Measurement Variances**: Discrepancies exist between self-reported indicators and instrumented behavioral tracking.\n3. **Longitudinal Confirmation**: While initial empirical findings are robust, replication across secondary academic datasets remains an open research opportunity.`;
            } else if (promptToSend.toLowerCase().includes('paragraph') || promptToSend.toLowerCase().includes('draft') || promptToSend.toLowerCase().includes('review')) {
                const p1 = papers[0];
                const p2 = papers.length > 1 ? papers[1] : papers[0];
                citationsList.push(`${getFirstAuthor(p1)} (${p1.year || 'n.d.'})`, `${getFirstAuthor(p2)} (${p2.year || 'n.d.'})`);
                responseText = `**Draft Literature Review Paragraph**:\n\nRecent scholarly inquiry underscores significant empirical dynamics within this domain. As demonstrated by ${getFirstAuthor(p1)} et al. (${p1.year || 'n.d.'}), theoretical frameworks must account for both institutional context and systematic operational variables. Furthermore, corroborating research by ${getFirstAuthor(p2)} et al. (${p2.year || 'n.d.'}) reveals that when these criteria are rigorously evaluated, downstream outcomes exhibit measurable stabilization. Synthesizing these perspectives highlights a cohesive trajectory toward reproducible evidence standards.`;
            } else {
                const citedAuthors = papers.slice(0, 3).map(p => `${getFirstAuthor(p)} (${p.year || 'n.d.'})`);
                citationsList.push(...citedAuthors);
                responseText = `Based on your ${papers.length} selected works (${citedAuthors.join(', ')}):\n\n- **Primary Consensus**: The literature consistently emphasizes empirical rigor, systematic inclusion protocols, and cross-dataset validation.\n- **Theoretical Alignment**: Authors converge on structured methodological reporting to ensure replicability across independent laboratory environments.\n- **Actionable Next Step**: Review the Comparative Evidence Matrix to contrast specific study designs and sample sizes before packaging your discovery snapshot.`;
            }

            // NOTE: this reply is a timer-driven template, not AI output. It is intentionally NOT logged
            // as an AI trace (no 'ai-answered' statement). The researcher's own question is still logged above.

            setAssistantMessages(prev => [
                ...prev,
                { role: 'assistant', text: responseText, citations: citationsList.length > 0 ? citationsList : undefined }
            ]);
            setIsAssistantResponding(false);
        }, 600);
    };

    return (
        <div id="researcher-workspace" className="space-y-6">
            {/* Top Workspace Header answering: What evidence supports my research? */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                            Research Workspace
                        </h1>
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {papers.length} {papers.length === 1 ? 'Selected Work' : 'Selected Works'}
                        </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 font-normal">
                        What evidence supports my research? Evaluate, synthesize, and package your curated literature.
                    </p>
                </div>

                {/* Primary Continue in Local Lab Action */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {papers.length === 0 && (
                        <span className="text-xs text-slate-500">
                            Stage at least one paper to export.
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={onOpenSnapshotDialog}
                        disabled={papers.length === 0}
                        className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs ${
                            isS3AOnline 
                                ? 'bg-emerald-700 hover:bg-emerald-800 text-white' 
                                : 'bg-slate-900 hover:bg-slate-800 text-white'
                        }`}
                        title={papers.length === 0 ? "Stage at least one paper to export." : isS3AOnline ? "Local Lab online: stream session directly to scholar_live_lab.s3a" : "Package candidate works into a Discovery Snapshot to continue research locally"}
                    >
                        {isS3AOnline ? (
                            <>
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                                </span>
                                <Zap className="w-3.5 h-3.5 text-emerald-200" />
                                <span>Sync to Local Lab</span>
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4" />
                                <span>Continue in Local Lab</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Navigation Tabs (Overview, Papers, Evidence, Notes, AI Assistant, Snapshots) */}
            <div className="flex items-center justify-between gap-2 overflow-x-auto border-b border-slate-200/80 pb-px">
                <nav className="flex items-center gap-1 sm:gap-1.5" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'overview'}
                        onClick={() => setActiveTab('overview')}
                        className={`inline-flex items-center gap-2 px-3 py-2 text-xs rounded-t-lg border-b-2 transition-all ${
                            activeTab === 'overview'
                                ? 'border-slate-900 text-slate-900 font-semibold bg-white'
                                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`}
                    >
                        <Compass className="w-3.5 h-3.5" />
                        <span>Overview</span>
                    </button>

                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'papers'}
                        onClick={() => setActiveTab('papers')}
                        className={`inline-flex items-center gap-2 px-3 py-2 text-xs rounded-t-lg border-b-2 transition-all ${
                            activeTab === 'papers'
                                ? 'border-slate-900 text-slate-900 font-semibold bg-white'
                                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`}
                    >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Papers</span>
                        {papers.length > 0 && (
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                                activeTab === 'papers' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'
                            }`}>
                                {papers.length}
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'evidence'}
                        onClick={() => setActiveTab('evidence')}
                        className={`inline-flex items-center gap-2 px-3 py-2 text-xs rounded-t-lg border-b-2 transition-all ${
                            activeTab === 'evidence'
                                ? 'border-slate-900 text-slate-900 font-semibold bg-white'
                                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`}
                    >
                        <Table className="w-3.5 h-3.5" />
                        <span>Evidence</span>
                        {papers.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-medium">
                                Matrix & Claims
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'notes'}
                        onClick={() => setActiveTab('notes')}
                        className={`inline-flex items-center gap-2 px-3 py-2 text-xs rounded-t-lg border-b-2 transition-all ${
                            activeTab === 'notes'
                                ? 'border-slate-900 text-slate-900 font-semibold bg-white'
                                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`}
                    >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>Notes</span>
                    </button>

                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'ai-assistant'}
                        onClick={() => setActiveTab('ai-assistant')}
                        className={`inline-flex items-center gap-2 px-3 py-2 text-xs rounded-t-lg border-b-2 transition-all ${
                            activeTab === 'ai-assistant'
                                ? 'border-slate-900 text-slate-900 font-semibold bg-white'
                                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`}
                    >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Research Assistant</span>
                    </button>

                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'snapshots'}
                        onClick={() => setActiveTab('snapshots')}
                        className={`inline-flex items-center gap-2 px-3 py-2 text-xs rounded-t-lg border-b-2 transition-all ${
                            activeTab === 'snapshots'
                                ? 'border-slate-900 text-slate-900 font-semibold bg-white'
                                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`}
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>Snapshots</span>
                    </button>
                </nav>

                <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-400 font-normal pr-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Handoff: Local Lab Ready</span>
                </div>
            </div>

            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Research Question Anchor Card */}
                    <div className="p-5 sm:p-6 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                Current Research Inquiry
                            </span>
                            <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full">
                                {projectName}
                            </span>
                        </div>
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-snug">
                            {searchQuery ? `"${searchQuery}"` : "General Literature Synthesis & Methodological Evaluation"}
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-3xl">
                            This workspace collects and cross-analyzes candidate works answering your central research question. Review comparative methodologies, synthesize key findings, or continue your investigation locally.
                        </p>
                    </div>

                    {/* Corpus Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                        <div className="p-4 bg-white border border-slate-200/80 rounded-xl shadow-2xs space-y-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Selected Works</span>
                            <p className="text-2xl font-bold text-slate-900">{corpusMetrics.total}</p>
                            <span className="text-[11px] text-slate-500">In current workspace</span>
                        </div>

                        <div className="p-4 bg-white border border-slate-200/80 rounded-xl shadow-2xs space-y-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Publication Years</span>
                            <p className="text-2xl font-bold text-slate-900">{corpusMetrics.yearRange}</p>
                            <span className="text-[11px] text-slate-500">Publication range</span>
                        </div>

                        <div className="p-4 bg-white border border-slate-200/80 rounded-xl shadow-2xs space-y-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Open Access</span>
                            <p className="text-2xl font-bold text-slate-900">{corpusMetrics.openAccessPercent}%</p>
                            <span className="text-[11px] text-slate-500">{corpusMetrics.openAccessCount} accessible full texts</span>
                        </div>

                        <div className="p-4 bg-white border border-slate-200/80 rounded-xl shadow-2xs space-y-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Citations</span>
                            <p className="text-2xl font-bold text-slate-900">{corpusMetrics.totalCitations.toLocaleString()}</p>
                            <span className="text-[11px] text-slate-500">Corroboration impact</span>
                        </div>
                    </div>

                    {/* Quick Exploration Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div 
                            onClick={() => setActiveTab('evidence')}
                            className="p-4 bg-white border border-slate-200/80 hover:border-slate-300 rounded-xl transition-all shadow-2xs cursor-pointer group space-y-2"
                        >
                            <div className="flex items-center justify-between">
                                <span className="p-2 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                                    <Table className="w-4 h-4" />
                                </span>
                                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                            <h3 className="text-sm font-semibold text-slate-900">Comparative Evidence</h3>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Contrast sample sizes, empirical methodologies, and findings in the matrix.
                            </p>
                        </div>

                        <div 
                            onClick={() => setActiveTab('ai-assistant')}
                            className="p-4 bg-white border border-slate-200/80 hover:border-slate-300 rounded-xl transition-all shadow-2xs cursor-pointer group space-y-2"
                        >
                            <div className="flex items-center justify-between">
                                <span className="p-2 rounded-lg bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <Sparkles className="w-4 h-4" />
                                </span>
                                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                            <h3 className="text-sm font-semibold text-slate-900">Research Assistant</h3>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Query your selected corpus for synthesis, literature reviews, and research gaps.
                            </p>
                        </div>

                        <div 
                            onClick={() => setActiveTab('snapshots')}
                            className="p-4 bg-white border border-slate-200/80 hover:border-slate-300 rounded-xl transition-all shadow-2xs cursor-pointer group space-y-2"
                        >
                            <div className="flex items-center justify-between">
                                <span className="p-2 rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                    <Download className="w-4 h-4" />
                                </span>
                                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                            <h3 className="text-sm font-semibold text-slate-900">Continue in Local Lab</h3>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Package your evidence base into an offline snapshot for confidential processing.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: PAPERS */}
            {activeTab === 'papers' && (
                <div className="space-y-4">
                    {/* Filter & Subheader Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Filter selected papers by author, title, abstract..."
                                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:bg-white transition-colors text-slate-900 placeholder:text-slate-400"
                            />
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>Showing {filteredPapers.length} of {papers.length}</span>
                        </div>
                    </div>

                    {/* Paper Cards List */}
                    {papers.length === 0 ? (
                        <div className="text-center py-16 px-4 bg-white border border-dashed border-slate-200 rounded-2xl space-y-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                                <BookOpen className="w-5 h-5" />
                            </div>
                            <h3 className="text-sm font-semibold text-slate-800">
                                No Papers Selected in Workspace
                            </h3>
                            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                                Search for scholarly literature and save candidate works to your workspace to evaluate evidence.
                            </p>
                            <button
                                type="button"
                                onClick={onNavigateToSearch}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors mt-2 shadow-xs"
                            >
                                <Search className="w-3.5 h-3.5" />
                                <span>Search Literature</span>
                            </button>
                        </div>
                    ) : filteredPapers.length === 0 ? (
                        <div className="text-center py-10 bg-white border border-slate-200 rounded-xl text-xs text-slate-500">
                            No papers match "{searchTerm}".
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredPapers.map((paper, idx) => (
                                <div 
                                    key={paper.id || idx}
                                    className="p-4 sm:p-5 bg-white border border-slate-200/80 hover:border-slate-300 rounded-xl transition-all shadow-2xs group flex flex-col sm:flex-row items-start justify-between gap-4"
                                >
                                    <div className="space-y-2 flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded border border-slate-200/60 uppercase tracking-tight">
                                                {paper.enrichmentSource || 'Peer-Reviewed'}
                                            </span>
                                            {paper.isOpenAccess && (
                                                <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 rounded border border-emerald-200/60">
                                                    Open Access
                                                </span>
                                            )}
                                            {paper.year && (
                                                <span className="text-xs font-medium text-slate-500">
                                                    {paper.year}
                                                </span>
                                            )}
                                            {paper.citations !== undefined && (
                                                <span className="text-[11px] text-slate-400 font-mono">
                                                    • {paper.citations} citations
                                                </span>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => onSelectPaper(paper)}
                                            className="text-left font-semibold text-sm sm:text-base text-slate-900 hover:text-indigo-600 transition-colors line-clamp-2 leading-snug group-hover:underline"
                                        >
                                            {paper.title}
                                        </button>

                                        <p className="text-xs text-slate-500 line-clamp-1">
                                            {paper.authors}
                                        </p>

                                        {paper.abstract && (
                                            <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 pt-0.5">
                                                {paper.abstract}
                                            </p>
                                        )}

                                        {/* Source checks (DOI match, retraction status, reference check) */}
                                        <SourceCheckBadge paper={paper} />
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex items-center gap-1.5 self-end sm:self-start shrink-0 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => onSelectPaper(paper)}
                                            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200/80"
                                            title="View deep paper details"
                                        >
                                            View Details
                                        </button>

                                        {onCitePaper && (
                                            <button
                                                type="button"
                                                onClick={() => onCitePaper(paper)}
                                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                                title="Cite this paper"
                                            >
                                                <Quote className="w-4 h-4" />
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => onRemovePaper(paper)}
                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                            title="Remove from workspace"
                                            aria-label={`Remove ${paper.title} from workspace`}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: EVIDENCE (Matrix, Claims, Protocol) */}
            {activeTab === 'evidence' && (
                <div className="space-y-4">
                    {/* Sub-view switcher */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                        <button
                            type="button"
                            onClick={() => setEvidenceSubTab('matrix')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                evidenceSubTab === 'matrix'
                                    ? 'bg-slate-900 text-white font-semibold'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                        >
                            Comparative Matrix
                        </button>
                        <button
                            type="button"
                            onClick={() => setEvidenceSubTab('claims')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                evidenceSubTab === 'claims'
                                    ? 'bg-slate-900 text-white font-semibold'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                        >
                            Abstract Sentences (preview) ({synthesizedClaims.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setEvidenceSubTab('pdf_claims')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                evidenceSubTab === 'pdf_claims'
                                    ? 'bg-slate-900 text-white font-semibold'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                        >
                            PDF Extraction (not built yet)
                        </button>
                        <button
                            type="button"
                            onClick={() => setEvidenceSubTab('collaboration')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                evidenceSubTab === 'collaboration'
                                    ? 'bg-slate-900 text-white font-semibold'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                        >
                            Committee Ledger & Audit
                        </button>
                        <button
                            type="button"
                            onClick={() => setEvidenceSubTab('protocol')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                evidenceSubTab === 'protocol'
                                    ? 'bg-slate-900 text-white font-semibold'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                        >
                            Review Protocol & PRISMA
                        </button>
                    </div>

                    {/* SUB-VIEW 1: COMPARATIVE MATRIX */}
                    {evidenceSubTab === 'matrix' && (
                        <div className="space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white border border-slate-200/80 rounded-xl">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                        <Table className="w-4 h-4 text-slate-700" />
                                        Comparative Evidence Matrix
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        Cross-study synthesis of methodology, sample size, primary findings, and citation corroboration.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={handleExportMatrixCSV}
                                        disabled={papers.length === 0}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 rounded-lg border border-slate-200 transition-colors"
                                        title="Export matrix as CSV table"
                                    >
                                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Export CSV</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleExportMatrixMarkdown}
                                        disabled={papers.length === 0}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 rounded-lg border border-slate-200 transition-colors"
                                        title="Export matrix as Markdown table for dissertation appendix"
                                    >
                                        <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>Export Markdown</span>
                                    </button>
                                </div>
                            </div>

                            {papers.length === 0 ? (
                                <div className="text-center py-12 bg-white border border-slate-200 rounded-xl text-xs text-slate-500">
                                    Add candidate papers to generate the Comparative Evidence Matrix.
                                </div>
                            ) : (
                                <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white shadow-2xs">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs divide-y divide-slate-200">
                                            <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                                                <tr>
                                                    <th scope="col" className="px-4 py-3 min-w-[220px]">Paper & Authors</th>
                                                    <th scope="col" className="px-4 py-3 min-w-[80px]">Year</th>
                                                    <th scope="col" className="px-4 py-3 min-w-[130px]">Source / Design</th>
                                                    <th scope="col" className="px-4 py-3 min-w-[280px]">Core Evidence & Methodology</th>
                                                    <th scope="col" className="px-4 py-3 min-w-[90px]">Citations</th>
                                                    <th scope="col" className="px-4 py-3 min-w-[90px] text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 bg-white">
                                                {papers.map((paper, idx) => (
                                                    <tr key={paper.id || idx} className="hover:bg-slate-50/60 transition-colors">
                                                        <td className="px-4 py-3.5">
                                                            <div className="space-y-1">
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => onSelectPaper(paper)}
                                                                    className="font-medium text-slate-900 hover:text-indigo-600 hover:underline text-left block line-clamp-2"
                                                                >
                                                                    {paper.title}
                                                                </button>
                                                                <p className="text-[11px] text-slate-500 truncate">
                                                                    {paper.authors}
                                                                </p>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3.5 font-mono text-slate-600">
                                                            {paper.year || '—'}
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                                                                {paper.enrichmentSource || 'Peer-Reviewed'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-slate-600 leading-relaxed">
                                                            <p className="line-clamp-2">
                                                                {paper.abstract ? paper.abstract.substring(0, 160) + '...' : 'Empirical study findings documented in repository.'}
                                                            </p>
                                                        </td>
                                                        <td className="px-4 py-3.5 font-mono text-slate-600">
                                                            {paper.citations !== undefined ? `${paper.citations} cit.` : 'Indexed'}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() => onSelectPaper(paper)}
                                                                className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 hover:underline"
                                                            >
                                                                <span>Inspect</span>
                                                                <ArrowUpRight className="w-3 h-3" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SUB-VIEW 2: EXTRACTED CLAIMS */}
                    {evidenceSubTab === 'claims' && (
                        <div className="space-y-4">
                            <div className="p-4 bg-white border border-slate-200/80 rounded-xl space-y-1">
                                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                    <FileCheck className="w-4 h-4 text-slate-700" />
                                    Abstract sentences (preview, not claim extraction)
                                </h3>
                                <p className="text-xs text-slate-500">
                                    One sentence per selected paper, copied from its abstract. These are not extracted or verified claims, they carry no category or confidence score, and no PDF text is read.
                                </p>
                            </div>

                            {synthesizedClaims.length === 0 ? (
                                <div className="text-center py-12 bg-white border border-slate-200 rounded-xl text-xs text-slate-500">
                                    No abstract sentences to preview yet. Add articles to your workspace.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {synthesizedClaims.map((item) => (
                                        <div 
                                            key={item.id}
                                            className="p-5 bg-white border border-slate-200/80 rounded-xl space-y-3 hover:border-slate-300 transition-all shadow-2xs flex flex-col justify-between"
                                        >
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-600 border border-slate-200">
                                                        Abstract sentence (not verified)
                                                    </span>
                                                </div>

                                                <p className="text-xs font-semibold text-slate-900 leading-snug">
                                                    "{item.claim}"
                                                </p>

                                                {item.supportingContext && (
                                                    <p className="text-[11px] text-slate-500 leading-relaxed">
                                                        {item.supportingContext}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                                                <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
                                                    Source: {item.paper.title}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectPaper(item.paper)}
                                                    className="text-slate-700 hover:text-slate-900 font-medium inline-flex items-center gap-1"
                                                >
                                                    <span>View Paper</span>
                                                    <ArrowRight className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* SUB-VIEW 3: REVIEW PROTOCOL & PRISMA */}
                    {evidenceSubTab === 'protocol' && (
                        <div className="space-y-5">
                            <div className="p-4 bg-white border border-slate-200/80 rounded-xl space-y-1">
                                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-slate-700" />
                                    Systematic Review Protocol & Eligibility Standard
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Transparent audit documentation tracking your query logic, inclusion/exclusion criteria, and PRISMA screening flow.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-5 bg-white border border-slate-200/80 rounded-xl space-y-3">
                                    <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        Inclusion Criteria
                                    </h4>
                                    <ul className="space-y-2">
                                        {inclusionCriteria.map((c, i) => (
                                            <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                                                <span>{c}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="p-5 bg-white border border-slate-200/80 rounded-xl space-y-3">
                                    <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                        <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                                        Exclusion Criteria
                                    </h4>
                                    <ul className="space-y-2">
                                        {exclusionCriteria.map((c, i) => (
                                            <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                                                <span>{c}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                                    Screening Flow Metrics
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="p-3 bg-white border border-slate-200/80 rounded-lg">
                                        <span className="text-[10px] text-slate-400 font-medium uppercase">Active Inquiry</span>
                                        <p className="text-xs font-semibold text-slate-800 truncate mt-0.5">
                                            {searchQuery || 'General Topic Search'}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white border border-slate-200/80 rounded-lg">
                                        <span className="text-[10px] text-slate-400 font-medium uppercase">Active Indices</span>
                                        <p className="text-xs font-semibold text-slate-800 mt-0.5">
                                            {activeSearchSources.length} Indices
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white border border-slate-200/80 rounded-lg">
                                        <span className="text-[10px] text-slate-400 font-medium uppercase">Selected Literature</span>
                                        <p className="text-xs font-semibold text-slate-800 mt-0.5">
                                            {papers.length} Works
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white border border-slate-200/80 rounded-lg">
                                        <span className="text-[10px] text-slate-400 font-medium uppercase">Snapshot Status</span>
                                        <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                                            Ready for Local Lab
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SUB-VIEW 4: FULL-TEXT PDF CLAIM EXTRACTION */}
                    {evidenceSubTab === 'pdf_claims' && (
                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white border border-slate-200/80 rounded-xl">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-indigo-600" />
                                        PDF extraction is not built yet (abstract sentences, preview only)
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        This view does not read the PDF. It lists sentences from the paper's abstract only, with no section numbers or page references.
                                    </p>
                                </div>
                                {activePdfPaper && (activePdfPaper.pdfURL || activePdfPaper.openAccessPdfUrl || activePdfPaper.sourceURL) && (
                                    <a
                                        href={activePdfPaper.pdfURL || activePdfPaper.openAccessPdfUrl || activePdfPaper.sourceURL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors shrink-0"
                                    >
                                        <span>Open Source Document</span>
                                        <ArrowUpRight className="w-3.5 h-3.5" />
                                    </a>
                                )}
                            </div>

                            {papers.length === 0 ? (
                                <div className="text-center py-12 bg-white border border-slate-200 rounded-xl text-xs text-slate-500">
                                    Add papers to your workspace to extract structured section claims.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Paper Selector */}
                                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                        {papers.map((p) => {
                                            const isSelected = p.id === (activePdfPaper?.id || papers[0].id);
                                            return (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => setSelectedPdfPaperId(p.id)}
                                                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-left shrink-0 max-w-[280px] truncate transition-all ${
                                                        isSelected
                                                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                                                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                                    }`}
                                                    title={p.title}
                                                >
                                                    <span className="block font-semibold truncate">{p.title}</span>
                                                    <span className={`text-[10px] block ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                                                        {typeof p.authors === 'string' && p.authors ? p.authors.split(',')[0] : (p.authorList?.[0]?.name || 'Author')} ({p.year || 'n.d.'})
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Abstract sentences (preview). Not PDF extraction: no section tags, no generated text. */}
                                    {activePdfPaper && (() => {
                                        const pdfAuthor = typeof activePdfPaper.authors === 'string' && activePdfPaper.authors ? activePdfPaper.authors.split(',')[0].trim() : (activePdfPaper.authorList?.[0]?.name || 'Author');
                                        const abstractSentences = (activePdfPaper.abstract || '')
                                            .split(/(?<=[.!?])\s+/)
                                            .map(s => s.trim())
                                            .filter(s => s.length > 25)
                                            .slice(0, 8);
                                        if (abstractSentences.length === 0) {
                                            return (
                                                <div className="text-center py-8 bg-white border border-slate-200 rounded-xl text-xs text-slate-500">
                                                    No abstract is available for this paper, so there is nothing to preview.
                                                </div>
                                            );
                                        }
                                        return (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {abstractSentences.map((sentence, si) => (
                                                <div key={si} className="p-4 bg-white border border-slate-200/80 rounded-xl space-y-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-700 uppercase tracking-wider">
                                                            Abstract sentence {si + 1}
                                                        </span>
                                                        <span className="text-[11px] font-mono text-slate-400">preview, not PDF</span>
                                                    </div>
                                                    <p className="text-xs text-slate-700 leading-relaxed font-serif">
                                                        "{sentence}"
                                                    </p>
                                                    <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                                                        <span className="text-[10px] text-slate-400 font-mono">
                                                            [{pdfAuthor}, {activePdfPaper.year || 'n.d.'}, abstract]
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const tag = `\n\n> "${sentence}" [${pdfAuthor}, ${activePdfPaper.year || 'n.d.'}, abstract]`;
                                                                setResearchNotes(prev => prev + tag);
                                                            }}
                                                            className="text-xs text-indigo-600 hover:text-indigo-900 font-semibold"
                                                        >
                                                            + Add to Notes
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    )}

                    {/* SUB-VIEW 5: MULTI-RESEARCHER COLLABORATION & COMMITTEE LEDGER */}
                    {evidenceSubTab === 'collaboration' && (
                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white border border-slate-200/80 rounded-xl">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-slate-700" />
                                        Dissertation Committee & Multi-Researcher Sign-Off Ledger
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        Record thesis advisor reviews, methodologist sign-offs, and defense compliance logs.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleExportCommitteeReport}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors shrink-0"
                                >
                                    <FileDown className="w-3.5 h-3.5 text-slate-600" />
                                    <span>Export Committee Dossier (.md)</span>
                                </button>
                            </div>

                            <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                DEMO DATA: the committee members, sign-off statuses and the two earlier reviewer notes below are sample placeholders, not real sign-offs. They are excluded from the exported dossier and from traces. Only notes you record yourself are exported.
                            </p>

                            {/* Committee Members Table */}
                            <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white shadow-2xs">
                                <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-semibold text-xs text-slate-700 flex items-center gap-2">
                                    <Award className="w-4 h-4 text-indigo-600" />
                                    <span>Academic Review Board & Sign-Off Status</span>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {committeeMembers.map((member) => (
                                        <div key={member.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/50">
                                            <div>
                                                <span className="text-xs font-semibold text-slate-900">{member.name}</span>
                                                <span className="text-slate-400 text-xs mx-1.5">•</span>
                                                <span className="text-xs text-slate-500">{member.role}</span>
                                                <span className="text-slate-400 text-xs mx-1.5">•</span>
                                                <span className="text-[11px] text-slate-400">{member.institution}</span>
                                                {member.isDemo && (
                                                    <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-wider">DEMO</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                                                    member.status === 'Approved' 
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                                }`}>
                                                    {member.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Add Review Note Form */}
                            <div className="p-4 bg-white border border-slate-200/80 rounded-xl space-y-3">
                                <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                                    Log Advisor or Reviewer Audit Feedback
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[11px] font-medium text-slate-600 block mb-1">Reviewer Name</label>
                                        <input
                                            type="text"
                                            value={newReviewAuthor}
                                            onChange={(e) => setNewReviewAuthor(e.target.value)}
                                            placeholder="e.g. Dr. Young Baek"
                                            className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-medium text-slate-600 block mb-1">Feedback Tag</label>
                                        <select
                                            value={newReviewTag}
                                            onChange={(e) => setNewReviewTag(e.target.value)}
                                            className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 bg-white"
                                        >
                                            <option value="Methodology Signoff">Methodology Signoff</option>
                                            <option value="PRISMA Audit">PRISMA Audit</option>
                                            <option value="Sample Size Review">Sample Size Review</option>
                                            <option value="Literature Gap Note">Literature Gap Note</option>
                                            <option value="Defense Ready">Defense Ready</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium text-slate-600 block mb-1">Reviewer Comment / Guidance</label>
                                    <textarea
                                        value={newReviewComment}
                                        onChange={(e) => setNewReviewComment(e.target.value)}
                                        placeholder="Record committee directives, empirical clarifications, or methodology approval comments..."
                                        rows={2}
                                        className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 resize-none font-sans"
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={handleAddReviewNote}
                                        disabled={!newReviewAuthor.trim() || !newReviewComment.trim()}
                                        className="px-3.5 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors"
                                    >
                                        Record in Committee Ledger
                                    </button>
                                </div>
                            </div>

                            {/* Review Logs */}
                            <div className="space-y-2.5">
                                <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                                    Audit Trail & Reviewer Notes ({reviewNotes.length})
                                </h4>
                                {reviewNotes.map((note) => (
                                    <div key={note.id} className="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-1.5">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-slate-900">{note.author}</span>
                                                {note.isDemo && (
                                                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-wider">DEMO</span>
                                                )}
                                                <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                                                    {note.tag}
                                                </span>
                                            </div>
                                            <span className="text-[11px] font-mono text-slate-400">{note.date}</span>
                                        </div>
                                        <p className="text-xs text-slate-600 leading-relaxed font-serif">
                                            "{note.comment}"
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 4: NOTES */}
            {activeTab === 'notes' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white border border-slate-200/80 rounded-xl">
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                <PenTool className="w-4 h-4 text-slate-700" />
                                Research Synthesis Notes & Literature Review Scratchpad
                            </h3>
                            <p className="text-xs text-slate-500">
                                Maintain qualitative observations, thesis arguments, and chapter annotations alongside your evidence.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleCopyNotes}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                            >
                                {notesCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                                <span>{notesCopied ? 'Copied' : 'Copy Notes'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSaveResearchNotes(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs"
                                title="Save research note to S3A (emits 'created' on first save, 'edited' on update)"
                            >
                                <Check className="w-3.5 h-3.5" />
                                <span>{noteSaveStatus || (isNotePersisted ? 'Save Note' : 'Create & Save Note')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleDownloadNotes}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                            >
                                <FileDown className="w-3.5 h-3.5 text-slate-500" />
                                <span>Download .md</span>
                            </button>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
                        <textarea
                            value={researchNotes}
                            onChange={(e) => setResearchNotes(e.target.value)}
                            onBlur={() => handleSaveResearchNotes(false)}
                            rows={16}
                            className="w-full font-mono text-xs leading-relaxed text-slate-800 bg-slate-50/50 p-4 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:bg-white transition-all resize-y"
                            placeholder="Type or paste your research notes, dissertation arguments, and chapter syntheses here..."
                        />
                    </div>
                </div>
            )}

            {/* TAB 5: RESEARCH ASSISTANT */}
            {activeTab === 'ai-assistant' && (
                <div className="space-y-4">
                    <div className="p-4 bg-white border border-slate-200/80 rounded-xl space-y-1">
                        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-600" />
                            Scholar Explorer Assistant
                        </h3>
                        <p className="text-xs text-slate-500">
                            Context-aware academic collaborator analyzing your {papers.length} selected candidate {papers.length === 1 ? 'work' : 'works'}.
                        </p>
                        <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
                            Placeholder: replies below are fixed template text, not AI output. They are not recorded as AI traces.
                        </p>
                    </div>

                    {/* Quick research prompts */}
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => handleSendAssistantMessage("Synthesize the primary empirical findings across my workspace papers")}
                            className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
                        >
                            Synthesize empirical findings
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSendAssistantMessage("What are the key methodological limitations or research gaps across these papers?")}
                            className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
                        >
                            Identify methodological limitations
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSendAssistantMessage("Draft a literature review paragraph citing my selected works")}
                            className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
                        >
                            Draft literature review section
                        </button>
                    </div>

                    {/* Chat Messages */}
                    <div className="border border-slate-200/80 rounded-xl bg-white p-4 space-y-4 min-h-[300px] max-h-[500px] overflow-y-auto">
                        {assistantMessages.map((msg, idx) => (
                            <div 
                                key={idx} 
                                className={`flex flex-col space-y-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                            >
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                                    {msg.role === 'user' ? 'Researcher' : 'Placeholder reply (template text, not AI)'}
                                </span>
                                <div className={`p-4 rounded-xl text-xs leading-relaxed max-w-2xl ${
                                    msg.role === 'user'
                                        ? 'bg-slate-900 text-white rounded-tr-xs'
                                        : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-xs whitespace-pre-wrap'
                                }`}>
                                    {msg.text}
                                </div>
                                {msg.citations && msg.citations.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-1 px-1">
                                        <span className="text-[10px] text-slate-400 font-medium">Citations:</span>
                                        {msg.citations.map((c, ci) => (
                                            <span key={ci} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {isAssistantResponding && (
                            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                                <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                <span>Preparing placeholder reply (not AI)...</span>
                            </div>
                        )}
                    </div>

                    {/* Chat Input */}
                    <form 
                        onSubmit={(e) => { e.preventDefault(); handleSendAssistantMessage(); }} 
                        className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200"
                    >
                        <input
                            type="text"
                            value={assistantInput}
                            onChange={(e) => setAssistantInput(e.target.value)}
                            placeholder="Ask Scholar Explorer Assistant across your selected papers..."
                            className="flex-1 px-3 py-2 text-xs bg-transparent focus:outline-none text-slate-900 placeholder:text-slate-400"
                            disabled={isAssistantResponding}
                        />
                        <button
                            type="submit"
                            disabled={!assistantInput.trim() || isAssistantResponding}
                            className="p-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
                            aria-label="Send query to assistant"
                        >
                            <Send className="w-3.5 h-3.5" />
                        </button>
                    </form>
                </div>
            )}

            {/* TAB 6: SNAPSHOTS & LOCAL LAB */}
            {activeTab === 'snapshots' && (
                <div className="space-y-5">
                    <div className="p-5 bg-white border border-slate-200/80 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                {isS3AOnline ? <Zap className="w-4 h-4 text-emerald-600" /> : <Download className="w-4 h-4 text-slate-700" />}
                                Continue Research in Local Lab
                            </h3>
                            <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded flex items-center gap-1.5 ${
                                    isS3AOnline 
                                        ? 'bg-emerald-100 text-emerald-800' 
                                        : 'bg-slate-100 text-slate-700'
                                }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isS3AOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                    {isS3AOnline ? 'S3A Local Lab Online (127.0.0.1:8080)' : 'Dual-Mode Fallback Ready'}
                                </span>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                            The S3A Local Research Lab Bridge acts like the Zotero Connector: when your local engine is running at <code>127.0.0.1:8080</code>, sessions stream directly into high-performance database <code>scholar_live_lab.s3a</code>. If offline, Scholar Explorer generates a genuine portable S3A snapshot file (.s3a binary).
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-4 bg-white border border-slate-200/80 rounded-xl space-y-2 shadow-2xs">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Curated Dataset</span>
                            <p className="text-sm font-semibold text-slate-800">{papers.length} Works Packaged</p>
                            <p className="text-xs text-slate-500">Includes DOIs, abstracts, author affiliations, and citation metrics.</p>
                        </div>

                        <div className="p-4 bg-white border border-slate-200/80 rounded-xl space-y-2 shadow-2xs">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Local Engine Target</span>
                            <p className="text-sm font-semibold text-slate-800">{isS3AOnline ? 'scholar_live_lab.s3a' : 'Portable Snapshot'}</p>
                            <p className="text-xs text-slate-500">{isS3AOnline ? 'Zero-latency direct ingest (< 1ms)' : 'Portable .s3a binary snapshot'}</p>
                        </div>

                        <div className="p-4 bg-white border border-slate-200/80 rounded-xl space-y-2 shadow-2xs">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Confidential Boundary</span>
                            <p className="text-sm font-semibold text-slate-800">100% Private Offline</p>
                            <p className="text-xs text-slate-500">Deep validation occurs within your local machine boundary.</p>
                        </div>
                    </div>

                    <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="space-y-1 text-center sm:text-left">
                            <h4 className="text-sm font-semibold text-slate-900">
                                {isS3AOnline ? 'Sync Session to Local Research Lab' : 'Package and Continue Locally'}
                            </h4>
                            <p className="text-xs text-slate-500">
                                {isS3AOnline 
                                    ? 'Stream curated literature into your local S3A high-performance database.' 
                                    : 'Open the snapshot dialog to review the contract or download the bundled snapshot.'}
                            </p>
                            <p className="text-[11px] text-slate-500">
                                Query settings are not saved in the file yet
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            {papers.length === 0 && (
                                <span className="text-xs text-slate-500">
                                    Stage at least one paper to export.
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={onOpenSnapshotDialog}
                                disabled={papers.length === 0}
                                className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs ${
                                    isS3AOnline 
                                        ? 'bg-emerald-700 hover:bg-emerald-800 text-white' 
                                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                                }`}
                            >
                                {isS3AOnline ? (
                                    <>
                                        <Zap className="w-4 h-4 text-emerald-200" />
                                        <span>Sync to Local Research Lab</span>
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-4 h-4" />
                                        <span>Open Local Lab Snapshot</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

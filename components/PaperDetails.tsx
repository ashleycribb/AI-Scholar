
import React, { useState, useEffect } from 'react';
import type { ResearchPaper, PaperAnalysis, AuthorProfile, ModelDefinition, CitationStyle, ConnectedPaper, UserSettings } from '../types';
import { AddIcon } from './icons/AddIcon';
import { PdfIcon } from './icons/PdfIcon';
import { ScholarIcon } from './icons/ScholarIcon';
import { WarningIcon } from './icons/WarningIcon';
import { TagIcon } from './icons/TagIcon';
import { DoiIcon } from './icons/DoiIcon';
import { SearchIcon } from './icons/SearchIcon';
import { CheckIcon } from './icons/CheckIcon';
import { ValidationScoreDisplay } from './ValidationScoreDisplay';
import { AnalyzeIcon } from './icons/AnalyzeIcon';
import { CitationIcon } from './icons/CitationIcon';
import { UserIcon } from './icons/UserIcon';
import { CopyIcon } from './icons/CopyIcon';
import { NetworkIcon } from './icons/NetworkIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ProxyIcon } from './icons/ProxyIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { Library } from 'lucide-react';
import { CustomDropdown } from './CustomDropdown';
import { DatabaseIcon } from './icons/DatabaseIcon';
import { EvidenceBoard } from './EvidenceBoard';
import { mcpService } from '../services/mcpService';
import * as apiService from '../services/apiService';
import * as citationService from '../services/citationService';
import * as scholarBridgeService from '../services/scholarBridgeService';
import { LoadingSpinner } from './LoadingSpinner';
import { SafeHTML } from './SafeHTML';
import { SciteBadge } from './SciteBadge';
import { ShieldCheck, ThumbsUp, MessageSquare, ThumbsDown, Share2, Award, Database, ExternalLink, RefreshCw } from 'lucide-react';
import { BibliographicCopyBar } from './BibliographicCopyBar';
import * as openCitationsService from '../services/openCitationsService';
import * as dataciteService from '../services/dataciteService';
import * as openaireService from '../services/openaireService';
import { S3AClaimGovernanceCard } from './S3AClaimGovernanceCard';
import { SourceCheckBadge } from './SourceCheckBadge';
import { SemanticScoreIndicator } from './SemanticScoreIndicator';
import * as geminiService from '../services/geminiService';

interface PaperDetailsProps {
    paper: ResearchPaper;
    isInWorkspace: boolean;
    onToggleWorkspacePaper: (paper: ResearchPaper) => void;
    onConceptClick: (concept: string) => void;
    onFindDoi: (paper: ResearchPaper) => void;
    logAnalyticsEvent: (eventName: string, payload: object) => void;
    onCitePaper: (paper: ResearchPaper, style: CitationStyle) => void;
    onAuthorClick?: (author: AuthorProfile) => void;
    model: ModelDefinition;
    onOpenAnalysis: (paper: ResearchPaper) => void;
    onFindSimilar: (paper: ResearchPaper) => void;
    isFindingSimilar: boolean;
    userSettings: UserSettings;
    onGenerateLaymanSummary?: (paper: ResearchPaper) => void;
    searchQuery?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    errorMessage: string | null;
}

class PaperDetailsErrorBoundary extends React.Component<{ paperId: string; children: React.ReactNode }, ErrorBoundaryState> {
    constructor(props: { paperId: string; children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, errorMessage: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {
            hasError: true,
            errorMessage: error?.message || 'An unexpected error occurred while rendering paper details.'
        };
    }

    componentDidUpdate(prevProps: { paperId: string }) {
        if (prevProps.paperId !== this.props.paperId && this.state.hasError) {
            this.setState({ hasError: false, errorMessage: null });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="font-bold text-sm">Could not render paper detail view</div>
                        <button
                            type="button"
                            onClick={() => this.setState({ hasError: false, errorMessage: null })}
                            className="px-3 py-1 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-md text-xs font-semibold"
                        >
                            Retry
                        </button>
                    </div>
                    <p className="text-xs text-rose-800">{this.state.errorMessage}</p>
                </div>
            );
        }
        return this.props.children;
    }
}

const citationStyles: { id: CitationStyle; name: string }[] = [
    { id: 'apa', name: 'APA 7' },
    { id: 'mla', name: 'MLA 9' },
    { id: 'chicago', name: 'Chicago' },
    { id: 'harvard', name: 'Harvard' },
    { id: 'ieee', name: 'IEEE' },
    { id: 'vancouver', name: 'Vancouver' },
    { id: 'bibtex', name: 'BibTeX' },
];

const ShareIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.186 2.25 2.25 0 00-3.933 2.186z" />
    </svg>
);

const ExternalLinkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5 4.5L18 6m0 0v6m0-6h-6" />
    </svg>
);

const DoiDisplay: React.FC<{ paper: ResearchPaper; onFindDoi: (p: ResearchPaper) => void }> = ({ paper, onFindDoi }) => {
    const { doi, doiState } = paper;

    useEffect(() => {
        if (!doi && doiState !== 'loading' && doiState !== 'error' && doiState !== 'loaded') {
            const timer = setTimeout(() => onFindDoi(paper), 500);
            return () => clearTimeout(timer);
        }
    }, [doi, doiState, paper, onFindDoi]);

    if (doiState === 'loading') {
        return (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/50 text-xs text-muted-foreground animate-pulse border border-border">
                <svg className="animate-spin h-3 w-3 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>Retrieving DOI...</span>
            </div>
        );
    }

    if (doi) {
        return (
            <a 
                href={`https://doi.org/${doi}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm group"
                title={`Open DOI: ${doi}`}
            >
                <DoiIcon className="w-3.5 h-3.5" />
                <span>DOI: {doi}</span>
                <ExternalLinkIcon className="w-3 h-3 opacity-70 group-hover:opacity-100" />
            </a>
        );
    }
    
    if (doiState === 'error') {
        return (
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 px-2 py-1 rounded-full border border-destructive/20" title="Could not find DOI">
                    <WarningIcon className="w-3.5 h-3.5" />
                    <span>DOI not found</span>
                </div>
                <button 
                    onClick={() => onFindDoi(paper)} 
                    className="text-xs text-primary hover:underline font-medium"
                >
                    Retry
                </button>
            </div>
        );
    }

    return null; 
};

const SavedAnalysisSummary: React.FC<{ analysis: PaperAnalysis }> = ({ analysis }) => (
    <div className="bg-muted/30 p-3 rounded-lg border border-border mt-4">
        <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
            <AnalyzeIcon className="w-3.5 h-3.5" />
            Saved Analysis Available
        </h4>
        <p className="text-sm font-medium text-foreground">{analysis.researchQuestion}</p>
    </div>
);

const TabButton: React.FC<{
    isActive: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ isActive, onClick, children }) => {
    return (
        <button
            onClick={onClick}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
        >
            {children}
        </button>
    );
};

const AuthorList: React.FC<{ 
    authors: string, 
    authorList?: AuthorProfile[], 
    onAuthorClick?: (author: AuthorProfile) => void 
}> = ({ authors, authorList, onAuthorClick }) => {
    if (authorList && authorList.length > 0 && onAuthorClick) {
        return (
            <div className="flex flex-wrap gap-2 mt-1">
                {authorList.map((author, idx) => (
                    <button
                        key={author.id || idx}
                        onClick={() => onAuthorClick(author)}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-muted text-foreground text-xs rounded-full hover:bg-primary/10 hover:text-primary transition-colors border border-border hover:border-primary/30 group"
                        title={`View papers by ${author.name}`}
                    >
                        <UserIcon className="w-3 h-3 text-muted-foreground group-hover:text-primary" />
                        <span className="truncate max-w-[150px]">{author.name}</span>
                    </button>
                ))}
            </div>
        );
    }
    return <p className="text-sm text-muted-foreground">{authors}</p>;
};


const PaperDetailsInner: React.FC<PaperDetailsProps> = (props) => {
    const { paper, isInWorkspace, onToggleWorkspacePaper, onConceptClick, onFindDoi, logAnalyticsEvent, model, onOpenAnalysis, onCitePaper, onAuthorClick, onFindSimilar, isFindingSimilar, userSettings, onGenerateLaymanSummary, searchQuery = '' } = props;
    const [activeTab, setActiveTab] = useState<'overview' | 'citations' | 'metadata' | 'registries'>('overview');
    
    const [enrichedAbstract, setEnrichedAbstract] = useState<string | null>(null);
    const [isAbstractLoading, setIsAbstractLoading] = useState(false);
    
    // Open Registries Audit State
    const [registryCitations, setRegistryCitations] = useState<any[]>([]);
    const [registryReferences, setRegistryReferences] = useState<any[]>([]);
    const [registryProjects, setRegistryProjects] = useState<any[]>([]);
    const [registrySourceUsed, setRegistrySourceUsed] = useState<string>('OpenAlex');
    const [registryLookupErrors, setRegistryLookupErrors] = useState<string[]>([]);
    const [registryTotalCitedBy, setRegistryTotalCitedBy] = useState<number>(paper.citations || 0);
    const [registryTotalReferenced, setRegistryTotalReferenced] = useState<number>(0);
    const [isRegistryLoading, setIsRegistryLoading] = useState(false);
    const [registryAudited, setRegistryAudited] = useState(false);
    
    // Scholar Bridge Sync State
    const [scholarBridgeSyncStatus, setScholarBridgeSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
    const [scholarBridgeError, setScholarBridgeError] = useState<string | null>(null);

    // Connected Papers / Citation Graph State (with 8s timeout & Retry)
    const [connectedPapers, setConnectedPapers] = useState<ConnectedPaper[] | null>(null);
    const [connectionsSource, setConnectionsSource] = useState<string>('OpenAlex');
    const [connectionsErrors, setConnectionsErrors] = useState<string[]>([]);
    const [connectionsHardError, setConnectionsHardError] = useState<string | null>(null);
    const [isLoadingConnections, setIsLoadingConnections] = useState(false);
    const [isConnectionsExpanded, setIsConnectionsExpanded] = useState(false);

    // Key Concepts State with Timeout & Error Recovery
    const [localConcepts, setLocalConcepts] = useState<string[]>(paper.keyConcepts || []);
    const [conceptsState, setConceptsState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(
        paper.keyConcepts && paper.keyConcepts.length > 0 ? 'loaded' : 'idle'
    );
    const [conceptsErrorMsg, setConceptsErrorMsg] = useState<string | null>(null);

    // Citation style selection
    const [selectedStyle, setSelectedStyle] = useState<CitationStyle>('apa');
    const [quickCitation, setQuickCitation] = useState<string | null>(null);
    const [isCiting, setIsCiting] = useState(false);
    const [copied, setCopied] = useState(false);

    // MCP Sync State
    const [mcpSyncStatus, setMcpSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
    const [mcpMessage, setMcpMessage] = useState<string | null>(null);
    const [auditRefreshKey, setAuditRefreshKey] = useState(0);

    const extractConceptsWithTimeout = async () => {
        if (paper.keyConcepts && paper.keyConcepts.length > 0) {
            setLocalConcepts(paper.keyConcepts);
            setConceptsState('loaded');
            setConceptsErrorMsg(null);
            return;
        }

        setConceptsState('loading');
        setConceptsErrorMsg(null);

        let timeoutHandle: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error('Key concept extraction timed out after 8 seconds.'));
            }, 8000);
        });

        try {
            const extractionTask = (async (): Promise<string[]> => {
                // 1. Try OpenAlex concepts/topics first via citation graph / work lookup
                try {
                    const graphRes = await apiService.fetchPaperCitationGraphWithFallbacks(paper);
                    if (graphRes.openalexConcepts && graphRes.openalexConcepts.length > 0) {
                        return graphRes.openalexConcepts;
                    }
                } catch (_e) {
                    // Proceed to fallback
                }

                // 2. Try AI concept extraction via geminiService.extractKeyConcepts
                const textToExtract = (paper.abstract && paper.abstract.length >= 20 && !paper.abstract.includes('No abstract'))
                    ? paper.abstract
                    : `${paper.title || ''}. ${paper.abstract || ''}`;
                const aiConcepts = await geminiService.extractKeyConcepts(textToExtract, model);
                if (Array.isArray(aiConcepts) && aiConcepts.length > 0) {
                    return aiConcepts;
                }
                throw new Error('Could not extract key concepts for this paper.');
            })();

            const resolvedConcepts = await Promise.race([extractionTask, timeoutPromise]);
            clearTimeout(timeoutHandle);
            setLocalConcepts(resolvedConcepts);
            setConceptsState('loaded');
        } catch (err: any) {
            clearTimeout(timeoutHandle);
            setConceptsState('error');
            setConceptsErrorMsg(err?.message || 'Could not extract concepts (request failed or timed out).');
        }
    };

    // Reset local state when selected paper changes
    useEffect(() => {
        setEnrichedAbstract(null);
        setIsAbstractLoading(false);
        setActiveTab('overview');
        setQuickCitation(null);
        setIsCiting(false);
        setConnectedPapers(null);
        setConnectionsErrors([]);
        setConnectionsHardError(null);
        setIsLoadingConnections(false);
        setIsConnectionsExpanded(false);
        setScholarBridgeSyncStatus('idle');
        setScholarBridgeError(null);
        setMcpSyncStatus('idle');
        setMcpMessage(null);
        setAuditRefreshKey(prev => prev + 1);
        setRegistryCitations([]);
        setRegistryReferences([]);
        setRegistryProjects([]);
        setRegistryLookupErrors([]);
        setRegistryTotalCitedBy(paper.citations || 0);
        setRegistryTotalReferenced(0);
        setRegistryAudited(false);
        setIsRegistryLoading(false);

        extractConceptsWithTimeout();
    }, [paper.id]);

    const handleAuditRegistries = async () => {
        setIsRegistryLoading(true);
        setRegistryLookupErrors([]);
        try {
            const graphResult = await apiService.fetchPaperCitationGraphWithFallbacks(paper);
            setRegistryCitations(graphResult.citingLinks);
            setRegistryReferences(graphResult.referencedLinks);
            setRegistryTotalCitedBy(graphResult.citedByCount);
            setRegistryTotalReferenced(graphResult.referencedWorksCount);
            setRegistrySourceUsed(graphResult.primarySource);
            setRegistryLookupErrors(graphResult.sourceErrors);

            const titleStr = typeof paper.title === 'string' ? paper.title : String(paper.title || '');
            const grantRes = await openaireService.searchOpenAireProjects(titleStr.slice(0, 40), 5).catch(() => ({ projects: [] }));
            setRegistryProjects(grantRes.projects || []);
            setRegistryAudited(true);
        } catch (e: any) {
            console.warn("Registry audit failed:", e);
            setRegistryLookupErrors([e?.message || 'Registry lookup failed or timed out.']);
        } finally {
            setIsRegistryLoading(false);
        }
    };

    const handleMcpSync = async () => {
        const status = mcpService.getStatus();
        if (!status.isConnected) {
            alert("Local Lab Bridge is not connected. Please enable it in the Tools menu.");
            return;
        }

        setMcpSyncStatus('syncing');
        try {
            const message = await mcpService.syncToLocal(paper);
            if (message) {
                setMcpSyncStatus('synced');
                setMcpMessage(message);
                setAuditRefreshKey(prev => prev + 1);
                logAnalyticsEvent('mcp_sync_success', { paperId: paper.id });
            } else {
                throw new Error("Sync returned no confirmation.");
            }
        } catch (e) {
            setMcpSyncStatus('error');
            setMcpMessage(e instanceof Error ? e.message : 'Local Lab sync failed');
        }
    };

    const handleScholarBridgeSync = async () => {
        if (!userSettings.isScholarBridgeEnabled) {
            alert("Please enable Reference Library Sync in Settings first.");
            return;
        }
        setScholarBridgeSyncStatus('syncing');
        try {
            const result = await scholarBridgeService.pushToScholarLibrary(paper, userSettings);
            if (result.success) {
                setScholarBridgeSyncStatus('synced');
                logAnalyticsEvent('scholar_bridge_sync_success', { paperId: paper.id });
            } else {
                throw new Error(result.error);
            }
        } catch (e) {
            setScholarBridgeSyncStatus('error');
            setScholarBridgeError(e instanceof Error ? e.message : 'Sync failed');
        }
    };

    const googleScholarSearchUrl = `https://scholar.google.com/scholar?hl=en&as_sdt=0,34&q=${encodeURIComponent(`"${paper.title}"`)}`;
    
    const getProxyLink = () => {
        if (!userSettings.institutionalProxy) return null;
        const targetUrl = paper.doi ? `https://doi.org/${paper.doi}` : paper.sourceURL;
        if (!targetUrl) return null;
        return `${userSettings.institutionalProxy}${targetUrl}`;
    };

    const proxyLink = getProxyLink();

    const handleShare = async () => {
        if (!navigator.share) return;
        try {
            await navigator.share({
                title: paper.title,
                text: `Check out this research paper: "${paper.title}"`,
                url: paper.sourceURL || window.location.href,
            });
            logAnalyticsEvent('paper_shared', { title: paper.title });
        } catch (error) {
            console.error('Error sharing paper:', error);
        }
    };
    
    const handleQuickCite = async () => {
        setIsCiting(true);
        try {
            const results = await citationService.generateCitations([paper], selectedStyle, model);
            setQuickCitation(results[0] || null);
        } catch (error) {
            console.error("Failed to generate quick citation", error);
        } finally {
            setIsCiting(false);
        }
    };

    const handleCopyCitation = () => {
        if (quickCitation) {
            const plainText = quickCitation.replace(/<[^>]*>?/gm, '');
            navigator.clipboard.writeText(plainText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const fetchCitationGraphWithTimeout = async (forceReload = false) => {
        if (connectedPapers && !forceReload) {
            setIsConnectionsExpanded(true);
            return;
        }

        setIsLoadingConnections(true);
        setIsConnectionsExpanded(true);
        setConnectionsErrors([]);
        setConnectionsHardError(null);

        let timeoutHandle: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error('Citation graph lookup timed out after 8 seconds.'));
            }, 8000);
        });

        try {
            const graphResult = await Promise.race([
                apiService.fetchPaperCitationGraphWithFallbacks(paper),
                timeoutPromise
            ]);
            clearTimeout(timeoutHandle);
            setConnectedPapers(graphResult.connections);
            setConnectionsSource(graphResult.primarySource);
            setConnectionsErrors(graphResult.sourceErrors);
            setRegistryCitations(graphResult.citingLinks);
            setRegistryReferences(graphResult.referencedLinks);
            setRegistryTotalCitedBy(graphResult.citedByCount);
            setRegistryTotalReferenced(graphResult.referencedWorksCount);
            setRegistrySourceUsed(graphResult.primarySource);
            if (graphResult.openalexConcepts.length > 0 && localConcepts.length === 0) {
                setLocalConcepts(graphResult.openalexConcepts);
                setConceptsState('loaded');
            }
            logAnalyticsEvent('connections_loaded_in_details', { paperId: paper.id, count: graphResult.connections.length });
        } catch (error: any) {
            clearTimeout(timeoutHandle);
            const msg = error?.message || 'Citation graph lookup failed or timed out.';
            setConnectionsHardError(msg);
            setConnectionsErrors([msg]);
            setConnectedPapers([]);
        } finally {
            setIsLoadingConnections(false);
        }
    };

    const handleLoadConnections = async () => {
        if (connectedPapers && !connectionsHardError) {
            setIsConnectionsExpanded(!isConnectionsExpanded);
            return;
        }
        await fetchCitationGraphWithTimeout(true);
    };

    const renderKeyConcepts = () => {
        if (conceptsState === 'loading') {
            return (
                <div className="py-2">
                    <LoadingSpinner message="Extracting concepts..." />
                </div>
            );
        }
    
        if (conceptsState === 'error') {
            return (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between gap-2 text-xs text-rose-800">
                    <span>{conceptsErrorMsg || 'Could not extract concepts (request timed out or failed).'}</span>
                    <button
                        type="button"
                        onClick={extractConceptsWithTimeout}
                        className="px-2.5 py-1 bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 font-semibold rounded-md shrink-0"
                    >
                        Retry
                    </button>
                </div>
            );
        }
    
        if (conceptsState === 'loaded' && localConcepts.length > 0) {
            return (
                <div className="flex flex-wrap gap-2">
                    {localConcepts.map((concept) => (
                        <button
                            key={concept}
                            onClick={() => onConceptClick(concept)}
                            className="group flex items-center gap-1.5 px-2.5 py-1 bg-secondary text-secondary-foreground text-xs font-medium rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                            title={`Search for "${concept}"`}
                        >
                            <span>{concept}</span>
                            <SearchIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    ))}
                </div>
            );
        }
        
        return <p className="text-sm text-muted-foreground">No distinct concepts identified.</p>;
    }

    const tldrHighlight = paper.highlights?.find(h => h.category === 'TLDR');
    const references = connectedPapers?.filter(cp => cp.connection.startsWith('This paper cites')) || [];
    const citations = connectedPapers?.filter(cp => cp.connection.startsWith('Cited by this')) || [];
    const otherRelated = connectedPapers?.filter(cp => !cp.connection.startsWith('This paper cites') && !cp.connection.startsWith('Cited by this')) || [];

    return (
        <div className="flex flex-col h-full space-y-4">
             <div>
                <div className="flex justify-between items-start gap-4">
                    <div className="flex-grow pr-2 space-y-2.5">
                        <h3 className="text-lg font-bold text-foreground leading-tight">{paper.title}</h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <span className="text-sm text-muted-foreground font-medium">{paper.authors ? `${paper.authors.split(',')[0]} et al.` : (paper.authorList?.[0]?.name ? `${paper.authorList[0].name} et al.` : 'Scholarly Authors')} ({paper.year || 'n.d.'})</span>
                            <DoiDisplay paper={paper} onFindDoi={onFindDoi} />
                        </div>
                        <SourceCheckBadge paper={paper} />
                        <div className="pt-1 max-w-md">
                            <SemanticScoreIndicator score={paper.semanticScore} paper={paper} searchQuery={searchQuery} />
                        </div>
                    </div>
                    <div className="flex-shrink-0 flex flex-col gap-2">
                        <button 
                            onClick={() => onToggleWorkspacePaper(paper)} 
                            className={`flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-semibold transition-colors w-full ${
                                isInWorkspace 
                                ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                                : 'bg-secondary text-secondary-foreground hover:bg-accent'
                            }`}
                        >
                            {isInWorkspace ? <CheckIcon className="w-4 h-4" /> : <AddIcon className="w-4 h-4" />}
                            <span>{isInWorkspace ? 'Saved' : 'Save'}</span>
                        </button>

                        <button 
                            onClick={handleScholarBridgeSync}
                            disabled={scholarBridgeSyncStatus === 'syncing' || scholarBridgeSyncStatus === 'synced'}
                            className={`flex items-center justify-center gap-2 h-9 px-3 rounded-md text-sm font-semibold transition-colors border w-full ${
                                scholarBridgeSyncStatus === 'synced' 
                                ? 'bg-indigo-600 text-white border-indigo-700' 
                                : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                            }`}
                        >
                            {scholarBridgeSyncStatus === 'syncing' ? (
                                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : scholarBridgeSyncStatus === 'synced' ? (
                                <CheckIcon className="w-4 h-4" />
                            ) : (
                                <Library className="w-4 h-4" />
                            )}
                            <span>{scholarBridgeSyncStatus === 'synced' ? 'Scholar OK' : 'To Library'}</span>
                        </button>

                        <button 
                            onClick={handleMcpSync}
                            disabled={mcpSyncStatus === 'syncing' || mcpSyncStatus === 'synced'}
                            className={`flex items-center justify-center gap-2 h-9 px-3 rounded-md text-sm font-semibold transition-colors border w-full ${
                                mcpSyncStatus === 'synced' 
                                ? 'bg-slate-900 text-white border-slate-900' 
                                : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            {mcpSyncStatus === 'syncing' ? (
                                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : mcpSyncStatus === 'synced' ? (
                                <CheckIcon className="w-4 h-4" />
                            ) : (
                                <DatabaseIcon className="w-4 h-4" />
                            )}
                            <span>{mcpSyncStatus === 'synced' ? 'In Local Lab' : 'Stage for Local Lab'}</span>
                        </button>
                    </div>
                </div>
            </div>
            
            <div className="border-b border-border overflow-x-auto">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <TabButton isActive={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Overview</TabButton>
                    <TabButton
                        isActive={activeTab === 'citations'}
                        onClick={() => {
                            setActiveTab('citations');
                            if (!connectedPapers && !isLoadingConnections) {
                                fetchCitationGraphWithTimeout(false);
                            }
                        }}
                    >
                        Citations ({paper.citations ?? registryTotalCitedBy ?? 0})
                    </TabButton>
                    <TabButton isActive={activeTab === 'metadata'} onClick={() => setActiveTab('metadata')}>Metadata</TabButton>
                    <TabButton isActive={activeTab === 'registries'} onClick={() => { setActiveTab('registries'); if (!registryAudited) handleAuditRegistries(); }}>
                        Open Registries & PIDs
                    </TabButton>
                </nav>
            </div>

            <div className="pt-2 flex-grow">
                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-fade-in pb-4">
                        {scholarBridgeError && (
                            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-xs font-medium border border-red-100">
                                <strong>Reference Sync:</strong> {scholarBridgeError}
                            </div>
                        )}

                        {mcpMessage && (
                            <div className={`p-3 rounded-lg text-xs font-medium border ${
                                mcpSyncStatus === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'
                            }`}>
                                <strong>Local Lab:</strong> {mcpMessage}
                            </div>
                        )}
                        
                        {/* S3A Claim & Epistemic Gate Governance Card */}
                        <S3AClaimGovernanceCard paper={paper} />
                        
                        <EvidenceBoard 
                            key={auditRefreshKey} 
                            doi={paper.doi || 'unknown'} 
                        />
                        
                        {tldrHighlight && (
                            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm group">
                                <h4 className="text-xs font-black uppercase tracking-widest text-indigo-600 mb-2 flex items-center gap-2">
                                    <SparklesIcon className="w-4 h-4" />
                                    Semantic Scholar TL;DR
                                </h4>
                                <p className="text-sm font-bold text-indigo-900 leading-tight">"{tldrHighlight.text}"</p>
                            </div>
                        )}

                        {(paper.laymanSummary || paper.isLaymanLoading) ? (
                            <div className={`p-4 rounded-xl border transition-all ${
                                paper.isLaymanLoading 
                                    ? 'bg-slate-50 border-slate-200 animate-pulse' 
                                    : 'bg-indigo-50 border-indigo-100'
                            }`}>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-indigo-600 flex items-center gap-2">
                                        <SparklesIcon className="w-4 h-4" />
                                        Plain Language Translation
                                    </h4>
                                    {!paper.isLaymanLoading && (
                                        <span className="text-[10px] font-black text-indigo-400 uppercase italic">Layman Summary</span>
                                    )}
                                </div>
                                {paper.isLaymanLoading ? (
                                    <div className="space-y-2">
                                        <div className="h-4 bg-slate-200 rounded w-full" />
                                        <div className="h-4 bg-slate-200 rounded w-5/6" />
                                        <div className="h-4 bg-slate-200 rounded w-4/6" />
                                    </div>
                                ) : (
                                    <p className="text-sm font-medium text-indigo-900 leading-relaxed italic">
                                        {paper.laymanSummary}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={() => onGenerateLaymanSummary?.(paper)}
                                className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-sm group"
                            >
                                <SparklesIcon className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                <span>Generate Layman Summary</span>
                            </button>
                        )}

                        {paper.sciteTally && (
                            <div className="bg-slate-900 rounded-xl p-4 text-white shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-xl"></div>
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="w-4 h-4 text-slate-400" />
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Scite Smart Citations</h4>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveTab('citations');
                                            if (!connectedPapers && !isLoadingConnections) {
                                                fetchCitationGraphWithTimeout(false);
                                            }
                                        }}
                                        className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white border border-white/15 transition-colors"
                                    >
                                        Open Citations Graph
                                    </button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5 text-emerald-400">
                                            <ThumbsUp className="w-3.5 h-3.5" />
                                            <span className="text-lg font-bold leading-none">{paper.sciteTally.supporting}</span>
                                        </div>
                                        <span className="text-[9px] text-slate-500 font-bold uppercase mt-1">Supporting</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5 text-slate-300">
                                            <MessageSquare className="w-3.5 h-3.5" />
                                            <span className="text-lg font-bold leading-none">{paper.sciteTally.mentioning}</span>
                                        </div>
                                        <span className="text-[9px] text-slate-500 font-bold uppercase mt-1">Mentioning</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5 text-rose-400">
                                            <ThumbsDown className="w-3.5 h-3.5" />
                                            <span className="text-lg font-bold leading-none">{paper.sciteTally.contrasting}</span>
                                        </div>
                                        <span className="text-[9px] text-slate-500 font-bold uppercase mt-1">Contrasting</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Instant Bibliographic Copy Bar & Export Toolkit */}
                        <BibliographicCopyBar paper={paper} />

                        {/* Extended Citation Export */}
                        <div className="bg-muted/40 border border-border rounded-xl shadow-sm">
                            <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between rounded-t-xl">
                                <div className="flex items-center gap-2">
                                    <CitationIcon className="w-5 h-5 text-indigo-600" />
                                    <h4 className="text-sm font-black uppercase tracking-widest text-foreground">Reference Export & Formatting</h4>
                                </div>
                                <button 
                                    onClick={() => onCitePaper(paper, selectedStyle)}
                                    className="text-[10px] font-black uppercase text-indigo-600 hover:underline"
                                >
                                    Export RIS/BibTeX
                                </button>
                            </div>
                            <div className="p-4 space-y-4">
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <CustomDropdown
                                        value={selectedStyle}
                                        options={citationStyles.map(s => ({ id: s.id, name: s.name }))}
                                        onChange={(val) => setSelectedStyle(val as CitationStyle)}
                                        className="flex-grow"
                                        triggerClassName="w-full h-10 px-4 bg-background border border-border rounded-lg justify-between"
                                    />
                                    <button 
                                        onClick={handleQuickCite}
                                        disabled={isCiting}
                                        className="h-10 px-4 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-sm"
                                    >
                                        {isCiting ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <SparklesIcon className="w-3.5 h-3.5" />}
                                        <span>Generate with AI</span>
                                    </button>
                                </div>

                                {quickCitation && (
                                    <div className="p-3 bg-white rounded-lg border border-border group relative animate-fade-in shadow-inner">
                                        <SafeHTML
                                            html={quickCitation}
                                            className="text-xs text-foreground leading-relaxed pr-8 font-serif"
                                        />
                                        <button 
                                            onClick={handleCopyCitation}
                                            className="absolute right-2 top-2 p-1.5 text-muted-foreground hover:text-primary bg-background border rounded-md shadow-sm transition-all hover:scale-110"
                                            title="Copy to clipboard"
                                        >
                                            {copied ? <CheckIcon className="w-3.5 h-3.5 text-green-600" /> : <CopyIcon className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Semantic Hits (Passage Highlights) */}
                        {paper.semanticHighlights && paper.semanticHighlights.length > 0 && (
                            <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl shadow-sm">
                                <h4 className="text-xs font-black uppercase tracking-widest text-amber-700 mb-3 flex items-center gap-2">
                                    <SparklesIcon className="w-4 h-4" />
                                    Semantic Matches (Top Passages)
                                </h4>
                                <div className="space-y-3">
                                    {paper.semanticHighlights.map((hit, idx) => (
                                        <div key={idx} className="p-3 bg-white rounded-lg border border-amber-200 text-sm text-foreground relative shadow-sm">
                                            <p className="leading-relaxed">"{hit.text}"</p>
                                            <div className="absolute top-0 right-0 -mt-2 -mr-2 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200 shadow-sm">
                                                Match: {hit.score}%
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <h4 className="font-semibold text-foreground">Abstract</h4>
                            {isAbstractLoading ? (
                                <div className="py-4">
                                    <LoadingSpinner message="Loading abstract..." />
                                </div>
                            ) : (
                                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                                    {enrichedAbstract || paper.abstract}
                                </p>
                            )}
                        </div>
                         <div>
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                                <TagIcon className="w-4 h-4 text-muted-foreground" />
                                Key Concepts
                            </h4>
                            {renderKeyConcepts()}
                        </div>
                        
                        <div className="border border-border rounded-lg overflow-hidden bg-card/50 shadow-sm">
                            <button 
                                onClick={handleLoadConnections}
                                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-all text-left group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 text-blue-600 rounded-md group-hover:scale-110 transition-transform">
                                        <NetworkIcon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-foreground text-sm">Citation Network</h4>
                                        <p className="text-xs text-muted-foreground">Fetch citing & referenced works from OpenAlex (Semantic Scholar & OpenCitations fallback)</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isLoadingConnections && <LoadingSpinner message="" />}
                                    <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${isConnectionsExpanded ? 'rotate-180' : ''}`} />
                                </div>
                            </button>
                            
                            {isConnectionsExpanded && (
                                <div className="p-4 border-t border-border space-y-6 bg-background/50">
                                    {connectionsErrors.length > 0 && (
                                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                                            <div className="font-bold flex items-center gap-1.5">
                                                <WarningIcon className="w-4 h-4 text-amber-600 shrink-0" />
                                                <span>Citation Graph Source Notice (Primary: {connectionsSource})</span>
                                            </div>
                                            <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-800">
                                                {connectionsErrors.map((err, i) => (
                                                    <li key={i}>{err}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {isLoadingConnections ? (
                                        <div className="py-4 text-center">
                                            <LoadingSpinner message="Mapping relationships via OpenAlex (Semantic Scholar & OpenCitations fallback)..." />
                                        </div>
                                    ) : (connectedPapers && connectedPapers.length > 0) ? (
                                        <div className="space-y-6">
                                            <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-100 pb-2">
                                                <span>Primary Source: <strong className="text-slate-800">{connectionsSource}</strong></span>
                                                <span>{references.length} references • {citations.length} citing works</span>
                                            </div>
                                            {references.length > 0 && (
                                                <section>
                                                    <h5 className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-600 mb-3 ml-1 flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                                        References ({references.length})
                                                    </h5>
                                                    <div className="space-y-3">
                                                        {references.map((cp, idx) => (
                                                            <div key={idx} className="p-3 bg-card border rounded-lg hover:border-amber-300 transition-colors shadow-sm group">
                                                                <div className="flex justify-between items-start gap-2">
                                                                    <h6 className="text-sm font-bold text-foreground leading-tight group-hover:text-amber-700 transition-colors">{cp.title}</h6>
                                                                    {cp.sourceURL && (
                                                                        <a href={cp.sourceURL} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 rounded transition-all">
                                                                            <ScholarIcon className="w-3.5 h-3.5" />
                                                                        </a>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-muted-foreground mt-1">{cp.authors} ({cp.year})</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>
                                            )}

                                            {citations.length > 0 && (
                                                <section>
                                                    <h5 className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-600 mb-3 ml-1 flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                                        Citing Works ({citations.length})
                                                    </h5>
                                                    <div className="space-y-3">
                                                        {citations.map((cp, idx) => (
                                                            <div key={idx} className="p-3 bg-card border rounded-lg hover:border-blue-300 transition-colors shadow-sm group">
                                                                <div className="flex justify-between items-start gap-2">
                                                                    <h6 className="text-sm font-bold text-foreground leading-tight group-hover:text-blue-700 transition-colors">{cp.title}</h6>
                                                                    {cp.sourceURL && (
                                                                        <a href={cp.sourceURL} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 rounded transition-all">
                                                                            <ScholarIcon className="w-3.5 h-3.5" />
                                                                        </a>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-muted-foreground mt-1">{cp.authors} ({cp.year})</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>
                                            )}

                                            {otherRelated.length > 0 && (
                                                <section>
                                                    <h5 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 mb-3 ml-1 flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                                        AI-Discovered (Related)
                                                    </h5>
                                                    <div className="space-y-3">
                                                        {otherRelated.map((cp, idx) => (
                                                            <div key={idx} className="p-3 bg-card border rounded-lg hover:border-slate-300 transition-colors shadow-sm group">
                                                                <div className="flex justify-between items-start gap-2">
                                                                    <h6 className="text-sm font-bold text-foreground leading-tight group-hover:text-slate-700 transition-colors">{cp.title}</h6>
                                                                    {cp.sourceURL && (
                                                                        <a href={cp.sourceURL} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-slate-600 hover:bg-slate-50 rounded transition-all">
                                                                            <ScholarIcon className="w-3.5 h-3.5" />
                                                                        </a>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-muted-foreground mt-1">{cp.authors} ({cp.year})</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>
                                            )}

                                            <div className="pt-2 text-center border-t border-border/50">
                                                <button 
                                                    onClick={() => onOpenAnalysis(paper)}
                                                    className="text-xs font-bold text-primary hover:underline flex items-center justify-center gap-1 mx-auto"
                                                >
                                                    <AnalyzeIcon className="w-3 h-3" />
                                                    Explore Full Citation Graph
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 text-muted-foreground space-y-2">
                                            <p className="text-sm font-medium text-rose-700">
                                                {connectionsErrors.length > 0
                                                    ? 'Citation graph lookup encountered errors across upstream sources.'
                                                    : 'No citing or referenced works returned from OpenAlex, Semantic Scholar, or OpenCitations for this record.'}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => fetchCitationGraphWithTimeout(true)}
                                                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-md text-xs font-semibold"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {paper.savedAnalysis && <SavedAnalysisSummary analysis={paper.savedAnalysis} />}

                        <div className="pt-4 mt-2 border-t border-border">
                            <button 
                                onClick={() => onOpenAnalysis(paper)}
                                className="w-full flex items-center justify-center gap-2 p-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
                            >
                                <AnalyzeIcon className="w-5 h-5" />
                                <span>Open Analysis Dashboard</span>
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'citations' && (
                    <div className="space-y-5 animate-fade-in pb-4">
                        <div className="flex items-center justify-between flex-wrap gap-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                            <div className="flex items-center gap-2">
                                <NetworkIcon className="w-4 h-4 text-indigo-600" />
                                <span className="text-xs font-bold text-slate-900">Citation Graph</span>
                                <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-semibold">
                                    Graph source: {connectionsSource}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => fetchCitationGraphWithTimeout(true)}
                                disabled={isLoadingConnections}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 text-xs font-semibold transition-colors"
                            >
                                <RefreshCw className={`w-3 h-3 ${isLoadingConnections ? 'animate-spin' : ''}`} />
                                <span>Retry</span>
                            </button>
                        </div>

                        {(connectionsHardError || connectionsErrors.length > 0) && (
                            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold">
                                        {connectionsHardError || `Citation graph notice (source: ${connectionsSource})`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => fetchCitationGraphWithTimeout(true)}
                                        className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-md font-semibold shrink-0"
                                    >
                                        Retry
                                    </button>
                                </div>
                                {connectionsErrors.length > 0 && (
                                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-rose-800">
                                        {connectionsErrors.map((err, i) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        {isLoadingConnections ? (
                            <div className="py-8 text-center">
                                <LoadingSpinner message="Loading citation graph from OpenAlex (with Semantic Scholar & OpenCitations fallbacks)..." />
                            </div>
                        ) : (connectedPapers && connectedPapers.length > 0) ? (
                            <div className="space-y-5">
                                <div className="flex items-center justify-between text-xs text-slate-600 border-b border-slate-100 pb-2">
                                    <span>Source: <strong className="text-slate-900">{connectionsSource}</strong></span>
                                    <span>{citations.length} citing works • {references.length} referenced works</span>
                                </div>

                                {citations.length > 0 && (
                                    <section className="space-y-2.5">
                                        <h5 className="text-xs font-bold uppercase tracking-wider text-blue-700">
                                            Citing Works ({citations.length})
                                        </h5>
                                        <div className="space-y-2">
                                            {citations.map((cp, idx) => (
                                                <div key={idx} className="p-3 bg-white border border-slate-200 rounded-lg hover:border-blue-300 transition-colors">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <h6 className="text-sm font-semibold text-slate-900 leading-snug">{cp.title}</h6>
                                                        {cp.sourceURL && (
                                                            <a
                                                                href={cp.sourceURL}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs text-blue-600 hover:underline shrink-0"
                                                            >
                                                                Open
                                                            </a>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-1">{cp.authors} ({cp.year || 'n.d.'})</p>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {references.length > 0 && (
                                    <section className="space-y-2.5">
                                        <h5 className="text-xs font-bold uppercase tracking-wider text-amber-700">
                                            Referenced Works ({references.length})
                                        </h5>
                                        <div className="space-y-2">
                                            {references.map((cp, idx) => (
                                                <div key={idx} className="p-3 bg-white border border-slate-200 rounded-lg hover:border-amber-300 transition-colors">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <h6 className="text-sm font-semibold text-slate-900 leading-snug">{cp.title}</h6>
                                                        {cp.sourceURL && (
                                                            <a
                                                                href={cp.sourceURL}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs text-amber-700 hover:underline shrink-0"
                                                            >
                                                                Open
                                                            </a>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-1">{cp.authors} ({cp.year || 'n.d.'})</p>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {otherRelated.length > 0 && (
                                    <section className="space-y-2.5">
                                        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                            Connected Works ({otherRelated.length})
                                        </h5>
                                        <div className="space-y-2">
                                            {otherRelated.map((cp, idx) => (
                                                <div key={idx} className="p-3 bg-white border border-slate-200 rounded-lg">
                                                    <h6 className="text-sm font-semibold text-slate-900 leading-snug">{cp.title}</h6>
                                                    <p className="text-xs text-slate-500 mt-1">{cp.authors} ({cp.year || 'n.d.'})</p>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </div>
                        ) : (
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
                                <p className="text-xs text-slate-700">
                                    No citing or referenced works returned from OpenAlex, Semantic Scholar, or OpenCitations for this paper.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => fetchCitationGraphWithTimeout(true)}
                                    className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-md text-xs font-semibold"
                                >
                                    Retry
                                </button>
                            </div>
                        )}
                    </div>
                )}
                
                {activeTab === 'metadata' && (
                     <div className="space-y-6 animate-fade-in">
                        {paper.validation && <ValidationScoreDisplay validation={paper.validation} />}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-muted/30 p-3 rounded-lg border text-center">
                                <h4 className="text-[10px] font-black uppercase text-muted-foreground mb-1">Total Citations</h4>
                                <p className="text-2xl font-black text-foreground">{(paper.citations || 0).toLocaleString()}</p>
                            </div>
                            <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-center">
                                <h4 className="text-[10px] font-black uppercase text-amber-600 mb-1">Influential Citations</h4>
                                <p className="text-2xl font-black text-amber-700">{(paper.influentialCitationCount || 0).toLocaleString()}</p>
                            </div>
                        </div>

                        {paper.sciteTally && (
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Scite.ai Verification</h4>
                                    <SciteBadge tally={paper.sciteTally} size="md" />
                                </div>
                                <p className="text-[10px] text-slate-400 leading-relaxed">
                                    Smart Citations allow users to see how a publication has been cited by providing the context of the citation and a classification describing whether it provides supporting or contrasting evidence for the cited claim.
                                </p>
                            </div>
                        )}

                        <div className="space-y-3">
                             <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-semibold text-foreground text-sm">Authors</h4>
                                    <AuthorList authors={paper.authors} authorList={paper.authorList} onAuthorClick={onAuthorClick} />
                                </div>
                                <div className="text-right">
                                    <h4 className="font-semibold text-foreground text-sm">Year</h4>
                                    <p className="text-sm text-muted-foreground">{paper.year}</p>
                                </div>
                            </div>
                             <div>
                                <h4 className="font-semibold text-foreground text-sm">Journal</h4>
                                <p className="text-sm text-muted-foreground">{paper.journal || 'N/A'}</p>
                            </div>
                        </div>

                        <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-4">
                                    <a href={googleScholarSearchUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                                        <ScholarIcon className="w-4 h-4" /> Google Scholar
                                    </a>
                                    {(paper.pdfURL || paper.openAccessPdfUrl) && (
                                        <a href={paper.pdfURL || paper.openAccessPdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                                            <PdfIcon className="w-4 h-4" /> PDF
                                        </a>
                                    )}
                                </div>
                                {proxyLink && (
                                    <a href={proxyLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-bold text-indigo-700 hover:underline bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                                        <ProxyIcon className="w-4 h-4" /> 
                                        {userSettings.institutionName ? `Get it From ${userSettings.institutionName}` : 'Institutional Access'}
                                    </a>
                                )}
                            </div>
                            <button
                                onClick={handleShare}
                                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline self-start"
                            >
                                <ShareIcon className="w-4 h-4" /> Share
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'registries' && (
                    <div className="space-y-6 animate-fade-in pb-4">
                        {/* Header Audit Card */}
                        <div className="bg-indigo-50/70 border border-indigo-100 p-4 rounded-2xl flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                                    <Share2 className="w-4 h-4 text-indigo-600" />
                                    Open Scholarly Registry & PID Lineage Audit
                                </h4>
                                <p className="text-xs text-slate-600 mt-1">
                                    Federated linked citations (OpenCitations COCI), DataCite PID Graph, and European grant lineage (OpenAIRE Graph).
                                </p>
                            </div>
                            <button
                                onClick={handleAuditRegistries}
                                disabled={isRegistryLoading}
                                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                            >
                                {isRegistryLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                <span>Re-Audit PIDs</span>
                            </button>
                        </div>

                        {/* Open Linked Data Portals Direct Links */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {paper.doi && (
                                <a
                                    href={`https://opencitations.net/index/coci/api/v1/citations/${paper.doi}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all flex flex-col justify-between group"
                                >
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">OpenCitations</span>
                                    <span className="text-xs font-bold text-indigo-600 group-hover:underline flex items-center gap-1 mt-1">
                                        COCI Citations <ExternalLink className="w-3 h-3" />
                                    </span>
                                </a>
                            )}
                            {paper.doi && (
                                <a
                                    href={`https://scholia.toolforge.org/doi/${paper.doi}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all flex flex-col justify-between group"
                                >
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Wikidata</span>
                                    <span className="text-xs font-bold text-indigo-600 group-hover:underline flex items-center gap-1 mt-1">
                                        Scholia Profile <ExternalLink className="w-3 h-3" />
                                    </span>
                                </a>
                            )}
                            {paper.doi && (
                                <a
                                    href={`https://commons.datacite.org/doi.org/${paper.doi}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all flex flex-col justify-between group"
                                >
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">DataCite Commons</span>
                                    <span className="text-xs font-bold text-indigo-600 group-hover:underline flex items-center gap-1 mt-1">
                                        PID Graph <ExternalLink className="w-3 h-3" />
                                    </span>
                                </a>
                            )}
                            <a
                                href={`https://explore.openaire.eu/search/find?keyword=${encodeURIComponent(paper.title)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all flex flex-col justify-between group"
                            >
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">OpenAIRE Graph</span>
                                <span className="text-xs font-bold text-indigo-600 group-hover:underline flex items-center gap-1 mt-1">
                                    EU Grants & OA <ExternalLink className="w-3 h-3" />
                                </span>
                            </a>
                        </div>

                        {/* Citation & Reference Graph Section (OpenAlex primary, Semantic Scholar & OpenCitations fallback) */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 shadow-sm">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                    <Share2 className="w-4 h-4 text-indigo-600" />
                                    Linked Citations &amp; References ({registryTotalCitedBy || registryCitations.length} citing works / {registryTotalReferenced || registryReferences.length} references)
                                </span>
                                <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                    Primary: {registrySourceUsed}
                                </span>
                            </div>

                            {registryLookupErrors.length > 0 && (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
                                    <span className="font-bold block">Registry Lookup Warning / Rate-Limit Error:</span>
                                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                                        {registryLookupErrors.map((err, idx) => (
                                            <li key={idx}>{err}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {isRegistryLoading ? (
                                <div className="py-4 text-center">
                                    <LoadingSpinner message="Resolving citations & references via OpenAlex (with Semantic Scholar & OpenCitations fallbacks)..." />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Citing Works */}
                                    <div className="space-y-2">
                                        <span className="text-[11px] font-bold text-slate-700 block">
                                            Citing Works ({registryTotalCitedBy || registryCitations.length} total, showing {Math.min(registryCitations.length, 10)})
                                        </span>
                                        {registryCitations.length === 0 ? (
                                            <p className="text-xs text-slate-500 italic">
                                                {registryLookupErrors.length > 0
                                                    ? 'Citing works could not be retrieved due to upstream error above.'
                                                    : 'No citing works returned for this work.'}
                                            </p>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                                                {registryCitations.slice(0, 10).map((c, i) => {
                                                    const idOrDoi = c.citingDoi || '';
                                                    const isOpenAlex = idOrDoi.startsWith('W');
                                                    const href = isOpenAlex ? `https://openalex.org/${idOrDoi}` : `https://doi.org/${idOrDoi}`;
                                                    return (
                                                        <div key={i} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs flex items-center justify-between">
                                                            <span className="font-mono text-[11px] text-slate-700 truncate mr-2">
                                                                {isOpenAlex ? `openalex:${idOrDoi}` : `doi:${idOrDoi}`}
                                                            </span>
                                                            <a
                                                                href={href}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-indigo-600 hover:text-indigo-800 font-bold shrink-0 flex items-center gap-0.5"
                                                            >
                                                                <span>Resolve</span>
                                                                <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Referenced Works */}
                                    <div className="space-y-2 pt-2 border-t border-slate-100">
                                        <span className="text-[11px] font-bold text-slate-700 block">
                                            Referenced Works ({registryTotalReferenced || registryReferences.length} total, showing {Math.min(registryReferences.length, 10)})
                                        </span>
                                        {registryReferences.length === 0 ? (
                                            <p className="text-xs text-slate-500 italic">
                                                {registryLookupErrors.length > 0
                                                    ? 'Referenced works could not be retrieved due to upstream error above.'
                                                    : 'No referenced works returned for this work.'}
                                            </p>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                                                {registryReferences.slice(0, 10).map((r, i) => {
                                                    const idOrDoi = r.citedDoi || '';
                                                    const isOpenAlex = idOrDoi.startsWith('W');
                                                    const href = isOpenAlex ? `https://openalex.org/${idOrDoi}` : `https://doi.org/${idOrDoi}`;
                                                    return (
                                                        <div key={i} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs flex items-center justify-between">
                                                            <span className="font-mono text-[11px] text-slate-700 truncate mr-2">
                                                                {isOpenAlex ? `openalex:${idOrDoi}` : `doi:${idOrDoi}`}
                                                            </span>
                                                            <a
                                                                href={href}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-indigo-600 hover:text-indigo-800 font-bold shrink-0 flex items-center gap-0.5"
                                                            >
                                                                <span>Resolve</span>
                                                                <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* OpenAIRE Grants & Project Lineage */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                    <Award className="w-4 h-4 text-amber-500" />
                                    OpenAIRE Funder & Grant Lineage ({registryProjects.length} matching grants)
                                </span>
                                <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                    Horizon Europe / ERC / NIH
                                </span>
                            </div>

                            {registryProjects.length === 0 && !isRegistryLoading ? (
                                <p className="text-xs text-slate-400 italic">No explicit European/international grant agreements found matching paper title.</p>
                            ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {registryProjects.map(p => (
                                        <div key={p.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                                            <div className="flex items-center justify-between font-bold text-slate-800">
                                                <span>{p.title}</span>
                                                <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-[10px]">Grant #{p.code}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                                                <span>Funder: {p.funder}</span>
                                                {p.fundingStream && <span>Stream: {p.fundingStream}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const PaperDetails: React.FC<PaperDetailsProps> = (props) => (
    <PaperDetailsErrorBoundary paperId={props.paper.id}>
        <PaperDetailsInner {...props} />
    </PaperDetailsErrorBoundary>
);


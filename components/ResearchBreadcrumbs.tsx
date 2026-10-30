import React from 'react';
import { 
    ChevronRight, 
    Search, 
    Database, 
    FileText, 
    Layers, 
    HardDrive, 
    Bot, 
    Radio, 
    ShieldCheck, 
    ArrowLeft, 
    Sparkles, 
    Download,
    FolderGit2,
    RefreshCw
} from 'lucide-react';

export type NavTab = 'search' | 'results' | 'detail' | 'queue' | 'export' | 'connections' | 'assistant' | 'scout' | 'marketplace';

interface ResearchBreadcrumbsProps {
    activeNav: NavTab;
    previousNav: NavTab;
    onNavigate: (nav: NavTab) => void;
    query?: string;
    papersCount: number;
    workspaceCount: number;
    selectedPaperTitle?: string;
    isLocalLabOnline?: boolean;
    projectName?: string;
    onOpenExportModal?: () => void;
    onOpenDeepResearch?: () => void;
}

export const ResearchBreadcrumbs: React.FC<ResearchBreadcrumbsProps> = ({
    activeNav,
    previousNav,
    onNavigate,
    query = '',
    papersCount,
    workspaceCount,
    selectedPaperTitle,
    isLocalLabOnline = false,
    projectName = 'Doctoral Dissertation',
    onOpenExportModal,
    onOpenDeepResearch
}) => {
    // Determine category based on nav
    const getNavMeta = () => {
        switch (activeNav) {
            case 'search':
                return { category: 'Research', label: 'Search & Query', icon: Search };
            case 'results':
                return { 
                    category: 'Research', 
                    label: 'Discovery Results', 
                    badge: papersCount > 0 ? `${papersCount} works` : undefined, 
                    icon: Database 
                };
            case 'detail':
                return { 
                    category: previousNav === 'queue' ? 'Workspace' : 'Research', 
                    label: 'Paper Details', 
                    sublabel: selectedPaperTitle ? (selectedPaperTitle.length > 38 ? `${selectedPaperTitle.slice(0, 38)}...` : selectedPaperTitle) : undefined,
                    icon: FileText 
                };
            case 'queue':
                return { 
                    category: 'Workspace', 
                    label: 'Researcher Workspace', 
                    badge: workspaceCount > 0 ? `${workspaceCount} staged` : undefined, 
                    icon: Layers 
                };
            case 'export':
                return { 
                    category: 'Workspace', 
                    label: 'Local Lab Bridge & Ingest', 
                    badge: isLocalLabOnline ? '127.0.0.1:8080' : 'Offline Mode',
                    icon: HardDrive 
                };
            case 'assistant':
                return { category: 'Tools', label: 'Research Assistant', icon: Sparkles };
            case 'scout':
                return { category: 'Tools', label: 'Research Assistant', icon: Sparkles };
            case 'connections':
                return { category: 'Platform', label: 'Bridges & Connections', icon: Radio };
            case 'marketplace':
                return { category: 'Platform', label: 'Methodology Registry', icon: ShieldCheck };
            default:
                return { category: 'Research', label: 'Explorer', icon: Search };
        }
    };

    const meta = getNavMeta();
    const IconComponent = meta.icon;

    return (
        <nav 
            aria-label="Breadcrumb"
            className="w-full mb-6 pb-3 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
            {/* Left: Breadcrumb Trail */}
            <div className="flex items-center gap-2 flex-wrap text-slate-500">
                {/* Return button if on detail view */}
                {activeNav === 'detail' && (
                    <button
                        type="button"
                        onClick={() => onNavigate(previousNav === 'queue' ? 'queue' : 'results')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-slate-700 bg-white border border-slate-200 shadow-2xs hover:bg-slate-100 font-semibold transition-colors mr-1"
                        title={`Return to ${previousNav === 'queue' ? 'Researcher Workspace' : 'Discovery Results'}`}
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Return to {previousNav === 'queue' ? 'Workspace' : 'Results'}</span>
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => onNavigate('search')}
                    className="hover:text-slate-900 transition-colors font-medium"
                >
                    Explorer
                </button>

                <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

                <span className="text-slate-400 font-medium">
                    {meta.category}
                </span>

                <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

                <div className="inline-flex items-center gap-1.5 font-semibold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-200/60 shadow-2xs">
                    <IconComponent className="w-3.5 h-3.5 text-slate-600" />
                    <span>{meta.label}</span>
                    {meta.badge && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-bold ml-1">
                            {meta.badge}
                        </span>
                    )}
                </div>

                {meta.sublabel && (
                    <>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        <span className="font-serif italic text-slate-600 max-w-[240px] truncate" title={selectedPaperTitle}>
                            "{meta.sublabel}"
                        </span>
                    </>
                )}
            </div>

            {/* Right: Contextual Shortcuts */}
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                {activeNav === 'results' && papersCount > 0 && (
                    <button
                        type="button"
                        onClick={() => onNavigate('queue')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-2xs font-medium"
                    >
                        <Layers className="w-3.5 h-3.5 text-slate-500" />
                        <span>View Queue ({workspaceCount})</span>
                    </button>
                )}

                {activeNav === 'queue' && workspaceCount > 0 && (
                    <>
                        <button
                            type="button"
                            onClick={() => onNavigate('assistant')}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors font-semibold"
                        >
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            <span>Research Assistant</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onNavigate('export')}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800 transition-colors font-semibold shadow-2xs"
                        >
                            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Sync to Local Lab</span>
                        </button>
                    </>
                )}

                {/* Local Daemon Health Pill */}
                <div 
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100/80 border border-slate-200 text-[11px] font-mono text-slate-600"
                    title={isLocalLabOnline ? "S3A Local Lab daemon is connected at 127.0.0.1:8080" : "S3A Local Lab daemon is currently offline (portable snapshots active)"}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${isLocalLabOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <span className="hidden md:inline text-slate-500">Daemon:</span>
                    <span>{isLocalLabOnline ? 'Online' : 'Standby'}</span>
                </div>
            </div>
        </nav>
    );
};

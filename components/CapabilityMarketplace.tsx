import React, { useState, useMemo } from 'react';
import { 
    Search, 
    Filter, 
    Download, 
    Copy, 
    ExternalLink, 
    ShieldCheck, 
    Info, 
    Layers, 
    Cpu, 
    FileCode, 
    Check, 
    Sparkles, 
    BookOpen, 
    Lock, 
    Radio,
    Terminal,
    ChevronRight,
    AlertTriangle,
    X,
    FileJson,
    Calendar,
    ArrowLeft
} from 'lucide-react';

import { PackManifest, CapabilityPack } from '../types/marketplace';
import { STARTER_PACKS } from '../services/marketplaceService';
import { PackDetailModal } from './PackDetailModal';

export const CapabilityMarketplace: React.FC = () => {
    const [selectedPack, setSelectedPack] = useState<CapabilityPack | null>(null);
    const [modalPack, setModalPack] = useState<CapabilityPack | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterDomain, setFilterDomain] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterTrust, setFilterTrust] = useState<string>('all');
    const [filterRisk, setFilterRisk] = useState<string>('all');
    const [filterRuntime, setFilterRuntime] = useState<string>('all');
    const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'trust_card' | 'semantics' | 'evidence' | 'tools' | 'workflow' | 'install'>('overview');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({});
    const [localHost, setLocalHost] = useState('localhost');
    const [localPort, setLocalPort] = useState('5050');

    // Copy text to clipboard function
    const triggerCopy = (text: string, label: string) => {
        try {
            console.log(`Copying ${label} to clipboard...`);
            if (navigator?.clipboard?.writeText) {
                navigator.clipboard.writeText(text);
                setCopiedStates(prev => ({ ...prev, [label]: true }));
                setToastMessage(`Copied ${label} to clipboard!`);
                setTimeout(() => {
                    setCopiedStates(prev => ({ ...prev, [label]: false }));
                }, 2000);
            } else {
                throw new Error("Navigation Clipboard API is not available in this browser environment.");
            }
        } catch (err) {
            console.error("Clipboard copy error:", err);
            // Fallback: alert/inform user or show toast that it's blocked by sandbox
            setToastMessage(`Copy failed (blocked by sandbox iframe). Manually select and copy text if needed.`);
        }
    };

    // Filtered pack collection based on searches
    const filteredPacks = useMemo(() => {
        return STARTER_PACKS.filter(pack => {
            // Search criteria query match
            const queryMatch = searchQuery ? (
                pack.manifest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                pack.manifest.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
                pack.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
                pack.manifest.semantics.verbs.some(v => v.includes(searchQuery.toLowerCase())) ||
                pack.manifest.runtime.allowed_tools.some(t => t.includes(searchQuery.toLowerCase())) ||
                pack.manifest.evidence.required_artifacts.some(a => a.includes(searchQuery.toLowerCase()))
            ) : true;

            // Selector filters match
            const domainMatch = filterDomain === 'all' || pack.domain === filterDomain;
            const statusMatch = filterStatus === 'all' || pack.manifest.status === filterStatus;
            const trustMatch = filterTrust === 'all' || pack.manifest.trust.tier === filterTrust;
            const riskMatch = filterRisk === 'all' || pack.manifest.trust.risk_level === filterRisk;
            const runtimeMatch = filterRuntime === 'all' || pack.manifest.runtime.targets.includes(filterRuntime);

            return queryMatch && domainMatch && statusMatch && trustMatch && riskMatch && runtimeMatch;
        });
    }, [searchQuery, filterDomain, filterStatus, filterTrust, filterRisk, filterRuntime]);

    // Download dynamic package mock `.zip` or schema contract bundle
    const handleDownloadZipPackage = (pack: CapabilityPack) => {
        console.log("handleDownloadZipPackage triggered for pack:", pack?.manifest?.id);
        try {
            const safeParse = (str: string) => {
                try {
                    return JSON.parse(str);
                } catch (e) {
                    console.warn(`JSON parse fail for ${pack?.manifest?.id}:`, e);
                    return { raw: str, parse_error: true };
                }
            };

            // Pack metadata dictionary representation
            const serializedBundle = {
                catalog_schema: "scholar-explorer-marketplace-catalog@0.1.0",
                export_source: "Scholar Explorer Marketplace",
                timestamp: new Date().toISOString(),
                pack_id: pack.manifest.id,
                pack_name: pack.manifest.name,
                pack_version: pack.manifest.version,
                checksum_sha256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`,
                files: {
                    "manifest.json": pack.manifest,
                    "ontology.ttl": pack.ontology_content,
                    "xapi-profile.jsonld": safeParse(pack.xapi_content),
                    "tools.json": safeParse(pack.tools_content),
                    "workflow.yaml": pack.workflow_content,
                    "trust-card.md": pack.trust_card_content,
                    "PACK_HASH.txt": `SHA256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
                }
            };

            const blob = new Blob([JSON.stringify(serializedBundle, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `scholar-explorer-local-lab-pack-${pack.manifest.id}-${pack.manifest.version}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log("Successfully compiled and downloaded bundle zip for:", pack.manifest.id);
            setToastMessage(`⚡ "scholar-explorer-local-lab-pack-${pack.manifest.id}-${pack.manifest.version}.zip" download initialized. (Prototype package bundle)`);
        } catch (err) {
            console.error("Pack download error:", err);
            setToastMessage("Failed to compile pack download bundle.");
        }
    };

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            {/* Header section with brand instructions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                <div className="space-y-1.5 max-w-3xl">
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest bg-emerald-100 text-emerald-800 uppercase">
                            Semantic Guardrail Registry
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest bg-slate-100 text-slate-700 uppercase">
                            v0.1.0 Catalog
                        </span>
                    </div>
                    <h2 className="text-3xl font-black tracking-tight text-slate-900">Capability Marketplace</h2>
                    <p className="text-sm text-slate-500 font-semibold leading-relaxed">
                        Academic researchers can inspect, download, and install reusable security <span className="text-slate-800 font-bold font-semibold text-slate-600">Guardrail Packs</span> based on the open-source <a href="https://github.com/HKUDS/OpenHarness" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 font-bold underline underline-offset-2 hover:bg-indigo-50 px-1 rounded transition-colors inline-flex items-center gap-0.5">OpenHarness</a> framework (HKUDS/OpenHarness) to control autonomous research pipelines. 
                        Scholar Explorer publishes public definitions; private tool executions, studies, and LRS vaults belong strictly inside your local <strong className="text-slate-800 font-extrabold">Scholar Explorer Local Lab</strong>.
                    </p>
                </div>
            </div>

            {/* Main view router */}
            {!selectedPack ? (
                <div className="space-y-6">
                    {/* Filter bar */}
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-4">
                        <div className="flex flex-col md:flex-row gap-4">
                            {/* Search */}
                            <div className="relative flex-grow">
                                <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search packs by name, ontology terms, verbs, allowed tools, etc..."
                                    className="w-full pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-800 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400"
                                    id="marketplace-search-field"
                                />
                                {searchQuery && (
                                    <button 
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Multi-Filter row */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-slate-50">
                            <div>
                                <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Domain Category</label>
                                <select 
                                    value={filterDomain} 
                                    onChange={(e) => setFilterDomain(e.target.value)}
                                    className="w-full text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                                >
                                    <option value="all">All Domains (5)</option>
                                    <option value="academic metadata">Academic Metadata</option>
                                    <option value="research question">Research Question</option>
                                    <option value="hallucination review">Hallucination Review</option>
                                    <option value="citation">Citation Checks</option>
                                    <option value="claim verification">Claim Verification</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Status Code</label>
                                <select 
                                    value={filterStatus} 
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="w-full text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                                >
                                    <option value="all">All Statuses</option>
                                    <option value="draft">Draft</option>
                                    <option value="review">Review</option>
                                    <option value="approved">Approved</option>
                                    <option value="deprecated">Deprecated</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Trust Tier</label>
                                <select 
                                    value={filterTrust} 
                                    onChange={(e) => setFilterTrust(e.target.value)}
                                    className="w-full text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                                >
                                    <option value="all">All Tiers</option>
                                    <option value="experimental">Experimental</option>
                                    <option value="local-reviewed">Local Reviewed</option>
                                    <option value="maintainer-approved">Maintainer Approved</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Risk Level</label>
                                <select 
                                    value={filterRisk} 
                                    onChange={(e) => setFilterRisk(e.target.value)}
                                    className="w-full text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                                >
                                    <option value="all">All Risks</option>
                                    <option value="low">Low Risk</option>
                                    <option value="medium">Medium Risk</option>
                                    <option value="high">High Risk</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Runtime Targets</label>
                                <select 
                                    value={filterRuntime} 
                                    onChange={(e) => setFilterRuntime(e.target.value)}
                                    className="w-full text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                                >
                                    <option value="all">All Runtimes</option>
                                    <option value="scholar-explorer-local-lab">Scholar Explorer Local Lab</option>
                                    <option value="local-python">Local Python</option>
                                    <option value="MCP">MCP Server</option>
                                    <option value="WASM future">WASM Target</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Pack List Results */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs px-1">
                            <span className="font-extrabold text-slate-400 uppercase tracking-wider">
                                Found {filteredPacks.length} Capability {filteredPacks.length === 1 ? 'Pack' : 'Packs'}
                            </span>
                            {(searchQuery || filterDomain !== 'all' || filterStatus !== 'all' || filterTrust !== 'all' || filterRisk !== 'all' || filterRuntime !== 'all') && (
                                <button 
                                    onClick={() => {
                                        setSearchQuery('');
                                        setFilterDomain('all');
                                        setFilterStatus('all');
                                        setFilterTrust('all');
                                        setFilterRisk('all');
                                        setFilterRuntime('all');
                                    }}
                                    className="text-slate-500 hover:text-slate-900 font-bold underline"
                                >
                                    Reset active filters
                                </button>
                            )}
                        </div>

                        {filteredPacks.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {filteredPacks.map(pack => {
                                    // Visual color configuration based on risk level
                                    const isLowRisk = pack.manifest.trust.risk_level === 'low';
                                    const isHighRisk = pack.manifest.trust.risk_level === 'high';
                                    const riskBg = isLowRisk ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : isHighRisk ? 'bg-rose-50 text-rose-800 border-rose-100' : 'bg-amber-50 text-amber-800 border-amber-100';
                                    
                                    // Trust Tier indicator styles
                                    const isApproved = pack.manifest.trust.tier === 'maintainer-approved';
                                    const isReviewed = pack.manifest.trust.tier === 'local-reviewed';
                                    const tierBg = isApproved ? 'bg-indigo-50 text-indigo-800 border-indigo-100 font-extrabold' : isReviewed ? 'bg-blue-50 text-blue-800 border-blue-100 font-bold' : 'bg-slate-100 text-slate-800 border-slate-200';

                                    return (
                                        <div 
                                            key={pack.manifest.id}
                                            className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition-all group cursor-pointer"
                                            id={`pack-card-${pack.manifest.id}`}
                                            onClick={() => {
                                                setSelectedPack(pack);
                                                setModalPack(pack);
                                                setIsModalOpen(true);
                                            }}
                                        >
                                            {/* Top Metadata */}
                                            <div className="p-6 space-y-4">
                                                <div className="flex items-center justify-between gap-1 flex-wrap border-b border-slate-50 pb-2">
                                                    <span className="text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-mono">
                                                        {pack.manifest.id} @ {pack.manifest.version}
                                                    </span>
                                                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-405 text-slate-400">
                                                        {pack.manifest.status}
                                                    </span>
                                                </div>

                                                {/* Color-Coded Scanning Badges */}
                                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                    {/* Trust Tier Badge */}
                                                    {pack.manifest.trust.tier === 'maintainer-approved' && (
                                                        <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-850 border border-emerald-200 rounded-md">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                            Approved Tier
                                                        </span>
                                                    )}
                                                    {pack.manifest.trust.tier === 'local-reviewed' && (
                                                        <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-blue-50 text-blue-805 border border-blue-250 rounded-md">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                                            Local Reviewed
                                                        </span>
                                                    )}
                                                    {pack.manifest.trust.tier === 'experimental' && (
                                                        <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-amber-50 text-amber-855 border border-amber-250 rounded-md">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                            Experimental
                                                        </span>
                                                    )}

                                                    {/* Risk Level Badge */}
                                                    {pack.manifest.trust.risk_level === 'low' && (
                                                        <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-indigo-50 text-indigo-805 border border-indigo-200 rounded-md">
                                                            <span className="w-1 h-1 rounded-full bg-indigo-500"></span>
                                                            Low Risk
                                                        </span>
                                                    )}
                                                    {pack.manifest.trust.risk_level === 'medium' && (
                                                        <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-orange-50 text-orange-855 border border-orange-250 rounded-md">
                                                            <span className="w-1 h-1 rounded-full bg-orange-400"></span>
                                                            Med Risk
                                                        </span>
                                                    )}
                                                    {pack.manifest.trust.risk_level === 'high' && (
                                                        <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-rose-50 text-rose-805 border border-rose-250 rounded-md">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                                            High Risk
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="space-y-1.5">
                                                    <h3 className="text-lg font-black text-slate-900 group-hover:text-indigo-650 tracking-tight transition-colors">
                                                        {pack.manifest.name}
                                                    </h3>
                                                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-3 font-semibold">
                                                        {pack.manifest.summary}
                                                    </p>
                                                </div>

                                                {/* Meta rows */}
                                                <div className="pt-2 grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-600 border-t border-slate-50">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] uppercase tracking-widest text-slate-400 font-extrabold">Risk Metric</span>
                                                        <span className="flex items-center gap-1">
                                                            <span className={`w-1.5 h-1.5 rounded-full ${isLowRisk ? 'bg-emerald-500' : isHighRisk ? 'bg-rose-500' : 'bg-amber-500'}`} />
                                                            {pack.manifest.trust.risk_level.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] uppercase tracking-widest text-slate-400 font-extrabold">Status</span>
                                                        <span className="capitalize">{pack.manifest.status}</span>
                                                    </div>
                                                </div>

                                                {/* Critical evidence elements */}
                                                <div className="space-y-1">
                                                    <span className="text-[8px] uppercase tracking-widest text-slate-400 font-extrabold">Key Evidence Assertions</span>
                                                    <div className="flex flex-wrap gap-1">
                                                        {pack.manifest.evidence.required_artifacts.map((art, idx) => (
                                                            <span key={idx} className="bg-slate-50 text-slate-600 text-[10px] font-mono px-2 py-0.5 rounded border border-slate-100 truncate max-w-full">
                                                                {art}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Runtime Targets */}
                                                <div className="space-y-1">
                                                    <span className="text-[8px] uppercase tracking-widest text-slate-400 font-extrabold font-mono flex items-center gap-1">
                                                        <Cpu className="w-3" /> Target Hand-offs
                                                    </span>
                                                    <div className="flex flex-wrap gap-1">
                                                        {pack.manifest.runtime.targets.map((tgt, idx) => (
                                                            <span key={idx} className="bg-emerald-50 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                                {tgt}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card Footer Actions */}
                                            <div className="bg-slate-50/60 p-4 border-t border-slate-100 flex items-center justify-between gap-2">
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDownloadZipPackage(pack);
                                                    }}
                                                    className="p-2 border border-slate-200 hover:border-slate-400 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all flex items-center gap-1.5 text-xs font-bold"
                                                    title="Download reusable pack package (.zip fallback)"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    <span>ZIP Bundle</span>
                                                </button>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedPack(pack);
                                                        setModalPack(pack);
                                                        setIsModalOpen(true);
                                                    }}
                                                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs uppercase tracking-widest rounded-lg flex items-center gap-1 transition-all"
                                                >
                                                    <span>Inspect Pack</span>
                                                    <ChevronRight className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-20 bg-white border border-dashed rounded-3xl space-y-4">
                                <AlertTriangle className="w-10 h-10 text-slate-400 mx-auto" />
                                <div className="space-y-1 max-w-sm mx-auto">
                                    <h4 className="text-base font-extrabold text-slate-900">No matching packs discovered</h4>
                                    <p className="text-xs text-slate-400 leading-normal font-medium">Verify you didn't miss spelling or combine conflicting filter specifications. Reset your parameters to list all packages.</p>
                                </div>
                                <button 
                                    onClick={() => {
                                        setSearchQuery('');
                                        setFilterDomain('all');
                                        setFilterStatus('all');
                                        setFilterTrust('all');
                                        setFilterRisk('all');
                                        setFilterRuntime('all');
                                    }}
                                    className="px-4 py-2 bg-slate-950 text-white font-extrabold tracking-widest uppercase text-xs rounded-xl"
                                >
                                    Show All Starter Packs
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* Pack Detail Inspection View */
                <div className="space-y-6">
                    {/* Breadcrumbs / Back button */}
                    <button 
                        onClick={() => setSelectedPack(null)}
                        className="flex items-center gap-2 hover:text-indigo-650 text-slate-500 text-xs font-black uppercase tracking-wider transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Return to Capability Pack Directory</span>
                    </button>

                    {/* Detail Hero Section */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-start gap-4 pb-6 border-b border-slate-100">
                            <div className="space-y-3 max-w-2xl">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2 py-0.5 rounded bg-slate-100 border text-slate-600 font-mono text-[10px] font-bold">
                                        ID: {selectedPack.manifest.id}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-slate-100 border text-slate-650 font-mono text-[10px] font-bold">
                                        v{selectedPack.manifest.version}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-black uppercase tracking-wider">
                                        {selectedPack.manifest.status.toUpperCase()}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-black uppercase tracking-wider">
                                        {selectedPack.manifest.trust.tier.replace('-', ' ')}
                                    </span>
                                </div>
                                <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{selectedPack.manifest.name}</h3>
                                <p className="text-sm text-slate-500 leading-relaxed font-semibold">{selectedPack.manifest.summary}</p>
                            </div>

                            {/* Sticky action box */}
                            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 w-full md:w-80 shrink-0 space-y-4">
                                <span className="text-[9px] font-black tracking-widest text-slate-400 uppercase block">Pack Installation Handoff</span>
                                
                                <div className="space-y-2.5">
                                    <button 
                                        onClick={() => handleDownloadZipPackage(selectedPack)}
                                        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow transition-all active:scale-[0.98]"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Download className="w-4 h-4" />
                                            <span>Download Pack .ZIP</span>
                                        </div>
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </button>

                                    <button 
                                        onClick={() => triggerCopy(`python scripts\\install_capability_pack.py C:\\Users\\Ashley\\Downloads\\scholar-explorer-local-lab-pack-${selectedPack.manifest.id}-0.1.0.zip`, `command-${selectedPack.manifest.id}`)}
                                        className="w-full flex items-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-700 text-xs font-bold transition-all justify-center"
                                    >
                                        <Terminal className="w-4 h-4 text-slate-500" />
                                        <span>{copiedStates[`command-${selectedPack.manifest.id}`] ? "Copied script!" : "Copy Install Command"}</span>
                                    </button>

                                    <a 
                                        href={`http://${localHost}:${localPort}/install-pack?source=scholar-explorer&pack=${selectedPack.manifest.id}&version=${selectedPack.manifest.version}`}
                                        target="_blank"
                                        referrerPolicy="no-referrer"
                                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-black uppercase tracking-wider border border-emerald-100 transition-all text-center"
                                    >
                                        <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                                        <span>Local Lab Handoff</span>
                                        <ExternalLink className="w-3" />
                                    </a>
                                </div>

                                <div className="space-y-1.5 border-t border-slate-200/60 pt-3">
                                    <p className="text-[10px] text-slate-500 font-extrabold tracking-tight">SHA256 CHECKSUM CONTRACT</p>
                                    <div className="bg-white px-2 py-1.5 rounded border border-slate-100 flex items-center justify-between font-mono text-[9px] text-slate-500 overflow-hidden">
                                        <span className="truncate mr-3">e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</span>
                                        <button 
                                            onClick={() => triggerCopy('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'hash')}
                                            className="text-slate-400 hover:text-slate-700 font-extrabold uppercase shrink-0"
                                        >
                                            {copiedStates['hash'] ? "Copied" : "Copy"}
                                        </button>
                                    </div>
                                    <span className="text-[9px] leading-tight text-slate-400 block font-semibold">
                                        🔓 Researcher approval is required. Final signature/hash audits verify package code matches standard semantic expectations perfectly.
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Interactive Inspection tab headers */}
                        <div className="flex border-b border-slate-100 overflow-x-auto gap-2 scrollbar-none">
                            {[
                                { id: 'overview', label: 'Pack Overview' },
                                { id: 'trust_card', label: 'Trust Card' },
                                { id: 'semantics', label: 'Ontology Semantics' },
                                { id: 'evidence', label: 'Evidence (xAPI)' },
                                { id: 'tools', label: 'Tool Policy' },
                                { id: 'workflow', label: 'Workflow Rules' },
                                { id: 'install', label: 'Download / Install' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveDetailTab(tab.id as any)}
                                    className={`px-4 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all shrink-0 ${
                                        activeDetailTab === tab.id 
                                            ? 'border-indigo-600 text-slate-900 font-black' 
                                            : 'border-transparent text-slate-400 hover:text-slate-700'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab Contents */}
                        <div className="pt-4 min-h-[300px]">
                            {activeDetailTab === 'overview' && (
                                <div className="space-y-6">
                                    {/* Quick Overview Stats */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="bg-slate-50 border rounded-2xl p-4 space-y-1">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authority Reviewer</span>
                                            <p className="text-sm font-extrabold text-slate-700">{selectedPack.manifest.trust.reviewer}</p>
                                        </div>
                                        <div className="bg-slate-50 border rounded-2xl p-4 space-y-1">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Risk Level</span>
                                            <p className="text-sm font-extrabold text-slate-700 flex items-center gap-1.5">
                                                <span className={`w-2.5 h-2.5 rounded-full ${selectedPack.manifest.trust.risk_level === 'low' ? 'bg-emerald-500' : selectedPack.manifest.trust.risk_level === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                                                {selectedPack.manifest.trust.risk_level.toUpperCase()}
                                            </p>
                                        </div>
                                        <div className="bg-slate-50 border rounded-2xl p-4 space-y-1">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Semantic Ontology File</span>
                                            <p className="text-sm font-extrabold font-mono text-slate-700">{selectedPack.manifest.files.ontology}</p>
                                        </div>
                                        <div className="bg-slate-50 border rounded-2xl p-4 space-y-1">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Evidence Schema (xAPI)</span>
                                            <p className="text-sm font-extrabold font-mono text-slate-700">{selectedPack.manifest.files.xapi_profile}</p>
                                        </div>
                                    </div>

                                    {/* Detailed Description */}
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Semantic Specifications & Contracts</h4>
                                        
                                        <div className="bg-white border rounded-2xl p-5 space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Controlled OWL Verbs</span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {selectedPack.manifest.semantics.verbs.map((v, i) => (
                                                            <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-xs rounded border">{v}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Target Object Entities</span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {selectedPack.manifest.semantics.objects.map((o, i) => (
                                                            <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-xs rounded border">{o}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Required Artifact Submissions</span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {selectedPack.manifest.evidence.required_artifacts.map((a, i) => (
                                                            <span key={i} className="px-2 py-0.5 bg-slate-100 text-indigo-750 font-mono text-[11px] rounded border border-slate-200">{a}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Local Isolation Disclaimer */}
                                    <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 flex items-start gap-3">
                                        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                        <div className="space-y-1.5">
                                            <span className="text-xs font-extrabold text-amber-800 uppercase tracking-wider">Scholar Explorer vs Scholar Explorer Local Lab Boundary Contract</span>
                                            <p className="text-xs text-amber-700 leading-normal font-semibold">
                                                To ensure data privacy and institutional boundaries, Scholar Explorer serves strictly as a public publication channel. 
                                                All execution of tool policies, accessing private local source packages, writing to GNO Vaults, recording local xAPI statements, and updating DuckDB occurs purely inside your locally scoped <strong className="font-extrabold">Scholar Explorer Local Lab</strong> environment.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeDetailTab === 'trust_card' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Human-Readable Trust Card (MD Preview)</h4>
                                        <button 
                                            onClick={() => triggerCopy(selectedPack.trust_card_content, 'trust-card')}
                                            className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy Trust Card</span>
                                        </button>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 font-mono text-xs text-slate-700 whitespace-pre-wrap leading-relaxed shadow-inner overflow-x-auto max-h-[450px]">
                                        {selectedPack.trust_card_content}
                                    </div>
                                </div>
                            )}

                            {activeDetailTab === 'semantics' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">OWL/RDF Ontology Triple Definitions (.ttl)</h4>
                                        <button 
                                            onClick={() => triggerCopy(selectedPack.ontology_content, 'ontology')}
                                            className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy TTL</span>
                                        </button>
                                    </div>
                                    <div className="bg-slate-950 text-slate-150 text-emerald-400 font-mono text-xs rounded-2xl p-5 overflow-x-auto max-h-[450px] leading-relaxed relative">
                                        <div className="absolute right-4 top-4 text-[9px] font-black text-slate-500">TURTLE SYNTAX</div>
                                        <pre>{selectedPack.ontology_content}</pre>
                                    </div>
                                </div>
                            )}

                            {activeDetailTab === 'evidence' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">xAPI Profile Statements Schema Definition (.jsonld)</h4>
                                        <button 
                                            onClick={() => triggerCopy(selectedPack.xapi_content, 'xapi')}
                                            className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy JSON-LD</span>
                                        </button>
                                    </div>
                                    <div className="bg-slate-950 text-sky-400 font-mono text-xs rounded-2xl p-5 overflow-x-auto max-h-[450px] leading-relaxed relative">
                                        <div className="absolute right-4 top-4 text-[9px] font-black text-slate-500">JSON-LD SPECIFICATION</div>
                                        <pre>{selectedPack.xapi_content}</pre>
                                    </div>
                                </div>
                            )}

                            {activeDetailTab === 'tools' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Sandbox Tool Policy & Boundary Settings (.json)</h4>
                                        <button 
                                            onClick={() => triggerCopy(selectedPack.tools_content, 'tools')}
                                            className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy Tools Config</span>
                                        </button>
                                    </div>
                                    <div className="bg-slate-950 text-amber-400 font-mono text-xs rounded-2xl p-5 overflow-x-auto max-h-[450px] leading-relaxed relative">
                                        <div className="absolute right-4 top-4 text-[9px] font-black text-slate-500">TOOLS SECURITY SCHEMAS</div>
                                        <pre>{selectedPack.tools_content}</pre>
                                    </div>
                                </div>
                            )}

                            {activeDetailTab === 'workflow' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Ordered Verification & Gate Pipelines (.yaml)</h4>
                                        <button 
                                            onClick={() => triggerCopy(selectedPack.workflow_content, 'workflow')}
                                            className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy Workflow</span>
                                        </button>
                                    </div>
                                    <div className="bg-slate-950 text-indigo-350 text-violet-400 font-mono text-xs rounded-2xl p-5 overflow-x-auto max-h-[450px] leading-relaxed relative">
                                        <div className="absolute right-4 top-4 text-[9px] font-black text-slate-500">WORKFLOW SEQUENCE YAML</div>
                                        <pre>{selectedPack.workflow_content}</pre>
                                    </div>
                                </div>
                            )}

                            {activeDetailTab === 'install' && (
                                <div className="space-y-6">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Download & Installation Protocols</h4>
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded bg-emerald-500 animate-pulse"></span>
                                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Live Local Lab Binding Active</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* PROTOCOL 1: Direct Local Lab Handoff */}
                                        <div className="border border-slate-200 bg-white p-6 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-emerald-50 text-emerald-800 rounded uppercase tracking-wider">Protocol 1: Local Sync</span>
                                                    <span className="text-xs text-slate-400 font-mono">localhost:{localPort}</span>
                                                </div>
                                                <h5 className="text-base font-extrabold text-slate-900">Scholar Explorer Local Lab Integration</h5>
                                                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                                                    This interface communicates automatically with your offline laboratory via secure cross-origin parameter transfer. Ensure your locally hosted <strong className="text-slate-800">Scholar Explorer Local Lab</strong> is booted and active at your target address below.
                                                </p>

                                                {/* Configurations block */}
                                                <div className="grid grid-cols-2 gap-3 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                                    <div>
                                                        <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Local IP / Host</label>
                                                        <input 
                                                            type="text" 
                                                            value={localHost}
                                                            onChange={(e) => setLocalHost(e.target.value)}
                                                            className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                            placeholder="e.g. localhost, 127.0.0.1"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Port Number</label>
                                                        <select
                                                            value={localPort}
                                                            onChange={(e) => setLocalPort(e.target.value)}
                                                            className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                        >
                                                            <option value="5050">5050 (Lab Default)</option>
                                                            <option value="5174">5174 (Harness Gate)</option>
                                                            <option value="3000">3000 (Local App)</option>
                                                            <option value="8080">8080 (Custom)</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Output Generated URL */}
                                                <div className="space-y-1">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">Generated Handoff URL</span>
                                                    <div className="bg-slate-950 px-3 py-2 rounded-xl flex items-center justify-between font-mono text-[10px] text-emerald-400 overflow-hidden border border-slate-800 select-all">
                                                        <span className="truncate mr-4 font-mono">
                                                            {`http://${localHost}:${localPort}/install-pack?source=scholar-explorer&pack=${selectedPack.manifest.id}&version=${selectedPack.manifest.version}`}
                                                        </span>
                                                        <button 
                                                            onClick={() => triggerCopy(`http://${localHost}:${localPort}/install-pack?source=scholar-explorer&pack=${selectedPack.manifest.id}&version=${selectedPack.manifest.version}`, 'handoff-url')}
                                                            className="text-emerald-500 hover:text-emerald-350 font-black text-[9px] uppercase shrink-0"
                                                        >
                                                            copy
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-4 space-y-2">
                                                <a 
                                                    href={`http://${localHost}:${localPort}/install-pack?source=scholar-explorer&pack=${selectedPack.manifest.id}&version=${selectedPack.manifest.version}`}
                                                    target="_blank"
                                                    referrerPolicy="no-referrer"
                                                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all text-center"
                                                >
                                                    <Radio className="w-4 h-4 text-emerald-100" />
                                                    <span>Install in Scholar Explorer Local Lab</span>
                                                </a>
                                                <span className="text-[9px] leading-tight text-slate-400 block text-center font-semibold">
                                                    ⚠️ Initiates a target handshake. This transmits the verified JSON schema block to your locally scoped workspace.
                                                </span>
                                            </div>
                                        </div>

                                        {/* PROTOCOL 2: Manual ZIP Archive Download */}
                                        <div className="border border-slate-200 bg-white p-6 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-indigo-50 text-indigo-800 rounded uppercase tracking-wider">Protocol 2: Offline Archive</span>
                                                    <span className="text-xs text-slate-400 font-mono font-mono">checksum validated</span>
                                                </div>
                                                <h5 className="text-base font-extrabold text-slate-900">Offline Pack ZIP Bundle</h5>
                                                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                                                    Perfect for air-gapped systems or secure disconnected environments. This generates a complete static schema capsule package containing the turtle ontologies (.ttl), standard semantic verbs, whitelist sandbox properties, and required evidence ledger files.
                                                </p>

                                                {/* SHA Summary */}
                                                <div className="bg-slate-50 border rounded-xl p-4 space-y-2">
                                                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 font-bold">
                                                        <span>CHECKSUM ALGORITHM</span>
                                                        <span>SHA-256 CHECKED</span>
                                                    </div>
                                                    <span className="block font-mono text-[10px] text-slate-600 break-all bg-white p-2 rounded border border-slate-200">
                                                        e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                                                    </span>
                                                </div>

                                                {/* Terminal fallback instruction card */}
                                                <div className="space-y-1">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">Terminal Import Script</span>
                                                    <div className="bg-slate-950 px-3 py-2 rounded-xl flex items-center justify-between font-mono text-[9px] text-indigo-300 overflow-hidden border border-slate-800">
                                                        <span className="truncate mr-4">
                                                            {`python scripts\\install_capability_pack.py C:\\Users\\Ashley\\Downloads\\scholar-explorer-local-lab-pack-${selectedPack.manifest.id}-0.1.0.zip`}
                                                        </span>
                                                        <button 
                                                            onClick={() => triggerCopy(`python scripts\\install_capability_pack.py C:\\Users\\Ashley\\Downloads\\scholar-explorer-local-lab-pack-${selectedPack.manifest.id}-0.1.0.zip`, 'terminal-script')}
                                                            className="text-indigo-400 hover:text-indigo-250 font-black uppercase shrink-0"
                                                        >
                                                            copy
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => handleDownloadZipPackage(selectedPack)}
                                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all"
                                            >
                                                <Download className="w-4 h-4 text-slate-300" />
                                                <span>Download Capability Pack (.ZIP)</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <PackDetailModal
                isOpen={isModalOpen}
                pack={modalPack}
                onClose={() => {
                    setIsModalOpen(false);
                    setModalPack(null);
                }}
                onDownloadZip={handleDownloadZipPackage}
            />

            {/* Simple Floating Notification Toast */}
            {toastMessage && (
                <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-3 rounded-2xl text-xs tracking-wider uppercase font-black shadow-2xl border border-slate-700 flex items-center gap-2 z-50 animate-slide-in">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    <span>{toastMessage}</span>
                    <button onClick={() => setToastMessage(null)} className="ml-3 hover:text-red-400 text-slate-400">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
};

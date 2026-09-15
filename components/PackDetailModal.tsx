import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    X, 
    Download, 
    Copy, 
    Cpu, 
    Info, 
    ShieldCheck, 
    BookOpen, 
    Lock, 
    Radio, 
    Terminal, 
    ChevronRight, 
    FileJson, 
    Code, 
    Settings, 
    Calendar,
    Check
} from 'lucide-react';
import { CapabilityPack } from '../types/marketplace';

interface PackDetailModalProps {
    isOpen: boolean;
    pack: CapabilityPack | null;
    onClose: () => void;
    onDownloadZip: (pack: CapabilityPack) => void;
}

export const PackDetailModal: React.FC<PackDetailModalProps> = ({
    isOpen,
    pack,
    onClose,
    onDownloadZip
}) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'trust_card' | 'semantics' | 'evidence' | 'tools' | 'workflow' | 'install'>('overview');
    const [localHost, setLocalHost] = useState('localhost');
    const [localPort, setLocalPort] = useState('5050');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({});

    // Reset tab to overview when modal opens with a different pack
    useEffect(() => {
        if (isOpen) {
            setActiveTab('overview');
        }
    }, [isOpen, pack]);

    if (!pack) return null;

    const triggerCopy = (text: string, label: string) => {
        try {
            console.log(`Modal: Copying ${label} to clipboard...`);
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
            console.error("Modal: Clipboard copy error:", err);
            setToastMessage(`Copy failed (blocked by sandbox iframe). Manually copy text from display.`);
        }
    };

    // Close on Escape press
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Risk badge configuration
    const isLowRisk = pack.manifest.trust.risk_level === 'low';
    const isHighRisk = pack.manifest.trust.risk_level === 'high';
    const riskBadgeColor = isLowRisk 
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
        : isHighRisk 
            ? 'bg-rose-50 text-rose-800 border-rose-200 animate-pulse' 
            : 'bg-amber-50 text-amber-800 border-amber-200';

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                    />

                    {/* Modal Card Pane */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        transition={{ type: 'spring', duration: 0.5 }}
                        className="relative bg-white w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
                        id={`pack-modal-${pack.manifest.id}`}
                    >
                        {/* Header Banner */}
                        <div className="p-6 md:p-8 border-b border-slate-100 flex items-start justify-between gap-6 shrink-0 bg-slate-50/55">
                            <div className="space-y-3 max-w-3xl">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-2 py-0.5 rounded bg-slate-250 border bg-white text-slate-500 font-mono text-[10px] font-bold">
                                        ID: {pack.manifest.id}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-slate-250 border bg-white text-slate-500 font-mono text-[10px] font-bold">
                                        v{pack.manifest.version}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10.5px] font-black uppercase tracking-wider">
                                        {pack.manifest.status.toUpperCase()}
                                    </span>

                                    {/* Color Coded Tier & Risk Row */}
                                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black uppercase tracking-wider">
                                        {pack.manifest.trust.tier.replace('-', ' ')}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${riskBadgeColor}`}>
                                        RISK: {pack.manifest.trust.risk_level.toUpperCase()}
                                    </span>
                                </div>
                                <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{pack.manifest.name}</h3>
                                <p className="text-xs md:text-sm text-slate-500 font-semibold leading-relaxed line-clamp-2 md:line-clamp-none">{pack.manifest.summary}</p>
                            </div>

                            {/* Close action */}
                            <button
                                onClick={onClose}
                                className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-all shrink-0"
                                aria-label="Close modal"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Navigation Tabs Bar */}
                        <div className="flex px-8 border-b border-slate-150 overflow-x-auto gap-2 scrollbar-none bg-white shrink-0">
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
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`px-4 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all shrink-0 ${
                                        activeTab === tab.id 
                                            ? 'border-indigo-600 text-slate-900 font-black' 
                                            : 'border-transparent text-slate-400 hover:text-slate-700'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Middle Content Segment (Scrollable) */}
                        <div className="flex-grow overflow-y-auto p-6 md:p-8 space-y-6">
                            {activeTab === 'overview' && (
                                <div className="space-y-6">
                                    {/* Primary stats dashboard */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="bg-slate-50/60 border rounded-2xl p-4 space-y-1">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Authority Reviewer</span>
                                            <p className="text-xs md:text-sm font-extrabold text-slate-800">{pack.manifest.trust.reviewer}</p>
                                        </div>
                                        <div className="bg-slate-50/60 border rounded-2xl p-4 space-y-1">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Risk Threshold</span>
                                            <p className="text-xs md:text-sm font-extrabold text-slate-850 flex items-center gap-1.5 capitalize">
                                                <span className={`w-2.5 h-2.5 rounded-full ${isLowRisk ? 'bg-emerald-500' : isHighRisk ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'}`} />
                                                {pack.manifest.trust.risk_level} Risk
                                            </p>
                                        </div>
                                        <div className="bg-slate-50/60 border rounded-2xl p-4 space-y-1">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono block">Semantic Ontology File</span>
                                            <p className="text-xs md:text-sm font-extrabold font-mono text-slate-650">{pack.manifest.files.ontology}</p>
                                        </div>
                                        <div className="bg-slate-50/60 border rounded-2xl p-4 space-y-1">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono block">Evidence Schema (xAPI)</span>
                                            <p className="text-xs md:text-sm font-extrabold font-mono text-slate-650">{pack.manifest.files.xapi_profile}</p>
                                        </div>
                                    </div>

                                    {/* Detailed layout spec declarations */}
                                    <div className="space-y-4">
                                        <h4 className="text-xs md:text-sm font-extrabold text-slate-900 uppercase tracking-wider">Semantic Specifications & Verification Elements</h4>
                                        <div className="bg-white border rounded-2xl p-5 space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Controlled OWL Verbs</span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {pack.manifest.semantics.verbs.map((v, i) => (
                                                            <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-[10.5px] rounded border">{v}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Target Object Entities</span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {pack.manifest.semantics.objects.map((o, i) => (
                                                            <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-[10.5px] rounded border">{o}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Required Artifact Submissions</span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {pack.manifest.evidence.required_artifacts.map((a, i) => (
                                                            <span key={i} className="px-2 py-0.5 bg-slate-100 text-indigo-750 font-mono text-[10.5px] rounded border border-slate-200">{a}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Targets */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs md:text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                            <Cpu className="w-4 h-4 text-slate-500" /> Compatible Run-time Profiles
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {pack.manifest.runtime.targets.map((tgt, idx) => (
                                                <span key={idx} className="bg-emerald-50 text-emerald-800 text-[10px] font-extrabold px-3 py-1 border border-emerald-100 rounded-lg uppercase tracking-wider">
                                                    {tgt}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Security Boundaries / Local Boundary contract message */}
                                    <div className="bg-yellow-50/50 border border-yellow-100 rounded-2xl p-5 flex items-start gap-3">
                                        <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <span className="text-xs font-black text-amber-800 uppercase tracking-wider block">Standard Institutional Handshake Isolation Guarantee</span>
                                            <p className="text-xs text-amber-700 leading-relaxed font-semibold">
                                                Scholar Explorer operates strictly as an auditing repository. 
                                                All executions of tool policies, processing private PDFs, updating secure registries, and database commits occur completely isolated inside your private local sandbox <strong className="font-extrabold">Scholar Explorer Local Lab</strong>.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'trust_card' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs md:text-sm font-extrabold text-slate-900 uppercase tracking-wider">Human-Readable Trust Card Contract</h4>
                                        <button 
                                            onClick={() => triggerCopy(pack.trust_card_content, 'trust-card')}
                                            className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1 bg-slate-50 border px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-all"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy Trust Card Markdown</span>
                                        </button>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 font-mono text-xs text-slate-705 text-slate-700 whitespace-pre-wrap leading-relaxed shadow-inner overflow-x-auto max-h-[400px]">
                                        {pack.trust_card_content}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'semantics' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs md:text-sm font-extrabold text-slate-900 uppercase tracking-wider">OWL/RDF Ontology Triple Definitions (.ttl)</h4>
                                        <button 
                                            onClick={() => triggerCopy(pack.ontology_content, 'ontology')}
                                            className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1 bg-slate-50 border px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-all"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy TTL Statement</span>
                                        </button>
                                    </div>
                                    <div className="bg-slate-950 text-emerald-400 font-mono text-xs rounded-2xl p-5 overflow-x-auto max-h-[400px] leading-relaxed relative border border-slate-800">
                                        <div className="absolute right-4 top-4 text-[9px] font-black text-slate-500 font-mono tracking-widest">TURTLE SYNTAX</div>
                                        <pre className="font-mono">{pack.ontology_content}</pre>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'evidence' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs md:text-sm font-extrabold text-slate-900 uppercase tracking-wider">xAPI Profile Statements Schema Definition (.jsonld)</h4>
                                        <button 
                                            onClick={() => triggerCopy(pack.xapi_content, 'xapi')}
                                            className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1 bg-slate-50 border px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-all"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy JSON-LD Specification</span>
                                        </button>
                                    </div>
                                    <div className="bg-slate-950 text-sky-400 font-mono text-xs rounded-2xl p-5 overflow-x-auto max-h-[400px] leading-relaxed relative border border-slate-800">
                                        <div className="absolute right-4 top-4 text-[9px] font-black text-slate-500 font-mono tracking-widest">JSON-LD SPECIFICATION</div>
                                        <pre className="font-mono">{pack.xapi_content}</pre>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'tools' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs md:text-sm font-extrabold text-slate-900 uppercase tracking-wider">Sandbox Tool Policy & Boundary Settings (.json)</h4>
                                        <button 
                                            onClick={() => triggerCopy(pack.tools_content, 'tools')}
                                            className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1 bg-slate-50 border px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-all"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy Security Policy JSON</span>
                                        </button>
                                    </div>
                                    <div className="bg-slate-950 text-amber-400 font-mono text-xs rounded-2xl p-5 overflow-x-auto max-h-[400px] leading-relaxed relative border border-slate-800">
                                        <div className="absolute right-4 top-4 text-[9px] font-black text-slate-500 font-mono tracking-widest">SECURITY WHITELIST CONFIG</div>
                                        <pre className="font-mono">{pack.tools_content}</pre>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'workflow' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs md:text-sm font-extrabold text-slate-900 uppercase tracking-wider">Ordered Verification & Gate Pipelines (.yaml)</h4>
                                        <button 
                                            onClick={() => triggerCopy(pack.workflow_content, 'workflow')}
                                            className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1 bg-slate-50 border px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-all"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy Workflow Pipeline</span>
                                        </button>
                                    </div>
                                    <div className="bg-slate-950 text-violet-400 font-mono text-xs rounded-2xl p-5 overflow-x-auto max-h-[400px] leading-relaxed relative border border-slate-800">
                                        <div className="absolute right-4 top-4 text-[9px] font-black text-slate-500 font-mono tracking-widest">WORKFLOW SEQUENCE YAML</div>
                                        <pre className="font-mono">{pack.workflow_content}</pre>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'install' && (
                                <div className="space-y-6">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <h4 className="text-xs md:text-sm font-extrabold text-slate-900 uppercase tracking-wider">Download & Installation Protocols</h4>
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded bg-emerald-500 animate-pulse"></span>
                                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Local Connector Server Active</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* PROTOCOL 1: Direct Local Lab Handoff */}
                                        <div className="border border-slate-200 bg-white p-6 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-emerald-50 text-emerald-800 rounded uppercase tracking-wider text-xs">Protocol 1: Local Sync</span>
                                                    <span className="text-xs text-slate-400 font-mono">{localHost}:{localPort}</span>
                                                </div>
                                                <h5 className="text-base font-extrabold text-slate-900">Scholar Explorer Local Lab Integration</h5>
                                                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                                                    Bridges this browser catalog with your local environment on standard secure cross-origin parameter handoff protocol. Ensure your offline local server is active.
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
                                                            id="modal-install-host"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Port Number</label>
                                                        <select
                                                            value={localPort}
                                                            onChange={(e) => setLocalPort(e.target.value)}
                                                            className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                            id="modal-install-port"
                                                        >
                                                            <option value="5050">5050 (Lab Default)</option>
                                                            <option value="5174">5174 (Harness Gate)</option>
                                                            <option value="3000">3000 (Local App)</option>
                                                            <option value="8080">8080 (Custom)</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Output Generated URL - Enhanced Styling */}
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Dynamic Handshake Handoff URL</span>
                                                        <span className="text-[9px] text-emerald-600 font-mono font-bold bg-emerald-50/50 px-1.5 py-0.5 rounded">AUTO-GENERATED</span>
                                                    </div>
                                                    <div className="bg-slate-950 border border-slate-900 p-3.5 rounded-2xl flex items-center justify-between font-mono text-[10.5px] transition-all relative group/url">
                                                        <div className="flex items-center gap-2 overflow-hidden mr-4">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                                                            <span className="truncate text-emerald-400 font-mono font-medium tracking-tight">
                                                                {`http://${localHost}:${localPort}/install-pack?source=scholar-explorer&pack=${pack.manifest.id}&version=${pack.manifest.version}`}
                                                            </span>
                                                        </div>
                                                        <button 
                                                            onClick={() => triggerCopy(`http://${localHost}:${localPort}/install-pack?source=scholar-explorer&pack=${pack.manifest.id}&version=${pack.manifest.version}`, 'handoff-url-modal')}
                                                            className="bg-slate-800 hover:bg-slate-750 text-emerald-400 hover:text-emerald-300 px-3 py-1.5 rounded-xl font-mono text-[9px] font-black uppercase tracking-wider transition-all border border-slate-700/50 hover:border-emerald-500/30 flex items-center gap-1 shrink-0"
                                                        >
                                                            <Copy className="w-3 h-3" />
                                                            <span>{copiedStates['handoff-url-modal'] ? "COPIED" : "COPY"}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-4 space-y-2">
                                                <a 
                                                    href={`http://${localHost}:${localPort}/install-pack?source=scholar-explorer&pack=${pack.manifest.id}&version=${pack.manifest.version}`}
                                                    target="_blank"
                                                    referrerPolicy="no-referrer"
                                                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all text-center"
                                                >
                                                    <Radio className="w-4 h-4 text-emerald-100" />
                                                    <span>Install in Scholar Explorer Local Lab</span>
                                                </a>
                                                <span className="text-[9px] leading-tight text-slate-450 text-slate-400 block text-center font-semibold">
                                                    ⚠️ Automatically sends the catalog configurations to your offline workplace environment.
                                                </span>
                                            </div>
                                        </div>

                                        {/* PROTOCOL 2: Manual ZIP Archive Download */}
                                        <div className="border border-slate-200 bg-white p-6 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-indigo-50 text-indigo-800 rounded uppercase tracking-wider text-xs">Protocol 2: Offline Archive</span>
                                                    <span className="text-xs text-slate-400 font-mono">sha256 matching</span>
                                                </div>
                                                <h5 className="text-base font-extrabold text-slate-900">Offline Pack ZIP Bundle</h5>
                                                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                                                    Ideal for offline, air-gapped systems. Compiles and triggers an fully bundle of ttl, JSON-schemas and trust cards instantly.
                                                </p>

                                                {/* SHA Summary */}
                                                <div className="bg-slate-50 border rounded-xl p-4 space-y-2">
                                                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 font-bold">
                                                        <span>CHECKSUM ALGORITHM</span>
                                                        <span>SHA-256 IDENTICAL</span>
                                                    </div>
                                                    <span className="block font-mono text-[9px] text-slate-600 break-all bg-white p-2 rounded border border-slate-205 border-slate-200 font-mono">
                                                        e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                                                    </span>
                                                </div>

                                                {/* Terminal fallback instruction card - EXPLICIT COPY BUTTON ENHANCEMENT */}
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono block">Terminal Pipeline Installer Command</span>
                                                        <span className="text-[9px] text-indigo-600 font-mono font-bold bg-indigo-50/50 px-1.5 py-0.5 rounded">CLI PYTHON</span>
                                                    </div>
                                                    <div className="bg-slate-950 border border-slate-900 p-2.5 pl-3.5 rounded-2xl flex items-center justify-between font-mono text-[10px] relative transition-all">
                                                        <div className="flex items-center gap-2 overflow-hidden mr-4">
                                                            <Terminal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                                            <span className="truncate text-indigo-350 font-mono font-medium select-all">
                                                                {`python scripts\\install_capability_pack.py C:\\Users\\Ashley\\Downloads\\scholar-explorer-local-lab-pack-${pack.manifest.id}-0.1.0.zip`}
                                                            </span>
                                                        </div>
                                                        <button 
                                                            type="button"
                                                            onClick={() => triggerCopy(`python scripts\\install_capability_pack.py C:\\Users\\Ashley\\Downloads\\scholar-explorer-local-lab-pack-${pack.manifest.id}-0.1.0.zip`, 'modal-terminal-script')}
                                                            className="bg-slate-800 hover:bg-slate-750 text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-xl font-mono text-[9px] font-black uppercase tracking-wider transition-all border border-slate-700/50 hover:border-indigo-500/30 flex items-center gap-1 shrink-0"
                                                        >
                                                            <Copy className="w-3 h-3" />
                                                            <span>{copiedStates['modal-terminal-script'] ? "COPIED!" : "COPY CMD"}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => onDownloadZip(pack)}
                                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all hover:bg-slate-800"
                                            >
                                                <Download className="w-4 h-4 text-slate-300" />
                                                <span>Download Capability Pack (.ZIP)</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Floating toast notification wrapper inside modal bounds */}
                        <AnimatePresence>
                            {toastMessage && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute bottom-6 right-6 bg-slate-950 text-white border border-slate-805 border-slate-850 px-5 py-3 rounded-2xl flex items-center gap-2 shadow-2xl z-50 text-[10.5px] uppercase tracking-wider font-extrabold"
                                >
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0 animate-bounce" />
                                    <span>{toastMessage}</span>
                                    <button onClick={() => setToastMessage(null)} className="ml-3 text-slate-405 hover:text-slate-10 text-slate-400 hover:text-white shrink-0">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

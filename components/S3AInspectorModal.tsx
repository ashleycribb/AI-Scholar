import React, { useState, useEffect } from 'react';
import { 
  X, 
  Database, 
  Download, 
  Play, 
  ShieldCheck, 
  ShieldAlert,
  Copy, 
  Check, 
  UserCheck, 
  Bot, 
  Layers, 
  HardDrive, 
  AlertCircle,
  FileCheck2,
  RefreshCw,
  Clock,
  Sparkles
} from 'lucide-react';
import { 
  getS3ASessionState, 
  downloadS3ASnapshotFile, 
  runS3ADemoMode,
  initializeS3ASession,
  getResearchLoggingConsent,
  setResearchLoggingConsent,
  type S3ASessionState 
} from '../services/s3aWasmService';

interface S3AInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: S3ASessionState;
}

export const S3AInspectorModal: React.FC<S3AInspectorModalProps> = ({ isOpen, onClose, state }) => {
  const [activeTab, setActiveTab] = useState<'provenance' | 'agents' | 'metadata'>('provenance');
  const [copiedUuid, setCopiedUuid] = useState(false);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [demoStatus, setDemoStatus] = useState<string | null>(null);
  const [consented, setConsented] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      getResearchLoggingConsent().then(setConsented);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(state.sessionUuidHex);
    setCopiedUuid(true);
    setTimeout(() => setCopiedUuid(false), 2000);
  };

  const handleRunDemo = async () => {
    setIsDemoRunning(true);
    setDemoStatus('Initializing Demo Sequence: 1 Human Approval + 1 AI Claim Check...');
    try {
      const res = await runS3ADemoMode((msg) => setDemoStatus(msg));
      setDemoStatus(`Sequence Complete! Downloaded ${res.fileName}`);
    } catch (err: any) {
      setDemoStatus(`Demo failed: ${err.message}`);
    } finally {
      setIsDemoRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-emerald-400 shadow-xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">My Research Log</h3>
                {state.isOfflineCopy ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-wide font-mono">
                    offline copy
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    S3A Log
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Session UUID: {state.sessionUuidHex || 'Uninitialized'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              title="Copy session UUID"
            >
              {copiedUuid ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-4 gap-4 px-6 py-3 bg-slate-900 text-white text-xs border-b border-slate-800">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-mono tracking-wider">Human Steps</span>
            <span className="font-bold text-sm text-blue-300 font-mono">{state.humanStepsCount} Recorded</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-mono tracking-wider">AI Steps</span>
            <span className="font-bold text-sm text-purple-300 font-mono">{state.aiStepsCount} Recorded</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-mono tracking-wider">Indexed Papers</span>
            <span className="font-bold text-sm text-emerald-300 font-mono">{state.papersCount} OpenAlex</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-mono tracking-wider">Snapshot Size</span>
            <span className="font-bold text-sm text-amber-300 font-mono">{(state.bytesLength / 1024).toFixed(1)} KB</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center px-6 border-b border-slate-200 bg-white">
          <button
            onClick={() => setActiveTab('provenance')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'provenance'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Session Provenance Log ({state.humanSteps.length + state.aiSteps.length})
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'agents'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            S3A Agent Permissions &amp; Gates
          </button>
          <button
            onClick={() => setActiveTab('metadata')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'metadata'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Persistence &amp; IndexedDB Status
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'provenance' && (
            <div className="space-y-3">
              {!consented ? (
                <div className="text-center py-12 px-6 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-2xs">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Logging is off. Turn it on to see your activity here.
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    Consent is optional and never gates features. Without consent, search, AI agents, saving papers, notes, and downloading your data (.s3a) all work normally. When logging is off, no activity statements are recorded.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await setResearchLoggingConsent(true);
                        setConsented(true);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                    >
                      Turn on Logging
                    </button>
                  </div>
                </div>
              ) : state.humanSteps.length === 0 && state.aiSteps.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600">No actions logged in current session yet</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                    Human actions (view paper, approve/reject claim, note, request review) and AI steps are recorded in the immutable S3A WASM snapshot.
                  </p>
                  <button
                    onClick={handleRunDemo}
                    className="mt-4 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs"
                  >
                    Run Demo Sequence Now
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Interleaved Provenance Steps</h4>
                  {state.humanSteps.map((h, i) => (
                    <div key={`h-${i}`} className="p-3 bg-blue-50/60 rounded-xl border border-blue-200/80 text-xs flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">
                        H#{h.stepIndex}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-blue-900">{h.verbName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{new Date(h.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-slate-600 truncate mt-0.5">{h.objectDesc}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 font-mono">
                          <span>Actor: {h.actor}</span>
                          {h.aiTraceIndex !== null && (
                            <span className="text-purple-600 font-semibold">Linked to AI Step #{h.aiTraceIndex}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {state.aiSteps.map((a, i) => (
                    <div key={`a-${i}`} className="p-3 bg-purple-50/60 rounded-xl border border-purple-200/80 text-xs flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">
                        AI#{a.stepIndex}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-purple-900">Agent: [{a.agentSlug}]</span>
                          <span className="text-[10px] text-slate-400 font-mono">{new Date(a.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-mono">
                            Confidence: {(a.confidence * 100).toFixed(0)}%
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                            a.preflightResult === 'ok' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            Preflight: {a.preflightResult}
                          </span>
                          {a.requiresGate && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-mono">
                              Gate Approved: {a.isGateApproved ? 'YES' : 'PENDING'}
                            </span>
                          )}
                        </div>
                        {a.humanIndex !== null && (
                          <p className="text-[10px] text-blue-600 font-mono mt-1 font-semibold">
                            Linked to Human Step #{a.humanIndex}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Registered S3A Autonomous Agents</h4>
              
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">claim-checker</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    Human Gate Required
                  </span>
                </div>
                <p className="text-slate-500 text-[11px]">Authorized tools: TOOL_READ_FILE, TOOL_EXTRACT_CLAIMS, TOOL_TA_SUPERVISOR_CALL</p>
                <p className="text-slate-400 text-[10px] font-mono">Guarded by assert_agent_allows &amp; requires_human_gate</p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">lab-assistant</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Direct Autonomous Clearance
                  </span>
                </div>
                <p className="text-slate-500 text-[11px]">Authorized tools: TOOL_READ_FILE, TOOL_OPENALEX_QUERY, TOOL_CROSSREF_QUERY, TOOL_TA_SUPERVISOR_CALL</p>
                <p className="text-slate-400 text-[10px] font-mono">Guarded by assert_agent_allows</p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">source-verifier</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Direct Autonomous Clearance
                  </span>
                </div>
                <p className="text-slate-500 text-[11px]">Authorized tools: TOOL_OPENALEX_QUERY, TOOL_CROSSREF_QUERY</p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">methodology-auditor</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    Human Gate Required
                  </span>
                </div>
                <p className="text-slate-500 text-[11px]">Authorized tools: TOOL_READ_FILE, TOOL_SYNTHESIZE_EVIDENCE, TOOL_TA_SUPERVISOR_CALL</p>
              </div>
            </div>
          )}

          {activeTab === 'metadata' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>S3A IndexedDB Persistence Active</span>
                </div>
                <p className="text-emerald-700 text-[11px] leading-relaxed">
                  Every human action and AI inference step automatically triggers an export of the snapshot byte buffer (`export_bytes()`), which is persisted directly into the browser's local IndexedDB (`scholar_explorer_s3a`). On page reload, the snapshot is fully restored via `WasmAgentSnapshot.from_bytes(bytes)`.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 block">OpenAlex Policy &amp; Non-Storage Guarantee</span>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Only OpenAlex work IDs, DOIs, publication years, and citation metrics are committed to the snapshot via `add_paper`. PDFs and raw copyright text are never held inside the WASM snapshot or database; researchers link directly to open-access repository URLs.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/70">
          <div className="text-xs text-slate-500 font-mono">
            {demoStatus ? (
              <span className="text-emerald-700 font-semibold">{demoStatus}</span>
            ) : (
              <span>Ready for doctoral research auditing</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunDemo}
              disabled={isDemoRunning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isDemoRunning ? 'Running...' : 'Run Demo Sequence'}</span>
            </button>

            <button
              onClick={() => downloadS3ASnapshotFile()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export backup (.s3a)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

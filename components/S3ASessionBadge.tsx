import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Database, 
  Download, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  Layers, 
  ExternalLink,
  Lock,
  Cpu,
  UserCheck,
  Bot
} from 'lucide-react';
import { 
  getS3ASessionState, 
  subscribeS3AState, 
  downloadS3ASnapshotFile, 
  runS3ADemoMode,
  initializeS3ASession,
  type S3ASessionState
} from '../services/s3aWasmService';

interface S3ASessionBadgeProps {
  onOpenInspector?: () => void;
}

export const S3ASessionBadge: React.FC<S3ASessionBadgeProps> = ({ onOpenInspector }) => {
  const [state, setState] = useState<S3ASessionState>(getS3ASessionState());
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);
  const [copiedUuid, setCopiedUuid] = useState(false);

  useEffect(() => {
    // Ensure WASM session is initialized on mount
    initializeS3ASession().catch(e => console.error('S3A WASM Session Init Error:', e));
    const unsubscribe = subscribeS3AState(setState);
    return () => unsubscribe();
  }, []);

  const handleCopyUuid = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state.sessionUuidHex) {
      navigator.clipboard.writeText(state.sessionUuidHex);
      setCopiedUuid(true);
      setTimeout(() => setCopiedUuid(false), 2000);
    }
  };

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await downloadS3ASnapshotFile();
    } catch (err: any) {
      alert(`S3A Export backup failed: ${err.message}`);
    }
  };

  const handleRunDemo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDemoRunning) return;
    setIsDemoRunning(true);
    setDemoMessage('Starting S3A verification demo...');
    try {
      const result = await runS3ADemoMode((msg) => setDemoMessage(msg));
      setDemoMessage(`Demo success! Exported backup: ${result.fileName}`);
      setTimeout(() => setDemoMessage(null), 4000);
    } catch (err: any) {
      setDemoMessage(`Demo error: ${err.message}`);
      setTimeout(() => setDemoMessage(null), 5000);
    } finally {
      setIsDemoRunning(false);
    }
  };

  const shortUuid = state.sessionUuidHex 
    ? `${state.sessionUuidHex.slice(0, 8)}...${state.sessionUuidHex.slice(-6)}` 
    : 'Initializing...';

  return (
    <div className="flex items-center gap-2">
      {/* Small Session Badge Container */}
      <div 
        onClick={onOpenInspector}
        className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 text-white rounded-xl border border-slate-700/60 shadow-xs hover:bg-slate-800 transition-all cursor-pointer group select-none"
        title={`S3A WASM Session: ${state.sessionUuidHex}\nClick to inspect session provenance ledger`}
      >
        {/* Core Live Indicator */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 font-mono">S3A</span>
        </div>

        {/* Offline Copy Label if loaded from cache while server offline */}
        {state.isOfflineCopy && (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
            offline copy
          </span>
        )}

        <div className="h-3 w-px bg-slate-700 mx-0.5" />

        {/* UUID Hex Display */}
        <div className="flex items-center gap-1 font-mono text-[11px] text-slate-300">
          <span className="text-slate-400">#</span>
          <span>{shortUuid}</span>
          <button
            onClick={handleCopyUuid}
            className="p-0.5 hover:text-white transition-colors"
            title="Copy 32-char hex UUID"
          >
            {copiedUuid ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500 hover:text-slate-300" />}
          </button>
        </div>

        {/* Step Counters */}
        <div className="hidden xl:flex items-center gap-1.5 text-[10px] font-mono text-slate-400 border-l border-slate-700/80 pl-2">
          <span className="text-blue-300 font-semibold" title="Human actions logged via record_human">H:{state.humanStepsCount}</span>
          <span className="text-slate-600">/</span>
          <span className="text-purple-300 font-semibold" title="AI agent steps logged via record_ai">AI:{state.aiStepsCount}</span>
        </div>
      </div>

      {/* Export Backup Action Button */}
      <button
        onClick={handleExport}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all"
        title="Download <session_uuid>.backup.s3a immutable byte stream"
      >
        <Download className="w-3.5 h-3.5 text-slate-600" />
        <span className="hidden sm:inline">Export backup</span>
      </button>

      {/* Demo Mode Button */}
      <button
        onClick={handleRunDemo}
        disabled={isDemoRunning}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs ${
          isDemoRunning 
            ? 'bg-amber-100 text-amber-900 border border-amber-300 cursor-wait' 
            : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700'
        }`}
        title="Run 1 Human Approval + 1 AI Claim Check + Export Backup"
      >
        <Play className={`w-3 h-3 ${isDemoRunning ? 'animate-spin' : 'fill-current'}`} />
        <span className="hidden md:inline">{isDemoRunning ? 'Running Demo...' : 'Demo Mode'}</span>
      </button>

      {/* Floating Demo Feedback Toast if active */}
      {demoMessage && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md bg-slate-900 text-white text-xs px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
          <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="flex-1 font-mono text-[11px] leading-relaxed">{demoMessage}</p>
        </div>
      )}
    </div>
  );
};

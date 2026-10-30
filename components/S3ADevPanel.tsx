import React, { useState, useEffect } from 'react';
import { Database, Download, RefreshCw, ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, Activity } from 'lucide-react';
import { 
  getDevPanelState, 
  subscribeDevPanel, 
  flushBuffer, 
  downloadS3ADataFile,
  type S3ADevPanelState 
} from '../services/s3aWasmService';

export const S3ADevPanel: React.FC = () => {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [state, setState] = useState<S3ADevPanelState | null>(null);
  const [flushing, setFlushing] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);

  useEffect(() => {
    // Only show if URL has ?debug=1 or localStorage has s3a_debug === '1'
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const isDebug = params.get('debug') === '1' || localStorage.getItem('s3a_debug') === '1';
      setIsVisible(isDebug);
    }

    const unsub = subscribeDevPanel((newState) => {
      setState(newState);
    });

    return () => unsub();
  }, []);

  if (!isVisible || !state) return null;

  const handleFlush = async () => {
    setFlushing(true);
    try {
      await flushBuffer();
    } finally {
      setFlushing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadS3ADataFile();
    } finally {
      setExporting(false);
    }
  };

  const formatTime = (iso?: string | null) => {
    if (!iso) return 'Never';
    try {
      return new Date(iso).toLocaleTimeString();
    } catch {
      return iso;
    }
  };

  return (
    <aside aria-label="S3A Dev Panel" className="fixed bottom-4 right-4 z-50 max-w-md w-full bg-slate-900 text-slate-100 rounded-2xl shadow-2xl border border-slate-700/80 overflow-hidden font-sans text-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Dev Panel Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono font-bold">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-white flex items-center gap-1.5">
              S3A Dev Panel
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                ?debug=1
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
            title={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
          >
            {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3.5 space-y-3 max-h-[85vh] overflow-y-auto">
          {/* Snapshot Engine Error Banner */}
          {state.lastError && (
            <div className="p-2.5 rounded-xl bg-rose-950/90 border border-rose-800 text-rose-200 text-xs space-y-1 animate-in fade-in">
              <div className="flex items-center gap-1.5 font-bold text-rose-300">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>WASM Snapshot Engine Alert</span>
              </div>
              <div className="font-mono text-[10px] break-all text-rose-300/90 bg-rose-900/40 p-1.5 rounded">
                {state.lastError}
              </div>
              {state.isPoisoned && (
                <div className="text-[10px] text-amber-300 font-medium">
                  Snapshot was treated as poisoned and rebuilt from IndexedDB cache.
                </div>
              )}
            </div>
          )}

          {/* Key Metrics: Persisted Statements, Queue Count, Snapshot Size, Unmapped Verbs, Last Flush */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Persisted Statements</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-bold font-mono text-emerald-400">
                  {state.totalStatementsCount}
                </span>
                <span className="text-[10px] text-slate-400 font-normal">persisted in IDB</span>
              </div>
              {state.isRestoredFromBytes && (
                <span className="text-[9px] text-indigo-300 font-mono block mt-0.5">
                  ✓ Restored via from_bytes()
                </span>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Snapshot Size</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-bold font-mono text-emerald-400">
                  {state.snapshotBytesLength ?? 0}
                </span>
                <span className="text-[10px] text-slate-400 font-normal">bytes</span>
              </div>
              {state.isPoisoned ? (
                <span className="text-[9px] text-amber-300 font-mono block mt-0.5">
                  ⚠ Poison recovery active
                </span>
              ) : (
                <span className="text-[9px] text-slate-400 font-mono block mt-0.5">
                  Healthy state
                </span>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Queue Buffer</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-bold font-mono text-cyan-400">
                  {state.queueCount}
                </span>
                <span className="text-[10px] text-slate-400 font-normal">pending flush</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Unmapped Verbs</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className={`text-base font-bold font-mono ${state.unmappedVerbsCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {state.unmappedVerbsCount}
                </span>
                <span className="text-[10px] text-slate-400 font-normal">unmapped</span>
              </div>
              <span className="text-[9px] text-emerald-400/90 block mt-0.5">All verbs native in WASM</span>
            </div>

            <div className="col-span-2 p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Last Flush</span>
              <span className="text-xs font-mono text-slate-200 block truncate mt-1" title={state.lastFlushTime || 'Never'}>
                {formatTime(state.lastFlushTime)}
              </span>
            </div>
          </div>

          {/* Dual UUIDv7 Session IDs */}
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1 font-mono text-[10px]">
            <div className="flex items-center justify-between text-slate-400">
              <span>Actor (Student):</span>
              <span className="text-slate-300 truncate max-w-[200px]" title={state.session.actor_uuid}>
                {state.session.actor_uuid.slice(0, 18)}...
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Agent (AI Instance):</span>
              <span className="text-indigo-300 truncate max-w-[200px]" title={state.session.agent_uuid}>
                {state.session.agent_uuid.slice(0, 18)}...
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Session ID:</span>
              <span className="text-emerald-300 truncate max-w-[200px]" title={state.session.session_id}>
                {state.session.session_id.slice(0, 18)}...
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400 pt-0.5 border-t border-slate-800/80">
              <span>Consent State:</span>
              <span className={state.consented ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                {state.consented ? 'Consented (Full research telemetry)' : 'Declined (Consent-declined marker only)'}
              </span>
            </div>
          </div>

          {/* Verb Resolution Log (verb_id_for_iri logging) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
              <span>Verb Resolution Log (verb_id_for_iri):</span>
              <span className="text-[10px] text-slate-500 font-mono">
                {state.verbResolutionLog?.length || 0} calls logged
              </span>
            </div>

            {(!state.verbResolutionLog || state.verbResolutionLog.length === 0) ? (
              <div className="p-2 rounded-lg bg-slate-950/40 text-[10px] text-slate-500 italic text-center border border-slate-800">
                No verb resolutions logged yet. Emit statements to populate.
              </div>
            ) : (
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {state.verbResolutionLog.map((log, idx) => (
                  <div
                    key={idx}
                    className="p-1.5 rounded-lg bg-slate-800/50 border border-slate-700/40 text-[10px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-white">{log.verb}</span>
                        <span className={`px-1 py-0.2 rounded font-mono text-[9px] ${
                          log.wasMapped
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}>
                          {log.wasMapped ? `Native (ID ${log.verbId})` : 'undefined → Fallback'}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono">
                        {formatTime(log.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                      <span>WASM: ID {log.verbId} ({log.wasmVerbName})</span>
                      {!log.wasMapped && (
                        <span className="text-amber-300">extras.original_verb = "{log.originalVerb}"</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Last 5 Statements */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
              <span>Last Recorded Statements:</span>
              <span className="text-[10px] text-slate-500 font-mono">
                {state.last5Statements.length} displayed
              </span>
            </div>

            {state.last5Statements.length === 0 ? (
              <div className="p-2 rounded-lg bg-slate-950/40 text-[11px] text-slate-500 italic text-center border border-slate-800">
                No statements recorded in this session yet.
              </div>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {state.last5Statements.map((stmt) => (
                  <div 
                    key={stmt.id} 
                    className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-[10px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`px-1 py-0.2 rounded font-bold uppercase text-[9px] ${
                          stmt.actorType === 'agent' 
                            ? 'bg-purple-900/60 text-purple-300 border border-purple-700/60' 
                            : 'bg-blue-900/60 text-blue-300 border border-blue-700/60'
                        }`}>
                          {stmt.actorType}
                        </span>
                        <span className="font-semibold text-emerald-400 font-mono">{stmt.verb.display}</span>
                        {stmt.extras?.original_verb && stmt.extras.original_verb !== stmt.verb.display && (
                          <span className="text-[9px] text-amber-300 font-mono">
                            ({stmt.extras.original_verb})
                          </span>
                        )}
                        <span className="text-slate-300 truncate max-w-[140px]" title={stmt.object.name}>
                          {stmt.object.name}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono shrink-0">
                        {formatTime(stmt.timestamp)}
                      </span>
                    </div>

                    {/* Show ai_trace_index linkage if present */}
                    {typeof stmt.extras?.ai_trace_index === 'number' && (
                      <div className="text-[9px] text-indigo-300 font-mono flex items-center gap-1">
                        <span>↳ Linked to AI trace step:</span>
                        <span className="px-1 py-0.2 rounded bg-indigo-950 text-indigo-200 border border-indigo-800">
                          #{stmt.extras.ai_trace_index}
                        </span>
                        {stmt.extras.decision && (
                          <span className="text-slate-400">({stmt.extras.decision})</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons: Flush & Download my data (.s3a) */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
            <button
              onClick={handleFlush}
              disabled={flushing || state.queueCount === 0}
              className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition-colors disabled:opacity-40"
              title="Flush buffer to S3A WASM snapshot writer immediately"
            >
              <RefreshCw className={`w-3 h-3 ${flushing ? 'animate-spin' : ''}`} />
              <span>Flush Buffer</span>
            </button>

            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-40"
              title="Export S3A WASM binary snapshot"
            >
              <Download className="w-3 h-3" />
              <span>Download my data (.s3a)</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

import React, { useEffect, useState } from 'react';
import { 
  fetchLrsStatus, 
  fetchUserSqlLrsStatements, 
  fetchAgentDuckDbStatements, 
  LrsSystemStatus, 
  xAPIStatement 
} from '../services/lrsService';
import { Database, Server, Cpu, ExternalLink, RefreshCw, X, ShieldCheck, Tag, Lock, UserCheck } from 'lucide-react';
import type { User } from '../types';

interface LrsTelemetryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSessionUuid?: string;
  user: User | null;
}

export const LrsTelemetryModal: React.FC<LrsTelemetryModalProps> = ({
  isOpen,
  onClose,
  activeSessionUuid,
  user
}) => {
  const [status, setStatus] = useState<LrsSystemStatus | null>(null);
  const [sqlStatements, setSqlStatements] = useState<xAPIStatement[]>([]);
  const [duckDbStatements, setDuckDbStatements] = useState<xAPIStatement[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'user-sql' | 'agent-duckdb'>('overview');
  const [filterUuid, setFilterUuid] = useState<string>(activeSessionUuid || '');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const isResearcher = user?.role === 'pi_researcher' || user?.role === 'committee_member' || (user?.role as string) === 'researcher';

  const loadData = async () => {
    setIsLoading(true);
    try {
      const s = await fetchLrsStatus();
      setStatus(s);

      const userRole = isResearcher ? 'researcher' : 'participant';
      const userName = user?.displayName || user?.name || 'Scholar Explorer User';

      const userStmts = await fetchUserSqlLrsStatements(userRole, userName);
      setSqlStatements(userStmts);

      const targetUuid = isResearcher ? (filterUuid || undefined) : (filterUuid || activeSessionUuid || undefined);
      const agentStmts = await fetchAgentDuckDbStatements(targetUuid, userRole, userName);
      setDuckDbStatements(agentStmts);
    } catch (e) {
      console.error('Failed to load LRS telemetry data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (activeSessionUuid) setFilterUuid(activeSessionUuid);
      loadData();
    }
  }, [isOpen, activeSessionUuid, user]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isResearcher 
                ? 'bg-indigo-600/30 text-indigo-400 border-indigo-500/30'
                : 'bg-emerald-600/30 text-emerald-400 border-emerald-500/30'
            }`}>
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black tracking-tight">xAPI LRS & Traceability Engine</h2>
                {isResearcher ? (
                  <span className="px-2.5 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] font-extrabold uppercase rounded border border-indigo-500/30 flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-indigo-400" />
                    Researcher Admin View
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold uppercase rounded border border-emerald-500/30 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-400" />
                    Privacy Shield Active (My Logs Only)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                {isResearcher 
                  ? 'Full backend LRS telemetry across all study participants & AI agents' 
                  : 'Backend LRS isolation enabled. Viewing your own personal xAPI activity & AI agent traces'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              title="Refresh LRS Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Access Role Notice Banner */}
        {!isResearcher && (
          <div className="bg-emerald-50 border-b border-emerald-200/80 px-6 py-2.5 flex items-center justify-between text-xs text-emerald-900 font-medium">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span><strong>Participant Privacy Shield Active:</strong> Backend xAPI LRS logs are strictly isolated. You can inspect your own session activity and AI agent execution logs. System-wide participant telemetry is accessible only to researchers.</span>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 pt-3 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2.5 text-xs font-extrabold rounded-t-xl transition-all flex items-center gap-2 border-t border-x ${
                activeTab === 'overview'
                  ? 'bg-white border-slate-200 text-indigo-600 shadow-sm'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Server className="w-4 h-4" />
              <span>Backend LRS Architecture</span>
            </button>
            <button
              onClick={() => setActiveTab('user-sql')}
              className={`px-4 py-2.5 text-xs font-extrabold rounded-t-xl transition-all flex items-center gap-2 border-t border-x ${
                activeTab === 'user-sql'
                  ? 'bg-white border-slate-200 text-indigo-600 shadow-sm'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>{isResearcher ? 'Yet SQL LRS (All User Statements)' : 'My xAPI Statements'} ({sqlStatements.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('agent-duckdb')}
              className={`px-4 py-2.5 text-xs font-extrabold rounded-t-xl transition-all flex items-center gap-2 border-t border-x ${
                activeTab === 'agent-duckdb'
                  ? 'bg-white border-slate-200 text-indigo-600 shadow-sm'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Cpu className="w-4 h-4 text-indigo-600" />
              <span>{isResearcher ? 'DuckDB Vertical LRS (All Agent Traces)' : 'My AI Agent Traces'} ({duckDbStatements.length})</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Yet SQL LRS */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                      Human User LRS
                    </span>
                    <a
                      href={status?.yetSqlLrs.githubRepo || 'https://github.com/yetanalytics/lrsql'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-bold"
                    >
                      <span>GitHub</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">Yet SQL LRS</h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">yetanalytics/lrsql</p>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    Backend LRS engine recording user platform interactions (searches, exports, filters, session events).
                  </p>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">{isResearcher ? 'Total System Statements:' : 'My Session Statements:'}</span>
                    <span className="font-black text-slate-900 font-mono">{isResearcher ? (status?.yetSqlLrs.totalStatements ?? 0) : sqlStatements.length}</span>
                  </div>
                </div>

                {/* learnmcp-xapi */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                      Protocol Bridge
                    </span>
                    <a
                      href={status?.learnMcpXapi.githubRepo || 'https://github.com/DavidLMS/learnmcp-xapi'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-bold"
                    >
                      <span>GitHub</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">learnmcp-xapi</h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">DavidLMS/learnmcp-xapi</p>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    Integrates xAPI Research Traceability Profile verbs and statements directly into Model Context Protocol tools.
                  </p>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">MCP Tools Active:</span>
                    <span className="font-black text-slate-900 font-mono">{status?.learnMcpXapi.mcpToolsRegistered ?? 3}</span>
                  </div>
                </div>

                {/* DuckDB Vertical LRS */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-purple-100 text-purple-800 rounded">
                      AI Agent LRS
                    </span>
                    <a
                      href={status?.duckDbVerticalLrs.githubRepo || 'https://github.com/duckdb/duckdb'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-bold"
                    >
                      <span>GitHub</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">DuckDB Vertical LRS</h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">duckdb/duckdb</p>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    Columnar vertical LRS storing high-throughput execution traces for AI Source Scout & Deep Research Assistant by UUID.
                  </p>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">{isResearcher ? 'Active System Sessions:' : 'My Active Traces:'}</span>
                    <span className="font-black text-slate-900 font-mono">{isResearcher ? (status?.duckDbVerticalLrs.activeSessionsCount ?? 0) : duckDbStatements.length}</span>
                  </div>
                </div>

              </div>

              {/* Architecture Map Card */}
              <div className="bg-slate-900 text-white p-6 rounded-2xl space-y-4">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-indigo-400" />
                  <h4 className="font-extrabold text-sm uppercase tracking-wider text-indigo-300">Backend LRS Architecture & Security Boundaries</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-2">
                    <div className="font-bold text-emerald-400 uppercase tracking-widest text-[10px]">Human User Routing (Yet SQL LRS):</div>
                    <p className="text-slate-300">Target LRS: <span className="text-white font-bold">Yet SQL LRS</span></p>
                    <p className="text-slate-400 text-[11px]">Backend API: /api/lrs/sql-lrs/statements</p>
                    <p className="text-slate-400 text-[11px]">Access Policy: {isResearcher ? 'Researcher Unrestricted' : 'User Privacy Isolated'}</p>
                  </div>
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-2">
                    <div className="font-bold text-indigo-400 uppercase tracking-widest text-[10px]">AI Agent Routing (DuckDB Vertical LRS):</div>
                    <p className="text-slate-300">Target LRS: <span className="text-white font-bold">DuckDB Vertical LRS</span></p>
                    <p className="text-slate-400 text-[11px]">Backend API: /api/lrs/duckdb-lrs/statements</p>
                    <p className="text-slate-400 text-[11px]">Session Lock: {isResearcher ? 'Global Multi-Session' : 'User Active Session Lock'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USER SQL LRS */}
          {activeTab === 'user-sql' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {isResearcher ? `Yet SQL LRS Statements (${sqlStatements.length})` : `My xAPI Activity Statements (${sqlStatements.length})`}
                  </h3>
                  {!isResearcher && (
                    <p className="text-xs text-slate-500 mt-0.5">Showing statements registered under your user name: <strong className="text-slate-700">{user?.name || 'Scholar Explorer User'}</strong></p>
                  )}
                </div>
                <span className="text-xs text-slate-500 font-mono">https://github.com/yetanalytics/lrsql</span>
              </div>
              {sqlStatements.length === 0 ? (
                <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center text-slate-500 text-sm space-y-1">
                  <p className="font-bold text-slate-700">No statements recorded in Yet SQL LRS yet for your account.</p>
                  <p className="text-xs text-slate-400">Perform a search, filter papers, or run an export to emit xAPI activity statements.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[450px] overflow-y-auto">
                  {sqlStatements.map((stmt) => (
                    <div key={stmt.id} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-xs space-y-1.5 font-mono">
                      <div className="flex items-center justify-between text-slate-500">
                        <span className="font-bold text-slate-800">{stmt.actor.name}</span>
                        <span className="text-[10px]">{new Date(stmt.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">
                          {stmt.verb.display['en-US'] || stmt.verb.id}
                        </span>
                        <span className="text-slate-700 truncate">{stmt.object.definition?.name?.['en-US'] || stmt.object.id}</span>
                      </div>
                      {stmt.context?.extensions && (
                        <pre className="text-[10px] bg-slate-50 p-2 rounded text-slate-600 overflow-x-auto">
                          {JSON.stringify(stmt.context.extensions, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AGENT DUCKDB LRS */}
          {activeTab === 'agent-duckdb' && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {isResearcher ? `DuckDB Vertical LRS Agent Traces (${duckDbStatements.length})` : `My AI Agent Traces (${duckDbStatements.length})`}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">https://github.com/duckdb/duckdb</p>
                </div>
                {isResearcher ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600">Filter Session UUID:</span>
                    <input
                      type="text"
                      value={filterUuid}
                      onChange={(e) => setFilterUuid(e.target.value)}
                      placeholder="Enter UUID or leave blank..."
                      className="px-3 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={loadData}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-all"
                    >
                      Apply
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-200/80 rounded-lg text-xs font-mono text-slate-700">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Session Filter Locked to Your Active Session ({filterUuid || 'active'})</span>
                  </div>
                )}
              </div>

              {duckDbStatements.length === 0 ? (
                <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center text-slate-500 text-sm space-y-1">
                  <p className="font-bold text-slate-700">No agent traces found for your session.</p>
                  <p className="text-xs text-slate-400">Run AI Source Scout or Deep Research Assistant to generate execution traces for your session.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[450px] overflow-y-auto">
                  {duckDbStatements.map((stmt) => (
                    <div key={stmt.id} className="bg-white border border-indigo-200/60 p-4 rounded-xl shadow-sm text-xs space-y-2 font-mono">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-indigo-700">{stmt.actor.name}</span>
                          {stmt.context?.sessionUuid && (
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-bold text-[10px]">
                              UUID: {stmt.context.sessionUuid}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">{new Date(stmt.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-800 font-extrabold rounded text-[10px]">
                          {stmt.verb.display['en-US'] || stmt.verb.id}
                        </span>
                        <span className="text-slate-800 font-medium truncate">{stmt.object.definition?.name?.['en-US'] || stmt.object.id}</span>
                      </div>
                      {stmt.result && (
                        <pre className="text-[10px] bg-slate-900 text-slate-200 p-2.5 rounded-lg overflow-x-auto">
                          {JSON.stringify(stmt.result, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-4">
            <span><strong>Yet SQL LRS:</strong> yetanalytics/lrsql</span>
            <span><strong>learnmcp-xapi:</strong> DavidLMS/learnmcp-xapi</span>
            <span><strong>DuckDB:</strong> duckdb/duckdb</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl transition-all"
          >
            Close Inspector
          </button>
        </div>

      </div>
    </div>
  );
};

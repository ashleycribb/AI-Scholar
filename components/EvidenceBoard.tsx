import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, ShieldAlert, Cpu, Database, ChevronRight, Activity } from 'lucide-react';
import { mcpService } from '../services/mcpService';

interface EvidenceBoardProps {
  doi: string;
  onRefresh?: () => void;
}

export const EvidenceBoard: React.FC<EvidenceBoardProps> = ({ doi, onRefresh }) => {
  const [auditData, setAuditData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchAudit = async () => {
    if (!doi || doi === 'unknown') return;
    setLoading(true);
    try {
      const data = await mcpService.getVaultAuditTrail(doi);
      setAuditData(data);
    } catch (e) {
      console.error("Failed to fetch audit", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, [doi]);

  if (!doi || doi === 'unknown') return null;

  const status = auditData?.verb?.display?.['en-US'] || 'unprocessed';
  const isVerified = status === 'verified';
  const isDisputed = status === 'disputed';
  const violations = auditData?.result?.extensions?.['https://scholar-explorer.com/violations'] || [];

  return (
    <div className="mt-8 border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Neuro-Symbolic Evidence Board</span>
        </div>
        <button 
          onClick={fetchAudit}
          disabled={loading}
          className="p-1 hover:bg-slate-200 rounded-md transition-colors"
        >
          <Activity className={`w-4 h-4 text-slate-400 ${loading ? 'animate-pulse' : ''}`} />
        </button>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${isVerified ? 'bg-green-50 text-green-600' : isDisputed ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
            {isVerified ? <ShieldCheck className="w-8 h-8" /> : isDisputed ? <ShieldAlert className="w-8 h-8" /> : <Database className="w-8 h-8" />}
          </div>
          
          <div className="flex-grow">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-bold text-slate-900">Logician Trust Score</h4>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                isVerified ? 'bg-green-100 text-green-700' : isDisputed ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {status}
              </span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              {isVerified ? 'The article methodology aligns with EdTech xAPI ontology. No prohibited terms detected.' : 
               isDisputed ? 'Structural discrapencies or prohibited terms detected by Logic Nanobot.' :
               'Awaiting local lab ingestion and verification.'}
            </p>
          </div>
        </div>

        {violations.length > 0 && (
          <div className="mt-4 space-y-2">
            {violations.map((v: string, idx: number) => (
              <div key={idx} className="flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50/50 px-3 py-2 rounded-lg border border-red-100">
                <ChevronRight className="w-3 h-3" />
                {v}
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Audit Trail</span>
            <span className="text-xs font-mono text-slate-600 truncate block">
              {auditData?.id ? `UUID: ${auditData.id.split('-')[0]}...` : 'N/A'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">LRS Storage</span>
            <span className="text-xs font-mono text-slate-600 block">
              DuckDB v0.10.x
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

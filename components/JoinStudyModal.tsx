import React, { useState, useEffect } from 'react';
import { ShieldCheck, X, ArrowRight, AlertCircle } from 'lucide-react';

interface JoinStudyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: (studyId: string) => void;
  initialStudyId?: string;
}

export const JoinStudyModal: React.FC<JoinStudyModalProps> = ({
  isOpen,
  onClose,
  onContinue,
  initialStudyId = ''
}) => {
  const [studyId, setStudyId] = useState<string>(initialStudyId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStudyId(initialStudyId || '');
      setError(null);
    }
  }, [isOpen, initialStudyId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = studyId.trim();
    if (!cleanId) {
      setError('Please enter a valid Study ID to proceed.');
      return;
    }
    setError(null);
    onContinue(cleanId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-emerald-400 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Join a Research Study</h3>
              <p className="text-xs text-slate-500">
                Enter your assigned Study ID
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed text-xs">
            Enter the Study ID provided by your Principal Investigator or study coordinator. You will be prompted to review the research activity tracing consent agreement next.
          </p>

          <div>
            <label className="block text-slate-700 font-semibold mb-1 text-xs">
              Study ID <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              required
              value={studyId}
              onChange={(e) => {
                setStudyId(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. STUDY-S3A-2026"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs font-mono font-medium focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
            />
            {error && (
              <p className="text-[11px] text-rose-600 font-medium mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 font-semibold rounded-xl hover:bg-slate-100 transition-colors text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!studyId.trim()}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2 text-xs"
            >
              <span>Continue to Consent</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

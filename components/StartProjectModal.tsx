import React, { useState } from 'react';
import { Sparkles, ArrowRight, X, Clock, CheckSquare, Square } from 'lucide-react';

interface StartProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToResearcher: (includePastSearches: boolean) => void;
  pastSearches: string[];
}

export const StartProjectModal: React.FC<StartProjectModalProps> = ({
  isOpen,
  onClose,
  onSwitchToResearcher,
  pastSearches
}) => {
  const [includePastSearches, setIncludePastSearches] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onSwitchToResearcher(includePastSearches);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-amber-400 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Start a Research Project</h3>
              <p className="text-xs text-slate-500">
                Switch to sovereign Researcher mode
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

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed text-sm">
            Transitioning to <strong>Researcher mode</strong> initializes a sovereign provenance session with cryptographic evidence claims, supervisory human gate clearance, and full S3A LRS statement history.
          </p>

          {/* Past Searches Option */}
          {pastSearches.length > 0 && (
            <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2">
              <label 
                onClick={() => setIncludePastSearches(!includePastSearches)}
                className="flex items-start gap-2.5 cursor-pointer select-none"
              >
                <div className="mt-0.5 text-slate-900">
                  {includePastSearches ? (
                    <CheckSquare className="w-4 h-4 text-slate-900" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div>
                  <span className="font-semibold text-slate-900 block text-xs">
                    Include my past searches
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Seed the new researcher project with your recent queries ({pastSearches.length} items).
                  </span>
                </div>
              </label>

              {includePastSearches && (
                <div className="mt-2 pl-6 pt-2 border-t border-slate-200/60 max-h-28 overflow-y-auto space-y-1 font-mono text-[11px] text-slate-600">
                  {pastSearches.slice(0, 5).map((q, idx) => (
                    <div key={idx} className="truncate flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{q}</span>
                    </div>
                  ))}
                  {pastSearches.length > 5 && (
                    <div className="text-[10px] text-slate-400 font-sans italic">
                      + {pastSearches.length - 5} more inquiries
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl text-amber-900 text-[11px] leading-relaxed">
            A new S3A session UUID will be created. Nothing is shared without your explicit action.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-900 font-semibold rounded-lg hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2"
          >
            <span>Launch Research Project</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

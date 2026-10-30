import React, { useState, useEffect } from 'react';
import { 
  X, 
  BookOpen, 
  Check, 
  ArrowRight, 
  Search, 
  History, 
  Layers, 
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { 
  getPastExplorerSearches, 
  saveUserMode 
} from '../services/lrsCredentialsService';
import { 
  initializeS3ASession, 
  logHumanAction, 
  S3A_VERBS 
} from '../services/s3aWasmService';

interface StartResearchProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (projectName: string, initialQueries: string[], studyId?: string | null) => void;
}

export const StartResearchProjectModal: React.FC<StartResearchProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectCreated
}) => {
  const [projectName, setProjectName] = useState<string>('Sovereign Literature Review');
  const [includePastSearches, setIncludePastSearches] = useState<boolean>(true);
  const [pastSearches, setPastSearches] = useState<string[]>([]);
  const [isPartOfStudy, setIsPartOfStudy] = useState<boolean>(false);
  const [studyId, setStudyId] = useState<string>('');
  const [studyIdError, setStudyIdError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      getPastExplorerSearches().then(searches => {
        setPastSearches(searches || []);
        if (!searches || searches.length === 0) {
          setIncludePastSearches(false);
        }
      });
      setProjectName('Sovereign Literature Review');
      setIsPartOfStudy(false);
      setStudyId('');
      setStudyIdError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPartOfStudy && !studyId.trim()) {
      setStudyIdError('Please enter a Study ID to associate with this study.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Switch user mode to Researcher
      await saveUserMode('researcher');

      // 2. Initialize a fresh S3A session
      await initializeS3ASession();

      // 3. Link past searches if user ticked "include my past searches"
      const queriesToInclude = includePastSearches ? pastSearches : [];
      if (includePastSearches && pastSearches.length > 0) {
        for (const query of pastSearches.slice(0, 10)) {
          await logHumanAction(
            S3A_VERBS.NOTE,
            'Human Researcher',
            `Imported Explorer Search: "${query}"`,
            null,
            `urn:scholarexplorer:query:${encodeURIComponent(query)}`
          );
        }
      }

      onProjectCreated(
        projectName.trim() || 'Sovereign Literature Review', 
        queriesToInclude,
        isPartOfStudy ? studyId.trim() : null
      );
      onClose();
    } catch (err) {
      console.error('[StartResearchProject] Error creating project:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-emerald-400 shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Start a Research Project</h3>
              <p className="text-xs text-slate-500">
                Transition to Researcher mode with a dedicated sovereign S3A session
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
        <form onSubmit={handleStart} className="p-6 space-y-5 text-xs">
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Project Name
            </label>
            <input
              type="text"
              required
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Deep Learning in Genomics"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
            />
          </div>

          {/* Research Study association toggle */}
          <div className="border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isPartOfStudy}
                onChange={(e) => {
                  setIsPartOfStudy(e.target.checked);
                  if (!e.target.checked) {
                    setStudyIdError(null);
                  }
                }}
                className="mt-0.5 w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900"
              />
              <div>
                <span className="font-semibold text-slate-900 block">
                  Mark as part of a research study
                </span>
                <span className="text-[11px] text-slate-500 block leading-relaxed">
                  Associate this project with an academic research study to review activity tracing consent. Plain projects never trace activity.
                </span>
              </div>
            </label>

            {isPartOfStudy && (
              <div className="pl-6 pt-1 space-y-1.5 animate-in fade-in duration-150">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Study ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required={isPartOfStudy}
                  value={studyId}
                  onChange={(e) => {
                    setStudyId(e.target.value);
                    if (studyIdError) setStudyIdError(null);
                  }}
                  placeholder="e.g. STUDY-S3A-2026"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs font-mono font-medium focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                />
                {studyIdError && (
                  <p className="text-[11px] text-rose-600 font-medium">
                    {studyIdError}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Sovereign Session Ledger</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Switches from Explorer mode to Researcher mode. Your research steps, paper saves, synthesis reports, and citations will be immutably recorded in a fresh session registration.
            </p>
          </div>

          {/* Past Explorer Searches toggle */}
          {pastSearches.length > 0 ? (
            <div className="border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePastSearches}
                  onChange={(e) => setIncludePastSearches(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900"
                />
                <div>
                  <span className="font-semibold text-slate-900 block">
                    Include my past searches ({pastSearches.length} available)
                  </span>
                  <span className="text-[11px] text-slate-500 block leading-relaxed">
                    Links your previous Explorer searches into this project's provenance history.
                  </span>
                </div>
              </label>

              {includePastSearches && (
                <div className="pl-6 pt-1 max-h-28 overflow-y-auto space-y-1">
                  {pastSearches.slice(0, 6).map((q, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <Search className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">"{q}"</span>
                    </div>
                  ))}
                  {pastSearches.length > 6 && (
                    <div className="text-[10px] text-slate-400 italic">
                      + {pastSearches.length - 6} more previous searches
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-500">
              No previous Explorer searches found. A clean sovereign session will be initialized.
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 font-semibold rounded-xl hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>{isSubmitting ? 'Starting Project...' : 'Start Research Project'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

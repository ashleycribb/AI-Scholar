import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Check, 
  ArrowLeft, 
  Clock, 
  HelpCircle, 
  FileText, 
  Bot, 
  UserCheck,
  AlertCircle
} from 'lucide-react';
import { 
  saveFirstRunConsentTime, 
  saveUserMode, 
  type UserRoleMode 
} from '../services/lrsCredentialsService';
import { 
  setConsent, 
  getConsentState, 
  getStudyId as getEngineStudyId 
} from '../services/s3aWasmService';

interface FirstRunConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onModeSelected?: (mode: UserRoleMode) => void;
  onConsentChange?: (active: boolean) => void;
  initialStudyId?: string;
}

type Step = 'choice' | 'confirm';
type Choice = 'consent' | 'decline' | 'later' | null;

export const FirstRunConsentModal: React.FC<FirstRunConsentModalProps> = ({
  isOpen,
  onClose,
  onModeSelected,
  onConsentChange,
  initialStudyId
}) => {
  const [step, setStep] = useState<Step>('choice');
  const [choice, setChoice] = useState<Choice>(null);
  const [studyId, setStudyId] = useState<string>('STUDY-S3A-2026');
  const [studyIdError, setStudyIdError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setStep('choice');
      setChoice(null);
      setStudyIdError(null);
      setIsSubmitting(false);
      if (initialStudyId && initialStudyId.trim()) {
        setStudyId(initialStudyId.trim());
      } else {
        getEngineStudyId().then(existingId => {
          if (existingId && existingId.trim()) {
            setStudyId(existingId.trim());
          }
        }).catch(() => {});
      }
    }
  }, [isOpen, initialStudyId]);

  if (!isOpen) return null;

  const handleProceedToConfirm = () => {
    if (choice === 'later') {
      // Closes the modal; tracing stays off; reopen from "Join a study"
      onClose();
      return;
    }

    setStudyIdError(null);

    if (choice === 'consent' || choice === 'decline') {
      setStep('confirm');
    }
  };

  const handleFinalConfirm = async () => {
    setIsSubmitting(true);
    try {
      await saveFirstRunConsentTime();
      await saveUserMode('explorer');
      if (onModeSelected) onModeSelected('explorer');

      let newTracingState = false;

      if (choice === 'consent') {
        const cleanStudyId = studyId.trim();
        // Purpose 1 means Research, real study ID
        newTracingState = await setConsent(true, 1, cleanStudyId);
      } else if (choice === 'decline') {
        // Record decline too so the decision itself is on the record either way
        const cleanStudyId = studyId && studyId.trim() ? studyId.trim() : 'declined-participant';
        newTracingState = await setConsent(false, 1, cleanStudyId);
      }

      if (onConsentChange) {
        onConsentChange(newTracingState);
      }

      onClose();
    } catch (err: any) {
      setStudyIdError(err?.message || 'Failed to record consent in engine.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 sm:p-7 space-y-5">
        
        {/* Header */}
        <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
          <div className="w-11 h-11 rounded-2xl bg-slate-900 text-emerald-400 flex items-center justify-center shadow-xs shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Research Study Consent & Activity Tracing
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Scholar Explorer Research Participation Agreement
            </p>
          </div>
        </div>

        {step === 'choice' ? (
          <div className="space-y-4">
            {/* Plain language explanation */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs leading-relaxed text-slate-700">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                <HelpCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>What you need to know before participating:</span>
              </div>
              
              <ul className="space-y-2 text-slate-600 text-[11px] list-disc pl-4">
                <li>
                  <strong className="text-slate-800">What tracing records:</strong> Your own research actions (searches, papers opened, notes written) <em>and</em> the AI assistant's actions (suggestions, synthesized claims), linked so researchers can study human-AI collaboration together.
                </li>
                <li>
                  <strong className="text-slate-800">What is NOT affected:</strong> Your papers, evidence, and claims <span className="underline decoration-emerald-500 decoration-2 font-semibold text-slate-800">always save</span> whether you consent or not. Declining only stops activity tracing.
                </li>
                <li>
                  <strong className="text-slate-800">Off by default:</strong> Tracing is off by default and only turns on for enrolled study participants who explicitly consent. You can withdraw anytime from Settings, which stops recording immediately.
                </li>
                <li>
                  <strong className="text-slate-800">Full transparency:</strong> If you consent, you can view both your own activity log and the AI's activity log for your research directly in Settings.
                </li>
              </ul>
            </div>

            {/* Three distinct choices (not a pre-ticked box) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Please select your preference:
              </label>

              {/* Choice A: Consent */}
              <button
                type="button"
                onClick={() => {
                  setChoice('consent');
                  setStudyIdError(null);
                }}
                className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  choice === 'consent'
                    ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                  choice === 'consent' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {choice === 'consent' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
                <div className="space-y-1 w-full">
                  <span className="font-bold text-xs text-slate-900 block">
                    Yes, trace my research activity for this study
                  </span>
                  <p className="text-[11px] text-slate-600">
                    Enables research activity tracing linked to your study ID. You can review your logs and withdraw at any time.
                  </p>
                  
                  {choice === 'consent' && (
                    <div className="pt-2 animate-in fade-in duration-150">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-900 mb-1">
                        Participant Study ID (Required)
                      </label>
                      <input
                        type="text"
                        value={studyId}
                        onChange={(e) => {
                          setStudyId(e.target.value);
                          if (studyIdError) setStudyIdError(null);
                        }}
                        placeholder="e.g. STUDY-S3A-2026 or participant ID"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-emerald-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                        onClick={(e) => e.stopPropagation()}
                      />
                      {studyIdError && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span>{studyIdError}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </button>

              {/* Choice B: Decline */}
              <button
                type="button"
                onClick={() => {
                  setChoice('decline');
                  setStudyIdError(null);
                }}
                className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  choice === 'decline'
                    ? 'border-slate-800 bg-slate-50 ring-2 ring-slate-800/10 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                  choice === 'decline' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {choice === 'decline' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
                <div className="space-y-0.5">
                  <span className="font-bold text-xs text-slate-900 block">
                    No, do not trace my activity
                  </span>
                  <p className="text-[11px] text-slate-600">
                    Recording stays off. All papers, notes, searches, and exports continue to save and operate completely.
                  </p>
                </div>
              </button>

              {/* Choice C: Decide later */}
              <button
                type="button"
                onClick={() => {
                  setChoice('later');
                  setStudyIdError(null);
                }}
                className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  choice === 'later'
                    ? 'border-amber-600 bg-amber-50/50 ring-2 ring-amber-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                  choice === 'later' ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {choice === 'later' && <Clock className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
                <div className="space-y-0.5">
                  <span className="font-bold text-xs text-slate-900 block">
                    Decide later
                  </span>
                  <p className="text-[11px] text-slate-600">
                    Closes this modal; activity tracing stays off. You can reopen it at any time from "Join a study".
                  </p>
                </div>
              </button>
            </div>

            {/* Actions: clear Agree and No thanks buttons + Continue */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={async () => {
                  setChoice('decline');
                  setStudyIdError(null);
                  setIsSubmitting(true);
                  try {
                    const cleanStudyId = studyId && studyId.trim() ? studyId.trim() : 'declined-participant';
                    const newTracingState = await setConsent(false, 1, cleanStudyId);
                    if (onConsentChange) onConsentChange(newTracingState);
                    onClose();
                  } catch (err: any) {
                    setStudyIdError(err?.message || 'Failed to record consent decision.');
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
              >
                No thanks
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice('consent');
                    setStudyIdError(null);
                    setStep('confirm');
                  }}
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
                >
                  Agree
                </button>
                <button
                  type="button"
                  onClick={handleProceedToConfirm}
                  disabled={!choice || isSubmitting}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <span>Continue</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Confirmation Screen */
          <div className="space-y-5 py-2 animate-in fade-in duration-150">
            <div className="p-4 rounded-xl border bg-slate-50 border-slate-200 space-y-2">
              <div className="flex items-center gap-2">
                {choice === 'consent' ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                )}
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Confirmation Summary
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                {choice === 'consent'
                  ? `You chose to allow activity tracing for study ${studyId.trim() || '[study ID]'}.`
                  : 'You chose not to allow activity tracing.'}
              </p>
              <p className="text-xs text-slate-500 leading-normal">
                {choice === 'consent'
                  ? 'Your searches, paper views, claims, and AI assistant interactions will be recorded in the S3A snapshot under your study ID. You can withdraw at any time.'
                  : 'Recording will be off. The decline decision will be acknowledged on the record, and all research functions (search, paper storage, notes, downloads) remain fully accessible.'}
              </p>
            </div>

            {studyIdError && (
              <div className="space-y-2">
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-800 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{studyIdError}</span>
                </div>
                {choice === 'consent' && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700">
                      Participant Study ID:
                    </label>
                    <input
                      type="text"
                      value={studyId}
                      onChange={(e) => {
                        setStudyId(e.target.value);
                        setStudyIdError(null);
                      }}
                      placeholder="e.g. STUDY-S3A-2026"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep('choice')}
                disabled={isSubmitting}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={handleFinalConfirm}
                disabled={isSubmitting}
                className="px-7 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2"
              >
                {isSubmitting ? (
                  <span>Recording Decision...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

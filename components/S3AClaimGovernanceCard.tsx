import React, { useState } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileText, 
  Send, 
  Check, 
  ThumbsUp, 
  ThumbsDown, 
  HelpCircle, 
  Lock, 
  ExternalLink,
  Cpu,
  UserCheck,
  Bot,
  RefreshCw,
  Download
} from 'lucide-react';
import type { ResearchPaper } from '../types';
import { 
  assertAgentAllows, 
  checkRequiresHumanGate, 
  evaluatePreflight, 
  logHumanAction, 
  logAiAction, 
  downloadS3ASnapshotFile,
  S3A_VERBS, 
  S3A_AGENTS,
  emitStatement,
  ScholarTool
} from '../services/s3aWasmService';

interface S3AClaimGovernanceCardProps {
  paper: ResearchPaper;
  userName?: string;
  onRefreshProvenance?: () => void;
}

export const S3AClaimGovernanceCard: React.FC<S3AClaimGovernanceCardProps> = ({
  paper,
  userName = 'Human Researcher',
  onRefreshProvenance
}) => {
  const initialAiClaimText = React.useMemo(() => {
    return paper.highlights?.find(h => h.category === 'TLDR')?.text ||
      (paper.abstract ? paper.abstract.slice(0, 180) + '...' : paper.title);
  }, [paper]);

  const [claimText, setClaimText] = useState(initialAiClaimText);
  const [isVerifying, setIsVerifying] = useState(false);
  const [agentBlockedError, setAgentBlockedError] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    aiIndex: number;
    agent: string;
    confidence: number;
    preflightPassed: boolean;
    preflightMessage: string;
    requiresGate: boolean;
    isGateApproved: boolean;
    decision: 'approved' | 'rejected' | 'under_review' | 'pending';
    linkedHumanIndex: number | null;
  } | null>(null);

  const [noteText, setNoteText] = useState('');
  const [noteSuccess, setNoteSuccess] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);
  const [gateActionStatus, setGateActionStatus] = useState<string | null>(null);

  // Trigger simulated low confidence test toggle
  const [simulatedConfidence, setSimulatedConfidence] = useState<number>(0.92);

  const isClaimEdited = claimText.trim() !== initialAiClaimText.trim();

  const handleTestDeniedTool = async () => {
    setIsVerifying(true);
    setAgentBlockedError(null);
    try {
      await assertAgentAllows(S3A_AGENTS.CLAIM_CHECKER, S3A_VERBS.APPROVE_CLAIM, ScholarTool.TOOL_PUBLISH);
    } catch (err: any) {
      setAgentBlockedError(err.message || 'blocked by policy');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRunAiClaimCheck = async () => {
    setIsVerifying(true);
    setAgentBlockedError(null);
    setGateActionStatus(null);

    const agentSlug = S3A_AGENTS.CLAIM_CHECKER;

    try {
      // 1. Before any agent acts, call assert_agent_allows. If it throws, block action & show why.
      await assertAgentAllows(agentSlug, S3A_VERBS.APPROVE_CLAIM, ScholarTool.TOOL_EXTRACT_CLAIMS);

      // 2. Preflight evaluation
      const preflight = await evaluatePreflight(simulatedConfidence);

      // 3. Gate requirement
      const requiresGate = await checkRequiresHumanGate(agentSlug);

      // 4. Log AI claim check (initial state before final human gate click)
      const { aiIndex } = await logAiAction(
        agentSlug,
        1, // Step type: claim verification
        simulatedConfidence,
        null,
        false
      );

      setVerificationResult({
        aiIndex,
        agent: agentSlug,
        confidence: simulatedConfidence,
        preflightPassed: preflight.passed,
        preflightMessage: preflight.message,
        requiresGate,
        isGateApproved: false,
        decision: 'pending',
        linkedHumanIndex: null
      });

      onRefreshProvenance?.();
    } catch (err: any) {
      setAgentBlockedError(err.message || 'Agent action blocked by S3A guard policy');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleHumanApprove = async () => {
    if (!verificationResult) return;
    const aiTraceIndex = verificationResult.aiIndex;

    try {
      // 2. Missing emit point: "edited" (human) when a user changes AI-suggested text
      // before accepting it, linked to the AI step via ai_trace_index.
      if (isClaimEdited) {
        await emitStatement('edited', {
          id: `urn:claim:${paper.doi || paper.id}`,
          name: `Modified Claim: "${claimText.slice(0, 80)}"`,
          type: 'empirical-claim'
        }, {
          actor: 'human',
          decision: 'edited',
          ai_trace_index: aiTraceIndex,
          aiIndex: aiTraceIndex,
          original_text: initialAiClaimText,
          edited_text: claimText,
          doi: paper.doi
        });
      }

      const humanIndex = await logHumanAction(
        S3A_VERBS.APPROVE_CLAIM,
        userName,
        `Approved Claim: "${claimText.slice(0, 80)}" for DOI: ${paper.doi || paper.id}`,
        aiTraceIndex
      );

      setVerificationResult(prev => prev ? {
        ...prev,
        isGateApproved: true,
        decision: 'approved',
        linkedHumanIndex: humanIndex
      } : null);

      setGateActionStatus(`Human Gate Approved (Recorded as Step H#${humanIndex}, linked to AI#${verificationResult.aiIndex}${isClaimEdited ? ' [with human edits]' : ''})`);
      onRefreshProvenance?.();
    } catch (err: any) {
      alert(`Approval logging failed: ${err.message}`);
    }
  };

  const handleHumanReject = async () => {
    if (!verificationResult) return;
    try {
      const humanIndex = await logHumanAction(
        S3A_VERBS.REJECT_CLAIM,
        userName,
        `Rejected Claim: "${claimText.slice(0, 80)}" for DOI: ${paper.doi || paper.id}`,
        verificationResult.aiIndex
      );

      setVerificationResult(prev => prev ? {
        ...prev,
        isGateApproved: true,
        decision: 'rejected',
        linkedHumanIndex: humanIndex
      } : null);

      setGateActionStatus(`Claim Rejected by Human Researcher (Recorded as Step H#${humanIndex}, linked to AI#${verificationResult.aiIndex})`);
      onRefreshProvenance?.();
    } catch (err: any) {
      alert(`Rejection logging failed: ${err.message}`);
    }
  };

  const handleRequestReview = async () => {
    try {
      const aiIdx = verificationResult?.aiIndex ?? null;
      const humanIndex = await logHumanAction(
        S3A_VERBS.REQUEST_REVIEW,
        userName,
        `Requested Supervisory Review for Paper: ${paper.title} (${paper.doi || paper.id})`,
        aiIdx
      );
      setReviewRequested(true);
      setGateActionStatus(`Review Requested (Logged as Step H#${humanIndex})`);
      onRefreshProvenance?.();
    } catch (err: any) {
      alert(`Request review failed: ${err.message}`);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    try {
      const aiIdx = verificationResult?.aiIndex ?? null;

      const humanIndex = await logHumanAction(
        S3A_VERBS.NOTE,
        userName,
        `Researcher Note: "${noteText.trim()}" on [${paper.title.slice(0, 50)}]`,
        aiIdx
      );
      setNoteText('');
      setNoteSuccess(true);
      setGateActionStatus(`Note created & committed to S3A snapshot (Step H#${humanIndex})`);
      setTimeout(() => setNoteSuccess(false), 3000);
      onRefreshProvenance?.();
    } catch (err: any) {
      alert(`Note failed: ${err.message}`);
    }
  };

  const openAccessUrl = paper.openAccessPdfUrl || paper.pdfURL || (paper.doi ? `https://doi.org/${paper.doi}` : paper.sourceURL);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center shadow-2xs">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              S3A Claim &amp; Epistemic Gate
              <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[10px] font-mono">WASM Core</span>
            </h4>
            <p className="text-[11px] text-slate-500">
              Guarded by <code className="text-indigo-600">assert_agent_allows</code>, human clearance gate &amp; epistemic preflight
            </p>
          </div>
        </div>

        {/* Read paper link out (Never stores PDF) */}
        {openAccessUrl && (
          <a
            href={openAccessUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all"
            title="Read paper directly from open repository. PDFs are never stored in S3A."
          >
            <span>Read Open-Access</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        )}
      </div>

      {/* Policy Advisory Note */}
      <div className="text-[11px] bg-slate-50 border border-slate-200/70 p-2.5 rounded-xl text-slate-600 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>
            <strong>Zero-PDF Metadata Architecture:</strong> Only OpenAlex work metadata is committed to the S3A snapshot via <code className="text-slate-800">add_paper</code>.
          </span>
        </div>
      </div>

      {/* Target Claim Input */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          Target Claim to Verify Against Literature Evidence
        </label>
        <textarea
          value={claimText}
          onChange={(e) => setClaimText(e.target.value)}
          rows={2}
          className="w-full text-xs font-medium bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
          placeholder="Enter an empirical claim or research thesis assertion..."
        />
      </div>

      {/* Confidence Simulation Controls */}
      <div className="flex items-center justify-between text-xs bg-slate-50/80 p-2.5 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 text-slate-700">
          <Cpu className="w-3.5 h-3.5 text-indigo-600" />
          <span className="text-[11px] font-semibold">Test Epistemic Confidence:</span>
          <span className="font-mono font-bold text-indigo-700">{(simulatedConfidence * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSimulatedConfidence(0.92)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
              simulatedConfidence >= 0.70 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}
          >
            High (92% - Passes)
          </button>
          <button
            type="button"
            onClick={() => setSimulatedConfidence(0.58)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
              simulatedConfidence < 0.70 ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}
          >
            Low (58% - Needs Review)
          </button>
        </div>
      </div>

      {/* Agent Blocked Error Warning if assert_agent_allows throws */}
      {agentBlockedError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5 animate-in fade-in">
          <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Agent Action Blocked by S3A Guard:</span>
            <p className="text-[11px] mt-0.5 leading-relaxed">{agentBlockedError}</p>
          </div>
        </div>
      )}

      {/* Run Verification Button */}
      {!verificationResult && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleRunAiClaimCheck}
            disabled={isVerifying || !claimText.trim()}
            className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {isVerifying ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{isVerifying ? 'Asserting Agent & Evaluating Preflight...' : 'Run AI Claim Check (claim-checker)'}</span>
          </button>

          <button
            onClick={handleRequestReview}
            disabled={reviewRequested}
            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all"
            title="Request human supervisory review without AI execution"
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            <span>{reviewRequested ? 'Review Requested' : 'Request Review'}</span>
          </button>

          <button
            type="button"
            onClick={handleTestDeniedTool}
            disabled={isVerifying}
            className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all border border-rose-200"
            title="Test Denied Tool (TOOL_PUBLISH) to verify policy blocking"
          >
            <Lock className="w-3.5 h-3.5 text-rose-500" />
            <span>Test Denied Tool (TOOL_PUBLISH)</span>
          </button>
        </div>
      )}

      {/* Verification Result & Human Gate clearance */}
      {verificationResult && (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-mono text-[10px] font-bold">
                AI Trace #{verificationResult.aiIndex}
              </span>
              <span className="text-xs font-bold text-slate-800">Agent: [{verificationResult.agent}]</span>
            </div>

            {/* Epistemic Preflight Status */}
            <div>
              {verificationResult.preflightPassed ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Preflight Cleared ({(verificationResult.confidence * 100).toFixed(0)}%)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  Needs Review (Low Confidence: {(verificationResult.confidence * 100).toFixed(0)}%)
                </span>
              )}
            </div>
          </div>

          {/* If preflight failed: show "needs review" instead of answer */}
          {!verificationResult.preflightPassed ? (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Epistemic Guard: Needs Review
              </span>
              <p className="text-[11px] text-amber-800">
                Epistemic confidence is below the mandatory 0.70 threshold ({verificationResult.preflightMessage}). The claim check output cannot be finalized autonomously and is marked as <strong>needs review</strong>.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-700 leading-relaxed">
              <p className="font-semibold text-slate-900 mb-1">Claim Verification Finding:</p>
              <p className="text-[11px] italic">
                "The target claim demonstrates solid textual alignment with the findings reported in this paper ({paper.year}). Evidence is supported by empirical methodology."
              </p>
            </div>
          )}

          {/* Supervisory Human Gate Clearance Section */}
          {verificationResult.requiresGate && (
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-indigo-600" />
                  Supervisory Gate Clearance:
                </span>
                <span className={`text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded ${
                  verificationResult.isGateApproved 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : 'bg-amber-100 text-amber-800 animate-pulse'
                }`}>
                  {verificationResult.isGateApproved ? 'Gate Cleared' : 'Approval Click Required'}
                </span>
              </div>

              {!verificationResult.isGateApproved ? (
                <div className="space-y-2 pt-1">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1">
                      <span>Review & Refine AI-Suggested Claim before Approval:</span>
                      {isClaimEdited ? (
                        <span className="text-[10px] text-amber-600 font-mono font-bold">
                          ✎ Edited (emits 'edited' linked to AI#{verificationResult.aiIndex})
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono">
                          (Original AI suggestion)
                        </span>
                      )}
                    </div>
                    <textarea
                      value={claimText}
                      onChange={(e) => setClaimText(e.target.value)}
                      rows={2}
                      className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
                      placeholder="Modify AI suggestion before approving..."
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleHumanApprove}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-2xs transition-all"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{isClaimEdited ? 'Accept with Edits' : 'Approve Claim'}</span>
                    </button>
                    <button
                      onClick={handleHumanReject}
                      className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-2xs transition-all"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>Reject Claim</span>
                    </button>
                    <button
                      onClick={handleRequestReview}
                      className="py-2 px-3 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1 transition-all"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Request Review</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Output Finalized ({verificationResult.decision.toUpperCase()})
                  </span>
                  {verificationResult.linkedHumanIndex !== null && (
                    <span className="text-[10px] font-mono text-emerald-700">
                      Linked Step: H#{verificationResult.linkedHumanIndex}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {gateActionStatus && (
            <p className="text-[11px] font-mono text-emerald-700 bg-emerald-50/70 p-2 rounded-lg border border-emerald-100">
              ✓ {gateActionStatus}
            </p>
          )}

          <div className="flex justify-end pt-1">
            <button
              onClick={() => setVerificationResult(null)}
              className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold"
            >
              Reset / Check Another Claim
            </button>
          </div>
        </div>
      )}

      {/* Log Researcher Note (Human Action: S3A_VERBS.NOTE) */}
      <form onSubmit={handleAddNote} className="pt-2 border-t border-slate-100 space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
          Commit Human Note to S3A Snapshot
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add empirical note or peer review observation..."
            className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
          <button
            type="submit"
            disabled={!noteText.trim()}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Commit Note</span>
          </button>
        </div>
        {noteSuccess && (
          <span className="text-[10px] text-emerald-600 font-bold block">✓ Note logged via record_human &amp; persisted to IndexedDB</span>
        )}
      </form>
    </div>
  );
};

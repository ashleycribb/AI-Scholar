import React, { useState, useEffect, useRef } from 'react';
import type { ResearchPaper } from '../types';
import {
  checkPaperSourceIntegrity,
  getCachedSourceCheck,
  type SourceCheckResult
} from '../services/sourceCheckService';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldAlert
} from 'lucide-react';

interface SourceCheckBadgeProps {
  paper: ResearchPaper;
  compact?: boolean;
  onResolvedOpenAlexId?: (openalexId: string) => void;
}

export const SourceCheckBadge: React.FC<SourceCheckBadgeProps> = ({
  paper,
  compact = false,
  onResolvedOpenAlexId
}) => {
  const initialCached = getCachedSourceCheck(paper);
  const [result, setResult] = useState<SourceCheckResult | null>(initialCached);
  const [loading, setLoading] = useState<boolean>(!initialCached);
  const [isInView, setIsInView] = useState<boolean>(!compact || Boolean(initialCached));
  const [showUnresolved, setShowUnresolved] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lazy viewport detection for result cards
  useEffect(() => {
    const cached = getCachedSourceCheck(paper);
    if (cached) {
      setResult(cached);
      setLoading(false);
      setIsInView(true);
      return;
    }
    if (!compact) {
      setIsInView(true);
      return;
    }
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact, paper.id, paper.doi, paper.openalex_id]);

  useEffect(() => {
    if (!isInView) return;

    const cached = getCachedSourceCheck(paper);
    if (cached && (compact || cached.references.sampledFiveTotal !== undefined)) {
      setResult(cached);
      setLoading(false);
      if (cached.openalexId && onResolvedOpenAlexId) {
        onResolvedOpenAlexId(cached.openalexId);
      }
      return;
    }

    let cancelled = false;
    setLoading(true);
    checkPaperSourceIntegrity(paper, { resolveSampleReferences: !compact })
      .then(res => {
        if (!cancelled) {
          setResult(res);
          setLoading(false);
          if (res.openalexId && onResolvedOpenAlexId) {
            onResolvedOpenAlexId(res.openalexId);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isInView, compact, paper.id, paper.doi, paper.openalex_id, paper.title, paper.year]);

  if (!isInView || loading) {
    if (compact) {
      return (
        <div
          ref={containerRef}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[10px] font-medium text-slate-500"
          onClick={e => e.stopPropagation()}
        >
          <Loader2 className="w-2.5 h-2.5 animate-spin text-slate-400" />
          <span>Checking source…</span>
        </div>
      );
    }
    return (
      <div
        ref={containerRef}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-600"
      >
        <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
        <span>Checking Crossref &amp; OpenAlex record…</span>
      </div>
    );
  }

  if (!result) return <div ref={containerRef} />;

  const isVerified = result.recordStatus === 'verified';
  const isMismatch = result.recordStatus === 'mismatch';
  const isUnchecked = result.recordStatus === 'unchecked' || result.recordStatus === 'error';

  if (compact) {
    const compactLabel = result.recordBadgeLabel || (
      isVerified
        ? 'Verified record'
        : isMismatch
          ? 'Title/year mismatch'
          : isUnchecked
            ? 'Unchecked'
            : 'Unregistered DOI'
    );

    return (
      <div ref={containerRef} className="inline-flex flex-wrap items-center gap-1.5" onClick={e => e.stopPropagation()}>
        {isVerified && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
            title={`Matched title, year (${result.fieldComparison.year.claimed}), and first author (${result.fieldComparison.firstAuthor.claimed}) against Crossref & OpenAlex`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
            <span>{compactLabel}</span>
          </span>
        )}

        {isMismatch && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-300"
            title={`Field mismatch detected on: ${result.failedFields.join(', ')}`}
          >
            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
            <span>{compactLabel}</span>
          </span>
        )}

        {!isVerified && !isMismatch && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
              isUnchecked
                ? 'bg-slate-100 text-slate-700 border-slate-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
            title={result.registryErrors.join('; ') || 'Record could not be resolved in Crossref or OpenAlex'}
          >
            <XCircle className={`w-3 h-3 shrink-0 ${isUnchecked ? 'text-slate-500' : 'text-rose-600'}`} />
            <span>{compactLabel}</span>
          </span>
        )}

        {result.retractionFlag === 'retracted' && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white border border-red-700"
            title={result.retractionDetails || 'Retracted work'}
          >
            <ShieldAlert className="w-3 h-3 shrink-0" />
            <span>Retracted</span>
          </span>
        )}

        {result.retractionFlag === 'concern' && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-slate-950 border border-amber-600"
            title={result.retractionDetails || 'Expression of concern'}
          >
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>Concern</span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-1.5" onClick={e => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 1. Record verification badge: Verified record | Mismatch (field) | Not found */}
        {isVerified && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
            title={`Matched title, year (${result.fieldComparison.year.claimed}), and first author (${result.fieldComparison.firstAuthor.claimed}) against Crossref & OpenAlex`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
            <span>{result.recordBadgeLabel}</span>
          </span>
        )}

        {isMismatch && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-300"
            title={`Field mismatch detected on: ${result.failedFields.join(', ')}. Review below.`}
          >
            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
            <span>{result.recordBadgeLabel}</span>
          </span>
        )}

        {!isVerified && !isMismatch && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200"
            title={result.registryErrors.join('; ') || 'Record could not be resolved in Crossref or OpenAlex'}
          >
            <XCircle className="w-3 h-3 text-rose-600 shrink-0" />
            <span>{result.recordBadgeLabel}</span>
          </span>
        )}

        {/* 2. Retraction / Expression of Concern Flag */}
        {result.retractionFlag === 'retracted' && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-600 text-white border border-red-700 shadow-2xs"
            title={result.retractionDetails || 'Retracted work'}
          >
            <ShieldAlert className="w-3 h-3 shrink-0" />
            <span>Retracted</span>
          </span>
        )}

        {result.retractionFlag === 'concern' && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500 text-slate-950 border border-amber-600 shadow-2xs"
            title={result.retractionDetails || 'Expression of concern'}
          >
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>Concern</span>
          </span>
        )}

        {/* 3. Reference Resolution Check: "X of Y references resolved" */}
        <button
          type="button"
          onClick={() => setShowUnresolved(prev => !prev)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition-colors"
          title="Click to inspect reference resolution and any unresolved references"
        >
          <BookOpen className="w-3 h-3 text-slate-600 shrink-0" />
          <span>{result.references.summaryLabel}</span>
          {(result.references.unresolvedList.length > 0 || isMismatch || result.registryErrors.length > 0) && (
            showUnresolved ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* Expandable details for mismatch fields, retraction notices, or unresolved references */}
      {showUnresolved && (
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-2">
          <div className="flex items-center justify-between border-b border-slate-200 pb-1">
            <span className="font-bold text-slate-900">
              Source Check Details ({result.references.sourceUsed})
            </span>
            <span className="text-[10px] text-slate-500">
              Human judgement required — papers are never auto-dropped
            </span>
          </div>

          {/* Field comparison summary if mismatch */}
          {isMismatch && (
            <div className="space-y-1 bg-amber-50/80 border border-amber-200 rounded p-2 text-amber-950">
              <div className="font-semibold">Field Discrepancies:</div>
              {!result.fieldComparison.title.matched && (
                <div>
                  • <strong>Title:</strong> Paper has &ldquo;{result.fieldComparison.title.claimed}&rdquo; vs Registry &ldquo;{result.fieldComparison.title.registry || 'N/A'}&rdquo;
                </div>
              )}
              {!result.fieldComparison.year.matched && (
                <div>
                  • <strong>Year:</strong> Paper has {result.fieldComparison.year.claimed || 'N/A'} vs Registry {result.fieldComparison.year.registry || 'N/A'}
                </div>
              )}
              {!result.fieldComparison.firstAuthor.matched && (
                <div>
                  • <strong>First Author:</strong> Paper has &ldquo;{result.fieldComparison.firstAuthor.claimed}&rdquo; vs Registry &ldquo;{result.fieldComparison.firstAuthor.registry || 'N/A'}&rdquo;
                </div>
              )}
            </div>
          )}

          {result.retractionFlag !== 'none' && result.retractionDetails && (
            <div className={`p-2 rounded border font-medium ${
              result.retractionFlag === 'retracted'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <strong>{result.retractionFlag === 'retracted' ? 'Retraction Notice:' : 'Expression of Concern:'}</strong> {result.retractionDetails}
            </div>
          )}

          {result.registryErrors.length > 0 && (
            <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-1.5">
              {result.registryErrors.map((err, i) => (
                <div key={i}>• {err}</div>
              ))}
            </div>
          )}

          {/* Unresolved references list for human review */}
          {result.references.unresolvedList.length > 0 ? (
            <div className="space-y-1">
              <div className="font-semibold text-slate-800">
                Unresolved References for Human Review ({result.references.unresolvedList.length}):
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {result.references.unresolvedList.map((item, idx) => (
                  <div
                    key={`${item.key}-${idx}`}
                    className="p-1.5 bg-white rounded border border-slate-200 text-[11px] flex flex-col gap-0.5"
                  >
                    <span className="font-mono text-[10px] text-slate-500">[{item.key}] — {item.reason}</span>
                    <span className="text-slate-800 break-words">{item.citationText}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-emerald-700 font-medium">
              {result.references.totalCount > 0
                ? `All ${result.references.resolvedCount} listed references resolved to indexed records.`
                : 'No unresolved references reported.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


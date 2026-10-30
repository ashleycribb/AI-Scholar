import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { ShieldCheck, Info, Check, Copy, ExternalLink, Sparkles, BookOpen } from 'lucide-react';

export interface ReportClaim {
  text: string;
  citationIds?: string[];
  confidence?: number; // 0.0 to 1.0
  claimType?: 'supported' | 'contradicted' | 'inconclusive';
}

export interface ReportReference {
  id?: string;
  title: string;
  authors?: string;
  year?: number | string;
  doi?: string;
  sourceURL?: string;
}

interface FormattedReportProps {
  text?: string;
  claims?: ReportClaim[];
  references?: ReportReference[];
  showConfidenceLegend?: boolean;
  className?: string;
}

export const FormattedReport: React.FC<FormattedReportProps> = ({ 
  text = '', 
  claims, 
  references = [], 
  showConfidenceLegend = true,
  className = '' 
}) => {
  const [copiedClaimIndex, setCopiedClaimIndex] = useState<number | null>(null);

  const handleCopyClaim = (claimText: string, citations: string[], index: number) => {
    const citationStr = citations.length > 0 ? ` ${citations.join(', ')}` : '';
    navigator.clipboard.writeText(`${claimText}${citationStr}`);
    setCopiedClaimIndex(index);
    setTimeout(() => setCopiedClaimIndex(null), 2000);
  };

  const getConfidenceLevel = (confidence?: number) => {
    if (confidence === undefined || confidence === null) return null;
    if (confidence >= 0.8) {
      return {
        label: 'High Verification',
        scoreText: `${Math.round(confidence * 100)}%`,
        barColor: 'bg-emerald-500',
        badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        description: 'Directly corroborated by peer-reviewed empirical findings'
      };
    }
    if (confidence >= 0.6) {
      return {
        label: 'Moderate Corroboration',
        scoreText: `${Math.round(confidence * 100)}%`,
        barColor: 'bg-amber-500',
        badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
        description: 'Supported with minor caveats, methodological scope limits, or observational design'
      };
    }
    return {
      label: 'Emerging / Requires Verification',
      scoreText: `${Math.round(confidence * 100)}%`,
      barColor: 'bg-slate-400',
      badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
      description: 'Single-source claim, preprint, or conflicting findings identified'
    };
  };

  // Render structured claims if available
  if (claims && claims.length > 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        {showConfidenceLegend && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-[11px] text-slate-600">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="w-4 h-4 text-slate-700" />
              <span className="font-semibold text-slate-800">In-Flight Claim Verification:</span>
              <span>Each claim is scored against source grounding &amp; methodology</span>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>&ge;80% High</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>60-79% Moderate</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span>&lt;60% Emerging</span>
              </span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {claims.map((claim, idx) => {
            const conf = getConfidenceLevel(claim.confidence);
            return (
              <div 
                key={idx}
                className="group relative flex gap-3.5 p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-xs transition-all"
              >
                {/* Visual confidence indicator bar */}
                {conf && (
                  <div 
                    className={`w-1.5 rounded-full shrink-0 ${conf.barColor}`} 
                    title={`${conf.label} (${conf.scoreText}): ${conf.description}`}
                  />
                )}

                <div className="flex-grow space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-normal text-slate-800 leading-relaxed font-sans">
                      {claim.text}
                    </p>
                    
                    {/* Copy action */}
                    <button
                      type="button"
                      onClick={() => handleCopyClaim(claim.text, claim.citationIds || [], idx)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0"
                      title="Copy claim with citations"
                      aria-label="Copy claim with citations"
                    >
                      {copiedClaimIndex === idx ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {/* Citations badges */}
                    {claim.citationIds && claim.citationIds.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {claim.citationIds.map((cid, cIdx) => {
                          const refIdx = parseInt(cid.replace('#', '')) - 1;
                          const refPaper = references[refIdx];
                          return (
                            <span
                              key={cIdx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[10px] font-semibold hover:bg-slate-200 transition-colors cursor-help border border-slate-200/70"
                              title={refPaper ? `${refPaper.title} (${refPaper.authors || 'Unknown'}, ${refPaper.year || 'n.d.'})` : `Source ${cid}`}
                            >
                              <BookOpen className="w-2.5 h-2.5 text-slate-500" />
                              <span>[{refIdx >= 0 ? refIdx + 1 : cid}]</span>
                              {refPaper && (
                                <span className="hidden sm:inline text-slate-500 max-w-[120px] truncate">
                                  {refPaper.authors ? refPaper.authors.split(',')[0] : ''}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Confidence score pill */}
                    {conf && (
                      <span 
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${conf.badgeBg}`}
                        title={conf.description}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>{conf.scoreText}</span>
                        <span className="opacity-75 font-normal">({conf.label})</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Fallback / standard Markdown rendering
  return (
    <div className={`prose prose-slate max-w-none text-slate-800 prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-lg prose-h3:text-base prose-p:text-sm prose-p:leading-relaxed prose-li:text-sm prose-code:font-mono prose-code:text-xs prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded ${className}`}>
      <Markdown>{text}</Markdown>
    </div>
  );
};



import React, { useState, useEffect } from 'react';
import type { ResearchPaper, VerificationResult } from '../types';
import { ErrorMessage } from './ErrorMessage';
import { LoadingSpinner } from './LoadingSpinner';
import { ShieldCheckIcon } from './icons/ShieldCheckIcon';
import * as verificationService from '../services/verificationService';

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  paper: ResearchPaper | null;
  onVerificationComplete: (doi: string, result: VerificationResult) => void;
}

const VerdictDisplay: React.FC<{ verdict: VerificationResult['verdict'] }> = ({ verdict }) => {
    const styles = {
        Verified: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
        Inconclusive: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
        Questionable: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
    };
    const style = styles[verdict] || styles.Inconclusive;
    return (
        <span className={`px-3 py-1 text-sm font-bold rounded-full border ${style.bg} ${style.text} ${style.border}`}>
            {verdict}
        </span>
    );
};

const BreakdownBar: React.FC<{ label: string; score: number }> = ({ label, score }) => {
    const percentage = Math.round(score * 100);
    return (
        <div>
            <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <span className="text-sm font-bold text-primary">{percentage}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
                <div className="bg-primary h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
            </div>
        </div>
    );
};


export const VerificationModal: React.FC<VerificationModalProps> = ({ isOpen, onClose, paper, onVerificationComplete }) => {
    const [claimText, setClaimText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<VerificationResult | null>(null);

    useEffect(() => {
        if (paper) {
            setClaimText(paper.abstract || paper.title || '');
            setResult(paper.verificationResult || null);
            setError(null);
            setIsLoading(false);
        }
    }, [paper]);

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paper || !paper.doi) return;

        setIsLoading(true);
        setError(null);
        setResult(null);
        setLoadingMessage('Verifying claim on server...');

        try {
            const verificationResult = await verificationService.verifyPaper(paper.doi, claimText);
            setResult(verificationResult);
            onVerificationComplete(paper.doi, verificationResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };
    
    if (!isOpen || !paper) {
        return null;
    }

    const renderContent = () => {
        if (isLoading) {
            return <LoadingSpinner message={loadingMessage} />;
        }
        if (error) {
            return <ErrorMessage message={error} />;
        }
        if (result) {
            return (
                 <div className="space-y-6">
                    <div className="flex justify-between items-center bg-muted/50 p-4 rounded-lg border">
                        <div>
                            <h3 className="text-lg font-bold text-foreground">Verification Complete</h3>
                            <p className="text-sm text-muted-foreground">VACS (Veracity, Accuracy, Credibility Score)</p>
                        </div>
                        <div className="text-right">
                             <div className={`text-4xl font-bold ${
                                result.verdict === 'Verified' ? 'text-green-600' :
                                result.verdict === 'Questionable' ? 'text-red-600' :
                                'text-yellow-600'
                            }`}>{result.vacs}</div>
                            <VerdictDisplay verdict={result.verdict} />
                        </div>
                    </div>

                    <div>
                        <h4 className="font-semibold text-foreground mb-3">Score Breakdown</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <BreakdownBar label="Credibility" score={result.breakdown.credibility} />
                            <BreakdownBar label="Evidence" score={result.breakdown.evidence} />
                            <BreakdownBar label="Reproducibility" score={result.breakdown.reproducibility} />
                            <BreakdownBar label="Citation Context" score={result.breakdown.citations} />
                        </div>
                    </div>
                    
                    <div>
                        <h4 className="font-semibold text-foreground mb-2">Rationale</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            {result.rationale.map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                    </div>

                    {result.evidence.length > 0 && (
                         <div>
                            <h4 className="font-semibold text-foreground mb-2">Supporting Evidence Found</h4>
                            <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                                {result.evidence.map((span, i) => (
                                    <blockquote key={i} className="border-l-4 border-primary bg-primary/10 p-3 rounded-r-lg">
                                        <p className="text-sm text-foreground italic">"{span.passage}"</p>
                                        <cite className="text-xs text-primary/80 block mt-2 not-italic">
                                            Source Confidence: {Math.round((span.score || 0) * 100)}%
                                        </cite>
                                    </blockquote>
                                ))}
                            </div>
                        </div>
                    )}
                 </div>
            );
        }
        
        return (
            <form onSubmit={handleVerify}>
                <p className="text-muted-foreground mb-4">Enter a specific claim to verify against the paper's content. By default, the paper's abstract is used as the primary claim.</p>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="claim-text" className="block text-sm font-medium text-foreground mb-1">Claim to Verify</label>
                        <textarea
                            id="claim-text"
                            value={claimText}
                            onChange={(e) => setClaimText(e.target.value)}
                            rows={6}
                            className="w-full px-3 py-2 bg-background text-foreground border border-input rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            required
                        />
                    </div>
                </div>
                <div className="mt-6 flex justify-end">
                    <button
                        type="submit"
                        disabled={!claimText.trim()}
                        className="h-10 px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50"
                    >
                        Start Verification
                    </button>
                </div>
            </form>
        );
    };

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="verification-modal-title"
    >
      <div
        className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all border"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-border sticky top-0 bg-card rounded-t-xl z-10">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 text-muted-foreground hover:bg-accent rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
           <div className="flex items-center gap-3">
             <div className="flex-shrink-0 bg-primary/10 text-primary p-2 rounded-full">
                <ShieldCheckIcon className="w-6 h-6" />
             </div>
             <div>
                <h2 id="verification-modal-title" className="text-xl font-bold text-foreground">
                    Advanced Paper Verification
                </h2>
                <p className="text-sm text-muted-foreground mt-1 truncate" title={paper.title}>{paper.title}</p>
             </div>
           </div>
        </header>
        
        <main className="p-6 overflow-y-auto">
            {renderContent()}
        </main>
      </div>
    </div>
  );
};
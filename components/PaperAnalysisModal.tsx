
import React from 'react';
import type { ResearchPaper, PaperAnalysis } from '../types';
import { ErrorMessage } from './ErrorMessage';
import { AnalyzeIcon } from './icons/AnalyzeIcon';
import { LoadingSpinner } from './LoadingSpinner';
import { DoiIcon } from './icons/DoiIcon';
import { ExternalLinkIcon } from './icons/ExternalLinkIcon';

interface PaperAnalysisModalProps {
  result: {
    paper: ResearchPaper;
    analysis: PaperAnalysis;
  } | null;
  onClose: () => void;
  error: string | null;
  isLoading: boolean;
}

const AnalysisSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div>
        <h4 className="text-md font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h4>
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg text-gray-700">
            {children}
        </div>
    </div>
);

export const PaperAnalysisModal: React.FC<PaperAnalysisModalProps> = ({ result, onClose, error, isLoading }) => {
  if (!result) {
    return null;
  }

  const { paper, analysis } = result;

  return (
    <div
      className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paper-analysis-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
           <div className="flex items-center gap-3">
             <div className="flex-shrink-0 bg-green-100 text-green-600 p-2 rounded-full">
                <AnalyzeIcon className="w-6 h-6" />
             </div>
             <div>
                <h2 id="paper-analysis-title" className="text-xl font-bold text-gray-800">
                    Structured Analysis
                </h2>
                <p className="text-blue-700 font-semibold mt-1 text-sm truncate">{paper.title}</p>
             </div>
           </div>
        </header>
        
        <main className="p-6 overflow-y-auto">
          {isLoading ? (
            <LoadingSpinner message="Analyzing paper..." />
          ) : error ? (
            <ErrorMessage message={error} />
          ) : (
            analysis && (
                <div className="space-y-5">
                  <AnalysisSection title="Research Question">
                    <p>{analysis.researchQuestion}</p>
                  </AnalysisSection>
    
                  <AnalysisSection title="Methodology">
                    <p>{analysis.methodology}</p>
                  </AnalysisSection>
    
                  <AnalysisSection title="Key Findings">
                    <ul className="list-disc list-inside space-y-1">
                      {analysis.keyFindings.map((finding, index) => (
                        <li key={index}>{finding}</li>
                      ))}
                    </ul>
                  </AnalysisSection>
                  
                  <AnalysisSection title="Potential Limitations">
                     <ul className="list-disc list-inside space-y-1">
                      {analysis.limitations.map((limitation, index) => (
                        <li key={index}>{limitation}</li>
                      ))}
                    </ul>
                  </AnalysisSection>

                  {paper.doi && (
                    <AnalysisSection title="DOI (Digital Object Identifier)">
                        <a
                            href={`https://doi.org/${paper.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                        >
                            <DoiIcon className="w-4 h-4" />
                            <span>{paper.doi}</span>
                            <ExternalLinkIcon className="w-3 h-3 text-muted-foreground" />
                        </a>
                    </AnalysisSection>
                  )}
                </div>
            )
          )}
        </main>
      </div>
    </div>
  );
};

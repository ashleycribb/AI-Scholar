
import React from 'react';
import type { JournalRecommendation, ResearchPaper } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';
import { JournalIcon } from './icons/JournalIcon';

interface JournalFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  paper: ResearchPaper | null;
  recommendations: JournalRecommendation[];
  isLoading: boolean;
  error: string | null;
}

const ScoreBadge: React.FC<{ score: number }> = ({ score }) => {
    let colorClass = 'bg-red-100 text-red-800';
    if (score >= 80) colorClass = 'bg-green-100 text-green-800';
    else if (score >= 60) colorClass = 'bg-yellow-100 text-yellow-800';

    return (
        <span className={`px-2 py-1 rounded-md text-xs font-bold ${colorClass}`}>
            Fit: {score}%
        </span>
    );
};

export const JournalFinderModal: React.FC<JournalFinderModalProps> = ({ isOpen, onClose, paper, recommendations, isLoading, error }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="journal-finder-modal-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white rounded-t-xl z-10">
           <div className="flex items-center gap-3">
             <div className="flex-shrink-0 bg-indigo-100 text-indigo-600 p-2 rounded-full">
                <JournalIcon className="w-6 h-6" />
             </div>
             <div>
                <h2 id="journal-finder-modal-title" className="text-xl font-bold text-gray-800">
                  Journal Finder
                </h2>
                {paper && <p className="text-sm text-gray-500 mt-1 truncate max-w-md">Targeting venue for: {paper.title}</p>}
             </div>
           </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <main className="p-6 overflow-y-auto bg-gray-50/50">
          {isLoading && <LoadingSpinner message="Analyzing scope match & impact factors..." />}
          {error && <ErrorMessage message={error} />}
          
          {!isLoading && !error && recommendations.length > 0 && (
            <div className="grid grid-cols-1 gap-4">
                {recommendations.map((rec, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start gap-4 mb-3">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{rec.name}</h3>
                                {rec.publisher && <p className="text-sm text-gray-500">{rec.publisher}</p>}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <ScoreBadge score={rec.fitScore} />
                                {rec.impactFactorEstimate && (
                                    <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded border border-gray-200" title="Estimated Impact Factor">
                                        IF: ~{rec.impactFactorEstimate}
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">Strategic Fit</h4>
                                <p className="text-sm text-blue-900 leading-relaxed">{rec.matchRationale}</p>
                            </div>
                            <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                                <h4 className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-1">Scope Alignment</h4>
                                <p className="text-sm text-purple-900 leading-relaxed italic">"{rec.scopeMatch}"</p>
                            </div>
                        </div>
                        
                        <div className="mt-4 pt-3 border-t flex justify-end">
                            <a 
                                href={`https://www.google.com/search?q=${encodeURIComponent(rec.name + " journal submission guidelines")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 group"
                            >
                                Guide for Authors <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                            </a>
                        </div>
                    </div>
                ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

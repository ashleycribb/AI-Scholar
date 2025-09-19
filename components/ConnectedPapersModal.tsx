import React from 'react';
import type { ResearchPaper, ConnectedPaper } from '../types';
import { ScholarIcon } from './icons/ScholarIcon';
import { ErrorMessage } from './ErrorMessage';

interface ConnectedPapersModalProps {
  result: {
    seedPaper: ResearchPaper;
    connections: ConnectedPaper[];
  } | null;
  onClose: () => void;
  error: string | null;
}

export const ConnectedPapersModal: React.FC<ConnectedPapersModalProps> = ({ result, onClose, error }) => {
  if (!result) {
    return null;
  }

  const { seedPaper, connections } = result;

  return (
    <div
      className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="connected-papers-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col transform transition-all"
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
          <h2 id="connected-papers-title" className="text-xl font-bold text-gray-800">
            Papers Connected to:
          </h2>
          <p className="text-blue-700 font-semibold mt-1 truncate">{seedPaper.title}</p>
        </header>
        
        <main className="p-6 overflow-y-auto">
          {error && <ErrorMessage message={error} />}
          {connections.length === 0 && !error && (
             <div className="text-center py-12">
                <h3 className="text-lg font-semibold text-gray-700">No Connections Found</h3>
                <p className="text-gray-500 mt-2">We couldn't find any connected papers for this article.</p>
            </div>
          )}

          <div className="space-y-5">
            {connections.map((paper, index) => (
              <div key={index} className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                <h4 className="font-bold text-gray-900">{paper.title}</h4>
                <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1 mb-2">
                    <p><strong>Authors:</strong> {paper.authors}</p>
                    <span className="text-gray-300">|</span>
                    <p><strong>Year:</strong> {paper.year}</p>
                </div>
                <blockquote className="border-l-4 border-blue-500 pl-3 my-2 text-sm text-blue-800 bg-blue-50 py-2">
                    <p><span className="font-semibold">Connection:</span> {paper.connection}</p>
                </blockquote>
                <p className="text-sm text-gray-600 leading-relaxed mt-2">{paper.summary}</p>
                 {paper.sourceURL && (
                    <div className="mt-3 text-right">
                        <a
                            href={paper.sourceURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        >
                            <ScholarIcon className="w-3 h-3" />
                            <span>View on Google Scholar</span>
                        </a>
                    </div>
                 )}
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
};

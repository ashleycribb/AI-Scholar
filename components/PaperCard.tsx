import React from 'react';
import type { ResearchPaper } from '../types';
import { ZoteroIcon } from './icons/ZoteroIcon';
import { FormattedSummary } from './FormattedSummary';
import { StarIcon } from './icons/StarIcon';
import { PdfIcon } from './icons/PdfIcon';
import { ScholarIcon } from './icons/ScholarIcon';
import { NetworkIcon } from './icons/NetworkIcon';

interface PaperCardProps {
  paper: ResearchPaper;
  isFavorite: boolean;
  onToggleFavorite: (paper: ResearchPaper) => void;
  onDownloadPdf: (paper: ResearchPaper) => void;
  isPdfLoading: boolean;
  onFindConnectedPapers: (paper: ResearchPaper) => void;
  isFindingConnected: boolean;
}

// Generates a COinS (ContextObjects in Spans) metadata string for Zotero.
const generateCoins = (paper: ResearchPaper): string => {
    const params = new URLSearchParams();
    params.set('ctx_ver', 'Z39.88-2004');
    params.set('rft_val_fmt', 'info:ofi/fmt:kev:mtx:journal');
    params.set('rft.genre', 'article');
    params.set('rft.title', paper.title);
    params.set('rft.date', paper.year);
    
    // Split authors and add each one as a separate 'rft.au' parameter
    const authors = paper.authors.split(/, | and /);
    authors.forEach(author => {
        if (author.trim()) {
            params.append('rft.au', author.trim());
        }
    });

    return params.toString();
};

export const PaperCard: React.FC<PaperCardProps> = ({ paper, isFavorite, onToggleFavorite, onDownloadPdf, isPdfLoading, onFindConnectedPapers, isFindingConnected }) => {
  const coinsTitle = generateCoins(paper);

  return (
    <article className="bg-white p-6 rounded-lg shadow-md border border-gray-200 transition-shadow hover:shadow-lg relative">
      <div className="absolute top-4 right-4 flex items-center space-x-2">
          <button
              onClick={() => onToggleFavorite(paper)}
              className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
              <StarIcon className={`w-5 h-5 transition-colors ${isFavorite ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-400'}`} />
          </button>
          <div className="relative group">
              <button
                  className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  aria-label="Save to Zotero"
              >
                  <ZoteroIcon className="w-5 h-5 text-red-600" />
              </button>
              <div
                  className="absolute bottom-full right-0 mb-2 w-max max-w-xs px-3 py-2 text-sm font-medium text-white bg-gray-800 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  role="tooltip"
              >
                  Click the Zotero browser extension to save
                  <div className="absolute top-full right-2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-800"></div>
              </div>
          </div>
      </div>

      <h3 className="text-xl font-bold text-blue-700 pr-24">{paper.title}</h3>
      <div className="flex items-center space-x-4 text-sm text-gray-600 mt-2 mb-3">
        <p>
          <span className="font-semibold">Authors:</span> {paper.authors}
        </p>
        <span className="text-gray-300">|</span>
        <p>
          <span className="font-semibold">Year:</span> {paper.year}
        </p>
      </div>
      <FormattedSummary text={paper.summary} />
      
      {/* Hidden COinS metadata for Zotero */}
      <span className="Z3988" title={coinsTitle} style={{ display: 'none' }}></span>

      <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end items-center gap-3">
        {paper.sourceURL && (
            <a
                href={paper.sourceURL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-full hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                aria-label={`View ${paper.title} on Google Scholar`}
            >
                <ScholarIcon className="w-4 h-4" />
                <span>View on Google Scholar</span>
            </a>
        )}
        <button
            onClick={() => onFindConnectedPapers(paper)}
            disabled={isFindingConnected}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 text-sm font-medium rounded-full hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-wait"
            aria-label={`Find papers connected to ${paper.title}`}
        >
             {isFindingConnected ? (
                <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Finding...</span>
                </>
            ) : (
                <>
                    <NetworkIcon className="w-4 h-4" />
                    <span>Connected Papers</span>
                </>
            )}
        </button>
        <button
            onClick={() => onDownloadPdf(paper)}
            disabled={isPdfLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-sm font-medium rounded-full hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-wait"
            aria-label={`Download PDF for ${paper.title}`}
        >
            {isPdfLoading ? (
                <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Searching...</span>
                </>
            ) : (
                <>
                    <PdfIcon className="w-4 h-4" />
                    <span>Download PDF</span>
                </>
            )}
        </button>
      </div>
    </article>
  );
};
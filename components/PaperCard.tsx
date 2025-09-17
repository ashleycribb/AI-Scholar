
import React from 'react';
import type { ResearchPaper } from '../types';
import { ZoteroIcon } from './icons/ZoteroIcon';

interface PaperCardProps {
  paper: ResearchPaper;
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

export const PaperCard: React.FC<PaperCardProps> = ({ paper }) => {
  const coinsTitle = generateCoins(paper);

  return (
    <article className="bg-white p-6 rounded-lg shadow-md border border-gray-200 transition-shadow hover:shadow-lg relative">
      <div className="absolute top-4 right-4">
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

      <h3 className="text-xl font-bold text-blue-700 pr-12">{paper.title}</h3>
      <div className="flex items-center space-x-4 text-sm text-gray-600 mt-2 mb-3">
        <p>
          <span className="font-semibold">Authors:</span> {paper.authors}
        </p>
        <span className="text-gray-300">|</span>
        <p>
          <span className="font-semibold">Year:</span> {paper.year}
        </p>
      </div>
      <p className="text-gray-700 leading-relaxed">{paper.summary}</p>
      
      {/* Hidden COinS metadata for Zotero */}
      <span className="Z3988" title={coinsTitle} style={{ display: 'none' }}></span>
    </article>
  );
};

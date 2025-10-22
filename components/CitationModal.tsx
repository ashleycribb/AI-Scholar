

import React, { useState } from 'react';
import type { ResearchPaper, CitationStyle } from '../types';
import { ErrorMessage } from './ErrorMessage';
import { CopyIcon } from './icons/CopyIcon';
import * as apiService from '../services/apiService';
import { ZoteroIcon } from './icons/ZoteroIcon';


interface CitationGeneratorProps {
  papers: ResearchPaper[];
  onGenerate: () => void;
  isLoading: boolean;
  citations: string[];
  error: string | null;
  citationStyle: CitationStyle;
  onStyleChange: (style: CitationStyle) => void;
}

const citationStyles: { id: CitationStyle; name: string }[] = [
    { id: 'apa', name: 'APA 7' },
    { id: 'mla', name: 'MLA 9' },
    { id: 'chicago', name: 'Chicago 17' },
    { id: 'harvard', name: 'Harvard' },
    { id: 'ieee', name: 'IEEE' },
    { id: 'vancouver', name: 'Vancouver' },
];

export const CitationGenerator: React.FC<CitationGeneratorProps> = ({ 
    papers, onGenerate, isLoading, citations, error, citationStyle, onStyleChange 
}) => {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleCopy = () => {
    if (citations.length > 0) {
      navigator.clipboard.writeText(citations.join('\n\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    }
  };

  const handleExportRIS = async () => {
    if (papers.length === 0) return;
    setIsExporting(true);
    try {
        const risString = await apiService.generateRIS(papers);
        
        const blob = new Blob([risString], { type: 'application/x-research-info-systems' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'references.ris';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (err) {
        alert("Failed to generate file for Zotero. Please try again.");
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <div>
        <p className="text-sm text-gray-600 mb-4">Create a formatted reference list for the {papers.length} papers found in your search.</p>
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg border">
            <div className="flex-grow w-full">
                <label htmlFor="citation-style" className="block text-sm font-medium text-gray-700 mb-1">Citation Style</label>
                <select
                    id="citation-style"
                    value={citationStyle}
                    onChange={(e) => onStyleChange(e.target.value as CitationStyle)}
                    className="w-full pl-3 pr-10 py-2 text-base text-black border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md bg-white"
                    disabled={isLoading}
                >
                    {citationStyles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
                </select>
            </div>
            <div className="w-full sm:w-auto self-end flex flex-col sm:flex-row gap-2">
                <button
                    onClick={onGenerate}
                    disabled={isLoading || papers.length === 0}
                    className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
                >
                    {isLoading ? 'Generating...' : 'Generate List'}
                </button>
                 <button
                    onClick={handleExportRIS}
                    disabled={isExporting || papers.length === 0}
                    className="w-full sm:w-auto px-5 py-2.5 bg-orange-600 text-white font-semibold rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center gap-2"
                >
                    <ZoteroIcon className="w-4 h-4" />
                    {isExporting ? 'Exporting...' : 'Export .ris for Zotero'}
                </button>
            </div>
        </div>

        {isLoading && <div className="flex justify-center items-center py-8"><p className="text-gray-600">Generating citations...</p></div>}
        {error && <ErrorMessage message={error} />}
        
        {!isLoading && citations.length > 0 && (
            <div>
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-gray-800">Generated References</h3>
                    <button 
                      onClick={handleCopy} 
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-full hover:bg-gray-200"
                    >
                        <CopyIcon className="w-4 h-4" /> 
                        {copied ? 'Copied!' : 'Copy List'}
                    </button>
                </div>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-800 leading-relaxed max-h-80 overflow-y-auto">
                    <ol className="space-y-3">
                        {citations.map((citation, index) => (
                            <li key={index} className="pl-5 -indent-5" dangerouslySetInnerHTML={{ __html: citation }} />
                        ))}
                    </ol>
                </div>
            </div>
        )}
    </div>
  );
};
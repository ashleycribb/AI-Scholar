
import React, { useState, useEffect, useCallback } from 'react';
import type { ResearchPaper, CitationStyle, ModelDefinition } from '../types';
import * as citationService from '../services/citationService';
import { ErrorMessage } from './ErrorMessage';
import { LoadingSpinner } from './LoadingSpinner';
import { CitationIcon } from './icons/CitationIcon';
import { CopyIcon } from './icons/CopyIcon';
import { ZoteroIcon } from './icons/ZoteroIcon';

interface CitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  paper: ResearchPaper | null;
  model: ModelDefinition;
}

const citationStyles: { id: CitationStyle; name: string }[] = [
    { id: 'apa', name: 'APA 7' },
    { id: 'mla', name: 'MLA 9' },
    { id: 'chicago', name: 'Chicago 17' },
    { id: 'harvard', name: 'Harvard' },
    { id: 'ieee', name: 'IEEE' },
    { id: 'vancouver', name: 'Vancouver' },
];

export const CitationModal: React.FC<CitationModalProps> = ({ isOpen, onClose, paper, model }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [citation, setCitation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('apa');
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleGenerate = useCallback(async (style: CitationStyle) => {
    if (!paper) return;
    setIsLoading(true);
    setError(null);
    setCitation(null);
    try {
      const result = await citationService.generateCitations([paper], style, model);
      setCitation(result[0] || null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [paper, model]);

  useEffect(() => {
    if (isOpen && paper) {
      handleGenerate(citationStyle);
    }
  }, [isOpen, paper, citationStyle, handleGenerate]);

  const handleCopy = () => {
    if (citation) {
      const plainText = citation.replace(/<[^>]*>?/gm, '');
      navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportRIS = async () => {
    if (!paper) return;
    setIsExporting(true);
    try {
        const risString = await citationService.generateRIS([paper], model);
        const blob = new Blob([risString], { type: 'application/x-research-info-systems' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${paper.title.substring(0, 20).replace(/\s/g, '_')}.ris`;
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
  
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="citation-modal-title"
    >
      <div
        className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transform border"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-card rounded-t-xl z-10">
           <div className="flex items-center gap-3">
             <div className="flex-shrink-0 bg-blue-100 text-blue-600 p-2 rounded-full">
                <CitationIcon className="w-6 h-6" />
             </div>
             <div>
                <h2 id="citation-modal-title" className="text-xl font-bold text-foreground">
                    Generate Citation
                </h2>
                {paper && <p className="text-sm text-muted-foreground mt-1 truncate">{paper.title}</p>}
             </div>
           </div>
           <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-accent rounded-full">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
        </header>

        <main className="p-6 overflow-y-auto">
            <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
                <label htmlFor="citation-style-modal" className="text-sm font-medium text-foreground flex-shrink-0">Citation Style</label>
                <select
                    id="citation-style-modal"
                    value={citationStyle}
                    onChange={(e) => setCitationStyle(e.target.value as CitationStyle)}
                    className="w-full h-10 pl-3 pr-10 text-base text-foreground border-input rounded-md bg-background focus:ring-2 focus:ring-ring"
                    disabled={isLoading}
                >
                    {citationStyles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
                </select>
            </div>

            <div className="min-h-[120px]">
                {isLoading && <LoadingSpinner message="Generating citation..." />}
                {error && <ErrorMessage message={error} />}
                {citation && !isLoading && (
                    <div
                        className="p-4 bg-muted/50 border border-border rounded-md text-sm text-foreground leading-relaxed prose max-w-none"
                        dangerouslySetInnerHTML={{ __html: citation }}
                    />
                )}
            </div>
        </main>
        
        <footer className="p-4 border-t border-border bg-muted/50 rounded-b-xl flex justify-end gap-2">
            <button
                onClick={handleExportRIS}
                disabled={isExporting || !citation}
                title="Export as .ris for Zotero, Mendeley, etc."
                className="h-9 px-4 text-sm font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-accent disabled:opacity-50 flex items-center gap-2"
            >
                <ZoteroIcon className="w-4 h-4" />
                <span>{isExporting ? 'Exporting...' : 'Export .ris'}</span>
            </button>
            <button
                onClick={handleCopy}
                disabled={!citation}
                className="h-9 w-28 text-sm font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
                <CopyIcon className="w-4 h-4" />
                <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
        </footer>
      </div>
    </div>
  );
};

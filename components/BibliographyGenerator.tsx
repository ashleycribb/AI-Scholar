
import React, { useState, useEffect, useCallback } from 'react';
import type { ResearchPaper, CitationStyle, ModelDefinition } from '../types';
import { ErrorMessage } from './ErrorMessage';
import { CopyIcon } from './icons/CopyIcon';
import * as citationService from '../services/citationService';
import { SafeHTML } from './SafeHTML';
import { ZoteroIcon } from './icons/ZoteroIcon';

interface BibliographyGeneratorProps {
  papers: ResearchPaper[];
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

export const BibliographyGenerator: React.FC<BibliographyGeneratorProps> = ({ papers, model }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [citations, setCitations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('apa');
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleGenerate = useCallback(async (style: CitationStyle) => {
    if (papers.length === 0) return;
    setIsLoading(true);
    setError(null);
    setCitations([]);
    try {
      const result = await citationService.generateCitations(papers, style, model);
      setCitations(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [papers, model]);

  useEffect(() => {
    handleGenerate(citationStyle);
  }, [citationStyle, papers, handleGenerate]);

  const handleCopy = () => {
    if (citations.length > 0) {
      const plainText = citations.map(c => c.replace(/<[^>]*>?/gm, '')).join('\n\n');
      navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportRIS = async () => {
    if (papers.length === 0) return;
    setIsExporting(true);
    try {
        const risString = await citationService.generateRIS(papers, model);
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

  if (papers.length === 0) {
    return (
        <div className="text-center py-10">
            <h3 className="text-lg font-semibold text-foreground">No Search Results</h3>
            <p className="text-muted-foreground mt-2">
                Perform a search to generate a bibliography for the results.
            </p>
        </div>
    );
  }

  return (
    <div>
        <h3 className="text-lg font-bold text-foreground mb-3">Bibliography</h3>
        <p className="text-sm text-muted-foreground mb-4">A formatted reference list for all {papers.length} paper(s) in the current search results.</p>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6 p-4 bg-muted/50 rounded-lg border">
            <div className="flex-grow w-full">
                <label htmlFor="citation-style" className="block text-sm font-medium text-foreground mb-1">Citation Style</label>
                <select
                    id="citation-style"
                    value={citationStyle}
                    onChange={(e) => setCitationStyle(e.target.value as CitationStyle)}
                    className="w-full h-10 pl-3 pr-10 py-2 text-base text-foreground border-input focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm rounded-md bg-background"
                    disabled={isLoading}
                >
                    {citationStyles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
                </select>
            </div>
            <div className="w-full sm:w-auto self-end flex items-center gap-2">
                 <button
                    onClick={handleExportRIS}
                    disabled={isExporting || papers.length === 0}
                    title="Export as .ris for Zotero, Mendeley, etc."
                    className="w-full sm:w-auto h-10 px-5 bg-secondary text-secondary-foreground font-semibold rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 transition-colors duration-200 flex items-center justify-center gap-2"
                >
                    <ZoteroIcon className="w-4 h-4" />
                    <span>{isExporting ? 'Exporting...' : 'Export .ris'}</span>
                </button>
            </div>
        </div>

        {isLoading && <div className="flex justify-center items-center py-8"><p className="text-muted-foreground">Generating citations...</p></div>}
        {error && <ErrorMessage message={error} />}
        
        {!isLoading && citations.length > 0 && (
            <div>
                <div className="flex justify-between items-center mb-3">
                    <h4 className="font-semibold text-foreground">Generated References</h4>
                    <button 
                      onClick={handleCopy} 
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-secondary-foreground bg-secondary rounded-full hover:bg-accent"
                    >
                        <CopyIcon className="w-4 h-4" /> 
                        {copied ? 'Copied!' : 'Copy List'}
                    </button>
                </div>
                <div className="p-4 bg-muted/50 border border-border rounded-md text-sm text-foreground leading-relaxed max-h-96 overflow-y-auto">
                    <ol className="space-y-3">
                        {citations.map((citation, index) => (
                            <SafeHTML
                                as="li"
                                key={index}
                                className="pl-5 -indent-5"
                                html={citation}
                            />
                        ))}
                    </ol>
                </div>
            </div>
        )}
    </div>
  );
};

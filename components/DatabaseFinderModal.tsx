

import React, { useState } from 'react';
import type { SearchSourceInfo } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';
import { DatabaseIcon } from './icons/DatabaseIcon';
import { AddIcon } from './icons/AddIcon';

interface DatabaseFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSource: (source: SearchSourceInfo) => void;
  existingSources: SearchSourceInfo[];
}

// In a real implementation, this would call out to an AI service.
// For now, it's a mock to demonstrate the UI and architecture.
const findDatabasesForField = async (field: string): Promise<SearchSourceInfo[]> => {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
    
    // Hardcoded results for demonstration
    return [
        {
            id: 'openalex',
            name: 'OpenAlex',
            description: 'A comprehensive open index of scholarly works, authors, institutions, and more.'
        },
        {
            id: 'arxiv',
            name: 'arXiv',
            description: 'An open-access archive for scholarly articles in physics, mathematics, computer science, and related fields.'
        },
        {
            id: 'pubmed',
            name: 'PubMed',
            description: 'Comprises more than 36 million citations for biomedical literature from MEDLINE, life science journals, and online books.'
        }
    ];
};

export const DatabaseFinderModal: React.FC<DatabaseFinderModalProps> = ({
  isOpen,
  onClose,
  onAddSource,
  existingSources
}) => {
  const [fieldOfStudy, setFieldOfStudy] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchSourceInfo[]>([]);

  if (!isOpen) {
    return null;
  }

  const handleFindDatabases = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldOfStudy.trim()) return;

    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      const foundDatabases = await findDatabasesForField(fieldOfStudy);
      setResults(foundDatabases);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddClick = (source: SearchSourceInfo) => {
    onAddSource(source);
  };

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="db-finder-modal-title"
    >
      <div
        className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all border"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-border sticky top-0 bg-card rounded-t-xl z-10">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 text-muted-foreground hover:bg-accent rounded-full"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <DatabaseIcon className="w-7 h-7 text-primary" />
            <div>
              <h2 id="db-finder-modal-title" className="text-xl font-bold text-foreground">
                Find Academic Databases
              </h2>
              <p className="text-sm text-muted-foreground">Discover specialized sources for your field of study.</p>
            </div>
          </div>
        </header>

        <main className="p-6 overflow-y-auto">
          <form onSubmit={handleFindDatabases} className="flex items-center gap-2 mb-6">
            <input
              type="text"
              value={fieldOfStudy}
              onChange={(e) => setFieldOfStudy(e.target.value)}
              placeholder="e.g., Computational Linguistics, Marine Biology"
              className="w-full px-4 h-10 bg-background border border-input rounded-md focus:ring-2 focus:ring-ring"
              disabled={isLoading}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isLoading || !fieldOfStudy.trim()}
              className="h-10 px-5 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? 'Finding...' : 'Find'}
            </button>
          </form>

          {isLoading && <LoadingSpinner />}
          {error && <ErrorMessage message={error} />}

          {results.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">Recommended Databases for "{fieldOfStudy}"</h3>
              {results.map((db, index) => {
                const isExisting = existingSources.some(s => s.id === db.id);
                return (
                  <div key={index} className="bg-muted/50 border border-border p-4 rounded-lg flex items-center justify-between gap-4">
                    <div className="flex-grow">
                      <h4 className="font-bold text-foreground">{db.name}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{db.description}</p>
                    </div>
                    <button
                      onClick={() => handleAddClick(db)}
                      disabled={isExisting}
                      className="flex-shrink-0 flex items-center gap-1.5 h-9 px-4 bg-secondary text-secondary-foreground text-sm font-semibold rounded-md hover:bg-accent disabled:bg-accent disabled:text-muted-foreground disabled:cursor-not-allowed"
                    >
                      {isExisting ? 'Added' : <><AddIcon className="w-4 h-4" /> Add to Search</>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

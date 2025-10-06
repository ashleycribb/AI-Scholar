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
  findDatabasesForField: (field: string) => Promise<SearchSourceInfo[]>;
  existingSources: SearchSourceInfo[];
}

export const DatabaseFinderModal: React.FC<DatabaseFinderModalProps> = ({
  isOpen,
  onClose,
  onAddSource,
  findDatabasesForField,
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
      className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="db-finder-modal-title"
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
            <DatabaseIcon className="w-7 h-7 text-blue-600" />
            <div>
              <h2 id="db-finder-modal-title" className="text-xl font-bold text-gray-800">
                Find Academic Databases
              </h2>
              <p className="text-sm text-gray-500">Discover specialized sources for your field of study.</p>
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
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200"
              disabled={isLoading}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isLoading || !fieldOfStudy.trim()}
              className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {isLoading ? 'Finding...' : 'Find'}
            </button>
          </form>

          {isLoading && <LoadingSpinner />}
          {error && <ErrorMessage message={error} />}

          {results.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-700">Recommended Databases for "{fieldOfStudy}"</h3>
              {results.map((db, index) => {
                const isExisting = existingSources.some(s => s.name.toLowerCase() === db.name.toLowerCase());
                return (
                  <div key={index} className="bg-gray-50 border border-gray-200 p-4 rounded-lg flex items-center justify-between gap-4">
                    <div className="flex-grow">
                      <h4 className="font-bold text-gray-900">{db.name}</h4>
                      <p className="text-sm text-gray-600 mt-1">{db.description}</p>
                    </div>
                    <button
                      onClick={() => handleAddClick(db)}
                      disabled={isExisting}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-full hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
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

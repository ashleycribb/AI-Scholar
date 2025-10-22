
import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';
import type { SynthesisResult } from '../types';
import { SynthesisIcon } from './icons/SynthesisIcon';

interface SynthesisModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  result: SynthesisResult | null;
  error: string | null;
}

export const SynthesisModal: React.FC<SynthesisModalProps> = ({ isOpen, onClose, isLoading, result, error }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="synthesis-modal-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white rounded-t-xl z-10">
          <div className="flex items-center gap-3">
             <div className="flex-shrink-0 bg-teal-100 text-teal-600 p-2 rounded-full">
                <SynthesisIcon className="w-6 h-6" />
             </div>
             <div>
                <h2 id="synthesis-modal-title" className="text-xl font-bold text-gray-800">
                  Synthesized Insights
                </h2>
                <p className="text-sm text-gray-500">A comparative overview of the research papers found.</p>
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

        <main className="p-6 overflow-y-auto">
          {isLoading && <LoadingSpinner />}
          {error && <ErrorMessage message={error} />}
          {result && !isLoading && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-2/5">
                      Paper Title
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-2/5">
                      Main Finding
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">
                      Methodology
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">
                      Context / Sample
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {result.map((paper, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900">{paper.title}</td>
                      <td className="px-6 py-4 whitespace-normal text-sm text-gray-600">{paper.mainFinding}</td>
                      <td className="px-6 py-4 whitespace-normal text-sm text-gray-600">{paper.methodology}</td>
                      <td className="px-6 py-4 whitespace-normal text-sm text-gray-600">{paper.context}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

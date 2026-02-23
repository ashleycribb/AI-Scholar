

import React, { useState } from 'react';
import type { ResearchPaper, PaperAnalysis } from '../types';
import type { ImplementationPlan } from '../services/implementationService';
import { ErrorMessage } from './ErrorMessage';
import { AnalyzeIcon } from './icons/AnalyzeIcon';
import { LoadingSpinner } from './LoadingSpinner';
import { DoiIcon } from './icons/DoiIcon';
import { ExternalLinkIcon } from './icons/ExternalLinkIcon';
import { CheckIcon } from './icons/CheckIcon';
import { CodeIcon } from './icons/CodeIcon';

interface PaperAnalysisModalProps {
  isOpen: boolean;
  result: {
    paper: ResearchPaper;
    analysis: PaperAnalysis;
  } | null;
  onClose: () => void;
  error: string | null;
  isLoading: boolean;
  onSaveAnalysis: (paper: ResearchPaper, analysis: PaperAnalysis) => void;
  isAnalysisSaved: boolean;

  // New props for Implementation Planning
  onGenerateImplementationPlan: (paper: ResearchPaper) => void;
  isGeneratingPlan: boolean;
  implementationPlan: ImplementationPlan | undefined;
  planError: string | null;
}

const AnalysisSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div>
        <h4 className="text-md font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h4>
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg text-gray-700">
            {children}
        </div>
    </div>
);

const ImplementationView: React.FC<{ plan: ImplementationPlan }> = ({ plan }) => (
    <div className="space-y-6">
        <AnalysisSection title="Implementation Overview">
            <p>{plan.overview}</p>
        </AnalysisSection>

        <AnalysisSection title="Proposed File Structure">
            <div className="font-mono text-sm bg-slate-900 text-slate-50 p-4 rounded-md overflow-x-auto">
                {plan.fileStructure.map((file, idx) => (
                    <div key={idx} className="mb-2">
                        <span className="text-green-400">{file.path}</span>
                        <span className="text-slate-500 mx-2">#</span>
                        <span className="text-slate-400 italic">{file.description}</span>
                    </div>
                ))}
            </div>
        </AnalysisSection>

        <AnalysisSection title="Dependencies">
            <div className="flex flex-wrap gap-2">
                {plan.dependencies.map((dep, idx) => (
                    <span key={idx} className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded border border-blue-200">
                        {dep}
                    </span>
                ))}
            </div>
        </AnalysisSection>

        <AnalysisSection title="Step-by-Step Implementation Guide">
            <div className="space-y-4">
                {plan.steps.map((step) => (
                    <div key={step.stepNumber} className="border-l-4 border-blue-500 pl-4 py-1">
                        <h5 className="font-bold text-gray-800">Step {step.stepNumber}: {step.title}</h5>
                        <p className="text-gray-600 mt-1 text-sm">{step.instruction}</p>
                    </div>
                ))}
            </div>
        </AnalysisSection>
    </div>
);

export const PaperAnalysisModal: React.FC<PaperAnalysisModalProps> = ({
    isOpen, result, onClose, error, isLoading, onSaveAnalysis, isAnalysisSaved,
    onGenerateImplementationPlan, isGeneratingPlan, implementationPlan, planError
}) => {
  const [activeTab, setActiveTab] = useState<'analysis' | 'implementation'>('analysis');

  if (!isOpen) return null;
  if (!result) return null;

  const { paper, analysis } = result;

  return (
    <div
      className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paper-analysis-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-gray-200 bg-white rounded-t-xl z-10">
            <div className="p-5 relative">
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
                    <div className="flex-shrink-0 bg-green-100 text-green-600 p-2 rounded-full">
                        <AnalyzeIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 id="paper-analysis-title" className="text-xl font-bold text-gray-800">
                            Research Assistant
                        </h2>
                        <p className="text-blue-700 font-semibold mt-1 text-sm truncate max-w-lg">{paper.title}</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex px-5 gap-6">
                <button
                    onClick={() => setActiveTab('analysis')}
                    className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'analysis' ? 'border-green-500 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Analysis & Findings
                </button>
                <button
                    onClick={() => setActiveTab('implementation')}
                    className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'implementation' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <CodeIcon className="w-4 h-4" />
                    Implementation Planner
                </button>
            </div>
        </header>
        
        <main className="p-6 overflow-y-auto min-h-[400px]">
          {activeTab === 'analysis' ? (
              isLoading ? (
                <LoadingSpinner message="Analyzing paper..." />
              ) : error ? (
                <ErrorMessage message={error} />
              ) : (
                analysis && Object.keys(analysis).length > 0 && (
                    <div className="space-y-5">
                      <AnalysisSection title="Research Question">
                        <p>{analysis.researchQuestion}</p>
                      </AnalysisSection>

                      <AnalysisSection title="Methodology">
                        <p>{analysis.methodology}</p>
                      </AnalysisSection>

                      <AnalysisSection title="Key Findings">
                        <ul className="list-disc list-inside space-y-1">
                          {analysis.keyFindings.map((finding, index) => (
                            <li key={index}>{finding}</li>
                          ))}
                        </ul>
                      </AnalysisSection>

                      <AnalysisSection title="Potential Limitations">
                         <ul className="list-disc list-inside space-y-1">
                          {analysis.limitations.map((limitation, index) => (
                            <li key={index}>{limitation}</li>
                          ))}
                        </ul>
                      </AnalysisSection>
    
                      {paper.doi && (
                        <AnalysisSection title="DOI">
                            <a
                                href={`https://doi.org/${paper.doi}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                            >
                                <DoiIcon className="w-4 h-4" />
                                <span>{paper.doi}</span>
                                <ExternalLinkIcon className="w-3 h-3 text-muted-foreground" />
                            </a>
                        </AnalysisSection>
                      )}
                    </div>
                )
              )
          ) : (
              // Implementation Tab Content
              <div className="h-full">
                  {!implementationPlan && !isGeneratingPlan ? (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-10">
                          <div className="bg-blue-50 p-4 rounded-full">
                              <CodeIcon className="w-12 h-12 text-blue-500" />
                          </div>
                          <div>
                              <h3 className="text-lg font-semibold text-gray-800">Generate Implementation Plan</h3>
                              <p className="text-gray-500 max-w-sm mx-auto mt-2">
                                  Use AI to break down this paper into a practical coding strategy, including file structure, dependencies, and a step-by-step guide.
                              </p>
                          </div>
                          <button
                              onClick={() => onGenerateImplementationPlan(paper)}
                              className="mt-4 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                          >
                              <CodeIcon className="w-5 h-5" />
                              Generate Plan
                          </button>
                      </div>
                  ) : isGeneratingPlan ? (
                      <LoadingSpinner message="Generating implementation plan... This may take a moment." />
                  ) : planError ? (
                      <ErrorMessage message={planError} />
                  ) : implementationPlan ? (
                      <ImplementationView plan={implementationPlan} />
                  ) : null}
              </div>
          )}
        </main>
        
        <footer className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-between items-center">
            <div className="text-xs text-gray-400 italic">
                {activeTab === 'implementation' ? 'Inspired by HKUDS/DeepCode' : 'AI Analysis'}
            </div>

            {activeTab === 'analysis' && !isLoading && !error && analysis && (
                <button
                    onClick={() => onSaveAnalysis(paper, analysis)}
                    disabled={isAnalysisSaved}
                    className={`flex items-center gap-2 h-9 px-4 rounded-md text-sm font-semibold transition-colors ${
                        isAnalysisSaved 
                        ? 'bg-green-100 text-green-800 cursor-default' 
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                >
                    {isAnalysisSaved ? (
                        <>
                            <CheckIcon className="w-4 h-4" />
                            <span>Analysis Saved</span>
                        </>
                    ) : (
                        'Save Analysis'
                    )}
                </button>
            )}
        </footer>
      </div>
    </div>
  );
};

import React, { useState, useCallback, useRef } from 'react';
import { SearchForm } from './components/SearchForm';
import { ResultsDisplay } from './components/ResultsDisplay';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { AnalysisDisplay } from './components/AnalysisDisplay';
import { fetchResearchPapers, analyzeAndClusterPapers, generateCitations } from './services/geminiService';
import type { ResearchPaper, Source, SummaryLength, AnalysisResult } from './types';
import { ScholarIcon } from './components/icons/ScholarIcon';
import { ReferenceList } from './components/ReferenceList';

// Interface for our cache entry
interface CacheEntry {
  papers: ResearchPaper[];
  citations: string[];
  timestamp: number;
}

const App: React.FC = () => {
  const [query, setQuery] = useState<string>('');
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [summaryLength, setSummaryLength] = useState<SummaryLength>('medium');
  
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [citations, setCitations] = useState<string[]>([]);
  const [isCiting, setIsCiting] = useState<boolean>(false);
  const [citationError, setCitationError] = useState<string | null>(null);

  // Client-side cache for search results
  const searchCache = useRef<Map<string, CacheEntry>>(new Map());
  const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes


  const parseGeminiResponse = (text: string): ResearchPaper[] => {
    if (!text || !text.trim()) {
      return [];
    }
  
    return text.split('---')
      .map(block => {
        const lines = block.trim().split('\n');
        const paper: Partial<ResearchPaper> = {};
  
        let summaryBuffer = '';
        let isReadingSummary = false;
  
        lines.forEach(line => {
          if (line.startsWith('**Title:**')) {
            paper.title = line.substring('**Title:**'.length).trim();
            isReadingSummary = false;
          } else if (line.startsWith('**Authors:**')) {
            paper.authors = line.substring('**Authors:**'.length).trim();
            isReadingSummary = false;
          } else if (line.startsWith('**Year:**')) {
            paper.year = line.substring('**Year:**'.length).trim();
            isReadingSummary = false;
          } else if (line.startsWith('**SourceURL:**')) {
            paper.sourceURL = line.substring('**SourceURL:**'.length).trim();
            isReadingSummary = false;
          } else if (line.startsWith('**Summary:**')) {
            summaryBuffer = line.substring('**Summary:**'.length).trim();
            isReadingSummary = true;
          } else if (isReadingSummary) {
            summaryBuffer += ' ' + line.trim();
          }
        });
  
        paper.summary = summaryBuffer;
  
        return paper as ResearchPaper;
      })
      .filter(p => p.title && p.authors && p.year && p.summary);
  };
  
  const handleGenerateCitations = useCallback(async (papersToCite: ResearchPaper[]): Promise<string[]> => {
    if (papersToCite.length === 0) return [];
    setIsCiting(true);
    setCitationError(null);
    try {
        const generatedCitations = await generateCitations(papersToCite);
        setCitations(generatedCitations);
        return generatedCitations; // Return for caching
    } catch (err) {
        setCitationError(err instanceof Error ? err.message : 'An unknown error occurred while generating citations.');
        return []; // Return empty array on error
    } finally {
        setIsCiting(false);
    }
  }, []);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    const cacheKey = searchQuery.trim().toLowerCase();
    const cachedData = searchCache.current.get(cacheKey);

    // Check for a valid, non-expired cache entry
    if (cachedData && (Date.now() - cachedData.timestamp < CACHE_DURATION_MS)) {
      setQuery(searchQuery);
      setPapers(cachedData.papers);
      setCitations(cachedData.citations);
      setHasSearched(true);
      setError(null);
      setIsLoading(false);
      setAnalysisResult(null);
      setAnalysisError(null);
      setCitationError(null);
      return; // Use cached data and skip API call
    }

    // Reset state for a new search
    setQuery(searchQuery);
    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setPapers([]);
    setAnalysisResult(null);
    setAnalysisError(null);
    setCitations([]);
    setCitationError(null);

    try {
      const result = await fetchResearchPapers(searchQuery, summaryLength);
      if (result) {
        const parsedPapers = parseGeminiResponse(result.text);
        setPapers(parsedPapers);
        
        let newCitations: string[] = [];
        if (parsedPapers.length > 0) {
            newCitations = await handleGenerateCitations(parsedPapers);
        }

        // Add new result to the cache
        searchCache.current.set(cacheKey, {
          papers: parsedPapers,
          citations: newCitations,
          timestamp: Date.now(),
        });

        if (parsedPapers.length === 0 && !result.text) {
          setError("The model returned an empty response. Please try refining your search query.");
        } else if (parsedPapers.length === 0 && result.text) {
          setError("Couldn't parse the research papers from the response. The model may have returned a non-standard format.");
        }
      } else {
        setError("Failed to get a valid response from the research service.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [summaryLength, handleGenerateCitations, CACHE_DURATION_MS]);
  
  const handleAnalysis = useCallback(async () => {
    if (papers.length === 0) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    
    try {
        const result = await analyzeAndClusterPapers(papers);
        setAnalysisResult(result);
    } catch(err) {
        setAnalysisError(err instanceof Error ? err.message : 'An unknown error occurred during analysis.');
    } finally {
        setIsAnalyzing(false);
    }
  }, [papers]);


  return (
    <div className="min-h-screen font-sans text-gray-800 antialiased">
      <main className="container mx-auto max-w-4xl px-4 py-8 md:py-12">
        <header className="flex flex-col items-center text-center mb-8">
          <div className="bg-blue-600 text-white p-3 rounded-full mb-4 shadow-md">
            <ScholarIcon className="w-8 h-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
            AI Research Assistant
          </h1>
          <p className="mt-2 text-md text-gray-600 max-w-2xl">
            Enter a topic, keyword, or author to discover and summarize relevant academic literature from Google Scholar.
          </p>
        </header>

        <div className="sticky top-4 z-10 bg-gray-50/80 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-gray-200">
           <SearchForm 
             onSearch={handleSearch} 
             isLoading={isLoading} 
             summaryLength={summaryLength}
             onLengthChange={setSummaryLength}
           />
        </div>
       
        <div className="mt-8">
          {isLoading && <LoadingSpinner />}
          {error && <ErrorMessage message={error} />}
          
          {!isLoading && !error && hasSearched && papers.length === 0 && (
            <div className="text-center py-12">
              <h3 className="text-xl font-semibold text-gray-700">No Results Found</h3>
              <p className="text-gray-500 mt-2">Your search for "{query}" did not return any parsable results. Please try a different or more specific query.</p>
            </div>
          )}

          {papers.length > 0 && (
            <>
              <ResultsDisplay papers={papers} />
              <ReferenceList 
                citations={citations} 
                isLoading={isCiting}
                error={citationError}
              />

              {!analysisResult && (
                <div className="mt-8 text-center">
                    <button
                        onClick={handleAnalysis}
                        disabled={isAnalyzing}
                        className="px-6 py-3 bg-green-600 text-white font-semibold rounded-full hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                        {isAnalyzing ? 'Analyzing...' : 'Visualize & Cluster Results'}
                    </button>
                </div>
              )}
            </>
          )}

          {isAnalyzing && <LoadingSpinner />}
          {analysisError && <ErrorMessage message={analysisError} />}
          {analysisResult && <AnalysisDisplay papers={papers} result={analysisResult} />}

          {!hasSearched && !isLoading && (
             <div className="text-center py-16 px-6 bg-white rounded-lg border border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">Ready to start your research?</h2>
                <p className="mt-2 text-gray-500">
                  Simply type your research query above and let our AI assistant do the heavy lifting.
                </p>
            </div>
          )}
        </div>
      </main>
      <footer className="text-center py-6 text-sm text-gray-500">
        <p>Powered by Gemini. For academic research purposes.</p>
      </footer>
    </div>
  );
};

export default App;

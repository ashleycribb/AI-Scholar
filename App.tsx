import React, { useState, useCallback, useRef } from 'react';
import { SearchForm } from './components/SearchForm';
import { ResultsDisplay } from './components/ResultsDisplay';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { AnalysisDisplay } from './components/AnalysisDisplay';
import { fetchResearchPapers, analyzeAndClusterPapers, generateCitations, ApiError, ParsingError, ai } from './services/geminiService';
import type { ResearchPaper, SummaryLength, AnalysisResult, SearchSource, AdvancedSearchOptions, ChatMessage, SummaryStyle } from './types';
import { ScholarIcon } from './components/icons/ScholarIcon';
import { ReferenceList } from './components/ReferenceList';
import { ChatPanel } from './components/ChatPanel';
import type { Chat } from '@google/genai';


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
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>('paragraph');
  const [searchSource, setSearchSource] = useState<SearchSource>('google_scholar');
  
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [citations, setCitations] = useState<string[]>([]);
  const [isCiting, setIsCiting] = useState<boolean>(false);
  const [citationError, setCitationError] = useState<string | null>(null);

  // Chat state
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Client-side cache for search results
  const searchCache = useRef<Map<string, CacheEntry>>(new Map());
  const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes


  const parseGeminiResponse = (text: string): ResearchPaper[] => {
    if (!text || !text.trim()) {
      return [];
    }

    const papers: ResearchPaper[] = [];
    const paperBlocks = text.split('---');

    for (const block of paperBlocks) {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) continue;

      const paper: Partial<ResearchPaper> = {};
      // This regex finds all fields in the block, handling different ordering and multi-line values.
      const fieldRegex = /\*\*([A-Za-z]+):\*\*\s*([\s\S]*?)(?=\s*\*\*[A-Za-z]+:\*\*|$)/gi;
      
      let match;
      while ((match = fieldRegex.exec(trimmedBlock)) !== null) {
        const key = match[1].toLowerCase();
        const value = match[2].trim();
        
        switch (key) {
          case 'title':
            paper.title = value.split('\n')[0].trim();
            break;
          case 'authors':
            paper.authors = value.split('\n')[0].trim();
            break;
          case 'year':
            paper.year = value.split('\n')[0].trim();
            break;
          case 'sourceurl':
            paper.sourceURL = value.split('\n')[0].trim();
            break;
          case 'summary':
            paper.summary = value; // Keep multi-line content
            break;
        }
      }

      // Ensure all essential fields were found before adding the paper
      if (paper.title && paper.authors && paper.year && paper.summary) {
        papers.push(paper as ResearchPaper);
      }
    }

    return papers;
  };

  const initializeChatSession = (foundPapers: ResearchPaper[]) => {
    if (foundPapers.length === 0) {
        setChatSession(null);
        return;
    }
    const paperContext = foundPapers.map(p => `Title: ${p.title}\nSummary: ${p.summary}`).join('\n\n');
    const systemInstruction = `You are an AI research assistant. The user has just found the following academic papers. Your task is to answer the user's questions based on the summaries of these papers. Be concise and helpful. Do not mention that you are basing your answer on the summaries unless the user asks. Here are the papers:\n\n${paperContext}`;

    const newChat: Chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: systemInstruction,
        },
    });

    setChatSession(newChat);
    setChatHistory([]);
    setChatError(null);
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
        if (err instanceof ParsingError || err instanceof ApiError) {
            setCitationError(err.message);
        } else if (err instanceof Error) {
            setCitationError(`An unexpected client-side error occurred: ${err.message}`);
        } else {
            setCitationError('An unknown error occurred while generating citations.');
        }
        return []; // Return empty array on error
    } finally {
        setIsCiting(false);
    }
  }, []);

  const handleSearch = useCallback(async (searchQuery: string, advancedOptions: AdvancedSearchOptions) => {
    if (!searchQuery.trim()) return;

    const cacheKey = `${searchQuery.trim().toLowerCase()}|${searchSource}|${summaryLength}|${summaryStyle}|${advancedOptions.startYear}-${advancedOptions.endYear}|${advancedOptions.authors}|${advancedOptions.excludeKeywords}`;
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
      initializeChatSession(cachedData.papers);
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
    setChatSession(null);
    setChatHistory([]);

    try {
      const result = await fetchResearchPapers(searchQuery, summaryLength, summaryStyle, searchSource, advancedOptions);
      if (result) {
        const parsedPapers = parseGeminiResponse(result.text);
        setPapers(parsedPapers);
        initializeChatSession(parsedPapers);
        
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
        if (err instanceof ApiError) {
            setError(err.message);
        } else if (err instanceof Error) {
            setError(`An unexpected error occurred: ${err.message}`);
        } else {
            setError('An unknown error occurred during the search.');
        }
    } finally {
      setIsLoading(false);
    }
  }, [summaryLength, summaryStyle, searchSource, handleGenerateCitations, CACHE_DURATION_MS]);
  
  const handleAnalysis = useCallback(async () => {
    if (papers.length === 0) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    
    try {
        const result = await analyzeAndClusterPapers(papers);
        setAnalysisResult(result);
    } catch(err) {
        if (err instanceof ParsingError || err instanceof ApiError) {
            setAnalysisError(err.message);
        } else if (err instanceof Error) {
            setAnalysisError(`An unexpected client-side error occurred: ${err.message}`);
        } else {
            setAnalysisError('An unknown error occurred during analysis.');
        }
    } finally {
        setIsAnalyzing(false);
    }
  }, [papers]);

  const handleSendMessage = useCallback(async (message: string) => {
    if (!chatSession) return;

    setIsChatting(true);
    setChatError(null);

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: message }] };
    setChatHistory(prev => [...prev, userMessage]);

    try {
        const stream = await chatSession.sendMessageStream({ message });
        let modelResponse = '';
        
        // Add a placeholder for the model's response
        setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);

        for await (const chunk of stream) {
            modelResponse += chunk.text;
            setChatHistory(prev => {
                const newHistory = [...prev];
                newHistory[newHistory.length - 1] = { role: 'model', parts: [{ text: modelResponse }] };
                return newHistory;
            });
        }
    } catch (err) {
        console.error("Chat error:", err);
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setChatError(`Sorry, I couldn't get a response. ${errorMessage}`);
        // Remove the empty model message placeholder on error
        setChatHistory(prev => prev.filter(m => m.parts[0].text !== ''));
    } finally {
        setIsChatting(false);
    }
  }, [chatSession]);


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
            Enter a topic, keyword, or author to discover and summarize relevant academic literature from premier academic sources.
          </p>
        </header>

        <div className="sticky top-4 z-10 bg-gray-50/80 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-gray-200">
           <SearchForm 
             onSearch={handleSearch} 
             isLoading={isLoading} 
             summaryLength={summaryLength}
             onLengthChange={setSummaryLength}
             summaryStyle={summaryStyle}
             onStyleChange={setSummaryStyle}
             searchSource={searchSource}
             onSourceChange={setSearchSource}
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

              {chatSession && (
                <ChatPanel
                    history={chatHistory}
                    isLoading={isChatting}
                    error={chatError}
                    onSendMessage={handleSendMessage}
                />
              )}

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
import React, { useState, useCallback, useRef } from 'react';
import { SearchForm } from './components/SearchForm';
import { ResultsDisplay } from './components/ResultsDisplay';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { AnalysisDisplay } from './components/AnalysisDisplay';
import { fetchResearchPapers, analyzeAndClusterPapers, generateCitations, findPdfLink, findConnectedPapers, ApiError, ParsingError, ai } from './services/geminiService';
import type { ResearchPaper, SummaryLength, AnalysisResult, SearchSource, AdvancedSearchOptions, ChatMessage, SummaryStyle, ConnectedPaper } from './types';
import { ScholarIcon } from './components/icons/ScholarIcon';
import { ReferenceList } from './components/ReferenceList';
import { ChatPanel } from './components/ChatPanel';
import type { Chat } from '@google/genai';
import { FavoritesList } from './components/FavoritesList';
import { analyticsService } from './services/analyticsService';
import { FeedbackButton } from './components/FeedbackButton';
import { FeedbackModal } from './components/FeedbackModal';
import { ConnectedPapersModal } from './components/ConnectedPapersModal';


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
  const [favoritePapers, setFavoritePapers] = useState<ResearchPaper[]>([]);
  
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

  // Connected Papers state
  const [connectedPapersResult, setConnectedPapersResult] = useState<{ seedPaper: ResearchPaper; connections: ConnectedPaper[] } | null>(null);
  const [isFindingConnected, setIsFindingConnected] = useState<string | null>(null); // Stores title of paper being processed
  const [findConnectedError, setFindConnectedError] = useState<string | null>(null);


  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  // Client-side cache for search results
  const searchCache = useRef<Map<string, CacheEntry>>(new Map());
  const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  // Feedback Modal State
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState<boolean>(false);


  const handleToggleFavorite = useCallback((paper: ResearchPaper) => {
    setFavoritePapers(prev => {
        const isFavorited = prev.some(p => p.title === paper.title && p.authors === paper.authors);
        analyticsService.logEvent('favorite_toggled', {
            action: isFavorited ? 'remove' : 'add',
            paperTitle: paper.title,
        });
        if (isFavorited) {
            return prev.filter(p => p.title !== paper.title || p.authors !== paper.authors);
        } else {
            return [...prev, paper];
        }
    });
  }, []);

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

  const parseConnectedPapersResponse = (text: string): ConnectedPaper[] => {
    if (!text || !text.trim()) {
      return [];
    }

    const papers: ConnectedPaper[] = [];
    const paperBlocks = text.split('---');

    for (const block of paperBlocks) {
        const trimmedBlock = block.trim();
        if (!trimmedBlock) continue;

        const paper: Partial<ConnectedPaper> = {};
        const fieldRegex = /\*\*([A-Za-z]+):\*\*\s*([\s\S]*?)(?=\s*\*\*[A-Za-z]+:\*\*|$)/gi;
        
        let match;
        while ((match = fieldRegex.exec(trimmedBlock)) !== null) {
            const key = match[1].toLowerCase();
            const value = match[2].trim();
            
            switch (key) {
                case 'title': paper.title = value.split('\n')[0].trim(); break;
                case 'authors': paper.authors = value.split('\n')[0].trim(); break;
                case 'year': paper.year = value.split('\n')[0].trim(); break;
                case 'sourceurl': paper.sourceURL = value.split('\n')[0].trim(); break;
                case 'summary': paper.summary = value; break;
                case 'connection': paper.connection = value; break;
            }
        }

        if (paper.title && paper.authors && paper.year && paper.summary && paper.connection) {
            papers.push(paper as ConnectedPaper);
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
        analyticsService.logEvent('citations_completed', {
            numPapersCited: papersToCite.length,
        });
        return generatedCitations; // Return for caching
    } catch (err) {
        let errorMessage: string;
        if (err instanceof ParsingError || err instanceof ApiError) {
            errorMessage = err.message;
        } else if (err instanceof Error) {
            errorMessage = `An unexpected client-side error occurred: ${err.message}`;
        } else {
            errorMessage = 'An unknown error occurred while generating citations.';
        }
        setCitationError(errorMessage);
        analyticsService.logEvent('citations_failed', {
            numPapersCited: papersToCite.length,
            error: errorMessage,
        });
        return []; // Return empty array on error
    } finally {
        setIsCiting(false);
    }
  }, []);

  const handleSearch = useCallback(async (searchQuery: string, advancedOptions: AdvancedSearchOptions) => {
    if (!searchQuery.trim()) return;
    
    const favoritesCacheKey = favoritePapers.map(p => p.title).join(';');
    const cacheKey = `${searchQuery.trim().toLowerCase()}|${searchSource}|${summaryLength}|${summaryStyle}|${advancedOptions.startYear}-${advancedOptions.endYear}|${advancedOptions.authors}|${advancedOptions.excludeKeywords}|favs:${favoritesCacheKey}`;
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

    analyticsService.logEvent('search_initiated', {
        query: searchQuery.trim(),
        source: searchSource,
        summaryLength,
        summaryStyle,
        advancedOptions,
        numFavoritesUsed: favoritePapers.length,
    });

    try {
      const result = await fetchResearchPapers(searchQuery, summaryLength, summaryStyle, searchSource, advancedOptions, favoritePapers);
      if (result) {
        const parsedPapers = parseGeminiResponse(result.text);
        setPapers(parsedPapers);
        initializeChatSession(parsedPapers);
        
        analyticsService.logEvent('search_completed', {
            query: searchQuery.trim(),
            resultsCount: parsedPapers.length,
        });

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
        const errorMessage = "Failed to get a valid response from the research service.";
        setError(errorMessage);
        analyticsService.logEvent('search_failed', {
            query: searchQuery.trim(),
            error: errorMessage,
        });
      }
    } catch (err) {
        let errorMessage: string;
        if (err instanceof ApiError) {
            errorMessage = err.message;
        } else if (err instanceof Error) {
            errorMessage = `An unexpected error occurred: ${err.message}`;
        } else {
            errorMessage = 'An unknown error occurred during the search.';
        }
        setError(errorMessage);
        analyticsService.logEvent('search_failed', {
            query: searchQuery.trim(),
            error: errorMessage,
        });
    } finally {
      setIsLoading(false);
    }
  }, [summaryLength, summaryStyle, searchSource, handleGenerateCitations, CACHE_DURATION_MS, favoritePapers]);
  
  const handleAnalysis = useCallback(async () => {
    if (papers.length === 0) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    analyticsService.logEvent('analysis_initiated', {
        numPapersAnalyzed: papers.length,
    });
    
    try {
        const result = await analyzeAndClusterPapers(papers);
        setAnalysisResult(result);
        analyticsService.logEvent('analysis_completed', {
            numPapersAnalyzed: papers.length,
            numClusters: result.clusters.length,
        });
    } catch(err) {
        let errorMessage: string;
        if (err instanceof ParsingError || err instanceof ApiError) {
            errorMessage = err.message;
        } else if (err instanceof Error) {
            errorMessage = `An unexpected client-side error occurred: ${err.message}`;
        } else {
            errorMessage = 'An unknown error occurred during analysis.';
        }
        setAnalysisError(errorMessage);
        analyticsService.logEvent('analysis_failed', {
            numPapersAnalyzed: papers.length,
            error: errorMessage,
        });
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

    analyticsService.logEvent('chat_message_sent', {
        messageLength: message.length,
    });

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
        analyticsService.logEvent('chat_message_failed', {
            error: errorMessage,
        });
        // Remove the empty model message placeholder on error
        setChatHistory(prev => prev.filter(m => m.parts[0].text !== ''));
    } finally {
        setIsChatting(false);
    }
  }, [chatSession]);

  const handleDownloadPdf = useCallback(async (paper: ResearchPaper) => {
    setPdfLoading(paper.title);
    analyticsService.logEvent('pdf_download_attempt', {
        paperTitle: paper.title,
    });
    try {
        // Simple check if the source URL is already a PDF
        if (paper.sourceURL && paper.sourceURL.toLowerCase().endsWith('.pdf')) {
            window.open(paper.sourceURL, '_blank');
            return;
        }

        const pdfUrl = await findPdfLink(paper);
        analyticsService.logEvent('pdf_download_completed', {
            paperTitle: paper.title,
            foundDirectLink: !!pdfUrl,
        });

        if (pdfUrl) {
            window.open(pdfUrl, '_blank');
        } else {
            // This could be a more sophisticated toast notification
            alert('A direct PDF link could not be found for this paper.');
        }
    } catch (err) {
        console.error("Failed to find PDF link:", err);
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        alert(`An error occurred while searching for the PDF: ${errorMessage}`);
        analyticsService.logEvent('pdf_download_failed', {
            paperTitle: paper.title,
            error: errorMessage,
        });
    } finally {
        setPdfLoading(null);
    }
  }, []);

  const handleFeedbackSubmit = useCallback((feedback: { category: string; text: string }) => {
    analyticsService.logEvent('feedback_submitted', {
        category: feedback.category,
        messageLength: feedback.text.length,
    });
    setIsFeedbackModalOpen(false);
    alert('Thank you for your feedback! Your thoughts have been recorded.');
  }, []);

  const handleFindConnectedPapers = useCallback(async (seedPaper: ResearchPaper) => {
    setIsFindingConnected(seedPaper.title);
    setFindConnectedError(null);
    analyticsService.logEvent('connected_papers_initiated', { seedPaperTitle: seedPaper.title });
    
    try {
        const response = await findConnectedPapers(seedPaper);
        const connections = parseConnectedPapersResponse(response.text);

        if (connections.length > 0) {
            setConnectedPapersResult({ seedPaper, connections });
            analyticsService.logEvent('connected_papers_completed', { 
                seedPaperTitle: seedPaper.title,
                resultsCount: connections.length,
            });
        } else {
            setFindConnectedError("Could not find and parse any connected papers for this article.");
            analyticsService.logEvent('connected_papers_failed', { 
                seedPaperTitle: seedPaper.title,
                error: 'No parsable results',
            });
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setFindConnectedError(errorMessage);
        analyticsService.logEvent('connected_papers_failed', { 
            seedPaperTitle: seedPaper.title,
            error: errorMessage,
        });
    } finally {
        setIsFindingConnected(null);
    }
  }, []);

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
             logAnalyticsEvent={analyticsService.logEvent}
           />
        </div>
       
        <div className="mt-8">
          {isLoading && <LoadingSpinner />}
          {error && <ErrorMessage message={error} />}

          <FavoritesList
              favoritePapers={favoritePapers}
              onToggleFavorite={handleToggleFavorite}
          />
          
          {!isLoading && !error && hasSearched && papers.length === 0 && (
            <div className="text-center py-12">
              <h3 className="text-xl font-semibold text-gray-700">No Results Found</h3>
              <p className="text-gray-500 mt-2">Your search for "{query}" did not return any parsable results. Please try a different or more specific query.</p>
            </div>
          )}

          {papers.length > 0 && (
            <>
              <ResultsDisplay 
                papers={papers}
                favoritePapers={favoritePapers}
                onToggleFavorite={handleToggleFavorite}
                onDownloadPdf={handleDownloadPdf}
                pdfLoading={pdfLoading}
                onFindConnectedPapers={handleFindConnectedPapers}
                isFindingConnected={isFindingConnected}
              />
              
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

      <FeedbackButton onClick={() => setIsFeedbackModalOpen(true)} />
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        onSubmit={handleFeedbackSubmit}
      />
      <ConnectedPapersModal
        result={connectedPapersResult}
        onClose={() => { setConnectedPapersResult(null); setFindConnectedError(null); }}
        error={findConnectedError}
      />
    </div>
  );
};

export default App;
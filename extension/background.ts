import { db } from './lib/db';
import type { LocalPaper } from './lib/types';
import type { ResearchPaper } from '../types';
import { 
    summarizeAbstract, 
    analyzeSinglePaper,
    findOpenAccessVersion,
    generatePaperBasedSuggestions 
} from './lib/gemini';

const CHANNEL_NAME = 'ai_research_explorer_channel';
const channel = new BroadcastChannel(CHANNEL_NAME);

// Function to create a stable ID for a paper
const createPaperId = (paper: Partial<ResearchPaper>): string => {
    if (paper.doi) return `doi:${paper.doi}`;
    if (paper.sourceURL) {
        // Normalize arXiv URLs to use the ID as the identifier
        const arxivIdMatch = paper.sourceURL.match(/arxiv\.org\/(?:abs|pdf)\/([^/]+)/);
        if (arxivIdMatch) return `arxiv:${arxivIdMatch[1].replace(/v\d+$/, '')}`;
        return `url:${paper.sourceURL}`;
    }
    // Fallback to a simple hash of the title
    return `title:${paper.title?.toLowerCase().replace(/\s+/g, '-') || Math.random().toString()}`;
};

async function enrichPaper(paperId: string, paperData: LocalPaper) {
    console.log(`[Enrichment] Starting for paper: ${paperId}`);
    try {
        const pdfUrl = await findOpenAccessVersion(paperData);

        if (pdfUrl) {
            const existingPaper = await db.getPaper(paperId);
            if (existingPaper) {
                const updatedPaper: LocalPaper = {
                    ...existingPaper,
                    pdfURL: pdfUrl,
                    verification: {
                        state: 'verified',
                        source: 'Unpaywall',
                        linkState: 'valid',
                        reason: 'Found a legal open-access PDF.',
                        pdfURL: pdfUrl,
                    }
                };
                await db.addPaper(updatedPaper);
                console.log(`[Enrichment] Success! Updated paper ${paperId} with PDF link.`);
                // We could post a message back to the UI to inform of the update,
                // but for now, silent enrichment is sufficient.
            }
        } else {
            console.log(`[Enrichment] No open access PDF found for ${paperId}.`);
        }
    } catch (error) {
        console.error(`[Enrichment] Failed for paper ${paperId}:`, error);
    }
}


// Listen for messages from content scripts or the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Tier 1 Actions
    if (message.action === 'savePaper') {
        const paperData: ResearchPaper = message.paper;
        const id = createPaperId(paperData);

        const newPaper: LocalPaper = {
            ...paperData,
            id,
            savedAt: Date.now(),
            verification: { state: 'unverified', linkState: 'unchecked' },
        };
        
        // Immediately save the paper for a snappy UI response
        db.addPaper(newPaper).then(() => {
            console.log('Paper saved initially:', newPaper);
            // Notify the web app that a paper has been saved
            channel.postMessage({ type: 'paper_saved_to_workspace', paper: newPaper });
            sendResponse({ success: true, paperId: id });

            // Start enrichment in the background, don't wait for it
            enrichPaper(id, newPaper);
        }).catch(error => {
            console.error('Failed to save paper:', error);
            sendResponse({ success: false, error: error.message });
        });

        return true; // Indicates async response
    }
    
    if (message.action === 'getSavedPapers') {
        db.getAllPapers().then(papers => {
            sendResponse({ success: true, papers });
        });
        return true;
    }

    if (message.action === 'deletePaper') {
        db.deletePaper(message.paperId).then(() => {
            channel.postMessage({ type: 'paper_removed', paperId: message.paperId });
            sendResponse({ success: true });
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }
    
    if (message.action === 'getPaperStatus') {
        db.paperExists(message.paperId).then(exists => {
            sendResponse({ exists });
        });
        return true;
    }

    // Tier 2 Co-Pilot Actions
    if (message.action === 'getAiAnalysisForPaper') {
        const paper = message.paper;
        Promise.all([
            summarizeAbstract(paper),
            analyzeSinglePaper(paper)
        ]).then(([summary, analysis]) => {
            sendResponse({ success: true, data: { summary, analysis } });
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }

    if (message.action === 'findOpenAccessForPaper') {
        findOpenAccessVersion(message.paper).then(pdfUrl => {
            sendResponse({ success: true, pdfUrl });
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }

    if (message.action === 'getSuggestionsForPaper') {
        generatePaperBasedSuggestions(message.paper).then(suggestions => {
            sendResponse({ success: true, suggestions });
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }
});

// Listen for messages from the web app (via the channel)
channel.onmessage = (event) => {
    if (event.data.type === 'web_app_favorite_toggled') {
        const { paper, isFavorite } = event.data;
        const id = createPaperId(paper);
        
        if (isFavorite) {
            const newPaper: LocalPaper = { ...paper, id, savedAt: Date.now() };
            db.addPaper(newPaper);
        } else {
            db.deletePaper(id);
        }
    }
};

// Open a welcome/info page on installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // You could open a "welcome.html" page here to guide the user.
    }
});
/// <reference types="chrome" />

import { db } from './lib/db';
import type { LocalPaper } from './lib/types';
import type { ResearchPaper } from '../types';

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


// Listen for messages from content scripts or the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'savePaper') {
        const paperData: ResearchPaper = message.paper;
        const id = createPaperId(paperData);

        const newPaper: LocalPaper = {
            ...paperData,
            id,
            savedAt: Date.now(),
        };

        db.addPaper(newPaper).then(() => {
            console.log('Paper saved:', newPaper);
            // Notify the web app and popup
            channel.postMessage({ type: 'paper_saved', paper: newPaper });
            sendResponse({ success: true, paperId: id });
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
        return true; // Indicates async response
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
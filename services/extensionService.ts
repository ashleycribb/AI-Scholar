import type { ResearchPaper } from '../types';
import { parseExtensionMessage } from './extensionMessages';

const CHANNEL_NAME = 'ai_research_explorer_channel';
let channel: BroadcastChannel | null = null;

const getChannel = (): BroadcastChannel => {
    if (!channel) {
        channel = new BroadcastChannel(CHANNEL_NAME);
    }
    return channel;
};

export const listenForExtensionMessages = (
    onPaperReceived: (paper: ResearchPaper) => void,
    onPaperRemoved: (paperId: string) => void,
    onAllPapersReceived?: (papers: ResearchPaper[]) => void
) => {
    const bc = getChannel();
    bc.onmessage = (event: MessageEvent) => {
        const expectedOrigin = typeof window !== 'undefined' ? window.location?.origin : undefined;
        const message = parseExtensionMessage(event.data, event.origin, expectedOrigin);
        if (!message) {
            console.warn('[extensionService] Ignored invalid or untrusted message on extension channel');
            return;
        }

        switch (message.type) {
            case 'paper_saved_to_workspace':
                onPaperReceived(message.paper);
                break;
            case 'paper_removed':
                onPaperRemoved(message.paperId);
                break;
            case 'all_papers_response':
                onAllPapersReceived?.(message.papers);
                break;
        }
    };
    
    // Return a cleanup function
    return () => {
        bc.close();
        channel = null;
    };
};

export const requestAllPapers = () => {
    getChannel().postMessage({ type: 'request_all_papers' });
};

// Function to create a stable ID for a paper, must be identical to the one in background.ts
export const createPaperId = (paper: Partial<ResearchPaper>): string => {
    if (paper.doi) return `doi:${paper.doi}`;
    if (paper.sourceURL) {
        const arxivIdMatch = paper.sourceURL.match(/arxiv\.org\/(?:abs|pdf)\/([^/]+)/);
        if (arxivIdMatch) return `arxiv:${arxivIdMatch[1].replace(/v\d+$/, '')}`;
        return `url:${paper.sourceURL}`;
    }
    return `title:${paper.title?.toLowerCase().replace(/\s+/g, '-') || crypto.randomUUID()}`;
};

export const notifyExtensionFavoriteToggled = (paper: ResearchPaper, isFavorite: boolean) => {
    getChannel().postMessage({
        type: 'web_app_favorite_toggled',
        paper,
        isFavorite
    });
};
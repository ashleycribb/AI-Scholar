import type { ResearchPaper } from '../types';

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
    onPaperRemoved: (paperId: string) => void
) => {
    const bc = getChannel();
    bc.onmessage = (event) => {
        if (event.data.type === 'paper_saved_to_workspace') {
            onPaperReceived(event.data.paper);
        }
        if (event.data.type === 'paper_removed') {
            onPaperRemoved(event.data.paperId);
        }
    };
    
    // Return a cleanup function
    return () => {
        bc.close();
        channel = null;
    };
};

// Function to create a stable ID for a paper, must be identical to the one in background.ts
export const createPaperId = (paper: Partial<ResearchPaper>): string => {
    if (paper.doi) return `doi:${paper.doi}`;
    if (paper.sourceURL) {
        const arxivIdMatch = paper.sourceURL.match(/arxiv\.org\/(?:abs|pdf)\/([^/]+)/);
        if (arxivIdMatch) return `arxiv:${arxivIdMatch[1].replace(/v\d+$/, '')}`;
        return `url:${paper.sourceURL}`;
    }
    return `title:${paper.title?.toLowerCase().replace(/\s+/g, '-') || Math.random().toString()}`;
};

export const notifyExtensionFavoriteToggled = (paper: ResearchPaper, isFavorite: boolean) => {
    getChannel().postMessage({
        type: 'web_app_favorite_toggled',
        paper,
        isFavorite
    });
};
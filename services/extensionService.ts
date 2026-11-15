import type { ResearchPaper } from '../types';
import { canonicalWorkId } from '../utils/workIds';
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

// Stable id for a paper: the permanent work id (utils/workIds.ts). Papers from the browser extension (which keeps
// its own ids in its own store) are normalized to the same id when they enter the selection queue.
export const createPaperId = (paper: Partial<ResearchPaper>): string => canonicalWorkId(paper as Partial<ResearchPaper> & Record<string, unknown>);

export const notifyExtensionFavoriteToggled = (paper: ResearchPaper, isFavorite: boolean) => {
    getChannel().postMessage({
        type: 'web_app_favorite_toggled',
        paper,
        isFavorite
    });
};
import type { ResearchPaper } from '../types';
import { createPaperId } from '../utils/idUtils';

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

export { createPaperId };

export const notifyExtensionFavoriteToggled = (paper: ResearchPaper, isFavorite: boolean) => {
    getChannel().postMessage({
        type: 'web_app_favorite_toggled',
        paper,
        isFavorite
    });
};

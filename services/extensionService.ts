import { z } from 'zod';
import type { ResearchPaper } from '../types';

const CHANNEL_NAME = 'ai_research_explorer_channel';
let channel: BroadcastChannel | null = null;

const ResearchPaperSchema = z.object({
    id: z.string(),
    title: z.string(),
    authors: z.string(),
    year: z.number(),
    abstract: z.string(),
    sourceURL: z.string().optional(),
    pdfURL: z.string().optional(),
}).passthrough();

const ExtensionMessageSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('paper_saved_to_workspace'),
        paper: ResearchPaperSchema,
    }),
    z.object({
        type: z.literal('paper_removed'),
        paperId: z.string(),
    }),
]);

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
        // Validate origin - strict check
        if (event.origin !== '' && event.origin !== window.location.origin) {
            console.warn('Blocked message from untrusted origin:', event.origin);
            return;
        }

        const result = ExtensionMessageSchema.safeParse(event.data);

        if (!result.success) {
            console.error('Invalid message received on extension channel:', result.error);
            return;
        }

        const message = result.data;

        if (message.type === 'paper_saved_to_workspace') {
            onPaperReceived(message.paper as ResearchPaper);
        }
        if (message.type === 'paper_removed') {
            onPaperRemoved(message.paperId);
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
    return `title:${paper.title?.toLowerCase().replace(/\s+/g, '-') || crypto.randomUUID()}`;
};

export const notifyExtensionFavoriteToggled = (paper: ResearchPaper, isFavorite: boolean) => {
    getChannel().postMessage({
        type: 'web_app_favorite_toggled',
        paper,
        isFavorite
    });
};
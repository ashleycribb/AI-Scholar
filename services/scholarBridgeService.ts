
import type { ResearchPaper, UserSettings } from '../types';

const SCHOLAR_API_BASE = 'https://api.zotero.org';

/**
 * Maps our ResearchPaper model to the library's expected JSON format.
 */
const mapPaperToLibraryItem = (paper: ResearchPaper) => {
    const authors = paper.authorList?.map(a => {
        const parts = a.name.split(' ');
        return {
            creatorType: 'author',
            firstName: parts.slice(0, -1).join(' '),
            lastName: parts.slice(-1).join(' ')
        };
    }) || [{ creatorType: 'author', lastName: paper.authors.split(',')[0] }];

    return {
        itemType: 'journalArticle',
        title: paper.title,
        creators: authors,
        publicationTitle: paper.journal || '',
        date: paper.year?.toString() || '',
        abstractNote: paper.abstract,
        DOI: paper.doi || '',
        url: paper.sourceURL || '',
        accessDate: new Date().toISOString(),
        libraryCatalog: 'Scholar Explorer',
        extra: `Semantic Match: ${paper.semanticScore}%`
    };
};

/**
 * Pushes a paper to the user's Scholar Bridge cloud library (powered by Zotero).
 */
export const pushToScholarLibrary = async (paper: ResearchPaper, settings: UserSettings): Promise<{ success: boolean; key?: string; error?: string }> => {
    if (!settings.scholarBridgeApiKey || !settings.scholarBridgeUserId) {
        return { success: false, error: 'Scholar Bridge credentials missing.' };
    }

    const url = `${SCHOLAR_API_BASE}/users/${settings.scholarBridgeUserId}/items`;
    const itemData = mapPaperToLibraryItem(paper);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Zotero-API-Key': settings.scholarBridgeApiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([itemData])
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Scholar Bridge API Error: ${response.status} - ${errText}`);
        }

        const result = await response.json();
        const itemKey = result.successful?.[0]?.key;
        
        return { success: true, key: itemKey };
    } catch (e) {
        console.error("[ScholarBridge] Push failed:", e);
        return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
};

/**
 * Validates credentials by attempting a simple library info fetch.
 */
export const validateScholarBridgeAuth = async (userId: string, apiKey: string): Promise<boolean> => {
    const url = `${SCHOLAR_API_BASE}/users/${userId}/items/top?limit=1`;
    try {
        const response = await fetch(url, {
            headers: { 'Zotero-API-Key': apiKey }
        });
        return response.ok;
    } catch {
        return false;
    }
};

import type { AdvancedSearchOptions, ResearchPaper } from '../types';

export const searchHuggingFacePapers = async (query: string, options: AdvancedSearchOptions, page: number = 1): Promise<{ papers: ResearchPaper[] }> => {
    try {
        const encodedQuery = encodeURIComponent(query);
        // We'll map the page to limit and offset conceptually although HF API might not support pagination exactly like that, 
        // normally we just fetch top N results. But we can just use search=q if needed or q=q
        const url = `https://huggingface.co/api/papers?q=${encodedQuery}&limit=20`;
        
        console.log(`[HuggingFace API] Fetching daily papers from: ${url}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`[HuggingFace API] Error fetching papers: ${response.status} ${response.statusText}`);
            return { papers: [] };
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data)) {
            return { papers: [] };
        }
        
        const papers: ResearchPaper[] = data.map((item: any) => {
            let publishedYear = new Date().getFullYear();
            if (item.publishedAt) {
                publishedYear = new Date(item.publishedAt).getFullYear();
            }
            
            const authorsStr = Array.isArray(item.authors) 
                ? item.authors.map((a: any) => a.name).join(', ') 
                : 'Unknown Author';
                
            const pdfURL = item.id ? `https://arxiv.org/pdf/${item.id}.pdf` : undefined;
            const sourceURL = item.id ? `https://huggingface.co/papers/${item.id}` : undefined;
            
            return {
                id: `hf_${item.id}`,
                title: item.title,
                authors: authorsStr,
                year: publishedYear,
                abstract: item.summary || item.ai_summary || '',
                sourceURL,
                pdfURL,
                citations: item.upvotes || 0, // we can map upvotes to citations roughly for ranking
                doi: undefined, // typically HF uses arxiv ID
            } as ResearchPaper;
        });
        
        return { papers };
        
    } catch (e) {
        console.error(`[HuggingFace API] Request failed:`, e);
        return { papers: [] };
    }
};

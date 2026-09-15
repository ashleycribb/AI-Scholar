import axios from 'axios';
import type { ResearchPaper, AdvancedSearchOptions } from '../types';

export const searchGoogleScholar = async (
    query: string,
    options: AdvancedSearchOptions,
    page: number = 1,
    serpApiKey: string
): Promise<ResearchPaper[]> => {
    try {
        const num = 10;
        const start = (page - 1) * num;

        // Construct query with advanced options
        let finalQuery = query;
        if (options.authors) {
            finalQuery += ` author:"${options.authors}"`;
        }
        if (options.journal) {
            finalQuery += ` source:"${options.journal}"`;
        }

        const response = await axios.get('/api/scholar', {
            params: {
                q: finalQuery,
                api_key: serpApiKey,
                num,
                start
            }
        });

        const data = response.data;
        if (!data.organic_results) {
            return [];
        }

        return data.organic_results.map((result: any) => {
            // Extract year from publication_info if available
            let year = '';
            if (result.publication_info && result.publication_info.summary) {
                const match = result.publication_info.summary.match(/\\b(19|20)\\d{2}\\b/);
                if (match) {
                    year = match[0];
                }
            }

            // Extract authors from publication_info
            let authors = '';
            let authorList: { name: string; id?: string }[] = [];
            if (result.publication_info && result.publication_info.authors) {
                authorList = result.publication_info.authors.map((a: any) => ({
                    name: a.name,
                    id: a.author_id
                }));
                authors = authorList.map(a => a.name).join(', ');
            } else if (result.publication_info && result.publication_info.summary) {
                // Fallback to parsing summary string (e.g., "J Smith, B Doe - Journal of Science, 2020")
                const parts = result.publication_info.summary.split(' - ');
                if (parts.length > 0) {
                    authors = parts[0];
                    authorList = authors.split(',').map(a => ({ name: a.trim() }));
                }
            }

            return {
                id: result.result_id || `gs_${Math.random().toString(36).substr(2, 9)}`,
                title: result.title,
                authors: authors || 'Unknown Authors',
                authorList,
                year: year ? parseInt(year, 10) : new Date().getFullYear(),
                abstract: result.snippet || '',
                sourceURL: result.link || '',
                pdfURL: result.resources && result.resources.length > 0 ? result.resources[0].link : undefined,
                citations: result.inline_links?.cited_by?.total || 0,
                journal: result.publication_info?.summary ? result.publication_info.summary.split(' - ')[1]?.split(',')[0]?.trim() : '',
                enrichmentSource: 'Google Scholar'
            };
        });
    } catch (error) {
        console.error('Error fetching from Google Scholar:', error);
        return [];
    }
};

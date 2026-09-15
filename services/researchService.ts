
import * as arxivService from './arxivService';
import * as geminiService from './geminiService';
import { ResearchPaper, ProjectReport } from '../types';

export const generateProjectReport = async (metrics: {
    datasetSize: number;
    testAccuracy: number;
    studySessions: number;
    totalEvents: number;
}): Promise<ProjectReport> => {
    const query = "semantic search without embeddings keyword expansion BM25 cross-encoders future-proof academic search architecture";
    
    // 1. Search ArXiv for relevant papers on future-proofing and search architectures
    const { papers } = await arxivService.searchArxiv(query);
    
    // 2. Synthesize findings using Gemini
    const papersContext = papers.map((p, i) => `[${i+1}] ${p.title}: ${p.abstract}`).join('\n\n');
    
    const prompt = `Act as a senior AI research engineer and product strategist. We are building "Scholar Explorer", a semantic search engine for academic papers.
    
    Current Project Status:
    - Gold Standard Dataset Size: ${metrics.datasetSize} papers
    - VACS Algorithm Accuracy: ${metrics.testAccuracy}%
    - User Study Sessions Completed: ${metrics.studySessions}
    - Total Analytics Events Logged: ${metrics.totalEvents}
    
    Analyze the following ArXiv papers and synthesize a "Project Performance & Future-Proofing Report".
    
    Source Papers:
    ${papersContext}
    
    The report should include:
    1. A high-level summary of the project's current standing and the state of the search architecture.
    2. Performance Metrics section (use the provided metrics).
    3. Future-Proofing Strategy: Recommendations for scaling, handling embedding model availability (404 issues), and long-term maintenance.
    4. Technical Alternatives: 3-4 specific alternative architectures (e.g., BM25+, Cross-Encoders, Hybrid Search) with pros/cons.
    
    Return the result in JSON format:
    {
        "title": "Scholar Explorer: Project Performance & Future-Proofing Report",
        "summary": "...",
        "performanceMetrics": [
            { "label": "Dataset Maturity", "value": "${metrics.datasetSize} Papers", "description": "..." },
            { "label": "Algorithm Precision", "value": "${metrics.testAccuracy}%", "description": "..." },
            { "label": "User Engagement", "value": "${metrics.studySessions} Sessions", "description": "..." }
        ],
        "futureProofing": [
            { "category": "Scalability", "recommendations": ["...", "..."] },
            { "category": "Resilience", "recommendations": ["...", "..."] }
        ],
        "technicalAlternatives": [
            { "name": "...", "description": "...", "pros": ["..."], "cons": ["..."] }
        ]
    }`;

    try {
        const response = await geminiService.runWithRetry<any>(() => geminiService.ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: { responseMimeType: "application/json" }
        }));
        
        const data = JSON.parse(response.text || '{}');
        return {
            ...data,
            sourcePapers: papers.slice(0, 5)
        };
    } catch (e) {
        console.error("Failed to generate project report:", e);
        throw e;
    }
};

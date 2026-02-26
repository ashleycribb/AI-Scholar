import { GoogleGenAI } from "@google/genai";
import type { ResearchPaper } from '../types';
import { cosineSimilarity } from '../utils/math';
import { embedText, batchEmbedText } from '../utils/embeddings';

/**
 * Takes a query (or a hypothetical answer) and a list of papers, calculates semantic scores, and returns the papers with scores.
 */
export const calculateSemanticScores = async (queryOrHypotheticalAnswer: string, papers: ResearchPaper[]): Promise<ResearchPaper[]> => {
    if (papers.length === 0) return [];
    
    try {
        const queryEmbedding = await embedText(queryOrHypotheticalAnswer);
        
        const papersToEmbed = papers.filter(p => 
            p.abstract && 
            typeof p.abstract === 'string' && 
            p.abstract.trim() !== ''
        );

        if (papersToEmbed.length === 0) {
            return papers.map(p => ({ ...p, semanticScore: 0 }));
        }

        const abstractsToEmbed = papersToEmbed.map(p => p.abstract);
        
        const paperEmbeddings = await batchEmbedText(abstractsToEmbed);
        
        const embeddingMap = new Map<string, number[]>();
        papersToEmbed.forEach((paper, index) => {
            // Use the paper's actual ID for mapping
            embeddingMap.set(paper.id, paperEmbeddings[index]);
        });
        
        return papers.map((paper) => {
            const paperEmbedding = embeddingMap.get(paper.id);
            if (!paperEmbedding || paperEmbedding.length === 0) {
                return { ...paper, semanticScore: 0 };
            }
            
            const similarity = cosineSimilarity(queryEmbedding, paperEmbedding);
            // Convert similarity from [-1, 1] to a score from 0-100
            const score = Math.round(((similarity + 1) / 2) * 100); 
            return {
                ...paper,
                semanticScore: score,
            };
        });

    } catch (error) {
        console.error("Error calculating semantic scores:", error);
        return papers.map(p => ({ ...p, semanticScore: 0 }));
    }
};

export { embedText, batchEmbedText };


import type { AnalysisResult, AuthorFrequencyData, Cluster, PublicationYearData, ResearchPaper, GraphEdge, GraphNode } from '../types';

// Client-side cache for analysis results using a simple Map
interface CacheEntry {
    result: AnalysisResult;
    timestamp: number;
}
const analysisCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- Start of Custom TF-IDF and K-Means Implementation ---

// Simple tokenizer: converts text to lowercase, removes punctuation, and splits into words.
const tokenize = (text: string): string[] => {
    if (!text) return [];
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // remove punctuation
        .split(/\s+/)
        .filter(Boolean); // remove empty strings
};

// A comprehensive set of English stopwords to filter out common, non-informative words.
const stopwords = new Set([
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'a', 'an', 'the', 
    'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 
    'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 
    'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 
    'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 
    'will', 'just', 'don', 'should', 'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', 'couldn', 
    'didn', 'doesn', 'hadn', 'hasn', 'haven', 'isn', 'ma', 'mightn', 'mustn', 'needn', 'shan', 'shouldn', 
    'wasn', 'weren', 'won', 'wouldn', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 
    'has', 'had', 'having', 'do', 'does', 'did', 'doing'
]);


// Helper function to calculate Euclidean distance between two vectors
const euclideanDistance = (a: number[], b: number[]): number => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
};

// A simple implementation of the K-Means clustering algorithm
const simpleKMeans = (data: number[][], k: number, maxIterations = 50) => {
    if (data.length < k || data.length === 0) {
        return { clusters: data.map((_, i) => i), centroids: data };
    }

    // 1. Initialize centroids by picking k random points from the data
    let centroids = data.slice().sort(() => 0.5 - Math.random()).slice(0, k);
    let assignments: number[] = new Array(data.length);
    
    for (let iter = 0; iter < maxIterations; iter++) {
        // 2. Assign each point to the nearest centroid
        for (let i = 0; i < data.length; i++) {
            let minDistance = Infinity;
            let closestCentroidIndex = -1;
            for (let j = 0; j < centroids.length; j++) {
                const distance = euclideanDistance(data[i], centroids[j]);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestCentroidIndex = j;
                }
            }
            assignments[i] = closestCentroidIndex;
        }

        // 3. Update centroids to be the mean of the points in their cluster
        const newCentroids: number[][] = Array.from({ length: k }, () => new Array(data[0].length).fill(0));
        const clusterCounts: number[] = new Array(k).fill(0);

        for (let i = 0; i < data.length; i++) {
            const clusterIndex = assignments[i];
            if (clusterIndex !== -1) {
                for (let d = 0; d < data[i].length; d++) {
                    newCentroids[clusterIndex][d] += data[i][d];
                }
                clusterCounts[clusterIndex]++;
            }
        }
        
        for (let i = 0; i < k; i++) {
            if (clusterCounts[i] > 0) {
                for (let d = 0; d < newCentroids[i].length; d++) {
                    newCentroids[i][d] /= clusterCounts[i];
                }
            } else {
                newCentroids[i] = data[Math.floor(Math.random() * data.length)];
            }
        }
        
        const hasConverged = centroids.every((c, i) => c.every((val, d) => val === newCentroids[i][d]));
        centroids = newCentroids;
        if(hasConverged) break;
    }

    return { clusters: assignments, centroids };
};

// --- End of Custom Implementations ---


export const analyzePapers = async (papers: ResearchPaper[]): Promise<AnalysisResult> => {
    const cacheKey = JSON.stringify({ papers: papers.map(p => p.id) });
    const cachedEntry = analysisCache.get(cacheKey);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS)) {
        return cachedEntry.result;
    }

    // Calculate top authors internally
    const authorStats: { [author: string]: { author: string, count: number, totalCitations: number } } = {};
    for (const paper of papers) {
        if (!paper.authors) continue;
        const authors = paper.authors.split(',').map(a => a.trim());
        for (const author of authors) {
            if (!author) continue;
            if (!authorStats[author]) {
                authorStats[author] = { author, count: 0, totalCitations: 0 };
            }
            authorStats[author].count++;
            authorStats[author].totalCitations += paper.citations || 0;
        }
    }
    const topAuthors: AuthorFrequencyData = Object.values(authorStats);

    // 1. Bibliometrics
    const publicationYears: PublicationYearData = Object.values(
        papers.reduce((acc, p) => {
            if(p.year) {
                acc[p.year] = acc[p.year] || { year: p.year, count: 0 };
                acc[p.year].count++;
            }
            return acc;
        }, {} as { [year: number]: { year: number, count: number } })
    ).sort((a,b) => a.year - b.year);

    // 2. TF-IDF and Clustering
    const documents = papers.map(p => p.abstract || '');
    const tokenizedDocs = documents.map(doc => tokenize(doc).filter(word => !stopwords.has(word)));
    
    const vocab = new Set<string>();
    const docFreq = new Map<string, number>();
    tokenizedDocs.forEach(doc => {
        const seenWords = new Set<string>();
        doc.forEach(word => {
            vocab.add(word);
            if (!seenWords.has(word)) {
                docFreq.set(word, (docFreq.get(word) || 0) + 1);
                seenWords.add(word);
            }
        });
    });

    const vocabArray = Array.from(vocab);
    const vocabIndexMap = new Map(vocabArray.map((word, i) => [word, i]));
    
    const idf = new Map<string, number>();
    const numDocs = documents.length;
    vocabArray.forEach(word => {
        idf.set(word, Math.log(numDocs / (docFreq.get(word) || 1)));
    });

    const vectors: number[][] = tokenizedDocs.map(doc => {
        const vector = new Array(vocab.size).fill(0);
        if (doc.length === 0) return vector;
        const termCounts = new Map<string, number>();
        doc.forEach(word => {
            termCounts.set(word, (termCounts.get(word) || 0) + 1);
        });
        termCounts.forEach((count, word) => {
            const tf = count / doc.length;
            const wordIdf = idf.get(word) || 0;
            const wordIndex = vocabIndexMap.get(word);
            if (wordIndex !== undefined) {
                vector[wordIndex] = tf * wordIdf;
            }
        });
        return vector;
    });
    
    const numClusters = Math.min(papers.length, 4);
    let clusters: Cluster[] = [];
    if (papers.length > 2 && numClusters > 1) {
        const kmeansResult = simpleKMeans(vectors, numClusters);
        
        const clusterGroups: { [key: number]: { papers: ResearchPaper[], paperIndices: number[] } } = {};
        kmeansResult.clusters.forEach((clusterIndex, paperIndex) => {
            if (clusterIndex === -1) return; // Ignore unassigned points if any
            if (!clusterGroups[clusterIndex]) clusterGroups[clusterIndex] = { papers: [], paperIndices: [] };
            clusterGroups[clusterIndex].papers.push(papers[paperIndex]);
            clusterGroups[clusterIndex].paperIndices.push(paperIndex);
        });

        clusters = Object.entries(clusterGroups).map(([clusterId, clusterData]) => {
            const termScores: {[term: string]: number} = {};
            clusterData.paperIndices.forEach(paperIndex => {
                const vector = vectors[paperIndex];
                vector.forEach((score, termIndex) => {
                    if (score > 0) {
                        const term = vocabArray[termIndex];
                        termScores[term] = (termScores[term] || 0) + score;
                    }
                });
            });

            const keywords = Object.entries(termScores)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(entry => entry[0]);
            
            const clusterName = keywords.slice(0, 3).map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(' / ');

            return {
                clusterName: clusterName || `Cluster ${parseInt(clusterId) + 1}`,
                description: `A thematic group of ${clusterData.papers.length} papers related to ${keywords.join(', ')}.`,
                paperTitles: clusterData.papers.map(p => p.title),
                keywords: keywords
            };
        });
    }

    // 3. Graph Generation
    const nodes: GraphNode[] = papers.map(p => ({ id: p.title, year: p.year }));
    const edges: GraphEdge[] = [];
    clusters.forEach(cluster => {
        const sortedPapers = cluster.paperTitles
            .map(title => papers.find(p => p.title === title)!)
            .filter(p => p) // Filter out undefined papers
            .sort((a, b) => a.year - b.year);

        for (let i = 0; i < sortedPapers.length - 1; i++) {
            edges.push({
                source: sortedPapers[i].title,
                target: sortedPapers[i+1].title
            });
        }
    });

    const result: AnalysisResult = {
        clusters,
        publicationYears,
        topAuthors,
        graph: { nodes, edges }
    };
    
    analysisCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
};
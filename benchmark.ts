
import { performance } from 'perf_hooks';

interface ResearchPaper {
    id: string;
    title: string;
    authors: string;
    citations?: number;
    year: number;
    abstract?: string;
}

interface AuthorFrequencyData {
    author: string;
    count: number;
    totalCitations: number;
}

function generateData(numPapers: number, numAuthors: number) {
    const papers: ResearchPaper[] = [];
    const authorsPool = Array.from({ length: numAuthors }, (_, i) => `Author ${i}`);

    for (let i = 0; i < numPapers; i++) {
        const numAuthorsForPaper = Math.floor(Math.random() * 5) + 1; // 1 to 5 authors
        const paperAuthors: string[] = [];
        for (let j = 0; j < numAuthorsForPaper; j++) {
            const author = authorsPool[Math.floor(Math.random() * numAuthors)];
            if (!paperAuthors.includes(author)) {
                paperAuthors.push(author);
            }
        }
        papers.push({
            id: `paper-${i}`,
            title: `Paper ${i}`,
            authors: paperAuthors.join(', '),
            citations: Math.floor(Math.random() * 100),
            year: 2020 + Math.floor(Math.random() * 5)
        });
    }
    return papers;
}

function currentImplementation(papers: ResearchPaper[]) {
    return Object.values(
        papers.flatMap(p => p.authors.split(',').map(a => a.trim())).reduce((acc, author) => {
            if (author) {
                acc[author] = acc[author] || { author, count: 0, totalCitations: 0 };
                acc[author].count++;
                const paper = papers.find(p => p.authors.includes(author));
                acc[author].totalCitations += paper?.citations || 0;
            }
            return acc;
        }, {} as { [author: string]: { author: string, count: number, totalCitations: number } })
    );
}

function optimizedImplementation(papers: ResearchPaper[]) {
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
    return Object.values(authorStats);
}

const papers = generateData(2000, 500); // 2000 papers, 500 authors
console.log(`Generated ${papers.length} papers.`);

console.log('Running current implementation...');
const startCurrent = performance.now();
const resultCurrent = currentImplementation(papers);
const endCurrent = performance.now();
console.log(`Current implementation took ${(endCurrent - startCurrent).toFixed(2)} ms`);

console.log('Running optimized implementation...');
const startOptimized = performance.now();
const resultOptimized = optimizedImplementation(papers);
const endOptimized = performance.now();
console.log(`Optimized implementation took ${(endOptimized - startOptimized).toFixed(2)} ms`);

// Verification of correctness vs current (knowing current is likely buggy)
// Let's pick an author and check stats
const sampleAuthor = resultOptimized[0]?.author;
if (sampleAuthor) {
    const currentStats = resultCurrent.find(a => a.author === sampleAuthor);
    const optimizedStats = resultOptimized.find(a => a.author === sampleAuthor);

    console.log(`Stats for ${sampleAuthor}:`);
    console.log(`Current: count=${currentStats?.count}, citations=${currentStats?.totalCitations}`);
    console.log(`Optimized: count=${optimizedStats?.count}, citations=${optimizedStats?.totalCitations}`);

    // Manually calculate to verify who is right
    let trueCount = 0;
    let trueCitations = 0;
    for (const p of papers) {
        if (p.authors.split(',').map(a => a.trim()).includes(sampleAuthor)) {
            trueCount++;
            trueCitations += p.citations || 0;
        }
    }
    console.log(`True Stats: count=${trueCount}, citations=${trueCitations}`);
}


import { deinvertAbstract as deinvertAbstractOptimized } from "../../services/utils";

// Original implementation (copied for benchmark baseline)
function deinvertAbstractOriginal(invertedAbstract: { [key: string]: number[] }): string {
    if (!invertedAbstract) return '';

    const abstractArray: string[] = [];
    let maxIndex = -1;

    // First, determine the size of the array needed
    for (const word in invertedAbstract) {
        for (const pos of invertedAbstract[word]) {
            if (pos > maxIndex) {
                maxIndex = pos;
            }
        }
    }

    // Initialize the array with empty strings
    if(maxIndex > -1){
        abstractArray.length = maxIndex + 1;
        abstractArray.fill('');
    }

    // Populate the array with words at their correct positions
    for (const word in invertedAbstract) {
        for (const pos of invertedAbstract[word]) {
            abstractArray[pos] = word;
        }
    }
    return abstractArray.join(' ').trim();
}

// Generate test data with many unique words
function generateInvertedAbstractManyKeys(wordCount: number): { [key: string]: number[] } {
    const inverted: { [key: string]: number[] } = {};

    for (let i = 0; i < wordCount; i++) {
        const word = `word${i}`;
        inverted[word] = [i];
    }
    return inverted;
}

const largeAbstract = generateInvertedAbstractManyKeys(5000); // 5000 unique words
const iterations = 1000;

console.log("Running benchmark with actual implementation...");

const startOriginal = performance.now();
for (let i = 0; i < iterations; i++) {
    deinvertAbstractOriginal(largeAbstract);
}
const endOriginal = performance.now();
const timeOriginal = endOriginal - startOriginal;

const startOptimized = performance.now();
for (let i = 0; i < iterations; i++) {
    deinvertAbstractOptimized(largeAbstract);
}
const endOptimized = performance.now();
const timeOptimized = endOptimized - startOptimized;

console.log(`Original: ${timeOriginal.toFixed(2)}ms`);
console.log(`Optimized (Actual): ${timeOptimized.toFixed(2)}ms`);
console.log(`Improvement: ${((timeOriginal - timeOptimized) / timeOriginal * 100).toFixed(2)}%`);

// Verification
const resultOriginal = deinvertAbstractOriginal(largeAbstract);
const resultOptimized = deinvertAbstractOptimized(largeAbstract);

if (resultOriginal !== resultOptimized) {
    console.error("MISMATCH!");
    console.error("Original length:", resultOriginal.length);
    console.error("Optimized length:", resultOptimized.length);
    process.exit(1);
} else {
    console.log("Verification Passed: Outputs are identical.");
}

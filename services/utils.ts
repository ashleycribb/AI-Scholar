/**
 * Reconstructs a readable abstract string from OpenAlex's inverted index format.
 * @param invertedAbstract - The inverted index object from the OpenAlex API.
 * @returns A string representing the paper's abstract.
 */
export function deinvertAbstract(invertedAbstract: { [key: string]: number[] }): string {
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

/**
 * Limits the concurrency of async operations over an array of items.
 *
 * @param items The array of items to process.
 * @param concurrency The maximum number of concurrent operations.
 * @param fn The async function to apply to each item.
 * @returns A promise that resolves to an array of results when all operations are complete.
 */
export async function limitConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: Promise<R>[] = [];
    const executing: Promise<void>[] = [];

    for (const item of items) {
        const p = Promise.resolve().then(() => fn(item));
        results.push(p);

        if (concurrency > 0) {
            const e = p.then(() => {}).catch(() => {});
            executing.push(e);
            e.finally(() => {
                const idx = executing.indexOf(e);
                if (idx !== -1) {
                    executing.splice(idx, 1);
                }
            });

            if (executing.length >= concurrency) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(results);
}

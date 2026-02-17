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
 * Limits the number of concurrent asynchronous operations.
 * This is useful for preventing rate limits or browser connection exhaustion when making many API calls.
 *
 * @param items The array of items to process.
 * @param limit The maximum number of concurrent operations.
 * @param fn The asynchronous function to execute for each item.
 * @returns A promise that resolves to an array of results in the original order.
 */
export async function limitConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: Promise<R>[] = [];
    const executing = new Set<Promise<void>>();

    for (const item of items) {
        const p = fn(item);
        results.push(p);

        if (limit <= items.length) {
            let e: Promise<void>;
            const onSettle = () => { executing.delete(e); };
            e = p.then(onSettle, onSettle);
            executing.add(e);

            if (executing.size >= limit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(results);
}

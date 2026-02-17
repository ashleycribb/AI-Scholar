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
 * @template T The type of items in the input array.
 * @template R The type of the result returned by the async function.
 * @param items The array of items to process.
 * @param limit The maximum number of concurrent operations.
 * @param fn The async function to execute for each item.
 * @returns A promise that resolves to an array of results, in the same order as the input items.
 */
export async function limitConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;

    const worker = async () => {
        while (index < items.length) {
            const i = index++;
            results[i] = await fn(items[i]);
        }
    };

    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
    await Promise.all(workers);

    return results;
}

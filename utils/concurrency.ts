
/**
 * Limits the concurrency of async operations over an array of items.
 *
 * @param items The array of items to process.
 * @param limit The maximum number of concurrent operations.
 * @param fn The async function to apply to each item.
 * @returns A promise that resolves to an array of results in the same order as the input items.
 */
export async function limitConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: Promise<R>[] = [];
    const executing: Set<Promise<void>> = new Set();

    for (const item of items) {
        const p = Promise.resolve().then(() => fn(item));
        results.push(p);

        if (limit <= items.length) {
            const e = p.then(() => {
                executing.delete(e);
            });
            executing.add(e);

            // Ensure cleanup happens even if p rejects (though race will throw first)
            // Actually, if p rejects, e rejects. Promise.race(executing) will reject.
            // The loop will terminate.

            if (executing.size >= limit) {
                try {
                    await Promise.race(executing);
                } catch (err) {
                    // If race failed, it means one of the promises failed.
                    // We re-throw to stop processing.
                    throw err;
                }
            }
        }
    }

    return Promise.all(results);
}

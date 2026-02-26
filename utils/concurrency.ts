
/**
 * Executes a function on an array of items with limited concurrency.
 * @param items The array of items to process.
 * @param limit The maximum number of concurrent executions.
 * @param fn The function to execute for each item.
 * @returns A promise that resolves to an array of results in the same order as the input items.
 */
export function limitConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;
    let active = 0;

    return new Promise((resolve, reject) => {
        const next = () => {
            if (index === items.length && active === 0) {
                resolve(results);
                return;
            }

            while (active < limit && index < items.length) {
                const i = index++;
                active++;
                fn(items[i])
                    .then(result => {
                        results[i] = result;
                        active--;
                        next();
                    })
                    .catch(reject);
            }
        };

        next();
    });
}

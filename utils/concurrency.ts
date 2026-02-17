/**
 * Limits the concurrency of an async operation over a list of items.
 * Preserves the order of results.
 *
 * @param items The list of items to process.
 * @param limit The maximum number of concurrent operations.
 * @param fn The async function to apply to each item.
 * @returns A promise that resolves to an array of results in the same order as items.
 */
export const limitConcurrency = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  const iterator = items.entries();

  const worker = async () => {
    for (const [index, item] of iterator) {
        results[index] = await fn(item);
    }
  };

  const workers = Array(Math.min(limit, items.length)).fill(null).map(() => worker());
  await Promise.all(workers);

  return results;
};

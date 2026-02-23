/**
 * Limits the number of concurrent asynchronous operations.
 *
 * @param items - The array of items to process.
 * @param limit - The maximum number of concurrent operations.
 * @param fn - The async function to execute for each item.
 * @returns A promise that resolves to an array of results in the same order as the input items.
 */
export async function limitConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array(items.length);
  let currentIndex = 0;

  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];
      try {
        results[index] = await fn(item);
      } catch (error) {
        // If one fails, we should probably fail the whole batch to match Promise.all behavior,
        // or at least stop processing?
        // Promise.all behavior: if any promise rejects, the returned promise rejects.
        // But the other operations might continue running in the background.
        // Here, if we throw inside the worker, the worker promise rejects, and Promise.all(workers) rejects.
        // So the behavior is similar.
        throw error;
      }
    }
  });

  await Promise.all(workers);
  return results;
}

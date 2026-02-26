/**
 * Reconstructs a readable abstract string from OpenAlex's inverted index format.
 * @param invertedAbstract - The inverted index object from the OpenAlex API.
 * @returns A string representing the paper's abstract.
 */
export function deinvertAbstract(invertedAbstract: { [key: string]: number[] }): string {
    if (!invertedAbstract) return '';
    
    const abstractArray: string[] = [];

    // Populate the array with words at their correct positions
    // This single pass avoids iterating keys twice and manually calculating maxIndex.
    // JS arrays automatically expand when assigning to an index > length.
    for (const word in invertedAbstract) {
        const positions = invertedAbstract[word];
        for (const pos of positions) {
            abstractArray[pos] = word;
        }
    }

    // Join treats empty slots (undefined) as empty strings, which matches the behavior
    // of filling with '' in the original implementation.
    return abstractArray.join(' ').trim();
}

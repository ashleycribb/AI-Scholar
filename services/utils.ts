/**
 * Reconstructs a readable abstract string from OpenAlex's inverted index format.
 * @param invertedAbstract - The inverted index object from the OpenAlex API.
 * @returns A string representing the paper's abstract.
 */
export function deinvertAbstract(invertedAbstract: { [key: string]: number[] }): string {
    if (!invertedAbstract) return '';
    
    const MAX_ABSTRACT_LENGTH = 10000;
    const abstractArray: string[] = [];
    let maxIndex = -1;

    // First, determine the size of the array needed
    for (const word in invertedAbstract) {
        if (!Array.isArray(invertedAbstract[word])) continue;
        for (const pos of invertedAbstract[word]) {
            // Check for valid position and ensure we don't exceed the max length
            if (typeof pos === 'number' && pos >= 0 && pos < MAX_ABSTRACT_LENGTH) {
                if (pos > maxIndex) {
                    maxIndex = pos;
                }
            }
        }
    }
    
    // Initialize the array with empty strings
    if(maxIndex > -1){
        // Allocate only what's necessary, up to the safe limit
        abstractArray.length = maxIndex + 1;
        abstractArray.fill('');
    }

    // Populate the array with words at their correct positions
    for (const word in invertedAbstract) {
        if (!Array.isArray(invertedAbstract[word])) continue;
        for (const pos of invertedAbstract[word]) {
            // Only populate within the bounds we determined
            if (typeof pos === 'number' && pos >= 0 && pos <= maxIndex) {
                abstractArray[pos] = word;
            }
        }
    }
    return abstractArray.join(' ').trim();
}

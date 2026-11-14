/**
 * Reconstructs a readable abstract string from OpenAlex's inverted index format.
 *
 * Hostile or malformed indexes must not force a huge allocation: positions are
 * capped, non-integer/negative indexes are skipped, and the number of entries
 * processed is bounded.
 * @param invertedAbstract - The inverted index object from the OpenAlex API.
 * @returns A string representing the paper's abstract.
 */
export const MAX_ABSTRACT_POSITION = 10000;
export const MAX_ABSTRACT_ENTRIES = 20000;

export function deinvertAbstract(invertedAbstract: { [key: string]: number[] }): string {
    if (!invertedAbstract || typeof invertedAbstract !== 'object') return '';

    const abstractArray: string[] = [];
    let maxIndex = -1;
    let entriesSeen = 0;

    const isAllowedPosition = (pos: unknown): pos is number =>
        Number.isInteger(pos) && (pos as number) >= 0 && (pos as number) < MAX_ABSTRACT_POSITION;

    for (const word in invertedAbstract) {
        const positions = invertedAbstract[word];
        if (!Array.isArray(positions)) continue;
        for (const pos of positions) {
            if (entriesSeen >= MAX_ABSTRACT_ENTRIES) break;
            entriesSeen++;
            if (!isAllowedPosition(pos)) continue;
            if (pos > maxIndex) {
                maxIndex = pos;
            }
        }
        if (entriesSeen >= MAX_ABSTRACT_ENTRIES) break;
    }

    if (maxIndex > -1) {
        abstractArray.length = maxIndex + 1;
        abstractArray.fill('');
    }

    entriesSeen = 0;
    for (const word in invertedAbstract) {
        const positions = invertedAbstract[word];
        if (!Array.isArray(positions)) continue;
        for (const pos of positions) {
            if (entriesSeen >= MAX_ABSTRACT_ENTRIES) break;
            entriesSeen++;
            if (!isAllowedPosition(pos)) continue;
            abstractArray[pos] = word;
        }
        if (entriesSeen >= MAX_ABSTRACT_ENTRIES) break;
    }
    return abstractArray.join(' ').trim();
}

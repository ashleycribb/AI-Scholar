import { expect, test } from "bun:test";
import { stableStringify } from "../../services/utils";

test("stableStringify produces consistent cache keys for different property orders", () => {
    const options1 = {
        startYear: "2020",
        endYear: "2023",
        authors: "Smith",
        excludeKeywords: "COVID",
        inclusionCriteria: "randomized",
        exclusionCriteria: "meta-analysis",
        studyDesign: "RCT",
        journal: "Nature",
        minCitations: "10",
        isOpenAccess: true
    };

    const options2 = {
        isOpenAccess: true,
        minCitations: "10",
        journal: "Nature",
        studyDesign: "RCT",
        exclusionCriteria: "meta-analysis",
        inclusionCriteria: "randomized",
        excludeKeywords: "COVID",
        authors: "Smith",
        endYear: "2023",
        startYear: "2020"
    };

    const query = "AI and healthcare";
    const page = 1;

    const cacheKey1 = stableStringify({ query, ...options1, page });
    const cacheKey2 = stableStringify({ query, ...options2, page });

    expect(cacheKey1).toBe(cacheKey2);

    // Demonstrate that standard JSON.stringify would fail
    const standardKey1 = JSON.stringify({ query, ...options1, page });
    const standardKey2 = JSON.stringify({ query, ...options2, page });

    expect(standardKey1).not.toBe(standardKey2);

    console.log("Verified: stableStringify creates consistent keys where JSON.stringify does not.");
});

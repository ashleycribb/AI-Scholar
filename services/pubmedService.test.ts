import { describe, expect, test, mock, beforeEach } from "bun:test";
import { searchPubMed } from "./pubmedService";

// Mock fetch globally
const originalFetch = global.fetch;

beforeEach(() => {
    global.fetch = mock();
});

describe("searchPubMed", () => {
    test("fetches papers successfully", async () => {
        const mockSearchResponse = {
            esearchresult: {
                count: "100",
                retmax: "20",
                retstart: "0",
                idlist: ["12345", "67890"]
            }
        };

        const mockFetchResponseXML = `
            <PubmedArticleSet>
                <PubmedArticle>
                    <MedlineCitation Status="MEDLINE" Owner="NLM">
                        <PMID Version="1">12345</PMID>
                        <Article PubModel="Print">
                            <Journal>
                                <Title>Test Journal</Title>
                            </Journal>
                            <ArticleTitle>Test Article Title 1</ArticleTitle>
                            <Abstract>
                                <AbstractText>This is a test abstract 1.</AbstractText>
                            </Abstract>
                            <AuthorList CompleteYN="Y">
                                <Author ValidYN="Y">
                                    <LastName>Doe</LastName>
                                    <ForeName>John</ForeName>
                                    <Initials>J</Initials>
                                </Author>
                            </AuthorList>
                            <Language>eng</Language>
                            <PublicationTypeList>
                                <PublicationType UI="D016428">Journal Article</PublicationType>
                            </PublicationTypeList>
                            <ArticleDate DateType="Electronic">
                                <Year>2023</Year>
                            </ArticleDate>
                        </Article>
                        <ArticleIdList>
                            <ArticleId IdType="doi">10.1234/test.1</ArticleId>
                        </ArticleIdList>
                    </MedlineCitation>
                    <PubmedData>
                        <History>
                            <PubMedPubDate PubStatus="pubmed">
                                <Year>2023</Year>
                            </PubMedPubDate>
                        </History>
                    </PubmedData>
                </PubmedArticle>
            </PubmedArticleSet>
        `;

        (global.fetch as any).mockImplementation(async (url: string) => {
            if (url.includes("esearch.fcgi")) {
                return {
                    ok: true,
                    json: async () => mockSearchResponse
                };
            }
            if (url.includes("efetch.fcgi")) {
                return {
                    ok: true,
                    text: async () => mockFetchResponseXML
                };
            }
            return { ok: false };
        });

        const result = await searchPubMed("cancer", {
            startYear: "", endYear: "", authors: "", excludeKeywords: "", inclusionCriteria: "", exclusionCriteria: "", studyDesign: ""
        }, 1);

        expect(result.papers.length).toBe(1); // One valid article in XML
        expect(result.papers[0].title).toBe("Test Article Title 1");
        expect(result.papers[0].abstract).toContain("This is a test abstract 1");
        expect(result.papers[0].doi).toBe("10.1234/test.1");
        expect(result.hasMore).toBe(true);
    });

    test("handles empty search results", async () => {
        const mockSearchResponse = {
            esearchresult: {
                count: "0",
                retmax: "20",
                retstart: "0",
                idlist: []
            }
        };

        (global.fetch as any).mockImplementation(async (url: string) => {
             if (url.includes("esearch.fcgi")) {
                return {
                    ok: true,
                    json: async () => mockSearchResponse
                };
            }
            return { ok: false };
        });

        const result = await searchPubMed("nonexistentterm", {} as any, 1);
        expect(result.papers.length).toBe(0);
        expect(result.hasMore).toBe(false);
    });
});

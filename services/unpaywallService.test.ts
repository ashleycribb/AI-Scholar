import { describe, expect, test, mock } from "bun:test";
import { findOpenAccessPdf } from "./unpaywallService";
import { UNPAYWALL_EMAIL } from "./config";

describe("unpaywallService", () => {
    test("UNPAYWALL_EMAIL is defined", () => {
        expect(UNPAYWALL_EMAIL).toBe("contact@ai-research-explorer.com");
    });

    test("findOpenAccessPdf returns PDF URL when found", async () => {
        const doi = "10.1234/example";
        const pdfUrl = "https://example.com/paper.pdf";

        const mockResponse = {
            best_oa_location: {
                url_for_pdf: pdfUrl
            }
        };

        // @ts-ignore
        global.fetch = mock(async (url: string | URL | Request) => {
            const urlString = url.toString();
            expect(urlString).toContain(encodeURIComponent(doi));
            expect(urlString).toContain(UNPAYWALL_EMAIL);
            return new Response(JSON.stringify(mockResponse));
        });

        const result = await findOpenAccessPdf(doi);
        expect(result).toBe(pdfUrl);
    });

    test("findOpenAccessPdf returns null when no PDF found", async () => {
        const doi = "10.1234/no-pdf";

        const mockResponse = {
            best_oa_location: {
                url_for_pdf: null
            }
        };

        // @ts-ignore
        global.fetch = mock(async () => {
            return new Response(JSON.stringify(mockResponse));
        });

        const result = await findOpenAccessPdf(doi);
        expect(result).toBeNull();
    });

    test("findOpenAccessPdf returns null on API error", async () => {
         const doi = "10.1234/error";

         // @ts-ignore
         global.fetch = mock(async () => {
             return new Response("Not Found", { status: 404 });
         });

         const result = await findOpenAccessPdf(doi);
         expect(result).toBeNull();
    });
});

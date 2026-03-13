
import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { listenForExtensionMessages } from "./extensionService";
import type { ResearchPaper } from "../types";

const CHANNEL_NAME = 'ai_research_explorer_channel';

describe("extensionService", () => {
    test("should accept valid paper message", async () => {
        let receivedPaper: ResearchPaper | null = null;
        const cleanup = listenForExtensionMessages(
            (p) => { receivedPaper = p; },
            () => {}
        );

        const channel = new BroadcastChannel(CHANNEL_NAME);
        const validPaper: Partial<ResearchPaper> = {
            id: "123",
            title: "Test Paper",
            authors: "Test Author",
            year: 2023,
            abstract: "Test Abstract"
        };

        channel.postMessage({
            type: "paper_saved_to_workspace",
            paper: validPaper
        });

        // Wait for message to be processed
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(receivedPaper).toEqual(expect.objectContaining(validPaper));

        cleanup();
        channel.close();
    });

    test("should reject invalid paper message", async () => {
        let receivedPaper: ResearchPaper | null = null;
        const cleanup = listenForExtensionMessages(
            (p) => { receivedPaper = p; },
            () => {}
        );

        const channel = new BroadcastChannel(CHANNEL_NAME);
        const invalidPaper = {
            id: 123, // Wrong type (should be string)
            // Missing title
        };

        channel.postMessage({
            type: "paper_saved_to_workspace",
            paper: invalidPaper
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        // Before fix: This should fail because invalid paper is accepted
        expect(receivedPaper).toBeNull();

        cleanup();
        channel.close();
    });
});

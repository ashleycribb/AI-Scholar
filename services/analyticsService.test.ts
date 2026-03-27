import { describe, it, expect, spyOn } from "bun:test";

// Mock localStorage
const localStorageMock = {
    getItem: (key: string) => null,
    setItem: (key: string, value: string) => {},
    clear: () => {},
    removeItem: (key: string) => {},
    length: 0,
    key: (index: number) => null,
} as Storage;

// Mock window and document if needed, but localStorage is main concern
// Bun test environment doesn't have window/document/localStorage by default unless configured.
// We assign to global to mimic browser environment for the module.
global.localStorage = localStorageMock;

// Mock alert since it is used in exportToCSV
global.alert = (message: string) => {};

describe("AnalyticsService", () => {
    it("should not log 'New session started' on initialization", async () => {
        // Spy on console.log
        const logSpy = spyOn(console, "log");

        // Dynamically import the service to trigger initialization
        // Note: In Bun test, modules are cached. If this test runs multiple times in same process, it won't re-init.
        // But for a single run, it should work.
        const { analyticsService } = await import("./analyticsService");

        // Verify the log was called with the specific message
        const wasCalled = logSpy.mock.calls.some(call =>
            call[0] && call[0].toString().includes("[ANALYTICS] New session started")
        );

        expect(wasCalled).toBe(false);

        // Clean up
        logSpy.mockRestore();
    });
});

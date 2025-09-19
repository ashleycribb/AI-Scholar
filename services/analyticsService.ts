// A simple UUID generator for session tracking
const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

class AnalyticsService {
    private sessionId: string;

    constructor() {
        this.sessionId = generateUUID();
        console.log(`[ANALYTICS] New session started: ${this.sessionId}`);
    }

    /**
     * Logs an analytics event.
     * Uses an arrow function to ensure `this` is correctly bound when the method is passed as a callback.
     * @param eventName - The name of the event.
     * @param payload - An object containing data related to the event.
     */
    public logEvent = (eventName: string, payload: object): void => {
        const eventData = {
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            ...payload,
        };

        // In a real-world application, this would send data to an analytics backend.
        // For this project, we'll log it to the console for demonstration purposes.
        console.log(`[ANALYTICS] Event: ${eventName}`, eventData);
    }
}

// Export a singleton instance of the service
export const analyticsService = new AnalyticsService();

// A simple UUID generator for session tracking
const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

interface AnalyticsEvent {
    eventName: string;
    data: any;
}

const STORAGE_KEY = 'global_analytics_events';

class AnalyticsService {
    private sessionId: string;
    private events: AnalyticsEvent[] = [];

    constructor() {
        this.sessionId = generateUUID();
        this.events = this.loadEventsFromStorage();
        console.log(`[ANALYTICS] New session started: ${this.sessionId}`);
        this.logEvent('session_started', {}); // Log a session start event
    }

    private loadEventsFromStorage = (): AnalyticsEvent[] => {
        try {
            const storedEvents = localStorage.getItem(STORAGE_KEY);
            return storedEvents ? JSON.parse(storedEvents) : [];
        } catch (error) {
            console.error("[ANALYTICS] Failed to load events from localStorage:", error);
            return [];
        }
    }

    private saveEventsToStorage = (): void => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
        } catch (error) {
            console.error("[ANALYTICS] Failed to save events to localStorage:", error);
        }
    }


    /**
     * Logs an analytics event and stores it in the session history.
     * @param eventName - The name of the event.
     * @param payload - An object containing data related to the event.
     */
    public logEvent = (eventName: string, payload: object): void => {
        const eventData = {
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            ...payload,
        };
        
        // Add to in-memory array for current session use
        this.events.push({ eventName, data: eventData });
        
        // Persist to localStorage for cross-session analysis
        this.saveEventsToStorage();

        // In a real-world application, this would send data to an analytics backend.
        console.log(`[ANALYTICS] Event: ${eventName}`, eventData);
    }

    /**
     * Retrieves all events logged during the current session.
     * @returns An array of all stored analytics events.
     */
    public getEvents = (): AnalyticsEvent[] => {
        return this.events;
    }

    /**
     * Converts the session's analytics events to a CSV string and triggers a download.
     * The CSV includes a 'details' column with a properly escaped JSON string of the event payload.
     */
    public exportToCSV = (): void => {
        if (this.events.length === 0) {
            alert("No analytics data to export for this session.");
            return;
        }

        const header = "eventName,timestamp,sessionId,details\n";

        const rows = this.events.map(event => {
            const { eventName, data } = event;
            const { sessionId, timestamp, ...details } = data as any;

            // The 'details' object contains the specific payload of the event.
            // We serialize it to a JSON string.
            const detailsJson = JSON.stringify(details);

            // To make the JSON string safe for a CSV column, we enclose it in double quotes
            // and escape any existing double quotes inside it by replacing them with two double quotes ("").
            const escapedDetails = detailsJson.replace(/"/g, '""');
            
            // The final column is the JSON string, wrapped in quotes.
            return `${eventName},${timestamp},${sessionId},"${escapedDetails}"\n`;
        });

        const csvContent = header + rows.join('');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `analytics_report_${this.sessionId}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}

// Export a singleton instance of the service
export const analyticsService = new AnalyticsService();

// Firebase configuration has been removed as per user request.
// This file now exports dummy functions to maintain API compatibility.

const logAnalyticsEvent = async (eventName: string, data: any) => {
    // No-op
    // console.log(`[Mock Firestore] Event: ${eventName}`, data);
};

const getStatus = () => {
    return { status: 'uninitialized', message: 'Firestore is disabled.' };
};

export const firestoreService = {
    logAnalyticsEvent,
    getStatus,
};

export const storage = null;

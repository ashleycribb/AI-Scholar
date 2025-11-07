import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, Firestore } from 'firebase/firestore';

let db: Firestore | null = null;
let status: 'uninitialized' | 'initializing' | 'connected' | 'error' = 'uninitialized';
let statusMessage = 'Not connected to Firestore.';

const initializeFirestore = () => {
    // Prevent re-initialization
    if (db || status === 'initializing' || status === 'connected') return;
    
    status = 'initializing';
    try {
        const firebaseConfigString = process.env.FIREBASE_CONFIG;
        if (!firebaseConfigString) {
            status = 'error';
            statusMessage = "Firebase configuration is not available. Firestore logging is disabled.";
            console.warn("[FIRESTORE] " + statusMessage);
            return; // Exit gracefully
        }
        
        const firebaseConfig = JSON.parse(firebaseConfigString);
        
        const app: FirebaseApp = initializeApp(firebaseConfig);
        db = getFirestore(app);
        status = 'connected';
        statusMessage = 'Successfully connected to Firestore.';
        console.log("[FIRESTORE] Connection successful.");

    } catch (error) {
        status = 'error';
        const message = error instanceof Error ? error.message : String(error);
        statusMessage = `Firestore connection failed: ${message}`;
        console.error("[FIRESTORE] " + statusMessage);
        db = null;
    }
};

const logAnalyticsEvent = async (eventName: string, data: any) => {
    if (status !== 'connected' || !db) {
        // Don't log an error here, as it would be noisy. The status indicator will show the problem.
        return;
    }

    try {
        // Create a new document in the "analyticsEvents" collection
        await addDoc(collection(db, "analyticsEvents"), {
            eventName,
            ...data,
            // Use a server-side timestamp for accurate and consistent timing
            firestoreTimestamp: serverTimestamp() 
        });
    } catch (error) {
        console.error("[FIRESTORE] Error logging event to Firestore:", error);
        // Optionally update status on write failure
        status = 'error';
        statusMessage = `Failed to write to Firestore: ${error instanceof Error ? error.message : String(error)}`;
    }
};

const getStatus = () => {
    return { status, message: statusMessage };
};

// Initialize the connection as soon as the module is loaded.
initializeFirestore();

export const firestoreService = {
    logAnalyticsEvent,
    getStatus,
};
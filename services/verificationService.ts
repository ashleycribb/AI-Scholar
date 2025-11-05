import { VerificationResult } from '../types';

// New Agent Backend URL for verification
const AGENT_BACKEND_URL = 'http://localhost:3002/api/agents';

// This function communicates with the new agent backend verification service.
export async function verifyPaper(
    doi: string, 
    claimText: string
): Promise<VerificationResult> {
  
  try {
    const response = await fetch(AGENT_BACKEND_URL, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        },
        // Send intent and payload to the generic agent endpoint
        body: JSON.stringify({ 
            intent: 'verifyPaper', 
            payload: { doi, claimText } 
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Verification service failed with an unknown error.' }));
        throw new Error(errorData.error || `Verification failed with status: ${response.status}`);
    }

    const result: VerificationResult = await response.json();
    return result;
  } catch (error) {
    console.error("Error calling verification service:", error);
    if (error instanceof TypeError) { // Often indicates a network error (e.g., backend not running)
        throw new Error("Could not connect to the AI agent backend. Please ensure the backend server is running and accessible at http://localhost:3002.");
    }
    throw error; // Re-throw other errors
  }
}
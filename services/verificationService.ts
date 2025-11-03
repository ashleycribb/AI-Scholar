
import { VerificationResult } from '../types';

// This function communicates with the backend verification service.
// NOTE: For this to work, the backend service in the `backend/` directory
// must be running (`npm install` then `npm run dev` in `backend/`).
export async function verifyPaper(
    doi: string, 
    claimText: string
): Promise<VerificationResult> {
  
  // The backend service runs on localhost:3001 by default.
  // In a real production environment, this would be an absolute URL
  // to the deployed backend service.
  const VERIFICATION_API_URL = 'http://localhost:3001/api/verifyPaper';

  try {
    const response = await fetch(VERIFICATION_API_URL, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify({ doi, claimText }),
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
        throw new Error("Could not connect to the verification service. Please ensure the backend server is running and accessible.");
    }
    throw error; // Re-throw other errors
  }
}

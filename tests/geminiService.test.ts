
import { safeJsonParse } from '../services/geminiService';

const SENSITIVE_DATA = "SECRET_API_KEY_12345";
const INVALID_JSON = `{"key": "${SENSITIVE_DATA}"`; // Missing closing brace

let loggedSensitiveData = false;

const originalConsoleError = console.error;
console.error = (...args) => {
    const msg = args.join(' ');
    if (msg.includes(SENSITIVE_DATA)) {
        loggedSensitiveData = true;
        console.log("VULNERABILITY CONFIRMED: Sensitive data logged!");
    }
};

console.log("Running reproduction script...");
try {
    safeJsonParse(INVALID_JSON);
} catch (e) {
    console.log("safeJsonParse threw exception (unexpected for this test)");
}

if (loggedSensitiveData) {
    console.log("Test Result: FAIL (Vulnerability exists)");
    process.exit(1);
} else {
    console.log("Test Result: PASS (Sensitive data NOT logged)");
    process.exit(0);
}

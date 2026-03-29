import { safeJsonParse } from '../services/geminiService';

const SENSITIVE_TOKEN = "SENSITIVE_SECRET_TOKEN";
const INVALID_JSON = `{ "key": "${SENSITIVE_TOKEN}"`;

let consoleErrorOutput: string[] = [];
const originalConsoleError = console.error;

console.error = (...args: any[]) => {
  consoleErrorOutput.push(args.map(a => String(a)).join(' '));
};

console.log("Testing safeJsonParse...");

// Test Case 1: Invalid JSON with sensitive data
const invalidResult = safeJsonParse(INVALID_JSON);
const sensitiveLogged = consoleErrorOutput.some(log => log.includes(SENSITIVE_TOKEN));

if (sensitiveLogged) {
  console.error("TEST FAILED: SENSITIVE_DATA_LOGGED");
  process.exit(1);
}

if (invalidResult !== null) {
  console.error("TEST FAILED: Expected null return on invalid JSON");
  process.exit(1);
}

// Test Case 2: Valid JSON
const VALID_JSON = '{"key": "value"}';
const validResult = safeJsonParse(VALID_JSON);
if (!validResult || validResult.key !== "value") {
  console.error("TEST FAILED: Valid JSON parsing broken");
  process.exit(1);
}

console.error = originalConsoleError;
console.log("ALL TESTS PASSED: SENSITIVE_DATA_NOT_LOGGED, handled invalid JSON, and parsed valid JSON");
process.exit(0);

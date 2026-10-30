
// Mock localStorage
if (typeof localStorage === 'undefined') {
  (global as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
  };
}

let sessionId = '';
const originalLog = console.log;

// Intercept console.log
console.log = (...args: any[]) => {
    if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('[ANALYTICS] New session started:')) {
        sessionId = args[0].split(': ')[1];
    }
    // originalLog(...args);
};

async function run() {
    try {
        const { analyticsService } = await import('../services/analyticsService');

        // Wait a bit just in case async ops (though constructor is sync)

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (sessionId && uuidRegex.test(sessionId)) {
            originalLog('Test Passed: Valid UUID generated: ' + sessionId);
        } else {
            originalLog('Test Failed: Invalid or missing session ID. Got: "' + sessionId + '"');
            process.exit(1);
        }

    } catch (err) {
        originalLog('Test Error:', err);
        process.exit(1);
    }
}

run();

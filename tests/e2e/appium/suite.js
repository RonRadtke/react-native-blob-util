const {buildCapabilities} = require('./lib/capabilities');
const {createDriverSession} = require('./lib/driver');
const {enableE2eMode, setBaseUrl, resetFixtures, clearLog} = require('./lib/ui');
const {resolveScenarioNames, runScenario} = require('./scenarios');

const VALID_PLATFORMS = ['android', 'ios', 'windows'];

const runSuiteForPlatform = async (platform) => {
    const capabilities = buildCapabilities(platform);
    const driver = await createDriverSession(capabilities);
    const context = {driver, platform};

    try {
        await enableE2eMode(context);

        if (process.env.E2E_SERVER_URL) {
            await setBaseUrl(context, process.env.E2E_SERVER_URL);
        }

        await resetFixtures(context);
        await clearLog(context);

        const scenarios = resolveScenarioNames(process.env.E2E_SCENARIOS);
        for (const scenarioName of scenarios) {
            console.log(`[e2e] Running scenario: ${scenarioName}`);
            await runScenario(scenarioName, context);
        }

        console.log(`[e2e] Completed ${platform} suite.`);
    } finally {
        await driver.deleteSession();
    }
};

module.exports = {
    VALID_PLATFORMS,
    runSuiteForPlatform,
};

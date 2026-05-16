const {runFilesystemScenario} = require('./filesystem');
const {runNetworkScenario} = require('./network');

const SCENARIOS = {
    filesystem: runFilesystemScenario,
    network: runNetworkScenario,
};

const DEFAULT_SCENARIOS = ['filesystem', 'network'];

const resolveScenarioNames = (rawScenarios) => {
    if (!rawScenarios) {
        return DEFAULT_SCENARIOS;
    }

    const names = rawScenarios
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

    const unique = [];
    const invalid = [];
    for (const name of names) {
        if (!SCENARIOS[name]) {
            invalid.push(name);
            continue;
        }
        if (!unique.includes(name)) {
            unique.push(name);
        }
    }

    if (invalid.length > 0) {
        throw new Error(`Unknown E2E scenarios: ${invalid.join(', ')}.`);
    }
    if (unique.length === 0) {
        throw new Error('No scenarios selected. Set E2E_SCENARIOS to a comma-separated list.');
    }
    return unique;
};

const runScenario = async (name, context) => {
    const scenario = SCENARIOS[name];
    if (!scenario) {
        throw new Error(`Unknown scenario: ${name}`);
    }
    await scenario(context);
};

module.exports = {
    DEFAULT_SCENARIOS,
    resolveScenarioNames,
    runScenario,
};

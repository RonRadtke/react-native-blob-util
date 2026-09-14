import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const {resolveScenarioNames} = require('../e2e/appium/scenarios');
const suiteSource = fs.readFileSync(new URL('../e2e/appium/suite.js', import.meta.url), 'utf8');

// Run the real suite and selection logic, replacing only device interaction.
async function selectedBySuite(platform, requested) {
    const selected = [];
    let closed = false;
    const module = {exports: {}};
    vm.runInNewContext(suiteSource, {
        module,
        console: {log() {}},
        process: {env: {E2E_SCENARIOS: requested}},
        require(name) {
            if (name === './scenarios') {
                return {resolveScenarioNames, runScenario: async (scenario) => selected.push(scenario)};
            }
            if (name === './lib/capabilities') return {buildCapabilities: () => ({})};
            if (name === './lib/driver') {
                return {createDriverSession: async () => ({deleteSession: async () => { closed = true; }})};
            }
            if (name === './lib/ui') {
                return Object.fromEntries(['enableE2eMode', 'setBaseUrl', 'resetFixtures', 'clearLog']
                    .map((key) => [key, async () => {}]));
            }
            throw new Error(`Unexpected dependency: ${name}`);
        },
    });
    await module.exports.runSuiteForPlatform(platform);
    assert.equal(closed, true, 'the suite closes its device session');
    return selected;
}

test('the default Windows suite does not require an unrecorded parity baseline', async () => {
    assert.deepEqual(await selectedBySuite('windows'), ['filesystem', 'network', 'tls']);
});

for (const platform of ['android', 'ios']) {
    test(`the default ${platform} suite still checks its recorded parity baseline`, async () => {
        assert.deepEqual(await selectedBySuite(platform), ['filesystem', 'network', 'tls', 'parity']);
        assert.ok(fs.existsSync(new URL(`../e2e/appium/parity/${platform}.json`, import.meta.url)));
    });
}

test('explicit scenario selection is preserved, including recording Windows parity', async () => {
    assert.deepEqual(await selectedBySuite('windows', 'tls,parity,tls'), ['tls', 'parity']);
    assert.throws(() => resolveScenarioNames('unknown', 'windows'), /Unknown E2E scenarios/);
});

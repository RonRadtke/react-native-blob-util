const fs = require('fs');
const path = require('path');

const {setInput, tap} = require('../lib/ui');
const {sleep} = require('../lib/utils');

/**
 * Behavioural parity, pinned per platform.
 *
 * The example app runs each case in examples/ReactNativeBlobUtil/parity/cases.js
 * against the real native layer and reports a normalised signature: what the
 * call resolved or rejected with, the shape and types of the payload, the error
 * code and message. This scenario compares that signature with the golden file
 * for the platform in tests/e2e/appium/parity/.
 *
 * The goldens are recorded from the native code as it stood before the
 * Kotlin/Swift port, so a mismatch means the port changed something a caller can
 * observe. Where the platforms disagreed, each golden keeps its own platform's
 * answer: parity here means "unchanged on this platform", not "the same
 * everywhere".
 *
 * Record or refresh goldens deliberately, never to make a failure go away:
 *
 *   E2E_PARITY_RECORD=1 npm run e2e:android     (writes tests/e2e/appium/parity/android.json)
 *
 * E2E_PARITY_CASES=id1,id2 limits a run to some cases; recording then merges into
 * the existing golden rather than replacing it.
 */

const GOLDEN_DIR = path.join(__dirname, '..', 'parity');
const CASE_TIMEOUT = Number(process.env.E2E_PARITY_CASE_TIMEOUT || 60000);

const decodeXml = (value) => value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/**
 * Reads the newest log entry for `key` from the page source. Only the newest
 * entry is visible on iOS (see the note in App.js), so the app logs a RUNNING
 * marker first and the result last, and this waits until the result replaces it.
 *
 * The value is read from the raw XML attribute and decoded afterwards. Which quote
 * closes it depends on the driver: UiAutomator2 switches to single quotes when the
 * value itself contains double quotes - which every JSON result does - while
 * XCUITest escapes them as &quot; inside double quotes. So the quote that opens
 * the attribute decides where it ends.
 */
const readEntry = async (context, key, timeout = CASE_TIMEOUT) => {
    const marker = `e2e-last-log-output:${key}: `;
    const start = Date.now();
    let last = null;

    while (Date.now() - start < timeout) {
        const source = await context.driver.getPageSource();
        const at = source.indexOf(marker);

        if (at !== -1) {
            const opening = source[at - 1];
            const closing = opening === '\'' || opening === '"' ? opening : '"';
            const from = at + marker.length;
            const value = decodeXml(source.slice(from, source.indexOf(closing, from)));
            last = value;

            if (value.startsWith('RESULT ')) {
                try {
                    return {result: JSON.parse(value.slice('RESULT '.length))};
                } catch (err) {
                    // A result caught mid-render, or cut short by the driver - read again.
                }
            } else if (!value.startsWith('RUNNING')) {
                return {raw: value};
            }
        }

        await sleep(500);
    }

    return {raw: `no parseable result within ${timeout} ms; last seen: ${last}`};
};

const goldenPath = (platform) => path.join(GOLDEN_DIR, `${platform}.json`);

const loadGolden = (platform) => {
    try {
        return JSON.parse(fs.readFileSync(goldenPath(platform), 'utf8'));
    } catch (err) {
        return null;
    }
};

const sortKeys = (value) => {
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
    }
    return value;
};

const runParityScenario = async (context) => {
    const {platform} = context;
    const recording = ['1', 'true', 'yes'].includes(String(process.env.E2E_PARITY_RECORD || '').toLowerCase());

    await tap(context, 'parity-list-button');
    const listed = await readEntry(context, 'parity-list');
    if (!listed.result) {
        throw new Error(`The app did not list its parity cases: ${listed.raw}`);
    }

    const only = (process.env.E2E_PARITY_CASES || '').split(',').map((id) => id.trim()).filter(Boolean);
    const ids = only.length > 0 ? listed.result.filter((id) => only.includes(id)) : listed.result;

    const golden = loadGolden(platform);
    if (!golden && !recording) {
        throw new Error(`No parity golden for ${platform} at ${goldenPath(platform)}. Record one with E2E_PARITY_RECORD=1.`);
    }

    const actual = {};
    const problems = [];

    for (const id of ids) {
        await setInput(context, 'parity-case-input', id);
        await tap(context, 'parity-run-button');
        const entry = await readEntry(context, `parity-${id}`);

        if (!entry.result) {
            problems.push(`${id}: the case did not report a result - ${entry.raw}`);
            continue;
        }

        actual[id] = sortKeys(entry.result);
        console.log(`[parity] ${id}: ${JSON.stringify(actual[id])}`);

        if (!recording) {
            if (!(id in golden)) {
                problems.push(`${id}: no golden recorded for ${platform}`);
            } else if (JSON.stringify(sortKeys(golden[id])) !== JSON.stringify(actual[id])) {
                problems.push(`${id}: differs from the ${platform} golden\n  expected: ${JSON.stringify(sortKeys(golden[id]))}\n  actual:   ${JSON.stringify(actual[id])}`);
            }
        }
    }

    if (!recording && only.length === 0) {
        for (const id of Object.keys(golden)) {
            if (!ids.includes(id)) {
                problems.push(`${id}: in the ${platform} golden but the app no longer runs it`);
            }
        }
    }

    if (recording) {
        const merged = sortKeys(only.length > 0 ? {...(golden || {}), ...actual} : actual);
        fs.mkdirSync(GOLDEN_DIR, {recursive: true});
        fs.writeFileSync(goldenPath(platform), JSON.stringify(merged, null, 2) + '\n');
        console.log(`[parity] recorded ${Object.keys(actual).length} case(s) into ${goldenPath(platform)}`);
    }

    if (problems.length > 0) {
        throw new Error(`Parity failed on ${platform} (${problems.length}):\n${problems.join('\n')}`);
    }
};

module.exports = {
    runParityScenario,
};

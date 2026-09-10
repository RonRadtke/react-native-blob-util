/**
 * The appium scenarios drive the apps by testID. Nothing connects the two at
 * build time, so they drift silently: the customCACerts work added six TLS
 * buttons to the e2e app that no scenario ever tapped, and the example app -
 * the Windows target - did not have them at all. Either way the feature looked
 * covered and was not.
 *
 * This checks the wiring without a device, so it catches the drift on any
 * platform, including the ones whose e2e run needs hardware we may not have.
 */
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

const SCENARIO_DIR = join(root, 'tests', 'e2e', 'appium', 'scenarios');
const APPS = {
    'e2e app': join(root, 'tests', 'e2e', 'android-app', 'App.js'),
    'example app': join(root, 'examples', 'ReactNativeBlobUtil', 'App.js'),
};

/** ids the scenarios tap, mapped to the files that tap them */
function tappedIds() {
    const ids = new Map();

    for (const file of readdirSync(SCENARIO_DIR).filter(f => f.endsWith('.js') && f !== 'index.js')) {
        const source = readFileSync(join(SCENARIO_DIR, file), 'utf8');
        for (const [, id] of source.matchAll(/\btap\(\s*context\s*,\s*['"]([^'"]+)['"]/g)) {
            if (!ids.has(id)) ids.set(id, []);
            ids.get(id).push(file);
        }
    }

    return ids;
}

/**
 * ids an app exposes. Three forms are in use: a literal `testID`/`id` prop, the
 * `e2eId('...')` spread helper, and template literals built from a variable
 * (`id={`read-stream-enc-${enc}-button`}`). The last cannot be resolved
 * statically, so it contributes a pattern rather than an exact id.
 */
function exposedIds(appPath) {
    const source = readFileSync(appPath, 'utf8');

    const literals = new Set([
        ...[...source.matchAll(/(?:testID|id)=["']([^"']+)["']/g)].map(m => m[1]),
        ...[...source.matchAll(/e2eId\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]),
    ]);

    const patterns = [...source.matchAll(/(?:testID|id)=\{`([^`]*\$\{[^`]*)`\}/g)].map(([, template]) => {
        const source = template
            .split(/\$\{[^}]*\}/)
            .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('[^"\'`]+');
        return new RegExp(`^${source}$`);
    });

    return {
        has: (id) => literals.has(id) || patterns.some(p => p.test(id)),
        list: () => [...literals],
    };
}

test('every id the scenarios tap exists in at least one app', () => {
    const tapped = tappedIds();
    assert.ok(tapped.size > 0, 'no tap() calls found - has the scenario API changed?');

    const apps = Object.entries(APPS).map(([name, p]) => [name, exposedIds(p)]);

    // Not every id has to be in both: some taps are gated to a single platform,
    // and the two apps cover different ones. An id in neither is a dead
    // reference that will fail the moment the scenario reaches it.
    const dead = [...tapped.keys()]
        .filter(id => !apps.some(([, app]) => app.has(id)))
        .map(id => `${id} (tapped by ${tapped.get(id).join(', ')})`)
        .sort();

    assert.deepEqual(dead, [], 'scenarios tap testIDs that neither app exposes');
});

test('both apps expose the same TLS cases', () => {
    // The TLS scenario has to behave identically on Android, iOS and Windows,
    // and the apps split those: the e2e app builds for Android and iOS, the
    // example app is the Windows target. A case missing from one is a platform
    // silently going untested.
    const perApp = Object.fromEntries(
        Object.entries(APPS).map(([name, p]) => [
            name,
            exposedIds(p).list().filter(id => id.startsWith('tls-')).sort(),
        ])
    );

    const [reference, ...others] = Object.values(perApp);
    assert.ok(reference.length >= 6, `expected the TLS cases to be present, saw ${reference.length}`);

    for (const other of others) {
        assert.deepEqual(other, reference, `TLS testIDs differ between apps: ${JSON.stringify(perApp, null, 2)}`);
    }
});

test('every TLS case the apps expose is exercised by a scenario', () => {
    const tapped = new Set(tappedIds().keys());
    const exposed = exposedIds(APPS['e2e app']).list().filter(id => id.startsWith('tls-'));

    const untested = exposed.filter(id => !tapped.has(id)).sort();

    assert.deepEqual(untested, [], 'TLS buttons exist that no scenario taps');
});

test('every tapped id routes to a panel the app defines', () => {
    // The e2e panel is tabbed, and ui.js switches tabs by mapping a testID to a
    // panel name. An id with no mapping leaves the harness on whatever tab is open,
    // so the button is simply not rendered and the tap times out after 20s with
    // "element still not displayed" - which reads like a broken app, not a missing
    // line in a lookup table. That is exactly how the TLS cases first failed.
    const {panelForTestId} = require(join(root, 'tests', 'e2e', 'appium', 'lib', 'ui.js'));

    // panel names come from the tab list the app renders
    const appSource = readFileSync(APPS['e2e app'], 'utf8');
    const tabList = appSource.slice(appSource.indexOf('styles.e2eTabs'));
    const panels = new Set([...tabList.matchAll(/\[\s*'([A-Za-z]+)'\s*,\s*'[^']*'\s*\]/g)].map(m => m[1]));

    assert.ok(panels.has('tls'), `expected a tls tab, saw ${[...panels].join(', ')}`);

    const unroutable = [...tappedIds().keys()]
        .map(id => [id, panelForTestId(id)])
        .filter(([, panel]) => !panel || !panels.has(panel))
        .map(([id, panel]) => `${id} -> ${panel || 'no mapping'}`)
        .sort();

    assert.deepEqual(unroutable, [], 'tapped ids do not route to a panel the app renders');
});

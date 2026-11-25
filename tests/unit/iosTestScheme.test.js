/**
 * The iOS unit tests run through the example app's shared scheme, so what the
 * scheme lists is what `npm run test:ios` and CI execute.
 *
 * A TestableReference whose BlueprintIdentifier names no target in
 * project.pbxproj is not an error Xcode reports. It falls back to the
 * BuildableName, so a stale entry silently runs the same test bundle again:
 * the scheme carried three references to one bundle, two of them dangling,
 * and the suite ran three times per invocation. Worse, the run then reported
 * `** TEST SUCCEEDED **` and exited 0 with a test failing in an earlier pass,
 * which is how a failure can reach a release unseen.
 */
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const iosDir = '../../examples/ReactNativeBlobUtil/ios/';
const read = (relative) => readFileSync(new URL(iosDir + relative, import.meta.url), 'utf8');

const scheme = read('ReactNativeBlobUtilE2E.xcodeproj/xcshareddata/xcschemes/ReactNativeBlobUtilE2E.xcscheme');
const project = read('ReactNativeBlobUtilE2E.xcodeproj/project.pbxproj');

const testables = [...scheme.matchAll(/<TestableReference\b[\s\S]*?<\/TestableReference>/g)].map((match) => {
    const block = match[0];
    const value = (attribute) => (block.match(new RegExp(`${attribute} = "([^"]*)"`)) || [])[1];
    return {identifier: value('BlueprintIdentifier'), bundle: value('BuildableName')};
});

test('the scheme has a testable to run', () => {
    assert.ok(testables.length > 0, 'the scheme lists no TestableReference');
});

test('every testable names a target that exists in the project', () => {
    // A PBXNativeTarget is declared as `<identifier> /* <name> */ = {`.
    const dangling = testables.filter(({identifier}) => !project.includes(identifier));
    assert.deepEqual(
        dangling.map(({identifier, bundle}) => `${bundle} -> ${identifier}`),
        [],
        'these testables name no target in project.pbxproj, so Xcode resolves them by name and runs the bundle again',
    );
});

test('no test bundle is listed twice', () => {
    const seen = new Set();
    const twice = testables.filter(({bundle}) => (seen.has(bundle) ? true : (seen.add(bundle), false)));
    assert.deepEqual(twice.map(({bundle}) => bundle), [], 'the suite would run more than once per invocation');
});

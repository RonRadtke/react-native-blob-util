/**
 * `codegenSpecs/NativeBlobUtils.js` is the contract every native layer
 * implements - Android and iOS through the bindings React Native's codegen
 * generates from it, Windows through the headers committed under
 * windows/ReactNativeBlobUtil/codegen. Rewriting a native layer must leave it
 * exactly where it is, and changing it must be a decision rather than an
 * accident, so the schema codegen derives from the spec is pinned here.
 *
 * Codegen is what reads the spec, so the comparison runs on its output rather
 * than on the source text: a comment or formatting change passes, a changed
 * signature fails.
 *
 * After an intentional spec change, regenerate the snapshot in the same commit:
 *
 *   node tests/unit/codegenSchema.test.js --update
 */
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

const SPEC_DIR = join(root, 'codegenSpecs');
const SNAPSHOT = join(root, 'tests', 'unit', 'fixtures', 'codegen-schema.json');
const CLI = require.resolve('@react-native/codegen/lib/cli/combine/combine-js-to-schema-cli.js', {paths: [root]});

function generateSchema(platform) {
    const dir = mkdtempSync(join(tmpdir(), 'rnbu-codegen-'));
    const out = join(dir, `${platform}.json`);

    try {
        execFileSync(process.execPath, [CLI, '--platform', platform, out, SPEC_DIR], {stdio: 'pipe'});
        return JSON.parse(readFileSync(out, 'utf8'));
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
}

const methodNames = (schema) => Object.values(schema.modules)
    .flatMap((module) => module.spec.methods.map((method) => method.name))
    .sort();

if (process.argv.includes('--update')) {
    writeFileSync(SNAPSHOT, JSON.stringify(generateSchema('ios'), null, 2) + '\n');
    console.log(`Updated ${SNAPSHOT}`);
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

for (const platform of ['android', 'ios']) {
    test(`the ${platform} codegen schema matches the committed snapshot`, () => {
        const schema = generateSchema(platform);

        // Method names first: a renamed, added or removed method reads far more
        // clearly as a list than as a diff buried in a 26 KB object.
        assert.deepEqual(methodNames(schema), methodNames(snapshot), 'the set of native methods changed');
        assert.deepEqual(schema, snapshot, 'a native method signature changed - see the note at the top of this file');
    });
}

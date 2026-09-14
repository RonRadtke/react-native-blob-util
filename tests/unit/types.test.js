/**
 * index.d.ts is the package's typed surface. This compiles it, together with
 * a usage sample that exercises every declared API the way an app would, so
 * that a declaration that drifts from the JavaScript, or a sample that no
 * longer type-checks, fails here.
 *
 * TypeScript arrives through the lint tooling's dependencies rather than as
 * a dependency of this package; the test skips when it is not installed.
 */
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

test('index.d.ts and the usage sample type-check under --strict', {skip: existsSync(tsc) ? false : 'typescript is not installed'}, () => {
    const result = spawnSync(process.execPath, [
        tsc, '-p', join(root, 'tests', 'unit', 'fixtures', 'tsconfig.types-check.json'),
    ], {cwd: root, encoding: 'utf8'});

    assert.equal(result.status, 0, `tsc failed:\n${result.stdout}${result.stderr}`);
});

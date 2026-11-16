/**
 * docs/api-reference.md lists every export, so it must not fall behind
 * index.d.ts: every method declared there has to appear in it, written the way
 * the page writes calls (`fs.readFile(`, `task.pause(`, `res.json(` ...), and
 * every namespaced call the page names has to be declared. Read as text, with
 * no TypeScript, so it runs wherever `npm test` does.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const declarations = readFileSync(join(root, 'index.d.ts'), 'utf8').replace(/\r\n/g, '\n');
const reference = readFileSync(join(root, 'docs', 'api-reference.md'), 'utf8').replace(/\r\n/g, '\n');

// How the page writes a member of each declared type.
const PREFIX = {
    ReactNativeBlobUtilStatic: '',
    StatefulPromise: 'task.',
    FetchBlobResponse: 'res.',
    FS: 'fs.',
    OpenApi: 'open.',
    MediaApi: 'media.',
    BackgroundApi: 'background.',
    ReactNativeBlobUtilSession: 'session(name).',
    ReactNativeBlobUtilReadStream: 'reader.',
    ReactNativeBlobUtilWriteStream: 'writer.',
    IOSApi: 'ios.',
    AndroidApi: 'android.',
    MediaCollection: 'MediaCollection.',
    URIUtil: 'URIUtil.',
};
// Static members are written on the class.
const STATIC_PREFIX = {ReactNativeBlobUtilSession: 'ReactNativeBlobUtilSession.'};

/** The text between the brace that opens a declaration and the one that closes it. */
function bodyOf(name) {
    const start = new RegExp(`^export (?:declare )?(?:interface|class|const) ${name}\\b[^{]*\\{`, 'm').exec(declarations);
    assert.ok(start, `index.d.ts declares no ${name}`);
    let depth = 1;
    let i = start.index + start[0].length;
    const from = i;
    for (; depth > 0; i++) {
        if (declarations[i] === '{') depth++;
        if (declarations[i] === '}') depth--;
    }
    return declarations.slice(from, i - 1);
}

/** The members declared directly in a body: methods, and properties when asked for. */
function membersOf(body, {properties = false} = {}) {
    const members = [];
    let depth = 0;
    for (const line of body.split('\n')) {
        const atTop = depth === 0;
        for (const ch of line) {
            if (ch === '{' || ch === '(') depth++;
            if (ch === '}' || ch === ')') depth--;
        }
        const m = atTop && /^\s*(static\s+)?(?:readonly\s+)?([A-Za-z_]\w*)\??\s*([(<:])(.*)$/.exec(line);
        if (!m || m[2] === 'constructor') continue;
        // A method, or a property typed as another declaration's method (scanFile: MediaApi['scan']).
        const method = m[3] !== ':' || /^\s*\w+\['\w+'\]/.test(m[4]);
        if (method || properties) {
            members.push({name: m[2], isStatic: Boolean(m[1]), method});
        }
    }
    return members;
}

function escape(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('docs/api-reference.md names every method index.d.ts declares', () => {
    const missing = [];
    for (const [type, prefix] of Object.entries(PREFIX)) {
        const members = membersOf(bodyOf(type));
        assert.ok(members.length > 0, `no methods found in ${type}`);
        for (const {name, isStatic} of members) {
            const written = (isStatic ? STATIC_PREFIX[type] : prefix) + name;
            if (!new RegExp('`' + escape(written) + '[(`]').test(reference)) {
                missing.push(`${type}.${name} (as \`${written}(\`)`);
            }
        }
    }
    assert.deepEqual([...new Set(missing)], []);
});

test('docs/api-reference.md names every export of index.d.ts', () => {
    const exported = [...declarations.matchAll(/^export (?:declare )?(?:const|class|function) (\w+)/gm)].map((m) => m[1]);
    assert.ok(exported.includes('background') && exported.includes('getUUID'), 'the exports were not found');
    const missing = exported.filter((name) => !new RegExp(`\\b${name}\\b`).test(reference));
    assert.deepEqual(missing, []);
});

test('every namespaced call in docs/api-reference.md is declared in index.d.ts', () => {
    // Calls only: `android.wifiOnly` is a config key, not the deprecated namespace.
    const declared = {};
    for (const [type, prefix] of Object.entries(PREFIX)) {
        if (/^\w+\.$/.test(prefix)) {
            declared[prefix] = new Set(membersOf(bodyOf(type), {properties: true}).map((m) => m.name));
        }
    }
    const unknown = [];
    for (const m of reference.matchAll(/`(\w+\.)(\w+)\(/g)) {
        const names = declared[m[1]];
        if (names && !names.has(m[2])) {
            unknown.push(m[1] + m[2]);
        }
    }
    assert.deepEqual([...new Set(unknown)], []);
});

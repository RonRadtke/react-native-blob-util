import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve as resolvePath, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HARNESS_DIR, '..', '..', '..');
const FAKE_REACT_NATIVE = pathToFileURL(join(HARNESS_DIR, 'react-native.js')).href;

const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const stripFlow = require.resolve('@babel/plugin-transform-flow-strip-types', {paths: [ROOT]});

// Directories under the root whose files are not the package's own ES modules:
// dependencies, the tests, and lib/ (a prebuilt CommonJS bundle).
const NOT_PACKAGE_CODE = ['node_modules', 'tests', 'lib'].map((dir) => dir + sep);

/** A file that ships in the package as an ES module the harness must transform. */
function isPackageFile(url) {
    if (!url.startsWith('file:')) return false;
    const path = fileURLToPath(url);
    if (!path.startsWith(ROOT + sep)) return false;
    const relative = path.slice(ROOT.length + 1);
    return !NOT_PACKAGE_CODE.some((dir) => relative.startsWith(dir));
}

export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'react-native') {
        return {url: FAKE_REACT_NATIVE, shortCircuit: true};
    }

    // The package imports its own files without extensions (`./fs`, `../types`),
    // which node's ESM resolver does not complete.
    if (context.parentURL && isPackageFile(context.parentURL) && /^\.\.?\//.test(specifier)) {
        const base = fileURLToPath(new URL(specifier, context.parentURL));
        for (const candidate of [base, `${base}.js`, join(base, 'index.js')]) {
            if (existsSync(candidate) && /\.js$/.test(candidate)) {
                return {url: pathToFileURL(candidate).href, shortCircuit: true};
            }
        }
    }

    return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
    if (!isPackageFile(url) || !url.endsWith('.js')) {
        return nextLoad(url, context);
    }

    const filename = fileURLToPath(url);
    const {code} = babel.transformSync(readFileSync(filename, 'utf8'), {
        filename,
        babelrc: false,
        configFile: false,
        sourceType: 'module',
        plugins: [[stripFlow, {all: true}]],
    });

    return {format: 'module', source: code, shortCircuit: true};
}

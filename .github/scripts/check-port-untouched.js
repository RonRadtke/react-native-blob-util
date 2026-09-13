/**
 * Fails when a change touches what the Kotlin/Swift port has to leave alone: the
 * Windows module, the codegen spec, the Expo plugin and the JavaScript the package
 * ships. package.json may only change its scripts. ci.yml runs this on pull requests
 * labelled `port`.
 *
 *   node .github/scripts/check-port-untouched.js <base-ref>
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const {isDeepStrictEqual} = require('util');

const PROTECTED_DIRS = ['windows/', 'codegenSpecs/', 'class/', 'utils/', 'polyfill/', 'lib/', 'plugin/'];
// Top-level files that ship in the package: index.js, fs.js, index.d.ts, index.js.flow, ...
const PROTECTED_TOP_LEVEL = /^[^/]+\.(?:js|d\.ts|flow)$/;
// Top-level JavaScript that is tooling, not package code.
const TOP_LEVEL_TOOLING = new Set(['babel.config.js']);

function protectedPaths(files) {
    return files.filter((file) =>
        PROTECTED_DIRS.some((dir) => file.startsWith(dir)) ||
        (PROTECTED_TOP_LEVEL.test(file) && !TOP_LEVEL_TOOLING.has(file)));
}

function packageJsonOutsideScripts(before, after) {
    const withoutScripts = ({scripts, ...rest}) => rest;
    return !isDeepStrictEqual(withoutScripts(before), withoutScripts(after));
}

function main(base) {
    const git = (...args) => execFileSync('git', args, {encoding: 'utf8'});
    const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
    const problems = protectedPaths(changed).map((file) => `${file} changed`);

    if (changed.includes('package.json')) {
        const before = JSON.parse(git('show', `${base}:package.json`));
        const after = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        if (packageJsonOutsideScripts(before, after)) {
            problems.push('package.json changed outside "scripts"');
        }
    }

    if (problems.length > 0) {
        console.error(`The port must not change these (compared with ${base}):`);
        for (const problem of problems) {
            console.error(`  ${problem}`);
        }
        process.exit(1);
    }
    console.log(`${changed.length} changed files, none under Windows, codegen or the JS package.`);
}

if (require.main === module) {
    const base = process.argv[2];
    if (!base) {
        console.error('usage: node .github/scripts/check-port-untouched.js <base-ref>');
        process.exit(2);
    }
    main(base);
}

module.exports = {protectedPaths, packageJsonOutsideScripts};

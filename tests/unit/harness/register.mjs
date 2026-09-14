/**
 * Loads the package's own JavaScript under node's test runner.
 *
 * The files that ship in the package are Flow-annotated ES modules that import
 * `react-native`. Node cannot run them as they are, so `npm test` registers
 * these hooks: package files are stripped of their Flow syntax with Babel, and
 * `react-native` resolves to the fake in ./react-native.js, which a test drives
 * (which platform it is, what the native module answers, what events arrive).
 *
 * Only files under the repository root are transformed; node_modules and the
 * tests themselves load as they are.
 */
import {register} from 'node:module';

register('./hooks.mjs', import.meta.url);

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {headerValues} from '../../utils/headerValues.js';

// Native reads every header value as a string. An object crashed the app on
// Android ("cannot be cast from ReadableNativeMap to String", #472).
describe('headerValues', () => {
    it('refuses an object, an array or a function, naming the header', () => {
        for (const value of [{a: 1}, ['a', 'b'], () => 'a']) {
            const {headers, error} = headerValues({'X-Test': value});
            assert.equal(headers, null);
            assert.match(error, /"X-Test" must be a string/);
        }
    });

    it('sends a number or a boolean as its text, as Windows already did', () => {
        assert.deepEqual(headerValues({'X-Count': 42, 'X-Flag': true}), {
            headers: {'X-Count': '42', 'X-Flag': 'true'},
            error: null,
        });
    });

    it('leaves strings alone and sends null and undefined as ""', () => {
        assert.deepEqual(headerValues({'X-A': 'a', 'X-Empty': '', 'X-Null': null, 'X-Undefined': undefined}), {
            headers: {'X-A': 'a', 'X-Empty': '', 'X-Null': '', 'X-Undefined': ''},
            error: null,
        });
    });

    it('passes no headers through', () => {
        assert.deepEqual(headerValues(undefined), {headers: undefined, error: null});
        assert.deepEqual(headerValues(null), {headers: null, error: null});
    });
});

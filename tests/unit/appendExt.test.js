import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import invalidAppendExt from '../../utils/appendExt.js';

// appendExt is appended to a file name the library generates in its cache; a
// separator in it took the download out of the cache onto any file the app can
// write. fetch() rejects EINVAL before the request reaches native.
describe('invalidAppendExt', () => {
    it('refuses separators, drive colons and control characters', () => {
        for (const appendExt of ['/../../shared_prefs/auth.xml', 'x\\..\\..\\y', 'C:evil', 'png\n', 'a\u0000', 42]) {
            assert.equal(typeof invalidAppendExt({fileCache: true, appendExt}), 'string', String(appendExt));
        }
    });

    it('accepts extensions, with or without dots, and no extension at all', () => {
        for (const appendExt of ['png', 'tar.gz', '.jpg', '..', '', null, undefined]) {
            assert.equal(invalidAppendExt({fileCache: true, appendExt}), null, String(appendExt));
        }
        assert.equal(invalidAppendExt(undefined), null);
    });
});

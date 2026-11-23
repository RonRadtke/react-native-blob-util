/**
 * The path a `file://` URL names. An escape names a character of a file's
 * name, never the shape of the path: a name an app joined into a URL,
 * "..%2Fsecret.txt", stays the one name it is instead of becoming the file one
 * folder up. Every fs call takes its path through here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {pathOf, decodedUrlPath} from '../../utils/path.js';

test('a file URL is the path it names, decoded', () => {
    assert.equal(pathOf('file:///docs/my%20scan%20%232.pdf'), '/docs/my scan #2.pdf');
    assert.equal(pathOf('file://localhost/docs/h.pdf'), '/docs/h.pdf');
    // Not a file URL, so not this function's business - a % included.
    assert.equal(pathOf('/docs/100%.txt'), '/docs/100%.txt');
    assert.equal(pathOf('content://media/external/images/1'), 'content://media/external/images/1');
    // A malformed escape leaves the path as it is (#295).
    assert.equal(pathOf('file:///docs/100%.txt'), '/docs/100%.txt');
});

// An app that joins a name it was handed into a file URL produces
// "..%2Fsecret.txt": a legal file name, there is no slash in it. Decoding the
// URL as a whole made it the file one folder up, so whoever chose the name of a
// file chose which of the app's files was read or uploaded.
test('an escape cannot become a separator, a dot segment or a NUL', () => {
    for (const path of [
        '/docs/inbox/..%2Fsecret.txt',
        '/docs/inbox/..%2f..%2fLibrary%2fCookies%2fCookies.binarycookies',
        '/docs/%2E%2E/secret.txt',
        '/docs/%2e%2e/secret.txt',
        '/docs/%2E/secret.txt',
        '/docs/%2Fetc%2Fpasswd',
        '/docs/a%00b.txt',
    ]) {
        assert.equal(pathOf(`file://${path}`), path, path);
        assert.equal(decodedUrlPath(path), path, path);
    }
});

// A ".." the caller wrote itself is left alone, as it always was: only an
// escape is refused, because only an escape hides what it says.
test('a path that says ".." itself is left as it is', () => {
    assert.equal(pathOf('file:///docs/../secret.txt'), '/docs/../secret.txt');
});

// A backslash is a separator on Windows, and the URL of a Windows path carries
// them as %5C, because 'file://' + encodeURI(path) encodes every one: refusing
// the escape failed every such URL, which is what the fs-file-urls parity case
// caught, and 1.1 decoded them as well. So it is decoded, and a "." or ".."
// between backslashes is refused along with the separators. Measured on
// Windows: an escape cannot make a network root out of a name, because a name
// after a folder stays below the folder, and the UNC form needs the whole path
// from its first character - which file:////host/share/x.txt already gives
// with no escape in it at all.
test('a backslash is decoded, and a dot segment between them is not', () => {
    assert.equal(pathOf('file:///docs/a%5Cb.txt'), '/docs/a\\b.txt');
    assert.equal(pathOf('file://C:%5CUsers%5Cme%5CLocalState/my%20scan.pdf'),
        'C:\\Users\\me\\LocalState/my scan.pdf');
    // Below the folder it starts with, so no root: Win32 reads this as
    // C:\base\host\share\x.txt, collapsing the repeated separators.
    assert.equal(pathOf('file://C:%5Cbase/%5C%5Chost%5Cshare%5Cx.txt'),
        'C:\\base/\\\\host\\share\\x.txt');

    for (const path of [
        'C:%5CUsers%5Cme%5C..%5Cother/a.txt',
        '/docs/inbox/..%5Csecret.txt',
        '/docs/..%5C..%5CLibrary',
    ]) {
        assert.equal(pathOf(`file://${path}`), path, path);
    }
});

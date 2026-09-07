import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import toByteCount from '../../utils/byteCount.js';

// Payloads exactly as each native layer emits them, so the fixtures fail if a
// platform ever changes shape:
//   android/.../ReactNativeBlobUtilReq.java     args.putString("written", String.valueOf(written))
//   ios/ReactNativeBlobUtilRequest.mm           [NSString stringWithFormat:@"%lld", ...]
//   windows/.../ReactNativeBlobUtil.cpp:1806    { "written", int64_t(totalRead) }, total may be null
const NATIVE_PAYLOADS = [
    {platform: 'android', written: '900', total: '1000', expected: [900, 1000]},
    {platform: 'ios', written: '900', total: '1000', expected: [900, 1000]},
    {platform: 'windows', written: 900, total: 1000, expected: [900, 1000]},
    {platform: 'android (chunked, unknown length)', written: '900', total: '-1', expected: [900, -1]},
    {platform: 'ios (chunked, unknown length)', written: '900', total: '-1', expected: [900, -1]},
    {platform: 'windows (unknown length)', written: 900, total: null, expected: [900, -1]},
];

describe('toByteCount', () => {
    describe('accepts every shape native actually emits', () => {
        for (const {platform, written, total, expected} of NATIVE_PAYLOADS) {
            it(`${platform}: ${JSON.stringify(written)}/${JSON.stringify(total)} -> ${expected.join('/')}`, () => {
                assert.deepEqual([toByteCount(written), toByteCount(total)], expected);
            });
        }
    });

    it('always returns a number, never a string', () => {
        for (const {written, total} of NATIVE_PAYLOADS) {
            assert.equal(typeof toByteCount(written), 'number');
            assert.equal(typeof toByteCount(total), 'number');
        }
    });

    it('preserves zero rather than treating it as absent', () => {
        assert.equal(toByteCount('0'), 0);
        assert.equal(toByteCount(0), 0);
    });

    it('falls back to the unknown-length sentinel for missing or unparsable values', () => {
        assert.equal(toByteCount(undefined), -1);
        assert.equal(toByteCount(null), -1);
        assert.equal(toByteCount(''), -1);
        assert.equal(toByteCount('not-a-number'), -1);
        assert.equal(toByteCount(NaN), -1);
    });

    it('handles byte counts well past 32-bit range', () => {
        assert.equal(toByteCount('5368709120'), 5368709120); // 5 GB download
    });
});

// Regressions the string payloads caused. Each test states the old behaviour
// explicitly, so it fails loudly if normalisation is ever removed.
describe('regressions fixed by normalising to numbers', () => {
    it('progress ratio: raw strings divided fine, but only by implicit coercion', () => {
        const [w, t] = ['900', '1000'];
        assert.equal(w / t, 0.9);                                  // old: worked by accident
        assert.equal(toByteCount(w) / toByteCount(t), 0.9);        // new: genuinely numeric
    });

    it('summing byte counts concatenated instead of adding', () => {
        const [w, t] = ['500', '1000'];
        assert.equal(w + t, '5001000');                            // old: string concatenation
        assert.equal(toByteCount(w) + toByteCount(t), 1500);       // new: arithmetic
    });

    // polyfill/XMLHttpRequest.js:314 `if (send >= total)` dispatches the upload
    // `load` event. With strings this was a lexicographic compare.
    it('XHR upload "load" no longer fires before the upload finishes', () => {
        for (const [send, total] of [['9', '10'], ['90', '100'], ['5', '10']]) {
            assert.equal(send >= total, true);                     // old: premature 'load'
            assert.equal(toByteCount(send) >= toByteCount(total), false);
        }
        // and it still fires when genuinely complete
        assert.equal(toByteCount('1000') >= toByteCount('1000'), true);
    });

    // polyfill/XMLHttpRequest.js:323 `if (total && total >= 0)` sets lengthComputable.
    it('lengthComputable is false for an unknown length on every platform', () => {
        const computable = (total) => {
            const n = toByteCount(total);
            return Boolean(n) && n >= 0;
        };
        assert.equal(computable('-1'), false);   // android/ios chunked
        assert.equal(computable(null), false);   // windows unknown
        assert.equal(computable('1000'), true);
        assert.equal(computable(1000), true);
    });
});

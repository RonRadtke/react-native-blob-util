/* eslint-disable no-bitwise, no-extra-parens */
/**
 * Byte-array conversions for response bodies. Pure functions, no globals:
 * TextEncoder is not in the lint environment and `unescape` is legacy.
 * The parentheses in the bit arithmetic are deliberate.
 */

/**
 * The byte values of a binary string, such as base64.decode returns: one
 * character per byte, char codes 0..255.
 * @param  {string} binary
 * @return {Array<number>}
 */
export function bytesOfBinaryString(binary: string): Array<number> {
    const bytes = new Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return bytes;
}

/**
 * The UTF-8 encoding of a string, as byte values 0..255. Lone surrogates are
 * encoded as U+FFFD, the way TextEncoder does.
 * @param  {string} text
 * @return {Array<number>}
 */
export function bytesOfUtf8(text: string): Array<number> {
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
        let code = text.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
            const low = text.charCodeAt(i + 1);
            if (low >= 0xdc00 && low <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                i++;
            }
        }
        if (code >= 0xd800 && code <= 0xdfff) {
            code = 0xfffd;
        }
        if (code < 0x80) {
            bytes.push(code);
        }
        else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        }
        else if (code < 0x10000) {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
        else {
            bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
    }
    return bytes;
}

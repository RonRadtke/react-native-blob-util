/**
 * Native reports progress byte counts inconsistently across platforms:
 *
 *   Android  `String.valueOf(long)`      -> "900",  "-1" when length is unknown
 *   iOS      `stringWithFormat:@"%lld"`  -> "900",  "-1" when length is unknown
 *   Windows  `int64_t` / `JSValue`       ->  900,   null when length is unknown
 *
 * The public progress/uploadProgress callbacks are documented as receiving
 * numbers, so normalise here rather than pushing the inconsistency onto every
 * consumer. `-1` is the "unknown length" sentinel Android and iOS already use
 * for chunked responses; Windows' null folds into it.
 */
function toByteCount(value) {
    if (value === null || value === undefined || value === '') return -1;
    const count = Number(value);
    return Number.isNaN(count) ? -1 : count;
}

export {toByteCount};
export default toByteCount;

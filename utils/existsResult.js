/**
 * The native `exists` call reports two things - whether the path exists and
 * whether it is a directory - but not in the same shape on every platform:
 *
 *   Android  `callback.invoke(exists, isDirectory)`     -> two arguments
 *   iOS      `callback(@[@(exists), @(isDir)])`         -> two arguments
 *   Windows  `callback(std::vector<bool>{...})`         -> one array argument
 *
 * Reading the first argument as a boolean therefore gives `[false, false]` on
 * Windows, which is truthy, so `fs.exists()` answered yes for every path
 * including ones that were not there. Reading the second gives `undefined`, so
 * `fs.isDir()` answered no for every path including directories.
 *
 * Normalise here rather than pushing the difference onto callers.
 */
function toExistsResult(first, second) {
    if (Array.isArray(first)) {
        return {exists: Boolean(first[0]), isDirectory: Boolean(first[1])};
    }

    return {exists: Boolean(first), isDirectory: Boolean(second)};
}

export {toExistsResult};
export default toExistsResult;

const {hashFor} = require('../lib/hash');
const {tap, setInput, waitForLogContains, clearLog} = require('../lib/ui');

const runExistsAndDirChecks = async (context) => {
    await setInput(context, 'exists-path-input', 'e2e/exists.txt');
    await tap(context, 'exists-button');
    await waitForLogContains(context, 'Exists: true');

    await setInput(context, 'exists-path-input', 'e2e/dir');
    await tap(context, 'isdir-button');
    await waitForLogContains(context, 'isDir: true');

    await clearLog(context);
};

const runDirectoryMetadataChecks = async (context) => {
    await tap(context, 'df-button');
    await waitForLogContains(context, 'Disk: Free space:');
    await clearLog(context);

    await setInput(context, 'ls-path-input', 'e2e');
    await tap(context, 'ls-button');
    await waitForLogContains(context, 'ls: ok');
    await clearLog(context);
};

const runFileOpsChecks = async (context) => {
    await setInput(context, 'cp-source-input', 'e2e/source.txt');
    await setInput(context, 'cp-dest-input', 'e2e/copied.txt');
    await tap(context, 'cp-button');
    await waitForLogContains(context, 'Copy: File successfully copied');

    await setInput(context, 'cp-dest-input', 'e2e/moved.txt');
    await tap(context, 'mv-button');
    await waitForLogContains(context, 'Move: File successfully moved');
    await clearLog(context);

    await setInput(context, 'unlink-path-input', 'e2e/unlink.txt');
    await tap(context, 'unlink-button');
    await waitForLogContains(context, 'Unlink: file/directory successfully unlinked');
    await clearLog(context);
};

const runStatChecks = async (context) => {
    await setInput(context, 'stat-path-input', 'e2e/stat.txt');
    await tap(context, 'stat-button');
    await waitForLogContains(context, 'stat: filename:');
    await tap(context, 'lstat-button');
    await waitForLogContains(context, 'lstat: filename:');
    await clearLog(context);
};

const runCreateAndReadChecks = async (context) => {
    await setInput(context, 'mkdir-path-input', 'e2e/newdir');
    await tap(context, 'mkdir-button');
    await waitForLogContains(context, 'mkdir:');

    await setInput(context, 'mkdir-path-input', 'e2e/create-utf8.txt');
    await tap(context, 'create-utf8-button');
    await waitForLogContains(context, 'createFile: utf8');

    await setInput(context, 'mkdir-path-input', 'e2e/create-ascii.txt');
    await tap(context, 'create-ascii-button');
    await waitForLogContains(context, 'createFile: ascii');

    await setInput(context, 'mkdir-path-input', 'e2e/create-base64.txt');
    await tap(context, 'create-base64-button');
    await waitForLogContains(context, 'createFile: base64');

    await setInput(context, 'mkdir-path-input', 'e2e/create-uri.txt');
    await setInput(context, 'mkdir-uri-input', 'e2e/uri-source.txt');
    await tap(context, 'create-uri-button');
    await waitForLogContains(context, 'createFile: uri');
    await clearLog(context);

    await setInput(context, 'read-path-input', 'e2e/read.txt');
    await tap(context, 'read-utf8-button');
    await waitForLogContains(context, 'readFile utf8: foo');
    await tap(context, 'read-ascii-button');
    await waitForLogContains(context, 'readFile ascii: 102,111,111');
    await tap(context, 'read-base64-button');
    await waitForLogContains(context, 'readFile base64: Zm9v');
    await clearLog(context);
};

const runHashChecks = async (context) => {
    await setInput(context, 'hash-path-input', 'e2e/hash.txt');
    const hashValue = 'hash-content';
    const algorithms = ['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512'];
    for (const algorithm of algorithms) {
        await tap(context, `hash-${algorithm}-button`);
        await tap(context, 'hash-button');
        await waitForLogContains(context, `hash ${algorithm}: ${hashFor(algorithm, hashValue)}`);
    }
    await clearLog(context);
};

const runWriteChecks = async (context) => {
    await setInput(context, 'write-path-input', 'e2e/write.txt');
    await setInput(context, 'write-uri-input', 'e2e/write-source.txt');
    const encodings = ['utf8', 'base64', 'ascii', 'uri'];
    for (const encoding of encodings) {
        await tap(context, `write-enc-${encoding}-button`);
        await tap(context, 'write-button');
        await waitForLogContains(context, `writeFile: ${encoding}`);
        await tap(context, 'append-button');
        await waitForLogContains(context, `appendFile: ${encoding}`);
        await clearLog(context);
    }
};

const runStreamChecks = async (context) => {
    await setInput(context, 'write-stream-path-input', 'e2e/stream-write.txt');
    const encodings = ['utf8', 'base64', 'ascii'];
    for (const encoding of encodings) {
        await tap(context, `write-stream-enc-${encoding}-button`);
        await tap(context, 'write-stream-button');
        await waitForLogContains(context, `writeStream: ${encoding}`);
        await tap(context, 'append-stream-button');
        await waitForLogContains(context, `appendStream: ${encoding}`);
        await clearLog(context);
    }

    await tap(context, 'write-stream-nested-cache-button');
    await waitForLogContains(context, 'writeStream nested cache path: exists=true');
    await clearLog(context);

    await setInput(context, 'read-stream-path-input', 'e2e/stream.txt');
    await tap(context, 'read-stream-enc-utf8-button');
    await tap(context, 'read-stream-button');
    await waitForLogContains(context, 'readStream: length:');
    await clearLog(context);
};

const runFilesystemScenario = async (context) => {
    await runExistsAndDirChecks(context);
    await runDirectoryMetadataChecks(context);
    await runFileOpsChecks(context);
    await runStatChecks(context);
    await runCreateAndReadChecks(context);
    await runHashChecks(context);
    await runWriteChecks(context);
    await runStreamChecks(context);
};

module.exports = {
    runFilesystemScenario,
};

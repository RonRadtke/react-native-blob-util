const {tap, waitForLogContains, clearLog} = require('../lib/ui');

const runNetworkScenario = async (context) => {
    const {platform} = context;

    await tap(context, 'fetch-button');
    await waitForLogContains(context, 'fetch:');

    if (platform === 'android') {
        await tap(context, 'fetch-nested-cache-path-button');
        await waitForLogContains(context, 'fetch nested cache path: exists=true');
    }

    if (platform === 'android') {
        await tap(context, 'media-store-button');
        await waitForLogContains(context, 'MediaStore:');
    }

    await tap(context, 'upload-file-button');
    await waitForLogContains(context, 'upload file:');

    await tap(context, 'upload-text-button');
    await waitForLogContains(context, 'upload text:');

    await tap(context, 'multipart-button');
    await waitForLogContains(context, 'multipart:');

    // Asserting 'progress:' alone passed even when no progress event had ever
    // fired - the completion handler emits that line by itself. The case now
    // ends with a marker summarising what the callbacks actually saw, and only
    // the marker is asserted: on iOS just the newest log entry reaches the page
    // source, so whatever is checked has to be last.
    //
    // download100 is the real signal. upload100 is reported but not asserted:
    // the 250ms interval throttles the final upload event away on Android and
    // Windows, which is what ReactNativeBlobUtilProgressConfig.shouldReport
    // does by design.
    await tap(context, 'progress-button');
    await waitForLogContains(context, 'progress events: download100=true');

    await clearLog(context);
};

module.exports = {
    runNetworkScenario,
};

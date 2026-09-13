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
    // An earlier version of this comment blamed the 250ms interval for the
    // missing upload completion on Android. That was wrong: Android emitted no
    // upload events at all, because one undecodable base64 field aborted the
    // whole multipart body and nothing was ever written. With that fixed and
    // the completion flush in shouldReport, both halves now reach 100%.
    //
    // Windows is held to download100 only: it has not been re-measured since
    // the flush landed. Tighten it to the full marker once it has been.
    await tap(context, 'progress-button');
    await waitForLogContains(
        context,
        platform === 'windows'
            ? 'progress events: download100=true'
            : 'progress events: download100=true upload100=true',
    );

    await clearLog(context);
};

module.exports = {
    runNetworkScenario,
};

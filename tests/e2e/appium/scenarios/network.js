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

    await tap(context, 'progress-button');
    await waitForLogContains(context, 'progress:');

    await clearLog(context);
};

module.exports = {
    runNetworkScenario,
};

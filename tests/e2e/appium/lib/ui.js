const {sleep, byId} = require('./utils');

const safeIsExisting = async (element) => element.isExisting().catch(() => false);
const safeIsDisplayed = async (element) => element.isDisplayed().catch(() => false);

const waitForAppReady = async (context, timeout = 30000) => {
    const {driver} = context;

    await driver.waitUntil(
        async () => {
            const source = await driver.getPageSource();
            return (
                source.includes('React Native Blob Util E2E App') ||
                source.includes('e2e-base-url-input') ||
                source.includes('E2E Controls')
            );
        },
        {
            timeout,
            timeoutMsg: 'React Native app did not become ready',
        },
    );
};

const panelForTestId = (testId) => {
    if (
        testId === 'e2e-base-url-input' ||
        testId === 'e2e-toggle-button' ||
        testId === 'e2e-reset-fixtures-button' ||
        testId === 'e2e-clear-log-button' ||
        testId === 'e2e-log'
    ) {
        return 'base';
    }

    if (testId.startsWith('e2e-')) return 'base';

    if (testId.startsWith('exists-') || testId.startsWith('isdir-') || testId.startsWith('df-')) return 'exists';
    if (testId.startsWith('ls-')) return 'ls';

    if (testId.startsWith('cp-') || testId.startsWith('mv-')) return 'copy';
    if (testId.startsWith('unlink-')) return 'unlink';
    if (testId.startsWith('stat-') || testId.startsWith('lstat-')) return 'stat';

    if (testId.startsWith('mkdir-') || testId.startsWith('create-')) return 'create';

    if (testId.startsWith('read-stream-')) return 'readStream';
    if (testId.startsWith('read-')) return 'read';

    if (testId.startsWith('hash-')) return 'hash';

    if (testId.startsWith('write-stream-') || testId.startsWith('append-stream-')) return 'writeStream';
    if (testId.startsWith('write-') || testId.startsWith('append-')) return 'write';

    if (
        testId.startsWith('fetch-') ||
        testId.startsWith('media-store-') ||
        testId.startsWith('upload-') ||
        testId.startsWith('multipart-') ||
        testId.startsWith('progress-')
    ) {
        return 'network';
    }

    return null;
};

const selectorToTestId = (selector) => {
    if (selector.startsWith('~')) return selector.slice(1);
    return selector;
};

const openPanelForTestId = async (context, testId) => {
    const panel = panelForTestId(testId);

    if (!panel) {
        return;
    }

    const tab = await context.driver.$(byId(`e2e-panel-${panel}`));

    if (await safeIsDisplayed(tab)) {
        await tab.click();
        await sleep(250);
    }
};

const waitForDisplayed = async (context, selector, timeout = 20000) => {
    const {driver} = context;

    if (context.platform === 'android' && !selector.startsWith('~')) {
        selector = `~${selector}`;
    }

    const testId = selectorToTestId(selector);

    await waitForAppReady(context);
    await openPanelForTestId(context, testId);

    const element = await driver.$(selector);
    await element.waitForDisplayed({timeout});

    return element;
};

const tap = async (context, testId) => {
    const element = await waitForDisplayed(context, byId(testId));
    await element.click();
    await sleep(250);
};

const setInput = async (context, testId, value) => {
    const element = await waitForDisplayed(context, byId(testId));
    await element.click();

    try {
        await element.clearValue();
    } catch (err) {
        // clearValue may not be supported.
    }

    await element.setValue(String(value ?? ''));

    await sleep(500);
};

const getLogText = async (context) => {
    return context.driver.getPageSource();
};

const waitForLogContains = async (context, expected, timeout = 20000) => {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const logText = await getLogText(context);

        if (logText.includes(expected)) {
            return;
        }

        await sleep(500);
    }

    throw new Error(`Expected log to include "${expected}"`);
};

const enableE2eMode = async (context) => {
    const {driver} = context;

    await waitForAppReady(context);

    const logView = await driver.$(byId('e2e-log'));

    if (!(await safeIsExisting(logView))) {
        await tap(context, 'e2e-toggle-button');
        await waitForDisplayed(context, byId('e2e-log'));
    }
};

const setBaseUrl = async (context, url) => {
    await setInput(context, 'e2e-base-url-input', url);
};

const resetFixtures = async (context) => {
    await tap(context, 'e2e-reset-fixtures-button');
    await waitForLogContains(context, 'E2E: Fixtures ready');
};

const clearLog = async (context) => {
    await tap(context, 'e2e-clear-log-button');
};

const scrollToTop = async () => {
    // No-op by design. E2E panels avoid Appium/system scrolling.
};

module.exports = {
    byId,
    waitForAppReady,
    scrollToTop,
    waitForDisplayed,
    tap,
    setInput,
    waitForLogContains,
    enableE2eMode,
    setBaseUrl,
    resetFixtures,
    clearLog,
};
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

const ensureAppStillActive = async (context) => {
    const source = await context.driver.getPageSource();

    if (!source.includes('React Native Blob Util E2E App') && !source.includes('e2e-base-url-input')) {
        throw new Error('App is not active after scroll. Current UI is not the React Native app.');
    }
};

const mobileScroll = async (context, direction) => {
    const {driver} = context;

    const container = await driver.$('~main-scroll-container');
    await container.waitForDisplayed({timeout: 10000});

    const rect = await driver.getElementRect(container.elementId);

    await driver.execute('mobile: scrollGesture', {
        left: rect.x + Math.floor(rect.width * 0.1),
        top: rect.y + Math.floor(rect.height * 0.15),
        width: Math.floor(rect.width * 0.8),
        height: Math.floor(rect.height * 0.55),
        direction,
        percent: 0.35,
    });

    await sleep(300);
    await ensureAppStillActive(context);
};

const scrollDownOnce = async (context) => {
    if (context.platform === 'windows') {
        await context.driver.keys(['PageDown']);
        await sleep(300);
        return;
    }

    await mobileScroll(context, 'down');
};

const scrollToTop = async (context) => {
    if (context.platform === 'windows') {
        for (let i = 0; i < 4; i += 1) {
            await context.driver.keys(['PageUp']);
            await sleep(300);
        }
        return;
    }

    for (let i = 0; i < 4; i += 1) {
        await mobileScroll(context, 'up');
    }
};

const waitForDisplayed = async (context, selector, timeout = 20000) => {
    const {driver} = context;

    const start = Date.now();

    while (Date.now() - start < timeout) {
        const candidate = await driver.$(selector);

        if (await safeIsDisplayed(candidate)) {
            return candidate;
        }

        await scrollDownOnce(context);
        await sleep(200);
    }

    throw new Error(`Element not visible: ${selector}`);
};

const tap = async (context, testId) => {
    try {
        await context.driver.hideKeyboard();
    } catch (err) {
        // Keyboard may already be hidden.
    }

    const element = await waitForDisplayed(context, byId(testId));
    await element.click();
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

    try {
        await context.driver.hideKeyboard();
    } catch (err) {
        // Keyboard may already be hidden.
    }

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
    await waitForAppReady(context);
    await setInput(context, 'e2e-base-url-input', url);
};

const resetFixtures = async (context) => {
    await waitForAppReady(context);
    await tap(context, 'e2e-reset-fixtures-button');
    await waitForLogContains(context, 'E2E: Fixtures ready');
};

const clearLog = async (context) => {
    await waitForAppReady(context);
    await tap(context, 'e2e-clear-log-button');
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
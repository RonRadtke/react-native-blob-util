const {sleep, byId} = require('./utils');

const safeIsExisting = async (element) => element.isExisting().catch(() => false);
const safeIsDisplayed = async (element) => element.isDisplayed().catch(() => false);

const scrollWithKey = async (context, key, attempts = 1) => {
    const {driver} = context;
    const scrollView = await driver.$(byId('main-scroll-view'));
    if (await safeIsExisting(scrollView)) {
        await scrollView.click();
    }
    for (let i = 0; i < attempts; i += 1) {
        await driver.keys([key]);
        await sleep(200);
    }
};

const mobileScroll = async (driver, direction) => {
    try {
        await driver.execute('mobile: scroll', {direction});
        return;
    } catch (err) {
        // Some driver versions do not expose mobile:scroll.
    }
    try {
        await driver.execute('mobile: swipe', {direction});
    } catch (err) {
        // Let caller retry on next loop.
    }
};

const scrollToTop = async (context) => {
    const {driver, platform} = context;
    if (platform === 'android') {
        try {
            await driver.$('android=new UiScrollable(new UiSelector().scrollable(true)).scrollToBeginning(6)');
            return;
        } catch (err) {
            // Fall through to generic scroll.
        }
    }
    if (platform === 'windows') {
        await scrollWithKey(context, 'PageUp', 6);
        return;
    }
    for (let i = 0; i < 6; i += 1) {
        await mobileScroll(driver, 'up');
    }
};

const scrollDownOnce = async (context) => {
    const {driver, platform} = context;
    if (platform === 'windows') {
        await scrollWithKey(context, 'PageDown', 1);
        return;
    }
    await mobileScroll(driver, 'down');
};

const waitForDisplayed = async (context, selector, timeout = 20000) => {
    const {driver, platform} = context;
    const element = await driver.$(selector);
    if (await safeIsDisplayed(element)) {
        return element;
    }

    if (platform === 'android' && selector.startsWith('~')) {
        const id = selector.slice(1).replace(/"/g, '\\"');
        const scrollSelector =
            `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().description("${id}"))`;
        const scrolled = await driver.$(scrollSelector);
        await scrolled.waitForDisplayed({timeout});
        return scrolled;
    }

    const start = Date.now();
    while (Date.now() - start < timeout) {
        await scrollDownOnce(context);
        const candidate = await driver.$(selector);
        if (await safeIsDisplayed(candidate)) {
            return candidate;
        }
        await sleep(200);
    }

    await element.waitForDisplayed({timeout});
    return element;
};

const tap = async (context, testId) => {
    const element = await waitForDisplayed(context, byId(testId));
    await element.click();
};

const setInput = async (context, testId, value) => {
    const element = await waitForDisplayed(context, byId(testId));
    await element.click();
    try {
        await element.clearValue();
    } catch (err) {
        // clearValue is not supported on every platform/control type.
    }
    await element.setValue(String(value ?? ''));
};

const getLogText = async (context) => {
    const element = await waitForDisplayed(context, byId('e2e-log-output'));
    return element.getText();
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
    await scrollToTop(context);
    const logView = await driver.$(byId('e2e-log'));
    if (!(await safeIsExisting(logView))) {
        await tap(context, 'e2e-toggle-button');
        await waitForDisplayed(context, byId('e2e-log'));
    }
};

const setBaseUrl = async (context, url) => {
    await scrollToTop(context);
    await setInput(context, 'e2e-base-url-input', url);
};

const resetFixtures = async (context) => {
    await scrollToTop(context);
    await tap(context, 'e2e-reset-fixtures-button');
    await waitForLogContains(context, 'E2E: Fixtures ready');
};

const clearLog = async (context) => {
    await scrollToTop(context);
    await tap(context, 'e2e-clear-log-button');
};

module.exports = {
    byId,
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

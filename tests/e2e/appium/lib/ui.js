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
    const {width, height} = await driver.getWindowRect();
    const x = Math.floor(width / 2);
    const startY = direction === 'down' ? Math.floor(height * 0.8) : Math.floor(height * 0.25);
    const endY = direction === 'down' ? Math.floor(height * 0.25) : Math.floor(height * 0.8);

    await driver.performActions([
        {
            type: 'pointer',
            id: 'finger1',
            parameters: {pointerType: 'touch'},
            actions: [
                {type: 'pointerMove', duration: 0, x, y: startY},
                {type: 'pointerDown', button: 0},
                {type: 'pause', duration: 100},
                {type: 'pointerMove', duration: 500, x, y: endY},
                {type: 'pointerUp', button: 0},
            ],
        },
    ]);
    await driver.releaseActions();
};

const scrollToAndroidAccessibilityId = async (driver, id) => {
    for (let i = 0; i < 10; i += 1) {
        const element = await driver.$(byId(id));
        if (await safeIsDisplayed(element)) {
            return element;
        }
        await mobileScroll(driver, 'down');
        await sleep(200);
    }
    return driver.$(byId(id));
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
        const candidate = await scrollToAndroidAccessibilityId(driver, selector.slice(1));
        if (await safeIsDisplayed(candidate)) {
            return candidate;
        }
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
    try {
        await context.driver.hideKeyboard();
    } catch (err) {
        // Keyboard may already be hidden, or the platform may not support this command.
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
        // clearValue is not supported on every platform/control type.
    }
    await element.setValue(String(value ?? ''));
    try {
        await context.driver.hideKeyboard();
    } catch (err) {
        // Keyboard may already be hidden, or the platform may not support this command.
    }
};

const getLogText = async (context) => {
    await scrollToTop(context);
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

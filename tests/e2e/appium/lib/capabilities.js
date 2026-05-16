const defaultDeviceName = (platform) => {
    if (platform === 'android') {
        return 'Android Emulator';
    }
    if (platform === 'ios') {
        return 'iPhone Simulator';
    }
    return 'WindowsPC';
};

const buildMobileCaps = (platform) => {
    const isAndroid = platform === 'android';
    const caps = {
        platformName: isAndroid ? 'Android' : 'iOS',
        'appium:automationName': isAndroid ? 'UiAutomator2' : 'XCUITest',
        'appium:deviceName': process.env.DEVICE_NAME || defaultDeviceName(platform),
        'appium:newCommandTimeout': 120,
    };

    if (process.env.E2E_APP_PATH) {
        caps['appium:app'] = process.env.E2E_APP_PATH;
    }

    if (isAndroid) {
        caps['appium:autoGrantPermissions'] = true;
        if (process.env.ANDROID_APP_PACKAGE) {
            caps['appium:appPackage'] = process.env.ANDROID_APP_PACKAGE;
        }
        if (process.env.ANDROID_APP_ACTIVITY) {
            caps['appium:appActivity'] = process.env.ANDROID_APP_ACTIVITY;
        }
        if (!caps['appium:app'] && !caps['appium:appPackage']) {
            throw new Error('Provide E2E_APP_PATH or ANDROID_APP_PACKAGE for Android runs.');
        }
        return caps;
    }

    if (process.env.IOS_BUNDLE_ID) {
        caps['appium:bundleId'] = process.env.IOS_BUNDLE_ID;
    }
    if (!caps['appium:app'] && !caps['appium:bundleId']) {
        throw new Error('Provide E2E_APP_PATH or IOS_BUNDLE_ID for iOS runs.');
    }

    return caps;
};

const buildWindowsCaps = () => {
    const windowsApp = process.env.WINDOWS_APP_ID || process.env.WINDOWS_APP_PATH || process.env.E2E_APP_PATH;
    if (!windowsApp) {
        throw new Error('WINDOWS_APP_ID or WINDOWS_APP_PATH (or E2E_APP_PATH) is required for Windows runs.');
    }
    return {
        platformName: 'Windows',
        'appium:automationName': 'Windows',
        'appium:deviceName': process.env.DEVICE_NAME || defaultDeviceName('windows'),
        'appium:newCommandTimeout': 120,
        'appium:app': windowsApp,
    };
};

const buildCapabilities = (platform) => {
    if (platform === 'windows') {
        return buildWindowsCaps();
    }
    if (platform === 'android' || platform === 'ios') {
        return buildMobileCaps(platform);
    }
    throw new Error(`Unsupported platform: ${platform}`);
};

module.exports = {
    buildCapabilities,
};

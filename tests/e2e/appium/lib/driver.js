const {remote} = require('webdriverio');

const appiumHost = process.env.APPIUM_HOST || '127.0.0.1';
const appiumPort = Number(process.env.APPIUM_PORT || 4723);
const appiumPath = process.env.APPIUM_PATH || '/wd/hub';

const createDriverSession = async (capabilities) =>
    remote({
        hostname: appiumHost,
        port: appiumPort,
        path: appiumPath,
        capabilities,
        // Starting an app can take a while before it answers - a debug React
        // Native build fetches its bundle from Metro first, and on Windows that
        // regularly outruns the default budget, aborting the session while the
        // driver is still waiting patiently on its own timeout.
        connectionRetryTimeout: Number(process.env.E2E_SESSION_TIMEOUT || 180000),
        connectionRetryCount: 2,
    });

module.exports = {
    createDriverSession,
};

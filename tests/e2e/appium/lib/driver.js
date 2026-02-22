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
    });

module.exports = {
    createDriverSession,
};

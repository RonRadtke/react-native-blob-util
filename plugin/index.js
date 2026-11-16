const withBackgroundSessions = require("./src/withBackgroundSessions");
const withCustomCACerts = require("./src/withCustomCACerts");

function withReactNativeBlobUtil(config, props = {}) {
    config = withCustomCACerts(config, props);
    if (props.iosBackgroundSessions !== false) {
        config = withBackgroundSessions(config);
    }
    return config;
}

module.exports = withReactNativeBlobUtil;

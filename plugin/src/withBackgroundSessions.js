const { withAppDelegate } = require("expo/config-plugins");
const { addToObjcAppDelegate, addToSwiftAppDelegate } = require("./appDelegate");

// Adds application(_:handleEventsForBackgroundURLSession:completionHandler:) to
// the iOS AppDelegate, so iOS can hand the library the events of a background
// download (config({background})) that ended while the app was not running.
// Without it such a download still finishes and is found on the next start;
// with it, it is finished at once.
function withBackgroundSessions(config) {
    return withAppDelegate(config, (config) => {
        const { language, contents } = config.modResults;
        if (language === "swift") {
            config.modResults.contents = addToSwiftAppDelegate(contents);
        } else if (language === "objc" || language === "objcpp") {
            config.modResults.contents = addToObjcAppDelegate(contents);
        }
        return config;
    });
}

module.exports = withBackgroundSessions;

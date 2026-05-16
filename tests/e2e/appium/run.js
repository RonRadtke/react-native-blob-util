const {runSuiteForPlatform, VALID_PLATFORMS} = require('./suite');

const platform = (process.env.E2E_PLATFORM || process.argv[2] || '').trim().toLowerCase();

if (!VALID_PLATFORMS.includes(platform)) {
    console.error(`E2E_PLATFORM must be one of: ${VALID_PLATFORMS.join(', ')}.`);
    process.exit(1);
}

runSuiteForPlatform(platform).catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
});

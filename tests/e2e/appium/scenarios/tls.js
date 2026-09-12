const {tap, waitForLogContains, clearLog} = require('../lib/ui');

/**
 * Custom CA trust evaluation, against the HTTPS server in tests/e2e/server.js.
 *
 * The server presents a certificate signed by the throwaway CA that
 * tests/e2e/certs/generate.js produces, and the same CA is bundled into the
 * app under test. Nothing here trusts the system store, so a case that passes
 * really did evaluate against the custom anchor.
 *
 * The app reports each result as `<id>: PASS` or `<id>: FAIL`, and the cases
 * that are meant to be refused report `PASS` when the request is rejected -
 * so a silent fall back to system trust shows up as FAIL rather than as a
 * test that quietly does nothing.
 *
 * On Windows customCACerts resolves from the app package. An unpackaged build
 * has no InstalledLocation to resolve against, so the loader finds nothing and
 * the custom-CA cases fail closed - correct behaviour, but check how the app
 * was packaged before assuming the trust code is at fault.
 */
const runTlsScenario = async (context) => {
    // The CA is a valid anchor for this host, so the request completes.
    await tap(context, 'tls-custom-ca-button');
    await waitForLogContains(context, 'tls-custom-ca: PASS');

    // No customCACerts: the server's private CA is not in the system store, so
    // the request must fail. If this passes, certificate validation is not
    // happening at all and every other case here is meaningless.
    await tap(context, 'tls-no-ca-button');
    await waitForLogContains(context, 'tls-no-ca: PASS');

    // pinnedHosts names a different host, so the custom CA does not apply and
    // the connection falls through to the system store, which does not trust
    // this server. Pins the scoping rule that Android and iOS disagreed on.
    await tap(context, 'tls-wrong-pin-button');
    await waitForLogContains(context, 'tls-wrong-pin: PASS');

    // A customCACerts name that resolves to nothing must fail the request.
    // iOS used to fall back to default handling here, quietly swapping the
    // caller's pinning for the system trust store.
    await tap(context, 'tls-bogus-cert-button');
    await waitForLogContains(context, 'tls-bogus-cert: PASS');

    // Custom CA alongside the system store still trusts the custom anchor.
    await tap(context, 'tls-system-certs-button');
    await waitForLogContains(context, 'tls-system-certs: PASS');

    // `trusty: true` accepts anything. On Android it needs
    // ReactNativeBlobUtilUtils.sharedTrustManager to be set by the app, which
    // MainApplication.kt does - the library deliberately does not ship one.
    await tap(context, 'tls-trusty-button');
    await waitForLogContains(context, 'tls-trusty: PASS');

    // A strict request straight after a trusty one must still be evaluated.
    // Windows remembers a certificate the process accepted with errors ignored
    // and, left to itself, lets this one through unexamined - tls-no-ca after
    // tls-custom-ca above covers the same for the custom-CA path. The log is
    // cleared first so the earlier tls-no-ca PASS cannot satisfy the wait.
    await clearLog(context);
    await tap(context, 'tls-no-ca-button');
    await waitForLogContains(context, 'tls-no-ca: PASS');

    await clearLog(context);
};

module.exports = {
    runTlsScenario,
};

/**
 * Generates the throwaway TLS material the e2e HTTPS server and the
 * customCACerts tests need: a CA, a server certificate signed by it, and a
 * copy of the CA bundled into the e2e app for each platform.
 *
 * These used to be committed. Private keys do not belong in a public
 * repository even when they are only ever used against localhost - secret
 * scanners flag them, and anyone reading the repo has to work out whether they
 * matter. Generating them also fixes the quieter problem: the committed pair
 * expired after 365 days, which would have broken the suite long after anyone
 * remembered why.
 *
 * Run directly, or via `npm run e2e:certs`. Existing certificates are reused
 * while they are still valid, so this is cheap to call before every run.
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const certsDir = __dirname;
const appDir = path.join(certsDir, '..', 'android-app');

const CA_KEY = path.join(certsDir, 'ca.key');
const CA_PEM = path.join(certsDir, 'ca.pem');
const SERVER_KEY = path.join(certsDir, 'server.key');
const SERVER_CRT = path.join(certsDir, 'server.crt');
const SERVER_CSR = path.join(certsDir, 'server.csr');

const ANDROID_CA = path.join(appDir, 'android', 'app', 'src', 'main', 'res', 'raw', 'test_ca');
const IOS_CA = path.join(appDir, 'ios', 'ReactNativeBlobUtilE2E', 'test_ca.pem');
// The Windows e2e target is the example app; the module resolves customCACerts
// from the package root, so the CA ships beside the executable.
const WINDOWS_CA = path.join(certsDir, '..', '..', '..', 'examples', 'ReactNativeBlobUtil',
    'windows', 'ReactNativeBlobUtilWin', 'test_ca.pem');

const DAYS = 365;

function openssl(args) {
    return execFileSync('openssl', args, {cwd: certsDir, stdio: ['ignore', 'pipe', 'pipe']});
}

/** True when every artifact exists and the server certificate has not expired. */
function stillValid() {
    const required = [CA_KEY, CA_PEM, SERVER_KEY, SERVER_CRT, ANDROID_CA, IOS_CA, WINDOWS_CA];
    if (!required.every(f => fs.existsSync(f))) return false;

    try {
        openssl(['x509', '-in', SERVER_CRT, '-noout', '-checkend', '86400']);
        return true;
    } catch {
        return false; // expired, or expiring within a day
    }
}

function generate() {
    // IP SANs matter: the Android emulator reaches the host as 10.0.2.2, and
    // hostname verification is enforced on both platforms, so a certificate
    // without them fails for reasons that look like a trust problem.
    const ext = path.join(os.tmpdir(), `rnbu-e2e-ext-${process.pid}.cnf`);
    fs.writeFileSync(ext, [
        'subjectAltName=IP:127.0.0.1,IP:10.0.2.2,DNS:localhost',
        'extendedKeyUsage=serverAuth',
        'keyUsage=digitalSignature,keyEncipherment',
        '',
    ].join('\n'));

    try {
        openssl(['genrsa', '-out', CA_KEY, '2048']);
        openssl(['req', '-x509', '-new', '-nodes', '-key', CA_KEY, '-sha256', '-days', String(DAYS),
            '-out', CA_PEM, '-subj', '/CN=Test CA']);

        openssl(['genrsa', '-out', SERVER_KEY, '2048']);
        openssl(['req', '-new', '-key', SERVER_KEY, '-out', SERVER_CSR, '-subj', '/CN=localhost']);
        openssl(['x509', '-req', '-in', SERVER_CSR, '-CA', CA_PEM, '-CAkey', CA_KEY, '-CAcreateserial',
            '-out', SERVER_CRT, '-days', String(DAYS), '-sha256', '-extfile', ext]);

        // Android reads res/raw as DER; iOS loads the PEM from the app bundle.
        fs.mkdirSync(path.dirname(ANDROID_CA), {recursive: true});
        fs.mkdirSync(path.dirname(IOS_CA), {recursive: true});
        openssl(['x509', '-in', CA_PEM, '-outform', 'DER', '-out', ANDROID_CA]);
        fs.copyFileSync(CA_PEM, IOS_CA);

        fs.mkdirSync(path.dirname(WINDOWS_CA), {recursive: true});
        fs.copyFileSync(CA_PEM, WINDOWS_CA);
    } finally {
        try { fs.unlinkSync(ext); } catch {}
    }
}

/**
 * Ensures usable certificates exist. Returns true when the HTTPS server can
 * start, false when openssl is unavailable - callers fall back to plain HTTP
 * rather than failing the whole run.
 */
function ensureCerts({quiet = false} = {}) {
    if (stillValid()) {
        if (!quiet) console.log('e2e certificates present and valid, nothing to do');
        return true;
    }

    try {
        openssl(['version']);
    } catch {
        console.error('openssl was not found on PATH, so the e2e HTTPS server and the');
        console.error('customCACerts tests cannot run. Plain HTTP tests are unaffected.');
        return false;
    }

    generate();
    if (!quiet) console.log(`generated e2e certificates in ${certsDir} (valid ${DAYS} days)`);
    return true;
}

module.exports = {ensureCerts};

if (require.main === module) {
    process.exit(ensureCerts() ? 0 : 1);
}

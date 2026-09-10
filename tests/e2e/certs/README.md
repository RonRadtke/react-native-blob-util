# Test Certificates

Throwaway TLS material for the e2e HTTPS server (`tests/e2e/server.js`, port
19077) and the `customCACerts` tests.

**Nothing in here is committed.** `generate.js` creates the CA, a server
certificate signed by it, and a copy of the CA for each platform's e2e app;
everything it produces is listed in `.gitignore`.

Private keys do not belong in a public repository even when they only ever
protect localhost — secret scanners flag them, and anyone reading the repo has
to work out whether they matter. Generating them also fixes the quieter
problem: a committed pair expires, and the suite breaks long after anyone
remembers why.

## Usage

Nothing to do by hand. `tests/e2e/server.js` calls the generator on startup, so
`npm run e2e:server` and the platform runners all get certificates
automatically. Existing ones are reused while they remain valid, and are
regenerated once they are within a day of expiry.

To create them explicitly:

```sh
npm run e2e:certs
```

Requires `openssl` on `PATH`. Without it the generator prints a warning and the
server falls back to plain HTTP — the non-TLS e2e tests still run, the
`customCACerts` ones cannot.

## What gets produced

| File | Purpose |
|---|---|
| `ca.key`, `ca.pem` | the test CA |
| `server.key`, `server.crt`, `server.csr` | server certificate signed by that CA |
| `../android-app/android/app/src/main/res/raw/test_ca` | CA in DER, where Android reads it |
| `../android-app/ios/ReactNativeBlobUtilE2E/test_ca.pem` | CA in PEM, bundled into the iOS app |

The server certificate carries `IP:127.0.0.1`, `IP:10.0.2.2` and
`DNS:localhost` as subject alternative names. The emulator reaches the host as
`10.0.2.2`, and hostname verification is enforced on both platforms, so a
certificate without those SANs fails in a way that looks like a trust problem
rather than a naming one.

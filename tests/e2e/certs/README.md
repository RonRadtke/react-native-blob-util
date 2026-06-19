# Test Certificates

These certificates are **for testing only** — they are self-signed, committed to a public repo, and must never be used in production.

They power the HTTPS test server (`tests/e2e/server.js` on port 19077) and validate the `customCACerts` feature on iOS and Android.

## Regeneration

Certs expire after 365 days. To regenerate:

```bash
cd tests/e2e/certs

# CA
openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -sha256 -days 365 -out ca.pem -subj "/CN=Test CA"

# Server cert signed by the CA
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "/CN=localhost"
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial \
  -out server.crt -days 365 -sha256 \
  -extfile <(printf "subjectAltName=IP:127.0.0.1,IP:10.0.2.2,DNS:localhost\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment")
```

After regenerating, update the bundled CA in the e2e app:

-   **iOS**: Replace `tests/e2e/android-app/ios/test_ca.cer` (copy of `ca.pem`)
-   **Android**: Convert to DER and place at `tests/e2e/android-app/android/app/src/main/res/raw/test_ca`

```bash
openssl x509 -in ca.pem -outform DER -out ../android-app/android/app/src/main/res/raw/test_ca
cp ca.pem ../android-app/ios/test_ca.cer
```

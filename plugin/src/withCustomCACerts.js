const { withDangerousMod, withXcodeProject, IOSConfig } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withCustomCACerts(config, props = {}) {
    const { customCACerts = [] } = props;

    if (customCACerts.length === 0) return config;

    config = withIosCerts(config, customCACerts);
    config = withAndroidCerts(config, customCACerts);

    return config;
}

function withIosCerts(config, certs) {
    return withXcodeProject(config, (config) => {
        const projectRoot = config.modRequest.projectRoot;
        const project = config.modResults;

        const iosDir = path.join(projectRoot, "ios");
        const certsDir = path.join(iosDir, "certs");
        fs.mkdirSync(certsDir, { recursive: true });

        for (const cert of certs) {
            const srcPath = path.join(projectRoot, cert.path);
            if (!fs.existsSync(srcPath)) {
                console.warn(`[react-native-blob-util] Certificate not found: ${cert.path}`);
                continue;
            }

            const ext = path.extname(cert.path);
            const destFilename = cert.name + ext;
            const destPath = path.join(certsDir, destFilename);
            fs.copyFileSync(srcPath, destPath);

            IOSConfig.XcodeUtils.addResourceFileToGroup({
                filepath: destPath,
                groupName: "Resources",
                project,
                isBuildFile: true,
                verbose: true,
            });
        }

        return config;
    });
}

function withAndroidCerts(config, certs) {
    return withDangerousMod(config, [
        "android",
        (config) => {
            const projectRoot = config.modRequest.projectRoot;
            const rawDir = path.join(projectRoot, "android/app/src/main/res/raw");
            fs.mkdirSync(rawDir, { recursive: true });

            for (const cert of certs) {
                const srcPath = path.join(projectRoot, cert.path);
                if (!fs.existsSync(srcPath)) {
                    console.warn(`[react-native-blob-util] Certificate not found: ${cert.path}`);
                    continue;
                }

                const ext = path.extname(cert.path);
                if (ext === ".pem") {
                    const pemContent = fs.readFileSync(srcPath, "utf8");
                    const derBuffer = pemToDer(pemContent);
                    fs.writeFileSync(path.join(rawDir, cert.name), derBuffer);
                } else {
                    fs.copyFileSync(srcPath, path.join(rawDir, cert.name));
                }
            }

            return config;
        },
    ]);
}

function pemToDer(pemContent) {
    const base64 = pemContent
        .replace(/-----BEGIN CERTIFICATE-----/g, "")
        .replace(/-----END CERTIFICATE-----/g, "")
        .replace(/\s/g, "");
    return Buffer.from(base64, "base64");
}

module.exports = withCustomCACerts;

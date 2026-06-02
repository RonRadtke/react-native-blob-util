const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");
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

        const iosCertsDir = path.join(projectRoot, "ios/certs");
        fs.mkdirSync(iosCertsDir, { recursive: true });

        for (const cert of certs) {
            const srcPath = path.join(projectRoot, cert.path);
            if (!fs.existsSync(srcPath)) {
                console.warn(`[react-native-blob-util] Certificate not found: ${cert.path}`);
                continue;
            }

            const ext = path.extname(cert.path);
            const destFilename = cert.name + ext;
            fs.copyFileSync(srcPath, path.join(iosCertsDir, destFilename));

            const mainGroup = project.getFirstProject().firstProject.mainGroup;
            const resourcesGroup = project.pbxGroupByName("Resources") || project.addPbxGroup([], "Resources", "Resources");

            if (!project.pbxGroupByName("Resources")) {
                project.addToPbxGroup(resourcesGroup.uuid, mainGroup);
            }

            const certFileRef = project.addFile("certs/" + destFilename, resourcesGroup.uuid, {
                lastKnownFileType: "text",
            });

            if (certFileRef) {
                project.addToPbxBuildFileSection(certFileRef);
                const nativeTargets = project.pbxNativeTargetSection();
                for (const key in nativeTargets) {
                    const target = nativeTargets[key];
                    if (target.buildPhases) {
                        const resourcesPhase = target.buildPhases.find((phase) => phase.comment === "Resources");
                        if (resourcesPhase) {
                            project.addToPbxResourcesBuildPhase(certFileRef);
                            break;
                        }
                    }
                }
            }
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

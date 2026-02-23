const http = require('http');
const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');

const rootDir = path.resolve(__dirname, '..', '..');
const VALID_PLATFORMS = ['android', 'ios', 'windows'];
const isWin = process.platform === 'win32';
const npxCmd = 'npx';
const npmCmd = 'npm';
const nodeCmd = process.execPath;
const npxEnv = {...process.env, npm_config_yes: 'true'};
const cmdExe = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe';
const gradleCmd = isWin ? 'gradlew.bat' : './gradlew';
const androidE2eAppDir = path.join(rootDir, 'tests', 'e2e', 'android-app');
const androidE2eProjectDir = path.join(androidE2eAppDir, 'android');
const androidE2eApkPath = path.join(androidE2eProjectDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

const appiumHost = process.env.APPIUM_HOST || '127.0.0.1';
const appiumPort = Number(process.env.APPIUM_PORT || 4723);
const rawAppiumPath = process.env.APPIUM_PATH || '/wd/hub';
const appiumBasePath = rawAppiumPath.replace(/\/+$/, '');

const serverHost = process.env.E2E_SERVER_HOST || '127.0.0.1';
const serverPort = Number(process.env.E2E_SERVER_PORT || 19076);

const parseArgs = (argv) => {
    const options = {
        platforms: null,
        startServer: true,
        startAppium: true,
        installDrivers: true,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--platforms' || arg === '--platform') {
            const value = argv[i + 1];
            if (!value) {
                throw new Error(`${arg} requires a value.`);
            }
            options.platforms = value;
            i += 1;
            continue;
        }
        if (arg.startsWith('--platforms=')) {
            options.platforms = arg.slice('--platforms='.length);
            continue;
        }
        if (arg.startsWith('--platform=')) {
            options.platforms = arg.slice('--platform='.length);
            continue; 
        }
        if (arg === '--no-server') {
            options.startServer = false;
            continue;
        }
        if (arg === '--no-appium') {
            options.startAppium = false;
            continue;
        }
        if (arg === '--skip-driver-install') {
            options.installDrivers = false;
            continue;
        }
        if (arg === '--help' || arg === '-h') {
            console.log('Usage: node tests/e2e/run-all.js [--platforms android,ios] [--no-server] [--no-appium] [--skip-driver-install]');
            process.exit(0);
        }
        throw new Error(`Unknown argument: ${arg}`);
    }

    return options;
};

const cliOptions = parseArgs(process.argv.slice(2));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (message) => {
    console.log(`[e2e] ${message}`);
};

const stripAnsi = (value) => value.replace(/\u001b\[[0-9;]*m/g, '');
const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
const fileExists = (targetPath) => fs.existsSync(targetPath);

const resolveSpawnCommand = (cmd, args = []) => {
    const normalized = cmd.toLowerCase();
    if (isWin && (normalized === 'npx' || normalized === 'npx.cmd' || normalized === 'npm' || normalized === 'npm.cmd' || normalized.endsWith('.cmd') || normalized.endsWith('.bat'))) {
        return {
            command: cmdExe,
            args: ['/d', '/s', '/c', cmd, ...args],
        };
    }

    return {command: cmd, args};
};

const spawnCommand = (cmd, args = [], options = {}) => {
    const resolved = resolveSpawnCommand(cmd, args);
    return spawn(resolved.command, resolved.args, options);
};

const runCommand = (cmd, args, options = {}) =>
    new Promise((resolve, reject) => {
        const child = spawnCommand(cmd, args, {stdio: 'inherit', ...options});
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
            }
        });
    });

const runCommandCapture = (cmd, args, options = {}) =>
    new Promise((resolve, reject) => {
        const child = spawnCommand(cmd, args, {stdio: ['ignore', 'pipe', 'pipe'], ...options});
        let output = '';
        child.stdout.on('data', (chunk) => {
            output += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            output += chunk.toString();
        });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(output));
            }
        });
    });

const checkUrl = (url) =>
    new Promise((resolve) => {
        const req = http.get(url, (res) => {
            res.resume();
            resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
        });
    });

const waitForUrl = async (url, timeoutMs, label) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await checkUrl(url)) {
            return;
        }
        await sleep(500);
    }
    throw new Error(`Timed out waiting for ${label} at ${url}`);
};

const listInstalledDrivers = async () => {
    const output = await runCommandCapture(npxCmd, ['appium', 'driver', 'list', '--installed'], {cwd: rootDir, env: npxEnv});
    const installed = new Set();
    output.split(/\r?\n/).forEach((line) => {
        const cleanLine = stripAnsi(line).trim();
        const match = cleanLine.match(/^- ([a-z0-9_-]+)@/i);
        if (match) {
            installed.add(match[1]);
        }
    });
    return installed;
};

const ensureDrivers = async (platforms) => {
    if (!cliOptions.installDrivers) {
        log('Skipping Appium driver installation (--skip-driver-install).');
        return;
    }

    const drivers = new Set();
    if (platforms.includes('android')) {
        drivers.add('uiautomator2');
    }
    if (platforms.includes('ios')) {
        drivers.add('xcuitest');
    }
    if (platforms.includes('windows')) {
        drivers.add('windows');
    }

    if (drivers.size === 0) {
        return;
    }

    let installed = new Set();
    try {
        installed = await listInstalledDrivers();
    } catch (err) {
        log('Unable to list installed Appium drivers. Installing required drivers anyway.');
    }

    for (const driver of drivers) {
        if (!installed.has(driver)) {
            log(`Installing Appium driver: ${driver}`);
            await runCommand(npxCmd, ['appium', 'driver', 'install', driver], {cwd: rootDir, env: npxEnv});
        }
    }
};

const ensureAndroidAppDependencies = async () => {
    const nodeModulesDir = path.join(androidE2eAppDir, 'node_modules');
    const hasReactNative = fileExists(path.join(nodeModulesDir, 'react-native'));
    const hasBlobUtil = fileExists(path.join(nodeModulesDir, 'react-native-blob-util'));
    if (fileExists(nodeModulesDir) && hasReactNative && hasBlobUtil) {
        return;
    }
    log('Installing Android E2E app dependencies.');
    await runCommand(npmCmd, ['install'], {cwd: androidE2eAppDir});
};

const buildAndroidE2eApk = async () => {
    const gradleWrapper = path.join(androidE2eProjectDir, isWin ? 'gradlew.bat' : 'gradlew');
    if (!fileExists(gradleWrapper)) {
        throw new Error(`Android E2E app is missing: ${androidE2eProjectDir}`);
    }

    await ensureAndroidAppDependencies();
    log('Building Android E2E app debug APK.');
    await runCommand(gradleCmd, ['assembleDebug'], {cwd: androidE2eProjectDir});

    if (!fileExists(androidE2eApkPath)) {
        throw new Error(`Expected APK not found: ${androidE2eApkPath}`);
    }
};

const ensureAndroidAppTarget = async (platforms) => {
    if (!platforms.includes('android')) {
        return;
    }

    if (process.env.E2E_APP_PATH_ANDROID || process.env.E2E_APP_PATH || process.env.ANDROID_APP_PACKAGE) {
        return;
    }

    const forceBuild = isTruthy(process.env.E2E_REBUILD_ANDROID_APP);
    if (!forceBuild && fileExists(androidE2eApkPath)) {
        process.env.E2E_APP_PATH_ANDROID = androidE2eApkPath;
        log(`Using existing Android E2E APK: ${androidE2eApkPath}`);
        return;
    }

    await buildAndroidE2eApk();
    process.env.E2E_APP_PATH_ANDROID = androidE2eApkPath;
    log(`Using Android E2E APK: ${androidE2eApkPath}`);
};

const startAppium = async () => {
    const statusPath = appiumBasePath ? `${appiumBasePath}/status` : '/status';
    const statusUrl = `http://${appiumHost}:${appiumPort}${statusPath}`;
    if (await checkUrl(statusUrl)) {
        log('Using existing Appium server.');
        return null;
    }
    if (!cliOptions.startAppium) {
        throw new Error(`Appium is not reachable at ${statusUrl}. Start it manually or omit --no-appium.`);
    }

    log('Starting Appium server.');
    const appiumArgs = ['appium'];
    if (appiumBasePath) {
        appiumArgs.push('--base-path', appiumBasePath);
    }
    const child = spawnCommand(npxCmd, appiumArgs, {cwd: rootDir, stdio: 'inherit', env: npxEnv});
    await waitForUrl(statusUrl, 30000, 'Appium');
    return child;
};

const startServer = async () => {
    const healthUrl = `http://${serverHost}:${serverPort}/health`;
    if (await checkUrl(healthUrl)) {
        log('Using existing E2E HTTP server.');
        return null;
    }
    if (!cliOptions.startServer) {
        throw new Error(`E2E server is not reachable at ${healthUrl}. Start it manually or omit --no-server.`);
    }

    log('Starting E2E HTTP server.');
    const child = spawnCommand(nodeCmd, ['tests/e2e/server.js'], {cwd: rootDir, stdio: 'inherit'});
    await waitForUrl(healthUrl, 15000, 'E2E server');
    return child;
};

const resolvePlatforms = () => {
    const raw = cliOptions.platforms || process.env.E2E_PLATFORMS || 'android,ios,windows';
    const platforms = raw
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

    const unique = [];
    const invalid = [];
    for (const platform of platforms) {
        if (!VALID_PLATFORMS.includes(platform)) {
            invalid.push(platform);
            continue;
        }
        if (!unique.includes(platform)) {
            unique.push(platform);
        }
    }

    if (invalid.length > 0) {
        throw new Error(`Unknown platform(s): ${invalid.join(', ')}.`);
    }

    return unique;
};

const isPlatformSupported = (platform) => {
    if (platform === 'ios' && process.platform !== 'darwin') {
        if (process.env.E2E_FORCE_IOS) {
            log('E2E_FORCE_IOS is set; attempting iOS on non-mac host.');
            return true;
        }
        log('Skipping iOS: requires macOS.');
        return false;
    }
    if (platform === 'windows' && process.platform !== 'win32') {
        if (process.env.E2E_FORCE_WINDOWS) {
            log('E2E_FORCE_WINDOWS is set; attempting Windows on non-Windows host.');
            return true;
        }
        log('Skipping Windows: requires Windows host.');
        return false;
    }
    return true;
};

const buildEnvForPlatform = (platform) => {
    const env = {...process.env};
    const platformKey = platform.toUpperCase();

    const appPathKey = `E2E_APP_PATH_${platformKey}`;
    if (process.env[appPathKey]) {
        env.E2E_APP_PATH = process.env[appPathKey];
    }

    const deviceNameKey = `DEVICE_NAME_${platformKey}`;
    if (process.env[deviceNameKey]) {
        env.DEVICE_NAME = process.env[deviceNameKey];
    }

    const scenariosKey = `E2E_SCENARIOS_${platformKey}`;
    if (process.env[scenariosKey]) {
        env.E2E_SCENARIOS = process.env[scenariosKey];
    }

    if (!env.E2E_SERVER_URL) {
        if (platform === 'android') {
            env.E2E_SERVER_URL = `http://10.0.2.2:${serverPort}`;
        } else {
            env.E2E_SERVER_URL = `http://127.0.0.1:${serverPort}`;
        }
    }

    if (platform === 'windows') {
        if (process.env.E2E_WINDOWS_APP_ID && !env.WINDOWS_APP_ID) {
            env.WINDOWS_APP_ID = process.env.E2E_WINDOWS_APP_ID;
        }
        if (process.env.E2E_WINDOWS_APP_PATH && !env.WINDOWS_APP_PATH) {
            env.WINDOWS_APP_PATH = process.env.E2E_WINDOWS_APP_PATH;
        }
    }

    return env;
};

const runPlatform = async (platform) => {
    log(`Running ${platform} tests.`);
    const env = buildEnvForPlatform(platform);
    await runCommand(nodeCmd, ['tests/e2e/appium/run.js', platform], {cwd: rootDir, env});
};

const main = async () => {
    const platforms = resolvePlatforms().filter(isPlatformSupported);
    if (platforms.length === 0) {
        throw new Error('No valid platforms to run. Set E2E_PLATFORMS to android,ios,windows.');
    }

    await ensureAndroidAppTarget(platforms);
    await ensureDrivers(platforms);

    const processes = [];
    try {
        const serverProcess = await startServer();
        if (serverProcess) {
            processes.push(serverProcess);
        }

        const appiumProcess = await startAppium();
        if (appiumProcess) {
            processes.push(appiumProcess);
        }

        for (const platform of platforms) {
            await runPlatform(platform);
        }
    } finally {
        for (const proc of processes.reverse()) {
            if (proc && !proc.killed) {
                proc.kill();
            }
        }
    }
};

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});

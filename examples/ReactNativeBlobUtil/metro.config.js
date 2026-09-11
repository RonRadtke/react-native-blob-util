const fs = require('fs');
const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const appDir = __dirname;
const repoRoot = path.resolve(appDir, '..', '..');

const rnwPath = fs.realpathSync(
    path.resolve(require.resolve('react-native-windows/package.json'), '..'),
);

/**
 * One app, three platforms, so this config serves all of them.
 *
 * The Windows build output is excluded: msbuild writes into windows/ and into
 * react-native-windows' build and target folders while Metro watches, which
 * crashes the server with EBUSY on msbuild.ProjectImports.zip. blockList takes a
 * single RegExp - metro-config used to export an exclusionList helper to combine
 * several, but only from src/ internals current versions no longer expose.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const blocked = [
    new RegExp(`${path.resolve(appDir, 'windows').replace(/[/\\]/g, '[/\\\\]')}.*`),
    new RegExp(`${rnwPath.replace(/[/\\]/g, '[/\\\\]')}[/\\\\](build|target)[/\\\\].*`),
    /.*\.ProjectImports\.zip/,
];

/**
 * react-native-windows is a complete superset of react-native, not a patch on
 * top of it: every file under Libraries/ and src/ is mirrored (455 and 159
 * respectively, none missing) with .windows.js variants added where a platform
 * implementation is needed, and its package main is index.windows.js.
 *
 * So on Windows the whole package is redirected. Serving some modules from
 * react-native and some from the overlay produces two module registries in one
 * bundle, which fails at startup with "Tried to register two views with the same
 * name RCTSafeAreaView" - and picking per-file is what caused that.
 */
const RN_PREFIX = 'react-native';

const redirectToOverlay = (moduleName) => {
    const suffix = moduleName.slice(RN_PREFIX.length);
    const target = suffix ? path.join(rnwPath, suffix) : rnwPath;

    for (const candidate of [target, `${target}.windows.js`, `${target}.js`]) {
        try {
            return {type: 'sourceFile', filePath: require.resolve(candidate)};
        } catch (_) {
            // try the next shape
        }
    }

    return null;
};

const isReact = (moduleName) =>
    moduleName === 'react' || moduleName.startsWith('react/');

const isReactNative = (moduleName) =>
    moduleName === RN_PREFIX || moduleName.startsWith(`${RN_PREFIX}/`);

const config = {
    watchFolders: [repoRoot, rnwPath],
    resolver: {
        blockList: new RegExp(`(${blocked.map(r => r.source).join('|')})`),
        resolveRequest: (context, moduleName, platform) => {
            // The repository root is watched and carries its own react, and the
            // library there imports react too, so pin it to one copy.
            if (isReact(moduleName)) {
                return {
                    type: 'sourceFile',
                    filePath: require.resolve(moduleName, {paths: [appDir]}),
                };
            }

            if (isReactNative(moduleName)) {
                if (platform === 'windows') {
                    const overlaid = redirectToOverlay(moduleName);
                    if (overlaid) {
                        return overlaid;
                    }
                }

                return {
                    type: 'sourceFile',
                    filePath: require.resolve(moduleName, {paths: [appDir]}),
                };
            }

            return context.resolveRequest(context, moduleName, platform);
        },
        extraNodeModules: {
            'react-native-blob-util': repoRoot,
        },
        nodeModulesPaths: [
            path.join(appDir, 'node_modules'),
            path.join(repoRoot, 'node_modules'),
        ],
    },
};

module.exports = mergeConfig(getDefaultConfig(appDir), config);

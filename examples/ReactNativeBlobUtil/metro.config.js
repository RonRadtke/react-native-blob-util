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

const NODE_MODULES_RN = `${path.sep}node_modules${path.sep}react-native${path.sep}`;

/**
 * Maps a file inside any react-native copy to the same path inside
 * react-native-windows. The library is consumed from the repository root, which
 * has its own react-native, so this matches the last node_modules segment rather
 * than one known location.
 */
const overlayPathFor = (origin) => {
    const at = origin ? origin.lastIndexOf(NODE_MODULES_RN) : -1;
    return at === -1 ? null : path.join(rnwPath, origin.slice(at + NODE_MODULES_RN.length));
};

/**
 * react-native-windows is a partial overlay on react-native: it ships
 * .windows.js variants at react-native's own paths, but only for the files it
 * actually overrides, so redirecting the whole package breaks on everything it
 * does not carry. The imports needing redirection are also relative ones made
 * from inside react-native, so they cannot be matched by module name.
 *
 * The overlay has to take precedence rather than act as a fallback. Platform is
 * the case that proves it: react-native ships a generic Platform.js, so
 * resolution succeeds with a module that has no OS, and the app dies on
 * Platform.OS before any fallback could run. Only a .windows.js counts as an
 * override - anything react-native-windows merely mirrors is left alone.
 */
const resolveOverride = (origin, moduleName, platform) => {
    const overlaid = overlayPathFor(origin);
    if (!overlaid) {
        return null;
    }

    const candidate = `${path.resolve(path.dirname(overlaid), moduleName)}.${platform}.js`;
    return fs.existsSync(candidate) ? {type: 'sourceFile', filePath: candidate} : null;
};

/**
 * Last resort for imports react-native makes that it cannot satisfy itself,
 * where the only copy lives in the overlay - setUpReactDevTools.js reaching
 * ReactDevToolsSettingsManager is the example.
 */
const resolveMissingThroughOverlay = (origin, moduleName, platform) => {
    const overlaid = overlayPathFor(origin);
    if (!overlaid) {
        return null;
    }

    const target = path.resolve(path.dirname(overlaid), moduleName);
    for (const suffix of [`.${platform}.js`, '.native.js', '.js', `${path.sep}index.js`]) {
        const candidate = `${target}${suffix}`;
        if (fs.existsSync(candidate)) {
            return {type: 'sourceFile', filePath: candidate};
        }
    }

    return null;
};

const isReactCore = (moduleName) =>
    moduleName === 'react' ||
    moduleName.startsWith('react/') ||
    moduleName === 'react-native' ||
    moduleName.startsWith('react-native/');

const config = {
    watchFolders: [repoRoot, rnwPath],
    resolver: {
        blockList: new RegExp(`(${blocked.map(r => r.source).join('|')})`),
        resolveRequest: (context, moduleName, platform) => {
            // The repository root is watched and carries its own react and
            // react-native, and the library there imports react-native too, so
            // without pinning the bundle ends up with two copies.
            if (isReactCore(moduleName)) {
                return {
                    type: 'sourceFile',
                    filePath: require.resolve(moduleName, {paths: [appDir]}),
                };
            }

            if (platform !== 'windows') {
                return context.resolveRequest(context, moduleName, platform);
            }

            const override = resolveOverride(context.originModulePath, moduleName, platform);
            if (override) {
                return override;
            }

            try {
                return context.resolveRequest(context, moduleName, platform);
            } catch (error) {
                const missing = resolveMissingThroughOverlay(context.originModulePath, moduleName, platform);
                if (missing) {
                    return missing;
                }

                throw error;
            }
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

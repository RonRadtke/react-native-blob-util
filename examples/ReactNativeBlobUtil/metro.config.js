const fs = require('fs');
const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const appDir = __dirname;
const repoRoot = path.resolve(appDir, '..', '..');

const rnwPath = fs.realpathSync(
    path.resolve(require.resolve('react-native-windows/package.json'), '..'),
);

/**
 * One app, three platforms, so this config has to serve all of them.
 *
 * react and react-native are pinned to this app's node_modules on Android and
 * iOS: the repository root is on the watch list (the library is consumed from
 * there) and it has its own copies, which Metro will otherwise happily bundle
 * alongside these, producing two Reacts.
 *
 * That pinning is deliberately skipped on Windows. react-native-windows works
 * by shipping .windows.js overrides at react-native's own module paths, and
 * redirecting react-native/* at this app's copy defeats them.
 *
 * The Windows build output is excluded either way: msbuild writes into windows/
 * and into react-native-windows' build and target folders while Metro watches,
 * which crashes the server with EBUSY on msbuild.ProjectImports.zip. blockList
 * takes a single RegExp - metro-config used to export an exclusionList helper
 * to combine several, but only from src/ internals current versions no longer
 * expose, so the patterns are joined here.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const blocked = [
    new RegExp(`${path.resolve(appDir, 'windows').replace(/[/\\]/g, '[/\\\\]')}.*`),
    new RegExp(`${rnwPath.replace(/[/\\]/g, '[/\\\\]')}[/\\\\](build|target)[/\\\\].*`),
    /.*\.ProjectImports\.zip/,
];

const rnPath = path.dirname(require.resolve('react-native/package.json', {paths: [appDir]}));

/**
 * react-native-windows is a partial overlay on react-native: it supplies
 * .windows.js variants at react-native's own paths, but only for the files it
 * actually overrides. Redirecting the whole package would break on everything it
 * does not carry, and the imports that need redirecting are relative ones made
 * from inside react-native, so they cannot be matched by module name either.
 *
 * Resolve normally, and only when that fails, retry the same request as if the
 * importing file were its react-native-windows counterpart. That is how
 * react-native's setUpReactDevTools.js reaches
 * ReactDevToolsSettingsManager.windows.js, which exists only in the overlay.
 */
const resolveThroughOverlay = (context, moduleName, platform) => {
    const origin = context.originModulePath;
    if (!origin) {
        return null;
    }

    // Match any react-native copy, not only the app's: the library is consumed
    // from the repository root, which has its own.
    const marker = `${path.sep}node_modules${path.sep}react-native${path.sep}`;
    const at = origin.lastIndexOf(marker);
    if (at === -1) {
        return null;
    }

    const overlaid = path.join(rnwPath, origin.slice(at + marker.length));
    const target = path.resolve(path.dirname(overlaid), moduleName);

    for (const suffix of [`.${platform}.js`, '.native.js', '.js', `/index.${platform}.js`, '/index.js']) {
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
            // Every platform, including Windows. The repository root is watched and
            // carries its own react and react-native, and the library there imports
            // react-native too, so without this the bundle ends up with two copies -
            // and on Windows the root copy is the one that lost its overlay.
            if (isReactCore(moduleName)) {
                return {
                    type: 'sourceFile',
                    filePath: require.resolve(moduleName, {paths: [appDir]}),
                };
            }

            if (platform !== 'windows') {
                return context.resolveRequest(context, moduleName, platform);
            }

            try {
                return context.resolveRequest(context, moduleName, platform);
            } catch (error) {
                const overlaid = resolveThroughOverlay(context, moduleName, platform);
                if (overlaid) {
                    return overlaid;
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

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
            if (platform !== 'windows' && isReactCore(moduleName)) {
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

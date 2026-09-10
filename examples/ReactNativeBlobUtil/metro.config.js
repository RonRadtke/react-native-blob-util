const fs = require('fs');
const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const appDir = __dirname;
const repoRoot = path.resolve(appDir, '..', '..');

const rnwPath = fs.realpathSync(
    path.resolve(require.resolve('react-native-windows/package.json'), '..'),
);

/**
 * Deliberately does not pin react or react-native to this app's node_modules.
 * react-native-windows works by shipping .windows.js overrides at react-native's
 * own module paths - ReactDevToolsSettingsManager is one, where core has only
 * .android.js and .ios.js - and redirecting react-native/* requests defeats
 * that, leaving the bundle unable to resolve.
 *
 * The Windows build output is excluded instead: msbuild writes into windows/ and
 * into react-native-windows' build and target folders while Metro is watching,
 * which crashes the server with EBUSY on msbuild.ProjectImports.zip.
 *
 * blockList wants a single RegExp. metro-config used to export an exclusionList
 * helper to combine several, but only from src/ internals that current versions
 * no longer expose, so the patterns are joined here.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const blocked = [
    new RegExp(`${path.resolve(appDir, 'windows').replace(/[/\\]/g, '[/\\\\]')}.*`),
    new RegExp(`${rnwPath.replace(/[/\\]/g, '[/\\\\]')}[/\\\\](build|target)[/\\\\].*`),
    /.*\.ProjectImports\.zip/,
];

const config = {
    // The library is consumed from the repository root, and react-native-windows
    // is resolved from source, so both have to be watched.
    watchFolders: [repoRoot, rnwPath],
    resolver: {
        blockList: new RegExp(`(${blocked.map(r => r.source).join('|')})`),
        extraNodeModules: {
            'react-native-blob-util': repoRoot,
        },
    },
    transformer: {
        getTransformOptions: async () => ({
            transform: {
                experimentalImportSupport: false,
                inlineRequires: true,
            },
        }),
    },
};

module.exports = mergeConfig(getDefaultConfig(appDir), config);

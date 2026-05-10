const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const appDir = __dirname;
const repoRoot = path.resolve(appDir, '..', '..', '..');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
    watchFolders: [repoRoot],
    resolver: {
        extraNodeModules: {
            react: path.join(appDir, 'node_modules', 'react'),
            'react-native': path.join(appDir, 'node_modules', 'react-native'),
            'react-native-blob-util': repoRoot,
        },
        nodeModulesPaths: [
            path.join(appDir, 'node_modules'),
            path.join(repoRoot, 'node_modules'),
        ],
    },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

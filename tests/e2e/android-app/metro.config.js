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
        resolveRequest: (context, moduleName, platform) => {
            if (
                moduleName === 'react' ||
                moduleName.startsWith('react/') ||
                moduleName === 'react-native' ||
                moduleName.startsWith('react-native/')
            ) {
                return {
                    type: 'sourceFile',
                    filePath: require.resolve(moduleName, {paths: [appDir]}),
                };
            }

            return context.resolveRequest(context, moduleName, platform);
        },
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

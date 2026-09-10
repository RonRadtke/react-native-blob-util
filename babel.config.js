// Used by ESLint's @babel/eslint-parser so it can parse the Flow-annotated
// sources. Not consumed by apps that install this package - Babel resolves a
// root config from the app, not from a dependency.
module.exports = {
    presets: ['module:@react-native/babel-preset'],
};

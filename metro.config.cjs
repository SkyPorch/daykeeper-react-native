const { getDefaultConfig } = require("@react-native/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@skyporch/daykeeper-react-native": path.resolve(__dirname),
};

module.exports = config;

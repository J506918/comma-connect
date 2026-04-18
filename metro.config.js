const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Provide web-safe mocks for native-only packages
config.resolver = config.resolver || {};
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "web" &&
    moduleName === "@dylankenneally/react-native-ssh-sftp"
  ) {
    return {
      filePath: path.resolve(__dirname, "lib/mocks/ssh-sftp-web.js"),
      type: "sourceFile",
    };
  }
  // Mock react-native-reanimated for web (it calls native modules at module init time)
  if (
    platform === "web" &&
    (moduleName === 'react-native-reanimated' ||
     moduleName.includes('react-native-reanimated/'))
  ) {
    return {
      filePath: path.resolve(__dirname, "lib/mocks/reanimated-web.js"),
      type: "sourceFile",
    };
  }
  // Mock react-native-worklets for web (TurboModuleRegistry not available on web)
  if (
    platform === "web" &&
    (moduleName === 'react-native-worklets' ||
     moduleName.includes('react-native-worklets/') ||
     moduleName.endsWith('NativeWorkletsModule'))
  ) {
    return {
      filePath: path.resolve(__dirname, "lib/mocks/worklets-web.js"),
      type: "sourceFile",
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});

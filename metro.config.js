const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro config exists for one reason: to let the app bundle for web.
 *
 * react-native-maps cannot be built for web — MapMarker imports
 * react-native/Libraries/Utilities/codegenNativeCommands, and Metro rejects
 * React Native internals on that platform. Because DriverMap is imported by the
 * dashboard and the trip screen, that single failure takes the entire web
 * bundle with it, and `expo start --web` never serves.
 *
 * Swapping the package for a placeholder on web restores a browser preview of
 * everything else: sign-in, duty hours, earnings, trip history and the offline
 * ride form. The substitution is keyed on platform, so Android and iOS resolve
 * the real native module exactly as before — nothing about a production build
 * changes.
 */

const config = getDefaultConfig(__dirname);

const MAPS_WEB_STUB = path.resolve(__dirname, 'lib/maps-web-stub.tsx');

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && /^react-native-maps(\/|$)/.test(moduleName)) {
    return { type: 'sourceFile', filePath: MAPS_WEB_STUB };
  }
  // Defer to whatever Expo already had in place rather than assuming the
  // default resolver — Expo sets its own resolveRequest for other platforms.
  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;

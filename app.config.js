// Injects secrets into the Expo config at evaluation time.
//
// app.json holds everything static and safe to commit; this file layers on the
// values from .env.local (gitignored) so no API key is ever committed.
// Expo CLI loads .env / .env.local automatically before evaluating this file.

const ANDROID_MAPS_KEY = process.env.GOOGLE_MAPS_ANDROID_KEY || '';
const IOS_MAPS_KEY = process.env.GOOGLE_MAPS_IOS_KEY || '';
const BILLING_URL = process.env.BILLING_URL || 'https://app.csctravels.com';

if (!ANDROID_MAPS_KEY) {
  console.warn(
    '\n⚠️  GOOGLE_MAPS_ANDROID_KEY is not set — the Android build will show a blank map.\n' +
    '   Set it in .env.local for local runs, and in EAS for cloud builds.\n',
  );
}

module.exports = ({ config }) => ({
  ...config,

  ios: {
    ...config.ios,
    // An Android-restricted key does not authenticate on iOS. Only opt into
    // Google Maps when a real iOS key exists; otherwise react-native-maps falls
    // back to Apple Maps, which needs no key.
    ...(IOS_MAPS_KEY ? { config: { ...config.ios?.config, googleMapsApiKey: IOS_MAPS_KEY } } : {}),
  },

  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: { apiKey: ANDROID_MAPS_KEY },
    },
  },

  extra: {
    ...config.extra,
    BILLING_URL,
    IOS_GOOGLE_MAPS: IOS_MAPS_KEY.length > 0,
  },
});

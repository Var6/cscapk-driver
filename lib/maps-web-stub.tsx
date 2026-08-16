import { Component, type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { colors, spacing, radius } from './theme';

/**
 * Web stand-in for react-native-maps. Metro swaps the real package for this
 * file when bundling for web — see metro.config.js.
 *
 * The library cannot be bundled for web at all: MapMarker reaches into
 * react-native/Libraries/Utilities/codegenNativeCommands, and Metro refuses
 * React Native internals on that platform. One import anywhere in the router
 * tree therefore fails the whole web bundle, which is why this exists — it buys
 * back a browser preview of every screen that is not the map.
 *
 * It is a preview aid and nothing more. Anything map-shaped is a labelled
 * placeholder here, so a blank rectangle in the browser is never mistaken for a
 * map that failed to load on a real device.
 */

/** Class, not a function: DriverMap holds a ref and calls camera methods. */
export default class MapView extends Component<any> {
  componentDidMount() {
    // Keep the consumer's ready-gated effects on the same code path as native.
    this.props?.onMapReady?.();
  }

  animateToRegion() {}
  animateCamera() {}
  fitToCoordinates() {}
  async getCamera() {
    return {};
  }

  render() {
    return (
      <View
        style={[
          {
            flex: 1,
            backgroundColor: colors.primaryLight,
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.lg,
          },
          this.props?.style,
        ]}
      >
        <View
          style={{
            backgroundColor: 'white',
            borderRadius: radius.md,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 24 }}>🗺️</Text>
          <Text style={{ fontWeight: '800', color: colors.text, marginTop: 4 }}>
            Map unavailable in the browser
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, textAlign: 'center' }}>
            Google Maps is native-only. Open the app on a device to see it.
          </Text>
        </View>
      </View>
    );
  }
}

/** Overlays render nothing — their content belongs to the map that is absent. */
export const Marker = (_props: { children?: ReactNode } & Record<string, unknown>) => null;
export const Polyline = (_props: Record<string, unknown>) => null;
export const Circle = (_props: Record<string, unknown>) => null;
export const Callout = (_props: { children?: ReactNode } & Record<string, unknown>) => null;

export const MapMarker = Marker;
export const MapPolyline = Polyline;

export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = undefined;

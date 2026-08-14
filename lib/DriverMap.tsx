import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { colors, radius, spacing } from './theme';

/**
 * The map every screen shares.
 *
 * react-native-maps was already a dependency but nothing rendered it, so the
 * driver worked from a list of addresses with no idea where any of them were.
 * This is the component that puts the job on a map instead.
 *
 * Provider choice follows the key situation set up in app.config.js: Android
 * always uses the Google SDK, iOS only opts in when a real iOS key exists and
 * otherwise falls back to Apple Maps, which needs no key. An Android-restricted
 * key does not authenticate on iOS — forcing Google there gives a blank grid.
 */

const IOS_GOOGLE = Constants.expoConfig?.extra?.IOS_GOOGLE_MAPS === true;
const PROVIDER = Platform.OS === 'android' || IOS_GOOGLE ? PROVIDER_GOOGLE : undefined;

/** Patna — where the fleet runs. Only used until the first GPS fix lands. */
const FALLBACK = { latitude: 25.5941, longitude: 85.1376 };

/** Roughly a 1.5 km viewport: close enough to read streets while driving. */
const CLOSE_DELTA = 0.014;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapPin {
  id: string;
  at: LatLng;
  kind: 'pickup' | 'drop' | 'offer';
  label?: string;
}

interface Props {
  /** The driver. Null before the first fix. */
  position: LatLng | null;
  /** Degrees from north, used to point the car marker the way it is moving. */
  heading?: number | null;
  pins?: MapPin[];
  /** Where the driver has actually been — drawn solid. */
  trail?: LatLng[];
  /** Straight guide from the driver to the target — drawn dashed. */
  guideTo?: LatLng | null;
  /** Keep the camera on the driver as they move. */
  follow?: boolean;
  /** Frame these together once, instead of following. */
  fit?: LatLng[];
  style?: object;
  /** Overlaid controls, rendered above the map. */
  children?: ReactNode;
}

const toCoord = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

export function DriverMap({
  position, heading, pins = [], trail = [], guideTo, follow = true, fit, style, children,
}: Props) {
  const map = useRef<MapView>(null);
  const [following, setFollowing] = useState(follow);
  const [ready, setReady] = useState(false);

  // Callers turn following off for the duration of a trip and back on after it.
  useEffect(() => { setFollowing(follow); }, [follow]);

  // Android snapshots a custom marker's view once and then stops redrawing it,
  // and a snapshot taken before the view has laid out gives a blank marker.
  // Tracking is therefore re-armed whenever the set of markers changes — the
  // first GPS fix usually lands well after mount, so a timer started at mount
  // would expire before the car marker existed — and switched off once they
  // have settled, since leaving it on re-renders every marker every frame.
  const [tracksChanges, setTracksChanges] = useState(true);
  const markerKey = `${position ? 'me' : ''}|${pins.map((p) => p.id).join(',')}`;
  useEffect(() => {
    setTracksChanges(true);
    const t = setTimeout(() => setTracksChanges(false), 1200);
    return () => clearTimeout(t);
  }, [markerKey]);

  const initial: Region = {
    ...(position ? toCoord(position) : FALLBACK),
    latitudeDelta: CLOSE_DELTA,
    longitudeDelta: CLOSE_DELTA,
  };

  // Follow the driver.
  useEffect(() => {
    if (!ready || !following || !position) return;
    map.current?.animateToRegion(
      { ...toCoord(position), latitudeDelta: CLOSE_DELTA, longitudeDelta: CLOSE_DELTA },
      600,
    );
  }, [ready, following, position?.lat, position?.lng]);

  // Framing two points is a one-shot: it stops following, or the next GPS tick
  // would immediately pull the camera back off the pickup. Recentre resumes it.
  // Callers must keep this value stable across position updates — passing a
  // fresh array every tick would refit continuously.
  useEffect(() => {
    if (!ready || !fit || fit.length < 2) return;
    setFollowing(false);
    map.current?.fitToCoordinates(fit.map(toCoord), {
      edgePadding: { top: 90, right: 70, bottom: 160, left: 70 },
      animated: true,
    });
  }, [ready, JSON.stringify(fit)]);

  function recenter() {
    setFollowing(true);
    if (position) {
      map.current?.animateToRegion(
        { ...toCoord(position), latitudeDelta: CLOSE_DELTA, longitudeDelta: CLOSE_DELTA },
        500,
      );
    }
  }

  return (
    <View style={[{ flex: 1, backgroundColor: colors.primaryLight }, style]}>
      <MapView
        ref={map}
        provider={PROVIDER}
        style={{ flex: 1 }}
        initialRegion={initial}
        onMapReady={() => setReady(true)}
        // Any manual pan means the driver wants to look elsewhere; stop
        // yanking the camera back until they ask for it.
        onPanDrag={() => setFollowing(false)}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        customMapStyle={MAP_STYLE}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {trail.length > 1 && (
          <Polyline
            coordinates={trail.map(toCoord)}
            strokeColor={colors.accent}
            strokeWidth={5}
            lineCap="round"
          />
        )}

        {/* Straight line, not a driving route — the app has no Directions key,
            and a fake road-shaped line would imply a route it cannot promise. */}
        {position && guideTo && (
          <Polyline
            coordinates={[toCoord(position), toCoord(guideTo)]}
            strokeColor={colors.primary}
            strokeWidth={3}
            lineDashPattern={[10, 8]}
          />
        )}

        {pins.map((pin) => (
          <Marker
            key={pin.id}
            coordinate={toCoord(pin.at)}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={tracksChanges}
            title={pin.label}
          >
            <Pin kind={pin.kind} label={pin.label} />
          </Marker>
        ))}

        {position && (
          <Marker
            coordinate={toCoord(position)}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={heading ?? 0}
            tracksViewChanges={tracksChanges}
            zIndex={99}
          >
            <Car />
          </Marker>
        )}
      </MapView>

      <Pressable
        onPress={recenter}
        style={({ pressed }) => ({
          position: 'absolute', right: spacing.md, top: spacing.md,
          width: 42, height: 42, borderRadius: 21, backgroundColor: 'white',
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 }, elevation: 3,
        })}
      >
        <Text style={{ fontSize: 18 }}>{following ? '🎯' : '📍'}</Text>
      </Pressable>

      {children}
    </View>
  );
}

/** The driver's own vehicle. Rotated to heading, so it reads as a direction. */
function Car() {
  return (
    <View style={{
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: 'rgba(16,185,129,0.22)',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <View style={{
        width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white',
      }}>
        <Text style={{ fontSize: 13 }}>🚗</Text>
      </View>
    </View>
  );
}

function Pin({ kind, label }: { kind: MapPin['kind']; label?: string }) {
  const tone = kind === 'pickup' ? colors.success : kind === 'drop' ? colors.error : colors.accent;

  return (
    <View style={{ alignItems: 'center' }}>
      {!!label && (
        <View style={{
          backgroundColor: 'white', borderRadius: radius.sm,
          paddingHorizontal: 6, paddingVertical: 2, marginBottom: 3,
          borderWidth: 1, borderColor: colors.border,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: colors.text }} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
      <View style={{
        width: 22, height: 22, borderRadius: 11, backgroundColor: tone,
        borderWidth: 3, borderColor: 'white',
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 }, elevation: 3,
      }} />
      {/* Stem, so the dot points at the coordinate rather than hovering. */}
      <View style={{ width: 2, height: 8, backgroundColor: tone, marginTop: -1 }} />
    </View>
  );
}

/**
 * Quietens the basemap: business pins and transit clutter compete with the
 * pickup and drop markers, which are the only things that matter here.
 * Ignored by Apple Maps, which is fine — it is already sparser.
 */
const MAP_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

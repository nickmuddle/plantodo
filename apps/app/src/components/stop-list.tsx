import type { Card as TripCard, Stop } from '@plantodo/domain';
import { Link } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Heading } from '@/components/ui';
import { space, useTheme } from '@/lib/theme';

interface StopListProps {
  tripId: string;
  stops: Stop<TripCard>[];
  /** Highlighted stop, e.g. the marker last tapped on the map. */
  selectedPlaceId?: string | null;
  /** Offer a button that opens each place in the device's maps app. */
  openInMaps?: boolean;
}

export function mapsUrl(stop: Stop<TripCard>): string {
  const { lat, lng, provider, provider_place_id } = stop.place;
  const place = provider === 'google' && provider_place_id ? `&query_place_id=${provider_place_id}` : '';
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}${place}`;
}

/** The plan's places, numbered to match the map, each with the cards there. */
export function StopList({ tripId, stops, selectedPlaceId, openInMaps }: StopListProps) {
  const theme = useTheme();
  return (
    <>
      {stops.map((stop, index) => (
        <Card
          key={stop.place.id}
          style={stop.place.id === selectedPlaceId ? { borderColor: theme.primary, borderWidth: 2 } : null}>
          <View style={styles.header}>
            <View style={[styles.number, { backgroundColor: theme.primary }]}>
              <Text style={[styles.numberText, { color: theme.onPrimary }]}>{index + 1}</Text>
            </View>
            <View style={styles.headerText}>
              <Heading>{stop.place.name}</Heading>
              {stop.place.address ? <Body tone="muted">{stop.place.address}</Body> : null}
            </View>
          </View>
          {stop.cards.map((card) => (
            <Link key={card.id} href={`/trips/${tripId}/cards/${card.id}`} asChild>
              <Pressable accessibilityRole="link" style={styles.card}>
                <Body style={{ color: theme.primary }}>{card.title}</Body>
              </Pressable>
            </Link>
          ))}
          {openInMaps ? (
            <Button
              compact
              variant="secondary"
              label="Open in Maps"
              accessibilityLabel={`Open ${stop.place.name} in Maps`}
              onPress={() => Linking.openURL(mapsUrl(stop))}
            />
          ) : null}
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  headerText: { flex: 1 },
  number: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 14, fontWeight: '700' },
  card: { minHeight: 44, justifyContent: 'center' },
});

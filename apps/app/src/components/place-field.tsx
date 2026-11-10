import type { Place } from '@plantodo/domain';
import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Field } from '@/components/ui';
import { errorMessage, type PlaceSuggestion, searchPlaces, useAddPlace } from '@/lib/api';
import { radius, space, useTheme } from '@/lib/theme';

interface PlaceFieldProps {
  label: string;
  tripId: string;
  /** The trip's saved places. */
  places: readonly Place[];
  value: string | null;
  onChange: (placeId: string | null) => void;
  disabled?: boolean;
}

/** Shows a card's place, or a search box to find one. */
export function PlaceField({ label, tripId, places, value, onChange, disabled }: PlaceFieldProps) {
  const theme = useTheme();
  const addPlace = useAddPlace(tripId);
  const [query, setQuery] = useState('');
  // Results are kept with the text they answer, so stale ones are never shown.
  const [results, setResults] = useState<{ input: string; items: PlaceSuggestion[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One token per search, from first keystroke to pick.
  const session = useRef(Crypto.randomUUID());

  const input = query.trim();
  const suggestions = results?.input === input ? results.items : null;
  const near = places[0] ? { lat: places[0].lat, lng: places[0].lng } : undefined;
  const nearKey = near ? `${near.lat},${near.lng}` : '';

  useEffect(() => {
    if (input.length < 2) return;
    let cancelled = false;
    // Wait for a pause in typing before searching.
    const timer = setTimeout(() => {
      searchPlaces({ input, sessionToken: session.current, near })
        .then((items) => {
          if (cancelled) return;
          setResults({ input, items });
          setError(null);
        })
        .catch((failure) => {
          if (cancelled) return;
          setError(errorMessage(failure));
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `near` is rebuilt every render; `nearKey` stands in for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, nearKey]);

  const pick = (suggestion: PlaceSuggestion) => {
    addPlace.mutate(
      { providerPlaceId: suggestion.provider_place_id, sessionToken: session.current },
      {
        onSuccess: (place) => {
          onChange(place.id);
          setQuery('');
          setResults(null);
          session.current = Crypto.randomUUID();
        },
      },
    );
  };

  const selected = places.find((place) => place.id === value);

  if (selected) {
    return (
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
        <View style={[styles.selected, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.selectedText}>
            <Body>{selected.name}</Body>
            {selected.address ? <Body tone="muted">{selected.address}</Body> : null}
          </View>
          {disabled ? null : (
            <Button
              compact
              variant="secondary"
              label="Remove"
              accessibilityLabel={`Remove ${label.toLowerCase()}: ${selected.name}`}
              onPress={() => onChange(null)}
            />
          )}
        </View>
      </View>
    );
  }

  if (disabled) {
    return (
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
        <Body tone="muted">None</Body>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Field
        label={label}
        value={query}
        onChangeText={setQuery}
        placeholder="Search for a place"
        autoCorrect={false}
      />
      {suggestions?.length === 0 ? <Body tone="muted">No places found.</Body> : null}
      {suggestions && suggestions.length > 0 ? (
        <View style={[styles.results, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.provider_place_id}
              accessibilityRole="button"
              accessibilityLabel={[suggestion.name, suggestion.description].filter(Boolean).join(', ')}
              disabled={addPlace.isPending}
              onPress={() => pick(suggestion)}
              style={({ pressed }) => [styles.result, pressed && { opacity: 0.6 }]}>
              <Body>{suggestion.name}</Body>
              {suggestion.description ? <Body tone="muted">{suggestion.description}</Body> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {error ? <Body tone="danger">{error}</Body> : null}
      {addPlace.isError ? <Body tone="danger">{errorMessage(addPlace.error)}</Body> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  label: { fontSize: 14, fontWeight: '600' },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius,
    padding: space.md,
  },
  selectedText: { flex: 1 },
  results: { borderWidth: 1, borderRadius: radius, overflow: 'hidden' },
  result: { minHeight: 48, paddingHorizontal: space.md, paddingVertical: space.sm, justifyContent: 'center' },
});

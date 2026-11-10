/// <reference types="google.maps" />
import { type Card as TripCard, type Stop, stopsOf } from '@plantodo/domain';
import { useEffect, useRef, useState } from 'react';

import type { PlanMapProps } from '@/components/plan-map';
import { StopList } from '@/components/stop-list';
import { Body } from '@/components/ui';
import { radius } from '@/lib/theme';

const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;

let loading: Promise<void> | null = null;

/** Loads the Google Maps script once per page. */
function loadGoogleMaps(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const callback = '__plantodoMapsReady';
    (window as unknown as Record<string, () => void>)[callback] = () => resolve();
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key ?? '')}&v=weekly&loading=async&callback=${callback}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('The map could not be loaded.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function PlanMap({ tripId, cards, places }: PlanMapProps) {
  const stops = stopsOf(cards, places);
  const [selected, setSelected] = useState<string | null>(null);

  if (stops.length === 0) return <Body tone="muted">No cards have a place yet.</Body>;

  return (
    <>
      {key ? (
        <GoogleMap stops={stops} onSelect={setSelected} />
      ) : (
        <Body tone="muted">
          The map is not set up: this build has no EXPO_PUBLIC_GOOGLE_MAPS_KEY.
        </Body>
      )}
      <StopList tripId={tripId} stops={stops} selectedPlaceId={selected} openInMaps={!key} />
    </>
  );
}

function GoogleMap({ stops, onSelect }: { stops: Stop<TripCard>[]; onSelect: (placeId: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(
      () => !cancelled && setReady(true),
      (failure: Error) => !cancelled && setError(failure.message),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Redraw markers only when the set of places or their positions change.
  const signature = stops.map((s) => `${s.place.id}:${s.place.lat},${s.place.lng}`).join('|');

  useEffect(() => {
    if (!ready || !container.current) return;
    map.current ??= new google.maps.Map(container.current, {
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    for (const marker of markers.current) marker.setMap(null);
    const bounds = new google.maps.LatLngBounds();
    markers.current = stops.map((stop, index) => {
      const position = { lat: stop.place.lat, lng: stop.place.lng };
      bounds.extend(position);
      const marker = new google.maps.Marker({
        map: map.current,
        position,
        title: stop.place.name,
        label: String(index + 1),
      });
      marker.addListener('click', () => onSelect(stop.place.id));
      return marker;
    });

    if (stops.length === 1) {
      map.current.setCenter(bounds.getCenter());
      map.current.setZoom(15);
    } else {
      map.current.fitBounds(bounds, 48);
    }
    // `stops` and `onSelect` are captured through `signature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature]);

  if (error) return <Body tone="danger">{error}</Body>;

  return (
    <div
      ref={container}
      role="application"
      aria-label="Map of the places in this trip"
      style={{ height: 360, borderRadius: radius, overflow: 'hidden' }}
    />
  );
}

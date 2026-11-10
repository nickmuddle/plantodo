import { z } from 'zod';
import { Id, Timestamp } from './primitives';

export const PLACE_PROVIDERS = ['google', 'mapbox', 'osm'] as const;
export const PlaceProvider = z.enum(PLACE_PROVIDERS);
export type PlaceProvider = z.infer<typeof PlaceProvider>;

/**
 * A real-world location, independent of any plan to go there. Cards point at
 * places; routing and "what's nearby" operate on places, not cards.
 *
 * Places belong to one trip. When a place comes from a provider we keep the
 * provider's id so details can be refreshed instead of stored long-term.
 */
const placeFields = {
  id: Id,
  trip_id: Id,
  name: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().max(500).nullable(),
  provider: PlaceProvider.nullable(),
  provider_place_id: z.string().min(1).max(500).nullable(),
};

function providerIsPaired(place: { provider: unknown; provider_place_id: unknown }): boolean {
  return (place.provider === null) === (place.provider_place_id === null);
}
const providerMessage = {
  error: 'provider and provider_place_id must be set together',
  path: ['provider_place_id'],
};

export const Place = z
  .object({ ...placeFields, created_by: Id, created_at: Timestamp, updated_at: Timestamp })
  .refine(providerIsPaired, providerMessage);
export type Place = z.infer<typeof Place>;

export const PlaceInsert = z.object(placeFields).refine(providerIsPaired, providerMessage);
export type PlaceInsert = z.infer<typeof PlaceInsert>;

import { type Card as TripCard, type Place, stopsOf } from '@plantodo/domain';

import { StopList } from '@/components/stop-list';
import { Body } from '@/components/ui';

export interface PlanMapProps {
  tripId: string;
  cards: TripCard[];
  places: Place[];
}

// Phones: the plan's places as a list, each opening in the device's maps app.
// The web build (plan-map.web.tsx) draws them on a map as well.
export function PlanMap({ tripId, cards, places }: PlanMapProps) {
  const stops = stopsOf(cards, places);
  if (stops.length === 0) return <Body tone="muted">No cards have a place yet.</Body>;
  return <StopList tripId={tripId} stops={stops} openInMaps />;
}

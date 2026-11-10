import { canEdit } from '@plantodo/domain';

import { useCards, useMembers, usePlaces, useTrip } from './api';
import { useUserId } from './session';

/** Everything a trip screen needs: the trip, its cards, and what this user may do. */
export function useTripAccess(tripId: string) {
  const userId = useUserId();
  const trip = useTrip(tripId);
  const members = useMembers(tripId);
  const cards = useCards(tripId);
  const places = usePlaces(tripId);

  const role = members.data?.find((member) => member.user_id === userId)?.role;

  return {
    isPending: trip.isPending || members.isPending || cards.isPending || places.isPending,
    error: trip.error ?? members.error ?? cards.error ?? places.error,
    trip: trip.data ?? null,
    cards: cards.data ?? [],
    places: places.data ?? [],
    memberCount: members.data?.length ?? 0,
    canEdit: role ? canEdit(role) : false,
  };
}

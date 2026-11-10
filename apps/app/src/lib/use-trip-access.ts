import { canEdit } from '@plantodotdo/domain';

import { useCards, useMembers, useTrip } from './api';
import { useUserId } from './session';

/** Everything a trip screen needs: the trip, its cards, and what this user may do. */
export function useTripAccess(tripId: string) {
  const userId = useUserId();
  const trip = useTrip(tripId);
  const members = useMembers(tripId);
  const cards = useCards(tripId);

  const role = members.data?.find((member) => member.user_id === userId)?.role;

  return {
    isPending: trip.isPending || members.isPending || cards.isPending,
    error: trip.error ?? members.error ?? cards.error,
    trip: trip.data ?? null,
    cards: cards.data ?? [],
    memberCount: members.data?.length ?? 0,
    canEdit: role ? canEdit(role) : false,
  };
}

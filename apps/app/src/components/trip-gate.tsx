import type { Card, Place, Trip } from '@plantodo/domain';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { Body, Button, Loading, Screen, Title } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useTripAccess } from '@/lib/use-trip-access';

interface Loaded {
  trip: Trip;
  cards: Card[];
  places: Place[];
  memberCount: number;
  canEdit: boolean;
}

/** Loads a trip and handles loading, failure and "not a member" for its screens. */
export function TripGate({ tripId, children }: { tripId: string; children: (loaded: Loaded) => ReactNode }) {
  const router = useRouter();
  const access = useTripAccess(tripId);

  if (access.isPending) return <Loading />;

  if (access.error) {
    return (
      <Screen>
        <Body tone="danger">{errorMessage(access.error)}</Body>
      </Screen>
    );
  }

  if (!access.trip) {
    return (
      <Screen>
        <Title>Trip not found</Title>
        <Body tone="muted">It may have been deleted, or you may not be a member.</Body>
        <Button label="Back to trips" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return children({
    trip: access.trip,
    cards: access.cards,
    places: access.places,
    memberCount: access.memberCount,
    canEdit: access.canEdit,
  });
}

import { Stack, useLocalSearchParams } from 'expo-router';

import { CardEditor } from '@/components/card-editor';
import { TripGate } from '@/components/trip-gate';
import { Body, Screen, Title } from '@/components/ui';

export default function EditCard() {
  const { id, cardId } = useLocalSearchParams<{ id: string; cardId: string }>();

  return (
    <TripGate tripId={id}>
      {({ trip, cards, places, canEdit }) => {
        const card = cards.find((candidate) => candidate.id === cardId);
        if (!card) {
          return (
            <Screen>
              <Title>Card not found</Title>
              <Body tone="muted">Someone may have deleted it.</Body>
            </Screen>
          );
        }
        return (
          <>
            <Stack.Screen options={{ title: card.title }} />
            {/* Keyed so the form resets if another card is opened in place. */}
            <CardEditor key={card.id} trip={trip} cards={cards} places={places} existing={card} readOnly={!canEdit} />
          </>
        );
      }}
    </TripGate>
  );
}

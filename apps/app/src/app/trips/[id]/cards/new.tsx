import { CardKind, LocalDate } from '@plantodo/domain';
import { useLocalSearchParams } from 'expo-router';

import { CardEditor } from '@/components/card-editor';
import { TripGate } from '@/components/trip-gate';
import { Body, Screen } from '@/components/ui';

export default function NewCard() {
  const params = useLocalSearchParams<{ id: string; kind?: string; date?: string }>();
  const kind = CardKind.safeParse(params.kind);
  const date = LocalDate.safeParse(params.date);

  return (
    <TripGate tripId={params.id}>
      {({ trip, cards, canEdit }) =>
        canEdit ? (
          <CardEditor
            trip={trip}
            cards={cards}
            initialKind={kind.success ? kind.data : undefined}
            initialDate={date.success ? date.data : null}
            readOnly={false}
          />
        ) : (
          <Screen>
            <Body tone="muted">You can view this trip but not add to it.</Body>
          </Screen>
        )
      }
    </TripGate>
  );
}

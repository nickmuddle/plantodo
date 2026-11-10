import { useRouter } from 'expo-router';
import { useState } from 'react';

import { DateField } from '@/components/date-field';
import { Body, Button, Field, Screen } from '@/components/ui';
import { errorMessage, useCreateTrip } from '@/lib/api';

export default function NewTrip() {
  const router = useRouter();
  const createTrip = useCreateTrip();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (start && end && end < start) {
      setError('The trip ends before it starts.');
      return;
    }
    if (end && !start) {
      setError('Add a start date, or clear the end date.');
      return;
    }
    setError(null);
    createTrip.mutate(
      { title, start_date: start, end_date: end },
      { onSuccess: (trip) => router.replace(`/trips/${trip.id}`) },
    );
  };

  return (
    <Screen>
      <Field label="Name" value={title} onChangeText={setTitle} placeholder="Lisbon in spring" autoFocus />
      <DateField label="Start date" value={start} onChange={setStart} />
      <DateField label="End date" value={end} onChange={setEnd} openAt={start} />
      <Body tone="muted">Dates are optional. You can add them later.</Body>
      {error ? <Body tone="danger">{error}</Body> : null}
      {createTrip.isError ? <Body tone="danger">{errorMessage(createTrip.error)}</Body> : null}
      <Button
        label="Create trip"
        onPress={submit}
        busy={createTrip.isPending}
        disabled={!title.trim()}
      />
    </Screen>
  );
}

import { LocalDate } from '@plantodotdo/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Body, Button, Field, Screen } from '@/components/ui';
import { errorMessage, useCreateTrip } from '@/lib/api';

/** Empty input means "no date"; anything else must be a real YYYY-MM-DD date. */
function parseDate(text: string): { ok: true; value: string | null } | { ok: false } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };
  const parsed = LocalDate.safeParse(trimmed);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
}

export default function NewTrip() {
  const router = useRouter();
  const createTrip = useCreateTrip();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    if (!startDate.ok || !endDate.ok) {
      setError('Dates need to look like 2027-03-14.');
      return;
    }
    if (startDate.value && endDate.value && endDate.value < startDate.value) {
      setError('The trip ends before it starts.');
      return;
    }
    setError(null);
    createTrip.mutate(
      { title, start_date: startDate.value, end_date: endDate.value },
      { onSuccess: (trip) => router.replace(`/trips/${trip.id}`) },
    );
  };

  return (
    <Screen>
      <Field label="Name" value={title} onChangeText={setTitle} placeholder="Lisbon in spring" autoFocus />
      <Field
        label="Start date"
        value={start}
        onChangeText={setStart}
        placeholder="YYYY-MM-DD"
        hint="Optional. You can add dates later."
        autoCapitalize="none"
      />
      <Field label="End date" value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" autoCapitalize="none" />
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

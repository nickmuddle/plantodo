import {
  CARD_KINDS,
  CARD_STATUSES,
  type Card,
  type CardKind,
  MEALS,
  nextSortKey,
  TRANSPORT_MODES,
  type Trip,
} from '@plantodotdo/domain';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Choice } from '@/components/choice';
import { DateField } from '@/components/date-field';
import { Body, Button, Field, Screen } from '@/components/ui';
import { errorMessage, useCreateCard, useDeleteCard, useUpdateCard } from '@/lib/api';
import { buildCard, type CardDraft, draftFromCard, emptyDraft } from '@/lib/card-draft';
import { confirm } from '@/lib/confirm';
import { kindLabel, mealLabel, modeLabel, statusLabel } from '@/lib/format';

interface CardEditorProps {
  trip: Trip;
  /** All of the trip's cards, used to place a new one at the end. */
  cards: Card[];
  /** The card being edited; absent when creating. */
  existing?: Card;
  initialKind?: CardKind;
  initialDate?: string | null;
  /** Viewers see the same form with nothing editable. */
  readOnly: boolean;
}

export function CardEditor(props: CardEditorProps) {
  const { trip, cards, existing, readOnly } = props;
  const router = useRouter();
  const create = useCreateCard(trip.id);
  const update = useUpdateCard(trip.id);
  const remove = useDeleteCard(trip.id);
  const [draft, setDraft] = useState<CardDraft>(() =>
    existing
      ? draftFromCard(existing)
      : emptyDraft(props.initialKind ?? 'do', props.initialDate ?? null),
  );
  const [errors, setErrors] = useState<string[]>([]);

  const set = <K extends keyof CardDraft>(key: K, value: CardDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const text = (key: keyof CardDraft) => ({
    value: draft[key] as string,
    onChangeText: (value: string) => set(key, value as never),
    editable: !readOnly,
  });

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/trips/${trip.id}`));

  const save = () => {
    const built = buildCard(draft, {
      id: existing?.id ?? Crypto.randomUUID(),
      trip_id: trip.id,
      timezone: trip.timezone,
      sort_key: existing?.sort_key ?? nextSortKey(cards),
      existing,
    });
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors([]);
    if (existing) update.mutate({ before: existing, after: built.card }, { onSuccess: close });
    else create.mutate(built.card, { onSuccess: close });
  };

  const destroy = async () => {
    if (!existing) return;
    if (await confirm('Delete this card?', 'This cannot be undone.', 'Delete')) {
      remove.mutate(existing.id, { onSuccess: close });
    }
  };

  const failure = create.error ?? update.error ?? remove.error;
  const calendarStart = draft.start_date ?? trip.start_date;

  return (
    <Screen>
      <Choice
        label="Kind"
        options={CARD_KINDS}
        labels={kindLabel}
        value={draft.kind}
        onChange={(kind) => set('kind', kind)}
        disabled={readOnly}
      />
      <Field label="Title" {...text('title')} autoFocus={!existing && !readOnly} maxLength={200} />

      {draft.kind === 'transport' ? (
        <Choice
          label="How"
          options={TRANSPORT_MODES}
          labels={modeLabel}
          value={draft.mode}
          onChange={(mode) => set('mode', mode)}
          disabled={readOnly}
        />
      ) : null}
      {draft.kind === 'eat' ? (
        <Choice
          label="Meal"
          options={MEALS}
          labels={mealLabel}
          value={draft.meal}
          onChange={(meal) => set('meal', meal)}
          onClear={() => set('meal', null)}
          disabled={readOnly}
        />
      ) : null}

      <Choice
        label="Status"
        options={CARD_STATUSES}
        labels={statusLabel}
        value={draft.status}
        onChange={(status) => set('status', status)}
        disabled={readOnly}
      />

      <DateField
        label={draft.kind === 'stay' ? 'Check-in date' : 'Date'}
        value={draft.start_date}
        onChange={(date) => set('start_date', date)}
        openAt={calendarStart}
        disabled={readOnly}
      />
      <Field
        label={draft.kind === 'stay' ? 'Check-in time' : 'Start time'}
        {...text('start_time')}
        placeholder="19:30"
        autoCapitalize="none"
      />
      {draft.kind === 'stay' || draft.kind === 'transport' || draft.end_date ? (
        <DateField
          label={draft.kind === 'stay' ? 'Check-out date' : 'End date'}
          value={draft.end_date}
          onChange={(date) => set('end_date', date)}
          openAt={calendarStart}
          disabled={readOnly}
        />
      ) : null}
      <Field
        label={draft.kind === 'stay' ? 'Check-out time' : 'End time'}
        {...text('end_time')}
        placeholder="21:00"
        autoCapitalize="none"
      />

      {draft.kind === 'eat' ? (
        <>
          <Field label="Cuisine" {...text('cuisine')} />
          <Field label="Party size" {...text('party_size')} keyboardType="number-pad" />
        </>
      ) : null}
      {draft.kind === 'do' ? <Field label="Category" {...text('category')} placeholder="Museum, hike, show" /> : null}
      {draft.kind === 'transport' ? (
        <>
          <Field label="Carrier" {...text('carrier')} placeholder="Airline or operator" />
          <Field label="Flight or service number" {...text('service_number')} autoCapitalize="characters" />
        </>
      ) : null}
      {draft.kind !== 'note' ? (
        <Field label="Booking reference" {...text('confirmation_code')} autoCapitalize="characters" />
      ) : null}

      <Field label="Link" {...text('url')} placeholder="https://" autoCapitalize="none" keyboardType="url" />
      <Field
        label="Notes"
        {...text('notes')}
        multiline
        style={{ minHeight: 96, paddingVertical: 12, textAlignVertical: 'top' }}
      />

      {errors.map((error) => (
        <Body key={error} tone="danger">
          {error}
        </Body>
      ))}
      {failure ? <Body tone="danger">{errorMessage(failure)}</Body> : null}

      {readOnly ? null : (
        <>
          <Button
            label={existing ? 'Save changes' : 'Add card'}
            onPress={save}
            busy={create.isPending || update.isPending}
          />
          {existing ? (
            <Button label="Delete card" variant="danger" onPress={destroy} busy={remove.isPending} />
          ) : null}
        </>
      )}
    </Screen>
  );
}

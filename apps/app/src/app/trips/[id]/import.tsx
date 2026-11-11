import {
  type Card as TripCard,
  IMPORT_MAX_CHARS,
  IMPORT_MAX_PLACE_LOOKUPS,
  type ImportDraftItem,
  importItemDate,
  needsStartDate,
  type Place,
  planPlaceLookups,
  type SkippedImportItem,
  type Trip,
} from '@plantodo/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { TripGate } from '@/components/trip-gate';
import { Body, Button, Card, Checkbox, Field, Heading, Screen } from '@/components/ui';
import { errorMessage, useConfirmImport, useImportItinerary } from '@/lib/api';
import { formatDate, kindLabel } from '@/lib/format';
import { space, useTheme } from '@/lib/theme';

export default function ImportItinerary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <TripGate tripId={id}>
      {({ trip, cards, places, canEdit }) =>
        canEdit ? (
          <ImportFlow trip={trip} cards={cards} places={places} />
        ) : (
          <Screen>
            <Body tone="muted">You can view this trip but not add to it.</Body>
          </Screen>
        )
      }
    </TripGate>
  );
}

/** One draft on the review screen: the item, whether it is kept, and its edited title. */
interface Row {
  item: ImportDraftItem;
  kept: boolean;
  title: string;
}

interface Review {
  runId: string;
  rows: Row[];
}

function ImportFlow({ trip, cards, places }: { trip: Trip; cards: TripCard[]; places: Place[] }) {
  const router = useRouter();
  const importItinerary = useImportItinerary(trip.id);
  const confirmImport = useConfirmImport(trip.id);
  const [text, setText] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<SkippedImportItem[] | null>(null);
  const [added, setAdded] = useState(0);

  const backToTrip = () => router.replace(`/trips/${trip.id}`);

  // --- Afterwards, only when something could not be added ---------------------
  if (skipped) {
    return (
      <Screen>
        <Heading>{added === 1 ? 'Added 1 card' : `Added ${added} cards`}</Heading>
        <Body>
          {skipped.length === 1 ? 'One item' : `${skipped.length} items`} couldn’t be added:
        </Body>
        {skipped.map((entry, index) => (
          <Body key={index} tone="muted">
            {entry.title}
          </Body>
        ))}
        <Button label="Back to trip" onPress={backToTrip} />
      </Screen>
    );
  }

  // --- Paste ------------------------------------------------------------------
  if (!review) {
    const length = text.trim().length;
    const tooLong = length > IMPORT_MAX_CHARS;
    const submit = () =>
      importItinerary.mutate(text, {
        onSuccess: ({ drafts, runId }) =>
          setReview({
            runId,
            rows: drafts.map((item) => ({ item, kept: true, title: item.title })),
          }),
      });

    return (
      <Screen>
        <Body>
          Paste a plan from ChatGPT, Gemini, Claude or anywhere else. You’ll review everything
          before it’s added to the trip.
        </Body>
        <Field
          label="Itinerary"
          value={text}
          onChangeText={setText}
          multiline
          placeholder="Day 1: arrive, check in at…"
          style={styles.paste}
          editable={!importItinerary.isPending}
        />
        <Body tone={tooLong ? 'danger' : 'muted'}>
          {tooLong
            ? `That is ${length.toLocaleString()} characters. The limit is ${IMPORT_MAX_CHARS.toLocaleString()}; try importing it in parts.`
            : 'The text is sent to an AI model to be read. It isn’t stored.'}
        </Body>
        {importItinerary.isError ? (
          <Body tone="danger">{errorMessage(importItinerary.error)}</Body>
        ) : null}
        <Button
          label="Import"
          onPress={submit}
          busy={importItinerary.isPending}
          disabled={length === 0 || tooLong}
        />
      </Screen>
    );
  }

  // --- Nothing found ----------------------------------------------------------
  if (review.rows.length === 0) {
    return (
      <Screen>
        <Heading>Nothing to import</Heading>
        <Body>
          We couldn’t find any places, meals, activities or journeys in that text. Try pasting the
          itinerary itself.
        </Body>
        <Button label="Try again" onPress={() => setReview(null)} />
      </Screen>
    );
  }

  // --- Review -----------------------------------------------------------------
  const { rows } = review;
  const update = (index: number, change: Partial<Row>) =>
    setReview({ ...review, rows: rows.map((row, i) => (i === index ? { ...row, ...change } : row)) });

  const kept = rows.filter((row) => row.kept && row.title.trim());
  const effectiveStart = trip.start_date ?? startDate;
  const askForStart = !trip.start_date && needsStartDate(rows.map((row) => row.item));
  const placesWanted = planPlaceLookups(
    kept.map((row) => row.item),
    Number.POSITIVE_INFINITY,
  ).length;

  // Group by day in the order the plan gives them.
  const groups: { key: string; label: string; indexes: number[] }[] = [];
  rows.forEach(({ item }, index) => {
    const date = importItemDate(item, effectiveStart);
    const key = date ?? (item.day !== null ? `day-${item.day}` : 'none');
    const label = date
      ? formatDate(date, false)
      : item.day !== null
        ? `Day ${item.day}`
        : 'No day';
    const group = groups.find((candidate) => candidate.key === key);
    if (group) group.indexes.push(index);
    else groups.push({ key, label, indexes: [index] });
  });

  const confirm = () =>
    confirmImport.mutate(
      {
        items: kept.map((row) => ({ ...row.item, title: row.title.trim().slice(0, 200) })),
        runId: review.runId,
        trip,
        startDate,
        places,
        cards,
      },
      {
        onSuccess: (result) => {
          if (result.skipped.length === 0) backToTrip();
          else {
            setAdded(result.added);
            setSkipped(result.skipped);
          }
        },
      },
    );

  return (
    <Screen>
      <Body>
        {rows.length === 1 ? 'Found 1 item.' : `Found ${rows.length} items.`} Untick anything you
        don’t want. Nothing is added until you confirm.
      </Body>

      {askForStart ? (
        <Card>
          <DateField
            label="Trip start date"
            value={startDate}
            onChange={setStartDate}
            disabled={confirmImport.isPending}
          />
          <Body tone="muted">
            Optional. The plan counts in days; with a start date its cards go on the right dates.
            Without one they are added with no date.
          </Body>
        </Card>
      ) : null}

      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <Heading>{group.label}</Heading>
          {group.indexes.map((index) => (
            <DraftRow
              key={index}
              row={rows[index]!}
              onChange={(change) => update(index, change)}
              disabled={confirmImport.isPending}
            />
          ))}
        </View>
      ))}

      {placesWanted > IMPORT_MAX_PLACE_LOOKUPS ? (
        <Body tone="muted">
          Only the first {IMPORT_MAX_PLACE_LOOKUPS} places will be looked up. Other cards are added
          without a place, which you can add later.
        </Body>
      ) : null}
      {confirmImport.isError ? (
        <Body tone="danger">{errorMessage(confirmImport.error)}</Body>
      ) : null}

      <Button
        label={kept.length === 1 ? 'Add 1 card' : `Add ${kept.length} cards`}
        onPress={confirm}
        busy={confirmImport.isPending}
        disabled={kept.length === 0}
      />
      <Button
        label="Start over"
        variant="secondary"
        onPress={() => setReview(null)}
        disabled={confirmImport.isPending}
      />
    </Screen>
  );
}

function DraftRow(props: { row: Row; onChange: (change: Partial<Row>) => void; disabled: boolean }) {
  const { row, onChange, disabled } = props;
  const theme = useTheme();
  const { item } = row;
  const time = item.start_time
    ? item.end_time
      ? `${item.start_time} to ${item.end_time}`
      : item.start_time
    : null;
  const where =
    item.place_query && item.end_place_query
      ? `${item.place_query} to ${item.end_place_query}`
      : (item.place_query ?? item.end_place_query);
  const facts = [kindLabel[item.kind], time, where].filter(Boolean).join(' · ');

  return (
    <Card style={[styles.row, !row.kept && { opacity: 0.55 }]}>
      <Checkbox
        checked={row.kept}
        onChange={(kept) => onChange({ kept })}
        label={`Include ${row.title || item.title}`}
      />
      <View style={styles.rowBody}>
        <TextInput
          accessibilityLabel={`Title of ${item.title}`}
          value={row.title}
          onChangeText={(title) => onChange({ title })}
          editable={!disabled && row.kept}
          maxLength={200}
          style={[styles.title, { color: theme.text, borderColor: theme.border }]}
        />
        <Body tone="muted">{facts}</Body>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  paste: { minHeight: 220, paddingVertical: 12, textAlignVertical: 'top' },
  group: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.sm },
  rowBody: { flex: 1, gap: space.xs, paddingRight: space.sm },
  title: {
    minHeight: 44,
    fontSize: 17,
    fontWeight: '600',
    borderBottomWidth: 1,
    paddingVertical: space.xs,
  },
});

import {
  type Card as TripCard,
  compareByOrder,
  groupByDay,
  groupByKind,
  isInPlan,
  planMove,
} from '@plantodotdo/domain';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Choice } from '@/components/choice';
import { TripGate } from '@/components/trip-gate';
import { Body, Button, Card, Heading, Row, Screen, Title } from '@/components/ui';
import { errorMessage, useReorderCards } from '@/lib/api';
import {
  formatCardDetails,
  formatCardWhen,
  formatDate,
  formatTripDates,
  kindLabel,
  kindPlural,
  statusLabel,
} from '@/lib/format';
import { space, useTheme } from '@/lib/theme';

const VIEWS = ['day', 'kind'] as const;
type View_ = (typeof VIEWS)[number];
const viewLabel: Record<View_, string> = { day: 'By day', kind: 'By kind' };

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<View_>('day');
  const reorder = useReorderCards(id);

  return (
    <TripGate tripId={id}>
      {({ trip, cards, memberCount, canEdit }) => {
        const plan = cards.filter(isInPlan);
        const addHref = (date?: string | null) =>
          `/trips/${id}/cards/new${date ? `?date=${date}` : ''}` as const;

        // A group can be reordered by hand where it is shown in manual order.
        const group = (key: string, title: string, list: TripCard[], date?: string | null) => {
          const manual = list.filter((card) => view === 'kind' || !card.start_time);
          return (
            <View key={key} style={styles.group}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Heading>{title}</Heading>
                {canEdit && view === 'day' ? (
                  <Button
                    compact
                    variant="secondary"
                    label="Add"
                    accessibilityLabel={`Add a card to ${title}`}
                    onPress={() => router.push(addHref(date))}
                  />
                ) : null}
              </Row>
              {list.length === 0 ? <Body tone="muted">Nothing planned.</Body> : null}
              {list.map((card) => {
                const position = manual.indexOf(card);
                const move = (to: number) => reorder.mutate(planMove(manual, position, to));
                return (
                  <CardTile
                    key={card.id}
                    card={card}
                    tripId={id}
                    showKind={view === 'day'}
                    showDate={view === 'kind' || date === null}
                    onMoveUp={canEdit && position > 0 ? () => move(position - 1) : undefined}
                    onMoveDown={
                      canEdit && position >= 0 && position < manual.length - 1
                        ? () => move(position + 1)
                        : undefined
                    }
                  />
                );
              })}
            </View>
          );
        };

        return (
          <Screen>
            <Stack.Screen options={{ title: trip.title }} />
            <Title>{trip.title}</Title>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body tone="muted">{formatTripDates(trip)}</Body>
              <Button
                compact
                variant="secondary"
                label={memberCount === 1 ? '1 person' : `${memberCount} people`}
                onPress={() => router.push(`/trips/${id}/people`)}
              />
            </Row>

            {canEdit ? <Button label="Add card" onPress={() => router.push(addHref())} /> : null}

            {plan.length === 0 ? (
              <Card>
                <Heading>Nothing here yet</Heading>
                <Body tone="muted">
                  {canEdit
                    ? 'Add places to stay, places to eat, things to do and how you’ll get around.'
                    : 'Cards will appear here as people add them.'}
                </Body>
              </Card>
            ) : (
              <Choice label="View" options={VIEWS} labels={viewLabel} value={view} onChange={setView} />
            )}

            {reorder.isError ? <Body tone="danger">{errorMessage(reorder.error)}</Body> : null}

            {plan.length === 0
              ? null
              : view === 'day'
                ? groupByDay(plan, trip).map(({ date, cards: list }) =>
                    group(date ?? 'unscheduled', date ? formatDate(date, false) : 'No date yet', list, date),
                  )
                : groupByKind([...plan].sort(compareByOrder)).map(({ kind, cards: list }) =>
                    group(kind, kindPlural[kind], list),
                  )}
          </Screen>
        );
      }}
    </TripGate>
  );
}

interface CardTileProps {
  card: TripCard;
  tripId: string;
  showKind: boolean;
  showDate: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function CardTile({ card, tripId, showKind, showDate, onMoveUp, onMoveDown }: CardTileProps) {
  const theme = useTheme();
  const when = formatCardWhen(card, showDate);
  const details = formatCardDetails(card);
  const tags = [showKind ? kindLabel[card.kind] : null, statusLabel[card.status]].filter(Boolean);

  return (
    <Card style={styles.tile}>
      <Link href={`/trips/${tripId}/cards/${card.id}`} asChild>
        <Pressable accessibilityRole="link" accessibilityLabel={card.title} style={styles.tileBody}>
          <Text style={[styles.tags, { color: theme.muted }]}>{tags.join(' · ')}</Text>
          <Heading>{card.title}</Heading>
          {when ? <Body>{when}</Body> : null}
          {details ? <Body tone="muted">{details}</Body> : null}
          {card.notes ? (
            <Body tone="muted" numberOfLines={2}>
              {card.notes}
            </Body>
          ) : null}
        </Pressable>
      </Link>
      {onMoveUp || onMoveDown ? (
        <View style={styles.moves}>
          <MoveButton label={`Move ${card.title} up`} symbol="↑" onPress={onMoveUp} />
          <MoveButton label={`Move ${card.title} down`} symbol="↓" onPress={onMoveDown} />
        </View>
      ) : null}
    </Card>
  );
}

function MoveButton({ label, symbol, onPress }: { label: string; symbol: string; onPress?: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.move, { borderColor: theme.border, opacity: onPress ? 1 : 0.3 }]}>
      <Text style={{ color: theme.text, fontSize: 18 }}>{symbol}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tileBody: { flex: 1, gap: space.xs },
  tags: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  moves: { gap: space.xs },
  move: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

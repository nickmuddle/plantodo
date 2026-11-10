import type {
  Card,
  CardKind,
  CardStatus,
  Meal,
  TransportMode,
  Trip,
  TripRole,
} from '@plantodotdo/domain';

/** `2027-03-14` as "Sun 14 Mar 2027", in the reader's language. */
export function formatDate(date: string, withYear = true): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatTripDates(trip: Pick<Trip, 'start_date' | 'end_date'>): string {
  if (!trip.start_date) return 'No dates yet';
  return trip.end_date && trip.end_date !== trip.start_date
    ? `${formatDate(trip.start_date, false)} to ${formatDate(trip.end_date)}`
    : formatDate(trip.start_date);
}

export const roleLabel: Record<TripRole, string> = {
  owner: 'Owner',
  editor: 'Can edit',
  viewer: 'Can view',
};

export function formatExpiry(expiresAt: string, now: Date = new Date()): string {
  const days = Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000);
  return days <= 1 ? 'Expires within a day' : `Expires in ${days} days`;
}

export const kindLabel: Record<CardKind, string> = {
  stay: 'Stay',
  eat: 'Eat',
  do: 'Do',
  transport: 'Travel',
  note: 'Note',
};

export const kindPlural: Record<CardKind, string> = {
  stay: 'Places to stay',
  eat: 'Places to eat',
  do: 'Things to do',
  transport: 'Travel',
  note: 'Notes',
};

export const statusLabel: Record<CardStatus, string> = {
  idea: 'Idea',
  planned: 'Planned',
  booked: 'Booked',
  done: 'Done',
};

export const mealLabel: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  drinks: 'Drinks',
  snack: 'Snack',
};

export const modeLabel: Record<TransportMode, string> = {
  walk: 'Walk',
  bike: 'Bike',
  drive: 'Drive',
  taxi: 'Taxi',
  transit: 'Public transport',
  bus: 'Bus',
  train: 'Train',
  ferry: 'Ferry',
  flight: 'Flight',
  other: 'Other',
};

const time = (value: string) => value.slice(0, 5);

/**
 * When a card happens, for display under its title. `withDate` is false where
 * the surrounding heading already names the start day.
 */
export function formatCardWhen(card: Card, withDate: boolean): string | null {
  if (!card.start_date) return null;
  const start = [withDate ? formatDate(card.start_date, false) : null, card.start_time && time(card.start_time)]
    .filter(Boolean)
    .join(', ');
  const endsLater = card.end_date !== null && card.end_date !== card.start_date;
  const end = [endsLater ? formatDate(card.end_date!, false) : null, card.end_time && time(card.end_time)]
    .filter(Boolean)
    .join(', ');
  if (start && end) return `${start} to ${end}`;
  if (end) return `Until ${end}`;
  return start || null;
}

/** The kind-specific facts worth showing on the card itself. */
export function formatCardDetails(card: Card): string | null {
  const parts: (string | undefined | false)[] = [];
  switch (card.kind) {
    case 'eat':
      parts.push(
        card.details.meal && mealLabel[card.details.meal],
        card.details.cuisine,
        card.details.party_size !== undefined && `Table for ${card.details.party_size}`,
      );
      break;
    case 'transport':
      parts.push(modeLabel[card.details.mode], card.details.carrier, card.details.service_number);
      break;
    case 'do':
      parts.push(card.details.category);
      break;
    case 'stay':
    case 'note':
      break;
  }
  if (card.kind !== 'note' && card.details.confirmation_code) {
    parts.push(`Ref ${card.details.confirmation_code}`);
  }
  const text = parts.filter(Boolean).join(' · ');
  return text || null;
}

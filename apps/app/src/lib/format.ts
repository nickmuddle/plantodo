import type { Trip, TripRole } from '@plantodotdo/domain';

export function formatTripDates(trip: Pick<Trip, 'start_date' | 'end_date'>): string {
  if (!trip.start_date) return 'No dates yet';
  return trip.end_date && trip.end_date !== trip.start_date
    ? `${trip.start_date} to ${trip.end_date}`
    : trip.start_date;
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

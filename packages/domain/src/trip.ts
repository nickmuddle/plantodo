import { z } from 'zod';
import { Id, LocalDate, TimeZone, Timestamp } from './primitives';

export const TRIP_ROLES = ['owner', 'editor', 'viewer'] as const;
export const TripRole = z.enum(TRIP_ROLES);
export type TripRole = z.infer<typeof TripRole>;

const tripFields = {
  id: Id,
  title: z.string().trim().min(1).max(200),
  start_date: LocalDate.nullable(),
  end_date: LocalDate.nullable(),
  /** Default zone for new cards; each scheduled card still stores its own. */
  timezone: TimeZone,
};

function datesInOrder(trip: { start_date: string | null; end_date: string | null }): boolean {
  return !trip.start_date || !trip.end_date || trip.start_date <= trip.end_date;
}
const datesMessage = { error: 'Trip ends before it starts', path: ['end_date'] };

export const Trip = z
  .object({ ...tripFields, created_by: Id, created_at: Timestamp, updated_at: Timestamp })
  .refine(datesInOrder, datesMessage);
export type Trip = z.infer<typeof Trip>;

/** What a client sends to create a trip; the server fills in the rest. */
export const TripInsert = z.object(tripFields).refine(datesInOrder, datesMessage);
export type TripInsert = z.infer<typeof TripInsert>;

export const TripMember = z.object({
  trip_id: Id,
  user_id: Id,
  role: TripRole,
  created_at: Timestamp,
});
export type TripMember = z.infer<typeof TripMember>;

export function canEdit(role: TripRole): boolean {
  return role === 'owner' || role === 'editor';
}

import { z } from 'zod';
import { Id, Timestamp } from './primitives.ts';

/** Imports one person may run in any 24 hours. */
export const IMPORT_DAILY_LIMIT = 10;

/**
 * One itinerary import: who ran it, how big the input was and what came of it.
 * The pasted text itself is never stored.
 */
export const ImportRun = z.object({
  id: Id,
  user_id: Id,
  /** Null once the trip has been deleted. */
  trip_id: Id.nullable(),
  created_at: Timestamp,
  input_chars: z.int().min(1),
  /** Null until the model has answered. */
  drafts_returned: z.int().min(0).nullable(),
  cards_added: z.int().min(0).nullable(),
  places_resolved: z.int().min(0).nullable(),
  model: z.string().min(1),
});
export type ImportRun = z.infer<typeof ImportRun>;

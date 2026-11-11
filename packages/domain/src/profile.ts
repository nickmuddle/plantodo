import { z } from 'zod';
import { Id, Timestamp } from './primitives.ts';

export const DisplayName = z.string().trim().min(1).max(80);

/** How a user appears to the people they share a trip with. */
export const Profile = z.object({
  id: Id,
  display_name: DisplayName,
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Profile = z.infer<typeof Profile>;

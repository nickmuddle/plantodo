import { z } from 'zod';
import { Id, Timestamp } from './primitives';

/**
 * A typed, directed relation between two cards in the same trip, read as
 * "`from_card_id` <relation> `to_card_id`".
 *
 * - `departs_from`: a transport card leaves from the place of another card.
 * - `arrives_at`: a transport card ends at the place of another card.
 *
 * A walk from the hotel to dinner is a transport card with one link of each
 * relation. New relations (alternatives, groupings) are added here.
 */
export const CARD_RELATIONS = ['departs_from', 'arrives_at'] as const;
export const CardRelation = z.enum(CARD_RELATIONS);
export type CardRelation = z.infer<typeof CardRelation>;

const linkFields = {
  id: Id,
  trip_id: Id,
  from_card_id: Id,
  to_card_id: Id,
  relation: CardRelation,
};

function notSelf(link: { from_card_id: string; to_card_id: string }): boolean {
  return link.from_card_id !== link.to_card_id;
}
const selfMessage = { error: 'A card cannot link to itself', path: ['to_card_id'] };

export const CardLink = z
  .object({ ...linkFields, created_by: Id, created_at: Timestamp })
  .refine(notSelf, selfMessage);
export type CardLink = z.infer<typeof CardLink>;

export const CardLinkInsert = z.object(linkFields).refine(notSelf, selfMessage);
export type CardLinkInsert = z.infer<typeof CardLinkInsert>;

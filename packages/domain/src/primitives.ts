import { z } from 'zod';

/** Every entity id is a UUID generated on the client, so rows can be created offline. */
export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

/** Server-assigned instant, as Postgres `timestamptz` serialises it. */
export const Timestamp = z.iso.datetime({ offset: true });

/** Calendar date with no time zone, e.g. `2027-03-14`. */
export const LocalDate = z.iso.date();
export type LocalDate = z.infer<typeof LocalDate>;

/** Wall-clock time with no time zone. Postgres returns `HH:MM:SS`; `HH:MM` is accepted on input. */
export const LocalTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Expected HH:MM or HH:MM:SS');
export type LocalTime = z.infer<typeof LocalTime>;

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** IANA time zone name, e.g. `Europe/Lisbon`. */
export const TimeZone = z.string().refine(isTimeZone, 'Unknown time zone');
export type TimeZone = z.infer<typeof TimeZone>;

export const Url = z.url({ protocol: /^https?$/ });

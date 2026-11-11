import type { LocalDate, TimeZone } from './primitives.ts';

const formatters = new Map<string, Intl.DateTimeFormat>();

/** How far `zone` is ahead of UTC at the given instant, in milliseconds. */
function offsetAt(zone: TimeZone, instant: number): number {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(zone, formatter);
  }
  const part: Record<string, number> = {};
  for (const { type, value } of formatter.formatToParts(new Date(instant))) {
    part[type] = Number(value);
  }
  const wallClock = Date.UTC(
    part.year!,
    part.month! - 1,
    part.day!,
    part.hour!,
    part.minute!,
    part.second!,
  );
  return wallClock - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant (milliseconds since the epoch) at which a wall clock in `zone`
 * reads `date` and `time` (`HH:MM`). Used to compare times in different zones,
 * such as a flight's departure and arrival.
 */
export function zonedInstant(date: LocalDate, time: string, zone: TimeZone): number {
  const asIfUtc = Date.parse(`${date}T${time.slice(0, 5)}:00Z`);
  const first = asIfUtc - offsetAt(zone, asIfUtc);
  // Near a clock change the offset at the guess can differ from the offset at
  // the answer; one correction settles it.
  return asIfUtc - offsetAt(zone, first);
}

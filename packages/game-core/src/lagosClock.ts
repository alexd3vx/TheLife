// The game runs on the real clock in Lagos (West Africa Time, UTC+1, no daylight saving). "Day 1" is 1 January 2026.

const EPOCH = Date.UTC(2026, 0, 1);
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** Minutes since 00:00 on 1 January 2026, Lagos time. Day number = floor(minutes / 1440) + 1. */
export function lagosMinuteNow(nowMs: number = Date.now()): number {
  return (nowMs + LAGOS_OFFSET_MS - EPOCH) / 60000;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 6 Oct" for a game day number. */
export function lagosDateLabel(day: number): string {
  const d = new Date(EPOCH + (day - 1) * 86_400_000);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** First instant of the current calendar month in the given IANA timezone. */
export function startOfCurrentMonth(timeZone = 'America/Lima'): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);

  // Build as UTC midnight on the 1st, then shift to 00:00 in target TZ (Lima = UTC-5, no DST).
  const utcGuess = Date.UTC(year, month - 1, 1, 5, 0, 0, 0);
  return new Date(utcGuess);
}

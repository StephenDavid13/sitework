const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const relativeFormat = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : "—";
}

/** "3 hours ago", "in 2 days". */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const delta = new Date(iso).getTime() - now;
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(delta) >= ms) {
      return relativeFormat.format(Math.round(delta / ms), unit);
    }
  }
  return "just now";
}

/** ISO timestamp → value for `<input type="datetime-local">`, in the viewer's time zone. */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `<input type="datetime-local">` value (local time) → ISO timestamp, or null when empty. */
export function fromDateTimeLocal(
  value: string | null | undefined,
): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

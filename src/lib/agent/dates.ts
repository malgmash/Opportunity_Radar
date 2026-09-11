const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfUtcDay(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function daysBetween(from: Date, toIso: string | undefined): number | undefined {
  if (!toIso) return undefined;
  const target = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return undefined;
  return Math.round((target.getTime() - startOfUtcDay(from).getTime()) / 86_400_000);
}

/**
 * Parses the shorthand ranges event listings print, e.g. "SEP 18 - 20",
 * "Jul 31 - Oct 01, 2026" or "Mar 3, 2027". The reference date resolves the
 * year when a listing omits it.
 */
export function parseDateRange(
  input: string | undefined | null,
  reference = new Date(),
): { startDate?: string; endDate?: string } {
  if (!input) return {};
  const text = input.replace(/\u2013|\u2014/g, "-").trim();
  if (!text) return {};

  const yearMatch = text.match(/(\d{4})/);
  const explicitYear = yearMatch ? Number(yearMatch[1]) : undefined;

  const tokenRegex = /([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/gi;
  const tokens: { month: number; day: number; year?: number }[] = [];
  for (const match of text.matchAll(tokenRegex)) {
    const month = MONTHS[match[1].toLowerCase()];
    if (month === undefined) continue;
    tokens.push({
      month,
      day: Number(match[2]),
      year: match[3] ? Number(match[3]) : undefined,
    });
  }

  if (!tokens.length) return {};

  // "SEP 18 - 20" keeps the month implicit for the end of the range.
  if (tokens.length === 1) {
    const trailing = text.match(/-\s*(\d{1,2})(?:st|nd|rd|th)?(?:,|\s|$)/);
    if (trailing) {
      tokens.push({ month: tokens[0].month, day: Number(trailing[1]) });
    }
  }

  const resolved = tokens.map((token, index) => {
    let year = token.year ?? explicitYear;
    if (!year) {
      year = reference.getUTCFullYear();
      const candidate = Date.UTC(year, token.month, token.day);
      // Listings only advertise upcoming events, so roll forward past dates.
      if (candidate < startOfUtcDay(reference).getTime() - 45 * 86_400_000) {
        year += 1;
      }
    }
    if (index > 0) {
      const prior = tokens[index - 1];
      const priorYear = prior.year ?? explicitYear ?? year;
      if (token.month < prior.month) year = priorYear + 1;
    }
    return toIsoDate(new Date(Date.UTC(year, token.month, token.day)));
  });

  return {
    startDate: resolved[0],
    endDate: resolved[resolved.length - 1] ?? resolved[0],
  };
}

export function formatDateRange(
  startDate?: string,
  endDate?: string,
): string | undefined {
  if (!startDate) return undefined;
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return undefined;
  const fmt = (date: Date, withYear: boolean) =>
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  if (!endDate || endDate === startDate) return fmt(start, true);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return fmt(start, true);
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${fmt(start, false)} – ${fmt(end, true)}`;
  }
  return `${fmt(start, true)} – ${fmt(end, true)}`;
}

export function describeCountdown(days: number | undefined): string | undefined {
  if (days === undefined) return undefined;
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

import { toIsoDate } from "../dates";
import { fetchText } from "../http";
import type { DraftOpportunity, OpportunitySource } from "./types";

interface MlhEvent {
  id: string;
  slug: string;
  name: string;
  status: string;
  startsAt?: string;
  endsAt?: string;
  dateRange?: string;
  url?: string;
  location?: string;
  formatType?: string;
  websiteUrl?: string;
  region?: string;
  venueAddress?: { city?: string; state?: string; country?: string };
}

interface MlhPage {
  props?: {
    upcomingEvents?: MlhEvent[];
    pastEvents?: MlhEvent[];
  };
}

const SOURCE = {
  id: "mlh",
  name: "Major League Hacking",
  url: "https://www.mlh.com/seasons",
};

/** MLH seasons run August through July, so autumn belongs to the next season. */
export function mlhSeasonsFor(today: Date): number[] {
  const year = today.getUTCFullYear();
  const current = today.getUTCMonth() >= 7 ? year + 1 : year;
  return [current, current + 1];
}

function extractInertiaPayload(html: string): MlhPage {
  const match = html.match(
    /<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("MLH page payload not found");
  return JSON.parse(match[1]) as MlhPage;
}

function locationStrings(event: MlhEvent): string[] {
  const format = (event.formatType ?? "").toLowerCase();
  if (format === "digital") return ["Online"];

  const venue = event.venueAddress;
  const parts: string[] = [];
  if (venue?.city) parts.push(venue.city);
  if (venue?.state) parts.push(venue.state.trim());
  const composed = parts.join(", ");
  const raw = composed || event.location || "Unspecified";
  const withCountry =
    venue?.country && venue.country !== "US" ? `${raw}, ${venue.country}` : raw;
  return format === "hybrid" ? [withCountry, "Online"] : [withCountry];
}

export const mlhSource: OpportunitySource = {
  ...SOURCE,
  kinds: ["hackathon"],
  async collect({ today, log }) {
    const drafts: DraftOpportunity[] = [];
    const seen = new Set<string>();

    for (const season of mlhSeasonsFor(today)) {
      const url = `https://www.mlh.com/seasons/${season}/events`;
      let html: string;
      try {
        html = await fetchText(url, { timeoutMs: 25_000, maxBytes: 3_000_000 });
      } catch (error) {
        log(`season ${season} unavailable (${(error as Error).message})`);
        continue;
      }

      const payload = extractInertiaPayload(html);
      const events = payload.props?.upcomingEvents ?? [];
      log(`season ${season}: ${events.length} upcoming events`);

      for (const event of events) {
        if (!event.name || seen.has(event.id)) continue;
        // MLH keeps internal staging events on the public season page.
        if (/\btest\b/i.test(event.name) && event.status === "pending") continue;
        seen.add(event.id);

        drafts.push({
          kind: "hackathon",
          title: event.name,
          organization: "MLH member event",
          url:
            event.websiteUrl ||
            `https://www.mlh.com${event.url ?? `/events/${event.slug}`}`,
          locations: locationStrings(event),
          description: `Student hackathon on the MLH ${season} season circuit`,
          startDate: event.startsAt ? toIsoDate(new Date(event.startsAt)) : undefined,
          endDate: event.endsAt ? toIsoDate(new Date(event.endsAt)) : undefined,
          datesConfirmed: true,
          tags: [
            "hackathon",
            `MLH ${season} season`,
            event.formatType === "digital" ? "virtual" : "in person",
          ],
          source: SOURCE,
        });
      }
    }

    return drafts;
  },
};

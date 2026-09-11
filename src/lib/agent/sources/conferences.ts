import { withCache } from "../cache";
import { fetchJson } from "../http";
import { normalizeStateToken } from "../geo";
import type { DraftOpportunity, OpportunitySource } from "./types";

interface ConferenceRecord {
  name: string;
  url: string;
  startDate: string;
  endDate?: string;
  city?: string;
  country?: string;
  online?: boolean;
  cfpUrl?: string;
  cfpEndDate?: string;
}

const SOURCE = {
  id: "confs-tech",
  name: "confs.tech open dataset",
  url: "https://github.com/tech-conferences/conference-data",
};

/**
 * Dataset topics that map onto data, engineering or product work. The blurb is
 * what the relevance scorer reads, since the dataset itself carries no abstract.
 */
const TOPICS: Record<string, string> = {
  general: "software engineering and technology conference",
  data: "data, analytics and machine learning conference",
  product: "product management conference",
  ux: "product design and user research conference",
  leadership: "engineering and product leadership conference",
  python: "Python software engineering and data conference",
  javascript: "JavaScript software engineering conference",
  typescript: "TypeScript software engineering conference",
  devops: "DevOps and platform engineering conference",
  security: "security engineering conference",
  api: "API and backend software engineering conference",
  opensource: "open source software engineering conference",
  testing: "software testing and quality engineering conference",
  performance: "software performance engineering conference",
  sre: "site reliability and infrastructure engineering conference",
  java: "Java software engineering conference",
  android: "Android mobile software engineering conference",
  ios: "iOS mobile software engineering conference",
  accessibility: "accessibility and product design conference",
  graphql: "GraphQL and API software engineering conference",
};

const US_COUNTRIES = new Set([
  "u.s.a.",
  "usa",
  "us",
  "united states",
  "united states of america",
]);

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function locationStrings(record: ConferenceRecord): string[] {
  if (record.online && !record.city) return ["Online"];
  const isUs = US_COUNTRIES.has((record.country ?? "").toLowerCase());
  const city = (record.city ?? "").trim();

  if (isUs) {
    // Dataset cities are a mix of "Austin" and "San Jose, CA".
    const tail = city.split(",").pop()?.trim();
    const hasState = Boolean(normalizeStateToken(tail));
    const base = hasState ? city : `${city}, United States`;
    return record.online ? [base, "Online"] : [base];
  }

  const base = [city, record.country].filter(Boolean).join(", ") || "Unspecified";
  return record.online ? [base, "Online"] : [base];
}

export const conferenceSource: OpportunitySource = {
  ...SOURCE,
  kinds: ["conference"],
  async collect({ today, log }) {
    const years = [today.getUTCFullYear(), today.getUTCFullYear() + 1];
    const drafts: DraftOpportunity[] = [];
    const seen = new Set<string>();
    let failures = 0;

    for (const year of years) {
      for (const [topic, blurb] of Object.entries(TOPICS)) {
        const url = `https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences/${year}/${topic}.json`;
        let records: ConferenceRecord[];
        try {
          const { value } = await withCache(`confs:${year}:${topic}`, CACHE_TTL_MS, () =>
            fetchJson<ConferenceRecord[]>(url, { timeoutMs: 20_000 }),
          );
          records = value;
        } catch {
          failures += 1;
          continue;
        }

        for (const record of records) {
          if (!record.name || !record.url || !record.startDate) continue;
          const key = `${record.name}|${record.startDate}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          const cfpOpen =
            record.cfpEndDate && record.cfpEndDate >= today.toISOString().slice(0, 10);

          drafts.push({
            kind: "conference",
            title: record.name,
            url: record.url,
            locations: locationStrings(record),
            startDate: record.startDate,
            endDate: record.endDate ?? record.startDate,
            datesConfirmed: true,
            tags: [
              "conference",
              topic,
              ...(cfpOpen ? [`CFP closes ${record.cfpEndDate}`] : []),
            ],
            description: `${record.name} — ${blurb}`,
            source: SOURCE,
          });
        }
      }
    }

    log(
      `${drafts.length} conferences across ${years.join(", ")}${
        failures ? ` (${failures} topic files unavailable)` : ""
      }`,
    );
    return drafts;
  },
};

import { parseDateRange } from "../dates";
import { decodeEntities, fetchJson, htmlToText } from "../http";
import type { DraftOpportunity, OpportunitySource } from "./types";

interface DevpostHackathon {
  id: number;
  title: string;
  url: string;
  open_state: string;
  displayed_location?: { icon?: string; location?: string };
  submission_period_dates?: string;
  time_left_to_submission?: string;
  themes?: { name: string }[];
  prize_amount?: string;
  registrations_count?: number;
  organization_name?: string;
  invite_only?: boolean;
}

interface DevpostResponse {
  hackathons: DevpostHackathon[];
  meta?: { total_count?: number };
}

const SOURCE = {
  id: "devpost",
  name: "Devpost",
  url: "https://devpost.com/hackathons",
};

const PAGES_PER_STATUS = 4;

function cleanPrize(prize: string | undefined): string | undefined {
  if (!prize) return undefined;
  const text = htmlToText(decodeEntities(prize)).replace(/\s+/g, "");
  if (!text || text === "$0") return undefined;
  return `${text} in prizes`;
}

export const devpostSource: OpportunitySource = {
  ...SOURCE,
  kinds: ["hackathon"],
  async collect({ today, log }) {
    const drafts: DraftOpportunity[] = [];
    const seen = new Set<number>();

    for (const status of ["open", "upcoming"]) {
      for (let page = 1; page <= PAGES_PER_STATUS; page += 1) {
        const url = `https://devpost.com/api/hackathons?status[]=${status}&order_by=deadline&page=${page}`;
        let response: DevpostResponse;
        try {
          response = await fetchJson<DevpostResponse>(url, {
            timeoutMs: 20_000,
            headers: { referer: "https://devpost.com/hackathons" },
          });
        } catch (error) {
          log(`${status} page ${page} failed (${(error as Error).message})`);
          break;
        }

        const batch = response.hackathons ?? [];
        if (!batch.length) break;

        for (const item of batch) {
          if (seen.has(item.id) || item.invite_only) continue;
          seen.add(item.id);

          const location = item.displayed_location?.location?.trim() || "Online";
          const isOnline = item.displayed_location?.icon === "globe";
          const { startDate, endDate } = parseDateRange(
            item.submission_period_dates,
            today,
          );
          const themes = (item.themes ?? []).map((theme) => theme.name);

          drafts.push({
            kind: "hackathon",
            title: item.title,
            organization: item.organization_name,
            url: item.url,
            locations: [isOnline ? "Online" : location],
            startDate,
            endDate,
            dateLabel: item.submission_period_dates,
            datesConfirmed: true,
            deadline: endDate,
            deadlineLabel: item.time_left_to_submission,
            reward: cleanPrize(item.prize_amount),
            tags: ["hackathon", ...themes],
            source: SOURCE,
          });
        }

        if (batch.length < 9) break;
      }
    }

    log(`${drafts.length} listings across open and upcoming pages`);
    return drafts;
  },
};

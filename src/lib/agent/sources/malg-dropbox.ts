import { readFile } from "node:fs/promises";
import path from "node:path";

import type { OpportunityKind, SourceRef } from "../types";
import type { DraftOpportunity, OpportunitySource } from "./types";

export const FEED_RELATIVE_PATH = "data/malg-dropbox-feed.json";

const KINDS = new Set<OpportunityKind>(["hackathon", "internship", "conference"]);

const SOURCE = {
  id: "malg-dropbox",
  name: "MALG Opportunity Dropbox",
  url: "https://github.com/malgmash/Opportunity_Radar/blob/main/data/malg-dropbox-feed.json",
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim());
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asSource(value: unknown, fallbackUrl: string): SourceRef {
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    const id = asString(raw.id);
    const name = asString(raw.name);
    const url = asString(raw.url);
    if (id && name && url) return { id, name, url };
  }
  return { ...SOURCE, url: fallbackUrl };
}

function looksLikeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Maps one feed row into a draft, or null when required fields are missing. */
export function mapFeedEntry(raw: unknown): DraftOpportunity | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;

  const kind = asString(entry.kind);
  if (!kind || !KINDS.has(kind as OpportunityKind)) return null;

  const title = asString(entry.title);
  const url = asString(entry.url);
  if (!title || !url || !looksLikeUrl(url)) return null;

  return {
    kind: kind as OpportunityKind,
    title,
    organization: asString(entry.organization),
    url,
    description: asString(entry.description),
    locations: asStringList(entry.locations) ?? [],
    startDate: asString(entry.startDate),
    endDate: asString(entry.endDate),
    dateLabel: asString(entry.dateLabel),
    datesConfirmed: asBoolean(entry.datesConfirmed),
    deadline: asString(entry.deadline),
    deadlineLabel: asString(entry.deadlineLabel),
    term: asString(entry.term),
    reward: asString(entry.reward),
    tags: asStringList(entry.tags),
    postedAt: asString(entry.postedAt),
    source: asSource(entry.source, url),
  };
}

export interface ParsedMalgDropboxFeed {
  drafts: DraftOpportunity[];
  skipped: number;
  updated?: string;
}

/**
 * Validates a MALG Dropbox payload. Malformed rows are counted and dropped so
 * a bad entry never fails the whole collect pass.
 */
export function parseMalgDropboxFeed(raw: unknown): ParsedMalgDropboxFeed {
  if (!raw || typeof raw !== "object") {
    return { drafts: [], skipped: 0 };
  }

  const payload = raw as Record<string, unknown>;
  const rows = payload.opportunities;
  if (!Array.isArray(rows)) {
    return { drafts: [], skipped: 0 };
  }

  const drafts: DraftOpportunity[] = [];
  let skipped = 0;
  for (const row of rows) {
    const mapped = mapFeedEntry(row);
    if (mapped) drafts.push(mapped);
    else skipped += 1;
  }

  return {
    drafts,
    skipped,
    updated: asString(payload.updated),
  };
}

export const malgDropboxSource: OpportunitySource = {
  ...SOURCE,
  kinds: ["internship", "hackathon", "conference"],
  async collect({ log }) {
    const file = path.join(process.cwd(), FEED_RELATIVE_PATH);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      log(`${FEED_RELATIVE_PATH} unavailable (${(error as Error).message})`);
      return [];
    }

    const { drafts, skipped, updated } = parseMalgDropboxFeed(raw);
    const stamp = updated ? `, updated ${updated}` : "";
    const skipNote = skipped ? `, skipped ${skipped} malformed` : "";
    log(`loaded ${drafts.length} from ${FEED_RELATIVE_PATH}${stamp}${skipNote}`);
    return drafts;
  },
};

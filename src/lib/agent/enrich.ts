import { withCache } from "./cache";
import { parseDateRange } from "./dates";
import { normalizeStateToken } from "./geo";
import { fetchText, htmlToText } from "./http";
import type { TravelEvidence, TravelSupport } from "./types";

const STRONG_PHRASES = [
  "travel reimbursement",
  "travel reimbursements",
  "reimburse travel",
  "reimburse your travel",
  "reimbursed for travel",
  "travel stipend",
  "travel grant",
  "travel grants",
  "travel scholarship",
  "travel scholarships",
  "travel funding",
  "travel assistance",
  "cover travel",
  "covers travel",
  "covered travel",
  "travel costs covered",
  "travel is covered",
  "we cover your travel",
  "travel budget",
  "flight reimbursement",
  "gas reimbursement",
  "mileage reimbursement",
  "travel support",
  "hackathon bus",
  "travel buses",
  "chartered bus",
];

const WEAK_PHRASES = [
  "scholarship",
  "scholarships",
  "financial aid",
  "reimbursement",
  "stipend",
  "grant program",
  "hardship fund",
  "travel",
];

const NEGATIVE_PHRASES = [
  "no travel reimbursement",
  "not offer travel reimbursement",
  "do not offer travel",
  "does not offer travel",
  "do not provide travel",
  "does not provide travel",
  "unable to reimburse travel",
  "cannot reimburse travel",
  "travel is not reimbursed",
  "travel will not be reimbursed",
  "no travel stipend",
  "travel is not covered",
  "not cover travel",
  "at your own expense",
];

const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const PAGE_BUDGET_BYTES = 900_000;
const CANDIDATE_PATHS = ["", "/faq", "/travel", "/attend", "/scholarships", "/about"];

function findQuote(text: string, phrase: string): string | undefined {
  const index = text.toLowerCase().indexOf(phrase);
  if (index < 0) return undefined;
  const start = Math.max(0, index - 110);
  const end = Math.min(text.length, index + phrase.length + 130);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export interface PageFacts {
  url: string;
  text: string;
}

async function loadRawPage(url: string): Promise<string | undefined> {
  try {
    const { value } = await withCache(`html:${url}`, CACHE_TTL_MS, () =>
      fetchText(url, { timeoutMs: 12_000, retries: 0, maxBytes: PAGE_BUDGET_BYTES }),
    );
    return value;
  } catch {
    return undefined;
  }
}

async function loadPage(url: string): Promise<PageFacts | undefined> {
  const html = await loadRawPage(url);
  if (!html) return undefined;
  return { url, text: htmlToText(html).slice(0, 200_000) };
}

function pageCandidates(baseUrl: string, extraUrls: string[]): string[] {
  const urls = new Set<string>(extraUrls);
  let root: URL;
  try {
    root = new URL(baseUrl);
  } catch {
    return [...urls];
  }
  urls.add(root.toString());
  const trimmed = root.toString().replace(/\/$/, "");
  for (const path of CANDIDATE_PATHS) {
    if (!path) continue;
    urls.add(`${trimmed}${path}`);
  }
  return [...urls];
}

/**
 * Reads an event's own pages looking for language that commits to paying for
 * travel. Returns `unknown` rather than guessing when nothing is stated, so the
 * rules engine can route the item to manual verification.
 */
export async function checkTravelSupport(
  baseUrl: string,
  extraUrls: string[] = [],
  maxPages = 3,
): Promise<TravelSupport> {
  const checked: string[] = [];
  const evidence: TravelEvidence[] = [];
  let negative: TravelEvidence | undefined;
  let weakHit: TravelEvidence | undefined;

  for (const url of pageCandidates(baseUrl, extraUrls)) {
    if (checked.length >= maxPages) break;
    const page = await loadPage(url);
    if (!page || page.text.length < 200) continue;
    checked.push(url);
    const lower = page.text.toLowerCase();

    for (const phrase of NEGATIVE_PHRASES) {
      if (lower.includes(phrase) && !negative) {
        negative = {
          phrase,
          quote: findQuote(page.text, phrase) ?? phrase,
          sourceUrl: url,
        };
      }
    }

    for (const phrase of STRONG_PHRASES) {
      if (lower.includes(phrase)) {
        evidence.push({
          phrase,
          quote: findQuote(page.text, phrase) ?? phrase,
          sourceUrl: url,
        });
      }
    }

    if (!weakHit) {
      for (const phrase of WEAK_PHRASES) {
        if (lower.includes(phrase)) {
          weakHit = {
            phrase,
            quote: findQuote(page.text, phrase) ?? phrase,
            sourceUrl: url,
          };
          break;
        }
      }
    }

    if (evidence.length) break;
  }

  const checkedAt = new Date().toISOString();

  if (evidence.length) {
    return {
      status: "confirmed",
      evidence: evidence.slice(0, 3),
      note: `Found travel funding language on ${new URL(evidence[0].sourceUrl).hostname}.`,
      checkedAt,
      pagesChecked: checked,
    };
  }

  if (negative) {
    return {
      status: "not_offered",
      evidence: [negative],
      note: "The event states that travel is not reimbursed.",
      checkedAt,
      pagesChecked: checked,
    };
  }

  if (weakHit && weakHit.phrase !== "travel") {
    return {
      status: "likely",
      evidence: [weakHit],
      note: `Mentions a "${weakHit.phrase}" program but does not spell out travel costs.`,
      checkedAt,
      pagesChecked: checked,
    };
  }

  return {
    status: "unknown",
    evidence: [],
    note: checked.length
      ? "Read the event site and found no travel funding statement."
      : "Could not read the event site to check for travel funding.",
    checkedAt,
    pagesChecked: checked,
  };
}

export interface ExtractedDates {
  startDate?: string;
  endDate?: string;
  evidence?: string;
}

/** schema.org Event markup is the only machine-readable date most sites publish. */
function datesFromStructuredData(html: string): ExtractedDates {
  const start = html.match(/"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
  if (!start) return {};
  const end = html.match(/"endDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
  return {
    startDate: start[1],
    endDate: end?.[1] ?? start[1],
    evidence: `schema.org startDate ${start[1]}`,
  };
}

const DATE_PATTERNS = [
  /([A-Z][a-z]{2,9})\.?\s+(\d{1,2})\s*(?:-|–|—|to)\s*([A-Z][a-z]{2,9})\.?\s+(\d{1,2}),?\s*(20\d{2})/,
  /([A-Z][a-z]{2,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:-|–|—|to)\s*(\d{1,2})(?:st|nd|rd|th)?,?\s*(20\d{2})/,
  /(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s+([A-Z][a-z]{2,9}),?\s*(20\d{2})/,
  /([A-Z][a-z]{2,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(20\d{2})/,
];

/**
 * Pulls a date range off a recurring event's site, preferring structured data
 * and falling back to printed dates like "October 22-23, 2026". Anything in the
 * past is ignored so a previous edition's dates never get promoted.
 */
export async function extractEventDates(
  url: string,
  today: Date,
): Promise<ExtractedDates> {
  const html = await loadRawPage(url);
  if (!html) return {};
  const horizon = today.toISOString().slice(0, 10);

  const structured = datesFromStructuredData(html);
  if (structured.startDate && structured.startDate >= horizon) return structured;

  const text = htmlToText(html).slice(0, 60_000);
  for (const pattern of DATE_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern, "g"))) {
      const { startDate, endDate } = parseDateRange(match[0], today);
      if (startDate && startDate >= horizon) {
        return { startDate, endDate, evidence: match[0].replace(/\s+/g, " ") };
      }
    }
  }
  return {};
}

const CITY_STATE = new RegExp(
  "([A-Z][a-zA-Z.\\-]+(?: [A-Z][a-zA-Z.\\-]+){0,2}),\\s*(" +
    "AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|" +
    "MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY" +
    ")\\b",
);

/**
 * Recovers a US state for listings that only publish a venue or room name.
 * Only a literal "City, ST" counts; a bare state name elsewhere on the page is
 * too often a sponsor address to trust.
 */
export async function resolveLocationFromPage(
  url: string,
): Promise<{ state?: string; city?: string; quote?: string }> {
  const page = await loadPage(url);
  if (!page) return {};

  const match = page.text.match(CITY_STATE);
  if (!match) return {};
  const state = normalizeStateToken(match[2]);
  if (!state) return {};
  return { state, city: match[1], quote: `${match[0]} (read from ${new URL(url).hostname})` };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run()),
  );
  return results;
}

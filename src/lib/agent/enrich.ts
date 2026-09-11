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

/**
 * Phrasing varies far more on the "no" side ("we aren't able to offer travel
 * reimbursements this year"), so these are patterns rather than phrases, and
 * they allow both apostrophe characters.
 */
const NEGATIVE_PATTERNS: RegExp[] = [
  /\bno\s+travel\s+(reimbursement|reimbursements|stipend|stipends|grant|grants|funding|support|assistance)\b/,
  /(?:\bnot|\bcannot|n['’]t)\s+(?:be\s+)?(?:able\s+to\s+)?(?:offer|provide|cover|reimburse|fund|sponsor)\w*\b[^.!?]{0,60}\btravel\b/,
  /\b(?:unable|not\s+able)\s+to\s+(?:offer|provide|cover|reimburse|fund)\w*\b[^.!?]{0,60}\btravel\b/,
  /\btravel\b[^.!?]{0,60}\b(?:is|are|will)\s+not\s+(?:be\s+)?(?:covered|reimbursed|provided|offered|funded)\b/,
  /\btravel\b[^.!?]{0,40}\bat\s+your\s+own\s+expense\b/,
  /\bnot\s+(?:offering|providing)\s+travel\b/,
  /\bdoes\s+not\s+include\s+travel\b/,
];

/**
 * Ranks how much a matched sentence actually commits to paying for travel. FAQ
 * headings and navigation menus match the same keywords as a real policy, so a
 * weak quote downgrades the finding instead of asserting funding.
 */
function scoreQuote(quote: string): number {
  let score = 0;
  if (/\b(we|you|attendees|students|participants|applicants|hackers)\b/i.test(quote)) {
    score += 2;
  }
  if (
    /\b(will|offers?|provides?|covers?|reimburses?|available|apply|eligible|awarded|up to|\$\d)/i.test(
      quote,
    )
  ) {
    score += 2;
  }
  if (/\?\s*$/.test(quote)) score -= 3;
  if (quote.length < 45) score -= 2;
  // Flattened navigation reads as many capitalized fragments with no verbs.
  if (!/[.!?]/.test(quote) && (quote.match(/[A-Z]/g)?.length ?? 0) > 12) score -= 3;
  return score;
}

const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const PAGE_BUDGET_BYTES = 900_000;
const CANDIDATE_PATHS = ["", "/faq", "/travel", "/attend", "/scholarships", "/about"];

/**
 * Quotes the sentence containing the match. Event pages flatten into navigation
 * fragments and stray numbers, so a fixed character window usually reads as
 * noise; sentence boundaries keep the evidence legible.
 */
function findQuote(text: string, index: number, length: number): string | undefined {
  if (index < 0) return undefined;
  const windowStart = Math.max(0, index - 320);
  const windowEnd = Math.min(text.length, index + length + 320);
  const window = text.slice(windowStart, windowEnd);
  const local = index - windowStart;

  const before = window.slice(0, local);
  const after = window.slice(local);
  const start = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("! "),
    before.lastIndexOf("? "),
  );
  const endMatch = after.match(/[.!?](\s|$)/);
  const end = endMatch ? local + (endMatch.index ?? 0) + 1 : window.length;
  // With no sentence break to anchor to, keep only a little leading context so
  // flattened menus do not swamp the quote.
  const from = start >= 0 ? start + 2 : Math.max(0, local - 60);

  const sentence = window
    .slice(from, end)
    // Flattened menus leave runs of bare numbers behind.
    .replace(/(?:\s\d{1,3}){3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (sentence.length < 24) {
    return `…${window.slice(Math.max(0, local - 90), local + length + 110).replace(/\s+/g, " ").trim()}…`;
  }
  return sentence.length > 260 ? `${sentence.slice(0, 257)}…` : sentence;
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
export interface PageSignals {
  evidence: TravelEvidence[];
  negative?: TravelEvidence;
  weak?: TravelEvidence;
}

/** Pure text analysis, split out from the fetching so it can be tested directly. */
export function analyzePageText(text: string, url: string): PageSignals {
  const lower = text.toLowerCase();
  const signals: PageSignals = { evidence: [] };

  for (const pattern of NEGATIVE_PATTERNS) {
    const match = lower.match(pattern);
    if (match?.index !== undefined && !signals.negative) {
      signals.negative = {
        phrase: match[0].replace(/\s+/g, " ").trim(),
        quote: findQuote(text, match.index, match[0].length) ?? match[0],
        sourceUrl: url,
      };
    }
  }

  // The first hit is often an FAQ heading while the policy sits a sentence
  // later, so every occurrence is collected and the clearest one wins.
  for (const phrase of STRONG_PHRASES) {
    let index = lower.indexOf(phrase);
    let seen = 0;
    while (index >= 0 && seen < 3) {
      signals.evidence.push({
        phrase,
        quote: findQuote(text, index, phrase.length) ?? phrase,
        sourceUrl: url,
      });
      seen += 1;
      index = lower.indexOf(phrase, index + phrase.length);
    }
  }

  const byQuote = new Map(signals.evidence.map((entry) => [entry.quote, entry]));
  signals.evidence = [...byQuote.values()]
    .sort((a, b) => scoreQuote(b.quote) - scoreQuote(a.quote))
    .slice(0, 6);

  for (const phrase of WEAK_PHRASES) {
    const index = lower.indexOf(phrase);
    if (index >= 0) {
      signals.weak = {
        phrase,
        quote: findQuote(text, index, phrase.length) ?? phrase,
        sourceUrl: url,
      };
      break;
    }
  }

  return signals;
}

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

    const signals = analyzePageText(page.text, url);
    evidence.push(...signals.evidence);
    negative ??= signals.negative;
    weakHit ??= signals.weak;

    if (evidence.length) break;
  }

  const checkedAt = new Date().toISOString();

  const ranked = evidence
    .map((entry) => ({ entry, score: scoreQuote(entry.quote) }))
    .sort((a, b) => b.score - a.score);

  // A page that both advertises and limits travel funding is not a green light.
  if (ranked.length && negative) {
    return {
      status: "likely",
      evidence: [ranked[0].entry, negative],
      note: "The site mentions travel funding and also limits it; check who qualifies.",
      checkedAt,
      pagesChecked: checked,
    };
  }

  if (ranked.length) {
    const best = ranked[0];
    const host = new URL(best.entry.sourceUrl).hostname;
    if (best.score < 1) {
      return {
        status: "likely",
        evidence: [best.entry],
        note: `Mentions travel funding on ${host}, but the page never states the policy outright.`,
        checkedAt,
        pagesChecked: checked,
      };
    }
    return {
      status: "confirmed",
      evidence: ranked.slice(0, 3).map((item) => item.entry),
      note: `Found travel funding language on ${host}.`,
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

import type { Track } from "./types";

export const TRACK_LABELS: Record<Track, string> = {
  "data-analysis": "Data & analytics",
  "software-engineering": "Software engineering",
  "product-management": "Product management",
  adjacent: "Adjacent / general tech",
};

interface Signal {
  /** Matched as a whole phrase, case-insensitive. */
  phrase: string;
  weight: number;
}

const TRACK_SIGNALS: Record<Track, Signal[]> = {
  "data-analysis": [
    { phrase: "data analyst", weight: 34 },
    { phrase: "data analytics", weight: 32 },
    { phrase: "business intelligence", weight: 30 },
    { phrase: "business analyst", weight: 26 },
    { phrase: "data science", weight: 30 },
    { phrase: "data scientist", weight: 30 },
    { phrase: "analytics", weight: 24 },
    { phrase: "data engineer", weight: 24 },
    { phrase: "data engineering", weight: 24 },
    { phrase: "machine learning", weight: 20 },
    { phrase: "deep learning", weight: 14 },
    { phrase: "statistics", weight: 20 },
    { phrase: "statistical", weight: 16 },
    { phrase: "quantitative", weight: 16 },
    { phrase: "visualization", weight: 16 },
    { phrase: "dashboard", weight: 14 },
    { phrase: "tableau", weight: 18 },
    { phrase: "power bi", weight: 18 },
    { phrase: "sql", weight: 16 },
    { phrase: "datathon", weight: 34 },
    { phrase: "datafest", weight: 34 },
    { phrase: "data challenge", weight: 26 },
    // Hackathons are project work across all three focus areas, not just code.
    { phrase: "hackathon", weight: 12 },
    { phrase: "insights", weight: 10 },
    { phrase: "reporting", weight: 10 },
    { phrase: "forecasting", weight: 14 },
    { phrase: "big data", weight: 18 },
    { phrase: "data", weight: 8 },
    { phrase: "ai", weight: 10 },
    { phrase: "artificial intelligence", weight: 14 },
  ],
  "software-engineering": [
    { phrase: "software engineer", weight: 34 },
    { phrase: "software engineering", weight: 34 },
    { phrase: "software developer", weight: 32 },
    { phrase: "swe", weight: 28 },
    { phrase: "backend", weight: 24 },
    { phrase: "back end", weight: 22 },
    { phrase: "frontend", weight: 24 },
    { phrase: "front end", weight: 22 },
    { phrase: "full stack", weight: 26 },
    { phrase: "fullstack", weight: 26 },
    { phrase: "web development", weight: 22 },
    { phrase: "mobile development", weight: 20 },
    { phrase: "ios", weight: 14 },
    { phrase: "android", weight: 14 },
    { phrase: "platform engineer", weight: 22 },
    { phrase: "infrastructure", weight: 16 },
    { phrase: "devops", weight: 18 },
    { phrase: "site reliability", weight: 18 },
    { phrase: "cloud", weight: 14 },
    { phrase: "api", weight: 12 },
    { phrase: "distributed systems", weight: 20 },
    { phrase: "systems engineer", weight: 18 },
    { phrase: "developer", weight: 16 },
    { phrase: "programming", weight: 14 },
    { phrase: "hackathon", weight: 24 },
    { phrase: "open source", weight: 14 },
    { phrase: "javascript", weight: 14 },
    { phrase: "typescript", weight: 14 },
    { phrase: "python", weight: 14 },
    { phrase: "java", weight: 12 },
    { phrase: "react", weight: 12 },
    { phrase: "security engineer", weight: 16 },
    { phrase: "qa engineer", weight: 12 },
    { phrase: "test engineering", weight: 12 },
    { phrase: "engineering", weight: 10 },
  ],
  "product-management": [
    { phrase: "product manager", weight: 36 },
    { phrase: "product management", weight: 36 },
    { phrase: "associate product manager", weight: 36 },
    { phrase: "apm", weight: 24 },
    { phrase: "product owner", weight: 28 },
    { phrase: "product strategy", weight: 30 },
    { phrase: "product analyst", weight: 28 },
    { phrase: "product operations", weight: 24 },
    { phrase: "product design", weight: 20 },
    { phrase: "technical program manager", weight: 24 },
    { phrase: "program manager", weight: 20 },
    { phrase: "project manager", weight: 14 },
    { phrase: "product marketing", weight: 18 },
    { phrase: "growth", weight: 14 },
    { phrase: "user research", weight: 18 },
    { phrase: "ux research", weight: 18 },
    { phrase: "customer discovery", weight: 16 },
    { phrase: "roadmap", weight: 16 },
    { phrase: "go-to-market", weight: 14 },
    { phrase: "product", weight: 10 },
    { phrase: "hackathon", weight: 12 },
    { phrase: "pitch competition", weight: 20 },
    { phrase: "case competition", weight: 22 },
  ],
  adjacent: [
    { phrase: "technology", weight: 10 },
    { phrase: "tech", weight: 8 },
    { phrase: "computer science", weight: 16 },
    { phrase: "information systems", weight: 14 },
    { phrase: "innovation", weight: 10 },
    { phrase: "startup", weight: 12 },
    { phrase: "entrepreneur", weight: 10 },
    { phrase: "cybersecurity", weight: 14 },
    { phrase: "fintech", weight: 12 },
    { phrase: "civic tech", weight: 12 },
    { phrase: "design", weight: 8 },
    { phrase: "research", weight: 8 },
  ],
};

/** Titles that belong to a different career stage than an undergrad intern. */
const OFF_TARGET_SIGNALS: Signal[] = [
  { phrase: "phd", weight: 30 },
  { phrase: "mba", weight: 26 },
  { phrase: "postdoc", weight: 30 },
  { phrase: "post-doc", weight: 30 },
  { phrase: "doctoral", weight: 26 },
  { phrase: "new grad", weight: 24 },
  { phrase: "new graduate", weight: 24 },
  { phrase: "experienced hire", weight: 24 },
  { phrase: "staff engineer", weight: 26 },
  { phrase: "principal", weight: 24 },
  { phrase: "director", weight: 24 },
  { phrase: "senior manager", weight: 24 },
  { phrase: "vice president", weight: 26 },
  { phrase: "apprenticeship for veterans", weight: 20 },
  { phrase: "high school", weight: 26 },
  { phrase: "middle school", weight: 30 },
];

function phraseRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
}

const REGEX_CACHE = new Map<string, RegExp>();

function matches(text: string, phrase: string): boolean {
  let regex = REGEX_CACHE.get(phrase);
  if (!regex) {
    regex = phraseRegex(phrase);
    REGEX_CACHE.set(phrase, regex);
  }
  return regex.test(text);
}

export interface TrackScore {
  track: Track;
  score: number;
  hits: string[];
}

export function scoreTracks(text: string): TrackScore[] {
  const haystack = text.toLowerCase();
  return (Object.keys(TRACK_SIGNALS) as Track[])
    .map((track) => {
      const hits: string[] = [];
      let score = 0;
      for (const signal of TRACK_SIGNALS[track]) {
        if (matches(haystack, signal.phrase)) {
          score += signal.weight;
          hits.push(signal.phrase);
        }
      }
      // Long documents accumulate incidental hits; cap so one source cannot dominate.
      return { track, score: Math.min(score, 100), hits: hits.slice(0, 6) };
    })
    .sort((a, b) => b.score - a.score);
}

export function offTargetSignals(text: string): string[] {
  const haystack = text.toLowerCase();
  return OFF_TARGET_SIGNALS.filter((signal) => matches(haystack, signal.phrase)).map(
    (signal) => signal.phrase,
  );
}

export function matchedKeywords(text: string, keywords: string[]): string[] {
  const haystack = text.toLowerCase();
  return keywords.filter((keyword) => matches(haystack, keyword.toLowerCase()));
}

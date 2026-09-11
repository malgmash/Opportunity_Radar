import { withCache } from "../cache";
import { toIsoDate } from "../dates";
import { fetchJsonResilient } from "../http";
import type { DraftOpportunity, OpportunitySource, SourceContext } from "./types";

/**
 * Instagram accounts that announce early-career openings. These are alert
 * feeds, not job boards: a post says "Microsoft 2027 SWE intern apps are open"
 * and keeps the link in a story, so each post becomes a dated lead pointing
 * back at the post rather than at an application form.
 */
const DEFAULT_ACCOUNTS = ["zero2sudo"];

/** Public web profile endpoint. The app id is the one instagram.com itself sends. */
const PROFILE_URL = "https://i.instagram.com/api/v1/users/web_profile_info/";
const WEB_APP_ID = "936619743392459";

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CaptionEdge {
  node?: { text?: string };
}

interface MediaNode {
  shortcode?: string;
  taken_at_timestamp?: number;
  edge_media_to_caption?: { edges?: CaptionEdge[] };
}

interface ProfileResponse {
  data?: {
    user?: {
      username?: string;
      full_name?: string;
      edge_owner_to_timeline_media?: { edges?: { node?: MediaNode }[] };
    };
  };
}

/** A caption has to look like an announcement, not a lifestyle post. */
const ANNOUNCEMENT_SIGNALS = [
  /\bapps?\s+(?:are\s+)?(?:live|open|opened)\b/i,
  /\bapplications?\s+(?:are\s+)?(?:live|open|opened|now\s+open)\b/i,
  /\b(?:have|has)\s+opened\b/i,
  /\bis\s+live\b/i,
  /\bnow\s+hiring\b/i,
  /\bapply\s+(?:now|by|before)\b/i,
  /\bdeadline\b/i,
  /\bregistration\s+(?:is\s+)?open\b/i,
  // A closing window is the most urgent kind of alert this account posts.
  /\b(?:apps?|applications?)\s+close\b/i,
  /\bcloses?\s+(?:in|on)\b/i,
  /\blast\s+(?:day|chance)\s+to\s+apply\b/i,
];

const KIND_SIGNALS: { kind: DraftOpportunity["kind"]; pattern: RegExp }[] = [
  { kind: "hackathon", pattern: /\b(hackathon|datathon|hack\s?the|case competition)\b/i },
  { kind: "conference", pattern: /\b(conference|summit|symposium|convention|expo)\b/i },
  { kind: "internship", pattern: /\b(internships?|interns?|co-?op|apps?|applications?)\b/i },
];

/** Abbreviations in captions, spelled out so the scorer and the card both read well. */
const ROLE_SIGNALS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bswe\b|\bsoftware engineer(?:ing)?\b/i, label: "software engineering" },
  { pattern: /\btpm\b|\btechnical program manager\b/i, label: "technical program manager" },
  { pattern: /\bapm\b/i, label: "associate product manager" },
  { pattern: /\bpm\b|\bproduct manager\b|\bproduct management\b/i, label: "product management" },
  { pattern: /\bdata (?:analyst|analytics|science|scientist)\b|\bds\b/i, label: "data analytics" },
  { pattern: /\bbusiness analyst\b|\bbi\b/i, label: "business intelligence" },
  { pattern: /\bml\b|\bmachine learning\b/i, label: "machine learning" },
  { pattern: /\bquant\b|\bquantitative\b/i, label: "quantitative" },
  { pattern: /\bux\b|\bdesign(?:er)?\b/i, label: "product design" },
  { pattern: /\bsecurity\b|\bcyber\b/i, label: "security engineering" },
  { pattern: /\bhardware\b|\basic\b|\bfpga\b/i, label: "hardware engineering" },
];

/**
 * Words that start a sentence and look like a company to the capitalization
 * heuristic. Anything here is never treated as an organization.
 */
const NOT_COMPANIES = new Set([
  "a", "all", "also", "and", "apply", "apps", "big", "both", "but", "check", "class",
  "come", "current", "direct", "do", "dont", "every", "first", "for", "from", "get",
  "getting", "go", "good", "having", "here", "hey", "how", "i", "if", "im", "in", "is",
  "it", "its", "just", "last", "let", "lets", "like", "listen", "lots", "many", "me",
  // "one" is deliberately absent: Capital One is a company these posts name.
  "more", "most", "my", "new", "next", "no", "not", "now", "of", "on", "only",
  "open", "or", "other", "plus", "raise", "read", "ready", "remember", "save", "see",
  "should", "so", "some", "still", "stop", "summer", "take", "the", "their", "then",
  "there", "these", "they", "this", "those", "to", "today", "turn", "up", "want",
  "watch", "we", "well", "what", "when", "where", "which", "who", "why", "will",
  "with", "you", "your", "fall", "spring", "winter", "internship", "internships",
  "intern", "interns", "job", "jobs", "role", "roles", "tech", "swe", "pm", "tpm",
]);

const SEASONS = ["Summer", "Fall", "Spring", "Winter"] as const;

/** Emoji, pictographs and the leading siren these posts open with. */
function stripDecoration(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitSentences(caption: string): string[] {
  return stripDecoration(caption)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function titleCase(word: string): string {
  return word.length <= 4 && word === word.toUpperCase()
    ? word
    : word[0].toUpperCase() + word.slice(1);
}

/**
 * Reads the company list out of the account's standard opening line, where one
 * or more capitalized names sit immediately before the recruiting year:
 * "Microsoft, SpaceX, TikTok 2027 SWE Internship apps ARE OPEN".
 */
export function parseCompanies(sentence: string): string[] {
  const match = /^(?<names>.{2,80}?)\s+(?:20\d{2})\b/.exec(stripDecoration(sentence));
  if (!match?.groups?.names) return [];

  return match.groups.names
    .split(/\s*(?:,|&|\band\b|\+)\s*/i)
    .map((piece) => piece.replace(/[^A-Za-z0-9.\-' ]/g, "").trim())
    .filter((piece) => {
      if (!piece || piece.length > 30) return false;
      const words = piece.split(/\s+/);
      if (words.length > 2) return false;
      // Company names are capitalized in these captions; sentence-initial verbs
      // and articles are filtered by name.
      if (!/^[A-Z0-9]/.test(piece)) return false;
      return !words.some((word) => NOT_COMPANIES.has(word.toLowerCase()));
    })
    .map((piece) => piece.split(/\s+/).map(titleCase).join(" "))
    .slice(0, 6);
}

export function parseTerm(caption: string, today: Date): string | undefined {
  const thisYear = today.getUTCFullYear();
  // "2026-2027 apps" means the 2027 cycle, so a range resolves to its later year.
  const years = [...caption.matchAll(/\b(20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= thisYear && year <= thisYear + 5);
  if (!years.length) return undefined;
  const season = SEASONS.find((candidate) =>
    new RegExp(`\\b${candidate}\\b`, "i").test(caption),
  );
  return `${season ?? "Summer"} ${Math.max(...years)}`;
}

/**
 * "apps close in 3 days" is only meaningful next to the post date, so the
 * deadline is resolved from when the post went up.
 */
export function parseRelativeDeadline(
  caption: string,
  postedAt: string | undefined,
): string | undefined {
  if (!postedAt) return undefined;
  const match = /\bclose[sd]?\s+in\s+(\d{1,2})\s+(day|week|hour)s?\b/i.exec(caption);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unitMs =
    match[2].toLowerCase() === "week"
      ? 7 * 86_400_000
      : match[2].toLowerCase() === "hour"
        ? 3_600_000
        : 86_400_000;
  const posted = Date.parse(postedAt);
  if (!Number.isFinite(posted)) return undefined;
  return toIsoDate(new Date(posted + amount * unitMs));
}

/** Events name a venue; announcements about application cycles do not. */
export function parseEventLocation(caption: string): string | undefined {
  const match = /\b(?:in|at)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),?\s+([A-Z]{2})\b/.exec(
    caption,
  );
  if (match) return `${match[1]}, ${match[2]}`;
  if (/\b(virtual|online|remote)\b/i.test(caption)) return "Online";
  return undefined;
}

export function parseRoles(sentence: string): string[] {
  const labels: string[] = [];
  for (const role of ROLE_SIGNALS) {
    if (role.pattern.test(sentence) && !labels.includes(role.label)) {
      labels.push(role.label);
    }
  }
  return labels.slice(0, 3);
}

function classify(caption: string): DraftOpportunity["kind"] | undefined {
  return KIND_SIGNALS.find((entry) => entry.pattern.test(caption))?.kind;
}

function isAnnouncement(caption: string): boolean {
  return ANNOUNCEMENT_SIGNALS.some((pattern) => pattern.test(caption));
}

function listPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export interface ParsedPost {
  kind: DraftOpportunity["kind"];
  /** The sentence the card is built from, used as the description. */
  headline: string;
  companies: string[];
  roles: string[];
  term?: string;
  deadline?: string;
  location?: string;
}

/**
 * Turns one caption into the pieces a draft needs, or null when the post is not
 * an opportunity announcement. Only the announcement sentence is carried
 * forward: later sentences wander into new-grad and sponsorship talk that would
 * mislead the eligibility rules.
 */
export function parsePost(
  caption: string,
  today: Date,
  postedAt?: string,
): ParsedPost | null {
  if (!caption.trim() || !isAnnouncement(caption)) return null;

  const sentences = splitSentences(caption);
  const headline =
    sentences.find((sentence) => isAnnouncement(sentence)) ?? sentences[0];
  if (!headline) return null;

  const kind = classify(headline) ?? classify(caption);
  if (!kind) return null;

  const term = parseTerm(headline, today) ?? parseTerm(caption, today);
  if (kind === "internship" && !term) return null;

  // A window that already closed is not an opportunity any more.
  const deadline = parseRelativeDeadline(headline, postedAt);
  if (deadline && Date.parse(deadline) < today.getTime()) return null;

  return {
    kind,
    headline,
    companies: parseCompanies(headline),
    roles: parseRoles(headline),
    term,
    deadline,
    location: kind === "internship" ? undefined : parseEventLocation(caption),
  };
}

function draftsForPost(
  post: ParsedPost,
  media: { shortcode: string; postedAt?: string },
  account: { username: string; label: string },
): DraftOpportunity[] {
  const url = `https://www.instagram.com/p/${media.shortcode}/`;
  const source = {
    id: `instagram:${account.username}`,
    name: account.label,
    url: `https://www.instagram.com/${account.username}/`,
  };

  const roles = post.roles.length ? post.roles : ["early career tech"];
  const rolePhrase = listPhrase(roles);

  const common = {
    kind: post.kind,
    url,
    description: post.headline,
    // An application cycle announcement is US-wide by nature and never names a
    // city. An event does have a venue, so an unstated one stays unstated and
    // the region rule flags it for a manual check.
    locations: [
      post.kind === "internship"
        ? "United States"
        : (post.location ?? "Location not stated in the post"),
    ],
    term: post.term,
    deadline: post.deadline,
    datesConfirmed: true,
    postedAt: media.postedAt,
    source,
  } satisfies Partial<DraftOpportunity>;

  const tags = [
    post.kind,
    ...(post.term ? [post.term] : []),
    "just announced",
    `via @${account.username}`,
  ];

  if (!post.companies.length) {
    return [
      {
        ...common,
        title: post.headline.replace(/\s+/g, " ").slice(0, 140),
        tags,
      },
    ];
  }

  return post.companies.map((company) => ({
    ...common,
    title: `${company} — ${post.term ?? ""} ${rolePhrase} ${
      post.kind === "internship" ? "internship applications open" : post.kind
    }`
      .replace(/\s+/g, " ")
      .trim(),
    organization: company,
    description: `${post.headline} Roles named in the post: ${rolePhrase}.`,
    tags: [...tags, company],
  }));
}

async function collectAccount(
  username: string,
  { today, log }: SourceContext,
): Promise<DraftOpportunity[]> {
  const headers: Record<string, string> = {
    "x-ig-app-id": WEB_APP_ID,
    accept: "*/*",
    referer: `https://www.instagram.com/${username}/`,
  };
  // Optional: a session cookie only becomes necessary if Instagram starts
  // gating the public profile endpoint for this IP.
  if (process.env.INSTAGRAM_SESSIONID) {
    headers.cookie = `sessionid=${process.env.INSTAGRAM_SESSIONID}`;
  }

  const { value: payload, cached, stale, storedAt } = await withCache(
    `instagram:${username}`,
    CACHE_TTL_MS,
    () =>
      fetchJsonResilient<ProfileResponse>(
        `${PROFILE_URL}?username=${encodeURIComponent(username)}`,
        // Instagram answers 429 to bursts, and retrying immediately makes that
        // worse, so a failure falls back to the last good copy instead.
        { timeoutMs: 25_000, retries: 0, headers },
      ),
    { staleOnError: true },
  );

  const user = payload.data?.user;
  const edges = user?.edge_owner_to_timeline_media?.edges ?? [];
  if (!edges.length) {
    log(`@${username}: no posts returned (profile may be gated)`);
    return [];
  }

  const label = `@${username} on Instagram`;
  const drafts: DraftOpportunity[] = [];
  let announcements = 0;

  for (const edge of edges) {
    const node = edge.node;
    if (!node?.shortcode) continue;
    const caption = (node.edge_media_to_caption?.edges ?? [])
      .map((entry) => entry.node?.text ?? "")
      .join(" ")
      .trim();

    const postedAt = node.taken_at_timestamp
      ? toIsoDate(new Date(node.taken_at_timestamp * 1000))
      : undefined;
    const parsed = parsePost(caption, today, postedAt);
    if (!parsed) continue;
    announcements += 1;

    drafts.push(
      ...draftsForPost(parsed, { shortcode: node.shortcode, postedAt }, { username, label }),
    );
  }

  const ageHours = storedAt ? Math.round((Date.now() - storedAt) / 3_600_000) : 0;
  const provenance = stale
    ? ` (rate limited, using a ${ageHours}h-old copy)`
    : cached
      ? " (disk cache)"
      : "";
  log(
    `@${username}: ${edges.length} recent posts${provenance}, ` +
      `${announcements} announcements, ${drafts.length} leads`,
  );
  return drafts;
}

function accounts(): string[] {
  const configured = process.env.INSTAGRAM_ACCOUNTS?.split(",")
    .map((entry) => entry.trim().replace(/^@/, ""))
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_ACCOUNTS;
}

export const instagramSource: OpportunitySource = {
  id: "instagram",
  name: "Instagram opportunity accounts",
  url: "https://www.instagram.com/zero2sudo/",
  kinds: ["internship", "hackathon", "conference"],
  async collect(context) {
    const drafts: DraftOpportunity[] = [];
    for (const username of accounts()) {
      try {
        drafts.push(...(await collectAccount(username, context)));
      } catch (error) {
        context.log(`@${username} unavailable (${(error as Error).message})`);
      }
    }
    return drafts;
  },
};

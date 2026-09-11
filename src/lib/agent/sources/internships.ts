import { withCache } from "../cache";
import { toIsoDate } from "../dates";
import { fetchJson } from "../http";
import type { DraftOpportunity, OpportunitySource, SourceContext } from "./types";

interface Listing {
  id?: string;
  title?: string;
  company_name?: string;
  url?: string;
  locations?: string[];
  terms?: string[];
  season?: string;
  active?: boolean;
  is_visible?: boolean;
  date_posted?: number;
  date_updated?: number;
  category?: string;
  degrees?: string[];
  sponsorship?: string;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const GRADUATE_ONLY_DEGREES = new Set(["Master's", "PhD", "MBA", "JD", "MD", "PharmD"]);

function termYears(terms: string[]): number[] {
  return terms
    .map((term) => Number(term.match(/(\d{4})/)?.[1]))
    .filter((year): year is number => Number.isFinite(year));
}

function repoCandidates(years: number[]): string[] {
  const unique = Array.from(new Set(years)).sort();
  return unique.map((year) => `Summer${year}-Internships`);
}

function listingTerms(listing: Listing, repoYear: string): string[] {
  if (listing.terms?.length) return listing.terms;
  if (!listing.season) return [`Summer ${repoYear}`.trim()];
  // Some feeds put the term in `season` without a year; the repo name carries it.
  return /\d{4}/.test(listing.season)
    ? [listing.season]
    : [`${listing.season} ${repoYear}`.trim()];
}

function bachelorsFriendly(listing: Listing): boolean {
  const degrees = listing.degrees ?? [];
  if (!degrees.length) return true;
  return degrees.some((degree) => !GRADUATE_ONLY_DEGREES.has(degree));
}

async function collectRepo(
  owner: string,
  repo: string,
  sourceName: string,
  { profile, log }: SourceContext,
): Promise<DraftOpportunity[]> {
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/dev/.github/scripts/listings.json`;
  const { value: listings, cached } = await withCache(
    `internships:${owner}/${repo}`,
    CACHE_TTL_MS,
    () => fetchJson<Listing[]>(rawUrl, { timeoutMs: 60_000, retries: 2 }),
  );

  const repoYear = repo.match(/(\d{4})/)?.[1] ?? "";
  log(
    `${owner}/${repo}: ${listings.length} listings${cached ? " (disk cache)" : ""}`,
  );

  const wanted = new Set(profile.internshipTerms.map((term) => term.toLowerCase()));
  const drafts: DraftOpportunity[] = [];

  for (const listing of listings) {
    if (!listing.title || !listing.url) continue;
    if (listing.active === false || listing.is_visible === false) continue;
    if (!bachelorsFriendly(listing)) continue;

    const terms = listingTerms(listing, repoYear);
    const term = terms.find((candidate) => wanted.has(candidate.toLowerCase()));
    if (!term) continue;

    const postedAt = listing.date_posted
      ? toIsoDate(new Date(listing.date_posted * 1000))
      : undefined;

    drafts.push({
      kind: "internship",
      title: listing.title,
      organization: listing.company_name,
      url: listing.url,
      locations: listing.locations?.length ? listing.locations : ["Unspecified"],
      term,
      datesConfirmed: true,
      postedAt,
      tags: [
        "internship",
        term,
        ...(listing.category ? [listing.category] : []),
        ...(listing.sponsorship && listing.sponsorship !== "Other"
          ? [listing.sponsorship]
          : []),
      ],
      description: [listing.title, listing.category, listing.company_name]
        .filter(Boolean)
        .join(" · "),
      source: {
        id: `github:${owner}`,
        name: sourceName,
        url: `https://github.com/${owner}/${repo}`,
      },
    });
  }

  return drafts;
}

export const internshipSource: OpportunitySource = {
  id: "internship-boards",
  name: "Open-source internship boards",
  url: "https://github.com/SimplifyJobs",
  kinds: ["internship"],
  async collect(context) {
    const years = termYears(context.profile.internshipTerms);
    const repos = repoCandidates(years.length ? years : [new Date().getUTCFullYear() + 1]);
    const drafts: DraftOpportunity[] = [];
    const feeds: { owner: string; label: string }[] = [
      { owner: "SimplifyJobs", label: "SimplifyJobs internship list" },
      { owner: "vanshb03", label: "vanshb03 internship list" },
    ];

    for (const feed of feeds) {
      let collected = false;
      // Each feed keeps one rolling repo that already spans several terms, so the
      // first candidate that resolves is the whole feed.
      for (const repo of repos) {
        try {
          drafts.push(...(await collectRepo(feed.owner, repo, feed.label, context)));
          collected = true;
          break;
        } catch (error) {
          context.log(`${feed.owner}/${repo} unavailable (${(error as Error).message})`);
        }
      }
      if (!collected) context.log(`${feed.owner}: no usable feed`);
    }

    return drafts;
  },
};

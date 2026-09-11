import { createHash } from "node:crypto";

import { curatedFundingPages } from "./sources/curated";
import {
  checkTravelSupport,
  extractEventDates,
  mapWithConcurrency,
  resolveLocationFromPage,
} from "./enrich";
import { daysBetween, describeCountdown, formatDateRange } from "./dates";
import { inHomeRegion, isUnitedStates, isVirtual, parseLocation, US_STATES } from "./geo";
import { evaluate, needsTravelCheck } from "./rules";
import { priorityScore, selectBoard } from "./rank";
import { selectReasoner } from "./reasoner";
import { SOURCES, type DraftOpportunity } from "./sources";
import { TRACK_LABELS } from "./taxonomy";
import type {
  AgentEvent,
  Opportunity,
  OpportunityKind,
  Profile,
  RunSummary,
  SourceReport,
  TraceStep,
} from "./types";

export interface RunOptions {
  profile: Profile;
  today?: Date;
  emit?: (event: AgentEvent) => void;
  /** Page fetches allowed during enrichment. Lower it for quick runs. */
  travelCheckBudget?: number;
  keepPerKind?: number;
}

export interface RunResult {
  run: RunSummary;
  opportunities: Opportunity[];
}

const DEFAULT_TRAVEL_BUDGET = 40;
const DEFAULT_KEEP_PER_KIND = 60;
const ENRICH_CONCURRENCY = 6;

function stableId(draft: DraftOpportunity): string {
  const seed = [draft.kind, draft.title, draft.organization, draft.url, draft.term]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
  return createHash("sha1").update(seed).digest("hex").slice(0, 12);
}

/**
 * The same event often appears on several feeds under slightly different
 * organizers, so the key is title plus edition rather than title plus source.
 */
function dedupeKey(draft: DraftOpportunity): string {
  const title = draft.title.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const edition = draft.term ?? draft.startDate?.slice(0, 4) ?? "";
  return [draft.kind, title, edition].join("|");
}

function toOpportunity(draft: DraftOpportunity): Opportunity {
  const locations = draft.locations.map(parseLocation);
  return {
    id: stableId(draft),
    kind: draft.kind,
    title: draft.title.trim(),
    organization: draft.organization?.trim(),
    url: draft.url,
    description: draft.description,
    locations,
    startDate: draft.startDate,
    endDate: draft.endDate,
    dateLabel:
      draft.dateLabel ?? formatDateRange(draft.startDate, draft.endDate) ?? undefined,
    datesConfirmed: draft.datesConfirmed ?? Boolean(draft.startDate),
    deadline: draft.deadline,
    deadlineLabel: draft.deadlineLabel,
    term: draft.term,
    reward: draft.reward,
    tags: Array.from(new Set((draft.tags ?? []).filter(Boolean))).slice(0, 8),
    source: draft.source,
    postedAt: draft.postedAt,
    travel: {
      status: "unknown",
      evidence: [],
      note: "Not checked yet.",
    },
    eligibility: { decision: "needs_verification", summary: "Not evaluated yet.", verdicts: [] },
    fit: { score: 0, tracks: [], reasons: [], reasonedBy: "pending" },
  };
}

class Tracer {
  readonly steps: TraceStep[] = [];

  constructor(private readonly emit?: (event: AgentEvent) => void) {}

  start(id: string, label: string, detail?: string): TraceStep {
    const step: TraceStep = {
      id,
      label,
      detail,
      status: "running",
      startedAt: Date.now(),
      facts: [],
    };
    this.steps.push(step);
    this.emit?.({ type: "step", step: { ...step } });
    return step;
  }

  fact(step: TraceStep, message: string) {
    step.facts.push(message);
    this.emit?.({ type: "step", step: { ...step, facts: [...step.facts] } });
  }

  finish(step: TraceStep, status: TraceStep["status"], detail?: string) {
    step.status = status;
    step.endedAt = Date.now();
    step.durationMs = step.endedAt - step.startedAt;
    if (detail) step.detail = detail;
    this.emit?.({ type: "step", step: { ...step, facts: [...step.facts] } });
  }
}

function regionLabel(profile: Profile): string {
  return profile.homeRegion.map((code) => US_STATES[code] ?? code).join(", ");
}

export async function runAgent(options: RunOptions): Promise<RunResult> {
  const { profile, emit } = options;
  const today = options.today ?? new Date();
  const travelBudget = options.travelCheckBudget ?? DEFAULT_TRAVEL_BUDGET;
  const keepPerKind = options.keepPerKind ?? DEFAULT_KEEP_PER_KIND;
  const startedAt = Date.now();
  const tracer = new Tracer(emit);
  const warnings: string[] = [];
  const reasoner = selectReasoner();

  // 1. Plan
  const plan = tracer.start(
    "plan",
    "Build the search plan",
    `${reasoner.label} · graduation ${profile.graduationYear}`,
  );
  tracer.fact(plan, `Focus areas: ${profile.interests.map((t) => TRACK_LABELS[t]).join(", ")}`);
  tracer.fact(
    plan,
    `Events must sit in ${regionLabel(profile)}${
      profile.requireTravelSupportOutsideRegion
        ? ", or elsewhere in the US with documented travel funding"
        : ""
    }`,
  );
  tracer.fact(plan, `Internship terms: ${profile.internshipTerms.join(", ")} (US-wide)`);
  if (profile.allowVirtualEvents) tracer.fact(plan, "Online events allowed: no travel needed");
  tracer.finish(plan, "ok", `${SOURCES.length} sources queued`);

  // 2. Collect
  const collect = tracer.start("collect", "Pull live listings from every source");
  const reports: SourceReport[] = [];
  const drafts: DraftOpportunity[] = [];

  await Promise.all(
    SOURCES.map(async (source) => {
      const began = Date.now();
      const logs: string[] = [];
      try {
        const batch = await source.collect({
          profile,
          today,
          log: (message) => logs.push(message),
        });
        drafts.push(...batch);
        const report: SourceReport = {
          id: source.id,
          name: source.name,
          url: source.url,
          status: "ok",
          fetched: batch.length,
          kept: batch.length,
          durationMs: Date.now() - began,
        };
        reports.push(report);
        emit?.({ type: "source", report });
        tracer.fact(collect, `${source.name}: ${batch.length} listings`);
        for (const line of logs) tracer.fact(collect, `  ${line}`);
      } catch (error) {
        const message = (error as Error).message;
        const report: SourceReport = {
          id: source.id,
          name: source.name,
          url: source.url,
          status: "error",
          fetched: 0,
          kept: 0,
          durationMs: Date.now() - began,
          error: message,
        };
        reports.push(report);
        emit?.({ type: "source", report });
        warnings.push(`${source.name} failed: ${message}`);
        tracer.fact(collect, `${source.name}: failed (${message})`);
      }
    }),
  );

  const okSources = reports.filter((report) => report.status === "ok").length;
  tracer.finish(
    collect,
    okSources === reports.length ? "ok" : okSources ? "warn" : "error",
    `${drafts.length} raw listings from ${okSources}/${reports.length} sources`,
  );

  if (!drafts.length) {
    throw new Error("No source returned any listings; check network access.");
  }

  // 3. Normalize
  const normalize = tracer.start("normalize", "Normalize locations, dates and duplicates");
  const byKey = new Map<string, Opportunity>();
  for (const draft of drafts) {
    const key = dedupeKey(draft);
    const candidate = toOpportunity(draft);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    // Keep whichever copy carries more usable structure. A resolved US state
    // matters most, because every location rule depends on it.
    const weigh = (item: Opportunity) =>
      (item.locations.some((location) => location.state) ? 4 : 0) +
      (item.startDate ? 2 : 0) +
      Math.min(item.tags.length, 4) * 0.25;
    const difference = weigh(candidate) - weigh(existing);
    // Equally rich copies are broken by recency: the same alert posted twice
    // should show the newer posting date.
    const fresher =
      (Date.parse(candidate.postedAt ?? "") || 0) > (Date.parse(existing.postedAt ?? "") || 0);
    if (difference > 0 || (difference === 0 && fresher)) byKey.set(key, candidate);
  }

  let opportunities = [...byKey.values()];
  const resolvedStates = opportunities.filter((item) =>
    item.locations.some((location) => location.state),
  ).length;
  tracer.fact(normalize, `${drafts.length - opportunities.length} duplicates merged`);
  tracer.fact(normalize, `${resolvedStates} listings resolved to a US state`);
  tracer.finish(normalize, "ok", `${opportunities.length} unique listings`);

  // 4. Score against the profile
  const classify = tracer.start("classify", `Score relevance with ${reasoner.label}`);
  const classifications = await reasoner.classify(
    opportunities.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      organization: item.organization,
      text: [item.description, item.tags.join(", ")].filter(Boolean).join(" · "),
      term: item.term,
    })),
    profile,
  );
  const byId = new Map(classifications.map((entry) => [entry.id, entry]));
  for (const item of opportunities) {
    const result = byId.get(item.id);
    item.fit = {
      score: result?.score ?? 0,
      tracks: result?.tracks ?? [],
      reasons: result?.reasons ?? [],
      reasonedBy: reasoner.label,
    };
  }
  const onInterest = opportunities.filter(
    (item) => item.fit.score >= profile.minimumFitScore,
  );
  tracer.fact(
    classify,
    `${onInterest.length} listings clear your fit threshold of ${profile.minimumFitScore}`,
  );
  tracer.finish(classify, "ok", `${opportunities.length} listings scored`);

  // 5. Drop the clearly-out-of-scope before spending HTTP requests
  const screen = tracer.start("screen", "Apply your hard filters");
  const todayIso = today.toISOString().slice(0, 10);
  const before = opportunities.length;
  opportunities = opportunities.filter((item) => {
    if (item.fit.score < profile.minimumFitScore) return false;
    if (item.kind === "internship") {
      return item.locations.some(
        (location) => isUnitedStates(location) || isVirtual(location) || !location.country,
      );
    }
    if (item.datesConfirmed) {
      const end = item.endDate ?? item.startDate;
      if (end && end < todayIso) return false;
    }
    const foreignOnly =
      item.locations.length > 0 &&
      item.locations.every(
        (location) => location.country === "NON_US" && !isVirtual(location),
      );
    return !foreignOnly;
  });
  tracer.fact(screen, `${before - opportunities.length} listings dropped as out of scope`);
  tracer.fact(
    screen,
    `${
      opportunities.filter((item) =>
        item.locations.some((location) => inHomeRegion(location, profile.homeRegion)),
      ).length
    } listings are already inside ${regionLabel(profile)}`,
  );
  tracer.finish(screen, "ok", `${opportunities.length} candidates survive`);

  // 6. Read event pages to settle travel funding, dates and vague locations
  const enrich = tracer.start(
    "enrich",
    "Verify travel funding, dates and unclear locations",
  );

  const undatedSeries = opportunities.filter(
    (item) => !item.datesConfirmed && item.kind !== "internship",
  );
  if (undatedSeries.length) {
    const dateResults = await mapWithConcurrency(
      undatedSeries,
      ENRICH_CONCURRENCY,
      async (item) => ({ item, dates: await extractEventDates(item.url, today) }),
    );
    let confirmed = 0;
    for (const { item, dates } of dateResults) {
      if (!dates.startDate) continue;
      item.startDate = dates.startDate;
      item.endDate = dates.endDate ?? dates.startDate;
      item.dateLabel = formatDateRange(item.startDate, item.endDate);
      item.dateEvidence = dates.evidence;
      item.datesConfirmed = true;
      confirmed += 1;
    }
    tracer.fact(
      enrich,
      `Read ${undatedSeries.length} recurring event sites, confirmed dates for ${confirmed}`,
    );
  }

  const unresolved = opportunities.filter(
    (item) =>
      item.kind !== "internship" &&
      item.locations.every((location) => !location.country && !isVirtual(location)),
  );
  if (unresolved.length) {
    const slice = unresolved.slice(0, 12);
    const found = await mapWithConcurrency(slice, ENRICH_CONCURRENCY, async (item) => ({
      item,
      resolved: await resolveLocationFromPage(item.url),
    }));
    let placed = 0;
    for (const { item, resolved } of found) {
      if (!resolved.state) continue;
      item.locations = [
        {
          ...item.locations[0],
          city: resolved.city ?? item.locations[0].city,
          state: resolved.state,
          stateName: US_STATES[resolved.state],
          country: "US",
        },
      ];
      item.locationEvidence = resolved.quote;
      placed += 1;
    }
    tracer.fact(enrich, `Placed ${placed}/${slice.length} vague venue names in a US state`);
  }

  const fundingPages = curatedFundingPages();
  const travelCandidates = opportunities
    .filter(
      (item) => item.kind !== "internship" && needsTravelCheck(item.locations, profile),
    )
    .sort((a, b) => {
      // Events on the curated list exist because of their funding programs, so
      // they are always worth a request before the long tail.
      const curatedFirst =
        Number(b.source.id === "curated") - Number(a.source.id === "curated");
      if (curatedFirst !== 0) return curatedFirst;
      return priorityScore(b, profile, today) - priorityScore(a, profile, today);
    });
  const travelSlice = travelCandidates.slice(0, travelBudget);

  if (travelSlice.length) {
    const checks = await mapWithConcurrency(
      travelSlice,
      ENRICH_CONCURRENCY,
      async (item) => {
        const extra = fundingPages[item.url] ? [fundingPages[item.url]] : [];
        return { item, travel: await checkTravelSupport(item.url, extra) };
      },
    );
    let confirmed = 0;
    for (const { item, travel } of checks) {
      item.travel = travel;
      if (travel.status === "confirmed") confirmed += 1;
    }
    tracer.fact(
      enrich,
      `Checked ${travelSlice.length} out-of-region events for travel funding, confirmed ${confirmed}`,
    );
    if (travelCandidates.length > travelSlice.length) {
      const skipped = travelCandidates.length - travelSlice.length;
      tracer.fact(
        enrich,
        `${skipped} lower-priority out-of-region events left unverified this run`,
      );
      for (const item of travelCandidates.slice(travelBudget)) {
        item.travel = {
          status: "unknown",
          evidence: [],
          note: "Outside the fetch budget for this run; re-run to verify.",
        };
      }
    }
  } else {
    tracer.fact(enrich, "No out-of-region events needed a travel check");
  }

  for (const item of opportunities) {
    if (
      item.kind !== "internship" &&
      item.locations.some((location) => inHomeRegion(location, profile.homeRegion))
    ) {
      item.travel = {
        status: "not_needed",
        evidence: [],
        note: "Inside your home region, so no travel funding is required.",
      };
    }
  }
  tracer.finish(enrich, "ok", `${travelSlice.length} travel checks completed`);

  // 7. Apply the rules engine
  const decide = tracer.start("decide", "Run the eligibility rules");
  for (const item of opportunities) {
    item.eligibility = evaluate(item, profile, today);
    const anchor = item.deadline ?? item.startDate;
    const days = daysBetween(today, anchor);
    item.daysUntil = days;
    if (!item.deadlineLabel && item.kind !== "internship") {
      item.deadlineLabel = describeCountdown(days);
    }
  }
  opportunities = opportunities.filter(
    (item) => item.eligibility.decision !== "excluded",
  );

  const kept = selectBoard(opportunities, profile, today, keepPerKind);

  const counts = {
    collected: drafts.length,
    eligible: kept.filter((item) => item.eligibility.decision === "eligible").length,
    needsVerification: kept.filter(
      (item) => item.eligibility.decision === "needs_verification",
    ).length,
    excluded: opportunities.length - kept.length,
    byKind: {
      hackathon: kept.filter((item) => item.kind === "hackathon").length,
      internship: kept.filter((item) => item.kind === "internship").length,
      conference: kept.filter((item) => item.kind === "conference").length,
    } as Record<OpportunityKind, number>,
  };

  tracer.fact(decide, `${counts.eligible} fully eligible`);
  tracer.fact(decide, `${counts.needsVerification} need a manual check`);
  tracer.finish(decide, "ok", `${kept.length} opportunities on the board`);

  // 8. Report
  const report = tracer.start("report", "Write the briefing");
  const inRegion = kept.filter((item) =>
    item.locations.some((location) => inHomeRegion(location, profile.homeRegion)),
  ).length;
  const urgent = kept.filter(
    (item) => item.daysUntil !== undefined && item.daysUntil >= 0 && item.daysUntil <= 14,
  ).length;
  const facts = [
    `${counts.eligible} of ${kept.length} listings clear every rule.`,
    `${inRegion} sit inside ${regionLabel(profile)}.`,
    `${counts.byKind.internship} are ${profile.internshipTerms[0]} internships anywhere in the US.`,
    `${urgent} have something due in the next two weeks.`,
  ];
  const digest = await reasoner.digest(facts, profile);
  tracer.finish(report, "ok", "Briefing ready");

  const finishedAt = Date.now();
  const run: RunSummary = {
    id: createHash("sha1").update(String(startedAt)).digest("hex").slice(0, 10),
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    reasoner: reasoner.label,
    counts,
    sources: reports.sort((a, b) => a.name.localeCompare(b.name)),
    steps: tracer.steps,
    digest,
    warnings,
  };

  emit?.({ type: "done", run, opportunities: kept });
  return { run, opportunities: kept };
}

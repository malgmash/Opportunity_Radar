import { daysBetween } from "./dates";
import { inHomeRegion, isUnitedStates, isVirtual } from "./geo";
import type { Opportunity, Profile } from "./types";

/**
 * Ranking is deliberately separate from fit: fit answers "is this my kind of
 * work", priority answers "should I act on it this week".
 */
export function priorityScore(
  opportunity: Opportunity,
  profile: Profile,
  today: Date,
): number {
  let score = opportunity.fit.score * 0.45;

  const anchor =
    opportunity.deadline ?? opportunity.startDate ?? opportunity.postedAt;
  const days = daysBetween(today, anchor);
  if (days !== undefined && days >= 0) {
    if (days <= 7) score += 26;
    else if (days <= 21) score += 20;
    else if (days <= 45) score += 13;
    else if (days <= 90) score += 7;
  }

  // Reachability is the point of the region rule, so it outweighs topical fit.
  if (opportunity.locations.some((location) => inHomeRegion(location, profile.homeRegion))) {
    score += 34;
  } else if (opportunity.travel.status === "confirmed") {
    score += 18;
  } else if (opportunity.locations.some(isUnitedStates)) {
    score += 4;
  } else if (opportunity.locations.some(isVirtual)) {
    score += 2;
  }

  if (opportunity.eligibility.decision === "eligible") score += 12;
  else if (opportunity.eligibility.decision === "needs_verification") score += 2;

  if (!opportunity.datesConfirmed) score -= 8;
  if (opportunity.reward) score += 4;

  // Recently posted internships are far more likely to still be open.
  const postedDays = daysBetween(today, opportunity.postedAt);
  if (postedDays !== undefined && postedDays > -21) score += 6;

  return Math.round(score);
}

/** Social accounts that announce openings the moment they go live. */
export function isAlertSource(opportunity: Opportunity): boolean {
  return opportunity.source.id.startsWith("instagram:");
}

export function sortOpportunities(
  opportunities: Opportunity[],
  profile: Profile,
  today: Date,
): Opportunity[] {
  const rank = new Map(
    opportunities.map((item) => [item.id, priorityScore(item, profile, today)]),
  );
  const order: Record<string, number> = {
    eligible: 0,
    needs_verification: 1,
    excluded: 2,
  };
  return [...opportunities].sort((a, b) => {
    const decision = order[a.eligibility.decision] - order[b.eligibility.decision];
    if (decision !== 0) return decision;
    return (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0);
  });
}

/**
 * Fills the board with quotas per kind rather than a flat cut. A pure ranking
 * lets the long tail of online hackathons crowd out the two categories the
 * profile is actually built around: events near home, and out-of-region events
 * that pay for travel.
 */
export function selectBoard(
  opportunities: Opportunity[],
  profile: Profile,
  today: Date,
  limitPerKind: number,
): Opportunity[] {
  const kinds = new Set(opportunities.map((item) => item.kind));
  const board: Opportunity[] = [];

  for (const kind of kinds) {
    const items = opportunities.filter((item) => item.kind === kind);
    const byPriority = [...items].sort(
      (a, b) => priorityScore(b, profile, today) - priorityScore(a, profile, today),
    );

    const picked = new Set<string>();
    const take = (candidates: Opportunity[], quota: number) => {
      let taken = 0;
      for (const item of candidates) {
        if (taken >= quota || picked.size >= limitPerKind) break;
        if (picked.has(item.id)) continue;
        picked.add(item.id);
        taken += 1;
      }
    };

    take(
      byPriority.filter((item) =>
        item.locations.some((location) => inHomeRegion(location, profile.homeRegion)),
      ),
      Math.round(limitPerKind * 0.6),
    );
    take(
      byPriority.filter(
        (item) =>
          item.travel.status === "confirmed" || item.travel.status === "likely",
      ),
      Math.round(limitPerKind * 0.25),
    );
    // Curated entries exist because of their funding programs or regional
    // relevance; a site the agent cannot read should not delete them.
    take(
      byPriority.filter((item) => item.source.id === "curated"),
      Math.round(limitPerKind * 0.15),
    );
    // Alert accounts are followed for timing: "apps just opened at X" is worth
    // a slot even when a job board listing scores higher on paper.
    take(
      byPriority.filter((item) => isAlertSource(item)),
      Math.round(limitPerKind * 0.15),
    );
    take(byPriority, limitPerKind);

    board.push(...items.filter((item) => picked.has(item.id)));
  }

  return sortOpportunities(board, profile, today);
}

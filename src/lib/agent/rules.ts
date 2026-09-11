import { daysBetween, describeCountdown } from "./dates";
import { formatLocation, inHomeRegion, isUnitedStates, isVirtual, US_STATES } from "./geo";
import { standingForTerm } from "./profile";
import { offTargetSignals } from "./taxonomy";
import type {
  Eligibility,
  Opportunity,
  OpportunityLocation,
  Profile,
  RuleVerdict,
  VerdictStatus,
} from "./types";

function verdict(
  rule: string,
  label: string,
  status: VerdictStatus,
  detail: string,
): RuleVerdict {
  return { rule, label, status, detail };
}

function regionNames(homeRegion: string[]): string {
  return homeRegion.map((code) => US_STATES[code] ?? code).join(", ");
}

function interestVerdict(
  opportunity: Opportunity,
  profile: Profile,
): RuleVerdict {
  const { score, tracks } = opportunity.fit;
  if (score >= profile.minimumFitScore) {
    return verdict(
      "interest",
      "Matches your focus areas",
      "pass",
      tracks.length
        ? `Fit ${score}/100 across ${tracks.length} focus area${tracks.length > 1 ? "s" : ""}.`
        : `Fit ${score}/100 as adjacent technical work.`,
    );
  }
  return verdict(
    "interest",
    "Matches your focus areas",
    "fail",
    `Fit ${score}/100 is below your ${profile.minimumFitScore} threshold.`,
  );
}

function locationVerdicts(
  opportunity: Opportunity,
  profile: Profile,
): RuleVerdict[] {
  const { locations, travel } = opportunity;
  const inRegion = locations.filter((location) => inHomeRegion(location, profile.homeRegion));
  const domestic = locations.filter(isUnitedStates);
  // Anything the agent could not confirm as a US venue is treated the same as a
  // foreign one; a livestream ticket should not launder an unverified location.
  const foreignVenue = locations.filter(
    (location) => !isVirtual(location) && !isUnitedStates(location),
  );
  const virtualOk = profile.allowVirtualEvents && locations.some(isVirtual);

  if (inRegion.length) {
    return [
      verdict(
        "region",
        "Inside your home region",
        "pass",
        `${inRegion.map(formatLocation).join(", ")} is in ${regionNames(profile.homeRegion)}.`,
      ),
    ];
  }

  if (virtualOk) {
    // A European conference with a livestream ticket is not the same as an
    // online event, so it gets flagged rather than quietly accepted.
    if (foreignVenue.length) {
      return [
        verdict(
          "region",
          "Online track only",
          "warn",
          `The venue is ${foreignVenue.map(formatLocation).join(", ")}; only the online track is in scope.`,
        ),
      ];
    }
    return [
      verdict(
        "region",
        "No travel required",
        "pass",
        "Runs online, so the region rule does not apply.",
      ),
    ];
  }

  if (!domestic.length) {
    const unresolved = locations.filter(
      (location) => !location.country && location.mode === "in_person",
    );
    if (unresolved.length) {
      return [
        verdict(
          "region",
          "Location could not be confirmed",
          "warn",
          `The listing only gives "${unresolved[0].raw}", which the agent could not place in a US state.`,
        ),
      ];
    }
    return [
      verdict(
        "region",
        "Outside the United States",
        "fail",
        `${locations.map(formatLocation).join(", ")} is outside the US.`,
      ),
    ];
  }

  const where = domestic.map(formatLocation).join(", ");
  if (!profile.requireTravelSupportOutsideRegion) {
    return [
      verdict(
        "region",
        "Elsewhere in the US",
        "pass",
        `${where}. You have the travel requirement switched off.`,
      ),
    ];
  }

  const base = verdict(
    "region",
    "Outside your home region",
    "warn",
    `${where} is outside ${regionNames(profile.homeRegion)}, so it needs travel funding.`,
  );

  switch (travel.status) {
    case "confirmed":
      return [
        base,
        verdict(
          "travel",
          "Travel funding confirmed",
          "pass",
          `${travel.note} Matched "${travel.evidence[0]?.phrase}".`,
        ),
      ];
    case "likely":
      return [
        base,
        verdict("travel", "Travel funding likely", "warn", travel.note),
      ];
    case "not_offered":
      return [
        base,
        verdict("travel", "Travel funding declined", "fail", travel.note),
      ];
    default:
      return [
        base,
        verdict(
          "travel",
          "Travel funding unverified",
          "warn",
          travel.note || "No travel funding statement found on the event site.",
        ),
      ];
  }
}

function timingVerdict(opportunity: Opportunity, today: Date): RuleVerdict {
  if (!opportunity.datesConfirmed) {
    return verdict(
      "timing",
      "Dates not confirmed",
      "warn",
      "This is a recurring series and the agent could not read a date off the site yet.",
    );
  }

  const anchor = opportunity.deadline ?? opportunity.endDate ?? opportunity.startDate;
  const days = daysBetween(today, anchor);
  if (days === undefined) {
    return verdict("timing", "Dates not published", "warn", "No date published yet.");
  }
  if (days < 0) {
    return verdict(
      "timing",
      "Already closed",
      "fail",
      `Ended ${describeCountdown(days)}.`,
    );
  }
  return verdict(
    "timing",
    "Still open",
    "pass",
    `Next date is ${describeCountdown(days)}.`,
  );
}

function internshipVerdicts(
  opportunity: Opportunity,
  profile: Profile,
  today: Date,
): RuleVerdict[] {
  const verdicts: RuleVerdict[] = [];
  const domestic = opportunity.locations.filter(
    (location) => isUnitedStates(location) || isVirtual(location),
  );

  if (domestic.length) {
    verdicts.push(
      verdict(
        "usa",
        "Anywhere in the US",
        "pass",
        `${domestic.map(formatLocation).join(", ")}.`,
      ),
    );
  } else {
    const unresolved = opportunity.locations.filter((location) => !location.country);
    verdicts.push(
      unresolved.length
        ? verdict(
            "usa",
            "Location unclear",
            "warn",
            `Could not confirm "${unresolved[0].raw}" is in the US.`,
          )
        : verdict(
            "usa",
            "Outside the US",
            "fail",
            `${opportunity.locations.map(formatLocation).join(", ")} is outside the US.`,
          ),
    );
  }

  const term = opportunity.term;
  if (term && profile.internshipTerms.includes(term)) {
    const standing = standingForTerm(term, profile.graduationYear);
    verdicts.push(
      verdict(
        "term",
        "Eligible summer term",
        "pass",
        `${term} is your ${standing ?? "target"} summer as a ${profile.graduationYear} graduate.`,
      ),
    );
  } else {
    verdicts.push(
      verdict(
        "term",
        "Term mismatch",
        "fail",
        `${term ?? "Unlabelled term"} is not in ${profile.internshipTerms.join(", ")}.`,
      ),
    );
  }

  const stageSignals = offTargetSignals(
    [opportunity.title, opportunity.description].filter(Boolean).join(" "),
  );
  if (stageSignals.length) {
    verdicts.push(
      verdict(
        "career-stage",
        "Wrong career stage",
        "fail",
        `Listing targets ${stageSignals.join(", ")}.`,
      ),
    );
  } else {
    verdicts.push(
      verdict(
        "career-stage",
        `Open to ${profile.degree} students`,
        "pass",
        "No graduate-only or new-grad-only requirement detected.",
      ),
    );
  }

  const postedDays = opportunity.postedAt
    ? daysBetween(today, opportunity.postedAt)
    : undefined;
  if (postedDays !== undefined && postedDays < -150) {
    verdicts.push(
      verdict(
        "freshness",
        "Posting may be stale",
        "warn",
        `Posted ${Math.abs(postedDays)} days ago; confirm it is still open.`,
      ),
    );
  }

  return verdicts;
}

function summarize(
  opportunity: Opportunity,
  verdicts: RuleVerdict[],
  profile: Profile,
): string {
  const failed = verdicts.find((entry) => entry.status === "fail");
  if (failed) return failed.detail;

  const warned = verdicts.filter((entry) => entry.status === "warn");
  if (warned.length) return warned[0].detail;

  if (opportunity.kind === "internship") {
    return `Summer ${opportunity.term?.match(/\d{4}/)?.[0] ?? ""} role in the US that fits your ${profile.degree} timeline.`.replace(
      /\s+/g,
      " ",
    );
  }

  const region = verdicts.find((entry) => entry.rule === "region");
  return region?.detail ?? "Meets every rule in your profile.";
}

export function evaluate(
  opportunity: Opportunity,
  profile: Profile,
  today: Date,
): Eligibility {
  const verdicts: RuleVerdict[] = [interestVerdict(opportunity, profile)];

  if (opportunity.kind === "internship") {
    verdicts.push(...internshipVerdicts(opportunity, profile, today));
  } else {
    verdicts.push(timingVerdict(opportunity, today));
    verdicts.push(...locationVerdicts(opportunity, profile));
  }

  const hasFail = verdicts.some((entry) => entry.status === "fail");
  const hasWarn = verdicts.some((entry) => entry.status === "warn");
  const decision = hasFail ? "excluded" : hasWarn ? "needs_verification" : "eligible";

  return {
    decision,
    summary: summarize(opportunity, verdicts, profile),
    verdicts,
  };
}

/** True when an item is worth spending an HTTP request on during enrichment. */
export function needsTravelCheck(
  locations: OpportunityLocation[],
  profile: Profile,
): boolean {
  if (!profile.requireTravelSupportOutsideRegion) return false;
  if (locations.some((location) => inHomeRegion(location, profile.homeRegion))) return false;
  if (profile.allowVirtualEvents && locations.some(isVirtual)) return false;
  return locations.some(isUnitedStates) || locations.some((location) => !location.country);
}

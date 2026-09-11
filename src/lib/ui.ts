import type { EligibilityDecision, Opportunity, OpportunityKind } from "./agent/types";

export const KIND_LABELS: Record<OpportunityKind, string> = {
  hackathon: "Hackathon",
  internship: "Internship",
  conference: "Conference",
};

export const KIND_PLURALS: Record<OpportunityKind, string> = {
  hackathon: "Hackathons",
  internship: "Internships",
  conference: "Conferences",
};

export const DECISION_LABELS: Record<EligibilityDecision, string> = {
  eligible: "Meets every rule",
  needs_verification: "Needs a check",
  excluded: "Filtered out",
};

export const DECISION_CLASSES: Record<EligibilityDecision, string> = {
  eligible:
    "border-emerald-600/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  needs_verification:
    "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  excluded: "border-border bg-muted text-muted-foreground",
};

export const VERDICT_CLASSES = {
  pass: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  fail: "text-rose-700 dark:text-rose-400",
} as const;

export function relativeTime(iso: string | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function urgencyTone(days: number | undefined): string {
  if (days === undefined) return "text-muted-foreground";
  if (days < 0) return "text-muted-foreground";
  if (days <= 7) return "text-rose-700 dark:text-rose-400";
  if (days <= 21) return "text-amber-700 dark:text-amber-400";
  return "text-muted-foreground";
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function travelLabel(opportunity: Opportunity): string | undefined {
  switch (opportunity.travel.status) {
    case "confirmed":
      return "Travel funded";
    case "likely":
      return "Travel funding likely";
    case "not_offered":
      return "No travel funding";
    case "not_needed":
      return undefined;
    default:
      return undefined;
  }
}

export type OpportunityKind = "hackathon" | "internship" | "conference";

export type Track =
  | "data-analysis"
  | "software-engineering"
  | "product-management"
  | "adjacent";

export type LocationMode = "in_person" | "virtual" | "hybrid" | "unknown";

export interface OpportunityLocation {
  raw: string;
  city?: string;
  /** Two-letter USPS code when the location resolves to a US state. */
  state?: string;
  stateName?: string;
  /** ISO 3166-1 alpha-2, `US` for domestic locations. */
  country?: string;
  mode: LocationMode;
}

export type TravelSupportStatus =
  | "confirmed"
  | "likely"
  | "unknown"
  | "not_offered"
  | "not_needed";

export interface TravelEvidence {
  phrase: string;
  quote: string;
  sourceUrl: string;
}

export interface TravelSupport {
  status: TravelSupportStatus;
  evidence: TravelEvidence[];
  note: string;
  checkedAt?: string;
  pagesChecked?: string[];
}

export type VerdictStatus = "pass" | "warn" | "fail";

export interface RuleVerdict {
  rule: string;
  label: string;
  status: VerdictStatus;
  detail: string;
}

export type EligibilityDecision = "eligible" | "needs_verification" | "excluded";

export interface Eligibility {
  decision: EligibilityDecision;
  summary: string;
  verdicts: RuleVerdict[];
}

export interface Fit {
  score: number;
  tracks: Track[];
  reasons: string[];
  reasonedBy: string;
}

export interface SourceRef {
  id: string;
  name: string;
  url: string;
}

export interface Opportunity {
  id: string;
  kind: OpportunityKind;
  title: string;
  organization?: string;
  url: string;
  description?: string;
  locations: OpportunityLocation[];
  startDate?: string;
  endDate?: string;
  dateLabel?: string;
  datesConfirmed: boolean;
  /** What the agent read off the event site to settle the date. */
  dateEvidence?: string;
  /** What the agent read off the event site to place an unlabelled venue. */
  locationEvidence?: string;
  deadline?: string;
  deadlineLabel?: string;
  term?: string;
  reward?: string;
  tags: string[];
  source: SourceRef;
  postedAt?: string;
  travel: TravelSupport;
  eligibility: Eligibility;
  fit: Fit;
  /** Days until the next action date (deadline, else start date). */
  daysUntil?: number;
}

export interface Profile {
  name: string;
  homeBase: string;
  graduationYear: number;
  degree: string;
  interests: Track[];
  /** USPS codes for the "no travel needed" home region. */
  homeRegion: string[];
  /** Out-of-region US events must document travel funding to stay eligible. */
  requireTravelSupportOutsideRegion: boolean;
  /** Virtual events cost nothing to attend, so they can bypass the region rule. */
  allowVirtualEvents: boolean;
  internshipTerms: string[];
  /** Fit score below this is dropped as off-interest. */
  minimumFitScore: number;
  keywords: string[];
}

export type TraceStatus = "running" | "ok" | "warn" | "error";

export interface TraceStep {
  id: string;
  label: string;
  detail?: string;
  status: TraceStatus;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  facts: string[];
}

export interface SourceReport {
  id: string;
  name: string;
  url: string;
  status: "ok" | "error";
  fetched: number;
  kept: number;
  durationMs: number;
  error?: string;
}

export interface RunSummary {
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  reasoner: string;
  counts: {
    collected: number;
    eligible: number;
    needsVerification: number;
    excluded: number;
    byKind: Record<OpportunityKind, number>;
  };
  sources: SourceReport[];
  steps: TraceStep[];
  digest: string;
  warnings: string[];
}

/** What set a run going, for the schedule bookkeeping. */
export type RunTrigger = "manual" | "schedule" | "startup" | "cron" | "cli";

export interface ScheduleState {
  enabled: boolean;
  /** How long the agent waits between unattended scans. */
  intervalHours: number;
  lastRunAt?: string;
  lastAttemptAt?: string;
  lastTrigger?: RunTrigger;
  lastStatus?: "ok" | "error";
  lastError?: string;
  /** Drives the retry backoff so a broken feed does not burn the full cadence. */
  consecutiveFailures: number;
}

export interface AgentState {
  profile: Profile;
  lastRun?: RunSummary;
  opportunities: Opportunity[];
  /** Opportunity id -> user decision. */
  actions: Record<string, "saved" | "dismissed">;
  schedule: ScheduleState;
  updatedAt?: string;
}

export type AgentEvent =
  | { type: "step"; step: TraceStep }
  | { type: "source"; report: SourceReport }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "done"; run: RunSummary; opportunities: Opportunity[] }
  | { type: "error"; message: string };

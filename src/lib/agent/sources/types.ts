import type { OpportunityKind, Profile, SourceRef } from "../types";

export interface DraftOpportunity {
  kind: OpportunityKind;
  title: string;
  organization?: string;
  url: string;
  description?: string;
  /** Free-text locations, normalized later by `parseLocation`. */
  locations: string[];
  startDate?: string;
  endDate?: string;
  dateLabel?: string;
  /** False when the agent could not confirm dates and is showing a series entry. */
  datesConfirmed?: boolean;
  deadline?: string;
  deadlineLabel?: string;
  term?: string;
  reward?: string;
  tags?: string[];
  postedAt?: string;
  source: SourceRef;
}

export interface SourceContext {
  profile: Profile;
  today: Date;
  log: (message: string) => void;
}

export interface OpportunitySource {
  id: string;
  name: string;
  url: string;
  kinds: OpportunityKind[];
  collect: (context: SourceContext) => Promise<DraftOpportunity[]>;
}

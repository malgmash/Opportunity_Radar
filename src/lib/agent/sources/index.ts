import { conferenceSource } from "./conferences";
import { curatedSource } from "./curated";
import { devpostSource } from "./devpost";
import { internshipSource } from "./internships";
import { mlhSource } from "./mlh";
import type { OpportunitySource } from "./types";

export const SOURCES: OpportunitySource[] = [
  mlhSource,
  devpostSource,
  internshipSource,
  conferenceSource,
  curatedSource,
];

export type { DraftOpportunity, OpportunitySource, SourceContext } from "./types";

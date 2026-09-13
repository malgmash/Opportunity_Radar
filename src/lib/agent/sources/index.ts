import { conferenceSource } from "./conferences";
import { curatedSource } from "./curated";
import { devpostSource } from "./devpost";
import { instagramSource } from "./instagram";
import { internshipSource } from "./internships";
import { malgDropboxSource } from "./malg-dropbox";
import { mlhSource } from "./mlh";
import type { OpportunitySource } from "./types";

export const SOURCES: OpportunitySource[] = [
  mlhSource,
  devpostSource,
  internshipSource,
  conferenceSource,
  curatedSource,
  instagramSource,
  malgDropboxSource,
];

export type { DraftOpportunity, OpportunitySource, SourceContext } from "./types";

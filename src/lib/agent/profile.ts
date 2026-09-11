import { z } from "zod";

import { US_STATES } from "./geo";
import type { Profile } from "./types";

export const HOME_REGION = ["NC", "SC", "GA", "VA", "WV"];

export const DEFAULT_PROFILE: Profile = {
  name: "Your opportunity radar",
  homeBase: "Carolinas / Southeast",
  graduationYear: 2029,
  degree: "Bachelor's",
  interests: ["data-analysis", "software-engineering", "product-management"],
  homeRegion: HOME_REGION,
  requireTravelSupportOutsideRegion: true,
  allowVirtualEvents: true,
  internshipTerms: internshipTermsForGraduationYear(2029),
  minimumFitScore: 18,
  keywords: [
    "data analysis",
    "analytics",
    "software engineering",
    "product management",
  ],
};

/**
 * A May graduate can intern in the summers that fall before their graduation,
 * and recruiting for a given summer opens roughly a year ahead.
 */
export function internshipTermsForGraduationYear(
  graduationYear: number,
  today = new Date(),
): string[] {
  const currentYear = today.getUTCFullYear();
  // Summer recruiting for year N runs from roughly August of N-2 through spring of N.
  const firstOpenSummer = today.getUTCMonth() >= 6 ? currentYear + 1 : currentYear;
  const terms: string[] = [];
  for (let year = firstOpenSummer; year <= graduationYear; year += 1) {
    terms.push(`Summer ${year}`);
  }
  return terms.length ? terms.slice(0, 3) : [`Summer ${firstOpenSummer}`];
}

/** Academic standing during a given summer term, used to explain eligibility. */
export function standingForTerm(
  term: string,
  graduationYear: number,
): string | undefined {
  const match = term.match(/(\d{4})/);
  if (!match) return undefined;
  const termYear = Number(match[1]);
  const summersLeft = graduationYear - termYear;
  switch (summersLeft) {
    case 0:
      return "graduating senior";
    case 1:
      return "rising senior";
    case 2:
      return "rising junior";
    case 3:
      return "rising sophomore";
    default:
      return summersLeft > 3 ? "pre-college" : "post-graduation";
  }
}

const trackSchema = z.enum([
  "data-analysis",
  "software-engineering",
  "product-management",
  "adjacent",
]);

export const profileSchema = z.object({
  name: z.string().min(1).max(80),
  homeBase: z.string().min(1).max(80),
  graduationYear: z.number().int().min(2024).max(2040),
  degree: z.string().min(1).max(40),
  interests: z.array(trackSchema).min(1),
  homeRegion: z.array(z.string().refine((code) => code in US_STATES)).min(1),
  requireTravelSupportOutsideRegion: z.boolean(),
  allowVirtualEvents: z.boolean(),
  internshipTerms: z.array(z.string().min(4).max(24)).min(1).max(4),
  minimumFitScore: z.number().int().min(0).max(80),
  keywords: z.array(z.string().min(2).max(40)).max(20),
});

export function normalizeProfile(input: unknown): Profile {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return DEFAULT_PROFILE;
  return { ...parsed.data, homeRegion: parsed.data.homeRegion.map((s) => s.toUpperCase()) };
}

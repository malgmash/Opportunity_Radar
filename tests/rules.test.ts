import { describe, expect, it } from "vitest";

import { parseLocation } from "../src/lib/agent/geo";
import { DEFAULT_PROFILE } from "../src/lib/agent/profile";
import { heuristicClassify } from "../src/lib/agent/reasoner";
import { evaluate, needsTravelCheck } from "../src/lib/agent/rules";
import type {
  Opportunity,
  OpportunityKind,
  TravelSupportStatus,
} from "../src/lib/agent/types";

const TODAY = new Date("2026-09-11T00:00:00Z");

function build(
  overrides: Omit<Partial<Opportunity>, "locations"> & {
    kind: OpportunityKind;
    locations: string[];
  },
): Opportunity {
  const { locations, ...rest } = overrides;
  const base: Opportunity = {
    id: "test",
    kind: overrides.kind,
    title: "Data Analytics Intern",
    url: "https://example.com/",
    locations: locations.map(parseLocation),
    datesConfirmed: true,
    tags: [],
    source: { id: "test", name: "Test", url: "https://example.com" },
    travel: { status: "unknown", evidence: [], note: "Not checked yet." },
    eligibility: { decision: "needs_verification", summary: "", verdicts: [] },
    fit: { score: 0, tracks: [], reasons: [], reasonedBy: "test" },
  };
  const merged = { ...base, ...rest, locations: base.locations } as Opportunity;
  const fit = heuristicClassify(
    {
      id: merged.id,
      kind: merged.kind,
      title: merged.title,
      text: merged.description ?? merged.tags.join(" "),
      term: merged.term,
    },
    DEFAULT_PROFILE,
  );
  merged.fit = { ...fit, reasonedBy: "test" };
  return merged;
}

function travel(status: TravelSupportStatus) {
  return {
    status,
    evidence:
      status === "confirmed"
        ? [
            {
              phrase: "travel reimbursement",
              quote: "We offer travel reimbursement up to $150.",
              sourceUrl: "https://example.com/faq",
            },
          ]
        : [],
    note: `status ${status}`,
  };
}

describe("event region rules", () => {
  it("accepts an in-region hackathon outright", () => {
    const result = evaluate(
      build({
        kind: "hackathon",
        title: "HackNC",
        description: "Student hackathon",
        locations: ["Chapel Hill, NC"],
        startDate: "2026-10-09",
        endDate: "2026-10-11",
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("eligible");
    expect(result.verdicts.find((entry) => entry.rule === "region")?.status).toBe("pass");
  });

  it("holds an out-of-region US hackathon for verification until funding is found", () => {
    const result = evaluate(
      build({
        kind: "hackathon",
        title: "HackTX",
        description: "Student hackathon",
        locations: ["Austin, TX"],
        startDate: "2026-10-09",
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("needs_verification");
    expect(result.verdicts.find((entry) => entry.rule === "travel")?.status).toBe("warn");
  });

  it("accepts an out-of-region US hackathon once travel funding is confirmed", () => {
    const result = evaluate(
      build({
        kind: "hackathon",
        title: "HackRice",
        description: "Student hackathon",
        locations: ["Houston, TX"],
        startDate: "2026-10-09",
        travel: travel("confirmed"),
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("eligible");
    expect(result.verdicts.find((entry) => entry.rule === "travel")?.status).toBe("pass");
  });

  it("excludes an out-of-region event that says travel is not covered", () => {
    const result = evaluate(
      build({
        kind: "hackathon",
        title: "HackWest",
        description: "Student hackathon",
        locations: ["Phoenix, AZ"],
        startDate: "2026-10-09",
        travel: travel("not_offered"),
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("excluded");
  });

  it("excludes a foreign in-person event", () => {
    const result = evaluate(
      build({
        kind: "conference",
        title: "React Advanced",
        description: "JavaScript software engineering conference",
        locations: ["London, United Kingdom"],
        startDate: "2026-10-23",
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("excluded");
  });

  it("does not let a livestream ticket launder a foreign venue", () => {
    const result = evaluate(
      build({
        kind: "conference",
        title: "API Conference Berlin",
        description: "API software engineering conference",
        locations: ["Berlin, Germany", "Online"],
        startDate: "2026-11-16",
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("needs_verification");
    expect(result.verdicts.find((entry) => entry.rule === "region")?.label).toBe(
      "Online track only",
    );
  });

  it("passes a genuinely online event with no travel to fund", () => {
    const result = evaluate(
      build({
        kind: "hackathon",
        title: "AI Builders Hackathon",
        description: "Machine learning hackathon",
        locations: ["Online"],
        startDate: "2026-09-20",
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("eligible");
  });

  it("excludes events that have already ended", () => {
    const result = evaluate(
      build({
        kind: "hackathon",
        title: "HackNC",
        description: "Student hackathon",
        locations: ["Chapel Hill, NC"],
        startDate: "2026-08-01",
        endDate: "2026-08-02",
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("excluded");
  });
});

describe("internship rules", () => {
  it("accepts a US summer internship in an eligible term", () => {
    const result = evaluate(
      build({
        kind: "internship",
        title: "Data Analytics Intern",
        locations: ["Charlotte, NC"],
        term: "Summer 2027",
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("eligible");
    expect(result.verdicts.find((entry) => entry.rule === "term")?.detail).toContain(
      "rising junior",
    );
  });

  it("accepts internships anywhere in the US, not just the home region", () => {
    const result = evaluate(
      build({
        kind: "internship",
        title: "Software Engineer Intern",
        locations: ["Seattle, WA"],
        term: "Summer 2027",
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("eligible");
  });

  it("excludes internships outside the US", () => {
    const result = evaluate(
      build({
        kind: "internship",
        title: "Software Engineer Intern",
        locations: ["London, United Kingdom"],
        term: "Summer 2027",
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("excluded");
  });

  it("excludes the wrong summer", () => {
    const result = evaluate(
      build({
        kind: "internship",
        title: "Data Analytics Intern",
        locations: ["Charlotte, NC"],
        term: "Summer 2026",
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("excluded");
  });

  it("excludes roles aimed at a different career stage", () => {
    for (const title of [
      "PhD Research Intern",
      "MBA Product Management Intern",
      "New Grad Software Engineer",
    ]) {
      const result = evaluate(
        build({
          kind: "internship",
          title,
          locations: ["Charlotte, NC"],
          term: "Summer 2027",
        }),
        DEFAULT_PROFILE,
        TODAY,
      );
      expect(result.decision, title).toBe("excluded");
    }
  });

  it("drops listings that have nothing to do with the focus areas", () => {
    const result = evaluate(
      build({
        kind: "internship",
        title: "Warehouse Associate Intern",
        locations: ["Charlotte, NC"],
        term: "Summer 2027",
      }),
      DEFAULT_PROFILE,
      TODAY,
    );
    expect(result.decision).toBe("excluded");
    expect(result.verdicts[0]).toMatchObject({ rule: "interest", status: "fail" });
  });
});

describe("needsTravelCheck", () => {
  it("only spends requests where the answer changes the outcome", () => {
    expect(needsTravelCheck([parseLocation("Raleigh, NC")], DEFAULT_PROFILE)).toBe(false);
    expect(needsTravelCheck([parseLocation("Online")], DEFAULT_PROFILE)).toBe(false);
    expect(needsTravelCheck([parseLocation("Austin, TX")], DEFAULT_PROFILE)).toBe(true);
    expect(needsTravelCheck([parseLocation("Venue Hall B")], DEFAULT_PROFILE)).toBe(true);
  });
});

describe("relevance scoring", () => {
  it("ranks a data analytics role above an unrelated one", () => {
    const analytics = heuristicClassify(
      { id: "a", kind: "internship", title: "Business Intelligence & Data Analytics Intern", text: "" },
      DEFAULT_PROFILE,
    );
    const unrelated = heuristicClassify(
      { id: "b", kind: "internship", title: "Retail Store Associate", text: "" },
      DEFAULT_PROFILE,
    );
    expect(analytics.score).toBeGreaterThan(unrelated.score);
    expect(analytics.tracks).toContain("data-analysis");
    expect(analytics.reasons.length).toBeGreaterThan(0);
  });

  it("recognizes product management listings", () => {
    const result = heuristicClassify(
      { id: "c", kind: "internship", title: "Associate Product Manager Intern", text: "" },
      DEFAULT_PROFILE,
    );
    expect(result.tracks).toContain("product-management");
  });
});

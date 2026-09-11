import { describe, expect, it } from "vitest";

import { parseLocation } from "../src/lib/agent/geo";
import { DEFAULT_PROFILE } from "../src/lib/agent/profile";
import { selectBoard } from "../src/lib/agent/rank";
import type { Opportunity, TravelSupportStatus } from "../src/lib/agent/types";

const TODAY = new Date("2026-09-11T00:00:00Z");

function make(
  id: string,
  location: string,
  options: {
    score?: number;
    travel?: TravelSupportStatus;
    eligible?: boolean;
  } = {},
): Opportunity {
  return {
    id,
    kind: "hackathon",
    title: id,
    url: `https://example.com/${id}`,
    locations: [parseLocation(location)],
    datesConfirmed: true,
    startDate: "2026-10-01",
    tags: [],
    source: { id: "test", name: "Test", url: "https://example.com" },
    travel: { status: options.travel ?? "unknown", evidence: [], note: "" },
    eligibility: {
      decision: options.eligible === false ? "needs_verification" : "eligible",
      summary: "",
      verdicts: [],
    },
    fit: { score: options.score ?? 30, tracks: [], reasons: [], reasonedBy: "test" },
  };
}

describe("selectBoard", () => {
  it("keeps in-region events even when online listings score higher", () => {
    const online = Array.from({ length: 20 }, (_, index) =>
      make(`online-${index}`, "Online", { score: 95 }),
    );
    const inRegion = [
      make("hacknc", "Chapel Hill, NC", { score: 30 }),
      make("hackgt", "Atlanta, GA", { score: 30 }),
    ];

    const board = selectBoard([...online, ...inRegion], DEFAULT_PROFILE, TODAY, 6);
    const ids = board.map((item) => item.id);
    expect(ids).toContain("hacknc");
    expect(ids).toContain("hackgt");
    expect(board).toHaveLength(6);
  });

  it("reserves room for out-of-region events that pay for travel", () => {
    const online = Array.from({ length: 20 }, (_, index) =>
      make(`online-${index}`, "Online", { score: 95 }),
    );
    const funded = make("tapia", "Rotating, United States", {
      score: 25,
      travel: "confirmed",
      eligible: true,
    });
    const maybeFunded = make("pycon", "Rotating, United States", {
      score: 20,
      travel: "likely",
      eligible: false,
    });

    const board = selectBoard(
      [...online, funded, maybeFunded],
      DEFAULT_PROFILE,
      TODAY,
      8,
    );
    const ids = board.map((item) => item.id);
    expect(ids).toContain("tapia");
    expect(ids).toContain("pycon");
  });

  it("keeps curated entries whose sites could not be read", () => {
    const online = Array.from({ length: 20 }, (_, index) =>
      make(`online-${index}`, "Online", { score: 95 }),
    );
    const curated: Opportunity = {
      ...make("tapia", "Rotating, United States", { score: 25, eligible: false }),
      source: { id: "curated", name: "Curated series", url: "https://example.com" },
      travel: {
        status: "unknown",
        evidence: [],
        note: "Could not read the event site to check for travel funding.",
      },
    };

    const board = selectBoard([...online, curated], DEFAULT_PROFILE, TODAY, 8);
    expect(board.map((item) => item.id)).toContain("tapia");
  });

  it("keeps Instagram alerts that a job board would outrank", () => {
    const board = Array.from({ length: 20 }, (_, index) =>
      make(`listing-${index}`, "United States", { score: 95 }),
    );
    const alert: Opportunity = {
      ...make("ig-stripe", "United States", { score: 34 }),
      source: {
        id: "instagram:zero2sudo",
        name: "@zero2sudo on Instagram",
        url: "https://www.instagram.com/zero2sudo/",
      },
    };

    const picked = selectBoard([...board, alert], DEFAULT_PROFILE, TODAY, 8);
    expect(picked.map((item) => item.id)).toContain("ig-stripe");
  });

  it("applies the limit per kind, not across the whole board", () => {
    const hackathons = Array.from({ length: 10 }, (_, index) =>
      make(`hack-${index}`, "Online"),
    );
    const conferences = Array.from({ length: 10 }, (_, index) => ({
      ...make(`conf-${index}`, "Online"),
      kind: "conference" as const,
    }));

    const board = selectBoard([...hackathons, ...conferences], DEFAULT_PROFILE, TODAY, 4);
    expect(board.filter((item) => item.kind === "hackathon")).toHaveLength(4);
    expect(board.filter((item) => item.kind === "conference")).toHaveLength(4);
  });

  it("ranks fully eligible items ahead of ones needing a check", () => {
    const board = selectBoard(
      [
        make("unverified", "Chapel Hill, NC", { eligible: false }),
        make("clear", "Raleigh, NC", { eligible: true }),
      ],
      DEFAULT_PROFILE,
      TODAY,
      10,
    );
    expect(board[0].id).toBe("clear");
  });
});

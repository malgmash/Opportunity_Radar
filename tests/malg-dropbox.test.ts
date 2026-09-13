import { describe, expect, it } from "vitest";

import { DEFAULT_PROFILE } from "../src/lib/agent/profile";
import {
  malgDropboxSource,
  mapFeedEntry,
  parseMalgDropboxFeed,
} from "../src/lib/agent/sources/malg-dropbox";

const FIXTURE = {
  updated: "2026-09-13",
  source: "MALG Assistant Opportunity Dropbox",
  count: 2,
  opportunities: [
    {
      kind: "internship",
      title: "Summer 2027 Data Intern",
      organization: "Example Org",
      url: "https://example.com/intern",
      description: "A fixture internship row.",
      locations: ["Raleigh, NC"],
      datesConfirmed: true,
      dateLabel: "Summer 2027",
      deadlineLabel: "October 2026",
      term: "Summer 2027",
      tags: ["malg-dropbox", "internships"],
      source: {
        id: "malg-dropbox",
        name: "MALG Opportunity Dropbox",
        url: "https://example.com/intern",
      },
    },
    {
      kind: "hackathon",
      title: "Example Regional Hackathon",
      url: "https://example.com/hack",
      locations: ["Charlotte, NC"],
      datesConfirmed: true,
    },
    { kind: "internship", title: "Missing URL is skipped" },
    { kind: "webinar", title: "Unknown kind", url: "https://example.com/webinar" },
    { kind: "conference", title: "Not a URL", url: "ftp://files.example.com/conf" },
  ],
};

describe("parseMalgDropboxFeed", () => {
  it("maps fixture-shaped rows and skips malformed ones", () => {
    const parsed = parseMalgDropboxFeed(FIXTURE);

    expect(parsed.updated).toBe("2026-09-13");
    expect(parsed.skipped).toBe(3);
    expect(parsed.drafts).toHaveLength(2);

    expect(parsed.drafts[0]).toMatchObject({
      kind: "internship",
      title: "Summer 2027 Data Intern",
      organization: "Example Org",
      url: "https://example.com/intern",
      locations: ["Raleigh, NC"],
      term: "Summer 2027",
      source: { id: "malg-dropbox", name: "MALG Opportunity Dropbox" },
    });
    expect(parsed.drafts[1]).toMatchObject({
      kind: "hackathon",
      title: "Example Regional Hackathon",
      url: "https://example.com/hack",
      locations: ["Charlotte, NC"],
    });
  });

  it("returns nothing for a payload that is not a feed object", () => {
    expect(parseMalgDropboxFeed(null)).toEqual({ drafts: [], skipped: 0 });
    expect(parseMalgDropboxFeed("nope")).toEqual({ drafts: [], skipped: 0 });
    expect(parseMalgDropboxFeed({ count: 1 })).toEqual({ drafts: [], skipped: 0 });
  });
});

describe("mapFeedEntry", () => {
  it("rejects rows without a usable http(s) url or known kind", () => {
    expect(mapFeedEntry({ kind: "internship", title: "x" })).toBeNull();
    expect(
      mapFeedEntry({ kind: "talk", title: "x", url: "https://example.com" }),
    ).toBeNull();
    expect(
      mapFeedEntry({
        kind: "internship",
        title: "x",
        url: "javascript:alert(1)",
      }),
    ).toBeNull();
  });
});

describe("malgDropboxSource", () => {
  it("collects the committed dropbox feed from the repo", async () => {
    const logs: string[] = [];
    const drafts = await malgDropboxSource.collect({
      profile: DEFAULT_PROFILE,
      today: new Date("2026-09-13T00:00:00Z"),
      log: (message) => logs.push(message),
    });

    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((draft) => draft.title && draft.url && draft.kind)).toBe(
      true,
    );
    expect(logs.some((line) => /loaded \d+ from data\/malg-dropbox-feed\.json/.test(line))).toBe(
      true,
    );
  });
});

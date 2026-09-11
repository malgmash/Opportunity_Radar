import { describe, expect, it } from "vitest";

import {
  parseCompanies,
  parseEventLocation,
  parsePost,
  parseRelativeDeadline,
  parseRoles,
  parseTerm,
  splitSentences,
} from "../src/lib/agent/sources/instagram";

const TODAY = new Date("2026-09-11T00:00:00Z");

/** Verbatim captions from @zero2sudo, which the parser has to survive. */
const REAL = {
  threeCompanies:
    "🚨 Google, Stripe, Microsoft 2027 SWE apps are LIVE. All of the links are on my story, but if you need a giant list recap, check out Direct Consideration in my bio.\n\nTurn on your Story and Reel notifications so you aren't left behind. \n\n#tech #faang #googleinternship #csmajor stripeintern amazonintern",
  multiRole:
    '🚨 Microsoft 2027 SWE, PM, TPM intern apps HAVE OPENED. Some intern candidates moved into the "Screen" status on their job portals, and my followers were the first to know.\n\nThe surprise: some people submitted referrals after applying early, and lots of TPM intern candidates reported being rejected.',
  newGradMention:
    "🚨 Google 2027 SWE job description IS LIVE. Direct consideration candidates were notified via email about next steps, and my followers were the first to know. \n\nIf this month feels too early for you, Google will also be opening intern apps during their general fall timeline, so likely new grad as well.",
  lifestyle:
    "Skip Starbucks Reserve in Seattle. Locals are doing this day trip instead 🤝\n\n#thingstodoinseattle #seattle #starbucksreserve",
  sponsored:
    "Coding with Devin as a senior software engineer #DevinPartner @trycognition #sponsored",
  aboutMe:
    "This account is all about helping you break into high-paying careers, make smart financial choices, and ultimately design a life you're excited about.",
  howTo:
    "Google Summer 2027 SWE Internship App updates 🚨 How to land direct consideration this week",
  closingSoon:
    "🚨 Adobe Student Insiders 2026-2027 apps close in 3 days, and it might be the best program for underclassmen.",
};

describe("caption triage", () => {
  it("keeps announcements that name companies and a cycle", () => {
    const parsed = parsePost(REAL.threeCompanies, TODAY);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("internship");
    expect(parsed?.companies).toEqual(["Google", "Stripe", "Microsoft"]);
    expect(parsed?.term).toBe("Summer 2027");
    expect(parsed?.roles).toEqual(["software engineering"]);
  });

  it("reads every role out of a multi-role announcement", () => {
    const parsed = parsePost(REAL.multiRole, TODAY);
    expect(parsed?.companies).toEqual(["Microsoft"]);
    expect(parsed?.roles).toEqual([
      "software engineering",
      "technical program manager",
      "product management",
    ]);
  });

  it("carries only the announcement sentence, so later new-grad talk cannot mislead the rules", () => {
    const parsed = parsePost(REAL.newGradMention, TODAY);
    expect(parsed?.headline).toBe("Google 2027 SWE job description IS LIVE.");
    expect(parsed?.headline.toLowerCase()).not.toContain("new grad");
  });

  it("ignores lifestyle, sponsored, about-me and how-to posts", () => {
    expect(parsePost(REAL.lifestyle, TODAY)).toBeNull();
    expect(parsePost(REAL.sponsored, TODAY)).toBeNull();
    expect(parsePost(REAL.aboutMe, TODAY)).toBeNull();
    expect(parsePost(REAL.howTo, TODAY)).toBeNull();
  });

  it("catches a closing window and dates it from the post", () => {
    const postedAt = "2026-09-10";
    const parsed = parsePost(REAL.closingSoon, TODAY, postedAt);
    expect(parsed).not.toBeNull();
    expect(parsed?.deadline).toBe("2026-09-13");
    // "2026-2027" is the 2027 cycle.
    expect(parsed?.term).toBe("Summer 2027");
  });

  it("drops an announcement whose window already closed", () => {
    expect(parsePost(REAL.closingSoon, TODAY, "2026-06-01")).toBeNull();
  });

  it("requires a term before treating a post as an internship lead", () => {
    expect(parsePost("🚨 SWE intern apps are LIVE at a bunch of places.", TODAY)).toBeNull();
  });

  it("refuses a cycle that has already passed", () => {
    expect(parseTerm("Google 2019 SWE apps are live", TODAY)).toBeUndefined();
  });
});

describe("company extraction", () => {
  it("splits a comma-and-ampersand list before the year", () => {
    expect(parseCompanies("Microsoft, SpaceX & TikTok 2027 SWE Internship apps ARE OPEN")).toEqual(
      ["Microsoft", "SpaceX", "TikTok"],
    );
  });

  it("keeps two-word company names", () => {
    expect(parseCompanies("Capital One 2027 SWE apps are open")).toEqual(["Capital One"]);
  });

  it("does not mistake sentence openers for companies", () => {
    expect(parseCompanies("Turn on notifications, 2027 apps are coming")).toEqual([]);
    expect(parseCompanies("My 2027 internship list is live")).toEqual([]);
    expect(parseCompanies("These 2027 apps are open")).toEqual([]);
  });

  it("returns nothing when no year anchors the list", () => {
    expect(parseCompanies("Google SWE apps are live")).toEqual([]);
  });
});

describe("helpers", () => {
  it("splits sentences and strips the siren emoji", () => {
    expect(splitSentences("🚨 Apps are open. Turn on alerts!")).toEqual([
      "Apps are open.",
      "Turn on alerts!",
    ]);
  });

  it("maps role abbreviations to scoreable phrases", () => {
    expect(parseRoles("APM and data analyst roles")).toContain("associate product manager");
    expect(parseRoles("quant intern")).toContain("quantitative");
  });

  it("reads a venue out of an event caption", () => {
    expect(parseEventLocation("Join us in Atlanta, GA for the summit")).toBe("Atlanta, GA");
    expect(parseEventLocation("This one is fully virtual")).toBe("Online");
    expect(parseEventLocation("Big news for students")).toBeUndefined();
  });

  it("needs a post date to resolve a relative deadline", () => {
    expect(parseRelativeDeadline("apps close in 2 days", undefined)).toBeUndefined();
    expect(parseRelativeDeadline("apps close in 2 weeks", "2026-09-01")).toBe("2026-09-15");
  });
});

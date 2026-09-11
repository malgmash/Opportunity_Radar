import { describe, expect, it } from "vitest";

import { parseLocation } from "../src/lib/agent/geo";
import { DEFAULT_PROFILE } from "../src/lib/agent/profile";
import type { EligibilityDecision, Opportunity } from "../src/lib/agent/types";
import { maskAddress, readNotifyConfig } from "../src/lib/notify/config";
import { selectMatches } from "../src/lib/notify";
import { renderDigest, subjectFor } from "../src/lib/notify/render";

function make(
  id: string,
  overrides: {
    kind?: Opportunity["kind"];
    decision?: EligibilityDecision;
    score?: number;
    company?: string;
    deadline?: string;
  } = {},
): Opportunity {
  return {
    id,
    kind: overrides.kind ?? "internship",
    title: `${overrides.company ?? "Acme"} summer internship`,
    organization: overrides.company ?? "Acme",
    url: `https://example.com/${id}`,
    locations: [parseLocation("United States")],
    datesConfirmed: true,
    deadline: overrides.deadline,
    term: "Summer 2027",
    tags: [],
    source: { id: "test", name: "Test feed", url: "https://example.com" },
    travel: { status: "not_needed", evidence: [], note: "" },
    eligibility: {
      decision: overrides.decision ?? "eligible",
      summary: "Fits your timeline.",
      verdicts: [
        { rule: "usa", label: "Anywhere in the US", status: "pass", detail: "United States." },
        {
          rule: "term",
          label: "Eligible summer term",
          status: "pass",
          detail: "Summer 2027 is your rising junior summer.",
        },
      ],
    },
    fit: { score: overrides.score ?? 50, tracks: ["software-engineering"], reasons: [], reasonedBy: "test" },
  };
}

const CONFIG = readNotifyConfig({
  NOTIFY_TO: "me@example.com",
} as unknown as NodeJS.ProcessEnv);

describe("selectMatches", () => {
  it("only takes internships that clear every rule", () => {
    const items = [
      make("a"),
      make("b", { decision: "needs_verification" }),
      make("c", { decision: "excluded" }),
      make("d", { kind: "hackathon" }),
    ];
    expect(selectMatches(items, {}, CONFIG).map((item) => item.id)).toEqual(["a"]);
  });

  it("never re-sends something already emailed", () => {
    const items = [make("a"), make("b")];
    expect(
      selectMatches(items, { a: "2026-09-01T00:00:00Z" }, CONFIG).map((item) => item.id),
    ).toEqual(["b"]);
  });

  it("puts the nearest deadline first, then the best fit", () => {
    const items = [
      make("far", { score: 90, deadline: "2027-01-01" }),
      make("soon", { score: 20, deadline: "2026-10-01" }),
      make("undated", { score: 95 }),
      make("weak", { score: 30 }),
    ];
    expect(selectMatches(items, {}, CONFIG).map((item) => item.id)).toEqual([
      "soon",
      "far",
      "undated",
      "weak",
    ]);
  });

  it("honours the configured kinds", () => {
    const config = readNotifyConfig({
      NOTIFY_TO: "me@example.com",
      NOTIFY_KINDS: "internship,hackathons",
    } as unknown as NodeJS.ProcessEnv);
    const items = [make("a"), make("h", { kind: "hackathon" }), make("c", { kind: "conference" })];
    expect(selectMatches(items, {}, config).map((item) => item.id)).toEqual(["a", "h"]);
  });
});

describe("config", () => {
  it("defaults to internships only", () => {
    expect(readNotifyConfig({} as NodeJS.ProcessEnv).kinds).toEqual(["internship"]);
  });

  it("falls back to the outbox with no credentials and reports not-configured", () => {
    const config = readNotifyConfig({} as NodeJS.ProcessEnv);
    expect(config.transport).toBe("outbox");
    expect(config.to).toEqual([]);
  });

  it("prefers Resend when both are present, and reads SMTP otherwise", () => {
    expect(
      readNotifyConfig({
        RESEND_API_KEY: "re_x",
        SMTP_HOST: "smtp.gmail.com",
      } as unknown as NodeJS.ProcessEnv).transport,
    ).toBe("resend");

    const smtp = readNotifyConfig({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "465",
      SMTP_USER: "me@gmail.com",
    } as unknown as NodeJS.ProcessEnv);
    expect(smtp.transport).toBe("smtp");
    // Port 465 is implicit TLS.
    expect(smtp.smtp?.secure).toBe(true);
    expect(smtp.from).toBe("me@gmail.com");
  });

  it("masks the recipient for display", () => {
    expect(maskAddress("alexandra@gmail.com")).toBe("ale***@gmail.com");
    expect(maskAddress("Me <ab@x.io>")).toBe("a***@x.io");
  });
});

describe("renderDigest", () => {
  const base = {
    omitted: 0,
    profile: DEFAULT_PROFILE,
    firstRun: false,
    boardUrl: "http://localhost:43127",
  };

  it("names the companies in the subject", () => {
    const subject = subjectFor({
      ...base,
      items: [make("a", { company: "Stripe" }), make("b", { company: "Google" })],
    });
    expect(subject).toContain("Stripe");
    expect(subject).toContain("Google");
  });

  it("includes the listing, its reasons and its link in both bodies", () => {
    const digest = renderDigest({ ...base, items: [make("a", { company: "Stripe" })] });
    expect(digest.html).toContain("Stripe summer internship");
    expect(digest.html).toContain("https://example.com/a");
    expect(digest.html).toContain("rising junior summer");
    expect(digest.text).toContain("Stripe summer internship");
    expect(digest.text).toContain("https://example.com/a");
  });

  it("summarizes overflow rather than listing everything", () => {
    const digest = renderDigest({ ...base, items: [make("a")], omitted: 7 });
    expect(digest.html).toContain("7 more matches");
    expect(digest.text).toContain("7 more matches");
  });

  it("explains itself on the first digest", () => {
    const digest = renderDigest({ ...base, items: [make("a")], firstRun: true });
    expect(digest.text).toContain("only hear from me when something new");
  });

  it("escapes titles so a caption cannot inject markup", () => {
    const item = make("a");
    item.title = '<img src=x onerror="alert(1)">';
    const digest = renderDigest({ ...base, items: [item] });
    expect(digest.html).not.toContain("<img src=x");
    expect(digest.html).toContain("&lt;img src=x");
  });
});

import { describe, expect, it } from "vitest";

import { analyzePageText } from "../src/lib/agent/enrich";
import { parseLocation } from "../src/lib/agent/geo";

const URL_UNDER_TEST = "https://example.org/faq";

describe("travel funding detection", () => {
  it("finds an explicit reimbursement policy", () => {
    const signals = analyzePageText(
      "Travel reimbursement is available for attendees who travel more than 100 miles. We reimburse up to $150 per hacker.",
      URL_UNDER_TEST,
    );
    expect(signals.evidence.length).toBeGreaterThan(0);
    expect(signals.negative).toBeUndefined();
    expect(signals.evidence[0].quote).toContain("reimbursement is available");
  });

  it("catches a refusal written in contracted form", () => {
    const signals = analyzePageText(
      "Is travel reimbursement provided? Unfortunately, we aren’t able to offer travel reimbursements this year due to budget limitations.",
      URL_UNDER_TEST,
    );
    expect(signals.negative).toBeDefined();
  });

  it("catches the other ways events say no", () => {
    for (const text of [
      "We do not offer travel reimbursement for this event.",
      "Sorry, there is no travel stipend available.",
      "Attendees are responsible for travel, which is not reimbursed.",
      "We cannot cover travel costs for participants.",
      "Registration does not include travel or lodging.",
    ]) {
      expect(analyzePageText(text, URL_UNDER_TEST).negative, text).toBeDefined();
    }
  });

  it("ends the quote at the sentence and drops flattened menu numbers", () => {
    const signals = analyzePageText(
      "Menu Home Schedule FAQ 12 34 56 We offer a travel stipend of up to $200 for students traveling from outside the state. Sponsors Contact",
      URL_UNDER_TEST,
    );
    const quote = signals.evidence[0].quote;
    expect(quote).toContain(
      "We offer a travel stipend of up to $200 for students traveling from outside the state.",
    );
    expect(quote).not.toContain("Sponsors Contact");
    expect(quote).not.toContain("12 34 56");
  });

  it("keeps the quote to the sentence that follows a heading", () => {
    const signals = analyzePageText(
      "Do you reimburse travel? Yes. We reimburse travel for teams coming from more than 150 miles away. How do I apply?",
      URL_UNDER_TEST,
    );
    expect(signals.evidence[0].quote).toBe(
      "We reimburse travel for teams coming from more than 150 miles away.",
    );
  });

  it("treats a bare FAQ heading as weaker than a policy statement", () => {
    const question = analyzePageText("36 Do you offer travel stipends?", URL_UNDER_TEST);
    expect(question.evidence.length).toBeGreaterThan(0);
    expect(question.evidence[0].quote).toMatch(/\?/);
  });
});

describe("country codes that collide with state codes", () => {
  it("does not read a Canadian venue as California", () => {
    const location = parseLocation("Ottawa, Ontario, Canada");
    expect(location.state).toBeUndefined();
    expect(location.country).toBe("NON_US");
  });

  it("does not read an Indian venue as Indiana", () => {
    expect(parseLocation("Bengaluru, Karnataka, India").country).toBe("NON_US");
  });

  it("still resolves genuine US venues", () => {
    expect(parseLocation("Raleigh, North Carolina").state).toBe("NC");
  });

  it("treats an unmapped foreign country as international", () => {
    expect(parseLocation("Someplace, Somewhere, International").country).toBe("NON_US");
  });
});

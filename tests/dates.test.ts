import { describe, expect, it } from "vitest";

import { daysBetween, describeCountdown, parseDateRange } from "../src/lib/agent/dates";
import {
  internshipTermsForGraduationYear,
  standingForTerm,
} from "../src/lib/agent/profile";

const SEPT_2026 = new Date("2026-09-11T00:00:00Z");

describe("parseDateRange", () => {
  it("keeps the month implicit for same-month ranges", () => {
    expect(parseDateRange("SEP 18 - 20", SEPT_2026)).toEqual({
      startDate: "2026-09-18",
      endDate: "2026-09-20",
    });
  });

  it("handles ranges that cross a month with an explicit year", () => {
    expect(parseDateRange("Jul 31 - Oct 01, 2026", SEPT_2026)).toEqual({
      startDate: "2026-07-31",
      endDate: "2026-10-01",
    });
  });

  it("rolls a bare winter date into the next year", () => {
    expect(parseDateRange("FEB 06 - 07", SEPT_2026)).toEqual({
      startDate: "2027-02-06",
      endDate: "2027-02-07",
    });
  });

  it("handles single dates", () => {
    expect(parseDateRange("March 3, 2027", SEPT_2026)).toEqual({
      startDate: "2027-03-03",
      endDate: "2027-03-03",
    });
  });

  it("returns nothing for unparseable input", () => {
    expect(parseDateRange("rolling deadline", SEPT_2026)).toEqual({});
    expect(parseDateRange(undefined, SEPT_2026)).toEqual({});
  });
});

describe("daysBetween", () => {
  it("counts forward and backward", () => {
    expect(daysBetween(SEPT_2026, "2026-09-18")).toBe(7);
    expect(daysBetween(SEPT_2026, "2026-09-01")).toBe(-10);
    expect(daysBetween(SEPT_2026, undefined)).toBeUndefined();
  });
});

describe("describeCountdown", () => {
  it("reads naturally at every horizon", () => {
    expect(describeCountdown(0)).toBe("today");
    expect(describeCountdown(1)).toBe("tomorrow");
    expect(describeCountdown(9)).toBe("in 9 days");
    expect(describeCountdown(30)).toBe("in 4 weeks");
    expect(describeCountdown(-3)).toBe("3 days ago");
  });
});

describe("internship terms", () => {
  it("targets the summers a 2029 graduate can still work", () => {
    expect(internshipTermsForGraduationYear(2029, SEPT_2026)).toEqual([
      "Summer 2027",
      "Summer 2028",
      "Summer 2029",
    ]);
  });

  it("does not offer summers that already passed", () => {
    const terms = internshipTermsForGraduationYear(2029, new Date("2026-03-01T00:00:00Z"));
    expect(terms[0]).toBe("Summer 2026");
  });

  it("explains academic standing for a term", () => {
    expect(standingForTerm("Summer 2027", 2029)).toBe("rising junior");
    expect(standingForTerm("Summer 2028", 2029)).toBe("rising senior");
    expect(standingForTerm("Summer 2026", 2029)).toBe("rising sophomore");
  });
});

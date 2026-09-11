import { describe, expect, it } from "vitest";

import { formatLocations, inHomeRegion, parseLocation } from "../src/lib/agent/geo";
import { HOME_REGION } from "../src/lib/agent/profile";

describe("parseLocation", () => {
  it("reads city and state pairs", () => {
    expect(parseLocation("Atlanta, GA")).toMatchObject({
      city: "Atlanta",
      state: "GA",
      country: "US",
      mode: "in_person",
    });
  });

  it("normalizes the inconsistent state spellings sources publish", () => {
    for (const raw of ["GA ", "Georgia", "ga"]) {
      expect(parseLocation(raw).state).toBe("GA");
    }
    expect(parseLocation("Blacksburg, Virginia").state).toBe("VA");
    expect(parseLocation("Morgantown, West Virginia").state).toBe("WV");
  });

  it("resolves metro shorthands to a state", () => {
    expect(parseLocation("NYC").state).toBe("NY");
    expect(parseLocation("SF").state).toBe("CA");
    expect(parseLocation("Research Triangle Park").state).toBe("NC");
  });

  it("marks online listings as virtual", () => {
    expect(parseLocation("Online").mode).toBe("virtual");
    expect(parseLocation("Remote in USA")).toMatchObject({
      mode: "virtual",
      country: "US",
    });
  });

  it("flags foreign locations", () => {
    expect(parseLocation("London, United Kingdom").country).toBe("NON_US");
    expect(parseLocation("Bengaluru, India").country).toBe("NON_US");
    expect(parseLocation("Toronto, ON").country).toBe("NON_US");
  });

  it("leaves unrecognized places without a country rather than guessing", () => {
    expect(parseLocation("Vilnius, Lithuania").country).toBeUndefined();
    expect(parseLocation("Student Commons 1600").country).toBeUndefined();
  });
});

describe("inHomeRegion", () => {
  it("accepts the five target states and nothing else", () => {
    for (const city of [
      "Raleigh, NC",
      "Clemson, SC",
      "Athens, GA",
      "Richmond, VA",
      "Morgantown, WV",
    ]) {
      expect(inHomeRegion(parseLocation(city), HOME_REGION)).toBe(true);
    }
    for (const city of ["Austin, TX", "Seattle, WA", "Nashville, TN"]) {
      expect(inHomeRegion(parseLocation(city), HOME_REGION)).toBe(false);
    }
  });
});

describe("formatLocations", () => {
  it("summarizes long location lists", () => {
    const locations = ["Atlanta, GA", "Austin, TX", "Seattle, WA", "NYC"].map(parseLocation);
    expect(formatLocations(locations)).toBe("Atlanta, GA · Austin, TX +2 more");
  });
});

import { describe, expect, it } from "vitest";

import { parseLocation } from "../src/lib/agent/geo";

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

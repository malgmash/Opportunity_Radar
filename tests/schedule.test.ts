import { describe, expect, it } from "vitest";

import {
  clampIntervalHours,
  DEFAULT_INTERVAL_HOURS,
  describeInterval,
  formatDuration,
  isDue,
  msUntilNextRun,
  nextRunAt,
  normalizeSchedule,
  retryDelayMs,
} from "../src/lib/agent/schedule";
import type { ScheduleState } from "../src/lib/agent/types";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-09-11T12:00:00Z");

function schedule(overrides: Partial<ScheduleState> = {}): ScheduleState {
  return {
    enabled: true,
    intervalHours: DEFAULT_INTERVAL_HOURS,
    consecutiveFailures: 0,
    ...overrides,
  };
}

describe("normalizeSchedule", () => {
  it("defaults to a six hour cadence", () => {
    const result = normalizeSchedule(undefined, {} as NodeJS.ProcessEnv);
    expect(result.enabled).toBe(true);
    expect(result.intervalHours).toBe(6);
    expect(result.consecutiveFailures).toBe(0);
  });

  it("keeps a paused schedule paused", () => {
    expect(normalizeSchedule({ enabled: false }, {} as NodeJS.ProcessEnv).enabled).toBe(
      false,
    );
  });

  it("lets the environment pin the interval and switch the loop off", () => {
    const env = {
      AGENT_REFRESH_HOURS: "12",
      AGENT_REFRESH_DISABLED: "1",
    } as unknown as NodeJS.ProcessEnv;
    const result = normalizeSchedule({ intervalHours: 6, enabled: true }, env);
    expect(result.intervalHours).toBe(12);
    expect(result.enabled).toBe(false);
  });

  it("clamps nonsense intervals into range", () => {
    expect(clampIntervalHours(0)).toBe(1);
    expect(clampIntervalHours(Number.NaN)).toBe(DEFAULT_INTERVAL_HOURS);
    expect(clampIntervalHours(10_000)).toBe(168);
  });
});

describe("nextRunAt", () => {
  it("is owed immediately when the agent has never run", () => {
    expect(isDue(schedule(), NOW)).toBe(true);
    expect(msUntilNextRun(schedule(), NOW)).toBe(0);
  });

  it("waits a full six hours after a successful scan", () => {
    const state = schedule({
      lastRunAt: NOW.toISOString(),
      lastStatus: "ok",
    });
    expect(msUntilNextRun(state, NOW)).toBe(6 * HOUR);
    expect(isDue(state, NOW)).toBe(false);
    expect(isDue(state, new Date(NOW.getTime() + 6 * HOUR))).toBe(true);
  });

  it("counts from the last run, not from now", () => {
    const state = schedule({
      lastRunAt: new Date(NOW.getTime() - 4 * HOUR).toISOString(),
      lastStatus: "ok",
    });
    expect(msUntilNextRun(state, NOW)).toBe(2 * HOUR);
  });

  it("honours a custom interval", () => {
    const state = schedule({
      intervalHours: 12,
      lastRunAt: NOW.toISOString(),
      lastStatus: "ok",
    });
    expect(msUntilNextRun(state, NOW)).toBe(12 * HOUR);
  });

  it("never fires while paused", () => {
    expect(isDue(schedule({ enabled: false }), NOW)).toBe(false);
  });

  it("retries on a backoff after a failure instead of waiting the interval", () => {
    const state = schedule({
      lastRunAt: new Date(NOW.getTime() - 3 * HOUR).toISOString(),
      lastAttemptAt: NOW.toISOString(),
      lastStatus: "error",
      consecutiveFailures: 1,
    });
    expect(msUntilNextRun(state, NOW)).toBe(retryDelayMs(1));
    expect(retryDelayMs(1)).toBeLessThan(6 * HOUR);
  });

  it("caps the backoff at an hour and never past the normal due time", () => {
    expect(retryDelayMs(20)).toBe(HOUR);
    const state = schedule({
      lastRunAt: new Date(NOW.getTime() - 5.9 * HOUR).toISOString(),
      lastAttemptAt: NOW.toISOString(),
      lastStatus: "error",
      consecutiveFailures: 20,
    });
    // The regular cadence comes due sooner than the hour-long backoff.
    expect(msUntilNextRun(state, NOW)).toBeCloseTo(0.1 * HOUR, -2);
  });

  it("returns a due time in the past as zero wait", () => {
    const state = schedule({
      lastRunAt: new Date(NOW.getTime() - 9 * HOUR).toISOString(),
      lastStatus: "ok",
    });
    expect(msUntilNextRun(state, NOW)).toBe(0);
    expect(nextRunAt(state, NOW).getTime()).toBeLessThan(NOW.getTime());
  });

  it("treats an unparseable timestamp as never having run", () => {
    expect(isDue(schedule({ lastRunAt: "not a date" }), NOW)).toBe(true);
  });
});

describe("formatting", () => {
  it("describes the cadence in words", () => {
    expect(describeInterval(6)).toBe("every 6 hours");
    expect(describeInterval(1)).toBe("every hour");
    expect(describeInterval(24)).toBe("once a day");
    expect(describeInterval(48)).toBe("every 2 days");
  });

  it("formats a countdown", () => {
    expect(formatDuration(0)).toBe("any moment");
    expect(formatDuration(30_000)).toBe("under a minute");
    expect(formatDuration(12 * 60_000)).toBe("12m");
    expect(formatDuration(4 * HOUR + 12 * 60_000)).toBe("4h 12m");
    expect(formatDuration(2 * HOUR)).toBe("2h");
  });
});

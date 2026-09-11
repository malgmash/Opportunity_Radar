import type { ScheduleState } from "./types";

export const DEFAULT_INTERVAL_HOURS = 6;
/** Below this the feeds would be hammered for listings that barely move. */
export const MIN_INTERVAL_HOURS = 1;
export const MAX_INTERVAL_HOURS = 24 * 7;

const HOUR_MS = 60 * 60 * 1000;

/** First retry after a failed scan; doubles up to `MAX_BACKOFF_MS`. */
const BASE_BACKOFF_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

export function clampIntervalHours(hours: number): number {
  if (!Number.isFinite(hours)) return DEFAULT_INTERVAL_HOURS;
  return Math.min(MAX_INTERVAL_HOURS, Math.max(MIN_INTERVAL_HOURS, Math.round(hours)));
}

/** `AGENT_REFRESH_HOURS` / `AGENT_REFRESH_DISABLED` win over the stored values. */
export function scheduleDefaults(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
  intervalHours: number;
} {
  const raw = env.AGENT_REFRESH_HOURS;
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  const disabled = env.AGENT_REFRESH_DISABLED === "1" || env.AGENT_REFRESH_DISABLED === "true";
  return {
    enabled: !disabled,
    intervalHours: Number.isFinite(parsed)
      ? clampIntervalHours(parsed)
      : DEFAULT_INTERVAL_HOURS,
  };
}

export function normalizeSchedule(
  schedule: Partial<ScheduleState> | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ScheduleState {
  const defaults = scheduleDefaults(env);
  const envPinsInterval = Boolean(env.AGENT_REFRESH_HOURS);
  return {
    enabled: defaults.enabled && (schedule?.enabled ?? true),
    intervalHours: envPinsInterval
      ? defaults.intervalHours
      : clampIntervalHours(schedule?.intervalHours ?? defaults.intervalHours),
    lastRunAt: schedule?.lastRunAt,
    lastAttemptAt: schedule?.lastAttemptAt,
    lastTrigger: schedule?.lastTrigger,
    lastStatus: schedule?.lastStatus,
    lastError: schedule?.lastError,
    consecutiveFailures: Math.max(0, schedule?.consecutiveFailures ?? 0),
  };
}

function timestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function retryDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  const delay = BASE_BACKOFF_MS * 2 ** (consecutiveFailures - 1);
  return Math.min(MAX_BACKOFF_MS, delay);
}

/**
 * When the next unattended scan is owed. A never-run agent is owed one now, and
 * a failed scan retries on a backoff instead of waiting out the full interval.
 */
export function nextRunAt(schedule: ScheduleState, now: Date = new Date()): Date {
  const last = timestamp(schedule.lastRunAt);
  if (last === undefined) return now;

  const interval = clampIntervalHours(schedule.intervalHours) * HOUR_MS;
  const dueAfterSuccess = last + interval;

  if (schedule.lastStatus === "error" && schedule.consecutiveFailures > 0) {
    const attempt = timestamp(schedule.lastAttemptAt) ?? last;
    const retryAt = attempt + retryDelayMs(schedule.consecutiveFailures);
    return new Date(Math.min(dueAfterSuccess, retryAt));
  }

  return new Date(dueAfterSuccess);
}

export function msUntilNextRun(schedule: ScheduleState, now: Date = new Date()): number {
  return Math.max(0, nextRunAt(schedule, now).getTime() - now.getTime());
}

export function isDue(schedule: ScheduleState, now: Date = new Date()): boolean {
  return schedule.enabled && msUntilNextRun(schedule, now) === 0;
}

export function describeInterval(hours: number): string {
  const value = clampIntervalHours(hours);
  if (value === 1) return "every hour";
  if (value === 24) return "once a day";
  if (value % 24 === 0) return `every ${value / 24} days`;
  return `every ${value} hours`;
}

/** "4h 12m", "12m", "under a minute" — for the next-scan countdown. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "any moment";
  if (ms < 60_000) return "under a minute";
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

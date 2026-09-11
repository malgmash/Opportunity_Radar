import { isDue, msUntilNextRun, nextRunAt } from "./agent/schedule";
import type { RunTrigger, ScheduleState } from "./agent/types";
import { getActiveRun, startRun } from "./runner";
import { readState } from "./store";

/** Lets the server finish booting before the first scan competes for sockets. */
const STARTUP_GRACE_MS = 8_000;
/** Timers drift and laptops sleep, so re-check the due time at least this often. */
const MAX_TIMER_MS = 15 * 60 * 1000;

interface SchedulerHandle {
  timer: ReturnType<typeof setTimeout> | null;
  nextCheckAt: number | null;
  started: boolean;
}

const HANDLE_KEY = Symbol.for("opportunity-radar.scheduler");

function handle(): SchedulerHandle {
  const globals = globalThis as typeof globalThis & {
    [HANDLE_KEY]?: SchedulerHandle;
  };
  globals[HANDLE_KEY] ??= { timer: null, nextCheckAt: null, started: false };
  return globals[HANDLE_KEY];
}

function log(message: string): void {
  console.log(`[schedule] ${message}`);
}

function arm(delayMs: number): void {
  const state = handle();
  if (state.timer) clearTimeout(state.timer);
  const wait = Math.min(MAX_TIMER_MS, Math.max(0, delayMs));
  state.nextCheckAt = Date.now() + wait;
  state.timer = setTimeout(() => {
    void tick();
  }, wait);
  // Never keep a CLI process alive purely to wait for the next scan.
  state.timer.unref?.();
}

async function tick(): Promise<void> {
  const state = handle();
  state.timer = null;

  let schedule: ScheduleState;
  try {
    schedule = (await readState()).schedule;
  } catch (error) {
    log(`could not read state: ${(error as Error).message}`);
    arm(MAX_TIMER_MS);
    return;
  }

  if (!schedule.enabled) {
    state.nextCheckAt = null;
    return;
  }

  if (getActiveRun()) {
    arm(30_000);
    return;
  }

  if (!isDue(schedule)) {
    arm(msUntilNextRun(schedule));
    return;
  }

  const trigger: RunTrigger = schedule.lastRunAt ? "schedule" : "startup";
  log(`starting a ${trigger} scan`);
  const { run } = startRun({ trigger });

  try {
    const result = await run.promise;
    log(
      `scan finished: ${result.opportunities.length} on the board, ` +
        `${result.run.counts.eligible} clear every rule`,
    );
  } catch (error) {
    log(`scan failed: ${(error as Error).message}`);
  }

  try {
    arm(msUntilNextRun((await readState()).schedule));
  } catch {
    arm(MAX_TIMER_MS);
  }
}

/** Idempotent: safe to call from instrumentation on every boot and HMR pass. */
export function startScheduler(): void {
  const state = handle();
  if (state.started) return;
  state.started = true;
  log("watching for the next refresh");
  arm(STARTUP_GRACE_MS);
}

/** Call after the schedule changes so the pending timer reflects the new cadence. */
export function rescheduleNow(): void {
  const state = handle();
  if (!state.started) {
    startScheduler();
    return;
  }
  arm(0);
}

export async function scheduleStatus(): Promise<{
  schedule: ScheduleState;
  nextRunAt: string | null;
  msUntilNextRun: number | null;
  running: boolean;
  runningSince: string | null;
  runningTrigger: RunTrigger | null;
}> {
  const { schedule } = await readState();
  const active = getActiveRun();
  return {
    schedule,
    nextRunAt: schedule.enabled ? nextRunAt(schedule).toISOString() : null,
    msUntilNextRun: schedule.enabled ? msUntilNextRun(schedule) : null,
    running: Boolean(active),
    runningSince: active ? new Date(active.startedAt).toISOString() : null,
    runningTrigger: active?.trigger ?? null,
  };
}

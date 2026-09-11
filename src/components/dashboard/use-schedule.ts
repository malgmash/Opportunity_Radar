"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { msUntilNextRun, nextRunAt } from "@/lib/agent/schedule";
import type { RunTrigger, ScheduleState } from "@/lib/agent/types";

export interface ScheduleStatus {
  schedule: ScheduleState;
  nextRunAt: string | null;
  msUntilNextRun: number | null;
  running: boolean;
  runningSince: string | null;
  runningTrigger: RunTrigger | null;
}

/** Quiet cadence: just enough to notice a scan the scheduler kicked off. */
const IDLE_POLL_MS = 20_000;
/** While a scan is in flight, follow it closely so the board lands promptly. */
const ACTIVE_POLL_MS = 5_000;

interface Options {
  initial: ScheduleState;
  /** Fires when a run the browser did not start has landed new results. */
  onBackgroundRunFinished: (finishedAt: string) => void;
  /** Fires while an unattended run is in flight so the trace can attach to it. */
  onBackgroundRunDetected: (trigger: RunTrigger) => void;
}

/**
 * Keeps the header countdown honest and lets the page notice scans that the
 * scheduler started while the tab was open.
 */
export function useSchedule({
  initial,
  onBackgroundRunFinished,
  onBackgroundRunDetected,
}: Options) {
  const [status, setStatus] = useState<ScheduleStatus>(() => ({
    schedule: initial,
    nextRunAt: initial.enabled ? nextRunAt(initial).toISOString() : null,
    msUntilNextRun: initial.enabled ? msUntilNextRun(initial) : null,
    running: false,
    runningSince: null,
    runningTrigger: null,
  }));
  const [saving, setSaving] = useState(false);
  const lastRunAtRef = useRef(initial.lastRunAt);

  const apply = useCallback(
    (next: ScheduleStatus) => {
      setStatus(next);
      const finishedAt = next.schedule.lastRunAt;
      if (finishedAt && finishedAt !== lastRunAtRef.current) {
        lastRunAtRef.current = finishedAt;
        if (next.schedule.lastTrigger !== "manual") {
          onBackgroundRunFinished(finishedAt);
        }
      }
      if (next.running && next.runningTrigger && next.runningTrigger !== "manual") {
        onBackgroundRunDetected(next.runningTrigger);
      }
    },
    [onBackgroundRunFinished, onBackgroundRunDetected],
  );

  /** Resolves to whether a scan is in flight, which sets the next poll delay. */
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/schedule", { cache: "no-store" });
      if (!response.ok) return false;
      const next = (await response.json()) as ScheduleStatus;
      apply(next);
      return next.running;
    } catch {
      // Offline or mid-restart; the next poll picks it up.
      return false;
    }
  }, [apply]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const running = await refresh();
      if (stopped) return;
      timer = setTimeout(poll, running ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };

    // The countdown already renders from server state, so the first poll waits
    // for hydration to settle rather than racing it.
    timer = setTimeout(poll, 1_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const update = useCallback(
    async (patch: { enabled?: boolean; intervalHours?: number }) => {
      setSaving(true);
      try {
        const response = await fetch("/api/agent/schedule", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (response.ok) apply((await response.json()) as ScheduleStatus);
      } catch {
        // Leave the previous status on screen rather than guessing.
      } finally {
        setSaving(false);
      }
    },
    [apply],
  );

  return { status, saving, refresh, update };
}

/** Re-renders on a cadence so a countdown stays accurate without a poll. */
export function useTicker(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

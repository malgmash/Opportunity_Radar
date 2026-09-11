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

const POLL_MS = 45_000;

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

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/schedule", { cache: "no-store" });
      if (!response.ok) return;
      apply((await response.json()) as ScheduleStatus);
    } catch {
      // Offline or mid-restart; the next poll picks it up.
    }
  }, [apply]);

  useEffect(() => {
    // The countdown is already rendered from server state, so the first poll
    // waits for hydration to settle rather than racing it.
    const kickoff = setTimeout(() => void refresh(), 1_000);
    const poll = setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(kickoff);
      clearInterval(poll);
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

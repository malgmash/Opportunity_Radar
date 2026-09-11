import { runAgent, type RunResult } from "./agent/pipeline";
import type { AgentEvent, RunTrigger } from "./agent/types";
import { describeOutcome, notifyNewMatches } from "./notify";
import { readState, saveRun, saveRunFailure } from "./store";

export interface ActiveRun {
  trigger: RunTrigger;
  startedAt: number;
  /** Replayed to late subscribers so an attached client sees the whole trace. */
  events: AgentEvent[];
  listeners: Set<(event: AgentEvent) => void>;
  promise: Promise<RunResult>;
}

interface RunnerRegistry {
  active: ActiveRun | null;
}

/**
 * The dev server re-evaluates modules on edit, so the in-flight run lives on
 * `globalThis` rather than in module scope.
 */
const REGISTRY_KEY = Symbol.for("opportunity-radar.runner");

function registry(): RunnerRegistry {
  const globals = globalThis as typeof globalThis & {
    [REGISTRY_KEY]?: RunnerRegistry;
  };
  globals[REGISTRY_KEY] ??= { active: null };
  return globals[REGISTRY_KEY];
}

export function getActiveRun(): ActiveRun | null {
  return registry().active;
}

export interface StartRunOptions {
  trigger: RunTrigger;
  /** Trims the travel-funding budget so a run finishes in seconds. */
  quick?: boolean;
}

/**
 * Starts a scan, or hands back the one already running. Callers share a single
 * run because the sources are shared and a scan is heavy on network I/O.
 */
export function startRun(options: StartRunOptions): {
  run: ActiveRun;
  joined: boolean;
} {
  const store = registry();
  if (store.active) return { run: store.active, joined: true };

  const listeners = new Set<(event: AgentEvent) => void>();
  const events: AgentEvent[] = [];

  const run: ActiveRun = {
    trigger: options.trigger,
    startedAt: Date.now(),
    events,
    listeners,
    promise: undefined as unknown as Promise<RunResult>,
  };

  const emit = (event: AgentEvent) => {
    events.push(event);
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // A dropped connection must not take the run down with it.
      }
    }
  };

  run.promise = (async () => {
    try {
      const state = await readState();
      const result = await runAgent({
        profile: state.profile,
        travelCheckBudget: options.quick ? 8 : undefined,
        emit,
      });
      await saveRun(result.run, result.opportunities, options.trigger);

      const outcome = await notifyNewMatches(result.opportunities, state.profile);
      emit({
        type: "log",
        level: outcome.status === "error" ? "warn" : "info",
        message: describeOutcome(outcome),
      });

      return result;
    } catch (error) {
      const message = (error as Error).message;
      emit({ type: "error", message });
      await saveRunFailure(options.trigger, message).catch(() => {});
      throw error;
    } finally {
      store.active = null;
    }
  })();

  store.active = run;
  return { run, joined: false };
}

/** Replays what the run has emitted so far, then streams the rest. */
export function subscribe(
  run: ActiveRun,
  listener: (event: AgentEvent) => void,
): () => void {
  for (const event of run.events) listener(event);
  run.listeners.add(listener);
  return () => {
    run.listeners.delete(listener);
  };
}

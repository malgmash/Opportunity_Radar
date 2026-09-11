"use client";

import { useCallback, useRef, useState } from "react";

import type {
  AgentEvent,
  Opportunity,
  RunSummary,
  SourceReport,
  TraceStep,
} from "@/lib/agent/types";

export interface RunState {
  running: boolean;
  steps: TraceStep[];
  sources: SourceReport[];
  error?: string;
}

interface Options {
  onComplete: (run: RunSummary, opportunities: Opportunity[]) => void;
}

interface RunOptions {
  /** Shorter travel-funding budget, for a scan that returns in seconds. */
  quick?: boolean;
  /** Only watch a scan that is already running; never start one. */
  attachOnly?: boolean;
}

/** Consumes the NDJSON trace the run endpoint streams back. */
export function useAgentRun({ onComplete }: Options) {
  const [state, setState] = useState<RunState>({
    running: false,
    steps: [],
    sources: [],
  });
  const abortRef = useRef<AbortController | null>(null);

  const begin = useCallback(
    async ({ quick = false, attachOnly = false }: RunOptions = {}) => {
      if (abortRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ running: true, steps: [], sources: [], error: undefined });

      try {
        const params = new URLSearchParams();
        if (quick) params.set("quick", "1");
        if (attachOnly) params.set("attach", "1");
        const query = params.size ? `?${params}` : "";
        const response = await fetch(`/api/agent/run${query}`, {
          method: "POST",
          signal: controller.signal,
        });

        // 204 means the unattended run already finished; nothing to watch.
        if (attachOnly && response.status === 204) {
          setState((current) => ({ ...current, running: false }));
          return;
        }

        if (!response.ok || !response.body) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(
            (detail as { error?: string }).error ??
              `The run endpoint returned ${response.status}.`,
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let event: AgentEvent;
            try {
              event = JSON.parse(line) as AgentEvent;
            } catch {
              continue;
            }

            if (event.type === "step") {
              setState((current) => {
                const steps = [...current.steps];
                const index = steps.findIndex((step) => step.id === event.step.id);
                if (index >= 0) steps[index] = event.step;
                else steps.push(event.step);
                return { ...current, steps };
              });
            } else if (event.type === "source") {
              setState((current) => {
                const sources = current.sources.filter(
                  (source) => source.id !== event.report.id,
                );
                return { ...current, sources: [...sources, event.report] };
              });
            } else if (event.type === "done") {
              onComplete(event.run, event.opportunities);
            } else if (event.type === "error") {
              setState((current) => ({ ...current, error: event.message }));
            }
          }
        }
        setState((current) => ({ ...current, running: false }));
      } catch (error) {
        setState((current) => ({
          ...current,
          running: false,
          error: (error as Error).message,
        }));
      } finally {
        abortRef.current = null;
      }
    },
    [onComplete],
  );

  const start = useCallback(
    (quick = false) => begin({ quick }),
    [begin],
  );
  const attach = useCallback(() => begin({ attachOnly: true }), [begin]);

  return { ...state, start, attach };
}

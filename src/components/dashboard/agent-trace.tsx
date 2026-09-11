"use client";

import { CircleCheck, CircleX, Loader2, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SourceReport, TraceStep } from "@/lib/agent/types";
import { hostOf } from "@/lib/ui";

const STATUS_ICON = {
  running: Loader2,
  ok: CircleCheck,
  warn: TriangleAlert,
  error: CircleX,
} as const;

const STATUS_COLOR = {
  running: "text-muted-foreground",
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-rose-600 dark:text-rose-400",
} as const;

function StepRow({ step }: { step: TraceStep }) {
  const Icon = STATUS_ICON[step.status];
  return (
    <li className="relative pl-7">
      <span
        className={cn(
          "bg-card absolute top-0.5 left-0 flex size-5 items-center justify-center rounded-full",
          STATUS_COLOR[step.status],
        )}
      >
        <Icon className={cn("size-4", step.status === "running" && "animate-spin")} />
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="text-sm font-medium">{step.label}</p>
        {step.durationMs !== undefined && (
          <span className="text-muted-foreground font-mono text-[11px]">
            {(step.durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      {step.detail && (
        <p className="text-muted-foreground text-xs">{step.detail}</p>
      )}
      {step.facts.length > 0 && (
        <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
          {step.facts.map((fact, index) => (
            <li key={`${step.id}-fact-${index}`} className="font-mono leading-snug">
              {fact}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function AgentTrace({
  steps,
  sources,
  running,
}: {
  steps: TraceStep[];
  sources: SourceReport[];
  running: boolean;
}) {
  if (!steps.length && !sources.length) return null;

  return (
    <Card className="gap-4">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          Agent trace
          {running && (
            <Badge variant="secondary" className="gap-1 font-normal">
              <Loader2 className="size-3 animate-spin" />
              running
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="before:bg-border relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[9px] before:w-px">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </ol>

        {sources.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              Sources
            </p>
            <ul className="space-y-1.5">
              {sources
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((source) => (
                  <li
                    key={source.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate hover:underline"
                      title={hostOf(source.url)}
                    >
                      {source.name}
                    </a>
                    <span
                      className={cn(
                        "shrink-0 font-mono",
                        source.status === "ok"
                          ? "text-muted-foreground"
                          : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {source.status === "ok"
                        ? `${source.fetched} · ${(source.durationMs / 1000).toFixed(1)}s`
                        : "failed"}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

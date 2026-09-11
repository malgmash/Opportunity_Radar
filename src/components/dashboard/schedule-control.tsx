"use client";

import { Clock, Loader2, Pause, Play } from "lucide-react";

import type { ScheduleStatus } from "@/components/dashboard/use-schedule";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { describeInterval, formatDuration } from "@/lib/agent/schedule";
import { cn } from "@/lib/utils";

interface Props {
  status: ScheduleStatus;
  saving: boolean;
  /** Passed in from a ticker so the countdown moves between polls. */
  now: number;
  onToggle: (enabled: boolean) => void;
}

export function ScheduleControl({ status, saving, now, onToggle }: Props) {
  const { schedule, running } = status;
  const cadence = describeInterval(schedule.intervalHours);

  const remaining =
    status.nextRunAt !== null
      ? Math.max(0, new Date(status.nextRunAt).getTime() - now)
      : null;

  const summary = running
    ? "Scanning now…"
    : !schedule.enabled
      ? "Auto-refresh paused"
      : remaining === null
        ? `Refreshes ${cadence}`
        : `Next scan ${remaining <= 0 ? "any moment" : `in ${formatDuration(remaining)}`}`;

  const explanation = !schedule.enabled
    ? `The agent only scans when you ask it to. Resume to go back to ${cadence}.`
    : schedule.lastStatus === "error"
      ? `Last scan failed: ${schedule.lastError ?? "unknown error"}. Retrying on a backoff, then back to ${cadence}.`
      : `The agent rescans ${cadence} on its own, even with this tab closed.`;

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-lg px-1.5 py-1 ring-1 ring-inset",
        schedule.enabled
          ? "ring-foreground/10"
          : "bg-muted/50 ring-transparent",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground flex cursor-default items-center gap-1.5 px-1 text-xs">
            {running ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
            ) : (
              <Clock
                className={cn(
                  "size-3.5 shrink-0",
                  schedule.lastStatus === "error" && "text-amber-600",
                )}
              />
            )}
            <span className="whitespace-nowrap">{summary}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{explanation}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            disabled={saving}
            aria-label={
              schedule.enabled ? "Pause automatic scans" : "Resume automatic scans"
            }
            onClick={() => onToggle(!schedule.enabled)}
          >
            {schedule.enabled ? (
              <Pause className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {schedule.enabled ? "Pause automatic scans" : `Resume scanning ${cadence}`}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

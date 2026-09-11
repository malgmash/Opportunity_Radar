"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Calendar,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  GraduationCap,
  MapPin,
  Plane,
  Quote,
  TriangleAlert,
  Trophy,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatLocations } from "@/lib/agent/geo";
import { describeCountdown } from "@/lib/agent/dates";
import type { Opportunity } from "@/lib/agent/types";
import {
  DECISION_CLASSES,
  DECISION_LABELS,
  KIND_LABELS,
  VERDICT_CLASSES,
  hostOf,
  travelLabel,
  urgencyTone,
} from "@/lib/ui";
import { cn } from "@/lib/utils";

const VERDICT_ICON = {
  pass: CircleCheck,
  warn: TriangleAlert,
  fail: CircleX,
} as const;

function MetaItem({
  icon: Icon,
  children,
  className,
}: {
  icon: typeof MapPin;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <Icon className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function OpportunityCard({
  opportunity,
  action,
  onAction,
}: {
  opportunity: Opportunity;
  action?: "saved" | "dismissed";
  onAction: (id: string, action: "saved" | "dismissed" | null) => void;
}) {
  const [showChecks, setShowChecks] = useState(false);
  const travel = travelLabel(opportunity);
  const countdown =
    opportunity.kind === "internship"
      ? undefined
      : (opportunity.deadlineLabel ?? describeCountdown(opportunity.daysUntil));
  const evidence = opportunity.travel.evidence[0];

  return (
    <Card
      className={cn(
        "transition-shadow hover:shadow-md",
        action === "dismissed" && "opacity-55",
      )}
    >
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="font-normal">
            {KIND_LABELS[opportunity.kind]}
          </Badge>
          <Badge
            variant="outline"
            className={cn("font-normal", DECISION_CLASSES[opportunity.eligibility.decision])}
          >
            {DECISION_LABELS[opportunity.eligibility.decision]}
          </Badge>
          {travel && (
            <Badge variant="outline" className="gap-1 font-normal">
              <Plane className="size-3" />
              {travel}
            </Badge>
          )}
          {!opportunity.datesConfirmed && (
            <Badge variant="outline" className="font-normal">
              Dates unconfirmed
            </Badge>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "ml-auto shrink-0 rounded-md px-2 py-0.5 font-mono text-xs",
                  opportunity.fit.score >= 60
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {opportunity.fit.score}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Fit score out of 100, from {opportunity.fit.reasonedBy}
            </TooltipContent>
          </Tooltip>
        </div>

        <CardTitle>
          <a
            href={opportunity.url}
            target="_blank"
            rel="noreferrer"
            className="group/link inline-flex items-start gap-1 hover:underline"
          >
            {opportunity.title}
            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover/link:opacity-70" />
          </a>
        </CardTitle>

        {opportunity.organization && (
          <p className="text-muted-foreground text-xs">{opportunity.organization}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="text-muted-foreground grid gap-1.5 text-xs sm:grid-cols-2">
          <MetaItem icon={MapPin}>{formatLocations(opportunity.locations)}</MetaItem>
          {opportunity.dateLabel && (
            <MetaItem icon={Calendar}>{opportunity.dateLabel}</MetaItem>
          )}
          {countdown && (
            <MetaItem icon={Clock} className={urgencyTone(opportunity.daysUntil)}>
              {countdown}
            </MetaItem>
          )}
          {opportunity.term && (
            <MetaItem icon={GraduationCap}>{opportunity.term}</MetaItem>
          )}
          {opportunity.reward && (
            <MetaItem icon={Trophy}>{opportunity.reward}</MetaItem>
          )}
        </div>

        <p className="text-sm">{opportunity.eligibility.summary}</p>

        {opportunity.fit.reasons.length > 0 && (
          <ul className="text-muted-foreground space-y-1 text-xs">
            {opportunity.fit.reasons.slice(0, 3).map((reason, index) => (
              <li key={index} className="flex gap-1.5">
                <span aria-hidden className="text-foreground/40">
                  ·
                </span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}

        {evidence && (
          <blockquote className="bg-muted/60 text-muted-foreground rounded-md px-2.5 py-2 text-xs">
            <span className="text-foreground/70 mb-1 flex items-center gap-1 font-medium">
              <Quote className="size-3" />
              Read from {hostOf(evidence.sourceUrl)}
            </span>
            {evidence.quote}
          </blockquote>
        )}

        {opportunity.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {opportunity.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowChecks((open) => !open)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            aria-expanded={showChecks}
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", showChecks && "rotate-180")}
            />
            {showChecks ? "Hide" : "Show"} rule checks (
            {opportunity.eligibility.verdicts.length})
          </button>

          {showChecks && (
            <ul className="mt-2 space-y-1.5">
              {opportunity.eligibility.verdicts.map((verdict) => {
                const Icon = VERDICT_ICON[verdict.status];
                return (
                  <li key={verdict.rule} className="flex gap-2 text-xs">
                    <Icon
                      className={cn("mt-0.5 size-3.5 shrink-0", VERDICT_CLASSES[verdict.status])}
                    />
                    <span>
                      <span className="font-medium">{verdict.label}.</span>{" "}
                      <span className="text-muted-foreground">{verdict.detail}</span>
                    </span>
                  </li>
                );
              })}
              {opportunity.dateEvidence && (
                <li className="text-muted-foreground pl-5 text-xs">
                  Date read from the event site: “{opportunity.dateEvidence}”
                </li>
              )}
              {opportunity.locationEvidence && (
                <li className="text-muted-foreground pl-5 text-xs">
                  Location resolved from: “{opportunity.locationEvidence}”
                </li>
              )}
            </ul>
          )}
        </div>
      </CardContent>

      <CardFooter className="justify-between gap-2">
        <a
          href={opportunity.source.url}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground truncate text-[11px] hover:underline"
        >
          via {opportunity.source.name}
        </a>
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant={action === "saved" ? "default" : "outline"}
            onClick={() => onAction(opportunity.id, action === "saved" ? null : "saved")}
          >
            {action === "saved" ? (
              <BookmarkCheck className="size-3.5" />
            ) : (
              <Bookmark className="size-3.5" />
            )}
            {action === "saved" ? "Saved" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={action === "dismissed" ? "Restore" : "Dismiss"}
            onClick={() =>
              onAction(opportunity.id, action === "dismissed" ? null : "dismissed")
            }
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

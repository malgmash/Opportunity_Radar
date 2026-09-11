"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  Clock,
  Globe,
  Loader2,
  MapPin,
  Plane,
  Radar,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { AgentTrace } from "@/components/dashboard/agent-trace";
import { OpportunityCard } from "@/components/dashboard/opportunity-card";
import { ProfileDialog } from "@/components/dashboard/profile-dialog";
import { ScheduleControl } from "@/components/dashboard/schedule-control";
import { useAgentRun } from "@/components/dashboard/use-agent-run";
import { useSchedule, useTicker } from "@/components/dashboard/use-schedule";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inHomeRegion, isVirtual, US_STATES } from "@/lib/agent/geo";
import { describeInterval } from "@/lib/agent/schedule";
import type {
  AgentState,
  Opportunity,
  OpportunityKind,
  Profile,
  RunSummary,
} from "@/lib/agent/types";
import { KIND_PLURALS, relativeTime } from "@/lib/ui";
import { cn } from "@/lib/utils";

type KindTab = OpportunityKind | "all" | "saved";

const KIND_TABS: { value: KindTab; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "hackathon", label: "Hackathons" },
  { value: "internship", label: "Internships" },
  { value: "conference", label: "Conferences" },
  { value: "saved", label: "Saved" },
];

const CHIPS = [
  { id: "inRegion", label: "In my region", icon: MapPin },
  { id: "travelFunded", label: "Travel funded", icon: Plane },
  { id: "online", label: "Online", icon: Globe },
  { id: "eligible", label: "Meets every rule", icon: Sparkles },
  { id: "soon", label: "Next 2 weeks", icon: CalendarClock },
] as const;

type ChipId = (typeof CHIPS)[number]["id"];

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="bg-card rounded-lg px-3 py-2.5 ring-1 ring-foreground/10">
      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</p>
      <p className="font-heading text-xl leading-tight font-medium">{value}</p>
      {hint && <p className="text-muted-foreground truncate text-[11px]">{hint}</p>}
    </div>
  );
}

export function Dashboard({ initialState }: { initialState: AgentState }) {
  const [profile, setProfile] = useState<Profile>(initialState.profile);
  const [opportunities, setOpportunities] = useState<Opportunity[]>(
    initialState.opportunities,
  );
  const [lastRun, setLastRun] = useState<RunSummary | undefined>(initialState.lastRun);
  const [actions, setActions] = useState(initialState.actions);
  const [tab, setTab] = useState<KindTab>("all");
  const [chips, setChips] = useState<ChipId[]>([]);
  const [query, setQuery] = useState("");

  const lastRunRef = useRef(initialState.lastRun);
  useEffect(() => {
    lastRunRef.current = lastRun;
  }, [lastRun]);

  const applyRun = useCallback((run: RunSummary, items: Opportunity[]) => {
    setLastRun(run);
    setOpportunities(items);
  }, []);

  const onComplete = useCallback(
    (run: RunSummary, items: Opportunity[]) => {
      applyRun(run, items);
      toast.success(
        `${run.counts.eligible} opportunities clear every rule (${items.length} on the board).`,
      );
    },
    [applyRun],
  );

  const run = useAgentRun({ onComplete });
  const attachToRun = run.attach;

  /** A scheduled scan finished while this tab was open: pull the new board in. */
  const onBackgroundRunFinished = useCallback(
    async (finishedAt: string) => {
      if (lastRunRef.current?.finishedAt === finishedAt) return;
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as AgentState;
        if (!next.lastRun) return;
        applyRun(next.lastRun, next.opportunities);
        setActions(next.actions);
        toast.success(
          `Scheduled scan refreshed the board — ${next.lastRun.counts.eligible} clear every rule.`,
        );
      } catch {
        // The next poll will try again.
      }
    },
    [applyRun],
  );

  /** Attach the live trace to a scan the scheduler started. */
  const onBackgroundRunDetected = useCallback(() => {
    void attachToRun();
  }, [attachToRun]);

  const schedule = useSchedule({
    initial: initialState.schedule,
    onBackgroundRunFinished,
    onBackgroundRunDetected,
  });
  const now = useTicker();
  const refreshSchedule = schedule.refresh;

  useEffect(() => {
    if (run.running) return;
    // Pick up anything that landed between polls once a manual run settles.
    void refreshSchedule();
  }, [run.running, refreshSchedule]);

  const toggleChip = (id: ChipId) =>
    setChips((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );

  async function setAction(id: string, action: "saved" | "dismissed" | null) {
    setActions((current) => {
      const next = { ...current };
      if (action) next[id] = action;
      else delete next[id];
      return next;
    });
    try {
      await fetch(`/api/opportunities/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch {
      toast.error("Could not save that change.");
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return opportunities.filter((item) => {
      if (tab === "saved") {
        if (actions[item.id] !== "saved") return false;
      } else {
        if (tab !== "all" && item.kind !== tab) return false;
        if (actions[item.id] === "dismissed" && !chips.includes("eligible")) {
          // Dismissed items stay reachable through the Saved tab and search only.
          if (!needle) return false;
        }
      }

      if (needle) {
        const haystack = [
          item.title,
          item.organization,
          item.description,
          item.tags.join(" "),
          item.locations.map((location) => location.raw).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      for (const chip of chips) {
        if (
          chip === "inRegion" &&
          !item.locations.some((location) => inHomeRegion(location, profile.homeRegion))
        ) {
          return false;
        }
        if (chip === "travelFunded" && item.travel.status !== "confirmed") return false;
        if (chip === "online" && !item.locations.some(isVirtual)) return false;
        if (chip === "eligible" && item.eligibility.decision !== "eligible") return false;
        if (
          chip === "soon" &&
          !(item.daysUntil !== undefined && item.daysUntil >= 0 && item.daysUntil <= 14)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [opportunities, tab, chips, query, actions, profile.homeRegion]);

  const counts = useMemo(() => {
    const inRegion = opportunities.filter((item) =>
      item.locations.some((location) => inHomeRegion(location, profile.homeRegion)),
    ).length;
    const travelFunded = opportunities.filter(
      (item) => item.travel.status === "confirmed",
    ).length;
    const soon = opportunities.filter(
      (item) => item.daysUntil !== undefined && item.daysUntil >= 0 && item.daysUntil <= 14,
    ).length;
    return { inRegion, travelFunded, soon };
  }, [opportunities, profile.homeRegion]);

  const regionLabel = profile.homeRegion
    .map((code) => US_STATES[code] ?? code)
    .join(", ");
  const hasData = opportunities.length > 0;

  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-background/85 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
              <Radar className="size-5" />
            </span>
            <div>
              <p className="font-heading leading-tight font-medium">Opportunity Radar</p>
              <p className="text-muted-foreground text-xs">
                {regionLabel} · class of {profile.graduationYear}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ScheduleControl
              status={schedule.status}
              saving={schedule.saving}
              now={now}
              onToggle={(enabled) => {
                void schedule.update({ enabled });
                toast.info(
                  enabled
                    ? `Automatic scans resumed — ${describeInterval(schedule.status.schedule.intervalHours)}.`
                    : "Automatic scans paused. Use Run again whenever you want a fresh sweep.",
                );
              }}
            />
            <ProfileDialog profile={profile} onSaved={setProfile} />
            <Button size="sm" onClick={() => run.start()} disabled={run.running}>
              {run.running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {run.running ? "Scanning…" : hasData ? "Run again" : "Run the agent"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {run.error && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="flex items-start gap-2 text-sm">
                <AlertCircle className="text-destructive mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-medium">The run stopped early.</p>
                  <p className="text-muted-foreground">{run.error}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {lastRun ? (
            <Card>
              <CardHeader className="gap-1.5">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  Latest briefing
                  <Badge variant="secondary" className="font-normal">
                    {relativeTime(lastRun.finishedAt)}
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    {lastRun.reasoner}
                  </Badge>
                </CardTitle>
                <p className="text-muted-foreground text-sm">{lastRun.digest}</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat
                    label="Meets every rule"
                    value={lastRun.counts.eligible}
                    hint={`of ${opportunities.length} on the board`}
                  />
                  <Stat
                    label="In region"
                    value={counts.inRegion}
                    hint="no travel needed"
                  />
                  <Stat
                    label="Travel funded"
                    value={counts.travelFunded}
                    hint="verified on the event site"
                  />
                  <Stat label="Next 2 weeks" value={counts.soon} hint="acting soon" />
                </div>
                {lastRun.warnings.length > 0 && (
                  <ul className="text-muted-foreground mt-3 space-y-1 text-xs">
                    {lastRun.warnings.map((warning, index) => (
                      <li key={index} className="flex gap-1.5">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        {warning}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No scan yet</CardTitle>
                <p className="text-muted-foreground text-sm">
                  The agent reads live hackathon, internship and conference feeds, then
                  keeps only what fits your rules.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2">
                    <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    Hackathons and conferences in {regionLabel}, or anywhere in the US
                    when the event documents travel funding.
                  </li>
                  <li className="flex gap-2">
                    <Building2 className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    {profile.internshipTerms.join(" and ")} internships anywhere in the
                    US for a {profile.graduationYear} graduate.
                  </li>
                  <li className="flex gap-2">
                    <Sparkles className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    Scored against data and analytics, software engineering and product
                    management.
                  </li>
                </ul>
                <Button onClick={() => run.start()} disabled={run.running}>
                  {run.running ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Radar className="size-4" />
                  )}
                  {run.running ? "Scanning…" : "Run the first scan"}
                </Button>
                <p className="text-muted-foreground text-xs">
                  A full scan reads about 1,800 listings and takes under a minute.
                  {schedule.status.schedule.enabled &&
                    ` The agent also rescans on its own ${describeInterval(
                      schedule.status.schedule.intervalHours,
                    )}.`}
                </p>
              </CardContent>
            </Card>
          )}

          {(hasData || run.running) && (
            <div className="space-y-3">
              <Tabs value={tab} onValueChange={(value) => setTab(value as KindTab)}>
                <TabsList className="w-full justify-start overflow-x-auto">
                  {KIND_TABS.map((entry) => {
                    const count =
                      entry.value === "all"
                        ? opportunities.length
                        : entry.value === "saved"
                          ? Object.values(actions).filter((value) => value === "saved")
                              .length
                          : opportunities.filter((item) => item.kind === entry.value)
                              .length;
                    return (
                      <TabsTrigger key={entry.value} value={entry.value} className="gap-1.5">
                        {entry.label}
                        <span className="text-muted-foreground font-mono text-[11px]">
                          {count}
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>

              <div className="flex flex-wrap items-center gap-2">
                {CHIPS.map((chip) => {
                  const active = chips.includes(chip.id);
                  const Icon = chip.icon;
                  return (
                    <button key={chip.id} type="button" onClick={() => toggleChip(chip.id)}>
                      <Badge
                        variant={active ? "default" : "outline"}
                        className="cursor-pointer gap-1 font-normal"
                      >
                        <Icon className="size-3" />
                        {chip.label}
                      </Badge>
                    </button>
                  );
                })}
                <div className="relative ml-auto w-full sm:w-56">
                  <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search titles, tags, cities"
                    className="h-8 pl-8 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {run.running && !hasData ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index}>
                  <CardHeader className="gap-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-3/4" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-3 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : visible.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {visible.map((item) => (
                <OpportunityCard
                  key={item.id}
                  opportunity={item}
                  action={actions[item.id]}
                  onAction={setAction}
                />
              ))}
            </div>
          ) : (
            hasData && (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="font-medium">Nothing matches these filters</p>
                  <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
                    {tab === "saved"
                      ? "Save an opportunity and it will show up here."
                      : "Clear a filter or widen your search rules, then run the agent again."}
                  </p>
                  {(chips.length > 0 || query) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => {
                        setChips([]);
                        setQuery("");
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <AgentTrace
            steps={run.steps.length ? run.steps : (lastRun?.steps ?? [])}
            sources={run.sources.length ? run.sources : (lastRun?.sources ?? [])}
            running={run.running}
          />
          {lastRun && (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm">Rules in force</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground space-y-2 text-xs">
                <p className="flex gap-1.5">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  Events in {regionLabel}
                  {profile.requireTravelSupportOutsideRegion
                    ? ", or elsewhere in the US with documented travel funding"
                    : ", plus anywhere else in the US"}
                  .
                </p>
                <p className="flex gap-1.5">
                  <Building2 className="mt-0.5 size-3.5 shrink-0" />
                  {profile.internshipTerms.join(", ")} internships anywhere in the US.
                </p>
                <p className="flex gap-1.5">
                  <Globe className="mt-0.5 size-3.5 shrink-0" />
                  Online events {profile.allowVirtualEvents ? "included" : "excluded"}.
                </p>
                <p className={cn("flex gap-1.5")}>
                  <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                  Fit threshold {profile.minimumFitScore}/100 across{" "}
                  {profile.interests.length} focus areas.
                </p>
                <p className="flex gap-1.5">
                  <Clock className="mt-0.5 size-3.5 shrink-0" />
                  {schedule.status.schedule.enabled
                    ? `Rescans ${describeInterval(schedule.status.schedule.intervalHours)}, unattended.`
                    : "Automatic rescans are paused."}
                </p>
              </CardContent>
            </Card>
          )}
        </aside>
      </main>

      <footer className="text-muted-foreground mx-auto w-full max-w-7xl px-4 pb-6 text-xs sm:px-6">
        {lastRun
          ? `Last scan read ${lastRun.counts.collected} listings from ${lastRun.sources.length} sources in ${(lastRun.durationMs / 1000).toFixed(0)}s.`
          : `Reads ${KIND_TABS.length - 2} opportunity types from live public feeds.`}
      </footer>
    </div>
  );
}

export { KIND_PLURALS };

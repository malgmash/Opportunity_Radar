"use client";

import { useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { US_STATES } from "@/lib/agent/geo";
import { internshipTermsForGraduationYear } from "@/lib/agent/profile";
import { TRACK_LABELS } from "@/lib/agent/taxonomy";
import type { Profile, Track } from "@/lib/agent/types";

const SOUTHEAST = ["NC", "SC", "GA", "VA", "WV", "TN", "FL", "MD", "DC", "KY", "AL"];
const TRACKS = Object.keys(TRACK_LABELS) as Track[];

export function ProfileDialog({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);

  function openChange(next: boolean) {
    if (next) setDraft(profile);
    setOpen(next);
  }

  const update = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const toggleState = (code: string) =>
    update(
      "homeRegion",
      draft.homeRegion.includes(code)
        ? draft.homeRegion.filter((entry) => entry !== code)
        : [...draft.homeRegion, code],
    );

  const toggleTrack = (track: Track) =>
    update(
      "interests",
      draft.interests.includes(track)
        ? draft.interests.filter((entry) => entry !== track)
        : [...draft.interests, track],
    );

  async function save() {
    if (!draft.homeRegion.length || !draft.interests.length) {
      toast.error("Pick at least one focus area and one home state.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error ?? `Save failed with ${response.status}`);
      }
      onSaved(draft);
      setOpen(false);
      toast.success("Profile saved. Run the agent to apply it.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="size-4" />
          <span className="hidden sm:inline">Search rules</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Search rules</DialogTitle>
          <DialogDescription>
            These rules drive every filter the agent applies on the next run.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="graduationYear">Graduation year</Label>
              <Input
                id="graduationYear"
                type="number"
                min={2024}
                max={2040}
                value={draft.graduationYear}
                onChange={(event) => {
                  const year = Number(event.target.value);
                  setDraft((current) => ({
                    ...current,
                    graduationYear: year,
                    internshipTerms: Number.isFinite(year)
                      ? internshipTermsForGraduationYear(year)
                      : current.internshipTerms,
                  }));
                }}
              />
              <p className="text-muted-foreground text-xs">
                Sets the summer terms: {draft.internshipTerms.join(", ")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="homeBase">Home base</Label>
              <Input
                id="homeBase"
                value={draft.homeBase}
                onChange={(event) => update("homeBase", event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Focus areas</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {TRACKS.map((track) => (
                <label
                  key={track}
                  className="hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm"
                >
                  <Checkbox
                    checked={draft.interests.includes(track)}
                    onCheckedChange={() => toggleTrack(track)}
                  />
                  {TRACK_LABELS[track]}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Home region for events</Label>
            <p className="text-muted-foreground text-xs">
              Hackathons and conferences inside these states never need travel funding.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SOUTHEAST.map((code) => {
                const active = draft.homeRegion.includes(code);
                return (
                  <button key={code} type="button" onClick={() => toggleState(code)}>
                    <Badge
                      variant={active ? "default" : "outline"}
                      className="cursor-pointer font-normal"
                      title={US_STATES[code]}
                    >
                      {code}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="travel">Require travel funding outside the region</Label>
                <p className="text-muted-foreground text-xs">
                  Out-of-region US events must document reimbursement, a stipend or a
                  travel grant.
                </p>
              </div>
              <Switch
                id="travel"
                checked={draft.requireTravelSupportOutsideRegion}
                onCheckedChange={(checked) =>
                  update("requireTravelSupportOutsideRegion", checked)
                }
              />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="virtual">Include online events</Label>
                <p className="text-muted-foreground text-xs">
                  Online events cost nothing to attend, so they skip the region rule.
                </p>
              </div>
              <Switch
                id="virtual"
                checked={draft.allowVirtualEvents}
                onCheckedChange={(checked) => update("allowVirtualEvents", checked)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="keywords">Extra keywords</Label>
            <Input
              id="keywords"
              value={draft.keywords.join(", ")}
              onChange={(event) =>
                update(
                  "keywords",
                  event.target.value
                    .split(",")
                    .map((keyword) => keyword.trim())
                    .filter(Boolean)
                    .slice(0, 20),
                )
              }
              placeholder="data analysis, product management"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save rules
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

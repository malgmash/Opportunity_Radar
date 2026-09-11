"use client";

import { useCallback, useState } from "react";
import { Loader2, Mail, MailWarning, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NotifyStatus } from "@/lib/notify/status";
import { relativeTime } from "@/lib/ui";

export function AlertsCard({ initial }: { initial: NotifyStatus }) {
  const [status, setStatus] = useState(initial);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (response.ok) setStatus((await response.json()) as NotifyStatus);
    } catch {
      // Keep the last known status on screen.
    }
  }, []);

  const sendTest = async () => {
    setSending(true);
    try {
      const response = await fetch("/api/notifications/test", { method: "POST" });
      const body = (await response.json()) as { detail?: string };
      if (response.ok) toast.success(body.detail ?? "Test digest sent.");
      else toast.error(body.detail ?? "The test email could not be sent.");
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const last = status.lastNotification;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          {status.configured ? (
            <Mail className="size-3.5" />
          ) : (
            <MailWarning className="size-3.5 text-amber-600" />
          )}
          Email alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-2 text-xs">
        {status.configured ? (
          <p>
            Emailing{" "}
            <span className="text-foreground font-medium">
              {status.recipients.join(", ")}
            </span>{" "}
            whenever a new {status.kinds.join(" or ")} clears every rule.
          </p>
        ) : (
          <p>
            No recipient set yet. Add <code className="text-foreground">NOTIFY_TO</code> and
            mail credentials, and digests go out automatically after every scan. Until
            then each digest is written to{" "}
            <code className="text-foreground">.data/outbox</code> so you can see exactly
            what would have been sent.
          </p>
        )}

        <p>
          {status.alreadySent > 0
            ? `${status.alreadySent} internship${status.alreadySent === 1 ? "" : "s"} already announced.`
            : "Nothing announced yet."}
          {status.pending > 0 && ` ${status.pending} queued for the next scan.`}
        </p>

        {last && (
          <p>
            Last digest {relativeTime(last.sentAt)} —{" "}
            <span className={last.status === "error" ? "text-rose-600" : undefined}>
              {last.detail}
            </span>
          </p>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={sending}
          onClick={sendTest}
        >
          {sending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
          Send a test digest
        </Button>
        <p className="text-[11px]">
          Delivery: {status.transportLabel}.
        </p>
      </CardContent>
    </Card>
  );
}

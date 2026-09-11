import type { NotificationRecord, Opportunity, Profile } from "../agent/types";
import { readState, recordNotification } from "../store";
import { canSend, describeTransport, maskAddress, readNotifyConfig } from "./config";
import type { NotifyConfig } from "./config";
import { renderDigest } from "./render";
import { deliver } from "./transport";

export interface NotifyOutcome {
  status: "sent" | "skipped" | "error";
  matches: number;
  /** Included in the digest body, as opposed to counted in the overflow line. */
  included: number;
  detail: string;
  transport: string;
}

function boardUrl(): string {
  return process.env.NOTIFY_BOARD_URL ?? "http://localhost:43127";
}

/**
 * A match is worth an email only if it clears every rule outright. Anything in
 * "needs a check" is on the board for a human to judge, not worth a push.
 */
export function selectMatches(
  opportunities: Opportunity[],
  notifiedAt: Record<string, string>,
  config: NotifyConfig,
): Opportunity[] {
  return opportunities
    .filter((item) => config.kinds.includes(item.kind))
    .filter((item) => item.eligibility.decision === "eligible")
    .filter((item) => !notifiedAt[item.id])
    .sort((a, b) => {
      // A dated application window outranks an undated one; ties go to fit.
      const aDue = Date.parse(a.deadline ?? "");
      const bDue = Date.parse(b.deadline ?? "");
      const aDated = Number.isFinite(aDue);
      const bDated = Number.isFinite(bDue);
      if (aDated && bDated && aDue !== bDue) return aDue - bDue;
      if (aDated !== bDated) return aDated ? -1 : 1;
      return b.fit.score - a.fit.score;
    });
}

/**
 * Emails the internships that are new since the last digest. Never throws: a
 * mail problem must not fail the scan that found the opportunities.
 */
export async function notifyNewMatches(
  opportunities: Opportunity[],
  profileOverride?: Profile,
): Promise<NotifyOutcome> {
  const config = readNotifyConfig();
  const state = await readState();
  const profile = profileOverride ?? state.profile;

  const matches = selectMatches(opportunities, state.notifiedAt, config);
  const transport = describeTransport(config);

  if (!matches.length) {
    return {
      status: "skipped",
      matches: 0,
      included: 0,
      detail: "No new matches since the last digest.",
      transport,
    };
  }

  const firstRun = Object.keys(state.notifiedAt).length === 0;
  // The first digest would otherwise carry the entire existing board.
  const limit = firstRun ? Math.min(config.maxPerEmail, 6) : config.maxPerEmail;
  const included = matches.slice(0, limit);

  const digest = renderDigest({
    items: included,
    omitted: matches.length - included.length,
    profile,
    firstRun,
    boardUrl: boardUrl(),
  });

  const sentAt = new Date().toISOString();
  try {
    const delivery = await deliver(config, digest);
    const detail =
      delivery.transport === "outbox"
        ? `Written to ${delivery.detail} (no mail credentials set).`
        : `Sent to ${config.to.map(maskAddress).join(", ")}.`;

    // Everything selected is marked, including the overflow, so a later scan
    // does not re-announce items the digest already summarized.
    const record: NotificationRecord = {
      sentAt,
      matches: matches.length,
      transport: delivery.transport,
      status: "sent",
      detail,
    };
    await recordNotification(
      matches.map((item) => item.id),
      record,
    );

    return {
      status: "sent",
      matches: matches.length,
      included: included.length,
      detail,
      transport: describeTransport(config),
    };
  } catch (error) {
    const detail = (error as Error).message;
    await recordNotification([], {
      sentAt,
      matches: matches.length,
      transport: config.transport,
      status: "error",
      detail,
    }).catch(() => {});
    return {
      status: "error",
      matches: matches.length,
      included: included.length,
      detail,
      transport,
    };
  }
}

/** One-line trace entry for the run log. */
export function describeOutcome(outcome: NotifyOutcome): string {
  switch (outcome.status) {
    case "sent":
      return `Email alert: ${outcome.matches} new internship${
        outcome.matches === 1 ? "" : "s"
      }. ${outcome.detail}`;
    case "error":
      return `Email alert failed: ${outcome.detail}`;
    default:
      return `Email alert: ${outcome.detail}`;
  }
}

export { canSend, describeTransport, maskAddress, readNotifyConfig };

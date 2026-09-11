import type { OpportunityKind } from "../agent/types";

export type TransportKind = "smtp" | "resend" | "outbox";

export interface NotifyConfig {
  /** Where digests go. Empty means nothing is configured yet. */
  to: string[];
  from: string;
  transport: TransportKind;
  /** Which opportunity types are worth an email. */
  kinds: OpportunityKind[];
  /** Most items in one digest; the rest are summarized as a count. */
  maxPerEmail: number;
  smtp?: {
    url?: string;
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
  };
  resendApiKey?: string;
}

const ALL_KINDS: OpportunityKind[] = ["hackathon", "internship", "conference"];

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseKinds(value: string | undefined): OpportunityKind[] {
  const requested = list(value)
    .map((entry) => entry.toLowerCase().replace(/s$/, ""))
    .filter((entry): entry is OpportunityKind =>
      ALL_KINDS.includes(entry as OpportunityKind),
    );
  // The ask was internships; the other kinds live on the dashboard unless asked for.
  return requested.length ? Array.from(new Set(requested)) : ["internship"];
}

export function readNotifyConfig(env: NodeJS.ProcessEnv = process.env): NotifyConfig {
  const to = list(env.NOTIFY_TO);
  const smtpUrl = env.SMTP_URL;
  const smtpHost = env.SMTP_HOST;
  const hasSmtp = Boolean(smtpUrl || smtpHost);
  const resendApiKey = env.RESEND_API_KEY;

  const transport: TransportKind = resendApiKey
    ? "resend"
    : hasSmtp
      ? "smtp"
      : "outbox";

  const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined;

  return {
    to,
    from:
      env.NOTIFY_FROM ??
      env.SMTP_USER ??
      "Opportunity Radar <opportunity-radar@localhost>",
    transport,
    kinds: parseKinds(env.NOTIFY_KINDS),
    maxPerEmail: Number(env.NOTIFY_MAX_PER_EMAIL) || 12,
    smtp: hasSmtp
      ? {
          url: smtpUrl,
          host: smtpHost,
          port,
          // Port 465 is implicit TLS; 587 upgrades with STARTTLS.
          secure: env.SMTP_SECURE ? env.SMTP_SECURE !== "false" : port === 465,
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        }
      : undefined,
    resendApiKey,
  };
}

/** True when a digest can actually be delivered to somebody. */
export function canSend(config: NotifyConfig): boolean {
  return config.to.length > 0;
}

/** `ali***@gmail.com` — enough to confirm the target without printing it. */
export function maskAddress(address: string): string {
  const match = /^([^@]+)@(.+)$/.exec(address.replace(/^.*<|>.*$/g, ""));
  if (!match) return "hidden";
  const [, local, domain] = match;
  const head = local.slice(0, Math.min(3, Math.max(1, local.length - 1)));
  return `${head}${"*".repeat(3)}@${domain}`;
}

export function describeTransport(config: NotifyConfig): string {
  switch (config.transport) {
    case "smtp":
      return `SMTP (${config.smtp?.host ?? config.smtp?.url ?? "configured"})`;
    case "resend":
      return "Resend API";
    default:
      return "local outbox (no mail credentials set)";
  }
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Digest } from "./render";
import type { NotifyConfig } from "./config";

export interface DeliveryResult {
  transport: NotifyConfig["transport"];
  /** Where it went: masked recipients, or the outbox file path. */
  detail: string;
}

const OUTBOX_DIR = path.join(process.cwd(), ".data", "outbox");

async function sendViaSmtp(config: NotifyConfig, digest: Digest): Promise<string> {
  const nodemailer = await import("nodemailer");
  const { smtp } = config;
  const transporter = smtp?.url
    ? nodemailer.createTransport(smtp.url)
    : nodemailer.createTransport({
        host: smtp?.host,
        port: smtp?.port ?? 587,
        secure: smtp?.secure ?? false,
        auth: smtp?.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      });

  const info = await transporter.sendMail({
    from: config.from,
    to: config.to.join(", "),
    subject: digest.subject,
    text: digest.text,
    html: digest.html,
  });
  return info.messageId ?? "sent";
}

async function sendViaResend(config: NotifyConfig, digest: Digest): Promise<string> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: config.to,
      subject: digest.subject,
      html: digest.html,
      text: digest.text,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(body.message ?? `Resend returned ${response.status}`);
  }
  return body.id ?? "sent";
}

/**
 * With no mail credentials the digest is written to disk instead of dropped, so
 * the feature can be set up and inspected before any secrets exist.
 */
async function writeToOutbox(digest: Digest): Promise<string> {
  await mkdir(OUTBOX_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(OUTBOX_DIR, `${stamp}.html`);
  await writeFile(file, digest.html, "utf8");
  await writeFile(file.replace(/\.html$/, ".txt"), `${digest.subject}\n\n${digest.text}`, "utf8");
  return file;
}

export async function deliver(
  config: NotifyConfig,
  digest: Digest,
): Promise<DeliveryResult> {
  if (config.transport === "outbox" || !config.to.length) {
    return { transport: "outbox", detail: await writeToOutbox(digest) };
  }

  const detail =
    config.transport === "resend"
      ? await sendViaResend(config, digest)
      : await sendViaSmtp(config, digest);

  return { transport: config.transport, detail };
}

/** Confirms credentials work without waiting for a matching internship. */
export async function verifyTransport(config: NotifyConfig): Promise<string> {
  if (config.transport === "smtp") {
    const nodemailer = await import("nodemailer");
    const { smtp } = config;
    const transporter = smtp?.url
      ? nodemailer.createTransport(smtp.url)
      : nodemailer.createTransport({
          host: smtp?.host,
          port: smtp?.port ?? 587,
          secure: smtp?.secure ?? false,
          auth: smtp?.user ? { user: smtp.user, pass: smtp.pass } : undefined,
        });
    await transporter.verify();
    return "SMTP credentials accepted.";
  }
  if (config.transport === "resend") {
    return config.resendApiKey ? "Resend API key present." : "No Resend API key.";
  }
  return "No mail credentials set; digests are written to .data/outbox.";
}

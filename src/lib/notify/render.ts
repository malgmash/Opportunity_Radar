import { describeCountdown } from "../agent/dates";
import { formatLocations } from "../agent/geo";
import type { Opportunity, Profile } from "../agent/types";

export interface Digest {
  subject: string;
  html: string;
  text: string;
}

export interface DigestInput {
  items: Opportunity[];
  /** Matches found but left out of the body, reported as a count. */
  omitted: number;
  profile: Profile;
  /** The very first digest explains itself and does not imply everything is new. */
  firstRun: boolean;
  boardUrl: string;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plural(count: number, word: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? word : (pluralForm ?? `${word}s`)}`;
}

function matchCount(count: number): string {
  return plural(count, "more match", "more matches");
}

export function subjectFor(input: DigestInput): string {
  const { items, firstRun } = input;
  if (!items.length) return "No new internships this scan";

  const companies = Array.from(
    new Set(items.map((item) => item.organization).filter(Boolean)),
  ) as string[];
  const lead = companies.slice(0, 3).join(", ");
  const more = companies.length > 3 ? ` +${companies.length - 3} more` : "";

  const label = firstRun ? "internship matches" : "new internships";
  return companies.length
    ? `${plural(items.length, label.replace(/s$/, ""))}: ${lead}${more}`
    : plural(items.length, label.replace(/s$/, ""));
}

function metaLine(item: Opportunity): string[] {
  const parts: string[] = [];
  if (item.term) parts.push(item.term);
  const where = formatLocations(item.locations);
  if (where) parts.push(where);
  if (item.deadline) {
    const countdown = describeCountdown(
      Math.round((Date.parse(item.deadline) - Date.now()) / 86_400_000),
    );
    parts.push(`applications close ${countdown}`);
  }
  parts.push(`fit ${item.fit.score}/100`);
  return parts;
}

function passedRules(item: Opportunity): string[] {
  return item.eligibility.verdicts
    .filter((verdict) => verdict.status === "pass")
    .map((verdict) => verdict.detail);
}

export function renderDigest(input: DigestInput): Digest {
  const { items, omitted, profile, firstRun, boardUrl } = input;

  const intro = firstRun
    ? `Email alerts are on. Here ${items.length === 1 ? "is the" : "are the"} ${
        items.length === 1 ? "internship" : "internships"
      } on your board right now that clear every rule. From now on you will only hear from me when something new shows up.`
    : `${plural(items.length, "new internship")} cleared every rule in your profile since the last scan.`;

  const rules = [
    `Anywhere in the US, ${profile.internshipTerms.join(" or ")}`,
    `Eligible for a ${profile.graduationYear} graduate`,
    `Scored against ${profile.interests.length} focus areas`,
  ];

  const cards = items
    .map((item) => {
      const meta = metaLine(item).map(escape).join(" · ");
      const reasons = passedRules(item)
        .slice(0, 3)
        .map((reason) => `<li style="margin:2px 0;">${escape(reason)}</li>`)
        .join("");
      return `
      <tr><td style="padding:0 0 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="border:1px solid #e4e4e7;border-radius:10px;background:#ffffff;">
          <tr><td style="padding:16px 18px;">
            <div style="font:600 16px/1.35 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
              <a href="${escape(item.url)}" style="color:#18181b;text-decoration:none;">${escape(item.title)}</a>
            </div>
            ${
              item.organization
                ? `<div style="font:400 13px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#52525b;margin-top:2px;">${escape(item.organization)}</div>`
                : ""
            }
            <div style="font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#71717a;margin-top:8px;">${meta}</div>
            <ul style="font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#3f3f46;margin:10px 0 0;padding-left:18px;">${reasons}</ul>
            <div style="margin-top:14px;">
              <a href="${escape(item.url)}"
                 style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;
                        font:600 13px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                        padding:9px 14px;border-radius:7px;">Open the listing</a>
              <span style="font:400 11px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#a1a1aa;margin-left:10px;">via ${escape(item.source.name)}</span>
            </div>
          </td></tr>
        </table>
      </td></tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <tr><td style="padding:0 0 18px;">
          <div style="font:600 18px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">Opportunity Radar</div>
          <div style="font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#52525b;margin-top:6px;">${escape(intro)}</div>
        </td></tr>
        ${cards}
        ${
          omitted > 0
            ? `<tr><td style="font:400 13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#52525b;padding:0 0 14px;">And ${matchCount(omitted)} on your board.</td></tr>`
            : ""
        }
        <tr><td style="padding:6px 0 0;border-top:1px solid #e4e4e7;">
          <div style="font:400 12px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#71717a;padding-top:12px;">
            Filtered on: ${rules.map(escape).join(" · ")}.<br />
            <a href="${escape(boardUrl)}" style="color:#71717a;">See the full board</a> — the agent rescans every 6 hours and only emails when an internship is new.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    "OPPORTUNITY RADAR",
    "",
    intro,
    "",
    ...items.flatMap((item) => [
      `* ${item.title}`,
      ...(item.organization ? [`  ${item.organization}`] : []),
      `  ${metaLine(item).join(" · ")}`,
      ...passedRules(item)
        .slice(0, 3)
        .map((reason) => `  - ${reason}`),
      `  ${item.url}`,
      `  via ${item.source.name}`,
      "",
    ]),
    ...(omitted > 0 ? [`And ${matchCount(omitted)} on your board.`, ""] : []),
    `Filtered on: ${rules.join(" · ")}.`,
    `Full board: ${boardUrl}`,
    "The agent rescans every 6 hours and only emails when an internship is new.",
  ].join("\n");

  return { subject: subjectFor(input), html, text };
}

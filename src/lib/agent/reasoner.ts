import { standingForTerm } from "./profile";
import {
  matchedKeywords,
  offTargetSignals,
  scoreTracks,
  TRACK_LABELS,
} from "./taxonomy";
import type { Profile, Track } from "./types";

export interface ClassificationInput {
  id: string;
  kind: string;
  title: string;
  organization?: string;
  text: string;
  term?: string;
}

export interface Classification {
  id: string;
  tracks: Track[];
  score: number;
  reasons: string[];
}

export interface Reasoner {
  id: string;
  label: string;
  classify: (
    items: ClassificationInput[],
    profile: Profile,
  ) => Promise<Classification[]>;
  digest: (facts: string[], profile: Profile) => Promise<string>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function heuristicClassify(
  item: ClassificationInput,
  profile: Profile,
): Classification {
  const haystack = [item.title, item.organization, item.text, item.term]
    .filter(Boolean)
    .join(" · ");
  const scores = scoreTracks(haystack);
  const byTrack = new Map(scores.map((entry) => [entry.track, entry]));
  const interests = profile.interests;

  const matchedInterests = interests
    .map((track) => byTrack.get(track))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry && entry.score > 0))
    .sort((a, b) => b.score - a.score);

  const best = matchedInterests[0];
  const breadth = matchedInterests.filter((entry) => entry.score >= 12).length;
  const adjacent = byTrack.get("adjacent");
  const penalties = offTargetSignals(haystack);

  const raw =
    (best?.score ?? 0) * 0.9 +
    Math.max(0, breadth - 1) * 6 +
    (adjacent && !best ? adjacent.score * 0.4 : 0) -
    penalties.length * 26;

  const reasons: string[] = [];
  for (const entry of matchedInterests.slice(0, 3)) {
    reasons.push(
      `${TRACK_LABELS[entry.track]} signals in the listing: ${entry.hits
        .slice(0, 4)
        .join(", ")}`,
    );
  }
  if (!matchedInterests.length && adjacent?.hits.length) {
    reasons.push(`Adjacent tech signals only: ${adjacent.hits.slice(0, 3).join(", ")}`);
  }
  if (breadth > 1) {
    reasons.push(`Spans ${breadth} of your focus areas at once`);
  }
  const keywordHits = matchedKeywords(haystack, profile.keywords);
  if (keywordHits.length) {
    reasons.push(`Matches your saved keywords: ${keywordHits.join(", ")}`);
  }
  if (item.term) {
    const standing = standingForTerm(item.term, profile.graduationYear);
    if (standing) {
      reasons.push(`${item.term} lines up with your ${standing} summer`);
    }
  }
  if (penalties.length) {
    reasons.push(`Career-stage mismatch: mentions ${penalties.join(", ")}`);
  }

  const tracks = matchedInterests
    .filter((entry) => entry.score >= 10)
    .map((entry) => entry.track);

  return {
    id: item.id,
    score: Math.round(clamp(raw, 0, 100)),
    tracks: tracks.length ? tracks : adjacent && adjacent.score > 0 ? ["adjacent"] : [],
    reasons: reasons.slice(0, 4),
  };
}

export const heuristicReasoner: Reasoner = {
  id: "heuristic",
  label: "Built-in keyword reasoner",
  async classify(items, profile) {
    return items.map((item) => heuristicClassify(item, profile));
  },
  async digest(facts, profile) {
    const focus = profile.interests.map((track) => TRACK_LABELS[track]).join(", ");
    return [
      `Scanned live hackathon, internship and conference feeds for ${focus}.`,
      ...facts,
    ].join(" ");
  },
};

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

async function chat(messages: ChatMessage[], timeoutMs = 45_000): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages,
      }),
    });
    if (!response.ok) {
      throw new Error(`LLM request failed with ${response.status}`);
    }
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned an empty response");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

const CLASSIFY_SYSTEM = `You screen career opportunities for an undergraduate student.
Score how well each listing fits their focus areas from 0 to 100, where 100 is a
perfect match and anything under 20 is off-topic. Only reward listings that plausibly
fit the student's focus areas or directly adjacent technical work.
Reply with JSON: {"results":[{"id":"...","score":0-100,"tracks":["data-analysis"|"software-engineering"|"product-management"|"adjacent"],"reasons":["short phrase"]}]}
Keep each reason under 18 words and grounded in the listing text.`;

const BATCH_SIZE = 24;

export const llmReasoner: Reasoner = {
  id: "llm",
  label: `LLM reasoner (${process.env.OPENAI_MODEL ?? "gpt-4o-mini"})`,
  async classify(items, profile) {
    const out: Classification[] = [];

    for (let start = 0; start < items.length; start += BATCH_SIZE) {
      const batch = items.slice(start, start + BATCH_SIZE);
      const prompt = {
        student: {
          graduationYear: profile.graduationYear,
          degree: profile.degree,
          focusAreas: profile.interests,
          keywords: profile.keywords,
        },
        listings: batch.map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          organization: item.organization,
          details: item.text.slice(0, 400),
          term: item.term,
        })),
      };

      try {
        const content = await chat([
          { role: "system", content: CLASSIFY_SYSTEM },
          { role: "user", content: JSON.stringify(prompt) },
        ]);
        const parsed = JSON.parse(content) as { results?: Classification[] };
        const byId = new Map(
          (parsed.results ?? []).map((result) => [result.id, result]),
        );
        for (const item of batch) {
          const result = byId.get(item.id);
          out.push(
            result
              ? {
                  id: item.id,
                  score: Math.round(clamp(Number(result.score) || 0, 0, 100)),
                  tracks: (result.tracks ?? []).filter((track): track is Track =>
                    ["data-analysis", "software-engineering", "product-management", "adjacent"].includes(
                      track,
                    ),
                  ),
                  reasons: (result.reasons ?? []).slice(0, 4),
                }
              : heuristicClassify(item, profile),
          );
        }
      } catch {
        // Never fail a run over the optional model; keyword scoring covers it.
        out.push(...batch.map((item) => heuristicClassify(item, profile)));
      }
    }

    return out;
  },
  async digest(facts, profile) {
    try {
      const content = await chat(
        [
          {
            role: "system",
            content:
              'Write a two-sentence briefing for a student about their opportunity scan. Reply as JSON: {"digest":"..."}. Be concrete and never invent numbers.',
          },
          { role: "user", content: JSON.stringify({ profile, facts }) },
        ],
        20_000,
      );
      const parsed = JSON.parse(content) as { digest?: string };
      if (parsed.digest) return parsed.digest;
    } catch {
      // Fall through to the deterministic digest.
    }
    return heuristicReasoner.digest(facts, profile);
  },
};

export function selectReasoner(): Reasoner {
  return process.env.OPENAI_API_KEY ? llmReasoner : heuristicReasoner;
}

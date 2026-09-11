# Opportunity Radar

An agent that finds hackathons, internships and conferences for an undergraduate
focused on **data analysis, software engineering and product management**, then
filters them against hard eligibility rules instead of dumping a raw feed.

The rules it enforces out of the box:

| Opportunity | Rule |
| --- | --- |
| Hackathons & conferences | Must be in **NC, SC, GA, VA or WV** — or anywhere else in the US **only if the event documents travel funding** |
| Hackathons & conferences | Online events are allowed, because they need no travel |
| Internships | **Anywhere in the US**, summer terms a **2029 graduate** can still work (Summer 2027, 2028, 2029) |
| Everything | Scored against data/analytics, software engineering and product management, with adjacent technical work allowed |

Every card shows the rule-by-rule verdict behind its decision, so nothing is a
black box. Where the agent read something off an event's own site — a travel
reimbursement clause, a date, a venue city — it quotes the sentence it used.

## Running it

```bash
npm install
npm run dev        # http://localhost:43127
```

The dashboard starts empty. Press **Run the agent** and the scan streams its
trace live; it reads roughly 1,800 listings and finishes in under a minute. You
can also run it headless, which is what you would put on a cron job:

```bash
npm run agent          # full scan, writes .data/state.json
npm run agent -- --quick   # fewer page fetches, faster
```

No API keys are required. If `OPENAI_API_KEY` is set the agent uses a model to
score relevance and write the briefing; without one it falls back to a built-in
keyword reasoner that produces the same shape of output. Optional environment
variables:

```bash
OPENAI_API_KEY=sk-...                      # enables the LLM reasoner
OPENAI_BASE_URL=https://api.openai.com/v1  # any OpenAI-compatible endpoint
OPENAI_MODEL=gpt-4o-mini
```

## How the agent works

Each run is an eight-stage pipeline in `src/lib/agent/pipeline.ts`. The trace
panel in the UI is a live view of these stages.

1. **Plan** — turn the profile into a concrete search plan (region, terms, focus areas).
2. **Collect** — hit every source in parallel, tolerating individual failures.
3. **Normalize** — parse free-text locations and dates, then merge duplicates that appear on several feeds.
4. **Classify** — score each listing against the focus areas.
5. **Screen** — drop out-of-scope listings before spending any HTTP requests.
6. **Enrich** — read event sites to settle travel funding, unconfirmed dates and vague venue names.
7. **Decide** — run the eligibility rules and rank what survives.
8. **Report** — write the briefing and persist the run.

### Sources

| Source | Feeds | Notes |
| --- | --- | --- |
| [Major League Hacking](https://www.mlh.com/seasons) | Hackathons | Season event list, with structured venue states |
| [Devpost](https://devpost.com/hackathons) | Hackathons | Open and upcoming challenges, mostly online |
| [SimplifyJobs](https://github.com/SimplifyJobs) + [vanshb03](https://github.com/vanshb03) internship lists | Internships | Community-maintained JSON with terms, categories and degree requirements |
| [confs.tech](https://github.com/tech-conferences/conference-data) | Conferences | Open dataset, filtered to relevant topics |
| Curated series list | Conferences | Recurring Southeast events plus national conferences with student travel funding programs |

The curated list deliberately stores no dates. The agent reads each site and
promotes an entry only once it can find a date, so a stale entry degrades into a
clearly-labelled watchlist item rather than a wrong date.

### Travel funding verification

For any out-of-region US event, the agent fetches the event site (homepage, then
`/faq`, `/travel`, `/attend`, `/scholarships`) and looks for language that
commits to paying for travel — reimbursement, stipends, travel grants, chartered
buses. It reports one of:

- **confirmed** — matched an explicit phrase, and quotes it
- **likely** — found a scholarship or aid program that does not spell out travel
- **not offered** — the site says travel is not covered, which excludes the event
- **unknown** — nothing found, so the event is held for manual verification

Only *confirmed* clears the region rule. Unknown never silently passes.

Because most student hackathons never publish a travel policy in static HTML,
*unknown* is the common case, and those events land in **Needs a check** with the
reason attached rather than being dropped or oversold.

### Board composition

Ranking alone lets the long tail of online hackathons crowd out the categories
the profile is built around, so each opportunity type fills its slots with
quotas: in-region events first, then out-of-region events with travel funding,
then curated series, then everything else by priority. `selectBoard` in
`src/lib/agent/rank.ts` owns this, and `tests/rank.test.ts` pins the behaviour.

## Layout

```
src/lib/agent/        the agent: sources, rules, enrichment, ranking
  sources/            one adapter per feed
  rules.ts            the eligibility engine
  enrich.ts           reads event pages for travel funding, dates, locations
  geo.ts              US state normalization and region membership
  reasoner.ts         LLM reasoner with a keyword fallback
src/app/api/          run, profile and state endpoints
src/components/       dashboard UI
scripts/run-agent.ts  headless run
tests/                rules, geography and date-parsing tests
```

State lives in `.data/state.json`, with a page cache in `.data/cache/`. Both are
gitignored; delete the directory to start clean.

```bash
npm test         # vitest
npm run lint
npm run typecheck
```

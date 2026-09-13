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
trace live; it reads roughly 1,800 listings and finishes in under a minute.
After that the agent keeps itself current on its own — see [Automatic
refresh](#automatic-refresh).

You can also run it headless:

```bash
npm run agent              # one full scan, writes .data/state.json
npm run agent -- --quick   # fewer page fetches, faster
npm run agent:watch        # scan now, then keep rescanning on the schedule
```

No API keys are required. If `OPENAI_API_KEY` is set the agent uses a model to
score relevance and write the briefing; without one it falls back to a built-in
keyword reasoner that produces the same shape of output. Optional environment
variables:

```bash
OPENAI_API_KEY=sk-...                      # enables the LLM reasoner
OPENAI_BASE_URL=https://api.openai.com/v1  # any OpenAI-compatible endpoint
OPENAI_MODEL=gpt-4o-mini

AGENT_REFRESH_HOURS=6                      # cadence for unattended scans
AGENT_REFRESH_DISABLED=1                   # turn the in-app scheduler off
CRON_SECRET=...                            # guards /api/cron/refresh
```

## Automatic refresh

The agent rescans **every 6 hours** without anyone pressing a button. When the
server starts, `src/instrumentation.ts` starts the loop in
`src/lib/scheduler.ts`, which works out when the next scan is owed from the last
one and sleeps until then. Deadlines move, hackathon registrations open and
internship boards churn daily, so a scan that is at most six hours stale is the
point of the tool.

What that means in practice:

- The countdown in the header shows when the next scan lands. Pause and resume
  it there; the choice is persisted.
- A scan that the scheduler started streams into the trace panel of any open
  tab, and the board refreshes itself when it lands. No reload needed.
- Manual and scheduled scans share one lock. Pressing **Run again** during an
  unattended scan attaches to it rather than starting a second one.
- A failed scan retries on a backoff (5 minutes, doubling, capped at an hour)
  instead of waiting out the full six hours. The header says so, with the error.
- The interval is clamped to 1–168 hours. Set `AGENT_REFRESH_HOURS` to change
  the default, or `AGENT_REFRESH_DISABLED=1` to run on demand only.

### Scheduling on a host with no long-lived process

Serverless platforms recycle the process, so the in-app timer will not survive.
Point an external scheduler at `/api/cron/refresh` every 6 hours instead; the
route is a no-op unless a scan is actually owed, and it takes `?force=1` to
override that. Set `CRON_SECRET` and pass it as `Authorization: Bearer <secret>`
or `?key=<secret>`.

```jsonc
// vercel.json
{ "crons": [{ "path": "/api/cron/refresh", "schedule": "0 */6 * * *" }] }
```

On a plain server, `npm run agent:watch` does the same thing with no web server
at all.

## Email alerts

When a scan finds an internship that clears **every** rule and has not been
announced before, the agent emails it. Nothing in "needs a check" is emailed —
that bucket exists for a human to judge, and pushing it would train you to ignore
the alerts.

```bash
NOTIFY_TO=you@personal.com          # where digests go; required to send
SMTP_HOST=smtp.gmail.com            # Gmail needs an App Password, not your login
SMTP_PORT=465
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password
```

Set those and digests start flowing. A few details worth knowing:

- **Nothing is sent twice.** Each announced opportunity id is recorded in
  `.data/state.json`, so a six-hour rescan that sees the same 60 internships
  sends nothing.
- **The first digest is capped** at six items and says so, because otherwise it
  would carry the entire existing board. The rest are counted in a one-line
  summary and marked as announced.
- **Nearest deadline first**, then best fit.
- **Mail failures never fail a scan.** The error is recorded and shown on the
  dashboard, and the run keeps its results.
- **No credentials? It still works.** Every digest is written to
  `.data/outbox/` as HTML and text, so you can see exactly what would have been
  sent before wiring up mail.
- **Send a test digest** from the Email alerts card on the dashboard to prove
  the setup without waiting for a new internship.

Other options:

```bash
RESEND_API_KEY=re_...               # alternative to SMTP; takes precedence
NOTIFY_FROM="Radar <radar@you.dev>" # defaults to SMTP_USER
NOTIFY_KINDS=internship,hackathon   # defaults to internship only
NOTIFY_MAX_PER_EMAIL=12
NOTIFY_BOARD_URL=https://...        # the "full board" link in the footer
```

> Put real credentials in the environment, never in the repo. For a Cloud Agent,
> add them under **Cloud Agents → Secrets** in the Cursor dashboard; locally use
> `.env.local`, which is gitignored. An app password is a password: it does not
> belong in a chat message or a commit.

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
| [@zero2sudo](https://www.instagram.com/zero2sudo/) on Instagram | Internships, hackathons, conferences | Alert account; captions are parsed into per-company leads |
| [MALG Opportunity Dropbox](data/malg-dropbox-feed.json) | Internships, hackathons, conferences | External curated feed at `data/malg-dropbox-feed.json`, updated by MALG Assistant and ingested on each scan |

`data/malg-dropbox-feed.json` is a committed JSON feed (not runtime state — that lives in gitignored `.data/`). MALG Assistant writes DraftOpportunity-shaped rows into it; the `malg-dropbox` source reads the file from the repo root on every collect pass and skips malformed entries.

#### Instagram alert accounts

`@zero2sudo` posts the moment a cycle opens — "Microsoft, SpaceX, TikTok 2027 SWE
Internship apps ARE OPEN" — which lands well before those roles reach the job
boards. The adapter reads the account's public profile feed (no login, no API
key, no credentials of yours) and keeps only captions that announce something:

- One card per company named in the post, so that caption becomes three leads.
- Role abbreviations are spelled out (`SWE` → software engineering, `TPM` →
  technical program manager) so the relevance scorer and the card both read well.
- Only the announcement sentence is carried forward. Later sentences in these
  captions wander into new-grad and sponsorship talk that would mislead the
  eligibility rules.
- The link is the post itself, because these captions keep the application link
  in a story.
- Lifestyle, sponsored and how-to posts are dropped, as are cycles whose year has
  passed and windows that already closed.

Add more accounts with `INSTAGRAM_ACCOUNTS=zero2sudo,someoneelse`.

Two things make this source survive real conditions. Instagram answers Node's TLS
fingerprint with `429` while answering `curl` normally, so `fetchJsonResilient`
tries the normal transport and then shells out to `curl` with an argument array.
And because the endpoint rate-limits bursts, the disk cache serves its last good
copy when a fetch fails, with the card and the trace saying how old that copy is.
If Instagram ever gates the endpoint entirely, `INSTAGRAM_SESSIONID` is read as an
optional cookie — but it is not needed today, and a session cookie is worth
treating as a password.

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
  schedule.ts         when the next unattended scan is owed
src/lib/notify/       email digests: selection, rendering, transports
src/lib/runner.ts     one scan at a time, shared by the UI and the scheduler
src/lib/scheduler.ts  the 6-hour loop
src/instrumentation.ts  starts the loop with the server
src/app/api/          run, schedule, cron, notifications, profile and state endpoints
src/components/       dashboard UI
scripts/run-agent.ts  headless run, with --watch
data/                 committed feeds the agent reads (e.g. malg-dropbox-feed.json)
tests/                rules, geography, date-parsing and schedule tests
```

State lives in `.data/state.json`, with a page cache in `.data/cache/` and
unsent digests in `.data/outbox/`. All three are gitignored; delete the
directory to start clean.

```bash
npm test         # vitest
npm run lint
npm run typecheck
```

/**
 * Headless agent run. Useful for cron jobs and for seeding the dashboard before
 * the first visit: `npm run agent`. Add `--watch` to keep rescanning on the
 * profile's schedule without the web server running.
 */
import { runAgent } from "../src/lib/agent/pipeline";
import { formatLocations } from "../src/lib/agent/geo";
import { describeInterval, msUntilNextRun } from "../src/lib/agent/schedule";
import { describeOutcome, notifyNewMatches } from "../src/lib/notify";
import { readState, saveRun, saveRunFailure } from "../src/lib/store";

const DECISION_MARK = {
  eligible: "ok  ",
  needs_verification: "check",
  excluded: "drop",
} as const;

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.min(ms, 2 ** 31 - 1)));

async function scan(quick: boolean) {
  const state = await readState();

  const { run, opportunities } = await runAgent({
    profile: state.profile,
    travelCheckBudget: quick ? 6 : undefined,
    emit: (event) => {
      if (event.type === "step" && event.step.status !== "running") {
        const seconds = ((event.step.durationMs ?? 0) / 1000).toFixed(1);
        process.stdout.write(
          `[${event.step.status.padEnd(5)}] ${event.step.label} (${seconds}s) — ${event.step.detail ?? ""}\n`,
        );
        for (const fact of event.step.facts) {
          process.stdout.write(`          · ${fact}\n`);
        }
      }
    },
  });

  await saveRun(run, opportunities, "cli");

  process.stdout.write(`\n${run.digest}\n\n`);
  for (const kind of ["hackathon", "internship", "conference"] as const) {
    const items = opportunities.filter((item) => item.kind === kind);
    process.stdout.write(`== ${kind}s (${items.length}) ==\n`);
    for (const item of items.slice(0, 12)) {
      process.stdout.write(
        `  ${DECISION_MARK[item.eligibility.decision]} ${item.fit.score
          .toString()
          .padStart(3)}  ${item.title.slice(0, 58).padEnd(58)} ${formatLocations(
          item.locations,
        ).slice(0, 26).padEnd(26)} ${item.dateLabel ?? item.term ?? ""}\n`,
      );
    }
    process.stdout.write("\n");
  }

  if (run.warnings.length) {
    process.stdout.write(`warnings:\n${run.warnings.map((w) => `  - ${w}`).join("\n")}\n`);
  }
  process.stdout.write(`Saved ${opportunities.length} opportunities to .data/state.json\n`);

  const outcome = await notifyNewMatches(opportunities, state.profile);
  process.stdout.write(`${describeOutcome(outcome)}\n`);
}

async function main() {
  const quick = process.argv.includes("--quick");
  const watch = process.argv.includes("--watch");

  for (;;) {
    try {
      await scan(quick);
    } catch (error) {
      if (!watch) throw error;
      const message = (error as Error).message;
      process.stderr.write(`scan failed: ${message}\n`);
      await saveRunFailure("cli", message);
    }

    if (!watch) return;

    const { schedule } = await readState();
    const wait = msUntilNextRun(schedule);
    process.stdout.write(
      `\nWatching ${describeInterval(schedule.intervalHours)}. Next scan at ` +
        `${new Date(Date.now() + wait).toLocaleString()}.\n\n`,
    );
    await sleep(wait);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

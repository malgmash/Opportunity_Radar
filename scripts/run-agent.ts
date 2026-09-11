/**
 * Headless agent run. Useful for cron jobs and for seeding the dashboard before
 * the first visit: `npm run agent`.
 */
import { runAgent } from "../src/lib/agent/pipeline";
import { formatLocations } from "../src/lib/agent/geo";
import { readState, saveRun } from "../src/lib/store";

const DECISION_MARK = {
  eligible: "ok  ",
  needs_verification: "check",
  excluded: "drop",
} as const;

async function main() {
  const state = await readState();
  const quick = process.argv.includes("--quick");

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

  await saveRun(run, opportunities);

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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

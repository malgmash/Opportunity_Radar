/**
 * Next runs this once per server process, which is where the unattended
 * refresh loop is started. The edge runtime has no timers or filesystem, and
 * the build phase must not kick off a scan.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}

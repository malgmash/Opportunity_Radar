import { Dashboard } from "@/components/dashboard/dashboard";
import { notifyStatus } from "@/lib/notify/status";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const state = await readState();
  // Mail setup lives in the environment, so the server resolves it once here
  // rather than the client fetching it on every mount.
  return <Dashboard initialState={state} initialAlerts={notifyStatus(state)} />;
}

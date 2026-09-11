import { Dashboard } from "@/components/dashboard/dashboard";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const state = await readState();
  return <Dashboard initialState={state} />;
}

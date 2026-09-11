import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_PROFILE, normalizeProfile } from "./agent/profile";
import type { AgentState, Opportunity, Profile, RunSummary } from "./agent/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

const EMPTY_STATE: AgentState = {
  profile: DEFAULT_PROFILE,
  opportunities: [],
  actions: {},
};

let writeQueue: Promise<void> = Promise.resolve();

export async function readState(): Promise<AgentState> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as AgentState;
    return {
      ...EMPTY_STATE,
      ...parsed,
      profile: normalizeProfile(parsed.profile),
      actions: parsed.actions ?? {},
      opportunities: parsed.opportunities ?? [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

async function writeState(state: AgentState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const temp = `${STATE_FILE}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  await rename(temp, STATE_FILE);
}

/** Serializes writes so concurrent requests cannot interleave a read/modify/write. */
export async function updateState(
  mutate: (state: AgentState) => AgentState | Promise<AgentState>,
): Promise<AgentState> {
  let result: AgentState = EMPTY_STATE;
  writeQueue = writeQueue.then(async () => {
    const current = await readState();
    result = await mutate(current);
    await writeState(result);
  });
  await writeQueue;
  return result;
}

export async function saveRun(
  run: RunSummary,
  opportunities: Opportunity[],
): Promise<AgentState> {
  return updateState((state) => ({ ...state, lastRun: run, opportunities }));
}

export async function saveProfile(profile: Profile): Promise<AgentState> {
  return updateState((state) => ({ ...state, profile }));
}

export async function setAction(
  id: string,
  action: "saved" | "dismissed" | null,
): Promise<AgentState> {
  return updateState((state) => {
    const actions = { ...state.actions };
    if (action) actions[id] = action;
    else delete actions[id];
    return { ...state, actions };
  });
}

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), ".data", "cache");

function cachePath(key: string): string {
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 24);
  return path.join(CACHE_DIR, `${hash}.json`);
}

interface CacheEnvelope<T> {
  key: string;
  storedAt: number;
  value: T;
}

/**
 * Disk cache so repeat runs stay cheap. The upstream datasets are large and
 * change on the order of hours, not seconds.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const file = cachePath(key);
  try {
    const raw = await readFile(file, "utf8");
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    if (envelope.key === key && Date.now() - envelope.storedAt < ttlMs) {
      return { value: envelope.value, cached: true };
    }
  } catch {
    // Cache miss or unreadable entry; fall through to a fresh load.
  }

  const value = await load();
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const envelope: CacheEnvelope<T> = { key, storedAt: Date.now(), value };
    await writeFile(file, JSON.stringify(envelope), "utf8");
  } catch {
    // A read-only filesystem should not fail the run.
  }
  return { value, cached: false };
}

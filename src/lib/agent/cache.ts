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

export interface CacheOptions {
  /**
   * Serve an expired entry when the loader fails. For rate-limited sources a
   * few-hour-old copy is far better than dropping the source from the run.
   */
  staleOnError?: boolean;
}

export interface CacheResult<T> {
  value: T;
  cached: boolean;
  /** True when the loader failed and an expired entry was used instead. */
  stale?: boolean;
  storedAt?: number;
}

async function readEnvelope<T>(
  file: string,
  key: string,
): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await readFile(file, "utf8");
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    return envelope.key === key ? envelope : null;
  } catch {
    return null;
  }
}

/**
 * Disk cache so repeat runs stay cheap. The upstream datasets are large and
 * change on the order of hours, not seconds.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  options: CacheOptions = {},
): Promise<CacheResult<T>> {
  const file = cachePath(key);
  const existing = await readEnvelope<T>(file, key);
  if (existing && Date.now() - existing.storedAt < ttlMs) {
    return { value: existing.value, cached: true, storedAt: existing.storedAt };
  }

  let value: T;
  try {
    value = await load();
  } catch (error) {
    if (options.staleOnError && existing) {
      return {
        value: existing.value,
        cached: true,
        stale: true,
        storedAt: existing.storedAt,
      };
    }
    throw error;
  }

  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const envelope: CacheEnvelope<T> = { key, storedAt: Date.now(), value };
    await writeFile(file, JSON.stringify(envelope), "utf8");
  } catch {
    // A read-only filesystem should not fail the run.
  }
  return { value, cached: false, storedAt: Date.now() };
}

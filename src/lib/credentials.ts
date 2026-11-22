import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "./db";
import { decryptSecret } from "./secrets";

/**
 * Per-job credentials. Agents read API keys through here; a job runs inside withCredentials() with the
 * project owner's own keys (BYOK) where they exist, otherwise GhostLayer's server keys.
 */
export interface Credentials {
  openaiApiKey?: string;
  solariApiKey?: string;
  source: { openai: "user" | "default"; solari: "user" | "default" };
}

const store = new AsyncLocalStorage<Credentials>();

export function withCredentials<T>(creds: Credentials, fn: () => Promise<T>) {
  return store.run(creds, fn);
}

export function currentOpenAIKey() {
  return store.getStore()?.openaiApiKey || process.env.OPENAI_API_KEY;
}

export function currentSolariKey() {
  return store.getStore()?.solariApiKey || process.env.SOLARI_API_KEY;
}

export function currentCredentialSources() {
  return store.getStore()?.source ?? { openai: "default", solari: "default" };
}

export async function credentialsForUser(userId: string): Promise<Credentials> {
  const keys = await db.userApiKey.findMany({ where: { userId } });
  const get = (p: "OPENAI" | "SOLARI") => {
    const k = keys.find((x) => x.provider === p);
    if (!k) return undefined;
    try {
      return decryptSecret(k.ciphertext);
    } catch {
      return undefined; // undecryptable (rotated server key) → fall back to defaults
    }
  };
  const openaiApiKey = get("OPENAI");
  const solariApiKey = get("SOLARI");
  return { openaiApiKey, solariApiKey, source: { openai: openaiApiKey ? "user" : "default", solari: solariApiKey ? "user" : "default" } };
}

/** Find the user who owns a job's target (scan or repair) so the job runs with their keys. */
export async function ownerOfJobTarget(kind: string, targetId: string) {
  if (kind === "SCAN" || kind === "INVESTIGATE") {
    const s = await db.scan.findUnique({ where: { id: targetId }, select: { project: { select: { userId: true } } } });
    return s?.project.userId ?? null;
  }
  const r = await db.repairAttempt.findUnique({ where: { id: targetId }, select: { project: { select: { userId: true } } } });
  return r?.project.userId ?? null;
}

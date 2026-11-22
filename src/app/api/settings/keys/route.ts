import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, HttpError, json } from "@/lib/http";
import { encryptSecret } from "@/lib/secrets";

const PROVIDERS = {
  OPENAI: { label: "OpenAI", pattern: /^sk-[A-Za-z0-9_-]{20,}$/ },
  SOLARI: { label: "Solari", pattern: /^slr_(live|test)_[A-Za-z0-9_-]{8,}$/ },
} as const;

const PutSchema = z.object({ provider: z.enum(["OPENAI", "SOLARI"]), key: z.string().trim().min(10).max(400) });
const DeleteSchema = z.object({ provider: z.enum(["OPENAI", "SOLARI"]) });

/** Status only: which providers use the user's own key (with last 4 chars) vs GhostLayer defaults. Never returns secrets. */
export const GET = handle(async () => {
  const user = await requireUser();
  const keys = await db.userApiKey.findMany({ where: { userId: user.id }, select: { provider: true, last4: true, updatedAt: true } });
  return json({
    providers: (Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).map((p) => {
      const k = keys.find((x) => x.provider === p);
      return { provider: p, label: PROVIDERS[p].label, source: k ? "user" : "default", last4: k?.last4 ?? null, updatedAt: k?.updatedAt ?? null, defaultAvailable: Boolean(p === "OPENAI" ? process.env.OPENAI_API_KEY : process.env.SOLARI_API_KEY) };
    }),
  });
});

async function validate(provider: "OPENAI" | "SOLARI", key: string) {
  if (!PROVIDERS[provider].pattern.test(key)) throw new HttpError(400, `That doesn't look like a ${PROVIDERS[provider].label} API key`);
  const res =
    provider === "OPENAI"
      ? await fetch("https://api.openai.com/v1/models?limit=1", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) }).catch(() => null)
      : await fetch("https://api.getsolari.com/sessions?limit=1", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (res && (res.status === 401 || res.status === 403)) throw new HttpError(400, `${PROVIDERS[provider].label} rejected this key (HTTP ${res.status})`);
}

export const PUT = handle(async (req: Request) => {
  const user = await requireUser();
  const { provider, key } = PutSchema.parse(await req.json());
  await validate(provider, key);
  const data = { ciphertext: encryptSecret(key), last4: key.slice(-4) };
  await db.userApiKey.upsert({ where: { userId_provider: { userId: user.id, provider } }, update: data, create: { userId: user.id, provider, ...data } });
  return json({ ok: true, provider, last4: data.last4 });
});

export const DELETE = handle(async (req: Request) => {
  const user = await requireUser();
  const { provider } = DeleteSchema.parse(await req.json());
  await db.userApiKey.deleteMany({ where: { userId: user.id, provider } });
  return json({ ok: true });
});

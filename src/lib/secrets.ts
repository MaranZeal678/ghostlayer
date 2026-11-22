import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM with a server-side key (SECRETS_ENCRYPTION_KEY). Ciphertext format: v1.<iv>.<tag>.<data> (base64url). */
function key() {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) throw new Error("SECRETS_ENCRYPTION_KEY is not configured");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(token: string) {
  const [v, iv, tag, data] = token.split(".");
  if (v !== "v1") throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

/** Thin helpers over Solari sandboxes: provisioning, Node toolchain, shell commands with captured output. */
import { solariSandboxes } from "@/lib/solari";

export type Sbx = Awaited<ReturnType<ReturnType<typeof solariSandboxes>["create"]>>;

export const REPO_DIR = "/work/repo";
const NODE_DIR = "/opt/node";
export const PATH_ENV = `${NODE_DIR}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`;

export interface ShResult {
  command: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  output: string; // tail of combined stdout+stderr, sanitized
}

const SECRET_PATTERNS = [/gh[pousr]_[A-Za-z0-9]{20,}/g, /x-access-token:[^@\s]+@/g, /slr_live_[A-Za-z0-9_]+/g, /sk-[A-Za-z0-9_-]{20,}/g, /slr_token=[^&\s"]+/g];
export function sanitize(text: string) {
  return SECRET_PATTERNS.reduce((t, re) => t.replace(re, "[redacted]"), text);
}

/**
 * Free/low tiers allow very few concurrent sandboxes. GhostLayer runs one repair phase at a time, so any other
 * GhostLayer sandbox still alive (e.g. leaked by a job that hit the serverless time limit) is stale: reclaim it.
 */
export async function reclaimStaleSandboxes(keep: string[] = []) {
  const client = solariSandboxes();
  let killed = 0;
  for await (const s of client.listAll()) {
    if (s.metadata?.app !== "ghostlayer" || keep.includes(s.sandboxId)) continue;
    if (s.state === "stopped") continue;
    // Only reclaim sandboxes older than the serverless job limit; younger ones may belong to a live repair.
    const born = Number(s.metadata?.createdAt ?? 0);
    if (born && Date.now() - born < 6 * 60_000) continue;
    await client.kill(s.sandboxId).catch(() => {});
    killed++;
  }
  return killed;
}

export async function openSandbox(metadata: Record<string, string>) {
  try {
    return await createSandbox(metadata);
  } catch (err) {
    if (!/concurren|too many|limit/i.test(String((err as Error).message ?? err))) throw err;
    // Parallel repairs share a small sandbox quota: reclaim leaked ones, otherwise wait for a slot (~4 min).
    for (let i = 0; ; i++) {
      if (i % 6 === 0) {
        const killed = await reclaimStaleSandboxes();
        if (killed) console.warn(`[sandbox] concurrency limit hit; reclaimed ${killed} stale GhostLayer sandbox(es)`);
      }
      await new Promise((r) => setTimeout(r, 5000));
      try {
        return await createSandbox(metadata);
      } catch (e) {
        if (i >= 48 || !/concurren|too many|limit/i.test(String((e as Error).message ?? e))) throw e;
      }
    }
  }
}

async function createSandbox(metadata: Record<string, string>) {
  const sbx = await solariSandboxes().create({
    template: "base",
    cpu: 4,
    memMb: 8192,
    idleTimeoutMs: 30 * 60_000,
    lifecycle: { onTimeout: "kill" },
    metadata: { app: "ghostlayer", createdAt: String(Date.now()), ...metadata },
  });
  await sbx.connect();
  return sbx;
}

export async function sh(
  sbx: Sbx,
  script: string,
  opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; label?: string } = {},
): Promise<ShResult> {
  const started = Date.now();
  const res = await sbx.commands.run("sh", {
    args: ["-c", script],
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs ?? 300_000,
    env: { PATH: PATH_ENV, CI: "1", NEXT_TELEMETRY_DISABLED: "1", HOME: "/root", ...(opts.env ?? {}) },
  });
  const combined = `${res.stdout ?? ""}${res.stderr ? `\n${res.stderr}` : ""}`;
  return {
    command: opts.label ?? script,
    exitCode: res.exitCode,
    timedOut: Boolean(res.timedOut),
    durationMs: Date.now() - started,
    output: sanitize(combined.slice(-4000)),
  };
}

/** Make sure Node ≥ 22 is available (repos may need modern toolchains). */
export async function ensureNode(sbx: Sbx) {
  const probe = await sh(sbx, "node -v 2>/dev/null || echo none");
  const m = probe.output.match(/v(\d+)\./);
  if (m && Number(m[1]) >= 22) return probe.output.trim();
  const install = await sh(
    sbx,
    `set -e
ARCH=$(uname -m); case "$ARCH" in x86_64) A=x64;; aarch64|arm64) A=arm64;; *) A=x64;; esac
F=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep "linux-$A.tar.gz" | awk '{print $2}' | head -1)
mkdir -p ${NODE_DIR}
curl -fsSL "https://nodejs.org/dist/latest-v22.x/$F" | tar -xz -C ${NODE_DIR} --strip-components=1
${NODE_DIR}/bin/node -v`,
    { timeoutMs: 240_000 },
  );
  if (install.exitCode !== 0) throw new Error(`Could not install Node in sandbox: ${install.output.slice(-300)}`);
  return install.output.trim().split("\n").pop() ?? "";
}

export interface RepoInfo {
  packageManager: "npm" | "pnpm" | "yarn";
  scripts: Record<string, string>;
  hasTestScript: boolean;
  hasBuildScript: boolean;
  testFramework: string | null;
}

export async function inspectRepo(sbx: Sbx): Promise<RepoInfo> {
  const pkgText = await sbx.files.readText(`${REPO_DIR}/package.json`).catch(() => "{}");
  const pkg = JSON.parse(pkgText) as { scripts?: Record<string, string>; devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
  const ls = await sh(sbx, "ls -a", { cwd: REPO_DIR });
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const testFramework = deps.vitest ? "vitest" : deps.jest ? "jest" : deps["@playwright/test"] ? "playwright" : null;
  const scripts = pkg.scripts ?? {};
  return {
    packageManager: ls.output.includes("pnpm-lock.yaml") ? "pnpm" : ls.output.includes("yarn.lock") ? "yarn" : "npm",
    scripts,
    hasTestScript: Boolean(scripts.test) && !/no test specified/.test(scripts.test),
    hasBuildScript: Boolean(scripts.build),
    testFramework,
  };
}

export function installCommand(pm: RepoInfo["packageManager"]) {
  if (pm === "pnpm") return "corepack enable >/dev/null 2>&1; corepack pnpm install --frozen-lockfile";
  if (pm === "yarn") return "corepack enable >/dev/null 2>&1; corepack yarn install --frozen-lockfile";
  // Lockfiles written by a newer npm can be rejected by `npm ci`; fall back to a regular install in that case.
  return "npm ci --no-audit --no-fund || (echo '[ghostlayer] npm ci failed; falling back to npm install' && npm install --no-audit --no-fund)";
}

export function runScript(pm: RepoInfo["packageManager"], script: string) {
  return pm === "npm" ? `npm run ${script} --silent` : `corepack ${pm} run ${script}`;
}

/** Clone a GitHub repo with a short-lived read-only token (never written to .git/config). */
export async function cloneRepo(sbx: Sbx, fullName: string, token: string | null, ref?: string) {
  await sh(sbx, `rm -rf ${REPO_DIR} && mkdir -p /work`);
  await sbx.git.clone(`https://github.com/${fullName}.git`, {
    path: REPO_DIR,
    depth: 20,
    ...(token ? { username: "x-access-token", password: token } : {}),
  });
  if (ref) {
    const co = await sh(sbx, `git checkout -q ${ref} 2>&1 || (git fetch -q --depth 20 origin ${ref} && git checkout -q ${ref})`, { cwd: REPO_DIR });
    if (co.exitCode !== 0) throw new Error(`Could not check out ${ref}: ${co.output.slice(-200)}`);
  }
  const head = await sh(sbx, "git rev-parse HEAD", { cwd: REPO_DIR });
  await sh(sbx, `git config user.email "agents@ghostlayer.dev" && git config user.name "GhostLayer"`, { cwd: REPO_DIR });
  return head.output.trim();
}

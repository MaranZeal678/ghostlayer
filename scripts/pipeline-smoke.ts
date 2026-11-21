/**
 * Live smoke test of Explorer + Investigator against the demo shop hosted in a Solari sandbox
 * (reached through its token-protected preview URL). Uses real Solari browsers and OpenAI.
 * Usage: pnpm exec tsx --tsconfig tsconfig.json scripts/pipeline-smoke.ts [repoFullName]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const repo = process.argv[2] ?? "MaranZeal678/mad-hatter-tea-emporium";
  const { db } = await import("@/lib/db");
  const { openSandbox, ensureNode, cloneRepo, sh, REPO_DIR, installCommand } = await import("@/agents/sandbox");
  const { openSolariBrowser } = await import("@/agents/harness");
  const { explore } = await import("@/agents/explorer");
  const { reproduce } = await import("@/agents/investigator");
  const { saveEvidence } = await import("@/agents/scan");

  const t0 = Date.now();
  const lap = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
  const sbx = await openSandbox({ smoke: "host-shop" });
  lap(`sandbox ${sbx.id.slice(0, 12)}…`);
  try {
    lap(`node ${await ensureNode(sbx)}`);
    lap(`cloned ${(await cloneRepo(sbx, repo, null)).slice(0, 7)}`);
    const install = await sh(sbx, installCommand("npm"), { cwd: REPO_DIR, timeoutMs: 600_000 });
    lap(`npm ci exit ${install.exitCode}`);
    const build = await sh(sbx, "npm run build --silent", { cwd: REPO_DIR, timeoutMs: 600_000 });
    lap(`build exit ${build.exitCode}${build.exitCode ? `\n${build.output.slice(-800)}` : ""}`);
    if (build.exitCode) return;
    await sbx.commands.start("sh", { args: ["-c", "PORT=3000 HOSTNAME=0.0.0.0 npm start > /work/app.log 2>&1"], cwd: REPO_DIR, env: { PATH: "/opt/node/bin:/usr/local/bin:/usr/bin:/bin" } });
    const ready = await sh(sbx, "for i in $(seq 1 60); do curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ | grep -q 200 && echo up && exit 0; sleep 1; done; tail -20 /work/app.log; exit 1", { timeoutMs: 90_000 });
    lap(`app ${ready.output.trim().split("\n").pop()}`);
    const p = await sbx.previewUrl(3000);
    const u = new URL(p.url);
    const token = p.token ?? u.searchParams.get("slr_token") ?? "";
    const headers = { "x-solari-preview-token": token };
    lap(`preview ${u.host}`);

    // Throwaway DB rows so events/evidence persist like a real scan.
    const user = await db.user.upsert({ where: { clerkUserId: "smoke-test" }, update: {}, create: { clerkUserId: "smoke-test", displayName: "Smoke" } });
    const project = await db.project.create({ data: { userId: user.id, name: "Smoke", websiteUrl: u.origin, authorizedAt: new Date() } });
    const scan = await db.scan.create({ data: { projectId: project.id, status: "EXPLORING", startedAt: new Date() } });
    const run = await db.agentRun.create({ data: { scanId: scan.id, agentType: "EXPLORER", taskDescription: "smoke", status: "RUNNING" } });
    const saveShot = (label: string, jpeg: Buffer) => saveEvidence({ scanId: scan.id, type: "SCREENSHOT", label, mimeType: "image/jpeg", content: jpeg });

    const session = await openSolariBrowser({ smoke: "explorer" });
    const { harness } = await session.newHarness({ origin: u.origin, originHeaders: headers, reuseDefault: true });
    const result = await explore(harness, {
      scanId: scan.id,
      runId: run.id,
      startPath: "/",
      maxActions: 40,
      deadline: Date.now() + 6 * 60_000,
      isCancelled: async () => false,
      saveScreenshot: saveShot,
    });
    await session.close();
    lap(`explore: pages=${result.pages} interactions=${result.interactions} actions=${result.actions}`);
    for (const a of result.anomalies) lap(`  SIGNAL ${a.kind}: ${a.summary}\n    trail: ${JSON.stringify(a.trail.map((s) => (s.kind === "goto" ? `goto ${s.path}` : `${s.kind} ${"label" in s ? s.label : ""}`)))}`);

    const inv = await openSolariBrowser({ smoke: "investigator" });
    for (const a of result.anomalies.filter((x) => x.kind === "duplicate_mutation" || x.kind === "broken_navigation")) {
      // replayOnce takes originHeaders only via harness; reproduce() uses origin without headers, so patch the session.
      const orig = inv.newHarness.bind(inv);
      inv.newHarness = (opts) => orig({ ...opts, originHeaders: headers });
      const repro = await reproduce(inv, u.origin, a, { saveScreenshot: saveShot, onRun: async (r) => lap(`    ${r.variant}#${r.attempt} ${r.failed ? "FAIL" : "ok"} — ${r.detail}`) });
      lap(`  REPRO ${a.kind}: ${repro.triggerFailures}/${repro.triggerRuns} trigger, ${repro.controlFailures}/${repro.controlRuns} control failures → ${repro.confidence}`);
    }
    await inv.close();
    console.log("SMOKE PROJECT", project.id, "SCAN", scan.id);
  } finally {
    await sbx.kill();
    lap("sandbox killed");
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error("SMOKE FAILED", e);
  process.exit(1);
});

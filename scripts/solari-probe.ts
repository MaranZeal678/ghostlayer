/** Probe Solari: cloud browser over CDP, and sandbox capabilities (Node, git, preview URLs). */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { openSolariBrowser } = await import("@/agents/harness");
  const { openSandbox, sh } = await import("@/agents/sandbox");
  const mode = process.argv[2] ?? "all";
  if (mode === "all" || mode === "browser") {
    const t = Date.now();
    const s = await openSolariBrowser({ probe: "1" });
    console.log("browser session", s.sessionId, `${Date.now() - t}ms`);
    const { harness } = await s.newHarness({ origin: "https://example.com" });
    const nav = await harness.observe({ kind: "goto", path: "/" });
    console.log("example.com status", nav.navigationStatus, "title", await harness.page.title());
    const els = await harness.extract();
    console.log("elements", els.length, els[0]?.selector);
    const second = await s.newHarness({ origin: "https://example.com" });
    console.log("second context ok", !!second.harness);
    await s.close();
    console.log("browser closed");
  }
  if (mode === "all" || mode === "sandbox") {
    const t = Date.now();
    const sbx = await openSandbox({ probe: "1" });
    console.log("sandbox", sbx.id, `${Date.now() - t}ms`);
    try {
      for (const c of ["uname -m", "cat /etc/os-release | head -2", "node -v || echo no-node", "npm -v || echo no-npm", "git --version", "curl --version | head -1", "nproc; free -m | head -2", "python3 --version"]) {
        const r = await sh(sbx, c);
        console.log(`$ ${c}\n${r.output.trim()} (exit ${r.exitCode})`);
      }
      await sbx.commands.start("sh", { args: ["-c", "mkdir -p /tmp/www && echo hello-ghostlayer > /tmp/www/index.html && cd /tmp/www && python3 -m http.server 3000"] });
      await new Promise((r) => setTimeout(r, 2500));
      const local = await sh(sbx, "curl -s http://127.0.0.1:3000/");
      console.log("local server:", local.output.trim());
      try {
        const p = await sbx.previewUrl(3000);
        const u = new URL(p.url);
        console.log("preview host:", u.host, "token?", !!p.token, "query token?", u.searchParams.has("slr_token"));
        const tok = p.token ?? u.searchParams.get("slr_token") ?? "";
        const r1 = await fetch(`${u.origin}/`, { headers: tok ? { "x-solari-preview-token": tok } : {} });
        console.log("preview fetch with header:", r1.status, (await r1.text()).slice(0, 40));
        const r2 = await fetch(p.url);
        console.log("preview fetch with url:", r2.status);
        const r3 = await fetch(`${u.origin}/`);
        console.log("preview fetch no token:", r3.status);
      } catch (e) {
        console.log("previewUrl ERROR:", String(e).slice(0, 300));
      }
    } finally {
      await sbx.kill();
      console.log("sandbox killed");
    }
  }
}
main().catch((e) => {
  console.error("PROBE FAILED", e);
  process.exit(1);
});

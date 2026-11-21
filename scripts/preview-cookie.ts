import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { openSandbox, sh } = await import("@/agents/sandbox");
  const { solariSandboxes } = await import("@/lib/solari");
  const sbx = await openSandbox({ probe: "cookie" });
  try {
    await sbx.commands.start("sh", { args: ["-c", "mkdir -p /tmp/w && echo hi > /tmp/w/index.html && echo two > /tmp/w/b.html && cd /tmp/w && python3 -m http.server 3000"] });
    await new Promise((r) => setTimeout(r, 2000));
    const p = await sbx.previewUrl(3000);
    const u = new URL(p.url);
    const r = await fetch(p.url, { redirect: "manual" });
    console.log("with query:", r.status, "set-cookie:", (r.headers.get("set-cookie") ?? "none").replace(/=[^;]+/g, "=<v>").slice(0, 200), "location:", r.headers.get("location")?.replace(/slr_token=[^&]+/, "slr_token=<t>"));
    // reconnect test
    const id = sbx.id;
    const client = solariSandboxes() as unknown as Record<string, unknown>;
    console.log("client methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(client)).join(","));
    void id; void u; void sh;
  } finally {
    await sbx.kill();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

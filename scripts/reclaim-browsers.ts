import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { solariBrowsers } = await import("@/lib/solari");
  const l = await solariBrowsers().sessions.list({ limit: 50 });
  for (const s of l.sessions) console.log(s.id.slice(0, 10), s.status, s.createdAt, JSON.stringify(s.userMetadata));
  const { reclaimStaleBrowsers } = await import("@/agents/harness");
  console.log("released", await reclaimStaleBrowsers(0));
}
main().catch((e) => { console.error(e); process.exit(1); });

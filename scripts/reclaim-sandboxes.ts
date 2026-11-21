import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { solariSandboxes } = await import("@/lib/solari");
  const client = solariSandboxes();
  for await (const s of client.listAll()) console.log(s.sandboxId.slice(0, 12), s.state, JSON.stringify(s.metadata));
  const { reclaimStaleSandboxes } = await import("@/agents/sandbox");
  console.log("reclaimed", await reclaimStaleSandboxes());
}
main().catch((e) => { console.error(e); process.exit(1); });

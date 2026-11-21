import { config } from "dotenv";
config({ path: ".env.local" });
import { z } from "zod";
async function main() {
  const { structured } = await import("@/lib/ai");
  for (const m of ["gpt-5.5", "gpt-5.4-mini"]) {
    process.env.OPENAI_MODEL = m;
    const t = Date.now();
    try {
      const r = await structured({ name: "t", schema: z.object({ purpose: z.string(), actions: z.array(z.object({ ref: z.string(), intent: z.enum(["navigate", "commit"]) })) }), system: "Classify elements.", user: 'Page /checkout. Elements: [{"ref":"e1","tag":"a","text":"Shop"},{"ref":"e2","tag":"button","type":"submit","text":"Place order"}]' });
      console.log(m, Date.now() - t, "ms", JSON.stringify(r));
    } catch (e) { console.log(m, "ERR", String(e).slice(0, 300)); }
  }
}
main();

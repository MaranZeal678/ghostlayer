import { Solari } from "@solarisdk/browser";
import { SandboxClient } from "@solarisdk/sandbox";

const BASE_URL = "https://api.getsolari.com";

function key() {
  const k = process.env.SOLARI_API_KEY;
  if (!k) throw new Error("SOLARI_API_KEY is not configured");
  return k;
}

let browsers: Solari | null = null;
let sandboxes: SandboxClient | null = null;

export function solariBrowsers() {
  browsers ??= new Solari({ apiKey: key(), baseUrl: BASE_URL });
  return browsers;
}

export function solariSandboxes() {
  sandboxes ??= new SandboxClient({ apiKey: key(), baseUrl: BASE_URL });
  return sandboxes;
}
